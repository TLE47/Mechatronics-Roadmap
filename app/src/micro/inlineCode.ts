/**
 * Inline and block code tokenization for micro-learning (`app/src/micro/inlineCode.ts`).
 *
 * The authored lessons use backticks around tiny Python expressions. Wrapping the whole
 * expression in one colour makes `x + 1` read like a single word; splitting it into named,
 * numeric and operator tokens lets the eye find the variable first. This is deliberately a
 * tokenizer, not a parser: it never evaluates anything.
 */

export type InlineCodeTokenKind =
  | 'name'
  | 'number'
  | 'string'
  | 'boolean'
  | 'function'
  | 'operator'
  | 'punctuation'
  | 'space';

export interface InlineCodeToken {
  kind: InlineCodeTokenKind;
  text: string;
}

const FUNCTION_NAMES = new Set(['int', 'float', 'str', 'type', 'print']);

export function tokenizeInlineCode(code: string): InlineCodeToken[] {
  const tokens: InlineCodeToken[] = [];
  let index = 0;
  while (index < code.length) {
    const character = code[index];
    const start = index;

    if (/\s/.test(character)) {
      while (index < code.length && /\s/.test(code[index])) index += 1;
      tokens.push({ kind: 'space', text: code.slice(start, index) });
      continue;
    }

    if (character === '"' || character === "'") {
      index += 1;
      while (index < code.length) {
        if (code[index] === '\\') {
          index += 2;
          continue;
        }
        if (code[index] === character) {
          index += 1;
          break;
        }
        index += 1;
      }
      tokens.push({ kind: 'string', text: code.slice(start, index) });
      continue;
    }

    if (/[0-9]/.test(character)) {
      let dot = false;
      while (index < code.length) {
        if (/[0-9]/.test(code[index])) {
          index += 1;
        } else if (code[index] === '.' && !dot) {
          dot = true;
          index += 1;
        } else {
          break;
        }
      }
      tokens.push({ kind: 'number', text: code.slice(start, index) });
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      index += 1;
      while (index < code.length && /[A-Za-z0-9_]/.test(code[index])) index += 1;
      const text = code.slice(start, index);
      const kind: InlineCodeTokenKind =
        text === 'True' || text === 'False'
          ? 'boolean'
          : FUNCTION_NAMES.has(text)
            ? 'function'
            : 'name';
      tokens.push({ kind, text });
      continue;
    }

    if (/[=+\-*/<>!]/.test(character)) {
      while (index < code.length && /[=+\-*/<>!]/.test(code[index])) index += 1;
      tokens.push({ kind: 'operator', text: code.slice(start, index) });
      continue;
    }

    index += 1;
    tokens.push({ kind: 'punctuation', text: character });
  }
  return tokens;
}

const CODE_LITERAL = /^(?:[-+]?\d+(?:\.\d+)?|True|False|int|float|str|bool|".*"|'.*')$/;
const CODE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Whether an option is code rather than a sentence.
 *
 * This keeps prose options in the prose renderer while a variable, literal, assignment or
 * expression gets the same colourful tokens as the lesson. It is a display heuristic only.
 */
export function isCodeLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (CODE_LITERAL.test(trimmed)) return true;
  if (CODE_NAME.test(trimmed)) return trimmed.includes('_');
  if (/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/.test(trimmed)) return true;
  if (/(?:^|\s)[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/.test(trimmed)) return true;
  if (/(?:^|\s)(?:==|!=|>=|<=|[-+*/<>])(?:\s|$)/.test(trimmed)) return true;
  if (/^[A-Za-z_][A-Za-z0-9_]*-[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return true;
  return false;
}
