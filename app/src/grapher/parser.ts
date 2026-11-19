/**
 * The grapher's grammar (`app/src/grapher/parser.ts`).
 *
 * This is a Pratt parser rather than the scientific tab's one-expression recursive descent: a graph
 * line is an equation, it may have two variables, and the variables that are not `x` or `y` are
 * parameters. The same parser therefore answers three questions at once:
 *
 *  - what the line means (`x^2 + y^2 = 9` is an implicit curve, `y = sin(x)` is a function),
 *  - what it depends on (a slider moving `L1` only recomputes the curves that name `L1`),
 *  - and whether it is a parameter definition (`a = 2.5`) rather than something to plot.
 *
 * Desmos-style input is accepted as written: `2x`, `(x + 1)(x - 1)`, `2sin(x)`, `atan2(y, x)`,
 * `π`, piecewise definitions like `{x < 0: -x, x >= 0: x}`, inequalities like `x^2 + y^2 <= 9`,
 * and the LaTeX spellings `\frac{a}{b}`, `\sqrt{x}`, `\sin`, `\le`, `\left(`, `\right)`. A
 * syntax error is an `Error` with one sentence the expression list can print under the line.
 */

/** A function the grapher can evaluate in JavaScript and (for implicit curves) compile to GLSL. */
export interface FunctionSpec {
  min: number;
  max: number;
}

/** Every callable name, with the number of arguments it accepts. */
export const FUNCTIONS: Record<string, FunctionSpec> = {
  sin: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  tan: { min: 1, max: 1 },
  sec: { min: 1, max: 1 },
  csc: { min: 1, max: 1 },
  cot: { min: 1, max: 1 },
  asin: { min: 1, max: 1 },
  acos: { min: 1, max: 1 },
  atan: { min: 1, max: 1 },
  atan2: { min: 2, max: 2 },
  sinh: { min: 1, max: 1 },
  cosh: { min: 1, max: 1 },
  tanh: { min: 1, max: 1 },
  asinh: { min: 1, max: 1 },
  acosh: { min: 1, max: 1 },
  atanh: { min: 1, max: 1 },
  ln: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
  log2: { min: 1, max: 1 },
  logb: { min: 2, max: 2 },
  exp: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  cbrt: { min: 1, max: 1 },
  nthroot: { min: 2, max: 2 },
  abs: { min: 1, max: 1 },
  sign: { min: 1, max: 1 },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  trunc: { min: 1, max: 1 },
  mod: { min: 2, max: 2 },
  gcd: { min: 2, max: 2 },
  lcm: { min: 2, max: 2 },
  min: { min: 1, max: Number.POSITIVE_INFINITY },
  max: { min: 1, max: Number.POSITIVE_INFINITY },
};

/** The constants the parser folds to numbers. `π`, `e` and the usual Greek spellings are included. */
export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  tau: Math.PI * 2,
  τ: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  φ: (1 + Math.sqrt(5)) / 2,
  e: Math.E,
};

export type InequalityOperator = '<' | '<=' | '>' | '>=';
export type ComparisonOperator = InequalityOperator | '=' | '!=';

/** A typed expression tree. Variables are the only nodes whose values come from the scope. */
export type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'constant'; name: string; value: number }
  | { kind: 'variable'; name: string }
  | { kind: 'negate'; operand: AstNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode }
  | { kind: 'call'; name: string; args: AstNode[] }
  | { kind: 'factorial'; operand: AstNode }
  | { kind: 'percent'; operand: AstNode }
  | { kind: 'comparison'; operator: ComparisonOperator; left: AstNode; right: AstNode }
  | { kind: 'logical'; operator: 'and' | 'or'; left: AstNode; right: AstNode }
  | { kind: 'piecewise'; branches: { condition: AstNode; value: AstNode }[]; otherwise: AstNode | null };

export type EquationKind = 'explicit' | 'implicit' | 'parameter' | 'inequality';

