import { useState } from 'react';
import { MESSAGE_TYPES } from '@/types/messages';
import type { UserProfile } from '@/types/profile';
import { sendToBackground } from '@/utils/messaging';
import { canonicalizeTech, categoryOf } from '@/core/extraction/techDictionary';
import { useStore, withBusy } from '../state/store';
import { ProfileForm } from '../components/ProfileForm';
import { AttachmentManager } from '../components/AttachmentManager';

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
    void withBusy('Saving profile', async () => {
      if (!draft) return;
      await updateProfile(draft);
      setDraft(null);
      pushToast({
        level: 'success',
        message: 'Profile saved. Cached analyses will be recalculated on next run.',
      });
    });

  const importResume = () =>
    void withBusy('Analyzing CV', async () => {
      const analysis = await sendToBackground(MESSAGE_TYPES.ANALYZE_RESUME, { text: resumeText });
      const existing = new Set(current.skills.map((skill) => skill.name.toLowerCase()));
      const suggested = analysis.skills
        .map((skill) => canonicalizeTech(skill.name))
        .filter((name) => name && !existing.has(name.toLowerCase()))
        .slice(0, 40);
      if (suggested.length === 0) {
        pushToast({ level: 'info', message: 'No new skills found in the CV.' });
        return;
      }
      patch({
        skills: [
          ...current.skills,
          ...suggested.map((name) => ({ name, category: categoryOf(name), primary: false })),
        ],
      });
      pushToast({
        level: 'warning',
        message: `${suggested.length} skills proposed from your CV. Review them, then press Save — nothing was added to your profile automatically.`,
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Your profile</h2>
          <p className="text-[11px] text-muted">
            Version {profile.version} · every save invalidates cached analyses.
          </p>
        </div>
        <button type="button" className="jp-button-primary" onClick={save} disabled={!dirty}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </header>

      <ProfileForm profile={current} onChange={patch} />

      <section className="flex flex-col gap-2">
        <h3 className="jp-section-title">Import from CV</h3>
        <p className="text-[11px] text-muted">
          Paste your CV text. JobPilot proposes skills it can read from the document — it never adds
          unverified facts to your profile by itself.
        </p>
        <textarea
          className="jp-input min-h-[90px]"
          placeholder="Paste CV text here…"
          value={resumeText}
          onChange={(event) => setResumeText(event.target.value)}
        />
        <button
          type="button"
          className="jp-button self-start"
          onClick={importResume}
          disabled={resumeText.trim().length < 80}
        >
          Analyze CV
        </button>
      </section>

      <AttachmentManager profile={current} onChange={patch} />
    </div>
  );
}
