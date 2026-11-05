/**
 * Inline code tokenization for micro-learning prose (`app/src/micro/inlineCode.ts`).
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

const TOKEN_PATTERN =
  /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b(?:True|False)\b|\b(?:int|float|str|type|print)\b|[A-Za-z_]\w*|\s+|[=+\-*/<>!]+|.)/g;

export function tokenizeInlineCode(code: string): InlineCodeToken[] {
  const tokens: InlineCodeToken[] = [];
  let match: RegExpExecArray | null;
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(code)) !== null) {
    const text = match[0];
    let kind: InlineCodeTokenKind = 'punctuation';
    if (/^\s+$/.test(text)) kind = 'space';
    else if (/^["']/.test(text)) kind = 'string';
    else if (/^\d/.test(text)) kind = 'number';
    else if (text === 'True' || text === 'False') kind = 'boolean';
    else if (/^(int|float|str|type|print)$/.test(text)) kind = 'function';
    else if (/^[A-Za-z_]\w*$/.test(text)) kind = 'name';
    else if (/^[=+\-*/<>!]+$/.test(text)) kind = 'operator';
    tokens.push({ kind, text });
  }
  return tokens;
}
