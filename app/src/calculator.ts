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
 * Failures are Errors with one plain sentence, because the pane prints them verbatim under the
 * expression. `npm run test:calculator` pins the grammar and each of those sentences.
 */

/** The unit trigonometry is read in, chosen by the tab's DEG/RAD switch. */
export type AngleMode = 'deg' | 'rad';

export interface EvaluateOptions {
  angle?: AngleMode;
  /** The previous answer, which the `Ans` key inserts. */
  ans?: number;
}

type Operator = '+' | '-' | '*' | '/' | '^' | '!' | '%';

type Token =
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'op'; value: Operator }
  | { type: 'open' }
  | { type: 'close' };

const FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'ln',
  'log',
  'sqrt',
  'abs',
]);

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
    const name = /^(?:[A-Za-z]+|π)/.exec(rest);
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

function applyFunction(name: string, argument: number, angle: AngleMode): number {
  const unit = angle === 'deg' ? Math.PI / 180 : 1;
  switch (name) {
    case 'sin':
      return Math.sin(argument * unit);
    case 'cos':
      return Math.cos(argument * unit);
    case 'tan':
      return Math.tan(argument * unit);
    case 'asin':
      return Math.asin(argument) / unit;
    case 'acos':
      return Math.acos(argument) / unit;
    case 'atan':
      return Math.atan(argument) / unit;
    case 'ln':
      if (argument <= 0) throw new Error('ln needs a number above zero');
      return Math.log(argument);
    case 'log':
      if (argument <= 0) throw new Error('log needs a number above zero');
      return Math.log10(argument);
    case 'sqrt':
      if (argument < 0) throw new Error('The square root of a negative number is not real');
      return Math.sqrt(argument);
    case 'abs':
      return Math.abs(argument);
    default:
      throw new Error(`The calculator does not know “${name}”`);
  }
}

/**
 * One expression, parsed once. Every method consumes tokens from the left and returns the value it
 * read, so the precedence order is the call graph: sum → product → unary → power → postfix → atom.
 */
class Parser {
  private index = 0;
  private readonly tokens: Token[];
  private readonly angle: AngleMode;
  private readonly ans: number;

  constructor(tokens: Token[], options: EvaluateOptions) {
    this.tokens = tokens;
    this.angle = options.angle === 'deg' ? 'deg' : 'rad';
    this.ans = typeof options.ans === 'number' && Number.isFinite(options.ans) ? options.ans : 0;
  }

  parse(): number {
    const value = this.sum();
    if (this.index < this.tokens.length) {
      throw new Error('Check the expression — there is something extra at the end');
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private sum(): number {
    let value = this.product();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'op' || (token.value !== '+' && token.value !== '-')) break;
      this.index += 1;
      const right = this.product();
      value = token.value === '+' ? value + right : value - right;
    }
    return value;
  }

  private startsAtom(token: Token): boolean {
    return token.type === 'number' || token.type === 'name' || token.type === 'open';
  }

  private product(): number {
    let value = this.unary();
    for (;;) {
      const token = this.peek();
      if (!token) break;
      if (token.type === 'op' && (token.value === '*' || token.value === '/')) {
        this.index += 1;
        const right = this.unary();
        if (token.value === '/') {
          if (right === 0) throw new Error('Division by zero has no value');
          value /= right;
        } else {
          value *= right;
        }
        continue;
      }
      // Implicit multiplication: `2π`, `3(4 + 1)`, `2sin(30)`. A name that is not a number is still
      // read by `primary`, which is where an unknown name becomes its own sentence.
      if (this.startsAtom(token)) {
        value *= this.unary();
        continue;
      }
      break;
    }
    return value;
  }

  private unary(): number {
    const token = this.peek();
    if (token?.type === 'op' && (token.value === '-' || token.value === '+')) {
      this.index += 1;
      const value = this.unary();
      return token.value === '-' ? -value : value;
    }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    const token = this.peek();
    if (token?.type === 'op' && token.value === '^') {
      this.index += 1;
      return Math.pow(base, this.unary());
    }
    return base;
  }

  private postfix(): number {
    let value = this.primary();
    for (;;) {
      const token = this.peek();
      if (token?.type !== 'op') break;
      if (token.value === '!') {
        this.index += 1;
        value = factorial(value);
        continue;
      }
      if (token.value === '%') {
        this.index += 1;
        value /= 100;
        continue;
      }
      break;
    }
    return value;
  }

  private primary(): number {
    const token = this.peek();
    if (!token) throw new Error('The expression is incomplete');
    if (token.type === 'number') {
      this.index += 1;
      return token.value;
    }
    if (token.type === 'close') {
      throw new Error('There is a closing parenthesis without an opening one');
    }
    if (token.type === 'open') {
      this.index += 1;
      const value = this.sum();
      if (this.peek()?.type !== 'close') throw new Error('Add the closing parenthesis');
      this.index += 1;
      return value;
    }
    this.index += 1;
    const name = token.value;
    if (FUNCTIONS.has(name)) {
      if (this.peek()?.type !== 'open') throw new Error(`${name} needs parentheses, like ${name}(30)`);
      this.index += 1;
      const argument = this.sum();
      if (this.peek()?.type !== 'close') {
        throw new Error(`Add the closing parenthesis after ${name}`);
      }
      this.index += 1;
      return applyFunction(name, argument, this.angle);
    }
    if (name === 'ans') return this.ans;
    if (name === 'pi' || name === 'π') return Math.PI;
    if (name === 'e') return Math.E;
    throw new Error(`The calculator does not know “${name}”`);
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
  const value = new Parser(tokens, options).parse();
  if (!Number.isFinite(value)) throw new Error('That expression has no real value');
  return value;
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
