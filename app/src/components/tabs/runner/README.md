# The lesson runner, split

`TabPyodideRunner.tsx` is the assembly: it owns the lesson choice, the editor's writers and the
chrome, destructures the execution hook by name, and renders the regions below. Each module here owns
one concern and is readable without the tab.

```mermaid
flowchart LR
    T["TabPyodideRunner.tsx<br/>lesson choice · editors · chrome"] --> E["useRunnerExecution.ts<br/>the run"]
    T --> A["useRunnerArrangement.ts<br/>preset · dock · panes"]
    T --> P["usePredictGate.ts<br/>the question"]
    T --> C["useCollab.ts → useCoEdit.ts<br/>the shared document"]
    T --> D["useDraftComparison.ts → DiffPanel.tsx<br/>versions and the diff"]
    T --> V["RunnerToolbar · RunnerEditorCard<br/>ResultsColumn · the panels"]
```

| Module | Owns |
|---|---|
| `useRunnerExecution.ts` | The run: the worker session and buffers, every cell a run's outcome lands in (output, trace, analysis, watches, parks), and `runPythonCode` / `runCellTo` / Stop / Pause / frame edits / watches. |
| `usePredictGate.ts` | The predict-first question: this lesson's record, the half-typed guess, the run it holds, and the one `requestRun` every surface asks a run through. |
| `useCoEdit.ts` | Co-editing over the pair session: the shared document, their offer (asked before an editor is replaced), and every local write turned into ops. |
| `useCollab.ts` | The pair channel read for co-editing: the subscription that feeds the session once the lesson functions exist, and the one message — an attempt — that belongs to the tab. |
| `collabNotice.ts` | What a co-edit session says when it stops: one sentence per reason and per side, so a remote stop never claims an action this workbench did not take. |
| `useDraftComparison.ts` | The versions behind the draft and what the diff compares against: the filed list, the earned solution, the chosen reference and the lesson reset. |
| `DiffPanel.tsx` | The diff drawing: reference buttons, rows, and the sentences about a fallback or an identical file. |
| `AttemptOffers.tsx` | The two offers of someone else's code — a pair attempt and a shared link — with the lesson check before either can replace a draft. |
| `useShareLink.ts` | The Share press and its five outcomes, including the printed URL when the clipboard refuses. |
| `useVimKeys.ts` | The remembered Vim opt-in and the mode the editor reads keys in while it is on. |
| `usePassToast.ts` | The pass toast and the once-per-lesson shuffle: one tape change per verified lesson, and the toast's own six-second life. |
| `useProgressFlags.ts` | The verified and self-marked lesson stores, parent-owned or local, and the two writers. |
| `useRunnerArrangement.ts` | The editor/results split share, which side results sit on, and the persisted layout record. |
| `RunnerToolbar.tsx` | The run controls: presets and dock, Pause/Stop/Run, Predict, and the More panel's actions. |
| `RunnerEditorCard.tsx` | The editor surface: main/helper tabs, the pane strip, and the editor body beside Requirements, Predict, Run output, Expected, Cases and Workflow. |
| `EditorPaneBody.tsx` | The pane body: up to four panes in a mixed grid (three side by side put the first at full height and stack the other two beside it, so no cell is empty), the same arrangement stacked on a phone, the dividers a pointer drags to resize them, each split pane's own close — that view leaves, the rest stay in order — and the offer that puts a closed view back in its slot. The prediction gate's own Close records the same arrangement through `paneUndo.ts`. |
| `EditorPaneArrangement.tsx` | Horizontal/vertical axis, Add pane, pane swapping and Close — the split's controls, lazy beside the eager Split door and outside the tablist. Close records the arrangement it takes away, so the same Undo a pane's corner close offers restores the whole split. It also reads how many panes the viewport allows: two on a phone, three on a laptop, four on a large desktop, re-read on resize. |
| `PanePlacement.tsx` | A pane's own split direction once there are three or more: the two buttons that open its boundary beside or under it, in their own spot beside the close so no control covers another, loaded with the placement control instead of the tab's eager chunk. |
| `PaneDrag.tsx` | The pane's pointer chrome: a header grip in each pane that exchanges it with the pane it is dropped on, the pane's own close in the opposite corner (that view leaves, the rest stay in order), the single bottom grip that resizes the pane area, and the body's Undo offer after a close — the arrangement it replaced, so the view returns to its slot, for eight seconds or until the next close, and ⌥Z does the same from the keyboard while the offer is up. One lazy chunk, so a one-pane body never pays for drawing the offer; the notice it reads lives in `paneUndo.ts`. |
| `PaneResize.tsx` | The pane area's bottom grip itself: drag it to trim unused space under the panes, and the Reset size control restores the body's default height. Loaded with `PaneDrag.tsx`, only for bounded desktop bodies. |
| `paneUndo.ts` | The one close waiting to be undone: the arrangement snapshot, what closed, and whether a keyboard press lost the focus to it. Every close records here — a pane's corner ×, the split's Close and the prediction gate's own Close — while the offer that draws it and puts the arrangement back is lazy with `PaneDrag.tsx`. |
| `EditorGoal.tsx` | The lesson's goal as a labelled prompt card, folded with the editor body. |
| `EditorRequirements.tsx` | The lesson's pass conditions as their own editor tab: numbered colourful cards with the micro lessons' token styling. |
| `resultTabMeta.tsx` | What each result tab says: its label, its tooltip and its glyph. |
| `CasesPane.tsx` | The behavioural cases: one row per substituted input, with what the last run proved and which cases it never reached. |
| `readerContinue.ts` | Where the page goes next: Study into Read, Read into Write. |
| `LessonChooserRail.tsx` | The Study preset's left column, the brief's button that brings a folded rail back, and the grid width that follows the fold. In Read, Write and Debug, which have no rail column, that same button opens the lesson sheet. |
| `LessonAmbience.tsx` | The pointer-free atmosphere behind the runner: aurora, instrument grid, orbit and four HUD chips. |
| `RunnerRuntimeStrip.tsx` | Where the interpreter is while it loads: first-run guide and runtime sentence. |
| `RunVerdict.tsx` | The one-line verdict under the run controls, from the last outcome. |
| `PredictPane.tsx` | The prediction gate's pane: the question, the committed guess and its reading. Its own Close is a pane close like the corner ×, so it leaves the same Undo, which puts the pane back with the guess still on it. |
| `ResultsColumn.tsx` | The column that reports on the code: checker notes, study note, assessment, trace, scope, and the split divider. |
| `AssessmentPanel.tsx` | Instructor behavioural assessment: badges, graded checks and the hint each one unlocks. |
| `PausedBar.tsx` (+ `parkSource.ts`) | The parked-run bar: step controls, the quoted line, frame values, watches and frame edits. `PausedStep` is the worker's park payload. |
| `DraftHistoryPanel.tsx` | The filed runs behind a draft, and restoring one. |
| `BreakpointPanel.tsx` | Armed breakpoints and their conditions. |
| `useFirstRunTour.ts` | The first-run tour: record, offer/chip, gates, focus and dismissal. |
| `useGuideFold.ts` | The brief's remembered hide/show switch for the first-run guide, one value for every lesson. |
| `GuideToggle.tsx` | The brief's and the phone strip's door onto that switch, in two target sizes and one behaviour. |

