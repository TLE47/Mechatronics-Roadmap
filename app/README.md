# app/ — the MechaLab workbench

The browser workbench every lesson links to: https://tle47.github.io/Mechatronics-Roadmap/. It runs
Python 3.12 in the tab (Pyodide), grades a program against the lesson's expected output and its
instructor tests, and keeps progress in `localStorage`, with a Markdown portfolio export.

Nothing here is a second copy of the curriculum. The lesson registry is generated from the Markdown
and the graded packages, so this directory is the *viewer*: if a number in the UI disagrees with a
lesson, regenerate the data rather than editing the data.

```mermaid
flowchart LR
    MD["Lesson pages<br/>+ exercises/<br/>+ modules/"] --> GEN["scripts/generate_python_lessons_data.py"]
    GEN --> DATA["src/data/pythonLessonsData.ts"]
    DATA --> RUN["TabPyodideRunner<br/>Pyodide 3.12 in the tab"]
    RUN --> SAVE["localStorage progress<br/>+ Markdown portfolio"]
```

## The shell's design system

[`src/index.css`](src/index.css) is the one place colours, type, radii, motion and the component
primitives live: tokens (`--bg`, `--panel`, `--accent`, `--emerald`, …), a fluid type scale
(`--step-3` … `--step--1`), `.btn` / `.btn-primary` / `.chip` / `.kbd`, one visible focus ring for
every interactive element, and a `prefers-reduced-motion` branch that disables the hero animation and
the transitions.

Every tab now names the tokens, not a hex. `@theme inline` in [`src/index.css`](src/index.css)
registers `bg-canvas`, `bg-panel`, `bg-raise`, `border-line`, `text-ink`, `text-body`, `text-muted`,
`text-faint` and the accent set as Tailwind colours that resolve to the custom properties, so opacity
modifiers (`bg-emerald/20`) work too. A literal colour left in a tab is a bug that the light theme
shows immediately.

## Dark, light, paper and high contrast

`<html data-theme>` decides every colour. The inline script in [`index.html`](index.html) writes it
before first paint (stored pick, else `prefers-contrast`, else `prefers-color-scheme`), so there is no
flash; [`src/theme.ts`](src/theme.ts) owns the rules and [`src/useTheme.ts`](src/useTheme.ts) mounts
them in the header's three controls.

| Situation | What happens |
| :--- | :--- |
| First visit | The OS decides — a `prefers-contrast: more` request takes high contrast ahead of the colour scheme. Nothing is written to `localStorage`. |
| Sun/moon pressed | Dark ↔ light, and `mechalab_theme_v1` stores the side that landed. The label names the palette the press gives you; from high contrast it returns to the OS palette. |
| Contrast pressed | High contrast on or off — a real on/off, so `aria-pressed` states what is drawn. Off returns to the OS palette. |
| Paper pressed | Paper on or off, the same way. It is never an OS default: a first visit that opened on cream would look like a mistake on a work laptop. |
| Reload, or the OS flips | The stored pick wins; only an unpicked visit keeps following the OS. |
| Corrupt or blocked storage | Falls back to the OS and keeps working — no throw, no broken shell. |

Plots are the exception by design: a canvas or SVG chart sits on `.plot` (`--plot: #070a12`) in every
palette, because the traces are drawn in literal plot colours tuned against that ink. Light mode is
warm paper around dark instrument faces, not a white plot with invisible curves; high contrast keeps
the same face and spends its contrast budget on the text and the lines around it. The paper palette is
that idea taken further: a cream sheet with brown-black ink, for long lesson pages.

[`docs/THEME.md`](../docs/THEME.md) is the token reference: every colour in all four palettes side by
side, the utility family that reaches it, a "you are styling X, reach for Y" table, and the rules
above stated once. It is checked against `src/index.css` by `tests/test_theme_docs.py`, so it cannot
drift from the stylesheet.

The same table is in the app at `?view=theme`, linked from the footer
([`src/components/ThemeTokens.tsx`](src/components/ThemeTokens.tsx)). It reads `index.css` with
`?raw` and paints each value, so it needs no maintenance when a token is added; `npm run
test:theme:tokens` pins the parse and `npm run test:theme:e2e` checks the painted swatches in a
browser. The page is a route, not a tab: the learner's rail is unchanged.

Legibility is measured, not eyeballed: `npm run test:theme` pins the storage/OS rules and keeps the
three controls honest, and `npm run test:theme:e2e` drives Chromium through all twelve tabs in all four
palettes, compositing each text run over the backgrounds it actually sits on and failing anything
below 3:1 (the current floor is 4.52:1, and 7:1 in high contrast). The unit suite runs inside
`npm run test:workbench`; the browser sweep is its own CI step,
because as a seventh parallel suite it pushed the older ones past their click timeouts. `--warnings` lists runs between 3:1 and their size minimum; `--screenshots` writes one
PNG per tab per theme to `.fb-scratch/theme/`.

Landing hero: [`src/components/StartHereCard.tsx`](src/components/StartHereCard.tsx) renders the
README's own Start-here block (the words come from `src/data/startHere.json`, so the page and the
README cannot drift apart) beside [`HeroArm.tsx`](src/components/HeroArm.tsx) - a live canvas running
the capstone's figure-8 through two-link inverse kinematics. The canvas pauses off-screen, draws one
still frame under `prefers-reduced-motion`, and never exceeds 2x device pixels.

## Python you can stop, and ⌘K over everything

Python runs in a **dedicated Web Worker** ([`src/runtime/pythonWorker.js`](src/runtime/pythonWorker.js)),
mounted from a real module URL (`new Worker(new URL(...), { type: 'module' })`) rather than a blob, so the
service worker controls it and can cache the runtime. It never runs on the UI thread: the editor keeps
typing, the tabs keep switching, and a runaway loop cannot freeze the page.

| Problem | What the runner does |
| :--- | :--- |
| `while True:` | **Stop** writes to a `SharedArrayBuffer` interrupt word that Pyodide watches; the interpreter raises `KeyboardInterrupt` **in place**, so imports, variables and the 10 MB runtime all survive. Without `SharedArrayBuffer` it falls back to terminating the worker, which still stops the run. |
| `input()` | The worker posts the prompt, then `Atomics.wait`s on a second shared word while the page shows the input box. The UI stays live because it is a different thread. Stop wakes the wait. |
| The download | The runtime is warmed on idle, so the first Run is a warm run; the status line reports the measured boot (`ready in 1.4 s`), not a spinner. |
| GitHub Pages (no headers) | [`public/sw.js`](public/sw.js) adds the COOP/COEP pair a static host cannot send; it reloads once and then `SharedArrayBuffer` exists. `npm run dev` and `preview` send the same pair directly (`scripts/isolation-headers.mjs`), so the dev server never puts a worker between HMR and the page. |

Interruption needs cross-origin isolation for **one** reason: it is what makes `SharedArrayBuffer`
available. If the service worker is blocked, the runner still stops programs — it just pays for it by
restarting the runtime.

### Offline

The same worker caches the app, so a second visit starts without the network. On install it precaches
the shell, `index.html`, the manifest and the favicon; every same-origin asset it serves after that is
cache-first with a background refresh, which is why a repeat visit is instant and a deploy still lands
on the next load. Navigations are network-first with the cached document as the fallback, so an offline
reload — or a deep link like `?lesson=P.4` the cache never saw — still opens the workbench, isolated,
with the lesson list rendered.

`npm run test:offline` is the suite that proves it the way Pages serves it: the built bundle is served
**without** the header pair, the worker takes control, and then the context goes offline. It asserts the
isolated document, the cached shell/manifest/bundle, the take-offline button, an offline reload that
paints the workbench, a whole lesson run to a verdict with the network off, and an offline deep link
into a lesson. Before it goes offline it opens lesson **01.4** — a page of 100 formulas — and then
empties Chromium's HTTP cache, so the reload's glyphs can only come from `mechalab-assets-v1`: the
formulas still set in `KaTeX_Main` offline is what the self-hosted stylesheet buys.

**The interpreter is cached too.** Pyodide is loaded by that module worker with a dynamic `import()` of
its ESM build, and its `pyodide.mjs`, wasm binary, stdlib zip and any wheel it loads are cached under
`mechalab-pyodide-v1` - which is the difference between "offline reading" and "a lesson on a plane".

**Take this step offline.** A button in the runtime strip makes that deliberate rather than accidental:
[`src/offlineTakeAlong.ts`](src/offlineTakeAlong.ts) sends the worker the URLs this document is actually
running (its own `<script>` and `<link>` tags, never a build manifest that goes stale), the worker caches
them with `cache: 'reload'`, the runtime is loaded if it is not up yet, and the app then measures every
`mechalab-*` cache and prints the result on the button - `Offline ready · 8.0 MB · 16 files`. The number
is the transfer size the CDN and host served, not the decoded size on disk. A host that sends its own
isolation headers (the dev server, a preview) has no service worker in front of it, and the button says
so instead of claiming a cache it cannot build. `npm run test:takealong` pins the URL list, the size
wording, and the rule that only the interpreter's own files let the button call itself ready.

### Backup

The work lives in several stores, so getting it out is one file, not a pile: **Back Up (.zip)** in the
header writes a small archive — `manifest.json`, `progress.json`, `drafts.json`, `history.json`,
`study.json`, `checks.json`, `study-cards.json`, `learning-log.json`, `tour.json`, `README.txt` — with
the counts and date in the manifest, and a README that still explains the file if it is opened years
later. [`src/backupZip.ts`](src/backupZip.ts) is a stored-method
zip writer and reader (CRC-32, central directory, end record) rather than a dependency: the payload is
JSON and code text, and a stored archive needs no decompressor.

**Restore (.zip)** merges, and never deletes. Flags union, drafts and notes only fill lessons this
browser has nothing for, highlights union by the passage they quote (the newer comment wins), checklist
ticks union by item — a tick made on another machine arrives and a restore never removes one — versions
union by the timestamp they were filed at, and log events dedupe by identity the same way cloud sync
does. The toast reports what actually changed (`Restored · 4 lessons verified · 2
drafts · 11 log events`), or says the file has nothing new; a refusal says which refusal it was — not a
backup, a download that stopped short, or a zip that was re-compressed after it was unzipped, which is
common enough (macOS Archive Utility) to deserve its own sentence.

**A restore brings work, not settings.** The theme and palette, the layout, focus mode, breakpoints and
watch expressions, the lesson the next visit reopens and the fold of each roadmap card stay on the
device they were chosen on: they are choices about reading on one screen, and importing them would
fight the choices already made on the machine the archive lands on. Rather than leaving a learner to
wonder where their folded cards went, the archive's own `README.txt` says what is left out and names
the three keys. The one carried exception is `tour.json` — that the tour was *shown* is a fact about
the learner, not a preference about a screen.

Erasing is the third half of the same conversation: **Reset…** in that tray opens twelve named parts
(Lessons, Lesson checklists, Milestones, XP and awards, Practice cards, Notes and highlights, Drafts and
versions, Learning log, Sittings, Predictions, Onboarding, Where I was), prints what each holds, and
erases one or all of them after a second press — with **Back up first** beside it because there is no undo. A reset of a
part the account also holds leaves a watermark the merge honours, so an empty snapshot is not mistaken
for "nothing to say" and the old flags cannot be unioned back at the next sign-in. Preferences are
deliberately outside it. `docs/RESET.md` is the page; `npm run test:reset` and `npm run test:e2e:reset`
are the checks.

A restore writes the stores, not React's copy of them, so the controls dispatch
`mechalab:store-restored` and `App` re-reads the maps: the tick comes back without a reload, which keeps
the learner's tab and unsaved editor text. `npm run test:backup` pins the format (CRC vector, a
byte-for-byte round trip, all three refusals) and the merge rules (a local flag survives a backup that
lacks it, a local draft beats the file's, a newer version is not pushed out by an older one, the caps
still hold); `npm run test:e2e:backup` does it in Chromium — write the zip, wipe, restore, and see the
tick and the draft come back.

Why this as well as IndexedDB: the caps bound everything the seven stores can hold at ~6.5 M
characters — one draft and one study entry per registry lesson at the per-entry caps, 120 k of
versions, 500 review cards, 5,000 log events — and `test:backup` computes that number from the exported
caps instead of trusting this paragraph. It is the archive's worst case, not a promise that the 5 MB
`localStorage` fallback can hold it: a browser that refuses a database can fill that bucket, and the
writer then returns false, so the editor and the study panel say *Not saved* rather than evicting a
lesson. A backup is still the part that matters when a browser is cleared, which no amount of storage
room changes.

### Where the work is stored

The six stores above are too big for `localStorage` and live in **IndexedDB**
([`src/bulkStorage.ts`](src/bulkStorage.ts), [`src/idbBackend.ts`](src/idbBackend.ts)): one database
(`mechalab`), one object store (`kv`), the same key names the bucket used.

No store module changed its signature to get there. They all read through a `Storage` helper, so this is
a `Storage` — one with a write-behind cache underneath. `hydrateBulkStorage()` runs in `main.tsx` before
the first render: it opens the database, copies every entry into memory, and migrates anything a
previous build left in the bucket. After that reads are synchronous from that copy (so `readDrafts()`
and the rest keep working, and React can keep reading in `useState` initializers) and writes land in
IndexedDB on the next tick, coalesced per key. `pagehide` flushes the queue, so the last edit does not
need that tick.

The migration is the rule that cannot lose work: **copy everything first, delete only after the backend
has it**, and the bucket's copy wins over the database's when both have a key, because the bucket copy is
the one the previous build wrote. A browser that refuses a database — private mode, blocked third-party
storage, a second tab holding an older version open — settles on the bucket and behaves exactly as it
did before; a page that never hydrated gets `null` ("not ready") rather than an empty store. The small
first-paint keys stay in `localStorage` on purpose: theme, focus, the last lesson, the view mode, the
progress flags and the dismissed cards are read before React mounts, and a theme that arrives one frame
late is a flash the learner sees.

`npm run test:storage` pins the fallback, the migration order, the coalescing queue and the retry after
a refused write against a fake backend; `npm run test:e2e:storage` starts as a learner from the previous
build — a bucket full of all six stores — reloads, and checks the values arrive in the database, the
bucket is empty, the editor/note box/deck show the carried work, and a note typed now lands in
IndexedDB and comes back after a reload.

### Keys

| Key | Does |
| :--- | :--- |
| `⌘K` / `Ctrl+K` | The command palette: every lesson, exercise, tab and command in one searchable list. `↑`/`↓` move, `↵` opens, `esc` closes. It works while the editor has focus, which is when it is needed. |
| `⌘P` / `Ctrl+P` | The same palette over **lessons only** — quick-open for a learner who already knows what they are opening. The browser's Print gives way; the cheat sheet's own **Print** button still prints. |
| `⌘⇧F` / `Ctrl+⇧+F` | Search **inside** the course: the lessons' starter code, hint ladder, instructor's checks and expected output, and the 66 reading pages' prose. A starter hit opens the lesson with the caret on that line; a hint, check or output hit says which panel it is in; a course-page hit names its section and opens that page **on GitHub at the heading**, in a new tab, with the workbench still behind it. |
| `?` | The sheet of every key, from [`src/shortcuts.ts`](src/shortcuts.ts) — one table, so the list cannot go stale. It must be typed outside an editor or a field, where `?` is a character. `⌘K` finds it too, by typing `shortcuts`. |
| `⌘↵` / `Ctrl+↵` | Run the open lesson. |
| `Escape`, then `i` | With **Vim keys** on (**More ⋯ → Vim keys**), normal mode reads `dd`, `u`, `/` and the rest; the badge beside the line count names the mode that is reading them. Off by default, and remembered once turned on ([`src/vimMode.ts`](src/vimMode.ts)). |

