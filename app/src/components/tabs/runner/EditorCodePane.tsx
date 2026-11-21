import { Suspense, lazy, useState, type RefObject } from 'react';
import { Blocks, Code2 } from 'lucide-react';
import { PythonEditor, type PythonEditorHandle } from '../../PythonEditor';
import { PythonKeys } from '../../PythonKeys';
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
 * construct. A phone's punctuation strip belongs to the code face, where there is a caret to insert
 * at; the visual face has fields.
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
  const chooseMode = (next: BlockMode) => {
    setMode(next);
    if (next === 'visual') setVisualOpened(true);
    writeBlockSettings({ mode: next });
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
                title="Edit the Python source directly"
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
                  code={code}
                  onCode={commitCode}
                  active={mode === 'visual'}
                />
              </Suspense>
            )}
          </div>
          <div
            data-editor-face="code"
            style={{ display: mode === 'code' ? undefined : 'none' }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {isPhone && <PythonKeys onInsert={(text) => mainEditorRef.current?.insertText(text)} />}
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
            />
          </div>
        </>
      )}
    </div>
  );
}
