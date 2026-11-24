import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from 'react';
import { Blocks, Code2, Keyboard } from 'lucide-react';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { MobilePythonKeyboard } from '../../MobilePythonKeyboard';
import { usePhoneTypingLayer } from './usePhoneTypingLayer';

import type { PythonBlockEditorHandle } from '../../../pythonBlocks/PythonBlockEditor';
import { MAIN_FILE_NAME, type LessonFile } from '../../../lessonFiles';
import { FIELD_KEYBOARD_OPEN_EVENT } from '../../../keyboard/fieldTarget';
import type { AnalysisSession } from '../../../analysisClient';
import { readBlockSettings, writeBlockSettings, type BlockMode } from '../../../pythonBlocks/settings.ts';

// The visual workspace is its own chunk: a learner who never leaves the code editor does not fetch
// the model, the toolbox or the cards, and the editor's first paint does not wait for them.
const PythonBlockEditor = lazy(() =>
  import('../../../pythonBlocks/PythonBlockEditor').then((module) => ({
    default: module.PythonBlockEditor,
  }))
);

/**
 * Was the caret lost to a press on the keys themselves?
 *
 * Keys cancel `pointerdown`, but a finger can land on the gap between two caps, and iOS can take
 * focus for a button anyway. The keyboard stamps every press; a blur within that press's own
 * moment is not the learner leaving the editor, so the keys must stay up.
 */
function keyboardPressedRecently(): boolean {
  const section = document.querySelector(
    '[data-testid="mobile-keyboard-shell"] [data-testid="python-keyboard"]'
  );
  const pressedAt = Number(section?.getAttribute('data-pressed-at') ?? 0);
  return pressedAt > 0 && Date.now() - pressedAt < 400;
}

/** The draft and editor handle the main pane draws. Structurally the card's `draft`. */
interface CodePaneDraft {
  code: string;
  commitCode: (next: string) => void;
  mainEditorRef: RefObject<PythonEditorHandle | null>;
  helperEditorRef: RefObject<PythonEditorHandle | null>;
  helperFiles: LessonFile[];
  openHelper: string | null;
  pendingJump: { file: string; line: number; lesson: string } | null;
  vim: { on: boolean; onMode: (mode: string) => void };
  lesson: { id: string };
  onSliderCommit: () => void;
  getAnalysis?: () => AnalysisSession | null;
  onGoToDefinition?: (name: string) => void;
  onRunCell?: (line: number) => void;
  breakpoints?: {
    entries: { line: number; condition: string }[];
    onToggle: (line: number) => void;
    onMoved: (entries: { line: number; condition: string }[]) => void;
  };
  editorTestId?: string;
}

/**
 * The main pane: the learner's `main.py`, drawn either as Python Code or as visual blocks
 * (`runner/EditorCodePane.tsx`).
 *
 * **Python Code** is the open default, and it is the CodeMirror editor every lesson already had:
 * the toggle adds a door, it does not move the room. **Visual** is the block workspace in
 * `app/src/pythonBlocks/`, loaded on first use; both draw the same `code` prop and both write it
 * through `commitCode`, so a draft, a check, Run and a shared document cannot tell which face was
 * used. The choice is remembered on this device beside the editor's other preferences.
 *
 * A helper file has no toggle: it is a read-only module the lesson imports, not a program to
 * construct. On a phone both faces share one keyboard (`components/MobilePythonKeyboard.tsx`),
 * drawn once at the bottom of this pane: the code face sends its keys to CodeMirror's caret, the
 * visual face sends them to the block field that has it, and the key caps, Fn, 123 and Done are the
 * same in both. The block face's adapter is the `PythonBlockEditorHandle` below.
 */
