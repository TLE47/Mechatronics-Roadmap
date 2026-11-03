/**
 * What a co-editing session says when it ends (`runner/collabNotice.ts`).
 *
 * The sentences used to be written twice inside `runner/useCoEdit.ts` — once for a stop this side
 * decided, once for one that arrived — and twice is where they drift: the local "moved to another
 * lesson" and the remote "they moved to another lesson" are different claims about the same event,
 * and only one of them may be repeated back over the wire. A table with a side is the smallest thing
 * that keeps the two honest, and it is pure, so `npm run test:collab` can hold every branch without
 * a browser or a channel.
 */
// The extension is deliberate: `scripts/test_collab.mjs` imports this module directly under Node's
// type stripping, which resolves the file rather than a bundler's extensionless specifier.
import { COLLAB_MAX_TEXT } from '../../../collab.ts';
import type { CollabStopReason } from '../../../pairing';

/** The two local reasons never travel: one is this tab's own decision, the other a failed channel. */
export type CollabNoticeReason = CollabStopReason | 'offline' | 'too-long';

/** Whose decision it was. A remote notice never claims an action this workbench did not take. */
export type CollabNoticeSide = 'local' | 'remote';

export function stopNotice(reason: CollabNoticeReason, side: CollabNoticeSide): string {
  if (side === 'remote') {
    if (reason === 'lesson') return 'Co-editing ended: they moved to another lesson.';
    if (reason === 'declined') {
      return 'They are not co-editing this lesson right now. Your editor was not touched.';
    }
    return 'They stopped co-editing. Your editor is yours again.';
  }
  if (reason === 'lesson') return 'Co-editing ended: this workbench moved to another lesson.';
  if (reason === 'left') return 'You stopped co-editing. Your editor is yours again.';
  if (reason === 'declined') return 'You turned down co-editing. Your editor was not touched.';
  if (reason === 'too-long') {
    return `Co-editing stopped: the file passed ${COLLAB_MAX_TEXT.toLocaleString()} characters.`;
  }
  // `offline`: the channel went first, so the session says that rather than blaming either person.
  return 'The session ended, so co-editing stopped.';
}
