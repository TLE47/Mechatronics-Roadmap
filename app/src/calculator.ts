/**
 * The Calculator tab's arithmetic (`app/src/calculator.ts`).
 *
 * A scientific calculator is one expression and one answer, so this module is a tokenizer and a
 * recursive-descent parser rather than an `eval`: the tab can be handed any text a learner types,
 * and a stray `import os` must be a sentence about the expression, never a run.
 *
 * It reads the way a calculator keypad writes: `×`, `÷`, `−`, `π` and `√` are accepted beside their
 * ASCII spellings, `2π` and `3(4+1)` are implicit multiplication, `5!` and `50%` are suffixes, `^`
 * is right-associative, and a leading minus binds looser than a power (`-2^2` is `-4`, as on paper).
 * Trigonometry follows the tab's DEG/RAD switch; inverse functions answer in that same unit.
 *
 * The scientific set is the one a pad's `func` face carries and a physics page assumes: inverse and
 * hyperbolic trigonometry, natural, common and binary logarithms, arbitrary log bases, roots,
 * combinatorics, integer division's remainders, and the integer/rounding family. `compileExpression`
 * is the same grammar held open at one name, which is what the graphing face samples: parse once,
 * evaluate a thousand times.
 *
 * Failures are Errors with one plain sentence, because the pane prints them verbatim under the
 * expression. `npm run test:calculator` pins the grammar and each of those sentences.
 */

/** The unit trigonometry is read in, chosen by the tab's DEG/RAD switch. */
export type AngleMode = 'deg' | 'rad';

export interface EvaluateOptions {
  angle?: AngleMode;
  /** The previous answer, which the `Ans` key inserts. */
  ans?: number;
  /** Values a name may hold; the graphing face binds `x` this way. */
  vars?: Record<string, number>;
}

type Operator = '+' | '-' | '*' | '/' | '^' | '!' | '%';

type Token =
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'op'; value: Operator }
  | { type: 'comma' }
  | { type: 'open' }
  | { type: 'close' };

/** The parsed expression. Parsing once is what lets a graph evaluate a curve thousands of times. */
type Node =
  | { type: 'number'; value: number }
  | { type: 'constant'; name: string }
  | { type: 'variable'; name: string }
  | { type: 'answer' }
  | { type: 'negate'; operand: Node }
  | { type: 'binary'; operator: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'factorial'; operand: Node }
  | { type: 'percent'; operand: Node };

interface FunctionSpec {
  min: number;
  max: number;
}

/** Every name a keypad or a keyboard can write, with how many arguments it takes. */
const FUNCTIONS: Record<string, FunctionSpec> = {
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
  ncr: { min: 2, max: 2 },
  npr: { min: 2, max: 2 },
  min: { min: 1, max: Number.POSITIVE_INFINITY },
  max: { min: 1, max: Number.POSITIVE_INFINITY },
};

/** Spellings the keypad and a keyboard both produce, folded to one grammar. */
function normalize(raw: string): string {
  return raw
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/\*\*/g, '^');
}

function tokenize(raw: string): Token[] {
  const text = normalize(raw);
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
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    // A name may carry digits after its first letter, so `log2` is one function rather than
    // `log × 2`; the Greek constants are the one-character names the pad writes.
    const name = /^(?:[A-Za-z][A-Za-z0-9_]*|[πτφ])/.exec(rest);
    if (name) {
      tokens.push({ type: 'name', value: name[0].toLowerCase() });
      index += name[0].length;
      continue;
    }
    if (char === '(') {
      tokens.push({ type: 'open' });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'close' });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma' });
      index += 1;
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^' || char === '!' || char === '%') {
      tokens.push({ type: 'op', value: char });
      index += 1;
      continue;
    }
    throw new Error(`The calculator does not know “${char}”`);
  }
  return tokens;
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 170) {
    throw new Error('Factorial needs a whole number from 0 to 170');
  }
  let result = 1;
  for (let factor = 2; factor <= value; factor += 1) result *= factor;
  return result;
}

