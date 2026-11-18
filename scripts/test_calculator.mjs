#!/usr/bin/env node
/**
 * The Calculator tab's grammar (`scripts/test_calculator.mjs`, `npm run test:calculator`).
 *
 * A calculator is judged by the expressions it refuses as much as by the ones it answers: this suite
 * walks the precedence an engineer expects (`-2^2`, `2^3^2`, implicit multiplication), both angle
 * units, every function the keypad offers, the suffixes (`!`, `%`), `Ans`, the display's rounding,
 * and one plain sentence for each way the text can be wrong.
 *
 * Run: node --experimental-strip-types scripts/test_calculator.mjs
 */

import assert from 'node:assert/strict';
import { compileExpression, evaluateExpression, formatNumber } from '../app/src/calculator.ts';
import {
  fitGraphView,
  graphPointAt,
  graphStep,
  graphTickLabel,
  graphTicksBetween,
  graphViewFor,
  panGraphView,
  sampleCurve,
  zoomGraphView,
} from '../app/src/graphing.ts';

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

/** One value, to floating-point tolerance. */
function value(expression, options) {
  return evaluateExpression(expression, options);
}

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`
  );
}

function refuses(expression, pattern, options) {
  assert.throws(
    () => evaluateExpression(expression, options),
    (error) => error instanceof Error && pattern.test(error.message),
    `${expression} must be refused with ${pattern}`
  );
}

console.log('\nPrecedence and the four operators');
check('multiplication binds tighter than addition', () => {
  assert.equal(value('2 + 3 * 4'), 14);
  assert.equal(value('(2 + 3) * 4'), 20);
  assert.equal(value('10 - 2 - 3'), 5, 'subtraction is left-associative');
  assert.equal(value('8 / 4 / 2'), 1, 'division is left-associative');
});
check('powers are right-associative and bind above a leading minus', () => {
  assert.equal(value('2^3^2'), 512);
  assert.equal(value('-2^2'), -4, 'the square is taken before the sign, as on paper');
  assert.equal(value('2^-2'), 0.25);
  assert.equal(value('(-2)^2'), 4);
});
check('multiplication can be implicit, as a keypad writes it', () => {
  near(value('2π'), 2 * Math.PI);
  assert.equal(value('3(4 + 1)'), 15);
  near(value('2sin(30)', { angle: 'deg' }), 1);
  assert.equal(value('(1 + 2)(3 + 1)'), 12);
});
check('the keypad spellings are the grammar too', () => {
  assert.equal(value('6 × 7'), 42);
  assert.equal(value('84 ÷ 2'), 42);
  assert.equal(value('50 − 8'), 42);
  assert.equal(value('2 ** 5'), 32);
});

console.log('\nFunctions, units and suffixes');
check('trigonometry follows DEG and RAD', () => {
  near(value('sin(30)', { angle: 'deg' }), 0.5);
  near(value('cos(60)', { angle: 'deg' }), 0.5);
  near(value('tan(45)', { angle: 'deg' }), 1);
  near(value('sin(π / 2)', { angle: 'rad' }), 1);
  near(value('cos(π)', { angle: 'rad' }), -1);
});
check('inverse trigonometry answers in the mode asked for', () => {
  near(value('asin(0.5)', { angle: 'deg' }), 30);
  near(value('acos(0.5)', { angle: 'deg' }), 60);
  near(value('atan(1)', { angle: 'deg' }), 45);
  near(value('asin(1)', { angle: 'rad' }), Math.PI / 2);
  near(value('sin(asin(0.25))', { angle: 'deg' }), 0.25);
});
check('logs, roots and absolute value', () => {
  near(value('ln(e)'), 1);
  near(value('log(1000)'), 3);
  assert.equal(value('sqrt(16)'), 4);
  assert.equal(value('abs(-7)'), 7);
});
check('factorial and percent are suffixes', () => {
  assert.equal(value('5!'), 120);
  assert.equal(value('0!'), 1);
  assert.equal(value('3! + 2'), 8);
  assert.equal(value('50%'), 0.5);
  assert.equal(value('200 * 10%'), 20);
});
check('Ans is the previous answer, and π and e are constants', () => {
  assert.equal(value('ans * 2', { ans: 21 }), 42);
  assert.equal(value('ans + 1'), 1, 'no answer yet is zero, not a refusal');
  near(value('π + e'), Math.PI + Math.E);
  near(value('tau'), Math.PI * 2);
  near(value('τ / 2'), Math.PI);
  near(value('phi'), (1 + Math.sqrt(5)) / 2);
  near(value('φ - 1'), 1 / ((1 + Math.sqrt(5)) / 2));
});

console.log('\nThe scientific set');
check('hyperbolic and inverse hyperbolic functions', () => {
  near(value('sinh(0)'), 0);
  near(value('cosh(0)'), 1);
  near(value('tanh(0)'), 0);
  near(value('sinh(1)'), Math.sinh(1));
  near(value('asinh(sinh(2))'), 2);
  near(value('acosh(1)'), 0);
  near(value('atanh(0.5)'), Math.atanh(0.5));
});
check('sec, csc and cot read the angle mode', () => {
  near(value('sec(60)', { angle: 'deg' }), 2);
  near(value('csc(30)', { angle: 'deg' }), 2);
  near(value('cot(45)', { angle: 'deg' }), 1);
  near(value('sec(0)'), 1);
});
check('arbitrary logs, roots and the exponential', () => {
  near(value('log2(8)'), 3);
  near(value('logb(2, 8)'), 3);
  near(value('logb(9, 81)'), 2);
  near(value('exp(1)'), Math.E);
  assert.equal(value('cbrt(27)'), 3);
  assert.equal(value('cbrt(-8)'), -2);
  assert.equal(value('nthroot(3, 8)'), 2);
  assert.equal(value('nthroot(3, -8)'), -2);
  assert.equal(value('nthroot(2, 16)'), 4);
});
check('combinatorics, gcd/lcm and a floored remainder', () => {
  assert.equal(value('nCr(5, 2)'), 10);
  assert.equal(value('nPr(5, 2)'), 20);
  assert.equal(value('nCr(10, 0)'), 1);
  assert.equal(value('nCr(10, 10)'), 1);
  assert.equal(value('gcd(48, 18)'), 6);
  assert.equal(value('gcd(-12, 18)'), 6);
  assert.equal(value('lcm(4, 6)'), 12);
  assert.equal(value('mod(7, 3)'), 1);
  assert.equal(value('mod(-1, 3)'), 2, 'the remainder follows the divisor, not the dividend');
});
check('the integer and rounding family, and min/max', () => {
  assert.equal(value('floor(2.9)'), 2);
  assert.equal(value('ceil(2.1)'), 3);
  assert.equal(value('round(2.5)'), 3);
  assert.equal(value('trunc(-2.9)'), -2);
  assert.equal(value('sign(-4)'), -1);
  assert.equal(value('min(3, 1, 2)'), 1);
  assert.equal(value('max(3, 1, 2)'), 3);
  assert.equal(value('atan2(1, 1)', { angle: 'deg' }), 45);
});
check('an expression compiles once and answers as f(x)', () => {
  const curve = compileExpression('x^2 + 1');
  near(curve(3), 10);
  near(curve(-2), 5);
  near(compileExpression('sin(x)')(Math.PI / 2), 1);
  near(compileExpression('sin(x)', { angle: 'deg' })(30), 0.5);
  assert.ok(Number.isNaN(compileExpression('1 / x')(0)), 'a gap is NaN, not a thrown plot');
  assert.ok(Number.isNaN(compileExpression('sqrt(x)')(-1)));
  assert.throws(() => compileExpression('sin('), /incomplete/);
  assert.throws(() => compileExpression('wibble'), /does not know/);
});

console.log('\nThe graph paper');
check('the opening window is square and the grid uses 1-2-5 steps', () => {
  const view = graphViewFor(800, 400);
  assert.equal(view.xMin, -10);
  assert.equal(view.xMax, 10);
  assert.equal(view.yMin, -5);
  assert.equal(view.yMax, 5);
  assert.equal(graphStep(20, 10), 2);
  assert.equal(graphStep(4, 10), 0.5);
  assert.equal(graphStep(0.02, 10), 0.002);
});
check('ticks are multiples of the step, and labels drop floating-point tails', () => {
  assert.deepEqual(graphTicksBetween(-2, 2, 1), [-2, -1, 0, 1, 2]);
  assert.deepEqual(graphTicksBetween(0.05, 0.35, 0.1), [0.1, 0.2, 0.3]);
  assert.equal(graphTickLabel(0.30000000000000004, 0.1), '0.3');
  assert.equal(graphTickLabel(-0, 1), '0');
});
check('a resize keeps square units, and zoom keeps its anchor still', () => {
  const fitted = fitGraphView({ xMin: -10, xMax: 10, yMin: -2, yMax: 2 }, 800, 400);
  assert.equal(fitted.yMin, -5);
  assert.equal(fitted.yMax, 5);
  const zoomed = zoomGraphView({ xMin: -10, xMax: 10, yMin: -5, yMax: 5 }, 0.5, { x: 2, y: 1 });
  assert.equal(zoomed.xMin, -4);
  assert.equal(zoomed.xMax, 6);
  assert.equal(zoomed.yMin, -2);
  assert.equal(zoomed.yMax, 3);
});
check('a drag moves the paper with the pointer', () => {
  const panned = panGraphView({ xMin: -10, xMax: 10, yMin: -5, yMax: 5 }, 100, 50, 400, 200);
  assert.equal(panned.xMin, -15);
  assert.equal(panned.xMax, 5);
  assert.equal(panned.yMin, -2.5);
  assert.equal(panned.yMax, 7.5);
  const point = graphPointAt({ xMin: -10, xMax: 10, yMin: -5, yMax: 5 }, 200, 100, 400, 200);
  assert.equal(point.x, 0);
  assert.equal(point.y, 0);
});
check('a curve breaks at a value it cannot take', () => {
  const view = { xMin: -1, xMax: 1, yMin: -5, yMax: 5 };
  assert.equal(sampleCurve(() => 1, view, 200).length, 1);
  assert.equal(sampleCurve((x) => 1 / x, view, 400).length, 2, '1/x is two branches');
  assert.ok(sampleCurve((x) => Math.tan(x), { xMin: -2, xMax: 2, yMin: -5, yMax: 5 }, 800).length >= 3);
});

console.log('\nThe display');
check('twelve significant digits, without a floating-point tail', () => {
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(2), '2');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(1 / 3), '0.333333333333');
  assert.equal(formatNumber(Math.PI), '3.14159265359');
});
check('very large and very small answers keep scientific notation', () => {
  assert.equal(formatNumber(1e15), '1e15');
  assert.equal(formatNumber(1e-12), '1e-12');
  assert.equal(formatNumber(Number.NaN), '—');
  assert.equal(formatNumber(Number.POSITIVE_INFINITY), '—');
});

console.log('\nRefusals are sentences, not NaN');
check('incomplete or malformed expressions', () => {
  refuses('', /Type an expression first/);
  refuses('2 +', /incomplete/);
  refuses('sin(', /incomplete/);
  refuses('sin', /needs parentheses/);
  refuses('(2 + 3', /closing parenthesis/);
  refuses(')', /closing parenthesis without an opening/);
  refuses('2 + 2)', /something extra/);
  refuses('3 $ 4', /does not know/);
  refuses('wibble', /does not know/);
});
check('the scientific set refuses what it cannot answer', () => {
  refuses('nCr(5.5, 2)', /whole numbers/);
  refuses('nPr(2, 5)', /0 ≤ r ≤ n/);
  refuses('nthroot(2, -4)', /even root/);
  refuses('nthroot(0, 4)', /degree above zero/);
  refuses('logb(1, 10)', /base above zero/);
  refuses('mod(4, 0)', /Division by zero/);
  refuses('min()', /at least one argument/);
  refuses('sinh(1000)', /no real value/);
  refuses('acosh(0)', /no real value/);
});
check('numbers with no real answer are refused', () => {
  refuses('1 / 0', /Division by zero/);
  refuses('ln(0)', /above zero/);
  refuses('log(-1)', /above zero/);
  refuses('sqrt(-1)', /negative number/);
  refuses('asin(2)', /no real value/);
  refuses('2.5!', /whole number/);
  refuses('(-1)!', /whole number/);
  refuses('171!', /whole number/);
});
check('a mode other than deg/rad reads as radians', () => {
  near(value('sin(π / 2)', { angle: 'degrees' }), 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
