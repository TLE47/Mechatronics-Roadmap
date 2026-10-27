import React from 'react';
import { Printer, Download, FileJson, User, ChevronRight, Sun, Moon, Contrast, BookOpen, Search, Maximize2, Minimize2, House } from 'lucide-react';
import { ActiveTierPass } from '../curriculumData';
import { downloadLearningLog } from '../learningLog';
import { BackupControls } from './BackupControls';
import {
  CONTRAST_LABEL,
  PAPER_LABEL,
  contrastHint,
  paperHint,
  themeLabel,
  themeShortLabel,
  type Theme,
} from '../theme';
import { focusLabel } from '../focusMode';
import { SoundControlLazy } from './SoundControlLazy';
// The interface's own ear: one delegated listener for every control's click, mounted once with the
// header (which every screen renders). It renders nothing and holds no state.
import { SoundClicks } from './SoundClicks';

interface HeaderProps {
  /** The palette on screen, the OS palette leaving high contrast returns to, and the three controls. */
  theme: Theme;
  fallback: Theme;
  onToggle: () => void;
  onToggleContrast: () => void;
  onTogglePaper: () => void;
  onOpenCheatSheet: () => void;
  onExportPortfolio: () => void;
  activeTierPass: ActiveTierPass;
  onSelectTierPass: (pass: ActiveTierPass) => void;
  /**
   * Whether this view reads the pass at all. On the views that do not — the Python runner, the
   * placement quiz, the board and link surveys, the dashboard and the admin area — the four links
   * moved a highlight and changed nothing else, so they are not drawn (`courseLevels.ts`).
   */
  showCourseLevels: boolean;
  /** The signed-in address, or null when signed out (and when accounts are not configured). */
  accountEmail: string | null;
  onOpenAccount: () => void;
  /** Opens the `⌘K` palette: the header's door to the same dialog the shortcut opens. */
  onOpenPalette: () => void;
  /** Opens Home. Absent on the theme reference, which has no work to go back to. */
  onOpenHome?: () => void;
  /**
   * Focus mode, and its toggle. Optional because the token page renders this header too and has no
   * work to focus on: a button there would hide the page it is on and offer no way back.
   */
  focus?: boolean;
  onToggleFocus?: () => void;
}

