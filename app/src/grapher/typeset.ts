/**
 * The graphing sheet's typesetting pass (`app/src/grapher/typeset.ts`).
 *
 * Desmos does not make a learner read `x^2 + y^2 = 9` as code: it draws the equation as the paper
 * would, immediately under the line being typed. This module walks the same AST `parser.ts` plots
 * and writes it as TeX, so the expression list can show the real equation above its editable source.
 *
 * It is a serializer, not a second grammar. Whatever the parser accepts — explicit curves, implicit
 * equations, parameter definitions, LaTeX input, implicit multiplication — gets a display form; an
 * unfinished line returns null and the sheet shows its error sentence instead.
 *
 * The display rules follow paper, not JavaScript:
 *   division → a stacked fraction          power → a superscript
 *   sqrt/cbrt/nthroot → radical signs      abs/floor/ceil → the matching delimiters
 *   sin/cos/… → upright function names     π, τ, φ → their glyphs
 *   `L1`, `Kp` → one upright symbol        `x`, `y` → italic variables
 */

import { parseEquation, type AstNode } from './parser.ts';

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
  asinh: '\\operatorname{asinh}',
  acosh: '\\operatorname{acosh}',
  atanh: '\\operatorname{atanh}',
  ln: '\\ln',
  log: '\\log',
  exp: '\\exp',
  min: '\\min',
  max: '\\max',
  gcd: '\\gcd',
  lcm: '\\operatorname{lcm}',
  sign: '\\operatorname{sign}',
  round: '\\operatorname{round}',
  trunc: '\\operatorname{trunc}',
};

const CONSTANTS: Record<string, string> = {
  pi: '\\pi',
  'π': '\\pi',
  tau: '\\tau',
  'τ': '\\tau',
  phi: '\\varphi',
  'φ': '\\varphi',
  e: 'e',
};

const GREEK: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  rho: '\\rho',
  sigma: '\\sigma',
  upsilon: '\\upsilon',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
};

function escapeTex(name: string): string {
  return name.replace(/[_{}%$#&^~\\]/g, (character) => `\\${character}`);
}

/** One identifier as one symbol: `L1` → `L₁`, `Kp` → upright Kp, `x` → italic x. */
function texName(name: string): string {
  const greek = GREEK[name];
  if (greek) return greek;
  const digitSubscript = /^([A-Za-z])(?:_?([0-9]+))$/.exec(name);
  if (digitSubscript) return `${digitSubscript[1]}_{${digitSubscript[2]}}`;
  const underscored = /^([A-Za-z])_(.+)$/.exec(name);
  if (underscored) {
    return `${underscored[1]}_{\\mathrm{${escapeTex(underscored[2])}}}`;
  }
  return name.length === 1 ? escapeTex(name) : `\\mathrm{${escapeTex(name)}}`;
}

function texNumber(value: number): string {
  const text = String(value);
  const scientific = /^(\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(text);
  if (!scientific) return text;
  return `${scientific[1]} \\times 10^{${Number(scientific[2])}}`;
}

function isSum(node: AstNode): boolean {
  return node.kind === 'binary' && (node.operator === '+' || node.operator === '-');
}

function needsPostfixGrouping(node: AstNode): boolean {
  return node.kind === 'binary' || node.kind === 'negate';
}

function parenthesize(tex: string, needed: boolean): string {
  return needed ? `\\left(${tex}\\right)` : tex;
}

function texCall(node: Extract<AstNode, { kind: 'call' }>): string {
  const args = node.args.map((argument) => texNode(argument));
  const first = args[0] ?? '';
  const second = args[1] ?? '';
  switch (node.name) {
    case 'sqrt':
      return `\\sqrt{${first}}`;
    case 'cbrt':
      return `\\sqrt[3]{${first}}`;
    case 'nthroot':
      return `\\sqrt[${first}]{${second}}`;
    case 'abs':
      return `\\left|${first}\\right|`;
    case 'floor':
      return `\\left\\lfloor ${first} \\right\\rfloor`;
    case 'ceil':
      return `\\left\\lceil ${first} \\right\\rceil`;
    case 'log2':
      return `\\log_{2}\\left(${first}\\right)`;
    case 'logb':
      return `\\log_{${first}}\\left(${second}\\right)`;
    case 'atan2':
      return `\\operatorname{atan2}\\left(${args.join(',\\ ')}\\right)`;
    case 'mod':
      return `\\operatorname{mod}\\left(${args.join(',\\ ')}\\right)`;
    case 'ncr':
      return `\\binom{${first}}{${second}}`;
    case 'npr':
      return `{}_{${first}}P_{${second}}`;
    default: {
      const name = FUNCTIONS[node.name] ?? `\\operatorname{${node.name}}`;
      return `${name}\\left(${args.join(',\\ ')}\\right)`;
    }
  }
}

function texNode(node: AstNode): string {
  switch (node.kind) {
    case 'number':
      return texNumber(node.value);
    case 'constant':
      return CONSTANTS[node.name] ?? texName(node.name);
    case 'variable':
      return texName(node.name);
    case 'negate':
      return `-${parenthesize(texNode(node.operand), isSum(node.operand))}`;
    case 'call':
      return texCall(node);
    case 'factorial':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}!`;
    case 'percent':
      return `${parenthesize(texNode(node.operand), needsPostfixGrouping(node.operand))}\\%`;
    case 'binary': {
      if (node.operator === '/') {
        return `\\frac{${texNode(node.left)}}{${texNode(node.right)}}`;
      }
      if (node.operator === '^') {
        const needsParens =
          node.left.kind === 'binary' || node.left.kind === 'negate' || node.left.kind === 'call';
        return `${parenthesize(texNode(node.left), needsParens)}^{${texNode(node.right)}}`;
      }
      if (node.operator === '+' || node.operator === '-') {
        const right = parenthesize(texNode(node.right), node.operator === '-' && isSum(node.right));
        return `${texNode(node.left)} ${node.operator} ${right}`;
      }
      const leftTex = parenthesize(texNode(node.left), isSum(node.left));
      const rightTex = parenthesize(texNode(node.right), isSum(node.right));
      // Implicit multiplication reads as juxtaposition, as it does on paper. A dot is reserved for
      // two explicit numbers, where `23` would otherwise look like one number.
      const bothNumbers = node.left.kind === 'number' && node.right.kind === 'number';
      return bothNumbers ? `${leftTex} \\cdot ${rightTex}` : `${leftTex}\\,${rightTex}`;
    }
    default:
      return '';
  }
}

/**
 * The display form of one graph line, or null when the parser cannot read it.
 *
 * An equals sign is shown as one too: `y = sin(x)` does not lose its `y`, and `a = 2.5` still reads
 * as the parameter it is. A bare expression (`sin(x)`) is shown alone.
 */
export function typesetEquation(input: string): string | null {
  try {
    const equation = parseEquation(input);
    const lhs = equation.lhs ? texNode(equation.lhs) : null;
    const rhs = equation.rhs ? texNode(equation.rhs) : null;
    if (lhs !== null && rhs !== null) return `${lhs} = ${rhs}`;
    return texNode(equation.ast);
  } catch {
    return null;
  }
}
