/**
 * The grapher's JIT (`app/src/grapher/compiler.ts`).
 *
 * There are two targets, because a graph has two kinds of line:
 *
 *  - an explicit curve is evaluated on the CPU once per screen column, so it becomes a JavaScript
 *    closure built by `new Function` — no tree walk and no `eval` of learner text beyond the
 *    generated numeric expression;
 *  - an implicit curve is evaluated once per fragment, so it becomes a GLSL ES 3.00 expression that
 *    the renderer injects into a shader.
 *
 * Both targets start with constant folding. `sin(pi/4)` is one number before any pixel is drawn;
 * parameters stay symbolic and are read from `scope` in JavaScript or from uniforms in GLSL. That is
 * what makes a slider drag a uniform write rather than a recompile: the generated source names the
 * parameter, and its value arrives at draw time.
 */

import {
  evaluateConstant,
  isConstant,
  type AstNode,
  type EquationKind,
  type ParsedEquation,
} from './parser.ts';

export type AngleMode = 'rad' | 'deg';

/** One line, after folding, ready for the renderer. */
export interface CompiledExplicit {
  kind: 'explicit';
  evaluate: (x: number, scope?: Record<string, number>) => number;
  /** The JavaScript expression body, kept for diagnostics and tests. */
  expression: string;
  folded: AstNode;
  parameters: string[];
}

/** An implicit expression ready for the fragment shader. */
export interface CompiledImplicit {
  kind: 'implicit';
  /** The GLSL expression for `F(x, y)`. */
  expression: string;
  folded: AstNode;
  parameters: { name: string; uniform: string }[];
  /** An inequality shades `F < 0`; a strict one draws a dashed boundary. */
  region: { strict: boolean } | null;
}

export interface CompileOptions {
  angle?: AngleMode;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Fold every fully numeric subtree into a number. Static work belongs at compile time. */
export function foldConstants(node: AstNode, options: CompileOptions = {}): AstNode {
  const angle = options.angle === 'deg' ? 'deg' : 'rad';
  // Conditions stay boolean nodes. Folding `1 < 2` to `1` would make the generated GLSL ternary
  // condition a float, which is a shader compile error.
  if (
    node.kind !== 'comparison' &&
    node.kind !== 'logical' &&
    node.kind !== 'piecewise' &&
    isConstant(node)
  ) {
    const value = evaluateConstant(node, angle);
    if (Number.isFinite(value)) return { kind: 'number', value };
    // A non-finite constant (`1/0`, `sqrt(-1)`) is left symbolic: the renderer must see the gap or
    // the singularity rather than a NaN that looks like a bug in the parser.
    return node;
  }
  switch (node.kind) {
    case 'number':
    case 'constant':
    case 'variable':
      return node;
    case 'negate':
      return { kind: 'negate', operand: foldConstants(node.operand, options) };
    case 'factorial':
      return { kind: 'factorial', operand: foldConstants(node.operand, options) };
    case 'percent':
      return { kind: 'percent', operand: foldConstants(node.operand, options) };
    case 'binary': {
      const left = foldConstants(node.left, options);
      const right = foldConstants(node.right, options);
      const combined: AstNode = { kind: 'binary', operator: node.operator, left, right };
      if (isConstant(combined)) {
        const value = evaluateConstant(combined, angle);
        if (Number.isFinite(value)) return { kind: 'number', value };
      }
      return combined;
    }
    case 'call': {
      const args = node.args.map((argument) => foldConstants(argument, options));
      const call: AstNode = { kind: 'call', name: node.name, args };
      if (isConstant(call)) {
        const value = evaluateConstant(call, angle);
        if (Number.isFinite(value)) return { kind: 'number', value };
      }
      return call;
    }
    case 'comparison':
      return {
        kind: 'comparison',
        operator: node.operator,
        left: foldConstants(node.left, options),
        right: foldConstants(node.right, options),
      };
    case 'logical':
      return {
        kind: 'logical',
        operator: node.operator,
        left: foldConstants(node.left, options),
        right: foldConstants(node.right, options),
      };
    case 'piecewise':
      return {
        kind: 'piecewise',
        branches: node.branches.map((branch) => ({
          condition: foldConstants(branch.condition, options),
          value: foldConstants(branch.value, options),
        })),
        otherwise: node.otherwise ? foldConstants(node.otherwise, options) : null,
      };
  }
}

/** A number as a JavaScript literal. The value came from the parser, never from raw learner text. */
function jsNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : 'Number.NaN';
}