Wiring rule: a region takes exactly the state and callbacks it renders; it never reaches into the tab.
A region with more than a handful of inputs takes them as named concern objects — `RunnerEditorCard`
is handed `surface`, `draft`, `panes`, `gate`, `run`, `slots` and `collab`, and `ResultsColumn` its
`split`, `checks`, `trace` and `scope` — so its signature says what it depends on. A concern object
is not a bag: `panes` is one `{ value, onPanes }`, and the card derives the split, the visible views,
the slot order, the pane borders and the open helper file from it, so a new derivation is a change in
the card rather than a new input at the call site. The run is one
state every region is a view of, so it lives in one place — `useRunnerExecution.ts` — and the shared
worker protocol under it lives in `../../runtime/pyodideWorker.ts`. A change to how a lesson runs lands
in the hook; a change to how the tab looks lands here.

The editor precedes the reader in the DOM so the stacked Study preset reads code then text; `index.css`
still places them by column at `2xl`, so only the walk order changes, not the drawing. The lesson
chooser's fold and strip live in `LessonChooserRail.tsx`, which is also why the tab stays inside its
line budget.

Size rule, held by `npm run test:runner` (`scripts/test_runner_shape.mjs`): the tab's budget is
**3,020 lines with 28 state cells and 24 refs**, a state-owning hook stays under 400 lines except
`useRunnerExecution.ts` (one noun, so it is one module), and a view under 730. Those numbers are
measured, not chosen; the check fails when one rises, and a pass that raises one owes the reason in
the commit that raises it.
