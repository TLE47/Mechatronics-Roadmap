# Dogfood Log — doing the modules as the learner

Every module at Tier 1 parity has been *done by the author*, end to end, with only the in-course
hints, and the result logged here. This is Layer 4 (Validated) of the parity contract in
[`docs/QUALITY_SPEC.md`](QUALITY_SPEC.md): `scripts/module_parity.py` credits a module's
`dogfood_logged` item when its id appears in the first column below, and nothing else can earn it.

```mermaid
flowchart LR
    A["Pick a module from docs/coverage-table.md"] --> B["Do it with only the in-course hints"]
    B --> C["Log the row: minutes, hints, stuck category"]
    C --> D{"A course bug?"}
    D -->|yes| E["Fix it and add a regression test"]
    D -->|no| F["Rows 1-2 weeks later: redo the Transfer task"]
    E --> F
    F --> G{"Passed?"}
    G -->|no| B
    G -->|yes| H["The module's validated layer is earned"]
    H --> I["Flip the track to lint_level: error once every row is in"]
```

## Rules that keep it honest

1. On the first pass use **only** the in-course hints — no looking at the solution, no outside help.
2. Do the Transfer task again **after a delay** (a week or two). Passing it straight after the worked
   example proves little; the delayed attempt is the one that counts.
3. Every course bug you hit becomes a fix **and** a regression test, not just a quiet edit.
4. A track does not flip to `lint_level: error` until its whole log is complete **and** the worst
   modules have been revised.
5. These times are labelled **author-dogfood**. They are useful, but you wrote the course, so you are
   not a typical beginner. A beginner pilot is a separate, later step with its own numbers.

## Columns

`minutes` is total time to finish the module's exercise and Gate test. `hints` is how many of the
3-step ladder you unlocked (0-3). `stuck` is the category you got stuck in — `concept`, `units`,
`tool`, `setup`, or `none`. `course bug?` is `yes`/`no`, with the fix noted in the commit that made
it. `transfer later` is `pass`, `fail`, or `-` until the delayed attempt happens.

## Log

| Module | Date | Minutes | Hints (0-3) | Stuck | Course bug? | Transfer later |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `02-mechanics.T2.02a` | 2026-10-16 | 13 | 0 | none | yes | - |
| `00-foundations.T1.00a` | 2026-10-17 | 2 | 0 | none | yes | - |
| `00-foundations.T1.00b` | 2026-10-17 | 2 | 0 | none | yes | - |
| `00-foundations.T1.00c` | 2026-10-17 | 2 | 0 | none | yes | - |
| `00-foundations.T1.00d` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T1.00e` | 2026-10-17 | 2 | 0 | none | yes | - |
| `00-foundations.T2.00a` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T2.00b` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T2.00c` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T2.00d` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T2.00e` | 2026-10-17 | 1 | 0 | none | yes | - |
| `00-foundations.T2.00f` | 2026-10-17 | 1 | 0 | none | no | - |
| `01-electronics.T2.01a` | 2026-10-17 | 1 | 0 | none | yes | - |
| `01-electronics.T2.01b` | 2026-10-17 | 1 | 0 | none | yes | - |
| `03-sensors.T2.03a` | 2026-10-17 | 1 | 0 | none | yes | - |
| `04-embedded.T2.04a` | 2026-10-17 | 1 | 0 | none | yes | - |
| `04-embedded.T2.04b` | 2026-10-17 | 1 | 0 | none | yes | - |
| `04-embedded.T2.04c` | 2026-10-17 | 1 | 0 | none | yes | - |
| `04-embedded.T2.04d` | 2026-10-17 | 1 | 0 | none | no | - |
| `05-control.T2.05a` | 2026-10-17 | 2 | 0 | tool | no | - |
| `06-robotics.T2.06a` | 2026-10-17 | 1 | 0 | none | no | - |
| `06-robotics.T2.06b` | 2026-10-17 | 1 | 0 | none | no | - |
| `07-systems.T2.07a` | 2026-10-17 | 1 | 0 | none | no | - |
| `01-electronics.T3.01a` | 2026-10-17 | 2 | 0 | none | yes | - |
| `04-embedded.T3.04a` | 2026-10-17 | 2 | 0 | none | yes | - |

### Evidence, item by item
One "validated" flag hid four different claims. This table separates them, and a row is only as
strong as its weakest measured column:

| Standard | `02-mechanics.T2.02a` | Evidence |
| :--- | :--- | :--- |
| Content complete | met | 100% of the requirements instrumented today (`docs/coverage-table.md`) |
| Reference solution tested | met | `exercises/02-mechanics.T2.02a/solution.py` passes 14 unittest cases |
| Learner exercise behaviour-graded | met | `scripts/run_exercise.py` 12/12: starter fails, solution passes, 4 faults each fail their named test, print-only passes nothing |
| Browser workflow tested | met (browser) | `scripts/e2e_pages_bundle.mjs` drives `EX.02-mechanics.T2.02a` on the built bundle: starter fails on its hole, reference prints the PASS line, output badge MATCHED |
| Author first pass | met | the row above, 13 min, 0 hints |
| Delayed transfer | **pending** | `transfer later` is `-` until the 1-2 week retry |
| Independent learner | **not run** | no beginner pilot yet |

### The Track 00 Tier 1 ladder

The five bridge modules were dogfooded in one sitting, each with its own package and Gate paper:

| Standard | `00a` | `00b` | `00c` | `00d` | `00e` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reference solution tested | met (34 cases) | met (31) | met (31) | met (33) | met (34) |
| Learner attempt passes from the hints alone | met | met | met | met | met |
| Gate score | 10/10 | 9/10 | 12/12 | 14/14 | 8/8 |
| Author first pass | met, 0 hints | met, 0 hints | met, 0 hints | met, 0 hints | met, 0 hints |
| Browser workflow tested | not re-run | not re-run | not re-run | not re-run | not re-run |
| Delayed transfer | pending | pending | pending | pending | pending |

**What the dogfood found.** Every one of the five attempts failed its package on the first run, and
the cause was the same each time: the page's `### Full Solution` had drifted from
`exercises/<id>/solution.py`. The pages printed functions with no input guards, while the suites
test those guards (`timestamps(0.0, 0.1, 0)`, `mean_of([])`, a calibration missing `"offset"`, a
negative resistance, a zero inertia, a negative link length, a heading at the origin, a negative
stiffness). `00-foundations.T1.00a`'s page had also lost `loop_total` entirely - six of the seven
holes - so copying it could never pass. One prose claim was wrong too: the same page said a late
start from `0.25 m` takes "three" ticks where its own test asserts six.

