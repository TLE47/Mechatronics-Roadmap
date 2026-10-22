/**
 * A lesson page's code block, carried to the workbench as *scratch* (`app/src/tryLink.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` lists "try-it blocks" as the last content-side gap: a page shows code, and
 * the reader has no way to run it without opening the workbench, finding the lesson and pasting it by
 * hand. The link this module builds closes that: the page's own block travels in the URL and the
 * workbench opens on it with the lesson loaded.
 *
 * The rules, because a link from a page is the way a stranger first meets this app:
 *
 * 1. **The payload is the share codec, under its own key.** `#try=…` carries exactly what `#share=…`
 *    does (`shareLink.ts`): base64url of `{v, lesson, code}`, the same version, the same 2,000
 *    character cap, the same validation on the way in. A second codec would be a second thing to
 *    get wrong; what differs is only what the workbench does with it.
 * 2. **Scratch, not an attempt.** A page's block is the page's — not the reader's work, and not
 *    necessarily an answer to the exercise. So the workbench shows it in a scratch editor, runs it
 *    ungraded, files nothing against the lesson and leaves the learner's own draft alone. A snippet
 *    that silently became their draft would delete work they had done.
 * 3. **A refusal is stated, not silent.** A block too long for a URL is refused with its measured
 *    size, exactly as Share refuses one, so the page keeps its code and the author is told why.
 */

import {
  MAX_SHARE_URL,
  baseWithoutHash,
  decodeAttempt,
  encodeAttempt,
  type ShareResult,
  type SharedAttempt,
} from './shareLink.ts';

/** The hash key. Distinct from `share=` because the two mean different things to the workbench. */
export const TRY_HASH_KEY = 'try';

/** `#try=<payload>` — the fragment a page's try-it link carries. */
export function tryHash(attempt: SharedAttempt): string {
  return `#${TRY_HASH_KEY}=${encodeAttempt(attempt)}`;
}

/**
 * The absolute URL that opens `attempt` in the workbench, built from the target page's own `href`.
 *
 * The same measurement Share makes, for the same reason: a URL that will be cut in half is refused
 * here, where the author can shorten the block, rather than in a reader's browser.
 */
export function tryUrl(href: string, attempt: SharedAttempt): ShareResult {
  if (!attempt.code.trim()) return { ok: false, reason: 'no-code', characters: 0 };
  const url = `${baseWithoutHash(href)}?lesson=${encodeURIComponent(attempt.lesson)}${tryHash(attempt)}`;
  if (url.length > MAX_SHARE_URL) {
    return { ok: false, reason: 'too-long', characters: url.length };
  }
  return { ok: true, url, characters: url.length };
}

/**
 * The snippet a `#try=` fragment carries, or `null` when there is none or it does not decode.
 *
 * Read once, on arrival, and handed to the runner as a starting state. It is not persisted: a
 * reload without the fragment is an ordinary visit to that lesson.
 */
export function readTrySnippet(hash: string): SharedAttempt | null {
  if (!hash) return null;
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const prefix = `${TRY_HASH_KEY}=`;
  if (!fragment.startsWith(prefix)) return null;
  return decodeAttempt(fragment.slice(prefix.length));
}
