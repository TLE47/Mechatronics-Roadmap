/**
 * A zip archive, written and read in the page (`app/src/backupZip.ts`).
 *
 * The workbench's data lives in five `localStorage` stores. Exporting them as five loose files means
 * five downloads and five pickers to get them back, so the backup is one `.zip` — and a zip is a
 * small enough format to own: a local header per file, a central directory, and an end-of-central-
 * directory record. Nothing here compresses (method 0, stored), because the payload is JSON and code
 * text that is mostly already under a megabyte, and a stored archive can be written and read without
 * a dependency, a worker or an async decompressor.
 *
 * `readZip` is the strict half. A backup that cannot be read must say which way it failed, so the UI
 * can tell "you picked the wrong file" apart from "this file is half-downloaded" apart from "your
 * unzip tool re-compressed it" — that last one is a real case, and the answer is to use the file as it
 * was downloaded rather than to quietly restore nothing.
 *
 * Pure functions over bytes: no DOM, no storage, so `scripts/test_backup.mjs` runs it under Node's
 * type stripping and checks the CRCs against the published vector.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export type ZipFailure = 'not-a-zip' | 'truncated' | 'compressed' | 'unsupported';

export type ZipRead = { ok: true; entries: ZipEntry[] } | { ok: false; reason: ZipFailure };

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** Bit 11: file names are UTF-8. Set on every entry, so a lesson id with a `·` survives a round trip. */
const FLAG_UTF8 = 0x0800;
const VERSION = 20;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const EOCD_BYTES = 22;
/** The EOCD is the last thing in the file, but a trailing comment may follow it. */
const MAX_COMMENT_BYTES = 0xffff;
const ZIP64_SENTINEL = 0xffffffff;

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const built = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    built[index] = value >>> 0;
  }
  crcTable = built;
  return built;
}

/** CRC-32 (IEEE 802.3), the checksum a zip entry carries. */
export function crc32(bytes: Uint8Array): number {
  const lookup = table();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = lookup[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** A DOS timestamp. Written in UTC so the same archive is byte-identical wherever it is built. */
export function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, when.getUTCFullYear()));
  const month = when.getUTCMonth() + 1;
  const day = when.getUTCDate();
  const time =
    (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2);
  const date = ((year - 1980) << 9) | (month << 5) | day;
  return { time: time & 0xffff, date: date & 0xffff };
}

/**
 * Build a stored-method zip.
 *
 * Entry order is preserved, and so is every byte: the writer never touches the payload, which is what
 * makes `readZip(createZip(entries))` an identity on the data a backup is made of.
 */
export function createZip(entries: ZipEntry[], when: Date = new Date()): Uint8Array {
  const stamp = dosDateTime(when);
  const prepared = entries.map((entry) => {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    return { name, data: entry.data, crc };
  });

  const localBytes = prepared.reduce(
    (total, entry) => total + LOCAL_HEADER_BYTES + entry.name.length + entry.data.length,
    0
  );
  const centralBytes = prepared.reduce(
    (total, entry) => total + CENTRAL_HEADER_BYTES + entry.name.length,
    0
  );
  const out = new Uint8Array(localBytes + centralBytes + EOCD_BYTES);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);
    view.setUint32(offset, LOCAL_SIG, true);
    view.setUint16(offset + 4, VERSION, true);
    view.setUint16(offset + 6, FLAG_UTF8, true);
    view.setUint16(offset + 8, 0, true); // stored
    view.setUint16(offset + 10, stamp.time, true);
    view.setUint16(offset + 12, stamp.date, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    view.setUint16(offset + 28, 0, true); // no extra field
    out.set(entry.name, offset + LOCAL_HEADER_BYTES);
    out.set(entry.data, offset + LOCAL_HEADER_BYTES + entry.name.length);
    offset += LOCAL_HEADER_BYTES + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  prepared.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_SIG, true);
    view.setUint16(offset + 4, VERSION, true); // made by: version 2.0, MS-DOS
    view.setUint16(offset + 6, VERSION, true);
    view.setUint16(offset + 8, FLAG_UTF8, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, stamp.time, true);
    view.setUint16(offset + 14, stamp.date, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.name.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, offsets[index], true);
    out.set(entry.name, offset + CENTRAL_HEADER_BYTES);
    offset += CENTRAL_HEADER_BYTES + entry.name.length;
  });

  view.setUint32(offset, EOCD_SIG, true);
  view.setUint16(offset + 4, 0, true); // this disk
  view.setUint16(offset + 6, 0, true); // disk with the central directory
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // no comment
  return out;
}