function whole(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} needs whole numbers`);
  return value;
}

function combinations(n: number, r: number): number {
  whole(n, 'nCr');
  whole(r, 'nCr');
  if (n < 0 || r < 0 || r > n) throw new Error('nCr needs whole numbers with 0 ≤ r ≤ n');
  const k = Math.min(r, n - r);
  let result = 1;
  for (let index = 1; index <= k; index += 1) result = (result * (n - k + index)) / index;
  return Math.round(result);
}

function permutations(n: number, r: number): number {
  whole(n, 'nPr');
  whole(r, 'nPr');
  if (n < 0 || r < 0 || r > n) throw new Error('nPr needs whole numbers with 0 ≤ r ≤ n');
  let result = 1;
  for (let index = 0; index < r; index += 1) result *= n - index;
  return result;
}

function greatestCommonDivisor(a: number, b: number): number {
  whole(a, 'gcd');
  whole(b, 'gcd');
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

function leastCommonMultiple(a: number, b: number): number {
  const divisor = greatestCommonDivisor(a, b);
  if (divisor === 0) return 0;
  return Math.abs((a / divisor) * b);
}

function root(degree: number, value: number): number {
  if (degree === 0) throw new Error('The root needs a degree above zero');
  if (value < 0) {
    const rounded = Math.round(degree);
    const odd = Math.abs(rounded % 2) === 1;
    if (Math.abs(rounded - degree) > 1e-9 || !odd) {
      throw new Error('The even root of a negative number is not real');
    }
    return -Math.pow(-value, 1 / degree);
  }
  return Math.pow(value, 1 / degree);
}

function applyFunction(name: string, args: number[], angle: AngleMode): number {
  const unit = angle === 'deg' ? Math.PI / 180 : 1;
  const first = args[0] ?? 0;
  const second = args[1] ?? 0;
  switch (name) {
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
      if (first <= 0) throw new Error('ln needs a number above zero');
      return Math.log(first);
    case 'log':
      if (first <= 0) throw new Error('log needs a number above zero');
      return Math.log10(first);
    case 'log2':
      if (first <= 0) throw new Error('log2 needs a number above zero');
      return Math.log2(first);
    case 'logb':
      if (second <= 0) throw new Error('logb needs a number above zero');
      if (first <= 0 || first === 1) throw new Error('logb needs a base above zero and not 1');
      return Math.log(second) / Math.log(first);
    case 'exp':
      return Math.exp(first);
    case 'sqrt':
      if (first < 0) throw new Error('The square root of a negative number is not real');
      return Math.sqrt(first);
    case 'cbrt':
      return Math.cbrt(first);
    case 'nthroot':
      return root(first, second);
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
      if (second === 0) throw new Error('Division by zero has no value');
      return first - second * Math.floor(first / second);
    case 'gcd':
      return greatestCommonDivisor(first, second);
    case 'lcm':
      return leastCommonMultiple(first, second);
    case 'ncr':
      return combinations(first, second);
    case 'npr':
      return permutations(first, second);
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    default:
      throw new Error(`The calculator does not know “${name}”`);
  }
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

/**
 * One expression, parsed once. Every method consumes tokens from the left and returns the node it
 * read, so the precedence order is the call graph: sum → product → unary → power → postfix → atom.
 */
class Parser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly variables: ReadonlySet<string>;

  constructor(tokens: Token[], variables: ReadonlySet<string> = new Set()) {
    this.tokens = tokens;
    this.variables = variables;
  }

  parse(): Node {
    const node = this.sum();
    if (this.index < this.tokens.length) {
      throw new Error('Check the expression — there is something extra at the end');
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private sum(): Node {
    let left = this.product();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      this.index += 1;
      const right = this.product();
      left = { type: 'binary', operator: token.value, left, right };
    }
    return left;
  }

  private startsAtom(token: Token): boolean {
    return token.type === 'number' || token.type === 'name' || token.type === 'open';
  }

  private product(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (!token) break;
      if (token.type === 'op' && (token.value === '*' || token.value === '/')) {
        this.index += 1;
        const right = this.unary();
        left = { type: 'binary', operator: token.value, left, right };
        continue;
      }
      // Implicit multiplication: `2π`, `3(4 + 1)`, `2sin(30)`. A name that is not a number is still
      // read by `primary`, which is where an unknown name becomes its own sentence.
      if (this.startsAtom(token)) {
        left = { type: 'binary', operator: '*', left, right: this.unary() };
        continue;
      }
      break;
    }
    return left;
  }

  private unary(): Node {
    const token = this.peek();
    if (token?.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.index += 1;
      const operand = this.unary();
      return token.value === '-' ? { type: 'negate', operand } : operand;
    }
    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.index += 1;
      return { type: 'binary', operator: '^', left: base, right: this.unary() };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'op') break;
      if (token.value === '!') {
        this.index += 1;
        node = { type: 'factorial', operand: node };
        continue;
      }
      if (token.value === '%') {
        this.index += 1;
        node = { type: 'percent', operand: node };
        continue;
      }
      break;
    }
    return node;
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) throw new Error('The expression is incomplete');
    if (token.type === 'number') {
      this.index += 1;
      return { type: 'number', value: token.value };
    }
    if (token.type === 'comma') {
      throw new Error('There is a comma without a function that takes two numbers');
    }
    if (token.type === 'close') {
      throw new Error('There is a closing parenthesis without an opening one');
    }
    if (token.type === 'open') {
      this.index += 1;
      const node = this.sum();
      if (this.peek()?.type !== 'close') throw new Error('Add the closing parenthesis');
      this.index += 1;
      return node;
    }
    this.index += 1;
    const name = token.value;
    const spec = FUNCTIONS[name];
    if (spec) {
      if (this.peek()?.type !== 'open') throw new Error(`${name} needs parentheses, like ${name}(30)`);
      this.index += 1;
      const args: Node[] = [];
      if (this.peek()?.type !== 'close') {
        args.push(this.sum());
        while (this.peek()?.type === 'comma') {
          this.index += 1;
          args.push(this.sum());
        }
      }
      if (this.peek()?.type !== 'close') {
        throw new Error(`Add the closing parenthesis after ${name}`);
      }
      this.index += 1;
      if (args.length < spec.min || args.length > spec.max) throw new Error(aritySentence(name, spec));
      return { type: 'call', name, args };
    }
    if (name === 'ans') return { type: 'answer' };
    if (name === 'pi' || name === 'π') return { type: 'constant', name: 'pi' };
    if (name === 'tau' || name === 'τ') return { type: 'constant', name: 'tau' };
    if (name === 'phi' || name === 'φ') return { type: 'constant', name: 'phi' };
    if (name === 'e') return { type: 'constant', name: 'e' };
    if (this.variables.has(name)) return { type: 'variable', name };
    throw new Error(`The calculator does not know “${name}”`);
  }
}

interface Context {
  angle: AngleMode;
  ans: number;
  vars?: Record<string, number>;
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  e: Math.E,
};

function evaluateNode(node: Node, context: Context): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'constant':
      return CONSTANTS[node.name] ?? Number.NaN;
    case 'answer':
      return context.ans;
    case 'variable': {
      const value = context.vars?.[node.name];
      if (value === undefined) throw new Error(`The calculator does not know “${node.name}”`);
      return value;
    }
    case 'negate':
      return -evaluateNode(node.operand, context);
    case 'binary': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      switch (node.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) throw new Error('Division by zero has no value');
          return left / right;
        case '^':
          return Math.pow(left, right);
        default:
          return Number.NaN;
      }
    }
    case 'call':
      return applyFunction(
        node.name,
        node.args.map((argument) => evaluateNode(argument, context)),
        context.angle
      );
    case 'factorial':
      return factorial(evaluateNode(node.operand, context));
    case 'percent':
      return evaluateNode(node.operand, context) / 100;
    default:
      return Number.NaN;
  }
}

/**
 * Read one expression, or throw the sentence the pane should print.
 *
 * A non-finite answer is refused rather than printed as `Infinity`: `tan(90)` in degrees, `ln(0)` and
 * `asin(2)` are all expressions with no real answer, and a calculator that shows `NaN` is one a
 * beginner cannot tell from a bug in their own arithmetic.
 */
export function evaluateExpression(input: string, options: EvaluateOptions = {}): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error('Type an expression first');
  const node = new Parser(tokens).parse();
  const value = evaluateNode(node, {
    angle: options.angle === 'deg' ? 'deg' : 'rad',
    ans: typeof options.ans === 'number' && Number.isFinite(options.ans) ? options.ans : 0,
    vars: options.vars,
  });
  if (!Number.isFinite(value)) throw new Error('That expression has no real value');
  return value;
}

/**
 * The same grammar as a function of one variable (`app/src/graphing.ts` samples it).
 *
 * Syntax is checked now, so a graph expression's sentence appears while it is typed; a value the
 * expression cannot take — `1/x` at zero, `sqrt(x)` below zero — comes back as `NaN` rather than a
 * throw, because a curve's job is to have a gap there, not to stop the plot.
 */
export function compileExpression(
  input: string,
  options: { angle?: AngleMode; variable?: string } = {}
): (value: number) => number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error('Type an expression first');
  const variable = options.variable ?? 'x';
  const node = new Parser(tokens, new Set([variable])).parse();
  const context: Context = {
    angle: options.angle === 'deg' ? 'deg' : 'rad',
    ans: 0,
  };
  return (value: number) => {
    try {
      const answer = evaluateNode(node, { ...context, vars: { [variable]: value } });
      return Number.isFinite(answer) ? answer : Number.NaN;
    } catch {
      return Number.NaN;
    }
  };
}

/**
 * The number as the display prints it: twelve significant digits, no floating-point tail.
 *
 * `0.1 + 0.2` is the case this exists for — the calculator must say `0.3`, not
 * `0.30000000000000004`. A very large or very small answer keeps scientific notation, because the
 * alternative is a row of zeros a learner has to count.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(12));
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  const magnitude = Math.abs(rounded);
  if (magnitude >= 1e12 || magnitude < 1e-9) {
    return rounded
      .toExponential(6)
      .replace(/\.?0+e/, 'e')
      .replace('e+', 'e');
  }
  return String(rounded);
}
