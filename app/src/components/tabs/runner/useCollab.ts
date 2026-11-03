/**
 * The pair channel, read by the co-edit session (`runner/useCollab.ts`).
 *
 * The session itself is `runner/useCoEdit.ts`: the document both workbenches hold, the offer that
 * has to be answered, and the sentence that says why it stopped. What is *not* the session's is the
 * channel: four messages arrive on it, three of them belong to a document, and one — an attempt —
 * belongs to the tab, which offers it rather than applying it.
 *
 * This hook is that division, and it exists to delete a ref. The tab used to create
 * `usePairSession((message) => …)` at the top of its body and route into `coEditRef`, because the
 * channel was built before the session that reads it. Nothing else could be extracted while that
 * was true: `commitCode` read `coEditRef`, the pair handler wrote the session, and the session's
 * `accept` had to call a `selectLesson` declared a hundred lines below both. Now the transport is
 * asked for a session with no listener, this hook subscribes once the lesson functions exist, and
 * the tab holds no co-edit ref at all.
 */
import { useEffect } from 'react';
import { fromWire } from '../../../collab';
import type { PairSession } from '../../../usePairSession';
import { useCoEdit, type CoEdit } from './useCoEdit';

interface UseCollabInput {
  pair: PairSession;
  /** The lesson on screen. A shared document belongs to exactly one. */
  lessonId: string;
  /** The editor's text *now*, not the text the last render held. */
  readText: () => string;
  /** Put text in the editor without a history entry, and let the buffer follow it. */
  applyText: (text: string) => void;
  /** Open another lesson (an offer for an entry this workbench is not on). */
  selectLesson: (id: string) => void;
  /** File the accepted document as that lesson's draft. */
  saveText: (lesson: string, text: string) => void;
  /** Close the sheet the offer was accepted in. */
  onAccepted: () => void;
  /** Their attempt: the tab offers it, so the sheet closes and the card is what the learner sees. */
  onAttempt: (attempt: { lesson: string; code: string }) => void;
  /** Their offer to co-edit: the sheet that can answer it opens, because the question is about the editor. */
  onInvite: () => void;
}

/**
 * The co-edit session plus the channel that feeds it.
 *
 * The subscription is re-established after a render rather than memoised: `pair` is a fresh object
 * each render, and the listener it holds was already replaced on every render before this hook
 * existed. What changes is who owns the handler — this hook, instead of a ref in the tab.
 */
export function useCollab(input: UseCollabInput): CoEdit {
  const { pair, lessonId, readText, applyText, selectLesson, saveText, onAccepted } = input;
  const session = useCoEdit({
    pair,
    lessonId,
    readText,
    applyText,
    selectLesson,
    saveText,
    onAccepted,
  });
  const { receiveInvite, applyPeerOps, receiveStop } = session;
  const { onAttempt, onInvite } = input;

  useEffect(
    () =>
      pair.subscribe((message) => {
        if (message.kind === 'attempt') {
          onAttempt({ lesson: message.lesson, code: message.code });
          return;
        }
        if (message.kind === 'collab-start') {
          receiveInvite({ lesson: message.lesson, text: message.text });
          onInvite();
          return;
        }
        if (message.kind === 'collab-ops') {
          const ops = fromWire(message.ops);
          if (ops) applyPeerOps(ops);
          return;
        }
        if (message.kind === 'collab-stop') {
          // Their decision, so no stop is sent back: the two sides would keep telling each other it
          // is over. The session names what happened and touches no editor.
          receiveStop(message.reason);
        }
      }),
    [pair, onAttempt, onInvite, receiveInvite, applyPeerOps, receiveStop]
  );

  return session;
}