/** The end-of-central-directory offset, or -1 when the bytes carry no such record. */
function findEndRecord(view: DataView): number {
  const floor = Math.max(0, view.byteLength - EOCD_BYTES - MAX_COMMENT_BYTES);
  for (let offset = view.byteLength - EOCD_BYTES; offset >= floor; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIG) return offset;
  }
  return -1;
}

/**
 * Read a zip this app (or any tool that stores its entries) produced.
 *
 * Sizes and offsets come from the central directory, which is where a writer that streams its data
 * puts them when the local header carries zeros — so an archive with data descriptors still reads.
 */
export function readZip(bytes: Uint8Array): ZipRead {
  if (!bytes || bytes.length < EOCD_BYTES) return { ok: false, reason: 'not-a-zip' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);
  if (end < 0) {
    // A file that *starts* like a zip but has no end record is a download that stopped early. Saying
    // "that is not a zip" about half a backup sends the learner looking for the wrong problem.
    const head = view.getUint32(0, true);
    return { ok: false, reason: head === LOCAL_SIG || head === CENTRAL_SIG ? 'truncated' : 'not-a-zip' };
  }

  const entryCount = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralStart = view.getUint32(end + 16, true);
  if (centralStart + centralSize > bytes.length || centralStart > bytes.length) {
    return { ok: false, reason: 'truncated' };
  }

  const entries: ZipEntry[] = [];
  let cursor = centralStart;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + CENTRAL_HEADER_BYTES > centralStart + centralSize) {
      return { ok: false, reason: 'truncated' };
    }
    if (view.getUint32(cursor, true) !== CENTRAL_SIG) return { ok: false, reason: 'truncated' };
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL || localOffset === ZIP64_SENTINEL) {
      return { ok: false, reason: 'unsupported' };
    }
    if (method !== 0) {
      // A re-zipped archive (macOS Archive Utility, 7-Zip with defaults) is deflated. Say so rather
      // than fail on a CRC mismatch later.
      return { ok: false, reason: 'compressed' };
    }
    const name = fromUtf8(bytes.subarray(cursor + CENTRAL_HEADER_BYTES, cursor + CENTRAL_HEADER_BYTES + nameLength));
    cursor += CENTRAL_HEADER_BYTES + nameLength + extraLength + commentLength;

    if (localOffset + LOCAL_HEADER_BYTES > bytes.length) return { ok: false, reason: 'truncated' };
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) return { ok: false, reason: 'truncated' };
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + LOCAL_HEADER_BYTES + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) return { ok: false, reason: 'truncated' };
    entries.push({ name, data: bytes.subarray(dataStart, dataStart + compressedSize) });
  }

  return { ok: true, entries };
}

/** A one-line explanation for each way a chosen file can fail, for the toast in the header. */
export function zipFailureMessage(reason: ZipFailure): string {
  switch (reason) {
    case 'compressed':
      return 'That zip was re-compressed — restore the file exactly as MechaLab downloaded it';
    case 'truncated':
      return 'That backup is incomplete — the download or the file was cut short';
    case 'unsupported':
      return 'That archive is a Zip64/huge archive — this backup format is the one MechaLab writes';
    default:
      return 'That file is not a MechaLab backup (.zip)';
  }
}
