import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, MousePointerClick, Sparkles, Trash2 } from 'lucide-react';
import {
  KIND_META,
  MODE_LABEL,
  MAX_EDGES,
  MAX_STEPS,
  MAX_WORKFLOW_TITLE_CHARS,
  STEPS_BY_MODE,
  addWorkflowNode,
  emptyWorkflow,
  nextEdgeId,
  validateWorkflow,
  workflowToMarkdown,
  workflowToMermaid,
  type StepKind,
  type WorkflowDoc,
  type WorkflowIssue,
  type WorkflowNode,
} from '../workflow.ts';
import { templateForLesson, type WorkflowTemplate } from '../workflowTemplates.ts';
import {
  clearWorkflow,
  markWorkflowGuideSeen,
  readWorkflow,
  readWorkflowGuideSeen,
  saveWorkflow,
} from '../workflowStore.ts';
import { HowToCard } from './HowToCard.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';
import { WorkflowCanvas } from './WorkflowCanvas.tsx';
import { iconForKind } from './workflowIcons.ts';

/**
 * The workflow tab (`components/WorkflowPanel.tsx`).
 *
 * A learner's plan for one problem, drawn as nodes on a canvas: what is given, what is unknown, the
 * model, the arithmetic, the check, the answer — or, for a program, input through output. The notes
 * panel can say what was understood; this says how the learner decided to get there, which is the
 * part a correct answer hides.
 *
 * Three decisions this component keeps:
 *
 * 1. **A graph, not a form.** Cards are placed where the learner dragged them and arrows are drawn
 *    between them (`components/WorkflowCanvas.tsx` does the pixels; this file owns the document).
 * 2. **The checklist advises.** It names the card and the missing thing in a sentence a beginner can
 *    act on; it never disables Run and it never gates a lesson.
 * 3. **Nothing is lost by clicking away.** Edits are written on a short debounce and again when the
 *    lesson changes, under the lesson id they were typed in — the note box's rule, for the same
 *    reason.
 *
 * This file owns the document, its persistence and the selected card; validation runs once per
 * document in a memo and the canvas reads each card's issue from that index. Every mutation — a
 * keystroke, a drag, an arrow, a delete — lands here, so the two panes can never disagree.
 */
export interface WorkflowPanelProps {
  lessonId: string;
  lessonTitle: string;
}

const NOT_SAVED = 'Not saved — storage is blocked or full';

function templateHasContent(doc: WorkflowDoc | null): boolean {
  if (!doc) return false;
  if (doc.nodes.length > 1) return true;
  return doc.nodes.some((node) => node.title.trim() || node.detail.trim() || node.unit);
}