**Six of those keys are yours to change.** A row's key in the sheet is a button: press it, press a
new chord, and that is the key — `⌘⇧J` for focus, say. A key another action already has is refused
with that action's name, one the browser keeps (⌘W, ⌘R, ⌘1) as the browser's, and a bare letter as
typing; the old chord is freed by the move, so nothing has to be unbound first. **Reset all keys**
puts the shipped six back, and the choice is remembered. A chord is stored **physically** —
`KeyboardEvent.code` plus its modifiers — so `⌥1` still opens Study on a Mac that types `¡` for it;
the sheet's own `?` is stored as the **character**, because `?` is Shift+Slash on a US keyboard, its
own key on a French one, and the character is the thing the learner pressed. What stays fixed is
said on the sheet: the four preset digits are a positional family, F9/F12 belong to the caret, and
Escape and Tab belong to dialogs ([`src/keymap.ts`](src/keymap.ts),
[`src/useKeymap.ts`](src/useKeymap.ts), `npm run test:keymap` for the rules, browser step 12b for the
press, the clash, the reload and the reset).

[`src/palette.ts`](src/palette.ts) is the whole search (prefix > word-start > substring >
subsequence, stable order inside a score band) and [`src/paletteCatalog.ts`](src/paletteCatalog.ts)
builds the list from the lesson registry plus the rail's metadata, so a new lesson or a renamed tab
appears without editing the palette.

**Three doors, one dialog.** `⌘K` lists everything, `⌘P` lists lessons, `⌘⇧F` searches the text the
course carries ([`src/lessonSearch.ts`](src/lessonSearch.ts), [`src/proseSearch.ts`](src/proseSearch.ts));
the dialog's own footer counts what it found, and each mode answers with its own placeholder, so a text
search does not look like a lesson list. A search hit is a **line**, not a lesson: a starter hit opens
the lesson *on that line* — the line travels as part of the mount (`initialLine`), so it survives the
editor being replaced, which is what happens when the pick is for another lesson. The full solution is
**not** indexed: the diff panel refuses to show it until it is earned, and a search box that echoed
solution lines would be the same answer through a different door.

