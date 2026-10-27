import React, { useEffect, useRef, useState } from 'react';
import { Archive, Upload } from 'lucide-react';
import {
  STORE_RESTORED_EVENT,
  prepareBackup,
  restoreBackupZip,
  restoreSummary,
} from '../backupBundle';

/**
 * Back up everything, and put it back (`app/src/components/BackupControls.tsx`).
 *
 * Two buttons in the header, next to the other ways of getting work out of this browser. The backup is
 * one `.zip` rather than five loose files, because the point is a file a learner can put in Dropbox and
 * restore on another machine without knowing which store is which.
 *
 * The restore is a merge, not an overwrite, so it needs no confirmation dialog: nothing on this machine
 * is deleted by it. What it does need is to be *told*, so the toast reports exactly what changed —
 * `Restored · 4 lessons verified · 2 drafts · 11 log events` — and says "nothing new" when the file
 * matches what the browser already has. A refused file says why in the same place: wrong file, half a
 * download, or a zip that was re-compressed after it was unzipped.
 *
 * After a successful restore it dispatches `STORE_RESTORED_EVENT`. The App listens and re-reads the
 * three progress maps, because React state holding the pre-restore copy would otherwise show ticks the
 * store already has. No reload: a learner's unsaved editor text and active tab survive, which they
 * would not after one.
 */

type Status = { tone: 'ok' | 'warn'; text: string };

const STATUS_MS = 9000;

export const BackupControls: React.FC<{ testIdSuffix?: string }> = ({ testIdSuffix }) => {
  const tid = (base: string) => (testIdSuffix ? `${base}-${testIdSuffix}` : base);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const announce = (next: Status) => {
    setStatus(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(null), STATUS_MS);
  };

  const handleBackup = () => {
    try {
      const backup = prepareBackup();
      // A fresh view over an ordinary ArrayBuffer: the blob wants that, not a possibly shared one.
      const blob = new Blob([new Uint8Array(backup.bytes)], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = backup.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      // Revoking in the same tick can cancel the download in some browsers; the browser holds the
      // blob alive until the save finishes, so a delay costs nothing and saves the file.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      announce({ tone: 'ok', text: backup.summary });
    } catch (error) {
      announce({
        tone: 'warn',
        text: `Backup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = restoreBackupZip(bytes);
      if (!result.ok) {
        announce({ tone: 'warn', text: result.message });
        return;
      }
      window.dispatchEvent(
        new CustomEvent(STORE_RESTORED_EVENT, { detail: result.report })
      );
      announce({ tone: 'ok', text: restoreSummary(result.report) });
    } catch (error) {
      announce({
        tone: 'warn',
        text: `That file could not be read: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={handleBackup}
        data-testid={tid('btn-backup-download')}
        aria-label="Back Up (.zip)"
        data-tip="Back up (.zip) — progress, drafts and the log, in one file"
        className="btn"
      >
        <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden 2xl:inline">Back Up (.zip)</span>
      </button>
      <button
        onClick={() => inputRef.current?.click()}
        data-testid={tid('btn-backup-restore')}
        disabled={busy}
        aria-label="Restore (.zip)"
        data-tip="Restore (.zip) — merge a backup, nothing here is deleted"
        className="btn"
        style={{ opacity: busy ? 0.6 : 1 }}
      >
        <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden 2xl:inline">{busy ? 'Reading…' : 'Restore (.zip)'}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        data-testid={tid('input-backup-file')}
        aria-label="Choose a MechaLab backup (.zip) to restore"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clearing the value lets the learner choose the same file again after a mis-pick.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      {status && (
        <div
          role="status"
          aria-live="polite"
          data-testid={tid('backup-status')}
          onClick={() => setStatus(null)}
          title="Dismiss"
          className="fixed bottom-4 right-4 z-50 max-w-[24rem] cursor-pointer rounded-[var(--r-md)] border bg-raise px-3 py-2 text-[11.5px] font-medium text-ink shadow-lg"
          style={{
            borderColor: status.tone === 'warn' ? 'var(--rose)' : 'var(--emerald)',
            color: status.tone === 'warn' ? 'var(--rose)' : 'var(--text)',
          }}
        >
          {status.text}
        </div>
      )}
    </>
  );
};