export function WorkflowPanel({ lessonId, lessonTitle }: WorkflowPanelProps) {
  const [doc, setDoc] = useState<WorkflowDoc | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [howTo, setHowTo] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<WorkflowTemplate | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // The write that has not landed yet, and the timer that will land it. The lesson id is captured
  // beside the document: a flush that ran after a lesson switch would otherwise file P.1's work
  // under P.2's key.
  const pending = useRef<{ lesson: string; doc: WorkflowDoc } | null>(null);
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const entry = pending.current;
    if (!entry) return;
    pending.current = null;
    setStatus(saveWorkflow(entry.lesson, entry.doc) ? 'Saved' : NOT_SAVED);
  }, []);

  useEffect(() => {
    flush();
    const stored = readWorkflow(lessonId);
    setDoc(stored);
    setSelectedId(null);
    setStatus('');
    setConfirmClear(false);
    setPendingTemplate(null);
    setTemplatesOpen(false);
    // Seen once means closed from then on, even on a lesson with no workflow: `stored` is not the
    // question here — an empty tab is exactly where a learner who dismissed the guide expects the
    // one-press toggle, not the three-item card again.
    setHowTo(!readWorkflowGuideSeen());
  }, [lessonId, flush]);

  // Leaving the card is leaving the editor: the pending write lands with the lesson id it was typed
  // under, and an unmount cannot drop a keystroke.
  useEffect(() => () => flush(), [flush]);

  const commit = (next: WorkflowDoc) => {
    const stamped = { ...next, updatedAt: Date.now() };
    setDoc(stamped);
    pending.current = { lesson: lessonId, doc: stamped };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    if (!doc) return;
    commit({
      ...doc,
      nodes: doc.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
    });
  };

  const moveNode = (id: string, x: number, y: number) => {
    if (!doc) return;
    const node = doc.nodes.find((entry) => entry.id === id);
    if (!node || (node.x === x && node.y === y)) return;
    commit({ ...doc, nodes: doc.nodes.map((entry) => (entry.id === id ? { ...entry, x, y } : entry)) });
  };

  const addNode = (kind: StepKind) => {
    if (!doc) return;
    const next = addWorkflowNode(doc, kind);
    if (!next) {
      // The one place the bound is felt: a card that would not survive the next write is not added
      // at all, and the header says why. Flush first, so the previous add's "Saved" cannot land
      // half a second later and wipe the sentence that explains the refusal.
      flush();
      setStatus(`A workflow holds at most ${MAX_STEPS} cards — remove one before adding another`);
      return;
    }
    commit(next);
    setSelectedId(next.nodes[next.nodes.length - 1].id);
    setStatus('');
  };

  const removeNode = (id: string) => {
    if (!doc) return;
    const remaining = doc.nodes.filter((node) => node.id !== id);
    const keptEdges = doc.edges.filter((edge) => edge.from !== id && edge.to !== id);
    if (selectedId === id) setSelectedId(null);
    if (remaining.length === 0) {
      // A workflow with no cards is not a diagram: the lesson goes back to its empty state rather
      // than storing a document the panel would have to pretend is a flow.
      clearWorkflow(lessonId);
      pending.current = null;
      setDoc(null);
      setStatus('Workflow cleared');
      return;
    }
    const lostEdges = doc.edges.length - keptEdges.length;
    commit({ ...doc, nodes: remaining, edges: keptEdges });
    setStatus(lostEdges ? 'Card removed — its arrows went with it' : 'Card removed');
  };

  const connect = (from: string, to: string) => {
    if (!doc) return;
    if (from === to) {
      setStatus('A card cannot feed itself — connect it to the next one instead');
      return;
    }
    if (doc.edges.some((edge) => edge.from === from && edge.to === to)) {
      setStatus('That arrow is already drawn');
      return;
    }
    if (doc.edges.length >= MAX_EDGES) {
      setStatus(`A workflow holds at most ${MAX_EDGES} arrows — remove one before drawing another`);
      return;
    }
    const edge = { id: nextEdgeId(doc.edges), from, to };
    commit({ ...doc, edges: [...doc.edges, edge] });
    setStatus('Arrow added');
  };

  const disconnect = (edgeId: string) => {
    if (!doc) return;
    commit({ ...doc, edges: doc.edges.filter((edge) => edge.id !== edgeId) });
    setStatus('Arrow removed');
  };

  const applyTemplate = (template: WorkflowTemplate) => {
    const built = template.build();
    commit(built);
    setSelectedId(built.nodes[0]?.id ?? null);
    setTemplatesOpen(false);
    setPendingTemplate(null);
    setHowTo(false);
    markWorkflowGuideSeen();
    setStatus(`Started from “${template.name}”`);
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

  const focusIssue = (issue: WorkflowIssue) => {
    if (issue.stepId) setSelectedId(issue.stepId);
  };

  const startBlank = () => {
    const built = emptyWorkflow('analysis', lessonTitle);
    commit(built);
    setSelectedId(built.nodes[0].id);
    markWorkflowGuideSeen();
    setHowTo(false);
    setStatus('Started a blank workflow');
  };

  const lessonTemplate = templateForLesson(lessonId);
  const { issues, issueByStep, open, hints } = useMemo(() => {
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
        data-testid="panel-workflow"
        className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[13px] text-accent">
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            Workflow <span className="text-faint">· {lessonTitle}</span>
          </span>
          {status && (
            <span role="status" data-testid="workflow-status" className="font-mono text-[11px] text-faint">
              {status}
            </span>
          )}
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

  return (
    <div
      data-testid="panel-workflow"
      className="flex h-full min-h-0 flex-col rounded-xl border border-line bg-panel p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[13px] text-accent">
          <GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Workflow</span>{' '}
          <span className="truncate text-faint">· {lessonTitle}</span>
        </span>
        <span role="status" data-testid="workflow-status" className="font-mono text-[11px] text-faint">
          {status}
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
              onClick={() => {
                if (doc.mode === mode) return;
                commit({ ...doc, mode });
              }}
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
        <input
          data-testid="workflow-title"
          aria-label="Workflow title"
          value={doc.title}
          placeholder={lessonTitle}
          maxLength={MAX_WORKFLOW_TITLE_CHARS}
          onChange={(event) => commit({ ...doc, title: event.target.value })}
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
      </div>

      {issues.length > 0 && (
        <ul data-testid="workflow-issues" className="mt-1 space-y-0.5">
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
        <span>Drag the dot on a card’s right edge to another card to draw an arrow</span>
      </div>

      <WorkflowCanvas
        doc={doc}
        issueByStep={issueByStep}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={moveNode}
        onUpdate={updateNode}
        onRemove={removeNode}
        onConnect={connect}
        onDisconnect={disconnect}
      />

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
          onClick={() => setConfirmClear(true)}
          className="btn btn-ghost ml-auto text-[12px] text-rose"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      </div>

      {confirmClear && (
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
            onClick={() => {
              clearWorkflow(lessonId);
              pending.current = null;
              setDoc(null);
              setSelectedId(null);
              setConfirmClear(false);
              setStatus('Workflow cleared');
            }}
            className="btn btn-ghost text-[12px] text-rose"
          >
            Clear it
          </button>
          <button
            type="button"
            data-testid="workflow-clear-no"
            onClick={() => setConfirmClear(false)}
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
    </div>
  );
}
