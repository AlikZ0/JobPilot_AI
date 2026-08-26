import { useState } from 'react';
import { MESSAGE_TYPES } from '@/types/messages';
import type { UserProfile } from '@/types/profile';
import { sendToBackground } from '@/utils/messaging';
import { canonicalizeTech, categoryOf } from '@/core/extraction/techDictionary';
import { makeSkill } from '@/types/profile';
import { useStore, withBusy } from '../state/store';
import { ProfileForm } from '../components/ProfileForm';
import { AttachmentManager } from '../components/AttachmentManager';
import { Icon } from '../components/Icon';

export function Profile() {
  const profile = useStore((state) => state.profile);
  const updateProfile = useStore((state) => state.updateProfile);
  const pushToast = useStore((state) => state.pushToast);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [resumeText, setResumeText] = useState('');

  if (!profile) return null;
  const current = draft ?? profile;
  const dirty = draft !== null;

  const patch = (change: Partial<UserProfile>) => setDraft({ ...current, ...change });

  const save = () =>
    void withBusy('Сохраняем профиль', async () => {
      if (!draft) return;
      await updateProfile(draft);
      setDraft(null);
      pushToast({
        level: 'success',
        message: 'Профиль сохранён. Кешированные анализы будут пересчитаны при следующем запуске.',
      });
    });

  const importResume = () =>
    void withBusy('Разбираем резюме', async () => {
      const analysis = await sendToBackground(MESSAGE_TYPES.ANALYZE_RESUME, { text: resumeText });
      const existing = new Set(current.skills.map((skill) => skill.name.toLowerCase()));
      const suggested = analysis.skills
        .map((skill) => canonicalizeTech(skill.name))
        .filter((name) => name && !existing.has(name.toLowerCase()))
        .slice(0, 40);
      if (suggested.length === 0) {
        pushToast({ level: 'info', message: 'Новых навыков в резюме не нашлось.' });
        return;
      }
      patch({
        skills: [
          ...current.skills,
          ...suggested.map((name) => makeSkill({ name, category: categoryOf(name) })),
        ],
      });
      pushToast({
        level: 'warning',
        message: `Из резюме предложено навыков: ${suggested.length}. Проверьте их и нажмите «Сохранить» — автоматически в профиль ничего не добавлено.`,
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <header className="sticky top-0 z-10 -mx-3 -mt-3 flex items-start justify-between gap-2 border-b border-border bg-surface px-3 pb-2.5 pt-3">
        <div className="min-w-0">
          <h2 className="jp-heading">Ваш профиль</h2>
          <p className="jp-hint mt-0.5">
            Версия {profile.version} · каждое сохранение сбрасывает кеш анализов.
          </p>
        </div>
        <button
          type="button"
          className={dirty ? 'jp-button-primary' : 'jp-button'}
          onClick={save}
          disabled={!dirty}
        >
          <Icon name={dirty ? 'download' : 'check'} size={13} />
          {dirty ? 'Сохранить изменения' : 'Сохранено'}
        </button>
      </header>

      <ProfileForm profile={current} onChange={patch} />

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">
          <Icon name="file" size={12} />
          Импорт из резюме
        </h3>
        <p className="text-[11px] leading-snug text-muted">
          Вставьте текст резюме. JobPilot предложит навыки, которые смог прочитать в документе, —
          сам он никогда не добавляет в профиль неподтверждённые факты.
        </p>
        <textarea
          className="jp-input min-h-[90px]"
          placeholder="Вставьте сюда текст резюме…"
          value={resumeText}
          onChange={(event) => setResumeText(event.target.value)}
        />
        <button
          type="button"
          className="jp-button self-start"
          onClick={importResume}
          disabled={resumeText.trim().length < 80}
          title={
            resumeText.trim().length < 80
              ? 'Вставьте хотя бы 80 символов текста резюме'
              : 'Найти в тексте навыки и предложить их'
          }
        >
          <Icon name="sparkles" size={13} />
          Разобрать резюме
        </button>
      </section>

      <AttachmentManager profile={current} onChange={patch} />
    </div>
  );
}
