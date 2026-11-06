# Atomic micro-learning (beta)

Micro-learning is the workbench's sixteenth tab. It teaches one concept per unit, drawn from a P.1–P.9 parent lesson, in roughly two minutes: it asks two diagnostics, chooses the practice from the
answers, and schedules a review. It is **beta** until a person who has never seen the workbench
completes every lesson and reports where they got stuck.

It never marks the parent lesson verified. A micro result is evidence for the micro store only; the
parent lesson's verified/completed maps and the lesson runner are untouched.

```mermaid
flowchart LR
    Home["Home: a two-minute unit"] --> Learn["Learn passage + two diagnostics"]
    Learn -->|2/2| Practice["Targeted practice"]
    Learn -->|0/2 or 1/2| Note["Targeted note, then practice"]
    Practice --> Review["Review due in 3 days"]
    Review --> Ladder["3 -> 7 -> 14 -> 30 days"]
```

## The forty-six units

### P.1 — variables and data types

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `variables` | `#micro-variables` | A variable names a value; `=` assigns it. |
| `assignment-order` | `#micro-assignment-order` | Later assignments replace earlier ones; read top to bottom. |
| `int-float` | `#micro-int-float` | `int` and `float` are different numeric types. |
| `strings` | `#micro-strings` | Text is a string; quotes are syntax, not content. |
| `booleans` | `#micro-booleans` | `True` and `False` are values, capitalised. |
| `mixed-types` | `#micro-mixed-types` | Mixing incompatible types raises `TypeError`. |
| `f-strings` | `#micro-f-strings` | An f-string inserts a value into text. |

### P.2 — computer arithmetic and order of operations

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `operators` | `#micro-operators` | `*`, `/` and `**` each answer a different question. |
| `floor-division` | `#micro-floor-division` | `//` keeps the whole groups and drops the remainder. |
| `order-of-operations` | `#micro-order-of-operations` | Brackets, then powers, then `*` and `/`, then `+` and `-`. |

### P.3 — decisions and clamping

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `comparisons` | `#micro-comparisons` | `==` asks; it answers `True` or `False`. |
| `clamping` | `#micro-clamping` | Pin a command to the nearest limit of `[0, 255]`. |
| `logic` | `#micro-logic` | `and`, `or` and `not` combine comparisons. |

### P.4 — lists and for loops

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `lists` | `#micro-lists` | One name holds an ordered sequence; indexing starts at 0. |
| `for-loops` | `#micro-for-loops` | The body runs once per item, or N times with `range(N)`. |
| `index-error` | `#micro-index-error` | The last index is `len(...) - 1`. |

### P.5 — functions and while loops

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `functions` | `#micro-functions` | `def` names it; `return` hands the value back. |
| `while-loops` | `#micro-while-loops` | Test first, and update the counter in the body. |
| `none` | `#micro-none` | No return means the answer is `None`. |

### P.6 — modules and asserts

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `imports` | `#micro-imports` | `import math` then `math.sqrt(...)`. |
| `asserts` | `#micro-asserts` | A False check stops the script. |
| `assert-message` | `#micro-assert-message` | The message names the rule that broke. |

### P.7 — SI units and prefixes

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `si-units` | `#micro-si-units` | Convert to meters, kilograms and seconds first. |
| `metric-prefixes` | `#micro-metric-prefixes` | `k`, `M`, `m`, `µ` scale the unit. |
| `unit-cancel` | `#micro-unit-cancel` | The surviving unit is part of the check. |

### P.8 — frequency and bits

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `frequency-period` | `#micro-frequency-period` | `T = 1 / f`. |
| `binary-bits` | `#micro-binary-bits` | N bits give `2^N` states, 0 to `2^N - 1`. |
| `place-values` | `#micro-place-values` | Binary place values double: 1, 2, 4, 8. |

### P.9 — rearranging and scaling

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `rearranging` | `#micro-rearranging` | Undo an operation on both sides. |
| `linear-scaling` | `#micro-linear-scaling` | Multiply the fraction of full scale by the range. |
| `scale-output` | `#micro-scale-output` | The board's supply sets the top value. |

### P.10 — radians and right-triangle trigonometry

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `radians` | `#micro-radians` | A half-turn is π radians; convert before the trig call. |
| `trig-reach` | `#micro-trig-reach` | Cosine is the horizontal shadow, sine the vertical one. |
| `atan2` | `#micro-atan2` | atan2 takes y first and returns radians. |

### P.11 — reading time-series graphs

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `graph-slope` | `#micro-graph-slope` | Slope is the rate of change, not the value. |
| `area-under-curve` | `#micro-area-under-curve` | Rectangle slices accumulate displacement. |
| `graph-units` | `#micro-graph-units` | The axis labels give the slope its unit. |

