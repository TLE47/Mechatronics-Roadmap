/**
 * The pair session's wires, as data (`app/src/pairing.ts`).
 *
 * `docs/PLAN-2.0-GAP.md` asks for **pair study** beside share links, and the workbench is a static
 * Pages bundle: there is no server to relay a room, and adding one would undo the reason this app
 * loads from a cache and runs offline. Two browsers can still talk directly — a WebRTC data channel —
 * and the only thing a data channel is missing without a server is *signalling*: the two descriptions
 * that let each side find the other. This app's answer is to carry those two descriptions by hand.
 *
 * So a session is three pieces of text:
 *
 * 1. **The invitation** — the host's offer, encoded as one pasteable line.
 * 2. **The reply** — the guest's answer to it.
 * 3. **Nothing else.** The two browsers are connected from then on; no address of them leaves the
 *    page, and nothing is posted anywhere.
 *
 * That shape is why this module exists apart from the browser: a pasteable protocol is a format, and
 * every way it can be wrong is a rule. A prefix that says which version wrote it, a base64url
 * alphabet so a client that line-wraps does not corrupt it, a description whose `type` is one of the
 * two SDP kinds, and a length cap on both the signal and the messages the channel carries afterwards
 * (a lesson's code, the lesson id, the sender's handle, and — once two people co-edit one file — the
 * batches of character ops [`collab.ts`](collab.ts) defines).
 *
 * What it deliberately does **not** do is apply anything. `parseMessage` returns data; the caller
 * decides whether an attempt is offered, and a learner still presses the button that replaces their
 * draft. A parse is never a write.
 */

import { COLLAB_MAX_TEXT, OPS_PER_MESSAGE, fromWire, toWire, type CollabOp, type WireOp } from './collab.ts';

/** The prefix on an invitation or a reply: version first, so a stale paste says so. */
export const PAIR_PREFIX = 'mechalab-pair-1:';

/** Characters a signal may take. Two browsers on different networks gather more candidates than two
 * tabs on one machine (~650 characters measured), and a description twice that is still a paste. */
export const SIGNAL_MAX_CHARS = 16000;

/** Characters an attempt may carry: a lesson file, not a repository. */
export const ATTEMPT_MAX_CHARS = 24000;

export type PairMessageKind =
  | 'hello'
  | 'lesson'
  | 'attempt'
  | 'collab-start'
  | 'collab-ops'
  | 'collab-stop'
  | 'bye';

export interface HelloMessage {
  v: 1;
  kind: 'hello';
  /** The sender's handle, so the other person is a name rather than "peer". */
  from: string;
  /** The lesson they are on, so the session can say where each person is. */
  lesson: string;
}

export interface LessonMessage {
  v: 1;
  kind: 'lesson';
  lesson: string;
}

export interface AttemptMessage {
  v: 1;
  kind: 'attempt';
  lesson: string;
  code: string;
}

export interface ByeMessage {
  v: 1;
  kind: 'bye';
}

/**
 * Their editor is now this document.
 *
 * The text travels rather than a transcript: both sides seed the same ids from it
 * (`CollabText.seed`), so opening a co-editing session is one message and not one per character.
 */
export interface CollabStartMessage {
  v: 1;
  kind: 'collab-start';
  lesson: string;
  text: string;
}

/** One edit, as the ops that describe it. A paste is several of these, in order. */
export interface CollabOpsMessage {
  v: 1;
  kind: 'collab-ops';
  lesson: string;
  ops: WireOp[];
}

/** Why co-editing stopped, so the other side's sentence is the true one. */
export type CollabStopReason = 'left' | 'lesson' | 'declined';

export interface CollabStopMessage {
  v: 1;
  kind: 'collab-stop';
  lesson: string;
  reason: CollabStopReason;
}

export type PairMessage =
  | HelloMessage
  | LessonMessage
  | AttemptMessage
  | CollabStartMessage
  | CollabOpsMessage
  | CollabStopMessage
  | ByeMessage;

/** Two-word handles: `Brave Otter`, `Quiet Lantern`. Read aloud, they are a name. */
const ADJECTIVES = [
  'Brave',
  'Quiet',
  'Bright',
  'Steady',
  'Curious',
  'Patient',
  'Swift',
  'Kind',
  'Clever',
  'Calm',
  'Bold',
  'Gentle',
];

const NOUNS = [
  'Otter',
  'Lantern',
  'Compass',
  'Heron',
  'Sparrow',
  'Falcon',
  'Beacon',
  'Badger',
  'Anchor',
  'Maple',
  'Cobalt',
  'Finch',
];

/**
 * A handle for this tab.
 *
 * `random` is injected so a test can pin the words instead of asserting they exist: the caller passes
 * `Math.random`, and a suite passes a fixed sequence.
 */
