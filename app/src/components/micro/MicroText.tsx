import React from 'react';
import {
  isCodeLikeText,
  tokenizeInlineCode,
  type InlineCodeToken,
} from '../../micro/inlineCode.ts';

/**
 * Rich, hand-sized typography for micro-learning (`components/micro/MicroText.tsx`).
 *
 * Teaching sentences are authored with backticks and `**bold**`. Inline code is split into
 * colourful little tokens so a variable stands out from its operator and value in a sentence.
 * The same token palette is used by quiz equations and code-like options, so the lesson and the
 * check read the same way.
 */

type TokenKind = Exclude<InlineCodeToken['kind'], 'space'>;

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

function CodeTokens({ code, mode }: { code: string; mode: 'inline' | 'block' }) {
  const tones = mode === 'inline' ? INLINE_TONE : BLOCK_TONE;
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
            className={`${mode === 'inline' ? 'rounded px-1 py-0.5' : ''} ${tones[token.kind]}`}
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
export function MicroCodeLine({ code, className = '' }: { code: string; className?: string }) {
  return (
    <code className={`inline-flex max-w-full flex-wrap items-baseline gap-x-0.5 gap-y-0.5 font-mono text-[12.5px] leading-relaxed ${className}`}>
      <CodeTokens code={code} mode="block" />
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

export function MicroRichText({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={`${part}-${index}`} className="font-bold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <InlineCode key={`${part}-${index}`} code={part.slice(1, -1)} />;
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
      })}
    </span>
  );
}