function safeName(name: string): string {
  // The tokenizer already restricts this, but the guard is what keeps a future tokenizer change from
  // turning a parameter into executable JavaScript. The identifier is read as a prefix rather than
  // matched with anchored delimiters: `verify_repo` reads a `$` in source as a LaTeX span, and an
  // anchored pattern would put an ampersand inside one.
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(name)?.[0] ?? '';
  const greek = name.length === 1 && 'πτφθ'.includes(name);
  if (identifier !== name && !greek) {
    throw new Error(`“${name}” cannot be used as a parameter name`);
  }
  return name;
}

function roundTrip(name: string): string {
  safeName(name);
  return `scope[${JSON.stringify(name)}]`;
}

function jsCall(name: string, args: string[], angle: AngleMode): string {
  const first = args[0] ?? 'Number.NaN';
  const second = args[1] ?? 'Number.NaN';
  switch (name) {
    case 'sin':
      return `Math.sin(${angle === 'deg' ? `(${first}) * ${DEG}` : first})`;
    case 'cos':
      return `Math.cos(${angle === 'deg' ? `(${first}) * ${DEG}` : first})`;
    case 'tan':
      return `Math.tan(${angle === 'deg' ? `(${first}) * ${DEG}` : first})`;
    case 'sec':
      return `(1 / Math.cos(${angle === 'deg' ? `(${first}) * ${DEG}` : first}))`;
    case 'csc':
      return `(1 / Math.sin(${angle === 'deg' ? `(${first}) * ${DEG}` : first}))`;
    case 'cot':
      return `(1 / Math.tan(${angle === 'deg' ? `(${first}) * ${DEG}` : first}))`;
    case 'asin':
      return angle === 'deg' ? `(Math.asin(${first}) * ${RAD})` : `Math.asin(${first})`;
    case 'acos':
      return angle === 'deg' ? `(Math.acos(${first}) * ${RAD})` : `Math.acos(${first})`;
    case 'atan':
      return angle === 'deg' ? `(Math.atan(${first}) * ${RAD})` : `Math.atan(${first})`;
    case 'atan2':
      return angle === 'deg'
        ? `(Math.atan2(${first}, ${second}) * ${RAD})`
        : `Math.atan2(${first}, ${second})`;
    case 'sinh':
      return `Math.sinh(${first})`;
    case 'cosh':
      return `Math.cosh(${first})`;
    case 'tanh':
      return `Math.tanh(${first})`;
    case 'asinh':
      return `Math.asinh(${first})`;
    case 'acosh':
      return `Math.acosh(${first})`;
    case 'atanh':
      return `Math.atanh(${first})`;
    case 'ln':
      return `Math.log(${first})`;
    case 'log':
      return `Math.log10(${first})`;
    case 'log2':
      return `Math.log2(${first})`;
    case 'logb':
      return `(Math.log(${second}) / Math.log(${first}))`;
    case 'exp':
      return `Math.exp(${first})`;
    case 'sqrt':
      return `Math.sqrt(${first})`;
    case 'cbrt':
      return `Math.cbrt(${first})`;
    case 'nthroot':
      return `(Math.sign(${second}) * Math.pow(Math.abs(${second}), 1 / (${first})))`;
    case 'abs':
      return `Math.abs(${first})`;
    case 'sign':
      return `Math.sign(${first})`;
    case 'floor':
      return `Math.floor(${first})`;
    case 'ceil':
      return `Math.ceil(${first})`;
    case 'round':
      return `Math.round(${first})`;
    case 'trunc':
      return `Math.trunc(${first})`;
    case 'mod':
      return `__mod(${first}, ${second})`;
    case 'gcd':
      return `__gcd(${first}, ${second})`;
    case 'lcm':
      return `__lcm(${first}, ${second})`;
    case 'min':
      return `Math.min(${args.join(', ')})`;
    case 'max':
      return `Math.max(${args.join(', ')})`;
    default:
      throw new Error(`The grapher does not know “${name}”`);
  }
}

