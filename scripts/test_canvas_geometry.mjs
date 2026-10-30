#!/usr/bin/env node
/**
 * The workflow canvas's arithmetic without a browser (`scripts/test_canvas_geometry.mjs`,
 * `npm run test:geometry`).
 *
 * Every arrow the canvas draws is a string built from three numbers: where each card's dot sits, and
 * how far the curve may bend. A dot a few pixels off its card is only visible in a browser run, so
 * the numbers are pinned here, at the card size the canvas lays out (200 px wide) and the heights the
 * observer reports: the four dots on a known card at a known drag position, all 16 side pairs a drag
 * can draw, the bend's floor, halving and cap, the side a body-drop picks, and where an edge's label
 * and remove button attach.
 */

import assert from 'node:assert/strict';
import { NODE_WIDTH, WORKFLOW_SIDES } from '../app/src/workflow.ts';
import {
  GROUP_PAD,
  LANE_HEADER,
  NODE_FALLBACK_HEIGHT,
  anchorFrom,
  cardHeight,
  cardsWithin,
  clamp,
  edgeControls,
  edgeCurve,
  facingSide,
  groupRect,
  laneRect,
  normalizeRect,
  pendingCurve,
} from '../app/src/components/workflow/canvasGeometry.ts';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

/** A card at a document position; the height lives in the observer's record, not on the card. */
function card(x, y) {
  return { id: 'a', kind: 'given', title: 'given', detail: '', x, y };
}

check('a card’s four dots sit on the midpoints of its edges', () => {
  const at = card(300, 200);
  const heights = { a: 140 };
  assert.deepEqual(
    WORKFLOW_SIDES.map((side) => anchorFrom(at, side, heights)),
    [
      { x: 300, y: 270 },
      { x: 500, y: 270 },
      { x: 400, y: 200 },
      { x: 400, y: 340 },
    ]
  );
});

check('an unmeasured card falls back to 120 px, and another card’s height does not leak', () => {
  const at = card(0, 0);
  assert.equal(cardHeight({}, 'a'), NODE_FALLBACK_HEIGHT);
  assert.deepEqual(anchorFrom(at, 'bottom', { b: 400 }), { x: NODE_WIDTH / 2, y: 120 });
});

check('a drag moves all four dots by its snapped delta and keeps the card’s shape', () => {
  const heights = { a: 140 };
  const before = WORKFLOW_SIDES.map((side) => anchorFrom(card(300, 200), side, heights));
  const after = WORKFLOW_SIDES.map((side) => anchorFrom(card(348, 252), side, heights));
  after.forEach((point, index) => {
    assert.deepEqual(point, { x: before[index].x + 48, y: before[index].y + 52 });
  });
  assert.equal(after[1].x - after[0].x, NODE_WIDTH);
});

check('the dots are canvas pixels; scroll and zoom are the viewport’s lens on them', () => {
  const heights = { a: 140 };
  const right = anchorFrom(card(300, 200), 'right', heights);
  const left = anchorFrom(card(300, 200), 'left', heights);
  // screen = canvas × scale − scroll, the conversion every pointer gesture inverts.
  const onScreen = (point, scrollLeft, scrollTop, scale) => ({
    x: point.x * scale - scrollLeft,
    y: point.y * scale - scrollTop,
  });
  assert.deepEqual(onScreen(right, 120, 80, 1), { x: 380, y: 190 });
  assert.deepEqual(onScreen(right, 120, 80, 2), { x: 880, y: 460 });
  const gap = onScreen(right, 120, 80, 2).x - onScreen(left, 120, 80, 2).x;
  assert.equal(gap, NODE_WIDTH * 2);
});

check('the bend floors at 16 px, halves the gap, and never passes 56', () => {
  assert.equal(edgeCurve({ x: 0, y: 0 }, 'right', { x: 10, y: 0 }, 'left'), 'M 0 0 C 16 0, -6 0, 10 0');
  assert.equal(edgeCurve({ x: 0, y: 0 }, 'right', { x: 60, y: 0 }, 'left'), 'M 0 0 C 30 0, 30 0, 60 0');
  assert.equal(edgeCurve({ x: 0, y: 0 }, 'right', { x: 400, y: 0 }, 'left'), 'M 0 0 C 56 0, 344 0, 400 0');
});