export function EditorCodePane({
  draft,
  isPhone,
  deferPhoneEditor,
  coEdit,
  collabNotice,
  peerLabel,
  runLine,
  errorLine,
  tooltipsEnabled,
}: {
  draft: CodePaneDraft;
  isPhone: boolean;
  deferPhoneEditor: boolean;
  coEdit: { lesson: string; remote: number } | null;
  collabNotice: string | null;
  peerLabel?: string | null;
  /** The line the open Trace tab is on, marked in the code. */
  runLine?: number | null;
  errorLine?: { line: number; message: string } | null;
  tooltipsEnabled?: boolean;
}) {
  const {
    code,
    commitCode,
    mainEditorRef,
    helperEditorRef,
    helperFiles,
    openHelper,
    pendingJump,
    vim: { on: vimOn, onMode: onVimMode },
    lesson: { id: lessonId },
    onSliderCommit,
    getAnalysis,
    onGoToDefinition,
    onRunCell,
    breakpoints,
    editorTestId = 'editor-main',
  } = draft;
  const [mode, setMode] = useState<BlockMode>(() => readBlockSettings().mode);
  // Once Visual has been opened, both faces stay mounted: CodeMirror keeps its document, caret and
  // scroll (and the co-editor's handle), and the block workspace keeps its history and selection.
  // The lazy chunk is still fetched only by a learner who actually chooses Visual.
  // `mode` is written only by the saved initializer or by `chooseMode`; the latter sets
  // `visualOpened` in the same event, so an effect watching `mode` would only repeat that write.
  const [visualOpened, setVisualOpened] = useState(mode === 'visual');
  // The shared keyboard is open on a phone from the start, because that is how a phone writes
  // Python. `native` means the OS keyboard owns the bottom of the screen and the custom keys are
  // folded away; the mode bar's key button is the way back from both that and Done.
  const [keyboardOpen, setKeyboardOpen] = useState(isPhone);
  const [keyboardNative, setKeyboardNative] = useState(false);
  // A press on the mode bar holds the typing layout until its click has landed. Without the hold,
  // a tap from the OS keyboard blurs the editor first, the native state falls, the header comes
  // back and the button moves out from under the finger before the click is delivered.
  const [modeBarHolding, setModeBarHolding] = useState(false);
  // Custom is the phone's resting mode, not only its open state: with `inputmode=none` already on
  // the editing surface, tapping code or a block field raises *this* keyboard instead of the OS
  // one. Native is the one state that gives the OS keyboard the screen back.
  const keyboardMode = !isPhone ? 'off' : keyboardNative ? 'native' : 'custom';
  const phoneTyping =
    isPhone && mode === 'code' && (keyboardOpen || keyboardNative || modeBarHolding);
  const nativeRef = useRef(keyboardNative);
  nativeRef.current = keyboardNative;
  // The blur that dismisses the OS keyboard on the way back to the Python keys is not the learner
  // leaving the editor: it must not fold the keys that are being reopened under it.
  const nativeReturnBlurRef = useRef(false);
  // A press on the mode bar is not a departure from the editor either, but some phone browsers
  // report that blur with no `relatedTarget` at all. The press is remembered long enough for its
  // own click to run, so the keys it is switching stay up.
  const modeBarPressRef = useRef(false);
  const modeBarPressTimerRef = useRef(0);
  const releaseModeBarHold = () => {
    window.clearTimeout(modeBarPressTimerRef.current);
    modeBarPressRef.current = false;
    setModeBarHolding(false);
  };
  const noteModeBarPress = () => {
    modeBarPressRef.current = true;
    // Hold an already-active typing layer; do not summon one from a closed keyboard, or the bar
    // jumps to the top under the press and the click lands nowhere. When the keys are closed, the
    // click opens them and the layer starts after it, not under the finger.
    // Visual keeps the same rule: a field's caret is holding the keys, and the bar's press must not
    // fold them (and move the bar) before its own click has landed.
    if (keyboardOpen || phoneTyping) setModeBarHolding(true);
    window.clearTimeout(modeBarPressTimerRef.current);
    modeBarPressTimerRef.current = window.setTimeout(() => {
      modeBarPressRef.current = false;
      setModeBarHolding(false);
    }, 600);
  };
  // The viewport height when Native was chosen, before the OS keyboard can change it. Android
  // shrinks `innerHeight` with the visual viewport, so their difference is not a keyboard signal.
  const nativeViewportBaseRef = useRef(0);
  const visualRef = useRef<PythonBlockEditorHandle | null>(null);
  const modeBarRef = useRef<HTMLDivElement | null>(null);
  const keyboardShellRef = useRef<HTMLDivElement | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // The height of the band the code editor fills on a phone: from the mode bar's bottom edge to the
  // top of the Study bar that rides on the keys. Null off a phone, in Visual, or while the OS
  // keyboard owns the screen, where the page keeps its natural height.
  const [editorBand, setEditorBand] = useState<number | null>(null);

  /**
   * The code editor's caret is the keyboard's switch.
   *
   * A focus opens the custom keys — unless the OS keyboard owns the screen, in which case a tap on
   * the code must not silently swap keyboards under the finger. On a blur, what *takes* the focus
   * decides: the workbench, the mode bar, the keyboard itself and a sheet all keep the keys; the
   * lesson text, another tab or a tap on nothing close them. `relatedTarget` is read from the blur
   * itself rather than from a deferred `activeElement` check, because a keyboard control (a
   * lighting slider, say) can be unmounted by the very press that focused it; a timer would then
   * see the page's body and fold the keys the learner is still using.
   */
  const onCodeFocusChange = (focused: boolean, related: EventTarget | null) => {
    if (!isPhone) return;
    if (focused) {
      if (!nativeRef.current) setKeyboardOpen(true);
      return;
    }
    // The native handoff lasts only while the caret does. When the OS keyboard's field is left,
    // the next focus is the custom keyboard's again instead of a one-way trip.
    if (nativeRef.current) setKeyboardNative(false);
    if (nativeReturnBlurRef.current) {
      nativeReturnBlurRef.current = false;
      return;
    }
    if (modeBarPressRef.current) return;
    if (keyboardPressedRecently()) return;
    if (
      related instanceof Element &&
      related.closest(
        '[data-testid="mobile-keyboard-shell"], [data-testid="editor-mode-bar"], [data-pane-main-body], [role="dialog"]'
      )
    ) {
      return;
    }
    setKeyboardOpen(false);
  };

  // The keyboard is fixed, so the pane reserves its height at its end: without that space the last
  // lines of the editor could never be scrolled out from under it. The same measurement is the
  // "actually on screen" flag `index.css` reads to lift the Study bar onto the keys (a pane mounted
  // for another tab, or for the Lesson surface, measures 0 and leaves the bar on the edge). The
  // shell stays mounted while it is folded away, so its height is measured even then — the reserved
  // spacer is what collapses, and it can slide back with the keys.
  useEffect(() => {
    const shell = keyboardShellRef.current;
    if (!isPhone || !shell) {
      setKeyboardHeight(0);
      return;
    }
    const measure = () => setKeyboardHeight(shell.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [isPhone, keyboardOpen, mode, deferPhoneEditor, openHelper]);

  // The layer's page geometry lives in its own hook: hide the chrome, keep the mode bar at the
  // top, and measure the band the keys leave.
  usePhoneTypingLayer({
    active: Boolean(phoneTyping),
    keyboardNative,
    keyboardHeight,
    modeBarRef,
    deferPhoneEditor,
    openHelper,
    setEditorBand,
  });

  // The Study bar is outside this pane, so the one number it needs travels as a custom property:
  // the bar's `bottom` is this height, which puts it on top of the keys rather than under them.
  useEffect(() => {
    if (!isPhone || !keyboardOpen || keyboardHeight === 0) {
      document.body.style.removeProperty('--mobile-keyboard-height');
      return;
    }
    document.body.style.setProperty('--mobile-keyboard-height', `${keyboardHeight}px`);
    return () => {
      document.body.style.removeProperty('--mobile-keyboard-height');
    };
  }, [isPhone, keyboardOpen, keyboardHeight]);

  // The site's keyboard for page fields (`components/PhoneFieldKeyboard.tsx`) takes the bottom edge
  // for a search box, a note or a sheet field. The editor's keys fold when it does — this pane stays
  // mounted, so the document, caret and undo history are untouched, and the editor's own focus
  // handler raises the keys again when the caret comes back.
  useEffect(() => {
    if (!isPhone) return;
    const fold = () => {
      setKeyboardNative(false);
      setKeyboardOpen(false);
    };
    window.addEventListener(FIELD_KEYBOARD_OPEN_EVENT, fold);
    return () => window.removeEventListener(FIELD_KEYBOARD_OPEN_EVENT, fold);
  }, [isPhone]);

  // A phone's OS keyboard is a viewport: when it rises the visual viewport shrinks, and when the
  // learner puts it away the viewport grows back while the caret stays put. That is the moment the
  // custom keys return instead of leaving a focused editor with no keyboard at all. The baseline is
  // the height remembered when Native was chosen, not `innerHeight`: on Android both shrink together,
  // so comparing them would never see the OS keyboard either rise or go away.
  useEffect(() => {
    if (!isPhone || !keyboardNative) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const baseline = nativeViewportBaseRef.current || viewport.height;
    let shrunk = false;
    const update = () => {
      const hidden = baseline - viewport.height;
      if (hidden > 120) {
        shrunk = true;
        return;
      }
      if (!shrunk || hidden > 40) return;
      shrunk = false;
      const active = document.activeElement;
      if (!(active instanceof Element) || !active.closest('.cm-editor, [data-block-id]')) return;
      setKeyboardNative(false);
      setKeyboardOpen(true);
    };
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, [isPhone, keyboardNative]);

  const chooseMode = (next: BlockMode) => {
    if (next === mode) {
      releaseModeBarHold();
      return;
    }
    setMode(next);
    if (next === 'visual') setVisualOpened(true);
    writeBlockSettings({ mode: next });
    // The keyboard follows the caret, not the face: Visual opens with it folded (a field opens it),
    // Code opens with it showing, which is the face it was first useful on.
    setKeyboardNative(false);
    setKeyboardOpen(next === 'code');
    if (next === 'visual') mainEditorRef.current?.blur();
  };

  const openNativeKeyboard = () => {
    // Remember the resting viewport before the OS keyboard has a chance to shrink it.
    nativeViewportBaseRef.current = window.visualViewport?.height ?? window.innerHeight;
    // While the tap is still a gesture, hand the focus to the real editor: the property change that
    // hides the custom keys renders afterwards, and a focus taken then may not raise the OS keyboard.
    if (mode === 'visual') visualRef.current?.openNativeKeyboard();
    else mainEditorRef.current?.openNativeKeyboard();
    setKeyboardNative(true);
    setKeyboardOpen(false);
  };

  const closeKeyboard = () => {
    setKeyboardNative(false);
    setKeyboardOpen(false);
    if (mode === 'visual') visualRef.current?.blurField();
    else mainEditorRef.current?.blur();
  };

  const toggleKeyboard = () => {
    releaseModeBarHold();
    // Native feels closed (the custom keys are gone) but the way back has to open them, not run
    // the close a third time. Only a showing, non-native keyboard closes on this press.
    if (keyboardOpen && !keyboardNative) {
      closeKeyboard();
      return;
    }
    const fromNative = keyboardNative;
    setKeyboardNative(false);
    setKeyboardOpen(true);
    if (!fromNative) return;
    // The OS keyboard is up because the editor has focus. Once `inputmode=none` is back on the
    // surface, the blur is what makes a phone put its own keyboard away; the focus after it keeps
    // the caret where the learner left it.
    window.setTimeout(() => {
      nativeReturnBlurRef.current = true;
      if (mode === 'visual') {
        visualRef.current?.blurField();
        visualRef.current?.focusField();
      } else {
        mainEditorRef.current?.blur();
        mainEditorRef.current?.focus();
      }
      // The focus normally opens the custom keys again; stating it after the blur, rather than
      // relying on that event, keeps the return from depending on the editor's focus timing.
      setKeyboardOpen(true);
      window.setTimeout(() => {
        nativeReturnBlurRef.current = false;
      }, 350);
    }, 40);
  };

  // One keyboard, two adapters: every key asks the face on screen. The code face's adapter is the
  // editor handle (CodeMirror commands own the document), the visual face's is the block handle.
  const on = (codeAction: () => void, visualAction: () => void) =>
    mode === 'visual' ? visualAction() : codeAction();
  const keepEditingFocus = () => {
    const active = document.activeElement;
    if (active instanceof Element && active.closest('.cm-editor, [data-block-id]')) return;
    if (mode === 'visual') visualRef.current?.focusField();
    else mainEditorRef.current?.focus();
  };
  const keyboardActions = {
    onInsertText: (text: string) =>
      on(() => mainEditorRef.current?.insertText(text), () => visualRef.current?.insertText(text)),
    onBackspace: () =>
      on(() => mainEditorRef.current?.backspace(), () => visualRef.current?.backspace()),
    onIndent: () => on(() => mainEditorRef.current?.indent(), () => visualRef.current?.indent()),
    onDedent: () => on(() => mainEditorRef.current?.dedent(), () => visualRef.current?.dedent()),
    onNewLine: () =>
      on(
        () => mainEditorRef.current?.insertNewLine(),
        () => visualRef.current?.newStatement()
      ),
    onTab: () => on(() => mainEditorRef.current?.insertTab(), () => visualRef.current?.insertTab()),
    onUndo: () => on(() => mainEditorRef.current?.undo(), () => visualRef.current?.undo()),
    onRedo: () => on(() => mainEditorRef.current?.redo(), () => visualRef.current?.redo()),
    onDuplicate: () =>
      on(() => mainEditorRef.current?.duplicate(), () => visualRef.current?.duplicate()),
    onDelete: () =>
      on(() => mainEditorRef.current?.deleteLine(), () => visualRef.current?.deleteSelected()),
  };
  const openHelperFile = helperFiles.find((file) => file.name === openHelper) ?? null;

  return (
    <div data-pane-main-body className="flex min-h-0 flex-1 flex-col">
      {coEdit && (
        <p
          role="status"
          data-testid="coedit-status"
          className="border-b px-3 py-1.5 text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--emerald, var(--accent))', backgroundColor: 'var(--bg)' }}
        >
          Co-editing {coEdit.lesson} with {peerLabel ?? 'the other workbench'} ·{' '}
          {coEdit.remote === 0 ? 'no edits from them yet' : `${coEdit.remote} of their edits`} · undo is yours
        </p>
      )}
      {!coEdit && collabNotice && (
        <p
          role="status"
          data-testid="coedit-notice"
          className="border-b px-3 py-1.5 text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
        >
          {collabNotice}
        </p>
      )}

      {deferPhoneEditor ? null : openHelperFile ? (
        <>
          <p
            className="border-b px-3 py-1.5 text-[11px]"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)', backgroundColor: 'var(--bg)' }}
          >
            Read-only helper. Your code imports this file; edit{' '}
            <span className="font-mono" style={{ color: 'var(--accent)' }}>
              {MAIN_FILE_NAME}
            </span>{' '}
            to change the answer.
          </p>
          <PythonEditor
            key={`${lessonId}:${openHelperFile.name}`}
            ref={helperEditorRef}
            value={openHelperFile.content}
            readOnly
            ariaLabel={`${openHelperFile.name}, read-only lesson helper`}
            testId="editor-helper"
            onGoToDefinition={onGoToDefinition}
            initialLine={pendingJump?.file === openHelperFile.name ? pendingJump.line : undefined}
          />
        </>
      ) : (
        <>
          <div
            ref={modeBarRef}
            data-testid="editor-mode-bar"
            onPointerDown={noteModeBarPress}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-soft bg-canvas px-2 py-1"
          >
            <div
              role="group"
              aria-label="Editor mode"
              className="flex shrink-0 rounded-lg border border-line-soft bg-panel p-0.5"
            >
              <button
                type="button"
                data-testid="editor-mode-visual"
                aria-pressed={mode === 'visual'}
                title="Build the program from Python-shaped blocks"
                onClick={() => chooseMode('visual')}
                className={`flex min-h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 font-mono text-[11.5px] transition-colors ${
                  mode === 'visual'
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-muted hover:text-body'
                }`}
              >
                <Blocks className="h-3.5 w-3.5" aria-hidden="true" />
                Visual
              </button>
              <button
                type="button"
                data-testid="editor-mode-code"
                aria-pressed={mode === 'code'}
                title="Edit the Python source directly — dictate it with your keyboard's mic, or swipe across the letters, to type faster"
                onClick={() => chooseMode('code')}
                className={`flex min-h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 font-mono text-[11.5px] transition-colors ${
                  mode === 'code'
                    ? 'bg-accent-soft font-semibold text-accent'
                    : 'text-muted hover:text-body'
                }`}
              >
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                Python Code
              </button>
            </div>
            {isPhone && (
              <button
                type="button"
                data-testid="keyboard-toggle"
                aria-pressed={keyboardOpen && !keyboardNative}
                aria-label={
                  keyboardNative
                    ? 'Show the Python keyboard instead of the phone keyboard'
                    : keyboardOpen
                      ? 'Hide the Python keyboard'
                      : 'Show the Python keyboard'
                }
                title={
                  keyboardNative
                    ? 'The phone keyboard is showing — tap for the Python keys'
                    : keyboardOpen
                      ? 'Hide the Python keyboard and make the editor taller'
                      : 'Show the Python keyboard'
                }
                onClick={toggleKeyboard}
                className={`ml-auto flex min-h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-1.5 font-mono text-[11px] transition-colors ${
                  keyboardOpen && !keyboardNative
                    ? 'border-accent/40 bg-accent-soft font-semibold text-accent'
                    : 'border-line-soft bg-panel text-muted hover:text-body'
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                {keyboardNative ? 'Python keys' : keyboardOpen ? 'Hide keys' : 'Python keys'}
              </button>
            )}
            <p className="hidden min-w-0 flex-1 truncate text-[11px] text-muted sm:block">
              {mode === 'visual'
                ? 'Tap a value to edit it; the Python is generated as you build.'
                : 'Both views are the same program, and Run executes either.'}
            </p>
          </div>

          <div
            data-editor-face="visual"
            style={{ display: mode === 'visual' ? undefined : 'none' }}
            className="min-h-0"
          >
            {visualOpened && (
              <Suspense
                fallback={
                  <p
                    role="status"
                    data-testid="python-blocks-loading"
                    className="px-3 py-3 text-[12px] text-muted"
                  >
                    Opening the visual blocks…
                  </p>
                }
              >
                <PythonBlockEditor
                  ref={visualRef}
                  code={code}
                  onCode={commitCode}
                  active={mode === 'visual'}
                  isPhone={isPhone}
                  keyboardMode={keyboardMode}
                  keyboardShowing={keyboardOpen && !keyboardNative}
                  onFieldFocus={() => {
                    if (!keyboardNative) setKeyboardOpen(true);
                  }}
                  onFieldBlur={() => {
                    if (!keyboardNative && !modeBarHolding) setKeyboardOpen(false);
                  }}
                  holdFieldBlur={modeBarPressRef}
                />
              </Suspense>
            )}
          </div>
          <div
            data-editor-face="code"
            data-phone-band={editorBand === null ? undefined : '1'}
            style={{
              display: mode === 'code' ? undefined : 'none',
              // A measured band is a fixed box: `flex-1`'s zero basis would otherwise let the
              // editor's content set the height again, and the block margin only contains a child
              // that overflows rather than resizing the band.
              ...(editorBand === null
                ? null
                : {
                    height: editorBand,
                    flex: '0 0 auto',
                    minHeight: 0,
                    // The band is sized on purpose; the browser must not answer the page's own
                    // height change by moving the scroll under the learner's thumb.
                    overflowAnchor: 'none',
                  }),
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <PythonEditor
              key={`main:${lessonId}`}
              ref={mainEditorRef}
              value={code}
              onChange={commitCode}
              ariaLabel="Python code editor"
              testId={editorTestId}
              onSliderCommit={onSliderCommit}
              getAnalysis={getAnalysis}
              onGoToDefinition={onGoToDefinition}
              onRunCell={onRunCell}
              onToggleBreakpoint={breakpoints?.onToggle}
              onBreakpointsMoved={breakpoints?.onMoved}
              breakpoints={breakpoints?.entries}
              runLine={runLine}
              errorLine={errorLine}
              tooltipsEnabled={tooltipsEnabled}
              vimMode={vimOn}
              onVimMode={onVimMode}
              initialLine={pendingJump?.file === MAIN_FILE_NAME ? pendingJump.line : undefined}
              keyboardMode={keyboardMode}
              onFocusChange={onCodeFocusChange}
            />
          </div>
        </>
      )}

      {/* One keyboard for both faces, flush with the bottom edge: an in-flow keyboard at 390 px
          lands thousands of pixels below the editor, because the phone's Study page is taller than
          the screen. The shell is measured so the pane can reserve the room the fixed keys take;
          the Study bar rides on top of it while it is up, and Visual's keyboard also rides over
          the toolbox dock it temporarily replaces.

          The shell stays mounted while it is folded away and slides out of the bottom edge with a
          transform, so closing is a transition rather than a disappearance, and the keyboard keeps
          its page, Fn state and lighting layer for the next time a field takes the caret. */}
      {isPhone && !openHelperFile && !deferPhoneEditor && (
        <div
          ref={keyboardShellRef}
          data-testid="mobile-keyboard-shell"
          data-state={keyboardOpen ? 'open' : 'closed'}
          data-mobile-keyboard={keyboardOpen && keyboardHeight > 0 ? '1' : undefined}
          aria-hidden={!keyboardOpen}
          className="mobile-keyboard-shell fixed inset-x-0 bottom-0 z-40"
        >
          <MobilePythonKeyboard
            mode={mode}
            open={keyboardOpen}
            {...keyboardActions}
            onNativeKeyboard={openNativeKeyboard}
            onDone={closeKeyboard}
            onKeepFocus={keepEditingFocus}
          />
        </div>
      )}
      {isPhone && !openHelperFile && !deferPhoneEditor && (
        <div
          aria-hidden="true"
          className="shrink-0 transition-[height] duration-200 ease-out motion-reduce:transition-none"
          style={{ height: keyboardOpen ? keyboardHeight : 0 }}
        />
      )}
    </div>
  );
}
