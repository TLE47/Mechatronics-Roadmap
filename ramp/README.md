# The Maths Ramp — Two Operations Tier 2 Assumes You Already Own

Tier 1 is built on pictures: slope, area, a curve you can sketch. Tier 2 opens with $\dot{x} = Ax + Bu$,
which is the same two pictures written as symbols — a rate on the left, accumulators on the right —
and learners who cannot move between them stall in the first Tier 2 page for reasons that look like
algebra problems but are not. The ramp is three short lessons that close that gap, one operation at a
time. Two are written; the list is deliberately short.

```mermaid
flowchart LR
    T1["Tier 1: slope, area, a sketched curve"] --> R1["R.1 Rate of change<br/>two samples -> dq/dt"]
    R1 --> R2["R.2 Accumulation<br/>rates -> q = q0 + sum(v dt)"]
    R2 --> Gate["Gate 1->2<br/>docs/TIER1_EXIT_CHECK.md"]
    Gate --> T2["Tier 2: state-space, integrator states, filters"]
```

| Lesson | What it fixes | Time (unmeasured target) |
| :--- | :--- | :--- |
| [R.1: Rate of Change](R.1-rate-of-change.md) | Turning two samples into a signed speed with units, and knowing why the average over a window is not the rate at a moment | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.2: Accumulation](R.2-accumulation.md) | Recovering position from rates, the starting value `q0`, and why a 0.02 rad/s bias is 0.6 rad after 30 s | 0.75–1.0 h typical / 1.5–2.0 h slow |

## Where it sits

- **After Tier 1, before Tier 2.** The ramp assumes the Tier 1 capstone's arm and its encoder; it does
  not re-teach Track P. If P.11's slope-and-area page was a struggle, do that first.
- **It is not a prerequisite for reading Tier 2.** It is a prerequisite for *not stalling* in it: the
  check maps each miss to the lesson that repairs it, so you can skip the ramp entirely by passing the
  check cold.
- **It is graded.** `python3 scripts/check_ramp_lessons.py` runs each lesson's full solution against its
  published Expected Output and verifies that every item in
  [`docs/TIER1_EXIT_CHECK.md`](../docs/TIER1_EXIT_CHECK.md) points at a lesson that exists, and that
  every lesson repairs at least one item. Both directions are checked, so the map cannot rot silently.

## The exit check

[`docs/TIER1_EXIT_CHECK.md`](../docs/TIER1_EXIT_CHECK.md) is the maths half of Gate 1→2: ten items,
closed book, ~30–40 minutes, each mapped to R.1 or R.2. The practical half — block diagram, parameter
scaling, telemetry fault, bench units, a settling loop, a bring-up you can explain — is the six-gate
**Tier 1 Exit Review** in the Workbench's Placement & Readiness tab.

## Adding a lesson

The ramp grows only when a check item has a miss with no lesson behind it, and a new lesson must ship
with its Expected Output executed by `scripts/check_ramp_lessons.py` on the same commit. Two operations
that look like candidates and are deliberately absent: trigonometry (Track P.10 covers it for the Tier 1
arm, and Tier 2 re-derives it where needed) and vectors (Tier 2's own first pages carry their own
worked examples, so a ramp lesson would be a second copy of them).
