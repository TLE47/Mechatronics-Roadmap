import { renderToString } from 'katex';
import { parseInline } from './readerMarkdown';

/**
 * The sticky note's rich editing surface (`app/src/noteRichText.ts`).
 *
 * The note is stored as the same small Markdown the reader already renders — `$…$`, `**…**`,
 * `*…*`, `++…++`, code and links — so review cards, exports and a reopened note keep working.
 * This module is the other direction: it draws that Markdown as DOM for the editor, and turns the
 * edited DOM back into Markdown. Math is an atomic widget that carries its TeX in `data-math`, so
 * the source of truth never becomes the rendered glyphs.
 */

/** A caret marker that survives a whole re-render: it is serialised through and then removed. */
export const NOTE_CARET = '\uFEFF';

const SAFE_PROTOCOL = /^(?:https?:|mailto:|\/|#|\.{1,2}\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  return SAFE_PROTOCOL.test(trimmed) ? trimmed : null;
}

function createMath(tex: string, doc: Document): HTMLSpanElement {
  const span = doc.createElement('span');
  span.contentEditable = 'false';
  span.dataset.math = tex;
  span.dataset.testid = 'sticky-note-math';
  span.className = 'inline-block align-baseline px-0.5 text-ink';
  span.setAttribute('role', 'math');
  span.setAttribute('aria-label', `Maths: ${tex}`);
  try {
    span.innerHTML = renderToString(tex, {
      displayMode: false,
      throwOnError: false,
      // Notes are learner input. Links inside a formula are not part of the note's own Markdown,
      // so KaTeX's `\href` remains off; a formula can still be read by the screen reader through
      // the MathML KaTeX emits.
      trust: false,
    });
  } catch {
    // Invalid TeX stays visible as its source instead of vanishing from the note.
    span.textContent = `$${tex}$`;
  }
  return span;
}

function appendRuns(parent: Node, markdown: string, doc: Document): void {
  for (const run of parseInline(markdown)) {
    switch (run.k) {
      case 'text': {
        // A newline inside a text node is not a line the browser will keep a caret on reliably.
        // Draw each Markdown line break as a real <br>, with the text after it in its own node.
        const lines = run.v.split('\n');
        lines.forEach((line, index) => {
          if (index > 0) parent.appendChild(doc.createElement('br'));
          if (line) parent.appendChild(doc.createTextNode(line));
        });
        break;
      }
      case 'code': {
        const code = doc.createElement('code');
        code.textContent = run.v;
        parent.appendChild(code);
        break;
      }
      case 'strong': {
        const strong = doc.createElement('strong');
        appendRuns(strong, run.v, doc);
        parent.appendChild(strong);
        break;
      }
      case 'em': {
        const em = doc.createElement('em');
        appendRuns(em, run.v, doc);
        parent.appendChild(em);
        break;
      }
      case 'u': {
        const u = doc.createElement('u');
        appendRuns(u, run.v, doc);
        parent.appendChild(u);
        break;
      }
      case 'link': {
        const href = safeHref(run.href);
        if (!href) {
          // An unsafe target is shown as its words, never as a live link.
          appendRuns(parent, run.v, doc);
          break;
        }
        const anchor = doc.createElement('a');
        anchor.href = href;
        anchor.className = 'text-accent underline underline-offset-2';
        appendRuns(anchor, run.v, doc);
        parent.appendChild(anchor);
        break;
      }
      case 'math':
        parent.appendChild(createMath(run.v, doc));
        break;
    }
  }
}

/** Draw `markdown` into `root`, replacing everything already there. */
export function renderNoteMarkdown(root: HTMLElement, markdown: string): void {
  root.replaceChildren();
  appendRuns(root, markdown, root.ownerDocument);
}

function escapeText(value: string): string {
  // The editor is a Markdown composer: the learner's delimiters must survive as delimiters so a
  // completed `$…$` can become maths. Only a literal backslash needs a second one, because the
  // parser would otherwise eat it as an escape on the next reopen.
  return value.replace(/\\/g, '\\\\');
}

function wrapFormatted(open: string, close: string, children: string): string {
  // The reader's flanking rule refuses a run that starts or ends with a space. Keep those spaces
  // outside the markers so `** bold **` cannot become literal asterisks on the next reveal.
  const lead = /^\s*/.exec(children)?.[0] ?? '';
  const trail = /\s*$/.exec(children)?.[0] ?? '';
  const core = children.slice(lead.length, children.length - trail.length);
  if (!core) return children;
  return `${lead}${open}${core}${close}${trail}`;
}

function serializeNode(node: Node, keepCaret: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = (node.textContent ?? '').replace(/\u200B/g, '');
    if (!keepCaret) text = text.replaceAll(NOTE_CARET, '');
    return escapeText(text);
  }
  if (!(node instanceof Element)) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';

  if (tag === 'SPAN' && node.hasAttribute('data-math')) {
    return `$${node.getAttribute('data-math') ?? ''}$`;
  }

  if (tag === 'CODE') {
    const text = node.textContent ?? '';
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = '`'.repeat(longest + 1);
    const pad = /^\s|\s$/.test(text) ? ' ' : '';
    return `${fence}${pad}${text}${pad}${fence}`;
  }

  const children = [...node.childNodes].map((child) => serializeNode(child, keepCaret)).join('');

  switch (tag) {
    case 'STRONG':
    case 'B':
      return wrapFormatted('**', '**', children);
    case 'EM':
    case 'I':
      return wrapFormatted('*', '*', children);
    case 'U':
      return wrapFormatted('++', '++', children);
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      return href ? `[${children}](${href})` : children;
    }
    case 'DIV':
    case 'P':
    case 'LI':
    case 'TR':
      return children.endsWith('\n') ? children : `${children}\n`;
    default:
      return children;
  }
}

/**
 * The note's stored Markdown from what is currently drawn in the editor.
 *
 * `keepCaret` is only used between the input pass and its re-render: the invisible caret marker
 * must survive long enough to be found again, then `serializeNote` is called without it for the
 * value the store and the character counter see.
 */
export function noteMarkdownFromDom(root: Node, keepCaret = false): string {
  const children = [...root.childNodes].map((child) => serializeNode(child, keepCaret)).join('');
  return keepCaret ? children : children.replace(/\n+$/, '');
}

export { createMath as noteMathNode };
