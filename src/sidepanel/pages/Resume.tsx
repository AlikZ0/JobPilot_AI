import { useEffect, useMemo, useRef, useState } from 'react';
import { MESSAGE_TYPES } from '@/types/messages';
import type { TailoredResume } from '@/types/resume';
import type { ResumeGaps } from '@/core/resume/gapAnalysis';
import { sendToBackground } from '@/utils/messaging';
import { auditResume, type AtsAudit } from '@/core/resume/atsAudit';
import { analyzeResumeGaps } from '@/core/resume/gapAnalysis';
import { tailorWithoutAI } from '@/core/resume/tailorResume';
import { extractPdfText, readFileAsArrayBuffer } from '@/core/resume/pdfText';
import {
  renderMarkdown,
  renderPlainText,
  renderPrintableHtml,
  suggestedFileName,
} from '@/core/resume/render';
import {
  BASE_RESUME_ID,
  getBaseResume,
  getTailoredResume,
  saveBaseResume,
  saveTailoredResume,
} from '@/database/repositories/resumeRepository';
import { useStore, withBusy } from '../state/store';
import { Empty } from '../components/Empty';
import { Icon } from '../components/Icon';

const SEVERITY_STYLE = {
  ok: 'text-excellent',
  warning: 'text-potential',
  error: 'text-poor',
} as const;

const SEVERITY_ICON = { ok: 'check', warning: 'alert', error: 'x' } as const;

/**
 * Резюме под вакансию: импорт, ATS-аудит, анализ пробелов и подгонка.
 *
 * Исходный PDF мы не переписываем — вместо этого собираем новый чистый
 * документ. У PDF нет надёжного способа переставить текст внутри чужой вёрстки,
 * а ATS в любом случае лучше разбирает простой документ в одну колонку.
 */