function jsExpression(node: AstNode, angle: AngleMode): string {
  switch (node.kind) {
    case 'number':
      return jsNumber(node.value);
    case 'constant':
      return jsNumber(node.value);
    case 'variable':
      return node.name === 'x' ? 'x' : roundTrip(node.name);
    case 'negate':
      return `(-${jsExpression(node.operand, angle)})`;
    case 'factorial':
      return `__fact(${jsExpression(node.operand, angle)})`;
    case 'percent':
      return `((${jsExpression(node.operand, angle)}) / 100)`;
    case 'binary': {
      const left = jsExpression(node.left, angle);
      const right = jsExpression(node.right, angle);
      switch (node.operator) {
        case '+':
          return `(${left} + ${right})`;
        case '-':
          return `(${left} - ${right})`;
        case '*':
          return `(${left} * ${right})`;
        case '/':
          return `(${left} / ${right})`;
        case '^':
          return `Math.pow(${left}, ${right})`;
      }
      return 'Number.NaN';
    }
    case 'call':
      return jsCall(node.name, node.args.map((argument) => jsExpression(argument, angle)), angle);
    case 'comparison': {
      const operator = node.operator === '=' ? '===' : node.operator === '!=' ? '!==' : node.operator;
      return `(${jsExpression(node.left, angle)} ${operator} ${jsExpression(node.right, angle)})`;
    }
    case 'logical':
      return `(${jsExpression(node.left, angle)} ${
        node.operator === 'and' ? '&&' : '||'
      } ${jsExpression(node.right, angle)})`;
    case 'piecewise': {
      let expression = node.otherwise ? jsExpression(node.otherwise, angle) : 'Number.NaN';
      for (let index = node.branches.length - 1; index >= 0; index -= 1) {
        const branch = node.branches[index]!;
        expression = `(${jsExpression(branch.condition, angle)} ? ${jsExpression(
          branch.value,
          angle
        )} : ${expression})`;
      }
      return expression;
    }
  }
}

const JS_HELPERS = `
const __fact = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 170) return Number.NaN;
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
};
const __mod = (a, b) => (b === 0 ? Number.NaN : a - b * Math.floor(a / b));
const __gcd = (a, b) => {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) { const next = left % right; left = right; right = next; }
  return left;
};
const __lcm = (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / __gcd(a, b));
`;

/**
 * Compile an explicit line into a native JavaScript closure.
 *
 * The returned function reads parameters from the scope at each call, so moving `L1` does not
 * rebuild the closure. A missing parameter produces `NaN`, which the sampler treats as a gap.
 */