export function handleFrom(random: () => number = Math.random): string {
  const pick = (list: string[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

/** Base64url, the alphabet a link or a chat box cannot mangle. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

/** The two SDP kinds a session ever exchanges. */
export type SignalKind = 'offer' | 'answer';

export interface Signal {
  kind: SignalKind;
  sdp: string;
}

export interface DecodedSignal {
  ok: boolean;
  signal: Signal | null;
  /** Why the paste was refused, in a sentence the sheet can show. */
  reason: string | null;
}

/**
 * An invitation or reply, as the one line a person copies.
 *
 * Only `type` and `sdp` travel: ICE gathering is finished before this is built (the hook waits for
 * it), so there is nothing else in a description that the other side needs.
 */
export function encodeSignal(signal: Signal): string {
  return `${PAIR_PREFIX}${toBase64Url(JSON.stringify({ t: signal.kind, d: signal.sdp }))}`;
}

/**
 * Read a pasted invitation or reply.
 *
 * The refusals are separate sentences because they are separate mistakes: the wrong text entirely, a
 * session from another build, a description of the wrong kind for the box it was pasted into (`the
 * invitation` where a `reply` belongs), and one too long to be either.
 */
export function decodeSignal(text: string, expected: SignalKind): DecodedSignal {
  const refused = (reason: string): DecodedSignal => ({ ok: false, signal: null, reason });
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return refused('Nothing was pasted.');
  if (trimmed.length > SIGNAL_MAX_CHARS) {
    return refused(`That text is ${trimmed.length.toLocaleString()} characters — too long to be a session code.`);
  }
  if (!trimmed.toLowerCase().startsWith(PAIR_PREFIX)) {
    return refused('That is not a session code from this workbench.');
  }
  const body = trimmed.slice(PAIR_PREFIX.length);
  if (!body) return refused('That session code is empty.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(body));
  } catch {
    return refused('That session code was cut off or altered — copy it again from the other workbench.');
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  if (record.t !== 'offer' && record.t !== 'answer') return refused('That session code is not a connection description.');
  if (typeof record.d !== 'string' || record.d.length < 20) return refused('That session code has no description in it.');
  if (record.t !== expected) {
    return refused(
      expected === 'answer'
        ? 'That is an invitation — paste the reply here instead.'
        : 'That is a reply, not an invitation.'
    );
  }
  return { ok: true, signal: { kind: record.t, sdp: record.d }, reason: null };
}

/** A short lesson label for the session status: `P.2`, or the raw id when it is not one. */
export function lessonLabel(lesson: string): string {
  return lesson.trim() || 'a lesson';
}

/** How many lines an attempt has, ignoring a trailing newline. */
export function attemptLines(code: string): number {
  const text = String(code ?? '').replace(/\s+$/, '');
  return text ? text.split('\n').length : 0;
}

export function helloMessage(from: string, lesson: string): HelloMessage {
  return { v: 1, kind: 'hello', from, lesson };
}

export function lessonMessage(lesson: string): LessonMessage {
  return { v: 1, kind: 'lesson', lesson };
}

export function attemptMessage(lesson: string, code: string): AttemptMessage {
  return { v: 1, kind: 'attempt', lesson, code };
}

export function byeMessage(): ByeMessage {
  return { v: 1, kind: 'bye' };
}

export function collabStartMessage(lesson: string, text: string): CollabStartMessage {
  return { v: 1, kind: 'collab-start', lesson, text };
}

export function collabOpsMessage(lesson: string, ops: CollabOp[]): CollabOpsMessage {
  return { v: 1, kind: 'collab-ops', lesson, ops: toWire(ops) };
}

export function collabStopMessage(lesson: string, reason: CollabStopReason): CollabStopMessage {
  return { v: 1, kind: 'collab-stop', lesson, reason };
}

/**
 * Read one message off the channel, or refuse it.
 *
 * A data channel is the other browser talking, and "the other browser" is a program: a malformed
 * message is a bug or a probe, not a person. Every field is checked against a rule, an unknown kind
 * is dropped, and an attempt past the length cap is refused rather than truncated — a code file cut
 * in half would land in an editor as someone's work with its ending missing.
 */
export function parseMessage(raw: unknown): PairMessage | null {
  if (typeof raw !== 'string' || raw.length > ATTEMPT_MAX_CHARS + 1024) return null;
  // A co-editing op batch is the same order of size as an attempt, and the message that starts a
  // session carries the whole text: both fit the same ceiling, which is why it is one number.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  if (record.v !== 1) return null;
  const lesson = typeof record.lesson === 'string' ? record.lesson.trim() : '';
  switch (record.kind) {
    case 'hello':
      return typeof record.from === 'string' && record.from.trim() && lesson
        ? { v: 1, kind: 'hello', from: record.from.trim().slice(0, 40), lesson }
        : null;
    case 'lesson':
      return lesson ? { v: 1, kind: 'lesson', lesson } : null;
    case 'attempt':
      if (!lesson) return null;
      if (typeof record.code !== 'string' || record.code.length > ATTEMPT_MAX_CHARS) return null;
      return { v: 1, kind: 'attempt', lesson, code: record.code };
    case 'collab-start':
      if (!lesson) return null;
      if (typeof record.text !== 'string' || record.text.length > COLLAB_MAX_TEXT) return null;
      return { v: 1, kind: 'collab-start', lesson, text: record.text };
    case 'collab-ops': {
      if (!lesson) return null;
      // The ops are the other browser's account of an edit, so they are read by the same rules a
      // document applies them by: a batch that does not parse is refused whole, never half-applied.
      const ops = fromWire(record.ops);
      if (!ops || ops.length > OPS_PER_MESSAGE) return null;
      return { v: 1, kind: 'collab-ops', lesson, ops: toWire(ops) };
    }
    case 'collab-stop':
      if (!lesson) return null;
      if (record.reason !== 'left' && record.reason !== 'lesson' && record.reason !== 'declined') {
        return null;
      }
      return { v: 1, kind: 'collab-stop', lesson, reason: record.reason };
    case 'bye':
      return { v: 1, kind: 'bye' };
    default:
      return null;
  }
}

/**
 * What the session says it is doing.
 *
 * The sheet's status line and the runner's badge read this, so the two cannot describe one connection
 * two ways.
 */
export function pairSummary(state: string, peer: string | null): string {
  switch (state) {
    case 'offering':
      return 'Waiting for their reply.';
    case 'joining':
      return 'Send them the reply, then connect.';
    case 'connected':
      return peer ? `Connected to ${peer}.` : 'Connected.';
    case 'closed':
      return 'The session ended.';
    case 'error':
      return 'The session could not connect.';
    default:
      return 'Not in a session.';
  }
}
