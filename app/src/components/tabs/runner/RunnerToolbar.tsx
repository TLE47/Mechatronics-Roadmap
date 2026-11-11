import { useRef, useState, type RefObject } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Bug,
  CornerDownRight,
  CornerUpLeft,
  SkipForward,
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
import { HeaderTips } from '../../HeaderTips';
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
  /** The tab mirrors this boolean for its sheet accounting; the panel itself is the toolbar's. */
  onMoreOpenChange: (open: boolean) => void;
  onShowTrace: () => void;
  /**
   * The interpreter's own answers while a run is parked (`PausedBar`'s modes): 2 continue,
   * 3 step over, 6 step into, 7 step out. Absent when this runner cannot pause.
   */
  onAnswerPause?: (mode: 2 | 3 | 4 | 6 | 7) => void;
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
  onMoreOpenChange,
  onShowTrace,
  onAnswerPause,
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
  // The More panel is the toolbar's own: its open state and the button focus returns to never leave
  // this component. The tab keeps a mirror for its sheet accounting, nothing else.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    onMoreOpenChange(next);
  };
  const closeMore = () => {
    setMoreOpen(false);
    onMoreOpenChange(false);
    moreButtonRef.current?.focus({ preventScroll: true });
  };
  // The folded panel's controls are tiles: icon over a 10.5 px word, so thirteen tools read as a
  // compact block of four rows instead of one long ribbon. The button itself keeps the 13 px floor
  // `scripts/check_label_sizes.mjs` measures; only the word under the icon is small.
  const tile =
    'flex min-w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[13px] font-mono cursor-pointer transition-colors';
  const tileLabel = 'text-[10.5px] leading-tight text-center';
  return (
    <div ref={toolbarRef} data-testid="runner-toolbar" className="flex flex-wrap items-center gap-1.5">
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
        ref={moreButtonRef}                onClick={toggleMore}
        aria-expanded={moreOpen}
        aria-controls="toolbar-more"
        data-testid="btn-more"
        aria-label="More actions"
        data-tip="Debugger, format with Black, history, diff, reset, sharing, pairing and editor preferences"
        className={`px-2.5 py-1.5 rounded-lg text-[13px] font-mono border flex items-center gap-1.5 cursor-pointer transition-colors ${
          moreOpen
            ? 'text-accent border-accent/60 bg-canvas'
            : 'text-body border-line bg-canvas hover:bg-raise'
        }`}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">More ⋯</span>
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
          closeMore();
        }}
        // A press runs its action and leaves the panel open: the next tool is usually the one beside
        // it (a breakpoint after a trace, a format after a reset), and a panel that folds under the
        // pointer turns every second press into a re-open. Escape, a press on More, and a press on a
        // control outside the panel still close it.
        className="order-last w-full rounded-xl border border-line bg-panel p-2.5"
      >
        <p className="px-1 pb-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
          More actions
        </p>
        {/* Icon over a 10.5 px word: the folded controls are a tray of tools, so they read as one
            compact block of tiles rather than a ribbon of thirteen full-width buttons. The button
            itself keeps the 13 px floor the label gate measures; only the word is small. */}
        <div className="flex flex-wrap items-start gap-1.5">
          <button
            onClick={onToggleSelfMarked}
            data-testid="btn-toggle-lesson-complete"
            data-tip={
              isCurrentSelfMarked
                ? 'Self-Marked Complete — press to untick this lesson on this device'
                : 'Self-Mark Complete — record this lesson as finished without the graded check'
            }
            className={`${tile} ${
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
            <span className={tileLabel}>{isCurrentSelfMarked ? 'Self-Marked' : 'Self-Mark'}</span>
          </button>
          <button
            onClick={onResetStarter}
            data-testid="btn-reset-starter"
            data-tip="Reset Starter — put this lesson's starter code back, discarding your edits to the file"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className={tileLabel}>Reset Starter</span>
          </button>
          <button
            onClick={onResetRuntime}
            data-testid="btn-reset-runtime"
            data-tip="Terminate and restart the background Python Web Worker without losing editor code"
            className={`${tile} bg-canvas hover:bg-raise text-accent border-accent/40`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className={tileLabel}>Reset Runtime</span>
          </button>
          <button
            onClick={onLoadSolution}
            data-testid="btn-load-solution"
            data-tip="Load Solution — replace the editor with the worked solution for this lesson"
            className={`${tile} bg-canvas hover:bg-raise text-amber border-amber/40`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className={tileLabel}>Load Solution</span>
          </button>
          {/* Format is a text action, not a run one: it tidies the file in place, and the interpreter
              installs the formatter on the first press. Disabled while a program is running or
              parked, because the worker is one thread. */}
          <button
            onClick={onFormat}
            disabled={isRunning || paused}
            data-testid="btn-format"
            data-tip="Re-indent and tidy this file with Black (installs on the first press, then stays in this session)"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span className={tileLabel}>Format</span>
          </button>
          <button
            onClick={onToggleHistory}
            aria-expanded={historyOpen}
            aria-controls="draft-history"
            data-testid="btn-draft-history"
            data-tip="Every run files the code it started from, with its verdict, so a version that worked is one click away"
            className={`${tile} bg-canvas hover:bg-raise border ${
              historyOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className={tileLabel}>
              History{draftHistory.length ? ` (${draftHistory.length})` : ''}
            </span>
          </button>
          <button
            onClick={onToggleDiff}
            aria-expanded={diffOpen}
            aria-controls="code-diff"
            data-testid="btn-diff"
            data-tip="What you changed: your code against the starter, line by line"
            className={`${tile} bg-canvas hover:bg-raise border ${
              diffOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span className={tileLabel}>Diff</span>
          </button>
          {/* The one thing a stuck learner can send a person: this lesson and this code. The code
              rides in the URL fragment, so it never reaches the host — and it is base64, not
              encryption, which the title says rather than implying a privacy it lacks. */}
          <button
            onClick={onShare}
            data-testid="btn-share-attempt"
            data-tip={`Copy a link to this lesson with your code in it (${MAX_SHARE_URL} characters max). The code rides in the link's fragment, encoded — not encrypted — so send it only where you would send the file.`}
            className={`${tile} bg-canvas hover:bg-raise text-body border-line`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className={tileLabel}>Share</span>
          </button>
          {/* Pair study, beside the send: one session, two people, no server — the attempt travels
              over a direct channel and arrives as a card, not as an edit. */}
          <button
            onClick={onPair}
            data-testid="btn-pair-open"
            data-tip="Pair study: connect to another workbench directly and pass attempts back and forth"
            className={`${tile} bg-canvas hover:bg-raise border ${
              pair.state === 'connected' ? 'text-emerald border-emerald/60' : 'text-body border-line'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className={tileLabel}>
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
            data-tip={vimHint(vimOn)}
            className={`${tile} bg-canvas hover:bg-raise border ${
              vimOn ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className={tileLabel}>{VIM_LABEL}</span>
          </button>
          <button
            onClick={onToggleWatch}
            aria-pressed={watchOn}
            data-testid="btn-watch"
            data-tip="Watch mode: after a failed check, re-run 1.5 s after you stop typing"
            className={`${tile} bg-canvas hover:bg-raise border ${
              watchOn ? 'text-emerald border-emerald/60' : 'text-body border-line'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className={tileLabel}>{watchOn ? 'Watching' : 'Watch'}</span>
          </button>
        </div>

        {/* The debugger is a set of tools, not one button: the heading names the group and the three
            controls under it are the ones that read a finished run. They used to be scattered through
            the general actions, where Trace and Breakpoints looked like formatting choices. */}
        <div
          data-testid="debugger-menu"
          role="group"
          aria-label="Debugger tools"
          className="mt-2.5 border-t pt-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="px-1 pb-1.5 text-[11px] font-mono uppercase tracking-[0.08em] text-faint">
            Debugger tools
          </p>
        <div className="flex flex-wrap items-start gap-1.5">
          {/* Like an IDE's step toolbar: always in the menu, disabled until there is a parked frame
              to step. A control that only appears while paused is a control a learner cannot find
              when they are looking for it — and its tooltip is what says why it is greyed. */}
          <button
            onClick={() => onAnswerPause?.(2)}
            disabled={!paused}
            data-testid="btn-debug-continue"
            data-tip="Continue: run on to the end, the next breakpoint, or the next Pause"
            className={`${tile} bg-canvas hover:bg-raise text-emerald border-emerald/40 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Play className="w-3.5 h-3.5" />
            <span className={tileLabel}>Continue</span>
          </button>
          <button
            onClick={() => onAnswerPause?.(3)}
            disabled={!paused}
            data-testid="btn-debug-step-over"
            data-tip="Step over: run this line and stop at the next one in this file"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span className={tileLabel}>Step over</span>
          </button>
          <button
            onClick={() => onAnswerPause?.(6)}
            disabled={!paused}
            data-testid="btn-debug-step-into"
            data-tip="Step into: follow the call on this line into the function it calls"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <CornerDownRight className="w-3.5 h-3.5" />
            <span className={tileLabel}>Step in</span>
          </button>
          <button
            onClick={() => onAnswerPause?.(7)}
            disabled={!paused}
            data-testid="btn-debug-step-out"
            data-tip="Step out: finish this function and stop in its caller"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <CornerUpLeft className="w-3.5 h-3.5" />
            <span className={tileLabel}>Step out</span>
          </button>
          <button
            onClick={() => (document.querySelector('[data-testid="watch-input"]') as HTMLInputElement | null)?.focus()}
            disabled={!paused}
            data-testid="btn-debug-watch"
            data-tip="Watch: pin an expression and read it at every pause in this frame"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className={tileLabel}>Watch</span>
          </button>
          <button
            onClick={() => {
              onChooseLayout('debug');
              onShowTrace();
            }}
            data-testid="btn-debugger"
            data-tip="Debug layout — open the Debug workspace and replay the last run line by line, with every variable's value"
            className={`${tile} bg-canvas hover:bg-raise text-accent border-accent/50`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span className={tileLabel}>Debug layout</span>
          </button>
          {/* The dots the gutter is drawing, and the condition each one waits for. Always present,
              not only once something is armed: a learner who has never clicked the gutter has no
              other way to find out that a breakpoint can be narrowed. */}
          <button
            onClick={onShowTrace}
            data-testid="btn-trace"
            data-tip="Replay the last run line by line, with the value every variable held at each step"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span className={tileLabel}>Trace</span>
          </button>
          <button
            onClick={onToggleBreakpoints}
            aria-expanded={breakpointsOpen}
            aria-controls="breakpoint-panel"
            data-testid="btn-breakpoints"
            data-tip="Every dot on the gutter, with the condition that lets the run stop on it"
            className={`${tile} bg-canvas hover:bg-raise border ${
              breakpointsOpen ? 'text-accent border-accent/60' : 'text-body border-line'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span className={tileLabel}>
              Breakpoints{breakpoints.length ? ` (${breakpoints.length})` : ''}
            </span>
          </button>
          {/* The rest of an IDE's run row: Pause, Stop and Restart, each enabled only where the
              interpreter can honour it. They sit beside the step tools so the whole run state is in
              one place while a program is parked. */}
          <button
            onClick={onPause}
            disabled={!isRunning || !pauseCapable || paused}
            data-testid="btn-debug-pause"
            data-tip="Pause: stop at the next line of your file without losing the session"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Pause className="w-3.5 h-3.5" />
            <span className={tileLabel}>Pause</span>
          </button>
          <button
            onClick={onStop}
            disabled={!isRunning}
            data-testid="btn-debug-stop"
            data-tip="Stop: end this run; the editor keeps your code"
            className={`${tile} bg-canvas hover:bg-raise text-rose border-rose/40 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <OctagonX className="w-3.5 h-3.5" />
            <span className={tileLabel}>Stop</span>
          </button>
          <button
            onClick={onResetRuntime}
            disabled={isRunning}
            data-testid="btn-debug-restart"
            data-tip="Restart: terminate and start a fresh interpreter (code untouched)"
            className={`${tile} bg-canvas hover:bg-raise text-body border-line disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className={tileLabel}>Restart</span>
          </button>
        </div>
        </div>
      </div>
      <HeaderTips scope={toolbarRef} always />
    </div>
  );
}
