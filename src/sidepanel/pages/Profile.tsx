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
          ...suggested.map((name) => ({ name, category: categoryOf(name), primary: false })),
        ],
      });
      pushToast({
        level: 'warning',
        message: `Из резюме предложено навыков: ${suggested.length}. Проверьте их и нажмите «Сохранить» — автоматически в профиль ничего не добавлено.`,
      });
    });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Ваш профиль</h2>
          <p className="text-[11px] text-muted">
            Версия {profile.version} · каждое сохранение сбрасывает кеш анализов.
          </p>
        </div>
        <button type="button" className="jp-button-primary" onClick={save} disabled={!dirty}>
          {dirty ? 'Сохранить изменения' : 'Сохранено'}
        </button>
      </header>

      <ProfileForm profile={current} onChange={patch} />

      <section className="flex flex-col gap-2">
        <h3 className="jp-section-title">Импорт из резюме</h3>
        <p className="text-[11px] text-muted">
          Вставьте текст резюме. JobPilot предложит навыки, которые смог прочитать в документе, — сам
          он никогда не добавляет в профиль неподтверждённые факты.
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
        >
          Разобрать резюме
        </button>
      </section>

      <AttachmentManager profile={current} onChange={patch} />
    </div>
  );
}
