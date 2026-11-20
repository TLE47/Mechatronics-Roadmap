import React from 'react';
import { createPortal } from 'react-dom';
import { Compass, Download, FileJson, Settings2, X } from 'lucide-react';
import {
  GENERAL_SETTINGS_EVENT,
  readShowActionLabels,
  readWorkspaceBlocks,
  writeShowActionLabels,
  writeWorkspaceBlock,
  type WorkspaceBlock,
} from '../generalSettings';
import { downloadLearningLog } from '../learningLog';
import { GUIDE_STEP_COUNT } from '../learnerGuide';
import { openLearnerGuide, readGuideReopen, writeGuideReopen } from '../learnerGuideDoor';
import { BackupControls } from './BackupControls';
import { cachedSoundPrefs, subscribeSoundPrefs, type SoundPrefs } from '../audio/prefs.ts';
import { change, install, preview, reset, subscribeArmed, togglePlay } from '../audio/musicManager.ts';
import type { UiRole } from '../audio/facade.ts';
import { SoundSettingsPanel } from './SoundSettingsPanel';

/** The live sound controls, without the header popover: the same store, the same one apply path. */
const SoundSettingsLive: React.FC<{ id: string }> = ({ id }) => {
  const [prefs, setPrefs] = React.useState<SoundPrefs>(() => cachedSoundPrefs());
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    install();
    const release = subscribeArmed(setArmed);
    const stop = subscribeSoundPrefs(setPrefs);
    return () => {
      release();
      stop();
    };
  }, []);
  return (
    <SoundSettingsPanel
      id={id}
      prefs={prefs}
      armed={armed}
      onToggle={() => togglePlay()}
      onLevel={(key, value) => change({ [key]: value / 100 } as Partial<SoundPrefs>)}
      onClicks={(on) => change({ clicks: on })}
      onTape={(tape) => change({ tape })}
      onInstrument={(instrument) => change({ instrument })}
      excluded={prefs.excluded}
      onExclude={(tape) =>
        change({
          excluded: prefs.excluded.includes(tape)
            ? prefs.excluded.filter((entry) => entry !== tape)
            : [...prefs.excluded, tape],
        })
      }
      onRandomize={(randomize) => change({ randomize })}
      onPreview={(role: UiRole) => preview(role)}
      onReset={() => reset()}
    />
  );
};

/**
 * General settings (`components/GeneralSettingsPanel.tsx`).
 *
 * One dialog for the preferences that are about the workbench rather than the lesson: the action
 * tray's small text labels, which of the three workbench blocks are drawn, the ways of taking work
 * out of this browser, and the whole sound surface, which used to live behind the speaker icon
 * alone. The speaker still mutes in one press; this is where the detail is read and changed.
 *
 * The exports and the backup live here rather than on the header row because they are occasional
 * jobs, not navigation: four buttons for them competed with the trays a learner actually uses.
 */

const WORKSPACE_BLOCKS: { id: WorkspaceBlock; testid: string; label: string; hint: string }[] = [
  {
    id: 'runtime',
    testid: 'btn-show-runtime-strip',
    label: 'Python 3.12 runtime strip',
    hint: 'The “Python 3.12 in an isolated Web Worker” box: its ready state, verified count and offline control.',
  },
  {
    id: 'hints',
    testid: 'btn-show-hint-ladder',
    label: 'Hint ladder',
    hint: 'The Progressive 3-Step Hint Ladder and its Reveal Hint button. Open hints leave the page with it.',
  },
  {
    id: 'assessment',
    testid: 'btn-show-instructor-tests',
    label: 'Instructor Behavioral Assessment',
    hint: 'The badges, graded checks and the hint each failing check points at.',
  },
];

