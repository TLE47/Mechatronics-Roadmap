import { useCompactChrome } from '../../../compactChrome';

/**
 * The page's mode bar, drawn inside the Compact dock (`TabPyodideRunner.tsx`, the `Mode` module).
 *
 * Compact has no room for the bar's second row, and a learner who folded the page has not given up
 * the choice between the plain-English path and every lab: the two-button switch and the three
 * tallies fit in one line of the panel.
 */
export function CompactModeRow() {
  const chrome = useCompactChrome();
  if (!chrome) return null;
  const { counts } = chrome;
  return (
    <div data-testid="compact-mode-row" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div
        role="group"
        aria-label="Workbench Complexity Mode"
        className="flex items-center gap-0.5 rounded-md border border-line bg-canvas p-0.5"
      >
        {(['beginner', 'advanced'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            data-testid={`compact-mode-${mode}`}
            aria-pressed={chrome.mode === mode}
            onClick={() => chrome.onMode(mode)}
            className={`cursor-pointer rounded px-2 py-0.5 text-[11px] font-semibold ${
              chrome.mode === mode ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
            }`}
          >
            {mode === 'beginner' ? 'Beginner' : 'All labs'}
          </button>
        ))}
      </div>
      <span className="font-mono text-[10.5px] text-muted">
        {counts.verified}/{counts.lessons} passed · {counts.marked}/{counts.lessons} self-marked ·{' '}
        {counts.milestones}/{counts.milestoneTotal} milestones
      </span>
    </div>
  );
}

/**
 * The simulator tabs, drawn inside the Compact dock (the `Tabs` module).
 *
 * One chip per tab, and only the tab on screen prints its name: a rail of thirteen names is the thing
 * Compact exists to fold, and every chip keeps its name for a keyboard and a screen reader.
 */
export function CompactTabChips() {
  const chrome = useCompactChrome();
  if (!chrome) return null;
  return (
    <div data-testid="compact-tab-chips" className="flex flex-wrap items-center gap-0.5">
      {chrome.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={`compact-rail-${tab.id}`}
          data-sound="nav"
          aria-current={tab.active ? 'page' : undefined}
          aria-label={tab.label}
          title={tab.label}
          onClick={tab.onSelect}
          className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
            tab.active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
          }`}
        >
          {tab.icon}
          {tab.active ? (
            <span className="max-w-[16rem] truncate">{tab.label.replace(/\s*\(.*\)$/, '')}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
