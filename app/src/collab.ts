/**
 * Two people, one file (`app/src/collab.ts`).
 *
 * `docs/PLAN-2.0-GAP.md`'s share row ended at a hand-off: an attempt crossed a data channel and the
 * other person pressed Load. Live co-editing needs one more thing, and it is not a transport — it is
 * an answer to **what happens when both of you type at once**. That answer is a CRDT: every character
 * carries an identity, so two independently edited documents can be merged without asking a server,
 * a clock, or either person who was right.
 *
 * The structure is the simplest one that converges, an **RGA** (replicated growable array):
 *
 * - each character is a node with an id `{c, s}` — which workbench typed it, and its number in that
 *   workbench's sequence — and an **origin**, the id of the character it was typed after;
 * - the document is a depth-first walk of that tree, siblings in id order, so two characters typed
 *   after the same one get the same order on both machines without either side being told;
 * - deleting is a tombstone, never a splice. A character that is gone still holds its place, because
 *   other characters may have been typed after it and their origins point at it.
 *
 * Convergence is what this module exists to make true, so it is what its suite measures: the same ops
 * applied in either order produce the same text. What it deliberately does **not** try to be is a
 * general-purpose CRDT: no moves, no rich text, no per-character attributes, and no history of who
 * wrote which character. The editor holds the text; this holds the reason two copies of it can stay
 * equal.
 *
 * Three rules the rest of the app leans on:
 *
 * 1. **A local edit becomes ops by diffing.** The editor has no idea this module exists: it says "the
 *    text is now this", and the common prefix and suffix are found, the middle becomes deletes of the
 *    ids that were there and inserts of the characters that arrived. That is why one code path covers
 *    typing, pasting, Load Solution, Format and a slider rewrite — anything that changes the text.
 * 2. **An unknown reference is a placed character, not a lost one.** Only reachable if an op is lost,
 *    and a data channel does not lose one; still, a character typed after something this replica never
 *    saw goes to the start of the document and is counted, because dropping text is worse than a line
 *    in the wrong place.
 * 3. **Parsing is not writing.** `fromWire` returns ops or `null`; it never touches a document. The
 *    same rule as `pairing.ts`: the other browser is a program, and its message is data.
 */

/** Which workbench typed a character: the host or the guest. Two slots, because a session is two. */
export const COLLAB_CLIENT_MAX = 1;

/** Characters a co-edited document may carry — the same cap an attempt has, and for the same reason. */
export const COLLAB_MAX_TEXT = 24000;

/** Ops one channel message carries. A paste is split, never refused: the channel is ordered. */
export const OPS_PER_MESSAGE = 200;

export interface CharRef {
  /** The workbench that typed it. */
  c: number;
  /** Its turn in that workbench's sequence; 1-based, so `{c: 0, s: 0}` is never a character. */
  s: number;
}

export type CollabOp =
  | { kind: 'ins'; id: CharRef; after: CharRef | null; ch: string }
  | { kind: 'del'; id: CharRef };

/** An op as it travels: short keys, because two people's keystrokes share one channel with JSON. */
export interface WireOp {
  k: 'i' | 'd';
  c: number;
  s: number;
  /** The origin, as a pair, only on an insert. */
  a?: [number, number];
  /** The character, only on an insert: one UTF-16 unit, which is what a diff produces. */
  t?: string;
}

interface Node {
  id: CharRef;
  /** The character it was typed after; `null` for a document's first character. */
  after: CharRef | null;
  ch: string;
  deleted: boolean;
}

const keyOf = (id: CharRef): string => `${id.c}:${id.s}`;

/**
 * The order siblings are visited in: **newest first**.
 *
 * This is the RGA rule, and the direction matters. A document is seeded as a chain — each character
 * typed after the one before it — so the character after `a` is already `a`'s child. A character typed
 * between them is also a child of `a`, with a later id, and it has to come *before* the older child.
 * Visited in descending id order, "type `b` between `a` and `c`" lands where the person's cursor was.
 */
const compareIds = (a: CharRef, b: CharRef): number => b.c - a.c || b.s - a.s;

/**
 * One copy of a shared document.
 *
 * `client` is which slot this copy writes as. Every op that leaves this document carries ids from this
 * slot, which is why two copies can be merged: their ids never collide.
 */
