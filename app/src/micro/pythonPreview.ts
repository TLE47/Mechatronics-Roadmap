/**
 * A very small Python tracer for the micro quiz comparison (`app/src/micro/pythonPreview.ts`).
 *
 * The authored quiz code is deliberately simple: literal assignments, arithmetic, comparisons,
 * `int()`/`float()`/`str()`, and one f-string. This module evaluates that subset so the comparison
 * card can plug the values a learner has already met into the next line. It is not a Python
 * runtime: it never uses `eval`, never touches the network, and returns a named error instead of
 * executing anything unexpected.
 */

export type PreviewValue = number | string | boolean;

export interface PreviewRecord {
  kind: 'assignment' | 'print' | 'expression';
  source: string;
  expression: string;
  plugged: string;
  name?: string;
  value?: PreviewValue;
  output?: string;
  error?: string;
}

export interface PythonTrace {
  records: PreviewRecord[];
  lastByName: Record<string, PreviewRecord>;
  lastPrint: PreviewRecord | null;
  last: PreviewRecord | null;
}

type Environment = Record<string, PreviewValue>;

interface Token {
  kind: 'number' | 'string' | 'fstring' | 'name' | 'operator' | 'punctuation';
  text: string;
}

const TOKEN_PATTERN =
  /f"(?:\\.|[^"\\])*"|f'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+(?:\.\d+)?|[A-Za-z_]\w*|==|!=|>=|<=|\*\*|[+\-*/<>(),]/g;

const ASSIGNMENT = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/;
const PRINT = /^print\((.*)\)$/;

class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewError';
  }
}

function fail(kind: string): never {
  throw new PreviewError(kind);
}

function errorLabel(error: unknown): string {
  return error instanceof PreviewError ? error.message : 'SyntaxError';
}

function classify(raw: string): Token {
  if (/^f["']/.test(raw)) return { kind: 'fstring', text: raw };
  if (/^["']/.test(raw)) return { kind: 'string', text: raw };
  if (/^\d/.test(raw)) return { kind: 'number', text: raw };
  if (/^[A-Za-z_]/.test(raw)) return { kind: 'name', text: raw };
  if (/^[(),]$/.test(raw)) return { kind: 'punctuation', text: raw };
  return { kind: 'operator', text: raw };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(source)) !== null) {
    if (source.slice(last, match.index).trim()) fail('SyntaxError');
    tokens.push(classify(match[0]));
    last = match.index + match[0].length;
  }
  if (source.slice(last).trim()) fail('SyntaxError');
  return tokens;
}

function decodeString(raw: string): string {
  return raw
    .slice(1, -1)
    .replace(/\\(["'\\nrt])/g, (_, character: string) => {
      if (character === 'n') return '\n';
      if (character === 'r') return '\r';
      if (character === 't') return '\t';
      return character;
    });
}

export function display(value: PreviewValue): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

export function codeRepr(value: PreviewValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return display(value);
}

function numberValue(value: PreviewValue): number {
  if (typeof value !== 'number') fail('TypeError');
  return value;
}

function operate(operator: string, left: PreviewValue, right: PreviewValue): PreviewValue {
  if (operator === '+') {
    if (typeof left === 'number' && typeof right === 'number') return left + right;
    if (typeof left === 'string' && typeof right === 'string') return left + right;
    fail('TypeError');
  }
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;
  if (operator === '>' || operator === '<' || operator === '>=' || operator === '<=') {
    if (typeof left !== typeof right || (typeof left !== 'number' && typeof left !== 'string')) {
      fail('TypeError');
    }
    if (operator === '>') return left > right;
    if (operator === '<') return left < right;
    if (operator === '>=') return left >= right;
    return left <= right;
  }
  const leftNumber = numberValue(left);
  const rightNumber = numberValue(right);
  if (operator === '-') return leftNumber - rightNumber;
  if (operator === '*') return leftNumber * rightNumber;
  if (operator === '/') {
    if (rightNumber === 0) fail('ZeroDivisionError');
    return leftNumber / rightNumber;
  }
  fail('SyntaxError');
}

function callFunction(name: string, args: PreviewValue[]): PreviewValue {
  if (name === 'str') {
    if (args.length !== 1) fail('TypeError');
    return display(args[0]);
  }
  if (name === 'int') {
    if (args.length !== 1) fail('TypeError');
    const value = args[0];
    if (typeof value === 'number') return Math.trunc(value);
    if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return Number(value);
    fail('ValueError');
  }
  if (name === 'float') {
    if (args.length !== 1) fail('TypeError');
    const value = args[0];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
      return Number(value);
    }
    fail('ValueError');
  }
  if (name === 'bool') {
    if (args.length !== 1) fail('TypeError');
    return Boolean(args[0]);
  }
  fail('NameError');
}

function formatFormatted(value: PreviewValue, spec: string): string {
  if (!spec) return display(value);
  const fixed = /^\.([0-9]+)f$/.exec(spec);
  if (fixed) {
    if (typeof value !== 'number') fail('ValueError');
    return value.toFixed(Number(fixed[1]));
  }
  return display(value);
}

function findClosingBrace(body: string, start: number): number {
  let depth = 1;
  let quote = '';
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  fail('SyntaxError');
}

function splitFormat(inside: string): { expression: string; spec: string } {
  let quote = '';
  let depth = 0;
  for (let index = 0; index < inside.length; index += 1) {
    const character = inside[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === ':' && depth === 0) {
      return { expression: inside.slice(0, index).trim(), spec: inside.slice(index + 1).trim() };
    }
  }
  return { expression: inside.trim(), spec: '' };
}

function evaluateFString(raw: string, env: Environment): string {
  const body = decodeString(raw.slice(1));
  let output = '';
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '{' && body[index + 1] === '{') {
      output += '{';
      index += 1;
      continue;
    }
    if (character === '}' && body[index + 1] === '}') {
      output += '}';
      index += 1;
      continue;
    }
    if (character === '{') {
      const end = findClosingBrace(body, index + 1);
      const { expression, spec } = splitFormat(body.slice(index + 1, end));
      output += formatFormatted(evaluateExpression(expression, env), spec);
      index = end;
      continue;
    }
    if (character === '}') fail('SyntaxError');
    output += character;
  }
  return output;
}

