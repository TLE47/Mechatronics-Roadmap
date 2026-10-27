import React from 'react';
import { Printer, Download, FileJson, User, ChevronRight, Sun, Moon, Contrast, BookOpen, Search, Maximize2, Minimize2, House, Pause, Play, RotateCcw } from 'lucide-react';
import { ActiveTierPass } from '../curriculumData';
import { downloadLearningLog } from '../learningLog';
import { BackupControls } from './BackupControls';
import { ResetProgressLazy } from './ResetProgressLazy';
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
import { motionHint, motionLabel } from '../motionPrefs';
import { useMotion } from '../useMotion';
import { SoundControlLazy } from './SoundControlLazy';
import { HeaderTips } from './HeaderTips';
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
   * The wordmark's destination: the introduction page. Optional in the same way `onOpenHome` is —
   * the token page passes neither, and the lockup then falls back to its plain `href`.
   */
  onOpenIntro?: () => void;
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
  onOpenIntro,
  focus = false,
  onToggleFocus,
}) => {
  // The motion switch is the app's, not a copy: the header writes the same store the figures read,
  // so a press here stops the introduction's loops and every lesson's frame loop in one go.
  const motion = useMotion();
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

  // The reset panel is lazy and mounted only once it is opened, so this is one boolean and one icon
  // on the first paint; the eleven stores it counts for arrive with the chunk.
  const [resetOpen, setResetOpen] = React.useState(false);
  // The tray row is the scope of the hover names (`HeaderTips`): one listener for the three trays,
  // the account chip's neighbours and whatever a child component puts in them.
  const actionsRef = React.useRef<HTMLDivElement | null>(null);

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
        {/* Zone 1: brand lockup. The mark is the arm a learner is working towards, and the lockup is
            the door to the introduction — the one page that explains the course before a learner has
            any progress to explain it with. It stays a real `href` (so a middle-click opens the page
            in a new tab) with an `onClick` that keeps the single-page navigation for a plain click.
            The link's name is its own text plus a screen-reader-only tail: an `aria-label` that
            rewords it does not *contain* what is drawn, which WCAG 2.5.3 fails — the name has to be
            the visible words, with the purpose added to them, not written over them. */}
        <a
          href="?view=intro"
          onClick={(event) => {
            if (!onOpenIntro) return;
            // A modified click, a middle click or a download is the browser's, not ours.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            onOpenIntro();
          }}
          data-testid="link-brand"
          className="group flex shrink-0 items-center gap-2.5 whitespace-nowrap no-underline"
        >
          <ArmMark />
          <span className="flex flex-col leading-none">
            <span
              className="font-display text-[15px]"
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
          <span className="sr-only">, open the introduction</span>
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
        {/* Below 640 px the three trays and the account chip become one swipeable row instead of
            four stacked ones: wrapping them cost 184 px of a 360 px screen's height, which is a
            fifth of the page before any lesson is read. `.action-tray` never shrinks (`index.css`),
            so the row scrolls rather than squeezing a tray into two labels. */}
        <div
          ref={actionsRef}
          className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-wrap sm:justify-end"
        >
          <HeaderTips scope={actionsRef} />
          {/* The swipeable half. The account chip is deliberately outside it: on a phone the row is
              wider than the screen, and the one control that says who you are should not be the one
              a learner has to discover by swiping. At `sm` this wrapper becomes `display: contents`,
              so the trays are direct children of the row again and the desktop layout is the one it
              always was. */}
          <div
            data-testid="tray-strip"
            // `contain: paint` is what keeps the strip's own overflow out of the page's: with a
            // `backdrop-filter` header above it, Chromium leaked 19 px of the hidden trays into the
            // document's scroll width, so a 320 px phone could swipe the whole page sideways.
            className="tray-strip flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5 [contain:paint] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:contents"
          >
          {/* Navigate: the two doors that are neither a lesson nor a setting. */}
          <div className="action-tray" role="group" aria-label="Navigate">
            {/* Home is a page, not a menu: one press from every screen, including Home itself. */}
            {onOpenHome && (
              <button
                onClick={onOpenHome}
                data-testid="btn-home"
                // The words are `hidden` below 1536 px; the name is the words, not a description of
                // them, so the icon-only control still says what it is (and WCAG 2.5.3 holds).
                aria-label="Home"
                data-tip="Home — today's step, your labs and your progress"
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
              data-tip="Search — lessons, tabs and commands (⌘K)"
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

          {/* Appearance, motion and sound: six preferences on one surface. Each is its own on/off,
              so a pressed button states a fact instead of standing for a step in a cycle. */}
          <div className="action-tray" role="group" aria-label="Appearance and sound">
            <button
              onClick={toggle}
              data-testid="btn-theme-toggle"
              aria-label={themeLabel(theme, fallback)}
              data-tip={`Theme — ${themeLabel(theme, fallback).toLowerCase()}`}
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
              data-tip={`Contrast — ${contrastHint(theme)}`}
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
              data-tip={`Paper — ${paperHint(theme)}`}
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
                data-testid="btn-focus-toggle"                aria-pressed={focus}
                aria-keyshortcuts="Meta+. Control+."
                aria-label="Focus"
                data-tip={`Focus — ${focusLabel(focus).toLowerCase()} (⌘.)`}
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
            {/* One switch for the moving drawings, on every screen. Off is also the cheap setting:
                each figure stops its frame loop instead of drawing frames nobody sees. */}
            <button
              onClick={motion.toggle}
              data-testid="btn-motion-toggle"
              aria-pressed={motion.on}
              aria-label={motionLabel(motion.on)}
              data-tip={motionLabel(motion.on)}
              title={motionHint(motion.on)}
              className="btn"
              style={pressed(motion.on)}
            >
              {motion.on ? (
                <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="hidden 2xl:inline">Motion</span>
            </button>
          </div>

          {/* Take it with you: four exports and the pair that puts it all back. */}
          <div className="action-tray" role="group" aria-label="Export and backup">
            <button
              onClick={downloadLearningLog}
              data-testid="btn-export-learning-log"
              aria-label="Export Learning Log (.json)"
              data-tip="Export learning log (.json) — opens, runs, failures and hints. It never leaves this browser."
              className="btn"
            >
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">Export Learning Log (.json)</span>
            </button>
            {/* Everything in this browser, out and back in: the two buttons report what they did. */}
            <BackupControls />
            {/* The third half of the same conversation. It opens a panel rather than erasing on the
                press, because "which part?" is the whole question a reset has to ask. */}
            <button
              onClick={() => setResetOpen(true)}
              data-testid="btn-open-reset"
              aria-haspopup="dialog"
              aria-label="Reset…"
              data-tip="Reset progress… — one part at a time, or all of it"
              className="btn"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden 2xl:inline">Reset…</span>
            </button>
            <React.Suspense fallback={null}>
              <ResetProgressLazy isOpen={resetOpen} onClose={() => setResetOpen(false)} />
            </React.Suspense>
            <button
              onClick={onExportPortfolio}
              data-testid="btn-export-portfolio"
              // The words are `hidden` below 1536 px, so the button is an icon with no name on most
              // screens. The label repeats the visible text rather than describing it: a name that
              // differs from what is drawn fails WCAG 2.5.3, and Lighthouse's `label-content-name-mismatch`
              // found exactly that in the sibling buttons this fix matches.
              aria-label="Export Progress (.md)"
              data-tip="Export progress (.md)"
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
              data-tip="1-page cheat sheet"
              className="btn"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--accent)' }}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">1-Page Cheat Sheet</span>
            </button>
          </div>

          </div>

          {/* Who you are here, and the only control in the header that says something about you: a
              filled chip with the avatar disc, the email (or the words a newcomer needs), and the
              chevron that says a panel opens. The visible text is the accessible name — an aria-label
              that reworded it would fail WCAG 2.5.3, which this header has been caught by before. */}
          <button
            onClick={onOpenAccount}
            data-testid="btn-account"
            // The same bubble as the trays rather than a native `title`, which is slow, unstyled
            // and would open a second tooltip beside this one.
            data-tip={
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
