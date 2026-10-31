/**
 * The workflow editor (`components/workflow/useWorkflowEditor.ts`).
 *
 * One owner for the workflow document and the actions that change it. The panel, the canvas, the
 * press menu, the inspector and the keyboard all call the commands this hook returns; none of them
 * carries a document rule of its own, and a new canvas action is added here once (plus its surface)
 * instead of being wired into the panel's JSX.
 *
 * The layers, outside-in:
 *
 * - `WorkflowPanel.tsx` — layout and view state: which guide, picker, menu or confirm is open.
 * - this hook — the document, its selected card/arrow, its history, its pending save, its clipboard
 *   and one command per action, each writing through `commit` and saying what happened in `status`.
 * - `workflowEdits.ts` — the document algebra, pure and testable without React.
 * - `workflow.ts`, `workflowProcesses.ts`, `workflowHistory.ts`, `workflowClipboard.ts` — the model,
 *   lanes, the history arithmetic and the card clip.
 *
 * The write path is unchanged from the panel's: an edit stamps `updatedAt`, lands on `doc`, and is
 * filed under the lesson it was typed in by a short debounce. Undo walks the same path backwards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_EDGES,
  MAX_STEPS,
  addWorkflowNode,
  emptyWorkflow,
  type EdgeRoute,
  type PortKind,
  type StepKind,
  type WorkflowDoc,
  type WorkflowEdgeType,
  type WorkflowIssue,
  type WorkflowNode,
  type WorkflowSide,
} from '../../workflow.ts';
import * as edits from '../../workflowEdits.ts';
import { clipCard, pasteCard, type CardClipboard } from '../../workflowClipboard.ts';
import {
  emptyHistory,
  recordHistory,
  stepHistory,
  type WorkflowHistory,
} from '../../workflowHistory.ts';
import { clearWorkflow, readWorkflow, saveWorkflow } from '../../workflowStore.ts';
import type { WorkflowTemplate } from '../../workflowTemplates.ts';
import { useLanes } from './useLanes.ts';
import type { LinkDraft } from './useLinking.ts';

const NOT_SAVED = 'Not saved — storage is blocked or full';

export function useWorkflowEditor(lessonId: string, lessonTitle: string) {
  const [doc, setDoc] = useState<WorkflowDoc | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // One selection at a time: a card or an arrow. The arrow's inspector is the only place a kind is
  // chosen, so opening it closes the card ring — two highlighted things would leave "which one does
  // the palette edit?" to be guessed.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  // The clear confirmation is editor state, not layout: an undo has to dismiss it too.
  const [clearOpen, setClearOpen] = useState(false);
  // One card's words and look, waiting to be pasted: in memory only, like a selection. Copying the
  // same card twice keeps one clip, and a lesson switch does not throw it away.
  const [clipboard, setClipboard] = useState<CardClipboard | null>(null);
  const [historySize, setHistorySize] = useState({ past: 0, future: 0 });

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

  // Undo is the same write path walked backwards: `remember` files the document an edit is about
  // to replace, `write` lands the edit, and a restore calls `write` without filing (or undo would
  // record itself). History is memory only, and starts empty on every lesson.
  const history = useRef<WorkflowHistory<WorkflowDoc | null>>(emptyHistory());
  const syncHistory = () =>
    setHistorySize({ past: history.current.past.length, future: history.current.future.length });

  const write = (next: WorkflowDoc) => {
    const stamped = { ...next, updatedAt: Date.now() };
    setDoc(stamped);
    pending.current = { lesson: lessonId, doc: stamped };
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };

  /** A keystroke in a focused field is a burst; a click, a drag or a key on the paper is one step. */
  const remember = (current: WorkflowDoc | null) => {
    const typing = Boolean(document.activeElement?.closest('input, textarea, select'));
    history.current = recordHistory(history.current, current, Date.now(), typing);
    syncHistory();
  };

  const commit = (next: WorkflowDoc) => {
    remember(doc);
    write(next);
  };

  /** Put a state back. `null` is the lesson's cleared state, not a document with no cards. */
  const restore = (next: WorkflowDoc | null) => {
    setSelectedId(null);
    setSelectedEdgeId(null);
    setClearOpen(false);
    if (next) {
      write(next);
      return;
    }
    clearWorkflow(lessonId);
    pending.current = null;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setDoc(null);
  };

  const undo = () => {
    const step = stepHistory(history.current, doc, true);
    if (!step) {
      setStatus('Nothing to undo');
      return;
    }
    history.current = step.history;
    syncHistory();
    restore(step.value);
    setStatus('Undone');
  };

  const redo = () => {
    const step = stepHistory(history.current, doc, false);
    if (!step) {
      setStatus('Nothing to redo');
      return;
    }
    history.current = step.history;
    syncHistory();
    restore(step.value);
    setStatus('Redone');
  };

  /** A card press clears the arrow inspector: one selection, so the palette edits what is ringed. */
  const selectNode = (id: string | null) => {
    setSelectedId(id);
    if (id) setSelectedEdgeId(null);
  };

  const selectEdge = (id: string | null) => {
    setSelectedEdgeId(id);
    if (id) setSelectedId(null);
  };

  // The lane interaction owns creation, assignment, renaming, removal and the caret a new lane
  // takes; it is handed the document, the write that owns it and the two view callbacks it needs.
  const lanes = useLanes({
    doc,
    commit,
    flush,
    say: setStatus,
    select: selectNode,
  });

  useEffect(() => {
    flush();
    setDoc(readWorkflow(lessonId));
    setSelectedId(null);
    setSelectedEdgeId(null);
    setStatus('');
    setClearOpen(false);
    history.current = emptyHistory();
    setHistorySize({ past: 0, future: 0 });
    lanes.setFocusLane(null);
  }, [lessonId, flush, lanes.setFocusLane]);

  // Leaving the card is leaving the editor: the pending write lands with the lesson id it was typed
  // under, and an unmount cannot drop a keystroke.
  useEffect(() => () => flush(), [flush]);

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    if (doc) commit(edits.editNode(doc, id, patch));
  };

  const setNodeAnnotation = (id: string, field: 'note' | 'lesson', value: string) => {
    if (doc) commit(edits.annotateNode(doc, id, field, value));
  };

  const moveNode = (id: string, x: number, y: number) => {
    if (!doc) return;
    const node = doc.nodes.find((entry) => entry.id === id);
    if (!node || (node.x === x && node.y === y)) return;
    commit(edits.editNode(doc, id, { x, y }));
  };

  /** A frame drag reports every member, so the whole move is one document and one write. */
  const moveNodes = (moves: edits.NodeMove[]) => {
    if (!doc) return;
    const next = edits.moveNodes(doc, moves);
    if (next) commit(next);
  };

  const addNode = (kind: StepKind, at?: { x: number; y: number }) => {
    if (!doc) return;
    const next = addWorkflowNode(doc, kind, at);
    if (!next) {
      // The one place the bound is felt: a card that would not survive the next write is not added
      // at all, and the header says why. Flush first, so the previous add's "Saved" cannot land
      // half a second later and wipe the sentence that explains the refusal.
      flush();
      setStatus(`A workflow holds at most ${MAX_STEPS} cards — remove one before adding another`);
      return;
    }
    commit(next);
    selectNode(next.nodes[next.nodes.length - 1].id);
    setStatus('');
  };

  const removeNode = (id: string) => {
    if (!doc) return;
    if (selectedId === id) setSelectedId(null);
    const removed = edits.removeNode(doc, id);
    if (!removed.doc) {
      // The history keeps the last card, so that is one undo away.
      remember(doc);
      restore(null);
      setStatus('Workflow cleared');
      return;
    }
    if (selectedEdgeId && !removed.doc.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
    commit(removed.doc);
    setStatus(removed.lostEdges ? 'Card removed — its arrows went with it' : 'Card removed');
  };

  const copyNode = (id: string) => {
    const node = doc?.nodes.find((entry) => entry.id === id);
    if (!node) return;
    setClipboard(clipCard(node));
    setStatus('Card copied');
  };

  /** A cut is a copy and the same removal `×` does, so its frames and lanes are kept in step. */
  const cutNode = (id: string) => {
    if (!doc?.nodes.some((node) => node.id === id)) return;
    copyNode(id);
    removeNode(id);
    setStatus('Card cut');
  };

  /** The card a drag from a dot asked for at the point the arrow was released. */
  const spawnLinked = (kind: StepKind, at: { x: number; y: number }, draft: LinkDraft) => {
    if (!doc) return;
    const result = edits.linkNewNode(doc, kind, at, draft);
    if (result === 'edges') {
      flush();
      setStatus(`A workflow holds at most ${MAX_EDGES} arrows — remove one before drawing another`);
      return;
    }
    if (result === 'steps') {
      flush();
      setStatus(`A workflow holds at most ${MAX_STEPS} cards — remove one before adding another`);
      return;
    }
    commit(result.doc);
    selectNode(result.id);
    setStatus('Card added and linked');
  };

  const pasteNode = (at?: { x: number; y: number }) => {
    if (!doc || !clipboard) return;
    const next = pasteCard(doc, clipboard, at);
    if (!next) {
      flush();
      setStatus(`A workflow holds at most ${MAX_STEPS} cards — remove one before pasting another`);
      return;
    }
    commit(next);
    selectNode(next.nodes[next.nodes.length - 1].id);
    setStatus('Card pasted');
  };

  const groupCards = (nodeIds: string[]) => {
    if (!doc) return;
    if (!nodeIds.length) {
      setStatus('Drag across cards to frame them');
      return;
    }
    commit(edits.groupCards(doc, nodeIds));
    selectNode(null);
    setStatus('');
  };

  const renameGroup = (index: number, title: string) => {
    if (doc) commit(edits.renameGroup(doc, index, title));
  };

  const removeGroup = (index: number) => {
    if (!doc) return;
    commit(edits.removeGroup(doc, index));
    setStatus('Frame removed');
  };

  const connect = (
    from: string,
    to: string,
    fromSide: WorkflowSide,
    toSide: WorkflowSide,
    fromPort: PortKind | null,
    toPort: PortKind | null
  ) => {
    if (!doc) return;
    const result = edits.connectNodes(doc, from, to, fromSide, toSide, fromPort, toPort);
    if (result === 'self') {
      setStatus('A card cannot feed itself — connect it to the next one instead');
      return;
    }
    if (result === 'duplicate') {
      setStatus('That arrow is already drawn');
      return;
    }
    if (result === 'edges') {
      setStatus(`A workflow holds at most ${MAX_EDGES} arrows — remove one before drawing another`);
      return;
    }
    commit(result.doc);
    setStatus('Arrow added');
  };

  const disconnect = (edgeId: string) => {
    if (!doc) return;
    commit(edits.removeEdge(doc, edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    setStatus('Arrow removed');
  };

  /** The arrow's kind. `flow` is stored as an absent field (see `withEdgeType`). */
  const setEdgeType = (edgeId: string, type: WorkflowEdgeType) => {
    if (!doc) return;
    commit(edits.patchEdge(doc, edgeId, (edge) => edits.edgeType(edge, type)));
    setStatus(`Arrow set to ${type}`);
  };

  const setEdgeLabel = (edgeId: string, label: string) => {
    if (doc) commit(edits.patchEdge(doc, edgeId, (edge) => edits.edgeText(edge, 'label', label)));
  };

  /** How an arrow bends. Presentation only, so it is stored as an absent field on the default. */
  const setEdgeRoute = (edgeId: string, route: EdgeRoute) => {
    if (doc) commit(edits.patchEdge(doc, edgeId, (edge) => edits.edgeRoute(edge, route)));
  };

  /**
   * The condition under which a decision takes this one exit.
   *
   * Written on the arrow rather than the card so two exits can differ. Clearing it removes the field,
   * and the branch card's own condition takes over again — the text an old document already shows.
   */
  const setEdgeGuard = (edgeId: string, guard: string) => {
    if (doc) commit(edits.patchEdge(doc, edgeId, (edge) => edits.edgeText(edge, 'guard', guard)));
  };

  /** Which socket one end of an arrow plugs into; `null` returns it to the kind's own. */
  const setEdgePort = (edgeId: string, end: 'from' | 'to', kind: PortKind | null) => {
    if (doc) commit(edits.patchEdge(doc, edgeId, (edge) => edits.edgePort(edge, end, kind)));
  };

  const setMode = (mode: WorkflowDoc['mode']) => {
    if (doc && doc.mode !== mode) commit({ ...doc, mode });
  };

  const setTitle = (title: string) => {
    if (doc) commit({ ...doc, title });
  };

  const applyTemplate = (template: WorkflowTemplate) => {
    const built = template.build();
    commit(built);
    selectNode(built.nodes[0]?.id ?? null);
    setStatus(`Started from “${template.name}”`);
  };

  const startBlank = () => {
    const built = emptyWorkflow('analysis', lessonTitle);
    commit(built);
    selectNode(built.nodes[0].id);
    setStatus('Started a blank workflow');
  };

  const clearIt = () => {
    if (!doc) return;
    remember(doc);
    restore(null);
    setStatus('Workflow cleared');
  };

  const focusIssue = (issue: WorkflowIssue) => {
    if (issue.stepId) selectNode(issue.stepId);
  };

  return {
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
    canPaste: clipboard !== null,
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
    applyTemplate,
    startBlank,
    clearOpen,
    armClear: () => setClearOpen(true),
    disarmClear: () => setClearOpen(false),
    clearIt,
    focusIssue,
    ...lanes,
  };
}
