/**
 * The editor's colours, read from the app's tokens rather than from a theme package.
 *
 * `var(--text)`, `var(--bg)`, `var(--accent)` … already flip with `data-theme`, so one editor theme
 * covers light and dark by construction. A syntax package with its own palette would be a second
 * theme to keep in step, and it would be the one place a literal colour could survive the light-mode
 * audit.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

export const pythonHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent)', fontWeight: '600' },
  { tag: [tags.controlKeyword, tags.moduleKeyword], color: 'var(--accent)' },
  { tag: [tags.operatorKeyword, tags.self], color: 'var(--accent)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--emerald)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--amber)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--dim)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.function(tags.variableName))], color: 'var(--rose)' },
  { tag: [tags.className, tags.typeName], color: 'var(--accent)' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--text)' },
  { tag: [tags.variableName, tags.name], color: 'var(--text)' },
  { tag: tags.invalid, color: 'var(--rose)', textDecoration: 'underline wavy' },
]);

export const pythonTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text)',
      backgroundColor: 'var(--bg)',
      fontSize: '12.5px',
      minHeight: '288px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      // One mono face for the whole app (`--font-mono`, src/index.css), so the editor's digits line
      // up with the tables and readouts beside it instead of being the only surface with its own
      // hard-coded stack.
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      lineHeight: '1.6',
      maxHeight: '360px',
      overflow: 'auto',
    },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
    '.cm-line': { padding: '0 12px' },
    '.cm-gutters': {
      backgroundColor: 'var(--bg)',
      color: 'var(--dim)',
      border: 'none',
      borderRight: '1px solid var(--border)',
      paddingLeft: '4px',
    },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '2.4em', padding: '0 6px 0 0' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
      color: 'var(--accent)',
    },
    '.cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent) !important',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '.cm-matchingBracket': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
      outline: '1px solid var(--accent)',
    },
    '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--panel)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
      color: 'var(--text)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: 'var(--accent-soft)',
      color: 'var(--accent)',
    },
    // Hover card and call signature (src/editor/analysisTips.ts). Both are the same card: a mono
    // definition line, the call, and a plain sentence of docstring - so the words read as prose and
    // the code as code.
    '.cm-mechalab-tip': {
      padding: '7px 10px',
      maxWidth: '380px',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    },
    '.cm-mechalab-tip-title': {
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: '11px',
      color: 'var(--accent)',
      whiteSpace: 'pre-wrap',
    },
    '.cm-mechalab-tip-sig': {
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: '11.5px',
      marginTop: '3px',
      whiteSpace: 'pre-wrap',
    },
    '.cm-mechalab-tip-sig-plain': { color: 'var(--text)' },
    '.cm-mechalab-tip-sig-active': {
      color: 'var(--accent)',
      fontWeight: '700',
      borderBottom: '1px solid var(--accent)',
    },
    '.cm-mechalab-tip-doc': {
      fontSize: '11.5px',
      lineHeight: '1.45',
      color: 'var(--muted)',
      marginTop: '5px',
      whiteSpace: 'pre-wrap',
    },
    // Inline values (`inlineWidget.ts`): a note about the line, not a verdict on it — muted ink,
    // a hairline rule above so it reads as an annotation, and no border to compete with the code.
    '.cm-inline-value': {
      marginLeft: '0.75rem',
      paddingLeft: '0.4rem',
      borderLeft: '2px solid var(--border)',
      color: 'var(--muted)',
      fontStyle: 'italic',
      fontSize: '11.5px',
      whiteSpace: 'pre',
      userSelect: 'text',
    },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--amber) 26%, transparent)' },
    '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--text)' },
    '.cm-slider-row': {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      margin: '2px 12px 8px 52px',
      padding: '4px 8px',
      border: '1px solid var(--border)',
      borderLeft: '2px solid var(--accent)',
      borderRadius: 'var(--r-sm)',
      backgroundColor: 'var(--panel)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    },
    '.cm-slider-row label': {
      fontSize: '11.5px',
      fontWeight: '600',
      color: 'var(--accent)',
      minWidth: '6.5rem',
    },
    '.cm-slider-row input[type="range"]': {
      flex: '1 1 auto',
      maxWidth: '260px',
      accentColor: 'var(--accent)',
      cursor: 'pointer',
    },
    '.cm-slider-row .cm-slider-range': { fontSize: '10.5px', color: 'var(--dim)' },
    // `# %%` cells (`cellWidget.ts`): the boundary is a hairline, and its button is quiet until
    // hovered, so a file with six cells does not read as six toolbars.
    '.cm-cell-row': {
      margin: '6px 12px 2px 52px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    '.cm-cell-run': {
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: '10.5px',
      padding: '1px 7px',
      borderRadius: 'var(--r-sm)',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--panel)',
      color: 'var(--muted)',
      cursor: 'pointer',
    },
    '.cm-cell-run:hover': { color: 'var(--accent)', borderColor: 'var(--accent)' },
    '.cm-cell-run:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '1px' },
    '.cm-cell-marker': {
      borderTop: '1px dashed var(--border)',
      color: 'var(--dim)',
      fontStyle: 'italic',
    },
  },
  { dark: false }
);

export const pythonEditorTheme = [pythonTheme, syntaxHighlighting(pythonHighlightStyle)];
