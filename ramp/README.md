# The Maths Ramp — Six Operations Tier 2 Assumes You Already Own

Tier 1 is built on pictures: slope, area, a curve you can sketch. Tier 2 opens with $\dot{x} = Ax + Bu$,
which is the same two pictures written as symbols — a rate on the left, accumulators on the right —
and learners who cannot move between them stall in the first Tier 2 page for reasons that look like
algebra problems but are not. The ramp is six short lessons that close that gap, one operation at a
time. All six are written; the list stops where Tier 2 takes over.

```mermaid
flowchart LR
    T1["Tier 1: slope, area, a sketched curve"] --> R1["R.1 Rate of change<br/>two samples -> dq/dt"]
    R1 --> R2["R.2 Accumulation<br/>rates -> q = q0 + sum(v dt)"]
    R2 --> R3["R.3 State vectors<br/>[q, qd] advanced together"]
    R3 --> R4["R.4 Matrix updates<br/>x_next = x + dt (A x + B u)"]
    R4 --> R5["R.5 Phasors<br/>length + angle as one number"]
    R5 --> R6["R.6 Frequency response<br/>gain and phase per frequency"]
    R6 --> Gate["Gate 1->2<br/>docs/TIER1_EXIT_CHECK.md"]
    Gate --> T2["Tier 2: state-space, integrator states, filters"]
```

| Lesson | What it fixes | Time (unmeasured target) |
| :--- | :--- | :--- |
| [R.1: Rate of Change](R.1-rate-of-change.md) | Turning two samples into a signed speed with units, and knowing why the average over a window is not the rate at a moment | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.2: Accumulation](R.2-accumulation.md) | Recovering position from rates, the starting value `q0`, and why a 0.02 rad/s bias is 0.6 rad after 30 s | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.3: State Vectors](R.3-state-vectors.md) | Holding `[q, qd]` as one state, advancing both slots on a tick with the **old** speed, and why separate commands add up | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.4: Matrix Updates](R.4-matrix-updates.md) | Reading `A` rows as rates and columns as inputs, and writing the same tick as `x + dt (A x + B u)` | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.5: Phasors](R.5-phasors.md) | One number carrying a length and an angle, rotation as a multiply, and why three phases 120° apart sum to zero | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.6: Frequency Response](R.6-frequency-response.md) | Shaking the joint at one frequency and reading gain and phase, plus the corner where gain is 0.7071 and phase is −45° | 0.75–1.0 h typical / 1.5–2.0 h slow |

## Where it sits

- **After Tier 1, before Tier 2.** The ramp assumes the Tier 1 capstone's arm and its encoder; it does
  not re-teach Track P. If P.11's slope-and-area page was a struggle, do that first.
- **It is not a prerequisite for reading Tier 2.** It is a prerequisite for *not stalling* in it: the
  check maps each miss to the lesson that repairs it, so you can skip the ramp entirely by passing the
  check cold.
- **Coming back after a break?** [`docs/REENTRY.md`](../docs/REENTRY.md) is the twenty-minute version of this
  page's job: five paper tasks drawn from the exit check, one repair lesson per miss, then back to the page
  you left. Start there rather than at R.1.
- **It is graded.** `python3 scripts/check_ramp_lessons.py` runs each lesson's full solution against its
  published Expected Output and verifies that every item in
  [`docs/TIER1_EXIT_CHECK.md`](../docs/TIER1_EXIT_CHECK.md) points at a lesson that exists, and that
  every lesson repairs at least one item. Both directions are checked, so the map cannot rot silently.

## The exit check

[`docs/TIER1_EXIT_CHECK.md`](../docs/TIER1_EXIT_CHECK.md) is the maths half of Gate 1→2: fourteen items,
closed book, ~40–50 minutes, each mapped to one of R.1–R.6. The practical half — block diagram, parameter
scaling, telemetry fault, bench units, a settling loop, a bring-up you can explain — is the six-gate
**Tier 1 Exit Review** in the Workbench's Placement & Readiness tab.

## Adding a lesson

The ramp grows only when a check item has a miss with no lesson behind it, and a new lesson must ship
with its Expected Output executed by `scripts/check_ramp_lessons.py` on the same commit. Trigonometry
stays out on purpose: Track P.10 covers it for the Tier 1 arm and Tier 2 re-derives it where needed, so
a lesson would be a second copy. The six operations the curriculum plan names are now covered; a
seventh lesson adds only when an exit-check item has a miss with no lesson behind it, because a lesson
without one would be ungraded prose.
