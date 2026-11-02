# The lesson runner, split

`TabPyodideRunner.tsx` is the assembly: it owns the lesson choice, the editor's writers and the
chrome, destructures the execution hook by name, and renders the regions below. Each module here owns
one concern and is readable without the tab.

| Module | Owns |
|---|---|
| `useRunnerExecution.ts` | The run: the worker session and buffers, every cell a run's outcome lands in (output, trace, analysis, watches, parks), and `runPythonCode` / `runCellTo` / Stop / Pause / frame edits / watches. |
| `usePredictGate.ts` | The predict-first question: this lesson's record, the half-typed guess, the run it holds, and the one `requestRun` every surface asks a run through. |
| `useCoEdit.ts` | Co-editing over the pair session: the shared document, their offer (asked before an editor is replaced), every local write turned into ops, and the sentence that says why it stopped. |
| `useRunnerArrangement.ts` | The editor/results split share, which side results sit on, and the persisted layout record. |
| `RunnerToolbar.tsx` | The run controls: presets and dock, Pause/Stop/Run, Predict, and the More panel's actions. |
| `RunnerEditorCard.tsx` | The editor surface: main/helper tabs, the pane strip, the split controls, and the editor body beside Predict, Run output, Expected and Workflow. |
| `RunnerRuntimeStrip.tsx` | Where the interpreter is while it loads: first-run guide and runtime sentence. |
| `RunVerdict.tsx` | The one-line verdict under the run controls, from the last outcome. |
| `PredictPane.tsx` | The prediction gate's pane: the question, the committed guess and its reading. |
| `ResultsColumn.tsx` | The column that reports on the code: checker notes, study note, assessment, trace, scope, and the split divider. |
| `AssessmentPanel.tsx` | Instructor behavioural assessment: badges, graded checks and the hint each one unlocks. |
| `PausedBar.tsx` (+ `parkSource.ts`) | The parked-run bar: step controls, the quoted line, frame values, watches and frame edits. `PausedStep` is the worker's park payload. |
| `DraftHistoryPanel.tsx` | The filed runs behind a draft, and restoring one. |
| `BreakpointPanel.tsx` | Armed breakpoints and their conditions. |
| `useFirstRunTour.ts` | The first-run tour: record, offer/chip, gates, focus and dismissal. |

Wiring rule: a region takes exactly the state and callbacks it renders; it never reaches into the tab.
A region with more than a handful of inputs takes them as named concern objects — `RunnerEditorCard`
is handed `surface`, `draft`, `panes`, `gate`, `run`, `slots` and `collab`, and `ResultsColumn` its
`split`, `checks`, `trace` and `scope` — so its signature says what it depends on. The run is one
state every region is a view of, so it lives in one place — `useRunnerExecution.ts` — and the shared
worker protocol under it lives in `../../runtime/pyodideWorker.ts`. A change to how a lesson runs lands
in the hook; a change to how the tab looks lands here.
