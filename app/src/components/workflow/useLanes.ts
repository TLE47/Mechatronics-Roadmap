import { useState } from 'react';
import {
  MAX_LANES,
  moveNodeToLane,
  removeLane as withoutLane,
  renameLane as retitleLane,
  withLane,
  withLanes,
  withoutNodeFromLanes,
} from '../../workflowProcesses.ts';
import type { WorkflowDoc } from '../../workflow.ts';

/**
 * The lane interaction (`components/workflow/useLanes.ts`).
 *
 * A lane is an activity partition: a named box around the cards one group of people owns. The data
 * rules live in `workflowProcesses.ts`; the conversation around them lives here — which cards a
 * drawn box claims, whether another lane may still be added, the sentence the header says when it
 * may not, and the caret handoff that lets a keyboard name the lane it just made. A card belongs to
 * one lane, so “new lane” and the drawn box both move cards rather than duplicating a claim.
 *
 * `focusLane` is the index whose name field should take the caret, handed to the canvas and cleared
 * once the input has it. It is a view concern beside the selection, which is why `select(null)` runs
 * with a lane creation: the lane is the new subject, not the card that was ringed. A lesson switch
 * resets the document, so the panel resets this with it.
 */
export function useLanes({
  doc,
  commit,
  flush,
  say,
  select,
}: {
  doc: WorkflowDoc | null;
  commit: (next: WorkflowDoc) => void;
  flush: () => void;
  /** The header's one-line status: refusals and what just happened. */
  say: (message: string) => void;
  select: (id: string | null) => void;
}) {
  const [focusLane, setFocusLane] = useState<number | null>(null);

  /**
   * Append a lane holding `nodeIds`, or nothing when the move would leave more than `MAX_LANES`.
   *
   * Both ways into a new lane land here, so the default name and the caret handoff have one answer.
   * `withLane` takes the cards out of the lane they were in, so the count is read after the move: a
   * drawn box that empties one lane keeps the total where it was. The inspector's picker also checks
   * the bound before it moves the card at all, and that check stays its own (see `assignLane`).
   */
  const appendLane = (nodeIds: string[]): number | null => {
    if (!doc) return null;
    const lanes = withLane(doc.lanes ?? [], nodeIds, `Lane ${(doc.lanes?.length ?? 0) + 1}`);
    if (lanes.length > MAX_LANES) return null;
    commit({ ...doc, lanes });
    setFocusLane(lanes.length - 1);
    return lanes.length;
  };

  /** The partition a drawn box asked for — the frame gesture with a different claim. */
  const createLane = (nodeIds: string[]) => {
    if (!nodeIds.length) {
      say('Drag across cards to put them in a lane');
      return;
    }
    if (appendLane(nodeIds) === null) {
      say(`A workflow holds at most ${MAX_LANES} lanes — remove one before drawing another`);
      return;
    }
    select(null);
    say('');
  };

  /**
   * The inspector's lane picker: the keyboard's whole path to a partition.
   *
   * “New lane” appends one and hands its name field the caret; an existing lane moves the card
   * without duplicating its name; “No lane” drops the claim and keeps the card. The add is flushed
   * first, so a previous “Saved” cannot land half a second later and wipe the refusal.
   */
  const assignLane = (id: string, choice: 'none' | 'new' | number) => {
    if (!doc) return;
    if (choice === 'new') {
      // Checked before the move, not after it: the picker refuses a new lane at the bound even when
      // taking the card out of its old one would keep the total where it was.
      if ((doc.lanes?.length ?? 0) >= MAX_LANES) {
        flush();
        say(`A workflow holds at most ${MAX_LANES} lanes — remove one before adding another`);
        return;
      }
      appendLane([id]);
      return;
    }
    if (choice === 'none') {
      commit(withLanes(doc, withoutNodeFromLanes(doc.lanes ?? [], id)));
      return;
    }
    if (!doc.lanes?.[choice]) return;
    commit({ ...doc, lanes: moveNodeToLane(doc.lanes, id, choice) });
  };

  const renameLane = (index: number, title: string) => {
    if (!doc) return;
    commit({ ...doc, lanes: retitleLane(doc.lanes ?? [], index, title) });
  };

  const removeLane = (index: number) => {
    if (!doc) return;
    commit(withLanes(doc, withoutLane(doc.lanes ?? [], index)));
    say('Lane removed');
  };

  return { focusLane, setFocusLane, createLane, assignLane, renameLane, removeLane };
}
