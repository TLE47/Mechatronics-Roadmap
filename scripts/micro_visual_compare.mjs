/**
 * The micro-visual snapshot's verdict, without a browser (`scripts/micro_visual_compare.mjs`).
 *
 * `scripts/check_micro_visuals.mjs` measures every scene at 477 and 966 px; this decides whether
 * those measurements are the recording. It lives apart so its rules can be exercised without
 * Chromium (`scripts/test_micro_visual_compare.mjs`, run by `tests/test_micro_visual_compare.py`):
 * the failure mode of a comparator is silence — a missing label, a moved text run, a changed shape
 * or a scene that vanished from one width all read as a pass if the wrong field is ignored.
 *
 * A box is four numbers compared one by one, beyond `tolerance` on any edge. Label text, element
 * tags, style fingerprints, SVG fingerprints and the `fallbacks` stand-in list are exact. An issue
 * measured in the page — clipped text, an element outside the card, horizontal or vertical overflow
 * — fails regardless of the recording, because `--record` refuses to bless a scene with an issue.
 *
 * The baseline is structural rather than a pixel diff for the same reason as the surface snapshot:
 * antialiasing recorded on one machine does not survive the trip to the Linux runner. Text, boxes,
 * resolved styles and vector markup are portable; pixels are not.
 */

function addBoxRow(rows, scene, width, part, field, expected, actual, tolerance) {
  if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== 4 || actual.length !== 4) {
    rows.push({ scene, width, part, field, expected, actual });
    return;
  }
  for (let index = 0; index < 4; index += 1) {
    if (Math.abs(expected[index] - actual[index]) > tolerance) {
      rows.push({ scene, width, part, field, expected, actual });
      return;
    }
  }
}

function compareRender(scene, width, expected, actual, tolerance) {
  const rows = [];
  const add = (part, field, want, got) => rows.push({ scene, width, part, field, expected: want, actual: got });

  // A measurement issue is a failure even when the recording has the same numbers: a clipped label
  // was once clipped when the baseline was recorded is still a clipped label.
  for (const issue of actual.issues ?? []) {
    add('issue', String(issue).split(':')[0], 'none', issue);
  }

  if (expected.width !== actual.width) add('width', 'figure', expected.width, actual.width);
  if (Math.abs(expected.height - actual.height) > tolerance) {
    add('height', 'figure', expected.height, actual.height);
  }
  if (expected.frameStyle !== actual.frameStyle) {
    add('frame', 'style', expected.frameStyle, actual.frameStyle);
  }
  if (expected.text !== actual.text) add('text', 'visible', expected.text, actual.text);

  // Stand-in glyphs are the scene's own type coverage: a run whose glyph the bundled faces do not
  // carry was measured as `0`. The list is machine-independent, so a change to it means the type
  // behind a box changed, not the reader's fonts.
  if ((expected.fallbacks ?? []).join('') !== (actual.fallbacks ?? []).join('')) {
    add('font', 'fallbacks', expected.fallbacks ?? [], actual.fallbacks ?? []);
  }

  const wantRuns = expected.textRuns ?? [];
  const gotRuns = actual.textRuns ?? [];
  if (wantRuns.length !== gotRuns.length) add('text-runs', 'count', wantRuns.length, gotRuns.length);
  for (let index = 0; index < Math.min(wantRuns.length, gotRuns.length); index += 1) {
    const want = wantRuns[index];
    const got = gotRuns[index];
    if (want[0] !== got[0]) add('text-runs', `${index}.text`, want[0], got[0]);
    addBoxRow(rows, scene, width, 'text-runs', `${index}.box`, want[1], got[1], tolerance);
  }

  const wantElements = expected.elements ?? [];
  const gotElements = actual.elements ?? [];
  if (wantElements.length !== gotElements.length) {
    add('elements', 'count', wantElements.length, gotElements.length);
  }
  for (let index = 0; index < Math.min(wantElements.length, gotElements.length); index += 1) {
    const want = wantElements[index];
    const got = gotElements[index];
    if (want[0] !== got[0]) add('elements', `${index}.tag`, want[0], got[0]);
    addBoxRow(rows, scene, width, 'elements', `${index}.box`, want[1], got[1], tolerance);
    if (want[2] !== got[2]) add('elements', `${index}.style`, want[2], got[2]);
  }

  const wantSvgs = expected.svgs ?? [];
  const gotSvgs = actual.svgs ?? [];
  if (wantSvgs.length !== gotSvgs.length) add('svgs', 'count', wantSvgs.length, gotSvgs.length);
  for (let index = 0; index < Math.min(wantSvgs.length, gotSvgs.length); index += 1) {
    if (wantSvgs[index] !== gotSvgs[index]) add('svgs', String(index), wantSvgs[index], gotSvgs[index]);
  }

  return rows;
}

/**
 * Every disagreement between the recording and a sweep. `rows` names each moved field and every
 * measurement issue; `stale` names recorded scenes or widths the sweep did not produce.
 */
export function compareMicroVisuals(recorded, actual, { tolerance = 2, checkStale = true } = {}) {
  const rows = [];
  const stale = [];

  for (const [scene, widths] of Object.entries(actual)) {
    const wantScene = recorded[scene];
    if (!wantScene) {
      rows.push({
        scene,
        width: '*',
        part: 'scene',
        field: 'new',
        expected: null,
        actual: 'not in the snapshot',
      });
      continue;
    }
    for (const [width, render] of Object.entries(widths)) {
      const want = wantScene[width];
      if (!want) {
        rows.push({
          scene,
          width,
          part: 'width',
          field: 'new',
          expected: null,
          actual: 'not in the snapshot',
        });
        continue;
      }
      rows.push(...compareRender(scene, width, want, render, tolerance));
    }
    for (const width of Object.keys(wantScene)) {
      if (!(width in widths)) stale.push(`${scene}@${width}`);
    }
  }

  if (checkStale) {
    for (const scene of Object.keys(recorded)) {
      if (!(scene in actual)) stale.push(scene);
    }
  }

  return { rows, stale };
}