export function Resume() {
  const jobs = useStore((state) => state.jobs);
  const profile = useStore((state) => state.profile);
  const pushToast = useStore((state) => state.pushToast);
  const reportError = useStore((state) => state.reportError);

  const [resumeText, setResumeText] = useState('');
  const [fileName, setFileName] = useState('');
  const [charsPerPage, setCharsPerPage] = useState(0);
  const [jobId, setJobId] = useState('');
  const [tailored, setTailored] = useState<TailoredResume | null>(null);
  const [gaps, setGaps] = useState<ResumeGaps | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getBaseResume().then((record) => {
      if (!record) return;
      setResumeText(record.text);
      setFileName(record.fileName);
      setCharsPerPage(record.charsPerPage);
    });
  }, []);

  useEffect(() => {
    if (!jobId) {
      setTailored(null);
      setGaps(null);
      return;
    }
    void getTailoredResume(jobId).then((record) => setTailored(record?.tailored ?? null));
  }, [jobId]);

  const job = jobs.find((entry) => entry.id === jobId);
  const audit: AtsAudit | null = useMemo(
    () => (resumeText ? auditResume({ text: resumeText, charsPerPage, fileName }) : null),
    [resumeText, charsPerPage, fileName],
  );

  const importPdf = (file: File) =>
    void withBusy('Читаем PDF', async () => {
      const buffer = await readFileAsArrayBuffer(file);
      const extracted = await extractPdfText(buffer);
      setResumeText(extracted.text);
      setFileName(file.name);
      setCharsPerPage(extracted.charsPerPage);
      await saveBaseResume({
        text: extracted.text,
        fileName: file.name,
        source: 'pdf',
        pages: extracted.pages,
        charsPerPage: extracted.charsPerPage,
      });
      if (extracted.looksScanned) {
        pushToast({
          level: 'warning',
          message: 'В PDF почти нет текста — похоже, это скан. ATS такой файл не прочитает.',
        });
      } else {
        pushToast({ level: 'success', message: `Прочитано страниц: ${extracted.pages}.` });
      }
    });

  const saveText = () =>
    void withBusy('Сохраняем резюме', async () => {
      await saveBaseResume({
        text: resumeText,
        fileName: fileName || '',
        source: 'text',
        pages: 0,
        charsPerPage: 0,
      });
      setCharsPerPage(0);
      pushToast({ level: 'success', message: 'Резюме сохранено.' });
    });

  /** Подгонка через AI — единственное, что требует фонового воркера. */
  const tailorWithAI = () =>
    void withBusy('Подгоняем резюме под вакансию', async () => {
      if (!jobId) return;
      const result = await sendToBackground(MESSAGE_TYPES.TAILOR_RESUME, {
        jobId,
        resumeText,
        useAI: true,
      });
      setTailored(result.resume);
      setGaps(result.gaps);
      setUsedAI(result.usedAI);
      setRejected(result.rejectedSkills);
      await saveTailoredResume(jobId, result.resume);
      if (result.rejectedSkills.length > 0) {
        pushToast({
          level: 'warning',
          message: `Из результата убрано то, чего нет в профиле: ${result.rejectedSkills.join(', ')}.`,
        });
      }
    });

  /**
   * Сборка без AI и сравнение с вакансией считаются прямо здесь: это чистые
   * функции, им не нужен ни воркер, ни сеть, ни ключ.
   */
  const tailorLocally = () =>
    void withBusy('Собираем резюме', async () => {
      if (!job || !profile) return;
      const outcome = tailorWithoutAI(job, profile, resumeText);
      setTailored(outcome.resume);
      setGaps(outcome.gaps);
      setUsedAI(false);
      setRejected([]);
      await saveTailoredResume(job.id, outcome.resume);
    });

  const analyzeGapsOnly = () => {
    if (!job || !profile) return;
    setGaps(analyzeResumeGaps(job, profile, resumeText));
  };

  const openForPrint = () => {
    if (!tailored || !profile) return;
    const html = renderPrintableHtml({ resume: tailored, profile, jobTitle: job?.title ?? '' });
    const tab = window.open('', '_blank');
    if (!tab) {
      reportError(new Error('Браузер заблокировал новое окно. Разрешите всплывающие окна.'));
      return;
    }
    tab.document.write(html);
    tab.document.close();
    tab.focus();
    // Печать вызываем после отрисовки, иначе диалог откроется на пустой странице.
    setTimeout(() => tab.print(), 350);
  };

  const download = (kind: 'txt' | 'md') => {
    if (!tailored || !profile) return;
    const content =
      kind === 'txt'
        ? renderPlainText({ resume: tailored, profile, jobTitle: job?.title ?? '' })
        : renderMarkdown({ resume: tailored, profile, jobTitle: job?.title ?? '' });
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedFileName(profile, job?.title ?? '').replace(/\.pdf$/, `.${kind}`);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col gap-3">
      <section className="jp-card flex flex-col gap-2">
        <h2 className="jp-section-title">1 · Ваше резюме</h2>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importPdf(file);
            event.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={() => fileInput.current?.click()}>
            Загрузить PDF
          </button>
          <button
            type="button"
            className="jp-button"
            onClick={saveText}
            disabled={resumeText.trim().length < 50}
          >
            Сохранить текст
          </button>
          {fileName ? <span className="jp-badge">{fileName}</span> : null}
        </div>
        <textarea
          className="jp-input min-h-[120px] font-mono text-[11px]"
          value={resumeText}
          onChange={(event) => setResumeText(event.target.value)}
          placeholder="Загрузите PDF или вставьте текст резюме сюда"
        />
        <p className="text-[10px] text-muted">
          Файл не уходит никуда: PDF разбирается прямо в браузере, текст хранится локально.
        </p>
      </section>

      {audit ? (
        <section className="jp-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="jp-section-title">2 · Совместимость с ATS</h2>
            <span
              className={`text-[16px] font-bold ${
                audit.score >= 80
                  ? 'text-excellent'
                  : audit.score >= 55
                    ? 'text-potential'
                    : 'text-poor'
              }`}
            >
              {audit.score}/100
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {audit.checks.map((check) => (
              <li key={check.id} className="text-[12px]">
                <span className={`flex items-center gap-1.5 ${SEVERITY_STYLE[check.severity]}`}>
                  <Icon name={SEVERITY_ICON[check.severity]} size={11} strokeWidth={2.4} />
                  <span className="font-medium">{check.title}</span>
                  <span className="text-muted">{check.detail}</span>
                </span>
                {check.fix ? <p className="ml-5 text-[11px] text-muted">{check.fix}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="jp-card flex flex-col gap-2">
        <h2 className="jp-section-title">3 · Под какую вакансию</h2>
        <select
          className="jp-input"
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          aria-label="Вакансия"
        >
          <option value="">Выберите вакансию</option>
          {jobs.slice(0, 100).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.score !== null ? `${entry.score}% · ` : ''}
              {entry.title} — {entry.company}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="jp-button"
            onClick={analyzeGapsOnly}
            disabled={!jobId || resumeText.length < 50}
          >
            Сравнить с вакансией
          </button>
          <button
            type="button"
            className="jp-button-primary"
            onClick={tailorWithAI}
            disabled={!jobId || resumeText.length < 50}
          >
            Подогнать через AI
          </button>
          <button
            type="button"
            className="jp-button"
            onClick={tailorLocally}
            disabled={!jobId || resumeText.length < 50}
            title="Собрать резюме из профиля без обращения к AI"
          >
            Без AI
          </button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-[11px] text-muted">
            Сначала проанализируйте хотя бы одну вакансию — тогда её можно будет выбрать здесь.
          </p>
        ) : null}
      </section>

      {gaps ? (
        <section className="jp-card flex flex-col gap-2">
          <h2 className="jp-section-title">Чего не хватает в резюме</h2>
          <p className="text-[11px] text-muted">
            Требования вакансии покрыты резюме на {Math.round(gaps.resumeCoverage * 100)}%, вашим
            профилем — на {Math.round(gaps.profileCoverage * 100)}%.
          </p>

          {gaps.missingFromResume.length > 0 ? (
            <div>
              <p className="text-[12px] font-medium text-potential">
                Это у вас есть, но в резюме не написано:
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {gaps.missingFromResume.map((gap) => (
                  <li key={gap.skill} className="jp-badge border-potential/40 text-potential">
                    {gap.skill}
                    {gap.requiredVersion ? ` ${gap.requiredVersion}` : ''}
                    {gap.mandatory ? ' · обязательно' : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">
                Эти навыки подтверждены профилем, поэтому их можно смело дописать — что и делает
                кнопка подгонки.
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-excellent">
              Всё, что вы умеете и что нужно вакансии, в резюме уже есть.
            </p>
          )}

          {gaps.notOwned.length > 0 ? (
            <div>
              <p className="text-[12px] font-medium text-poor">
                Требуется вакансией, но нет ни в профиле, ни в резюме:
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {gaps.notOwned.map((gap) => (
                  <li key={gap.skill} className="jp-badge border-poor/40 text-poor">
                    {gap.skill}
                    {gap.mandatory ? ' · обязательно' : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">
                Это JobPilot в резюме не добавит: приписывать себе несуществующий опыт — прямой путь
                к провалу на техническом интервью. Если навык у вас всё-таки есть, добавьте его в
                профиль.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {tailored ? (
        <section className="jp-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="jp-section-title">4 · Резюме под вакансию</h2>
            <span className="jp-badge">{usedAI ? 'собрано с AI' : 'собрано без AI'}</span>
          </div>

          {tailored.addedFromProfile.length > 0 ? (
            <p className="text-[11px] text-excellent">
              Дописано из профиля: {tailored.addedFromProfile.join(', ')}
            </p>
          ) : null}
          {rejected.length > 0 ? (
            <p className="text-[11px] text-poor">
              Убрано как неподтверждённое: {rejected.join(', ')}
            </p>
          ) : null}
          {tailored.atsNotes.length > 0 ? (
            <ul className="ml-4 list-disc text-[11px] text-muted">
              {tailored.atsNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          ) : null}

          <textarea
            className="jp-input min-h-[200px] font-mono text-[11px]"
            value={renderPlainText({ resume: tailored, profile, jobTitle: job?.title ?? '' })}
            readOnly
            aria-label="Предпросмотр резюме"
          />

          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="jp-button-primary" onClick={openForPrint}>
              Открыть и сохранить в PDF
            </button>
            <button type="button" className="jp-button" onClick={() => download('txt')}>
              Скачать .txt
            </button>
            <button type="button" className="jp-button" onClick={() => download('md')}>
              Скачать .md
            </button>
          </div>
          <p className="text-[10px] text-muted">
            PDF собирается печатью страницы: в диалоге Chrome выберите «Сохранить как PDF». Такой
            файл текстовый и в одну колонку — именно его ATS разбирает без потерь. Формат .txt самый
            безопасный, если работодатель просит вставить резюме в поле.
          </p>
        </section>
      ) : null}

      {!resumeText ? (
        <Empty
          title="Резюме пока нет"
          hint="Загрузите PDF или вставьте текст — дальше JobPilot проверит его на совместимость с ATS и сравнит с вакансией."
        />
      ) : null}
    </div>
  );
}

export { BASE_RESUME_ID };