/** How one line is plotted, and what has to move when a slider moves. */
export interface ParsedEquation {
  /** The original text, trimmed. */
  text: string;
  kind: EquationKind;
  /** The expression plotted: the right side of `y = …`, or `lhs - rhs` for an implicit curve. */
  ast: AstNode;
  /** The two sides, when there was an `=`. */
  lhs: AstNode | null;
  rhs: AstNode | null;
  /** Names other than `x` and `y`; these are parameters (or Python sliders). */
  parameters: string[];
  /** Variables the expression reads. A parameter definition has no `x` or `y`. */
  variables: string[];
  usesX: boolean;
  usesY: boolean;
  /** For an inequality, the relation and whether its boundary is dashed. `ast` is negative inside. */
  inequality: { operator: InequalityOperator; strict: boolean } | null;
}

type Operator = '+' | '-' | '*' | '/' | '^';

type Token =
  | { kind: 'number'; value: number; position: number }
  | { kind: 'name'; value: string; position: number }
  | { kind: 'operator'; value: Operator; position: number }
  | { kind: 'lparen'; position: number }
  | { kind: 'rparen'; position: number }
  | { kind: 'comma'; position: number }
  | { kind: 'equal'; position: number }
  | { kind: 'comparison'; value: ComparisonOperator; position: number }
  | { kind: 'lbrace'; position: number }
  | { kind: 'rbrace'; position: number }
  | { kind: 'colon'; position: number }
  | { kind: 'bang'; position: number }
  | { kind: 'percent'; position: number };

function readGroup(text: string, start: number): { body: string; end: number } | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
}

/** `\frac{a}{b}` and `\sqrt{x}` are rewritten before braces become parentheses. */
function rewriteLatexGroups(raw: string): string {
  let text = raw;
  for (let guard = 0; guard < 32; guard += 1) {
    const fraction = text.indexOf('\\frac');
    if (fraction === -1) break;
    const numerator = readGroup(text, fraction + 5);
    if (!numerator) break;
    const denominator = readGroup(text, numerator.end);
    if (!denominator) break;
    text = `${text.slice(0, fraction)}((${rewriteLatexGroups(numerator.body)})/(${rewriteLatexGroups(
      denominator.body
    )}))${text.slice(denominator.end)}`;
  }
  text = text.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^}]*)\}/g, 'nthroot($1, $2)');
  text = text.replace(/\\sqrt\s*\{([^}]*)\}/g, 'sqrt($1)');
  text = text.replace(/\\operatorname\s*\{([^}]*)\}/g, '$1');
  text = text.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1');
  text = text.replace(/\\text\s*\{([^}]*)\}/g, '$1');
  return text;
}

/** Normalize the keypad's and LaTeX's spellings into one grammar. */
export function normalizeMath(raw: string): string {
  let text = raw
    .replace(/\\left|\\right/g, '')
    .replace(/\\,|\\;|\\:|\\!/g, ' ')
    .replace(/\\cdot|\\times|×|·/g, '*')
    .replace(/\\div|÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\tau\b/g, 'τ')
    .replace(/\\phi\b/g, 'φ')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\infty\b/g, 'Infinity')
    .replace(/\\leq?\b/g, '<=')
    .replace(/\\geq?\b/g, '>=')
    .replace(/\\lt\b/g, '<')
    .replace(/\\gt\b/g, '>')
    .replace(/\\neq?\b/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
  text = rewriteLatexGroups(text);
  text = text.replace(/\\([A-Za-z]+)/g, '$1');
  // `\sin` is written above; the generic command strip turns it into `sin`. Braces stay braces:
  // they are Desmos' piecewise delimiter, and the parser also reads a brace pair as a group.
  text = text
    .replace(/\^\\circ/g, '')
    .replace(/°/g, '');
  return text;
}

