/**
 * The phone keyboard's randomized scenarios (`scripts/keyboard_stress.mjs`).
 *
 * The browser gate drives every key through Chromium's touch input; this module only decides which
 * key to touch, in what order, with what pause after it, and what the editor must then contain. It
 * is a pure planner on purpose: a failure names its seed and the exact plan, and the same seed can
 * be replayed without a recording or a screenshot.
 *
 * The plan never inserts a newline through the typing keys. Line breaks have their own browser
 * tests, so a random scenario's expected text containing no `\n` is an assertion that none of the
 * other keys produced one by accident.
 */

/** A small deterministic PRNG (mulberry32); the seed is the only source of variation. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const HOME = [...'asdfghjkl'];
const LETTERS = [...'qwertyuiopzxcvbnm'];
const DIGITS = [
  ['q', '1'],
  ['w', '2'],
  ['e', '3'],
  ['r', '4'],
  ['t', '5'],
  ['y', '6'],
  ['u', '7'],
  ['i', '8'],
  ['o', '9'],
  ['p', '0'],
];
const ABC_SYMBOLS = [
  ['open-paren', '('],
  ['close-paren', ')'],
  ['open-bracket', '['],
  ['close-bracket', ']'],
  ['open-brace', '{'],
  ['close-brace', '}'],
  ['colon', ':'],
  ['comma', ','],
  ['semicolon', ';'],
  ['single-quote', "'"],
  ['double-quote', '"'],
  ['equals', '='],
];
const NUMERIC_SYMBOLS = [
  ['dot', '.'],
  ['comma-num', ','],
  ['colon-num', ':'],
  ['semicolon-num', ';'],
  ['underscore', '_'],
  ['hash', '#'],
  ['at', '@'],
  ['ampersand', '&'],
  ['exclaim', '!'],
  ['tilde', '~'],
  ['dollar', '$'],
  ['caret', '^'],
  ['pipe', '|'],
  ['backslash', '\\'],
  ['question', '?'],
  ['percent-num', '%'],
  ['star-num', '*'],
  ['plus-num', '+'],
];
const OPERATORS = [
  ['plus', '+'],
  ['minus', '-'],
  ['star', '*'],
  ['slash', '/'],
  ['percent', '%'],
  ['less', '<'],
  ['greater', '>'],
  ['less-equal', '<='],
  ['greater-equal', '>='],
  ['equal-equal', '=='],
  ['not-equal', '!='],
];
const DIGIT_KEYS = [...'1234567890'];

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/**
 * One pause in the style of a person at a keyboard: mostly a quick burst, sometimes the beat where
 * they look at the screen. It is a delay after the key, never a throttle on the editor.
 */
function gap(random) {
  return random() < 0.12 ? 20 + Math.floor(random() * 35) : Math.floor(random() * 5);
}

function baseScenario(seed, { visual = false } = {}) {
  const random = mulberry32(seed);
  const actions = [];
  let page = 'abc';
  let expected = '';
  // A visual field opens with its value selected, so its first key replaces rather than appends.
  let firstVisualKey = visual;
  let typed = 0;
  const total = (visual ? 6 : 8) + Math.floor(random() * 5);
  const wait = (ms) => {
    actions.push({ kind: 'wait', ms });
  };
  const text = (key, value, after) => {
    actions.push({ kind: 'text', key, text: value, after });
    if (firstVisualKey) {
      expected = value;
      firstVisualKey = false;
    } else {
      expected += value;
    }
    typed += 1;
  };

  while (typed < total) {
    const roll = random();

    // A scenario alternates whole pages, never a number key that is not on screen: the executor
    // asserts the page before it touches a key, so a lost layout click fails at this step.
    if (page === '123' && (roll < 0.22 || typed >= total - 2)) {
      actions.push({ kind: 'layout', page: 'abc', after: 2 + Math.floor(random() * 5) });
      page = 'abc';
      continue;
    }
    if (page === 'abc' && roll < 0.15 && typed < total - 4) {
      actions.push({ kind: 'layout', page: '123', after: 2 + Math.floor(random() * 5) });
      page = '123';
      continue;
    }

    if (roll < 0.27) {
      actions.push({ kind: 'backspace', after: gap(random) });
      expected = expected.slice(0, -1);
      typed += 1;
      continue;
    }

    if (page === '123') {
      if (roll < 0.48) {
        const [id, value] = pick(random, NUMERIC_SYMBOLS);
        text(`python-key-${id}`, value, gap(random));
      } else {
        const digit = pick(random, DIGIT_KEYS);
        text(`python-key-digit-${digit}`, digit, gap(random));
      }
      continue;
    }

    if (!visual && roll < 0.37) {
      const [id, value] = pick(random, ABC_SYMBOLS);
      text(`python-key-${id}`, value, gap(random));
      continue;
    }
    if (!visual && roll < 0.42) {
      // Fn and its digit are one gesture: no page switch can land in the middle and turn the
      // layout key into the lighting door.
      const [letter, digit] = pick(random, DIGITS);
      actions.push({ kind: 'fnDigit', key: letter, text: digit, after: gap(random) });
      expected += digit;
      typed += 1;
      continue;
    }
    if (!visual && roll < 0.5) {
      const base = random() < 0.55 ? pick(random, HOME) : pick(random, LETTERS);
      actions.push({ kind: 'shift', key: base, text: base.toUpperCase(), after: gap(random) });
      expected += base.toUpperCase();
      typed += 1;
      continue;
    }
    if (!visual && roll < 0.58) {
      const [id, value] = pick(random, OPERATORS);
      text(`python-key-${id}`, value, gap(random));
      continue;
    }
    if (!visual && roll < 0.61) {
      text('python-key-space', ' ', gap(random));
      continue;
    }
    if (!visual && roll < 0.63) {
      text('python-key-tab', '    ', gap(random));
      continue;
    }

    const letter = random() < 0.55 ? pick(random, HOME) : pick(random, LETTERS);
    text(`python-key-${letter}`, letter, gap(random));
  }

  // Always hand the next test the letters page, whatever the last typing run asked for.
  if (page === '123') {
    actions.push({ kind: 'layout', page: 'abc', after: 0 });
  }

  return { seed, visual, actions, expected };
}

/** A combined typing, backspacing and layout-switching scenario for Python Code. */
export function planKeyboardScenario(seed) {
  return baseScenario(seed);
}

/** The same stress on a Visual block field, where the first key replaces the selected value. */
export function planVisualScenario(seed) {
  return baseScenario(seed, { visual: true });
}

/** The taps a plan will make, for the final report and for a seed's reproduction note. */
export function countTaps(plan) {
  return plan.actions.reduce((total, action) => {
    if (action.kind === 'wait') return total;
    if (action.kind === 'shift') return total + 2;
    if (action.kind === 'fnDigit') return total + 3;
    return total + 1;
  }, 0);
}
