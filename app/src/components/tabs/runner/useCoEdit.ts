/**
 * Co-editing one lesson (`app/src/collab.ts` over the pair session).
 *
 * Three things live here, and they are one concern: the document both workbenches hold, the offer
 * that has to be answered before an editor is replaced (`offered-never-applied`, the rule the share
 * link and the attempt card already follow), and the sentence that says why a session stopped.
 *
 * The tab renders it and asks it about every local write; nothing outside needs to know a session
 * is running. A peer's edit is applied outside the undo history, so ⌘Z still means "undo what I
 * typed", and it is written through `applyText` because the editor body belongs to the tab.
 */
import { useEffect, useRef, useState } from 'react';
import { COLLAB_MAX_TEXT, CollabText, type CollabOp } from '../../../collab';
import type { CollabStopReason } from '../../../pairing';
import type { PairSession } from '../../../usePairSession';

export interface CoEditSession {
  lesson: string;
  role: 'host' | 'guest';
  /** How many of their edits have landed here, which is what the status strip prints. */
  remote: number;
}

/** Their offer: a lesson and the text that would become the document. */
export interface CoEditInvite {
  lesson: string;
  text: string;
}

/** The two local reasons are not wire reasons: neither side needs telling about them. */
export type CoEditStopReason = CollabStopReason | 'offline' | 'too-long';

interface UseCoEditInput {
  /** The session the edits travel over. */
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
  /** Close the sheet the offer was made in. */
  onAccepted?: () => void;
}

export interface CoEdit {
  session: CoEditSession | null;
  invite: CoEditInvite | null;
  notice: string | null;
  /** Their offer, which the sheet shows until it is accepted or declined. */
  receiveInvite: (invite: CoEditInvite) => void;
  /** One edit from them, as ops. */
  applyPeerOps: (ops: CollabOp[]) => void;
  /** They ended it; this side only says so. */
  receiveStop: (reason: CollabStopReason) => void;
  /** This side changed the text: send the difference, if a session is running. */
  noteLocalEdit: (text: string) => void;
  start: () => void;
  accept: () => void;
  decline: () => void;
  stop: (reason: CoEditStopReason) => void;
}