const WorkspaceBlockToggle: React.FC<{
  testid: string;
  label: string;
  hint: string;
  on: boolean;
  onChange: () => void;
}> = ({ testid, label, hint, on, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    aria-pressed={on}
    data-testid={testid}
    title={on ? 'Hide this block' : 'Show this block again'}
    className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
    style={{
      borderColor: on ? 'var(--accent)' : 'var(--border)',
      backgroundColor: on ? 'var(--accent-soft)' : 'transparent',
    }}
  >
    <span>
      <span className="block text-[12px] font-semibold">{label}</span>
      <span className="block text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
        {hint}
      </span>
    </span>
    <span aria-hidden="true" className="shrink-0 font-mono text-[11px]">
      {on ? 'on' : 'off'}
    </span>
  </button>
);

export const GeneralSettingsPanel: React.FC<{
  open: boolean;
  onClose: () => void;
  onExportPortfolio: () => void;
}> = ({ open, onClose, onExportPortfolio }) => {
  const [labels, setLabels] = React.useState(readShowActionLabels());
  const [blocks, setBlocks] = React.useState(readWorkspaceBlocks);
  const [guideReopen, setGuideReopen] = React.useState(readGuideReopen);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  // Whoever opened the dialog gets the focus back: the gear, or the speaker's detail button, which
  // is the same door now that sound lives here.
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const refresh = () => {
      setLabels(readShowActionLabels());
      setBlocks(readWorkspaceBlocks());
      setGuideReopen(readGuideReopen());
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener(GENERAL_SETTINGS_EVENT, refresh);
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener(GENERAL_SETTINGS_EVENT, refresh);
      window.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portalled to `body`: the header that opens this dialog is `backdrop-blur`red, and a filtered
  // ancestor is a containing block for `position: fixed`. Rendered in place, `inset-0` resolved to
  // the header's box instead of the window, which put the dialog ~390 px above a phone's screen.
  const dialog = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[10vh] max-sm:items-end max-sm:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label="General settings"
        data-testid="general-settings"
        className="w-full max-w-lg overflow-hidden rounded-xl border shadow-[var(--shadow-lg)] max-sm:max-h-[92dvh] max-sm:rounded-b-none"
        style={{ borderColor: 'var(--border-strong)', backgroundColor: 'var(--panel)', color: 'var(--text)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5" style={{ borderColor: 'var(--border)' }}>
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Settings2 className="h-4 w-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
            General settings
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            data-testid="btn-general-settings-close"
            aria-label="Close general settings"
            className="rounded border px-2 py-0.5 text-[12px]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3.5">
          <section aria-label="New learner guide" data-testid="general-guide">
            <button
              type="button"
              onClick={() => {
                // The guide is its own surface, above this one: close settings before opening it,
                // so the learner never sees two dialogs stacked on one another.
                onClose();
                openLearnerGuide();
              }}
              data-testid="btn-open-new-learner-guide"
              className="group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-accent/50"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-soft)' }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                  New learner guide
                  <span className="rounded-full border border-accent/30 px-1.5 py-0.5 font-mono text-[9px] font-normal text-accent">
                    {GUIDE_STEP_COUNT} steps
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  Start here if the workbench is new: every tab, the learning loop, and the roadmap
                  in one short walk. Stop any time; it resumes where you left off.
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-accent transition-transform group-hover:translate-x-0.5">
                Open →
              </span>
            </button>
            <button
              type="button"
              role="checkbox"
              aria-checked={guideReopen}
              onClick={() => setGuideReopen(writeGuideReopen(!guideReopen))}
              data-testid="btn-guide-reopen"
              title="Open the new learner guide automatically on every visit, until you turn it off here or in the guide's own checklist."
              className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
              style={{
                borderColor: guideReopen ? 'var(--accent)' : 'var(--border)',
                backgroundColor: guideReopen ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span>
                <span className="block text-[12px] font-semibold">Reopen on every visit</span>
                <span className="block text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
                  Open this guide automatically when the workbench loads. Turn it off here or from
                  the checklist at the foot of the guide; opening it by hand always works.
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 font-mono text-[11px]">
                {guideReopen ? 'on' : 'off'}
              </span>
            </button>
          </section>
          <section aria-label="Action tray" data-testid="general-tray" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => setLabels(writeShowActionLabels(!labels))}
              aria-pressed={labels}
              data-testid="btn-action-labels"
              className="flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
              style={{
                borderColor: labels ? 'var(--accent)' : 'var(--border)',
                backgroundColor: labels ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span>
                <span className="block text-[12px] font-semibold">Small text on the action buttons</span>
                <span className="block text-[11px]" style={{ color: 'var(--dim)' }}>
                  Keep the words beside the icons in the header trays at compact widths, so every
                  button says what it does instead of waiting for a hover.
                </span>
              </span>
              <span aria-hidden="true" className="font-mono text-[11px]">
                {labels ? 'on' : 'off'}
              </span>
            </button>
          </section>
          <section
            aria-label="Workspace blocks"
            data-testid="general-blocks"
            className="mt-3 border-t pt-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Workspace blocks
            </p>
            <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--dim)' }}>
              Put away a block you do not use. Its records and its work stay put; this choice is
              remembered on this device.
            </p>
            {WORKSPACE_BLOCKS.map((block) => (
              <WorkspaceBlockToggle
                key={block.id}
                testid={block.testid}
                label={block.label}
                hint={block.hint}
                on={blocks[block.id]}
                onChange={() => {
                  writeWorkspaceBlock(block.id, !blocks[block.id]);
                  setBlocks(readWorkspaceBlocks());
                }}
              />
            ))}
          </section>
          <section
            aria-label="Export and backup"
            data-testid="general-export"
            className="mt-3 border-t pt-3"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Export and backup
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={downloadLearningLog}
                data-testid="btn-export-learning-log"
                aria-label="Export Learning Log (.json)"
                data-tip="Export learning log (.json) — opens, runs, failures and hints. It never leaves this browser."
                className="btn"
              >
                <FileJson className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Log</span>
              </button>
              {/* Everything in this browser, out and back in: the two buttons report what they did. */}
              <BackupControls labelClass="inline" />
              <button
                type="button"
                // Export is its own dialog, drawn above this one: closing settings first means the
                // learner sees the file it writes instead of a panel stacked behind a backdrop.
                onClick={() => {
                  onClose();
                  onExportPortfolio();
                }}
                data-testid="btn-export-portfolio"
                // The label repeats the visible text rather than describing it: a name that differs
                // from what is drawn fails WCAG 2.5.3 (`label-content-name-mismatch`).
                aria-label="Export Progress (.md)"
                data-tip="Export progress (.md)"
                className="btn"
                style={{ color: 'var(--emerald)' }}
              >
                <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Progress</span>
              </button>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--dim)' }}>
              Progress, drafts and the learning log stay in this browser until you export them.
              A backup is one <code>.zip</code>; restoring one merges it and deletes nothing.
            </p>
          </section>
          <section aria-label="Sound settings" data-testid="general-sound" className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
              Sound
            </p>
            <SoundSettingsLive id={`${panelId}-sound`} />
          </section>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
};
