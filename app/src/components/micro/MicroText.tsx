import React from 'react';
import { tokenizeInlineCode, type InlineCodeToken } from '../../micro/inlineCode.ts';

/**
 * Rich, hand-sized typography for micro-learning prose (`components/micro/MicroText.tsx`).
 *
 * Teaching sentences are authored with backticks and `**bold**`. Inline code is split into
 * colourful little tokens so a variable stands out from its operator and value in a sentence.
 */

const TOKEN_TONE: Record<Exclude<InlineCodeToken['kind'], 'space'>, string> = {
  name: 'border-accent/30 bg-accent/15 text-accent',
  number: 'border-amber/30 bg-amber/15 text-amber',
  string: 'border-purple/30 bg-purple/15 text-purple',
  boolean: 'border-rose/30 bg-rose/15 text-rose',
  function: 'border-emerald/30 bg-emerald/15 text-emerald',
  operator: 'text-muted',
  punctuation: 'text-faint',
};

function InlineCode({ code }: { code: string }) {
  return (
    <code className="mx-0.5 inline-flex max-w-full flex-wrap items-baseline gap-0.5 rounded-lg border border-line-soft bg-canvas/90 px-1.5 py-0.5 align-baseline font-mono text-[0.84em] leading-tight">
      {tokenizeInlineCode(code).map((token, index) =>
        token.kind === 'space' ? (
          <span key={`${token.text}-${index}`} className="whitespace-pre">
            {token.text}
          </span>
        ) : (
          <span key={`${token.text}-${index}`} className={`rounded px-1 py-0.5 ${TOKEN_TONE[token.kind]}`}>
            {token.text}
          </span>
        )
      )}
    </code>
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
