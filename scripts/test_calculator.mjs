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
import { evaluateExpression, formatNumber } from '../app/src/calculator.ts';

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