export function compileExplicit(equation: ParsedEquation, options: CompileOptions = {}): CompiledExplicit {
  const angle = options.angle === 'deg' ? 'deg' : 'rad';
  const folded = foldConstants(equation.ast, { angle });
  const expression = jsExpression(folded, angle);
  // `new Function` is the point of this compiler: the language is our AST's, not the learner's, and
  // the only names in the generated body are `x`, `scope` and our own helpers.
  const factory = new Function(
    'x',
    'scope',
    `"use strict";\n${JS_HELPERS}\nreturn (${expression});`
  ) as (x: number, scope: Record<string, number>) => number;
  const parameters = equation.parameters;
  return {
    kind: 'explicit',
    expression,
    folded,
    parameters,
    evaluate: (x, scope = {}) => {
      try {
        const value = factory(x, scope);
        return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    },
  };
}

/** Evaluate an expression that has no plotted variables, in the current parameter scope. */
export function evaluateConstantExpression(
  node: AstNode,
  scope: Record<string, number>,
  options: CompileOptions = {}
): number {
  const compiled = compileExplicit(
    {
      text: '',
      kind: 'parameter' as EquationKind,
      ast: node,
      lhs: null,
      rhs: null,
      parameters: [],
      variables: [],
      usesX: false,
      usesY: false,
      inequality: null,
    },
    options
  );
  return compiled.evaluate(0, scope);
}

function glslNumber(value: number): string {
  if (!Number.isFinite(value)) return '0.0';
  if (Number.isInteger(value)) return `${value}.0`;
  const text = String(value);
  // GLSL ES accepts `1.0e-7`, but some drivers are strict about a missing decimal point in `1e-7`.
  if (!/[eE]/.test(text)) return text;
  return text.replace(/^([^eE]+)[eE]([+-]?\d+)$/, (_match, mantissa: string, exponent: string) =>
    `${mantissa.includes('.') ? mantissa : `${mantissa}.0`}e${exponent}`
  );
}

function glslName(name: string): string {
  safeName(name);
  // ASCII names keep their spelling; Greek names become a stable code-point suffix so `theta` and
  // `θ` cannot silently share a uniform.
  const ascii = name.replace(/[^A-Za-z0-9_]/g, '');
  if (ascii === name) return `u_${name}`;
  const suffix = [...name]
    .map((character) => character.codePointAt(0)?.toString(16) ?? '0')
    .join('_');
  // A plain join, not another interpolation: a `_` between two spans is a dangling script marker
  // to `verify_repo`, which scans source for `$...$` whether or not it is JavaScript.
  return ['u', ascii || 'greek', suffix].join('_');
}

function glslCall(name: string, args: string[], angle: AngleMode): string {
  const first = args[0] ?? '0.0';
  const second = args[1] ?? '0.0';
  const trig = (value: string) => (angle === 'deg' ? `radians(${value})` : value);
  const inverse = (value: string) => (angle === 'deg' ? `degrees(${value})` : value);
  switch (name) {
    case 'sin':
      return `sin(${trig(first)})`;
    case 'cos':
      return `cos(${trig(first)})`;
    case 'tan':
      return `tan(${trig(first)})`;
    case 'sec':
      return `(1.0 / cos(${trig(first)}))`;
    case 'csc':
      return `(1.0 / sin(${trig(first)}))`;
    case 'cot':
      return `(1.0 / tan(${trig(first)}))`;
    case 'asin':
      return inverse(`asin(${first})`);
    case 'acos':
      return inverse(`acos(${first})`);
    case 'atan':
      return inverse(`atan(${first})`);
    case 'atan2':
      return inverse(`atan(${first}, ${second})`);
    case 'sinh':
      return `sinh(${first})`;
    case 'cosh':
      return `cosh(${first})`;
    case 'tanh':
      return `tanh(${first})`;
    case 'asinh':
      return `asinh(${first})`;
    case 'acosh':
      return `acosh(${first})`;
    case 'atanh':
      return `atanh(${first})`;
    case 'ln':
      return `log(${first})`;
    case 'log':
      return `(log(${first}) / log(10.0))`;
    case 'log2':
      return `log2(${first})`;
    case 'logb':
      return `(log(${second}) / log(${first}))`;
    case 'exp':
      return `exp(${first})`;
    case 'sqrt':
      return `sqrt(${first})`;
    case 'cbrt':
      return `(sign(${first}) * pow(abs(${first}), 1.0 / 3.0))`;
    case 'nthroot':
      return `(sign(${second}) * pow(abs(${second}), 1.0 / (${first})))`;
    case 'abs':
      return `abs(${first})`;
    case 'sign':
      return `sign(${first})`;
    case 'floor':
      return `floor(${first})`;
    case 'ceil':
      return `ceil(${first})`;
    case 'round':
      return `round(${first})`;
    case 'trunc':
      return `trunc(${first})`;
    case 'mod':
      return `mod(${first}, ${second})`;
    case 'gcd':
    case 'lcm':
      throw new Error(`${name} is not available in an implicit curve`);
    case 'min':
      return args.length === 1 ? args[0]! : args.slice(1).reduce((left, right) => `min(${left}, ${right})`, args[0]!);
    case 'max':
      return args.length === 1 ? args[0]! : args.slice(1).reduce((left, right) => `max(${left}, ${right})`, args[0]!);
    default:
      throw new Error(`The grapher does not know “${name}”`);
  }
}

function glslExpression(node: AstNode, angle: AngleMode): string {
  switch (node.kind) {
    case 'number':
      return glslNumber(node.value);
    case 'constant':
      return glslNumber(node.value);
    case 'variable':
      if (node.name === 'x' || node.name === 'y') return node.name;
      return glslName(node.name);
    case 'negate':
      return `(-${glslExpression(node.operand, angle)})`;
    case 'factorial':
      throw new Error('Factorials are not available in an implicit curve');
    case 'percent':
      return `((${glslExpression(node.operand, angle)}) / 100.0)`;
    case 'binary': {
      const left = glslExpression(node.left, angle);
      const right = glslExpression(node.right, angle);
      switch (node.operator) {
        case '+':
          return `(${left} + ${right})`;
        case '-':
          return `(${left} - ${right})`;
        case '*':
          return `(${left} * ${right})`;
        case '/':
          return `(${left} / ${right})`;
        case '^':
          return `pow(${left}, ${right})`;
      }
      return '0.0';
    }
    case 'call':
      return glslCall(node.name, node.args.map((argument) => glslExpression(argument, angle)), angle);
    case 'comparison': {
      const operator = node.operator === '=' ? '==' : node.operator;
      return `(${glslExpression(node.left, angle)} ${operator} ${glslExpression(node.right, angle)})`;
    }
    case 'logical':
      return `(${glslExpression(node.left, angle)} ${
        node.operator === 'and' ? '&&' : '||'
      } ${glslExpression(node.right, angle)})`;
    case 'piecewise': {
      // No branch matched means "not on this curve". A huge finite sentinel keeps every driver happy;
      // GLSL ES 3.00 has no NaN literal that is safe to write here.
      let expression = node.otherwise ? glslExpression(node.otherwise, angle) : '1e30';
      for (let index = node.branches.length - 1; index >= 0; index -= 1) {
        const branch = node.branches[index]!;
        expression = `(${glslExpression(branch.condition, angle)} ? ${glslExpression(
          branch.value,
          angle
        )} : ${expression})`;
      }
      return expression;
    }
  }
}

/**
 * Compile an implicit line for the fragment shader.
 *
 * Parameters become uniforms. A slider therefore changes a uniform, not the shader source, and the
 * shader is rebuilt only when the equation's own text changes.
 */
export function compileImplicit(equation: ParsedEquation, options: CompileOptions = {}): CompiledImplicit {
  const angle = options.angle === 'deg' ? 'deg' : 'rad';
  const folded = foldConstants(equation.ast, { angle });
  const parameters = equation.parameters.map((name) => ({ name, uniform: glslName(name) }));
  return {
    kind: 'implicit',
    expression: glslExpression(folded, angle),
    folded,
    parameters,
    region: equation.inequality ? { strict: equation.inequality.strict } : null,
  };
}

/** The flat dependency graph a slider uses to find the lines downstream of it. */
export interface DependencyGraph {
  parameters: Record<string, string[]>;
  equations: Record<string, string[]>;
  /** The parameter names each row defines. A parameter row is a bridge to its readers. */
  definitions: Record<string, string[]>;
}

/** One line's id, the parameter names its folded tree reads, and the name it may define. */
export interface DependencyInput {
  id: string;
  parameters: string[];
  defines?: string | null;
}

export function buildDependencyGraph(lines: DependencyInput[]): DependencyGraph {
  const parameters: Record<string, string[]> = {};
  const equations: Record<string, string[]> = {};
  const definitions: Record<string, string[]> = {};
  for (const line of lines) {
    equations[line.id] = [...line.parameters];
    if (line.defines) {
      const defined = definitions[line.id] ?? (definitions[line.id] = []);
      if (!defined.includes(line.defines)) defined.push(line.defines);
    }
    for (const parameter of line.parameters) {
      const dependents = parameters[parameter] ?? (parameters[parameter] = []);
      if (!dependents.includes(line.id)) dependents.push(line.id);
    }
  }
  return { parameters, equations, definitions };
}

/** The lines a parameter move has to redraw. An empty list means the write was a no-op for the sheet. */
export function affectedBy(graph: DependencyGraph, parameter: string): string[] {
  return graph.parameters[parameter] ?? [];
}

/**
 * Every row a set of parameter moves reaches, including downstream parameter rows.
 *
 * `b = 2a` does not itself draw, but a move in `a` has to reach the rows that read `b`; following
 * the definitions is what turns a one-parameter slider into the complete set of affected curves.
 * The result is deterministic in discovery order: direct readers first, then their readers.
 */
export function affectedRows(
  graph: DependencyGraph,
  parameters: readonly string[]
): string[] {
  const affected = new Set<string>();
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const parameter of parameters) {
    if (!seen.has(parameter)) {
      seen.add(parameter);
      queue.push(parameter);
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const parameter = queue[index]!;
    for (const id of affectedBy(graph, parameter)) {
      affected.add(id);
      for (const defined of graph.definitions[id] ?? []) {
        if (!seen.has(defined)) {
          seen.add(defined);
          queue.push(defined);
        }
      }
    }
  }
  return [...affected];
}