function tokenize(raw: string): Token[] {
  const text = normalizeMath(raw);
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const char = rest[0] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]), position: index });
      index += number[0].length;
      continue;
    }
    // The Greek letters are one-character names, like the keypad writes them.
    const name = /^(?:[A-Za-z][A-Za-z0-9_]*|[πτφθ])/.exec(rest);
    if (name) {
      tokens.push({ kind: 'name', value: name[0], position: index });
      index += name[0].length;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen', position: index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen', position: index });
      index += 1;
      continue;
    }
    if (char === '{') {
      tokens.push({ kind: 'lbrace', position: index });
      index += 1;
      continue;
    }
    if (char === '}') {
      tokens.push({ kind: 'rbrace', position: index });
      index += 1;
      continue;
    }
    if (char === ':') {
      tokens.push({ kind: 'colon', position: index });
      index += 1;
      continue;
    }
    if (char === '!' && rest[1] === '=') {
      tokens.push({ kind: 'comparison', value: '!=', position: index });
      index += 2;
      continue;
    }
    if (char === '<' || char === '>') {
      const operator = rest[1] === '=' ? `${char}=` : char;
      tokens.push({
        kind: 'comparison',
        value: operator as ComparisonOperator,
        position: index,
      });
      index += operator.length;
      continue;
    }
    if (char === ',') {
      tokens.push({ kind: 'comma', position: index });
      index += 1;
      continue;
    }
    if (char === '=') {
      tokens.push({ kind: 'equal', position: index });
      index += 1;
      continue;
    }
    if (char === '!' || char === '%') {
      tokens.push({ kind: char === '!' ? 'bang' : 'percent', position: index });
      index += 1;
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ kind: 'operator', value: char, position: index });
      index += 1;
      continue;
    }
    throw new Error(`The grapher does not know “${char}”`);
  }
  return tokens;
}

function aritySentence(name: string, spec: FunctionSpec): string {
  if (spec.max === Number.POSITIVE_INFINITY) return `${name} needs at least one argument`;
  if (spec.min === spec.max) {
    if (spec.min === 1) return `${name} needs one argument, like ${name}(2)`;
    if (spec.min === 2) return `${name} needs two arguments, like ${name}(5, 2)`;
    return `${name} needs ${spec.min} arguments`;
  }
  return `${name} needs between ${spec.min} and ${spec.max} arguments`;
}

function startsPrimary(token: Token | undefined): boolean {
  return Boolean(
    token &&
      (token.kind === 'number' ||
        token.kind === 'name' ||
        token.kind === 'lparen' ||
        token.kind === 'lbrace')
  );
}

function isCondition(node: AstNode): boolean {
  return node.kind === 'comparison' || node.kind === 'logical';
}

/** Precedence for the infix operators. Implicit multiplication shares multiplication's rung. */
const BINDING: Record<Operator, { left: number; right: number }> = {
  '+': { left: 10, right: 10 },
  '-': { left: 10, right: 10 },
  '*': { left: 20, right: 20 },
  '/': { left: 20, right: 20 },
  // A power is right associative: 2^3^2 is 2^(3^2).
  '^': { left: 40, right: 39 },
};

const IMPLICIT_BINDING = { left: 20, right: 20 };
const UNARY_BINDING = 30;
const POSTFIX_BINDING = 50;
// A relation is looser than arithmetic but tighter than `and` / `or`, so `0 < x + 1 < 2` works.
const COMPARISON_BINDING = { left: 6, right: 7 };
const AND_BINDING = { left: 4, right: 5 };
const OR_BINDING = { left: 2, right: 3 };

/** The Pratt parser. `expression(0)` is the whole grammar; every recursive call raises the floor. */
class Parser {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseAll(): AstNode {
    if (this.tokens.length === 0) throw new Error('Type an expression first');
    const node = this.expression(0);
    if (this.index < this.tokens.length) {
      throw new Error('Check the expression — there is something extra at the end');
    }
    return node;
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  private take(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new Error('The expression is incomplete');
    this.index += 1;
    return token;
  }

