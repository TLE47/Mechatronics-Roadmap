import type { RefObject } from 'react';
import {
  Activity,
  ArrowLeftRight,
  CheckSquare,
  CircleDot,
  Eye,
  GitCompare,
  History,
  Keyboard,
  Loader2,
  MoreHorizontal,
  OctagonX,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Square,
  Users,
  Wand2,
} from 'lucide-react';
import { LAYOUTS, type WorkspaceLayout } from '../../../workspaceLayout';
import { MAX_SHARE_URL } from '../../../shareLink';
import { VIM_LABEL, vimHint } from '../../../vimMode';
import type { PredictionRecord } from '../../../predictGate';
import type { DraftSnapshot } from '../../../draftHistory';
import type { Breakpoint } from '../../../editor/breakpoints';
import type { usePairSession } from '../../../usePairSession';

type PairSession = ReturnType<typeof usePairSession>;

interface RunnerToolbarProps {
  layout: WorkspaceLayout;
  onChooseLayout: (layout: WorkspaceLayout) => void;
  dockChoice: { label: string; title: string } | null;
  onFlipDock: () => void;
  isRunning: boolean;
  /** Whether this lesson's worker can pause at all (a session with shared memory). */
  pauseCapable: boolean;
  paused: boolean;
  onPause: () => void;
  onStop: () => void;
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  moreOpen: boolean;
  onToggleMore: () => void;
  onCloseMore: () => void;
  runButtonRef: RefObject<HTMLButtonElement | null>;
  onRun: () => void;
  predictRecord: PredictionRecord | null;
  onPredict: () => void;
  predictPaneOpen: boolean;
  isCurrentSelfMarked: boolean;
  onToggleSelfMarked: () => void;
  onResetStarter: () => void;
  onResetRuntime: () => void;
  onLoadSolution: () => void;
  onFormat: () => void;
  draftHistory: DraftSnapshot[];
  historyOpen: boolean;
  onToggleHistory: () => void;
  breakpoints: Breakpoint[];
  breakpointsOpen: boolean;
  onToggleBreakpoints: () => void;
  diffOpen: boolean;
  onToggleDiff: () => void;
  onShare: () => void;
  onPair: () => void;
  pair: PairSession;
  coEdit: { lesson: string; role: 'host' | 'guest'; remote: number } | null;
  vimOn: boolean;
  onToggleVim: () => void;
  watchOn: boolean;
  onToggleWatch: () => void;
}

/**
 * The run controls and the one place the rest of the actions fold into.
 *
 * The first screen keeps only what a learner does next: Pause and Stop while a program runs, More for
 * the rest, and Run as the single primary action. §3 of `docs/PLAN-2.1a.md` is the list;
 * `scripts/check_label_sizes.mjs` is the gate that keeps the folded controls legible once they are
 * open.
 */
