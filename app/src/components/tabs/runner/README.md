# The lesson runner, split

`TabPyodideRunner.tsx` is the assembly: it owns the run, the lesson choice and the writers, and renders
the regions below. Each module here owns one concern and is readable without the tab.

| Module | Owns |
|---|---|
| `useRunnerArrangement.ts` | The editor/results split share, which side results sit on, and the persisted layout record. |
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
The run itself (`runPythonCode` and the worker session) stays in the tab on purpose — it is the one
state every region is a view of, and the shared worker protocol lives in `../../runtime/pyodideWorker.ts`.
