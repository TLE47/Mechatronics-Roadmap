/**
 * The visual editor's state (`app/src/pythonBlocks/useBlockEditor.ts`).
 *
 * The hook owns the parsed program, the undo/redo stacks and where the next toolbox statement
 * lands. The code string stays the tab's: every edit is rendered here and handed back through
 * `onCode`, so checks, drafts and Run keep reading the one `main.py` they always read.
 *
 * Two directions of change meet in this hook:
 *
 * - an edit here renders the program and calls `onCode`; the `code` prop then changes to exactly
 *   what was emitted, and the effect must not parse it back (that would drop ids, selection and
 *   history on every keystroke-level change);
 * - an edit elsewhere — Python Code mode, a co-editor, a reset — changes `code` to text this hook
 *   did not emit, and the effect re-parses so the cards show the new program.
 *
 * `emitted` is the one value that tells them apart.
 */

import { useEffect, useRef, useState } from 'react';
import {
  type BlockFields,
  type BlockNode,
  type BlockProgram,
  isContainer,
  renderProgram,
} from './ast.ts';
import { parseProgram } from './parser.ts';
import {
  type InsertionPoint,
  ROOT_INSERTION,
  bodyOf,
  duplicateNode,
  insertNode,
  locateNode,
  moveNode,
  moveNodeTo,
  removeNode,
  updateNode,
} from './operations.ts';
import { readBlockSettings, writeBlockSettings } from './settings.ts';

const HISTORY_LIMIT = 50;

interface BlockEditor {
  program: BlockProgram;
  /** The statement the workspace draws as selected, if any. */
  selectedId: string | null;
  /** Where a toolbox tap inserts. */
  insertion: InsertionPoint;
  recent: string[];
  canUndo: boolean;
  canRedo: boolean;
  /** Set an insertion point and select a statement, from a card or an "add" control. */
  select: (nodeId: string | null, bodyId: string | null, index: number) => void;
  /** Put the next statement at the end of a suite (or the program's own body for null). */
  insertAtEnd: (bodyId: string | null) => void;
  /** Put a statement at one exact point, which is what a dragged toolbox block names. */
  insertAt: (bodyId: string | null, index: number, template: BlockNode, itemId?: string) => void;
  insert: (template: BlockNode, itemId?: string) => void;
  editField: (id: string, fields: Partial<BlockFields>) => void;
  remove: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  /** Move a statement to the point a dragged card named; false when that is its own place. */
  moveTo: (id: string, bodyId: string | null, index: number) => boolean;
  duplicate: (id: string) => void;
  /** Move a statement into the suite of the container just above it. */
  nest: (id: string | null) => void;
  /** Move a statement out of its suite, directly below the container that held it. */
  unnest: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
}