export function RunnerToolbar({
  layout,
  onChooseLayout,
  dockChoice,
  onFlipDock,
  isRunning,
  pauseCapable,
  paused,
  onPause,
  onStop,
  moreButtonRef,
  moreOpen,
  onToggleMore,
  onCloseMore,
  runButtonRef,
  onRun,
  predictRecord,
  onPredict,
  predictPaneOpen,
  isCurrentSelfMarked,
  onToggleSelfMarked,
  onResetStarter,
  onResetRuntime,
  onLoadSolution,
  onFormat,
  draftHistory,
  historyOpen,
  onToggleHistory,
  breakpoints,
  breakpointsOpen,
  onToggleBreakpoints,
  diffOpen,
  onToggleDiff,
  onShare,
  onPair,
  pair,
  coEdit,
  vimOn,
  onToggleVim,
  watchOn,
  onToggleWatch,
}: RunnerToolbarProps) {
  return (
    <div data-testid="runner-toolbar" className="flex flex-wrap items-center gap-1.5">
      {/* The presets live on this card, not in the editor's own header: Read hides that header, and a
          control that disappears with the panel it governs is a trap. A shortcut with no control is a
          feature only its author knows, so the shortcut is printed on the button. */}
      {/* A phone gets one native select instead of four preset buttons and a dock sentence: the same
          four layouts, one row, and a 16 px control iOS will not zoom on. The buttons come back at
          `md`, where there is room to print their shortcut keys. */}
      <label className="mr-1 flex items-center md:hidden">
        <span className="sr-only">Workspace layout</span>
        <select
          data-testid="layout-select"
          value={layout}
          onChange={(event) => onChooseLayout(event.target.value as WorkspaceLayout)}
          className="min-h-[40px] rounded-lg border border-line bg-canvas px-1.5 text-[13px] font-mono text-body"
        >
          {LAYOUTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div
        role="group"
        aria-label="Layout"
        data-testid="layout-presets"
        className="mr-1 hidden items-center gap-1 md:flex"
      >
        {LAYOUTS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={layout === option.id}
            title={option.title}
            data-testid={`layout-${option.id}`}
            onClick={() => onChooseLayout(option.id)}
            className={`px-2 py-1 rounded text-[13px] font-mono cursor-pointer border transition-colors ${
              layout === option.id
                ? 'bg-accent text-inverse border-accent font-bold'
                : 'bg-canvas text-muted hover:text-ink border-line-soft'
            }`}
          >
            {option.label}
            {/* 90%, not 70%: at 70% the shortcut measured 3.28:1 on the light canvas and 4.0:1 on the
                pressed accent, so the de-emphasis broke the 4.5:1 floor.

                The key prints from 1360 px, where the editor card can hold the four keys plus dock,
                More, Run and Predict with room to spare. Below that they live in the titles and the
                `?` sheet: the 79 px the four keys cost is what pushed Predict onto a second row at
                1280 in a real browser, where a classic scrollbar leaves the card 10 px narrower than
                the overlay-scrollbar Chromium the suite runs in. */}
            <span className="ml-1 hidden opacity-90 min-[1360px]:inline">{option.shortcut}</span>
          </button>
        ))}
      </div>
      {/* Docking's one control, named for the panel it moves in the preset in force: "List → Right"
          in Study, "Results → Left" in Split. Write and Read show no button, because neither has a
          panel beside anything to move. */}
      {dockChoice && (
        <button
          type="button"
          data-testid="btn-dock-toggle"
          onClick={onFlipDock}
          title={dockChoice.title}
          // The visible words come first, then the sentence: a name that only describes what is
          // drawn fails WCAG 2.5.3, which is what Lighthouse's `label-content-name-mismatch` audit
          // named here.
          aria-label={`${dockChoice.label}: ${dockChoice.title}`}
          // The full sentence is a 127 px button. On a 1280 px window that was the width that
          // pushed Predict onto a second row, so the dock reads as its arrow until the card is wide
          // enough (2xl) to print the words beside it. The accessible name is the sentence either way.
          className="hidden px-2 py-1 rounded text-[13px] font-mono cursor-pointer border transition-colors bg-canvas text-muted hover:text-ink border-line-soft md:flex items-center gap-1.5"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden 2xl:inline">{dockChoice.label}</span>
        </button>
      )}
      {isRunning && pauseCapable && !paused && (
        <button
          onClick={onPause}
          data-testid="btn-pause-execution"
          title="Stop at the next line of your file, without losing the session"
          className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
        >
          <Pause className="w-3.5 h-3.5" />
          <span>Pause</span>
        </button>
      )}
      {isRunning && (
        <button
          onClick={onStop}
          data-testid="btn-stop-execution"
          className="px-3 py-1.5 rounded-lg text-[13px] font-mono font-bold bg-rose hover:bg-rose-strong text-inverse flex items-center gap-1.5 cursor-pointer"
        >
          <OctagonX className="w-3.5 h-3.5" />
          <span>Stop</span>
        </button>
      )}
      <button
        type="button"
        ref={moreButtonRef}
        onClick={onToggleMore}
        aria-expanded={moreOpen}
        aria-controls="toolbar-more"
        data-testid="btn-more"
        aria-label="More actions"
        title="Format with Black, history, diff, reset, sharing, pairing and editor preferences"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer transition-colors ${
          moreOpen
            ? 'text-accent border-accent/60 bg-canvas'
            : 'text-body border-line bg-canvas hover:bg-raise'
        }`}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">More ⋯</span>
      </button>
      <button
        onClick={onRun}
        disabled={isRunning}
        ref={runButtonRef}
        data-testid="btn-run-verify"
        data-sound="primary"
        data-tour="run-button"
        title="Run & Verify Output — ⌘↵ / Ctrl+↵ runs from anywhere on this screen"
        className="btn btn-primary ml-1 px-3.5 py-2 text-[13px] font-bold"
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{isRunning ? 'Running in Worker...' : 'Run & Verify Output'}</span>
        <span className="sm:hidden">{isRunning ? 'Running…' : 'Run'}</span>
        {!isRunning && <span className="kbd ml-0.5 hidden sm:inline-flex">⌘↵</span>}
      </button>
      {/* The gate's own door, beside Run: the question also opens by itself on a lesson's first Run,
          and this is how a learner rereads the verdict or commits a guess before pressing it. It used
          to be folded into More, which is the one place a convenience control is not convenient. */}
      <button
        onClick={onPredict}
        aria-expanded={predictPaneOpen}
        aria-controls="pane-predict"
        data-testid="btn-predict"
        // The label is the same width in every state on purpose. " · skipped" added 78 px, and at
        // 1280 the Study chooser leaves the card 800 px: that suffix was the difference between
        // Predict beside Run and Predict alone on a second row. The state lives in the name and the
        // tooltip, and the gate prints it in full when opened.
        title={
          predictRecord
            ? `Predict first: this lesson was ${predictRecord.skipped ? 'skipped' : 'answered'} — open it to change the call`
            : 'Predict first: commit to what the code will print, then run it'
        }
        aria-label={`Predict${predictRecord ? (predictRecord.skipped ? ' (skipped)' : ' (answered)') : ''}: commit to what the code will print, then run it`}
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
          predictPaneOpen ? 'text-amber border-amber/60' : 'text-body border-line'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Predict</span>
      </button>
      <div
        id="toolbar-more"
        role="group"
        aria-label="More actions"
        data-testid="toolbar-more"
        hidden={!moreOpen}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          onCloseMore();
        }}
        // One press is one action, so the panel folds itself away: leaving it open would shift the
        // editor down while the learner is reading the answer to what they pressed, and would hide
        // the row they came from. Focus goes back to More, so a keyboard user is never dropped into
        // the document.
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest('button')) return;
          onCloseMore();
        }}
        className="order-last w-full rounded-xl border border-line bg-panel p-2.5"
      >
        <p className="px-1 pb-2 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
          More actions
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onToggleSelfMarked}
            data-testid="btn-toggle-lesson-complete"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer ${
              isCurrentSelfMarked
                ? 'bg-accent/20 border-accent text-accent'
                : 'bg-canvas border-line text-body hover:border-accent'
            }`}
          >
            {isCurrentSelfMarked ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            <span>{isCurrentSelfMarked ? 'Self-Marked Complete' : 'Self-Mark Complete'}</span>
          </button>
          <button
            onClick={onResetStarter}
            data-testid="btn-reset-starter"
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Starter</span>
          </button>
          <button
            onClick={onResetRuntime}
            data-testid="btn-reset-runtime"
            title="Terminate and restart the background Python Web Worker without losing editor code"
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-accent border border-accent/40 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Runtime</span>
          </button>
          <button
            onClick={onLoadSolution}
            data-testid="btn-load-solution"
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-amber border border-amber/40 flex items-center gap-1.5 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Load Solution</span>
          </button>
          {/* Format is a text action, not a run one: it tidies the file in place, and the interpreter
              installs the formatter on the first press. Disabled while a program is running or
              parked, because the worker is one thread. */}
          <button
            onClick={onFormat}
            disabled={isRunning || paused}
            data-testid="btn-format"
            title="Re-indent and tidy this file with Black (installs on the first press, then stays in this session)"
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Format</span>
          </button>
          <button
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
            aria-controls="draft-history"
            data-testid="btn-draft-history"
            title="Every run files the code it started from, with its verdict, so a version that worked is one click away"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              historyOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>History{draftHistory.length ? ` (${draftHistory.length})` : ''}</span>
          </button>
          {/* The dots the gutter is drawing, and the condition each one waits for. Always present,
              not only once something is armed: a learner who has never clicked the gutter has no
              other way to find out that a breakpoint can be narrowed. */}
          <button
            onClick={onToggleBreakpoints}
            aria-expanded={breakpointsOpen}
            aria-controls="breakpoint-panel"
            data-testid="btn-breakpoints"
            title="Every dot on the gutter, with the condition that lets the run stop on it"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              breakpointsOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Breakpoints{breakpoints.length ? ` (${breakpoints.length})` : ''}</span>
          </button>
          <button
            onClick={onToggleDiff}
            aria-expanded={diffOpen}
            aria-controls="code-diff"
            data-testid="btn-diff"
            title="What you changed: your code against the starter, line by line"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              diffOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Diff</span>
          </button>
          {/* The one thing a stuck learner can send a person: this lesson and this code. The code
              rides in the URL fragment, so it never reaches the host — and it is base64, not
              encryption, which the title says rather than implying a privacy it lacks. */}
          <button
            onClick={onShare}
            data-testid="btn-share-attempt"
            title={`Copy a link to this lesson with your code in it (${MAX_SHARE_URL} characters max). The code rides in the link's fragment, encoded — not encrypted — so send it only where you would send the file.`}
            className="px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise text-body border border-line flex items-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>
          {/* Pair study, beside the send: one session, two people, no server — the attempt travels
              over a direct channel and arrives as a card, not as an edit. */}
          <button
            onClick={onPair}
            data-testid="btn-pair-open"
            title="Pair study: connect to another workbench directly and pass attempts back and forth"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              pair.state === 'connected' ? 'text-emerald border-emerald/60' : 'text-body border-line'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>
              {coEdit
                ? 'Pair · co-editing'
                : `Pair${pair.state === 'connected' && pair.peer ? ` · ${pair.peer}` : ''}`}
            </span>
          </button>
          {/* Vim keys: a reading preference like watch mode, remembered the same way. Off by default,
              because normal mode reads a beginner's first `i` as a command and the editor would look
              broken rather than unusual (`app/src/vimMode.ts`). */}
          <button
            onClick={onToggleVim}
            aria-pressed={vimOn}
            data-testid="btn-vim"
            title={vimHint(vimOn)}
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              vimOn ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{VIM_LABEL}</span>
          </button>
          <button
            onClick={onToggleWatch}
            aria-pressed={watchOn}
            data-testid="btn-watch"
            title="Watch mode: after a failed check, re-run 1.5 s after you stop typing"
            className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono bg-canvas hover:bg-raise border flex items-center gap-1.5 cursor-pointer ${
              watchOn ? 'text-emerald border-emerald/60' : 'text-body border-line'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{watchOn ? 'Watching' : 'Watch'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
