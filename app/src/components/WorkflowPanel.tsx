import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, GitBranch, MousePointerClick, Sparkles, Trash2 } from 'lucide-react';
import {
  KIND_META,
  MODE_LABEL,
  MAX_WORKFLOW_TITLE_CHARS,
  STEPS_BY_MODE,
  validateWorkflow,
  workflowNumbers,
  workflowToMarkdown,
  workflowToMermaid,
  type StepKind,
  type WorkflowDoc,
  type WorkflowIssue,
} from '../workflow.ts';
import { laneIndexOf } from '../workflowProcesses.ts';
import { templateForLesson, type WorkflowTemplate } from '../workflowTemplates.ts';
import {
  markWorkflowGuideSeen,
  readDropDefault,
  readWorkflowGuideSeen,
  saveDropDefault,
} from '../workflowStore.ts';
import { PYTHON_LESSONS } from '../data/pythonLessonsData.ts';
import { isKnownLesson } from '../lessonRoute.ts';
import { HowToCard } from './HowToCard.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';
import { WorkflowSelectionInspector } from './workflow/WorkflowSelectionInspector.tsx';
import { WorkflowMenu, type WorkflowMenuRequest } from './workflow/WorkflowMenu.tsx';
import type { LinkDraft } from './workflow/useLinking.ts';
import { useFullscreen } from './workflow/useFullscreen.ts';
import { useWorkflowEditor } from './workflow/useWorkflowEditor.ts';
// The canvas — cards, arrows, the fit lens, the edge inspector — is a whole surface that a learner
// who never opens the Workflow tab should not parse before the lesson text is on screen. It sits
// behind a lazy boundary, like the simulation tabs in `App.tsx`, and the pane says it is loading
// while the chunk arrives on the first press.
const WorkflowCanvas = lazy(() =>
  import('./WorkflowCanvas.tsx').then((module) => ({ default: module.WorkflowCanvas }))
);
import { iconForKind } from './workflowIcons.ts';
import { useMediaQuery } from '../useMediaQuery.ts';

/**
 * The workflow tab (`components/WorkflowPanel.tsx`) — layout and view state.
 *
 * A learner's plan for one problem, drawn as nodes on a canvas: what is given, what is unknown, the
 * model, the arithmetic, the check, the answer — or, for a program, input through output. The notes
 * panel can say what was understood; this says how the learner decided to get there, which is the
 * part a correct answer hides.
 *
 * The document and every action that changes it belong to `workflow/useWorkflowEditor.ts`; the
 * structural rules belong to `workflowEdits.ts`. This file decides where things sit and which
 * transient view is open — the guide, the template picker, the press menu, the clear confirmation,
 * the grouping/lane arming, full screen — and it renders the canvas, the inspector and the toolbar
 * from the editor's commands. Adding an action should mean adding a command to the editor (and a
 * surface that calls it), not adding document logic here.
 *
 * Three decisions this component keeps:
 *
 * 1. **A graph, not a form.** Cards are placed where the learner dragged them and arrows are drawn
 *    between them (`components/WorkflowCanvas.tsx` does the pixels).
 * 2. **The checklist advises.** It names the card and the missing thing in a sentence a beginner can
 *    act on; it never disables Run and it never gates a lesson.
 * 3. **Nothing is lost by clicking away.** Edits are written on a short debounce and again when the
 *    lesson changes, under the lesson id they were typed in — the note box's rule, for the same
 *    reason, now enforced by the editor hook.
 */
export interface WorkflowPanelProps {
  lessonId: string;
  lessonTitle: string;
  /** Open a lesson a card links to, without leaving the workbench. */
  onOpenLesson?: (lessonId: string) => void;
}

const LESSON_CHOICES = PYTHON_LESSONS.map((lesson) => ({ id: lesson.id, title: lesson.title }));

function templateHasContent(doc: WorkflowDoc | null): boolean {
  if (!doc) return false;
  if (doc.nodes.length > 1) return true;
  return doc.nodes.some((node) => node.title.trim() || node.detail.trim() || node.unit);
}