export class CollabText {
  private nodes = new Map<string, Node>();
  /** The next sequence number per client, so a token's id is never reused. */
  private clock: number[] = [0, 0];
  private orderCache: Node[] | null = null;
  private textCache: string | null = null;

  /** Which workbench this copy writes as: every op it mints carries this slot. */
  readonly client: number;

  constructor(client: number) {
    this.client = client;
  }

  /**
   * A document seeded from text both workbenches already have.
   *
   * The ids are the same on both sides — the host's slot, numbered in document order — because that is
   * exactly the state the host would be in if it had typed the file one character at a time before the
   * session opened, and the guest has adopted it. Nothing needs to travel but the text itself, which is
   * what makes starting a co-editing session one message rather than a per-character transcript.
   */
  static seed(text: string, client: number): CollabText {
    const doc = new CollabText(client);
    let after: CharRef | null = null;
    for (let index = 0; index < text.length; index += 1) {
      const id: CharRef = { c: 0, s: index + 1 };
      doc.insertNode(id, after, text[index]);
      after = id;
    }
    // The host's sequence continues after the seed; the guest's starts at one.
    doc.clock[0] = text.length;
    return doc;
  }

  /** The document, materialized: tombstones keep their place but print nothing. */
  get text(): string {
    if (this.textCache === null) {
      this.textCache = this.order()
        .filter((node) => !node.deleted)
        .map((node) => node.ch)
        .join('');
    }
    return this.textCache;
  }

  /** How many characters are visible — what the status line counts. */
  get length(): number {
    return this.text.length;
  }

  /** The ids of the visible characters, in document order: the index-to-identity map a diff needs. */
  visibleIds(): CharRef[] {
    return this.order()
      .filter((node) => !node.deleted)
      .map((node) => node.id);
  }

  /**
   * Apply one op that this document has not generated.
   *
   * Returns whether it changed the document: a duplicate insert, a delete of a character already gone,
   * and a delete of a character this replica never had are all no-ops rather than errors, because a
   * channel that delivers something twice changes nothing.
   */
  apply(op: CollabOp): boolean {
    if (op.kind === 'ins') {
      const known = this.nodes.has(keyOf(op.id));
      if (!known) this.insertNode(op.id, op.after, op.ch);
      this.observe(op.id);
      if (op.after) this.observe(op.after);
      return !known;
    }
    const node = this.nodes.get(keyOf(op.id));
    if (!node || node.deleted) return false;
    node.deleted = true;
    this.invalidate();
    return true;
  }

  /** Whether this document has ever seen a character. */
  has(id: CharRef): boolean {
    return this.nodes.has(keyOf(id));
  }

  /**
   * Turn "the editor's text is now this" into ops, and apply them here.
   *
   * The same op list goes to the other workbench, which is the only reason both copies stay equal:
   * this is the one place a local edit becomes a shared one.
   */
  localOps(next: string): CollabOp[] {
    const prev = this.text;
    if (prev === next) return [];

    // Common prefix and suffix, so typing one character is one op and a paste is a run of them.
    const shortest = Math.min(prev.length, next.length);
    let prefix = 0;
    while (prefix < shortest && prev[prefix] === next[prefix]) prefix += 1;
    let suffix = 0;
    while (suffix < shortest - prefix && prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]) {
      suffix += 1;
    }

    const visible = this.order().filter((node) => !node.deleted);
    const ops: CollabOp[] = [];

    // What is gone: ids, not positions — the other side's indices may already be different.
    for (let index = prefix; index < prev.length - suffix; index += 1) {
      const node = visible[index];
      if (!node) continue;
      node.deleted = true;
      ops.push({ kind: 'del', id: node.id });
    }
    this.invalidate();

    // What arrived: a chain, each character typed after the one before it, so a run keeps its order
    // and a concurrent insert at the same place sorts between them by id.
    let after: CharRef | null = prefix > 0 && visible[prefix - 1] ? visible[prefix - 1].id : null;
    for (let index = prefix; index < next.length - suffix; index += 1) {
      const id = this.nextToken();
      this.insertNode(id, after, next[index]);
      ops.push({ kind: 'ins', id, after, ch: next[index] });
      after = id;
    }

