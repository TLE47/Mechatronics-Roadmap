import React from 'react';
import {
  isCodeLikeText,
  tokenizeInlineCode,
  type InlineCodeToken,
} from '../../micro/inlineCode.ts';
import { MathView } from '../MathView';
import { parseInline } from '../../readerMarkdown';

/**
 * Rich, hand-sized typography for micro-learning (`components/micro/MicroText.tsx`).
 *
 * Teaching sentences are authored with backticks and `**bold**`. Inline code is split into
 * colourful little tokens so a variable stands out from its operator and value in a sentence.
 * The same token palette is used by quiz equations and code-like options, so the lesson and the
 * check read the same way.
 */

type TokenKind = Exclude<InlineCodeToken['kind'], 'space'>;

export type MicroCodeTone = 'lesson' | 'plugged';

const INLINE_TONE: Record<TokenKind, string> = {
  name: 'border-accent/30 bg-accent/15 text-accent',
  number: 'border-amber/30 bg-amber/15 text-amber',
  string: 'border-purple/30 bg-purple/15 text-purple',
  boolean: 'border-rose/30 bg-rose/15 text-rose',
  function: 'border-emerald/30 bg-emerald/15 text-emerald',
  operator: 'text-muted',
  punctuation: 'text-faint',
};

const BLOCK_TONE: Record<TokenKind, string> = {
  name: 'rounded-sm bg-accent/10 px-0.5 text-accent',
  number: 'rounded-sm bg-amber/10 px-0.5 text-amber',
  string: 'rounded-sm bg-purple/10 px-0.5 text-purple',
  boolean: 'rounded-sm bg-rose/10 px-0.5 text-rose',
  function: 'rounded-sm bg-emerald/10 px-0.5 text-emerald',
  operator: 'text-muted',
  punctuation: 'text-faint',
};

/** Values the tracer substituted are green, distinct from the authored numbers and strings. */
const PLUGGED_BLOCK_TONE: Record<TokenKind, string> = {
  ...BLOCK_TONE,
  number: 'rounded-sm bg-emerald/10 px-0.5 text-emerald',
  string: 'rounded-sm bg-emerald/10 px-0.5 text-emerald',
  boolean: 'rounded-sm bg-emerald/10 px-0.5 text-emerald',
};

function CodeTokens({
  code,
  mode,
  tone = 'lesson',
}: {
  code: string;
  mode: 'inline' | 'block';
  tone?: MicroCodeTone;
}) {
  const tones = mode === 'inline' ? INLINE_TONE : tone === 'plugged' ? PLUGGED_BLOCK_TONE : BLOCK_TONE;
  return (
    <>
      {tokenizeInlineCode(code).map((token, index) =>
        token.kind === 'space' ? (
          <span key={`${token.text}-${index}`} className="whitespace-pre">
            {token.text}
          </span>
        ) : (
          <span
            key={`${token.text}-${index}`}
            data-token={token.kind}
            data-substituted={
              mode === 'block' &&
              tone === 'plugged' &&
              (token.kind === 'number' || token.kind === 'string' || token.kind === 'boolean')
                ? 'true'
                : undefined
            }
            className={`${mode === 'inline' ? 'rounded px-1 py-0.5' : ''} ${tones[token.kind]} ${
              mode === 'block' &&
              tone === 'plugged' &&
              (token.kind === 'number' || token.kind === 'string' || token.kind === 'boolean')
                ? 'micro-plugged-value'
                : ''
            }`}
          >
            {token.text}
          </span>
        )
      )}
    </>
  );
}

function InlineCode({ code }: { code: string }) {
  return (
    <code className="mx-0.5 inline-flex max-w-full flex-wrap items-baseline gap-0.5 rounded-lg border border-line-soft bg-canvas/90 px-1.5 py-0.5 align-baseline font-mono text-[0.84em] leading-tight">
      <CodeTokens code={code} mode="inline" />
    </code>
  );
}

/** A single colourful code-shaped line, used by comparisons and code-like options. */
export function MicroCodeLine({
  code,
  className = '',
  tone = 'lesson',
}: {
  code: string;
  className?: string;
  tone?: MicroCodeTone;
}) {
  return (
    <code className={`inline-flex max-w-full flex-wrap items-baseline gap-x-0.5 gap-y-0.5 break-words font-mono text-[12.5px] leading-relaxed ${className}`}>
      <CodeTokens code={code} mode="block" tone={tone} />
    </code>
  );
}

/** A compact, colourful code block for a question or a worked expression. */
export function MicroCodeBlock({
  code,
  compact = false,
  className = '',
}: {
  code: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <pre
      className={`overflow-x-auto rounded-lg border border-line-soft bg-panel font-mono text-body ${
        compact ? 'p-2.5 text-[12.5px] leading-snug' : 'p-3 text-[13px] leading-relaxed'
      } ${className}`}
    >
      <code className="block min-w-0">
        {code.split('\n').map((line, index) => (
          <span key={`${line}-${index}`} className="block whitespace-pre-wrap break-words">
            {line ? <CodeTokens code={line} mode="block" /> : '\u00a0'}
          </span>
        ))}
      </code>
    </pre>
  );
}

/** Prose stays prose; a code-like option gets the lesson's variable/number token colours. */
export function MicroOptionText({ text }: { text: string }) {
  return isCodeLikeText(text) ? (
    <MicroCodeLine code={text} className="text-[13px]" />
  ) : (
    <MicroRichText text={text} />
  );
}

/**
 * A goal's inline marks, drawn with the reader's own parser.
 *
 * Goals are authored in Markdown — `**bold**`, `` `code` ``, `$math$` — and only the first two used
 * to be drawn: a formula was printed as its own LaTeX source in the middle of the sentence, so every
 * lesson with one showed `$\\pi\\text{ rad} = 180^\\circ$` instead of the formula. The split is
 * `parseInline`, the parser the lesson reader and the workflow card use, so a goal and a page agree on
 * what `$5 and $6` means (money, not an unclosed formula) and a formula inside a bold phrase is drawn
 * rather than left as source. `MathView` is the same KaTeX component the cheat sheet renders with.
 */
function inlineRuns(text: string, keyPrefix: string): React.ReactNode[] {
  return parseInline(text).map((run, index) => {
    const key = `${keyPrefix}${index}`;
    switch (run.k) {
      case 'code':
        return <InlineCode key={key} code={run.v} />;
      case 'strong':
        return (
          <strong key={key} className="font-bold text-ink">
            {inlineRuns(run.v, `${key}-`)}
          </strong>
        );
      case 'em':
        return <em key={key}>{inlineRuns(run.v, `${key}-`)}</em>;
      case 'u':
        return <u key={key}>{inlineRuns(run.v, `${key}-`)}</u>;
      case 'link':
        return (
          <a key={key} href={run.href} className="text-accent underline">
            {inlineRuns(run.v, `${key}-`)}
          </a>
        );
      case 'math':
        return <MathView key={key} math={run.v} className="mx-0.5 align-baseline" />;
      default:
        return <React.Fragment key={key}>{run.v}</React.Fragment>;
    }
  });
}

export function MicroRichText({ text, className = '' }: { text: string; className?: string }) {
  return <span className={className}>{inlineRuns(text, 'inline')}</span>;
}