  private expression(minBinding: number): AstNode {
    let left = this.prefix();
    for (;;) {
      const token = this.peek();
      if (!token) break;

      if (token.kind === 'bang') {
        if (POSTFIX_BINDING <= minBinding) break;
        this.index += 1;
        left = { kind: 'factorial', operand: left };
        continue;
      }
      if (token.kind === 'percent') {
        if (POSTFIX_BINDING <= minBinding) break;
        this.index += 1;
        left = { kind: 'percent', operand: left };
        continue;
      }

      const comparison =
        token.kind === 'comparison' ? token.value : token.kind === 'equal' ? '=' : null;
      if (comparison) {
        if (COMPARISON_BINDING.left <= minBinding) break;
        this.index += 1;
        const right = this.expression(COMPARISON_BINDING.right);
        // `0 < x < 1` is the interval both comparisons describe, not a comparison of a boolean.
        const next: AstNode = {
          kind: 'comparison',
          operator: comparison,
          left: left.kind === 'comparison' ? left.right : left,
          right,
        };
        left = left.kind === 'comparison' ? { kind: 'logical', operator: 'and', left, right: next } : next;
        continue;
      }

      if (token.kind === 'name' && (token.value.toLowerCase() === 'and' || token.value.toLowerCase() === 'or')) {
        const operator = token.value.toLowerCase() === 'and' ? 'and' : 'or';
        const binding = operator === 'and' ? AND_BINDING : OR_BINDING;
        if (binding.left <= minBinding) break;
        this.index += 1;
        left = { kind: 'logical', operator, left, right: this.expression(binding.right) };
        continue;
      }

      if (token.kind === 'operator') {
        const binding = BINDING[token.value];
        if (!binding || binding.left <= minBinding) break;
        this.index += 1;
        const right = this.expression(binding.right);
        left = { kind: 'binary', operator: token.value, left, right };
        continue;
      }

      // Natural juxtaposition: `2x`, `2(3 + 1)`, `(x + 1)(x - 1)`, `2sin(x)`. A function name is
      // consumed by `prefix`, so a call is never mistaken for a multiplication.
      if (startsPrimary(token)) {
        if (IMPLICIT_BINDING.left <= minBinding) break;
        const right = this.expression(IMPLICIT_BINDING.right);
        left = { kind: 'binary', operator: '*', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private prefix(): AstNode {
    const token = this.take();
    if (token.kind === 'number') return { kind: 'number', value: token.value };
    if (token.kind === 'lparen') {
      const node = this.expression(0);
      const close = this.peek();
      if (close?.kind !== 'rparen') throw new Error('Add the closing parenthesis');
      this.index += 1;
      return node;
    }
    if (token.kind === 'lbrace') return this.braceGroup();
    if (token.kind === 'comma') {
      throw new Error('There is a comma without a function that takes more than one number');
    }
    if (token.kind === 'rparen' || token.kind === 'rbrace') {
      throw new Error('There is a closing bracket without an opening one');
    }
    if (token.kind === 'colon') {
      throw new Error('A piecewise definition is written {condition: value, …}');
    }
    if (token.kind === 'equal') {
      throw new Error('That equation has an equals sign in the wrong place');
    }
    if (token.kind === 'comparison') {
      throw new Error('That comparison needs an expression before it');
    }
    if (token.kind === 'bang' || token.kind === 'percent') {
      throw new Error('That operator needs a number before it');
    }
    if (token.kind === 'operator') {
      if (token.value === '+' || token.value === '-') {
        const operand = this.expression(UNARY_BINDING);
        return token.value === '-' ? { kind: 'negate', operand } : operand;
      }
      throw new Error('That operator needs a number before it');
    }

    const name = token.value;
    const lower = name.toLowerCase();
    const functionSpec = FUNCTIONS[lower];
    if (functionSpec) {
      const opener = this.peek();
      if (opener?.kind !== 'lparen' && opener?.kind !== 'lbrace') {
        throw new Error(`${lower} needs parentheses, like ${lower}(x)`);
      }
      const closer = opener.kind === 'lparen' ? 'rparen' : 'rbrace';
      this.index += 1;
      if (!this.peek()) throw new Error(`Add the closing parenthesis after ${lower}`);
      const args: AstNode[] = [];
      if (this.peek()?.kind !== closer) {
        args.push(this.expression(0));
        while (this.peek()?.kind === 'comma') {
          this.index += 1;
          args.push(this.expression(0));
        }
      }
      if (this.peek()?.kind !== closer) {
        throw new Error(`Add the closing parenthesis after ${lower}`);
      }
      this.index += 1;
      if (args.length < functionSpec.min || args.length > functionSpec.max) {
        throw new Error(aritySentence(lower, functionSpec));
      }
      return { kind: 'call', name: lower, args };
    }

    const constant = CONSTANTS[lower] ?? CONSTANTS[name];
    if (constant !== undefined) return { kind: 'constant', name: lower, value: constant };

    // A name followed by `(` is a parameter times a grouped expression (`a(x + 1)`), not a function:
    // only the names in FUNCTIONS are callable, so a learner cannot invent an unbound `f(x)`.
    return { kind: 'variable', name };
  }

  /** `{x < 0: -x, x >= 0: x}` is a piecewise; `{x + 1}` is an ordinary group. */
  private braceGroup(): AstNode {
    if (this.peek()?.kind === 'rbrace') throw new Error('A brace needs an expression inside');
    const first = this.expression(0);
    if (this.peek()?.kind === 'colon') {
      if (!isCondition(first)) {
        throw new Error('A piecewise branch needs a condition like x < 0 before the colon');
      }
      return this.piecewise(first);
    }
    if (this.peek()?.kind !== 'rbrace') throw new Error('Add the closing brace');
    this.index += 1;
    return first;
  }

  private piecewise(first: AstNode): AstNode {
    const branches: { condition: AstNode; value: AstNode }[] = [];
    let condition = first;
    let otherwise: AstNode | null = null;
    for (;;) {
      if (this.peek()?.kind !== 'colon') throw new Error('Add a value after the piecewise condition');
      this.index += 1;
      const value = this.expression(0);
      branches.push({ condition, value });
      if (this.peek()?.kind !== 'comma') break;
      this.index += 1;
      if (this.peek()?.kind === 'rbrace') throw new Error('A comma needs another branch after it');
      const candidate = this.expression(0);
      if (this.peek()?.kind === 'colon') {
        if (!isCondition(candidate)) {
          throw new Error('A piecewise branch needs a condition like x < 0 before the colon');
        }
        condition = candidate;
        continue;
      }
      otherwise = candidate;
      break;
    }
    if (this.peek()?.kind !== 'rbrace') {
      throw new Error('Add the closing brace after the piecewise definition');
    }
    this.index += 1;
    return { kind: 'piecewise', branches, otherwise };
  }
}

function collect(node: AstNode, variables: Set<string>): void {
  switch (node.kind) {
    case 'variable':
      variables.add(node.name);
      return;
    case 'negate':
    case 'factorial':
    case 'percent':
      collect(node.operand, variables);
      return;
    case 'binary':
      collect(node.left, variables);
      collect(node.right, variables);
      return;
    case 'call':
      for (const argument of node.args) collect(argument, variables);
      return;
    case 'comparison':
    case 'logical':
      collect(node.left, variables);
      collect(node.right, variables);
      return;
    case 'piecewise':
      for (const branch of node.branches) {
        collect(branch.condition, variables);
        collect(branch.value, variables);
      }
      if (node.otherwise) collect(node.otherwise, variables);
      return;
    default:
      return;
  }
}

/** Every name an expression reads, including `x` and `y`. */
export function variablesIn(node: AstNode): string[] {
  const names = new Set<string>();
  collect(node, names);
  return [...names];
}

function cloneWithKind(node: AstNode, kind: EquationKind): ParsedEquation {
  const variables = variablesIn(node);
  const usesX = variables.includes('x');
  const usesY = variables.includes('y');
  return {
    text: '',
    kind,
    ast: node,
    lhs: null,
    rhs: null,
    parameters: variables.filter((name) => name !== 'x' && name !== 'y'),
    variables,
    usesX,
    usesY,
    inequality: null,
  };
}

function isBareName(node: AstNode): node is Extract<AstNode, { kind: 'variable' }> {
  return node.kind === 'variable';
}

/** Find the one relation outside brackets. Piecewise condition equalities stay inside braces. */
function topLevelRelation(tokens: Token[]): { index: number; operator: ComparisonOperator } | null {
  let depth = 0;
  let found: { index: number; operator: ComparisonOperator } | null = null;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === 'lparen' || token.kind === 'lbrace') depth += 1;
    else if (token.kind === 'rparen' || token.kind === 'rbrace') depth -= 1;
    else if (depth === 0 && (token.kind === 'equal' || token.kind === 'comparison')) {
      if (found) {
        if (found.operator === '=' && token.kind === 'equal') {
          throw new Error('An equation can have only one equals sign');
        }
        throw new Error('Use one relation per line');
      }
      found = {
        index,
        operator: token.kind === 'equal' ? '=' : token.value,
      };
    }
  }
  return found;
}

/**
 * Read one line and decide what it is.
 *
 * `y = f(x)` and a bare `f(x)` are explicit curves. A line with `x` and `y` on either side is
 * implicit and is stored as `lhs - rhs = 0`. A bare name equal to an expression with no plotted
 * variable (`a = 2.5`, `L1 = 0.15`) is a parameter definition, which the sheet turns into a slider
 * rather than a curve.
 */
export function parseEquation(raw: string): ParsedEquation {
  const text = raw.trim();
  if (!text) throw new Error('Type an expression first');
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new Error('Type an expression first');
  const relation = topLevelRelation(tokens);
  if (!relation) {
    const node = new Parser(tokens).parseAll();
    if (node.kind === 'comparison') {
      throw new Error('Write an inequality like y < sin(x), or put the condition in a piecewise {…}');
    }
    const variables = variablesIn(node);
    const parsed = cloneWithKind(node, variables.includes('y') ? 'implicit' : 'explicit');
    return { ...parsed, text };
  }

  const sides = {
    lhs: tokens.slice(0, relation.index),
    rhs: tokens.slice(relation.index + 1),
  };
  if (sides.lhs.length === 0 || sides.rhs.length === 0) {
    throw new Error('Both sides of the relation need an expression');
  }
  const lhs = new Parser(sides.lhs).parseAll();
  const rhs = new Parser(sides.rhs).parseAll();

  if (relation.operator !== '=') {
    if (relation.operator === '!=') {
      throw new Error('Use <, <=, > or >= for an inequality; != is only a piecewise condition');
    }
    // Store the side that is negative inside the region, so the shader only ever shades F < 0.
    const insideFirst = relation.operator === '<' || relation.operator === '<=';
    const difference: AstNode = {
      kind: 'binary',
      operator: '-',
      left: insideFirst ? lhs : rhs,
      right: insideFirst ? rhs : lhs,
    };
    const parsed = cloneWithKind(difference, 'inequality');
    return {
      ...parsed,
      text,
      lhs,
      rhs,
      inequality: {
        operator: relation.operator,
        strict: relation.operator === '<' || relation.operator === '>',
      },
    };
  }

  const leftNames = variablesIn(lhs);
  const rightNames = variablesIn(rhs);
  const plotted =
    leftNames.includes('x') ||
    leftNames.includes('y') ||
    rightNames.includes('x') ||
    rightNames.includes('y');

  if (!plotted && isBareName(lhs)) {
    const parsed = cloneWithKind(rhs, 'parameter');
    return { ...parsed, text, lhs, rhs };
  }

  // `y = …` is the canonical explicit form; `f(x) = y` is the same curve written the other way.
  if (isBareName(lhs) && lhs.name === 'y') {
    const parsed = cloneWithKind(rhs, 'explicit');
    return { ...parsed, text, lhs, rhs };
  }
  if (isBareName(rhs) && rhs.name === 'y') {
    const parsed = cloneWithKind(lhs, 'explicit');
    return { ...parsed, text, lhs, rhs };
  }

  const difference: AstNode = { kind: 'binary', operator: '-', left: lhs, right: rhs };
  const parsed = cloneWithKind(difference, plotted ? 'implicit' : 'parameter');
  return { ...parsed, text, lhs, rhs };
}

/** True when the node is a single number or a fully constant tree. */
export function isConstant(node: AstNode): boolean {
  switch (node.kind) {
    case 'number':
    case 'constant':
      return true;
    case 'negate':
    case 'factorial':
    case 'percent':
      return isConstant(node.operand);
    case 'binary':
    case 'comparison':
    case 'logical':
      return isConstant(node.left) && isConstant(node.right);
    case 'call':
      return node.args.every(isConstant);
    case 'piecewise':
      return (
        node.branches.every((branch) => isConstant(branch.condition) && isConstant(branch.value)) &&
        (!node.otherwise || isConstant(node.otherwise))
      );
    default:
      return false;
  }
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 170) return Number.NaN;
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

/** A comparison or logical condition as a boolean, for constant folding and piecewise tests. */
function evaluateCondition(node: AstNode, angle: 'rad' | 'deg'): boolean {
  if (node.kind === 'logical') {
    return node.operator === 'and'
      ? evaluateCondition(node.left, angle) && evaluateCondition(node.right, angle)
      : evaluateCondition(node.left, angle) || evaluateCondition(node.right, angle);
  }
  if (node.kind !== 'comparison') return evaluateConstant(node, angle) !== 0;
  const left = evaluateConstant(node.left, angle);
  const right = evaluateConstant(node.right, angle);
  switch (node.operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '=':
      return left === right;
    case '!=':
      return left !== right;
  }
}

/** Evaluate a constant tree in JavaScript. Used by folding and by parameter rows. */
export function evaluateConstant(node: AstNode, angle: 'rad' | 'deg' = 'rad'): number {
  const unit = angle === 'deg' ? Math.PI / 180 : 1;
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'constant':
      return node.value;
    case 'negate':
      return -evaluateConstant(node.operand, angle);
    case 'factorial':
      return factorial(evaluateConstant(node.operand, angle));
    case 'percent':
      return evaluateConstant(node.operand, angle) / 100;
    case 'binary': {
      const left = evaluateConstant(node.left, angle);
      const right = evaluateConstant(node.right, angle);
      switch (node.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '^':
          return Math.pow(left, right);
      }
      return Number.NaN;
    }
    case 'comparison':
      return evaluateCondition(node, angle) ? 1 : 0;
    case 'logical':
      return evaluateCondition(node, angle) ? 1 : 0;
    case 'piecewise': {
      for (const branch of node.branches) {
        if (evaluateCondition(branch.condition, angle)) {
          return evaluateConstant(branch.value, angle);
        }
      }
      return node.otherwise ? evaluateConstant(node.otherwise, angle) : Number.NaN;
    }
    case 'call': {
      const args = node.args.map((argument) => evaluateConstant(argument, angle));
      const first = args[0] ?? Number.NaN;
      const second = args[1] ?? Number.NaN;
      switch (node.name) {
        case 'sin':
          return Math.sin(first * unit);
        case 'cos':
          return Math.cos(first * unit);
        case 'tan':
          return Math.tan(first * unit);
        case 'sec':
          return 1 / Math.cos(first * unit);
        case 'csc':
          return 1 / Math.sin(first * unit);
        case 'cot':
          return 1 / Math.tan(first * unit);
        case 'asin':
          return Math.asin(first) / unit;
        case 'acos':
          return Math.acos(first) / unit;
        case 'atan':
          return Math.atan(first) / unit;
        case 'atan2':
          return Math.atan2(first, second) / unit;
        case 'sinh':
          return Math.sinh(first);
        case 'cosh':
          return Math.cosh(first);
        case 'tanh':
          return Math.tanh(first);
        case 'asinh':
          return Math.asinh(first);
        case 'acosh':
          return Math.acosh(first);
        case 'atanh':
          return Math.atanh(first);
        case 'ln':
          return Math.log(first);
        case 'log':
          return Math.log10(first);
        case 'log2':
          return Math.log2(first);
        case 'logb':
          return Math.log(second) / Math.log(first);
        case 'exp':
          return Math.exp(first);
        case 'sqrt':
          return Math.sqrt(first);
        case 'cbrt':
          return Math.cbrt(first);
        case 'nthroot':
          return Math.pow(second, 1 / first);
        case 'abs':
          return Math.abs(first);
        case 'sign':
          return Math.sign(first);
        case 'floor':
          return Math.floor(first);
        case 'ceil':
          return Math.ceil(first);
        case 'round':
          return Math.round(first);
        case 'trunc':
          return Math.trunc(first);
        case 'mod':
          return first - second * Math.floor(first / second);
        case 'gcd': {
          let a = Math.abs(first);
          let b = Math.abs(second);
          while (b !== 0) [a, b] = [b, a % b];
          return a;
        }
        case 'lcm': {
          const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
          return first === 0 || second === 0 ? 0 : Math.abs(first * second) / gcd(first, second);
        }
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
        default:
          return Number.NaN;
      }
    }
    default:
      return Number.NaN;
  }
}

/** The parameter ordering the compiler can hand to a slider sheet. */
export function parametersIn(node: AstNode): string[] {
  return variablesIn(node).filter((name) => name !== 'x' && name !== 'y');
}
