/**
 * The calculator's typesetting pass (`app/src/calculatorTypeset.ts`).
 *
 * A calculator that answers `1/3` with a linear slash is showing its source, not the fraction. This
 * module walks the AST `calculator.ts` already parsed and writes the same expression as TeX, so the
 * display can stack fractions, roots and powers the way the paper would. It is a serializer, not a
 * second grammar: anything the calculator refuses has no typeset form either, and the caller falls
 * back to the raw text.
 *
 * TeX is only produced here; `MathView` is the one renderer, so the calculator's math looks like the
 * formulas already in the lessons.
 */

import { parseExpression, type Node } from './calculator.ts';

const FUNCTIONS: Record<string, string> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  sec: '\\sec',
  csc: '\\csc',
  cot: '\\cot',
  asin: '\\arcsin',
  acos: '\\arccos',
  atan: '\\arctan',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  ln: '\\ln',
  log: '\\log',
  exp: '\\exp',
  min: '\\min',
  max: '\\max',
  gcd: '\\gcd',
};

const CONSTANTS: Record<string, string> = {
  pi: '\\pi',
  tau: '\\tau',
  phi: '\\varphi',
  e: 'e',
};

function texNumber(value: number): string {
  const text = String(value);
  const scientific = /^(\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(text);
  if (!scientific) return text;
  return `${scientific[1]} \\times 10^{${Number(scientific[2])}}`;
}

function texName(name: string): string {
  const escaped = name.replace(/_/g, '\\_');
  return escaped.length === 1 ? escaped : `\\mathrm{${escaped}}`;
}

function isAddition(node: Node): boolean {
  return node.type === 'binary' && (node.operator === '+' || node.operator === '-');
}

/** A postfix operator needs parentheses around a sum, but never around a number or a call. */
function needsPostfixGrouping(node: Node): boolean {
  return node.type === 'binary' || node.type === 'negate';
}

/** A value that can sit next to another without an explicit multiplication sign. */
function isSymbol(node: Node): boolean {
  return (
    node.type === 'variable' ||
    node.type === 'constant' ||
    node.type === 'answer' ||
    node.type === 'call'
  );
}

function parenthesize(tex: string, needed: boolean): string {
  return needed ? `\\left(${tex}\\right)` : tex;
}

function texCall(node: Extract<Node, { type: 'call' }>): string {
  const args = node.args.map((argument) => texNode(argument));
  const first = args[0] ?? '';
  switch (node.name) {
    case 'sqrt':
      return `\\sqrt{${first}}`;
    case 'cbrt':
      return `\\sqrt[3]{${first}}`;
    case 'nthroot':
      return `\\sqrt[${first}]{${args[1] ?? ''}}`;
    case 'abs':
      return `\\left|${first}\\right|`;
    case 'floor':
      return `\\left\\lfloor ${first} \\right\\rfloor`;
    case 'ceil':
      return `\\left\\lceil ${first} \\right\\rceil`;
    case 'log2':
      return `\\log_{2}\\left(${first}\\right)`;
    case 'logb':
      return `\\log_{${first}}\\left(${args[1] ?? ''}\\right)`;
    case 'atan2':
      return `\\operatorname{atan2}\\left(${args.join(',\\ ')}\\right)`;
    default: {
      const name = FUNCTIONS[node.name] ?? `\\operatorname{${node.name}}`;
      return `${name}\\left(${args.join(',\\ ')}\\right)`;
    }
  }
}

function texNode(node: Node): string {
  switch (node.type) {
    case 'number':
      return texNumber(node.value);
    case 'constant':
      return CONSTANTS[node.name] ?? texName(node.name);
    case 'variable':
      return texName(node.name);
    case 'answer':
      return '\\mathrm{Ans}';
    case 'negate':
      return `-${parenthesize(texNode(node.operand), isAddition(node.operand))}`;
    case 'call':
      return texCall(node);
    case 'factorial':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}!`;
    case 'percent':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}\\%`;
    case 'binary': {
      if (node.operator === '/') {
        // The fraction bar is its own grouping: `(2+1)/(2-1)` needs no extra parentheses.
        return `\\frac{${texNode(node.left)}}{${texNode(node.right)}}`;
      }
      if (node.operator === '^') {
        const needsParens =
          node.left.type === 'binary' || node.left.type === 'negate' || node.left.type === 'call';
        return `${parenthesize(texNode(node.left), needsParens)}^{${texNode(node.right)}}`;
      }
      if (node.operator === '+' || node.operator === '-') {
        const right = parenthesize(texNode(node.right), node.operator === '-' && isAddition(node.right));
        return `${texNode(node.left)} ${node.operator} ${right}`;
      }
      const leftTex = parenthesize(texNode(node.left), isAddition(node.left));
      const rightTex = parenthesize(texNode(node.right), isAddition(node.right));
      // `2x` and `xy` are juxtaposition; two plain numbers get the dot they were typed with.
      const juxtapose =
        (node.left.type === 'number' && isSymbol(node.right)) ||
        (isSymbol(node.left) && isSymbol(node.right));
      // The thin space keeps `\\pi` and `e` from merging into an unknown command like `\\pie`.
      return juxtapose ? `${leftTex}\\,${rightTex}` : `${leftTex} \\cdot ${rightTex}`;
    }
    default:
      return '';
  }
}

/**
 * The display form of one calculator expression, or null when the calculator cannot parse it.
 *
 * The tape uses this for every kept expression; the active line asks the caller to show it only
 * when the raw text contains a fraction, so an ordinary sum does not appear twice.
 */
export function typesetExpression(input: string): string | null {
  try {
    return texNode(parseExpression(input));
  } catch {
    return null;
  }
}