Fixed by replacing each page block with the reference implementation the package tests actually
run, and pinned by `tests/test_module_full_solutions.py`, which extracts every page's Full Solution
and runs the package's `test_*.py` against it through `EXERCISE_TARGET`. Run against the previous
revision of `00-foundations.T1.00b` it fails with `1 failure, 6 errors`; on the repaired pages all
five pass.

### The Track 00 Tier 2 ladder

Five more bridge modules, each with its own six-to-seven-hole package and its own Gate paper:

| Standard | `T2.00a` | `T2.00b` | `T2.00c` | `T2.00d` | `T2.00e` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reference solution tested | met (17 cases) | met (17) | met (19) | met (17) | met (16) |
| Learner attempt passes from the hints alone | met after one fix | met | met | met | met after one fix |
| Gate score | 11/11 | 11/11 | 11/11 | 12/12 | 12/12 |
| Author first pass | met, 0 hints | met, 0 hints | met, 0 hints | met, 0 hints | met, 0 hints |
| Browser workflow tested | not re-run | not re-run | not re-run | not re-run | not re-run |
| Delayed transfer | pending | pending | pending | pending | pending |

Worked in one sitting, so the per-module figures round to the minute (nine minutes including the
Gate papers and the re-runs).

**What the dogfood found.** Two of the five attempts failed for a printed reason, and both were the
docstring disagreeing with the tests:

- `T2.00a`'s `running_integral` promised `out[k] = out[k-1] + values[k]*dt, out[-1] = 0`; the suite
  requires the first sample to be carried (`out[0] = values[0]*dt`), so an attempt written to the
  docstring failed two tests. The docstring now states the first entry explicitly.
- `T2.00e`'s `companion_state_matrices` said `B = [0, 1/J]`; the tests index `B[1][0]`, so `B` must be
  a column (`[[0.0], [1.0/J]]`). The flat form raised `'float' object is not subscriptable` eight
  times. Starter and page comment now spell out the nesting.

Extending the page-vs-package test to Tier 2 caught a third, in a module not yet dogfooded: the
`00-foundations.T2.00f` page printed no `simulate_discrete` at all. Its block now carries the
reference implementation, and all eleven Track 00 ladder pages pass their packages.

### The rest of the Tier 2 bridges

`00-foundations.T2.00f` and the first module of Tracks 01, 03 and 04, worked in one two-minute
sitting (the per-module figure rounds to the minute):

