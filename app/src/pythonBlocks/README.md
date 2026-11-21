# The visual Python editor

`python-runner-editor`'s Visual face. It is a way of writing the lesson's one `main.py`, not a second
editor, document or runner: the code string and `Run` are the tab's, and the blocks are a model over
them.

```mermaid
flowchart LR
    C["main.py<br/>the tab's one code string"] --> P["parser.ts<br/>text to BlockProgram"]
    P --> M["ast.ts<br/>fields, suites, raw lines"]
    M --> G["renderProgram<br/>generated Python"]
    M --> V["BlockCard<br/>the workspace"]
    V --> O["operations.ts<br/>insert, edit, move, duplicate, delete"]
    O --> M
    G --> W["commitCode<br/>back to the tab"]
```

| Module | Owns |
|---|---|
| `ast.ts` | The shared program: statement kinds, fields, suites, and `renderProgram`. The fast path returns the parsed `source` byte-for-byte until the first edit; an edited program is generated from its blocks. Raw and import nodes carry their own lines. |
| `parser.ts` | Python text to nodes. Logical lines are grouped before classification (brackets, triple-quoted strings, backslash continuations), suites are found by indentation, and an unrecognized indented block becomes one raw node that keeps its relative indentation. |
| `operations.ts` | Immutable edits: insert a template at a point, change fields, move within a body, duplicate with fresh ids, remove. Each returns a new program with `dirty` set. |
| `registry.ts` | The Python Toolbox catalogue: nine categories, complete statement templates, keyword search, and the Recommended / Categories / A–Z / Recently used sorts. |
| `settings.ts` | The remembered mode (`visual` / `code`), appearance, toolbox sort and recent element ids. Field-by-field normalization is the door stored values use. |
| `appearance.ts` | Normal and Colorful. Colorful gives each statement family a theme token (`--accent`, `--emerald`, `--amber`, `--rose`, `--purple`) mixed into the panel, so it follows all four palettes. |
| `useBlockEditor.ts` | The program, undo/redo stacks, selection and insertion point. Text this hook did not emit re-parses; text it did emit is not parsed back. |
| `BlockCard.tsx` | One statement as a card: real Python tokens, inline fields, move/duplicate/delete/insert-after, and an "Add statement inside" door on a suite. |
| `InlineField.tsx` | One editable token: tap to open where it is, Enter or leaving commits, Escape restores. |
| `PythonToolbox.tsx` | The toolbox panel: category dropdown, Previous/Next, search, sort and tap-to-insert. |
| `PythonBlockEditor.tsx` | The workspace and its toolbar: undo/redo, Normal/Colorful, statement count, the card list and the toolbox. |

## What the model promises

1. **Opening Visual is a read.** `renderProgram(parseProgram(source)) === source` while nothing is
   edited, blank lines and comments included. Switching back to Python Code cannot rewrite a starter.
2. **The first edit writes valid Python.** Fields generate headers, empty suites generate `pass`,
   and the detected indent unit (2 or 4 spaces, or a tab) is used for new nested lines. The browser
   suite presses the runner's own Run and reads the block's print from the interpreter's output.
3. **Raw Python survives.** A `class`, a decorator or a statement outside the supported set keeps
   its lines and its relative indentation after an unrelated block changes.
4. **One program.** Visual and Python Code are two drawings of `code`; the tab's `commitCode` is the
   only writer, so drafts, checks, co-editing and Run see one document.

## Where it is wired

`app/src/components/tabs/runner/EditorCodePane.tsx` holds the main pane and the Visual / Python Code
switch. The block workspace is a `React.lazy` chunk, opened only when Visual is chosen, so the code
editor's first paint does not fetch it. The mode and look are device preferences; the code is not.

## Gates

- `npm run test:blocks` — the model, with no browser: round trips, nesting, edits, undo-relevant
  immutability, raw preservation, an empty suite completed with `pass`, two-space and tab
  indentation, the nine categories, the four sorts, and CPython's `ast.parse` on the generated
  programs.
- `npm run test:e2e:blocks` — the real surface: Python Code and Normal are the defaults; opening
  Visual and returning leaves `main.py` untouched and keeps the code caret; a statement typed in
  Python Code draws as a block, and returning to code leaves that text byte-identical; the toolbox
  collapses, steps categories, searches across them, sorts and remembers Recently used; a toolbox
  tap and an inline edit reach the code view; add-inside, insert-after, duplicate, delete and
  move up/down change the generated program; the interpreter runs it; the same history answers its
  buttons and ⌘Z/⇧⌘Z; Colorful changes only the drawing and, with the mode and recent list, survives
  a reload; axe finds nothing serious or critical; a 390 px phone has no horizontal scrolling while
  a touch tap inserts a statement; and the open Python Code pane walks all four app palettes,
  checking CodeMirror's rendered keyword, string, number and comment inks and its surface against
  the palette variables, then closes and reopens the pane across another palette and checks again.
- The app-wide sweeps open this workspace too: `npm run check:axe` and `npm run test:theme:e2e` audit
  Normal and Colorful in all four palettes on a seeded program containing one card of every
  statement family, so Colorful's five inks are measured rather than assumed.