/** The mark: a two-link arm, drawn in the same cyan as the live hero canvas. */
const ArmMark: React.FC = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 26 26"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="7" stroke="var(--border-strong)" />
    <path
      d="M7 18.5 L12.2 12.4 L18.4 9.2"
      stroke="var(--accent)"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="18.5" r="2" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.6" />
    <circle cx="12.2" cy="12.4" r="1.8" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.6" />
    <circle cx="18.4" cy="9.2" r="2.2" fill="var(--accent)" />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  theme,
  fallback,
  onToggle: toggle,
  onToggleContrast,
  onTogglePaper,
  onOpenCheatSheet,
  onExportPortfolio,
  activeTierPass,
  onSelectTierPass,
  showCourseLevels,
  accountEmail,
  onOpenAccount,
  onOpenPalette,
  onOpenHome,
  focus = false,
  onToggleFocus,
}) => {
  // The theme is mounted once, in `App`, and handed down: the attribute on <html> and this button's
  // label are the same state, so the toggle can never claim a mode the page is not in.
  // The nav is on every screen, including a newcomer's first one. Keep the labels plain English:
  // the internal Stage/Pass/Tier names live in the roadmap tab and docs/ROUTE.md, not here.
  const passLinks: { id: ActiveTierPass; label: string }[] = [
    { id: 'level0', label: 'Start here' },
    { id: 'tier1', label: 'Beginner' },
    { id: 'tier2', label: 'Applied' },
    { id: 'tier3', label: 'Advanced' },
  ];

  /**
   * A toggle that is on. The tray owns the frame, so the state is a wash inside it rather than a
   * second outline: readable as "this is on" without competing with the group it sits in.
   */
  const pressed = (on: boolean): React.CSSProperties | undefined =>
    on ? { color: 'var(--accent)', background: 'var(--accent-soft)' } : undefined;

  return (
    <header
      data-chrome="header"
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        borderColor: 'var(--border)',
        // A translucent panel, so the tab rail and lesson list slide underneath the header instead
        // of jumping when the page scrolls.
        backgroundColor: 'color-mix(in srgb, var(--bg) 82%, transparent)',
      }}
    >
      <SoundClicks />
      <div className="mx-auto flex max-w-[var(--shell-max)] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        {/* Zone 1: brand lockup. The mark is the arm a learner is working towards. The link's name
            is its own text plus a screen-reader-only tail: an `aria-label` that rewords it ("MechaLab
            Workbench, back to top") does not *contain* what is drawn, which WCAG 2.5.3 fails — the
            name has to be the visible words, with the purpose added to them, not written over them. */}
        <a
          href="#top"
          className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap no-underline"
        >
          <ArmMark />
          <span className="flex flex-col leading-none">
            <span
              className="text-[15px] font-bold tracking-tight"
              style={{ color: 'var(--text)' }}
            >
              MechaLab
            </span>
            <span
              className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: 'var(--dim)' }}
            >
              Workbench
            </span>
          </span>
          <span className="sr-only">, back to top</span>
        </a>

        {/* Zone 2: four course-level links, filled when active — but only on a view that reads the
            pass. A control that cannot change what is on screen is worse than no control: the click
            looks broken. */}
        {showCourseLevels && (
        <nav
          aria-label="Course level navigation"
          className="hidden items-center gap-1 md:flex"
        >
          {passLinks.map((item) => {
            const isActive = activeTierPass === item.id;
            return (
              <button
                key={item.id}
                data-testid={`btn-pass-${item.id}`}
                onClick={() => onSelectTierPass(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className="shrink-0 cursor-pointer rounded-[var(--r-sm)] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--muted)',
                  backgroundColor: isActive ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        )}

        {/* Zone 3: actions, in three trays instead of thirteen peers. The frame belongs to the
            group, so the children carry no border of their own; the account chip is the only filled
            control in the header because it is the only one whose state a learner has to see. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* Navigate: the two doors that are neither a lesson nor a setting. */}
          <div className="action-tray" role="group" aria-label="Navigate">
            {/* Home is a page, not a menu: one press from every screen, including Home itself. */}
            {onOpenHome && (
              <button
                onClick={onOpenHome}
                data-testid="btn-home"
                title="Home — today's step, your labs and your progress"
                className="btn"
              >
                <House className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden 2xl:inline">Home</span>
              </button>
            )}
            {/* The palette is a shortcut first, but a shortcut nobody can see is a secret. */}
            <button
              onClick={onOpenPalette}
              data-testid="btn-open-palette"
              aria-keyshortcuts="Meta+K Control+K"
              title="Jump to a lesson, tab or command (⌘K)"
              className="btn"
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden 2xl:inline">Search</span>
              <kbd
                className="ml-0.5 hidden rounded border px-1 py-0.5 text-[9.5px] font-semibold sm:inline"
                style={{ borderColor: 'var(--border)', color: 'var(--dim)' }}
              >
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Appearance and sound: five preferences on one surface. Each is its own on/off, so a
              pressed button states a fact instead of standing for a step in a cycle. */}
          <div className="action-tray" role="group" aria-label="Appearance and sound">
            <button
              onClick={toggle}
              data-testid="btn-theme-toggle"
              aria-label={themeLabel(theme, fallback)}
              title={themeLabel(theme, fallback)}
              className="btn"
            >
              {themeShortLabel(theme, fallback) === 'Light' ? (
                <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden 2xl:inline">{themeShortLabel(theme, fallback)}</span>
            </button>
            <button
              onClick={onToggleContrast}
              data-testid="btn-contrast-toggle"
              aria-label={CONTRAST_LABEL}
              aria-pressed={theme === 'contrast'}
              title={contrastHint(theme)}
              className="btn"
              style={pressed(theme === 'contrast')}
            >
              <Contrast className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden 2xl:inline">Contrast</span>
            </button>
            <button
              onClick={onTogglePaper}
              data-testid="btn-paper-toggle"
              aria-label={PAPER_LABEL}
              aria-pressed={theme === 'paper'}
              title={paperHint(theme)}
              className="btn"
              style={pressed(theme === 'paper')}
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden 2xl:inline">Paper</span>
            </button>
            {/* Sound is a preference, so its control is on every screen — including this one, where
                the switch is the first thing a learner reaches for after a loud surprise. Behind a
                lazy boundary: the entry chunk is a first paint, and sound is opt-in. */}
            <React.Suspense
              fallback={
                <span aria-hidden="true" className="btn" style={{ visibility: 'hidden' }}>
                  Sound
                </span>
              }
            >
              <SoundControlLazy />
            </React.Suspense>
            {onToggleFocus && (
              <button
                onClick={onToggleFocus}
                data-testid="btn-focus-toggle"
                aria-pressed={focus}
                aria-keyshortcuts="Meta+. Control+."
                title={focusLabel(focus)}
                className="btn"
                style={pressed(focus)}
              >
                {focus ? (
                  <Minimize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="hidden 2xl:inline">Focus</span>
              </button>
            )}
          </div>

          {/* Take it with you: four exports and the pair that puts it all back. */}
          <div className="action-tray" role="group" aria-label="Export and backup">
            <button
              onClick={downloadLearningLog}
              data-testid="btn-export-learning-log"
              title="Download what you actually did — opens, runs, failed tests, hints — as JSON. It never leaves this browser unless you hand it over."
              className="btn"
            >
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">Export Learning Log (.json)</span>
            </button>
            {/* Everything in this browser, out and back in: the two buttons report what they did. */}
            <BackupControls />
            <button
              onClick={onExportPortfolio}
              data-testid="btn-export-portfolio"
              // The words are `hidden` below 1536 px, so the button is an icon with no name on most
              // screens. The label repeats the visible text rather than describing it: a name that
              // differs from what is drawn fails WCAG 2.5.3, and Lighthouse's `label-content-name-mismatch`
              // found exactly that in the sibling buttons this fix matches.
              aria-label="Export Progress (.md)"
              className="btn"
              style={{ color: 'var(--emerald)' }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">Export Progress (.md)</span>
            </button>
            <button
              onClick={onOpenCheatSheet}
              data-testid="btn-open-cheatsheet"
              aria-label="1-Page Cheat Sheet"
              className="btn"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">1-Page Cheat Sheet</span>
            </button>
          </div>

          {/* Who you are here, and the only control in the header that says something about you: a
              filled chip with the avatar disc, the email (or the words a newcomer needs), and the
              chevron that says a panel opens. The visible text is the accessible name — an aria-label
              that reworded it would fail WCAG 2.5.3, which this header has been caught by before. */}
          <button
            onClick={onOpenAccount}
            data-testid="btn-account"
            title={
              accountEmail
                ? `Signed in as ${accountEmail} — progress syncs to your account`
                : 'Sign in to keep your progress across browsers, or keep it in this one'
            }
            className="flex max-w-[16rem] shrink-0 cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] font-semibold transition-colors hover:brightness-110"
            style={{
              border: '1px solid color-mix(in srgb, var(--accent) 40%, var(--border))',
              background: 'color-mix(in srgb, var(--accent-soft) 80%, var(--panel-2))',
              color: 'var(--accent)',
            }}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
              aria-hidden="true"
              style={{ background: 'var(--accent)', color: 'var(--inverse)' }}
            >
              {accountEmail ? (
                <span className="text-[10.5px] font-bold uppercase">{accountEmail.slice(0, 1)}</span>
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="truncate">{accountEmail ?? 'Sign in'}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