**The reading pages are the other half.** The 66 pages a learner reads — 49 prose lessons and the 17 arm
modules — are Markdown in this repository, and Pages serves only the built app, so their words are not
in the bundle at all. `scripts/generate_prose_index.py` copies what is searchable (headings, prose,
lists and safety notes; not code fences, tables, or the callouts and ladder-gate exam scripts write
into every page) into [`app/public/prose-index.json`](public/prose-index.json), and the app fetches that
file **the first time `⌘⇧F` is opened** — 207 kB gzipped, never on a normal visit, cached by the service
worker after the first search. A heading hit outranks a body hit, two sections per page and fifteen rows
overall; the row names its section and opens the page on GitHub at that heading's anchor
(`github-slugger`'s rule, including the `-1` a repeated heading gets), so a hit on a 300-line module is
a place to read, not just a page. `prose_gzip` is its own line in
[`docs/weight-budget.json`](../docs/weight-budget.json): it is neither JavaScript nor part of a first
paint, and `python3 scripts/generate_prose_index.py --check` (a CI gate, and in `check_all.py`) fails
when a page changes without the index being rebuilt.

### The lesson text, beside the code

The runner used to show code and send the learner to GitHub for the words that explain it: two tabs, and
a scroll position lost on every lesson switch. The lesson is a pane now — **Study** puts it on the left
and the editor on the right, and **Read** (⌥3) gives it the window, with the editor and results hidden.
It is the preset that finally matches its name.

**Maths ships with the page.** KaTeX's stylesheet is imported from the package and its faces are emitted
into `dist/assets/` — the page used to borrow a jsdelivr copy pinned to a different version than the
JavaScript — so a formula is laid out from bytes this origin serves, and offline. `vite.config.ts` keeps
only the woff2 source of each face; `npm run test:fonts` fails if a remote stylesheet or font comes back.

**One source, copied at build time.** `scripts/generate_lesson_pages.py` reads each registry entry's own
Markdown page — the file the repository ships, not a second copy in TypeScript — and writes
[`app/public/lesson-pages/`](public/lesson-pages): h2–h4 headings with GitHub's anchors, paragraphs,
nested lists, tables, fenced code, the safety-note blockquotes, display maths and images. It deliberately
leaves out the generated callouts ("Run this in the workbench" is a link to where the learner is already
standing) and the ladder-gate exam (one paper reprinted on every page of a ladder). The page's own
`<details>` — every hint, every `Check yourself` answer and the **Full Solution** — becomes a `reveal`
block: the label is the toggle and the blocks behind it stay closed until the reader presses it, which is
the collapse GitHub already gives the page instead of a solution printed on the way past the question.
Mermaid is not copied either, but a single-chain `flowchart` is *drawn*: the
generator parses it into a `route` block and the reader lays it out as numbered steps, which is how 82
of the 92 pages show the map they already wrote. A flowchart that branches stays in the Markdown untold
rather than being redrawn as a line. Inline emphasis,
links, code spans and `$…$` maths stay Markdown in the payload and are parsed once in
[`src/readerMarkdown.ts`](src/readerMarkdown.ts); the maths is the KaTeX every other tab uses. The page
list is the registry's, not a glob: an entry with no page has none, and the pane says so.

**Fetched per lesson, refused rather than guessed.** [`src/lessonPage.ts`](src/lessonPage.ts) loads one
page when it opens — one request shared by two panes, held in memory, and a failure forgotten so Retry is
a real retry. A 200 whose body is `index.html` (the SPA fallback) is refused instead of painted, and a
payload from a newer build is refused by version.

**Where you stopped is remembered per lesson.** [`src/readingPosition.ts`](src/readingPosition.ts) stores
the heading at the top of the pane plus the pixel offset, so a page regenerated after a sentence changed
still lands on its heading. It also stores the block at the top and the distance into it, which is what
holds the reader's place when a split-view drag reflows the column under them: an offset means nothing
after a reflow, a block does. It lives in `localStorage` and is deliberately **not** a draft: opening a
lesson must not make the list call it edited, and clearing a draft must not send the reader back to the
top. The pane's **Highlight** button pins the selection to the lesson's notes, so *pin selected text*
means the lesson rather than the brief — and it works inside a fenced code block too, where the mark is
drawn on the code itself (`lessonMarks.ts` compares words, so a multi-line snippet survives the quote's
collapsed whitespace). The header's **Split view** chip is the study tip — put the page beside the
code, and **Go to the editor ↓** (under *Do it yourself*) scrolls the stacked layout's code into
view when there is no room for two columns. GitHub is demoted to a **View source** link in the footer,
where it belongs: copying, printing, filing an issue — not the reading copy.

`npm run test:reader` pins the inline parser, the payload guard and the position store;
`python3 scripts/generate_lesson_pages.py --check` is the drift gate (a page edited without its payload
being rebuilt fails), `tests/test_lesson_pages.py` pins what the generator must and must not copy, and
`npm run test:e2e:pages` opens a lesson, reads a heading, an equation, a figure, the page's route and the
source link out of the DOM, reloads and finds the same heading at the top of the pane.

### The pictures beside the words

The pane is 92 pages of prose, so it draws what the prose describes. Three things do that, and none is
an image file:

- **Named scenes** ([`src/visuals/scenes.ts`](src/visuals/scenes.ts)). A page writes
  `<!-- figure: control-loop | … -->` and the workbench draws it: a chain, a loop, a timing figure, a
  row of state gates, bars, a plotted curve, a matrix, a bitfield, a reach dial, a circuit or a graph.
  73 scenes in twelve kinds, one renderer per kind in
  [`src/visuals/Diagram.tsx`](src/visuals/Diagram.tsx) — so a new diagram is a data edit, and every
  figure follows the same rules. All 92 pages carry at least one; 107 figures in the committed payloads.
- **The page's own route** ([`src/lessonPage.ts`](src/lessonPage.ts), `route` blocks). A single-chain
  Mermaid flowchart becomes numbered steps, top to bottom, because a page title is too long for a box in
  a row. `scripts/generate_lesson_pages.py` parses it.
- **The page's own graph** (`graph` blocks). A flowchart that branches keeps its shape: the same nodes,
  the same arrows and their labels, drawn as boxes and arrows. Ten pages carry one; a graph past 14
  boxes is left out rather than drawn as a hairball.

The reading pace is a test, not a review note: `tests/test_lesson_pages.py` (`ReadingPace`) fails when a
page has no figure, no map, or a teaching section with more than 1,400 characters of unbroken prose on
the beginner track (2,500 in a module or chapter).

### The introduction

The page the wordmark opens ([`src/components/intro/IntroPage.tsx`](src/components/intro/IntroPage.tsx)),
at `?view=intro`. It is the one screen written for a visitor with no progress to be shown, so every
figure on it is the course's own: the hero runs the same two-link inverse-kinematics canvas as the
capstone, the trail is `SPINE` (the ten steps the roadmap prints), and the gallery is six real
`Diagram` specs in the palette the visitor chose. Its doors all lead somewhere real — Home, the
workbench, lesson one, any lab on the rail — and the page is a lazy chunk, so a learner who never
clicks the lockup never downloads it. The wordmark is a normal `href` with a click handler, so a
middle-click opens the introduction in its own tab.

### Home

Home is the page a returning learner lands on ([`src/components/home/HomeDashboard.tsx`](src/components/home/HomeDashboard.tsx)),
and it is a destination rather than a gate. The rule lives in [`src/homeLanding.ts`](src/homeLanding.ts): an
explicit `?view=intro|admin|home|dashboard|workbench` wins, a `?lesson=` link is a destination of its own, a
browser with no progress at all opens the workbench and its Start Here card, a reload inside the same
sitting returns to the page that was on screen, and every other visit opens Home. The page is a lazy
chunk, so a first lesson never downloads it, and every card on it is a real door:

- **Today** — the first check the next mission still asks for, from the same join the journey map uses
  ([`src/homeData.ts`](src/homeData.ts)), with the review count beside it.
- **Continue** — the lesson the runner would reopen, its draft's size, and the heading the reader
  stopped at.
- **Your labs** — the rail's own registry ([`src/data/workbenchTabs.json`](src/data/workbenchTabs.json)),
  so a new tab appears on Home with no second list to edit.
- **Your route, review and notes, progress, the journey map, the Black Box, and the tools** (account,
  exports, sound, focus, backup): each opens the surface that owns it instead of rebuilding it.

`npm run test:home` pins the landing rule (including a store that throws and a clock that moved
backwards) and the joins; `npm run test:e2e:home` walks it in Chromium: a first visit stays on the
workbench, a returning one lands on Home, every door opens what it names, a reload stays, and a lesson
link never lands on Home.

**The arm you can grab** is Home's top tile: [`src/visuals/Hologram.tsx`](src/visuals/Hologram.tsx)
projects a two-link arm from 3D, with a view to orbit and two joints to pose. Its geometry is
[`src/visuals/holoModel.ts`](src/visuals/holoModel.ts) — pure functions, so joint stops, the reach, the
IK/FK round trip, the projection and the trail are asserted under Node rather than eyeballed in a
browser.

**Every figure follows the same rules.** No motion (a figure is a still, so reduced-motion has nothing to
switch off), no hard-coded colour (all seven fills are theme tokens, so all four palettes work without a
special case), `role="img"` with an `aria-label` from its title and caption, the caption as a
`<figcaption>`, and a visible note instead of a blank when a page names a scene this build does not know.
The kit is 5.6 kB gzipped on chunks that already existed — the reader draws figures beside the text, so
there is no lazy boundary to hide behind — and [`docs/VISUALS.md`](../docs/VISUALS.md) carries the
measurements and the reasoning.

`npm run test:visuals` pins the scenes, the scene ids, every figure and route a committed page asks for,
and the arm's own limits; `python3 -m unittest tests.test_lesson_pages` pins the flowchart parse, both
ways it can go wrong (a branching graph, a repeated node losing its label); `npm run test:e2e:pages`
reads a named figure and the page's route out of the built bundle's DOM and checks each has a name and a
caption.

### Study notes

Every lesson has one place for what the learner writes down: a note box under the editor, saved as they
type (on a pause, and again when they leave the lesson), plus **Pin selected text** — select a passage
or a line of code, press it, and the passage is kept with the lesson and an optional comment. It is
the part of a course that cannot be regenerated by pressing Run, and it used to live on paper beside
the laptop.

[`src/studyNotes.ts`](src/studyNotes.ts) is one `localStorage` store with two shapes: a note per lesson
(trimmed, capped at 4,000 characters, cleared by emptying the box — so "no note" is one state, not
two) and highlights that are identified by their quoted text, so pinning the same passage twice
updates what was said about it instead of growing a duplicate list. A selection is collapsed to one
line before it is stored, comments are capped at a margin note's length, and the store is bounded per
lesson, never by lesson count: 20 highlights per lesson and a 4,000-character note, and no number of
lessons at which the first one is dropped. A write the browser refuses returns false, so the panel says
*Not saved — storage is blocked or full* instead of claiming text that is not there. Notes ride in the
backup and merge back the same way drafts do: the note on this machine is the newer draft and wins, and
highlights union by quote with the newer comment kept.

Two failures worth naming, because both are invisible until they happen: a note typed and then followed
by a lesson switch within the debounce window is written by the lesson-change flush (the write belongs
to the id it was typed under), and React's development double-mount must not treat its own empty mount
as an edit — the panel writes only after a real keystroke, which is what kept a saved note from being
cleared on reload. `npm run test:study` pins the rules; `npm run test:e2e` types a note, pins a line,
reloads, and finds both still there.

**The reading page is also a checklist.** Every unordered bullet is drawn as a checkbox, and the tick
lands in [`src/lessonChecks.ts`](src/lessonChecks.ts) under `mechalab_lesson_checks_v1`. The item's own
words are its identity — whitespace collapsed, first 160 characters — because block indexes move the
moment a page is regenerated, so a position would tick the wrong line after the next content build. The
same sentence twice in one lesson is one item, a reworded item starts unticked, and the store is
bounded per lesson rather than by lesson count. Ordered lists keep their numbers: a sequence has an
order whether or not its steps can be ticked. The tick is progress rather than authored work, so it has
its own row in Reset (**Lesson checklists**) and is never folded into a note; it travels in the backup's
`checks.json` and in the opt-in workspace row, both unioned by item so a tick made on another machine is
added and never taken away. `npm run test:checklists` pins the store and that union;
`npm run test:e2e:home` ticks a bullet, reloads, and finds it still ticked; `npm run test:e2e:backup`
wipes a tick and restores it.

**A sticky note is marked where it was written.** A highlight stores its quote, and the reader cuts that
quote out of the prose ([`src/lessonMarks.ts`](src/lessonMarks.ts)) and draws it as a pressable mark;
pressing it reopens the note in place, prefilled, and Save updates that highlight instead of adding a
second one for the same passage. The mark is drawn on every run of text the reader renders: prose, a
table cell, **inline code**, and the body of a fenced code block (matched loosely there, because a
selected snippet's newlines collapse to one space). The same popup also **removes** the note and its
mark, because deleting a note is an edit of that note rather than a trip to the Study panel. The note editor stores Markdown — `**bold**`, `*italic*`, and
`++underline++` for the mark Markdown does not have — so the toolbar's Bold, Italic and Underline act on
the selection, `⌘B` / `⌘I` / `⌘U` (Ctrl on Linux and Windows) do the same from the keyboard, and a live
preview under the box shows what the note will read as. The editor is a **popover beside the words**, not
a window: it hangs under the passage it is about, and flips above it when the passage is close to the
bottom of the window and there is more room there, the way a tooltip does. It dims nothing and owns no
backdrop, so the lesson stays readable while the note is written; a press anywhere else closes it, and a
passage near an edge pulls the card back inside the window instead of pushing it off. The same renderer
draws a review card's answer
([`src/components/InlineMarkdown.tsx`](src/components/InlineMarkdown.tsx)), so a formatted note is not
asterisks on the day it comes back. A quote that spans two inline runs (half a sentence in bold) is not
marked rather than marked wrongly; it is still in Notes. `npm run test:reader` pins the mark split and
the wrapping, and the browser suite presses the mark, formats the note, and reloads.

### Review cards

A highlight with a comment is a question with its answer: *what did you write about this passage?*,
the quote is the passage it asks about, and the comment is the note behind **Show answer**. The Study
panel asks it back on a schedule — **Review (N due)** draws on the whole course's deck, and only
after **Show answer** offers the four answers FSRS schedules on (Again, Hard, Good, Easy). A highlight without a comment is a passage marked, not a question set, so
it never becomes a card: that one rule is what keeps the deck from filling with prompts nobody can
answer.

[`src/fsrs.ts`](src/fsrs.ts) is **FSRS-5**, the published algorithm, with its sources in the file: the
default weights `w0`–`w18`, the initial stability and difficulty formulas, the mean-reverting difficulty
update, the forgetting curve (`DECAY = -0.5`, `FACTOR = 19/81`), stability after recall and after a
lapse, the same-day branch, and the interval for a 90% desired retention. The constants are what make
`R(S, S) = 0.9` an identity rather than a setting, and the test suite asserts exactly that. Two
departures are deliberate and stated where they happen: the weights are the published defaults (there
is no review history yet to fit them to) and the longest interval is a year, not the library's century
— a course lasts a term.

[`src/studyCards.ts`](src/studyCards.ts) keeps the join honest by keeping it derived: a card's
existence comes from the notes store on every read, and only its schedule is stored. Deleting the
highlight deletes the card, re-pinning the same passage keeps its progress (the id is the lesson plus
the quote), and clearing the comment retires it and prunes the schedule on the next sync. Clearing a
comment needed a new door in the notes store — `setComment` — because `addHighlight` refuses a blank
overwrite on purpose; that rule is right for pinning and wrong for a learner who has decided a passage
is not a question after all.

The deck rides in the backup as `study-cards.json`, and a restore keeps the schedule that has been
answered more (`reps`, tie broken by the later review), so an older file can never un-learn a card; a
backup taken before cards existed simply has no such file. `npm run test:review` pins the arithmetic
and the join without a browser; `npm run test:e2e:review` does it through the panel — a real selection,
the real pin button, the real comment box, a rating, a reload, and the deck still knowing when the card
is next due.

### Focus mode and the sitting clock

A review is ruined by a screen full of other things to do, so **Focus** (the header's button, or `⌘.`)
hides the header, the mode bar, the tab rail, the lesson list and the footer, and leaves the editor, the
checks and the study card. `Escape` and the pill in the corner both leave it, and the choice is
remembered across a reload — a focus mode with no visible exit is a trap, which is why the pill is the
one control the mode does not hide.

It is one rule, not a prop threaded through five components: `App` puts `data-focus` on the shell and
every region that offers a different task carries `data-chrome`, so `[data-focus='on'] [data-chrome]`
hides them and the pane that shared a row with the lesson list takes the whole row. [`src/focusMode.ts`](src/focusMode.ts)
is the store and the event; the state itself lives in `App` so the button, the attribute and the pill
cannot disagree.

The clock is the other half, because the pilot's `active_minutes` column had no measurement behind it.
[`src/sittingClock.ts`](src/sittingClock.ts) records **sittings**: any lesson open, run or review extends
the one in progress, five minutes without one closes it, and a sitting is capped at three hours so a tab
left open overnight is not study time. The study panel prints `Today 34 min · median sitting 18 min`,
re-reading on `SITTING_RECORDED_EVENT` after any write — a run is written by the runner, so a panel that
only refreshed for its own writes printed the number the store held on mount — and the learning-log
export carries the raw sittings beside the events, so a pilot can compute the median
and range `docs/PILOT.md` asks for instead of estimating them. A sitting is deliberately **not** in the
backup: it is a fact about one machine's clock, and merging two machines' sittings would count the same
hour twice.

The clock is also something a learner can start on purpose. The **lesson brief** carries it — `0:00:00`,
one **Start / Pause / Resume** toggle and **Log & reset** — because "log your hour" used to mean hoping
the automatic sitting had caught it. Start opens a stretch, Pause stops the digits without filing
them, and Resume carries on from where they stopped. The clock counts while the lesson is open until
the learner pauses it: a background tab is still study time, and the visibility listener that used to
stop it is gone. A reload keeps the stretch only as far as its last heartbeat, so a page that was
closed overnight does not credit the night. Log & reset files the stretch as a `study` heartbeat into
the same store and puts the digits back to zero: one set of hours, the one **Today** already prints
beside the trail and the portfolio. **Time logged with this lesson** expands the sitting totals — the
total, how many sittings and today — and says what they are: a sitting is one stretch of activity and
is counted whole for every lesson it touched, so this is not a per-lesson stopwatch (the store never
recorded one). The two controls are the only two; Reset is already the way to end a stretch
([`src/studyTimer.ts`](src/studyTimer.ts), [`src/components/StudyTimerRow.tsx`](src/components/StudyTimerRow.tsx),
`npm run test:studyclock`).

### The trail

Every other surface answers a question about *one* lesson. The roadmap's trail card answers the one a
self-paced course is asked by the person sitting it — "what did I do last Tuesday" — from the two
stores that already held the answer: the learning log (what happened) and the sitting clock (how long
it lasted). [`src/timeline.ts`](src/timeline.ts) is the reading, pure and given `now`, and
[`src/components/TrailCard.tsx`](src/components/TrailCard.tsx) draws it near the top of the roadmap: days
newest first, each row a local time and a verb (`opened`, `run · checks failed`, `verified`, `read hint
2`, `exported the portfolio`, with a failure's first line beside it).

Four rules make it a trail rather than a dump, and each one is pinned in `npm run test:trail`:

- **A day is local**, and named the way a learner names it: `Today`, `Yesterday`, `Tue 20 Oct`.
- **An open is context, not work.** An open followed by a run, hint or verification within thirty
  minutes is that work, so its row is dropped; the same fold collapses a re-mount's second open. An
  open with nothing behind it stays as the read-only visit it was.
- **A verification is the run that passed.** Within ten seconds of a passing run the row folds, so a
  success is one line and not a list that flatters.
- **A sitting contributes time, not rows.** Its duration lands on the day it *started* (stated in the
  card), so a sitting across midnight is filed where it began and the total never counts it twice.

The card renders nothing until there is work — a run, a hint, a pass or an export — because the app
opens on the runner and a brand-new profile logs one `lesson_open` before doing anything. A trail of
opens is not a study history. It is bounded too (14 days, 30 rows a day, 120 in total) and reports
what the caps left out rather than ending mid-list, and its lesson ids are buttons that open the
runner on that lesson.

**What this says.** A record is not advice, so [`src/trailReading.ts`](src/trailReading.ts) reads the
same days for what they imply and the card prints the result under the heading: the lesson that took
the most failed runs (`P.1: 3 failed runs before it passed.`, or `… and not passed yet.`), the review
deck going quiet (`No card review since Sun 18 Oct.`), and days that were only opens (`2 of these 3
days are opens with nothing after them.`). Three rules keep it a reading rather than a scoreboard:

- **Only the days on screen.** No new store and no hidden history: the readings are a pure function
  of the trail the card was going to draw, so nothing is claimed about work the caps left out.
- **A floor, or silence.** Three failed runs, two open-only days, three whole days without a review —
  below every floor the reading is absent rather than softened into a compliment.
- **At most three**, most actionable first (a resisting lesson, then the deck, then the opens), and a
  reading about a lesson offers the button that opens it.

Each rule is pinned by `npm run test:trailreading` (20 checks) and the rendered reading by
`npm run test:e2e:trail`, which runs a lesson three times before its pass and expects the card to say
so.

**It folds** — and so do its two neighbours. Once a few days have been worked the trail is the
tallest thing on the roadmap, the Board card is the tallest thing above the ten steps, and the resume
card grows a line for the state and another for a half-written draft. Each carries one toggle in its
header: folded, the trail is its totals line — `1 day · under a minute measured · 4 runs` — the Board
card its heading and the lesson it holds, and the offer its `id · title` and a two-word badge
(`passed`, `tried 3×`) with **Continue** still beside it, because a fold that hid the one press the
card exists for would only be a card you unfold again. One implementation rather than three copies
([`src/fold.ts`](src/fold.ts) owns the store and the hook,
[`src/components/FoldToggle.tsx`](src/components/FoldToggle.tsx) the button); the choice is a
preference, kept in `localStorage` beside the layout and the palette rather than in the backup, and it
survives a reload. `aria-expanded` carries the state, the accessible name begins with the visible
word, and each card carries `data-collapsed` so a test reads the state instead of a class;
`npm run test:e2e:trail` folds the trail across a reload, and the workbench suite folds the other two.

### The portfolio export

**Export Progress (.md)** writes one Markdown file a learner can put in a repository, a CV or a course
submission, and it now carries the work rather than only the ticks: the three progress sections, then
**Study Notes and Kept Passages** (each lesson's note as a blockquote, its passages with their
comments), **Review Deck (FSRS-5)** (cards, how many are due, when the next comes back, the first
twenty), and **Measured Study Time** (total, median and longest, plus a table of the most recent
sittings). [`src/portfolio.ts`](src/portfolio.ts) is the builder, pure and given `now`, so
`npm run test:portfolio` reads the document as text.

Three rules it keeps, each because the opposite is what a pretty screenshot hides: a section appears
only when it has content (three empty headings read as "did nothing"), every free-text block is a
blockquote (a note that starts with `#` cannot become a heading and swallow the section after it), and
the time section says it was measured on this device, because a pilot reading the file has to know what
the number is. The document is built on the render that opens the modal — never a frame of empty
preview — and the download and the preview are the same string.

### Accessibility, weight, audits and surfaces, as gates

Four measurements about the shell itself, all measured rather than asserted.

**`npm run check:axe`** injects `axe-core` into every one of the twelve tabs, in all four palettes, and
fails on anything `serious` or `critical`. `minor` and `moderate` findings are printed (a few dozen of
them, counted per tab and palette, and all of one kind: `page-has-heading-one`, `region`,
`heading-order`) and do not fail — a gate that trips on a landmark suggestion is a gate people turn off. `color-contrast` is switched off here on purpose: the theme
suite composites the real ancestor backgrounds and fails below 3:1 on all 48 tab/palette pairs, and a
second, rougher contrast measure that disagreed with it would make the accurate one look wrong.

Its first run found three things, all fixed rather than excused: **22 sliders with no accessible
name** across the seven lab tabs (a screen reader announced "slider" and a number, on the control the
lab is built around — each now carries a plain-language `aria-label` with its unit spoken out,
`"Shaft stiffness, newton-metres per radian"`), **the brand link**, which reworded itself in an
`aria-label` that did not contain the words on screen (WCAG 2.5.3 — it now ends in a screen-reader-only
", back to top" instead), and **the editor's scroll region**, which a keyboard could not reach: the
`.cm-scroller` takes a `tabindex` of its own, so a long file can be paged through without moving the
caret.

Exceptions live in [`docs/a11y-allowlist.json`](../docs/a11y-allowlist.json), and the ratchet runs
three ways: an unlisted finding fails, an entry that fires on more nodes than it recorded fails, and
an entry that fires on none fails as **stale** — the failure that keeps a gate honest a year later.
It is empty.

**`npm run check:weight`** gzips the built shell (`dist/assets/**` plus `dist/index.html`) and compares
it against [`docs/weight-budget.json`](../docs/weight-budget.json): `js_gzip`, `css_gzip`, `fonts` (raw,
because woff2 is already compressed — the two UI faces and KaTeX's 19 maths faces), `largest_js_gzip`,
`prose_gzip`, `reader_gzip`, `audio`, `music` and `total`. Today that is **3.33 MB across 94 files** —
the shape CI builds, with the account library; a local-only clone is about 60 kB smaller because that
library folds away — with the budgets a few percent above. **`audio` is the room's one recorded loop**
(`rain-loop.m4a`, 127 kB) and **`music` is the eight-tape library** (1.90 MB), both measured at their
own bytes because AAC is already compressed, and kept apart so a track cannot hide in a room-tone
ceiling. Both are inside `total` and neither is on a first paint: they are fetched only after sound is
turned on, and one tape at a time, only when the learner chooses it over the drone. A breach fails with the overshoot named, and
so does a budget with nothing measured behind it — a metric the build stopped emitting would otherwise
pass forever. The rules are pure ([`../scripts/weight_budget.mjs`](../scripts/weight_budget.mjs)) and
`npm run test:weight` pins the boundary at exactly-on-budget and one-byte-over, because that is where a
budget gate is usually wrong. **`reader_gzip` is the lesson pane's own line**: the 92 generated payloads
are served beside the bundle and fetched one page at a time, so they are neither JavaScript nor part of a
first paint (669.2 kB against a 720 kB ceiling, and not in `total` for the same reason `prose_gzip` is not).

The bundle has two shapes, and the gate grades the shipped one instead of only whatever is in `dist/`.
A clone builds `local_only`: no Supabase variables, the account library folded to a one-byte stub. CI
builds `signed_in`, which carries that library and is the bundle that ships. When `dist/` is the
local-only build, the gate builds the signed-in shape into `dist-signed-in/` — a bare Vite build with
placeholder credentials, about five seconds — measures it against `signed_in`'s ceilings, and removes
the directory. CI's `dist/` is already signed-in and builds nothing extra. That is Run 207's lesson
kept: its entry breach existed only in the build nobody made locally, so it could only be found after
a push.

A byte budget is a gate because it is deterministic. Wall-clock timing is not gated: on a shared runner
its variance is larger than any regression this app could ship, and a flaky gate gets disabled. That is
why **Lighthouse runs without its performance category** — see below.

**`npm run check:lighthouse`** runs Lighthouse against the **built bundle**, served at the Pages base
path, for the three categories whose audits are facts: `best-practices`, `seo` and `accessibility`. The
scores print; the audits are what fails. `performance` is not run at all, for the reason the paragraph
above gives: a score that moves with the runner is not a gate, and a number nobody gates is read as a
promise the build does not keep.

It also does not grade the machine's colour scheme. Lighthouse cannot be told which
`prefers-color-scheme` to audit, so a plain run follows the desktop: dark on this Mac, light on a
runner with no preference, which is how one commit scored 100 here and 97 in CI. The gate now asks
Chrome for **dark and then light**, and asks the browser which palette it resolved before each audit;
a browser that does not take the pin fails the run (exit 2, naming the flag) instead of going back to
grading whatever it is sitting on. That is not hypothetical: every contrast finding in CI's first red
run of the gate was in light or paper, and none was in dark.

Its first run found four things, and the first three were real. **Two header buttons had no accessible
name** — their words are `hidden` below 1536 px, so on every ordinary screen they were an icon and
nothing else (`Export Progress (.md)` and `1-Page Cheat Sheet` are now also their `aria-label`, matching
the visible words rather than describing them). **A lesson card's heading was an `h3`** under the page's
only `h1`, skipping a level. **The docking control's `aria-label` described the move** without
containing the words drawn on it — `List → Right` — which is WCAG 2.5.3. The axe gate had passed all
three: its ruleset and Lighthouse's disagree about text hidden with `display:none`, which is exactly why
the CI row wanted both.

**The same hidden label is why the trays have tooltips.** A control whose words are `hidden` below
1536 px still has to answer a hover with its name, and a native `title` is slow, unstyled, clipped by
any scroller it sits in, and invisible to every suite. [`src/components/HeaderTips.tsx`](src/components/HeaderTips.tsx)
is one delegated bubble for the whole tray row: hover or focus opens it, it leads with the control's
name (`Theme — switch to light theme`), it is portalled to the body so a phone's sideways-scrolling
tray cannot clip it, and it clamps its own width so a control at either edge still gets a whole bubble.
It is decoration — `aria-hidden`, no `aria-describedby` — because the controls already have
`aria-label`s, and above 1536 px it does not open at all: the label is written on the button there, and
`npm run test:e2e` pins both halves (hover at 1280, nothing at 1600). The fourth finding,
`valid-source-maps`, is the one entry in
[`docs/lighthouse-allowlist.json`](../docs/lighthouse-allowlist.json) — every byte of this bundle is
built from this public repository, and maps would roughly double what Pages serves. The allowlist is
the same three-way ratchet as the accessibility one: unlisted fails, wider than recorded fails, and
stale fails.

**`npm run check:snapshot`** records the **painted surface** of all 52 surfaces — the twelve tabs and Home, in all four palettes: where
the header, the activity rail, the main pane and its first panel sit, how many buttons, inputs, links,
headings, canvases and tables the tab has, and the colours, type and palette tokens the browser
resolved. Every other suite asks about a feature; this one is the only place that notices a panel that
stopped being a panel.

It is **not a pixel diff**, and that is a decision. A screenshot baseline is taken on one machine and
its antialiasing does not exist on the next — the runner is Linux, the person writing this is on a Mac,
and a gate whose first red build is font rasterisation teaches people to ignore it. So the portable
part is recorded: geometry with a **2 px tolerance** per number, counts and resolved styles exactly.
`--record` rewrites [`docs/surface-snapshot.json`](../docs/surface-snapshot.json) and the diff is the
list of what moved; `--png` writes a picture per surface to `.fb-scratch/surfaces/` for the review a
number cannot do; `--tab`/`--palette` narrow a run while fixing one.

A surface is measured only once it has stopped changing what it **counts**, not just where its boxes
are: [`scripts/surface_settle.mjs`](../scripts/surface_settle.mjs) watches the pane's size, its nodes
and the six counts the snapshot records, holds them still for a beat, and treats a `*-loading` panel as
unfinished — a request in flight moves nothing, so silence alone once let `paper/tab-links` record 5
links on one run and 4 on the next. `npm run test:settle` drives that gate against pages whose count
arrives late, with the old silence-only gate as the control it has to beat.

### One chunk became an entry, six vendors and twelve tabs

The budget's first reading was a single 614 kB chunk, and turning the split into a gate is what made
the number move. `App.tsx` imports the runner statically — it is the tab the app opens on, so a lazy
boundary there would only add a fetch before the lesson appears — and the other eleven tabs are
`React.lazy` chunks, fetched when the learner opens one. `vite.config.ts` splits the libraries by how
often they change (`vendor-react`, `vendor-editor`, `vendor-katex`, `vendor-icons`), so editing a tab
no longer invalidates React and CodeMirror with it.

The editor's 149 kB left the entry the same way. The runner's editor is now a `React.lazy` boundary:
[`PythonEditor.tsx`](src/components/PythonEditor.tsx) is the shell that stays — the props, the handle
type, and a placeholder that paints the learner's code in monospace at the editor's own metrics — and
the CodeMirror view moved to [`pythonEditorImpl.tsx`](src/components/pythonEditorImpl.tsx). A first
paint now waits for the lesson text, the code and the Run button only; the editor is parsed while they
are already readable.

| | one chunk | tabs split | editor lazy |
| :--- | ---: | ---: | ---: |
| `entry_gzip` (document + script + preloads + CSS) | 627.5 kB | 585.5 kB | **432.9 kB** |
| `largest_js_gzip` | 614.1 kB | 267.3 kB | **263.0 kB** |
| `total` (every emitted file) | 937.8 kB | 947.7 kB | 948.5 kB |
| files | 16 | 32 | 33 |

The largest single file fell 58%, the bytes a first paint waits for fell 195 kB, and the whole bundle
grew 10.7 kB — every chunk is emitted whether or not its tab is opened, so `total` is a ceiling on the
bundle rather than the cost of a visit. The rail **prefetches on pointer-enter and focus**, so the
chunk is usually in memory before the button is released and the Suspense panel never shows; a tab
nobody points at is never fetched.

The splits also taught three gates to wait rather than guess: the theme sweep and the axe sweep now
wait for `[data-testid="tab-loading"]` to disappear before auditing (a fixed 260 ms would audit the
skeleton and pass every rule), and the pair sweep's settle loop waits for it too — its fingerprint of
"Loading this tab…" is perfectly stable, which is exactly why it had to be excluded. The editor's
placeholder joins both conditions (`[data-editor-ready="false"]`): it is a different shape of the
same hazard, since its own text runs would otherwise be measured as the editor's.

### What the paint actually costs

The budget above can say what a visit downloads. It cannot say what the visit *waited for*, and the
splits were made on the theory that the two are the same thing. [`src/paintTiming.ts`](src/paintTiming.ts)
is that reading, taken by the browser rather than inferred:

| moment | what it means |
| :--- | :--- |
| `fcp` | `first-contentful-paint` — something is on screen |
| `lcp` | `largest-contentful-paint`, until the learner interacts — the lesson is readable |
| `editor` | CodeMirror mounted where the placeholder stood (`PythonEditor`'s impl) |
| `run` | the runner committed, so the Run button is clickable |

All four are milliseconds from navigation start, from `performance`, so a wall clock that jumps cannot
move them. They live in their own small store (the newest 50 visits, one sample per navigation,
replaced rather than duplicated when the same visit flushes again on `pagehide`) because the learning
log is a record of what the *learner* did — a paint sample is a fact about this build on this machine,
and putting it in the log would draw it as a trail row with no lesson.

The reading is carried by **Export Learning Log (.json)** under `paint` (`schema`, `samples` and the
medians), flushed first so an export made a second after load still carries this visit. On this machine
a Chromium run reports `first paint 385 ms · editor 582 ms · Run 384 ms` for a visit that has no
cache — the editor lands about 200 ms after the text it replaced, which is what the lazy boundary buys
and costs. `npm run test:paint` pins the store, the medians and the export (16 checks) and the
`test:e2e` suite reads the sample back out of the downloaded file, so a reading that stops being
recorded fails rather than going quiet. **Wall-clock timings stay un-gated** for the reason the budget
note gives; what is gated is that the measurement exists.

### The editor

The textarea is gone: [`PythonEditor.tsx`](src/components/PythonEditor.tsx) mounts **CodeMirror 6**
(Python highlighting, line numbers, undo history, bracket matching and closing, in-document search,
`Tab`/`Shift-Tab` indent, and completion from **Jedi** with the keyword list as its fallback). The
colours come from the app's tokens ([`editor/theme.ts`](src/editor/theme.ts)), so light mode is not a
second editor theme.

**Vim keys are one press away, and one chunk away.** The `Vim keys` control installs
[`@replit/codemirror-vim`](https://github.com/replit/codemirror-vim) — the CM5 Vim emulation ported to
CM6, `dd`, `ciw`, visual blocks and all — into a **compartment of the existing editor state**, so
turning it on or off never mounts a second editor: the document, the caret and the undo history are
the ones that were there. It is off by default (normal mode would read a beginner's first `i` as a
command) and remembered once asked for; the badge beside the line count prints `NORMAL`, `INSERT` or
`VISUAL LINE`, because a mode nothing on screen names is the shape of a broken editor. The package is
39 kB gzipped and **dynamically imported** into its own `vendor-vim` chunk, so a visitor who never
presses the button never downloads it — which is also what kept `entry_gzip` at 446 kB when the
static import first pulled 149 kB of CodeMirror back into the preload list (`docs/weight-budget.json`).
The Emacs-style line motions (`Ctrl-a/e/f/b/n/p`) were already in CodeMirror's default keymap.

**The editor knows Python, because the interpreter is already there.** `math.` offers `acos` with its
signature (`acos(x: SupportsFloat, /) -> float`) and the docstring beside it; hovering a name opens a
card with its definition (`def acos`), its call and the docstring's first paragraph; typing
`math.acos(` shows that call with the argument being typed marked; and the Checker strip under the
editor names an unused import on the line it is on. All of it comes from the same worker that runs
the lesson: Jedi for completions, hover and signatures, and **two linters for the strip** — pyflakes
for what the code does (an unused import, an undefined name) and pycodestyle for how it is written
([`src/analysisClient.ts`](src/analysisClient.ts), [`src/editor/completions.ts`](src/editor/completions.ts),
[`src/editor/analysisTips.ts`](src/editor/analysisTips.ts), `npm run test:analysis` for the mapping
rules and `npm run test:runtime` in a browser). Ruff is a Rust binary and cannot run in Pyodide at
all, so the strip names the linters that answered — `Checker · pyflakes + pycodestyle` — and every
style note carries the rule code (`E711 comparison to None …`, `W291 trailing whitespace`) rather
than paraphrasing it. The style slice is E4 and E7 (the pycodestyle families Ruff shipped by default
for years) plus W291/W293/W605, the rules for characters a learner cannot see. Two rules are off on
purpose, both by measurement: E741, because a bare `l` is a link length in this course, and E501,
because at Black's 88 columns it fires 740 times across this repo's own 100 starters and solutions —
notes about lines the lesson shipped, not about the line the learner wrote. What the strip does *not*
run is the indentation family (`E1`/`E2`/`E3`): those are what Black's **Format** button fixes, and a
press that changes the code is a better answer for a beginner than a sentence describing the change.

**Hover asks about the whole dotted name, and a signature only exists inside a call.** `math.acos` is
one token, so a card opened over `acos` still describes `math.acos`; `callContext` walks back to the
unmatched `(` behind the cursor, ignoring brackets in strings and comments, and counts top-level
commas so the right argument is the one underlined — including in a nested call, where the inner
signature is the one that matters. Both cards are drawn with `textContent`, never as HTML: a
docstring is third-party text. While a run is in flight the worker is busy, so nothing is asked and
no card opens rather than queueing a request behind the learner's own program.

The analyzers **install on first use** (~1.6 MB, one online request for Jedi, pyflakes and
pycodestyle together), not at boot, so a learner who never edits pays nothing for them and the first
Run still waits for the interpreter only. If the
install cannot happen — a first offline visit — the completion source answers from the keywords it
always had and the strip says the checker could not load, rather than showing an empty list as if
nothing were wrong. Only the learner's own text is checked: a lesson's starter is the scaffold the
lesson ships, and notes about it would read as the app complaining about its own exercise. A request
that is never answered times out and is dropped, and an analysis answer can never be mistaken for a
run's verdict — the two share one worker, and the message ids keep them apart.

The document is still owned by React: every edit is reported through `onChange`, an external change
(a different lesson, Load Solution, Reset) replaces the document, and the run button reads the same
state the screen shows. The component also exposes a two-method bridge
(`window.__mechalabEditors['editor-main']`) so the browser suites type and read through the view
rather than through CodeMirror's internal markup ([`scripts/editor-code.mjs`](../scripts/editor-code.mjs)).

**A lesson is a small project.** `main.py` is the learner's tab. A lesson whose starter, solution,
hints or tests mention `mechalab_plant` gets a second, **read-only** tab holding that plant
([`src/lessonFiles.ts`](src/lessonFiles.ts); 29 of the 92 entries do). The worker writes the same
text into Pyodide's filesystem ([`TabPyodideRunner.tsx`](src/components/tabs/TabPyodideRunner.tsx)),
so `from mechalab_plant import simulate_arm` works exactly as it would locally - and the learner can
read what the import is doing without being able to break it.

**After a run, the names show what they hold.** A completed run sends back the namespace it returned —
functions, classes, modules and dunders filtered out, each `repr` cut to 48 characters — and the
editor draws each value at the end of the line that bound it, muted and italic so it reads as a note
about the line rather than a verdict on it ([`src/inlineValues.ts`](src/inlineValues.ts),
[`src/editor/inlineWidget.ts`](src/editor/inlineWidget.ts), `npm run test:inline`). Three choices keep
it honest: the value is the **last top-level assignment** for that name (a line inside a loop or a
function runs many times, so it is not a home for one value); the values come from **the run's own
namespace**, so a stale number from an earlier attempt is impossible; and **any edit clears them**,
because the numbers then describe code that is no longer on screen. A stopped or timed-out run draws
none — a half-filled namespace presented as an answer is worse than no answer.

**`# %%` is a run boundary.** A marker at column 0 draws a **Run to here** button above it: pressing
it runs the document *through* the end of that cell, ungraded — no verification, no hint rung, nothing
filed to history. Through the cell rather than just the cell because the worker runs each program in a
fresh namespace, so a later cell on its own would `NameError` on everything the earlier ones bound;
the code above the first marker is part of cell 1, and an indented `# %%` inside a function is not a
boundary at all ([`src/editor/cells.ts`](src/editor/cells.ts),
[`src/editor/cellWidget.ts`](src/editor/cellWidget.ts), `npm run test:cells`).

**A name can be followed to where it is defined.** **F12** on a name, or ⌘-click / Ctrl-click on it,
puts the cursor on the line that defines it. A lesson is a small project, so the definition may be in
the other file: a name imported from `mechalab_plant` opens the read-only tab on its own `def` line.
The index is a line scan, not a parser — `def`, `async def` and `class` at any indent, plus a
top-level assignment, first occurrence wins — and an attribute (`z.real`) is declined rather than
jumping to an unrelated `real`. A name nothing defines is not a dead key: the file strip says
`no definition for <name>` ([`src/symbolIndex.ts`](src/symbolIndex.ts), `npm run test:symbols`).

**The row is what you do next, and nothing else.** **Run & Verify** is the one primary action;
**Pause** and **Stop** join it only while a program runs. Everything else — Format with Black,
History, Diff, Reset Starter, Reset Runtime, Load Solution, Breakpoints, Share, Pair, Predict, Vim
keys, Watch and Self-Mark — lives behind **More ⋯**, still one press away. At 1280×800 the folded row
measured seven controls, and More reveals all thirteen; that is a contract, not a screenshot: at rest
the row shows at most seven controls by id; every control is at least 12 px, the primary actions and
the layout chips 13 px, metadata 11 px, and the lesson text is 17 px
([`TabPyodideRunner.tsx`](src/components/tabs/TabPyodideRunner.tsx), `npm run check:labels`, which
renders the built bundle in Chromium rather than reading the class list). The preset digits stay on
the row, because they are navigation rather than an action.

**The screen gives its width to one thing at a time, if you ask it to.** Four presets, in the
editor's header or on `⌥1`–`⌥4`: **Study** (the chooser, the lesson text, the editor and its output
tabs — the default), **Write** (the editor alone; the results of a run describe code that has since
changed),
**Read** (the lesson text at the window's height, with the editor, chooser and results out of the way),
and **Debug** (the editor on the left, the results on the right — the arrangement a 1440 px screen has
been asking for, where the verdict used to be scrolled off the moment the line it was about came into
view). Read meant *results only* before Run 229 and Split was this fourth preset's first name; a stored
`read` still opens, and a stored `split` reads as `debug`, so no browser lands on a blank page. The
choice is remembered. The shortcut reads `KeyboardEvent.code` because `⌥2` types `™` in `key` on a
Mac, a stored value that is not one of the four reads as the default rather than blanking the page,
and the two rules are kept apart on purpose: *which* regions a preset shows, and *how* the ones left
are arranged (one column, or two from 1760 px up — the width at which the reading half still clears a
figure's 640 units — before a narrower window stacks them again). Study splits the wider half to the
lesson text, because a figure is drawn on a 640-unit canvas and 10 px labels at 44% are 4 px labels;
below 1760 the two panels stack and the drawings get the full width — 728 px of figure at 1280, where
the split used to leave 366 px ([`src/index.css`](src/index.css), [`src/workspaceLayout.ts`](src/workspaceLayout.ts),
`npm run test:layout`).

**Debug's divider is yours to move.** The handle between the columns is a `role="separator"`: drag
it, or focus it and use `←`/`→` (2% a press, 10% with `Shift`), `Home`/`End` for the two ends, and
double-click for an even split again. What is stored is the *share* of the work area the editor
gets, not a pixel width, because the same learner moves between a laptop and a monitor; neither
column may fall below 30%, which at 1760 px is a 385 px editor — still a line of Python without
wrapping. The drag is captured by the handle itself, so letting go outside the window still ends it,
and the number is written once at the end rather than on every pointer move
([`src/workspaceLayout.ts`](src/workspaceLayout.ts), `npm run test:layout` for the arithmetic,
`npm run test:e2e:pages` for the drag and the reload).

**The code, its forecast and its two outputs are tabs, not a stack.** `main.py`, each read-only
helper, **Predict**, **Run output**, **Expected** and **Workflow** are views of one editor card, and the output is a
tab rather than a block under the code: the code keeps the card's height, and the last run is one
press away. **Predict is one of those views**: the button opens the gate as a pane — beside the code
when there is no split yet, because a guess is read against the code that has to print it — and it
stacks or splits like any other tab. It used to be a block in the lesson brief, which is the one
place a learner could not see it beside the code it is about. **Split** shows
two views at once — from the editor it offers the run output, and from an output it brings the editor
back beside it — and the arrows choose a vertical split (`columns`, side by side where the window is
wide) or a horizontal one (`rows`, like stacked panes in a terminal multiplexer). Pressing the tab of
a view already open in the other pane focuses that pane instead of opening a second copy, and
clicking a pane makes it the one the next tab press fills — the focused pane carries a faint inset
ring, so Expected beside Run output is a click and a tab rather than a guess. Two panes is the cap,
because three 380 px columns of Python is narrower than the code's own line. The strip wraps whenever its tabs do not fit — at 390 px into labelled rows with the icons hidden,
and at a desktop width only when a lesson brings a helper file — so Workflow and every other view
are on screen without a sideways scroll. A second header row costs less than a view nobody can see.
The split controls sit beside it rather than over a tab: they are outside the tablist, so the strip
is a tablist to a screen reader and no tab is scrolled under a sticky group. The dock's
sentence becomes its arrow below `2xl`, and the four preset keys print from 1360 px, where the card
can hold them: below that they live in the titles and the `?` sheet, which is what keeps **Predict**
on the **Run** row from 768 px up. Predict's own state lives in its name rather than its label —
`· skipped` and `· answered` were 78 px that wrapped the row at 1280 after a recorded prediction.
Every view stays
mounted and a pane that is not showing is `display:none`, so the last run is still readable (and
greppable by the suite) while the editor is on screen, and the arrangement is remembered. **Write**
keeps no output tab at all, and **Read** keeps no editor. The state machine is pure and validated at
its edge ([`src/editorPanes.ts`](src/editorPanes.ts), `npm run test:panes` for the rules, the browser
suite for the side-by-side geometry and the reload).

**The method has a tab too.** **Workflow** is the learner's own plan for how the problem gets solved —
the analysis palette (Given, Unknown, Model, Compute, Check, Answer) or the code one (Input,
Transform, Branch, Loop, Test, Output) — drawn as a node canvas: a palette press spawns a card, a card
drags by its header and edits in place, and a directed arrow is dragged from any of a card's four dots
(left, right, top, bottom) to any dot on the card it feeds (tap a dot, then the target, is the same
gesture for a phone). The vertical pair is what lets a join or a loop leave the column without
crossing the chain; only left and right carry reading order. It is a view of
the same card, so it tabs and splits like the outputs and its arrangement is remembered; cards also
nudge with the arrow keys, and the surface is capped at 70% of the viewport and scrolls inside that,
so a 24-card flow neither widens the page nor turns a 390 px phone into a four-thousand-pixel
document. The empty paper pans the view under the pointer, or with the arrow keys once it has focus
(Shift for a longer step; a finger keeps the native scroll), and the **Fit** control frames every
card at once; it becomes **100%** while the map is shrunk, returning to
life size around whatever was in the middle of the view. Zoom is a lens on the screen, never a field
in the saved workflow. Nothing about the run changes: the checklist names what a card is missing (`missing-unit`,
`no-answer`, `unconnected`, and five more) and never disables Run or a lesson. On a phone the list is
folded to its count, one press from the sentences, so the canvas is what follows the palette rather
than twenty-four wrapped lines of advice. A card's badge, the
checklist's "Step 3" and the Markdown numbering are one reading order, so advice always names the
card it is about. P.15 opens on its own example; any lesson can start from one of six templates or a
single Given card; the three-line how-to is always one press away; Copy Mermaid and Copy Markdown
export the numbered flow,
and a version-1 list is migrated on read, its branches becoming labelled arrows. The study panel
summarises the flow and can append it to the note
([`src/workflow.ts`](src/workflow.ts), [`src/workflowStore.ts`](src/workflowStore.ts),
[`src/components/WorkflowPanel.tsx`](src/components/WorkflowPanel.tsx),
[`src/components/WorkflowCanvas.tsx`](src/components/WorkflowCanvas.tsx) with its
[`src/components/workflow/`](src/components/workflow/) pieces, `npm run test:workflow`, and
the browser suite for spawning, dragging, drawing an arrow, the unit item and the reload).

**A panel can sit on either edge.** The presets decide what is on screen; **docking** decides which
side. Study's lesson text can move to the right of the work area, and Debug's results to the left of
the editor — the arrangement for a learner whose eyes are on the code and who wants the output on that
side too. One button names the panel it will move *in the preset in force* (`Lesson → Right`,
`Results → Left`) and offers the way back; Write and Read draw no button, because neither has a panel
beside anything to move. The two sides are remembered separately, and the stored share is still the
**editor's**: with the results on the left, the pointer, the arrow keys and `Home`/`End` follow the
handle, so `Home` puts it at the container's left edge and the editor is at its widest. The two
Debug columns are placed by CSS column rather than by document order, so the editor stays first in
the DOM (it is what the results are about) while the screen can put either one first
([`src/workspaceLayout.ts`](src/workspaceLayout.ts), `npm run test:layout`, `npm run test:e2e:pages`
for the docked geometry and the drag).

**At `xl` the tab rail is an activity bar.** Below 1280 px the twelve tabs are the horizontal scroller
they have always been; above it they are a vertical strip down the left edge, pinned to the top so a
long lesson scrolls past it, with every label visible and none of them behind a sideways scroll. Same
buttons, same `data-testid`s: the strip is the rail's classes, not a second copy of the list.

**Sliders are a comment on a number.**

```python
Kp = 4.0   # @slider 0 20 0.1
```

puts a control under that line ([`src/editor/sliderModel.ts`](src/editor/sliderModel.ts) parses it,
[`sliderWidget.ts`](src/editor/sliderWidget.ts) draws it). Dragging **rewrites the literal in the
file** - no hidden parameter channel - and re-runs once the drag settles (450 ms). The file stays
ordinary Python: open it in VS Code and it runs the same. A directive with a missing or inverted
range is ignored rather than guessed at, and the range input is reused while only its value moves,
so the drag is not aborted by its own re-render.

**Every run files the code it started from.** A draft holds one text - the latest - so running a
version that worked, breaking it and running again used to leave the learner with the broken one and
nothing to go back to. **History** in the lesson header lists the last five attempts for that lesson,
each with the verdict it got (`passed`, `output mismatch`, `checks failed`, `stopped`, …) and how long
ago it ran, and **Restore** puts that text back in the editor ungraded. Snapshots are taken on Run,
not on typing: the same text run twice is one version carrying the newer verdict, the untouched
starter is never filed (Reset Starter already restores it), and the store evicts the oldest attempt
anywhere once it passes its budget - [src/draftHistory.ts](src/draftHistory.ts), pinned by
`npm run test:history`.

**The verdict is announced, not only coloured.** A run ends in one polite live region that says the
outcome first and then the reason — the two lines that differ (quoted from the original text, so
`and a second` is not read as `andasecond`), the harness's own sentence about the metric that is off,
the exception's last line for a runtime error, or `Stopped`, with the lesson's prediction as a second
sentence ([src/announce.ts](src/announce.ts), `npm run test:announce`). The old region said *read the
failing line above*, which is an instruction written for eyes; the failing line is now the words.

**Watch mode is the fix loop.** A beginner fixes one `TODO`, presses Run, reads, fixes the next, and
the pressing is what they think about instead of the program. With **Watch** on, a pause in typing
re-runs the checks — but only after a *graded failure*, which is the state the loop is for: never on
a first visit, never after a pass, never after a Stop (the learner said no) and never on a syntax
error that is usually mid-typing. While the predict gate waits on a guess it owns the next run, so
watch mode cannot be the one path around it ([src/watchMode.ts](src/watchMode.ts), `npm run
test:watch`). An automatic run files no version and logs no `run` event: it must not evict the attempts
the learner actually made, nor inflate the friction report's denominators.

**Predict first.** The third move of the ladder (`docs/SYLLABUS.md`) is to commit to a prediction
before anything runs, and the workbench is where the running happens: pressing Run on the starter and
reading the answer off the screen is the one shortcut the course is built to prevent. So a lesson's
**first** Run asks instead of running — *what will this print?* — and holds the run until the guess is
committed or deliberately skipped ([src/predictGate.ts](src/predictGate.ts)). The guess is graded
against the lesson's own `expectedOutput`, which exists before any run, so the verdict costs no
interpreter time: **exact**, **the right lines in a different order**, **n of m lines**, or **none**,
judged on trimmed lines rather than substrings — `True` is not `true`, and `1.20` is not `1.2`. The
learner sees the verdict before their program does, the run then goes, and Skip is a *recorded*
decision rather than a loophole, so "predicted" and "skipped" stay distinguishable. One question per
lesson: a returning learner is not nagged, and **Predict again** is a real second attempt. The card is
also behind **Predict** in the lesson header, where a closed card's answer stays legible as a chip.

**Which lines, not just how many.** The roadmap card can say "4 lines changed"; **Diff** in the lesson
header says which ones. It reads the editor against the starter by default, and against the lesson's
solution once that is earned - opened in this visit, or the lesson passed - so the view cannot be used
to read an answer nobody asked for yet. The third reference is your own work: every filed run's code
is a button (`vs run 2 · passed`), so "what changed since the run that passed" is one click, and a
version a restore or the five-version cap removed falls back to the starter instead of blanking the
panel. Both line numbers, `+`/`−` rows, and the unchanged runs around
a change trimmed to three lines each side and counted (`… 12 unchanged`). An indentation fix is a
change here on purpose: this is the file, not the lenient output comparison the checks use. A file too
large for the subsequence table keeps its common head and tail and says so rather than freezing the
tab, and the same engine counts the roadmap card's changed lines, so the two surfaces cannot disagree
- [src/codeDiff.ts](src/codeDiff.ts) and [src/diffReference.ts](src/diffReference.ts), pinned by
`npm run test:codediff` and browser step 7g-i.

**A failure, read.** A red line is where the work starts, and a traceback is written for a terminal: the
learner's own frame sits among the lesson's harness frames, and the failure that *is* one of the
twelve things [docs/ERROR_EXPLAINER.md](../docs/ERROR_EXPLAINER.md) documents is named only on a page
in another tab. So a runtime error now gets a card under the output: Python's exception line,
the line in the learner's own file (`Show line 7` puts the cursor there and scrolls to it), and the
matching explainer entry with its own "check first" list ([`src/traceback.ts`](src/traceback.ts),
[`src/errorIndex.ts`](src/errorIndex.ts), [`src/components/TracebackCard.tsx`](src/components/TracebackCard.tsx)).

The parser reads CPython's text rather than a structured payload, because a learner can print a
traceback of their own and the panel is handed whatever was printed: it takes the last block of a
chained failure (the one that stopped the program), the deepest frame that is not the lesson's appended
`_selfcheck`, and both SyntaxError shapes. The index is generated from the page by
`scripts/generate_error_index.py` — an edit to an entry without regenerating fails `check:errorindex` —
and the match comes from the entry's heading: a class and its quoted message, or a class alone. A
failure the page does not cover says so and leaves Python's words as the diagnosis; a failure raised
inside the lesson's own check says the line is the check's, not the learner's.

**The Scope: your loop, drawn.** A lesson that prints forty lines of `theta = ...` is asking the reader
to plot it in their head. Inside a run, Python can hand its samples to a panel instead:

```python
import math
from mechalab import scope

ts = [i / 100 for i in range(400)]
ys = [1 - math.exp(-t) for t in ts]
scope.stream("step response", ts, ys)
```

`scope.stream(name, t, y)` (and its synonym `scope.plot`) takes lists, ranges or numpy arrays and
records a trace for **this run**. The worker buffers the points and posts them in batches of 500 plus
one final batch before the verdict, so the curve grows while the loop runs and is complete when it
stops; a runaway recording is capped at 20 000 points per series and says so
([`src/scopeModel.ts`](src/scopeModel.ts) holds the rules, `npm run test:scope` pins them). The panel
shares one pair of axes across traces, marks zero when the data crosses it, prints each trace's last
value beside its name, and **Show as table** turns the same run into twelve sampled rows - a canvas is
invisible to a screen reader ([`src/components/ScopePanel.tsx`](src/components/ScopePanel.tsx)).

**Reading it.** Pointing at the plot draws a cursor and names every trace's value at that one `t`
(interpolated between samples, `—` where a trace has no sample there); the arrow keys move the same
cursor, so the readout is not mouse-only. Wheel, **Zoom +/−** and `+`/`-`/`0` change the time axis
about the pointer or the middle of the view, dragging pans it, and both are clamped to the data and
to a 1/1000-of-the-trace floor, so the axis can never end up showing empty space. The y axis follows
the visible window rather than the whole trace.

**Comparing two runs.** **Pin as A** keeps this run's traces on the axes while the next run draws
over them as B (dashed, lighter), so a change to `Kp` or `ki` is read on one pair of axes; the cursor
then reads both values at the same `t`, and the legend names both. Pinning survives a run and is
cleared by changing lesson or by **Clear A**.

Nothing is stored beyond the pinned traces in memory: a trace belongs to the run that produced it,
and pressing Run on something that traces nothing clears the current curve rather than leaving a stale
one on screen.

The seven control and mechanics lessons (02.1-02.5, 05.1, 05.2) ship their own annotations: link
lengths on the FK/IK demos, mass and gear ratio on the inertia lesson, tooth counts on the belt
drive, `Kp`/`Ki`/`Kd` on the PID lesson and the gyro bias/`alpha` pair on the complementary filter -
14 sliders across 7 starters, every default exactly the literal it replaced. The reference solutions
stay the plain version, so **Load Solution** shows the canonical code while the starter is the
workspace where the numbers move. `npm run test:editor` fails if one of those starters loses its
sliders or gains a slider the demo never reads.

### Pause, step, and the run trace

**Pause parks the interpreter.** The toolbar's **Pause** stops the program at the next line of your
own file without losing the session, and the bar above the editor names the line it is about to run,
quotes it and shows that frame's values; **Step** runs that one line and parks on the next, **Continue**
runs on, and **Stop** wakes a parked run and leaves Python loaded (`npm run test:runtime`). The worker
waits on a shared command word because a message queues behind the very loop it is meant to steer —
the same reason Stop uses one — so a parked run costs no CPU and the page never blocks. A pause is only
offered where the browser gave the page shared memory; without it, nothing can reach a parked worker.
**A breakpoint is that park placed on a line** ([`src/editor/breakpoints.ts`](src/editor/breakpoints.ts),
[`src/editor/breakpointGutter.ts`](src/editor/breakpointGutter.ts), `npm run test:breakpoints`): click
the gutter slot beside a line, or put the caret on it and press **F9**, and the run stops there whether
or not the learner can reach the row in time. Clicking an armed line disarms it, a lesson keeps its
own list, and the list is remembered in `localStorage` across a reload.

**A breakpoint can wait for a pass.** **More ⋯ → Breakpoints (N)** lists every dot with one
line for a condition — a Python expression the worker compiles once per run and evaluates **with the
names the line can see** — so `n == 3` stops a loop on its third turn instead of its first, and
**Continue** is not a stop per turn. A narrowed dot is drawn **hollow** rather than filled, because a
filled dot would claim a park that only sometimes stops; the condition travels with the dot when an edit
moves it; and a condition that raises parks **anyway**, with the interpreter's own sentence under the
parked line, because a typo in the condition must neither end the run nor silently skip the park. The
conditions reach the interpreter with the request, like the dots, so one written during a run applies to
the next one.

**Step in reaches the call.** **Step** runs a call to its end; **Step in** parks on the called function's
first line instead — in your own file, or in a file you can read, like a lesson's helper tab or the
shared plant. A park names its file now, so the bar shows the name and quotes **that** file's line
rather than `main.py`'s, and the frame's values are the callee's. A call into CPython itself
(`math.sqrt`) has no source in the editor to stand on, so a Step in on one behaves as a Step; from
inside a helper, Step stays in that helper, and a call that returns lands back in its caller.

**Format tidies the file with Black.** **More ⋯ → Format** (or *Format the file with Black* in
`⌘K`) re-indents and re-spaces your file in place, with Black's own default mode — the same output
`black file.py` would write. Black is pure Python, so it runs **inside the same worker** as your code,
installed on the first press and remembered for the session; nothing is added to the bundle for it. The
answer is applied as **one undo step** (the status line says so), and it is one of three sentences: the
file was tidied, it was already tidy, or Black could not parse it — the last one quotes the parser's
own position and leaves your file untouched. The button is disabled while a program runs or a park waits,
because the worker is one thread. The install has one browser-shaped seam: Black reads `platformdirs`
for its cache directory, and platformdirs' Unix backend does `from os import geteuid` at import time —
a page has no user id, so a fresh install would raise ImportError before Black ever formatted a line.
The worker supplies the two id constants (`geteuid`/`getuid`) before the first import; the cache path
they pick is never written in the browser.

**Step out comes back.** **Step out** runs the rest of the frame that is parked and stops in its caller,
on the line that made the call — even though a call is usually the last thing on its line and the caller
gets no fresh line event to stop at, because the park is on the frame's **return**. From the plant it
lands back in your file; at top level there is no caller, so it runs on to the end like Continue.

**A name can be pinned so it is answered at every park.** The bar's **Watch** field takes a Python
expression — `total`, `n * 2`, `plant.L1` — and its value is shown beside it at every stop, not only in
the frames where it happens to be a local: the interpreter evaluates each expression **in whichever
frame it parks in**. It is pinned from the bar while the run stands there, and the first answer arrives
in that same frame (the parked worker reads the expression and posts the line again), up to five per
lesson, remembered with the lesson the way its dots are. One this frame cannot answer — a name the loop
has not assigned yet, a typo — says what the interpreter said beside the expression and leaves the run
parked; the small **×** unpins one without moving it
([`src/editor/watches.ts`](src/editor/watches.ts), `npm run test:watches`).

**A parked frame's values can be changed.** Every value in the bar is a button: it opens a one-line form
prefilled with that value, and **Set** evaluates what you type in the frame the interpreter is stopped in
and writes it back, so **Continue** runs the next line with it. The run does not move while you do this —
the bar re-posts with the frame's new values — and a refused expression is shown in the interpreter's own
words. It changes the run, never the file.

Every run is also recorded, line by line, and the **Trace** panel beside the output steps through it
([`src/runTrace.ts`](src/runTrace.ts), [`src/components/TracePanel.tsx`](src/components/TracePanel.tsx),
`npm run test:trace`, browser step 5h). A replay answers *"why did this loop do that?"* after the fact —
including a stop and a timeout, which keep their partial traces — while Pause answers it *in the moment*.
The recording is the history; the park is the present.

| Rule | Why |
| :--- | :--- |
| A step is an executed line **in the learner's own file** | Frames from the harness, the plant and the appended self-check are not steps; stepping through `math.sqrt` would be reading CPython, not their code. |
| The frame's values ride with the step — six names, reprs cut to 40 characters | A full frame dump is a wall a beginner cannot read, and the worker already formatted the reprs once so a value that raises cannot become a second failure. |
| **300 steps kept, every line counted** | Past the cap the worker stops collecting but keeps counting, so the panel prints `300 of 12,431 steps · capped` rather than implying the program stopped there. |
| The quoted line comes from **the text that ran**, not from the editor | A run is a fact about a program; the panel still describes it after an edit, and a new run replaces it. |
| A stop and a timeout keep their partial traces | "Where was my loop when I stopped it" is the question Stop is pressed to answer. |
| A breakpoint is **held as a position, remembered as a line number** | While the editor is open a dot is a document position, so CodeMirror's change mapping carries it with the statement it was placed on: a newline typed above moves it down, undo brings it back, and Load Solution re-seeds it from the line number instead of collapsing it. The line number is what a lesson switch and a reload restore (see [`src/editor/breakpointState.ts`](src/editor/breakpointState.ts)). |
| A breakpoint is read **when the run starts** | A park needs a list the interpreter already has; a message cannot reach a worker inside Python, so a dot (or a condition) added mid-run is for the next run — the row's Pause catches the loop that is already spinning. |
| The gutter draws a **slot on every line** | A column that is invisible until it holds something has no affordance to click. The slot is the click target *and* the dot, so what the learner reads is what they pressed. |
| A step out parks on a frame **return**, not on the caller's next line | `print(f(x))` never gives the caller another line event: waiting for one would run the program to its end. At the return event the caller's line is still the call, which is the line to show. |
| A step lands only in a file the page can show, and the park says **which** | A park quotes a line; a frame with no source (CPython's own) would be a sentence nobody can check, so `math.sqrt` is stepped over, not into. A step over parks at the depth that asked for it or shallower — which is also how a returning call lands back in its caller. |
| A narrowed dot is **hollow**, and a condition that raises **still parks** | A filled dot says "always stops", which is the wrong sentence about a park the learner just narrowed; and a condition that could not be evaluated is a mistake the learner has to see, not a park skipped in silence or a run ended with no explanation. |
| The formatter is **Black**, in the worker, not a bundled library | Ruff is a Rust binary and cannot run in Pyodide at all; Black is pure Python and installs through micropip on the first press, so the formatter costs the bundle nothing and the offline page says it is unavailable rather than pretending. |
| A format is **one undo step**, and a parse refusal touches nothing | A tidy-up the learner cannot take back is a change they did not ask for; and a file Black cannot read is their own syntax — the parser's position is the useful half, replacing their text with nothing is not. |
| A watch is an **expression**, and it is evaluated in whichever frame parks | The bar's value chips list this frame's locals, so `plant.L1` or `n * 2` has nowhere to appear; a watch asks one question at every stop. |
| A watch is pinned **while parked**, and the bar answers in that frame | A chip with nothing beside it until the next Step would look broken: the parked worker reads the expression from the frame-edit buffer, evaluates it in the frame it is standing in, and posts the same line again. |
| A watch that raises **says so**, and the list is **five per lesson, per file** | A name this frame has not bound is a question it cannot answer, not a failure of the program, so the run stays parked and the sentence is shown in place. Five is what fits beside the frame's own values; the store is per lesson because `total` is one file's variable, not the next lesson's. |
| A value in the bar is a **button**, and the edit runs **in that frame** | "What if `total` were 41" is answered before the learner decides to continue: the worker evaluates the expression with the frame's own globals and locals, writes it back, and stays parked. Inside a function that needs `PyFrame_LocalsToFast` (a function frame's `f_locals` is a snapshot on CPython 3.12); a failure says so rather than leaving a value that only looks applied. The learner's file is never touched. |

The panel says in a sentence that it is a recording — this is where the program has been, not where it
is — and offers **Show line** to put the caret on the step's line; the values are that step's frame, so
the quote and the numbers always describe the same moment.

### Sharing an attempt

**More ⋯ → Share** copies a link to this lesson with the editor's text in it
([`src/shareLink.ts`](src/shareLink.ts), `npm run test:share`). It is the one thing a stuck learner
can send a person: a screenshot loses the code and a paste lands in the wrong lesson.

| Rule | Why |
| :--- | :--- |
| The code rides in the URL **fragment** (`#share=…`), base64url | The fragment never reaches GitHub Pages or its logs. Base64 is encoding, not encryption, and the status line says so rather than implying a privacy the link does not have. |
| The whole URL is capped at **2,000 characters**, measured | Chat clients and mail truncate around there; a refusal names the measured size instead of producing a link that will be cut in half. |
| An empty editor is not a link | The button says there is nothing to send; it cannot produce a URL that silently opens the starter. |
| A received attempt is **offered, never applied** | A link opening a page must not be able to replace the draft that is behind it. The card says how many lines arrived and what its button replaces, and loading the code then stores it as this lesson's draft like any other edit. |
| Decoding is validation | Version, alphabet, JSON shape, field types and the same length cap are checked; anything else decodes to nothing and the workbench opens normally. |

The link opens `?lesson=<id>#share=<payload>`, so a client that strips the fragment still lands on
the right lesson. The share link is the send; the session it was missing is **Pair**, below.

### Asking for help

A link is the work; a person answering a beginner also needs to know what the lesson was, what the
check said and which line Python named. **Ask for help** sits under the verdict of a run that did not
pass and turns that screen into one message ([`src/helpReport.ts`](src/helpReport.ts),
[`src/components/HelpSheet.tsx`](src/components/HelpSheet.tsx), `npm run test:help`).

| Rule | Why |
| :--- | :--- |
| **Nothing is sent from the app** | There is no endpoint. The sheet copies text, or opens GitHub's `issues/new` form pre-filled; the learner presses the button that files it. The footer says the code is in the report and to send it where they would send the file. |
| **The preview is the report** | The `<pre>` is the exact string Copy writes and the issue's body, so nobody sends a message they have not read — including the caps' own sentences. |
| The question comes **first** | The textarea is focused on open because what the learner was trying is the one thing a run cannot say; without it the report is a dump. It is capped at 500 characters. |
| The ladder **never** travels | A report carries `Hints opened: 2 of 3`, never a rung's text or the solution — otherwise a helper's reply quotes the answer back, and the report becomes a way around the pacing `checkHints.ts` enforces. Pinned by `test:help`. |
| Every cap **prints itself** | Code past 120 lines ends with `# … 80 more lines not included`; `stdout`, `stderr` and the instructor's message are cut at 1,200 characters each; a report past 4,000 ends with `_Report shortened: N characters were left out._` A report that silently drops the failing line is worse than none. |
| The issue door is **measured** | GitHub's form refuses nothing, so the URL is capped at 7,000 characters and a report past it is refused *in the sheet* with its size, while Copy still works. |

The report names the verdict in the badge's own words, the lesson page on GitHub, the attempts and
rungs, the traceback's line and the explainer entry it matched, a capstone's failing metric lines, and
the checks' own detail — the same sentences the panels show, so a helper reading the report is not
reading a second description of the same failure.

### Pair study

**More ⋯ → Pair** opens a session with one other workbench: a direct WebRTC data channel,
with the connection carried **by hand** ([`src/pairing.ts`](src/pairing.ts),
[`src/usePairSession.ts`](src/usePairSession.ts), [`src/components/PairSheet.tsx`](src/components/PairSheet.tsx),
`npm run test:pair`).

| Rule | Why |
| :--- | :--- |
| **Three pieces of text, no server** | The host copies an invitation (`mechalab-pair-1:` + base64url SDP), the guest sends back a reply, the host pastes it in. The app has no room to join and posts nothing; after those two pastes the two pages talk only to each other. |
| **No ICE servers** | Two tabs on one machine, or two workbenches on one network, find each other from their own host candidates. Shipping a STUN address would tell a third party who is pairing, so there is none — and the sheet says a session across a restrictive network may not connect rather than pretending. |
| A signal **says which box it belongs in** | The likeliest mistake with two textareas is pasting the invitation into the reply field; the refusal names that mistake, and a code from another build is refused before `setRemoteDescription` ever sees it. |
| Gathering is **bounded** | The invitation exists after ICE completes or 3 s, whichever comes first — a button that waits forever is a button that never answers. |
| **An attempt is offered, never applied** | Send is a button here; on the other side the attempt arrives as a card with its line count, and **Load their code** is what replaces a draft — the share link's rule, because it is the same thing. |
| The card **knows the lesson** | An attempt carries its lesson id. If the two learners are on different lessons the card says which one and offers **Open P.2**; code is never dropped into another lesson's draft, and there is no lesson switch mid-merge. |
| Messages are **validated field by field** | The other side is a program: unknown kind, wrong version, a non-string code or an attempt past 24,000 characters is dropped, never truncated into an editor with its ending missing. |

### Co-editing one file

**Co-edit together** joins the two editors: one document, both screens, over the same data channel
([`src/collab.ts`](src/collab.ts), `npm run test:collab`). The host offers, the guest accepts, and from
then on every change is shared.

| Rule | Why |
| :--- | :--- |
| **A character has an identity** | The document is an RGA: each character carries `{workbench, sequence}` and the id of the character it was typed after, and the file is a walk of that tree. Two people typing at the same spot get the same order on both machines without a server or a clock deciding. |
| **A local edit is a diff** | The editor only ever says "the text is now this"; the common prefix and suffix are found and the middle becomes character ops. That is why one path covers typing, pasting, Format's rewrite, Load Solution and a slider. |
| **Undo is yours** | A peer's edit is applied outside the undo history, so ⌘Z steps back through what *you* typed. The one honest limit, said on the sheet: if they typed inside the exact text you undo, their characters go with it, as if you had selected and deleted. |
| **The text travels once** | Both sides seed the same character ids from the starting text, so opening a session is one message rather than a transcript of every character already in the file. |
| **Accepting is a press** | The guest's editor is replaced only when they press **Accept and co-edit** — the share link's rule and the attempt card's, for the same reason. Declining touches nothing and says so to the host. |
| **A paste is split, not refused** | Ops travel in batches of 200 in order; applying them in order leaves the other copy holding the same text. A file past 24,000 characters stops co-editing with a sentence rather than half-applying a paste. |
| **The lesson is the boundary** | Moving to another lesson, stopping co-editing or leaving the session ends it on both screens with the sentence that says which happened — a shared document never quietly starts writing into another lesson. |

What it is not is presence: there is no cursor of theirs on your screen and no list of who is where.
The two people are already talking, by whatever channel carried the invitation.

### Try-it blocks

A module page's worked example opens with **Predict first (before you run it)** — and had no Run to
press, because a Markdown fence is inert and the workbench is a page away with a different lesson in
its editor. A page now marks that fence with `<!-- try -->` on the line above it and
[`scripts/generate_try_links.mjs`](../scripts/generate_try_links.mjs) writes the link that opens it
([`src/tryLink.ts`](src/tryLink.ts), [`src/tryLinks.ts`](src/tryLinks.ts), `npm run test:try`,
`npm run check:try-links`).

| Rule | Why |
| :--- | :--- |
| The payload is the share codec under its own key (`#try=…`) | One encoder, one decoder, one version, one 2,000-character cap. A second codec is a second thing that can disagree with the first, and base64url of JSON disagrees silently. |
| The snippet opens in a **scratch** editor, ungraded | A page's block is the page's, not the learner's attempt, and usually not an answer to the exercise. Every run in scratch takes `{ grade: false }`: nothing is verified, no version is filed, no `run` is logged, and the hint ladder does not move. |
| The learner's draft is never touched | Scratch text is not written to the draft store, so a link from a page cannot cost a reader the work behind it. **Back to my draft** restores what was there, and the sitting still counts — they were at the screen. |
| The lesson comes from the page | The id is the one the page's own run callout names, so a block cannot open a different entry from the link above it, and a page that names none is reported instead of shipping a link to nowhere. |
| The link is generated, and `--check` gates it | Edit the code and re-run the generator; a stale page fails `npm run check:try-links` instead of opening old code. A block too long for the URL cap is refused by its measured size — why the biggest worked examples are still read-only. |

### The board, without the board

Five lessons are Arduino sketches — Stage 0's four plus Track 01's H-bridge lab — and this tab cannot
compile C: it holds CPython, and an AVR toolchain is a multi-megabyte wasm build the weight budget does
not carry. The roadmap's **Board** card
([`src/components/BoardBridge.tsx`](src/components/BoardBridge.tsx),
[`src/boardBridge.ts`](src/boardBridge.ts)) therefore bridges the gap instead of faking it: the lesson's
own `Full Solution`, a Copy button, a link into a simulator in another tab, and one thing graded here.

| Decision | Why |
| :--- | :--- |
| The sketch is generated from the page | `scripts/extract_and_compile_sketches.py --write-panel` writes [`src/data/boardBridges.json`](src/data/boardBridges.json) from the five lesson pages, and `--check-panel` (`npm run check:panel`) fails when it drifts. A hand-kept copy would teach an older program the first time a lesson edited its solution. |
| The serial is the text CI proves | `--host-verify` compiles each solution against a host mock of `Arduino.h` and compares `setup()`'s output with the lesson's `### Expected Output`; the card shows that exact text and grades the learner's prediction against it with the runner's own whitespace rule (`src/outputMatch.ts`). |
| The board is a link, never an `iframe` | The document is isolated with `COEP: require-corp` for `SharedArrayBuffer`, so a cross-origin frame from a site that sends no CORP header renders as an empty box; Wokwi's own embed is an unsupported prototype. A new tab is the only shape that works, which is why the polish — the sketch, the copy, the steps, the check — lives on this side. |
| The card says where the seam is | Third-party simulators need the network, and Tinkercad asks for an account; nothing pasted there reaches this page. A card that implied otherwise would be a worse lie than one that points. |
| A graded prediction is a `run` | Answering the serial box files `{ kind: 'run', lesson, outcome }` in the learning log, so the friction report counts the attempt the same way it counts a Python run — the learner did something and it was checked. |

### Board — the tab that runs machine code

The plan's last row asked for a read-only surface over the compiled Arduino reference, and **Board**
is it ([`src/components/tabs/TabBoard.tsx`](src/components/tabs/TabBoard.tsx),
[`src/avrSim.ts`](src/avrSim.ts)). `scripts/extract_and_compile_sketches.py --write-firmware` compiles
each `Full Solution` for `arduino:avr:uno` and commits the `.hex` to [`app/public/firmware/`](public/firmware/)
(51 kB of Intel HEX, **served, not bundled**) with [`src/data/firmware.json`](src/data/firmware.json)
recording the hash of the sketch each was built from and of the file.

| Decision | Why |
| :--- | :--- |
| The emulator is a lazy chunk of its own | `avr8js` (9.2 kB gzipped) is imported **inside** the Run handler. It also gets its own `vendor-avr` chunk: the catch-all `vendor` chunk is preloaded by `index.html`, and leaving the emulator in it put 9.6 kB in every first visit for a tab nobody opened — `entry_gzip` caught that at 481.7 kB against a 480 kB ceiling before the split, and reads 472.4 kB after it |
| The program is committed, not built in the tab | An AVR toolchain is far beyond the bundle. What runs is the compiled reference; an **edit** runs on a board or in CI, and the tab says so |
| Two gates, because a byte-compare cannot work | `--check-firmware` proves each hex was built from the sketch the page ships (a newer toolchain changes the machine code, not the behaviour); `npm run test:avr` runs every hex through `AvrSketch` — the module the tab uses — and asserts its serial is the lesson's |
| The guess is graded against what it printed | The page's text is the run's **stop condition**, not the answer key; a guess is compared with the emulator's own USART output, so a divergence between page and program shows up as a mismatch instead of being forgiven |
| Inputs float at 0, deliberately | No ADC is attached, exactly like `--host-verify`'s host mock, which is why the lesson's expected serial is what the emulator prints. A real board differs in the numbers an unconnected pin reads, not in the code |
| Stop, Reset, and a cycle clock | A run is chunked (40 000 instructions a tick) so the tab stays responsive; leaving the tab cancels it, and the clock says how much Arduino time the run was |

## The phone shell

Below 768 px the workbench is a different shell, not a narrower one. The twelve-tab rail becomes a
picker row ([`src/components/PhoneTabPicker.tsx`](src/components/PhoneTabPicker.tsx)), Study becomes
one surface at a time — the prose or the code, remembered per lesson in
[`src/phoneSurface.ts`](src/phoneSurface.ts) — and Run sits on a fixed bar so it is never a scroll
away. The editor mounts only when Code is opened, which is also when Pyodide's warm-up starts: a phone
that only reads pays for neither. Every dialog is the one sheet
([`src/components/Sheet.tsx`](src/components/Sheet.tsx)), a lab's plot opens at its own resolution
([`src/components/PlotExpander.tsx`](src/components/PlotExpander.tsx)), and the punctuation strip
([`src/components/PythonKeys.tsx`](src/components/PythonKeys.tsx)) supplies the colon a phone keyboard
hides. The manifest is `standalone` with icons rendered from `favicon.svg` (`npm run icons`), so the
installed app owns the whole display and `env(safe-area-inset-*)` keeps it clear of the notch. The
map, the measured numbers and the deliberate limits are in
[`../docs/MOBILE.md`](../docs/MOBILE.md).

| Decision | Why |
| :--- | :--- |
| Touch floors key on `pointer: coarse`, not width | A touch laptop needs 44 px targets and a 390 px window driven by a mouse does not; the pointer is the fact, the width is a proxy |
| Element floors live in `@layer base` | Unlayered CSS outranks every Tailwind utility, and the first version of the floor block flattened a 40 px punctuation key to 28 — the phone gate caught it |
| The surface is remembered per lesson | A stored `code` for P.1 must not open P.2 in the editor; a new lesson starts on the text, the part the learner has not read |
| The header publishes its measured height | The picker is a second sticky row; a guessed offset puts it under the header the moment the action tray wraps |
| One sheet, seven overlays | Focus trap, Escape, focus restore, a locked page and a bottom safe-area inset are written once, not seven times with seven sets of rules |

## Stack

Vite 6 · React 19 · TypeScript 5.7 · Tailwind 4 · KaTeX · Lucide. Tests drive the built bundle with
`playwright-core`.

## Run it

```bash
npm install                 # from the repository root, not app/
npm run dev                 # http://localhost:3000, regenerates the lesson registry first
npm run build               # tsc -b && vite build -> ../dist (Pages base path)
npm run lint                # tsc -b only
```

`npm run dev` and `npm run build` both run `predev`/`prebuild`, which regenerate
[`src/data/pythonLessonsData.ts`](src/data/pythonLessonsData.ts) from `exercises/` and the lesson
pages. A stale registry is a build failure, not a silent mismatch.

## Where things live

| Path | What it is |
| :--- | :--- |
| [`src/App.tsx`](src/App.tsx) | The workbench shell: tab list, beginner/advanced view, progress wiring. |
| [`src/components/tabs/`](src/components/tabs) | One file per tab. [`TabPyodideRunner.tsx`](src/components/tabs/TabPyodideRunner.tsx) is the graded runner — editor, expected output, badges, instructor panel. |
| [`src/data/`](src/data) | **Generated.** Lesson registry, spine, start-here card, plant model, link history. Edit the generator, not these files. |
| [`src/outputMatch.ts`](src/outputMatch.ts) | How stdout is compared (exact vs formatting-tolerant), shared by the runner and its tests. |
| [`src/analysisClient.ts`](src/analysisClient.ts) | Completions, lint and format over the worker: request ids, timeouts, Jedi's vocabulary mapped to the completion list, pyflakes and pycodestyle messages made drawable, Black's refusal told apart from a missing formatter. |
| [`src/editor/completions.ts`](src/editor/completions.ts) | The completion source: Jedi when the interpreter is up, keywords when it is not, and the inserted span after the dot. |
| [`src/progressMerge.ts`](src/progressMerge.ts) | Merging saved progress between browsers and accounts. |
| [`src/accounts.ts`](src/accounts.ts) | The optional Supabase account: Google, email + password, reset and the emailed link, plus the caller's own role. The SDK is imported on demand, so a signed-out visit never downloads it. |
| [`src/accountRules.ts`](src/accountRules.ts) | The rules worth testing without a project: email and password checks, provider labels, the admin predicate, the sync-scope sentence and OAuth error wording. |
| [`src/accountActions.ts`](src/accountActions.ts) | The browser side of the Edge Functions: export/delete one's own data, admin settings, roles, audit, curriculum PR. No key is read here. |
| [`src/returnTo.ts`](src/returnTo.ts) | Where a sign-in round trip may return to: this origin and base path only, with the destination reduced to a known view or lesson. |
| [`src/workspaceMerge.ts`](src/workspaceMerge.ts) | The keep-both merge for drafts, notes and highlights — pure, so the conflict rule is tested without storage. |
| [`src/workspaceSync.ts`](src/workspaceSync.ts) | Opt-in draft/note sync: the local stores, the `mechalab_workspace` row, the pre-sync preview and the merge report. |
| [`src/dashboardData.ts`](src/dashboardData.ts) | Home's returning-learner model: continue, progress counts, recent study, saved work and review. |
| [`src/resetItems.ts`](src/resetItems.ts) | One reset part, opened: its items (a lesson, an award, a card, a day of the log), each with its own erase and its own watermark rule. |
| [`src/homeData.ts`](src/homeData.ts) | Home's joins: today's one check, the route's counts, the newest notes as one line each, and the heading a lesson was left at. |
| [`src/homeLanding.ts`](src/homeLanding.ts) | Which page a visit opens, and the remembered last visit: a deep link and a first visit always win their own way. |
| [`src/components/home/`](src/components/home) | The page itself: Today, Labs, Route, Review, Tools and the dashboard that lays them out. |
| [`src/adminModel.ts`](src/adminModel.ts) | The admin capabilities, action names and the denial order the page shows; the server repeats every check. |
| [`src/siteSettings.ts`](src/siteSettings.ts) | The public announcement and feature flags, read once per visit, with built-in defaults when no project is configured. |
| [`src/lessonCoach.ts`](src/lessonCoach.ts) | The progressive hints and the stuck-state prompts. |
| [`src/checkHints.ts`](src/checkHints.ts) | The join between a failed check and the hint rung that answers it, plus the rule that earns rung 2. |
| [`src/runtime/pythonWorker.js`](src/runtime/pythonWorker.js) | The interpreter worker: warm-up, run, in-place Stop, `input()`, `mechalab.scope`, `result` and `scope` messages. |
| [`src/components/PythonEditor.tsx`](src/components/PythonEditor.tsx) | The CodeMirror editor: view, external sync, test bridge. |
| [`src/editor/`](src/editor) | Editor-only logic: the token theme, the slider model and its widget. |
| [`src/lessonFiles.ts`](src/lessonFiles.ts) | The read-only helper files a lesson brings (the shared plant). |
| [`src/lessonPage.ts`](src/lessonPage.ts) | The lesson text as data: the payload's shape and guard, where it is served from, and one fetch per page. |
| [`src/readerMarkdown.ts`](src/readerMarkdown.ts) | Inline Markdown for the reader (emphasis, code, links, maths) and the heading anchors that match GitHub's. |
| [`src/visuals/scenes.ts`](src/visuals/scenes.ts) | The named figures, as data: 73 scenes in twelve kinds, and `sceneFor` refusing an id it does not draw. |
| [`src/visuals/Diagram.tsx`](src/visuals/Diagram.tsx) | One SVG renderer per figure kind, all theme-token colours, `role="img"` and a `<figcaption>`; the route's vertical layout and its label wrapping. |
| [`src/visuals/holoModel.ts`](src/visuals/holoModel.ts) | The arm as pure functions: forward and inverse kinematics, the orbit clamps, the projection, the bounded trail, the demo pose. |
| [`src/visuals/Hologram.tsx`](src/visuals/Hologram.tsx) | Home's hologram: the projection drawn, the view dragged, the joints posed, the readout. |
| [`src/readingPosition.ts`](src/readingPosition.ts) | Where each lesson was left: a heading anchor plus an offset, kept apart from the draft store. |
| [`src/components/LessonReader.tsx`](src/components/LessonReader.tsx) | The pane: blocks rendered as React, the position restored and flushed, Highlight, Top, and the source link. |
| [`src/phoneSurface.ts`](src/phoneSurface.ts) | Which half of Study a phone is showing, remembered for the lesson it belongs to. |
| [`src/installOffer.ts`](src/installOffer.ts) | When the install row may appear: never installed, the browser's prompt, iOS's Share sheet, a thirty-day snooze. |
| [`src/components/Sheet.tsx`](src/components/Sheet.tsx) | The one dialog: a bottom sheet on a phone, focus trap, Escape, focus restore, a locked page. |
| [`src/components/PhoneTabPicker.tsx`](src/components/PhoneTabPicker.tsx) | The phone's one-row tab picker and the sheet that lists all twelve labs. |
| [`src/components/PlotExpander.tsx`](src/components/PlotExpander.tsx) | A lab canvas at its own resolution, in a sheet that scrolls both ways. |
| [`src/components/PythonKeys.tsx`](src/components/PythonKeys.tsx) | The punctuation a phone keyboard hides, inserted at the caret through the editor's own handle. |
| [`src/draftHistory.ts`](src/draftHistory.ts) | The versions behind the draft: what each run started from, with its verdict, bounded per lesson and in total, plus the merge a restore uses. |
| [`src/codeDiff.ts`](src/codeDiff.ts) | The Diff panel's engine: exact-line LCS, hunk windows with counted gaps, the coarse head/tail fallback, and the changed-line count the roadmap card reuses. |
| [`src/predictGate.ts`](src/predictGate.ts) | Predict first: how a free-text guess is graded against the expected output (four verdicts, lines not substrings), and the bounded per-lesson store of guesses and skips. |
| [`src/workflow.ts`](src/workflow.ts) | The learner's workflow as data: the two palettes, nodes and arrows, the one reading order, the eight advisory checks, the version-1 migration, and the Mermaid and Markdown exports. |
| [`src/workflowStore.ts`](src/workflowStore.ts) | One workflow per lesson in the bulk bucket: the refused write, the backup entry, and the newer-wins merge a restore uses. |
| [`src/workflowTemplates.ts`](src/workflowTemplates.ts) | Six seeded flows in both palettes, one blank, each laid out as a connected column with its arrows drawn, and the single lesson that opens on its own example. |
| [`src/components/WorkflowPanel.tsx`](src/components/WorkflowPanel.tsx) | The Workflow tab's container: owns the document, its debounced save, the selected card and every mutation; validates once per document and composes the canvas, picker and guide. |
| [`src/components/WorkflowCanvas.tsx`](src/components/WorkflowCanvas.tsx) | The node canvas's surface and composition: the scroll pane, the scaled grid, the fit button, and the wiring of the viewport, the cards and the arrows. Each concern beside it is readable alone. |
| [`src/components/workflow/`](src/components/workflow/) | The canvas's parts: `canvasGeometry.ts` (dots, bends, facing sides — pure), `useViewport.ts` (scale, Fit/100%, drag-pan and arrow-key pan), `useNodeDrag.ts` (one card's drag held in pixels until release), `useLinking.ts` (the arrow being drawn, dot-to-dot or tap-then-tap), `useNodeHeights.ts` (the measured heights the four dots need), `WorkflowNodeCard.tsx` (one editable card and its ports) and `WorkflowEdges.tsx` (paths, arrowheads, dashed preview, edge controls). |
| [`src/components/TemplatePicker.tsx`](src/components/TemplatePicker.tsx) | The two palettes of seeded flows, as starting shapes to edit. |
| [`src/components/HowToCard.tsx`](src/components/HowToCard.tsx) | The three-line guide to the tab; whether it is open is the container's policy. |
| [`src/watchMode.ts`](src/watchMode.ts) | When the checks may re-run themselves — after a graded failure, on an edited buffer, never past the gate — and the remembered toggle. |
| [`src/announce.ts`](src/announce.ts) | The sentence a screen reader hears after a run: verdict first, then the failing line, the metric or the exception — condensed to one interruption. |
| [`src/backupZip.ts`](src/backupZip.ts) | The zip writer and reader a backup is made of: stored entries, CRC-32, and the four ways a chosen file can fail. |
| [`src/backupBundle.ts`](src/backupBundle.ts) | What a backup holds and how a restore merges it: flags union, drafts fill gaps, versions and events dedupe. |
| [`src/progressKeys.ts`](src/progressKeys.ts) | Where the three progress maps live, so the backup can read them without importing React. |
| [`src/scopeModel.ts`](src/scopeModel.ts) | What a Scope payload must be to be drawn: NaN dropped, lengths aligned, flat traces widened, tables sampled. |
| [`src/components/ScopePanel.tsx`](src/components/ScopePanel.tsx) | The Scope: canvas, shared axes, legend with last values, and the same data as a table. |
| [`src/learningLog.ts`](src/learningLog.ts) | The event log behind the friction report and the roadmap's "opened / tried" states. |
| [`src/fsrs.ts`](src/fsrs.ts) | FSRS-5: the published weights and formulas, pure — a schedule in, a schedule out, `now` injected. |
| [`src/studyCards.ts`](src/studyCards.ts) | The deck: cards derived from commented highlights, their schedules stored, and the merge a restore uses. |
| [`src/sittingClock.ts`](src/sittingClock.ts) | The measured sitting: idle cutoff, three-hour cap, bounded store, and the totals the pilot quotes. |
| [`src/timeline.ts`](src/timeline.ts) | The log and the sittings as days of work: the fold that drops repeat rows, local days, and the caps. |
| [`src/trailReading.ts`](src/trailReading.ts) | The same days read for advice: a resisting lesson, a quiet review deck, days that were only opens — at most three, each behind its own floor. |
| [`../scripts/weight_budget.mjs`](../scripts/weight_budget.mjs) | The weight rules: what counts, what a breach is, and why an unmeasured budget fails too. |
| [`../scripts/build_music.mjs`](../scripts/build_music.mjs) | Makes the eight tapes: four fixed windows cut from CC0 recordings, four loops composed from a seeded score, all folded seamless and RMS-matched, then AAC. |
| [`src/components/TrailCard.tsx`](src/components/TrailCard.tsx) | The roadmap's trail: a day's time and work, a row per event, and rows that open their lesson. |
| [`src/focusMode.ts`](src/focusMode.ts) | Focus mode's stored choice and the event the header, the pill and the page share. |
| [`src/audio/prefs.ts`](src/audio/prefs.ts) | Sound's stored choice (`mechalab_sound_v1`), its clamping, the subscribers both controls read, and the labels. Off by default. |
| [`src/audio/facade.ts`](src/audio/facade.ts) | The two functions the runner and focus mode call — `playCue`, `setSoundScene` — as one window event, so no audio code reaches the entry chunk. |
| [`src/audio/engine.ts`](src/audio/engine.ts) | The only AudioContext: the mixer graph, synthesised cues, the chosen tape (three decoded loops cached, crossfaded) with the drone as its fallback, the limiter, the duck and the focus scene, the seven interface ticks, and the recorded rain. A lazy chunk, fetched after first paint. |
| [`src/audio/musicCatalogue.ts`](src/audio/musicCatalogue.ts) | The eight tapes as facts — category, title, artist, album, licence, source page — and no audio imports, so the panel and a Node test can read them. |
| [`src/audio/musicBeds.ts`](src/audio/musicBeds.ts) | The tapes' lazy URL glob, their fetch and their decode; reached only through a dynamic import inside the engine, and `null` for every way it can fail. |
| [`src/components/SoundSettingsPanel.tsx`](src/components/SoundSettingsPanel.tsx) | The audio settings panel: master and armed state, Music with its source choice, Room, Cues, the Interface switch and previews, the credit line and Reset. Not a dialog: no focus trap, closes on Escape. |
| [`src/audio/clickMap.ts`](src/audio/clickMap.ts) | What a control is, from what it already says about itself (`data-sound`, role, `aria-pressed`, a close word), and the pan a pointer's position asks for. |
| [`src/audio/ambience.ts`](src/audio/ambience.ts) | The room as a table: rain, floor, city and bench, per state — and why the bench is the one layer that rises during a run. |
| [`src/audio/rainAsset.ts`](src/audio/rainAsset.ts) | The recorded loop's URL, in its own module, so a Node test can import the engine without meeting an `.m4a`. |
| [`src/components/SoundClicks.tsx`](src/components/SoundClicks.tsx) | The interface's ear: one delegated listener, the dedupe between a pointer and a keyboard press, and nothing rendered. |
| [`src/components/SoundControl.tsx`](src/components/SoundControl.tsx) | The header's sound button and panel, the focus pill's mute, and the one-shot gesture that starts a remembered "on" without autoplaying. |
| [`src/portfolio.ts`](src/portfolio.ts) | The exported Markdown: progress, notes and passages, the deck, and the measured sittings. |
| [`src/traceback.ts`](src/traceback.ts) | CPython's failure text as data: frames, the learner's own frame, chains, and both SyntaxError shapes. |
| [`src/errorIndex.ts`](src/errorIndex.ts) | The explainer's entries matched to a parsed failure, and the honest "not in the index" case. |
| [`src/components/TracebackCard.tsx`](src/components/TracebackCard.tsx) | The failure card: exception, line, `Show line N`, and the entry's check-first list. |
| [`src/bulkStorage.ts`](src/bulkStorage.ts) | The six large stores behind a `Storage`-shaped write-behind cache over IndexedDB, and the migration out of the bucket. |
| [`src/idbBackend.ts`](src/idbBackend.ts) | The raw IndexedDB backend: one object store, three operations, and `null` on every way a database can be refused. |

## Checks that cover this directory

```bash
npm run lint                 # types
npm run test:workbench       # runner behaviour (happy-dom) + palette search + editor model
npm run test:reader          # the lesson pane without a browser: inline parsing, heading anchors, the payload guard, the position store
npm run test:phone           # the phone's pure rules: the per-lesson surface store and the install offer's platform and snooze rules
npm run test:e2e:mobile      # the phone gate: 390x844 touch shell, picker, Study surfaces, sheets, install row, and the 768/1024 handover
npm run icons                # render the manifest and iOS icons from favicon.svg
npm run test:runtime         # the worker: in-place Stop, input(), isolation, Pages fallback
npm run test:editor          # slider directives (parse/clamp/format) and helper-tab detection
npm run test:history         # run history: filed on Run, deduped, capped per lesson and in total
npm run test:scope          # Scope rules: payloads, cursor sampling, zoom/pan windows, bounds, tables
npm run test:analysis       # completions, hover and signatures: insertion point, cursor coordinates, the call under the cursor, note shape, transport rules
npm run test:checkhints      # the failed check -> rung join, and the rule that earns rung 2
npm run test:e2e             # dev server, one lesson end to end
npm run test:e2e:pages       # built bundle at the Pages base path: every graded entry, ramp R.1-R.6, tablet width
npm run test:offline         # the service worker: isolation without host headers, the take-offline button, offline reload, run + deep link, formulas from the cache
npm run test:takealong       # the offline button's rules: URL list, size wording, what "ready" may claim
npm run test:backup          # the archive: CRC, round trip, the three refusals, and a merge that never deletes
npm run test:reset           # erasing progress: the eleven parts, one part vs the rest, one item inside a part, and the cloud watermark
npm run test:e2e:reset       # the same panel in Chromium: a backup first, a part opened to one lesson, one part, two parts, everything, preferences kept
npm run test:study           # notes and highlights: what is kept, deduped, refused by the store, and what a restore merges
npm run test:review          # FSRS: 0.9-at-stability, grade order, lapses, the year cap, and the card join
npm run test:sitting         # the sitting clock's rules and focus mode's store, without a browser
npm run test:studyclock      # the brief's clock: banked stretches, a reload trusted to its heartbeat, a background tab that keeps counting, Log & reset
npm run test:portfolio       # the export: sections only when they have content, quoting, caps, the time table
npm run test:storage         # IndexedDB: the bucket fallback, the migration order, the write queue, a refused write
npm run test:traceback       # tracebacks as data: frames, chains, syntax shapes, and the index match
npm run test:trail           # the trail: local days, the fold, sitting time on its start day, the caps
npm run test:trailreading    # the same trail read for advice: a resisting lesson, a quiet deck, opens alone
npm run test:paint          # the first paint as a reading: one sample per visit, medians, the export shape
npm run test:weight          # the weight budget's rules: the boundary, an unmeasured metric, the tightest
npm run test:audio           # sound: off by default, the graph, the duck, the focus factor, the cue gap, the bus
npm run test:share           # the share link: round trips, the URL-safe alphabet, the measured cap, every malformed fragment
npm run test:inline          # inline values: top-level bindings only, the last binding, payload validation, the cut
npm run test:board           # the Board card: each lesson's sketch, a prediction graded against the proven serial, malformed bridges refused
npm run check:panel          # the card's generated data still matches the five Arduino lesson pages
npm run test:avr             # every committed .hex runs in avr8js and prints its lesson's serial; corrupt records and wrong expectations refused
npm run check:firmware       # each .hex was built from the sketch the page ships, and is the file the index hashes
npm run check:axe            # axe over all twelve tabs and Home in every palette; serious/critical fails, stale allowlists fail
npm run check:weight         # the gzipped shell against docs/weight-budget.json (run after npm run build)
npm run check:lighthouse     # best-practices, SEO and accessibility audits on the built bundle; performance is not run
npm run check:snapshot       # the painted structure of all 52 surfaces against docs/surface-snapshot.json
npm run test:perf            # the visit, timed: six moments on the built bundle, laptop and throttled phone, against docs/perf-budget.json (--record writes docs/PERF.md)
npm run test:perf:unit       # the perf page and its ceilings without a browser; a CI step
npm run test:e2e:backup      # the header buttons in Chromium: write a zip, wipe, restore to store and screen
npm run test:e2e:review      # pin, comment, rate, reload in Chromium: the card stays scheduled
npm run test:e2e:focus       # focus in Chromium: the chrome hides, the work stays, three exits, one measured sitting
npm run test:e2e:trail       # the trail in Chromium: runs become today, a reload keeps them, a row opens its lesson, the reading names the lesson that resisted
npm run test:e2e:storage     # a pre-IndexedDB bucket in Chromium: migrated whole, shown on screen, written to
npm run check:lessons        # the registry is current
```

`test:e2e:pages` is the suite that proves what a learner actually opens; it fails if the bundle was
built for `/` instead of `/Mechatronics-Roadmap/`, if an entry the registry ships is missing from the
lesson list, or if any starter verifies.

## Deploying

`.github/workflows/ci.yml` builds `dist/` and the Pages workflow publishes it. The base path comes
from `PAGES_BASE` in [`../vite.config.ts`](../vite.config.ts); override it (`PAGES_BASE=/ npm run
build`) only for a host serving from a domain root, and expect `test:e2e:pages` to fail until the
served base matches.