check('every side pair leaves and enters along its own side', () => {
  // Two dots 300 px apart across and 200 down: the gap is 360.6, so the bend is its 56 px cap.
  const pairs = [
    ['left', 'left', 'M 0 0 C -56 0, 244 200, 300 200'],
    ['left', 'right', 'M 0 0 C -56 0, 356 200, 300 200'],
    ['left', 'top', 'M 0 0 C -56 0, 300 144, 300 200'],
    ['left', 'bottom', 'M 0 0 C -56 0, 300 256, 300 200'],
    ['right', 'left', 'M 0 0 C 56 0, 244 200, 300 200'],
    ['right', 'right', 'M 0 0 C 56 0, 356 200, 300 200'],
    ['right', 'top', 'M 0 0 C 56 0, 300 144, 300 200'],
    ['right', 'bottom', 'M 0 0 C 56 0, 300 256, 300 200'],
    ['top', 'left', 'M 0 0 C 0 -56, 244 200, 300 200'],
    ['top', 'right', 'M 0 0 C 0 -56, 356 200, 300 200'],
    ['top', 'top', 'M 0 0 C 0 -56, 300 144, 300 200'],
    ['top', 'bottom', 'M 0 0 C 0 -56, 300 256, 300 200'],
    ['bottom', 'left', 'M 0 0 C 0 56, 244 200, 300 200'],
    ['bottom', 'right', 'M 0 0 C 0 56, 356 200, 300 200'],
    ['bottom', 'top', 'M 0 0 C 0 56, 300 144, 300 200'],
    ['bottom', 'bottom', 'M 0 0 C 0 56, 300 256, 300 200'],
  ];
  for (const [fromSide, toSide, path] of pairs) {
    assert.equal(edgeCurve({ x: 0, y: 0 }, fromSide, { x: 300, y: 200 }, toSide), path, `${fromSide} → ${toSide}`);
  }
});

check('the dashed preview leaves like an arrow and lands on the pointer', () => {
  assert.equal(pendingCurve({ x: 0, y: 0 }, 'right', { x: 300, y: 200 }), 'M 0 0 C 56 0, 300 200, 300 200');
  assert.equal(pendingCurve({ x: 0, y: 0 }, 'top', { x: 0, y: 10 }), 'M 0 0 C 0 -16, 0 10, 0 10');
});

check('an edge’s label and remove button share the arrow’s half-way point, the button 10 px right', () => {
  const at = (x, y) => ({ x, y });
  const cases = [
    // A symmetric forward, reversed or vertical pair: the cubic's t = 0.5 point is the dots' midpoint.
    [at(300, 270), 'right', at(500, 270), 'left', at(400, 270)],
    [at(500, 270), 'left', at(300, 270), 'right', at(400, 270)],
    [at(400, 200), 'bottom', at(400, 340), 'top', at(400, 270)],
    // A bowed pair: the chord midpoint (400, 385) put the label 23 px off this arrow.
    [at(500, 270), 'right', at(300, 500), 'top', at(421, 364)],
    // A sideways exit into a vertical entry pulls the curve the other way.
    [at(0, 0), 'bottom', at(200, 260), 'left', at(79, 151)],
    // A half pixel is kept, not rounded: the label must sit on the line the arrow draws.
    [at(0, 0), 'right', at(301, 201), 'left', at(150.5, 100.5)],
  ];
  for (const [a, aSide, b, bSide, mid] of cases) {
    assert.deepEqual(edgeControls(a, aSide, b, bSide), {
      label: mid,
      remove: { x: mid.x + 10, y: mid.y },
    });
  }
});

check('a body-drop picks the side of the target that faces the source', () => {
  const at = card;
  const cases = [
    [400, 0, 120, 120, 'left'],
    [-400, 0, 120, 120, 'right'],
    [0, 400, 120, 120, 'top'],
    [0, -400, 120, 120, 'bottom'],
    // Below and only a little to the side: the vertical axis wins at 300 px down against 100 across.
    [100, 300, 120, 120, 'top'],
    // A 1:1 diagonal is a tie, and a tie is horizontal.
    [-200, 120, 120, 120, 'right'],
    // The taller card sets the vertical scale: 240 across beats 440 down against a 400 px card.
    [240, 300, 120, 400, 'left'],
  ];
  for (const [x, y, fromHeight, toHeight, side] of cases) {
    assert.equal(facingSide(at(0, 0), at(x, y), fromHeight, toHeight), side, `${x},${y}`);
  }
});