export function WorkflowPanel({ lessonId, lessonTitle, onOpenLesson }: WorkflowPanelProps) {
  const {
    doc,
    selectedId,
    selectedEdgeId,
    status,
    say: setStatus,
    historySize,
    undo,
    redo,
    selectNode,
    selectEdge,
    updateNode,
    setNodeAnnotation,
    moveNode,
    moveNodes,
    addNode,
    removeNode,
    copyNode,
    cutNode,
    spawnLinked,
    pasteNode,
    canPaste,
    connect,
    disconnect,
    setEdgeType,
    setEdgeLabel,
    setEdgeGuard,
    setEdgePort,
    setEdgeRoute,
    groupCards,
    renameGroup,
    removeGroup,
    setMode,
    setTitle,
    applyTemplate: startFrom,
    startBlank: startBlankDoc,
    clearOpen,
    armClear,
    disarmClear,
    clearIt,
    focusIssue,
    focusLane,
    setFocusLane,
    createLane,
    assignLane,
    renameLane,
    removeLane,
  } = useWorkflowEditor(lessonId, lessonTitle);

  const [howTo, setHowTo] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null);
  // The frame gesture is armed, not always on: the same paper pans, and on a phone a plain drag has
  // to keep scrolling.
  const [grouping, setGrouping] = useState(false);
  // A lane is armed the same way a frame is, and the two are mutually exclusive: one drag cannot
  // mean both "group these" and "this is who owns them".
  const [laning, setLaning] = useState(false);
  // The context menu: what the press hit, and where it was. One owner, so a card, a lane, a frame
  // and an arrow all report through the same request.
  const [menu, setMenu] = useState<WorkflowMenuRequest | null>(null);
  // What a dragged arrow creates when it ends on bare paper: `ask` opens the picker. Read once, and
  // written only when the learner picks a different answer, so an untouched canvas has no setting.
  const [dropDefault, setDropDefault] = useState<StepKind | 'ask'>(readDropDefault);
  // The whole viewport, not the pane: the view, its scroll lock and its restore live in their module.
  const [full, toggleFull] = useFullscreen();
  // The checklist is advice, not the work. On a phone it is a count and one press away: 24 open
  // cards are 24 wrapped lines, and the canvas below them started ~1,900 px down the page. A
  // desktop has the room and opens the list. A press pins the learner's choice; until then the list
  // follows the viewport, so a rotation does not leave it folded on a desktop or open on a phone.
  const phone = useMediaQuery('(max-width: 767px)');
  const [checksChoice, setChecksChoice] = useState<boolean | null>(null);
  const checksOpen = checksChoice ?? !phone;
  const checksId = useId();

  // ⌘Z / ⌘⇧Z (Ctrl on other platforms), the editor's own pair, plus the Windows redo habit Ctrl+Y.
  // A focused field keeps its native undo; a hidden tab has no root box and listens to nothing.
  const root = useRef<HTMLDivElement | null>(null);
  const steps = useRef({ undo, redo });
  steps.current = { undo, redo };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const forward = key === 'y' || (key === 'z' && event.shiftKey);
      if (key !== 'z' && !forward) return;
      const target = event.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!root.current?.getClientRects().length) return;
      event.preventDefault();
      (forward ? steps.current.redo : steps.current.undo)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Start the canvas chunk the moment the tab opens, not on the press that first needs it: the
  // boundary is there to keep the tab off a first paint, not to make "Start blank" wait.
  useEffect(() => {
    void import('./WorkflowCanvas.tsx');
  }, []);

  // A lesson switch clears the view flags the editor does not own. The document, its selection, its
  // history and the pending clear are reset by `useWorkflowEditor`.
  useEffect(() => {
    setPendingTemplate(null);
    setTemplatesOpen(false);
    setGrouping(false);
    setLaning(false);
    // Seen once means closed from then on, even on a lesson with no workflow: an empty tab is
    // exactly where a learner who dismissed the guide expects the one-press toggle, not the
    // three-item card again.
    setHowTo(!readWorkflowGuideSeen());
  }, [lessonId]);

  const openNodeLesson = (id: string) => {
    if (!id) return;
    if (!isKnownLesson(id)) {
      setStatus(`No lesson “${id}” — pick one from the list`);
      return;
    }
    onOpenLesson?.(id);
  };

  /** A drag that left a dot and ended on bare paper: the default card, or the picker when asked. */
  const dropLink = (
    draft: LinkDraft,
    at: { x: number; y: number },
    client: { x: number; y: number },
    picker: boolean
  ) => {
    if (!doc) return;
    if (!picker && dropDefault !== 'ask' && STEPS_BY_MODE[doc.mode].includes(dropDefault)) {
      spawnLinked(dropDefault, at, draft);
      return;
    }
    setMenu({ x: client.x, y: client.y, onPickKind: (kind) => spawnLinked(kind, at, draft) });
  };

  /** Starting a document closes the picker and the guide; the editor writes the document itself. */
  const applyTemplate = (template: WorkflowTemplate) => {
    startFrom(template);
    setTemplatesOpen(false);
    setPendingTemplate(null);
    setHowTo(false);
    markWorkflowGuideSeen();
  };

  const chooseTemplate = (template: WorkflowTemplate) => {
    if (templateHasContent(doc)) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template);
  };

  const copy = (text: string, what: string) => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setStatus(`Copy is blocked in this browser — ${what.toLowerCase()} is still in the panel`);
      return;
    }
    clipboard
      .writeText(text)
      .then(() => setStatus(`${what} copied`))
      .catch(() => setStatus('Copy was blocked — the browser refused the clipboard'));
  };

  const startBlank = () => {
    startBlankDoc();
    markWorkflowGuideSeen();
    setHowTo(false);
  };

  const lessonTemplate = templateForLesson(lessonId);
  const { issues, issueByStep, numbers, open, hints } = useMemo(() => {
    const list = doc ? validateWorkflow(doc) : [];
    const byStep = new Map<string, WorkflowIssue>();
    for (const issue of list) {
      if (issue.stepId && issue.severity === 'open' && !byStep.has(issue.stepId)) {
        byStep.set(issue.stepId, issue);
      }
    }
    return {
      issues: list,
      issueByStep: byStep,
      // The badge and the advice read the same order: a card numbered 3 is the card "Step 3"
      // names, however the array happens to be ordered after a drag or a new arrow.
      numbers: doc ? workflowNumbers(doc) : new Map<string, number>(),
      open: list.filter((issue) => issue.severity === 'open').length,
      hints: list.filter((issue) => issue.severity === 'hint').length,
    };
  }, [doc]);

  const dismissGuide = () => {
    markWorkflowGuideSeen();
    setHowTo(false);
  };

  const guide = howTo ? (
    <HowToCard onDismiss={dismissGuide} />
  ) : (
    <button
      type="button"
      data-testid="workflow-howto-toggle"
      onClick={() => setHowTo(true)}
      className="mt-2 cursor-pointer font-mono text-[11.5px] text-accent underline decoration-dotted"
    >
      How this works
    </button>
  );

  if (!doc) {
    return (
      <div
        ref={root}
        data-testid="panel-workflow"
        className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[13px] text-accent">
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Workflow <span className="text-faint">· {lessonTitle}</span>
          </span>
          <span className="flex items-center gap-1.5">
            {status && (
              <span role="status" data-testid="workflow-status" className="font-mono text-[11px] text-faint">
                {status}
              </span>
            )}
            {historySize.past > 0 && (
              <button
                type="button"
                data-testid="workflow-undo"
                onClick={undo}
                title="Undo (⌘Z)"
                aria-keyshortcuts="Meta+Z Control+Z"
                className="btn btn-ghost h-8 px-2 font-mono text-[10.5px]"
              >
                Undo
              </button>
            )}
            {historySize.future > 0 && (
              <button
                type="button"
                data-testid="workflow-redo"
                onClick={redo}
                title="Redo (⌘⇧Z)"
                aria-keyshortcuts="Meta+Shift+Z Control+Y"
                className="btn btn-ghost h-8 px-2 font-mono text-[10.5px]"
              >
                Redo
              </button>
            )}
          </span>
        </div>

        <div data-testid="workflow-empty" className="mt-3">
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>
            Start the workflow for this lesson
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>
            The cards are the method, not a form: one idea each, arrows where one leads to the next.
            A template gives you the shape to edit; nothing here is graded.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lessonTemplate && (
              <button
                type="button"
                data-testid="workflow-start-lesson"
                onClick={() => applyTemplate(lessonTemplate)}
                className="btn btn-primary text-[12.5px]"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Start from this lesson’s example
              </button>
            )}
            <button
              type="button"
              data-testid="workflow-browse-templates"
              onClick={() => setTemplatesOpen((shown) => !shown)}
              className="btn btn-ghost text-[12.5px]"
            >
              Browse templates
            </button>
            <button
              type="button"
              data-testid="workflow-start-blank"
              onClick={startBlank}
              className="btn btn-ghost text-[12.5px]"
            >
              Start blank
            </button>
          </div>
        </div>

        {guide}
        {templatesOpen && <TemplatePicker onChoose={chooseTemplate} />}
      </div>
    );
  }

  const selectedNode = selectedId ? (doc.nodes.find((node) => node.id === selectedId) ?? null) : null;
  const selectedLane = selectedNode ? laneIndexOf(doc.lanes, selectedNode.id) : -1;

  return (
    <div
      ref={root}
      data-testid="panel-workflow"
      className={`flex min-h-0 flex-col bg-panel p-4 ${
        full ? 'fixed inset-0 z-50 overflow-auto' : 'h-full rounded-xl border border-line'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-accent">
          <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Workflow</span>{' '}
          <span className="truncate text-faint">· {lessonTitle}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span role="status" data-testid="workflow-status" className="font-mono text-[11px] text-faint">
            {status}
          </span>
          <button
            type="button"
            data-testid="workflow-undo"
            onClick={undo}
            disabled={!historySize.past}
            title="Undo (⌘Z)"
            aria-keyshortcuts="Meta+Z Control+Z"
            className="btn btn-ghost h-8 px-2 font-mono text-[10.5px] disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            data-testid="workflow-redo"
            onClick={redo}
            disabled={!historySize.future}
            title="Redo (⌘⇧Z)"
            aria-keyshortcuts="Meta+Shift+Z Control+Y"
            className="btn btn-ghost h-8 px-2 font-mono text-[10.5px] disabled:opacity-40"
          >
            Redo
          </button>
          <button
            type="button"
            data-testid="workflow-fullscreen"
            aria-pressed={full}
            onClick={toggleFull}
            className="btn btn-ghost h-8 px-2 font-mono text-[10.5px]"
          >
            {full ? 'Exit full' : 'Full screen'}
          </button>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Workflow palette" className="flex gap-1">
          {(['analysis', 'code'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`workflow-mode-${mode}`}
              aria-pressed={doc.mode === mode}
              onClick={() => setMode(mode)}
              className={`min-h-9 cursor-pointer rounded border px-2 py-0.5 font-mono text-[11px] ${
                doc.mode === mode
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-line bg-canvas text-muted hover:bg-raise'
              }`}
            >
              {MODE_LABEL[mode]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 font-mono text-[10.5px] text-faint">
          Drop
          <select
            data-testid="workflow-drop-default"
            aria-label="Card an arrow drop creates"
            title="Dragging a dot onto paper makes this card. Alt asks."
            value={
              STEPS_BY_MODE[doc.mode].some((kind) => kind === dropDefault) ? dropDefault : 'ask'
            }
            onChange={(event) => {
              const value = event.target.value as StepKind | 'ask';
              if (value !== 'ask' && !STEPS_BY_MODE[doc.mode].includes(value)) return;
              setDropDefault(value);
              saveDropDefault(value);
              setStatus(value === 'ask' ? 'Arrow drops ask' : `Arrow drops: ${KIND_META[value].label}`);
            }}
            className="min-h-9 rounded border border-line bg-canvas px-1 font-mono text-[11px] text-body outline-none focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="ask">Ask</option>
            {STEPS_BY_MODE[doc.mode].map((kind) => (
              <option key={kind} value={kind}>
                {KIND_META[kind].label}
              </option>
            ))}
          </select>
        </label>
        <input
          data-testid="workflow-title"
          aria-label="Workflow title"
          value={doc.title}
          placeholder={lessonTitle}
          maxLength={MAX_WORKFLOW_TITLE_CHARS}
          onChange={(event) => setTitle(event.target.value)}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-[12.5px] font-semibold outline-none"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)', color: 'var(--text)' }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          data-testid="workflow-checks"
          aria-live="polite"
          className={`font-mono text-[11.5px] ${open === 0 ? 'text-emerald' : 'text-amber'}`}
        >
          {open === 0 && hints === 0
            ? `All checks pass · ${doc.nodes.length} card${doc.nodes.length === 1 ? '' : 's'}`
            : [open ? `${open} open` : '', hints ? `${hints} hint${hints === 1 ? '' : 's'}` : '']
                .filter(Boolean)
                .join(' · ')}
        </span>
        <span className="font-mono text-[10.5px] text-faint">advice only — Run is never blocked</span>
        {issues.length > 0 && (
          <button
            type="button"
            data-testid="workflow-checks-toggle"
            aria-expanded={checksOpen}
            aria-controls={checksId}
            onClick={() => setChecksChoice(!checksOpen)}
            className="ml-auto flex min-h-9 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11.5px] text-accent hover:bg-raise"
          >
            {checksOpen
              ? 'Hide checks'
              : `Show ${issues.length} check${issues.length === 1 ? '' : 's'}`}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${checksOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {issues.length > 0 && checksOpen && (
        <ul id={checksId} data-testid="workflow-issues" className="mt-1 space-y-0.5">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.stepId ?? 'flow'}-${index}`}>
              <button
                type="button"
                data-testid={`workflow-issue-${index}`}
                onClick={() => focusIssue(issue)}
                className="flex w-full cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 text-left text-[11.5px] hover:bg-raise"
              >
                <span aria-hidden="true" className={issue.severity === 'open' ? 'text-amber' : 'text-faint'}>
                  {issue.severity === 'open' ? '•' : '·'}
                </span>
                <span className={issue.severity === 'open' ? 'text-amber' : 'text-muted'}>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {guide}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-faint">
        <span className="flex items-center gap-1">
          <MousePointerClick className="h-3 w-3" aria-hidden="true" />
          Drag a card by its header
        </span>
        <span aria-hidden="true">·</span>
        <span>Drag a dot to another card to draw an arrow; press an arrow to name what it carries</span>
        <span aria-hidden="true">·</span>
        <span>Drag empty canvas or use the arrow keys to pan; Fit frames the flow</span>
      </div>

      <Suspense
        fallback={
          <p data-testid="workflow-canvas-loading" className="mt-2 font-mono text-[11.5px] text-faint">
            Loading the canvas…
          </p>
        }
      >
        <WorkflowCanvas
          key={lessonId}
          doc={doc}
          numbers={numbers}
          issueByStep={issueByStep}
          selectedId={selectedId}
          onSelect={selectNode}
          onMove={moveNode}
          onUpdate={updateNode}
          onRemove={removeNode}
          onOpenLesson={openNodeLesson}
          onConnect={connect}
          onDisconnect={disconnect}
          onDropLink={dropLink}
          selectedEdgeId={selectedEdgeId}
          onSelectEdge={selectEdge}
          onEdgeType={setEdgeType}
          onEdgeLabel={setEdgeLabel}
          onEdgeGuard={setEdgeGuard}
          onEdgePort={setEdgePort}
          onEdgeRoute={setEdgeRoute}
          onMoveMany={moveNodes}
          grouping={grouping}
          onGroupCards={(ids) => {
            setGrouping(false);
            groupCards(ids);
          }}
          laning={laning}
          onLaneCards={(ids) => {
            setLaning(false);
            createLane(ids);
          }}
          onRenameGroup={renameGroup}
          onRemoveGroup={removeGroup}
          onRenameLane={renameLane}
          onRemoveLane={removeLane}
          focusLane={focusLane}
          onLaneNameFocused={() => setFocusLane(null)}
          onMenu={setMenu}
          onCopyNode={copyNode}
          onCutNode={cutNode}
          onPaste={pasteNode}
          canPaste={canPaste}
          fullscreen={full}
        />
      </Suspense>

      {/* Below the paper, never above it: the inspector is in flow, so opening it must not move the
          card the learner just pressed. */}
      {selectedNode && (
        <WorkflowSelectionInspector
          node={selectedNode}
          number={numbers.get(selectedNode.id) ?? 1}
          lanes={doc.lanes ?? []}
          laneIndex={selectedLane}
          lessons={LESSON_CHOICES}
          onNote={(note) => setNodeAnnotation(selectedNode.id, 'note', note)}
          onLesson={(lesson) => setNodeAnnotation(selectedNode.id, 'lesson', lesson)}
          onOpenLesson={openNodeLesson}
          onLane={(choice) => assignLane(selectedNode.id, choice)}
          onStyle={(patch) => updateNode(selectedNode.id, patch)}
          onDismiss={() => selectNode(null)}
        />
      )}

      <div data-testid="workflow-add" className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">Add</span>
        {STEPS_BY_MODE[doc.mode].map((kind) => {
          const Icon = iconForKind(kind);
          return (
            <button
              key={kind}
              type="button"
              data-testid={`workflow-add-${kind}`}
              title={`Add a ${KIND_META[kind].label} card — ${KIND_META[kind].hint}`}
              onClick={() => addNode(kind)}
              className="flex min-h-9 cursor-pointer items-center gap-1 rounded border border-line bg-canvas px-2 py-0.5 font-mono text-[11.5px] text-body hover:bg-raise"
            >
              <Icon className="h-3 w-3 text-accent" aria-hidden="true" />
              {KIND_META[kind].label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2">
        <button
          type="button"
          data-testid="workflow-browse-templates"
          onClick={() => setTemplatesOpen((shown) => !shown)}
          className="btn btn-ghost text-[12px]"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Templates
        </button>
        <button
          type="button"
          data-testid="workflow-group-draw"
          aria-pressed={grouping}
          title="Draw a box around cards to frame them"
          onClick={() => {
            setGrouping(!grouping);
            setLaning(false);
            setStatus(grouping ? '' : 'Drag a box around cards');
          }}
          className={`btn btn-ghost text-[12px] ${grouping ? 'text-accent' : ''}`}
        >
          Group
        </button>
        <button
          type="button"
          data-testid="workflow-lane-draw"
          aria-pressed={laning}
          title="Draw a box around cards to put them in a named activity partition"
          onClick={() => {
            setLaning(!laning);
            setGrouping(false);
            setStatus(laning ? '' : 'Drag a box around cards to name their lane');
          }}
          className={`btn btn-ghost text-[12px] ${laning ? 'text-accent' : ''}`}
        >
          Lane
        </button>
        <button
          type="button"
          data-testid="workflow-copy-mermaid"
          onClick={() => copy(workflowToMermaid(doc), 'Mermaid')}
          className="btn btn-ghost text-[12px]"
        >
          Copy Mermaid
        </button>
        <button
          type="button"
          data-testid="workflow-copy-markdown"
          onClick={() => copy(workflowToMarkdown(doc), 'Markdown')}
          className="btn btn-ghost text-[12px]"
        >
          Copy Markdown
        </button>
        <button
          type="button"
          data-testid="workflow-clear"
          onClick={() => armClear()}
          className="btn btn-ghost ml-auto text-[12px] text-rose"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>

      {clearOpen && (
        <div
          data-testid="workflow-clear-confirm"
          className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-rose/40 bg-rose/5 px-2.5 py-2"
        >
          <span className="text-[12px]" style={{ color: 'var(--body)' }}>
            Clear all {doc.nodes.length} card{doc.nodes.length === 1 ? '' : 's'} for {lessonId}?
          </span>
          <button
            type="button"
            data-testid="workflow-clear-yes"
            onClick={clearIt}
            className="btn btn-ghost text-[12px] text-rose"
          >
            Clear it
          </button>
          <button
            type="button"
            data-testid="workflow-clear-no"
            onClick={disarmClear}
            className="btn btn-ghost text-[12px]"
          >
            Keep it
          </button>
        </div>
      )}

      {pendingTemplate && (
        <div
          data-testid="workflow-replace-confirm"
          className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber/40 bg-amber/5 px-2.5 py-2"
        >
          <span className="text-[12px]" style={{ color: 'var(--body)' }}>
            Replace these {doc.nodes.length} cards with “{pendingTemplate.name}”?
          </span>
          <button
            type="button"
            data-testid="workflow-replace-yes"
            onClick={() => applyTemplate(pendingTemplate)}
            className="btn btn-ghost text-[12px] text-amber"
          >
            Replace
          </button>
          <button
            type="button"
            data-testid="workflow-replace-no"
            onClick={() => setPendingTemplate(null)}
            className="btn btn-ghost text-[12px]"
          >
            Cancel
          </button>
        </div>
      )}

      {templatesOpen && <TemplatePicker onChoose={chooseTemplate} />}

      <p className="mt-2 text-[11px] text-faint">
        Export copies the numbered flow, not the canvas. Nothing here blocks a run or a lesson.
      </p>

      {menu && (
        <WorkflowMenu request={menu} doc={doc} onAdd={addNode} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
