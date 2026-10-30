/**
 * The surface snapshot's verdict, without a browser (`scripts/snapshot_compare.mjs`).
 *
 * `scripts/snapshot_surfaces.mjs` produces what the page looks like; this decides whether that *is*
 * the recording. It is separated so the rules can be exercised without Chromium
 * (`scripts/test_snapshot_compare.mjs`, run by `tests/test_snapshot_compare.py`): the failure mode of
 * a comparator is silence — a raised tolerance, a dropped palette entry or an unrecorded box all read
 * as a pass — so every rule here has a case that moves the number it guards.
 *
 * A box is four numbers compared one by one, beyond `tolerance` on any edge; counts and resolved
 * styles are exact. A surface the sweep measured but the recording lacks, a recorded surface it did
 * not produce, and a measured box the recording does not know all fail: each is drift a re-record has
 * to acknowledge. `checkStale` is false for a `--tab`/`--palette` run, where the other surfaces were
 * deliberately not measured.
 */

/** One surface's disagreements, as one row per field. */
function compareSurfaces(name, expected, actual, tolerance) {
  const rows = [];
  const add = (part, field, want, got) => rows.push({ surface: name, part, field, expected: want, actual: got });

  for (const [field, want] of Object.entries(expected.boxes ?? {})) {
    const got = actual.boxes?.[field] ?? null;
    if (want === null && got === null) continue;
    if (want === null || got === null) {
      add('boxes', field, want, got);
      continue;
    }
    for (let index = 0; index < want.length; index += 1) {
      if (Math.abs(want[index] - got[index]) > tolerance) {
        add('boxes', field, want, got);
        break;
      }
    }
  }
  // A box the recording has never seen is a new control or a renamed one: passing would let it
  // appear without anyone reading the diff.
  for (const field of Object.keys(actual.boxes ?? {})) {
    if (!(field in (expected.boxes ?? {}))) add('boxes', field, null, actual.boxes[field]);
  }

  for (const [field, want] of Object.entries(expected.counts ?? {})) {
    const got = actual.counts?.[field] ?? null;
    if (want !== got) add('counts', field, want, got);
  }

  const flatStyles = (styles, prefix = '') => {
    const out = {};
    for (const [key, value] of Object.entries(styles ?? {})) {
      if (value && typeof value === 'object') Object.assign(out, flatStyles(value, `${prefix}${key}.`));
      else out[`${prefix}${key}`] = value;
    }
    return out;
  };
  const wantStyles = flatStyles(expected.styles);
  const gotStyles = flatStyles(actual.styles);
  for (const [field, want] of Object.entries(wantStyles)) {
    if (gotStyles[field] !== want) add('styles', field, want, gotStyles[field] ?? null);
  }
  return rows;
}

/**
 * Every disagreement between a recording and a sweep: `rows` names each moved field, `stale` names
 * the recorded surfaces the sweep did not produce.
 */
export function compareSnapshot(expected, actual, { tolerance, checkStale = true }) {
  const rows = [];
  for (const [name, surface] of Object.entries(actual)) {
    const want = expected[name];
    if (!want) {
      rows.push({ surface: name, part: 'surface', field: 'new', expected: null, actual: 'not in the snapshot' });
      continue;
    }
    rows.push(...compareSurfaces(name, want, surface, tolerance));
  }
  const stale = checkStale ? Object.keys(expected).filter((name) => !(name in actual)) : [];
  return { rows, stale };
}