class Parser {
  private tokens: Token[];
  private index = 0;
  private env: Environment;

  constructor(tokens: Token[], env: Environment) {
    this.tokens = tokens;
    this.env = env;
  }

  parse(): PreviewValue {
    const value = this.comparison();
    if (this.index < this.tokens.length) fail('SyntaxError');
    return value;
  }

  private peek(text: string): boolean {
    return this.tokens[this.index]?.text === text;
  }

  private take(text: string): boolean {
    if (!this.peek(text)) return false;
    this.index += 1;
    return true;
  }

  private expect(text: string): void {
    if (!this.take(text)) fail('SyntaxError');
  }

  private comparison(): PreviewValue {
    let value = this.additive();
    while (true) {
      const token = this.tokens[this.index];
      if (!token || !['==', '!=', '>', '<', '>=', '<='].includes(token.text)) return value;
      this.index += 1;
      value = operate(token.text, value, this.additive());
    }
  }

  private additive(): PreviewValue {
    let value = this.multiplicative();
    while (true) {
      const token = this.tokens[this.index];
      if (!token || (token.text !== '+' && token.text !== '-')) return value;
      this.index += 1;
      value = operate(token.text, value, this.multiplicative());
    }
  }

  private multiplicative(): PreviewValue {
    let value = this.unary();
    while (true) {
      const token = this.tokens[this.index];
      if (!token || (token.text !== '*' && token.text !== '/')) return value;
      this.index += 1;
      value = operate(token.text, value, this.unary());
    }
  }

  private unary(): PreviewValue {
    if (this.take('+')) return this.unary();
    if (this.take('-')) {
      const value = this.unary();
      if (typeof value !== 'number') fail('TypeError');
      return -value;
    }
    return this.primary();
  }