### P.12 — forces and lever torque

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `force` | `#micro-force` | Net force is mass times acceleration. |
| `weight` | `#micro-weight` | Weight is the force gravity adds: W = m · g. |
| `torque` | `#micro-torque` | Torque uses the perpendicular lever arm, L cos θ. |

### P.14 — reading a datasheet table

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `datasheet-units` | `#micro-datasheet-units` | The unit column is half the value. |
| `datasheet-bounds` | `#micro-datasheet-bounds` | Recommended bounds are not the destruction limit. |
| `datasheet-conditions` | `#micro-datasheet-conditions` | Typ is not a promise; budget on Max. |

### P.15 — the analysis workflow

| Unit | Parent anchor | The one idea |
| :--- | :--- | :--- |
| `given-unknown` | `#micro-given-unknown` | Name the givens and the unknown before the model. |
| `answer-check` | `#micro-answer-check` | A number becomes an answer after the check. |
| `bounds-check` | `#micro-bounds-check` | Clamp to the limit and name the part. |

Each unit has an authored teaching passage, a read-only worked example, two four-option diagnostics
(or normalized short answers), a practice, a four-question review pool and one transfer challenge.
Answers are graded locally and deterministically: no model, no network, no code execution.

## Design and evidence

`micro/P.<n>.json` is the authored source, one file per parent lesson. `scripts/generate_micro_lessons.py`
validates every file and concatenates them, in numeric order, into `app/src/data/microLessons.ts` with
one `parents` entry per lesson; `scripts/generate_parent_lessons.py` writes the metadata-only
`app/src/data/parentLessons.json`. `scripts/micro_timing.py` is the one time model. Every activity
models at **≤120 seconds**; an author/model gap over 20% is a warning, not a build failure, because
both are estimates. The live clock is separate:

- `visibleSeconds` is wall-clock while the tab is visible.
- `adjustedSeconds` caps each inactivity gap at **90 seconds**; the live timer and the 120-second
  target use it.
- A visible activity over **180 seconds** gets a quiet note; nothing is blocked or discarded.

Review is one concept at a time, two questions, every rotation set deterministic. A successful
review moves a 3/7/14/30-day ladder; a successful challenge schedules 14 days; a failure keeps
mastery and skip eligibility but schedules tomorrow. A source-revision change marks the old evidence
stale and clears skip eligibility; it does not delete mastery.

## Storage and the switch

All progress is browser-local. There is no sync and no import.

| Key | Meaning |
| :--- | :--- |
| `mechalab_micro_progress_v1` | Versioned store: compact concept aggregates plus a bounded evidence log (240 events). |
| `mechalab_micro_enabled_v1` | Runtime beta switch. `0` hides the tab and Home's lab; stored progress is untouched. |
| `mechalab_micro_session_v1:<concept>` | Session snapshot for the activity clock, cleared on reset. |

A newer store version is **read-only**: the tab says so and refuses writes and reset rather than
dropping fields it does not understand. A blocked or full bucket falls back to an in-memory session
with a visible "progress won't be saved" note. Dedupe uses the stable `eventId`; an intentional
retry gets a new `attemptId`. Saves re-apply the reducer to the latest stored state and retry after
a conflict, so a second tab cannot overwrite the first tab's evidence.

## Commands

```bash
python3 scripts/generate_micro_lessons.py --stats   # authored vs modelled timings
npm run check:micro                                  # generated catalogue + parent manifest + Python contract
npm run test:micro                                   # reducer, rotation, clocks, store, save races
npm run test:e2e:micro                               # Home door, 2/2, 0/2, due review, switch, 390 px
npm run check:micro-debug                            # fails if the debug readout is in dist/
```

`VITE_MICRO_DEBUG=1 npm run dev` adds the local timing readout. It is a dynamic import behind a
build-time check; `npm run check:micro-debug` proves the production bundle does not contain it.

## Self-study protocol

Day 1: all forty-six Learn units, P.1 through P.15 (P.13 is not a lesson). Deliberately answer some diagnostics wrong so the 1/2 and 0/2 paths,
the targeted notes and the practice branches are exercised. Scripted browser runs are allowed.

Day 2, at least 18 hours later: reviews (launched manually if not due) plus challenges on variables
and mixed types/`TypeError`. Record where you stopped, the adjusted and visible times, and whether
the 0/2 adjusted time stayed at or below 90 seconds for each Learn activity.

The repository's automated gate seeds a due state instead of waiting 18 hours; it proves the
review screen, the consolidation rule and the saved future due date, not a human retention curve.
The 18-hour protocol and the 120-second beginner claim remain the beta exit criteria. Until then,
the tab is labelled beta in the rail, Home and this page.

## What is deliberately absent

- No AI, cloud generation, personalization or account requirement.
- No code execution in a micro unit; examples are read-only.
- No multi-concept review session; the plan defers that until one-concept review is proven.
- No parent-lesson verification from micro evidence.