export function useBlockEditor(
  code: string,
  onCode: (next: string) => void,
  /** False while the Visual face is hidden; parsing every keystroke in Python Code mode is waste. */
  active = true
): BlockEditor {
  const [program, setProgram] = useState(() => parseProgram(code));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<InsertionPoint>(ROOT_INSERTION);
  const [recent, setRecent] = useState<string[]>(() => readBlockSettings().recent);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const programRef = useRef(program);
  programRef.current = program;
  const pastRef = useRef<BlockProgram[]>([]);
  const futureRef = useRef<BlockProgram[]>([]);
  const emitted = useRef(code);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const emit = (next: BlockProgram) => {
    const text = renderProgram(next);
    emitted.current = text;
    onCodeRef.current(text);
  };

  useEffect(() => {
    // Hidden, the hook keeps the program it has. Becoming visible re-reads the prop, which is what
    // makes a round trip through Python Code reflect whatever was typed there.
    if (!active) return;
    if (code === emitted.current) return;
    // Text this hook did not write: Python Code mode, a co-editor, a reset. Parse it fresh and
    // forget a history that no longer describes the program on screen.
    emitted.current = code;
    const next = parseProgram(code);
    programRef.current = next;
    pastRef.current = [];
    futureRef.current = [];
    setProgram(next);
    setSelectedId(null);
    setInsertion({ bodyId: null, index: 0 });
    setCanUndo(false);
    setCanRedo(false);
  }, [code, active]);

  const commit = (next: BlockProgram, select: string | null = null) => {
    pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), programRef.current];
    futureRef.current = [];
    programRef.current = next;
    setProgram(next);
    setSelectedId(select);
    setCanUndo(true);
    setCanRedo(false);
    emit(next);
  };

  const remember = (itemId: string) => {
    const next = [itemId, ...recent.filter((id) => id !== itemId)].slice(0, 8);
    setRecent(next);
    writeBlockSettings({ recent: next });
  };

  const undo = () => {
    const previous = pastRef.current[pastRef.current.length - 1];
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [programRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT);
    programRef.current = previous;
    setProgram(previous);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    emit(previous);
  };

  const redo = () => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-(HISTORY_LIMIT - 1)), programRef.current];
    programRef.current = next;
    setProgram(next);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    emit(next);
  };

  const insert = (template: BlockNode, itemId?: string) => {
    const current = programRef.current;
    const body = bodyOf(current, insertion.bodyId) ?? current.nodes;
    const index = Math.max(0, Math.min(insertion.index, body.length));
    const result = insertNode(current, { bodyId: insertion.bodyId, index }, template);
    commit(result.program, result.id);
    setInsertion({ bodyId: insertion.bodyId, index: index + 1 });
    if (itemId) remember(itemId);
  };

  const select = (nodeId: string | null, bodyId: string | null, index: number) => {
    setSelectedId(nodeId);
    setInsertion({ bodyId, index });
  };

  const insertAtEnd = (bodyId: string | null) => {
    const body = bodyOf(programRef.current, bodyId);
    setSelectedId(bodyId);
    setInsertion({ bodyId, index: body?.length ?? 0 });
  };

  /**
   * Insert where a dragged element was released.
   *
   * The point is the drop target's, not the last tap's: a learner who drops a `print` between the
   * loop and the call is asking for that line, and making them tap again would be the editor asking
   * twice. The follow-up insertion point moves below the new statement, so a tap after a drop
   * continues where the drop ended.
   */
  const insertAt = (
    bodyId: string | null,
    index: number,
    template: BlockNode,
    itemId?: string
  ) => {
    const result = insertNode(programRef.current, { bodyId, index }, template);
    const length = bodyOf(result.program, bodyId)?.length ?? 0;
    commit(result.program, result.id);
    setInsertion({ bodyId, index: Math.max(0, Math.min(index + 1, length)) });
    if (itemId) remember(itemId);
  };

  const editField = (id: string, fields: Partial<BlockFields>) =>
    commit(updateNode(programRef.current, id, fields), id);

  const remove = (id: string) => commit(removeNode(programRef.current, id));
  const move = (id: string, direction: -1 | 1) =>
    commit(moveNode(programRef.current, id, direction), id);

  const moveTo = (id: string, bodyId: string | null, index: number) => {
    const next = moveNodeTo(programRef.current, id, { bodyId, index });
    // A drop on the statement's own place is not an edit, so it must not cost an undo step, and it
    // must not sound like a placement either.
    if (next === programRef.current) return false;
    commit(next, id);
    return true;
  };

  const duplicate = (id: string) => {
    const result = duplicateNode(programRef.current, id);
    if (!result) return;
    commit(result.program, result.id);
    setInsertion({ ...insertion, index: insertion.index + 1 });
  };

  /**
   * The keyboard's Indent: put the statement inside the container above it.
   *
   * The previous sibling has to be a suite — `if`, `for`, `while`, `def`, `try` — because there is
   * no other place "inside" could mean. Anything else leaves the program alone and, because the
   * program is returned unchanged, it costs no undo step.
   */
  const nest = (id: string | null) => {
    if (!id) return;
    const located = locateNode(programRef.current, id);
    if (!located || located.index === 0) return;
    const siblings = bodyOf(programRef.current, located.bodyId);
    const above = siblings?.[located.index - 1];
    if (!above || !isContainer(above.kind)) return;
    const next = moveNodeTo(programRef.current, id, {
      bodyId: above.id,
      index: above.body.length,
    });
    if (next === programRef.current) return;
    commit(next, id);
  };

  /**
   * The keyboard's Dedent: lift the statement out of its suite, just below its container.
   *
   * A statement already at the program's own level has no suite to leave, so the press does nothing
   * and no undo step appears for an operation that never happened.
   */
  const unnest = (id: string | null) => {
    if (!id) return;
    const located = locateNode(programRef.current, id);
    if (!located || located.bodyId === null) return;
    const parent = locateNode(programRef.current, located.bodyId);
    if (!parent) return;
    const next = moveNodeTo(programRef.current, id, {
      bodyId: parent.bodyId,
      index: parent.index + 1,
    });
    if (next === programRef.current) return;
    commit(next, id);
  };

  return {
    program,
    selectedId,
    insertion,
    recent,
    canUndo,
    canRedo,
    select,
    insertAtEnd,
    insertAt,
    insert,
    editField,
    remove,
    move,
    moveTo,
    duplicate,
    nest,
    unnest,
    undo,
    redo,
  };
}