  private primary(): PreviewValue {
    const token = this.tokens[this.index];
    if (!token) fail('SyntaxError');
    this.index += 1;
    if (token.kind === 'number') return Number(token.text);
    if (token.kind === 'string') return decodeString(token.text);
    if (token.kind === 'fstring') return evaluateFString(token.text, this.env);
    if (token.kind !== 'name') fail('SyntaxError');
    if (token.text === 'True') return true;
    if (token.text === 'False') return false;
    if (this.peek('(')) {
      this.expect('(');
      const args: PreviewValue[] = [];
      if (!this.peek(')')) {
        do {
          args.push(this.comparison());
        } while (this.take(','));
      }
      this.expect(')');
      return callFunction(token.text, args);
    }
    if (Object.prototype.hasOwnProperty.call(this.env, token.text)) return this.env[token.text];
    fail('NameError');
  }
}

export function evaluateExpression(expression: string, env: Environment): PreviewValue {
  return new Parser(tokenize(expression), env).parse();
}

function substitute(expression: string, env: Environment): string {
  const pattern = new RegExp(TOKEN_PATTERN.source, 'g');
  let output = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(expression)) !== null) {
    output += expression.slice(last, match.index);
    const text = match[0];
    const isName = /^[A-Za-z_]\w*$/.test(text);
    const after = expression.slice(match.index + text.length).trimStart();
    if (isName && Object.prototype.hasOwnProperty.call(env, text) && !after.startsWith('(')) {
      output += codeRepr(env[text]);
    } else {
      output += text;
    }
    last = match.index + text.length;
  }
  output += expression.slice(last);
  return output;
}

function splitArguments(source: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth -= 1;
    else if (character === ',' && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

/**
 * Walk the authored code once, keeping the environment before each assignment so the caller can
 * show "x = x + 5" beside "x = 10 + 5" without replaying anything.
 */
export function tracePython(code: string): PythonTrace {
  const env: Environment = {};
  const records: PreviewRecord[] = [];
  const lastByName: Record<string, PreviewRecord> = {};
  let lastPrint: PreviewRecord | null = null;
  let last: PreviewRecord | null = null;

  for (const raw of code.split(/\r?\n/)) {
    const source = raw.trim();
    if (!source) continue;

    const assignment = ASSIGNMENT.exec(source);
    if (assignment) {
      const [, name, expression] = assignment;
      const plugged = substitute(expression, env);
      let value: PreviewValue | undefined;
      let error: string | undefined;
      try {
        value = evaluateExpression(expression, env);
      } catch (failure) {
        error = errorLabel(failure);
      }
      const record: PreviewRecord = {
        kind: 'assignment',
        source,
        expression,
        plugged: `${name} = ${plugged}`,
        name,
        ...(value === undefined ? {} : { value }),
        ...(error ? { error } : {}),
      };
      records.push(record);
      last = record;
      if (!error && value !== undefined) {
        env[name] = value;
        lastByName[name] = record;
      }
      continue;
    }

    const print = PRINT.exec(source);
    if (print) {
      const args = splitArguments(print[1]);
      let output: string | undefined;
      let error: string | undefined;
      try {
        output = args.map((argument) => display(evaluateExpression(argument, env))).join(' ');
      } catch (failure) {
        error = errorLabel(failure);
      }
      const record: PreviewRecord = {
        kind: 'print',
        source,
        expression: print[1],
        plugged: `print(${substitute(print[1], env)})`,
        ...(output === undefined ? {} : { output }),
        ...(error ? { error } : {}),
      };
      records.push(record);
      last = record;
      lastPrint = record;
      continue;
    }

    let value: PreviewValue | undefined;
    let error: string | undefined;
    try {
      value = evaluateExpression(source, env);
    } catch (failure) {
      error = errorLabel(failure);
    }
    const record: PreviewRecord = {
      kind: 'expression',
      source,
      expression: source,
      plugged: substitute(source, env),
      ...(value === undefined ? {} : { value }),
      ...(error ? { error } : {}),
    };
    records.push(record);
    last = record;
  }

  return { records, lastByName, lastPrint, last };
}
