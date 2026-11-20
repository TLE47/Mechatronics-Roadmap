import { Settings2, X } from 'lucide-react';

/**
 * The Python editor's preferences (`runner/EditorSettingsPanel.tsx`).
 *
 * It opens inside the editor card rather than in General settings because the thing it changes is
 * the code surface in front of the learner. The switch is a real on/off state, stored on this device
 * by `editorSettings.ts`, and every mounted editor reconfigured without losing its document, caret
 * or undo history.
 */
export function EditorSettingsPanel({
  tooltips,
  onTooltips,
  onClose,
}: {
  tooltips: boolean;
  onTooltips: (on: boolean) => void;
  onClose: () => void;
}) {
  return (
    <section
      id="editor-settings-panel"
      data-testid="editor-settings"
      role="region"
      aria-labelledby="editor-settings-title"
      className="border-t border-line-soft px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p id="editor-settings-title" className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
            <Settings2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            Python editor settings
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            Properties of this code surface, remembered on this device.
          </p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          data-testid="btn-editor-settings-close"
          aria-label="Close editor settings"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line-soft text-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={tooltips}
        onClick={() => onTooltips(!tooltips)}
        data-testid="editor-tooltips-toggle"
        title={
          tooltips
            ? 'Turn off the hover cards and call signatures that appear while typing'
            : 'Turn the hover cards and call signatures back on'
        }
        className="mt-2 flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors"
        style={{
          borderColor: tooltips ? 'var(--accent)' : 'var(--border)',
          backgroundColor: tooltips ? 'var(--accent-soft)' : 'transparent',
        }}
      >
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">Code tooltips</span>
          <span className="block text-[11px] leading-snug text-muted">
            Hover cards, call signatures and keyword help. Completion, linting and inline values
            stay on.
          </span>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 rounded-md border border-line-soft bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] font-bold"
          style={{ color: tooltips ? 'var(--accent)' : 'var(--muted)' }}
        >
          {tooltips ? 'On' : 'Off'}
        </span>
      </button>
    </section>
  );
}
