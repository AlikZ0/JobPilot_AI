import { useEffect, useMemo, useState } from 'react';
import type { FieldMapping } from '@/types/application';
import { MESSAGE_TYPES } from '@/types/messages';
import { sendToBackground } from '@/utils/messaging';
import {
  getApplication,
  markSubmitted,
  updateApplication,
} from '@/database/repositories/applicationRepository';
import { markApplicationReady } from '@/core/application/applicationService';
import { createId } from '@/utils/id';
import { useStore, withBusy } from '../state/store';
import { Empty } from '../components/Empty';
import { MatchScore } from '../components/MatchScore';

/**
 * The review screen. JobPilot fills fields and drafts text, but the actual
 * submission is always performed by the user on the site itself — this screen
 * only records that they confirmed it.
 */
export function ApplicationReview() {
  const applicationId = useStore((state) => state.selectedApplicationId);
  const applications = useStore((state) => state.applications);
  const jobs = useStore((state) => state.jobs);
  const analyses = useStore((state) => state.analyses);
  const profile = useStore((state) => state.profile);
  const activeTabId = useStore((state) => state.activeTabId);
  const navigate = useStore((state) => state.navigate);
  const refreshData = useStore((state) => state.refreshData);
  const pushToast = useStore((state) => state.pushToast);

  const application = applications.find((entry) => entry.id === applicationId);
  const job = jobs.find((entry) => entry.id === application?.jobId);
  const analysis = job ? analyses[job.id] : undefined;

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
    // Re-syncs whenever the stored application changes; `applicationKey`
    // captures both identity and revision.
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
        title="Application not found"
        action={{ label: 'Back to applications', onClick: () => navigate('applications') }}
      />
    );
  }

  const analyzeForm = () =>
    void withBusy('Reading the form', async () => {
      const plan = await sendToBackground(MESSAGE_TYPES.ANALYZE_APPLICATION_FORM, {
        applicationId: application.id,
        ...(activeTabId ? { tabId: activeTabId } : {}),
      });
      setMappings(plan.mappings);
      await refreshData();
      pushToast({
        level: 'info',
        message: `${plan.mappings.length} fields mapped, ${plan.unknownFields.length} unrecognised.`,
      });
    });

  const fillForm = () =>
    void withBusy('Filling the form', async () => {
      const approved = mappings.filter((mapping) => mapping.decision === 'auto');
      if (approved.length === 0) {
        pushToast({ level: 'warning', message: 'Approve at least one field first.' });
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
        message: `Filled ${result.filled} field(s), skipped ${result.skipped}.`,
      });
    });

  const generateLetter = () =>
    void withBusy('Writing cover letter', async () => {
      const result = await sendToBackground(MESSAGE_TYPES.GENERATE_COVER_LETTER, {
        jobId: job.id,
        applicationId: application.id,
      });
      setCoverLetter(result.coverLetter);
      await refreshData();
      if (result.status === 'needs_user_confirmation') {
        pushToast({
          level: 'warning',
          message: `Review needed: ${result.unverifiedClaims.join('; ') || 'some claims could not be verified.'}`,
        });
      }
    });

  const answerQuestion = () =>
    void withBusy('Drafting answer', async () => {
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
          message:
            'The answer needs your confirmation — it contains facts the profile cannot prove.',
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
    void withBusy('Saving draft', async () => {
      await updateApplication(application.id, {
        fieldMappings: mappings,
        coverLetter,
        coverLetterStatus: coverLetter ? 'user_edited' : 'none',
      });
      await refreshData();
    });

  const markReady = () =>
    void withBusy('Marking ready', async () => {
      await updateApplication(application.id, { fieldMappings: mappings, coverLetter });
      await markApplicationReady(application.id);
      await refreshData();
      pushToast({ level: 'success', message: 'Application marked as ready for your review.' });
    });

  const confirmSubmitted = () =>
    void withBusy('Recording submission', async () => {
      const fresh = await getApplication(application.id);
      if (fresh && fresh.state !== 'ready') await markApplicationReady(application.id);
      await markSubmitted(application.id, true);
      await refreshData();
      pushToast({ level: 'success', message: 'Recorded as submitted.' });
    });

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="jp-button-ghost self-start"
        onClick={() => navigate('applications')}
      >
        ← Applications
      </button>

      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{job.title}</h2>
          <p className="text-[12px] text-muted">
            {job.company} · state: {application.state}
          </p>
        </div>
        {analysis ? <MatchScore score={analysis.score} band={analysis.band} /> : null}
      </header>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">1 · Form fields</h3>
        <p className="text-[11px] text-muted">
          Open the application page in the active tab, then read the form. Fields below the
          confidence threshold always wait for you.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={analyzeForm}>
            Read form on this page
          </button>
          <button
            type="button"
            className="jp-button-primary"
            onClick={fillForm}
            disabled={autoFillable.length === 0}
          >
            Fill {autoFillable.length} approved field(s)
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
                      {mapping.fieldType.replace(/_/g, ' ')} ·{' '}
                      {Math.round(mapping.confidence * 100)}% confidence · {mapping.source}
                    </p>
                  </div>
                  <select
                    className="jp-input w-auto py-0.5 text-[11px]"
                    value={mapping.decision}
                    onChange={(event) =>
                      setDecision(mapping.fieldId, event.target.value as FieldMapping['decision'])
                    }
                    aria-label={`Decision for ${mapping.label}`}
                  >
                    <option value="auto">Fill</option>
                    <option value="needs_confirmation">Ask me</option>
                    <option value="skipped">Skip</option>
                  </select>
                </div>
                <input
                  className="jp-input mt-1.5"
                  value={mapping.value}
                  placeholder="No value in profile"
                  onChange={(event) => setValue(mapping.fieldId, event.target.value)}
                  aria-label={`Value for ${mapping.label}`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-muted">No fields read yet.</p>
        )}
        {needsAttention.length > 0 ? (
          <p className="text-[11px] text-potential">
            ⚠ {needsAttention.length} field(s) need your confirmation before they can be filled.
          </p>
        ) : null}
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">2 · Cover letter</h3>
        <button type="button" className="jp-button self-start" onClick={generateLetter}>
          Generate cover letter
        </button>
        <textarea
          className="jp-input min-h-[140px] font-mono text-[12px]"
          value={coverLetter}
          onChange={(event) => setCoverLetter(event.target.value)}
          placeholder="Your cover letter will appear here. Edit freely — your version is what gets saved."
        />
        {application.unverifiedClaims.length > 0 ? (
          <div className="rounded-md border border-potential/40 bg-potential/10 p-2 text-[11px]">
            <p className="font-semibold text-potential">User confirmation required</p>
            <ul className="ml-4 list-disc">
              {application.unverifiedClaims.map((claim, index) => (
                <li key={index}>{claim}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">3 · Application questions</h3>
        <div className="flex gap-1.5">
          <input
            className="jp-input"
            placeholder="Paste a question from the form…"
            value={questionDraft}
            onChange={(event) => setQuestionDraft(event.target.value)}
          />
          <button type="button" className="jp-button" onClick={answerQuestion}>
            Draft answer
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
                <p className="mt-1 text-[11px] text-potential">
                  ⚠ User confirmation required: {question.missingInformation.join('; ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="jp-card flex flex-col gap-2">
        <h3 className="jp-section-title">4 · Review &amp; submit</h3>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-muted">Position</dt>
          <dd>{job.title}</dd>
          <dt className="text-muted">Company</dt>
          <dd>{job.company}</dd>
          <dt className="text-muted">Name</dt>
          <dd>
            {profile.personal.firstName} {profile.personal.lastName}
          </dd>
          <dt className="text-muted">Email</dt>
          <dd>{profile.personal.email || '—'}</dd>
          <dt className="text-muted">Expected salary</dt>
          <dd>
            {profile.salary.expected
              ? `${profile.salary.currency} ${profile.salary.expected}/${profile.salary.period}`
              : '—'}
          </dd>
          <dt className="text-muted">Attachment</dt>
          <dd>{profile.attachments.find((a) => a.isDefault)?.name ?? 'none selected'}</dd>
        </dl>

        <div className="rounded-md border border-border bg-surface-3 p-2 text-[11px]">
          <p className="font-semibold">JobPilot never submits an application for you.</p>
          <p className="text-muted">
            Press Submit on the job site yourself. Use the checkbox below only to record that you
            did.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="jp-button" onClick={saveDraft}>
            Save draft
          </button>
          <button type="button" className="jp-button" onClick={markReady}>
            Mark as ready
          </button>
        </div>

        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(event) => setConfirmChecked(event.target.checked)}
            disabled={application.state === 'submitted'}
          />
          <span>I submitted this application on the job site myself.</span>
        </label>
        <button
          type="button"
          className="jp-button-primary self-start"
          onClick={confirmSubmitted}
          disabled={!confirmChecked || application.state === 'submitted'}
        >
          {application.state === 'submitted' ? 'Recorded as submitted' : 'Record submission'}
        </button>
      </section>
    </div>
  );
}
