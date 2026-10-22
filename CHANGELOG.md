# Changelog — Beginner-First Mechatronics Roadmap Rewrite

All structural changes, lesson splits, curriculum reorderings, angle-convention standardizations, and automated verification additions are logged below.

```mermaid
flowchart LR
    TP["Track P (14 Files: P.1–P.12 + P.14 + P.M)"] --> S0["Stage 0 (11 Files: S0.0–S0.9 + S0.M)"]
    S0 --> B1["Pass 1 Tier 1 (23 Files: 00.1–08.1 across Tracks 00–08)"]
    B1 --> QA["Automated CI: verify_repo + validate_modules + lint_lessons + lint_modules + check_term_order + clean_tex + audit_math + test_exercises + run_all_labs + smoke & browser E2E (dev server and built Pages bundle)"]
```

---

## [2026-10-21] — Run 159: The Editor Arrives After the Code Does

The tab split left one thing on the first paint that did not need to be there: the editor. CodeMirror
and its Python parser are 149 kB gzipped and they sat in the entry's preload list, so a learner waited
for a syntax highlighter before reading the first line of their lesson.

**The editor is now a `React.lazy` boundary, inside the runner rather than around it.**
[`PythonEditor.tsx`](app/src/components/PythonEditor.tsx) is the shell that stays mounted — the props,
the `PythonEditorHandle` type, and a placeholder that paints the learner's code as monospace text at
the editor's own metrics (`min-height: 288px`, `12.5px/1.6`, the gutter's 44px left inset). The
CodeMirror view moved whole into [`pythonEditorImpl.tsx`](app/src/components/pythonEditorImpl.tsx),
imported only there, and the ref is forwarded straight through the lazy component so the runner's
`guideEditorRef` has no new callers. Four consequences, each checked:

- `entry_gzip` **585.5 → 432.9 kB** (−152.6 kB, −26%), and `vendor-editor` left the modulepreload list:
  a first visit now waits for the document, React, KaTeX and the icons, then paints the lesson text,
the code and the Run button.
- `largest_js_gzip` 267.3 → **263.0 kB**; `total` 947.7 → 948.5 kB across 33 files (the shell and the
  glue are a 5.25 kB chunk that used to be folded into the entry).
- `window.__mechalabEditors[testId]` no longer exists at t=0 — it is a post-chunk promise. Every suite
  already waits through `scripts/editor-code.mjs`'s `waitForEditor`, and the three sweeps that had
  learned to wait out `[data-testid="tab-loading"]` now wait out `[data-editor-ready="false"]` too:
  the placeholder's own text runs are not the editor's, and auditing them would measure a page that is
  about to be replaced.
- The starter is readable while CodeMirror parses, so the placeholder is the code, not a spinner: the
  swap changes the surface's internals instead of the page's shape.

`docs/weight-budget.json` carries the new entry budget (620 → **470 kB**) with the number and the reason,
and `npm run check:weight`, `npm run test:weight` (13 checks) and `npm run lint` pass.

**The failure a lazy chunk adds, caught where it happens.** With the module behind a network fetch, a
deploy that replaced the hashed file — or an offline visit serving an index that names it — used to
throw out of the lazy component, and an app with no other boundary unmounts: the lesson, the Run
button and the learner's own code with it. `PythonEditor.tsx` now wraps the boundary in a small
`EditorBoundary` whose fallback is the same placeholder with a sentence saying which half is missing
and that Run still works. `npm run test:editor:deferred` (`scripts/e2e_editor_deferred.mjs`, now part
of `test:workbench`, 34 suites) pins both halves in Chromium: with the chunk aborted at the network the
code is readable, the notice is named, Run is pressable and no exception escapes; on an ordinary visit
the placeholder paints the starter, CodeMirror takes the box over, and an edit through the view reaches
the app.

**The matrix stops competing with itself.** Thirty-four suites used to be started in one `Promise.all`,
so thirty of them were driving Chromium against one dev server at the same moment; the first run of
this change produced three failures that were all that contention — a 30 s `page.goto`, a 5 s readout
wait, and a Suspense panel read as settled content. `test:workbench` now lists its suites as data and
runs the browser half **four at a time** (`runWaves`), and the pair sweep's `settle()` re-checks for a
skeleton *inside* its stability loop, so a tab opened by the pair's second click cannot be fingerprinted
while it still says "Loading this tab…".

**One repository gate is red, and it was red before this change.** `npm run test:runtime` fails at its
Jedi-completions step: the explicit start issued right after a runner remount (tab → other tab → back)
never opens the list, while typing one character does, and a second explicit start after the runtime is
warm does. Reproduced with CodeMirror imported statically (`const EditorImpl = StaticImpl`) — the
failure is identical, so it predates the lazy boundary rather than being caused by it. Not fixed here:
recorded in `docs/PLAN-2.0-GAP.md` as the next item, with the probe that isolates it.

## [2026-10-21] — Run 158: One Chunk Becomes an Entry, Five Vendors and Ten Tabs

The weight gate went up in the last run with a single 614 kB chunk behind it, which is the number it
was built to point at. It is gone: the bundle is now an **entry chunk of 267 kB gzip**, five vendor
chunks split by how often they change (`vendor-react` 69 kB, `vendor-editor` 149 kB, `vendor-katex`
77 kB, `vendor-icons` 8 kB), and **ten lazy tab chunks** of 3.5–11 kB each, fetched when the learner
opens that tab.

**What moved, exactly.** `entry_gzip` — the document plus everything it names: its module script, the
chunks it preloads, its stylesheets — went from **627.5 kB in one file to 585.5 kB across seven**, and
the largest single file fell **58% (614.1 → 267.3 kB)**. `total` went *up* 9.9 kB, from 937.8 to
947.7 across 32 files, and that is the honest shape of a split: every chunk is emitted whether or not
its tab is opened, so the bundle as a whole pays a few hundred bytes of headers per chunk while the
bytes a first visit waits for fall. The budget records both, so neither can drift silently.

**The runner stays static.** It is the tab the app opens on, so a lazy boundary there would only add a
round trip before the lesson appears; its code was never the part a visit could avoid. The other ten
are `React.lazy`, and the rail **prefetches on pointer-enter and focus** — the intent to open a tab,
not the act — so the chunk is usually in memory by the time the button is released and the Suspense
panel never shows. A tab the learner never points at is never fetched.

**One thing the split exposed in the gates.** The theme sweep clicks each tab and audits what is on
screen after a fixed 260 ms; with lazy tabs that wait could audit the *Suspense panel* instead of the
tab, which would pass every contrast rule while measuring a page that says "Loading this tab…". The
sweep (and the axe sweep, at 300 ms) now waits for `[data-testid="tab-loading"]` to be **gone** before
auditing — a state rather than a guess at the network's speed. `entry_gzip` was added to the budget for
the same reason the split exists: `total` cannot see this change, and the metric that can has to be the
one a first paint waits for.

- `npm run check:weight` gained `entry_gzip` (the document, its module script, its modulepreloads,
  its stylesheets — parsed from the built `index.html`), and `largest_js_gzip`'s budget came down from
  665 kB to **300 kB**, so folding the tabs back into the entry fails the gate rather than passing
  quietly.
- `npm run test:weight` grew three checks (**13**): the entry is the document plus the files it names,
  an entry naming a file the build never emitted is **unmeasured** rather than a smaller first paint,
  and a document that names nothing is unmeasured too.
- `vite.config.ts` carries the `manualChunks` split, with the reason: one chunk meant one cache key, so
  a sentence change in a tab re-downloaded React and CodeMirror with it.
- `npm run test:theme:e2e` and `npm run check:axe` wait for the tab's own markup; `npm run test:smoke`
  (SSR) still passes unchanged, because the tabs it renders — the runner — were never lazy.

## [2026-10-21] — Run 157: axe Found Three Real Bugs, and the Bundle Gets a Ceiling

The plan's last two gates were "an axe run over the tabs" and "a weight budget". Both exist now, and
the first one immediately found three things a screenshot could not: **every slider on all seven lab
tabs had no accessible name** (22 inputs — a screen reader announced "slider" and a number, on the
control each lab is built around), **the header's brand link reworded itself** in an `aria-label` that
did not contain the words on screen (WCAG 2.5.3), and **the editor's scroll region could not be
reached by keyboard** at all, so paging through a long file without moving the caret was impossible.
All three are fixed in this run, not allowlisted: names on the sliders, a screen-reader-only ", back
to top" on the brand link, and a tab stop on the CodeMirror scroller.

**`npm run check:axe`** (new) walks the same eleven tabs the theme suite walks, in both palettes,
with `axe-core` injected into the page. `serious` and `critical` findings fail; `minor` and `moderate`
are reported (46 of them: `page-has-heading-one`, `region`, `heading-order`), because a gate that
fails on a landmark suggestion is a gate people switch off. `color-contrast` is deliberately left to
`test:theme:e2e`, which composites the real ancestor stack and fails below 3:1 on all 22 tab/theme
pairs — two contrast gates that disagree would make the accurate one look wrong.
`docs/a11y-allowlist.json` is the sanctioned way to leave something unfixed, and it is a ratchet in
three directions: an unlisted finding fails, an entry that fires on more nodes than it recorded
fails, and **an entry that no longer fires fails as stale** — an exception nobody deleted is how a
gate quietly stops covering anything. It is empty today.

**`npm run check:weight`** (new) reads the built bundle and compares gzipped bytes against
`docs/weight-budget.json`: `js_gzip`, `css_gzip`, `fonts` (counted raw, because woff2 is already
compressed), `largest_js_gzip` (the total can stay flat while one chunk doubles) and `total`. Today's
bundle is **937.8 kB gzipped** across 16 files, and the budgets sit 8% above that. Two rules make it
a gate: a metric over its budget fails with the overshoot named, and **a budget with nothing measured
behind it also fails** — a metric the build stopped emitting would otherwise pass forever by being
absent. `og.png` (370 kB) is out of scope: no page fetches it, and a budget that counted it would
move whenever the social card is redrawn.

- `npm run test:weight` (**10 checks**, new): under budget, exactly at it, one byte over, a budget
  with nothing measured, the tightest metric, nothing measured at all, a metric outside the budget
  list, and the measurement itself (what counts as js, css, a font, the largest chunk, the no-js
  case, the formatting).
- `npm run check:axe` proven in both directions on the machine: with one slider's `aria-label`
  removed it fails with `new violation label (critical)` naming `input[min="0.02"]`; with a stale
  allowlist entry it fails with *no longer fires*; restored, both pass.
- `npm run check:weight` proven the same way: with `js_gzip` lowered to 500 kB it fails naming
  `619.7 kB … over by 119.7 kB (+24%)`; restored, it passes.
- CI grows two steps in `build-workbench` (weight after the build, axe after the Playwright install),
  `test:workbench` now runs **33 suites**, and `package-lock.json` carries `axe-core` as a dev
  dependency — the only new dependency, and a dev one.
- `docs/PLAN-2.0-GAP.md`'s CI-rigour row and its next list record both gates, and the next item is
  the 614 kB single chunk.

## [2026-10-21] — Run 156: The Fortnight as One Page

Every surface in the app answered a question about *one* lesson: the runner's attempts, the resume
card, the study panel's notes, the portfolio's per-lesson table. None answered "what did I do last
Tuesday", which is the question a self-paced course is asked by the person sitting it — and the log
has held the answer since it was written.

**`app/src/timeline.ts` is the reading, and it is pure.** `buildTrail(events, sittings, { now })`
folds the learning log and the sitting clock into days of work: newest first, the day named the way a
learner names it (`Today`, `Yesterday`, `Tue 20 Oct`), each row a time and a verb — `opened`,
`run · checks failed`, `verified`, `read hint 2`, `exported the portfolio`. Days are local, because a
sitting is a fact about someone's evening and not about UTC.

**The rules are the part that makes it a trail rather than a dump.** An open followed by work within
thirty minutes is that work — the row is dropped instead of doubling the list, and a re-mount that
logs the same open twice collapses to the later one. A verification inside ten seconds of a passing
run is that run's result, so a success is one row, not two. A sitting contributes *time*, not a row:
the runs are already there, so its duration lands on the day it started (a sitting across midnight
is filed where it began, and the total never counts it twice). And the whole thing is bounded — the
last 14 days, 30 rows a day, 120 in total — with the counts of what was cut, so the card says
"…and 6 more entries this day" rather than ending mid-list.

**A trail of opens is not work.** The app opens on the runner, so a brand-new profile logs one
`lesson_open` before the learner has done anything; a card headed *Your trail* over that one line is
noise on the most important screen the course has. `hasWork()` gates the card on a run, a hint, a
pass or an export, so the roadmap stays quiet for a beginner and speaks as soon as there is something
to say. A read-only visit after real work keeps its open row, because there the open is part of a day
that happened.

- `npm run test:trail` (**27 checks**, new): the local day and its label across a month boundary and
the 24-hour stamp, grouping from an unsorted log, the open fold at, inside and outside its window, a
fold that stays inside its own lesson, the double-mount collapse, the verification fold and the three
cases where it must not fold, every row's words, the failure line, a sitting filed on its start day
(including one crossing midnight), sittings with no events making no day, a backwards sitting, the
14-day / 30-a-day / 120-total caps and what each reports omitted, totals over what is on screen, an
empty trail, an unreadable timestamp, an unknown event kind, and `hasWork`.
- `npm run test:e2e:trail` (new) in Chromium: a fresh profile has no card; the starter runs to
  `status-behavior-failed` and the solution to `status-assert-passed`; the roadmap then shows today
  with both runs, one passing row (not two), and measured time in the summary; a reload keeps the
  trail and both runs; and clicking a row puts the runner back on that lesson.
- [`app/src/components/TrailCard.tsx`](app/src/components/TrailCard.tsx) sits under the resume card in
the roadmap tab, re-reading both stores when the tab opens and after a restore writes them. It renders
nothing without work, and its rows are links into the runner.
- `resolveChromiumExecutable` gained the two macOS app paths, and the Pages suite now uses it for
  Chromium: a developer machine without the downloaded Playwright browsers runs the browser suites
  instead of reporting `SKIP` for every one of them.
- `npm run test:workbench` now runs **32 suites**; `docs/PLAN-2.0-GAP.md`'s persistence row and its
  next list record the timeline, and the accessibility/weight budgets are what remains of that list.

## [2026-10-21] — Run 155: The Failure Is Read, Not Just Printed

The last editor item that was still prose: a red line printed CPython's traceback and stopped there.
Which frame was the learner's, and whether the failure was one of the twelve the course documents,
were both questions the learner had to answer from somewhere else.

**`app/src/traceback.ts` reads the text into data.** Frames, the exception, and one line for a log. It
takes the *last* block of a chained failure — the one that stopped the program — the **deepest** frame,
and the lesson's appended `_selfcheck` is recognised as harness code: when the check itself raises
there is no learner line to point at, and the card says so instead of moving the cursor to a line they
cannot edit. Both shapes parse, because the worker reports a compile failure itself:
`SyntaxError (line N): msg` with no frames, and CPython's own with a `File` line and a caret that is
not mistaken for a source line. Parsing rather than a structured payload, because a learner can print a
traceback of their own and the panel is handed whatever was printed.

**`app/src/errorIndex.ts` joins it to the page.** `docs/ERROR_EXPLAINER.md` is generated into
`app/src/data/errorIndex.ts` by `scripts/generate_error_index.py`, whose `--check` mode is a new gate:
editing an entry without regenerating fails the build rather than leaving a card that disagrees with the
document. The match comes from the entry's heading, which is the page's own organisation: a class and
the message it quotes, or a class alone. A `TypeError` only matches entry 2's quoted message; a
`NameError` matches nothing, and the card says so — a confident wrong diagnosis is worse than none.

**The worker sends the whole traceback** (`format_exc()` instead of `format_exception_only`) for an
uncaught exception, which is what gives the parser frames to read; the learning log's `fail` line is
now the parsed exception (`ZeroDivisionError: division by zero`) rather than the traceback header. The
card sits under the output, offers `Show line N` (a new `revealLine` on the editor bridge — a cursor
move, not a selection, so the study panel is not armed for a passage the learner did not choose), and
prints the matched entry's own check-first list.

**One regression, caught by the suite that already existed.** Sending the whole traceback made the
runner's `stderr.startsWith('AssertionError')` false, so a capstone whose appended self-check fired
reported a plain runtime error instead of a failed bench — the 08.1 scenario in `npm run test:e2e`
timed out twice on exactly that, reproducibly. The exception class is now read out of the parse
(`isAssertionFailure`), with the old prefix kept only for text that is a bare assertion message, and the
unit suite grew the check that would have named it.

- `npm run test:traceback` (**21 checks**, new): frames and source lines, the deepest frame, chains,
  `_selfcheck` raising vs calling a failing learner function, a custom harness list, both syntax
  shapes, captured stderr above the traceback, CRLF, non-failures, the assertion-vs-traceback
  regression, and the index join (numbered entries, a heading that is not an exception claiming
  nothing, the three matches and the misses).
- `npm run test:e2e` step 3 grew three checks in Chromium: a syntax error names its line and moves the
  cursor there while admitting the index has no entry; a `ZeroDivisionError` matches entry 3 and brings
  its bullets; a `NameError` is named and left outside the index.
- `check:errorindex` (**29 gates**) and `test:workbench` (**29 suites**) run the generator's drift check
  and the new unit suite; `docs/PLAN-2.0-GAP.md`'s traceback row records the join, and the next list moves
  on to the cross-lesson timeline and the accessibility/weight budgets.

## [2026-10-21] — Run 154: The Work Moves to IndexedDB

The caps on every store were sized against one 5 MB bucket, and after the study layer and the review
deck they measured ~4.0 MB of it — one big capstone draft away from a `QuotaExceeded` in the middle of
a debounced save. The six large stores now live in **IndexedDB**: drafts, filed versions, the learning
log, notes and highlights, review schedules and sittings.

**No store module changed its signature to get there.** Every one already read through a
`Storage`-shaped helper, so [`app/src/bulkStorage.ts`](app/src/bulkStorage.ts) is a `Storage` with a
write-behind cache underneath: `main.tsx` awaits `hydrateBulkStorage()` before the first render, which
opens the database, copies every entry into memory and migrates the bucket, and from then on reads are
synchronous out of that copy while writes land in IndexedDB on the next tick, coalesced per key. The
signatures, the fake buckets in the unit suites and React's `useState` initializers all keep working.
One object store and three operations did not earn a dependency, so
[`app/src/idbBackend.ts`](app/src/idbBackend.ts) is a hand-written wrapper whose every failure mode
resolves to `null`.

**The migration is the part that could eat work, so it is ordered for it.** Copy every key first,
delete only after the backend has it; the bucket's copy wins over the database's when both have a key,
because that copy is the one the previous build wrote. A browser that refuses a database — private
mode, blocked storage, a second tab holding an older version open — settles back on the bucket and
behaves exactly as before. The small first-paint keys (theme, focus, last lesson, view mode, progress
flags) deliberately stay in the bucket: they are read before React mounts, and a theme one frame late
is a flash.

- `npm run test:storage` (**13 checks**, new): the bucket-is-the-store fallback with no database, the
  copy-then-delete order, a refused copy leaving the bucket whole (and the next visit finishing),
  the bucket winning over a duplicate, coalescing three writes into one put, a clear reaching the
  database, a failed write going back on the queue, and `null` — not an empty store — before hydrate.
- `npm run test:e2e:storage` (new) starts as a learner from the previous build: a bucket holding all
  six stores, a reload, and then nothing lost (every value in the database, the bucket empty), the
  editor / note box / deck showing the carried work, a typed note landing in the database and not the
  bucket, and a further reload reading it back.
- The suites that read the bucket by hand now read the database through
  [`scripts/bulk_store_page.mjs`](scripts/bulk_store_page.mjs), and the workbench suite's "zero
  progress" reset clears both stores — clearing only the bucket would leave the log, drafts and notes
  the scenario is trying to forget. The same-task pair sweep's fingerprint gained the four bulk stores
  it used to compare in `localStorage`, in the same read.
- `npm run test:workbench` now runs **28 suites**; `docs/PLAN-2.0-GAP.md`'s persistence row records the
  move and keeps its **partial** on the cross-lesson timeline that is still missing.

## [2026-10-21] — Run 153: The Portfolio Carries the Work

The export was the last place where the study layer did not show up: a learner could write a note, keep
a passage, answer a card and spend two hours in the app, and the Markdown they handed to a mentor
contained none of it. It now carries all four.

**The builder moved out of `App.tsx` and became pure.** [`app/src/portfolio.ts`](app/src/portfolio.ts)
takes the three progress maps and an `extras` object (the notes store, the derived deck, the sittings
and `now`) and returns the document. `App` re-exports it so the smoke suite and the modal keep their
import, and the modal's string is built on the render that opens it — never a frame of empty preview,
and the download and the preview are the same text.

**Three new sections, each only when it has content.** _Study Notes and Kept Passages_ puts each
lesson's note in a blockquote, line by line, and its passages as one line each with the comment after an
em dash. _Review Deck (FSRS-5)_ reports cards, how many are due, when the next comes back, and lists
the first twenty with `seen 2× · in 2 days`, saying how many it left out. _Measured Study Time_ gives
the totals the pilot quotes, says the number was measured on this device, and prints the most recent
eight sittings as a table. A fresh browser still gets exactly the three progress sections: empty
headings that read as "did nothing" are worse than no headings.

**Two escaping rules that a screenshot would hide.** A note is quoted, so a line starting with `#` or
`---` cannot become a heading or a rule and swallow the section after it; a passage is collapsed to one
line before it is stored in the list. Both are pinned as text.

- `npm run test:portfolio` (**12 checks**, new): the progress record unchanged and proportional, notes
  in registry order with their line breaks quoted, passages collapsed with their comments, the `#`/`---`
  escape, the deck's due/next/cap wording, the table's rows agreeing with the totals, and two builds of
  one state byte-identical.
- `npm run test:e2e:review` opens the export in Chromium and finds the pinned passage, its comment, the
  deck section and the measured sitting in the file — the check that the export looks at the stores and
  not only at React's copy of them.
- `npm run test:workbench` now runs **27 suites**; `docs/PLAN-2.0-GAP.md`'s study-layer row moves to
  **ships**.

## [2026-10-21] — Run 152: Focus Mode, and a Clock Under the Pilot's Time Column

The last row of the study layer had two halves: a mode that takes the other tasks off the screen,
and a measurement of the sitting itself. Both ship here, and the second one closes the only column in
`docs/PILOT.md` that was still estimated.

**Focus mode is one CSS rule, not a prop through five components.** `App` puts `data-focus` on the
shell, every region that offers a different task carries `data-chrome` (header, mode bar, tab rail,
lesson list, tour bar, footer), and `[data-focus='on'] [data-chrome]` hides them; the pane that shared
a row with the lesson list takes the whole row. `⌘.`, the header's **Focus** button and the pill all
toggle it; `Escape` leaves it, but only when no dialog has claimed the key (`defaultPrevented`), so one
press never closes two things. The pill is the one control the mode does not hide — a focus mode you
cannot get out of is a trap — and the choice is remembered across a reload.

**The clock counts sittings, not seconds on a stopwatch.** [`app/src/sittingClock.ts`](app/src/sittingClock.ts):
any lesson open, run or review extends the sitting in progress; five minutes without one closes it; a
sitting is capped at three hours, so a tab left open overnight is not study time; a backwards clock
starts a new sitting rather than filing a negative one. The pure part takes `now`, so all of that is
pinned by a unit suite instead of by waiting. The study panel prints `Today 34 min · median sitting
18 min` (the median only once there are two sittings to take one of), and the learning-log export now
carries `sittings` beside `events`, which is what lets a pilot fill `active_minutes` from the file.
Sittings are deliberately **not** in the backup: a sitting is a fact about one machine's clock, and
merging two machines' would count the same hour twice — the exact number this exists to keep honest.

**Two defects found by running it.** `setFocus` dispatched a `CustomEvent` built in this realm; the
DOM in the test harness did not dispatch it, so the change reached the store and not the listeners —
the event is now built with the page's own constructor. And the same-task control-pair sweep began
failing, correctly: it compares `localStorage` between two runs of identical clicks, and a sitting is a
record of *when* the clicks happened, so it can never match. The sweep now filters the third
wall-clock key, with the reason written where the other two already were.

- `npm run test:sitting` (**20 checks**, new): the idle cutoff at the exact boundary, the three-hour
  cap, a backwards clock, lesson dedupe and its twelve-lesson cap, one entry per sitting, the
  200-sitting store and its eviction, a foreign store read as the part that parses, blocked storage
  never throwing, the exported log carrying the sittings beside the events, and totals (median odd and
  even, longest, today) — plus focus mode's store: the
  choice survives a reload, the toggle broadcasts once, and a refusing store still returns the state
  to render.
- `npm run test:e2e:focus` (new): every chrome region is visible, then hidden by the toggle while the
  editor, lesson and study card stay; `Escape`, `⌘.` and the pill each leave it; the choice survives a
  reload; and opening a lesson wrote exactly one sitting naming that lesson.
- `npm run test:workbench` now runs **26 suites**; `docs/PILOT.md`'s `active_minutes` row says it is
  measured and where the numbers come from.

## [2026-10-21] — Run 151: Review Cards — a Highlight Asked Back on a Real Schedule

Notes answered "what did I write down". This run answers the next question — *when do I read it again* —
by turning every commented highlight into a flashcard and scheduling it with **FSRS-5**, the published
algorithm, not a hand-rolled interval doubling.

**The algorithm is the published one, with its sources in the file.** [`app/src/fsrs.ts`](app/src/fsrs.ts)
carries the FSRS-5 default weights `w0`–`w18` exactly as the algorithm wiki publishes them, the
initial-stability and initial-difficulty formulas, the mean-reverting difficulty update, the forgetting
curve (`DECAY = -0.5`, `FACTOR = 19/81`, which makes `R(S, S) = 0.9` an identity rather than a
tuning), stability after a successful recall including the Hard penalty and Easy bonus, stability after
a lapse, the same-day branch, and the interval for a 90% desired retention. Two departures are stated
where they happen: the weights are the published defaults (there is no review history here to fit) and
the longest interval is 365 days, not the library's 36,500 — a card promised back in 2060 is a card
forgotten.

**A card's existence is derived; only its schedule is stored.** [`app/src/studyCards.ts`](app/src/studyCards.ts)
joins the notes store to a small schedule map on every read, so a card is exactly "a highlight with a
comment": deleting the highlight deletes the card, re-pinning the same passage keeps its progress
(the id is lesson + quote), and clearing the comment retires the card and prunes its schedule on the
next sync. Retiring one needed a new door in the notes store — `setComment` — because `addHighlight`
deliberately refuses a blank overwrite, and that rule is right for pinning but wrong for a learner who
has decided a passage is not a question after all.

**The panel asks, then reveals, then takes one of four answers.** [`app/src/components/StudyPanel.tsx`](app/src/components/StudyPanel.tsx)
gains a **Review (N due)** button that draws on the whole course's deck, a card that shows the quote
before the comment, the four FSRS ratings (Again/Hard/Good/Easy) only after *Show answer*, and a
sentence afterwards saying when the card comes back (`Rated · back in 6 days`).

**The deck travels with the backup and merges by how much was learned.** `study-cards.json` joins the
archive; a restore keeps the schedule that has been answered more (`reps`, tie broken by the later
review), so restoring an old file cannot un-learn a card. A backup taken before cards existed has no
such file — that is silent, not a skipped file.

- `npm run test:review` (**29 checks**, new): the `R(S,S) = 0.9` identity and interval = stability, the
grade ordering of both initial values, difficulty clamped over 40 reviews from both extremes, Easy >
Good > Hard, a late answer teaching more than an early one, a lapse shortening stability while a
success lengthens it, the same-day nudge, the 365-day cap, purity, and the card join: only commented
highlights, stable ids across re-pins, retirement by deletion *and* by clearing the comment, ordering
by due date, the merge rules, corrupt stores, and blocked storage never throwing.
- `npm run test:e2e:review` (new): a real DOM selection of the lesson heading, pinned through the real
  button, commented, then asked back through the deck — the answer hidden before *Show answer*, four
  ratings after it, `Good` writing `reps = 1` and a due date three days out, the reload keeping it, and
  clearing the comment retiring the card.
- `npm run test:backup` grows to **20 checks**: the deck file, its count in the manifest, a restore
  keeping the more-reviewed schedule and refusing to move a studied card backwards, and an older
  backup without the deck still restoring. The cap measurement now includes the deck: **~2.0 M
  characters, ~4.0 MB of the 5 MB bucket** — 80% of the bucket, which is what makes IndexedDB a
  decision rather than a someday.
- `npm run test:workbench` runs both new suites, so CI covers them on one dev server.

## [2026-10-21] — Run 150: The Study Layer Begins — Notes and Highlights

The gap page's largest *missing* block is the study layer, and it starts where the work is actually
lost: what the learner wrote down. Every lesson now has a **Study** card under the editor — a note box
that saves as they type, and **Pin selected text**, which keeps a passage (or a line of their own code)
with an optional comment. It is the one artifact a course cannot regenerate by pressing Run.

**One store, two shapes.** [`app/src/studyNotes.ts`](app/src/studyNotes.ts): a note per lesson
(whitespace-trimmed, capped at 4,000 characters, cleared by emptying the box — so "no note" is one
state rather than two) and highlights whose identity is the quoted passage, so pinning the same text
twice updates the comment instead of adding a duplicate row. A selection is collapsed to a single line
before it is stored, a comment is capped at a margin note's length, and the store is bounded like every
other one: 20 highlights per lesson, 25 lessons, least-recently-written evicted.

**It rides in the backup and merges like drafts.** `study.json` joins the archive (the manifest counts
notes and highlights, the README explains the file, the restore summary names what arrived), and a
restore never deletes: a note written on this machine wins and an empty one is filled from the file,
highlights union by quote, and an older file cannot erase a newer comment. `npm run test:backup`
re-measures the caps of all six stores: **~1.7 M characters, ~3.4 MB of the 5 MB bucket** — the study
store took most of the previous slack, which is now written down rather than discovered later.

**Two failures found and fixed while building it.** A note typed and then followed by a lesson switch
inside the 500 ms debounce was lost — the write now happens in the effect that leaves the lesson, under
the id the text was typed against, not the id the panel has just been given. And React's development
double-mount was calling the mount as an edit: the panel wrote its own empty box over a saved note, so
a note looked fine until the page reloaded and came back blank. Writes now happen only after a real
keystroke, which is a distinction the browser test proves — it types, pins, reloads, and finds both.

- `npm run test:study` (**20 checks**, new): notes stored and re-read with their line breaks, cleared to
  nothing by an empty box, capped; quotes collapsed and capped; the same passage pinned twice updating
  in place and keeping its first timestamp; a blank comment not erasing a written one; per-lesson and
  per-store eviction; corrupt, foreign, blocked and over-quota storage never throwing into the render;
  and the four merge rules a restore depends on.
- `npm run test:backup` grows to **18 checks**: `study.json` in the bundle and its counts, a restore
  that brings a lesson's highlights in while the note written here wins, and the caps re-measured.
- `npm run test:e2e` gains the browser check: a note typed into the panel reaches the store on pause, a
  selected line of code becomes a highlight, and after a reload both are still on screen.
- `docs/PLAN-2.0-GAP.md`: the study-layer row moves to **partial** with what ships and what does not
  (flashcards, focus mode, measured time), and the next list leads with the rest of that layer.
  `app/README.md` and `docs/VERIFICATION.md` describe the store, the panel, the backup and the checks.

## [2026-10-21] — Run 149: Hover and Signatures from the Same Jedi

The plan's next item was "hover and signature help on the same Jedi", and it cost no new download:
`jedi.Script.help` and `get_signatures` were already inside the wheel the completion list installs.
What it needed was a renderer, a rule for *where* to ask, and a way to ask without queueing behind
the learner's own program.

**Hover asks about the dotted name, not the word.** `math.acos` is one token, so a card opened over
`acos` describes `math.acos` with the position Jedi resolves (the end of the name). The card shows
the definition line (`def acos`), the call and the docstring's first paragraph. A constant shows
`pi: Final[float]` and **no** docstring: Jedi answers `math.pi` with `float()`'s "Convert a string or
number to a floating-point number", which is its *type's* documentation and the wrong answer to the
question the learner asked, so the worker drops the doc for a `statement` and keeps the definition
line.

**Signature help is the call the cursor is inside.** `callContext` walks back to the unmatched `(`,
masking strings and comments first so `print("(")` does not open a call at the string's bracket,
and counts top-level commas so `gain(2, gain(1, |` describes the inner call and underlines its second
argument. `splitSignature` cuts the label at top-level commas too, which is what makes the mark land
on `x` in `gain(k, x, scale=1.0)` and not on `x, scale=1.0`; an argument that is itself a call
(`f(g(1, 2), 3)`) does not split inside the inner one. Closing the paren, moving the cursor away or
starting a run closes the card.

**Both are safe in the ways the rest of the analysis path is.** A stale reply is dropped rather than
shown one keystroke late (the document is compared before the card is built), a hover with nothing
to say returns `ok: true, value: null` instead of a failure, and every card is drawn with
`textContent` - a docstring is third-party text and a tooltip is not a place to interpret it. The
request gate also tightened: `getReadyAnalysis` now refuses while a run is in flight, so a hover or a
completion can no longer sit in the worker's queue behind `while True:` and answer text nobody is
looking at.

Two defects found while building it, both fixed: the worker's Python helpers arrive through a JS
template literal, where `"\n"` is a real newline (the signature helper's `code.split("\n")` broke the
whole analysis module in Pyodide, and pyflakes' strip said the checker could not load); and a failed
analysis install left no trace for a maintainer, so it now logs the full error to the console while
the page keeps its one sentence.

- `npm run test:analysis` grows from 16 checks to **32**: the hover sanitiser and its safe defaults,
  the first-paragraph rule, a signature index that names a real parameter, the top-level-comma split
  (annotations, nesting, nothing to mark), the call under the cursor (innermost call, `[`/`{` are not
  calls, brackets in strings and comments, multi-line calls, a closed call), the dotted name under the
  pointer, and the hover/signature transport cases (a null answer is an answer; an unavailable one is
  not).
- `npm run test:runtime` grows from 11 checks to **16** in real Chromium: a real pointer moved onto
  `math.acos` opens the card with `def acos`, the call and the docstring, and it closes when the
  pointer leaves; typing `math.acos(` shows the signature with `x` marked as the active argument, and
typing `)` takes it away.
- `docs/PLAN-2.0-GAP.md`: the editor row keeps its Ruff note but now records hover and signatures as
  shipping, and the next list leads with the study layer, then IndexedDB, then parsed tracebacks
  (which replaces the hover item and names the file the matcher should read).
- `app/README.md`, `docs/VERIFICATION.md` and the workbench suite index describe the two cards and
  their checks; the styles for both cards live in `app/src/editor/theme.ts`, so light mode is not a
  second tooltip.

## [2026-10-21] — Run 148: The Editor Knows Python

The gap page's editor row was the plan's hardest ask - "Jedi completions/hover, Ruff lint + format" -
and half of it was answered wrong before it was written: **Ruff is a Rust binary and cannot run
anywhere in Pyodide.** What can run there is the same thing Ruff replaces, so that is what shipped:
Jedi answers completions and pyflakes answers the lint, both inside the interpreter that is already
loaded.

**Completions with the module kept.** `math.` offers `acos` with its signature (`acos(x:
SupportsFloat, /) -> float`) and the docstring beside it, and picking one replaces only the text after
the dot - `math.ac` becomes `math.acos`, never `acos`. That insertion point is computed in
[`app/src/analysisClient.ts`](app/src/analysisClient.ts) rather than taken from CodeMirror's word
match, which is the difference between a completion that works and one that eats the module name. The
keyword source the editor shipped with stays as the fallback for the three normal cases: the runtime
is still downloading, the analyzers were never installed, or the worker did not answer in time.

**A lint a learner can act on.** pyflakes answers structurally - line, column, message - instead of
being parsed out of its own prose report, so an unused import reads `line 1 · 'os' imported but
unused` in a Checker strip under the editor, and the strip disappears when the import is used. Only
the learner's own text is checked: a lesson's starter is the scaffold the lesson ships, and notes
about it would read as the app complaining about its own exercise.

**Installed on first use, not at boot.** `micropip` pulls Jedi and pyflakes (~1.5 MB) the first time
something is analysed, so a learner who never edits pays nothing and the first Run waits only for the
interpreter. If the install cannot happen - a first visit with no network - the completion source
falls back to keywords and the strip says the checker could not load, instead of showing an empty
list as if nothing were wrong. That is the one place this phase is weaker than the offline story: the
wheels come from PyPI, and only Pyodide's own CDN is in the service worker's cache.

The two features share one worker with runs, which is the part that could break a lesson. Answers
carry a request id and no run id, the session claims them before the run's own `onmessage` handler
sees them, a request that is never answered resolves as unavailable after eight seconds, and a late
answer to a dropped request is consumed rather than resolved twice. A `Reset Runtime` therefore
cannot strand a pending completion.

- `npm run test:analysis` (16 checks): the dotted insertion point, Jedi's 1-based-line/0-based-column
  pair, Jedi type to completion type, docstring to detail/info, which notes are drawable and how one
  reads, plus the transport cases - two answers that must not cross, a run outcome that must not be
  claimed, a timeout, a failed install, a cancelled request, and a worker that throws on post.
- `npm run test:runtime` grows from 7 checks to 11 in the real browser: `math.` completes to `acos`
  with its signature, typing `aco` filters and Enter produces `math.acos`, an unused import is named
  on line 1 and the note clears when the import is used, and a Run still works afterwards.
- Workbench suites: 21, was 20, all green; `test:offline` and `test:theme:e2e` unchanged and green.
- `docs/PLAN-2.0-GAP.md`: the editor row moves to **partial** with the Ruff reason recorded, and the
  next list now leads with hover and signature help on the same Jedi, then the study layer.
  `app/README.md` and `docs/VERIFICATION.md` describe the analysis path and its checks.

---

## [2026-10-21] — Run 147: The Backup, and What a Restore May Not Do

The gap page's persistence item had two halves. The second now ships: one press in the header writes
every store a learner's work lives in as a single `.zip`, and a restore merges it back. The first half —
IndexedDB — is deliberately not built, and this run is where that decision got a number: the caps bound
the five stores at ~1.2 M characters (~2.4 MB of the 5 MB bucket), so the move is not earned by size.

**The archive.** [`app/src/backupZip.ts`](app/src/backupZip.ts) writes and reads a stored-method zip by
hand - CRC-32, local headers, central directory, end record - because the payload is JSON and code text
and a stored archive needs no dependency, no worker and no async decompressor. `manifest.json` carries
the counts and the date, `README.txt` still explains the file years later, and the reader distinguishes
the three ways a chosen file fails: not a zip, a download that stopped short, and a zip a tool
re-compressed after it was unzipped (macOS Archive Utility does that by default, and a learner who
unzips and re-zips has done nothing wrong).

**The merge, which is the part that had to be right.** [`app/src/backupBundle.ts`](app/src/backupBundle.ts)
restores by merging: flags union, drafts fill only lessons this browser has no text for, versions union
by the timestamp they were filed at, and log events dedupe by identity - the same rule cloud sync uses,
because two merges that disagree about what one event is would eventually double a learner's log. Every
write goes through the store's own writer, so the caps and the eviction order still hold.

That exposed a real bug in the first design. Replaying versions through `recordSnapshot` files them in
arrival order, which is right for a Run and wrong for a replay: an *older* arriving version lands on top
of a newer local one and then evicts it. `mergeHistory`
([`app/src/draftHistory.ts`](app/src/draftHistory.ts)) orders by timestamp itself, dedupes by timestamp
plus text, and applies both caps - and the suite pins the case rather than the intent.

**Without a reload.** The restore writes the stores, not React's copy of them, so `BackupControls`
dispatches `mechalab:store-restored` and `App` re-reads the three maps: the tick returns on screen and
the learner keeps their tab and unsaved editor text. A toast reports exactly what changed (`Restored · 1
milestone · 1 draft · 1 log event`) or says the file has nothing new.

- `npm run test:backup` (17 checks): the published CRC vector, a round trip that returns every byte of
  an empty file and a non-ASCII name, the three refusals, the manifest counts, and every merge rule -
  including restoring the same file twice adding nothing, and the measured ceiling computed from the
exported caps rather than a comment in a doc.
- `npm run test:e2e:backup`: the header button in Chromium writes a 2.8 kB archive the app reads back,
  `localStorage` is cleared, and the restore brings back the milestone (without a reload), the draft
  (opened in P.3's editor) and the log event; a text file renamed `.zip` is refused and changes nothing.
- Workbench suites: 20, was 18, all green on one dev server and one built bundle.
- `docs/PLAN-2.0-GAP.md`: the persistence row records the backup as shipped and the ~2.4 MB measurement;
  the next list now leads with Jedi/Ruff, with IndexedDB after it. `app/README.md` gains a Backup
  section and the two new checks; `docs/VERIFICATION.md` explains what the format suite asserts.

---

## [2026-10-21] — Run 146: Take This Step Offline

The cache was warm by accident: a learner who had used the workbench was offline-ready, and one who
had not had no way to ask. The gap page's last offline item was a button that says "take this step"
and reports what it cost. It is now in the runtime strip.

**One press, and a measured answer.** [`app/src/offlineTakeAlong.ts`](app/src/offlineTakeAlong.ts) reads
this document's own `<script>` and `<link>` tags - the hashed bundle names change every deploy, so a
manifest list is the one thing that would go stale - and sends them to the worker. `sw.js` gains a
`message` handler that caches each URL with `cache: 'reload'` and replies with entries and bytes; the
worker never intercepts its own fetches, so each response is put into the cache explicitly, which is
also what makes the count possible. The runtime is then loaded if it is not up, and every `mechalab-*`
cache is measured. The button reads `Offline ready · 8.0 MB · 16 files`.

Two honesty rules: the interpreter's own files are required before the button says **ready** (a cached
shell that cannot run Python is a half answer, shown as `Take Python offline`), and a host that sends
its own isolation headers has no worker to ask, so it says `Offline: built site only` rather than claim
a cache it cannot build. The size is the transfer size served, not the decoded size on disk, and says so.

- `npm run test:takealong` (9 checks): the URL list (own origin only, prefetch excluded, duplicates and
malformed hrefs dropped), the size wording, and that a shell-only inventory never reads as ready.
- `npm run test:offline` now **starts from the button**: no lesson run first, press it, read the size,
find `pyodide.mjs` and the wasm in the cache, then go offline - reload, deep link, and a lesson run to
`BEHAVIOR FAILED` from the cache (8.0 MB, 16 files, 5 runtime files). It also uses the other suites'
Chromium resolver, so a machine with a system Chrome and no Playwright download can run it.
- `npm run test:theme:e2e` still passes with the new strip control: 24 tab/theme pairs, lowest text run
4.52:1. Both that suite and `test:offline` now use the other suites' Chromium resolver, so a machine
with a system Chrome and no Playwright download can run them (`resolveChromiumExecutable`).
- `docs/PLAN-2.0-GAP.md`: the offline row names the button; the next item is IndexedDB + backup zip.

---

## [2026-10-21] — Run 145: Read the Scope, and Compare Two Runs

The Scope drew the learner's own `scope.stream()` traces and then stopped there: no cursor, no zoom,
and one run on screen at a time, so the only way to see what changing `Kp` did was to remember the
old curve. It is now a scope you can read and compare.

**A cursor that reads every trace at one `t`.** `sampleAt` interpolates between the two samples around
the pointer (order-independent, `null` outside a trace's own span, never the nearest sample dressed up
as an answer), and the readout names each signal's value at that time. The arrow keys move the same
cursor when the canvas has focus, so nothing here is mouse-only.

**A time axis you can move.** Wheel zooms about the pointer, `Zoom +/−` about the middle of the view,
drag pans, `Fit`/`0` returns to the whole trace, and every window is clamped to the data and to a
1/1000-of-the-trace floor - the axis cannot end up in empty space a learner cannot scroll back from.
The y axis follows the visible window (`scopeBoundsIn`), because keeping the full trace's height while
zoomed into one edge leaves a flat line in the middle of the plot.

**An A/B overlay.** **Pin as A** keeps a run's traces on the axes; the next run draws over it as B,
dashed and lighter, with both in the legend and both read by the cursor at one `t`. That is the plan's
acceptance, and it is what a parameter change is: one `t`, two values.

- `npm run test:scope` grows from 14 checks to 25: exact and interpolated sampling, an out-of-order
trace, a series that ends earlier, zoom anchoring and clamping, the zoom floor, pan clamping at both
edges, and a y range that follows the window.
- Browser step 7h-i/7h-ii: point at the plot and read a value, move the cursor with `ArrowRight`,
narrow the axis with **Zoom +**, restore it with **Fit**, pin the run, double the trace, run again, and
read both values at the same `t` (asserting B is about twice A) before clearing A.
- `docs/PLAN-2.0-GAP.md`: the Scope row moves to **ships**; the next item is the offline "download this
step" button.

---

## [2026-10-21] — Run 144: The Check Names Its Hint

A failed run used to say *what* was red (behavioural or presentation) in one place, and offer the hint
ladder as an unrelated panel 400 px below it. The learner had to work out which of the two nudge
sentences answered the red line. Now the failing check names the rung that answers it.

**One card per failed check.** [`app/src/checkHints.ts`](app/src/checkHints.ts) turns the run's verdict
into the checks it left unproven, each with its own line and its own button:

| Check | What the card prints | Rung it names |
| :--- | :--- | :--- |
| Behavioural | the instructor's assertion sentence, `AssertionError:` stripped - expected value and got value | Hint 1 |
| Presentation | the output line that first differs from the Expected Output | Hint 1 |

Only those two open a card. A harness metric, a `SyntaxError` and a stopped loop keep the cards they
already had, because none of them is a graded check failing on a value - pointing any of them at a hint
would be guessing.

**And it opens one rung, never the ladder.** The button opens rung 1 and stops; the rung is then marked
*for the failing check* where the hint is read. Rung 2 is the formula or code block - on several lessons
it is nearly the full fix - so it is no longer unlocked by the run that was already on screen when the
nudge was opened. It waits for one attempt made *after* the nudge
(`hintLock`), for a check's card and for the ladder's own button alike.

- `npm run test:checkhints` (15 checks): the assertion line against a bare message and a full traceback,
the mismatch line number, the five verdicts that must not open a card, the gate's three states, and a
sweep of all 42 registry entries asserting each names rung 1 and never the block.
- Browser step 0a-i: the P.1 card names the behavioural check and Hint 1; opening it marks the rung,
leaves `btn-reveal-hint` disabled and reading **Run again to unlock Hint 2**, and puts exactly one rung
on screen. Step 0b then asserts the last rung leaves no control that opens another. Step 10a does the
same for the presentation card on 03.1, where the behaviour passes and only the table padding is wrong.
- `docs/PLAN-2.0-GAP.md`: the hint row moves from **partial** to **ships**; the next item is the Scope's
cursors and A/B overlay.

---

## [2026-10-21] — Run 143: A Lesson on a Plane

Run 142 could open the workbench offline but not run anything: Pyodide was loaded inside a **blob-URL**
worker, and a service worker does not control blob workers, so those CDN fetches never reached the cache.
The fix was structural, not an extra rule in `sw.js`.

**The worker is a real module file.** The 510-line source string that lived at the top of
[`TabPyodideRunner.tsx`](app/src/components/tabs/TabPyodideRunner.tsx) moved, verbatim, to
[`app/src/runtime/pythonWorker.js`](app/src/runtime/pythonWorker.js), and the page constructs it as

```js
new Worker(new URL('../../runtime/pythonWorker.js', import.meta.url), { type: 'module' });
```

A worker served from this origin is in the service worker's scope, so every request it makes is
cacheable. The blob URL, its `revokeObjectURL` bookkeeping and the string-within-a-string that made the
worker's own escapes easy to get wrong (run 141 lost an afternoon to exactly that) are gone.

**And it loads the ESM build.** A module worker has no `importScripts`, so the loader became
`await import(cdnUrl + 'pyodide.mjs')` - an ordinary request of a controlled client, which is what
`sw.js` now caches under `mechalab-pyodide-v1`, alongside the wasm binary, the stdlib zip and any wheel a
lesson imports. The protocol is untouched: `init`/`warm`/`run`/`stop` in; `status`/`scope`/`stdin-request`/
`result` out, the interrupt word, the stdin buffer and the scope batches all as they were.

| still true after the move | proof |
| :--- | :--- |
| Stop interrupts in place, the session survives | `npm run test:runtime` - stopped a `while True:` in 288 ms, same boot id afterwards |
| `input()` blocks the worker, not the page | same suite, round-trip |
| every lesson verifies on the built bundle | `npm run test:e2e:pages`, 50 exercises plus the ramp |
| the Scope still receives traces | `npm run test:e2e` step 7h |
| the workbench opens offline | `npm run test:offline`, reload + deep link |

**New this run: the offline suite runs Python.** After one online run it asserts the cache holds
`pyodide.mjs` and a `.wasm` file (5 files), then takes the browser offline, reloads, and runs the same
lesson to **the same verdict**, with the output checked against the CDN-failure text so a silent fallback
cannot pass. That is the difference between offline reading and the plan's "on a plane" claim.

---

## [2026-10-21] — Run 142: The Workbench, Offline

GitHub Pages could not send the isolation headers, and it could not keep the site working on a plane.
One worker did the first job; the plan's Phase 8 asked for the second. A page can only be controlled by
**one** service worker, so the two jobs had to become one file: [`app/public/sw.js`](app/public/sw.js)
replaces `coi-serviceworker.js` and does both.

| job | how |
| :--- | :--- |
| isolation without host headers | re-issues every **same-origin** response with `COOP: same-origin` + `COEP: require-corp` (third-party responses are left alone - only the top-level document decides isolation) |
| shell | precached on install (`./`, `index.html`, the manifest, the favicon), network-first on navigation so a deploy lands on the next load, cached document as the offline fallback |
| assets | cache-first with a background refresh, which is what makes a repeat visit instant |
| deep links | any navigation offline gets the cached shell, so `?lesson=P.4` opens its lesson from a URL the cache never saw |

The page half stays in the same file and still registers only when `crossOriginIsolated` is false, so the
dev server never has a worker between HMR and the page - the reason the old script was conditional is
still true.

**What it does not do, and says so.** Pyodide is loaded inside a blob-URL worker, and a service worker
does not control blob workers, so its CDN fetches never reach the cache. Offline **reading** ships -
reload, the lesson list, a deep link, all isolated. Offline **running** needs the worker moved to a real
module URL, which is the next slice and is written down in [`docs/PLAN-2.0-GAP.md`](docs/PLAN-2.0-GAP.md)
rather than implied.

**Measured.** `npm run test:offline` serves the built bundle **without** the header pair - the way Pages
does - and asserts, in order: the worker takes control and the document reloads isolated; the shell,
manifest and 5 built assets are in `mechalab-shell-v1` / `mechalab-assets-v1`; then it takes the browser
offline and asserts a reload paints the workbench with the tab rail and the lesson list, that the cached
document still carries the isolation pair, and that `?lesson=P.4` opens *Ordered Lists and Repeating
Actions* from the cache. `test:e2e:pages` still passes against the same bundle (its server sends the
headers, so the worker correctly does nothing).

---

## [2026-10-21] — Run 141: The Loop Draws Itself

A control lesson could only ask a learner to imagine the curve: forty printed numbers, and "does it
overshoot?" answered by eye over a terminal. The workspace plan's third item - a Scope the learner's
own code drives - was the largest missing piece of the lab, so it is the next slice.

**Python hands its samples to the panel.** Inside a run, `mechalab.scope` exists:

```python
from mechalab import scope
scope.stream("step response", ts, ys)   # lists, ranges or numpy arrays
```

The worker installs the module once per interpreter, buffers the points and posts them in batches of
500 plus one final batch **before** the run's verdict, so the curve grows while the loop runs and is
complete when the result lands. A runaway recording is capped at 20 000 points per series and labelled,
not silently truncated. Every path that ends a run goes through one `postResult()`, which is what makes
the final batch ordered before the verdict the panel is drawn beside.

**Nothing is drawn that cannot be justified.** [`app/src/scopeModel.ts`](app/src/scopeModel.ts) is a
pure module, and its rules are the edge cases a real lesson hits:

| payload | what is drawn |
| :--- | :--- |
| a NaN or an infinity from a diverging sim | the point is dropped - one bad sample would stretch the axis and flatten everything that did converge |
| `t` and `y` of different lengths | cut to the shorter, so the pairs cannot misalign |
| a flat trace (all five) | a unit of height, because a zero-height range divides by zero |
| more than 20 000 points | the **first** points and a `truncated` flag: the transient is what the learner is reading |
| no series at all | no panel, rather than an empty frame |

**Readable without colour.** [`app/src/components/ScopePanel.tsx`](app/src/components/ScopePanel.tsx)
draws one pair of axes for every trace, marks zero when the data crosses it, prints each trace's last
value beside its name, and **Show as table** renders the same run as twelve evenly spaced rows for
screen readers and for anyone who cannot separate amber from emerald. Switching to the table unmounts
the canvas, which is why `asTable` is a dependency of the draw effect - a bug the browser run caught
before this shipped: the panel came back blank.

**Measured.** `npm run test:scope` is 14 checks over the model (dropped NaN, alignment, unnamed
series, the cap and its flag, refusal of a non-list payload, scalars and typed arrays, shared bounds,
the flat-trace widening, the last-value legend, number formatting, table sampling, short-series
dashes). Browser step 7h runs a real lesson that imports `mechalab`, waits for the legend, and then
reads the canvas back: the trace must have **ink** (4.6% of pixels on a 926x400 canvas), the table's
last row must carry the settling value `0.9815`, and returning from the table must repaint.

---

## [2026-10-21] — Run 140: The Version Behind the Draft

Run 136 made the draft survive the tab. One text is not a history: a learner who tuned `Kp` until the
checks passed, changed one line, and ran again kept only the broken version, and "it worked before I
touched that" was a memory rather than a button.

**Every run files what it started from.** [`app/src/draftHistory.ts`](app/src/draftHistory.ts) records
the editor's text at the moment Run is pressed, with the verdict that run got, and the lesson header
grows a **History** button that lists the last five attempts with `just now` / `3 min ago` and
`passed` / `checks failed` / `output mismatch` / `stopped`. **Restore** puts that version back in the
editor and clears the badges, because they described the text that was just replaced.

| rule | why |
| :--- | :--- |
| snapshots on Run, never on typing | the unit worth restoring is an attempt; a per-keystroke history is unreadable and would fill the bucket |
| the same text run twice is one version carrying the newer verdict | pressing Run three times on a failing line must not bury the version that worked |
| the untouched starter is never filed | Reset Starter already restores it, so filing it would spend the bucket on the lesson's own text |
| 5 versions per lesson, 12 KB per version, 120 KB total | it shares the same 5 MB `localStorage` bucket as drafts and progress; over budget, the **oldest attempt anywhere** goes first |

Read and written in `draftHistory.ts`'s own idiom - one JSON key, never throwing when storage is
blocked, rejecting a store an older version wrote rather than guessing at it - so private mode loses
history and keeps the editor.

**Measured.** `npm run test:history` is 11 checks: filed with verdict and time, starter refused, the
dedupe rule, newest-first with the sixth attempt evicting the first, per-lesson isolation, the
per-snapshot cap, a store over budget losing its oldest attempt anywhere, a corrupt/truncated/foreign
store reading as the entries it can prove, blocked and absent storage, and the age and verdict
wording (including a clock that moved backwards). Browser step 7g runs P.4 to `checks failed`, opens
History, finds that verdict filed, types a worse edit, and restores the filed version into the editor.

---

## [2026-10-21] — Run 139: Tried Is Not Opened

Run 138 taught the card how much of a lesson was *written*. The roadmap still could not tell a starter
that had been **run and failed** from one **read and left**, because every lesson the learner had not
verified looked the same: `opened, not verified yet`. Those are opposite facts about a learner's
afternoon - one says come back and fix the failing check, the other says there is nothing here yet -
and the app already recorded both, in the learning log it exports and the friction report reads.

**One fold over the log, one vocabulary.** [`app/src/learningLog.ts`](app/src/learningLog.ts) gains
`attemptsByLesson()`: a pure fold of the events the runner already writes, giving each lesson its
`opens`, its `runs`, and the last run's outcome and failure line. No new storage key, no new event -
the facts were already on disk, unread.

| what the learner did | the card says | the step chip |
| :--- | :--- | :--- |
| nothing | `not opened yet` | `○ P.7`, "not opened here yet" |
| opened, left without running | `opened, never run` | `○ P.7`, "opened here, never run" |
| wrote something, never ran it | `edited, never run` | `○ P.7` |
| ran it, checks failed | `tried twice, not passed yet` | `● P.4`, amber |
| passed the checks | `executed and passed` | `✓ P.4`, emerald (unchanged) |

**Why the edit count survives.** "Edited, never run" is not the log's fact - it comes from the draft,
which knows the starter changed - so it keeps its place above the log's answer: a learner who has
written half a program and has not pressed Run needs "run it" far more than "open it again".

**Read once per tab, not per keystroke.** `App.tsx` folds the log in a `useMemo` keyed on the visible
tab, so opening the roadmap parses it and typing in the editor does not. The parsed map is passed down
as `lessonAttempts`, and the step chips read it only to choose between four states they already
rendered as one.

**Measured.** `npm run test:resume` is 19 checks, four of them new - the fold counts opens and runs
separately, keeps the last outcome and its failure line, ignores events with no lesson, and returns
`{}` for an empty log rather than a fabricated entry. Browser step 7f now runs P.4 expecting the
failure, then asserts the card says `tried once, not passed yet` **and** that the roadmap chips read
`data-state="tried"` for P.4 beside `data-state="passed"` for the verified P.6. `npm run test:e2e`
passes, `check_all.py` 28/28.

---

## [2026-10-21] — Run 138: Every Marked Step Is Countable

Run 137's denominator was honest and partial: P.4 marks two TODOs, only one of which had a placeholder
to compare, so the card said **1 of 1** under a guide that promised two lines. The measure skipped what
it could not compare instead of learning to compare it, and a learner reading the pair of numbers would
rightly wonder which one was wrong.

**Two kinds of hole, two rules, one parser.** [`app/src/lessonCoach.ts`](app/src/lessonCoach.ts) now
parses a starter's holes once, in `starterHoles()`:

| hole | probe | counted when |
| :--- | :--- | :--- |
| placeholder (`# TODO 1:` over `safe_cmd = cmd`) | that code, up to the first blank line | it changed, compared after whitespace squeeze, so re-indenting or moving the answer still counts |
| insertion (`# TODO 2:` over nothing at all) | none - the marker is an insertion point | **any** code appears directly under the marker |
| exercise raise | the `raise NotImplementedError(...)` line | it is gone |

The insertion rule is bounded by the first blank line after the marker, which is why it cannot be fooled
by typing elsewhere in the file: appending `print("a thought")` to the end of P.4 still counts **zero**
steps, exactly as it should.

**One number, not two.** `coachForLesson()` takes its `holeCount` and its first hole from that same
parse, so the guide's "leaves 2 TODO lines" and the card's "1 of 2 TODO lines written" are the same
two lines by construction. The old separate TODO and raise counters are gone, and with them the last
place where two surfaces could derive the same fact twice. Fifteen of the 92 entries now print a
different count than before - packages whose raises carry a computed message, and one whose starter
quotes none - because the parser counts what is actually marked rather than what a narrower regex
recognised.

**The smoke gate caught the parser's own gap.** 03.3 writes `# TODO 1:` on a line of its own and puts
its four steps in a numbered comment list under it, so the new parse gave that hole an empty label and
the guide fell back to "the first marked line in the starter" - the assertion that every entry names
its own first hole failed exactly where it should have. A numbered `# 1. ...` list is now folded into
the marker's sentence like an indented continuation is, and the guide names 03.3's four real steps.

**And the label that parse exposed.** An exercise's `track` is `modules`, so the card and the palette
both printed **Track MODULES** - a track no page teaches. `trackLabel()` now says `Graded exercises`
for a package and `Track 02` for a page whose directory carries more than the number
(`02-mechanics-kinematics-dynamics`), which the palette had been printing whole.

**Measured.** `npm run test:draft` is 17 checks, two of them new: every entry's card total must equal
its guide count (a sweep over all 92), and an insertion hole must count when typed under and stop
counting when only the surrounding file is edited. Step 7e of the browser suite now expects
`1 of 2 TODO lines written`. `test:workbench` 14/14, `check_all.py` 28/28.

---

## [2026-10-21] — Run 137: The Card Counts the Steps, Not the Lines

Run 136's card answered "how close is this to passing?" with **6 lines changed** - mechanically true,
and useless. A learner who appended one comment read as progress; a learner who wrote one step of two
read as six lines. Both are the diff, and neither is the work.

**The starter already knows its steps, so the card counts them.** `draftProgress()` in
[`app/src/lessonCoach.ts`](app/src/lessonCoach.ts) reuses the markers the guide has always counted, in
one definition of a hole:

| starter | probe | filled when |
| :--- | :--- | :--- |
| a `# TODO n:` lesson | the code directly under the marker, up to the first blank line (`safe_cmd = cmd`) | that code is no longer in the draft, compared after whitespace squeeze so re-indenting or moving the answer still counts |
| a graded exercise | the `raise NotImplementedError(...)` line, which is marker and placeholder at once | the raise is gone |
| a TODO with no placeholder under it | nothing to compare | never - it is left out of the denominator rather than guessed at |

The card now reads `Your unfinished edit is still here · 1 of 1 TODO line written · 2 lines changed`
(exercises: `1 of 4 NotImplementedError holes filled`). The raw diff stays beside it as detail; the
step count is the answer.

**What it does not claim.** This is a text measure: writing every marked step is necessary and not
sufficient, because the instructor's behavioural checks still have to run and agree. The card says how
much is written, never that it passes - the runner remains the only thing that can say that.

**Guarded.** Five more checks in [`scripts/test_lesson_draft.mjs`](scripts/test_lesson_draft.mjs)
(15 in all): an untouched starter is `0 of N`, replacing the first placeholder counts exactly one,
**appending unrelated code counts zero** - the precise case run 136 got wrong - a filled exercise raise
counts one and leaves the denominator alone, and a starter with no markers answers `0 / 0` instead of
inventing a total. `lessonCoach`'s registry import became type-only with a `.ts` extension so the
measure is testable in Node. Step **7e** of the browser suite now writes P.4's `TODO 1` and asserts the
card says `1 of 1 TODO line written`.

Measured on the run: `test:draft` 15/15, `test:workbench` 14/14, `check_all.py` 28/28.

---

## [2026-10-21] — Run 136: The Card Knows What Is Half-Written

Run 135 taught the card which lesson to offer, and then the button opened that lesson on its starter.
The editor's text lived in React state alone, so a half-written `for` loop survived exactly as long as
the tab stayed open: a learner who looked at the roadmap to decide what was left came back to a fresh
starter. The card was naming work it had already thrown away.

**The unfinished program is kept per lesson.** [`app/src/lessonDraft.ts`](app/src/lessonDraft.ts) stores
`mechalab_drafts_v1` - lesson id to editor text - and the runner reads it wherever it used to reach for
the starter: on mount, on `selectLesson`, and when a deep link or the card opens an entry. Three rules
make it safe to leave running:

| rule | why |
| :--- | :--- |
| stored only when it differs from the starter | "no draft" means nothing was typed, not "we copied the starter" |
| written on a 400 ms pause, and once more when a lesson is left | one write per thought, and the last keystrokes before a tab switch are not the ones lost |
| `Reset Starter` is the one edit that forgets | it is the learner asking for the starter back, and `saveDraft` with the starter deletes the entry |

Bounded, because it shares a 5 MB bucket with progress, theme and the log: **12 lessons** (least
recently edited evicted, and re-editing a lesson moves it to the newest slot) and **40,000 characters**
per draft. A store written by an older version, a full bucket, private mode and a missing `localStorage`
all read as "no drafts" instead of throwing.

**And the card says it.** `App` prices the draft with `editedLines()` - added plus removed lines against
the starter, computed as a longest-common-subsequence, so one appended line costs one and not the
sixty the file happens to have - and the card prints `Your unfinished edit is still here · 3 lines
changed from the starter`. The button distinguishes the three cases it can now be in: **Continue**
(the lesson they stopped on), **Start** (a lesson after it, untouched), **Resume** (a lesson after it
that already has typing in it).

**Guarded.** [`scripts/test_lesson_draft.mjs`](scripts/test_lesson_draft.mjs) pins ten cases without a
browser - byte-exact roundtrip, a starter storing nothing, Reset forgetting, an unknown id, eviction and
the re-edit reordering, an oversized paste refused without disturbing the rest, four kinds of unreadable
store, a blocked store, the server render, and the line count itself. It joins the workbench matrix as
`test:draft` (**14 suites**). Step **7e** of [`scripts/e2e_browser_workbench.mjs`](scripts/e2e_browser_workbench.mjs)
drives the promise in Chromium: a line typed into P.4 makes the card say `1 line changed`, a plain visit
reopens that exact text instead of the starter, and Reset Starter takes the line off the card.

Measured on the run: `test:draft` 1.0 s, `test:workbench` 14/14 (e2e 98.2 s, pages 110.4 s, pairs
110.0 s, tour 106.3 s), `check_all.py` 28/28.

---

## [2026-10-21] — Run 135: "Continue" Means Forward, Not Last Opened

Run 134's card named the lesson last opened, which was right until that lesson was passed: from then on
the one screen whose job is to say *what is next* was offering **Continue P.4** for something already
executed and passed. The memory was correct; the question was the wrong one. A learner finishes a
lesson, returns to the roadmap, and is asked to do it again.

**One function now answers both questions.** `lessonOffer()` ([`app/src/lastLesson.ts`](app/src/lastLesson.ts))
takes the stored id, the registry's order and the two flag maps, and returns `{ id, reason }` or
nothing:

| offer | when |
| :--- | :--- |
| `resume` | the stored lesson is unverified - including when it is self-marked, because that is a note, not a pass |
| `next` | the stored lesson is verified: the first lesson after it that is neither verified nor self-marked |
| none | nothing remembered, an untouched first entry, or every lesson verified |

The forward search wraps once it reaches the end, so a learner who skipped something early is shown
that gap before the course is called finished. Self-marking counts on the way forward (a lesson the
learner has declared done is not what they should be sent to next) and not on the way back (they may
still want it verified) - the asymmetry is the point, and it is written down where the rule lives.

**The card says which one it is doing.** The eyebrow reads `PICK UP WHERE YOU STOPPED` or
`NEXT UNVERIFIED LESSON`, the state line `opened, not verified yet` or `not verified yet`, and the
button `Continue P.4` or `Start P.5`; `data-resume-reason` carries the same distinction for tests.

**Guarded.** [`scripts/test_last_lesson.mjs`](scripts/test_last_lesson.mjs) now pins eight cases of
the rule (nothing stored, untouched first visit, an unfinished lesson offered back, a verified one
handing forward, skipping what is done, wrapping to the earliest gap, a fully verified course, an id
the list does not hold - 15 checks in all). Step **7d** of [`scripts/e2e_browser_workbench.mjs`](scripts/e2e_browser_workbench.mjs)
drives it in Chromium: with P.4 verified the card must name **P.5**, say `next`, refuse to describe it
as passed, and offer to **Start** it - then it restores the flag map so the portfolio counts asserted
right after stay at one verified and one self-marked lesson.

No new storage key, count or screen: the card is still one card, and it now answers the question it
was meant to answer.

---

## [2026-10-21] — Run 134: The Roadmap Opens With the Lesson You Stopped On

Run 132 taught the runner to reopen the lesson the learner was on, but it only helped someone who
went straight back to the runner. The tab that answers *what is next* - the roadmap - still opened at
Step 1 of ten, so a return visit read as a fresh start with a progress bar, and "continue" was a
scroll through ten steps and a search box. The memory existed; the place a learner looks first did
not use it.

**The roadmap now leads with it.** Above the ten-step pipeline, a card names the lesson by id and
title, says what state it is in, and continues it in one click. Nothing new is stored: it reads the
same `mechalab_last_lesson_v1` the runner writes ([`app/src/lastLesson.ts`](app/src/lastLesson.ts)),
and reads it at render rather than mirroring it in state, so opening the tab shows the current lesson
and there is no second copy to go stale.

| the card says | when |
| :--- | :--- |
| `executed and passed` | the runner's own verification flag is set for that id |
| `marked complete by you` | self-marked, not verified - the two are never conflated here either |
| `opened, not verified yet` | chosen and left; the honest state of a lesson in progress |

**Hidden on a first visit, by one rule.** The runner mounts on the first entry, so \"whatever was
stored\" would open a brand-new learner with an invitation to resume a lesson they never started.
`resumeCandidate()` ([`app/src/lastLesson.ts`](app/src/lastLesson.ts)) refuses that case and only
that case: the first lesson is left to the landing page's own Start here block, which already names
it. Anything past the first entry, or a first entry that is verified or self-marked, is offered back.

**Guarded in both layers.** [`scripts/test_last_lesson.mjs`](scripts/test_last_lesson.mjs) pins the
rule without a browser (nothing stored, an untouched first visit, a used first lesson, any later
lesson - 10 checks), and step 7c of [`scripts/e2e_browser_workbench.mjs`](scripts/e2e_browser_workbench.mjs)
drives the real card: it must name **P.4** and its title, must not claim the unverified lesson is
done, and its button must open that same lesson in the editor. The title is read from the runner's
own heading (`data-testid="lesson-title"`) rather than hand-copied, so renaming a lesson cannot leave
the test asserting yesterday's words.

The card is one card, not a second progress system: it adds no key, no count and no new screen, and
the track name it prints comes from the one `trackLabel()` both the palette and the roadmap use.

---

## [2026-10-21] — Run 133: One Typeface for the Bench, and the Browser Has It

`body` asked for `font-family: Inter, ...` and nothing in the bundle was Inter. On macOS that fell
through to the system face and looked close enough; on Windows and Linux the same page rendered in
Segoe or DejaVu, so two readers of the same lesson saw two different products. The code editor
carried its own hard-coded mono stack, and the editor's slider row read
`var(--font-sans, system-ui, sans-serif)` - a token nothing defined, so its fallback was the truth.

**Both faces are self-hosted and named once.** [`src/main.tsx`](app/src/main.tsx) imports
`@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`, and
[`src/index.css`](app/src/index.css) defines `--font-sans` / `--font-mono` in an `@theme` block, which
is what gives Tailwind's `font-sans` and `font-mono` utilities the same two families and makes
`var(--font-sans)` resolve at all. `body` reads the token instead of spelling out a stack, and the
CodeMirror scroller asks for `var(--font-mono)` - so the editor's digits line up with the tables and
readouts beside them rather than being the only surface with a private font.

| | |
| :--- | :--- |
| on the wire, a Latin visit | **88 KB** (Inter 48 KB + JetBrains Mono 40 KB, weight-axis variable woff2) |
| in `dist/` | 12 subset files, 296 KB - unicode-range gated, so a Latin page fetches two |
| loading | `font-display: swap`; no blocking, no third-party request, no CDN outage |
| measured | `document.fonts.check()` true for both; exactly two woff2 requested; `body` and `.cm-scroller` resolve to the variable families |

**Guarded.** `npm run test:fonts` ([`scripts/test_fonts.mjs`](scripts/test_fonts.mjs)) fails when
an import goes missing, when a token stops naming the variable family, when a font CDN appears in
the shell or the stylesheet, and - against `dist/` - when the two Latin files are not emitted.

**No serif.** The plan this came from asks for a serif for lesson prose. The long-form reading lives
in the Markdown pages, rendered by GitHub; the workbench's own surface is an editor, a list and
tables, where a serif would be a costume rather than a reading improvement.

---

## [2026-10-21] — Run 132: The Workbench Reopens Where You Left Off

The address bar remembered a lesson (`?lesson=P.7`), and progress was stored - but the lesson itself
was not. A learner who bookmarked the plain workbench URL, or opened it from the browser's
most-visited row, was put back on **P.1** every time: on their tenth verification as much as their
first. The one thing a self-paced course has to get right is the cost of coming back.

**Where you were is now remembered, and it is one id.** [`app/src/lastLesson.ts`](app/src/lastLesson.ts)
writes the lesson on screen to `mechalab_last_lesson_v1` and reads it back, and `App` picks the
opening entry in the order the two promises imply:

| Order | Source | Meaning |
| :--- | :--- | :--- |
| 1 | `?lesson=<id>` | a deliberate link - a page's "Run this in the workbench" callout |
| 2 | `mechalab_last_lesson_v1` | the ordinary last visit |
| 3 | the registry's first entry | a genuinely new learner |

The runner records the id inside `selectLesson`, the same function that writes the address bar, so
the two cannot disagree. Unlike the address bar it records **every** selection, including the
mount-time one: that is what keeps a plain URL plain - the workbench reopens P.7 without rewriting
the address the learner typed into a deep link.

**The fallbacks are chosen, not accidental.** An id the registry does not list is never opened - it
falls back to the remembered lesson, and to P.1 only when there is none, because a broken link is not
evidence that someone wanted to start over. A store that throws (private mode, a blocked third-party
context) and a render with no storage at all both read as "nothing remembered" rather than crashing
the shell.

**Guarded.** `npm run test:resume` ([`scripts/test_last_lesson.mjs`](scripts/test_last_lesson.mjs))
pins the six behaviours without a browser - stored id, refused id, refused id not overwriting a real
one, a throwing store, no store - and the browser E2E gained the case that matters: choose P.4, visit
the plain URL, and the runner opens P.4 with the address still bare. Its unknown-`?lesson=` case was
updated to the new answer (resume, not P.1) and says why.

---

## [2026-10-21] — Run 131: A Workflow That Cannot Parse Fails Locally, Not on the Runner

The six commits of runs 129-130 went up, and the `ci.yml` run came back **`failure` in 0 s with no
jobs**. No logs, no test names, nothing that named a file: GitHub could not parse the workflow, so no
runner was ever created. Two step names carried an unquoted `: `

```yaml
- name: Check light/dark: toggle contract, and WCAG contrast on all 11 tabs in both modes
```

and YAML reads that second colon as the start of another mapping. The first of them arrived with the
seventh tab's theme work, so **every push since had been failing before it started** - and the local
gate could not have said so, because `scripts/check_all.py` re-runs the commands *inside* the job. A
workflow the runner refuses to start is a file no gate in this repository was reading.

**Quoted, first.** Both step names are now quoted strings, with the reason written above them: a
colon in a step name costs a full round trip to learn about, and it is a two-character fix.

**Then a gate that reads the workflow, not the job.** [`scripts/check_workflows.py`](scripts/check_workflows.py)
now runs first in the verify step and first in `check_all.py`, and it needs no YAML parser (PyYAML is
not a dependency of this repo, and adding one to catch a parse error would be the tail wagging the
dog). It applies the rule that was broken - in an unquoted scalar `:` is legal only when no space
follows - and it knows where that rule does *not* apply: the body of a `run: |` block is text, a
quoted value may hold any colon it likes, `check:native` is not a separator, and a `[...]` may span
lines. Alongside the colon it catches the neighbours of the same class: a tab in the indentation, a
quote that never closes, a flow collection left open, a key set twice in one mapping, a value that
starts with a reserved indicator, and a file with no `jobs:` at all.

| Where | What it costs | What it catches |
| :--- | :--- | :--- |
| the built-in scan | ~20 ms, stdlib only | the lines YAML would refuse, in every `.github/workflows/*.yml` |
| `actionlint`, when installed | ~0.1 s | the full lint: expressions, action inputs, shellcheck, and the parse itself |

`actionlint` is the second opinion, not the gate: GitHub's runners do not preinstall it, so it stays
optional and the scan is the half that has to hold everywhere. On the historical file the two find
different things - the scan reports **both** step names, `actionlint` stops at the first parse error -
which is why both run rather than one standing in for the other.

**Pinned by tests.** `tests/test_check_workflows.py` (`npm run test:workflows`) feeds the scanner the
broken line and the legal lines either side of it, and it pins the false positive that matters:
**every step of a workflow has a `name:`**, and a duplicate-key detector that cannot tell one step's
from the next step's would block every push instead of saving one. `tests/test_check_all.py` keeps
the new row and the workflow's command list equal in both directions, as it does for every gate.

**Measured.** `scripts/check_workflows.py` clean on all three shipped workflows, `actionlint` clean on
`ci.yml`, and the same script on the historical file exits 1 naming lines 175 and 182. `check_all.py`
28/28 (the new gate included), `tests/test_check_workflows.py` 14/14, `tests/test_check_all.py` 7/7.
The next push to `main` was the first since the theme commit whose five jobs actually started.

---

## [2026-10-20] — Run 130: The Lesson Opens With Its Numbers Already Tunable

Seven lesson starters now carry **14 `# @slider` parameters**, so the control and mechanics lessons
open with the values they are about already on sliders instead of asking a learner to retype a number
and re-run:

| Lesson | Sliders |
| :--- | :--- |
| 02.1 one-link FK | link length |
| 02.2 two-link FK | both link lengths |
| 02.3 two-link IK | both link lengths (the outer target sits on the reach limit at the defaults) |
| 02.4 inertia and gears | mass, gear ratio |
| 02.5 belts and fits | driver and driven tooth counts |
| 05.1 PID + anti-windup | `KP`, `KI`, `KD` |
| 05.2 complementary filter | gyro bias, `alpha` |

Each starter hoists the literals its demo already passed into named constants with a range and step,
and passes those constants into the same call. **Every default is exactly the literal it replaced**,
so the completed program still prints the page's Expected Output: filling each annotated starter from
its own reference solution and diffing stdout against the Expected Output block is 7/7 exact. The
reference solutions are deliberately left as the plain version, so **Load Solution** still shows the
canonical code rather than a second copy of the scaffold.

**Guarded, not just added.** `scripts/test_editor.mjs` now fails if any of the seven starters loses its
sliders, if a default falls outside its own range, or if a slider names a value the demo never reads -
a control wired to nothing is worse than no control. The browser E2E opens 05.1 and asserts three
range inputs (`Kp`, `Ki`, `Kd`) are mounted. `pythonLessonsData.ts` was regenerated from the pages;
`scripts/check_all.py` 27/27, `test:editor`, and the workbench suites pass.

---

## [2026-10-20] — Run 129: A Real Editor, and a Lesson That Is a Project

The runner's textarea is now **CodeMirror 6** ([`PythonEditor.tsx`](app/src/components/PythonEditor.tsx)):
Python syntax highlighting, line numbers, undo history, bracket matching and closing, in-document
search, indent with `Tab`, and completion from Python keywords plus the names the open file defines.
The colours are the app's own tokens ([`editor/theme.ts`](app/src/editor/theme.ts)), so light mode is
the same editor, not a second theme to audit. React still owns the document: edits go out through
`onChange`, an external change (another lesson, Load Solution, Reset) replaces it, and the run button
reads the state the screen shows.

**A lesson is a small project.** `main.py` is the learner's tab; a lesson whose starter, solution,
hints or tests mention `mechalab_plant` gets a second, **read-only** tab holding that plant
([`src/lessonFiles.ts`](app/src/lessonFiles.ts); 29 of the 92 entries do). The worker writes the same
text into Pyodide's filesystem, so the import resolves to what is on screen and the learner can read
the code the checks assume without being able to break it.

**A slider is a comment on a number.**

```python
Kp = 4.0   # @slider 0 20 0.1
```

puts a range control under that line; dragging **rewrites the literal in the file** and re-runs once
the drag settles (450 ms). There is no hidden parameter channel: the code on screen is the code that
runs, and the file stays ordinary Python. [`editor/sliderModel.ts`](app/src/editor/sliderModel.ts)
parses, clamps, snaps and formats (a drag inside one step dispatches nothing);
[`editor/sliderWidget.ts`](app/src/editor/sliderWidget.ts) draws it as a **state field**, because
CodeMirror refuses block decorations from a view plugin, and reuses the range input while only its
value moves so a re-render cannot abort the drag under the pointer.

**The suites follow the editor, not its markup.** Browser tests type and read through a two-method
bridge (`window.__mechalabEditors['editor-main']`,
[`scripts/editor-code.mjs`](scripts/editor-code.mjs)) instead of `.fill()`/`.inputValue()`; the Pages
sweep, which sets each package's reference solution inside one `page.evaluate`, now writes through
the same bridge. A new end-to-end scenario checks that Python is highlighted, that the plant tab is
read-only and holds the real module, and that a slider drag rewrites `4.0` to `8.0` and re-runs to
print `Kp=8.0`.

**Measured.** `scripts/test_editor.mjs` (`npm run test:editor`) covers the directive grammar, the
ignored malformed forms, clamping/snapping/formatting, and which lessons claim the helper tab; it
runs inside `npm run test:workbench`. Full matrix on the built app: 11 workbench suites (smoke,
links, theme, tokens, spine, palette, editor, e2e 66 s, Pages 71 s, pairs 79 s, tour 78 s),
`test:runtime`, `test:theme:e2e`, and `scripts/check_all.py` 27/27 - all passing, `npm run build`
clean.

---

## [2026-10-20] — Run 128: A Python You Can Stop, and ⌘K Over Everything

Two changes to the loop between typing and knowing: the runtime moved off the UI thread, and the
keyboard got one door to the whole course.

**Python runs in a dedicated Web Worker.** `TabPyodideRunner` used to own the interpreter on the
page's thread, which meant a runaway loop froze the editor, the tab strip and the Stop button with
it. The worker (`PYODIDE_WORKER_SOURCE`) loads Pyodide once, is warmed on idle so the first Run is a
warm run, and reports its measured boot so the status line can say `ready in 1.4 s` instead of
spinning.

**Stop interrupts instead of discarding.** A `SharedArrayBuffer` interrupt word handed to
`pyodide.setInterruptBuffer()` raises `KeyboardInterrupt` *inside* the running program: imports,
variables and the 10 MB runtime survive, and the Stop button answers in milliseconds rather than a
kernel restart. Where the buffer cannot exist the page falls back to terminating the worker, which
still stops the run. `input()` got the same treatment: the worker posts its prompt and waits on a
second shared word while the page shows an input box, so blocking `input()` never blocks a frame -
and Stop wakes that wait too.

**GitHub Pages can now be isolated.** Interruption needs `SharedArrayBuffer`, which needs COOP/COEP,
which a static host cannot send. `app/public/coi-serviceworker.js` (run 142 folded it into `sw.js`)
adds the pair and reloads once; `npm run dev` and `preview` send the same pair directly from
[`scripts/isolation-headers.mjs`](scripts/isolation-headers.mjs), so every browser suite runs isolated
without the service worker in the way. A blocked service worker degrades to the terminate fallback;
it never leaves a loop unstoppable.

**`⌘K` opens a palette over the whole course.** [`palette.ts`](app/src/palette.ts) holds the search
and [`paletteCatalog.ts`](app/src/paletteCatalog.ts) builds the list from the lesson registry (92
lessons and exercises) plus the rail's own tab metadata and twelve commands, so nothing is
maintained twice. Ranking is stated rather than tuned: whole-word prefix > token prefix > word start
> substring > in-order subsequence, stable inside a band - typing `P.1` opens lesson P.1, not P.10,
and a lesson's own ideas are searchable (`damping ratio` finds 00.2). The header gained a Search
button with the shortcut on it; the dialog is a real `role="dialog"` + `role="option"` list with
arrow keys, `↵`, `esc`, and a focus trap. Selecting a lesson lands on it in the runner and rewrites
`?lesson=`; "Run the lesson" bumps a nonce the runner watches, so the command works from any tab
without the palette holding a callback into an unmounted editor.

**Measured.** `scripts/test_palette.mjs` (13 checks) pins the catalogue's completeness and the
ranking order, including `P.1` vs `P.10`; it runs inside `npm run test:workbench`.
`scripts/e2e_runtime.mjs` (`npm run test:runtime`) drives the worker in Chromium: in-place Stop with
the session intact, `input()` answered mid-run, the isolation flags, and the Pages fallback. The
browser E2E suite now also opens `⌘K` with a keystroke, checks the empty catalogue is the whole
course, ranks P.1 first, opens it, and closes on Escape. Full matrix: `test:workbench`, `test:e2e`,
`test:runtime`, `test:theme:e2e`, `test:e2e:pages`, `test:tour`, `test:pairs` - all passing, with
`npm run build` clean.

---

## [2026-10-20] — Run 127: One Workbench, Two Lights

A light theme that is a real alternative rather than a filter, and a toggle that owns the page.

**Tokens replaced hexes in all eleven tabs.** `@theme inline` in [`index.css`](app/src/index.css)
registers the palette as Tailwind colours (`bg-panel`, `border-line`, `text-body`, `text-faint`,
`bg-emerald/20`, …) that resolve to the custom properties, and ~1,400 literal colour utilities were
rewritten to those names. Nothing else about a tab changed: same layout, same words, same tests.

**The choice is remembered, and still follows the OS until it is made.** The pre-paint script in
[`index.html`](app/index.html) writes `data-theme` from `localStorage` or `prefers-color-scheme`
before the bundle loads, so there is no flash; [`theme.ts`](app/src/theme.ts) is the documented rule
set (corrupt storage falls back, a blocked store never throws) and the header gained a Sun/Moon
toggle with `aria-pressed` and an honest label.

**Plots stay dark on purpose.** A canvas or chart sits on `.plot`, because its traces are literal
plot colours tuned against dark ink; light mode reads as warm paper around instrument faces.
Two token nudges came out of the audit rather than taste: dark `--dim` to #7a8aa3 (4.6:1 on the
lightest surface it labels) and light `--accent` to #0d6b64 (5.1:1 on the accent-soft chip).

**Measured, both ways.** `scripts/test_theme.mjs` (10 cases) pins storage, OS default and the
attribute; `scripts/e2e_theme.mjs` drives Chromium through the toggle contract and all eleven tabs in
both themes, compositing every text run over its real backgrounds. Result: 2,939 text runs, zero below
4.5:1, in either mode. The unit suite runs inside `npm run test:workbench`; the browser sweep is its own CI step, added
after that run went flaky with a seventh browser suite competing for the same machine.

---

## [2026-10-20] — Run 126: The Workbench Looks Like the Product It Is

The curriculum was stronger than its first screen. This run is presentation only: no lesson, count,
hour or generated block changed, and every string the smoke and browser suites assert is untouched.

**The landing screen now argues instead of describing.** [`StartHereCard.tsx`](app/src/components/StartHereCard.tsx)
is a two-column hero: the README's own Start-here words (still generated from `startHere.json`, so
the page and README cannot drift) beside `HeroArm.tsx`, a canvas running the capstone's figure-8
through two-link inverse kinematics. It pauses off-screen, draws one still frame under
`prefers-reduced-motion`, and caps at 2x device pixels. One primary button; the GitHub reading copy
is a quiet second line.

**Ten tiles became one rail.** The mode toolbar is a single segmented control with the three
counters beside it, and the tab grid - which used three rows at desktop width - is a horizontally
scrolling rail of icon + label + subtitle cards. The words are the generated ones; the rail just
stops them from pushing the editor off the first screen.

**The shell has tokens.** [`index.css`](app/src/index.css) went from 41 lines to a design system:
surfaces, ink, brand and semantic colours, a fluid type scale, `.btn`/`.chip`/`.kbd` primitives, one
visible focus ring for every interactive element, a skip link, tabular numerals, and a
reduced-motion branch that turns the animation off. The lab tabs keep their inline hexes - the same
family - so the workbench reads as one instrument without a risky rewrite of eleven simulators.

**A run started before the learner clicks.** Pyodide is ~10 MB from a CDN, and paying that inside
the first Run is what makes Run look broken. The runner now warms the worker on idle (one shared load
promise, so a click mid-download joins it) and the first click measured **116 ms** to a verdict with
the runtime already reading `Ready (Worker WASM)`; a metered or 2G connection keeps the download
until the learner actually asks. A pass now also raises a short toast with the next lesson in it,
and ⌘↵ / Ctrl+↵ runs from anywhere on the screen.

**Launch surface.** The page had `MechaLab` as its title and an empty favicon. It now ships an SVG
arm mark, a real title and description, Open Graph / Twitter cards pointing at the generated
1200x630 preview (copied to `app/public/og.png`), a theme colour, and a web manifest, so the
workbench can be installed to a home screen.

---

## [2026-10-20] — Run 125: One Command for Every Gate CI Runs

Two of the last three pushes were stopped by gates a contributor can run locally in seconds - a
stale generated `concepts` crosswalk and the term-order check reading a next-step line - and both
were found by CI instead of before the push. `scripts/check_all.py` now runs the verification
step's whole command list, in its order, as one command: 27 gates in ~12 s, with `--full` adding
the 48-package exercise sweep and the unittest discovery, `--list` naming the gates, `--only`
re-running one, and `--json` for a machine-readable report. It exits `2` on an interpreter other
than the pinned 3.12, because two gates execute module code that needs 3.10+ syntax.

The list is not a second opinion: [`tests/test_check_all.py`](tests/test_check_all.py) parses
`.github/workflows/ci.yml` as text and compares it with the script's table in both directions, so
a gate added to CI cannot be missing locally and one cannot be quietly dropped from the script to
make a pre-push run green. A failing gate keeps its own exit status, prints the tail of its output
and names the command that fixes it; that path is tested against a gate that exits 3.

[`docs/VERIFICATION.md`](docs/VERIFICATION.md) replaces its hand-typed "full local run" list with
the one command plus `--list`, and [`CONTRIBUTING.md`](CONTRIBUTING.md) makes it the pre-push step.

---

## [2026-10-20] — Run 124: The First Ten Seconds, and a Harness That Was 150x the Cost of the Work

**The ramp pass stopped costing 30 s a page.** Run 123's ramp loop drove Playwright locators, and
`item.click()`'s actionability wait burned ~30 s per entry before the first Run click - the six-entry
pass took minutes. The loop now runs *inside* the page like `gradeInPage`, and twelve ramp executions
finish in 0.2 s. Two assertion bugs fell out of the rewrite, both of which had let a verdict be read
rather than earned: a run is now complete only when the panel moves to a *changed* terminal status
(R.6's starter raises before printing, so "output arrived" can never be the signal), and the
reference's stdout must carry a distinctive line of **that page's** registry entry, so a verdict left
behind by the previous entry cannot be graded as this one's. Badges, terminal status and the PASSED
requirement are unchanged.

**The social preview is now a build artifact.** GitHub's 1200x630 social preview has no API - it is
uploaded by hand - so it used to be the one visual asset nobody could regenerate.
`scripts/generate_social_preview.mjs` renders it in Chromium from the repository's own hero GIF
(inlined as a data URI, because `setContent` pages silently drop `file://` images and produced a
broken-image icon on the first attempt) and the lesson count counted from disk (48; the milestone
pages `P.M`/`S0.M` are lessons too). `--check` asserts the PNG is 1200x630. The file is
[`docs/media/social-preview.png`](docs/media/social-preview.png).

**A repo a stranger can contribute to.** `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) names a
private reporting channel - the repository's Security tab - instead of a public issue, and says
plainly that beginner questions are the point. [`app/README.md`](app/README.md) documents the
workbench for developers: stack, the generate-before-build rule, which files are generated (never
hand-edited), the checks that cover it, and the Pages base-path trap that `test:e2e:pages` catches.
[`docs/README.md`](docs/README.md) gains an assets table naming both media files and the command
that regenerates each.

The generated blocks and every honest number are untouched: the README's route table, hour claims
and fault count still come from `scripts/route_model.py`, and the social preview's lesson count is
counted, not typed.

---

## [2026-10-20] — Run 123: The Ramp Graded Where It Is Used, and a Front Page That Says So

The previous two runs fixed the curriculum and the checks. This one proved the recovery path in a
browser and made the front page read like the product the pages already are.

**Every ramp entry is graded on the built bundle.** `scripts/e2e_pages_bundle.mjs` gains a ramp
pass: for R.1-R.6 it clicks the entry, waits for *that* page's starter (a per-page function marker,
because every ramp starter contains `TODO 1` and the previous entry's code lingers for a beat),
asserts the starter does not match or verify, then loads the registry's own reference and asserts
MATCHED output, PASSED instructor tests and `status-assert-passed`. The reference comes from
`pythonLessonsData.ts`, so the browser grades exactly what the runner ships; `RAMP_LESSONS` and the
markers are the only hand-typed lists, and each is asserted complete. Chromium and Firefox both run
it, and the suite's `[PASS]` line now names the ramp range.

**The new pass found a real platform bug on its first run.** R.5's last line printed `abs(Z)`, a
residual of ~4e-16 whose mantissa depends on the platform's `sin`/`cos`: CPython printed
`4.003e-16` and Pyodide `3.140e-16`, so the page's Expected Output was unmeetable in the browser
that grades it. The line now rounds before formatting (`0.000e+00` on both, the physics the lesson
is about) with a comment saying why; `check_ramp_lessons.py` still proves the page and its answer
agree. This is exactly the class of failure a registry-only check cannot see.

**Repo settings now match the content.** Description, sixteen topics and Discussions were applied
to `TLE47/Mechatronics-Roadmap` (they are repository settings, not files); the homepage was already
correct. `README.md` is rebuilt around the generated blocks, every marker and route row untouched:
centered title, tagline and badge row (workbench, Lesson 1, license, CI, link check, zero install,
\$0 hardware, Python 3.12), the start-here callout, the arm GIF as a hero, a Quick start table,
GitHub alert callouts for the honest timing caveat and the minimum finish, and new sections for the
repository map and the verification commands. `docs/README.md` is a short index of the maps, the
checks and the evidence, with a diagram so it passes the repo's own page rules.

The generated blocks stay generated: `generate_sim_route.py --check` still reports the README
current, `generate_start_here.py --check` is current, and the README size claim in Run 121's entry
was updated to the new 17 KB so `validate_modules.py` keeps passing.

Verified: pages e2e on the built bundle in Chromium and Firefox (50 exercises, the Tier 2/Tier 3
cheat cases, and all six ramp entries starter-fail/reference-verify), 372 Python tests (1 skipped),
`verify_repo` (158 files, 2007 links, 0 errors), `validate_modules`, `check_consistency`,
`check_tab_names`, `generate_sim_route --check`, `generate_start_here --check`, and a fresh build.

---

## [2026-10-20] — Run 122: The Check That Could Not See a Reversal

The read-through after Run 121 tested the tests. Four of its five findings were coverage, not
curriculum: the pages were right and the checks were not asking the question that separates a
correct answer from a plausible one.

**Anti-windup's missing case.** `05-control.T1.05a`'s browser self-check froze the accumulator only
while the demand was past a rail *and* the error pushed that way - and then only tested a demand
past the rail with the error pushing. An implementation that froze on **every** saturation passed
the browser. The self-check now walks both rails and both directions: `e = -0.4`, `u_raw = 15` must
land at $0.7952$ (0.8 is the freeze-on-any-saturation answer), the negative rail must freeze and
unwind the same way, and $u_{\text{raw}} = \pm u_{\max}$ exactly must **not** freeze. `test_behavior.py`
gains the same four cases under named messages and `test_transfer.py` gains the unwind on the
plant's own clamp, so the package is 53 tests. A sixth planted fault,
`anti_windup_freezes_any_saturation`, fails exactly the two tests named for it - and the browser
shows the freeze-on-any-saturation submission `Behavior Tests: FAILED` with *"the error reversed
while the demand is still past the positive rail"*.

**Two modules split without shrinking.** `04-embedded.T1.04a` keeps every topic but now ends §5's
interface with **four sittings** (widths and rollover, bit operations, structs and pointers, packing
a frame), each 40-50 minutes with the test subset that ends it (13, 9, and all 38 tests). Sitting 3
has no Python hole because the compiler owns that fact: a three-struct `frame.cpp` prints
`8 12 8` and shows the two bytes an un-packed `H f h` layout loses - which also corrected §8's
padding row, whose 12-vs-8 example was `H h f` and therefore wrong. `P.9` gains an **independence
check**: a belt-driven gantry word problem, different numbers, no supplied expression, a
units-before-code sentence, and a self-grading block (`0.0025 mm/microstep`, `55000` microsteps,
`250.0 mm/s`) whose answer explains why the reciprocal is the plausible wrong one.

**Two checkpoints that could mis-teach.** `docs/TIER1_EXIT_CHECK.md` left 11/14 with misses in
different lessons with no route; it now has a row (do both missed ramp lessons, retake those two)
and the flowchart draws it. Item 4 asked about "the average rate" with no interval; it now fixes
the interval at 0.4 s and separates average **velocity** (zero on a round trip) from average
**speed** (non-zero) - the distinction the item exists to teach. R.4's recap also said "twelve
items"; the check has fourteen.

**The recovery path now runs where the others do.** Every ramp page said "no workbench entry", so
the exit check could name the lesson that repairs a miss and then send the learner somewhere they
could not run it. All six are registry entries now (`generate_python_lessons_data.py` reads
`ramp/R.*.md`) with instructor tests on their own numbers: R.1's full/quarter turn and both rate
signs, R.2's three rules and the Q0 offset, R.3's old-speed tick and superposition, R.4's
`A x = [3, -7.5]` and `B u = [0, 20]`, R.5's two-part addition and 53.130 deg report, R.6's corner
gain and a measured phase against a known 0.5 rad lag. They are owned by `PRE_STEP_RAMP` rather than
by Step 1, because they are remedial and must not become a completion requirement; `test_spine.mjs`,
`test_practice_links.mjs` and `test_run_callout.py` each learned that one owner and assert every
R.x entry exists. R.1's starter also stopped crashing before its first TODO: its guard prints "no
reversal yet" instead of interpolating `None`, so the promise "runs as-is" is true. The reader's
rule for AI - *unblock an attempt, not make it* - is now five numbered steps in the README, with
"mark it assisted and rebuild it unaided" as the last one.

Verified: 372 Python tests (1 skipped), 53 tests in the changed package, six planted faults each
failing their named test, all six ramp entries failing on their starter and passing on their
reference (R.2 and R.4 also exercised in the real browser), workbench suites on the dev server and
the built Pages bundle (smoke, links, spine, e2e, pages, pairs, tour), `tsc -b` and `vite build`,
`verify_repo` (157 files, 1971 links, 0 errors), and every generator `--check`.

---

## [2026-10-20] — Run 121: The Links Walk the One Order, and a Unit Nobody Described

The same external read-through that produced Run 117 found the fixes had not reached every page.
The steps and the arm/depth split were right; the pages still pointed past them.

**Every page now names its successor in the same model.** `scripts/generate_next_links.py` writes
one `next-step` block per page from `route_model` (the arm route: 65 pages) and then the depth pass
in `docs/DEPTH.md` order (23 pages). What it replaced was three different answers: `00.3` pointed at
Track 01 and skipped all five Tier 1 foundations modules; `00-foundations.T1.00e` pointed at a
"Legacy Step 1.1" id that no longer exists; `08.1` sent the learner to the capstone README's Pass 2
instead of the arm's last page. The arm's last page now says the arm is finished and offers the
depth pass as optional; the depth pass ends at `EXTENSIONS.md`. `tests/test_next_chain.py` (9 tests)
follows the links from `P.1` as a learner would and requires exactly the routed pages in order, no
loops, no detours, and `--check` is in CI; `00-foundations/README.md` now says Track 01 is Step 4.

**A short is not zero flow — re-verified, not re-fixed.** Run 117 corrected `S0.0`; this run proved
the guard still bites: reverting the supplied solution to `return 0.0` for `opposition_ohm <= 0`
fails `tests/test_exercises.py` with *"a zero-ohm short must be rejected, not reported as zero
flow"*, and restoring it passes.

**A fifth unit with no rule of its own.** Run 117 asked the learner to choose the four units'
boundaries, but the four signatures were still described. `08.1` now adds **Unit E** (`TODO 6`): a
bench report only — $0.4575\text{ rad}$ reported for a $0.305\text{ rad}$ command, no sag, $4.0\%$
overshoot, tip error growing $15.2\text{ mm} \to 30.5\text{ mm}$ with the pose — and no rule above
covers it. `infer_encoder_scale` must name the cause as one number ($1.5$, not the described $4\times$
CPR fault) and `repair_encoder_cpr` must correct it. The instructor tests also require an honest
encoder to read $1.0$ and a constant-offset unit to *not* read as a scale, so the fix has to tell a
ratio from an offset rather than pattern-match the prose.

Verified: `generate_next_links`, `generate_step_docs`, `generate_python_lessons_data`,
`generate_sim_route`, `generate_readme_counts`, `generate_start_here`, `generate_spine_data`,
`generate_run_callouts`, `mentions_audit`, `lint_assertions`, `verify_repo` (157 files, 1970 links,
0 errors), `lint_lessons`, `lint_modules`, `validate_modules`, `audit_step_size`, `check_consistency`
all clean; the full Python suite passes; the broken-solution revert for `infer_encoder_scale` fails
the same suite, so the new test is not vacuous.

---

## [2026-10-20] — Run 120: One Name per Tab, and a Real Join Between Roadmap and Runner

Lesson P.1 recommended "2. Run Python Lesson" while the app showed "2. Run Python Lessons" and, in
the technical view, "9. In-Browser Python Runner". The same tab had two numbers and a lesson page
had a third name. The roadmap also showed a prose "Hands-On Exercise (1/10)" and a checkbox that
only recorded a click, while the runner listed the same work under a fourth numbering ("Step 1",
"Steps 3–5", "Steps 6–10") that belonged to neither.

- **One name, one file.** `app/src/data/workbenchTabs.json` now holds the 11 tab names and the
  workbench URL. `App.tsx` renders them through `app/src/tabNames.ts`; the page generator reads the
  same file, so P.1 asks for **Run Python Lessons** by the name the strip shows. `Tab 1…11` is gone
  from the app, every lesson and module page, the entry docs and the issue templates: 234 mentions
  across 65 files. A number cannot be true when the two views order tabs differently; a name can.
- **A guard against the next drift.** `scripts/check_tab_names.py` fails on any positional tab
  reference, a duplicate or missing name, or an `App.tsx` label typed by hand; `tests/test_tab_names.py`
  covers the table, the app and the callout. `CHANGELOG.md` is the only file exempt (it is history).
- **A derived join.** `app/src/practiceLinks.ts` maps each roadmap step to the workbench entries that
  carry the same track and pass (`EX.<track>.T<pass>.<n>`, plus the tier-1 readings). All 86 entries
  are claimed exactly once; `scripts/test_practice_links.mjs` asserts that, plus the `Track 06 & 07`
  step and the capstone step. Step 7 covers two tracks and step 8 is Track 08, so the mapping reads
  position in the pass rather than the milestone id's `tr07`/`tr08` suffix.
- **Both directions on screen.** Each roadmap step lists its entries as id chips with a
  `passed in this browser` count and one "open the next one I have not passed" button; the runner's
  header carries `Roadmap: T2 · Step 6 / 8 ↗`, which switches to that step's pass. The Python on-ramp
  (14 `P.` entries) is now shown above Level 0 — it had no step on the roadmap at all.
- **Honest wording.** The tick reads *Mark done (self-reported)*; the prose task is a *Deliverable
  (not auto-checked)*; the runner counts *lessons & exercises* and filters by *graded modules*,
  *track lessons* and *Python on-ramp*; the roadmap says *Opens: <tab name>* computed from the preset.
- Verified: `npm run lint` clean; `python3.12 -m unittest discover -s tests` 340 OK (skipped=1),
  including `check_tab_names` and the callout suite; `npm run test:workbench` all six suites pass.

---

## [2026-10-20] — Run 119: A Lesson Has an Address

The callout on 86 pages said to search for an id in Tab 2, which was one instruction more than the
link needed to carry. `app/src/lessonRoute.ts` gives the workbench an address: `?lesson=<id>` reads
the entry on load (validated against the registry, so an unknown id falls back to Lesson 1), lands
the page on the editor, and `selectLesson` writes it back with `history.replaceState` so a copied
URL reopens what is open. The mount-time sync does not write, so a plain visit keeps a clean URL.
`scripts/generate_run_callouts.py` now links `…/?lesson=P.1`, and the 86 callouts are regenerated.

The editor's metadata row was a single nowrap flex line whose spans could shrink: at tablet width
"Lesson P.1" broke across two lines and the pass badge across three. Its items now wrap as whole
units with `whitespace-nowrap` (the long page path truncates with its full value in `title`), and
the dotted separators are gone because one cannot dangle at the start of a wrapped line.

Verified: `?lesson=05.1` and `?lesson=EX.05-control.T2.05a` open those entries; clicking P.7 rewrites
the address; an unknown id falls back to P.1; the header measures 16px per item at 1024 and the new
tablet assertion flags the old layout (28–42px per item) so it is not vacuous. `npm run lint`,
`test:smoke`, `test:e2e`, `test:e2e:pages` (chromium + firefox, tablet 834x1112) PASS; 331 Python
tests OK; `generate_run_callouts --check`, `lint_assertions` clean.

---

## [2026-10-20] — Run 118: The Wordmark Gets a Definition

"MechaLab" appeared in the header of every screen and was explained nowhere: a first-timer met a
product name, two doors and a promise, and had to infer what the thing was and when a lesson
expected them to be in it.

The Start here block now opens with two plain sentences, both rendered from
`app/src/data/startHere.json` into the README and the landing screen so the two cannot drift:
**what MechaLab is** (this course's browser workbench — Python 3.12 and the circuit simulators run
inside the tab, nothing to install, no account) and **when to use it** (any time a lesson hands you
a starter file, which Tab 2 lists; read the page for the idea, then type, run and verify). The
when-line keeps the old promise that progress stays in the browser and nothing is saved on GitHub.

The smoke and browser suites had their own typed copy of the old sentence; they now read heading,
definition and note from the same JSON, so the next reword does not leave three versions of it.

---

## [2026-10-20] — Run 117: One Order, a Real Short-Circuit, and a Diagnosis You Must Infer

Three findings from an external read-through, all about what the course teaches by structure rather
than by copy.

**One learning order.** The ten-step table used to list each step's Tier 1 and Tier 2/3 modules in
one block, so Step 3's sixteen modules read as "finish the Tier 2 foundations before hardware" —
while `00-foundations/README.md` and every track README said the opposite. Each step now has an
**arm** layer (Tier 1 plus the capstone) and a **depth** layer (Tier 2/3). The README table shows
`arm + depth` counts and says: arm modules in Steps 3–10 first, then the depth modules in the same
step order. `SIM_ROUTE.md` labels every module row `· arm` or `· depth`, adds the arm finish, and
stops calling the depth layer required. The arm finish is still `MINIMUM.md`; the full course is
still 200–290 hours, now honestly split 17 arm + 23 depth modules.

**A short is not zero flow.** `S0.0`'s supplied `compute_flow` returned `0.0` for zero or negative
resistance, which teaches that a short draws no current. It now raises `ValueError` with a message
saying a short is outside the model; the hint ladder, full solution, instructor test and common
mistakes say why an open valve is not a zero-ohm resistor.

**Diagnosis without the decision table.** `08.1`'s TODO used to hand over the three thresholds and
their labels. It now gives four broken units' observable signatures and asks the learner to choose
the boundaries; the fourth (`encoder_zero_offset`, a small constant tip error) is new, and the full
solution is still available as one worked calibration.

Verified: `generate_sim_route`, `generate_readme_counts`, `generate_start_here` `--check` current;
`check_consistency`, `validate_modules`, `lint_assertions` clean; `npm run lint`, `build`, `smoke`
and the five-suite `test:workbench` pass; 315 Python tests OK (1 skipped). The two changed lesson
solutions and their generated instructor tests were executed directly: S0.0 rejects a zero-ohm
short, and 08.1 classifies all four cases.

---

## [2026-10-19] — Run 116: Hints After a Run, Hours That Add Up, and a Named P.13 Gap

Three polish issues from a read-through, none of them a broken lesson.

**Hint 2 now waits for a run.** The ladder was sequential, but a learner could click **Reveal
Hint 2** immediately after Hint 1; on many lessons Hint 2 is nearly the full fix. The first hint
stays open, and every later hint is disabled — labelled **Run to unlock Hint 2** — until that
lesson has completed at least one run. Attempts are counted per lesson, so an earlier try still
counts, and a failed or stopped run is a real attempt.

**The hour rows add up.** Rounding each step on its own made the README's ten rows sum to
202–291 beside a 200–290 total. One largest-remainder allocation now rounds the column so the
rows total the quoted figure, and both the README step table and the `SIM_ROUTE` stage rows use
it; Step 9 reads ≈14–18 and Step 10 ≈6–9. Page rows and the exact Core total (200.35–290) are
unchanged, and each document says which figure is rounded.

**P.13 and the Track P totals.** The id gap is deliberate — saved progress and links are keyed by
lesson id — and now says so in `track-p/README.md` and `SIM_ROUTE.md`. The Track P table's stale
`~10.5–14 h` total is replaced by the sums of its own two columns (≈12–17 h and ≈24–31 h), with
the generated ~17–43 h page-metadata estimate named separately.

Tests: the README row sum and the shared allocation are asserted in `test_readme_route.py` and
`test_sim_route.py`; the browser E2E checks that Hint 2 is disabled before a run and opens after
one.

## [2026-10-19] — Run 115: The Pass Selector Shows Which Step 1s Are Done

Each pass card in the roadmap selector now carries a green check beside its name when that pass's
own first milestone (`l0_m1`, `t1_tr00`, `t2_tr00`, `t3_tr00`) is checked — the same signal that
folds the pass's first step card. The check is per pass, so a finished Tier 1 does not mark Tier 2,
and it is absent entirely for a newcomer. It is exposed as
`pass-first-step-complete-<passId>` and labelled "Step 1 complete" for assistive technology.

Smoke renders the Tier 1 check beside unchecked Tier 2/Tier 3 and no check for a newcomer; the
browser E2E checks the marker appears with the milestone, survives a Tier 2 switch, and survives a
reload.

## [2026-10-19] — Run 114: Each Pass Collapses on Its Own First Step

The roadmap's collapsed first card was keyed to Lesson 1 (`P.1`) rather than to the pass on
screen. Verifying Lesson 1 therefore closed the first card of **every** pass — including Tier 2 and
Tier 3 before they were started — while checking a roadmap pass's own first milestone closed
nothing. The card now reads the active pass's first milestone (`l0_m1`, `t1_tr00`, `t2_tr00`,
`t3_tr00`) from the same `completedMilestones` map the pass counters use, so it closes only when
that pass's Step 1 is checked, reopens when the check is removed, and says **Step 1 complete**.
Expansion is kept per pass, so folding one pass's card does not unfold another's.

Smoke renders a completed Tier 1 first step, Tier 2 left whole by it, and the newcomer's whole
card; the browser E2E verifies Lesson 1 first and asserts the roadmap card is still whole, then
checks the milestone, expands and folds, switches to Tier 2 to see its card open, and reloads to
prove the collapsed state persists.

## [2026-10-19] — Run 113: One Source for the Start Here Block

The README block and the landing card were two typed copies held together by a checker that could
only report a drift after it shipped. The words now live once, in `app/src/data/startHere.json`:
the app imports that file, `scripts/generate_start_here.py` renders the README block from it
between markers, and the lesson path is resolved from the lesson pages by id. `--check` runs in CI
through `check_consistency.py`, and the guard now fails on a stale README **or** on a typed copy
reappearing in `startHere.ts`.

`docs/VERIFICATION.md` lists the new command; tests cover the generated block, the shared-file
import, the missing-marker error and the lesson-id resolution.

## [2026-10-19] — Run 112: The Roadmap Agrees, and the Line Can Go

The roadmap tab now does what the landing screen does once Lesson 1 is verified: its own first
step card closes to one line — **Lesson 1 verified · T1 · Step 1 / 8**, the step's title, its
milestone toggle and **Show details** — and expands back to the full card on request. A search
filter keeps the card whole, so a filtered list never hides a step the learner asked for.

The collapsed landing line is also dismissible for good now. The × is offered only while collapsed,
the choice persists across reloads, and the roadmap tab carries **Show the Start here block**, which
restores the line and returns to the landing screen where it lives.

Smoke renders the dismissed and restored states and the roadmap's collapsed card; the browser E2E
dismisses the line, finds the restore control on the roadmap, reloads to prove the choice sticks,
and brings the line back.

## [2026-10-19] — Run 111: The Start Here Block Steps Aside

The landing block was doing a first-timer's job forever. Once Lesson 1 is executed and passed it
now collapses to a single line — **Lesson 1 verified · Start here — your first 2 hours**, with the
same Lesson 1 link at the far right — so a returning learner is not made to scroll past a banner
that is no longer news. The first-timer block is unchanged, and the README-agreement check still
reads the same strings.

The smoke suite renders both states; the browser E2E runs P.1's reference solution in the real
runner and proves the block collapses without losing its link.

## [2026-10-19] — Run 110: The Start Here Block Reaches the Landing Screen

The README's opening block now also opens the workbench. The default Python tab renders the same
heading (**Start here — your first 2 hours**), the same Lesson 1 link — built from the generated
lesson dataset, at `track-p/P.1-variables-and-data-types.md` — and the same one-line promise, so
whichever door a newcomer opens, the first instruction is identical.

`scripts/check_consistency.py` now fails when the README block, the app's strings, or Lesson 1's
path disagree. The smoke and browser E2E suites assert the block's position, wording and href, and
the first-lesson guide no longer repeats "Start here" directly beneath it.

## [2026-10-19] — Run 109: The First Two Hours, and a Core Total

The README now opens with a single **Start here — your first 2 hours** block: one Lesson 1 link,
one editor, one Run button, no jargon. Everything else starts below the fold.

`docs/SIM_ROUTE.md` now states the **Core total: ≈200–290 focused hours** before its long table,
and `docs/ROUTE.md` repeats it on the Core-complete line. The Extensions total was already visible;
Core is now impossible to miss.

Beginner View's track matrix starts with the Beginner column only. The Tier 2 and Tier 3 columns
are behind a **Show deeper columns** button, and the matrix switch is renamed **Compare Tracks**;
Advanced View still opens the full three-tier matrix. The browser E2E now proves the columns start
hidden, appear on the toggle, and hide again.

## [2026-10-19] — Run 108: Focused Hours and a Real Finish Line

The front page said **200–290 hours** without saying what it counted, which reads as elapsed time
and turns hour 200 at Step 5 into evidence that the learner is slow. It now says **focused hours**
in the table, the route page and the Extensions page, and adds the calendar arithmetic a first
project actually needs: 200–290 focused hours is 8–11 months at 6 h/week before overhead, and a
**3–5 year project** at the same pace once a 5x first-time multiplier is counted.

The other half of the same problem was the absence of a stopping point. [`docs/MINIMUM.md`](docs/MINIMUM.md)
is now generated from the same page metadata as the full route: Track P, Stage 0, every Tier 1
bridge, the capstone's five prerequisites, and the capstone. That is 47 pages and 93–151 focused
hours, a real finished arm rather than a consolation prize. The README labels everything outside
it **someday**, and `generate_sim_route.py --check` now fails if the page list or total drifts.

Pilot logging separates `active_minutes` from `elapsed_minutes` and `overhead_minutes`, so the 5x
calendar multiplier can be calibrated by real sittings instead of asserted.

The architecture tables that used to sit inline in `docs/ROUTE.md` now live in
[`docs/CURRICULUM.md`](docs/CURRICULUM.md), so the README, the route plan and the ids each have one
home. `docs/ROUTE.md` keeps the ten steps and the two finish lines.

The workbench's first screen had the same problem in miniature: its header still said
`Stage 0: On-Ramp` and `Pass 1: Beginner`, and the Beginner View tab subtitles still read
`d-q FOC · SVPWM` and `Track P · Stage 0 · Pass 1–3 Matrix`. The header now says Start here,
Beginner, Applied and Advanced, and each tab carries a plain-English beginner subtitle while the
technical one stays in Advanced View.

## [2026-10-19] — Run 107: Every Lesson Teaches Its Own First Run

The first-run brief was P.1-only, so a learner who clicked P.2 or an exercise got the same generic
"change a TODO" paragraph. Every unverified lesson now derives its own three lines: how many holes
its starter leaves and the first one, the first instructor check it must satisfy, and the output
that means finished. Beginner pages count `# TODO` markers; exercise packages count the
`NotImplementedError` holes they actually raise.

Hiding a brief is now per lesson (`mechalab_first_guide_dismissed_v1` holds a JSON array of ids;
the old `'1'` value means P.1 was hidden, not every lesson), and a brief stays up for the run that
earns verification so its success line is seen. `app/src/lessonCoach.ts` is the single parser; the smoke suite checks
all 86 entries have a non-empty specific brief, and the browser E2E walks P.2 and P.3 to prove the
brief follows the selected lesson and that hiding one does not hide the next.

## [2026-10-19] — Run 106: Step 1 Teaches Itself

Step 1 used to need the README beside it: a newcomer had to know they were looking at an editor,
that the untouched starter was *supposed* to fail, and that the red assertion line already named
the fix. The runner's first visit now opens on Lesson P.1 with a three-panel guide — the editor and
its `# TODO` lines, a **Run the starter** button that executes the untouched code, and the
`WHAT TO FIX` panel that appears from the check's own expected/got line — or, after a traceback,
from its last line, where the `SyntaxError` or `NameError` actually is.

The guide is not a modal, so it can be read beside the lesson. It hides itself after P.1 verifies,
and **I have done this before — hide** remembers the choice in
`mechalab_first_guide_dismissed_v1`. The simulator tour stays off this screen; it remains on the
roadmap and every simulator tab.

`scripts/e2e_browser_workbench.mjs` walks the newcomer path (guide → run starter → behavior-failed
line → Hint 1), and the smoke suite checks the guide renders server-side without the failure panel.
The same-task pair sweep and tour test now open the roadmap first, because the tour is one click
away from the first lesson rather than above it.

## [2026-10-19] — Run 105: The Front Page Becomes a Beginner Entry

The README opened with a badge wall, seven acronyms and a `Track P → Stage 0 → Pass 1` route a
newcomer had to decode before finding a lesson. It is now three lines: a link to Lesson 1, one
sentence naming the finished arm, and the time and cost. The ten-step table is generated from
`scripts/route_model.py`; the tier/pass matrix, CI details and optional modules moved to
[`docs/ROUTE.md`](docs/ROUTE.md), [`docs/VERIFICATION.md`](docs/VERIFICATION.md) and
[`docs/EXTENSIONS.md`](docs/EXTENSIONS.md). The page is 111 KB $\to$ 19 KB.

Two contradictions surfaced while generating the counts:

- the README said "13 Track P lessons and the P.M milestone" beside a fourteen-row table;
- the route total omitted all 23 lesson pages inside Tracks 00-08. Including them moves the Core
  from 178–223 to 200–290 hours, and the ROS 2 pair moves to Extensions, so the required set is
  40 modules and 48 lessons.

`scripts/check_consistency.py` now fails CI on a quoted count that differs from the lesson files,
a step repeated or missing from the table, a second name for a step on the front page, and a stale
route or README figure. [`docs/BEGINNER_TEST.md`](docs/BEGINNER_TEST.md) is the 40-minute first
sitting script, with the [`beginner-session-log.md`](.github/ISSUE_TEMPLATE/beginner-session-log.md)
observation template; it records N = 0 until two real beginners have been watched. The two ROS 2 modules keep their graded packages and badges; the README
names the Docker and browser walkthrough and says the arm does not need a local ROS 2 install.

## [2026-10-19] — Run 104: The Rise Gate Compares URLs, Not Counts

The `--fail-on-rise` gate compared `not_checked` with the previous row's, which made a new bot wall and
a page recovering cancel out silently, and made the verdict a number nobody could act on. Each history
row now records the unverified URLs, and the gate fails only on URLs that are unverified now and were
not in the last committed row.

| case | before | now |
| --- | --- | --- |
| same 37 walls, another week | pass | pass, and the rows carry the list |
| one page recovers, one new wall appears (count flat) | pass, change invisible | fail, naming the new wall |
| the pile shrinks | pass | pass |
| first row after the change (no list in the old row) | compared against a count | baseline recorded, no failure |

`tests/test_link_cache.py` covers the same set in another order, the recovery-plus-new-wall case, a
shrinking set, a legacy row without the list, and the first run. Measured against a baseline row of 37
URLs with one URL removed from its list: the sweep exited `1` naming that URL, while the same tree
against the unmodified row exited `0` - a count-only gate would have passed both, since the counts
were identical.

## [2026-10-19] — Run 103: A Rising Pile Fails the Sweep, and the Ladder Hands Off

The history file recorded `not_checked` but nothing acted on it, a bot wall that lifted waited a full
week for the next sweep, and no track README pointed at the next track's first bridge page - a learner
finishing Track 04 had to go back to the root index to find Track 05.

| change | effect |
| --- | --- |
| `--fail-on-rise` on the weekly run | `not_checked` above the last committed row exits `1` with the delta, so a growing pile is a red job rather than a row nobody reads |
| `--revalidate-unverified` + `npm run links:revalidate` | re-fetches only verdicts that are not `PASS`; the ~470 served pages stay cached |
| `.github/workflows/revalidate-links.yml` (daily 07:00) | a lifted bot wall is re-checked the next morning, not the next Monday |
| handoff line in the eight READMEs before Track 08 | each bridge section ends by naming the next track's first Tier 2/3 page |
| `tests/test_track_bridge_lists.py` extended | fails when a handoff line is missing, with a negative control that proves the detector reports one |
| `tests/test_link_cache.py` extended | covers `needs_fetch` (revalidation keeps served pages, retries blocked ones) and the rise comparison, including a corrupt history line |

Measured with the cache restored from the weekly sweep: `--revalidate-unverified` re-fetched only the
unverified verdicts instead of all 513 URLs, and a run against a history row of `not_checked: 0`
exited `1` with `UNVERIFIED RISE`, while the same tree without the flag exited `0`.

## [2026-10-19] — Run 102: The Sweep Runs in Parallel, Remembers, and Reports Its Gap

The checker fetched 513 URLs one after another, re-fetched every one of them on every run, and named
three of the seven `resources/` pages as the ones in scope. A serial sweep took **9 m 12 s** here and
about the same on CI; the scan set is now derived from disk, the fetch runs in a pool, a verdict cache
survives between runs, and each run appends its own numbers so a growing unverified pile is visible.

| change | effect |
| --- | --- |
| `resources/*.md` and `resources/*/README.md` globbed into the scan set | 118 files and 513 URLs, up from 113/352; five reference pages that were never fetched |
| `--jobs` thread pool (default 8) | **9 m 12 s -> 1 m 14 s** on the same 513 URLs, same machine, cold cache |
| embedded verdict cache (`.link_cache.json`, gitignored) | 7-day TTL for served pages, 6 hours for anything unverified; warm run **0.1 s** |
| `--refresh`, `--no-cache`, `--cache-ttl-hours` | a citation that changed can be re-checked without deleting a file |
| `--history docs/link-check-history.jsonl` | one JSON row per sweep and a printed trend of `not_checked` |
| 308 follows on Python 3.9 | `folk.ntnu.no`, `modelcontextprotocol.io` and `prusa3d.com` answered 308 and were called FAIL by the 3.9 interpreter; they pass on 3.12, which has the handler |
| 418 is a bot wall | IEEE Xplore answers scripts with a teapot; that is `BLOCKED`, not a dead citation |

Four dead citations the wider scan set found, all in the reference pages:

| page citation | was | now |
| --- | --- | --- |
| ToOptix | `github.com/DerBaumeister/toOptix` 404 | the PyPI project page |
| microTVM | `tvm.apache.org/docs/topic/microtvm/` 404 | the Apache TVM repository |
| IEEE/ASME TMECH | `ieee-ims.org/publication/tmech` 404 | the IEEE Xplore journal page |
| IEEE/ASME AIM | `ieee-ras.org/.../aim` 404 | IEEE IES's conference list (AIM is an IES conference) |

`tests/test_link_cache.py` covers the cache rules (TTL, heading coverage, corrupt file, atomic write),
the pool (overlap, one crashed worker, every verdict kept) and a local 308 server;
`tests/test_track_bridge_lists.py` fails when a module page is missing from its track README;
`tests/test_link_scan_set.py` now also fails when a `resources/` page leaves the scan set.

Measured: cold sweep `Swept 513 URLs in 74.1s (0 cached, 513 fetched)`, warm `0.1s (513 cached)`,
both exit `0` with 476 served and 37 not checked; 223 tests pass; `verify_repo.py` reports
`links=1898 errors=0`.

## [2026-10-19] — Run 101: The T2.00f Split's Citations Follow It

Splitting `00-foundations.T2.00f` into `T2.00i` (pre-warped Tustin biquads) and `T2.00j` (Gaussian
variance, covariance and the predict step) rewrote Track 00's own ladder, but the other eight track
index pages kept sending learners to `T2.00f` — now Nyquist sampling and aliasing only — for
covariance, statistical bounds and notch design.

| page | was | now |
| --- | --- | --- |
| 03 pass 2 prerequisites, 03 variance propagation | `T2.00f` (*Gaussian Noise Variance & PSD*) | `T2.00j` (*Gaussian Variance & Covariance*) |
| 05 pass 2 prerequisites, 05 covariance propagation | `T2.00f` (*Gaussian Covariance Propagation*) | `T2.00j` (*Gaussian Covariance & the Predict Step*) |
| 07 pass 2 prerequisites | `T2.00f` (*Statistical Bounds*) | `T2.00j` (*Variance & Statistical Bounds*) |
| 07 pass 3 prerequisites | `T2.00f` (*Variance Addition & PSD*) | `T2.00j` (*Variance Addition & Covariance*) |
| 07 error-budget study link | `T2.00f` | `T2.00j` |
| 07 Tier 3 notch study link | `T2.00f` | `T2.00i` |
| 08 pass 2 boss range | `T2.00a–T2.00f` | `T2.00a–T2.00j` |
| 04 pass 3 prerequisites and Nyquist bullet | (*Sampling, Aliasing & Decimation*) | (*Nyquist Sampling & Aliasing*); decimation is `04-embedded.T3.04a` |

**A content gap the relabel exposes:** with the split, no module mentions a power spectral density or
Welch's method any more (`grep -ci 'PSD\|Welch'` is 0 in `T2.00f`, `T2.00i` and `T2.00j`), so the two
labels that promised PSD now describe what `T2.00j` actually teaches. The Allan-deviation table in
`03-sensors-and-actuators/README.md` still uses PSD language for white-noise densities, which is a
physics fact there rather than a lesson pointer.

The five citations that remain on `T2.00f` (three in Track 01, two in Track 04) all describe Nyquist
sampling or anti-alias filtering, which is what the module now covers. `verify_repo.py` reports
`links=1898 errors=0`.

One more citation in the nine index pages moved: the Skogestad & Postlethwaite book link in Track 05
pointed at `folk.ntnu.no/skoge/book.html`, which now answers `308` to `skoge.folk.ntnu.no`; it names
the canonical host instead of leaning on a redirect.

## [2026-10-19] — Run 100: The Track Index Pages Are Checked Too

`check_links.py` has named `00-foundations/README.md`, `01-…` and `02-…` in its external-scope
logic since `416f2d9`, but none of the nine track index pages was ever in the file list — a dead
branch for every one of them, so the pages a learner lands on first were the only ones whose links
nothing checked.

| change | effect |
| --- | --- |
| `TRACK_READMES` (nine paths) added to the scan set | all 113 scanned files now include every track index page |
| the Tier 1 external window deleted | every external URL on those nine pages is fetched, including the Tier 2/3 resource lists the window used to skip |
| sixteen dead or moved citations replaced | listed below |

| page citation | was | now |
| --- | --- | --- |
| AS5600 datasheet | `look.ams-osram.com` 404 | the canonical `ams.com` PDF |
| Hogan 1985 impedance control | `mec560sbu.github.io` 404 | the STIFF summer-school PDF |
| PCB bring-up (Hackaday) | 404 | Altium's first-power-on guide |
| Nav2 MPPI configuration | old docs path 404 | the versioned `jazzy` docs page |
| ETH RSL Robot Dynamics | `robot-dynamics.html` 404 | `robotdynamics.html` |
| Åström & Murray loop shaping | chapter PDF 404 | the free whole-book PDF |
| Computer-Controlled Systems | Lund course page 404 | the book's Google Books record |
| Piccoli & Yim anticogging | `seas.upenn.edu` 404 | the ModLab UPenn PDF |
| Control of Mechatronic Systems | Wiley product page 404 | the Wiley DOI page |
| System Identification (Pintelon) | IEEE Xplore book 418 | the Wiley DOI page |
| Flexures (Stuart Smith) | Google Books volume 404 | the Google Books record for the same book |
| Phil's Lab channel | `/c/PhilsLab` 404 | `@PhilsLab` |
| Infineon AN-978 | `dgdl` PDF 404 | Infineon's community-hosted PDF |
| Infineon MOSFET losses AN | `dgdl` PDF 404 | Infineon's application-note page |
| NXP AN5087 Allan variance | `nxp.com` 404 | a mirrored copy of the same note |
| LiteRT for microcontrollers | 302 to an OAuth challenge | the TFLite Micro repository |

Measured with `python3.12 scripts/check_links.py`: 113 files, **352 unique URLs**, **322 served**, 30 not
checked from this machine (14 bot walls, 1 server error, 15 timeouts or certificate failures),
**0 broken relative links**, **0 failed URLs**, exit `0`. The unverified set includes
`fbs-public_24Jul2020.pdf`, because `cds.caltech.edu` serves a chain this Python cannot validate; that
is the checker's *could not be checked* verdict, not a failure.

**The scan set is now guarded.** `tests/test_link_scan_set.py` derives the track index pages from disk
(`NN-*/README.md`) and fails when one is missing from `get_target_markdown_files()`, when `TRACK_READMES`
and the numbered track directories disagree (a new track nobody added, or a removed track's stale entry),
and when a declared path does not exist — the third case matters because the file list silently drops
missing paths rather than erroring. Proven by deleting `00-foundations` from the tuple: the suite exits
`1` naming that page, then passes again after the restore. `from __future__ import annotations` in
`check_links.py` keeps the module importable on the 3.9 interpreter CI's comment promises, so the test
runs under `python3` here (0.005 s, five tests) as well as 3.12; `npm run test:linkscan` is the shortcut.

## [2026-10-19] — Run 99: An Account, So Progress Outlives the Browser

Progress lived in `localStorage` and nowhere else: clear the cache, open a second browser, and a
learner's milestones, verified lessons and learning log were gone. The workbench is a static bundle on
GitHub Pages, so there is no server of ours to log in against — this run adds optional email-link
accounts and a one-row-per-learner cloud copy, and leaves the local-only build in charge when the two
build variables are absent.

| piece | what it does |
| --- | --- |
| `app/src/accounts.ts` | lazy `import('@supabase/supabase-js')`, send the magic link, subscribe to the session, sign out |
| `app/src/progressMerge.ts` | the merge: a `true` on either side survives, the newer snapshot's `false` removes, logs are unioned and de-duplicated |
| `app/src/cloudProgress.ts` | load and upsert one `jsonb` snapshot per `auth.uid()` |
| `app/src/components/AccountPanel.tsx` + header button | **Sign in** → email → link; signed in shows the address, the sync state and sign-out |
| `docs/ACCOUNTS.md` | the SQL, the redirect URL, the two repository variables, and what the row holds |

**The anon key is public by design** — row-level security (`auth.uid() = user_id`) is the boundary,
and the three policies ship as SQL in `docs/ACCOUNTS.md`. **A signed-out visitor downloads no SDK**:
the import is dynamic, so the build without variables contains no Supabase code (one 1.55 MB chunk,
unchanged) and a configured build adds a 228 KB chunk fetched on demand. **The merge never drops
work**: completions from either side survive, while an un-tick made on the newer device still sticks.

Verification: `npm run build` with and without the variables (both exit 0, the second emitting the
separate SDK chunk); `npm run test:merge` **9/9** (fresh browser, uncheck wins, older false, equal
stamps, no mutation, log union, malformed row refused); `npm run test:smoke` and `npm run test:pairs`
**17/17**. In the dev server, the unconfigured panel explains local-only mode, the configured panel
shows the email form, and a submit against an unreachable project reports "Could not reach the
sign-in service" instead of a raw fetch error. A real magic-link round trip is the one thing that
needs a live project: create one, run the SQL, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as repository variables, and the next Pages build signs in.

One test oracle changed with it: `scripts/e2e_same_task_pairs.mjs` compares the whole `mechalab*`
storage after each pair, and the new "progress last changed" stamp is a wall clock that cannot match
between two runs. It is excluded next to the learning log's event stamps, with the same reason.

---

## [2026-10-19] — Run 98: Every Track Is Fetched, and Parenthesised URLs Survive

Run 97 put `modules/*.md` in the scan set; the six later tracks were still never fetched. Tracks `03`
through `08` are now lesson globs too: **104 files / 195 URLs** (was 93 / 167), and the 41
`[HTTP 200 — Verified …]` annotations those lessons carried are claims the checker can now test.

The scan found a bug in the checker before it found anything in the curriculum. `link_re` was
`\(([^)\s]+)\)`, so a target containing parentheses was cut at its first `)`: the Wikipedia links
`Pointer_(computer_programming)` and `Struct_(C_programming_language)` were fetched as
`…/Pointer_(computer_programming` and reported **404 twice** on pages that are fine. The target pattern
now allows one balanced pair — `((?:[^()\s]|\([^()\s]*\))+)` — and both come back 200.

Three citations were dead. Each is repointed at a live page that carries the same teaching:

| lesson | was | now |
| --- | --- | --- |
| `03.1` | SparkFun *Rotary Encoder Hookup Guide* (retired) | Dynapar *Quadrature Encoder Overview* |
| `03.3` | NI *Quadrature Encoder Fundamentals* (shop path gone; the docs replacement is client-rendered) | Dynapar, citing its quadrature-resolution section for the $4\times$ count |
| `05.2` | SparkFun *Accelerometer, Gyro and IMU Buying Guide* (retired) | SparkFun *Accelerometer Basics* |

Six quoted headings had drifted from the pages they name, and are now the pages' own words:

| page | was quoted | now quoted |
| --- | --- | --- |
| Cubic Hermite spline | `Unit interval (0, 1)` | `Unit interval [0, 1]` |
| Frequency response | `Estimation and plotting` | `Measurement and plotting` |
| Impedance control | `Principles` | `Principle` |
| Inertial measurement unit | `Disadvantages` | `Performance` |
| How to Use a Multimeter | `Measuring Continuity` | `Continuity` |
| struct (C programming language) | `Overview` | `Pointers` |

Today's run: **186 of 195 URLs served, 0 broken relative links, 0 missing headings**, exit 0. Nine
cannot be checked from this machine and are reported as `BLOCKED` / `SERVER_ERROR` / `UNREACHABLE`:
four bot walls, `fbsbook.org`'s 500, `analog.com` twice, `st.com`, and `myphysicslab.com`'s TLS
handshake. The tracks' own `README.md` index pages remain outside the scan, as the `00`–`02` ones
already were.

---

## [2026-10-19] — Run 97: The Link Checker Reads the Module Pages

`scripts/check_links.py` never opened a bridge module. Its scan set was the root `README.md`,
`PLAN-batch-1.md`, the `track-p` and `stage-0` lessons, the three track READMEs and the three `resources`
pages, so a module's `## 9. Resources` links were gated only by `validate_modules.py`'s
`resources_verified: true` — a flag a human sets, not a check that the URL still resolves. Adding
`modules/*.md` to `LESSON_GLOBS` takes the scan from 43 files / 91 URLs to 93 files / 167 URLs.

Four citations were dead, and each is repointed at the same document:

| module | was | now |
| --- | --- | --- |
| `04-embedded.T2.04d` | `micro.ros.org/docs/tutorials/core/first_application_rtos/zephyr/` | the same tutorial at `micro.vulcanexus.org` — micro.ros.org is now a redirect stub to the Vulcanexus docs |
| `04-embedded.T2.04b` | `freertos.org/.../03-Supported-devices/02-FreeRTOS-Documentation-and-Books` | `freertos.org/.../07-Books-and-manual/01-RTOS_book` |
| `01-electronics.T2.01a` | `ti.com/lit/pdf/slod006` — TI has withdrawn SLOD006 | the same SLOD006B PDF (byte-identical) on the MIT 6.101 reference shelf |
| `01-electronics.T3.01a` | Infineon `dgdl/...MOSFET_Power_Losses...` (404) | AN 70-41484 on `application-notes.digchip.com` |

The other eight failures were not rot, so the checker now says which instead of failing: **PASS**
(2xx/3xx), **FAIL** (a 4xx naming a missing document — the only verdict that breaks the run),
**BLOCKED** (401/403/429 bot wall: `w3.org`, `dl.acm.org`, `allaboutcircuits.com`,
`ctms.engin.umich.edu`), **SERVER_ERROR** (5xx: `fbsbook.org` answers 500 while its move to
`fbswiki.org` is half-done) and **UNREACHABLE** (connection error or timeout after one retry;
`analog.com` and `st.com` do not answer this network). A heading is only reported missing from a page
that was actually served, and the lesson that claimed `[HTTP 200 — Verified …]` for `fbsbook.org` now
says the host is down. Today's run: 159 of 167 URLs served, 0 broken relative links, 0 missing
headings. `LINK_REPORT.md` is regenerated but stays untracked (gitignored).

---

## [2026-10-18] — Run 96: Two Controls in One Task, Audited Pair by Pair

Run 95 fixed one instance of a class: a click handler that reads the state its last *render* captured, so
a second control clicked in the same task acts on the world before the first click. This run walks every
`useState` in `app/src`, pairs each with its writers and readers, and lands the sweep that keeps them
honest — `scripts/e2e_same_task_pairs.mjs` (17 pairs, 18.5 s standalone, the fourth suite in
`npm run test:workbench`).

| state | writers | readers | reads stale in one task? |
| --- | --- | --- | --- |
| `TabPyodideRunner.code` | Load Solution, Reset Starter, lesson select, typing | Run | **was** - fixed in Run 95 |
| `TabPyodideRunner.localCompleted` (standalone fallback) | Self-Mark Complete | itself | **was** - read-modify-write; now a functional update |
| `App.tourIndex` | Next Step, Prev Step | Next, Prev, Apply Demo Preset | **was** - Next+Next stepped once (2 vs 3), Next+Prev landed on step 8 instead of back on step 1 |
| placement quiz `answers` | option buttons, Reset | *Open Lesson* / *Open Matched Simulator Tab* | **was** - the jump opened the previous gap's lesson (P.14 vs 00.1) |
| `App.completedMilestones` | milestone toggles | toggles, export modal, progress counters | no - `prev =>` updates compose |
| `App.viewMode`, `App.activeTierPass` | mode buttons, header links, banner switcher | tab list, banner text | no - absolute writes |
| simulator inputs (`fbw`, `useSchroeder`, `lNh`, ...) | sliders, presets, FOC/ESKF toggles | their own panels, derived numbers | no - presets are absolute; both toggles are `prev => !prev` |
| `quiz.submitted`, `diagnosticMode`, modal flags | their own buttons | their own panels | no |

**The three fixes.** The tour keeps `tourIndexRef`, written by the two steppers and read by all three
buttons, so two tour clicks compose and Apply Demo Preset applies the step the learner is on. The quiz
keeps `answersRef` and resolves the recommended gap at click time (`openRecommendedLesson`,
`openRecommendedSimulator`). The runner's standalone self-mark fallback derives from `prev` instead of
reading the render. Two testids were added for addressable controls: `btn-milestone-<milestoneId>` and the
two recommendation jumps.

**The sweep's oracle is the app, not a written expectation.** For one ordered pair of controls it runs the
page twice from a clean load: *task* (both controls resolved from the pre-click DOM, clicked with no commit
between) and *separated* (click, let React commit, re-resolve, click). It fingerprints the page afterwards
- all visible text, every input value, the `mechalab*` storage except the learning log, whose timestamps
differ by design - and fails when the two disagree. Pairs that write absolute values are in the list as
controls: they must come out equal, which is what proves the sweep is not flagging every pair it tries.
Out of scope and said so in the script: a reader that only *exists* after the writer's click (open a modal,
then a button inside it) has nothing stale to read. The runner's own pair stays in
`e2e_browser_workbench.mjs`, which already pays for the Pyodide boot.

**Evidence.** With the two app fixes reverted (patch kept in `/tmp`, restored after): tour cases fail as
`task ... (Step 2 / 8 ...)` vs `separated ... (Step 3 / 8 ...)` and `Step 8` vs `Step 1`; with only the
pre-fix quiz handler back, the task arm opens `Lesson P.14` while human pace opens `Lesson 00.1`. Green
afterwards: 17/17 pairs, and `npm run test:workbench` smoke 1.6 s / e2e 24.1 s / pages 26.7 s / pairs 32.3 s.

**Found, not fixed.** The guided tour's *Apply Demo Preset* (and the roadmap's preset buttons) call
`onLoadPreset`, which in `App` only switches tabs: the prop is declared in eight tabs and called in
`TabArchitecture` alone, so no *simulator* ever receives a preset — and the tour's promise ("watch the filter surgically erase the
vibration peak") is not implemented anywhere. Presets need per-simulator values and a decision about
them; recorded here rather than guessed at.

## [2026-10-18] — Run 95: Run Reads the Editor, Not the Render

The stale-code bug Run 94 found and documented is fixed at its cause. `Run & Verify`'s click handler
closed over the `code` the button was *rendered* with, so when `Load Solution` and `Run` landed in one
task the solution's `setCode` had not committed yet and the starter ran instead — silently, and with
the starter's `NotImplementedError` reported as the reference's failure.

- **The editor's live text is what runs.** `codeRef` is written synchronously by every editor write
  (`commitCode`: lesson select, Reset Starter, Load Solution, typing) and re-confirmed after each
  commit, and `Run` executes `codeRef.current` at click time.
- **The lesson is resolved at click time too.** `runPythonCode` now takes the lesson it grades and
  derives its match mode from it, so a lesson switch and a run in the same task cannot grade the new
  text against the previous lesson's instructor tests.
- **Coverage that fails without the fix.** The dev-server suite's step 5 now clicks Load Solution and
  Run in one task (reverted: `status-assert-passed` times out, rc 1; with the fix: green). The bundle
  sweep no longer waits for React to commit the reference before running it, so all 48 packages
  exercise same-task Run, and a stale run there is named as such instead of as a missing PASS line.
- The sweep stays at **3.6 s** for 48 packages, so removing the commit wait costs nothing and the
  suite now proves the stronger claim.

## [2026-10-18] — Run 94: The ~100 ms Was the Harness, Not the Runner

Measured the runner's click-to-result cycle from **inside the page** (a MutationObserver on the status
and badges, `performance.now()` around a synthetic click) and from outside it:

| | measured |
| --- | --- |
| click -> badges updated, in the page | **8-14 ms** |
| long tasks during that cycle | **0** |
| the same cycle through Playwright (click, `waitForFunction`, reads) | **~100-130 ms** |

So there was nothing to cut in the runner: one run is two warm worker messages and a small React
commit, and the browser reports no long task at all. The 100 ms was the *test harness* - actionability
checks, an IPC round trip per locator, `waitForFunction` polling at rAF granularity.

- **The sweep moved into the page.** `gradeInPage` is one `page.evaluate` that clicks each lesson, waits
  for the editor to commit, runs the starter and the reference, and returns the stdout and badges it
  saw. Waits are 2 ms polls in the page instead of CDP polls, and the assertions run in Node on exactly
  the strings the page returned.
- **Run 93's two-page fan-out is gone**: it existed to hide CDP chatter, and with the loop in the page
  a second page measured +0.2 s (its own load and runtime) and buys nothing.
- Same assertions, same messages, plus a five-minute sweep budget and a per-entry `problem` naming the
  state it was stuck in, so a stuck app fails as `EX.… its starter run never reported (status …)`
  rather than a generic timeout.
- A real finding along the way: **Load Solution then Run in the same task runs the stale program** -
  the click handler captures the code it was rendered with, so the suite now waits for the editor to
  commit the reference before clicking Run. A human cannot click that fast; worth knowing anyway.

| | before | after |
| --- | --- | --- |
| Chromium sweep, 48 packages | 8.9 s | **3.6 s** |
| bundle suite, standalone | 15 s | **10 s** |
| `npm run test:workbench` | 17-19 s | **12-16 s** |

## [2026-10-18] — Run 93: The Sweep Is Latency, Not Python

Measured the bundle suite's 48-package sweep before touching it, and the hypothesis did not survive:
there is **no reload per package** — the sweep clicks through the lesson list in one page and reuses
one warm Pyodide worker. Per package, 12 of them instrumented: select 77 ms, starter run 174 ms, load
reference 37 ms, reference run 84 ms, reads 2 ms. The interpreter is a few tens of ms of that; the rest
is Playwright/CDP round trips.

| | before | after |
| --- | --- | --- |
| Chromium sweep, 48 packages | 13.9 s | **8.9 s** |
| bundle suite, standalone | 19 s | **15 s** |
| bundle suite, inside the combined run | 18-20 s | **16.3-18.0 s** |
| `npm run test:workbench` | 19-21 s | **17-19 s** |

- **Two pages, not one.** Each run is a warm round trip, so a second page of the same bundle grades the
  other half of the list: 48 packages took 13.4 s on one page and 8.7-9.6 s on two (measured with the
  page load included; three and four pages were no better, and the sample stays on one page where a
  second load would cost more than it saves).
- **One round trip per state.** The starter/expected text and each run's three badge/stdout readings
  are now single `page.evaluate` calls instead of four `getByTestId(...)` calls, and the explicit
  `scrollIntoViewIfNeeded` is gone (a locator click scrolls the entry into view itself).
- Every assertion is unchanged: the starter still must carry its holes and self-check, fail on a
  `NotImplementedError`, and not be graded MATCHED; the reference must match and pass the behavioural
  badge. A doctored expected output still fails the two-page sweep, naming the package.

On the runners the sweep is too noisy to claim a number: 17.4 s and 23.0 s for the same code on two
neighbouring runs, 18.4 s after. The Workbench step went 29 -> 26 s and the job 81 -> 74 s, which is
one sample each and within that spread. The clean comparison is the local one above.

## [2026-10-18] — Run 92: The Dev-Server Suite Shares One Runtime

Measured before changing anything, because the guess was wrong: a Pyodide boot costs **1.3-1.9 s**
and a warm run **0.04-0.06 s**, so the suite pays for the number of *boots*, not runs - and the
biggest single item in its 22-24 s was not a boot at all.

| | before | after |
| --- | --- | --- |
| bad-CDN scenario (the runtime must fail to load) | 10.4 s | **0.1 s** |
| formatting + shared-plant scenarios | own browser context (own page, own download, own boot) | same page, `mechalab*` keys cleared + reload |
| `npm run test:e2e`, standalone | 22 s | **13 s** |
| `npm run test:e2e`, inside the combined run | 23.8-24.7 s | **12.8-15.2 s** |
| `npm run test:workbench` | 24-26 s | **19-21 s** |

- **The CDN negative path pointed at an unresolvable host** (`invalid.cdn.mechalab.local`), so the
  loader sat on DNS for ~10 s before reporting the failure the suite asserts. It now points at
  `http://127.0.0.1:1/pyodide/` - a refused connection, the same "runtime could not be loaded"
  failure, answered in ~0.1 s. That one line was most of the suite's wall clock.
- **One page, one context.** The formatting and shared-plant scenarios used to open a second browser
  context: a second page, a second Pyodide download and a second runtime, for two scenarios that only
  needed the *progress counters* at zero. They clear every `mechalab*` key and reload instead.
- The runtime is still re-booted where a scenario is about the runtime dying - the trace-step limit,
  the Stop button, the load failure, and the reload that proves persistence - so those assertions are
  untouched. Locally the suite now hands the pole to the bundle suite: 12.8-15.2 s against 18-20 s.

**On the runners that win does not transfer**, and the log says why: the dev suite was 23.2 s before
and 22.9 s after, and the Workbench step stayed at 29 s because the bundle suite (28.0-28.7 s) is the
pole there. Most of my 10 s was a *local* macOS resolver sitting on the nonexistent CDN host for
~10 s; GitHub's resolver answers NXDOMAIN immediately, so that scenario was already ~0.2 s on CI. The
second context went too, for ~0.3 s. What this run buys on the runner is a simpler suite, not a
shorter step - the next lever is the bundle suite's 48-package Chromium sweep.

## [2026-10-18] — Run 91: Every Package Graded Once, the Second Browser Samples

The built-bundle suite graded all 48 exercise packages in Chromium *and* again in Firefox: 96
gradings, and every one is two Pyodide runs (starter, then reference), so the same 48 verdicts were
produced twice from the same bundle, the same interpreter and the same packages.

- **The exhaustive pass is still exhaustive.** The first selected browser (Chromium) grades all 48:
  starter fails on its `NotImplementedError`, the reference matches the expected output, and the
  behavioural badge passes. A single-browser run (`PLAYWRIGHT_BROWSERS=chromium|firefox`) is
  exhaustive too, so nobody loses the sweep by asking for one browser.
- **The second browser grades a sample** (`sampleExerciseIds`): the first package of every track (a new
  track is in the sample the run after it lands) plus both ends of the list - 9 of 48 here. Same
  assertions per entry, and the size is asserted, so a shrunken sample fails rather than passing
  quietly. The DOM count of `EX.*` entries is still the full 48 in *every* browser, so a bundle that
  dropped an entry still fails there.
- Gradings per workbench run: **96 -> 57**; Pyodide interpreter runs: **192 -> 114**.
- Measured (8-core Mac): the bundle suite 24.5 -> 18.9 s inside the combined run (21 -> 19 s on its
  own); Firefox's sweep 15.9 -> 4.1 s. The three-suite run itself stays ~24-26 s, because the
dev-server suite (23.8 s) is now the longest of the three - the saved work was no longer on the
  critical path.
- Negative path: with one sampled package's expected output doctored, the Firefox pass fails naming
  it (`firefox: EX.00-foundations.T1.00a reference must match its expected output`).

## [2026-10-18] — Run 90: One Workbench Run, One Server Pair

Measured on an 8-core Mac; same suites, same verdicts, same coverage.

| Workbench suite | before (one after another) | after (`npm run test:workbench`) |
| --- | --- | --- |
| `test:smoke` (SSR: App, Runner, Quiz, export) | 2 s | 0.9 s |
| `test:e2e` (dev server, Chromium, Pyodide) | 22 s | 23.5 s |
| `test:e2e:pages` (built bundle, Chromium + Firefox) | 38 s | 24.5 s |
| **the three, end to end** | **62 s** | **25 s** |

- **`scripts/test_workbench.mjs`** builds `dist/` only when it is missing, starts one dev server and
  one Pages-shaped static server, then runs the smoke suite in-process against that same dev server
  (its SSR modules come out of the graph the browser suites load) and the two browser suites side by
  side in child processes, each given a URL (`E2E_BASE_URL`, `PAGES_SERVER_URL`) instead of booting
  its own. Output is prefixed per suite, and any suite failing fails the run.
- **The built-bundle suite drives Chromium and Firefox at the same time**: separate browser contexts
  against the same served bundle, verdicts collected in the requested order, a missing browser still
  reported as SKIP. That is most of its 38 s.
On the GitHub runners, `main` at `8a6c8da` (run 39169605826) against this branch at `d3be7bd`
(run 39173331743), same matrix and same gates:

| job / step | before | after |
| --- | --- | --- |
| `verify-and-test`, macOS, Python step | 105 s | **32 s** |
| `verify-and-test`, ubuntu, Python step | 59 s | **36 s** |
| `build-workbench` | 89 s | **70 s** |
| run start -> `build-workbench` done | 228 s | **127 s** |

One sample per side, and the macOS Python step ranged 24-40 s across the neighbouring `main`
pushes, so 32 s is the fast end of that band rather than a new floor. Nothing was dropped: both legs
ran the same 18 gates, the 194-test discovery run and the 48-package sweep.

- **Firmware job:** `--compile-arduino-cli` now warms the `arduino:avr` core with one sketch before
  fanning out over the ten. The separate Arduino Uno workflow went red once on a fresh runner with a
  bare `collect2: error: ld returned 1 exit status`, and the rerun of that same job passed; the only
  state those ten processes share is the first build of the core archive, so the warm build leaves it
  complete for the rest to read (and a broken toolchain fails once, with one message). That is a
  narrowed window rather than a proven fix - local cold-cache repeats (three script runs, four rounds
  of all ten at once) never reproduced the failure.
- `test:smoke`, `test:e2e` and `test:e2e:pages` still run standalone, creating their own servers.
- **CI**: the KaTeX audit left the Python job to run in `build-workbench`, where `npm ci` has already
  installed `katex` from the lockfile - so neither `verify-and-test` leg sets up Node anymore, or
  re-fetches a pinned dependency with `npm install --no-save`. Playwright's browsers are installed in
  their own step, once, for both browser suites.

## [2026-10-18] — Run 89: The Verification Gates Run in Parallel

Measured on an 8-core Mac (4 performance cores); every number is wall-clock for the same work and
the same verdicts.

| gate | before | after |
| --- | --- | --- |
| `scripts/run_exercise.py` (48 packages, ~340 interpreters) | 39 s | **15 s** |
| `python3 -m unittest discover -s tests` (194 tests) | 57 s | **22 s** |
| the same, reusing CI's report (`RUN_EXERCISE_REPORT`) | 57 s | **15 s** |
| the CI `verify-and-test` Python step, end to end | ~105 s | **40 s** |
| `tests/test_module_full_solutions.py` (46 package discovers) | 6.3 s | **2.6 s** |
| `tests/test_exercises.py` (20 g++ compiles + 10 runs) | 6.1 s | **2.9 s** |
| `extract_and_compile_sketches.py --compile-arduino-cli` (10 sketches) | ~24 s | **4 s** |

- **Packages are checked in parallel.** `run_exercise.py` takes `--jobs/-j` (default: one worker per
  performance core, capped at 8); a package is an independent unit that spawns its own interpreters
  and writes only inside a temp dir, so two workers cannot tread on each other. `-j 1` is the old
  serial path, and the serial and parallel reports are byte-identical, ordered by package.
- **The 48-package sweep runs once in CI.** `run_exercise.py --report-file` writes the machine-readable
  report; `tests/test_exercise_package.py` reads it from `RUN_EXERCISE_REPORT` instead of running the
  sweep again, and refuses a report that does not name every package on disk, so a stale or partial
  report cannot quietly shrink the coverage. A doctored report is proved to fail the suite.
- **The other subprocess-heavy suites are parallel too**: the 46 per-module page-solution discovers in
  `test_module_full_solutions.py` (thread pool, verdicts asserted in discovery order) and the 20
  g++ compiles in `extract_and_compile_sketches.run_host_verify` (first failure in lesson order, so
  the message does not depend on timing).
- Nothing was dropped to get these numbers: 194 tests (2 new), every package still checked for its
  starter, both suites, its faults, its cheat submission and both flattened browser programs. The
  negative paths were re-run by hand: a broken sketch still fails the host g++ verify and still fails
  `--compile-arduino-cli`, and a doctored report file still fails the package suite.

---

## [2026-10-18] — Run 88: The Ratchet Now Covers the Suites That Grade the Rest

### 1. `tests/` is inside the assertion ratchet, and it was an f-string blind spot
- `scripts/lint_assertions.py` now reads `tests/*.py` as well as the graded exercise files. It had
  been scoring those 17 suites at **368 weak assertions**, and the measurement was wrong: the lint
  accepted only a bare string literal, so the f-string messages most of those suites already used
  (`f"{os.path.relpath(path, ROOT)} must not count as a ramp lesson"`) were reported as
  "not a literal string". An f-string is now flattened to its literal segments (each `{hole}`
  becomes `{}`) and its length and keyword checked like any other message.
- 368 → **0**, the same zero floor the exercise packages reached in Run 87, so a new test file or a
  new bare assertion in an existing one fails CI on the first push. `docs/assertion-baseline.json`
  stays at 0/0 files.
- Messages name the number a plausible bug produces and the formula to check it against, in the
  file's own terms: the plant's 2.40 mm peak error, the ladder paper's 0.3188 N.m holding torque,
  the skip store's `ceil(0.8 * count)` pass floor, the parity gate's `executable:shared_plant` item.

### 2. `--json` prints JSON and nothing else
- The human summary line (`OK: ...`) used to follow the JSON object on stdout, so
  `lint_assertions.py --json | jq` failed with "Extra data: line 6". It now goes to stderr, and
  `tests/test_lint_assertions.py` asserts stdout parses on its own and that a `1` exit carries the
  baseline problems that caused it.

### 3. A merge that merged the wrong content
- PR #16 was opened from a stale local branch, so it re-squashed the previous block's diff onto
  `main`; #17 carries the real Block 1 commit and is the one that landed. `git push -u origin
  <branch>` now names the refspec explicitly (`HEAD:refs/heads/<branch>`) so a reused branch name
  cannot push an older tip.

---

## [2026-10-18] — Run 87: Block 1 Closed — Every Graded Assertion Now Explains Itself

### 1. 593 → 0 weak assertions, 41 → 0 files
- The remaining 593 bare assertions are gone across four burn-down rounds (this entry also covers
  PRs #12–#15, which shipped without changelog entries of their own): the whole 01-electronics
  track (134), then two rounds of six packages each (186 and 142), then the final 131 in 12 files.
- Every graded assertion in `test_behavior.py`, `test_transfer.py` and `selfcheck.py` now carries a
  message naming **what was expected**, the number a plausible bug produces, and the formula to
  check — the Core-route learner studying alone has a mentor in the failure output.
- The ratchet in `docs/assertion-baseline.json` is now a plain zero floor: a new graded file, or a
  new bare assertion in an existing one, fails CI on the first push.

### 2. `python3 -m unittest discover -s tests` is the test entry point
- Discovery had been failing on the macOS system interpreter: `scripts/extract_and_compile_sketches.py`
  annotated `extra_dir: str | None`, a PEP 604 union that raises `TypeError` at import on Python 3.9.
  `from __future__ import annotations` makes the annotation a string, and 189 tests now pass on both
  3.9.6 and 3.15.
- CI's hand-maintained list of 15 `python3 tests/test_*.py` lines is replaced by one
  `python3 -m unittest discover -s tests`, which runs all **17** suites — including
  `test_sketch_host_verify.py` and `test_module_full_solutions.py`, which the old list never ran.
  `CONTRIBUTING.md`'s runbook gives the same command.

---

## [2026-10-18] — Run 86: Foundations Tail Closed, 737 → 593, and a Per-Track Report

### 1. The last four 00-foundations packages, plus the robotics runner-up
- `00-foundations.T3.00a` (37), `06-robotics.T2.06b` (37), `00-foundations.T1.00a` (35) and
  `00-foundations.T2.00c` (35) now carry a message on every graded assertion in both graded files.
  Every 00-foundations package is at zero.
- **144 messages**, baseline **737 → 593** across **49 → 41** files.
- The messages keep the theory where it belongs: R^T R must be the identity for long rotation
  vectors (the missing `sin(theta)/theta`), the first-order coefficient at a nanoradian (the 0/0
  branch), `range(n)` ending at n-1, and overshoot as `exp(-pi zeta / sqrt(1 - zeta^2))` rather
  than the short form that is only close at zeta = 0.5.

### 2. `lint_assertions --tracks`
- The report groups the same counts by track, worst first, and `--write-baseline` records the same
  breakdown under `tracks`, so the next round's packages are read off the data instead of
  recomputed in a one-off script. The ratchet itself is unchanged: it still reads `files` and
  `total` only, so the track table can never loosen the floor.
- Current shape: `01-electronics` 134 / 8 files, `00-foundations` 115 / 11, `05-control` 82 / 7,
  `04-embedded` 64 / 3, `02-mechanics` 58 / 4, `03-sensors` 58 / 3, `07-systems` 34 / 2,
  `06-robotics` 30 / 2, `08-capstones` 18 / 1.

### 3. Verification
- All four packages re-graded with `run_exercise.py --only <id>`: starter fails, solution passes,
  every fault fails its named test — exit 0 for all four.
- `git diff -U0 -- exercises | grep '^-.*def test_'` is empty: no test deleted, renamed or loosened.
- `lint_assertions` clean at the new floor (593 / 41); `test_lint_assertions` 15/15 including the
  four new track tests; 17/17 `tests/test_*.py`, plus `verify_repo`, `validate_modules`,
  `lint_lessons`, `check_term_order`, `audit_math`, `run_all_labs`, `npm run lint`, `npm run build`.

---

## [2026-10-18] — Run 85: Fifth Burn-Down Round — Foundations First, 975 → 737

### 1. Four foundations packages and two more, both graded files each
- `00-foundations.T1.00d` (41), `00-foundations.T2.00e` (41), `01-electronics.T2.01b` (40),
  `00-foundations.T2.00g` (39), `06-robotics.T3.06b` (39) and `00-foundations.T2.00h` (38) now carry
  a message on every graded assertion in both `test_behavior.py` and `test_transfer.py`.
- **238 messages**, baseline **975 → 737** weak assertions across **61 → 49** files.

### 2. What the foundations messages teach
- The four traps that share one page family get their own words: `atan(y/x)` losing the quadrant,
  a companion matrix whose poles are the physics, a PPO clip that must stay pessimistic for negative
  advantages, and a resonance peak that sits below wn. Each message names the wrong number the bug
  produces, not just the right one.
- Assertions inside measurement loops (the plant's lock-in Bode sweep, the shield's per-tick
  callback) carry a sentence about the whole loop, so no `%`-interpolated message re-enters the file.

### 3. Verification
- All six packages re-graded with `run_exercise.py --only <id>`: starter fails, solution passes, every
  fault fails its named test — exit 0 for all six.
- `git diff -U0 -- exercises | grep '^-.*def test_'` is empty: no test deleted, renamed or loosened.
- `lint_assertions` clean at the new floor (737 / 49); 17/17 `tests/test_*.py`, plus `verify_repo`,
  `validate_modules`, `lint_lessons`, `check_term_order`, `audit_math`, `run_all_labs`, `npm run lint`
  and `npm run build`.
- Remaining worst packages: `00-foundations.T3.00a` and `06-robotics.T2.06b` (37 each), then
  `00-foundations.T1.00a`, `00-foundations.T2.00c` and `01-electronics.T1.01d` (35 each).

---

## [2026-10-18] — Run 84: Fourth Burn-Down Round — The Next Six, 1247 → 975

### 1. The six worst packages, both graded files each
- `04-embedded.T1.04b` (48), `07-systems.T3.06a` (47), `04-embedded.T2.04a` (45),
  `06-robotics.T2.06a` (45), `04-embedded.T2.04d` (44) and `07-systems.T2.07a` (43) now carry a message
  on every graded assertion in both `test_behavior.py` and `test_transfer.py`.
- **272 messages**, baseline **1247 → 975** weak assertions across **73 → 61** files — the first round
  under a thousand, and all twelve touched files are at zero rather than merely lower.

### 2. What each message says
- Expected value with units, the wrong answer it stands against, the cause that usually produces it,
  and the line to check: the uint32 mask on `micros()`, the 14-byte PubSub header paid per frame, the
  half-buffer window built from N rather than 2N, the QoS offer-request inequality, the square-root
  bus voltage, the modulo-16 counter step.
- Loop assertions that used to interpolate the index with `%` now carry one literal sentence about the
  whole loop; `lint_assertions` only accepts literal strings, and the position was never the lesson.

### 3. Verification
- All six packages re-graded with `run_exercise.py --only <id>`: starter fails, solution passes, every
  fault fails its named test — exit 0 for all six.
- `git diff -U0 -- exercises | grep '^-.*def test_'` is empty: no test deleted, renamed or loosened.
- `lint_assertions` clean at the new floor (975 / 61); every `tests/test_*.py` green (17/17), plus
  `verify_repo`, `validate_modules`, `lint_lessons`, `check_term_order`, `audit_math`, `run_all_labs`,
  `npm run lint` and `npm run build`.
- Remaining worst packages: `00-foundations.T1.00d` and `00-foundations.T2.00e` (41 each), then
  `01-electronics.T2.01b` (40), then `00-foundations.T2.00g` and `06-robotics.T3.06b` (39 each).

---

## [2026-10-18] — Run 83: Third Burn-Down Round — Whole Packages, 1549 → 1247

### 1. Six packages, every graded file in each
- `05-control.T2.05a`, `01-electronics.T2.01a`, `02-mechanics.T3.02a`, `04-embedded.T1.04a`,
  `00-foundations.T1.00b` and `06-robotics.T1.06a` are now **clean as packages**, not just as behaviour
  suites: both `test_behavior.py` and `test_transfer.py` in each carry a message on every graded
  assertion. That is the difference this round was asked for — the last two rounds left transfer suites
  behind, so a "clean" file still sat next to a silent one.
- **302 messages**, baseline **1549 → 1247** weak assertions across **85 → 73** files.
- The cause in each message comes from the file it sits in (the `sqrt(1 - zeta^2)` factor, the
  `1 + t/(2R)` stress concentration, the uint16 subtraction width, the `6dq/T²` coefficient, the
  dropped Kelvin pad), so a learner who reads it is told where to look, not just that they were wrong.

### 2. Verification
- All six packages re-graded with `run_exercise.py --only <id>`: starter fails, solution passes, every
  fault fails its named test — exit 0 for all six.
- No test was removed or renamed in the diff (`grep '^-.*def test_'` over the changed files is empty),
  so the messages did not ride on deleted coverage.
- `lint_assertions` clean at the new floor; full local chain 42/42.
- Remaining worst packages: `00-foundations.T2.00e` and `07-systems.T3.06a` at 33, then five at 31.

---

## [2026-10-18] — Run 82: Second Burn-Down Round — 1768 → 1549

### 1. Six more suites, 219 more messages
- `04-embedded.T2.04c` (36), `03-sensors.T3.03a` (38), `01-electronics.T1.01c` (36), `05-control.T1.05a`
  (36), `03-sensors.T2.03a` (34) and `00-foundations.T1.00e` (35) now carry a message on every graded
  assertion: expected value, what a different answer implies, the cause the file's own comments name,
  and what to check.
- Two pre-existing messages in `T1.00e` were replaced rather than kept — both lacked a
  check/likely/expected keyword, and one was 39 characters, so the earlier `--write-baseline` had
  already counted them as weak. Replacing them is the burn-down working, not a regression.
- `docs/assertion-baseline.json` lowered: **1768 → 1549** weak assertions across **91 → 85** files.

### 2. Verification
- Each of the six packages re-graded with `run_exercise.py --only <id>`: starter fails, solution passes,
  every fault fails its named test (exit 0 for all six).
- `lint_assertions` clean at the new floor; full local chain **42/42, exit 0**.
- Remaining worst: `00-foundations.T2.00e` and `06-robotics.T1.06a` at 33 each, then five files at 31 —
  the next round's set.

---

## [2026-10-18] — Run 81: Assertions That Explain Themselves, and a Validator That Runs Anywhere

### 1. The assertion bar is a rule now (A4, first half)
- `scripts/lint_assertions.py` reads `exercises/*/test_behavior.py`, `test_transfer.py` and `selfcheck.py`
  with `ast`, and requires every graded assertion to carry a literal message of **at least 40 characters**
  containing **check**, **likely** or **expected**. `assertRaises`/`assertWarns`/`assertLogs` are exempt:
  their message is the exception and the test name already says what is refused.
- The rule runs against `docs/assertion-baseline.json`, a ratchet that fails in three directions: a file
  above its recorded count, a file with no entry at all (debt may not start), and a baseline *above* the
  tree (so a burn-down must lower it). `--write-baseline` is the only way the floor moves, and it
  regenerates the total in the same commit.
- `tests/test_lint_assertions.py` (11 tests) proves each clause of the bar — missing, short, no cause,
  non-literal, and the `assertRaises` exemption — plus each direction of the ratchet.

### 2. Six packages burned down: 2014 → 1768
- The six worst behaviour suites (`01-electronics.T3.01a`, `04-embedded.T2.04b`, `03-sensors.T1.03a`,
  `04-embedded.T3.04a`, `08-capstones.T3.07a`, `00-foundations.T2.00f`) now carry a message on **every**
  graded assertion — **246** added, each naming what was expected, what a different answer implies, the
  likely cause from that file's own comments, and what to check.
- Every package was re-graded with `run_exercise.py --only <id>`: starter still fails, solution still
  passes, all faults still fail their named test. No assertion value, delta or test was changed.
- The baseline records the new floor; CI fails if any of those six regains a bare assertion.

### 3. `validate_modules.py` no longer crashes on real YAML (the follow-up request)
- `scripts/frontmatter_lists.py`: `list_field(mapping, key)` normalises the four shapes an author can
  write — missing, `key:` empty (`None` under PyYAML, `[]` under the fallback parser), a bare scalar, and
  a list. `validate_modules.py` now reads every list-valued field through it (`legacy`, `prereqs`,
  `introduces`, `new_concepts`, `uses`, `owns`).
- The crash was environment-dependent, which is why CI never saw it: this Mac's Python 3.9 **has** PyYAML,
  so `uses:` parsed to `None` and `set(None)` raised `TypeError`; the 3.12 runner has no PyYAML, so the
  fallback parser returned `[]` and the same code passed.
- `tests/test_frontmatter_lists.py` (9 tests) pins all four shapes, the scalar-wrap rule, the refusal of a
  non-list, and asserts the validator has no remaining bare `.get(key, [])` on those fields. The script's
  docstring now states the one real requirement left: its page bodies execute, so it needs **Python 3.10+**
  for the pages' own `int | None` syntax (the front-matter handling itself is version-independent).

### 4. Verification
- `test_lint_assertions` 11/11, `test_frontmatter_lists` 9/9 on **both** interpreters (3.12 skips the
  PyYAML-only case), `lint_assertions` clean at the new baseline, all 47 exercise packages re-graded.
- `validate_modules.py` OK on 3.12; on 3.9 it now reaches page execution and stops only at the pages'
  `int | None`, which is the documented 3.10+ requirement rather than a front-matter crash.
- Full chain and CI results are recorded in the PR that lands this run.

---

## [2026-10-18] — Run 80: A Claim About Evidence, a Smaller Required Set, and a Log That Measures Friction

### 1. `docs/SIM_ROUTE.md` says what its hours are worth (A1)
- A generated status line, `**Route status: `<value>`**`, with exactly three values: `unvalidated`,
  `author-dogfood` (current), `pilot-validated`. `generate_sim_route.py` refuses to render the third unless
  `docs/pilot-results.md` declares **5+ non-author participants**; that page now carries the machine-readable
  count (`Participants (non-author): 0`), so the claim and the file that would justify it cannot drift apart.
- `tests/test_sim_route.py` grew from 6 to 10 tests: one status line with an allowed value, the gate's own
  negative case (four participants do not support `pilot-validated`), the declared count matching the
  declared status, and the README quoting the generated **module count** and **Tier 2 count**, not just the
  hours. A moved module was exactly the change that would have left "42 modules" standing while the table
  said 40.
- The 343-hour figure the plan asked to retire was already gone; the README and route doc agreed on
  `182.5–226 h` before this run. What was missing was the evidence field, not the arithmetic.

### 2. Two Tier 2 modules leave the required route (C1)
- `04-embedded.T2.04c` (Zephyr) and `04-embedded.T2.04d` (micro-ROS) move to Extensions, with the reason
  rendered next to them on the generated page: Zephyr is a second RTOS toolchain on top of the FreeRTOS unit
  that already teaches preemption and priority inversion, and nothing on the required route consumes the
  MCU-to-ROS-2 bridge. Both keep their ladder place, graded package and badge.
- Core is now **40 modules / 174.5–218 h** (Tier 2: 18 modules / 71.5 h); Extensions are **8 modules /
  37.5 h**. README, the generated route, the step-size audit (24 pages, regenerated) and the two sim-route
  totals all moved together; `tests/test_sim_route.py` fails if any of them disagrees.

### 3. The workbench records what a learner actually did (A3)
- `app/src/learningLog.ts`: an append-only, capped (5000 events) localStorage log of `lesson_open`, `run`
  (outcome, duration, first failing line), `verified`, `hint` (level), `solution_open` and `export`. No
  network, no identity; a disabled or full storage never breaks the runner.
- Wired into the runner at the points that matter: one event per lesson visit, one per execution recorded
  where every result branch converges rather than in six places, hint level on each reveal, solution loads.
- **Export Learning Log (.json)** button in the header. `scripts/friction_report.py` turns exports into
  `docs/friction-report.md`: attempts-to-verify P50/P80 (nearest-rank, no interpolation), help share,
  unfinished share, median minutes to first success, most common first failing assertion, active minutes
  excluding gaps over 15 minutes — and the plan's four red flags at their stated limits.
- The page is published empty and says N = 0; `tests/test_friction_report.py` (7 tests) proves the arithmetic
  against synthetic logs, that each limit fires, that a healthy log has no flags, and that a foreign schema
  is refused rather than averaged in. The browser E2E asserts the log was written by the real UI, including
  the first failing line from a failed run.

### 4. Verification
- `test_sim_route` 10/10, `test_friction_report` 7/7, `check_ramp_lessons` OK, `lint_lessons` OK (48 + 6),
  `generate_sim_route --check` and `friction_report --check` current, `validate_modules` OK on 3.12.
- Local chain and CI results are recorded in the PR that lands this run.

---

## [2026-10-18] — Run 79: Coming Back After a Break Gets a Twenty-Minute Path

### 1. `docs/REENTRY.md` — five paper tasks, three landings, no rereading
- The gap it closes: the ramp repairs a *first* learner, and the exit check tests one who is ready now.
  Neither serves the person returning after weeks away, who can explain a rate and cannot get `18.408`
  without a unit error. The page is a five-task, twenty-minute paper check drawn from exit items 1, 8,
  11, 12, 13 and 14, and a score table that sends `5/5` back to the page you left, `3–4` to the one or
  two ramp lessons for the misses, and `2 or fewer` to R.1–R.6 and then the exit check.
- The five tasks touch **all six** ramp lessons between them: task 3 carries both halves of the state tick
  (R.3) and the matrix form (R.4), because they are one operation and a learner who lost one has lost the
  other. Between them the tasks sample every ramp lesson, which a link check cannot see.
- `§3 Picking up the thread` names what to open from each stopping point (mid-lesson, between pages,
  after Gate 1→2) with the rule underneath: **a page is re-entered by running its code, not by reading
  it**. `§4 What to skip` argues the placement quiz, already-passing packages, the practical gates and the
  bench are all out of scope for a return.

### 2. The page is tested against the pages it borrows from
- `tests/test_reentry.py` (6 tests) parses the task table and requires every cited exit item to exist, to
  be repaired by the lesson the row claims, and every cited lesson to exist in `ramp/`. It requires the
  union of cited lessons to equal the ramp's own lesson set, so a dropped task cannot silently stop
  sampling an operation.
- Every decimal in the answer key must appear in `docs/TIER1_EXIT_CHECK.md`: the key is prose, and a
  change to item 11's answer fails this test until REENTRY moves with it. Four negative paths are asserted
  in the test itself — a missing item, a lesson outside `ramp/`, a dropped task, a drifted number.
- `README.md`, `docs/TIER1_EXIT_CHECK.md` and `ramp/README.md` all link the page, and the test fails if any
  of the three stops: a returning learner arrives from the last page they finished.

### 3. One repair outside the new page
- Writing §4 meant running the command it names, and `python3 scripts/run_exercise.py <id>` **ignores a
  bare id**: it re-graded all 47 packages instead of the one asked for. The flag is `--only`; §4 now
  states it, says what the bare form does, and `tests/test_reentry.py` runs the documented command and
  requires it to grade exactly one package in under a second (0.386 s, 11 checks for T2.00a).
- The same check found `docs/ERROR_EXPLAINER.md` entry 13 telling readers to run
  `python3 -m unittest discover -s exercises/<id> -p 'test_*.py'`, which fails with
  `EXERCISE_TARGET is not set` on every package. Entry 13 now gives the `--only` form and says why the
  discover form cannot work: the suite grades whichever submission it is pointed at.

### 4. Verification
- `tests/test_reentry.py` 7/7 including its four doctored-page negative paths and the live command check.
- `verify_repo.py`, `clean_tex`, `audit_math`, `validate_modules.py`, `check_ramp_lessons.py` and
  `lint_lessons.py` green; full local CI chain 37/37.

---

## [2026-10-18] — Run 78: The Ramp Reaches Phasors and Frequency Response

### 1. R.5 and R.6 finish the six operations
- `ramp/R.5-phasors.md`: a rotation and a length in one number, turning by multiplying, and arrows adding
  part by part. `3∠0° + 4∠90° = 3 + 4j` is `5` at `53.130°`, and three unit arrows 120° apart sum to
  `4.003e-16` - the reason a balanced three-phase set carries no neutral current.
- `ramp/R.6-frequency-response.md`: the joint shaken at `2`, `20` and `200 rad/s`, with gain and phase
  measured from one steady period and compared against `1/sqrt(1 + (omega*tau)^2)` and
  `-atan(omega*tau)`. The corner is `3.183099 Hz` (`tau = 0.05 s`), where the measured pair is `0.7074`
  and `-44.426°` against the formula's `0.7071` and `-45.000°`. The `200 rad/s` row keeps the honest
  discretisation gap (`-79.798°` measured vs `-84.289°` predicted) and explains it as the 1 ms hold.
- `concepts` stay at two per lesson: `lint_lessons.py` passes with 48 beginner + 6 ramp lessons.

### 2. The exit check is fourteen items
- Items 13 (`3 + 4j` -> `5` at `53.130°`) and 14 (corner `20 rad/s = 3.183099 Hz`, gain `0.7071`,
  phase `-45°`), each mapped to its lesson. Thresholds become `14/14`, `12-13`, `9-10`, `< 9`, and the
  score table, mermaid and answer block move with them. `ramp/README.md` and the README's ramp row now
  say six lessons / fourteen items, and the "deliberately absent" note is retired because nothing the
  plan named is absent any more.

### 3. One check change, and why
- `lint_lessons.py` banned `complex numbers` and `j omega` in "Tier 1 lessons", and the ramp files are
  linted by the same function. R.5 exists to introduce exactly that vocabulary numerically before Tier 2
  names it, so the ban now skips `ramp/R.*.md` only; `is_ramp_lesson()` names the exemption and the 48
  beginner lessons keep the check.
- Negative path, now automated in `tests/test_lint_lessons.py`: the same R.5 text copied one directory
  out of `ramp/` still fails with `Contains banned Tier 2/3 jargon in Tier 1 lesson: complex numbers /
  j*omega`. The test also asserts the waiver is load-bearing - that at least one ramp lesson really does
  use a banned term - so it cannot pass by the exemption quietly waiving nothing.

### 4. Verification
- `check_ramp_lessons.py` OK: 6 lessons print their Expected Output and every item points at one.
- `lint_lessons.py` OK: 48 beginner + 6 ramp lessons.
- `verify_repo.py` PASS 143 files / 144 diagrams / 1875 links / 0 errors; `clean_tex --check` OK;
  `audit_math` PASS; `validate_modules.py` OK (72 modules); `test_error_explainer` and `test_sim_route`
  green after the README edit that keeps the Core-route claim quoted from the generated page.
- `tests/test_lint_lessons.py` 5/5: the waiver covers the ramp, stops at its directory, and still has
  something to waive.
- Full local CI chain (36 steps) plus build, smoke and both browser suites: see the run log.

---

## [2026-10-18] — Run 77: The Ramp Gets Vectors and Matrices, and Every Open Limitation Gets an Artefact

### 1. R.3 and R.4 close the two ramp lessons the plan named
- `ramp/R.3-state-vectors.md`: the joint as `[q, qd]`, one 10 ms tick advanced with the **old** speed,
  and `add`/`scale` slot by slot. Two 0.20 N m runs from rest add to the 0.40 N m run exactly
  (`q = 0.697230 rad`, `qd = 4.256926 rad/s`, superposition error `0.000e+00`), which is the property
  `A x` depends on.
- `ramp/R.4-matrix-updates.md`: the same tick as `x + dt (A x + B u)` with
  `A = [[0, 1], [0, -2.5]]`, `B = [[0], [50]]`. The matrix path and the two-line path agree to
  `0.000e+00` over 30 ticks, so a transposed or mis-signed `A` shows up as a number on the first run.
- Both lessons are written against the existing template, so `lint_lessons.py` (48 beginner + 4 ramp
  lessons) and `check_ramp_lessons.py` (every Full Solution prints its Expected Output) hold them to
  the same standard as R.1/R.2, with no exceptions carved.

### 2. The exit check grows to twelve items
- `docs/TIER1_EXIT_CHECK.md` adds item 11 (old-vs-new speed on one tick, `0.110` vs `0.112 rad`) and
  item 12 (`A x = [1.0, -2.5]`, and what row 1 means), so each new lesson repairs a row. The score
  table, thresholds (`12/12`, `10-11`, `8-9`, `< 8`), mermaid and answer block all move with it.
- `ramp/README.md` and the README's maths-ramp row now say four lessons and twelve items. The
  "deliberately absent" note no longer claims vectors are skipped, because they are not.

### 3. `docs/ERROR_EXPLAINER.md` — fifteen failures, one sentence each
- Built from the **author-dogfood** sittings and the modules' own Common-mistakes sections, labelled as
  such on the page: there is still no beginner pilot, and the page says so rather than implying one.
- Each entry is the message a learner actually sees (`ValueError: matrix columns must match vector
  length`, `math.sin(30) = -0.988`, a counter wrapping at 65535, a print-only `SELF-CHECK PASS`),
  one plain sentence, two or three concrete things to check first, and the page that teaches it.
- `tests/test_error_explainer.py` guards it: fifteen or more numbered entries, each with the three
  required sections and at least two checks, every cited page resolving on disk, and the README linking
  the page. Wired into `ci.yml`'s verify step and named in the README's validation list.

### 4. `docs/PILOT.md` + `docs/pilot-results.md` — the protocol, and a template that says N = 0
- The pilot cannot be run by an agent, so what is missing is made explicit instead of implied: stages
  (smoke, P1, P2, P3), the 15-minute rule, the help budget (< 1 in 3 lessons), the logging fields, and
  the reporting rules (counts beside every percentage, medians and ranges, top-10 stuck points with the
  change each caused, limitations per stage).
- `docs/pilot-results.md` is published as an empty template with `N = 0` at every stage and no numbers
  invented. `CONTRIBUTING.md` §2 now states that a beginner-completion claim needs a beginner sitting.

### 5. The previous turn's open refs are gone
- `main-pre-pr1` deleted and `origin/wip/split-t2-00a` removed after PR #1 merged; local `main` equals
  `origin/main` and the working tree is clean.

### 6. Verification
- `check_ramp_lessons.py` OK: 4 lessons print their Expected Output and every exit-check item points at
  one of them. `lint_lessons.py` OK: 48 beginner + 4 ramp lessons.
- `tests/test_error_explainer.py` 5/5; negative path: pointing entry 1 at `R.9-missing.md` fails with
  `points at ../ramp/R.9-missing.md, which does not exist`, restored.
- `verify_repo.py` PASS 141 files / 142 diagrams / 1859 links / 0 errors, `clean_tex --check` OK,
  `audit_math` PASS — the three new docs each needed a Mermaid diagram, which the first run caught.
- Full local CI chain re-run on Python 3.12 after the fixes: see the run log; build, smoke and both
  browser suites unchanged by docs-only edits but run anyway.

---

## [2026-10-18] — Run 76: The README's Main Claim Is the Core Route

### 1. What the front page used to say
- `README.md` section 1 offered three equal "completion routes" (learn & simulate / build / production
  practice) and never said which one was the requirement, so "complete" meant whatever a reader
  assumed. Section 2 then quoted `326.5 hours`, `84.0 h` / `124.5 h` / `118.0 h` and
  `~345.5–351.5 hours` from the pre-split syllabus - a course that disagreed with
  `docs/SIM_ROUTE.md` (Core `182.5–226 h`) and that nobody had to finish.
- Section 1 now makes one claim: **complete = the Core route**, `42 modules plus the prose tracks`,
  `182.5–226 hours`, summed from each page's own `est_hours` / `typical_hours` /
  `slow_learner_hours`. The six Tier 3 Extensions (`29.5 h`) are stated as **optional**, still
  graded and still badgeable. Hardware became *how you take* the Core route rather than a second
  curriculum, so the safety boundaries survive without pretending to be requirements.
- Section 2 carries one total only and points per-stage figures at `docs/SIM_ROUTE.md`; Steps 3-4
  name module counts instead of stale hours. The validation list now runs
  `generate_sim_route.py --check` and `tests/test_sim_route.py`.

### 2. The guard, so the claim cannot drift again
- `tests/test_sim_route.py` gained `test_the_readme_main_claim_is_the_core_route`: it reads the Core
  and Extensions totals **out of `docs/SIM_ROUTE.md`** and requires the README to quote both
  exactly, link the page, and call the Extensions optional. The test duplicates no number, so a
  regenerated route moves the assertion with it.
- Two stale counts fixed while there: the header badge said `68 Modules` (real: 72 formal modules)
  and `CONTRIBUTING.md` said "all 68 modules".

### 3. Verification
- `tests/test_sim_route.py` 6/6 OK; negative path: a README edited to `183.5–226` fails with
  `'182.5–226 hours' not found in ...`, then passes again once restored.
- `generate_sim_route.py --check` current; `validate_modules.py` OK (72 modules: 24 legacy, 48
  bridge [16 Tier 1] across 25 ladders; 48 beginner lessons); `verify_repo.py` PASS 136 files / 137
  diagrams / 1804 links / 0 errors.
- The full CI chain was run locally on Python 3.12: **34 steps, all green** - the 27-command verify
  step, `audit_math`, `run_all_labs`, `npm run build`, `test:smoke`, `test:e2e` (Chromium +
  Firefox) and `test:e2e:pages`.
- The browser run re-proved the grading claim from fresh code rather than a commit message:
  `a Tier 2 and a Tier 3 entry print their own PASS line and stay unverified`.

---

## [2026-10-18] — Run 75: A Real Spaced-Review Question on Every Non-Root Page

### 1. The gap Run 74 left is closed
- Run 74 removed 28 decoration arrows and left 30 pages with no spaced-review item, recorded rather
  than hidden. **All 29 remaining non-root pages now carry one**, each written against the earlier
  page that teaches the concept, with its own key line, assert, pass-mark move and remediation
  pointer. The generator now prints
  `spaced reviews: 47 arrow(s) on 47 page(s); 1 page(s) carry none.`
- The one page without a review is `00-foundations.T1.00a`, the root: no earlier page exists to
  review, which is the exemption `docs/ASSESSMENTS.md` already states ("for non-root modules").
- Each question is answered **by** the concept its arrow names - a rotation of a point reviews SE(3)
  homogeneous transforms, a priority-inheritance question asks the priority the holder actually runs
  at, a rolling counter asks the wrapped value. The full table is in `docs/dogfood-log.md` Run 75.

### 2. What moved in the pages
- `resources/skip-tests.json`: 29 questions, 29 key lines, 29 pass marks. Marks move 4/4 -> 4/5 on 20 page(s); 3/4 -> 4/5 on 3 page(s); 4/5 -> 5/6 on 6 page(s);
  the bar stays $\lceil 0.8 \times N \rceil$, so no page's standard was lowered.
- Each `## 7. Checkpoint` sentence states the same fraction, and each pass mark names the review
  target for a reader who misses the new question. Safety-gated pages keep `100\%` on their
  `[SAFETY]` items; the added question sits after those items.
- `00-foundations.T2.00a`'s pass mark still read "($75\%$ rounded to the $80\%$ bar means all four;
  treat $3/4$ as a retry)" - a sentence about the old count. It now reads "($80\%$ of five is four;
  treat $3/5$ as a retry)".

### 3. Two defects the authoring exposed
- `04-embedded.T1.04a`'s answer key had no `import math`; it ran only because nothing in it used
  `math`. The first key line that did (`math.isclose`) crashed the page's key, and the store's
  "every key runs" check caught it. Fixed at the source.
- Three tests in `tests/test_skip_tests.py` hard-coded the fixture page's `$3/4$` and a comment
  reading "3/5 against four questions". A hard-coded count is the same defect the store was built
  to remove, so all three now derive the fixture from the store. A new test asserts the invariant
  the spec actually states: every page with prerequisites carries a spaced review, and the root is
  the only page allowed not to.

### 4. A third defect, found by asking what the bar means
- Auditing every page against the 80% floor `docs/ASSESSMENTS.md` states turned up
  `05-control.T3.05b`, whose Checkpoint promised `$\ge 80\%$` while asking `$3/4$` - 75%. Raised to
  `$4/4$`, and the generator now reports a mark under the floor as a finding, so the next such page
  fails the check instead of sitting quietly at 75%.
- The bar's arithmetic is spelled out for every count now: `$4/4$` on 4-Q tests, `$\ge 4/5$` on
  5-Q, `$\ge 5/6$` on 6-Q, with the `75%` numerical-question floor covering `5/6` too.

### 5. Verification
- `generate_skip_tests.py --check` - 48 pages, 236 questions, every key runs; 47 arrows on 47 pages.
- `verify_repo` (1803 links), `lint_modules`, `lint_lessons`, `validate_modules`, `audit_step_size`,
  `legacy_crosswalk`, `mentions_audit`, `module_parity` - all green after the page rewrites.
- `tests/test_*.py` - 19 skip-test tests and the rest of the suite green.

---

## [2026-10-18] — Run 74: The Spaced-Review Arrows, Judged One by One

### 1. The audit
- All 46 `[Spaced review -> ...]` arrows were judged against one rule: answering the question must
  **require** the named concept, not merely sit next to it. Fifteen were honest, three are borderline
  keeps (recorded with reasons in `docs/dogfood-log.md` Run 74), and **28 were decoration**.
- Every one of the 28 had the same shape: a good question about its own page's concept, carrying an
  arrow to a prior concept that never appears in the answer path. Examples: a devicetree `status =
  "disabled"` question reviewing priority inversion; a SeqLock question reviewing DMA ping-pong;
  a $Q$/$R$ scaling question reviewing Bode magnitude.

### 2. The repair is removal, not repointing
- No earlier page teaches the machinery those questions use, so moving the arrow would only relocate
  the lie. The arrows were removed; the questions keep their own `[Concept: ...]` tag and their keys.
- 18 arrows remain on 18 pages. **30 pages now carry no spaced-review item** — a real gap, printed on
  every run (`spaced reviews: 18 arrow(s) on 18 page(s); 30 page(s) carry none.`) and carried in the
  dogfood log, but deliberately not a failing check: failing would only push a false tag back.
  Writing 30 genuine review questions is the next authoring pass.

### 3. What the audit also proved about the pointer rule
- Two of the removed arrows had passed Run 73's pointer check because the crosswalk resolved them to
  pages whose *body* mentions the term (`04-embedded.T2.04b` for DMA, `07-systems.T2.07a` for OPC
  UA). A body mention is evidence a page references an idea, not that it teaches it as a tool; the
  rule is kept as a floor, and honesty is judged by reading.
- `tests/test_skip_tests.py` grew to 18 tests: the remaining arrows must still satisfy the pointer
  rule, and the spaced-review report must be computed from the store (no hard-coded counts).

---

## [2026-10-18] — Run 73: All 48 Skip Tests Sat, and What It Exposed

### 1. The sitting
- Every one of the 207 questions in `resources/skip-tests.json` was re-derived from its own numbers
  and compared with its key; every multiple-choice letter was read against the option it names.
  **207/207 agree after the fixes below** — one key was wrong inside its own tolerance, the rest were
  wording or structure.

### 2. Five content defects fixed
- `02-mechanics.T3.02a` Q3 printed the answer in the question ("by what multiplicative factor
  $2^{5/2}$…"); the prompt no longer names it.
- `03-sensors.T3.03a` Q3 had four phase commands missing their `*` (`$v_a^ = 18.0$`), which renders as
  a dangling caret; restored.
- `00-foundations.T2.00a` Q4's keyed option justified the missing start sample as "the first velocity
  is $0$ by definition" — a convention dressed as a definition. Rewritten to the telescoping reason.
- `01-electronics.T1.01c` Q5 was tagged `breadboard_internal_bus_connectivity` while computing an LED
  current; retagged as a spaced review of the Ohm/KVL page it actually tests.
- `00-foundations.T2.00f` Q2 asserted $749.4867\text{ Hz}$ where its own formula gives $749.48034$;
  the error sat inside the $\pm0.01$ Hz tolerance, so nothing caught it. Key corrected.

### 3. Thirty spaced-review arrows repointed
- 18 named legacy step ids (`00-foundations.T1.01`, `02-mechanics.T1.03`, `07-systems.T2.08`, …),
  which are not pages a reader can open; 12 more named a module that does not teach the tagged
  concept. All now point at the page that declares the concept, or - for legacy-only concepts - at
  the page `resources/legacy-prereq-map.json` proves carries its terms.
- The generator refuses an arrow that is not a page, and one whose target neither declares nor
  teaches the concept (`concepts_declared_by` / `concepts_map`).

### 4. A structural blind spot the sitting found
- All 51 multiple-choice questions kept their A-D lines in the store's free-form `extra` array, so
  the four-option check never ran and nothing compared the key's letter with the option text - a key
  naming `C` over the correct text at `B` would have passed. Options are structured now; the check
  counts them, requires the key to name a letter, and requires that letter to be asserted.
- `tests/test_skip_tests.py` grew to 16 tests (four-option rule, keyed letter, spaced-review target).

### 5. Verification
- `verify_repo`, `clean_tex`, `validate_modules`, `lint_modules`, both generators (`--check`), the
  step-size/crosswalk/mentions/parity audits, `generate_python_lessons_data`, `generate_sim_route`,
  `check_term_order`, every `tests/test_*.py` - all green; 48 pages render the store again.
- `docs/dogfood-log.md` carries the sitting as Run 73 with the defect table.

---

## [2026-10-18] — Run 72: Every Skip Test Is Generated From One Store

### 1. `resources/skip-tests.json` + `scripts/generate_skip_tests.py`
- All 48 bridge modules' Skip tests (207 questions, 48 executable keys) move into one store and are
  rendered between `<!-- skip-test:start -->` / `<!-- skip-test:end -->`. The extraction proved the
  render byte-identical to the hand-written sections before it wrote the store: only the markers
  were added, plus one blank line on the 8 pages that had none before the next heading and the
  collapse of a double blank on 18 that had two. No question, key or mark changed content.
- Five checks, all structural: the store and the pages agree on which modules exist; every page
  renders the store; the pass fraction's denominator equals the question count **and** any
  `(e/o)` the Checkpoint attaches to the Skip test matches the entry; every `new_concepts:` entry is
  named by at least one of the module's own questions (spaced review excepted, since it names an
  earlier page's concept on purpose); every key executes, evaluates a `qN` for each question and
  contains an assert.
- `tests/test_skip_tests.py`, 14 tests, including the negative paths: a drifted mark, a Checkpoint
  promise that disagrees, a foreign concept tag, an untagged concept, a key that skips a question,
  a key that raises, a missing role class, and a missing marker.

### 2. What the checks found on the way in
- `03-sensors.T2.03a` promised `($4/4$)` on a five-question Skip test whose mark is `4/5`; the
  Checkpoint now says `4/5`. That mismatch had been invisible because the checker's own regex
  matched only `(4/5)` and not the `($4/5$)` form every page actually uses — caught by the test that
  asserts the check fires on drift, not by reading the pages.
- `new_module.py` no longer scaffolds a hand-written Skip test; it points at the store, since a
  hand-typed section would be overwritten on the next render (and `--check` reports the module as
  having a Skip test with no entry until one is added).

### 3. Wiring
- `npm run check:skip` / `test:skip`, and both commands added to `.github/workflows/ci.yml` beside
  the ladder-gate pair. `docs/ASSESSMENTS.md` and `docs/QUALITY_SPEC.md` now say the Skip tests are
  generated from the store rather than typed per page.

---

## [2026-10-18] — Run 71: The Ladder Gate Becomes One Generated Paper

### 1. `scripts/generate_ladder_gate.py` owns the paper
- The Track 00 Tier 2 exit exam existed eight times, once per page, copied by hand: a renumbered
  question or a fixed answer key had to be repeated eight times and could silently disagree. The
  twelve questions, their options and the executable answer key now live in one file and are
  rendered byte for byte between `<!-- ladder-gate:start -->` / `<!-- ladder-gate:end -->` on every
  `00-foundations.T2.*` page.
- Four structural checks: a Tier 2 page on disk with no ladder entry (and the reverse) fails, a page
  whose block differs from the render fails, the question tags must equal the union of every ladder
  page's `new_concepts:`, and the key is executed before anything is rendered. A fifth refuses a page
  that attaches a score to the gate outside the block - `00f` still promised `$7/8$` after the paper
  became twelve questions.
- `tests/test_ladder_gate.py`, 12 tests: same-bytes-everywhere, the ladder is fully tagged, the key
  runs, the render is idempotent, one character of drift is caught, a marker-less page is a finding,
  the right answer is not always `A`, and the generated block is not page evidence.

### 2. The audits stop reading the paper as if each page taught it
- New `scripts/page_body.py`: the generated block is identical on all eight pages, so it cannot be
  evidence of what any one page teaches. The crosswalk, the step-size audit and the mention audit now
  strip it before searching. The first version of the step audit counted the paper's LaTeX as the
  first ladder page's new notation, and the first crosswalk run "confirmed" a concept on every page.
- The crosswalk's `00-foundations.T2.01` module entry now points at `T2.00f` (Tustin, notch, biquad,
  resonance) and `two_mass_torsional_resonance_anti_resonance` at `T2.00h`, the page that actually
  teaches it after the Run 70 split; `T2.00d` was standing in for content it no longer carries.
- Regenerated: `docs/STEP_SIZE_AUDIT.md` (26 pages, 8 flagged, 0 broken prerequisites),
  `docs/PASSING_MENTIONS.md` and `resources/mentions-decisions.json` (41 pairs: 18 dropped, 3 owned,
  20 kept), `resources/legacy-prereq-map.json` (102 concepts resolved, 0 unresolved).

### 3. `docs/dogfood-log.md` Run 71 - the paper sat once, as a learner
- Row `00-foundations.T2.00g`, 20 min, 0 hints, no stuck category, course bug `yes`.
- Five defects fixed, all in the paper or its copies: Q1 asked for $(A\vec{x})_1$ (the maths subscript
  is the first entry, the key evaluated the second); Q5's Run 70 rewording pointed at the third row
  (the $\vec x_2$ row, first entry $0$) while the key kept the fourth row's $0.25$; `00f` restated a
  `$7/8$` gate score; all four multiple-choice questions keyed `A`, now C, B, D, B; the preamble no
  longer claims a page's own tools are on the paper.
- The answers were re-derived independently of the key (`Ax = [-0.5, 11.5]`, $v_1 = -0.80$,
  $x_1 = 0.484$, row-4 entry $0.25$, $30\,\text{rad/s}$, $\zeta = 0.75$, $|Z| = 5.6569\ \Omega$,
  $-3.0103\,\text{dB}$, $\rho(A_d) = 1.024695$), and `docs/ASSESSMENTS.md` now describes the generated
  paper and the eight-page Step 2.1 ladder instead of an `8 Q` exam with a `7/8` pass mark.

---

## [2026-10-18] — Run 70: The Tier 2 Opener Splits, and Matrices Get Their Own Page

### 1. `00-foundations.T2.00a` now teaches one thing
- The page carried three concepts in a $4.0\text{ h}$ step: finite differences, matrix-vector multiplication, and the discrete state update. The step-size audit flagged it at 18.0, the largest in Tier 2. It is now **2.0 h and one concept** - backward difference, running integral, the telescoping identity, and the $1.534\text{ rad/s}$ quantisation floor of a 12-bit encoder at $1\text{ kHz}$.
- Its graded package shrank with it: three holes (`joint_velocity`, `running_integral`, `encoder_trace_angle`), **10 tests**, three faults (`missing_dt`, `no_wrap`, `hardcoded_counts`). The matrix functions and the `sequential_update` fault moved to the new page.

### 2. `00-foundations.T2.00g` - "Matrix-Vector Multiplication & the One-Step State Update"
- New module between `T2.00a` and `T2.00b` (two new concepts, 3.0 h, the cart as the teaching rig, the arm as the transfer rig). `T2.00b`'s prerequisite is now `T2.00g`.
- New package `exercises/00-foundations.T2.00g/`: six holes (`mat_vec` with a shape check, `state_matrices`, `one_step`, `simulate`, `two_mass_matrices`, `position_trace`), **19 tests**, four faults (`elementwise_product`, `sequential_update`, `hardcoded_matrices`, `force_in_position_row`), a browser self-check and a print-only cheat case.
- The $4\times4$ two-mass matrix is the point of the page: the same `mat_vec`/`one_step` code carries four states, and the decoupled limit must reproduce the two $2\times2$ matrices exactly.
- The transfer suite meets the plant twice: the arm's shoulder velocity decay matches `plant.step_arm` tick for tick to $10^{-12}$, and its two inertias run as a coupled drivetrain.

### 3. Ladder and route bookkeeping, regenerated not typed
- Every Tier 2 gate's ladder sentence names `T2.00g`; `00b`'s gate recaps the matrix page rather than `00a`.
- `_index.yaml`, `00-foundations/README.md`, `docs/SYLLABUS.md` (27 Tier 2 modules, 123.5 h; 71 formal modules, 325.5 h), `docs/SIM_ROUTE.md` (**Core 41 modules, 181.5-225 h**), `docs/STEP_SIZE_AUDIT.md`, `docs/coverage-table.md` and `app/src/data/pythonLessonsData.ts` were all regenerated or updated. The audit now measures `T2.00a` at 14.0 (unflagged) and `T2.00g` at 5.0.

### 4. Verification
- `run_exercise.py` **12/12 checks** for `T2.00g` and **11/11** for the trimmed `T2.00a`; `tests/test_module_full_solutions.py` 2/2, so both pages' Full Solution blocks pass their own suites.
- The full CI chain is green: `verify_repo` PASS (135 files, 136 diagrams, 1800 links, 0 errors), `validate_modules` (71 modules), `lint_modules`, `lint_lessons`, `check_ramp_lessons`, `check_term_order`, `clean_tex`, `mentions --check` (41 pairs: 18 dropped, 3 owned, 20 kept), `legacy_crosswalk --check` (102 resolved, 0 unresolved), `module_parity --check` (99.8% over 47 modules), `generate_sim_route --check`, `audit_step_size --check` (25 pages, 8 flagged, 0 broken), `test_plant`, `test_model_levels`, `test_sim_route`, `test_exercises`, `test_exercise_package`, `check_exercise_coverage` (47/47 graded), plus `audit_math` (0 failures) and `run_all_labs` (all tracks OK).
- Browser path: `npm run build`, `test:smoke` (83-entry Runner) and both E2E suites - **all 47 graded entries** graded on the built Pages bundle in Chromium and Firefox.

## [2026-10-18] — Run 69: A Second Owner for Quaternion SLERP, and CORDIC Comes Home

### 1. Shared ownership has a live example
- `06-robotics.T2.06a` now states what `tf2` does with the orientations it buffers: each frame's rotation is a unit quaternion, a lookup interpolates with `slerp` (not a linear blend), and `tf2` negates `q_b` when `q_a . q_b < 0` to take the short arc. Gate Q10 computes the scalar part of a 90-degree slerp at `alpha = 0.25` (`0.923879533`).
- The page declares `owns: [unit_quaternion_kinematics_slerp]`, so the concept now has **two owning pages** — `00-foundations.T3.00a` derives the chart, `06-robotics.T2.06a` applies and gates it — which is exactly what Run 68's rule change permits.
- Because a Gate test covers its whole track tier, `06-robotics.T2.06b` gained Q9 as well: the bag-replay sign flip, tested conceptually. Gates: 06a `8/10`, 06b `8/9`.

### 2. The last unresolved concept is closed
- `04-embedded.T3.04a` already calls the hardware `CORDIC` block from its Q1.31 item, so it now derives it: the microrotation recurrence with `sigma_i = sign(z_i)`, the shift-and-add property, the accumulated gain `K = prod sqrt(1 + 2^-2i) ~ 1.646760` pre-divided out, the residual bound `atan(2^-(n-1))`, and the 99.9-degree coverage that forces a quadrant fold.
- The page owns `q131_cordic_hardware_coprocessor` and gates it twice: `alpha_3 = atan(2^-3) = 0.124354995` and why no multiplier is needed. Gate `8/10`.
- `resources/legacy-prereq-map.json` now resolves **102 concepts with 0 unresolved** — the first time the crosswalk has no recorded gaps.

### 3. Verification
- Full CI Python step (23 commands) exit 0: `validate_modules` (both new `owns:` lists accepted, both tiers' Gate tests tag them), `module_parity --check`, `tests/test_module_parity.py` 19 tests, `mentions --check` (41 pairs, 18/3/20), `crosswalk --check` (102 resolved, 0 unresolved), `stepsize --check`, `verify_repo` PASS.
- `audit_math` PASS (markdown=16629, equations=27, mathviews=107, failures=0).

## [2026-10-18] — Run 68: Quaternion SLERP Gets a Home, and a Concept May Have Two Owners

### 1. The last substantive unresolved concept is taught, gated and resolved
- `00-foundations.T3.00a` is the rotation-representations page (hat map, `exp([phi]_x)`, Rodrigues), which is exactly where the unit quaternion's exponential belongs. `## 3. Formalization` gained item 3: the unit-quaternion chart `q(phi) = (cos(theta/2), u_hat sin(theta/2))`, the body-frame kinematics `qdot = (1/2) q (x) (0, omega)` with `|qdot| = |omega|/2`, and SLERP with `Omega = acos(q0 . q1)` plus the `q1 -> -q1` shortest-arc rule. The energy-balance item moved from 3 to 4 and every remediation reference was updated with it.
- The page now declares `owns: [unit_quaternion_kinematics_slerp]` and its Gate test tags it twice: Q9 computes the scalar part of the $90^\circ$ SLERP at $t=0.5$ ($0.707106781$), Q10 the tangent rate $\|\dot q\|$ at $3.0\ \text{rad/s}$ ($1.5$). Gate 8/10.
- `resources/legacy-prereq-map.json` resolves the id to that page with body evidence `kinematics, quaternion, slerp, unit`; **unresolved falls from 2 to 1** (only `q131_cordic_hardware_coprocessor`, which predates this work).
- The mentions verdict for the pair moved `drop` → `own`: the page that was correctly recorded as *not* teaching it now does.

### 2. A concept may have more than one owning page
- `mentions_audit.suggestion()` no longer requires the page to be the single crosswalk teacher. `own` now rests on the two facts a page controls: it engages the idea in §3/§4/§5, and its Gate test tags it. The crosswalk's `page` is reported, not enforced.
- This is safe because the Gate tag is already gated by `validate_modules`: a tag is accepted only for a concept the page introduces or owns, so a second owner has to declare the concept in `owns:` and pass that check.
- Current totals are unchanged — **18 dropped, 3 owned, 20 kept** — because no page that merely keeps a claim also tags it. The rule was exercised directly: a synthetic row with a Gate tag and a teacher elsewhere returns `own`; the same row without the tag returns `keep`, and without graded engagement `drop`.

### 3. The step-size cost, published rather than hidden
- `00-foundations.T3.00a` now answers step **12.5**, which is exactly the Tier 3 threshold, so `docs/STEP_SIZE_AUDIT.md` lists it as a `JUMP` (9 flagged pages, up from 8). That is the honest price of the added notation: the quaternion product symbol stays because it is the correct notation, while `arccos` was written as `cos^-1` to avoid a second new command for no gain.

### 4. Verification
- Full CI Python step (23 commands) exit 0: `validate_modules`, `module_parity --check`, `tests/test_module_parity.py` (19 tests), `mentions --check` (41 pairs 18/3/20), `crosswalk --check` (101 resolved, 1 unresolved), `stepsize --check`, `verify_repo` PASS (134 files, 135 diagrams, 1776 links, 0 errors). `audit_math` PASS (markdown=16588, equations=27, mathviews=107, failures=0).
- Negative path: deleting `owns:` from the page makes `validate_modules` exit 1 with `Gate test tags unknown concept 'unit_quaternion_kinematics_slerp'` (restored, exit 0).

## [2026-10-18] — Run 67: The Crosswalk Stops Confirming a Claim With the Claim

### 1. `legacy_crosswalk.py` now reads page bodies only
- `page_texts()` strips front matter before matching. A page's own `uses:` line names every legacy concept it claims to depend on, so counting front matter let the check validate a mapping against the very sentence that asserted it — `so2_rotation_matrix` and `augmented_kalman_disturbance_observer` had both been "confirmed" that way.
- Resolution is now two candidates in order — the committed page, then the page the legacy module maps to — and a candidate is accepted only when its **body** carries two of the concept's tokens or its rarest token. The old third branch, which scored every page purely on token rarity, is gone: it is what moved `khatib_operational_space_inertia_nullspace` to a page that merely says "operational space", and `astrom_furuta_energy_swingup` to a page that only names the rig.
- Anything weaker is recorded as `unresolved`, never guessed.

### 2. What the repair changed
| Concept | Before | After |
| :--- | :--- | :--- |
| `differential_bessel_anti_aliasing_filter` | `01-electronics.T3.01a`, evidence included `differential` | same page, evidence `aliasing, anti, bessel, filter` — the body never says "differential" |
| `unit_quaternion_kinematics_slerp` | `00-foundations.T2.00d`, evidence `unit` | unresolved: no page body names a quaternion or SLERP |

Totals: **100 resolved, 2 recorded unresolved** (the quaternion id joins `q131_cordic_hardware_coprocessor`). No mapping moved to a different page, which is the point — the heuristic had no business moving any.

### 3. The disturbance observer now has a teacher, a derivation and a gate
- `05-control.T2.05a` gains `owns: [augmented_kalman_disturbance_observer]`, a `## 3. Formalization` item 3 bullet deriving the augmented model ($A_{\text{aug}} = \begin{bmatrix} A_d & B_d \\ 0 & 1 \end{bmatrix}$, $C_{\text{aug}} = [C\ 0]$, $\hat d_{k+1} = \hat d_k + \ell_i r_k$), and Gate Q9–Q10: the per-tick estimate increment ($2.0\times10^{-4}$) and why the augmentation removes the steady-state bias. Gate 8/10.
- The crosswalk's evidence for that id is now `augmented, disturbance, kalman, observer`, all from the body.

### 4. Verification
- `legacy_crosswalk.py --check` exit 0 (`100 legacy concepts resolve to pages whose bodies carry their terms; 2 recorded as unresolved`); `--json` exits 1 while a problem is open, as before.
- Negative path: adding `unit_quaternion_kinematics_slerp` to a page's `uses:` no longer resolves it — front matter is ignored, the concept stays unresolved (restored immediately).
- Full CI Python step (23 commands) exit 0, including `validate_modules`, `module_parity --check`, `tests/test_module_parity.py` (19 tests), `mentions --check` (41 pairs: 19/2/20), `stepsize --check` (8 flagged, 0 broken) and `verify_repo` PASS (134 files, 135 diagrams, 1776 links, 0 errors); `audit_math` PASS (markdown=16556, equations=27, mathviews=107, failures=0).

## [2026-10-18] — Run 66: Two Legacy Concepts Promoted to `owns:`, Five More Claims Dropped

### 1. `own` became an applied outcome instead of a permanent zero
- `03-sensors.T2.03a` now names what its Park matrix *is*: `## 3. Formalization` item 2 gained one paragraph stating $R(\theta_e) \in SO(2)$, $\det R = 1$, $R(-\theta_e) = R(\theta_e)^\top = R(\theta_e)^{-1}$ and $R(\theta_a)R(\theta_b) = R(\theta_a + \theta_b)$ — the three facts the page was already using without naming. Gate Q9 (`[Concept: so2_rotation_matrix]`) tests the composition, and the gate moves from 8 to 9 questions (`8/9`).
- `07-systems.T2.07a` already taught the regen surge across all eight body sections (31 evidence lines). Gate Q9 (`[Concept: regenerative_braking_bus_voltage_surge]`) tests the unclamped bus voltage itself — $166.060230$ V for 13.5 J into 1000 µF from 24 V — which the gate previously skipped; `8/9`.
- Both ids moved from `uses:` to a new **`owns:`** front-matter block: removed from `uses:` because the page does not assume them, kept out of `new_concepts:` because each page already spends its three-concept budget on material of its own. `scripts/validate_modules.py`, `scripts/module_parity.py`'s ladder test and `tests/test_module_parity.py` all count `owns:` as ladder material for Gate tagging, and `validate_modules` rejects an id listed in both `owns:` and `uses:` (or `owns:` and `new_concepts:`).

### 2. The evidence rule was too loose, and the two failed near-owns proved it
- A line now counts only when it carries **two** of the concept's tokens or its **core term** — the previous "any rare token" arm counted a page mentioning "Kalman" six times as engaging `augmented_kalman_disturbance_observer`, and a page mentioning "rotation matrix" twice as engaging `so2_rotation_matrix`.
- The tightening flipped five pairs from `keep` to `drop`, and `docs/STEP_SIZE_AUDIT.md` independently confirms all five: they were on its "Assumptions no page teaches" list.
  | Page | Concept | Why it is a drop |
  | :--- | :--- | :--- |
  | `00-foundations.T2.00a` | `symplectic_euler_integration` | only a spaced-review tag and an answer option; the page uses plain Euler discretisation |
  | `01-electronics.T2.01a` | `star_grounding` | the phrase appears nowhere in the body |
  | `04-embedded.T2.04a` | `hardware_timer_isr_and_jitter` | only the spaced-review tag; the page teaches DMA ping-pong ISRs |
  | `04-embedded.T2.04a` | `packed_binary_telemetry_struct` | "packed" never appears; the frame size is arithmetic, not a layout dependency |
  | `05-control.T3.05a` | `augmented_kalman_disturbance_observer` | no `disturbance`, `observer` or `augmented` anywhere in the body |
- `legacy_crosswalk.py` re-resolved that last id to `05-control.T2.05a` (evidence `disturbance`, `kalman`, `observer`), which is the page that actually discusses a disturbance observer.

### 3. Current totals
- 41 pairs across 22 pages: **19 dropped, 2 owned, 20 kept**.
- `docs/PASSING_MENTIONS.md` regenerates from the decisions; `--apply` is idempotent (byte-identical doc and decisions on a second run).

### 4. Verification
- `mentions --check` exit 0 (`41 pairs decided and applied; 19 dropped, 2 owned, 20 kept`); `stepsize --check` exit 0 (8 flagged, 0 broken prerequisites); `crosswalk --check` exit 0 (101 resolved, 1 recorded); `validate_modules` exit 0; `module_parity --check` and `tests/test_module_parity.py` (19 tests) exit 0.
- Full CI Python step (23 commands) re-run locally, all exit 0, including `verify_repo` PASS (134 files, 135 diagrams, 1776 links, 0 errors) and `clean_tex --check`; `node scripts/audit_math.mjs .` PASS (markdown=16535, equations=27, mathviews=107, failures=0).
- Negative paths: an owned concept added back to `uses:` exits 1 with `concept in both owns and uses`; a Gate tag for a concept the page neither introduces nor owns exits 1 with `missing ladder concept` + `unknown concept`.

## [2026-10-17] — Run 59: The Cheat Test Reaches Tier 2, and the Route Gets One Page

### 1. Three claims that had been reported but not checked
- **The cheat case exists, but only at Tier 3.** `scripts/e2e_browser_workbench.mjs` step 2b printed `EX.05-control.T3.05a`'s own PASS line and asserted MATCHED presentation + FAILED behaviour + no verification. There was no Tier 2 entry, and a beginner's first graded package is Tier 2.
- **The ESKF reset is real.** `05-control.T3.05b` carries the fault `no_reset_double_counts`, which fails `test_a_zero_innovation_step_does_not_reapply_the_consumed_correction`; `scripts/run_exercise.py --only 05-control.T3.05b --verbose` reports `PASS fault no_reset_double_counts fails ...`, alongside `reset_drops_the_innovation` and the print-only case, 13/13.
- **The three bridges are already separate packages**, each with its own suite and faults: `T3.05a` Joseph covariance + NEES, `T3.05b` Rodrigues/inject/reset, `T3.05c` CBF. All three report 13/13; nothing needed splitting.

### 2. Both browser suites now spoof a Tier 2 entry as well
- `scripts/e2e_browser_workbench.mjs` step 2b and `scripts/e2e_pages_bundle.mjs` (after its 46-entry pass) now loop over `EX.02-mechanics.T2.02a` and `EX.05-control.T3.05a`: printing an entry's published PASS line must read MATCHED on presentation, FAILED on behaviour, and leave the verified count untouched.

### 3. `docs/SIM_ROUTE.md`, generated from page metadata
- `scripts/generate_sim_route.py` declares the Core route once and renders the document: Core = 40 modules (every Tier 1 and Tier 2 page, plus the rotation/covariance/ESKF/CBF depth line and one capstone) + 24 prose lessons; Extensions = the other 6 modules. Hours are summed from `est_hours`, `typical_hours` and `slow_learner_hours` - never hand-entered - and `--check` fails on drift.
- Measured: **Core 180.5-224 h**, Extensions 29.5 h. The "340+ hours" figure used in planning is not what the pages claim; the required route is already about two thirds of it.
- `tests/test_sim_route.py` (5 cases) pins the document to the pages, fails if any module appears in neither table, recomputes the Core total independently, and keeps the four Tier 3 bridges + one capstone on the required route. Wired into `npm run check:route` and the CI verify step.

### 4. Verification
- `python3 tests/test_sim_route.py` - 5/5 pass; `python3 scripts/generate_sim_route.py --check` exit 0 after regeneration, and exit 1 when a row is hand-edited (restored immediately).
- `npm run test:e2e` exit 0 - `[PASS] Real-browser Chromium E2E tests passed ...` with the new Tier 2 spoof in the loop.
- `PLAYWRIGHT_BROWSERS=chromium npm run test:e2e:pages` exit 0 - all 46 entries graded, then `ok chromium: a Tier 2 and a Tier 3 entry print their own PASS line and stay unverified`.

## [2026-10-18] — Run 63: Forty-One Legacy Claims in `uses:` Get a Verdict

### 1. What was measured
- `scripts/mentions_audit.py` reads every bridge page whose `uses:` names a legacy concept (41 pairs across 22 pages) and searches the body for the concept's **core term** (its rarest token, e.g. `so2`, `lqr`, `crc16`) plus its other tokens, requiring two tokens on a line or the rare one alone. It records the lines and the numbered sections they fall in, so "only in §1 Why it matters" and "used in §4 Worked example and §5 Exercise" are distinguishable claims.
- Decisions live in `resources/mentions-decisions.json` and the report in `docs/PASSING_MENTIONS.md`: **14 dropped, 0 owned, 27 kept**.

### 2. The 14 claims removed
| Page | Concept | Evidence |
| :--- | :--- | :--- |
| `00-foundations.T2.00a` | `so2_rotation_matrix` | 0 lines, no `so2` anywhere |
| `00-foundations.T3.00a` | `unit_quaternion_kinematics_slerp` | 0 lines, no `slerp` |
| `02-mechanics.T1.02a` | `so2_rotation_matrix` | 0 lines |
| `03-sensors.T3.03a` | `sar_adc_c0g_charge_bucket_design` | 0 lines, no `c0g` |
| `05-control.T1.05a` | `symplectic_euler_integration` | 1 line, §7 only |
| `05-control.T1.05a` | `hardware_timer_isr_and_jitter` | 1 line, §6 only |
| `05-control.T2.05a` | `discrete_pid_controller` | 1 line, §1 only |
| `05-control.T3.05a`, `05-control.T3.05b` | `discrete_infinite_horizon_lqr` | 0 lines, no `lqr` |
| `06-robotics.T1.06a` | `discrete_pid_controller` | 1 line, §7 only |
| `06-robotics.T1.06a` | `planar_2link_forward_kinematics` | 0 lines |
| `06-robotics.T3.06a` | `ruckig_time_optimal_jerk_limited_scurve` | 1 line, §8 only |
| `07-systems.T2.07a` | `can_fd_mit_impedance_packet_packing` | 5 lines, all prose (§2, §6, §7) |
| `07-systems.T3.06a` | `can_fd_crc16_rolling_counter_watchdog` | 0 lines, no `crc16` |

### 3. Why nothing was promoted to `new_concepts`
- `own` requires three things together: the page is the concept's crosswalk teacher, it engages the idea in §3/§4/§5, and its Gate test already tags the concept. Three pages passed the first two (`03-sensors.T2.03a` for `so2`, `05-control.T3.05a` for the disturbance observer, `07-systems.T2.07a` for the regen surge) and none passed the third, so the honest decision is `keep`. Promoting without the gate tag failed `validate_modules` with `Gate test missing ladder concept` — the gate is what makes ownership real, and it is not something a rename can supply.

### 4. Verification
- `python3 scripts/mentions_audit.py --check` exit 0 (`41 pairs decided and applied; 14 dropped, 0 owned, 27 kept`); re-adding a dropped id to `uses:` exits 1 with the document stale against the decisions (restored immediately).
- `python3 scripts/validate_modules.py` exit 0 under Python 3.12; `verify_repo.py` PASS (134 files, 135 diagrams, 1776 links, 0 errors); `module_parity --check`, `lint_modules`, `audit_step_size --check` (8 flagged, 0 broken prerequisites) and `legacy_crosswalk --check` (101 resolved) all exit 0.
- Wired into `npm run check:mentions`, the CI verify step and `README.md`'s validation list.

## [2026-10-18] — Run 62: Every Superseded Prerequisite Now Points at a Real Page

### 1. 38 citations on 24 pages, repointed
- Every `prereqs:` entry that named a module living only in `modules/_index.yaml`'s `legacy:` section now names the page that teaches that content: `00-foundations.T1.01` → `00-foundations.T1.00e`, `01-electronics.T1.02` → `01-electronics.T1.01b`, `02-mechanics.T1.03` → `02-mechanics.T1.02a`, `04-embedded.T2.05` → `04-embedded.T2.04b`, `05-control.T2.06` → `05-control.T2.05a`, `06-robotics.T3.07` → `07-systems.T3.06a`, `01-electronics.T3.02` → `01-electronics.T3.01a`, `03-sensors.T3.04` → `03-sensors.T3.03a`, and eleven more.
- Applied on 24 module pages and 24 bridge entries in `modules/_index.yaml`; duplicates collapsed (the capstone already listed its new prereq). The last two were on extension pages (`03-sensors.T3.03a`, `04-embedded.T3.04a`), which the Core-only audit table had not shown — the crosswalk check is now repo-wide for exactly that reason.
- Six pages gained the prerequisite that actually introduces a concept they `uses:` — `05-control.T1.05a` → `01-electronics.T1.01b` for `pwm_duty_cycle_effective_voltage`, `00-foundations.T3.00a` and the two 05-control Tier 3 bridges → `00-foundations.T2.00e` for `continuous_state_space_matrices`, `06-robotics.T2.06b` → `04-embedded.T2.04d`, `07-systems.T3.06a` → `07-systems.T1.07a`.

### 2. The resolution is data, and both checkers prove it
- `resources/legacy-prereq-map.json` holds the crosswalk: each legacy id → teaching page → evidence terms, plus a concept-level map for the 102 concept ids the legacy modules still own. `scripts/legacy_crosswalk.py` derives the concept half from page text and `--check`s it; 101 resolve, and 1 (`q131_cordic_hardware_coprocessor`) is recorded as unresolved because no page mentions it.
- `scripts/audit_step_size.py` now prints a **Resolved prerequisites** table and exits 1 when a legacy id is still cited, when a mapped page does not exist, or when an evidence term is missing from it. `validate_modules.py` reads the same map for concept reachability instead of treating the phantom legacy nodes as modules.

### 3. Verification
- `python3 scripts/audit_step_size.py --check` exit 0 (`24 pages, 8 flagged, 0 broken prerequisites`); exit 1 with `00-foundations.T1.01: still cited by 00-foundations.T2.00a` when a legacy id is pasted back, and exit 1 with `does not contain ['notpresent']` when one evidence term is wrong (both restored).
- `python3 scripts/legacy_crosswalk.py --check` exit 0 (`101 legacy concepts resolve to pages that contain their terms; 1 recorded as unresolved`).
- `/opt/homebrew/bin/python3.12 scripts/validate_modules.py` exit 0 — `OK (70 modules: 24 legacy, 46 bridge [16 Tier 1] across 25 ladders; 48 beginner lessons; all 46 Expected output blocks & script docstrings verified)`. The default `python3` on this Mac is 3.9, where `float | None` in a page block raises `unsupported operand type(s) for |`; that is the interpreter, not the page, and 3.12 is what CI uses. This entry also restores the README-size claim the validator expects (`111 KB $\to$ 33 KB`).
- Wired into `npm run check:crosswalk` and the CI verify step, and named in `README.md`'s validation list.

## [2026-10-17] — Run 61: Six Step-Size Signals, Eight Pages That Jump, and 100 Concepts Nobody Teaches

### 1. `docs/STEP_SIZE_AUDIT.md`, generated from the pages themselves
- `scripts/audit_step_size.py` reads the 24 Core Tier 2/3 pages (the route `generate_sim_route.py` declares) and computes six signals: declared `new_concepts`, how many of those ids bundle two objects with `_and_`, first-use LaTeX commands (a command no earlier Core page used), the `difficulty.math` change against the previous Core page in the same track, `TODO` holes in the scaffold, and prerequisite citations with no page on disk.
- `step = 2·concepts + 2·bundled + 0.5·notation + 1·max(0,Δ) + 0.5·max(0,todos−5)`, flagged at the tier's 75th percentile or above **and** an absolute floor of 8, plus two absolute rules (a math level jump of +2, or three bundled ids). Weights are stated in the script, every column is published, and `--check` fails on a hand edit.

### 2. Eight pages jump — each with its numbers
| Page | Step | Evidence |
| :--- | ---: | :--- |
| `00-foundations.T2.00a` | 18.0 | 18 first-use notation commands (plainest page in the repo: `frac`, `begin`, `cdot`, …), 3 concepts, one bundled |
| `00-foundations.T2.00d` | 17.0 | complex numbers + Euler + phasors + complex impedance + Bode in one page, three bundled ids |
| `00-foundations.T2.00b` | 15.5 | 13 first-use commands (`det`, `Sigma`, `hat`, …), linear independence + change of basis |
| `00-foundations.T2.00f` | 15.0 | Nyquist + Tustin pre-warping + biquad + Gaussian covariance, math 3 → 4 |
| `02-mechanics.T2.02a` | 11.5 | math 2 → 4, SE(3) + Jacobian + parallel-axis behind one id, 2 dangling prereqs |
| `04-embedded.T2.04b` | 14.5 | rate-monotonic RTA + priority inversion + CAN arbitration in one page, three bundled ids |
| `06-robotics.T2.06b` | 15.0 | ROS 2 launch/composition + rosbag2 replay + Gazebo/MuJoCo bridge, three bundled ids |
| `08-capstones.T3.07a` | 12.5 | RSS budget + latency budget + safety sign-off, three bundled ids |

### 3. The defect the numbers exposed
- **23 prerequisite citations on 12 of the 24 pages name a module with no page.** They point into `modules/_index.yaml`'s `legacy:` section, which the Quality Spec calls superseded; 15 distinct ids are cited. Not one of those legacy modules' **100** declared concepts is claimed by any of the 46 bridge pages' `new_concepts`, so there is no replacement page to be found by concept overlap.
- **13 pages assume 23 concepts that no page claims to teach**: `symplectic_euler_integration` and `so2_rotation_matrix` on `00.T2.00a`, `planar_2link_forward_kinematics` on `02.T2.02a`, `hardware_timer_isr_and_jitter` on `04.T2.04a`, `discrete_infinite_horizon_lqr` on all three 05-control Tier 3 bridges, and so on. That is the sharpest form of an unbridged jump: required, used, taught nowhere.
- **21 of 24 pages declare three `new_concepts`** against `QUALITY_SPEC.md`'s at-most-two contract, and **19 hide a third object inside an `_and_` id** — `bode_magnitude_db_and_phase`, `geometric_jacobian_and_parallel_axis_theorem`, `rss_and_worst_case_spatial_error_budget`.

### 4. Verification
- `python3 scripts/audit_step_size.py --check` exit 0 (`24 pages, 8 flagged, 23 broken prerequisites`); exit 1 against a hand-edited table row (restored immediately).
- `python3 scripts/verify_repo.py` PASS at 133 files / 134 diagrams / 1775 links / 0 errors, after the notation names were printed without a leading backslash (the checker rejects a LaTeX command in prose, inline code included). `clean_tex` PASS, `audit_math` PASS (`failures=0`), `module_parity --check` PASS, `ci.yml` parses.
- Wired into `npm run check:stepsize` and the CI verify step, and named in `README.md`'s validation list.

## [2026-10-17] — Run 60: The Exit Gate Is Ten Items, and Each Miss Names Its Lesson

### 1. `docs/TIER1_EXIT_CHECK.md` — the maths half of Gate 1→2
- Ten items, closed book, 30–40 minutes: five on reading a rate (units, sign, nine intervals for ten samples, average vs instantaneous at a peak, quantisation noise when the window halves) and five on accumulating one (signed area, triangle area, the starting value, bias drift, and left/right/trapezoid error bars).
- Every row carries an `Ramp lesson` column, and the two lessons it can name are the two that exist. Scoring is explicit (10/10 start Tier 2, 8–9 do the named lesson first, ≤7 do both, <6 start at the ramp) and every answer is in a `<details>` block, so the check can be taken without an instructor.
- The practical half is unchanged and still lives in the Workbench: Tab 10 → Tier 1 Exit Review's six gates.

### 2. `ramp/R.1-rate-of-change.md` and `ramp/R.2-accumulation.md`
- R.1 reads `dq/dt` off ten 100 Hz encoder samples: `18.408 rad/s` on the first step, `−12.272 rad/s` on the last, `4.943 rad/s` averaged over 90 ms, and `−1.150 rad/s` through the peak, so the average and the instantaneous rate disagree in the lesson's own numbers. R.2 runs the same trace backwards: left rule `0.300 rad`, right rule `0.280 rad`, trapezoid `0.290 rad`, `q0 = 0.5` gives `0.790 rad`, and a 0.02 rad/s bias is `0.600 rad` after 30 s.
- Both follow the Tier 1 lesson template exactly — front matter with ≤2 ideas, the seven H2 sections, `### Bridge Notes` in range, a starter with numbered TODOs, an executed Expected Output, two-plus common mistakes, three answered checks and a recap checklist — and both are linted by `scripts/lint_lessons.py`, whose 48-lesson count is now separate from the ramp count.
- `ramp/README.md` states the rule for a third lesson: a check item must exist whose miss has no lesson behind it.

### 3. The map cannot rot: `scripts/check_ramp_lessons.py`
- Runs each lesson's Full Solution and diffs its stdout against the published Expected Output, checks every starter `def` still exists in the solution, and verifies the mapping in both directions — every item's `Ramp lesson` exists, and every ramp lesson repairs at least one item. Wired into `npm run check:ramp` and the CI verify step; documented in `README.md`'s validation list and its track matrix.

### 4. Verification
- `python3 scripts/check_ramp_lessons.py` exit 0 (`OK: 2 ramp lessons print their Expected Output and every exit-check item points at one of them`); against a hand-edited Expected Output it exits 1 naming the lesson and diffing want/got; against `R.9` in a row it exits 1 naming every item that points at a lesson which does not exist (both restored immediately).
- `python3 scripts/lint_lessons.py` exit 0 — 48 beginner lessons **and** 2 ramp lessons; it caught two real defects first: R.1's expected output was 0.001 rad/s off the code's rounding, and R.2's aligned columns needed `output_match: "exact"`.
- `python3 scripts/verify_repo.py` now PASS at 132 files / 133 Mermaid diagrams / 1773 links / 0 errors. It had been failing on `docs/SIM_ROUTE.md` (no diagram) since that file was generated, so `scripts/generate_sim_route.py` now renders one and the document was regenerated; `test_sim_route.py` 5/5 and `--check` are green.
- `python3 scripts/clean_tex.py --check` exit 0, `node scripts/audit_math.mjs .` exit 0 (`failures=0`), `python3 scripts/generate_python_lessons_data.py --check` exit 0 (the ramp is prose, not a workbench lesson).

## [2026-10-17] — Run 58: macOS Cannot Get a Linux Lockfile Any More

### 1. The lockfile listed only one platform's binaries
- `package-lock.json` had been resolved on Linux, so it carried `@rollup/rollup-linux-x64-*` and nothing else: `npm ci` on a Mac installed no native binaries, and `vite build` died later with `Cannot find module '@rollup/rollup-darwin-arm64'`.
- Regenerated so every natively-executed dependency carries all four `os`/`cpu` pairs it supports - rollup, esbuild, `@tailwindcss/oxide`, lightningcss and `fsevents` now include darwin-arm64, darwin-x64, linux-arm64 and linux-x64. 173 packages, `lockfileVersion` 3, root dependency ranges unchanged.

### 2. A check that names the fault in one sentence
- `scripts/check_native_deps.mjs` (`npm run check:native`) reads the lockfile, keeps the optional packages whose `os`/`cpu` match this machine and whose parent is installed, and exits 1 listing any that are absent from `node_modules` - with the four `npm install --package-lock-only --os=… --cpu=…` commands that regenerate a complete lockfile.
- Proven against the exact regression: moving `node_modules/@rollup/rollup-darwin-arm64` aside exits 1 naming it; restoring it reports `[PASS] all 5 optional package(s) for darwin/arm64 are installed`.

### 3. CI installs on macOS from scratch
- New `native-install-macos` job (`macos-latest`): `npm ci`, then `npm run check:native`, then `npm run build` - the build is what loads rollup, esbuild, Tailwind's oxide and Lightning CSS natively, so a Linux-only lockfile fails this job at install and names the package on the pull request.
- `build-workbench` runs the same check after its `npm ci`, covering the reverse direction (linux/x64 entries dropped).

### 4. Verification
- Locally, the job's steps in order: `rm -rf node_modules`, `npm ci`, `check:native` -> `[PASS] all 5`, `npm run build` -> `✓ built in 1.77s`.
- The workflow parses with four jobs in order (`verify-and-test`, `native-install-macos`, `build-workbench`, `deploy-pages`).
- Limitation: the darwin/arm64 half runs on this Mac; the `linux/x64` assertion in `build-workbench` cannot execute here and is covered by `npm ci --dry-run --os=linux --cpu=x64` exiting 0.

## [2026-10-17] — Run 57: The Sketch Verifier Finds Its Own C++ Headers

### 1. The host gap was a broken Command Line Tools header directory
- `<CLT>/usr/include/c++/v1` on this machine holds only `__cxx_version`, while the active SDK ships the real libc++ (192 headers, `cstdio` included). Every sketch therefore failed with `fatal error: 'cstdio' file not found` even though the toolchain was complete.
- `scripts/extract_and_compile_sketches.py` now probes the compiler with `-fsyntax-only`; only when `<cstdio>` is missing does it add the active SDK's `usr/include/c++/v1` with `-isystem` (SDK path from `xcrun --show-sdk-path`, then the CLT `MacOSX.sdk` default). A healthy toolchain gets no extra flags.
- Five unit tests (`tests/test_sketch_host_verify.py`) drive the helper with fake compilers: already-working, fixed-by-`-isystem`, a candidate without `cstdio`, hopeless, and no candidates.

### 2. Verification
- `python3 -m unittest discover -s tests` - **93/93 pass, exit 0**, including `test_arduino_wokwi_lessons_python_mirrors_and_cpp_sketches` and the ten host-compiled sketches (their Serial output matched each lesson's Expected Output).
- Negative path: the same flag set still fails a sketch with a real C++ error (`cannot initialize a variable of type 'int'`), so the repair does not neuter the check.
- `scripts/verify_repo.py` exit 0 (126 files, 0 link errors).

## [2026-10-17] — Run 56: Every Tier at 100%

### 1. The eleven Tier 1 rows
- `01-electronics.T1.01a`/`b`/`c`/`d` (25/25/30/29 cases, Gates 11/11, 8/8, 13/13, 13/13), `02-mechanics.T1.02a` (29, 8/8), `03-sensors.T1.03a` (49, 8/8), `04-embedded.T1.04a`/`b` (38/45, 8/8 each), `05-control.T1.05a` (48, 8/8), `06-robotics.T1.06a` (27, 8/8) and `07-systems.T1.07a` (32, 8/8 with 3/3 `[SAFETY]`), every Gate answered before its key was read.
- Tier 1 parity **94.8% -> 100.0%**; all three tiers and all 46 modules now report **100.0%**.

### 2. Two ladders contradicted their own packages
- `06-robotics.T1.06a` said to hold the final pose "once $t \ge T$", but its suite asks for the cubic's terminal deceleration at exactly $t = T$ and the page's own full solution clamps only for $t > T$. The Starter TODO and the Common-mistakes row now say $t > T$ and name $-6\Delta q/T^2$.
- `07-systems.T1.07a`'s refusal item covered a "zero or negative phase budget" (readable as the total); the suite also rejects `(-1.0, 1.0, 1.0)`, a negative stage whose sum is positive. The item now names the negative stage.
- Neither package needed a code fix beyond those spec details, and no assertion changed: the suites already tested both behaviours.

### 3. Verification
- `module_parity --check` green after regenerating `docs/coverage-table.md` (100.0% overall, ratchet held), `validate_modules` exit 0, coverage gate 46/46 `unstated: 0`, `lint_modules` 46/46, `run_exercise --only` green for all eleven packages.

## [2026-10-17] — Run 55: Tier 3 Closed at 100%

### 1. The last four rows
- `00-foundations.T3.00a` (22 cases, Gate 8/8), `02-mechanics.T3.02a` (45, 8/8), `06-robotics.T3.06a` (20, 10/10 with 2/2 `[SAFETY]`) and `07-systems.T3.06a` (31, 8/8 with 2/2 `[SAFETY]`), every Gate paper answered before its key was read. Rows and section in `docs/dogfood-log.md`.
- Tier 3 parity **97.5% -> 100.0%** (all 12 Tier 3 modules); overall **97.5% -> 98.2%**. Tier 1 (94.8%) is the only tier still short: 11 of its 16 modules have no dogfood row yet.

### 2. `06a`'s 1% bar was relative to an unstated start
- The suite asks the loss to fall below 1% of its first value; the page never said which weight sweep to start from, so a correct init with `gauss(0.4)` weights and `gauss(0.1)` biases begins at 0.423 and ends at 0.0060 (1.4%), failing a bar the course init (1.95 -> 0.0061, 0.31%) clears. Ladder item 5 now names the init and both measured trajectories. No assertion changed.
- The other three ladders already stated every guard their suites check; three packages passed first try.

### 3. Verification
- `validate_modules` exit 0, gate 46/46 `unstated: 0`, `lint_modules` 46/46, `module_parity --check` green after regenerating `docs/coverage-table.md`.
- `python3.15 -m unittest discover -s tests`: 87 of 88 pass; the one error is `test_arduino_wokwi_lessons_python_mirrors_and_cpp_sketches`, where `/usr/bin/g++` cannot find `cstdio` in this environment - a missing C++ toolchain header, not a repository change.

## [2026-10-17] — Run 54: The `05-control` Tier 3 Trio

### 1. Three modules in one sitting
- `05-control.T3.05a` (17 cases, Gate 6/6), `T3.05b` (14, 7/7) and `T3.05c` (16, 6/6), all Gate papers answered blind. `05a` and `05c` passed their packages first try; rows and section in `docs/dogfood-log.md`.

### 2. `05b` refused one thing less than its suite
- `inject_rotation` also refuses a nominal rotation that is not $3 \times 3$; the refusal item named only the two-component correction, so a $2 \times 2$ nominal matrix raised `IndexError` from the multiply. The item now states both, with the reason.

### 3. Counts
- Instrumented parity **97.1% -> 97.5%**; Tier 3 **95.6% -> 97.5%**. `docs/coverage-table.md` regenerated, `--check` green.

### 4. Verification
- `validate_modules` exit 0, gate `unstated: 0`, page test 46/46, `lint_modules` 46/46, `module_parity --check`, `run_exercise --only` for all three packages.

## [2026-10-17] — Run 53: `03-sensors.T3.03a` and the Rail Boundary

### 1. The module dogfooded
- `03-sensors.T3.03a`: 34 cases (27 behaviour, 7 transfer), Gate **8/8 answered blind**, 2 minutes, 0 hints. Row and section in `docs/dogfood-log.md`.

### 2. A guard that was right in form and wrong at the boundary
- `svpwm_duties` must refuse a command past the rail, so `0 <= d <= 1` reads correct - but $V_{\text{bus}}/\sqrt{3}$ sits a leg exactly on $1.0$ and the sampled sinusoid lands on $1.0 \pm 10^{-16}$. The transfer test allows $\pm 10^{-9}$ and caught the strict guard. A sixth ladder item states the slack and the counterexample that must still raise (25 V on a 24 V bus).

### 3. Verification
- `validate_modules` exit 0, gate `unstated: 0`, page test 46/46, `lint_modules` 46/46, `module_parity --check`, `run_exercise --only 03-sensors.T3.03a`.

## [2026-10-17] — Run 52: The Page's Scaffold Was Stale, Across Nine Pages

### 1. `08-capstones.T3.07a` dogfooded
- 42 cases (34 behaviour, 8 transfer), Gate **8/8 answered blind**, 3 minutes, 0 hints. Row and section in `docs/dogfood-log.md`.

### 2. Its Starter block listed 6 of the 9 holes
- The page showed a six-hole scaffold with an `error_budget_3sigma` signature missing `sensitivities`, a "6 TODOs" print, and a "38 tests" claim against a 42-test suite. A learner writing to the page could not have passed. The block is now `starter.py` verbatim and the count is corrected.

### 3. Measured across all 46 packages, then gated
- **9 pages** defined a different function set from their `starter.py` (`00-foundations.T1.00a/b/c/d`, `T2.00f`, `02-mechanics.T2.02a`, `05-control.T2.05a`, `T3.05c`, `08-capstones.T3.07a`) and **7 pages** carried a stale test count. All repaired.
- `scripts/validate_modules.py` gained both checks: the page's scaffold must define the same functions as the package's `starter.py`, and a stated test count must equal the behaviour plus transfer tests. Breaking a block by one name makes the validator report both lists.

### 4. Verification
- `validate_modules` exit 0, gate `unstated: 0`, page test 46/46, `lint_modules` 46/46, `module_parity --check`, `run_exercise --only 08-capstones.T3.07a`.

## [2026-10-17] — Run 51: `06-robotics.T3.06b` Passes First Time

### 1. The third Tier 3 module dogfooded
- `06-robotics.T3.06b`: 28 cases (22 behaviour, 6 transfer), Gate **8/8 answered blind**, 1 minute, 0 hints, no repair. Row and section in `docs/dogfood-log.md`.

### 2. Why this one needed no fix
- Its ladder already carried the refusal item added in Run 50, so the seven guards the suite checks (empty rollout, discount of one, inverted clip range, non-positive ratio, zero step clamp, inverted limits, non-positive timeout) were part of the teaching rather than a discovery. The two Tier 3 modules before it each spent a round on exactly that class of miss: the documentation change is what turned a repair into a first-attempt pass.

### 3. Counts
- Instrumented parity **96.6% -> 96.7%**; Tier 3 **93.8% -> 94.4%**. `docs/coverage-table.md` regenerated, `--check` green.

### 4. Verification
- `check_exercise_coverage` 46/46 `unstated: 0`, `validate_modules` exit 0, page test 46/46, `lint_modules` 46/46, `module_parity --check`, `run_exercise --only 06-robotics.T3.06b`.

## [2026-10-17] — Run 50: The Gate Reads the Item, Not the Word

### 1. `04-embedded.T3.04a` dogfooded
- 40 cases (32 behaviour, 8 transfer), Gate **8/8 answered blind**, 2 minutes, 0 hints. Eight failures on the first pass, all refusals the page never stated. Row in `docs/dogfood-log.md`.
- Writing its refusal item pinned the normalised angle range the tests enforce: `[-1, 1)`, because `+pi` collides with the one value `Q1.31` excludes while `-pi` is exactly `-2^31`.

### 2. Run 49's rule was satisfiable by a passing phrase
- That gate matched *lines that speak of refusing*, and this page's package introduction ends "...and the refusal to take an angle outside it" while naming every hole. One such word made the whole paragraph the statement, so a page with no guard stated passed.
- The rule now matches the dedicated item `N. **What the suite refuses.**` and reads only that. A test reproduces the page's exact shape - an introduction that mentions a refusal and names both functions still fails.

### 3. Eight pages had no dedicated item
- `00-foundations.T1.00c`, `T2.00b`, `T2.00c`, `T3.00a`, `04-embedded.T3.04a`, `06-robotics.T2.06a`, `T2.06b`, `T3.06a`: each given one, written from its own suite's refusal calls.

### 4. Verification
- Gate 46/46 with `unstated: 0`, 14 cases in `tests/test_exercise_coverage.py`, `validate_modules` exit 0, page test 46/46, `lint_modules` 46/46, `module_parity --check`.

## [2026-10-17] — Run 49: Every Refused Function Is Named

### 1. The rule is now naming, not just mentioning
- `scripts/check_exercise_coverage.py` reads each behaviour suite with `ast`, collects every `submission.<fn>(...)` call inside an `assertRaises(ValueError)` block, and requires the page's refusal statement (the lines above `### Full Solution` that speak of refusing) to name each of them. A page that says "some inputs are refused" no longer passes.
- The finding lists the exact functions that are unnamed, so the repair is one sentence rather than an investigation.

### 2. Twenty-seven pages repaired
- Each page's refusal statement was rewritten or added from its own suite's refusal calls, naming function by function: `00-foundations.T1.00a`, `T1.00e`, `01-electronics.T1.01a/b/d`, `T2.01a/b`, `T3.01a`, `02-mechanics.T1.02a`, `T3.02a`, `03-sensors.T1.03a`, `T3.03a`, `04-embedded.T1.04a/b`, `T2.04a/b/c`, `05-control.T1.05a`, `T2.05a`, `T3.05a/c`, `06-robotics.T1.06a`, `T3.06b`, `07-systems.T1.07a`, `T2.07a`, `T3.06a`, `08-capstones.T3.07a`.

### 3. The check cannot be satisfied by accident
- Five cases in `tests/test_exercise_coverage.py`: a silent page fails and lists its missing names, a page naming one of two refused functions is still a finding, naming both passes, a mention only under the Full Solution does not count, and a suite that refuses nothing is exempt. Against `00-foundations.T1.00a` as it stood before the sweep, the gate exits 1 naming all five functions.

### 4. Verification
- `check_exercise_coverage` 46/46 with `unstated: 0`, `validate_modules` exit 0, page test 46/46, `lint_modules` 46/46, `module_parity --check`, coverage and parity suites green.

## [2026-10-17] — Run 48: Every Page States Its Refusals

### 1. The 18 remaining silent pages repaired
- Each refusal sentence was built from that page's own guard inventory, extracted with `ast` from its behaviour suite (`assertRaises(ValueError)` blocks and the arguments passed), not from a template: `00-foundations.T1.00b/d/e`, `01-electronics.T1.01c/d`, `T2.01a/b`, `02-mechanics.T1.02a`, `T3.02a`, `03-sensors.T1.03a`, `T2.03a`, `04-embedded.T1.04b`, `T2.04d`, `05-control.T1.05a`, `T3.05b`, `06-robotics.T1.06a`, `T3.06b`, `08-capstones.T3.07a`. All 41 pages whose suite refuses input now say so.

### 2. The gate that keeps it green
- `scripts/check_exercise_coverage.py` added a fourth job: a suite carrying `with self.assertRaises(ValueError):` requires the page's `## 5. Exercise` section - above `### Full Solution`, so the answer block is not the teaching - to state a refusal. It is a wall, not a ratchet, and it was deliberately not shipped while 19 pages would have failed it.
- Four cases in `tests/test_exercise_coverage.py`: a silent page fails, a stated page passes, a mention under the Full Solution does not count, and a suite that refuses nothing is exempt.

### 3. Verification
- `check_exercise_coverage` 46/46 graded, `unstated: 0`; `validate_modules` exit 0, page test 46/46, `lint_modules` 46/46, `module_parity --check`, the coverage and parity suites (12 + 27 tests).

## [2026-10-17] — Run 47: Tier 3 Opens on Its Riskiest Module

### 1. The pick was ranked, not chosen by feel
- Tier 3 modules were sorted by their own front-matter difficulty: `01-electronics.T3.01a` leads on math (5), tools (4), hardware risk (high) and safety (high), with 5 estimated hours and 39 package cases. Rows in `docs/dogfood-log.md`.

### 2. A missing refusal contract, three holes wide
- The first attempt failed exactly three of 39 tests, all refusals the hint ladder never stated: zero plane dimensions and a negative slew rate, a mutual term larger than either self-inductance, and a zero bucket capacitor or a non-positive acquisition window. The ladder now carries a *What the suite refuses* item naming every guard, including the thermal ladder's four.
- Measured rather than assumed: **19 of 41** pages whose behaviour suite refuses input never say so before their Full Solution block. The list is recorded in the log as the next queued job - one sentence per page, each matched to that page's own guards.

### 3. Counts
- Instrumented parity **96.2% -> 96.4%**; Tier 3 **92.5% -> 93.1%**. `docs/coverage-table.md` regenerated, `--check` green.

### 4. Verification
- `validate_modules` exit 0, page test over all 46 pages, `lint_modules` 46/46, `module_parity --check`, and `run_exercise --only 01-electronics.T3.01a` (12 checks).

## [2026-10-17] — Run 46: Tier 2 Closed

### 1. The last two Tier 2 modules done as the learner
- `06-robotics.T2.06b` and `07-systems.T2.07a`: hints only, packages at 24 and 26 cases, Gates **8/8 both**, about a minute each. Rows in `docs/dogfood-log.md`.
- Both passed their package on the first attempt with no repair - the first round of this log with no course bug at all.

### 2. An honest limit on the Gate evidence
- Each Gate paper was read with its answer key in the same window (`07a`'s page also showed its Full Solution beside the hints), so those 8/8s prove the keys agree with their own questions, not that two papers were answered blind. The exercise attempts were written from the hint ladders in a separate file and run through the same package CI runs, and both passed first time. The limit is recorded in `docs/dogfood-log.md` rather than left implicit.

### 3. Counts
- Instrumented parity **95.9% -> 96.2%**; Tier 2 **99.2% -> 100.0%** - every Tier 2 module now carries a dogfood row. `docs/coverage-table.md` regenerated, `--check` green; Tier 3 stays at 92.5%.

### 4. Verification
- `validate_modules` exit 0 (70 modules, 46 Expected-output blocks verified), page test over all 46 pages, `lint_modules` 46/46, `module_parity --check`, the parity and coverage suites (27 tests), and `run_exercise --only` for both new packages (12 checks each).

## [2026-10-17] — Run 45: The Tier 2 Bridges of Tracks 04-06

### 1. Five more modules done as the learner
- `04-embedded.T2.04b`, `04-embedded.T2.04c`, `04-embedded.T2.04d`, `05-control.T2.05a` and `06-robotics.T2.06a`: hints only, packages at 45/46/26/28/23 cases, Gates **10/10, 12/12, 8/8, 8/8, 9/9**, about a minute each. Rows in `docs/dogfood-log.md`.

### 2. Two refusal contracts were only in the tests
- `04b` and `04c` check that bad input raises: a value outside a packed field's range is refused (not clipped), a code outside the field is refused, and an inheritance request from a waiter that is not more urgent raises. The hint ladders never said so, so each now carries a *What the suite refuses* line listing every guard the suite checks.
- `05a`'s one failure was mine, not the course's: `A P A^T` where the Riccati step is `A^T P A`, which its hint explicitly warns about - logged as `tool`.

### 3. Counts
- Instrumented parity **95.1% -> 95.9%** (Tier 2 97.1% -> **99.2%**); `docs/coverage-table.md` regenerated, `--check` green. Only `06-robotics.T2.06b` is left in Tier 2.

### 4. Verification
- `validate_modules` exit 0, `lint_modules` 46/46, `module_parity --check`, the page test over all 46 pages, the five packages, `run_exercise` all packages.

## [2026-10-17] — Run 44: Every Page Now Passes Its Own Suite

### 1. The remaining 22 pages repaired
- Each failing page's `### Full Solution` was replaced with `exercises/<id>/solution.py` (guards, docstrings, helpers) followed by that page's own demo tail, located with `ast` so a multi-line demo or a second block could not be cut mid-line. Two pages (`05-control.T3.05b`, `05-control.T3.05c`) needed their demo-only helpers (`angle_of`, `determinant`, `stopping_speed`, `stopping_distance`) kept alongside the reference body, because their demo calls them.
- `04-embedded.T2.04a` also claimed a `Printed:` line its block deliberately cannot produce (its own comment says there is no `__main__` block); the stale sentence is gone.

### 2. The check can no longer be narrowed by accident
- `tests/test_module_full_solutions.py` no longer hard-codes a list: it discovers every package whose page prints a Full Solution block (46 today, with a floor assertion so a rename cannot empty it). That is the same measurement that found 26 broken pages; keeping it dynamic means a new module joins the check the moment its page gets a solution block.

### 3. Verification
- All 46 pages pass their packages; `validate_modules` exit 0, `lint_modules` 46/46, `module_parity --check` (95.1%, unchanged - this run touched prose and code blocks, not parity metadata), `run_exercise` all packages.

## [2026-10-17] — Run 43: Five Bridges, and the Page Drift Is Course-Wide

### 1. Five more modules done as the learner
- `00-foundations.T2.00f`, `01-electronics.T2.01a`, `01-electronics.T2.01b`, `03-sensors.T2.03a` and `04-embedded.T2.04a`: hints only, packages through `EXERCISE_TARGET`, Gate papers before their keys. Gates **8/8, 10/10, 8/8, 8/8, 11/11**, 0 hints, about a minute each in one sitting. Rows in `docs/dogfood-log.md`.

### 2. The finding: 26 of 46 pages fail their own tests
- Every one of the four new modules failed on its first attempt because the page's `### Full Solution` printed functions without the guards the suite checks (`r_shunt > 0`, `gain > 0`, `dt_ns > 0`, `di_amp > 0`, `tau > 0`). Running the page-vs-package check across all 46 bridge packages, instead of only the module being eaten, put the real number at **26 failing pages** - the drift is course-wide, not a Track 00 quirk.
- The four pages in this round now carry `solution.py`'s guarded body in front of their demo tail (with the `import math` the tail needs). The other 22 are recorded in `STATE.md` section 43; the fix is mechanical and identical.
- `tests/test_module_full_solutions.py` covers the fifteen repaired pages and is the check that keeps them honest.

### 3. Counts
- Instrumented parity **94.3% -> 95.1%** (Tier 2 95.0% -> 97.1%); coverage table regenerated, `--check` green.

### 4. Verification
- `validate_modules` exit 0, `lint_modules` 46/46, `test_module_full_solutions` 15 pages, the five packages at 21/34/39/21/34 cases, `run_exercise` all packages, `module_parity --check`.

## [2026-10-17] — Run 42: The Tier 2 Ladder Dogfooded

### 1. Five more modules done as the learner
- `00-foundations.T2.00a`-`e` each done with the hints alone (six or seven holes written by hand), the package run through `EXERCISE_TARGET`, then the module's Gate paper answered before its key. Gate scores **11/11, 11/11, 11/11, 12/12, 12/12**, 0 hints, about a minute each in one sitting. Rows are in `docs/dogfood-log.md`.

### 2. Two docstrings vs the tests
- `T2.00a`'s `running_integral` promised `out[k] = out[k-1] + values[k]*dt, out[-1] = 0`; the suite requires the first sample to be carried, so an attempt written to the docstring failed `test_constant_input` and `test_is_running_not_restarted`. The docstring now states `out[0] = values[0]*dt`.
- `T2.00e`'s `companion_state_matrices` said `B = [0, 1/J]`; the tests index `B[1][0]`, so `B` is a column. The flat form raised `'float' object is not subscriptable` in eight tests. Starter and page comment now show `[[0.0], [1.0/J]]`.

### 3. The page-vs-package test now guards both ladders
- `tests/test_module_full_solutions.py` covers all eleven Track 00 ladder modules. On its first run at Tier 2 it caught `00-foundations.T2.00f`'s page printing no `simulate_discrete` at all; that block now carries the reference implementation.

### 4. Counts
- Instrumented parity **93.5% -> 94.3%** (Tier 2 92.9% -> 95.0%); `docs/coverage-table.md` regenerated, `--check` green.

### 5. Verification
- `validate_modules` (70 modules, expected-output blocks), `test_module_full_solutions` across 11 pages, the five package suites (17/17/19/17/16 cases), `run_exercise` all packages, `lint_modules` 46/46, `module_parity --check`.

## [2026-10-17] — Run 41: The Tier 1 Ladder Dogfooded

### 1. Five modules done as the learner, with the clock running
- `00-foundations.T1.00a`-`e` were each done end to end from the in-course hints alone: the seven holes written by hand into a scratch copy, the package run through `EXERCISE_TARGET`, then the module's own Gate paper answered before the key was opened. Times (exercise + Gate): **2, 2, 2, 1, 2 minutes**, 0 hints, stuck `none`; Gate scores **10/10, 9/10, 12/12, 14/14, 8/8**.
- All five rows are in `docs/dogfood-log.md`, which credits `validated:dogfood_logged` for the ladder.

### 2. Every attempt failed on its first run, and every time the page was the reason
- The pages' `### Full Solution` blocks had drifted from `exercises/<id>/solution.py`: they printed functions with **no input guards**, while the suites test exactly those guards (`timestamps(0.0, 0.1, 0)`, `mean_of([])`, a calibration missing `"offset"`, a negative resistance, a zero inertia, a negative link length, a heading at the origin, a negative stiffness). `00-foundations.T1.00a`'s block had also lost `loop_total` - six of seven holes - so copying the page could never pass.
- The same page claimed a late start from `0.25 m` takes "three" ticks; its own test asserts **six** (`0.25 + 6 * 0.125 = 1.0`).
- Fix: each page's Full Solution now *is* the reference implementation the package runs, including the guards and `loop_total`.

### 3. The regression
- `tests/test_module_full_solutions.py` extracts every page's `### Full Solution` block, writes it to a temporary submission and runs that package's `test_*.py` against it through `EXERCISE_TARGET` - the same interface CI uses for the learner's file. Against the pre-fix `00-foundations.T1.00b` page it reports `1 failure, 6 errors`; on the repaired pages it is green.

### 4. Counts
- Instrumented parity **92.7% -> 93.5%** over 46 modules (Tier 1 92.5% -> 94.8%); the five ladder modules are at **100%**. `docs/coverage-table.md` regenerated, `--check` green, ratchet held.

### 5. Verification
- `validate_modules` (70 modules, 46 bridge, all expected-output blocks), `lint_modules` 46/46, `module_parity --check`, `test_module_full_solutions`, the five package suites from the scratch attempts (34, 31, 31, 33, 34 cases), and - as the negative path - the pre-fix `00b` page failing the new test.

## [2026-10-17] — Run 40: Every Module Runs on the Shared Arm

### 1. The plant question is settled, with the arm where it belongs
- **Before:** `executable:shared_plant` read **4/46**. Forty-two modules said nothing about the plant, so parity could not tell an exercise that runs on the capstone's arm from one that never mentions it.
- **The check that decided it:** every one of those 42 packages already calls `plant.*` in its `test_transfer.py` - the Transfer task genuinely runs on the shared arm - so all 42 declare `plant: tier1_arm_motor`; no module needed the `none` route.
- **What each page gained:** a `**On the shared arm.**` paragraph and a 3-8 line python block that reproduces one of that module's own Transfer figures from the plant's constants, then asserts it. Examples: the 1 kΩ/100 nF filter is exactly the plant's 1 ms tick; `4090 -> 10` wraps to 16 counts forward on its 12-bit encoder; the elbow's screw-axis linear part is `-L1`; the figure-8's amplitudes come back out of a 4000-sample lock-in at `plant.FREQ_HZ`; one encoder count at the 0.20 m reach already breaks the capstone's 0.50 mm spec at 3σ.
- **One hand-derived assert was wrong and the runner caught it:** `02-mechanics.T1.02a` compared the 8:1 gear's reflection ($64\,I_1$) against the 4:1 figure ($16\,I_1$). The block now uses the 4:1 ratio for the reflected-inertia claim, which is what the module actually teaches.

### 2. The decision is now a test
- `tests/test_module_parity.py` gains `TestNoModuleLeavesThePlantUndecided`: no module may be `undeclared` or `unhooked`, and the negative path pins both honest answers (a declaration with no import, and a `none` with no reason) at zero. 19 tests.

### 3. Counts
- Instrumented parity **87.2% -> 92.7%** over 46 modules (Tier 1 92.5%, Tier 2 92.9%, Tier 3 92.5%); `executable:shared_plant` **4/46 -> 46/46**; baseline re-recorded.
- One item remains: `validated:dogfood_logged` (45 modules). Every other instrumented item is at 46/46.
- `resources/plants/README.md` was stale in two places (it still said the 44 bridge modules ship no scaffold, and that the scored plant item was "currently unused"); it now states the 46-arm arrangement.

### 4. Verification
- `validate_modules` (every new block executed), `lint_modules` 46/46, `module_parity --check` after the re-record, `test_module_parity` (19), `test_plant`, `verify_repo` (1739 links, 0 errors), `audit_math`, `clean_tex --check`, `generate_python_lessons_data --check`, `lint_lessons`, `test_exercise_package`, `test_exercise_coverage`, `check_exercise_coverage` (46/46).
- Not re-run, because no package or app file changed: `run_exercise`, `tsc -b`, the smoke test and the browser E2E.

---

## [2026-10-17] — Run 39: Every Tier 3 Module Splits Into Use and Derive

### 1. The supported-entry level and the derivation, in all 12 Tier 3 modules
- **Before:** `tier3_two_levels` read **0/12**. `docs/SYLLABUS.md` says Tier 3 is studied two ways - Level A *Use & Understand* (what the method does, when to reach for it, how to check it is physically sane) and Level B *Derive & Extend* (the derivation, then one step past it) - but no module carried either heading, so the split existed only in the plan.
- **After:** every Tier 3 module carries both, at the end of `## 3. Formalization` and before the worked example. Level A is 150-250 words: what the method is for, when it is the right tool, one run on the module's own published numbers, and the checks that catch a wrong result (units, `det R = 1`, covariance symmetry, limit margins, convex hull, watchdog window). Level B is a numbered first-principles derivation that **earns** a result the module already publishes, then one **Extend** paragraph:
  - `00-foundations.T3.00a` - Rodrigues from the exponential series with $K^3 = -K$, $\det\exp = 1$, then the SE(3) twist.
  - `01-electronics.T3.01a` - the Cauer ladder as the continued fraction of a distributed thermal impedance, and the maximally-flat-delay condition that places Bessel poles ($4\zeta^2 - 3 = 0$).
  - `02-mechanics.T3.02a` - Euler-Bernoulli notch stiffness reproducing $2Ebt^{5/2}/(9\pi\sqrt R)$, and passivity as the skew-symmetry of $\dot M - 2C$.
  - `03-sensors.T3.03a` - the hexagon's inscribed radius $V_{\text{bus}}/\sqrt3$, the mid-range offset, and the $2/N$ Fourier normalisation.
  - `04-embedded.T3.04a` - centre-aligned ARR, the two-dead-time window, the Q1.31 rounding bound $2^{-32}$, and the SeqLock retry expectation.
  - `05-control.T3.05a` - the Joseph form as $E[e^+e^{+\top}]$ and its collapse to $(I-KH)P^-$ at the optimal gain; NEES as $\chi^2_n$.
  - `05-control.T3.05b` - the right-multiplicative injection from the body-frame error, why a left update injects the wrong frame, and the reset's double-count.
  - `05-control.T3.05c` - the QP from its Lagrangian and complementary slackness, and $h(t) \ge h_0e^{-\alpha t}$ by Grönwall.
  - `06-robotics.T3.06a` - the tanh backprop chain to the published $-24.0$ / $3.20$ check, and the z-score statistics.
  - `06-robotics.T3.06b` - GAE unrolled to $\sum(\gamma\lambda)^l\delta$, the clipped objective's piecewise gradient, and ensembling as a convex combination.
  - `07-systems.T3.06a` - $\text{PFH}_d \approx 2\lambda_{DU}(1-DC) + \beta\lambda_{DU}$ and the AAS-to-NodeId bijection.
  - `08-capstones.T3.07a` - the $3\sigma$ budget, the ZOH half-sample delay, and the phase erosion $\omega_{gc}\tau(180/\pi)$.

### 2. The split is a test, not a heading count
- `tests/test_module_parity.py` gains `TestTier3CarriesBothLevels`: both headings for every Tier 3 module, at least 400 characters under each, and at least one inline maths span in the derivation. The negative case proves two bare headings - or 400 characters of prose where a derivation belongs - fail. 17 tests.

### 3. Repairs the checks forced
- `verify_repo` found **12 errors** in the new material: five display-math fences glued to their prose in `02-mechanics.T3.02a` and `03-sensors.T3.03a`, and one bare `|` inside display maths in `04-embedded.T3.04a`. All six were fixed at the cause - fences on their own lines with blank lines around, and the absolute-value bars written with the `lvert`/`rvert` commands - not suppressed.

### 4. Counts
- Instrumented parity **85.9% -> 87.2%** over 46 modules (Tier 1 86.5%, Tier 2 87.2%, **Tier 3 83.0% -> 88.0%**); `structure:tier3_two_levels` **0/12 -> 12/12**; baseline re-recorded.
- Two items remain: `shared_plant` (42 undeclared or unhooked) and `validated:dogfood_logged` (45).

### 5. Verification
- `validate_modules`, `lint_modules` 46/46, `module_parity --check` after the re-record, `test_module_parity` (17), `verify_repo` (1739 links, 0 errors), `audit_math` (0 failures), `clean_tex --check`, `generate_python_lessons_data --check`, `lint_lessons`, `test_plant`, `test_exercise_package`, `test_exercise_coverage`, `check_exercise_coverage`.
- Not re-run, because no package or app file changed: `run_exercise`, `tsc -b`, the smoke test and the browser E2E.

---

## [2026-10-17] — Run 38: Every Module States Its Difficulty and Its Verification Route

### 1. The two metadata blocks reached the 45 modules without them
- **Before:** `difficulty_label` read **1/46** and `verification_route_declared` **27/46**; only the reference module carried the difficulty block, and 19 modules never said how their work is checked.
- **After:** all 46 modules carry both. Each `difficulty:` block sets `math`, `coding`, `tools`, `hardware_risk` and `simulation`; each `verification:` is `ci-native`, because `scripts/validate_modules.py` executes and diffs every module's blocks and `scripts/run_exercise.py` runs every package on the runner - the value the 27 modules that already declared one used.
- **How the numbers were chosen, stated so they can be argued with:** `math` counts the new mathematical objects the module introduces (1-2 for a Tier 1 tool module, 3-4 for the Tier 2 state-space/control block, 5 for `SO(3)` tangent spaces, flux-cancelling loops and PPO); `coding` follows the package's own hole count and language surface (3 holes -> 2, 8 holes in embedded C -> 4); `tools` counts what `## 6. Simulation path` names (0 for pure Python, 4 for KiCad 4-layer work, Zephyr/west, or a full bring-up bench); `hardware_risk` follows the module's own `safety_level` (`high` -> high, `low` -> medium, `none` -> low), since a simulation-only module's hazard is the bench work it describes; `simulation` is `full` in all 46 because `hardware_required` is false in all 46.
- **Ten modules declare `math >= 4` and `tools >= 3`**, which by `docs/QUALITY_SPEC.md` section 2's own rule makes them split candidates: `01-electronics.T2.01b`, `01-electronics.T3.01a`, `04-embedded.T2.04a`, `04-embedded.T2.04c`, `04-embedded.T2.04d`, `04-embedded.T3.04a`, `06-robotics.T3.06b`, `07-systems.T2.07a`, `07-systems.T3.06a`, `08-capstones.T3.07a`. They are listed rather than split, because splitting is a content decision and this run only published the measurement.

### 2. Counts, regenerated
- Instrumented parity **77.6% -> 85.9%** over 46 modules (Tier 1 86.5%, Tier 2 87.2%, Tier 3 83.0%); `structure:difficulty_label` **1/46 -> 46/46** and `executable:verification_route_declared` **27/46 -> 46/46**; the baseline re-recorded at the new floor.
- The remaining 14.1% is exactly three items, named per module in `docs/coverage-table.md`: the dogfood row (45 modules), `shared_plant` (42 undeclared or unhooked) and `tier3_two_levels` (**all 12** Tier 3 modules lack the `### Use & Understand` / `### Derive & Extend` pair).

### 3. Verification
- `validate_modules` (70 modules, every block executed), `lint_modules` 46/46, `module_parity --check` after the re-record, `test_module_parity`, `test_plant`, `test_exercise_package`, `test_exercise_coverage`, `check_exercise_coverage` (46/46), `verify_repo` (1739 links, 0 errors), `clean_tex --check`, `audit_math`, `generate_python_lessons_data --check`, `lint_lessons`.
- Not re-run, because no package or app file changed: `run_exercise`, `tsc -b`, the smoke test and the browser E2E.

---

## [2026-10-17] — Run 37: Every Bridge Module Closes Its Ladder

### 1. 21 modules that stopped at a Skip test now publish the ladder's Gate test
- **Before:** `structure:checkpoint_tests` read **25/46**. A Gate test existed only at the end of each ladder, so a learner who reached `00-foundations.T1.00a` could skip one module and nothing else; the ladder's exit exam was 25 modules away.
- **After:** all 46 bridge modules carry a `### Gate test` in `## 7. Checkpoint`. Each exam spans **every** concept its track-tier ladder introduces - the contract `scripts/validate_modules.py` already enforced for any module that published one - led by the module's own `new_concepts:` and recapping the rest. Question counts follow the ladder: 4-7 where it introduces 3-6 concepts, 8-14 where it introduces 12-18. Every exam has a `[Concept: ...]` tag on every question, a `**Gate answer key:**` python block of `assert`s, and a pass mark that maps each question to the module that teaches it.
- **The 00.T2 ladder had no gate at all**, so its six modules needed the 18-concept exam designed first; `00.T2.00a-e` now each publish their own version of it, and `00.T2.00f`'s existing exam is unchanged.
- **This reverses Run 35's placement decision, deliberately.** That run kept the Track 05 Tier 3 gate in `05c` so it would not examine a CBF before the module that teaches it. Publishing the exam in every module means an earlier module's gate must still tag the later concepts; those are the ladder's exit questions, and each gate's pass mark names the module that teaches them, so a learner who stops at `05a` sees an exam that covers `05b` and `05c` too. The ladder-final copy remains the canonical one - same contract, no prerequisite broken.

### 2. The coverage is now a test, not a score
- `tests/test_module_parity.py` gains `TestEveryBridgeModuleClosesItsLadder`: every module must publish a `### Gate test`, its tags must equal exactly the union of its ladder's `new_concepts:` (no gap, no straggler), and its answer-key block must run to the last assert. 15 tests.
- The negative path is the 21 modules that had no gate: the check named each one before the work, and names a missing tag or a raising key if either returns.

### 3. Counts, regenerated
- Instrumented parity **74.8% -> 77.6%** over 46 modules (Tier 1 76.9%, Tier 2 79.7%, Tier 3 75.5%); `structure:checkpoint_tests` **25/46 -> 46/46**; the baseline re-recorded at the new floor.
- `docs/ASSESSMENTS.md` and `docs/SYLLABUS.md`: the two places that stated a gate exists "only in the final module of each ladder" now state the 46-gate / 25-ladder arrangement and name the ladder-final copy as canonical.

### 4. Verification
- `validate_modules` (70 modules; every Gate test's tags match its ladder exactly, and every gate answer key executed), `lint_modules` 46/46, `test_module_parity` (15), `module_parity --check` after the re-record, `verify_repo`, `clean_tex --check`, `generate_python_lessons_data --check`, `audit_math`.
- Not re-run, because no package or app file changed: `run_exercise`, `tsc -b`, the smoke test and the browser E2E.

---

## [2026-10-17] — Run 36: Every Bridge Exercise Opens From a Scaffold

### 1. 45 bridge modules gained the starter a learner can begin from
- **Before:** `executable:learner_exercise_scaffold` read **1/46**. A bridge module's §5 stated the exercise and pointed at a graded package, but handed over no file to start writing in and no route from a stuck point - so the exercise could be graded and never attempted.
- **After:** every module with a package carries the reference module's three blocks, in this order and before the unchanged `### Break it on purpose`:
  - `### Starter code` - the package's own function/class stubs with `...` bodies and named `# TODO`s, one per hole (three in the two control bridges, five to eight elsewhere), plus a closing count of holes.
  - `### Hint ladder` - three or four numbered hints, each built on that exercise's own numbers rather than generic advice.
  - `### Full Solution` - a runnable block that implements the stubs, asserts §5's published values, and prints them, with its output quoted below.
- **The count in the request was 23; the score's own missing list was 45** (23 is the `ladder:5_practice_host` figure the coverage table reports, which was already 46/46). 45 modules were scaffolded, because 45 is what the scorer could name.

### 2. The scored item is now a tested contract, not a word
- `tests/test_module_parity.py` gains `TestTheLearnerScaffoldIsARealOne`: for every module, §5 must hold `### Starter code` with at least three `...`-bodied TODOs, a `### Hint ladder` of at least three numbered hints, and a `### Full Solution` carrying a python block - the reference module's shape, checked for all 46 rather than asserted one at a time.
- The negative case is asserted too: "Full Solution" plus a `TODO` in a print statement fails with the two missing headings, and a headed-but-thin scaffold fails on its TODO count. The suite is now 14 tests.

### 3. Running the new blocks found four wrong claims
- `04-embedded.T3.04a`: the low-side window at $d_{\max} = 0.88$, $t_{\text{dead}} = 250\,\text{ns}$ and a $25\,\text{kHz}$ carrier is $4300\,\text{ns}$, but the assert passed $40\,000$ as the carrier - $2500\,\text{ns}$. Fixed to the 40 µs carrier the hint describes, and the block's $2^{30}$ claim moved to $\cos(\pi/3)$, which is the value §4 actually publishes.
- `08-capstones.T3.07a`: the $3\sigma$ budget is $0.425883\,\text{mm}$; the assert wrote $0.425885$, failing by $1.6\,\mu\text{m}$ at its own $10^{-6}$ tolerance.
- `00-foundations.T1.00d`: a `$\circ$` written inside a code span, outside math mode (`verify_repo` error, now a math span).
- Every ``Printed:`` line was then diffed against the block's actual stdout: **0 mismatches across the 46 full solutions**, so a learner who runs the reference sees the numbers the page promises.

### 4. Counts, regenerated
- Instrumented parity **69.0% -> 74.8%** over 46 modules (Tier 1 73.8%, Tier 2 76.2%, Tier 3 74.2%), and the baseline re-recorded so the ratchet holds the new floor.
- `lint_modules` ladder stage `5 Practice (scaffold)`: **10/46 -> 46/46**; every other gated stage stays 46/46.
- `02-mechanics.T2.02a` remains the only 100% module; the coverage table names what each of the other 45 still lacks (mostly `verification_route_declared`, `checkpoint_tests`, the difficulty label, the shared plant and the dogfood row).

### 5. Verification
- `validate_modules` (70 modules, 46/46 Expected output blocks, every python block in every module executed), `lint_modules`, `module_parity --check`, `test_module_parity` (14), `test_exercises`, `test_plant`, `test_exercise_package`, `test_exercise_coverage`, `check_exercise_coverage` (46/46), `verify_repo` (1722 links, 0 errors), `clean_tex --check`, `audit_math` (0 failures), `generate_python_lessons_data --check`, `lint_lessons`.
- Not re-run, because no package or app file changed: `run_exercise`, `tsc -b`, the smoke test and the browser E2E.

---

## [2026-10-17] — Run 35: One Bridge Becomes Three

### 1. `05-control.T3.05a` split into a covariance, a rotation and a safety module
- **Before:** one 5-hour bridge carried the Joseph-form covariance update, the $SO(3)$ tangent-space injection with its reset, and the 1D CBF-QP - three skills a learner could not fail independently.
- **After:** three 2-hour modules in the same ladder, each with its own worked example, Skip test and graded package:
  - [`05-control.T3.05a`](modules/05-control.T3.05a.md) - optimal gain, Joseph posterior, NEES consistency. 17 tests, 5 planted faults.
  - [`05-control.T3.05b`](modules/05-control.T3.05b.md) - Rodrigues, right-multiplicative injection, and the reset, tested by a **zero-innovation** second update so a stale mean reads `0.10 rad` where a correct filter holds `0.05`. 14 tests, 5 planted faults.
  - [`05-control.T3.05c`](modules/05-control.T3.05c.md) - safe set, forward invariance, closed-form projection. 16 tests, 5 planted faults, and the ladder's exit Gate test (six questions spanning all three bridges).
- **Why the gate moved:** `scripts/validate_modules.py` requires any module that publishes a Gate test to tag every concept in its track-tier ladder, so a gate in each of three modules would examine CBFs before they are taught. The ladder now has one gate, at its end, and 05a/05b checkpoint on their Skip tests; the validator's contract is unchanged.

### 2. Every registry follows the split
- `modules/_index.yaml`: three bridge entries, `05-control.T3.05b`/`c` added, `05-control.T3.06` now requires `T3.05c`, and `feeds_into` chains a -> b -> c.
- `docs/SYLLABUS.md` and [`README.md`](README.md): **44/68 -> 46/70** modules, Tier 3 **117.0 -> 118.0 h** and the 3-pass total **323.5 -> 324.5 h**, three week-37 rows, and the two concept ladders now name the module that teaches each half.
- `05-control-and-estimation/README.md`: the Tier 3 pointer lists all three bridges, and each exercise's study link points at the module that actually carries its topic.
- `tests/test_exercise_coverage.py`: the repository check read a literal `44/44`; it now reads N/N from the gate's own output, so a module added or split cannot turn it red for the wrong reason.
- `docs/coverage-table.md` and `app/src/data/pythonLessonsData.ts`: regenerated - **46 modules, 82 workbench entries**, instrumented parity **68.6% -> 69.0%** (Tier 3 66.4% -> 68.2%), with the shared plant now declared and hooked in four modules.

### 3. Verification
- `validate_modules` (70 modules, 46/46 Expected output blocks), `lint_modules` (46/46 on every gated ladder stage), `run_exercise` (**46/46** packages: starter fails, reference passes, every planted fault fails its named test), `test_exercise_package`, `test_exercise_coverage`, `module_parity --check` (ratchet held), `generate_python_lessons_data --check`, `verify_repo`, `clean_tex --check`, `audit_math` (0 failures), `tsc -b`, smoke, real-browser E2E and the built-bundle E2E.

---

## [2026-10-17] — Run 34: The Browser Grades the Code, Not the Printout

### 1. A verification loophole, closed at the source
- **The hole:** `scripts/generate_python_lessons_data.py` gave every graded exercise entry an `instructorTests` value that was only a comment. The worker compiles that string and reports `instructorPassed`, so for all 44 exercise entries the instructor check was trivially true, and verification rested on `stdout` matching the expected `SELF-CHECK PASS:` line - a line the learner could simply print. Beginner lessons were never exposed (their `INSTRUCTOR_TESTS` are real assertions).
- **The fix:** an exercise entry's `instructorTests` is now the package's own `selfcheck.py`, read from disk at build time (`exercise_bundle.selfcheck_source`). The appended copy stays in the editor, visible and runnable, but it is no longer what awards verification.
- **The other half of the fix:** `TabPyodideRunner.tsx` now executes instructor tests in a namespace derived from the submission - public names only, minus every builtin name - so a submission cannot shadow `abs` or `len` to neuter an assertion, and a print-only program exposes nothing the tests can assert on.
- **Regression tests:** `tests/test_exercise_package.py` asserts, for every package, that `instructorTests` is the self-check source and not a comment, and that a namespace holding only a print-only spoof raises (`test_print_only_submission_fails_the_instructor_tests`, 44/44). `scripts/e2e_browser_workbench.mjs` step 2b drives a real Chromium: it selects `EX.05-control.T3.05a`, fills the editor with its expected PASS line, and asserts the output badge reads MATCHED while the behavioural badge reads FAILED and the verified tally stays at zero. `scripts/e2e_pages_bundle.mjs` now also asserts the behavioural badge on every exercise's starter (FAILED) and reference (PASSED) in the built bundle.
- **Measured, not assumed:** all 44 self-checks raise when executed with no learner code present (`/tmp` probe over the packages), so the new check has no free passes.

### 2. `05-control.T3.05a` - the reset drill could not see a stale mean
- The Break-it asked the learner to feed two identical `0.05 rad` corrections and expect `0.05 rad` rather than `0.10 rad`. That test is wrong: two real corrections compose to `0.10 rad` even under a correct reset (`R_z(0.05)R_z(0.05) = R_z(0.10)`), so it cannot separate a missing reset from a working one. It now injects once, resets, and runs a **zero-innovation** update: a correct filter holds `0.05 rad`, a stale mean applies the consumed correction again and reads `0.10 rad`.
- **Two numbers corrected in the same file:** the Joseph form at the corrupted gain `K = 1.5` is `3.25` (measured on `solution.joseph_variance(4.0, 1.0, 1.0, 1.5)`, with naive `-2.0`), not the `11.25` the text claimed; and the package runs **41** unittest cases, not `39`.
- **Staged practice:** section 5 now sequences the three skills as separately checkable steps (covariance only -> rotation error and injection only -> injection with reset -> barrier only), each with the numbers it must reproduce and the instruction to stop at the first failure. This is a sequence inside one module, not a split into three.

### 3. Verification
- `validate_modules` (44/44 blocks), `lint_modules`, `generate_python_lessons_data --check`, `module_parity --check`, `audit_math` (0 failures), `verify_repo`, `clean_tex --check`, `tsc -b`, `tests/test_exercise_package.py` (6 tests), `scripts/run_exercise.py` (44 packages), real-browser E2E, and the built-bundle E2E.

---

## [2026-10-17] — Run 33: The Same Two Stages, in Beginner Words

### 1. The twelve remaining modules gain both stages
- **`**Predict first (before you run it):**`** now opens `## 4. Worked example` in `00-foundations.T1.00a`-`T1.00e`, `02-mechanics.T1.02a`, `03-sensors.T1.03a`, `04-embedded.T1.04a`, `T1.04b`, `05-control.T1.05a`, `06-robotics.T1.06a` and `07-systems.T1.07a`. Each asks for two to four numbers its own worked example then prints, names the parameters in the question, and closes with the tell that separates a mistake from a surprise - `11` control ticks in a `10,000 us` window means the deadline at `t = 0` was counted as a run; a `q` peak of `0.60 rad/s` means the `1.5` factor in `1.5 dq/T` was lost; a `0.372 rad` overshoot equal to the clamped run's means anti-windup never engaged.
- **`### Break it on purpose`** now closes `## 5. Exercise` in the same twelve, with `**Inject** / **Symptom** / **Diagnose** / **Fix**`. Every fault is one the module or its package already names - `spring_force_sign_dropped`, `gravity_uses_sine`, `pole_pairs_counts_poles`, `clear_forgets_the_tilde`, the `range(1, n_steps)` hint, the RPM-times-torque row, the uint32 rollover row, the windup row, the missing cubic clamp, the deleted `ESTOP_LATCHED` branch - and each symptom quotes numbers the file already carries.
- **Coverage:** Predict **32/44 -> 44/44**, Break it **32/44 -> 44/44**; every ladder stage now reads 44/44 in `docs/coverage-table.md`. Instrumented parity **66.5% -> 68.6%** (Tier 1 67.8%), the ratchet holds.

### 2. Two numbers the review corrected
- `00-foundations.T1.00d` told the learner that passing `atan2(x, y)` on the exercise's `(-0.30, -0.40)` target returns `-36.87 deg`. It returns **`-143.13 deg`** - `-180 + atan(0.30/0.40)` - so the hint now says that; `-36.87` would need a positive `x`.
- `00-foundations.T1.00e`'s drill first said the sign-dropped spring ends "three orders of magnitude" above `0.2500 J`. Measured on `faults/spring_force_sign_dropped.py` over the worked example's 2,000 steps: **`E_final = 2,756.74 J`**, four orders of magnitude, and the block now quotes the measured value.

### 3. Verification
- `lint_modules.py` (no gaps; every gated stage 44/44), `module_parity.py` + `--check`, `validate_modules.py` on Python 3.12 (all 44 Expected output blocks), `node scripts/audit_math.mjs` (0 failures), `verify_repo.py` and `clean_tex.py --check` all pass. `validate_modules.py` on this host's Python 3.9 still stops at the pre-existing `float | None` annotation in `01-electronics.T1.01a`.

---

## [2026-10-17] — Run 32: Predict and Break-it Across Tier 2 and Tier 3

### 1. Twenty-four modules gain both stages
- **`**Predict first (before you run it):**`** now opens `## 4. Worked example` in every Tier 2 and Tier 3 module that lacked it - 24 files - asking for two to six specific numbers (or an ordering) that the module's own worked example computes, and closing with two "tells" that a wrong answer is a mistake rather than a convention. No number is new: every quantity quoted is one the worked example, Gate test or expected output already states.
- **`### Break it on purpose`** now closes `## 5. Exercise` in the same 24, with the four required bullets `**Inject** / **Symptom** / **Diagnose** / **Fix**`. Each fault is one the module already names - a planted package fault (`pll_raw_residual`, `svpwm_offset_uses_mean`, `slice_reads_written_half`, `counter_plain_delta`, `sto_no_filter`, `latency_forgets_zoh`, ...) or a `## 8. Common mistakes` row - and each symptom carries numbers, each diagnosis rules out a competing fault, each fix names the measurement that proves the repair.
- **Coverage:** Predict **8/44 -> 32/44**, Break it **8/44 -> 32/44**. Transfer was already gated at 44/44. Instrumented parity **62.5% -> 66.5%**; the ratchet holds without a baseline rewrite.
- **The twelve remaining gaps are Tier 1 modules** (`00-foundations.T1.00a`-`T1.00e`, `02-mechanics.T1.02a`, `03-sensors.T1.03a`, `04-embedded.T1.04a`-`T1.04b`, `05-control.T1.05a`, `06-robotics.T1.06a`, `07-systems.T1.07a`), outside this run's stated scope and still reported by `scripts/lint_modules.py`.

### 2. A number the review corrected
- The Rodrigues fault description first claimed `det(R) = 2.4674` and `max|R^T R - I| = 1.4674` at `pi/2`. Measured on the planted `rodrigues_over_rotates.py`: **`det = 4.6207`, `max|R^T R - I| = 3.6207`**, with `R[0][0] = -1.4674` and `R[0][1] = -1.5708`. The block now states the measured values and names both missing normalisations (`1/theta` and `1/theta^2`), which is why the fault is exact only at `1 rad`.

### 3. Verification
- `lint_modules.py` (32/44 both stages, no gated stage lost), `module_parity --check`, `test_module_parity`, `verify_repo`, `clean_tex --check`, `validate_modules.py` on Python 3.12, and `node scripts/audit_math.mjs .` (0 failures) all pass. `validate_modules.py` on this host's Python 3.9 still stops at the pre-existing `float | None` annotation in `01-electronics.T1.01a`.

---

## [2026-10-17] — Run 31: Generated Counts, and Two Rigs Named Out Loud

### 1. The coverage report stops typing its own numbers
- **`scripts/module_parity.py`** said "Behavioural tests for the other 0 modules: 44 exercise packages exist" followed by a hand-written list of thirteen package names - a sentence and a list that had both outlived the facts. It is replaced by a generated **The exercise registry** section that reads `exercises/` at build time and prints the graded, browser-driven and behaviour-graded counts (**44/44**, **44/44**, **44/44** today), naming the modules that are missing whenever any are. `docs/coverage-table.md` regenerates from it, so the prose can no longer disagree with the table beneath it.

### 2. The "one recurring plant" claim is now two rigs, named
- **`docs/SYLLABUS.md` §C.1** claimed all six Tier 2 Foundations modules use "the same Tier 1 robot joint" at $J = 0.02\text{ kg}\cdot\text{m}^2$, $b = 0.05$, $m = 0.35\text{ kg}$. None of the six worked examples does: they run a $1\text{ kg}$ cart at $\Delta t = 10\text{ ms}$ (`T2.00a`), a lever and force (`T2.00b`), a $0.02\text{ kg}\cdot\text{m}^2$ teaching shaft with $k = 8$, $b = 0.40$ (`T2.00c`), a $\omega_n = 100\text{ rad/s}$ structure (`T2.00d`), a $J = 1$ model at $T_s = 50\text{ ms}$ (`T2.00e`) and an $850\text{ Hz}$ notch at $4\text{ kHz}$ (`T2.00f`). The section now says so, prints the plant's real inertias ($I_1 = 0.008$, $I_2 = 0.003\text{ kg}\cdot\text{m}^2$; $b_1 = 0.04$, $b_2 = 0.02$) and states the difference is deliberate - the teaching rig isolates one idea, and every graded package's transfer suite runs on the capstone arm.
- **`modules/00-foundations.T2.00a.md` §5** adds the sentence that makes the switch explicit at the point the learner meets it: the graded package runs on the shared arm, not on the $1\text{ kg}$ cart above.

### 3. Verification
- `module_parity --check`, `test_module_parity`, `verify_repo`, `clean_tex --check`, `lint_lessons`, `lint_modules` and `node scripts/audit_math.mjs .` pass. `validate_modules.py` passes on Python 3.12; on this host's Python 3.9 it stops at `01-electronics.T1.01a`'s `float | None` annotation, a pre-existing incompatibility in a block this run did not touch.

---

## [2026-10-17] — Run 30: Every Exercise in the Browser, Not a Sample

### 1. The browser suite discovers its list
- **`scripts/e2e_pages_bundle.mjs`** no longer carries a hand-kept `EXERCISE_IDS` array (24 of 44 entries at the start of this run). It reads every `exercises/<package>/exercise.json`, honours `delivery.workbench_id`, and drives **all 44** graded entries on the built Pages bundle in Chromium and Firefox: the starter fails on its own `NotImplementedError`, the reference prints its `SELF-CHECK PASS:` line, and the output badge reads MATCHED. A package added to `exercises/` is in the suite the next run, so there is no second list to forget.
- **The bundle is counted, not trusted:** the suite asserts the number of `lesson-item-EX.*` entries in the app equals the number of packages, so an entry the registry loses fails before the first click. It also waits for each exercise's starter to replace the previous exercise's reference in the editor, so a slow state update cannot grade the wrong program.
- **Measured:** all 44 entries (starter run + reference run each) in **12.2 s** in Chromium and **14.7 s** in Firefox on the built bundle locally, so the whole suite still fits one CI step.
- **`scripts/module_parity.py`** no longer demands the entry id as a literal in the E2E script (a derived list cannot contain one); it accepts the script that names the id *or* discovers every `exercises/<package>/exercise.json`, so the coverage table's Browser E2E column stays **44/44** instead of going blank.

### 2. Docs stop claiming less than the tree does
- **`docs/QUALITY_SPEC.md` §1** states the browser list is the package list, with the count asserted on both sides; **§4** drops the two "not instrumented" items (behavioural tests for module exercises, module exercises in the workbench) that the 44 packages and this suite have since delivered.
- **Verification:** `npm run build`; `node scripts/e2e_pages_bundle.mjs` with `PLAYWRIGHT_BROWSERS=chromium` and again with `both` (44/44 in Chromium and Firefox, tablet overflow 0 px); and after the doc and parity edits, `module_parity --check`, `test_module_parity`, `verify_repo`, `clean_tex --check`, `generate_python_lessons_data --check`, `test_exercise_coverage` and `node scripts/audit_math.mjs .` (0 failures).

### 3. A grading threshold that depended on the interpreter
- **`exercises/06-robotics.T3.06a/test_transfer.py`** trained its cloned policy at `lr=0.2` for 600 steps - close enough to the edge that the only difference between Python 3.9 and 3.12 (`math.tanh`'s last bits) moved the held-out fit by **40%** (0.0201 vs 0.0143 N*m) and the closed-loop RMS by **12%**. The reference solution therefore failed its own transfer test on this host's system Python 3.9 (mean error 0.02008 against a 0.02 limit, RMS 1.118x the analytic model) while passing on 3.12. The same policy trained at `lr=0.1` for 1200 steps converges to the same optimum on both interpreters - 0.00684 N*m and 0.9129 mm RMS, identical to four decimals - so the thresholds grade the model class, not the host's libm. **No threshold was moved.**
- **Verified:** `scripts/run_exercise.py` reports **44/44** on Python 3.9.6 and again on `/opt/homebrew/bin/python3.12` (previously 43/44 on 3.9).

### 4. The workbench tallies were literals, and CI went red for it
- **`scripts/smoke_test_workbench.mjs` and `scripts/e2e_browser_workbench.mjs`** asserted the registry size as the literal `49` (label, `k / 49 Verified`, portfolio lines) while the generated registry grew to **80** entries as the last thirty-one exercise packages landed - so the push above failed CI at the smoke step on a change that touched no app code, and the dev-server E2E behind it would have failed next. Both now derive the total from the registry (`PYTHON_LESSONS.length` in the smoke test, the page's own `k / N Verified` tally in the browser). The smoke test's exact-count assertion is replaced by an id-uniqueness check; `generate_python_lessons_data.py --check` remains the gate on content.
- **Verified:** `npm run test:smoke` passes at 80 entries; `npm run test:e2e` (real Chromium, Pyodide) passes end to end.

---

## [2026-10-17] — Run 29: Every Module Graded, and the Gate Has No Baseline

### 1. The last twenty gaps closed
- **Twenty new packages**, one per bridge module that shipped prose with nothing to run: `00-foundations.T1.00a-e`, `01-electronics.T2.01a`, `T2.01b`, `T3.01a`, `02-mechanics.T3.02a`, `03-sensors.T1.03a`, `T3.03a`, `04-embedded.T1.04a`, `T1.04b`, `T2.04a`, `T2.04b`, `T2.04c`, `T3.04a`, `05-control.T1.05a`, `T3.05a`, and `08-capstones.T3.07a`. Each carries the full contract: a starter of holes, a reference solution, a behaviour suite pinned to the module's own worked example, exercise, Break-it case, Skip test and Gate test, a transfer suite driving the shared plant or a datasheet figure, a browser self-check with one `SELF-CHECK PASS:` line, five planted faults each failing a named test, a print-only cheat case, and a manifest.
- **Coverage 54.5% -> 100% of bridge modules graded.** `scripts/run_exercise.py` reports all 44 packages green - reference passes, starter fails on `NotImplementedError`, every fault fails the test named for it, the flattened browser entry passes, the print-only submission fails. Overall instrumented parity **54.5% -> 62.5%**; every new module also gained its `### Graded package` block, so `tests/test_exercise_package.py` finds the link the learner needs.
- **Numbers that had to be fixed rather than asserted:** the plant's straight-arm shoulder torque is `0.318825 N*m` (three levers, not two); six dB is `10^(6/20) = 1.9953`, not two; `apply_bits(0x5A, 1<<6, 1<<3)` is `0x52`, because bit 6 was already set - the module said `0x72` and now says why; a 1001-byte stack pads to 1008 while 1000 is already aligned; and a Joseph posterior with an over-sized gain is `3.25`, not the naive `11.25`.

### 2. The gate is a wall now
- **`scripts/check_exercise_coverage.py` (rewritten)** - the ratchet and `docs/exercise-baseline.json` are gone. Any bridge module with no package fails the build, and so does a package missing a required file, a manifest whose `id` is not the module's, or a package with no planted fault. There is nothing to update and nothing to allow: a new module without its exercise is a red build.
- **`tests/test_exercise_coverage.py` (rewritten)** - eight cases: no package fails, an incomplete one fails, one gap among graded neighbours still fails, a wrong manifest id fails, a fault-less package fails, `--dry-run` reports without failing, and the repository itself passes at **44/44**.

### 3. Verification
- CI parity locally: `verify_repo`, `clean_tex`, `validate_modules`, `lint_lessons`, `lint_modules`, `module_parity --check`, `test_module_parity`, `generate_plant_data --check`, `test_plant`, `test_model_levels`, `check_term_order`, `generate_python_lessons_data --check`, `run_exercise`, `test_exercise_package`, `check_exercise_coverage`, `test_exercise_coverage` and `run_all_labs` all pass. `tests/test_exercises.py` has one **pre-existing local** failure - `/usr/bin/g++` on this macOS host cannot find `cstdio` - reproduced on a clean `HEAD` worktree, untouched by this run and green on CI's Ubuntu image.

---

## [2026-10-17] — Run 28: The Switch, the Duty and the Leg (`exercises/01-electronics.T1.01b/`)

### 1. Seven holes from the gate to the bridge
- **`exercises/01-electronics.T1.01b/` (new)** - `conduction_loss`, `pwm_effective_voltage`, `shoot_through_current`, `h_bridge_voltage`, `bridge_conduction_loss`, `within_recommended`, `duty_for_effective_voltage`. **25 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** conduction loss without the square; a shoot-through current through one switch (half the real fault); an H-bridge that adds the duties, so a reversing command drives forward at $+12\text{ V}$; a bridge loss that counts one switch (half the heat); and a `65%` duty accepted as a fraction, asking $780\text{ V}$ of a $12\text{ V}$ bus.
- **Transfer drives the plant at 70% duty:** a square wave switching its $2.5\text{ N}\cdot\text{m}$ clamp must average exactly $1.75$, never exceed the clamp, and full duty must travel further - PWM on a mechanical plant, not a web page.

### 2. Delivery
- Module §5 gains **`### Graded package - the switch, the duty and the leg`**; §6 points at `EX.01-electronics.T1.01b`.
- Registry **57 entries**; pages E2E **twenty-one** exercise entries; browser tallies move to 57.
- Coverage: overall **57.8% -> 58.1%**; Tier 1 **54.5% -> 55.4%**.

---

## [2026-10-17] — Run 27: The Three Laws on the Bench (`exercises/01-electronics.T1.01a/`)

### 1. Seven holes from Ohm to the derating rule
- **`exercises/01-electronics.T1.01a/` (new)** - `stall_current`, `divider_unloaded`, `divider_loaded`, `joule_power`, `led_series_resistor`, `led_current`, `within_derating`. **25 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a divider with the top leg in the fraction ($20.9\text{ V}$ into a $3.3\text{ V}$ pin - the module's own destroyed-pin case); a loaded divider that ignores the load; Joule heating without the square; an LED resistor that divides the whole supply ($500\ \Omega$ where $290$ belongs); and a derating check that allows the full nameplate rating.
- **Transfer uses the plant's numbers:** the shoulder damper's $B_1\dot{q}^2$ is the same $I^2R$ form at a measured peak of $0.36\text{ W}$ - a quarter-watt part fails the rule and a one-watt part at half rating passes - the $24\text{ V}$ sensing divider still protects a $3.3\text{ V}$ ADC under a $100\text{ k}\Omega$ load, and the $20$-byte $1\text{ kHz}$ frame at 8N1 is $200\text{ kbit/s}$, above the link that drops frames and below the one that does not.

### 2. Delivery
- Module §5 gains **`### Graded package - the three laws on the bench`**; §6 points at `EX.01-electronics.T1.01a`.
- Registry **56 entries**; pages E2E **twenty** exercise entries; browser tallies move to 56.
- Coverage: overall **57.5% -> 57.8%**; Tier 1 **53.7% -> 54.5%**.

---

## [2026-10-17] — Run 26: The Moving Ghost Cab (`exercises/06-robotics.T1.06a/`)

### 1. Seven holes between the step and the spring
- **`exercises/06-robotics.T1.06a/` (new)** - `cubic_rest_to_rest`, `cubic_coefficients`, `peak_velocity`, `min_duration_s`, `min_duration_for_acceleration`, `spring_damper_torque`, `compliance_deflection`. **27 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a parabola in $s$ that reaches the target at the right position **at full speed**; a peak speed taken as the average, which undersizes the actuator by a third; a minimum duration solved with the average speed, so the move leaves at 1.5x its limit; a spring-damper that swaps the position and velocity gains; and a compliance yield that multiplies by stiffness.
- **Transfer feeds the submission the plant's own gains:** its spring-damper must equal `plant.pd_gravity_torque` at three states to $10^{-12}$, a cubic from the plant's current figure-8 pose must land on the next target still and with a $1.5\Delta q/T$ peak, the $1\text{ kHz}$ step setpoint is shown to demand $1000\text{ rad/s}$ where the cubic peaks at $1.5$, and the yield must be the plant's static equilibrium.
- **Two test expectations were wrong and are now the module's own rule:** the plant's feedforward law is *not* zero at rest with $q_d = q$ (it is $\tau_g$), and the terminal deceleration at *exactly* $t = T$ must stay $-6\Delta q/T^2$ - the profile is held still strictly *after* $T$, not at it.

### 2. Delivery
- Module §5 gains **`### Graded package - the moving ghost cab and the spring`**; §6 points at `EX.06-robotics.T1.06a`.
- Registry **55 entries**; pages E2E **nineteen** exercise entries; browser tallies move to 55.
- Coverage: overall **57.2% -> 57.5%**; Tier 1 **52.8% -> 53.7%**.

---

## [2026-10-17] — Run 25: The Scan, the Chain and the Sweep (`exercises/07-systems.T1.07a/`)

### 1. Seven holes between the PLC and the plot
- **`exercises/07-systems.T1.07a/` (new)** - `scan_frequency_hz`, `safety_chain_ok`, `plc_scan_step`, `gain_db`, `phase_lag_deg`, `sine_amplitude`, `db_to_ratio`. **32 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a scan budget divided as seconds (500 Hz reads as 0.5 Hz); a series NC chain evaluated with `any`, so one broken wire still powers the cell; a latch that clears when the chain closes, which restarts the robot on the mushroom release; amplitude gain in `10 log10` (half the decibels); a phase reported as a lead; and a lock-in that cannot reject the neighbouring frequency.
- **Transfer measures the plant's own figure-8:** `sine_amplitude` must return `plant.AX` and `plant.AY` to $10^{-6}$ from samples of `plant.figure8_target`, reject the frequency next door, read the plant's 1 ms budget as its 1 kHz tick, and drop the power enable on the next scan after a wire break. The first `plc_no_latch` fault cleared only on a reset press and therefore passed the very test it exists to fail; it now clears unconditionally and fails.

### 2. Delivery
- Module §5 gains **`### Graded package - the scan, the chain and the sweep`**; §6 points at `EX.07-systems.T1.07a`.
- Registry **54 entries**; pages E2E **eighteen** exercise entries; browser tallies move to 54.
- Coverage: overall **56.9% -> 57.2%**; Tier 1 **52.0% -> 52.8%**.

---

## [2026-10-17] — Run 24: The Audit Arithmetic and the Dual Channel (`exercises/07-systems.T3.06a/`)

### 1. Seven holes a factory acceptance audit asks about
- **`exercises/07-systems.T3.06a/` (new)** - `opc_ua_pubsub_rate_bps`, `diagnostic_coverage_pct`, `pfh_common_cause`, `pld_ok`, `sto_evaluate`, `aas_opcua_nodes`, `reset_interlock`. **31 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a 14-byte frame header charged to every variable (double the wire truth at eight variables); coverage returned as a fraction; the common-cause term counted once per channel, which is the assumption Category 3 refuses; a PLd check with an inclusive upper bound; a discrepancy check with no filter, so a normal 12 ms contact skew latches every E-stop; and a reset interlock that restarts as soon as the fault clears.
- **Transfer runs the plant's own numbers:** its 20-byte, 1 kHz frame as a PubSub stream is 30000 B/s - still inside the 500 kbaud link that drops nothing and past the 115.2 kbaud one that drops 412 frames - and the STO decision is evaluated on **every tick** of the 1 kHz loop, where torque is gone on the tick Channel A opens and the latch lands one tick after the 20 ms window.
- **One test was wrong, and the run caught it:** `9.9e-7` sits *inside* PLd's `[1e-7, 1e-6)` band; the test now asserts it passes and uses `1.1e-6` for the refusal.

### 2. Delivery
- Module §5 gains **`### Graded package - the audit arithmetic and the dual channel`**; §6 points at `EX.07-systems.T3.06a`.
- Registry **53 entries**; pages E2E **seventeen** exercise entries; browser tallies move to 53.
- Coverage: overall **56.6% -> 56.9%**; Tier 3 **53.8% -> 55.1%**.

---

## [2026-10-17] — Run 23: The Scoreboard, the Blender and the Shield (`exercises/06-robotics.T3.06b/`)

### 1. Seven holes from the return to the watchdog
- **`exercises/06-robotics.T3.06b/` (new)** - `discounted_returns`, `advantages`, `ppo_clip_term`, `ppo_loss`, `temporal_ensemble`, `safety_shield`, `watchdog_trip`. **28 tests**, five faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a return discounted from the start of the rollout instead of from $t$; a PPO term that takes `max`, which is identical for a positive advantage and doubles the step for a negative one; a uniform average of overlapping chunks, so a stale prediction counts as much as the fresh one; a shield that respects the joint limits but never the step clamp; and a watchdog that compares the wall clock to the timeout instead of the heartbeat.
- **Transfer scores the plant's own run:** the discounted return of its tracking errors must equal a brute-force sum at four steps, the plant's own targets must pass through the shield with $<2\%$ RMS change, and a hostile policy commanding $+3\text{ rad}$ must leave the arm inside its joint range and slow.
- **Two test bugs found before commit:** `1.1 - 1.0` is not exactly `0.1` in binary, so the watchdog's boundary case now uses `1.5 - 1.0` against `0.5`; and the ensemble's expected value was off in the fifth decimal against the module's own printed `0.5027`.

### 2. Delivery
- Module §5 gains **`### Graded package - the scoreboard, the blender and the shield`**; §6 points at `EX.06-robotics.T3.06b`.
- Registry **52 entries**; pages E2E **sixteen** exercise entries; browser tallies move to 52.
- Coverage: overall **56.3% -> 56.6%**; Tier 3 **52.4% -> 53.8%**.

---

## [2026-10-17] — Run 22: Backpropagation checked by finite difference (`exercises/06-robotics.T3.06a/`)

### 1. Seven holes from the loss to the trained policy
- **`exercises/06-robotics.T3.06a/` (new)** - `mse_loss`, `forward`, `backward`, `apply_gradients`, `z_score`, `train_bc`, `predict`. **20 tests**, five faults, a print-only cheat and a browser entry.
- **The decisive test is a central finite difference on every parameter** of a small net, so a backward pass that is shape-correct but derivative-wrong cannot pass; the rest pin the mean loss, the tanh, the descent direction, an unmuted input dict, the z-score and its guard, the loss falling below 1% of its start, and identical seeds giving identical policies.
- **Transfer trains on `plant.gravity_torque`** across the arm's workspace: held-out error under 1% of the 2.5 N*m limit, the learned map checked where the cosine bends, and then the policy **put inside the plant's PD loop**, where it tracks the figure-8 within 5% of the analytic model's 0.91 mm RMS.
- **The browser runner has a 400k line-step budget**, and the first self-check spent it: the entry timed out in Pyodide rather than failing a claim. The in-page check now trains a 24-sample, 120-step policy to prove the pipeline, and the native suite keeps the generalisation claim.

### 2. Every graded module now declares how it is verified
- **`verification: ci-native`** added to the 14 graded modules that had none; Executable rises from 40% to 52-60% per module across tracks 00, 03, 04, 05, 06 and 07, and the parity ratchet passes with the scores up.
- Module §5 gains **`### Graded package - backpropagation by hand, checked by finite difference`**; §6 points at `EX.06-robotics.T3.06a`.
- Registry **51 entries**; pages E2E **fifteen** exercise entries; browser tallies move to 51.
- Coverage: overall **54.2% -> 56.3%**; Tier 2 **58.2% -> 62.2%**; Tier 3 **51.8% -> 52.4%**.

---

## [2026-10-17] — Run 21: The Bag, the Clock and the Decimation (`exercises/06-robotics.T2.06b/`)

### 1. Seven holes between the simulator and the disk
- **`exercises/06-robotics.T2.06b/` (new)** - `timer_steps`, `intra_process_saving_mb_s`, `disk_rate_mb_s`, `bag_size_mb`, `replay_derivative`, `wall_delay_s`, `control_decimation`. **24 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a timer period that is rounded or floored, so a 4.5-step period drifts ahead of the clock; an MCAP budget that leaves out the 32-byte per-message index (a fifth of a 128-byte joint state); a replay derivative divided by an assumed 100 Hz period instead of the stamp in hand; and a decimation that rounds 1000/300 to 3 instead of refusing it.
- **One planted fault was itself wrong, and the harness caught it.** `replay_uses_wall_dt` recomputed the same stamps the solution does and passed the very test it exists to fail; it is now `replay_assumed_dt`, divides by the node's 0.01 s, and fails.
- **Transfer records the plant:** the 20-byte telemetry frame at 1 kHz for a minute must be a few megabytes and its metadata must multiply its rate; a 250 Hz task on the 1 kHz clock fires four ticks apart, 250 times in 1000; and the figure-8 tip velocity must be identical at `--rate 1.0` and `--rate 4.0`.

### 2. Delivery
- Module §5 gains **`### Graded package - a recording budget, a replay clock and a decimation`**; §6 points at `EX.06-robotics.T2.06b`.
- Registry **50 entries**; pages E2E **fourteen** exercise entries; browser tallies move to 50.
- Coverage: `06-robotics.T2.06b` becomes behaviour-graded and browser-driven at **60.8%**; track 06 **52.5%**; overall **54.2%** over 44 modules.

---

## [2026-10-16] — Run 20: The Elbow as a Regenerative Load (`exercises/07-systems.T2.07a/`)

### 1. Seven holes across three safety mechanisms
- **`exercises/07-systems.T2.07a/` (new)** - `regen_energy_j`, `unclamped_bus_v`, `brake_resistor_max_ohm`, `brake_peak_current_a`, `rolling_counter_status`, `watchdog_timeout_s`, `hil_coverage`. **26 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** energy without the efficiency (33% oversized chopper); the bus voltage as `V + E/C` instead of the square-root form (24.01 V where the truth is 166 V); the resistor bound treated as a target; a counter compared with a plain subtraction, so every 16th frame reads as a fault; and a watchdog that fires after one frame whatever `n_miss` says.
- **Transfer sizes the chopper from the plant:** the elbow is spun up under `plant.TAU_LIMIT`, its **measured** kinetic energy drives a 24 V / 1 mF bus past the 28 V clamp, the resistor bound is proved tight at the peak, and the rolling counter runs over the plant's 1 kHz frame cadence.

### 2. Delivery
- Module §5 gains **`### Graded package - the elbow as a regenerative load`**; §6 points at `EX.07-systems.T2.07a`.
- Registry **49 entries**; pages E2E **thirteen** exercise entries; browser tallies move to 49.
- Coverage: `07-systems.T2.07a` becomes behaviour-graded and browser-driven; Tier 2 **57.4% -> 57.8%**; overall **53.9% -> 54.0%**; baseline re-recorded.

---

## [2026-10-16] — Run 19: The Graph's Promises and the Arm's Chain (`exercises/06-robotics.T2.06a/`)

### 1. Seven holes across ROS 2's three layers
- **`exercises/06-robotics.T2.06a/` (new)** - `qos_compatible`, `urdf_revolute_z`, `mat4_mul`, `transform_point`, `invert_rigid`, `interpolate`, `topic_bandwidth_mb_s`. **23 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a QoS rule that demands equality rejects the Reliable-to-Best-Effort pair ROS 2 connects every day, so the test enumerates all **16** combinations; a joint matrix with `Rz(-q)` is orthogonal and turns the wrong way; and a buffer that clamps `alpha` silently invents a pose no sensor reported.
- **One test was itself wrong, and the fault found it.** The product-order test compared `A@B` against `B@A` - which is symmetric under a reversed multiply, so `product_reversed` passed. It now asserts both products against **absolute** positions, and the fault fails as intended.
- **Transfer builds the plant's arm as a tf2 chain:** `Rz(q1) Trans(L1) Rz(q2) Trans(L2)` from `plant.L1`/`plant.L2` must equal `plant.fk` at five poses to `1e-12`, a tool point must land at the tip plus `d` along the tool axis, and the inverse must be the base seen from the tool at the tip's distance.

### 2. Delivery
- Module §5 gains **`### Graded package - the graph's promises and the arm's chain`**; §6 points at `EX.06-robotics.T2.06a`.
- Registry **48 entries**; pages E2E **twelve** exercise entries; browser tallies move to 48.
- Coverage: `06-robotics.T2.06a` becomes behaviour-graded and browser-driven; Tier 2 **57.0% -> 57.4%**; overall **53.7% -> 53.9%**; baseline re-recorded.

---

## [2026-10-16] — Run 18: Four Budgets and One Clock (`exercises/04-embedded.T2.04d/`)

### 1. Seven holes on the wire
- **`exercises/04-embedded.T2.04d/` (new)** - `wire_time_us`, `link_utilization`, `handle_total`, `spin_wcet_us`, `ntp_rtt_us`, `ntp_offset_us`, `rtos_utilization`. **26 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a frame that leaves out the 12-16 byte XRCE header; every link counted at 8 bits per byte, which makes an 8N1 budget 20% optimistic; a utilisation that averages the stream frequencies (exactly right for one stream, half the truth for two); and an offset taken as `t2 - t1`, which is the forward delay plus the true offset.
- **Transfer is the plant's telemetry frame.** The 20-byte frame at 1 kHz must saturate 115.2 kbaud and not 500 kbaud; the submission's unity crossing must land on the same baud rate where `plant.simulate_uart_tx` stops dropping frames (200 kbaud by both models, one analytic and one simulated); the NTP offset over that link is exact when the two directions are symmetric and biased by half the congestion when they are not; and the module's own 185 µs spin must fit the plant's 1 ms tick.

### 2. Delivery
- Module §5 gains **`### Graded package - the plant's own telemetry link`**; §6 points at `EX.04-embedded.T2.04d`.
- Registry **47 entries**; pages E2E **eleven** exercise entries; browser tallies move to 47.
- Coverage: `04-embedded.T2.04d` becomes behaviour-graded and browser-driven; Tier 2 **56.5% -> 57.0%**; overall **53.5% -> 53.7%**; baseline re-recorded.

---

## [2026-10-16] — Run 17: Three Frames, a PLL and a Noise Law (`exercises/03-sensors.T2.03a/`)

### 1. Seven holes on the circle
- **`exercises/03-sensors.T2.03a/` (new)** - `wrap_pi`, `third_phase`, `clarke`, `park`, `inverse_park`, `pll_step` and `allan_deviation`. **21 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a Clarke with the 2 dropped (`(i_a + i_b)/sqrt(3)`) matches at `theta = 0` and fails at three other angles; a Park at `+theta` is still a rotation with unit determinant and gets the quadrature sign wrong; a PLL with the raw residual only misbehaves when the estimate is just below `-pi` and the measurement just above it, where the raw difference is `2 pi - 0.04`; and `sigma/tau` fails the first averaging pair.
- **The PLL's own convention is documented, not fudged.** A discrete update advances the estimate to the *next* sample, so a locked loop leads the last measurement by exactly `omega * dt`; the test asserts that lead rather than pretending it is zero.
- **Transfer is the elbow again:** the PLL's velocity estimate on the plant's quantized joint angle must beat a one-tick finite difference on the same samples, a three-phase set built from the joint's own angle must demodulate to constant `i_q` for 400 ticks, and `plant.add_noise` must average down as `tau^-1/2` within 12% at windows of 1, 4 and 16 samples.

### 2. Delivery
- Module §5 gains **`### Graded package - the elbow, demodulated and tracked`**; §6 points at `EX.03-sensors.T2.03a`.
- Registry **46 entries**; pages E2E **ten** exercise entries; browser tallies move to 46.
- Coverage: `03-sensors.T2.03a` becomes behaviour-graded and browser-driven; Tier 2 **56.1% -> 56.5%**; overall **53.3% -> 53.5%**; baseline re-recorded.

---

## [2026-10-16] — Run 16: Margins, an Observer and an LQR Gain (`exercises/05-control.T2.05a/`)

The first package outside Track 00, and the first whose subject is the control loop the other tracks consume.

### 1. Seven holes, one Riccati fixpoint
- **`exercises/05-control.T2.05a/` (new)** - `phase_margin_deg` (with the loop's lag unwrapped), `phase_loss_deg`, `st`, `gain_crossover` (bisection plus a `ValueError` for a bracket with no crossing), `bryson_weights`, `observer_spectral_radius` and `lqr_gain` from the discrete Riccati recursion. **28 tests**, five faults, a print-only cheat and a browser entry.
- **The wrap is the trap:** `cmath.phase` reports +160 degrees for a loop that lags 200, so the naive margin is 340 where the truth is **-20**. A second fault drops the 180 complement entirely and reports the phase itself.
- **Transfer measures, it does not restate.** The elbow is shaped with a PD law on the plant's own inertia and damping; the crossover the submission finds is checked to be a true `|L| = 1`; one tick of the plant's 1 kHz clock is priced against the margin. An observer with error poles placed at 0.8 and 0.9 is then **run against the plant** - the measured decay is 0.9 per tick - and a Bryson-weighted LQR gain must bring the joint to rest from 0.2 rad.
- **One fault is the bug this package actually had.** The Riccati recursion was first written with `A P A^T` where `A^T P A` belongs; the fixed point still looked sane and the closed-loop radius still rounded to 0.99999, while the regulated joint never moved. The behaviour suite passed it; only the transfer test that runs the loop caught it. It is now planted as `lqr_ap_at`, so that mistake is graded rather than remembered.

### 2. Delivery
- Module §5 gains **`### Graded package - the elbow's margins, observer and regulator`**; §6 points at `EX.05-control.T2.05a`.
- Registry regenerates to **45 entries**; the pages E2E drives **nine** exercise entries; the hard-coded tallies in both browser suites move to 45.
- Coverage: `05-control.T2.05a` becomes behaviour-graded and browser-driven; Tier 2 **55.7% -> 56.1%**; overall **53.2% -> 53.3%**; baseline re-recorded.

---

## [2026-10-16] — Run 15: The First Tier 3 Package, on the Manifold (`exercises/00-foundations.T3.00a/`)

The graded pattern leaves Tier 2 for the first time, and the subject is the one where a wrong sign or a lost small-angle term is invisible to every check but the right one.

### 1. Six holes, one exponential
- **`exercises/00-foundations.T3.00a/` (new)** - `hat`, `vee` (which must refuse a matrix that is not skew), `mat3_mul`, `mat3_vec`, `exp_so3` (Rodrigues with a Taylor branch below `1e-7`) and `energy_rate`. **22 tests**, four faults, a print-only cheat and a browser entry.
- **Each test names a mistake:** a hat map with the transposed signs is skew, orthogonal-looking and rotates backwards - only `[w]_x v == w x v` catches it; `sin theta` without `/theta` is exact at `theta = 0` and `1`, and over-rotates everywhere else; a "tiny angle, return the identity" shortcut is wrong in the **first** order, so the nanoradian case is asserted against `I + [phi]_x` to `1e-17`; and `vee` that reads entries without checking symmetry answers the identity matrix instead of refusing it.
- **Transfer is the arm, rotated and balanced.** `exp_so3([0, 0, theta])` on the tip must equal `fk(q1 + theta, q2)` to `1e-12`; a full turn returns the arm to itself; and `plant.gravity_torque` must equal the central-difference gradient of the arm's potential energy, with damping lowering the energy by exactly `b1 qd1^2 + b2 qd2^2`.
- **One fault did not hold on the first try, and the harness said so:** `(1 - cos theta)/theta^2` at a nanoradian is wrong by `5e-19`, which no double-precision assertion can see. The fault was replaced by the shortcut that *is* observable (identity below `1e-7`), rather than by loosening the test that failed to catch it.

### 2. Delivery
- Module §5 gains **`### Graded package - the arm turned about its base`**; §6 points at `EX.00-foundations.T3.00a`.
- Registry regenerates to **44 entries**; the pages E2E drives **eight** exercise entries; the hard-coded tallies in `scripts/smoke_test_workbench.mjs` and `scripts/e2e_browser_workbench.mjs` move to 44.
- Coverage: `00-foundations.T3.00a` becomes behaviour-graded and browser-driven; Tier 3 **49.8% -> 50.5%**; overall **53.0% -> 53.2%**; baseline re-recorded.

---

## [2026-10-16] — Run 14: The Whole T2.00 Ladder Is Graded (`exercises/00-foundations.T2.00d/`, `-e/`, `-f/`)

Three packages in one run, so every lesson of the `00-foundations.T2.00a`-`f` ladder now ships starter, reference, behaviour suite, transfer suite, planted faults and a browser entry.

### 1. Three subjects, three kinds of mistake
- **`exercises/00-foundations.T2.00d/`** - complex response and Bode. Seven holes (`to_polar`, `to_rect`, `first_order_response`, `second_order_response`, `magnitude_db`, `phase_deg`, `resonance_peak`), **17 tests**, four faults (`ten_log`, `phase_radians`, `peak_at_natural`, `hardcoded_response`). The overshoot-style trap is `omega_r = omega_n`: the reported peak is checked as a point **on the reported curve**, which is exact at the worked `zeta = 0.05` and wrong beyond it.
- **`exercises/00-foundations.T2.00e/`** - state space, poles and Euler vs Tustin. Six holes, **16 tests**, four faults (`euler_minus`, `trace_only`, `forgot_damping`, `tustin_elementwise`). Stability is tested on a **saddle with a negative trace** (so `tr < 0` alone fails) and on a marginal pole; at `Ts = 0.4 s` Euler's poles must leave the unit circle while Tustin's do not.
- **`exercises/00-foundations.T2.00f/`** - sampling, pre-warping, biquad and covariance. Seven holes, **21 tests**, four faults (`alias_no_mirror`, `prewarp_unwarped`, `notch_unnormalized`, `covariance_no_transpose`). The notch must null a **sampled** 850 Hz tone (RMS ratio below `1e-3`) and pass 200 Hz; the covariance is checked against a 4000-sample Monte-Carlo of the plant's own ticks.
- **Transfer is the shared plant every time.** 00d measures the elbow's gain and phase by lock-in projection against the submission's transfer function; 00e checks the elbow's poles against `zeta`/`omega_n` from 00c and finds Tustin stable where Euler is not; 00f compares one closed-loop Euler step against a real `step_arm` tick - equal to the plant's `O(Ts^2)` ordering term and **not** to machine precision - and aliases the elbow's 8.2 Hz damped mode to 3.8 Hz at a 12 Hz sample rate.

### 2. Two defects the packages found in the prose
- **`modules/00-foundations.T2.00f.md`** stated `omega_a = 8000 tan(0.2125 pi) = 6297.25 rad/s`. The tangent is `0.788336`, so the value is **6306.69 rad/s** (`1003.74 Hz`); the 6297.25/1002.24 pair was arithmetic slip in both directions. The module now states the number its own formula gives, and `test_behavior.py` asserts it to `1e-3`.
- **`scripts/module_parity.py`** still described one exercise package and one browser entry in its "Not yet instrumented" note. It now reports seven packages and seven E2E-driven entries, which is what the files say.

### 3. Delivery
- Module §5 for each of 00e and 00f gains a **`### Graded package`** subsection (holes, what each test catches, fault names), and §6 points at `EX.00-foundations.T2.00e` / `EX.00-foundations.T2.00f`.
- Registry regenerates to **43 entries**; `scripts/e2e_pages_bundle.mjs` drives **seven** exercise entries on the built bundle; the hard-coded 41-lesson tallies in `scripts/smoke_test_workbench.mjs` and `scripts/e2e_browser_workbench.mjs` move to 43.
- `scripts/run_exercise.py`: **12/12 on seven packages** (starter fails on its holes, reference passes behaviour + transfer, each fault fails its named test, print-only passes nothing, both browser programs behave).
- Coverage: 00d **47.0% -> 54.5%**, 00e **47.0% -> 54.5%**, 00f **53.2% -> 60.8%**; Tier 2 **54.5% -> 55.7%**; overall **52.5% -> 53.0%**; baseline re-recorded with that reason.

---

## [2026-10-16] — Run 13: First- and Second-Order Response, and the Step Size That Lies (`exercises/00-foundations.T2.00c/`)

The fourth graded package, and the first one whose subject is partly the simulation itself.

### 1. Two orders, one stability limit
- **`exercises/00-foundations.T2.00c/` (new)** - six holes: `first_order_response`, `second_order_params` (`wn`, `zeta`, `wd`, `mp`), `critical_damping`, `settling_time` (refusing `zeta <= 0`), `simulate_step` (semi-implicit, velocity first) and `max_stable_dt`. **19 tests**.
- **Each test names a mistake:** `zeta` missing its factor of 2 (reads half as damped); overshoot as `exp(-pi zeta)`, which is within 3% at the worked `zeta = 0.5` and is only exposed at `zeta = 0.3`; `b_crit = 2 J k` (the module's own "if your result differs", dimensionally wrong); a settling time returned for an undamped system; and a simulation run past `2/wn`, asserted to **diverge** at `1.5x` the limit while staying bounded at `0.9x` - the integrator's property, not the physics.
- **The transfer suite uses the plant twice.** The elbow joint runs under a PD law, and the test accounts for the plant's own viscous damping `plant.B2` as part of `b` (a toy model would hide it, and the first draft was 7 points of overshoot wrong because of exactly that). The motor test measures 63.2% of steady current at `t = L/R` through `plant.simulate_motor` - the first-order answer, measured rather than restated.
- **Four faults** - `zeta_no_two`, `linear_bcrit`, `wrong_mp`, `hardcoded_params` - each fail the test named for them; `scripts/run_exercise.py` reports **12/12 on four packages**.

### 2. Delivery, unchanged
- Module §5 gains **`### Graded package - two orders, and the step size that lies`**; §6 points at `EX.00-foundations.T2.00c`. Registry regenerates to **40 entries**; the pages E2E's single `EXERCISE_IDS` list now drives **four** entries, green in chromium and firefox.
- Coverage: T2.00c **47.0% -> 54.5%** (reference tested, behaviour-graded, browser E2E all `yes`); overall **52.3% -> 52.5%**; baseline re-recorded with that reason.

---

## [2026-10-16] — Run 12: A Third Exercise Package, and the Arm's Own Jacobian as a Basis (`exercises/00-foundations.T2.00b/`)

The T2.00 ladder gets its second graded package, so "copy the shape, not the numbers" now has two copies and a template that obviously generalises.

### 1. Three tools, then the arm
- **`exercises/00-foundations.T2.00b/` (new)** - seven holes: `dot3`, `cross3`, `axial_force` (projection onto the lever's **unit** direction), `moment`, `det2`, `coordinates_in_basis` (Cramer's rule, `ValueError` on a singular pair) and `in_basis`. **17 tests** across `test_behavior.py` and `test_transfer.py`.
- **Each test names a mistake:** a projection that grows with lever length (no normalisation); a cross product that is `b x a` (magnitudes right, sign wrong, still orthogonal); a determinant with `+bc` (agrees on every axis-aligned basis); a hard-coded worked-example moment; a basis solve that returns infinities instead of refusing.
- **Transfer is the arm, not a new toy:** a `0.20 kg` payload's moment about the shoulder must equal `-m g x` *and* the shoulder torque from a finite-difference Jacobian; the tip Jacobian's columns are then used as a basis (tip velocity -> joint rates -> tip velocity, to `1e-6`), with the stretched pose (`q2 = 0`) refusing the inversion.
- **Four faults** - `flipped_cross`, `not_normalised`, `det_plus`, `hardcoded_moment` - each fail the test named for them; `scripts/run_exercise.py` now reports **12/12 on three packages**. One fault initially passed because it overrode `cross3` while the solution's `moment` called its own module-level function: the fault was not actually injected, and the harness said so.

### 2. Delivery, unchanged by design
- The module's §5 gains **`### Graded package - three tools, then the arm's own Jacobian`**; §6 points at the workbench entry `EX.00-foundations.T2.00b`.
- The registry regenerates to **39 entries** with no new code path; `e2e_pages_bundle.mjs` now drives **three** exercise entries from one `EXERCISE_IDS` list (no duplicated literal), green in chromium and firefox.
- Coverage: `00-foundations.T2.00b` **47.0% -> 54.5%** with *reference tested*, *behaviour-graded* and *browser E2E* `yes`; overall **52.1% -> 52.3%**; baseline re-recorded with that reason.

---

## [2026-10-16] — Run 11: Model Levels, and the Euler the Plant Actually Uses (`docs/MODEL_LEVELS.md`)

"Same robot across tiers" had no vocabulary: the plant was one model, and a richer lesson had nowhere to go that was not a quiet replacement. And its docstring called the step explicit Euler while the code did something else.

### 1. The naming bug, with a test that pins the order
- **`step_arm` and `simulate_motor` are semi-implicit (symplectic) Euler:** velocity/current is updated first, then position/angle uses the NEW value. The docstrings and `resources/plants/README.md` now say so, and `tests/test_model_levels.py::test_step_arm_updates_velocity_before_position` computes the new velocity itself and asserts the position moved by it - so the label cannot drift back. This matters because `00-foundations.T2.00a` teaches exactly this scheme: a learner implementing forward Euler now really does disagree with the plant.

### 2. Four levels, statuses that cannot flatter
- **`docs/MODEL_LEVELS.md` (new)** names A (joint-space arm, the model of record), B (local linear model), C (coupled dynamics) and D (actuator/sensor/timing), each with state, input, units, included and omitted effects, provenance, intended use and what it must not be used for. **C is "specified only"** and **D is "primitives only"** - stated, not faked.
- **`resources/plants/mechalab_models.py` (new) implements Level B:** `linearize(q1, q2)` (analytic A and B), `discretize(..., "forward-euler" | "semi-implicit" | "zoh")`, `simulate_linear`, and `compare_to_plant`. The level table is data (`LEVELS`), so `tests/test_model_levels.py` fails if a level stops documenting a field or claims an implementation it does not have.
- **Proved, not asserted:** every column of A against a central difference of `plant.motor_dynamics`; each discretisation against its closed form; ZOH against an independent series; and `compare_to_plant` perturbs `step_arm` about a real equilibrium (holding torque applied) and requires agreement **below 1e-9** - measured at **3e-11** at three poses. 11 tests, `npm run test:models`, in CI.

---

## [2026-10-16] — Run 10: The Pattern Ports to Tier 2 Foundations (`exercises/00-foundations.T2.00a/`)

Run 9 built the exercise package. This run proves it is a pattern, not a one-off: the first T2.00 foundations lesson now carries the same five-piece contract, on the arm's own encoder.

### 1. The lesson the review named first
- **`exercises/00-foundations.T2.00a/` (new)** - six functions with holes: `joint_velocity` (backward difference of the AS5600's 12-bit counts, wrapped across zero), `running_integral`, `state_matrices`, `one_step`, `simulate`, and `encoder_trace_angle` (counts -> velocity -> integral, which must land back on the encoder's angle). **17 tests** in `test_behavior.py` and `test_transfer.py`.
- **The tests are behavioural, and each catches a named mistake:** velocity must scale by exactly 10 when `dt` scales by 10; must use the `cpr` it is given; must read `4095 -> 0` as +1 count; the integral must be running, not restarted; the one-step test uses a state that *carries velocity*, where computing `v` from the new `x` is wrong by $10^{-2}$; the transfer suite moves the exercise onto the arm's figure-8 encoder trace at 1 kHz and onto a second plant ($m = 2.5$ kg, $k = 40$, $dt = 2$ ms).
- **Four planted faults** - `missing_dt`, `no_wrap`, `hardcoded_counts`, `sequential_update` - each fail the test named for them; the print-only file passes nothing. `scripts/run_exercise.py` now runs **12 checks on both packages**.

### 2. Delivery stays one pattern
- The module's §5 gains **`### Graded package - the same six steps on the arm's encoder`**, with the command and what each test catches; §6 points at its workbench entry.
- `scripts/e2e_pages_bundle.mjs` now drives **both** exercise entries on the built bundle (starter fails, reference PASS line, badge MATCHED) in chromium and firefox.
- Regenerating the registry produced `EX.00-foundations.T2.00a` with no new code path; the lesson runner is still the same worker with Run/Stop/Reset/limits.

### 3. The label moved with it
`docs/coverage-table.md` shows `00-foundations.T2.00a` at **54.5%**, with *reference tested*, *behaviour-graded* and *browser E2E* all `yes`, and *author dogfood*, *delayed transfer*, *independent learner* still `-`. Overall parity **52.0% -> 52.1%**; baseline re-recorded with that reason.

---

## [2026-10-16] — Run 9: The Reference Exercise, Delivered and Graded (`exercises/02-mechanics.T2.02a/`, `scripts/run_exercise.py`)

Run 8 made one module excellent content. This run makes it a **delivered exercise**: a starter with holes, tests a learner can fail, four wrong implementations that must not slip through, a browser entry that grades the same behaviour, and a validation label that says exactly what each column proves.

### 1. A package, not a paragraph
- **`exercises/02-mechanics.T2.02a/` (new)** - `starter.py` (six holes, each a `NotImplementedError`), `solution.py`, `test_behavior.py` (11 cases), `test_transfer.py` (3 cases), `harness.py`, `selfcheck.py` and four planted faults. The module's §5 now links it and documents the command; §6 documents the browser entry.
- **The tests grade behaviour, not text.** The Jacobian is compared with a central difference of the plant's own `fk` at five poses, including changed link lengths; `J` vs `Jᵀ` is separated by virtual work (`tau . dq == F . dx`) because zero-force checks cannot see a transpose; gravity is compared with `plant.gravity_torque` at five poses; and the transfer suite moves the payload from `0.20 kg` to `0.35 kg`, so a submission tuned to the worked example does not pass.
- **Four faults, each with a named accuser:** `wrong_frame` (elbow CoM in its own frame), `wrong_transpose` (`J F`), `hardcoded_pose` (the worked pose at every angle), `ignored_lengths` (the plant's lengths whatever the caller passed). `faults/print_only.py` recites the right numbers and defines nothing; it must pass nothing.

### 2. The three-way check is executable, and it is in CI
- **`scripts/run_exercise.py` (new, `npm run check:exercises`)** - 12 checks per package: package shape and module link; solution passes behaviour and transfer; the starter fails **on `NotImplementedError`** (not on an import error); each fault fails the specific test named in `exercise.json` (and a fault that cannot import does not count as caught); the print-only file fails; and both browser programs behave - solution prints the PASS line, starter fails on a hole.
- **`tests/test_exercise_package.py` (new, `npm run test:exercise`)** - keeps the package, the module link and the generated workbench entry in step, and re-runs the three-way check.

### 3. The same program in the workbench
- **`scripts/exercise_bundle.py` (new)** - flattens a package into one Pyodide program: the learner's file plus `selfcheck.py` appended **verbatim**, visible in the editor. `scripts/generate_python_lessons_data.py` emits that program as the registry entry `EX.02-mechanics.T2.02a`, with the self-check's PASS line as its expected output; the workbench needed one new filter tab (`Modules`), not a new runner. Run/Stop/Reset/limits and progress keying are unchanged.
- **`app/src/components/tabs/TabPyodideRunner.tsx`** - an `advanced` filter (`l.track === 'modules'`), and the hard-coded counts (`All (32)`, `Track P (13)`) are now computed from the registry, which had already drifted to 36 lessons before this entry.

### 4. Labels that cannot overclaim
- **Parity, Validated layer (now 2 items):** `dogfood_logged` (author first pass) and `behavioural_grading` (a package whose three-way check passes). The reference module keeps **100%** - it is the only module with both - and every score is now explicitly "of the requirements instrumented today".
- **`docs/coverage-table.md`** gains a **Validation evidence** table with separate columns for reference-solution tested, behaviour-graded, browser E2E, author dogfood, delayed transfer and independent learner. Only the first three carry the reference module; delayed transfer and independent learner print `-`.
- **`docs/dogfood-log.md`** gains the same split, item by item, marking *browser workflow tested* **partial** and *delayed transfer* **pending**.

---

## [2026-10-16] — Run 8: The Reference Module (`modules/02-mechanics.T2.02a.md`, `tests/test_module_parity.py`)

Milestone **M1** of the Tier 2/3 plan: take one module to a genuine 100% - content, plant, tests, dogfood row - so every later module has a shape to copy instead of an adjective.

### 1. One module at a real 100%
- **`modules/02-mechanics.T2.02a.md` (rewritten)** - 6-DOF counting, `SE(3)`, the Jacobian and its transpose, parallel-axis inertia - now runs on the shared plant. Section 4 chains two `T ∈ SE(3)` by hand and checks the tip against `plant.fk`, checks `det J` against `L1 L2 sin q2`, maps a tip force with `Jᵀ`, and rebuilds `plant.gravity_torque` from the two link CoM Jacobians to `6e-17 N·m`. Section 5 adds a five-`TODO` learner scaffold, a full solution with a **second, independent** route (`dU/dq` by central differences of the plant's own `fk`, agreeing to `6.16e-12 N·m`), a Transfer task with a measured payload result, and a `### Break it on purpose` whose fault is one token wide.
- **The Transfer claim, measured:** with a `0.20 kg` mass at the tip, feeding the payload forward as `Jᵀ(0, -m g)` leaves the capstone's figure-8 run **bit-identical** to the payload-free one (`0.9130 mm` RMS, `2.4016 mm` peak); without it, `3.59 mm` and `5.41 mm`. That factor is this module's argument for the transpose, and it is graded on those numbers alone.
- **The Break-it fault, measured:** taking the elbow link's angle in its own frame (`cos q2`) instead of the world frame (`cos(q1 + q2)`) invents `0.0736 N·m` at the vertical pose, holds the elbow `0.3549°` off target, and degrades the figure-8 run to `1.43 mm` RMS - while the worst mismatch along the trajectory is only `0.0677 N·m`. The tell is that the error is **exactly zero at `q1 = 0`**: a frame error, not a gain error.
- **Scored 100%:** Structure 4/4, Executable 5/5, Ladder 8/8, Validated 1/1. `docs/coverage-table.md` reads **1 arm · 0 exempt · 0 unhooked · 43 undeclared**, that row is `100.0%` with 0 missing items, and track `02` moves to 67.6%. Baseline re-recorded (overall **50.9% → 52.0%**, reason in its own `recorded_note`); the ratchet holds the gain.

### 2. Two course bugs the dogfood run found, both fixed with a test
- **The CI module runners could not import the plant.** `scripts/validate_modules.py` and `scripts/run_all_labs.py` execute every module's python blocks, but nothing had put `resources/plants/` on `sys.path`: the plant was built for the *workbench*, which writes it into Pyodide. A plant-wired module therefore failed on the runner with `ModuleNotFoundError`. Both scripts now put that one directory on `sys.path`, mirroring the browser, and the reference module's own worked example is the proof - it imports the plant and its stdout is diffed in CI.
- **The parity scorer rejected the spec's own metadata example.** `difficulty_findings` required each value line to end at the number, while `docs/QUALITY_SPEC.md` §2 writes a trailing `# comment` after every value - so a module written *to the spec* lost the Structure layer. The parser now allows the comment, and `tests/test_module_parity.py` (**new**, in the CI verify step and as `npm run test:parity`) holds both halves: the commented form parses, while a missing block, `math: 6`, `hardware_risk: extreme` and a non-numeric `coding:` are still findings. The same file asserts the shared-plant item keeps its teeth (a prose mention is not use; an unexplained `none` is not exempt), that the reference module still scores 100%, and that the baseline records today's item set - so a newly instrumented requirement stays a deliberate re-record.
- **`tests/test_plant.py` (28 → 32 cases)** gains `TestReferenceModuleClaims`: the module's quoted arm values, its `6.0×` rod ratio, the fault's `0.0736 / 0.3549 / 1.43 / 0.0677` figures and its Transfer output are all re-derived from the plant, so the template cannot drift away from the model it teaches.

### 3. Docs
- **`docs/QUALITY_SPEC.md` §7 (new) - "The reference module":** item by item, what a 100% module looks like, the four places its numbers are checked, and the rule for everything after it - *copy the shape, not the numbers*. §5's checklist now points at it.
- **A stale count removed.** The not-instrumented note said `INSTRUCTOR_TESTS` covers "the 36 beginner lessons"; the repository has 48. The spec and the coverage table now say "the beginner lessons only (the count lives in the lesson directories)", so the figure cannot go stale in prose again.
- **`docs/dogfood-log.md`:** the first row, with its two course bugs, labelled author-dogfood - not a beginner pilot.

---

## [2026-10-16] — Run 7: The Shared Plant, And Its Decision Scored (`resources/plants/`, `scripts/module_parity.py`)

Milestone **M0** continues. Run 6 built the measurement; this run gives the advanced modules the robot they were missing - and then makes "runs on that robot" a number CI can hold a module to, instead of an intention.

### 1. One plant, taken from the capstone's own numbers
- **`resources/plants/mechalab_plant.py` (new):** the executable model every Tier 2/3 exercise imports - `fk`, `ik`, `gravity_torque`, `figure8_target`, `disturbance_torque`, `step_arm`, `pd_gravity_torque`, `simulate_arm`, `simulate_motor`, `quantize_angle`, `encoder_counts`, `counts_to_rad`, `add_noise`, `crc8_ccitt`, `simulate_uart_tx`, `plant_summary`. Stdlib only, Python 3.8+, Pyodide-safe, so the *same* file runs on the host, in CI and in the browser.
- **`resources/plants/tier1_arm_motor.yaml` (new):** the same 33 values with the lesson that states each one - `L1 = L2 = 0.10 m`, `m1 = 0.20 kg`, `m2 = 0.15 kg`, joint inertias `0.008`/`0.003 kg·m²`, damping `0.04`/`0.02`, a ±2.5 N·m clamp, `Kp = 18`/`12` and `Kd = 0.60`/`0.35`, the 1 kHz step over 1000 ticks, the −0.15/−0.08 N·m payload pulse at 0.40–0.60 s, the Gerono figure-8, the AS5600's 4096 counts/rev and the 20-byte CRC-8 frame in a 256-byte TX ring.
- **The module, not the YAML, is the source of truth** (Pyodide has no YAML parser), and `tests/test_plant.py` (28 cases) fails if they disagree, fails any row whose provenance citation is missing, and asserts the physics: IK inverts FK, rest is a fixed point, the damping decay factor and terminal-speed law are exact, torque clamps, one-count encoder quantisation, seeded noise statistics, the outside CRC-8 check value (`0xF4` for `"123456789"`), and the two explicit-Euler stability refusals (`dt < 2*L/R`, `dt < 2*J/b`). `simulate_motor` takes `R, L, Kt, Ke, J, b` as **required** arguments: those are bench measurements (Lesson 07.1's sine-sweep), and an invented plausible value would hide the missing measurement.
- **The proof it is the right plant:** `simulate_arm()` reproduces capstone `08.1`'s published output exactly - `IK->FK err=0.0000 mm | Dynamic tip err max=2.40 mm, RMS=0.91 mm`, gravity torques `0.3188`/`0.0736 N·m`, `Dropped @115.2k=412, @500k=0` - and the suite asserts each number.
- **It runs in the browser:** `scripts/generate_plant_data.py` (new, with `--check` in CI) embeds the module and its values into `app/src/data/mechalabPlant.ts`; `TabPyodideRunner.tsx` hands that source to the worker, which writes `/mechalab_plant.py` into Pyodide's filesystem and puts `/` on `sys.path` once per runtime. A lesson exercise therefore writes `import mechalab_plant` and nothing else. Browser E2E case 11 imports it and asserts the capstone's numbers come back, in the dev server and in the built Pages bundle on both Chromium and Firefox.

### 2. The plant decision is now scored, and the ratchet knows what it measured
- **New front-matter keys:** `plant: tier1_arm_motor | none` and, for an exemption, `plant_note:` (a sentence of reason). `scripts/new_module.py` emits the decision as a `TODO-AUTHOR` hole, so a new module cannot inherit a default.
- **New scored item `executable:shared_plant`** (the Executable layer's fifth): `tier1_arm_motor` counts only with a real `import mechalab_plant` in the module; `none` counts only with a reason. A missing key, an unknown value and an unexplained `none` all score zero - so ignoring the plant lowers a module's published score instead of passing silently.
- **The baseline records `instrumented_items`:** `--check` now fails with *the scored item set changed (added: …)* when a newly instrumented requirement appears, because that lowers every score without any content moving. The distinction between a measurement change and a regression is printed, not assumed.
- **Re-recorded deliberately, and labelled as such:** overall **53.9% → 50.9%**, tracks and modules alike, because the Executable layer went from four items to five. The reason is written into the baseline's own `recorded_note`, and the ratchet now holds the new floor. `docs/coverage-table.md` gained a `Shared plant` column per track and per module plus a `## Shared plant` section: **0/44 on the arm, 0/44 exempt, 44/44 undeclared** - stated, not implied.

---

## [2026-10-16] — Run 6: Tier-Parity Machinery (`docs/QUALITY_SPEC.md`, `scripts/module_parity.py`, `scripts/new_module.py`)

Milestone **M0** of the Tier 2/3 plan: before any advanced module is rewritten, the question "how far is this module from Tier 1?" gets a measured answer, and no score is allowed to slide back.

### 1. The contract, the score and the ratchet
- **`docs/QUALITY_SPEC.md` (new):** the parity contract in four weighted layers - **Structure 25%** (front-matter contract, the numbered sections, `### Skip test` + `### Gate test`, the difficulty label, and for Tier 3 the `### Use & Understand` / `### Derive & Extend` pair), **Executable 30%** (`worked_example_runs`, `checkpoint_answer_key`, `learner_exercise_scaffold`, `verification_route_declared`), **Ladder 30%** (the eight named steps), **Validated 15%** (`dogfood_logged`). It also fixes the two new metadata blocks (`difficulty:` with `math/coding/tools/hardware_risk/simulation`, and `verification: browser|ci-native|artifact|rubric`) and states plainly what is **not yet instrumented** - behavioural tests for module exercises, module exercises in the workbench, the maths-claims audit, retention/arrival times - rather than scoring those zero.
- **`scripts/module_parity.py` (new):** scores every one of the 44 bridge modules, emits `docs/coverage-table.md` (per module, per track, per tier, plus the ladder table and the not-instrumented list), and answers `--check`, `--json`, `--update-baseline`. **Published baseline: overall 53.9%** (Tier 1 55.0%, Tier 2 53.6%, Tier 3 52.8%).
- **Two gates, deliberately separate:** the **ratchet** (`docs/parity-baseline.json`) fails the build if any track *or* module drops below its recorded score; the **level** (`tracks: <track>: lint_level: report|warn|error` in `modules/_index.yaml`, all nine tracks at `report`) fails a track that claims `error` while any module is below 100%. Flipping a track to `error` is the visible "this track is done" signal. The ladder stages are measured by their **named markers** (`**Predict first (before you run it):**`, `### Break it on purpose` with Inject/Symptom/Diagnose/Fix), which is stricter than `lint_modules.py`'s reported keywords - so a mention is not a stage.
- **`scripts/new_module.py` (new):** scaffolds a module with the full parity contract and marks every unwritten hole `TODO-AUTHOR`; `scripts/lint_modules.py` now **rejects** a module that still carries the marker, so scaffolding can never read as coverage. The scaffolder refuses to overwrite, refuses an id already in the index, inserts its `bridges:` entry into that list (not at EOF, since `tracks:` now follows it) and is byte-identical across repeated runs. `python3 scripts/module_parity.py --check` joined the CI verify step, and `docs/dogfood-log.md` (new) makes Layer 4 a live measure instead of a promise.

### 2. What the tooling found on its first run
- **`01-electronics.T3.01a` was missing both ladder stages** - the track's "7/7" claim was off by one (see the correction in Run 5 §4). Repaired, and track 01 now measures 100% on the ladder.
- **44/44 modules** still lack the `difficulty:` label, the `verification:` route, a learner-facing exercise scaffold, and a dogfood row; **37/44** lack the two named ladder stages; **19/44** have no `### Gate test`; all **10 Tier 3** modules lack the two levels.
- **Module ids disagree inside the index:** `07-systems.T3.06a` and `08-capstones.T3.07a` are off by one against their own track, while the index's `feeds_into`/`prereqs` lists reference `06-robotics.T3.07` and `05-control.T3.06`, neither of which exists. Reported, not repaired here - it is a dependency-graph job, and the DAG validator the plan asks for is the right tool for it.

---

## [2026-10-16] — Run 5: Formatting Split from Behaviour (`output_match`), the Built Pages Bundle Under Test & a Tablet-Fitting Workbench

### 1. `stdout` Formatting Is No Longer Part of the Behavioural Verdict
- **One comparison, two declared modes (`app/src/outputMatch.ts`, new):** the runner graded presentation with one inlined rule (`trimEnd` per line, `trim` the whole run), so a behaviourally correct solution whose spacing differed was reported as `DIFFERS` and **denied verification**. Now `normalized` (the default) ignores whitespace entirely — indentation, column padding, a dropped pad (`raw=   0` vs `raw=0`) and blank lines — while line breaks still matter, and `exact` keeps interior spacing significant (only trailing spaces and leading/trailing blank lines are ignored). Numbers are never relaxed by either mode, and the new `formattingDiffers` flag lets the runner say when a match was reached only by ignoring formatting (`note-formatting-normalized`).
- **`output_match:` front matter, read into `outputMatch` by `scripts/generate_python_lessons_data.py` (which rejects any other value):** **3 of the 36** Python lessons grade `exact` — `01.3`, `02.2`, `03.1`, the three whose Expected Output is a padded table (two or more aligned rows); the other 33 grade `normalized`. `00.3`, `04.1` and `05.1` were marked exact during review and reverted, because their padding is incidental (one padded field, or a hand-padded label) — each now states in its own `### Expected Output` that **spacing is not graded here**, keeping the lesson's teaching about where the padding comes from.
- **The split is enforced, not just applied:** `scripts/lint_lessons.py` fails a lesson whose padded table is not declared `exact`, and one declared `exact` with fewer than two aligned rows; `scripts/smoke_test_workbench.mjs` asserts the same rule against the built dataset plus the comparator itself (whitespace-only match accepted in `normalized` and rejected in `exact`, a changed digit rejected in both, first-differing-line reporting).
- **Proven in a real browser (`scripts/e2e_browser_workbench.mjs`):** a fresh context loads `03.1`, strips its field widths (`:4d` → `:d`, `:6.1f` → `:.1f`) and asserts the behavioural tests still read `PASSED` while presentation reads `DIFFERS` and **no** verification is awarded; then loads `P.6` wrapped in `contextlib.redirect_stdout`, re-printing the same values re-indented, re-spaced and blank-line-padded, and asserts `PASS · Behavior & Output Verified`, the normalized-match notice, and `2 / 36 Verified`.

### 2. The Built Pages Bundle Is Under Test (`scripts/e2e_pages_bundle.mjs`, `npm run test:e2e:pages`)
- **New CI step:** the old browser suite drove the Vite *dev server* with lesson P.6 only, so nothing proved what learners actually open. The new suite asserts `dist/index.html` references every asset under `/Mechatronics-Roadmap/` (the failure that shipped once, a bundle built for `/`), serves `dist/` at that base path and checks 200 plus content type per asset, loads **later-track** lessons `03.3` / `06.1` / `08.1` in the runner with starter code and expected output, and keeps the tab bar, lesson list, editor, Run & Verify and Export Progress usable at **834×1112**. Chromium and Firefox both run; a browser that is not installed is a loud SKIP, never a pass.

### 3. The Workbench Fits a Tablet (`app/src/components/Header.tsx`, `App.tsx`)
- **The header put three zones on one unwrappable row:** wordmark + four `nowrap` pass links + a `shrink-0` action group need ~1093 px, so at 834 px the Export Progress / Cheat Sheet buttons spilled **249 px** past the viewport and the page scrolled sideways (1024 px overflowed by 59 px too). The row and its nav now wrap, the action group drops to its own right-aligned row, and the mode-toggle group wraps. Measured: **0 overflowing elements at 390 / 834 / 1024 / 1280 px**, and the Pages E2E tablet check is now a **hard assertion** (zero spilled elements, `scrollWidth <= clientWidth`) — proven to fire by forcing a 1100 px min-width into the built page (exit 1, “scrolls sideways by 266px”).

### 4. The `01-electronics` Track Carries its Ladder Gaps (`modules/01-electronics.T*.md`)
- **Predict + Break-it on 6 of the track's 7 modules, three tiers:** each module got a bold `**Predict first (before you run it):**` commitment under `## 4. Worked example` (a number written down *before* the code runs, plus the signature of a wrong answer: inverted parallel branch, dropped micro prefix, a factor-of-two on-resistance count) and a `### Break it on purpose` block (Inject / Symptom / Diagnose / Fix) closing `## 5. Exercise`, every number lifted from that module's own worked example or `assert`s. `scripts/lint_modules.py` coverage: **Predict 6/44 → 12/44**, **Break it 16/44 → 20/44**.
- **Correction (2026-10-16, later the same day):** this entry first claimed "all 7 modules" and "7/7 of this track". It was 6: `01-electronics.T3.01a` never received either stage, and the claim was asserted from the track's module count instead of measured. `scripts/module_parity.py` caught it the next time it ran (its strict `3_predict` marker read 7/44), the module was repaired, and the track's ladder now measures **8/8 stages on 7/7 modules**. The count is published rather than claimed from here on - see *Run 6*. Those two ladder counts were themselves a loose keyword read in `scripts/lint_modules.py` (`\bpredict\b`, `fault|diagnos|miswir`): the named content markers find **7/44 Predict** and **7/44 Break it** - the seven modules this entry rewrote - and both tools now print the named-marker counts, so a published number means one thing.

## [2026-10-16] — Run 4: Course Packaging, Technical Fixes (`DRV8833` & `05-control.T1.05a`), Tracks 03–08 Beginner Lessons (`03.1–08.1`), Clean TeX & In-Browser Pyodide/Placement Workbench

### 1. Technical Accuracy & CI Expected-Output Diffing
- **Fixed `DRV8833` Voltage Rating (`2.7–10.8 V` operating, `11.8 V` abs max):** Updated `01-electronics-and-power/01.2-h-bridge-and-stall-current.md`, `01-electronics-and-power/README.md`, `modules/01-electronics.T1.01b.md`, `docs/SYLLABUS.md`, and `resources/lab-workbench-bom.md` so `DRV8833` is paired with a $6\text{–}9\text{ V}$ supply while $12\text{ V}$ motors explicitly use `TB6612FNG` ($4.5\text{–}13.5\text{ V}$) or `DRV8871` ($6.5\text{–}45\text{ V}$).
- **Fixed `modules/05-control.T1.05a.md` Expected Output & Added CI Output Diffing:** Updated `05-control.T1.05a.md` to match the exact stdout of its worked PID simulation (`Unclamped OS=0.372, Anti-windup OS=0.047`) and extended both `scripts/run_all_labs.py` and `scripts/validate_modules.py` to execute and diff all 44 bridge module `Expected output` blocks and forbid `[verify in-app]` / `[UNVERIFIED]` placeholders when `resources_verified: true`.

### 2. Openness, Licensing, Attribution & Slim Single-Screen `README.md`
- **Added Dual `LICENSE` (`CC BY 4.0` for docs, `MIT` for code), `CONTRIBUTING.md`, and `.github/ISSUE_TEMPLATE/`:** Added explicit attribution for [`engyasin/awesome-mechatronics`](https://github.com/engyasin/awesome-mechatronics) and three structured issue templates (`beginner-timing-log.md`, `lab-bug.md`, `lesson-error.md`).
- **Slimmed Root `README.md` (111 KB $\to$ 30 KB), Added Visibility Badges & Isolated Vite App in `app/`:** Added shields.io status badges, a prominent **Open Live Browser Workbench** callout, and a before/after $1\text{ kHz}$ control code comparison; fixed Step 3 to start at `Track 00 Lesson 00.1`; separated the \$0 Simulator Path, \$15–\$25 Starter Kit, and \$150 Closed-Loop Bench in `README.md` and `resources/lab-workbench-bom.md`; labeled beginner times as unmeasured targets backed by `beginner-timing-log.md`; moved `SYLLABUS.md` and `PLAN-batch-1.md` into `docs/`; isolated the Vite workbench into `app/` (`app/index.html`, `app/src/`); excluded `.aistudio/` in `.gitignore`; and verified live module/bridge/ladder/lesson counts (`68 modules: 24 legacy, 44 bridge across 25 ladders; 16 Tier 1 bridge modules; 48 beginner lessons`) across `README.md` and all script docstrings.
- **Clean TeX Source (`scripts/clean_tex.py`):** Stripped all 862 `\kern0pt` and `\_` math-mode workarounds across the repository and added `python3 scripts/clean_tex.py --check` to CI.

### 3. Closed the Beginner Cliff (`Lessons 03.1–08.1`), Beginner-First Workbench Mode & CI UI Smoke Tests
- **Expanded Tier 1 Tracks 03–08 into Full Beginner Lesson Files (`03.1`, `03.2`, `03.3`, `04.1`, `04.2`, `04.3`, `05.1`, `05.2`, `06.1`, `07.1`, `08.1`) + `P.14` & `S0.0`:** Every lesson enforces $\le 2$ new ideas in YAML front matter, 150–250 word `Bridge Notes`, runnable Python 3 starter code, 3-step progressive hints, and `assert`-verified full solutions (48 total beginner lessons across Track P, Stage 0, and Tracks 00–08 Tier 1, including 36 Python lessons).
- **Beginner vs. All-Labs Workbench Mode, Web-Worker Isolated Pyodide Runner (`Tab 9`), Instructor Behavioral Tests, Placement Quiz (`Tab 10`), Portfolio Export & Real-Browser E2E Tests:** Added a **Beginner View (Plain-English Path)** default with expandable technical subtitles (`All 10 Engineering Labs`), isolated Python execution inside a dedicated **Web Worker** with `Stop` / `Reset Runtime` controls and infinite-loop step/time guards, added **Instructor-Owned Behavioral Tests** (multi-input, boundary, and numerical tolerance checks that reject print-only spoofing across all 36 Python lessons), separated `Executed & Passed (WASM)` from `Self-Marked` completions in `localStorage` and **Markdown Portfolio Certificate export**, and added both SSR/DOM smoke tests (`scripts/smoke_test_workbench.mjs`) and real-browser Headless Chromium E2E tests (`scripts/e2e_browser_workbench.mjs`) in CI.

### 4. Cross-Tier Bridging Architecture (`Learn & Simulate` vs. `Build` vs. `Production Practice`, 8-Step Teaching Ladder, Recurring 2-DOF Arm Spine & Tier-by-Tier Bridges)
- **Three Explicit Completion Routes & Reconciled Provisional Time Estimates (`README.md`, `docs/SYLLABUS.md`, `TabArchitecture.tsx`):** Defined **Route 1 (`Learn & Simulate`, \$0)**, **Route 2 (`Build`, optional $\le 12\text{ V}$ low-voltage hardware)**, and **Route 3 (`Production Practice`, supervised $24\text{ V}/15\text{ A}$ & $48\text{ V}/30\text{ A}$ hardware requiring experienced review & pre-power sign-off)**, and reconciled the syllabus's `323.5 hours` (`68 formal modules` across Passes 1–3) with the optional `Track P` + `Stage 0` entry ramp (`~19–25 hours` unmeasured target $\implies \text{~342.5–348.5 hours}$ full zero-to-Tier-3 provisional estimate).
- **Unified 8-Step Teaching Ladder & Recurring 2-DOF Robot Arm Spine (`README.md`, `docs/SYLLABUS.md`):** Documented the 8-step progression (*Recall → See it → Predict → Work through → Practice with support → Break it on purpose → Transfer → Integrate*), 5-dimension difficulty labels, and how **one recurring robot joint and 2-DOF arm** evolves from Track 00 through Track 08 across Tiers 1, 2, and 3.
- **Tier-by-Tier Bridges (`P.14` Datasheet Table, `S0.0` Effort$\times$Flow Water Analogy, Falstad Twins before Arduino, 4-Row C-from-Python Sidebar, `Gate P->0`, `03.3` FK/Encoder Micro-Lab, 3-Part Python$\to$C Bridge `04.1–04.3`, 4-Stage `08.1` Capstone & `Gate 1->2` Exit Project):** Added `P.14` (`DRV8833` $2.7\text{–}10.8\text{ V}$ datasheet table reading), `S0.0` (`Effort × Flow` water-pipe analogy before Falstad), 5-minute Falstad "see it without code" twins in `S0.7–S0.M`, a 4-row C-from-Python sidebar in `S0.7`, the 15-minute `Gate P->0` check, the 20-minute `03.3` Track 02+03 integration micro-lab, a 3-lesson Python$\to$C bridge (`04.1` ints/overflow with `uint8_t` wrap-at-255 R4 debug, `04.2` bitwise/CRC-8 payoff, `04.3` structs as labeled boxes & pointers with pass-by-value R4 debug), a trig/radians preview callout in `01.4`, a 4-stage `08.1` 2-DOF arm capstone (*Predict → R2 → R4 3 Broken Versions → R5 Spec*), and the `Gate 1->2` self-administered position-loop exit project ($\pm 2\%$ overshoot, $<0.5\text{ s}$ settling).

---

## [2026-10-16] — Run 3: Term-Order Hardening, Falstad CI Mirrors Moved to `tests/` & Batch 1 (`Tracks 00, 01, 02` Tier 1)

### 1. Part A Hardening (`check_term_order.py`, `lint_lessons.py`, `density_report.py`, Multi-URL Heading Check & Falstad CI Mirrors)
- **Added `scripts/check_term_order.py`:** Verifies all 89 glossary terms in `resources/glossary.md` against all 35 beginner lessons in curriculum path order (`P.1`–`P.M` $\to$ `S0.1`–`S0.M` $\to$ `00.1`–`00.3` $\to$ `01.1`–`01.4` $\to$ `02.1`–`02.5`), failing if any lesson uses a glossary term before the lesson that defines it, and checking `PLAN-batch-1.md` prerequisites.
- **Reordered Stage 0 (`S0.2` $\leftrightarrow$ `S0.4` $\leftrightarrow$ `S0.5`) to eliminate forward term references:**
  - `S0.2-series-parallel-and-voltage-dividers.md` now comes immediately after `S0.1` (Ohm's Law), before `S0.3` (Breadboards & Short Circuits), `S0.4-leds-and-resistor-power.md`, and `S0.5-multimeters-and-current-limited-supplies.md`, so **Series** and **Parallel** are defined before sizing a series LED resistor (`S0.4`) or probing voltage in parallel vs. current in series (`S0.5`).
- **Upgraded `scripts/lint_lessons.py`:** Compares each lesson's `## Learn` headings and `### Bridge Notes` against its declared YAML `ideas:` list, failing on extra topics or missing `ideas:` coverage in `### Bridge Notes`.
- **Added `scripts/density_report.py`:** Computes per-lesson word count, new glossary terms, resource count, and code-block count across all 35 beginner lessons, sorted by cognitive density score.
- **Moved Falstad CI Python Mirrors (`S0.1`–`S0.6`, `01.1`) to `tests/test_exercises.py`:** Confirmed that the Python blocks in `S0.1`–`S0.6` and `01.1` only mirrored Falstad circuit calculations for CI; moved them into `tests/test_exercises.py` so learners in `S0.1`–`S0.6` and `01.1` interact directly with the Falstad netlists (`falstad/*.txt`).

### 2. Part B Batch 1 — Tier 1 Beginner Lessons for Tracks 00, 01 & 02 (`PLAN-batch-1.md` + 11 New Lesson Files)
- **Track 00 (`00-foundations/`, 3 lessons):**
  - `00.1-effort-flow-and-first-order-lag.md`: Effort/flow power ($P = V \cdot I = F \cdot v = \tau \cdot \omega$) and first-order lag step response ($\tau$, $63.2\%$ at $1\tau$, $99.3\%$ at $5\tau$).
  - `00.2-mass-spring-damper-oscillations.md`: Hooke's Law spring ($F_s = -kx$), viscous damper ($F_d = -bv$), natural frequency ($\omega_n = \sqrt{k/m}$), and damping ratio ($\zeta$: underdamped, critically damped, overdamped).
  - `00.3-modeling-discipline-and-sanity-checks.md`: 4-step workflow (`Diagram -> Symbolic Equations -> Code -> Sanity Check`) and dimensional/limiting-case checks.
- **Track 01 (`01-electronics-and-power/`, 3 new lessons after `01.1`):**
  - `01.2-h-bridge-and-stall-current.md`: 4-switch H-bridge (`Forward`, `Reverse`, `Coast`, `Brake`), shoot-through prevention, back-EMF ($V_{\text{emf}} = K_e\omega$), and stall current ($I_{\text{stall}} = V_s/R_a$) using Falstad (`falstad/01.2-h-bridge.txt`) and Wokwi Arduino Uno firmware (`IN1/IN2/PWM` with no motor in Wokwi).
  - `01.3-power-regulators-and-power-budget.md`: Linear (`LDO`) regulator heat loss vs. switching (`Buck`) power conservation and worst-case robot power budgets.
  - `01.4-grounding-and-rc-lowpass-filters.md`: High-current ground bounce ($V_{\text{ground}} = I_{\text{motor}}R_{\text{wire}}$), star grounding, and passive RC low-pass filters ($f_c = \frac{1}{2\pi RC}$, `falstad/01.4-rc-lowpass.txt`).
- **Track 02 (`02-mechanics-kinematics-dynamics/`, 5 lessons ramping `1-link FK -> 2-link FK -> IK`):**
  - `02.1-1d-link-fk-and-coord-frames.md`: 2D coordinate frames, right-hand CCW angle sign convention, and 1-link planar forward kinematics ($x = L\cos\theta, y = L\sin\theta$).
  - `02.2-2link-planar-forward-kinematics.md`: Cumulative link angle ($\theta_{12} = \theta_1 + \theta_2$), chaining 2-link tip-to-tail vectors, and annular reach envelope.
  - `02.3-2link-planar-inverse-kinematics.md`: Law of Cosines for elbow angle, reachability clamping (`[-1, +1]`), elbow-down vs. elbow-up solutions, and shoulder angle via `math.atan2`.
  - `02.4-rotational-inertia-and-gear-ratios.md`: Rotational Newton's Second Law ($\tau_{\text{net}} = I_{\text{rot}}\alpha$), moment of inertia ($I_{\text{rot}} = mr^2$), gear ratio ($N$), and reflected rotor inertia ($I_{\text{reflected}} = N^2 I_{\text{motor}}$).
  - `02.5-bearings-belts-and-3d-printing.md`: Cantilevered vs. double-shear shaft support, `GT2` timing belt ratios ($N = N_{\text{driven}}/N_{\text{driver}}$), and 3D-printed layer orientation.
- **Removed Tier 1 Jargon Leaks:** Purged Jacobian determinants, phase-space ellipses, complex numbers ($j\omega$), decibels ($\text{dB}$), Laplace $s$, and Euler-Bernoulli beam deflection formulas ($\delta = \frac{FL^3}{3EI}$) from all Tier 1 sections while keeping Pass 2 / Pass 3 material intact under Advanced (Later).