check('a self-link still answers, though the gesture refuses to draw one', () => {
  // `useLinking` cancels a link to its own card; the arithmetic must not divide by a zero diagonal.
  assert.equal(facingSide(card(0, 0), card(0, 0), 120, 120), 'right');
});

check('a frame hugs its cards, one pad out', () => {
  const at = (id, x, y) => ({ id, kind: 'given', title: id, detail: '', x, y });
  const cases = [
    // One card, measured: 200 wide, 140 tall, a pad of air on each side.
    [[at('a', 300, 200)], { a: 140 }, { x: 300 - GROUP_PAD, y: 200 - GROUP_PAD, width: 200 + GROUP_PAD * 2, height: 140 + GROUP_PAD * 2 }],
    // Two cards: the box spans both, and the taller one sets the bottom.
    [[at('a', 0, 0), at('b', 300, 200)], { a: 120, b: 140 }, { x: 0, y: 0, width: 500 + GROUP_PAD * 2, height: 340 + GROUP_PAD * 2 }],
    // The opening card sits CANVAS_PAD from the paper, which is more than one pad: no sliding.
    [[at('a', 16, 16)], { a: 120 }, { x: 4, y: 4, width: 200 + GROUP_PAD * 2, height: 120 + GROUP_PAD * 2 }],
    // Before the observer has measured anything the 120 px guess is used, not zero.
    [[at('a', 300, 200)], {}, { x: 288, y: 188, width: 200 + GROUP_PAD * 2, height: 120 + GROUP_PAD * 2 }],
  ];
  for (const [members, heights, box] of cases) {
    assert.deepEqual(groupRect(members, heights), box);
  }
  assert.equal(groupRect([], {}), null, 'a frame with no cards draws nothing');
});

check('a lane adds a name strip above its cards, and loses it only at the paper edge', () => {
  const at = (id, x, y) => ({ id, kind: 'given', title: id, detail: '', x, y });
  const box = { x: 300 - GROUP_PAD, y: 200 - GROUP_PAD, width: 200 + GROUP_PAD * 2, height: 140 + GROUP_PAD * 2 };
  assert.deepEqual(laneRect([at('a', 300, 200)], { a: 140 }), {
    ...box,
    y: box.y - LANE_HEADER,
    height: box.height + LANE_HEADER,
  });
  // The opening card's frame already starts at y 4, so there is only 4 px of paper above it: the
  // strip is clipped, not drawn off the canvas.
  const top = laneRect([at('a', 16, 16)], { a: 120 });
  assert.equal(top.y, 0);
  assert.equal(top.height, 120 + GROUP_PAD * 2 + 4);
  assert.equal(laneRect([], {}), null, 'a lane with no cards draws nothing');
});

check('a drawn box picks up the cards whose centres it covers', () => {
  const at = (id, x, y) => ({ id, kind: 'given', title: id, detail: '', x, y });
  const heights = { a: 120, b: 140 };
  const nodes = [at('a', 0, 0), at('b', 300, 200)];
  const cases = [
    // Around both cards' centres (100, 60) and (400, 270).
    [{ x: -20, y: -20, width: 540, height: 380 }, ['a', 'b']],
    // A box that only nicks card b's corner does not claim it: its centre is outside.
    [{ x: 0, y: 0, width: 150, height: 100 }, ['a']],
    // Dragged up and left, the rectangle is negative; it is the same box.
    [{ x: 520, y: 400, width: -540, height: -420 }, ['a', 'b']],
    // The centre on the boundary counts, so a box drawn exactly around a card keeps it.
    [{ x: 100, y: 60, width: 0, height: 0 }, ['a']],
  ];
  for (const [rect, ids] of cases) {
    assert.deepEqual(cardsWithin(rect, nodes, heights), ids, JSON.stringify(rect));
  }
  assert.deepEqual(normalizeRect({ x: 10, y: 10, width: -5, height: -8 }), {
    x: 5,
    y: 2,
    width: 5,
    height: 8,
  });
});

check('clamp keeps a drag on the paper', () => {
  assert.equal(clamp(-4, 0, 4000), 0);
  assert.equal(clamp(4012, 0, 4000), 4000);
  assert.equal(clamp(348, 0, 4000), 348);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
