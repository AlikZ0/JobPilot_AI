import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface ComboboxOption {
  /** Значение, которое уйдёт в onCommit при выборе. */
  value: string;
  /** Что видит пользователь в списке; по умолчанию совпадает со значением. */
  label?: string;
  /** Правая приписка: категория, уровень, код языка. */
  hint?: string;
  /** Пояснение под подписью: «нашлось по “реакт”». */
  note?: string;
  icon?: IconName;
}

interface Props {
  value: string;
  onChange(value: string): void;
  /** Выбор подсказки или Enter по своему варианту. */
  onCommit(value: string): void;
  /** Подсказки под текущий ввод; порядок задаёт вызывающая сторона. */
  options: ComboboxOption[];
  placeholder?: string;
  ariaLabel: string;
  /** Разрешить значение, которого нет в списке. */
  allowCustom?: boolean;
  /** Строка над списком: чем этот список вообще является. */
  caption?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Поле с подсказками. Появилось не ради красоты: названия технологий легко
 * написать с ошибкой («Postgress», «Кубернетис»), а неверно записанный навык не
 * совпадёт ни с одной вакансией. Поэтому список открыт сразу при фокусе, ищет
 * с поправкой на опечатки и по сокращениям, а свой вариант остаётся возможен —
 * словарь не обязан знать всё.
 */
export function Combobox({
  value,
  onChange,
  onCommit,
  options,
  placeholder,
  ariaLabel,
  allowCustom = true,
  caption,
  className,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const custom = useMemo(() => {
    const trimmed = value.trim();
    if (!allowCustom || !trimmed) return null;
    const known = options.some((option) => option.value.toLowerCase() === trimmed.toLowerCase());
    return known ? null : trimmed;
  }, [allowCustom, options, value]);

  // Свой вариант — последняя строка списка, а не отдельная кнопка: клавиатурой
  // до него доходят тем же Arrow Down.
  const rows: ComboboxOption[] = useMemo(
    () =>
      custom
        ? [...options, { value: custom, label: custom, note: 'Добавить как есть', icon: 'plus' }]
        : options,
    [custom, options],
  );

  useEffect(() => {
    setActive((current) => (current < rows.length ? current : 0));
  }, [rows.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Активная строка не должна уезжать за край при навигации с клавиатуры.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (option: ComboboxOption) => {
    onCommit(option.value);
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + rows.length) % rows.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const picked = open ? rows[active] : null;
      if (picked) commit(picked);
      else if (value.trim() && allowCustom) commit({ value: value.trim() });
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className ?? ''}`}>
      <input
        className="jp-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && rows.length > 0 ? (
        <div className="jp-popover jp-animate-in absolute left-0 right-0 top-[calc(100%+4px)] z-30">
          {caption ? (
            <p className="border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.04em] text-muted">
              {caption}
            </p>
          ) : null}
          <ul ref={listRef} id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {rows.map((option, index) => (
              <li
                key={`${option.value}-${index}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={`jp-option ${index === active ? 'jp-option-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  // mousedown, а не click: иначе input успевает потерять фокус.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(option);
                  }}
                >
                  {option.icon ? <Icon name={option.icon} size={13} /> : null}
                  <span className="min-w-0 flex-1 truncate">
                    {option.label ?? option.value}
                    {option.note ? <span className="jp-option-muted"> · {option.note}</span> : null}
                  </span>
                  {option.hint ? (
                    <span className="jp-option-muted flex-shrink-0">{option.hint}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
