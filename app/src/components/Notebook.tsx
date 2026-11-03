import React, { useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  CheckSquare,
  Code2,
  Copy,
  Download,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Trash2,
  Underline,
} from 'lucide-react';
import { InlineMarkdown } from './InlineMarkdown';

/**
 * The notebook both note surfaces use (`components/Notebook.tsx`).
 *
 * A note box is not a `<textarea>` with a save button. It is a small Markdown editor: the learner
 * writes in the syntax the review cards and the portfolio already read, and every control inserts
 * that syntax around the selection rather than replacing it. The same component is mounted under a
 * lesson (`StudyPanel`) and in the free-study workspace (`TabStudio`), so the two cannot drift into
 * different ideas of what a note can hold.
 *
 * The controls are deliberately text-first: Bold, Italic, Underline, Heading, lists, checklist,
 * quote, inline code, link. Preview renders through `InlineMarkdown`, the renderer the reader and the
 * review cards use, so a note reads the same everywhere it appears. Copy, download, counts and the
 * save line are the housekeeping a note editor owes a learner; the parent owns the actual store.
 */
export interface NotebookProps {
  id: string;
  testId: string;
  value: string;
  onChange: (next: string) => void;
  label?: ReactNode;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  /** The parent's save sentence, e.g. "Saved" or "Not saved — storage is blocked". */
  status?: ReactNode;
  /** Keeps an existing status test id when a browser suite already reads it. */
  statusTestId?: string;
  className?: string;
}

type Marker = { before: string; after?: string; fallback?: string };

const WRAPS: Record<string, Marker> = {
  bold: { before: '**', after: '**', fallback: 'bold text' },
  italic: { before: '*', after: '*', fallback: 'italic text' },
  underline: { before: '++', after: '++', fallback: 'underlined text' },
  code: { before: '`', after: '`', fallback: 'code' },
  link: { before: '[', after: '](https://)', fallback: 'link text' },
};

const PREFIXES: Record<string, string> = {
  heading: '## ',
  bullet: '- ',
  ordered: '1. ',
  checklist: '- [ ] ',
  quote: '> ',
};