    return ops;
  }

  /** Where a character sits in the visible text, or -1. Used by the suite to prove ids move with it. */
  indexOf(id: CharRef): number {
    const visible = this.order().filter((node) => !node.deleted);
    return visible.findIndex((node) => node.id.c === id.c && node.id.s === id.s);
  }

  /** The next id this document would mint — what a paste's ops carry. */
  private nextToken(): CharRef {
    const slot = this.client;
    this.clock[slot] = (this.clock[slot] ?? 0) + 1;
    return { c: slot, s: this.clock[slot] };
  }

  /** Keep the clock ahead of anything observed, so a later token cannot collide with it. */
  private observe(id: CharRef): void {
    this.clock[id.c] = Math.max(this.clock[id.c] ?? 0, id.s);
  }

  /**
   * Place a character in the tree.
   *
   * An origin this replica has never seen is treated as the document's start. That cannot happen on an
   * ordered channel; it is here so a lost message costs a character's position rather than the
   * character.
   */
  private insertNode(id: CharRef, after: CharRef | null, ch: string): void {
    const key = keyOf(id);
    if (this.nodes.has(key)) return;
    const origin = after && this.nodes.has(keyOf(after)) ? after : null;
    this.nodes.set(key, { id, after: origin, ch, deleted: false });
    this.invalidate();
  }

  /** The whole tree in document order, tombstones included, built once per change. */
  private order(): Node[] {
    if (this.orderCache) return this.orderCache;
    const children = new Map<string | null, Node[]>();
    for (const node of this.nodes.values()) {
      const parent = node.after ? keyOf(node.after) : null;
      const bucket = children.get(parent);
      if (bucket) bucket.push(node);
      else children.set(parent, [node]);
    }
    for (const bucket of children.values()) bucket.sort((a, b) => compareIds(a.id, b.id));

    // Iterative, because a seeded document is a chain: a 24,000-character file is a tree 24,000
    // levels deep, and a recursive walk would overflow the stack on the largest lesson there is.
    const out: Node[] = [];
    const stack: Node[] = [];
    const pushAll = (bucket: Node[] | undefined) => {
      if (!bucket) return;
      for (let index = bucket.length - 1; index >= 0; index -= 1) stack.push(bucket[index]);
    };
    pushAll(children.get(null));
    while (stack.length > 0) {
      const node = stack.pop() as Node;
      out.push(node);
      pushAll(children.get(keyOf(node.id)));
    }
    this.orderCache = out;
    return out;
  }

  private invalidate(): void {
    this.orderCache = null;
    this.textCache = null;
  }
}

/** Split a local edit into messages a channel can carry. Order is preserved; the channel keeps it too. */
export function chunkOps(ops: CollabOp[]): CollabOp[][] {
  const chunks: CollabOp[][] = [];
  for (let index = 0; index < ops.length; index += OPS_PER_MESSAGE) {
    chunks.push(ops.slice(index, index + OPS_PER_MESSAGE));
  }
  return chunks;
}

/** The wire form of one op, for a message this side is sending. */
export function toWire(ops: CollabOp[]): WireOp[] {
  return ops.map((op) =>
    op.kind === 'ins'
      ? {
          k: 'i' as const,
          c: op.id.c,
          s: op.id.s,
          ...(op.after ? { a: [op.after.c, op.after.s] as [number, number] } : {}),
          t: op.ch,
        }
      : { k: 'd' as const, c: op.id.c, s: op.id.s }
  );
}

function refFrom(c: unknown, s: unknown): CharRef | null {
  if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > COLLAB_CLIENT_MAX) return null;
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > 1_000_000_000) return null;
  return { c, s };
}

/**
 * Read a batch of ops off the channel, or refuse the whole message.
 *
 * All-or-nothing on purpose: a batch is one edit, and half a paste applied is a document neither
 * person typed. Every field is checked against a rule, and the batch's own size is a rule too.
 */
export function fromWire(raw: unknown): CollabOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > OPS_PER_MESSAGE) return null;
  const ops: CollabOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const id = refFrom(record.c, record.s);
    if (!id) return null;
    if (record.k === 'd') {
      ops.push({ kind: 'del', id });
      continue;
    }
    if (record.k !== 'i') return null;
    if (typeof record.t !== 'string' || record.t.length !== 1) return null;
    let after: CharRef | null = null;
    if (record.a !== undefined) {
      if (!Array.isArray(record.a) || record.a.length !== 2) return null;
      after = refFrom(record.a[0], record.a[1]);
      if (!after) return null;
    }
    ops.push({ kind: 'ins', id, after, ch: record.t });
  }
  return ops;
}