export function useCoEdit({
  pair,
  lessonId,
  readText,
  applyText,
  selectLesson,
  saveText,
  onAccepted,
}: UseCoEditInput): CoEdit {
  const [session, setSession] = useState<CoEditSession | null>(null);
  const [invite, setInvite] = useState<CoEditInvite | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The shared document itself, and the lesson it belongs to. Absent is not co-editing.
  const docRef = useRef<{ doc: CollabText; lesson: string } | null>(null);
  // Keeps a peer's edit from being read as this workbench's own op to broadcast back at them.
  const applyingRef = useRef<boolean>(false);

  /**
   * Stop co-editing on this side, and tell the other one why.
   *
   * Only a local decision sends a message — a stop that arrived is answered by clearing the state, or
   * the two sides would keep telling each other it is over. The session's own `bye` covers leaving.
   */
  const stop = (reason: CoEditStopReason) => {
    const shared = docRef.current;
    docRef.current = null;
    setSession(null);
    setInvite(null);
    if (shared && (reason === 'lesson' || reason === 'left')) {
      pair.sendCollabStop(shared.lesson, reason);
    }
    setNotice(
      reason === 'lesson'
        ? 'Co-editing ended: this workbench moved to another lesson.'
        : reason === 'left'
          ? 'You stopped co-editing. Your editor is yours again.'
          : reason === 'declined'
            ? 'You turned down co-editing. Your editor was not touched.'
            : reason === 'too-long'
              ? `Co-editing stopped: the file passed ${COLLAB_MAX_TEXT.toLocaleString()} characters.`
              : 'The session ended, so co-editing stopped.'
    );
  };

  /**
   * Apply the other workbench's edit.
   *
   * The ops go into the shared document first, and the editor is handed the text that results: that
   * is the one write a peer's keystroke makes, and it is applied outside the undo history, so ⌘Z still
   * means "undo what I typed". A batch that changes nothing here (a duplicate the channel delivered
   * twice) does not touch the editor at all.
   */
  const applyPeerOps = (ops: CollabOp[]) => {
    const shared = docRef.current;
    if (!shared) return;
    let changed = 0;
    for (const op of ops) if (shared.doc.apply(op)) changed += 1;
    if (changed === 0) return;
    const next = shared.doc.text;
    if (next.length > COLLAB_MAX_TEXT) {
      stop('too-long');
      return;
    }
    applyingRef.current = true;
    try {
      applyText(next);
    } finally {
      applyingRef.current = false;
    }
    setSession((current) => (current ? { ...current, remote: current.remote + changed } : current));
  };

  /**
   * A local write is a shared one too.
   *
   * Typing, a paste, Format's rewrite, Load Solution and a slider all say the same thing — "the text
   * is now this" — and `localOps` is what turns that into characters to send, so one code path is
   * enough.
   */
  const noteLocalEdit = (text: string) => {
    const shared = docRef.current;
    if (!shared || applyingRef.current) return;
    if (text.length > COLLAB_MAX_TEXT) {
      stop('too-long');
      return;
    }
    const ops = shared.doc.localOps(text);
    if (ops.length > 0) pair.sendCollabOps(shared.lesson, ops);
  };

  /** Their offer: the text is a decision, not an edit, so the sheet asks first. */
  const receiveInvite = (offer: CoEditInvite) => {
    setInvite(offer);
    setNotice(null);
  };

  /** Their decision to end it: no stop is sent back, only the sentence that names what happened. */
  const receiveStop = (reason: CollabStopReason) => {
    docRef.current = null;
    setSession(null);
    setInvite(null);
    setNotice(
      reason === 'lesson'
        ? 'Co-editing ended: they moved to another lesson.'
        : reason === 'declined'
          ? 'They are not co-editing this lesson right now. Your editor was not touched.'
          : 'They stopped co-editing. Your editor is yours again.'
    );
  };

  /** Offer this lesson and this text as the document both of us edit — the host's side of it. */
  const start = () => {
    if (pair.state !== 'connected' || pair.role !== 'host' || docRef.current) return;
    const text = readText();
    if (text.length > COLLAB_MAX_TEXT) {
      setNotice(`Co-editing needs a file under ${COLLAB_MAX_TEXT.toLocaleString()} characters.`);
      return;
    }
    if (pair.sendCollabStart(lessonId, text) !== 'sent') {
      setNotice('The offer to co-edit did not reach them — the session is not open.');
      return;
    }
    docRef.current = { doc: CollabText.seed(text, 0), lesson: lessonId };
    setSession({ lesson: lessonId, role: 'host', remote: 0 });
    setNotice(null);
  };

  /** Take up their offer: their text becomes this document, and this editor becomes a shared one. */
  const accept = () => {
    const offer = invite;
    if (!offer) return;
    if (offer.text.length > COLLAB_MAX_TEXT) {
      setInvite(null);
      setNotice(`That file is over ${COLLAB_MAX_TEXT.toLocaleString()} characters, which co-editing will not carry.`);
      return;
    }
    // The lesson first: `selectLesson` loads that lesson's draft, and doing it while a shared document
    // is live would broadcast the draft as an edit of theirs.
    if (offer.lesson !== lessonId) selectLesson(offer.lesson);
    docRef.current = { doc: CollabText.seed(offer.text, 1), lesson: offer.lesson };
    applyingRef.current = true;
    try {
      applyText(offer.text);
    } finally {
      applyingRef.current = false;
    }
    saveText(offer.lesson, offer.text);
    setSession({ lesson: offer.lesson, role: 'guest', remote: 0 });
    setInvite(null);
    setNotice(null);
    onAccepted?.();
  };

  /** Turn down an offer without the editor moving, and let them know rather than leave them waiting. */
  const decline = () => {
    const lesson = invite?.lesson ?? lessonId;
    setInvite(null);
    pair.sendCollabStop(lesson, 'declined');
    setNotice('You turned down co-editing. Your editor was not touched.');
  };

  // A shared document belongs to one lesson. Moving this workbench elsewhere ends it — and says so on
  // both screens — rather than writing the next lesson's text into a document about another one.
  useEffect(() => {
    const shared = docRef.current;
    if (!shared || shared.lesson === lessonId) return;
    stop('lesson');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the lesson is the trigger
  }, [lessonId]);

  // A session that ends takes co-editing with it: there is no channel left to move text over, and a
  // document that still says it is shared while nothing moves is worse than a sentence saying it
  // stopped.
  useEffect(() => {
    if (pair.state === 'connected' || !docRef.current) return;
    stop('offline');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the session state is the trigger
  }, [pair.state]);

  return {
    session,
    invite,
    notice,
    receiveInvite,
    applyPeerOps,
    receiveStop,
    noteLocalEdit,
    start,
    accept,
    decline,
    stop,
  };
}