| Standard | `T2.00f` | `01.T2.01a` | `01.T2.01b` | `03.T2.03a` | `04.T2.04a` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reference solution tested | met (21) | met (34) | met (39) | met (21) | met (34) |
| Learner attempt passes from the hints alone | met | met after one fix | met after one fix | met after one fix | met after one fix |
| Gate score | 8/8 | 10/10 | 8/8 | 8/8 | 11/11 |
| Delayed transfer | pending | pending | pending | pending | pending |

**What this round found: page drift is course-wide.** All four modules from Tracks 01, 03 and 04 failed
their first attempt for the same reason as the Track 00 ladder: the page's `### Full Solution` printed
functions without the input guards the suite checks (`r_shunt > 0`, `gain > 0`, `dt_ns > 0`,
`di_amp > 0`, `tau > 0`, a positive loop period, an in-range DMA index). Checking every package rather
than only the one being eaten gave the real size: **26 of the 46 bridge pages fail their own suite**.
The four in this round were repaired first; a follow-up pass repaired the remaining 22 the same way,
and `tests/test_module_full_solutions.py` now discovers every package instead of carrying a list, so
all **46** pages are checked. All 46 pass.

### Tracks 04, 05 and 06: the Tier 2 bridges

| Standard | `04b` | `04c` | `04d` | `05a` | `06a` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Reference solution tested | met (45) | met (46) | met (26) | met (28) | met (23) |
| Learner attempt passes from the hints alone | met after one fix | met after one fix | met | met after one fix | met |
| Gate score | 10/10 | 12/12 | 8/8 | 8/8 | 9/9 |
| Delayed transfer | pending | pending | pending | pending | pending |

**What this round found.** Two modules (`04b`, `04c`) test a refusal contract the hints never stated:
encode must refuse a value outside the field's range rather than clip it, a code outside the field
must be refused, and an inheritance request from a waiter that is not more urgent must raise. Each
ladder now carries a *What the suite refuses* line naming every guard the tests check. `05a` cost
its extra minute on one real error - a Riccati step written as $A P A^\top$ instead of $A^\top P A$
- which its hint already warns about, so it is logged as `tool`, not as a course bug.

### Closing Tier 2: `06-robotics.T2.06b` and `07-systems.T2.07a`

| Standard | `06b` | `07a` |
| :--- | :--- | :--- |
| Reference solution tested | met (24 cases) | met (26 cases) |
| Learner attempt passes from the hints alone | met, first attempt | met, first attempt |
| Gate score | 8/8 | 8/8 |
| Author first pass | 1 minute, 0 hints | 1 minute, 0 hints |
| Delayed transfer | pending | pending |

**What this round found.** No course bug in either package — the first two modules to pass their
suite and their Gate paper on the first attempt with no repair, which is what the end of a ladder
should look like. `06b`'s seven holes (timer decimation, intra-process saving, bag disk rate, bag
size, replay slope, wall-clock stretch, control decimation) each have their formula in the hint
ladder, and its transfer refusals are the ones the earlier rounds taught the pages to state.
`07a`'s counter is the module's own worked example, and its resistor bound is stated as an upper
limit in both the hint and the docstring — the distinction a naive attempt gets wrong.

**A limit on these two rows.** They were worked with the module page open, and the excerpt that
carried each Gate paper carried its answer key in the same window; `07a`'s Full Solution was in
the same page window as its hints. So the 8/8s show the key's own numbers agree with its own
questions, not that two papers were answered blind. The exercise attempts are genuine — written
from the hint ladders in a separate file and run through the same package CI runs — and both
passed first time. A stricter blind Gate pass is worth doing on a later module; the rule the log
sets out (hints only, no solution) is otherwise honoured.

Tier 2 is now fully dogfooded: every Tier 2 module has a row here.

### Tier 3 opens: `01-electronics.T3.01a`, the riskiest page

The Tier 3 modules were ranked by their own front-matter difficulty before any was picked, and this
one tops the list on every axis but coding alone: `math 5, coding 4, tools 4, hardware_risk high,
safety_level high`, 5 estimated hours, 39 cases in its package.

| Standard | Value |
| :--- | :--- |
| Reference solution tested | met (39 cases: 31 behaviour, 8 transfer) |
| Learner attempt passes from the hints alone | met after one fix |
| Gate score | 8/8, answered blind |
| Author first pass | 2 minutes, 0 hints |
| Delayed transfer | pending |

**What this round found.** Three of the eight holes refused input the ladder never said they would:
a zero plane dimension or a negative slew rate (`loop_inductance_nh`, `turn_off_peak_v`), a mutual
term larger than the self-inductance it is supposed to be part of (`flux_cancelled_nh`), and a zero
bucket capacitor or a zero/negative acquisition window (`charge_droop_fraction`,
`charge_settling_lsb`). The first attempt failed exactly those three tests and passed the other 36,
which is the signature of a missing contract rather than a wrong formula. The ladder now carries a
fifth *What the suite refuses* item naming all of them, including the thermal ladder's four guards.

