import { useEffect, useMemo, useState } from 'react';
import type { FieldMapping } from '@/types/application';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import {
  getApplication,
  markSubmitted,
  revertAutoSubmission,
  updateApplication,
} from '@/database/repositories/applicationRepository';
import { markApplicationReady } from '@/core/application/applicationService';
import { createId } from '@/utils/id';
import { formatDateTime } from '@/utils/time';
import { useStore, withBusy } from '../state/store';
import { Empty } from '../components/Empty';
import { MatchScore } from '../components/MatchScore';
import {
  APPLICATION_STATE_LABEL,
  FILL_DECISION_LABEL,
  MAPPING_SOURCE_LABEL,
  fieldTypeLabel,
} from '../labels';
import { Icon } from '../components/Icon';

/**
 * Экран проверки. JobPilot заполняет поля и готовит тексты, но саму отправку
 * всегда делает пользователь на сайте вакансии — этот экран лишь фиксирует, что
 * он это подтвердил.
 */
export function ApplicationReview() {
  const applicationId = useStore((state) => state.selectedApplicationId);
  const applications = useStore((state) => state.applications);
  const jobs = useStore((state) => state.jobs);
  const submissions = useStore((state) => state.submissions);
  const analyses = useStore((state) => state.analyses);
  const profile = useStore((state) => state.profile);
  const activeTabId = useStore((state) => state.activeTabId);
  const navigate = useStore((state) => state.navigate);
  const refreshData = useStore((state) => state.refreshData);
  const pushToast = useStore((state) => state.pushToast);

  const application = applications.find((entry) => entry.id === applicationId);
  const job = jobs.find((entry) => entry.id === application?.jobId);
  // Автоматика могла заметить отправку раньше, чем пользователь дошёл до этого экрана.
  const detected = submissions.find(
    (row) => row.jobId === application?.jobId && row.source === 'auto',
  );
  const analysis = job ? analyses[job.id] : undefined;
  const autoMarked = application?.state === 'submitted' && application.submissionSource === 'auto';

  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [coverLetter, setCoverLetter] = useState('');
  const [questionDraft, setQuestionDraft] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);

  const applicationKey = application ? `${application.id}:${application.updatedAt}` : '';
  useEffect(() => {
    if (!application) return;
    setMappings(application.fieldMappings);
    setCoverLetter(application.coverLetter);
    setConfirmChecked(false);
    // Пересинхронизируется при любом изменении сохранённой заявки:
    // `applicationKey` включает и её id, и время последнего обновления.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationKey]);

  const needsAttention = useMemo(
    () => mappings.filter((mapping) => mapping.decision === 'needs_confirmation'),
    [mappings],
  );
  const autoFillable = useMemo(
    () => mappings.filter((mapping) => mapping.decision === 'auto'),
    [mappings],
  );

  if (!application || !job || !profile) {
    return (
      <Empty
        title="Заявка не найдена"
        action={{ label: 'К списку заявок', onClick: () => navigate('applications') }}
      />
    );
  }

  const analyzeForm = () =>
    void withBusy('Читаем форму', async () => {
      const plan = await sendToBackground(MESSAGE_TYPES.ANALYZE_APPLICATION_FORM, {
        applicationId: application.id,
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      setMappings(plan.mappings);
      await refreshData();
      pushToast({
        level: 'info',
        message: `Размечено полей: ${plan.mappings.length}, не распознано: ${plan.unknownFields.length}.`,
      });
    });

  const fillForm = () =>
    void withBusy('Заполняем форму', async () => {
      const approved = mappings.filter((mapping) => mapping.decision === 'auto');
      if (approved.length === 0) {
        pushToast({ level: 'warning', message: 'Сначала одобрите хотя бы одно поле.' });
        return;
      }
      const result = await sendToBackground(MESSAGE_TYPES.FILL_APPLICATION_FORM, {
        applicationId: application.id,
        mappings: approved,
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      await refreshData();
      pushToast({
        level: result.filled > 0 ? 'success' : 'warning',
        message: `Заполнено полей: ${result.filled}, пропущено: ${result.skipped}.`,
      });
    });

  const generateLetter = () =>
    void withBusy('Пишем сопроводительное письмо', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.GENERATE_COVER_LETTER, {
        jobId: job.id,
        applicationId: application.id,
      });
      setCoverLetter(result.coverLetter);
      await refreshData();
      if (result.status === 'needs_user_confirmation') {
        pushToast({
          level: 'warning',
          message: `Нужна ваша проверка: ${result.unverifiedClaims.join('; ') || 'часть утверждений не удалось подтвердить профилем.'}`,
        });
      }
    });

  const answerQuestion = () =>
    void withBusy('Составляем ответ', async () => {
      const question = questionDraft.trim();
      if (!question) return;
      const result = await sendToBackground(MESSAGE_TYPES.GENERATE_ANSWER, {
        jobId: job.id,
        applicationId: application.id,
        questionId: createId('q'),
        question,
      });
      setQuestionDraft('');
      await refreshData();
      if (result.status === 'needs_user_confirmation') {
        pushToast({
          level: 'warning',
          message: 'Ответ требует подтверждения: в нём есть факты, которых нет в профиле.',
        });
      }
    });

  const setDecision = (fieldId: string, decision: FieldMapping['decision']) => {
    setMappings((current) =>
      current.map((mapping) => (mapping.fieldId === fieldId ? { ...mapping, decision } : mapping)),
    );
  };

  const setValue = (fieldId: string, value: string) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.fieldId === fieldId ? { ...mapping, value, source: 'user' } : mapping,
      ),
    );
  };

  const saveDraft = () =>
    void withBusy('Сохраняем черновик', async () => {
      await updateApplication(application.id, {
        fieldMappings: mappings,
        coverLetter,
        coverLetterStatus: coverLetter ? 'user_edited' : 'none',
      });
      await refreshData();
    });

  const markReady = () =>
    void withBusy('Отмечаем готовой', async () => {
      await updateApplication(application.id, { fieldMappings: mappings, coverLetter });
      await markApplicationReady(application.id);
      await refreshData();
      pushToast({ level: 'success', message: 'Заявка отмечена как готовая к проверке.' });
    });

  const undoAutoMark = () =>
    void withBusy('Откатываем отметку', async () => {
      await revertAutoSubmission(application.id);
      await refreshData();
      pushToast({
        level: 'info',
        message: 'Отметка снята. Запись в истории откликов осталась — удалите её там, если нужно.',
      });
    });

  const confirmSubmitted = () =>
    void withBusy('Фиксируем отправку', async () => {
      const fresh = await getApplication(application.id);
      if (fresh && fresh.state !== 'ready') await markApplicationReady(application.id);
      await markSubmitted(application.id, true);
      await refreshData();
      pushToast({ level: 'success', message: 'Отмечено как отправленное.' });
    });

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="jp-button-ghost jp-button-sm self-start"
        onClick={() => navigate('applications')}
      >
        <Icon name="chevronLeft" size={13} />
        Заявки
      </button>

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{job.title}</h2>
          <p className="text-[12px] text-muted">
            {job.company} · статус: {APPLICATION_STATE_LABEL[application.state]}
          </p>
        </div>
        {analysis ? <MatchScore score={analysis.score} band={analysis.band} /> : null}
      </header>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">1 · Поля формы</h3>
        <p className="text-[11px] text-muted">
          Откройте страницу отклика в активной вкладке и прочитайте форму. Поля с уверенностью ниже
          порога всегда ждут вашего решения.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={analyzeForm}>
            Прочитать форму на странице
          </button>
          <button
            type="button"
            className="jp-button-primary"
            onClick={fillForm}
            disabled={autoFillable.length === 0}
          >
            Заполнить одобренные поля ({autoFillable.length})
          </button>
        </div>

        {mappings.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {mappings.map((mapping) => (
              <li key={mapping.fieldId} className="rounded-md border border-border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{mapping.label}</p>
                    <p className="text-[10px] text-muted">
                      {fieldTypeLabel(mapping.fieldType)} · уверенность{' '}
                      {Math.round(mapping.confidence * 100)}% ·{' '}
                      {MAPPING_SOURCE_LABEL[mapping.source]}
                    </p>
                  </div>
                  <select
                    className="jp-input w-auto py-0.5 text-[11px]"
                    value={mapping.decision}
                    onChange={(event) =>
                      setDecision(mapping.fieldId, event.target.value as FieldMapping['decision'])
                    }
                    aria-label={`Что делать с полем «${mapping.label}»`}
                  >
                    <option value="auto">{FILL_DECISION_LABEL.auto}</option>
                    <option value="needs_confirmation">
                      {FILL_DECISION_LABEL.needs_confirmation}
                    </option>
                    <option value="skipped">{FILL_DECISION_LABEL.skipped}</option>
                  </select>
                </div>
                <input
                  className="jp-input mt-1.5"
                  value={mapping.value}
                  placeholder="В профиле нет значения"
                  onChange={(event) => setValue(mapping.fieldId, event.target.value)}
                  aria-label={`Значение для поля «${mapping.label}»`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted">Форма ещё не прочитана.</p>
        )}
        {needsAttention.length > 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-potential">
            <Icon name="alert" size={12} />
            Полей, ждущих вашего подтверждения: {needsAttention.length}.
          </p>
        ) : null}
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">2 · Сопроводительное письмо</h3>
        <button type="button" className="jp-button self-start" onClick={generateLetter}>
          Сгенерировать письмо
        </button>
        <textarea
          className="jp-input min-h-[140px] font-mono text-[12px]"
          value={coverLetter}
          onChange={(event) => setCoverLetter(event.target.value)}
          placeholder="Здесь появится сопроводительное письмо. Правьте как угодно — сохранится ваш вариант."
        />
        {application.unverifiedClaims.length > 0 ? (
          <div className="rounded-md border border-potential/40 bg-potential/10 p-2 text-[11px]">
            <p className="font-semibold text-potential">Требуется ваше подтверждение</p>
            <ul className="ml-4 list-disc">
              {application.unverifiedClaims.map((claim, index) => (
                <li key={index}>{claim}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">3 · Вопросы анкеты</h3>
        <div className="flex gap-1.5">
          <input
            className="jp-input"
            placeholder="Вставьте вопрос из формы…"
            value={questionDraft}
            onChange={(event) => setQuestionDraft(event.target.value)}
          />
          <button type="button" className="jp-button" onClick={answerQuestion}>
            Составить ответ
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {application.questions.map((question) => (
            <li key={question.id} className="rounded-md border border-border p-2">
              <p className="text-[12px] font-medium">{question.question}</p>
              <textarea
                className="jp-input mt-1 min-h-[70px]"
                defaultValue={question.answer}
                onBlur={(event) =>
                  void updateApplication(application.id, {
                    questions: application.questions.map((entry) =>
                      entry.id === question.id
                        ? { ...entry, answer: event.target.value, status: 'user_edited' }
                        : entry,
                    ),
                  }).then(refreshData)
                }
              />
              {question.status === 'needs_user_confirmation' ? (
                <p className="mt-1 flex items-start gap-1.5 text-[11px] text-potential">
                  <Icon name="alert" size={12} />
                  Требуется подтверждение: {question.missingInformation.join('; ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">4 · Проверка и отправка</h3>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-muted">Должность</dt>
          <dd>{job.title}</dd>
          <dt className="text-muted">Компания</dt>
          <dd>{job.company}</dd>
          <dt className="text-muted">Имя</dt>
          <dd>
            {profile.personal.firstName} {profile.personal.lastName}
          </dd>
          <dt className="text-muted">Email</dt>
          <dd>{profile.personal.email || '—'}</dd>
          <dt className="text-muted">Ожидаемая зарплата</dt>
          <dd>
            {profile.salary.expected
              ? `${profile.salary.currency} ${profile.salary.expected}/${profile.salary.period}`
              : '—'}
          </dd>
          <dt className="text-muted">Вложение</dt>
          <dd>{profile.attachments.find((a) => a.isDefault)?.name ?? 'не выбрано'}</dd>
        </dl>

        {autoMarked ? (
          <div className="rounded-lg border border-excellent/40 bg-excellent/10 p-2 text-[11px]">
            <p className="flex items-center gap-1.5 font-semibold text-excellent">
              <Icon name="bolt" size={12} />
              Отмечено автоматически
              {application.submittedAt ? ` · ${formatDateTime(application.submittedAt)}` : ''}
            </p>
            <p className="mt-0.5 text-muted">
              JobPilot заметил отправку формы на сайте и отметил заявку отправленной. Если это была
              не она — откатите отметку.
            </p>
            <button type="button" className="jp-button jp-button-sm mt-1.5" onClick={undoAutoMark}>
              <Icon name="refresh" size={12} />
              Это была не эта заявка
            </button>
          </div>
        ) : null}

        {detected && application.state !== 'submitted' ? (
          <div className="rounded-lg border border-potential/40 bg-potential/10 p-2 text-[11px]">
            <p className="flex items-center gap-1.5 font-semibold text-potential">
              <Icon name="bolt" size={12} />
              JobPilot заметил отправку {formatDateTime(detected.at)}
            </p>
            <p className="mt-0.5 text-muted">
              Отклик записан в историю, но заявку он не отметил — автоматическая отметка выключена в
              настройках. Подтвердите отправку галочкой ниже.
            </p>
          </div>
        ) : null}

        <div className="rounded-md border border-border bg-surface-3 p-2 text-[11px]">
          <p className="font-semibold">JobPilot никогда не отправляет заявку за вас.</p>
          <p className="text-muted">
            Кнопку отправки на сайте вакансии нажимаете вы сами. JobPilot только фиксирует это — по
            вашей галочке или заметив отправку формы на странице.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={saveDraft}>
            Сохранить черновик
          </button>
          <button type="button" className="jp-button" onClick={markReady}>
            Отметить готовой
          </button>
        </div>

        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(event) => setConfirmChecked(event.target.checked)}
            disabled={application.state === 'submitted'}
          />
          <span>Я сам(а) отправил(а) эту заявку на сайте вакансии.</span>
        </label>
        <button
          type="button"
          className="jp-button-primary self-start"
          onClick={confirmSubmitted}
          disabled={!confirmChecked || application.state === 'submitted'}
        >
          {application.state === 'submitted' ? 'Отправка зафиксирована' : 'Зафиксировать отправку'}
        </button>
      </section>
    </div>
  );
}