/** One block of a note, drawn with the reader's inline renderer. */
function NotePreview({ text }: { text: string }) {
  if (!text.trim()) {
    return <p className="text-[12.5px] text-faint">Nothing written yet. The preview fills in as you type.</p>;
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre
          key={`code-${index}`}
          className="my-2 overflow-x-auto rounded-lg border border-line bg-canvas px-2.5 py-2 font-mono text-[12px] text-body"
        >
          {body.join('\n')}
        </pre>
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${level + 2}` as unknown) as 'h3';
      blocks.push(
        <Tag
          key={`h-${index}`}
          className={`mt-2 mb-1 font-bold text-ink ${level === 1 ? 'text-[16px]' : level === 2 ? 'text-[14px]' : 'text-[13px]'}`}
        >
          <InlineMarkdown text={heading[2]} />
        </Tag>
      );
      index += 1;
      continue;
    }
    if (/^[-*]\s+\[[ xX]\]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(lines[index]);
        if (!item) break;
        items.push(
          <li key={`task-${index}`} className="flex items-start gap-1.5">
            <span className={item[1].toLowerCase() === 'x' ? 'text-emerald' : 'text-faint'}>
              {item[1].toLowerCase() === 'x' ? '☑' : '☐'}
            </span>
            <span className={item[1].toLowerCase() === 'x' ? 'text-muted line-through' : 'text-body'}>
              <InlineMarkdown text={item[2]} />
            </span>
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ul key={`tasks-${index}`} className="my-1.5 space-y-1 text-[12.5px]">
          {items}
        </ul>
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(
          <li key={`bullet-${index}`} className="flex items-start gap-1.5">
            <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="min-w-0"><InlineMarkdown text={lines[index].replace(/^[-*]\s+/, '')} /></span>
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ul key={`bullets-${index}`} className="my-1.5 space-y-1 text-[12.5px]">
          {items}
        </ul>
      );
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(
          <li key={`ordered-${index}`} className="flex items-start gap-1.5">
            <span className="font-mono text-[10.5px] text-accent">{items.length + 1}.</span>
            <span className="min-w-0"><InlineMarkdown text={lines[index].replace(/^\d+\.\s+/, '')} /></span>
          </li>
        );
        index += 1;
      }
      blocks.push(
        <ol key={`ordered-list-${index}`} className="my-1.5 space-y-1 text-[12.5px]">
          {items}
        </ol>
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-2 border-l-2 border-amber/60 bg-amber/5 px-2.5 py-1.5 text-[12.5px] italic text-body"
        >
          <InlineMarkdown text={body.join(' ')} />
        </blockquote>
      );
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3}\s|[-*]\s|\d+\.\s|>\s|```)/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`} className="my-1.5 text-[12.5px] leading-relaxed text-body">
        <InlineMarkdown text={paragraph.join(' ')} />
      </p>
    );
  }
  return <div data-testid="notebook-preview-body">{blocks}</div>;
}

export const Notebook: React.FC<NotebookProps> = ({
  id,
  testId,
  value,
  onChange,
  label,
  placeholder,
  rows = 8,
  maxLength,
  status,
  statusTestId,
  className = '',
}) => {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const limit = (text: string) => (maxLength ? text.slice(0, maxLength) : text);

  const write = (next: string, select?: [number, number]) => {
    onChange(limit(next));
    if (!select) return;
    const [start, end] = select;
    requestAnimationFrame(() => {
      const node = box.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(start, end);
    });
  };

  const wrap = (marker: Marker) => {
    const node = box.current;
    if (!node || preview) return;
    const start = node.selectionStart ?? 0;
    const end = node.selectionEnd ?? 0;
    const selected = value.slice(start, end) || marker.fallback || '';
    const before = marker.before;
    const after = marker.after ?? '';
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    write(next, [start + before.length, start + before.length + selected.length]);
  };

  const prefix = (prefixText: string) => {
    const node = box.current;
    if (!node || preview) return;
    const start = node.selectionStart ?? 0;
    const end = node.selectionEnd ?? 0;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const selected = value.slice(lineStart, end);
    const lines = selected.split('\n');
    const nextBlock = lines.map((line) => `${prefixText}${line}`).join('\n');
    const next = `${value.slice(0, lineStart)}${nextBlock}${value.slice(end)}`;
    write(next, [lineStart, lineStart + nextBlock.length]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      wrap(WRAPS.bold);
    } else if (key === 'i') {
      event.preventDefault();
      wrap(WRAPS.italic);
    } else if (key === 'u') {
      event.preventDefault();
      wrap(WRAPS.underline);
    } else if (key === 'k') {
      event.preventDefault();
      wrap(WRAPS.link);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([value], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${id.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'note'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clear = () => {
    if (!value) return;
    if (!window.confirm('Clear this notebook? The saved note will be replaced.')) return;
    onChange('');
  };

  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div data-testid={`${testId}-notebook`} className={`notebook ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? (
          <label htmlFor={id} className="text-[12px] text-muted">
            {label}
          </label>
        ) : (
          <span />
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-0.5" role="toolbar" aria-label="Notebook formatting">
          {[
            ['bold', Bold, 'Bold (⌘B / Ctrl+B)', () => wrap(WRAPS.bold)],
            ['italic', Italic, 'Italic (⌘I / Ctrl+I)', () => wrap(WRAPS.italic)],
            ['underline', Underline, 'Underline (⌘U / Ctrl+U)', () => wrap(WRAPS.underline)],
            ['heading', Heading2, 'Heading', () => prefix(PREFIXES.heading)],
            ['bullet', List, 'Bulleted list', () => prefix(PREFIXES.bullet)],
            ['ordered', ListOrdered, 'Numbered list', () => prefix(PREFIXES.ordered)],
            ['checklist', CheckSquare, 'Checklist', () => prefix(PREFIXES.checklist)],
            ['quote', Quote, 'Quote', () => prefix(PREFIXES.quote)],
            ['code', Code2, 'Inline code', () => wrap(WRAPS.code)],
            ['link', Link2, 'Link (⌘K / Ctrl+K)', () => wrap(WRAPS.link)],
          ].map(([key, Icon, title, action]) => (
            <button
              key={key as string}
              type="button"
              data-testid={`${testId}-${key}`}
              aria-label={title as string}
              title={title as string}
              onMouseDown={(event) => event.preventDefault()}
              onClick={action as () => void}
              disabled={preview}
              className="grid h-7 w-7 place-items-center rounded border border-transparent text-muted transition-colors hover:border-line hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              {React.createElement(Icon as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>, {
                className: 'h-3.5 w-3.5',
                'aria-hidden': true,
              })}
            </button>
          ))}
          <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line-soft" />
          <button
            type="button"
            data-testid={`${testId}-preview-toggle`}
            aria-pressed={preview}
            onClick={() => setPreview((on) => !on)}
            title={preview ? 'Back to writing' : 'Preview the note as it will read'}
            className={`flex h-7 items-center gap-1 rounded border px-1.5 text-[12px] font-mono ${
              preview ? 'border-accent/60 bg-accent/10 text-accent' : 'border-transparent text-muted hover:border-line hover:text-ink'
            }`}
          >
            {preview ? <Pencil className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {preview ? (
        <div
          data-testid={`${testId}-preview`}
          className="mt-1.5 min-h-[96px] rounded-lg border px-2.5 py-2"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--canvas)' }}
        >
          <NotePreview text={value} />
        </div>
      ) : (
        <textarea
          ref={box}
          id={id}
          data-testid={testId}
          value={value}
          onChange={(event) => onChange(limit(event.target.value))}
          onKeyDown={onKeyDown}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={typeof label === 'string' ? label : 'Notebook'}
          className="mt-1.5 w-full resize-y rounded-lg border px-2.5 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus-visible:border-accent"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--canvas)',
            color: 'var(--text)',
          }}
        />
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono text-faint">
        {status ? (
          <span data-testid={statusTestId} className="text-muted">
            {status}
          </span>
        ) : null}
        <span className="tabular-nums">
          {words.toLocaleString()} words · {value.length.toLocaleString()}
          {maxLength ? ` / ${maxLength.toLocaleString()}` : ''} chars
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            data-testid={`${testId}-copy`}
            onClick={() => void copy()}
            disabled={!value}
            title="Copy the note as Markdown"
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[12px] text-faint hover:bg-canvas hover:text-ink disabled:opacity-35"
          >
            <Copy className="h-3 w-3" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            data-testid={`${testId}-download`}
            onClick={download}
            disabled={!value}
            title="Download the note as a Markdown file"
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[12px] text-faint hover:bg-canvas hover:text-ink disabled:opacity-35"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            .md
          </button>
          <button
            type="button"
            data-testid={`${testId}-clear`}
            onClick={clear}
            disabled={!value}
            title="Clear this notebook"
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[12px] text-faint hover:bg-rose/10 hover:text-rose disabled:opacity-35"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
};
