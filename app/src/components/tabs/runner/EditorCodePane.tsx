import { Suspense, lazy, useEffect, useRef, useState, type RefObject } from 'react';
import { Blocks, Code2, Keyboard } from 'lucide-react';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { MobilePythonKeyboard } from '../../MobilePythonKeyboard';
import type { PythonBlockEditorHandle } from '../../../pythonBlocks/PythonBlockEditor';
import { MAIN_FILE_NAME, type LessonFile } from '../../../lessonFiles';
import type { AnalysisSession } from '../../../analysisClient';
import { readBlockSettings, writeBlockSettings, type BlockMode } from '../../../pythonBlocks/settings.ts';

// The visual workspace is its own chunk: a learner who never leaves the code editor does not fetch
// the model, the toolbox or the cards, and the editor's first paint does not wait for them.
const PythonBlockEditor = lazy(() =>
  import('../../../pythonBlocks/PythonBlockEditor').then((module) => ({
    default: module.PythonBlockEditor,
  }))
);

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
  const keyboardMode = !isPhone
    ? 'off'
    : keyboardNative
      ? 'native'
      : keyboardOpen
        ? 'custom'
        : 'off';
  const visualRef = useRef<PythonBlockEditorHandle | null>(null);
  const modeBarRef = useRef<HTMLDivElement | null>(null);
  const keyboardShellRef = useRef<HTMLDivElement | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // The keyboard is fixed above the phone bar, so the pane reserves the same height at its end:
  // without that space the last lines of the editor could never be scrolled out from under it.
  useEffect(() => {
    const shell = keyboardShellRef.current;
    if (!isPhone || !keyboardOpen || !shell) {
      setKeyboardHeight(0);
      return;
    }
    const measure = () => setKeyboardHeight(shell.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [isPhone, keyboardOpen, mode]);

  // When Code opens with the keyboard showing, the mode bar is put under the sticky header. The
  // editor then fills the band between the two, instead of starting below the fold.
  useEffect(() => {
    if (!isPhone || !keyboardOpen || mode !== 'code' || keyboardHeight === 0) return;
    const bar = modeBarRef.current;
    if (!bar) return;
    const header = document.querySelector('header[data-chrome="header"]');
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const top = bar.getBoundingClientRect().top;
    if (top >= headerHeight && top <= window.innerHeight - 76 - keyboardHeight - 60) return;
    window.scrollBy({ top: top - headerHeight - 4, behavior: 'auto' });
  }, [isPhone, keyboardOpen, mode, keyboardHeight]);

  const chooseMode = (next: BlockMode) => {
    if (next === mode) return;
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
    // Native feels closed (the custom keys are gone) but the way back has to open them, not run
    // the close a third time. Only a showing, non-native keyboard closes on this press.
    if (keyboardOpen && !keyboardNative) {
      closeKeyboard();
      return;
    }
    setKeyboardNative(false);
    setKeyboardOpen(true);
  };

  // One keyboard, two adapters: every key asks the face on screen. The code face's adapter is the
  // editor handle (CodeMirror commands own the document), the visual face's is the block handle.
  const on = (codeAction: () => void, visualAction: () => void) =>
    mode === 'visual' ? visualAction() : codeAction();
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
                  onFieldFocus={() => {
                    if (!keyboardNative) setKeyboardOpen(true);
                  }}
                  onFieldBlur={() => {
                    if (!keyboardNative) setKeyboardOpen(false);
                  }}
                />
              </Suspense>
            )}
          </div>
          <div
            data-editor-face="code"
            style={{ display: mode === 'code' ? undefined : 'none' }}
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
            />
          </div>
        </>
      )}

      {/* One keyboard for both faces, on the bottom edge above the phone bar: an in-flow keyboard
          at 390 px lands thousands of pixels below the editor, because the phone's Study page is
          taller than the screen. The shell is measured so the pane can reserve the room the fixed
          keys take; Visual's keyboard also rides over the toolbox dock it temporarily replaces. */}
      {isPhone && !openHelperFile && !deferPhoneEditor && keyboardOpen && (
        <div
          ref={keyboardShellRef}
          data-testid="mobile-keyboard-shell"
          className="fixed inset-x-0 bottom-[calc(3.5625rem+env(safe-area-inset-bottom))] z-40"
        >
          <MobilePythonKeyboard
            mode={mode}
            {...keyboardActions}
            onNativeKeyboard={openNativeKeyboard}
            onDone={closeKeyboard}
          />
        </div>
      )}
      {isPhone && !openHelperFile && !deferPhoneEditor && keyboardOpen && (
        <div aria-hidden="true" className="shrink-0" style={{ height: keyboardHeight }} />
      )}
    </div>
  );
}
