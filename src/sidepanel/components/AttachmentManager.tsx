import { useRef } from 'react';
import type { Attachment, UserProfile } from '@/types/profile';
import { createId } from '@/utils/id';
import { useStore } from '../state/store';

const MAX_BYTES = 4 * 1024 * 1024;

interface Props {
  profile: UserProfile;
  onChange(patch: Partial<UserProfile>): void;
}

/** Resumes and other documents, stored locally as data URLs. */
export function AttachmentManager({ profile, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pushToast = useStore((state) => state.pushToast);

  const addFile = async (file: File, kind: Attachment['kind']) => {
    if (file.size > MAX_BYTES) {
      pushToast({ level: 'error', message: 'Files larger than 4 MB cannot be stored.' });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const attachment: Attachment = {
      id: createId('att'),
      kind,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      dataUrl,
      isDefault: kind === 'resume' && !profile.attachments.some((a) => a.kind === 'resume'),
      createdAt: Date.now(),
    };
    onChange({ attachments: [...profile.attachments, attachment] });
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="jp-section-title">Attachments</h3>
      <p className="text-[11px] text-muted">
        Kept on this device only. JobPilot cannot attach files to a form for you — browsers block
        that — so you pick the file yourself on the application page.
      </p>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.rtf,.png,.jpg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addFile(file, 'resume');
          event.target.value = '';
        }}
      />
      <button type="button" className="jp-button self-start" onClick={() => input.current?.click()}>
        + Add resume / document
      </button>
      <ul className="flex flex-col gap-1">
        {profile.attachments.map((attachment) => (
          <li
            key={attachment.id}
            className="jp-card flex items-center justify-between gap-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium">{attachment.name}</p>
              <p className="text-[10px] text-muted">
                {attachment.kind} · {(attachment.size / 1024).toFixed(0)} KB
                {attachment.isDefault ? ' · default' : ''}
              </p>
            </div>
            <div className="flex gap-1">
              {!attachment.isDefault ? (
                <button
                  type="button"
                  className="jp-button"
                  onClick={() =>
                    onChange({
                      attachments: profile.attachments.map((entry) => ({
                        ...entry,
                        isDefault: entry.id === attachment.id,
                      })),
                    })
                  }
                >
                  Make default
                </button>
              ) : null}
              <button
                type="button"
                className="jp-button"
                onClick={() =>
                  onChange({
                    attachments: profile.attachments.filter((entry) => entry.id !== attachment.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
