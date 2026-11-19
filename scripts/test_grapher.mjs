#!/usr/bin/env node
/**
 * The grapher's grammar, compiler and sampler (`scripts/test_grapher.mjs`, `npm run test:grapher`).
 *
 * A graphing calculator is only as good as the lines it refuses and the places it breaks a stroke.
 * This suite pins the Pratt precedence, implicit multiplication, LaTeX input, the three equation
 * kinds, constant folding, JavaScript and GLSL code generation, the dependency graph, the adaptive
 * sampler's asymptote breaks, and the `# @slider` text edit the graph and editor share.
 *
 * Run: node --experimental-strip-types scripts/test_grapher.mjs
 */

import assert from 'node:assert/strict';
import {
  compileExplicit,
  compileImplicit,
  buildDependencyGraph,
  affectedBy,
  foldConstants,
} from '../app/src/grapher/compiler.ts';
import { parseEquation, normalizeMath } from '../app/src/grapher/parser.ts';
import { typesetEquation } from '../app/src/grapher/typeset.ts';
import {
  applyPythonSlider,
  pythonSliderLabel,
  readGraphPush,
} from '../app/src/grapher/bridge.ts';
import {
  panViewport,
  pointAt,
  sampleExplicit,
  tickLabel,
  tickStep,
  viewportFor,
  zoomViewport,
} from '../app/src/grapher/renderer.ts';

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

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, got ${actual}`
  );
}

function explicit(text, options = {}) {
  return compileExplicit(parseEquation(text), options);
}

console.log('\nPratt precedence and implicit multiplication');
check('multiplication binds tighter than addition', () => {
  assert.equal(explicit('2 + 3 * 4').evaluate(0), 14);
  assert.equal(explicit('(2 + 3) * 4').evaluate(0), 20);
  assert.equal(explicit('10 - 2 - 3').evaluate(0), 5);
  assert.equal(explicit('8 / 4 / 2').evaluate(0), 1);
});
check('powers are right-associative and bind above a leading minus', () => {
  assert.equal(explicit('2^3^2').evaluate(0), 512);
  assert.equal(explicit('-2^2').evaluate(0), -4);
  assert.equal(explicit('2^-2').evaluate(0), 0.25);
});
check('juxtaposition is multiplication, including around calls and groups', () => {
  assert.equal(explicit('2x').evaluate(3), 6);
  assert.equal(explicit('(x + 1)(x - 1)').evaluate(3), 8);
  near(explicit('2sin(x)').evaluate(Math.PI / 2), 2);
  assert.equal(explicit('2x^2').evaluate(3), 18);
});
check('function calls keep their commas and arity', () => {
  near(explicit('atan2(y, x)', {}).evaluate(2, { y: 2 }), Math.PI / 4);
  assert.equal(explicit('min(4, 2, 9)').evaluate(0), 2);
  assert.throws(() => parseEquation('atan2(x)'), /needs two arguments/);
});

console.log('\nLaTeX and keypad spellings');
check('LaTeX fractions, roots and commands normalize', () => {
  assert.equal(normalizeMath('\\frac{x}{2}'), '((x)/(2))');
  assert.equal(normalizeMath('\\sqrt{x+1}'), 'sqrt(x+1)');
  near(explicit('\\frac{x}{2}').evaluate(8), 4);
  near(explicit('\\sqrt{2}').evaluate(0), Math.SQRT2);
  near(explicit('\\sin(\\pi / 2)').evaluate(0), 1);
});
check('keypad glyphs are the grammar too', () => {
  near(explicit('2π').evaluate(0), 2 * Math.PI);
  assert.equal(explicit('3(4 + 1)').evaluate(0), 15);
  assert.equal(explicit('sqrt(9)').evaluate(0), 3);
});

console.log('\nClassification, parameters and folding');
check('explicit, implicit and parameter lines are told apart', () => {
  assert.equal(parseEquation('y = sin(x)').kind, 'explicit');
  assert.equal(parseEquation('sin(x) + 2x').kind, 'explicit');
  assert.equal(parseEquation('x^2 + y^2 = 9').kind, 'implicit');
  assert.equal(parseEquation('x = 3').kind, 'implicit');
  assert.equal(parseEquation('a = 2.5').kind, 'parameter');
  assert.equal(parseEquation('L1 = 0.15').kind, 'parameter');
});
check('names other than x and y are parameters, regardless of case', () => {
  const line = parseEquation('y = L1 * sin(x) + Kp');
  assert.deepEqual(line.parameters.sort(), ['Kp', 'L1']);
  assert.equal(line.usesX, true);
  assert.equal(line.usesY, false);
});
check('constant subtrees fold before code generation', () => {
  const folded = foldConstants(parseEquation('sin(pi/4) + 2').ast);
  assert.equal(folded.kind, 'number');
  near(folded.value, Math.sin(Math.PI / 4) + 2);
  const symbolic = foldConstants(parseEquation('2L1 + 3').ast);
  assert.equal(symbolic.kind, 'binary');
  assert.match(compileExplicit(parseEquation('2L1 + 3')).expression, /scope\["L1"\]/);
});
check('every line is also an equation on paper', () => {
  assert.equal(typesetEquation('y = sin(x)'), 'y = \\sin\\left(x\\right)');
  assert.equal(typesetEquation('x^2 + y^2 = 9'), 'x^{2} + y^{2} = 9');
  assert.equal(typesetEquation('y = 1/x'), 'y = \\frac{1}{x}');
  assert.equal(typesetEquation('a = 2.5'), 'a = 2.5');
  assert.equal(typesetEquation('y = 2x + L1'), 'y = 2\\,x + L_{1}');
  assert.equal(typesetEquation('2sin(x)'), '2\\,\\sin\\left(x\\right)');
  assert.equal(typesetEquation('\\frac{x}{2}'), '\\frac{x}{2}');
  assert.equal(typesetEquation('y ='), null, 'an unfinished equation has no display form');
});
check('a parameter slider value reaches the closure without a rebuild', () => {
  const compiled = explicit('a x + b');
  near(compiled.evaluate(2, { a: 3, b: 4 }), 10);
  near(compiled.evaluate(2, { a: 5, b: 4 }), 14);
});
check('degree mode changes both directions of trigonometry', () => {
  near(explicit('sin(30)', { angle: 'deg' }).evaluate(0), 0.5);
  near(explicit('asin(0.5)', { angle: 'deg' }).evaluate(0), 30);
});

console.log('\nGLSL generation and the dependency graph');
check('an implicit equation becomes GLSL with parameter uniforms', () => {
  const line = parseEquation('x^2 + y^2 = L1^2');
  const compiled = compileImplicit(line);
  assert.match(compiled.expression, /pow\(x, 2\.0\)/);
  assert.match(compiled.expression, /u_L1/);
  assert.deepEqual(compiled.parameters.map((parameter) => parameter.name), ['L1']);
  assert.equal(compiled.parameters[0].uniform, 'u_L1');
});
check('GLSL uses the shader spellings for logarithms and atan2', () => {
  const line = parseEquation('log(x) = atan2(y, x)');
  const compiled = compileImplicit(line);
  assert.match(compiled.expression, /log\(x\) \/ log\(10\.0\)/);
  assert.match(compiled.expression, /atan\(y, x\)/);
});
check('an unsupported implicit function is a sentence, not invalid GLSL', () => {
  assert.throws(() => compileImplicit(parseEquation('x! = y')), /Factorials are not available/);
});
check('the dependency graph names exactly the downstream lines', () => {
  const graph = buildDependencyGraph([
    { id: 'one', parameters: ['L1', 'Kp'] },
    { id: 'two', parameters: ['L1'] },
    { id: 'three', parameters: [] },
  ]);
  assert.deepEqual(affectedBy(graph, 'L1').sort(), ['one', 'two']);
  assert.deepEqual(affectedBy(graph, 'Kp'), ['one']);
  assert.deepEqual(affectedBy(graph, 'missing'), []);
});

console.log('\nViewport, grid and adaptive sampling');
check('the viewport pans and zooms about the pointer', () => {
  const opening = viewportFor(800, 400);
  near((opening.xMin + opening.xMax) / 2, 0);
  const zoomed = zoomViewport(opening, 0.5, { x: 2, y: 1 });
  near((zoomed.xMax - zoomed.xMin) / (opening.xMax - opening.xMin), 0.5);
  const panned = panViewport(opening, 80, 40, 800, 400);
  near(panned.xMin, opening.xMin - 2);
  near(panned.yMin, opening.yMin + (opening.yMax - opening.yMin) * 0.1);
  const point = pointAt(opening, 400, 200, 800, 400);
  near(point.x, 0, 1e-9);
  near(point.y, 0, 1e-9);
});
check('the grid uses readable 1-2-5 steps and labels', () => {
  assert.equal(tickStep(20, 10), 2);
  assert.equal(tickStep(0.2, 10), 0.02);
  assert.equal(tickLabel(0.30000000000000004, 0.1), '0.3');
  assert.equal(tickLabel(1000000, 1), '1.0e6');
});
check('a continuous curve is one stroke', () => {
  const segments = sampleExplicit((x) => Math.sin(x), viewportFor(800, 400), 800);
  assert.ok(segments.length >= 1);
  assert.ok(segments.every((segment) => segment.length > 1));
  near(segments[0][0].x, -10);
});
check('a vertical asymptote breaks the stroke instead of drawing a line across it', () => {
  const segments = sampleExplicit((x) => 1 / x, viewportFor(800, 400), 800);
  assert.ok(segments.length >= 2, `expected a break, got ${segments.length} segment(s)`);
  assert.ok(
    segments.every((segment) => segment.every((point) => Number.isFinite(point.y))),
    'the stroke must not include an infinite sample'
  );
  assert.ok(
    segments.every((segment) => segment.every((point) => Math.abs(point.x) > 0.0001)),
    'the break must sit at the asymptote, not at the screen edge'
  );
});
check('a non-finite value is a gap, not a point', () => {
  const segments = sampleExplicit((x) => Math.sqrt(x), viewportFor(800, 400), 800);
  assert.ok(segments.every((segment) => segment.every((point) => point.x >= 0)));
});

console.log('\nPython bridge and @slider text');
check('a graph push is validated and capped', () => {
  const push = readGraphPush({
    expressions: ['sin(x)', '  ', 42],
    points: [[1, 2], [3, '4'], [Number.NaN, 2], { x: 5, y: 6 }],
  });
  assert.deepEqual(push?.expressions, ['sin(x)']);
  assert.deepEqual(push?.points, [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
  assert.equal(readGraphPush({ expressions: [], points: [] }), null);
});
check('moving a source slider rewrites the one literal it belongs to', () => {
  const source = 'L1 = 0.15  # @slider 0.05 0.40 0.01\nKp = 2.0  # @slider 0 10 0.1\n';
  const next = applyPythonSlider(source, 'L1', 0.25);
  assert.match(next, /L1 = 0\.25 {2}# @slider 0\.05 0\.40 0\.01/);
  assert.match(next, /Kp = 2\.0/);
  assert.equal(applyPythonSlider(source, 'Kp', 2), source, 'a value inside one step must not move text');
  assert.equal(applyPythonSlider(source, 'missing', 1), source);
  assert.equal(pythonSliderLabel(source, 'Kp'), 'Kp = 2.0');
});
check('a malformed expression is refused with a sentence', () => {
  assert.throws(() => parseEquation('sin('), /closing parenthesis/);
  assert.throws(() => parseEquation('a == 2'), /equals sign/);
  assert.throws(() => parseEquation('x +'), /incomplete/);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