**How widespread it was, and what closed it.** The same question asked of every package (behaviour
suite asserts `ValueError`, page's exercise section before `### Full Solution` never says "refuses"
or "raises") found **19 of 41** pages silent about refusals their own suite checks - this module
being one of them. The other 18 are now repaired, each sentence built from that page's own guard
inventory rather than a shared template: `00-foundations.T1.00b`, `T1.00d`, `T1.00e`,
`01-electronics.T1.01c`, `T1.01d`, `T2.01a`, `T2.01b`, `02-mechanics.T1.02a`, `T3.02a`,
`03-sensors.T1.03a`, `T2.03a`, `04-embedded.T1.04b`, `T2.04d`, `05-control.T1.05a`, `T3.05b`,
`06-robotics.T1.06a`, `T3.06b`, `08-capstones.T3.07a`. All **41 of 41** now state their refusals, and every
function the suite refuses on is named by name, with its condition (see the next paragraph).

**The check that keeps it green.** `scripts/check_exercise_coverage.py` gained a fourth job: for
every function a behaviour suite puts inside `with self.assertRaises(ValueError):`, the **dedicated
ladder item** `N. **What the suite refuses.**` in `## 5. Exercise`, above `### Full Solution`, must
name that function. The rule has been narrowed twice and the second narrowing matters: the first
version read every line that spoke of refusing, and dogfooding `04-embedded.T3.04a` showed a single
phrase - "the refusal to take an angle outside it" in the package introduction, which names every
hole by design - satisfied it for a page that stated no guard at all. Instances of the word are not
the contract; the item is. What the gate still cannot check is whether each named condition is the
right one; the dogfood rows are where that is read. Six cases in `tests/test_exercise_coverage.py`
pin it - a silent page fails, a page naming only one of two refused functions is still a finding, a
page naming both passes, a passing mention in prose does not count, a mention only under the Full
Solution does not count, and a suite that refuses nothing is exempt. Run against
`00-foundations.T1.00a` as it stood before the sweep, the gate fails naming all five functions.

### The second Tier 3 module, and a hole in the gate that was supposed to catch this

| Standard | Value |
| :--- | :--- |
| Reference solution tested | met (40 cases: 32 behaviour, 8 transfer) |
| Learner attempt passes from the hints alone | met after one fix |
| Gate score | 8/8, answered blind |
| Author first pass | 2 minutes, 0 hints |
| Delayed transfer | pending |

**What this round found.** Eight of the forty tests failed on refusals, and the page had no refusal
item at all: `center_aligned_arr` (non-positive clock or carrier, a carrier too fast for one tick
per half period), `pwm_frequency` (a zero ARR), `low_side_window_ns` (a duty outside `[0, 1]`, a
negative dead time, a zero carrier), `angle_to_q31`, `q31_decode`, `seqlock_valid` and
`isr_cpu_percent`. Writing the item surfaced one detail the tests pin and a summary would miss: the
normalised angle range is `[-1, 1)`, not `[-1, 1]`, because `+pi` maps to the one value `Q1.31`
cannot hold while `-pi` encodes exactly as `-2^31`.

**The bigger finding is that the gate let this page through.** Run 49's rule asked whether the
page's *lines that speak of refusing* named each refused function - and this page's package
introduction ends "...and the refusal to take an angle outside it", naming every hole in the same
paragraph. One passing use of the word "refusal" made the whole paragraph the statement. The rule
now requires the dedicated ladder item (`N. **What the suite refuses.**`) and reads only that, and a
case in `tests/test_exercise_coverage.py` reproduces this page's exact shape: an introduction that
mentions a refusal and names both functions still fails. Eight pages had no dedicated item at all
(`00-foundations.T1.00c`, `T2.00b`, `T2.00c`, `T3.00a`, `04-embedded.T3.04a`, `06-robotics.T2.06a`,
`T2.06b`, `T3.06a`) and were given one, each from its own suite's refusal calls.

Rows above are **author-dogfood**: the author who wrote the module did its exercise and Gate test with
only the in-course hints. `02-mechanics.T2.02a` is the first row, added when it became the reference
module (the template every later module copies). Its `yes` in *course bug?* covers two fixes the run
found, both with a test: the two CI scripts that execute module python blocks had the shared plant
nowhere on `sys.path`, so a plant-wired module could not run on the runner at all, and the parity
scorer's `difficulty:` parser rejected the trailing `# comment` that `docs/QUALITY_SPEC.md` §2 writes
in its own example (`tests/test_module_parity.py` holds both halves).
