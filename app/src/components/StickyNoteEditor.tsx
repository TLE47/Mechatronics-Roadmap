import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  NOTE_CARET,
  noteMarkdownFromDom,
  noteMathNode,
  renderNoteMarkdown,
} from '../noteRichText';

export type StickyNoteStyle = 'bold' | 'italic' | 'underline' | 'math';

export interface StickyNoteEditorHandle {
  /** The current note as the Markdown the store keeps. */
  getMarkdown(): string;
  focus(): void;
  /** Apply one toolbar action to the current selection, or to the next typed text. */
  applyStyle(style: StickyNoteStyle): void;
}

interface Props {
  initialMarkdown: string;
  maxLength: number;
  onChange: (markdown: string) => void;
  onEscape: () => void;
}

function rangeInEditor(root: HTMLElement): Range | null {
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? range : null;
}

function setCaretToEnd(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Put the caret after `node` and leave a real text position there.
 *
 * A range whose start is the element itself would not survive the next browser edit the way a
 * position in a text node does, and a formula has no editable text inside it.
 */
function setCaretAfter(node: Node): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Insert the invisible caret so a full re-render can find the same place again. */
function insertCaretMarker(root: HTMLElement): boolean {
  const range = rangeInEditor(root);
  if (!range || !range.collapsed) return false;
  const marker = document.createTextNode(NOTE_CARET);
  range.insertNode(marker);
  const after = document.createRange();
  after.setStartAfter(marker);
  after.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(after);
  return true;
}

function removeCaretMarker(root: HTMLElement): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const at = text.data.indexOf(NOTE_CARET);
    if (at !== -1) {
      // A caret after a trailing <br> has no following text node: Chromium then types into the
      // previous line and swallows the break. A zero-width anchor keeps the caret on the new line;
      // the serializer strips it, so it never reaches the stored note.
      const atEnd = at === text.data.length - NOTE_CARET.length && !text.nextSibling;
      const afterBreak = text.previousSibling?.nodeName === 'BR';
      if (atEnd && afterBreak) text.replaceData(at, NOTE_CARET.length, '\u200B');
      else text.deleteData(at, NOTE_CARET.length);
      root.focus({ preventScroll: true });
      const range = document.createRange();
      range.setStart(text, at + (atEnd && afterBreak ? 1 : 0));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

/**
 * True when the caret is inside a raw `$…$` pair.
 *
 * Rendering that pair would put the atomic widget around the caret, where it cannot hold a text
 * position, so the source stays visible until the caret leaves the formula. Typing the closing `$`
 * puts the caret *after* the pair, which is the point the formula becomes drawable.
 */
function caretInsideMathSource(root: HTMLElement): boolean {
  const range = rangeInEditor(root);
  if (!range || !range.collapsed) return false;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(root);
  after.setStart(range.endContainer, range.endOffset);
  const beforeText = before.toString();
  const afterText = after.toString();
  const open = beforeText.lastIndexOf('$');
  const close = afterText.indexOf('$');
  if (open < 0 || close < 0) return false;
  const tex = `${beforeText.slice(open + 1)}${afterText.slice(0, close)}`;
  return tex.length > 0 && !tex.includes('\n') && !/^\s/.test(tex) && !/\s$/.test(tex);
}

function hasRichContent(root: HTMLElement, markdown: string): boolean {
  if (root.querySelector('strong, b, em, i, u, code, a, [data-math]')) return true;
  return /[\\`*$[]/.test(markdown);
}

/**
 * Move a caret that is inside a raw `$…$` pair to just past its closing `$`.
 *
 * The Maths button with no selection inserts the whole pair, so the learner never types the closing
 * delimiter that normally triggers the redraw. Leaving the pair is the commit: this puts the caret
 * where it would have been had they typed that delimiter. The caller then syncs the now-complete
 * Markdown into the rendered widget.
 */
function moveCaretPastMathSource(root: HTMLElement): boolean {
  const range = rangeInEditor(root);
  if (!range || !range.collapsed) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (!text.parentElement?.closest('[data-math]')) {
      const from =
        text === range.startContainer
          ? range.startOffset
          : range.comparePoint(text, 0) >= 0
            ? 0
            : -1;
      if (from >= 0) {
        const close = text.data.indexOf('$', from);
        if (close >= 0) {
          const after = document.createRange();
          after.setStart(text, close + 1);
          after.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(after);
          return true;
        }
      }
    }
    node = walker.nextNode();
  }
  return false;
}

/**
 * The sticky-note composer (`app/src/components/StickyNoteEditor.tsx`).
 *
 * This is a real contenteditable editor rather than a textarea plus preview. As the caret passes a
 * completed `$…$`, `**…**`, `*…*` or `++…++`, the source is redrawn in place as KaTeX or formatted
 * text. A sentinel character carries the caret through that redraw; the note handed to the parent is
 * always the Markdown serialisation, never the rendered DOM.
 */
const StickyNoteEditor = forwardRef<StickyNoteEditorHandle, Props>(function StickyNoteEditor(
  { initialMarkdown, maxLength, onChange, onEscape },
  ref
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const composing = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** The last complete Markdown under the store's cap, used to refuse a keystroke that would cut it. */
  const lastGood = useRef(initialMarkdown.slice(0, maxLength));
  /** True while the caret sits inside visible `$…$` source that has not been drawn yet. */
  const pendingMath = useRef(false);

  const publish = (root: HTMLElement, markdown: string) => {
    let accepted = markdown;
    if (accepted.length > maxLength) {
      // The old textarea simply refused characters past the cap. Cutting a string at the cap could
      // leave a closing `$` or `**` behind, so the editor returns to the last whole note instead.
      accepted = lastGood.current;
      renderNoteMarkdown(root, accepted);
      root.focus({ preventScroll: true });
      setCaretToEnd(root);
    }
    lastGood.current = accepted;
    root.dataset.markdown = accepted;
    onChangeRef.current(accepted);
  };

  const sync = () => {
    const root = editorRef.current;
    if (!root) return;
    pendingMath.current = false;
    const markdown = noteMarkdownFromDom(root);
    if (!markdown.trim()) {
      // Clearing a formatted note leaves Chromium's typing style switched on even after all the
      // text is gone, so the next `$` would be born inside <strong><u><em> and never parse as a
      // formula. Replacing the contents with an empty root resets that style the way a new line
      // would; the caret has to be placed in the fresh root, not in the deleted nodes.
      root.replaceChildren();
      root.focus({ preventScroll: true });
      setCaretToEnd(root);
      publish(root, '');
      return;
    }
    if (!hasRichContent(root, markdown)) {
      // Plain prose keeps its native text nodes: that preserves the browser's own undo history and
      // avoids rebuilding the line on every key. Rich Markdown is the case that needs a redraw.
      publish(root, markdown);
      return;
    }
    // Check the raw pair *before* placing the caret marker. That marker is U+FEFF, which JavaScript
    // treats as whitespace: put inside `$…$` it would make the formula fail both the editor's own
    // flanking check and `parseInline`, leaving raw TeX on screen. While the caret is inside the
    // pair nothing is redrawn anyway, so the marker has no caret to carry yet.
    if (caretInsideMathSource(root)) {
      pendingMath.current = true;
      publish(root, markdown);
      return;
    }
    const marked = insertCaretMarker(root);
    const source = noteMarkdownFromDom(root, true);
    renderNoteMarkdown(root, source);
    if (!removeCaretMarker(root) && !marked) setCaretToEnd(root);
    publish(root, markdown);
  };

  /**
   * Redraw a raw formula once the caret has left it, without moving the caret itself.
   *
   * `onInput` already handles the typed `$…$` case (the closing keystroke is the exit). This is for
   * the toolbar's empty pair, where caret movement is the only signal that the formula is done.
   * Clicking inside the pair leaves the caret inside it, so that gesture does not commit it early.
   */
  const settleMathDraft = (root: HTMLElement) => {
    if (!pendingMath.current || caretInsideMathSource(root)) return;
    sync();
  };

  /** Commit a raw formula even when the caret is still inside it, as Enter must before its break. */
  const commitMathDraft = (root: HTMLElement): boolean => {
    const inside = caretInsideMathSource(root);
    if (!inside && !pendingMath.current) return false;
    if (inside && !moveCaretPastMathSource(root)) return false;
    sync();
    return true;
  };

  useLayoutEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    renderNoteMarkdown(root, initialMarkdown);
    root.dataset.markdown = initialMarkdown;
    root.focus({ preventScroll: true });
    setCaretToEnd(root);
    // The initial value belongs to this mount. Reopening a different note remounts the editor
    // through its key in LessonReader, so typing is never fought by a prop echo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wrapSelection = (tag: 'strong' | 'em' | 'u') => {
    const root = editorRef.current;
    if (!root) return;
    const range = rangeInEditor(root);
    if (!range) return;
    if (range.collapsed) {
      const wrapper = document.createElement(tag);
      // An empty inline element is not a place a browser will keep a caret in. The zero-width
      // space is the caret's home until the first character replaces it.
      wrapper.appendChild(document.createTextNode('\u200B'));
      range.insertNode(wrapper);
      const inside = document.createRange();
      inside.setStart(wrapper.firstChild as Text, 1);
      inside.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(inside);
      publish(root, noteMarkdownFromDom(root));
      return;
    }
    const fragment = range.extractContents();
    if (!fragment.textContent?.trim() && !fragment.querySelector('[data-math]')) return;
    const wrapper = document.createElement(tag);
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    const next = document.createRange();
    next.selectNodeContents(wrapper);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(next);
    // The DOM is already the formatted answer; do not rebuild it, because the selection must stay
    // on the words for the next toolbar press to nest (bold, then underline).
    publish(root, noteMarkdownFromDom(root));
  };

  const insertMath = () => {
    const root = editorRef.current;
    if (!root) return;
    const range = rangeInEditor(root);
    if (!range) return;
    if (range.collapsed) {
      const marker = document.createTextNode('$$');
      range.insertNode(marker);
      const inside = document.createRange();
      inside.setStart(marker, 1);
      inside.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(inside);
      pendingMath.current = true;
      publish(root, noteMarkdownFromDom(root));
      return;
    }
    const tex = range.toString().replace(/\s+/g, ' ').trim();
    if (!tex) return;
    range.deleteContents();
    const span = noteMathNode(tex, root.ownerDocument);
    range.insertNode(span);
    setCaretAfter(span);
    publish(root, noteMarkdownFromDom(root));
  };

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      const root = editorRef.current;
      return root ? noteMarkdownFromDom(root) : '';
    },
    focus: () => {
      const root = editorRef.current;
      if (!root) return;
      root.focus({ preventScroll: true });
      if (!rangeInEditor(root)) setCaretToEnd(root);
    },
    applyStyle: (style) => {
      const root = editorRef.current;
      if (!root) return;
      if (!rangeInEditor(root)) {
        root.focus({ preventScroll: true });
        setCaretToEnd(root);
      }
      if (style === 'math') insertMath();
      else wrapSelection(style === 'bold' ? 'strong' : style === 'italic' ? 'em' : 'u');
    },
  }));

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key === 'Enter') {
      // A browser Enter makes a <div><br></div>, whose caret resides *before* the break in DOM
      // order even though it looks like the next line. That would put the caret before the newline
      // after the re-render and the next word would swallow the break. A newline text node is the
      // note's real line break, and the caret after it stays after it.
      event.preventDefault();
      const root = editorRef.current;
      if (!root) return;
      // Enter while the caret is still inside the toolbar's raw pair would insert the break into
      // the TeX. Commit the formula first, then make the line at the position after it.
      const wasInsideMath = caretInsideMathSource(root);
      if ((wasInsideMath || pendingMath.current) && !commitMathDraft(root)) return;
      const range = rangeInEditor(root);
      if (!range) return;
      range.deleteContents();
      const line = document.createTextNode('\n');
      range.insertNode(line);
      range.setStart(line, 1);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      sync();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'b' && key !== 'i' && key !== 'u') return;
    event.preventDefault();
    if (key === 'b') wrapSelection('strong');
    else if (key === 'i') wrapSelection('em');
    else wrapSelection('u');
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = editorRef.current;
    if (!root) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    const range = rangeInEditor(root);
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    sync();
  };

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="What you want to remember about this passage"
      data-testid="sticky-note-text"
      data-sticky-editor=""
      data-placeholder="What do you want to remember? It comes back as a review card."
      data-max-length={maxLength}
      spellCheck
      onInput={() => {
        if (!composing.current) sync();
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        sync();
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onKeyUp={() => {
        const root = editorRef.current;
        if (root) settleMathDraft(root);
      }}
      onPointerUp={() => {
        const root = editorRef.current;
        if (root) settleMathDraft(root);
      }}
      onBlur={() => {
        const root = editorRef.current;
        if (root) root.dataset.markdown = noteMarkdownFromDom(root);
      }}
      className="min-h-[5.5rem] w-full resize-y overflow-y-auto whitespace-pre-wrap break-words rounded border bg-canvas px-2 py-1.5 text-[13px] leading-snug text-ink outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent empty:before:pointer-events-none empty:before:text-faint empty:before:content-[attr(data-placeholder)]"
      style={{ borderColor: 'var(--border)', resize: 'vertical' }}
    />
  );
});

export default StickyNoteEditor;
