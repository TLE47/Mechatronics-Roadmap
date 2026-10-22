/**
 * A lesson and the code in its editor, carried in a URL fragment.
 *
 * `docs/PLAN-2.0-GAP.md` lists "share links, ask for help" as missing. The moment that needs it is
 * specific: a learner is stuck, their attempt is 30 lines, and the person who could help is not at
 * their screen. Screenshots lose the code and paste into the wrong lesson; a link that opens *this*
 * lesson with *this* code is the smallest thing that works.
 *
 * The rules, because a URL is the most public thing this app emits:
 *
 * 1. **The fragment only.** `#share=…` never leaves the browser: GitHub Pages never sees it, it does
 *    not appear in the host's logs, and a link with no code is just `?lesson=…`. The payload is
 *    base64url — transport-safe, not encryption — and the UI says that plainly rather than implying
 *    a privacy it does not have.
 * 2. **A measured length, not a guessed one.** Links get truncated in chat and mail. The whole URL is
 *    capped at `MAX_SHARE_URL` (2000 characters — the conservative end of what clients keep), and a
 *    refusal says the measured size so the learner can decide what to trim.
 * 3. **Nothing to share is not a link.** Whitespace-only code is `no-code`, so the button cannot
 *    produce a URL that silently opens the starter.
 * 4. **Decoding is validation.** A fragment out of a chat window is untrusted input: the version,
 *    the alphabet, the JSON shape, the two field types and the same length cap are all checked, and
 *    anything else answers `null` — the workbench then opens normally instead of half-applying
 *    someone's malformed link.
 * 5. **Round-trip or it is a bug.** `encodeAttempt`/`decodeAttempt` are pure and symmetric for any
 *    string JavaScript can hold — emoji included — which is what `npm run test:share` pins.
 */

/** The hash key, so `#share=…` cannot collide with anything else the app puts there. */
export const SHARE_HASH_KEY = 'share';
/** Bumped when the payload's shape changes; an older link decodes to `null` rather than guessing. */
export const SHARE_VERSION = 1;
/** The whole URL, in characters. 2000 is what chat clients and mail keep before truncating. */
export const MAX_SHARE_URL = 2000;
/** The same cap applied to a fragment that arrives from outside: a pasted link is untrusted. */
const MAX_PAYLOAD_CHARS = MAX_SHARE_URL;

export interface SharedAttempt {
  /** The lesson the code was written for, e.g. `05-control.T1.05a`. */
  lesson: string;
  /** The editor's text, exactly as the sender had it. */
  code: string;
}

export type ShareResult =
  | { ok: true; url: string; characters: number }
  | { ok: false; reason: 'no-code' | 'too-long'; characters: number };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked, because `String.fromCharCode(...bytes)` blows the argument limit on a long program.
  const CHUNK = 0x8000;
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('not base64url');
  // Padding is stripped on the way out; `atob` wants it back, and the length decides how much.
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The payload of a share link, without the `#share=` prefix. Pure: no URL, no DOM. */
export function encodeAttempt(attempt: SharedAttempt): string {
  const json = JSON.stringify({ v: SHARE_VERSION, lesson: attempt.lesson, code: attempt.code });
  return toBase64Url(new TextEncoder().encode(json));
}

/** A payload back into an attempt, or `null` when any part of it is not what this version wrote. */
export function decodeAttempt(payload: string): SharedAttempt | null {
  if (!payload || payload.length > MAX_PAYLOAD_CHARS) return null;
  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(payload));
  } catch {
    // Bad alphabet, bad padding, or bytes that are not UTF-8: all the same answer.
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { v, lesson, code } = parsed as Record<string, unknown>;
  if (v !== SHARE_VERSION) return null;
  if (typeof lesson !== 'string' || !lesson || lesson.length > 200) return null;
  if (typeof code !== 'string') return null;
  return { lesson, code };
}

/** `#share=<payload>` — the fragment a share link carries. */
export function shareHash(attempt: SharedAttempt): string {
  return `#${SHARE_HASH_KEY}=${encodeAttempt(attempt)}`;
}

/**
 * The fragment's attempt, or `null` when there is no share fragment or it does not decode.
 *
 * Accepts the hash with or without its `#`, because `location.hash` has one and a link a reader
 * pasted into a chat message may be quoted either way.
 */
export function readSharedAttempt(hash: string): SharedAttempt | null {
  if (!hash) return null;
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const prefix = `${SHARE_HASH_KEY}=`;
  if (!fragment.startsWith(prefix)) return null;
  return decodeAttempt(fragment.slice(prefix.length));
}

/**
 * The absolute URL for `attempt`, built from the page's own `href`.
 *
 * The query is rewritten to `?lesson=<id>` so the link opens the right entry even in a client that
 * strips the fragment, and any previous query, hash or `?view=theme` is dropped: a share link is
 * about one lesson and one piece of code. The result is measured, not assumed — a program too long
 * for a URL is refused here rather than pasted into a chat window that will cut it in half.
 */
export function shareUrl(href: string, attempt: SharedAttempt): ShareResult {
  if (!attempt.code.trim()) return { ok: false, reason: 'no-code', characters: 0 };
  const base = baseWithoutHash(href);
  const url = `${base}?lesson=${encodeURIComponent(attempt.lesson)}${shareHash(attempt)}`;
  if (url.length > MAX_SHARE_URL) {
    return { ok: false, reason: 'too-long', characters: url.length };
  }
  return { ok: true, url, characters: url.length };
}

/** The page's address with no query and no hash, so the link carries nothing stale. */
export function baseWithoutHash(href: string): string {
  try {
    const parsed = new URL(href);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // No absolute URL (the server render, or a caller with a bare path): cut at the first marker.
    return href.split(/[?#]/)[0];
  }
}
