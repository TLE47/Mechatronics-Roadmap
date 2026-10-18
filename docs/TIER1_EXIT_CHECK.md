# Gate 1→2: Tier 1 Exit Check — the maths half, mapped to the ramp lessons

Ten items, ~30–40 minutes, closed book and paper-only. This is the **maths** half of the Tier 1 exit:
it checks the two operations every Tier 2 module assumes you can already do — read a rate off a trace,
and accumulate rates into a state — and every miss sends you to the exact ramp lesson that repairs it.
The six **practical** gates (block diagram, parameter scaling, telemetry fault, units on a bench, a
closed loop that settles, a bring-up you can explain) are the other half and live in the Workbench:
**Tab 10 → Placement & Readiness → Tier 1 Exit Review**, whose gates point at the Track P, Track 00 and
Track 02–04 lessons that teach them.

A miss is not a verdict on Tier 1. It is a named lesson to do before the first Tier 2 page.

```mermaid
flowchart LR
    Q{"Ten items,<br/>closed book"} --> A["10 / 10: start Tier 2"]
    Q --> B["8-9 / 10: do the missed<br/>item's ramp lesson"]
    B --> A
    Q --> C["6-7 / 10: R.1 + R.2,<br/>then retake"]
    C --> Q
    Q --> D["under 6 / 10: R.1, R.2,<br/>then the Track P pages"]
    D --> Q
```

## How to score it

| Score | Reading | What to do next |
| :--- | :--- | :--- |
| 10 / 10 | Ready | Start [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md) |
| 8–9 / 10, at most one miss in each half | Ready with a gap | Do the ramp lesson for the missed item, then start Tier 2 |
| 6–7 / 10, or two misses in one half | Not yet | Do **both** [`R.1`](../ramp/R.1-rate-of-change.md) and [`R.2`](../ramp/R.2-accumulation.md), then retake |
| < 6 / 10 | Start at the ramp | R.1, R.2, then the Track P lessons they cite, then retake |

Mark each item ✅ or ❌. Write the arithmetic down: a right answer with no working does not count, because
Tier 2 asks you to show the derivation.

## The ten items

| # | Item | You pass if | If you miss it | Ramp lesson |
| :--- | :--- | :--- | :--- | :--- |
| 1 | An encoder reads **24 counts** in **2 ms**; 4096 counts per turn. Give the joint speed in rad/s. | `18.408 rad/s`, with the two conversions shown (`counts/s`, then × 2π/4096). | [R.1](../ramp/R.1-rate-of-change.md): the quotient and its units | R.1 |
| 2 | The same encoder falls from **300 to 280 counts** in **5 ms**. Give the speed and say what the sign means for the actuator. | `−6.136 rad/s`; motion toward −q, so a positive command is fighting the motion. | [R.1](../ramp/R.1-rate-of-change.md): the sign is information | R.1 |
| 3 | Ten samples at **200 Hz** read 100 counts first and 340 last. Give the average rate. | Denominator `9 × 0.005 s`, not `10 × 0.005 s`: `8.181 rad/s`. | [R.1](../ramp/R.1-rate-of-change.md): nine intervals, not ten | R.1 |
| 4 | A trace rises to a peak and comes back. At the peak, is the instantaneous rate zero, the average rate zero, both, or neither? | Instantaneous zero at the peak (it is turning), average non-zero (it travelled). A controller needs the former. | [R.1](../ramp/R.1-rate-of-change.md): average vs instantaneous | R.1 |
| 5 | One encoder count over a **1 ms** window is what speed? What happens to that noise when you halve the window to 0.5 ms? | `1.534 rad/s`; halving the window **doubles** it, so a short window buys lag at the price of noise. | [R.1](../ramp/R.1-rate-of-change.md): the window is a filter | R.1 |
| 6 | A joint runs **+4 rad/s for 0.05 s**, stops **0.1 s**, then **−1.5 rad/s for 0.2 s**. Net displacement? | `0.2 − 0.3 = −0.1 rad`; the motion went out and came back past its start. | [R.2](../ramp/R.2-accumulation.md): signed area | R.2 |
| 7 | Velocity ramps linearly from **0 to 6 rad/s over 0.3 s**. How far did it travel? | Triangle area `½ × 0.3 × 6 = 0.9 rad` — no rectangle rule needed when the shape is exact. | [R.2](../ramp/R.2-accumulation.md): area under the trace | R.2 |
| 8 | A joint starts at **1.2 rad** and the velocity trace accumulates **+0.9 rad**. Where is it, and what happens if the code drops `q0`? | `2.1 rad`; without `q0` the code reports `0.9 rad`, a 1.2 rad pose error with a correct area. | [R.2](../ramp/R.2-accumulation.md): the starting value | R.2 |
| 9 | A gyroscope reads **0.01 rad/s** while the robot is still. How much heading error after **120 s**, and how would you catch it? | `1.2 rad` (69°); catch it with an absolute reference — complementary fusion, encoder index or a known pose — not with a bigger filter. | [R.2](../ramp/R.2-accumulation.md): bias drifts | R.2 |
| 10 | On one trace the left rule gives 0.300 rad, the right rule 0.280 rad. Give your best estimate and the error bar. | Trapezoid `0.290 rad`, with `±0.010 rad` spanned by left and right; name the rule in the code. | [R.2](../ramp/R.2-accumulation.md): pick and name the rule | R.2 |

## Ramp lessons

The two lessons this check maps to are the first of the ramp; the rule for adding a third is that a
check item must exist whose miss has no lesson to repair it.

| Lesson | Repairs items | Time (unmeasured target) |
| :--- | :--- | :--- |
| [R.1: Rate of Change](../ramp/R.1-rate-of-change.md) | 1, 2, 3, 4, 5 | 0.75–1.0 h typical / 1.5–2.0 h slow |
| [R.2: Accumulation](../ramp/R.2-accumulation.md) | 6, 7, 8, 9, 10 | 0.75–1.0 h typical / 1.5–2.0 h slow |

The mapping above is enforced by [`scripts/check_ramp_lessons.py`](../scripts/check_ramp_lessons.py), which
fails if a row points at a lesson that does not exist, if a lesson repairs no row, or if either lesson's
published Expected Output stops matching the code that prints it. The ten answers below are prose, marked
by hand — the script guards the map and the lessons' numbers, not your arithmetic.

## Answers

<details>
<summary><strong>Items 1–5 (rate of change)</strong></summary>

1. `24 / 0.002 = 12 000 counts/s`; `× 2π/4096 = 18.408 rad/s`.
2. `−20 / 0.005 = −4 000 counts/s = −6.136 rad/s`. Negative means toward −q.
3. `240 counts / 0.045 s = 5 333.3 counts/s = 8.181 rad/s`.
4. Instantaneous zero at the peak, average non-zero. A controller needs the instantaneous rate; a logger's
   average cannot see the reversal coming.
5. `2π/(4096 × 0.001) = 1.534 rad/s`; halving the window doubles it.
</details>

<details>
<summary><strong>Items 6–10 (accumulation)</strong></summary>

6. `4 × 0.05 − 1.5 × 0.2 = 0.2 − 0.3 = −0.1 rad`.
7. `½ × 6 × 0.3 = 0.9 rad`.
8. `1.2 + 0.9 = 2.1 rad`; dropping `q0` reports `0.9 rad`.
9. `0.01 × 120 = 1.2 rad`; an absolute reference corrects it, a longer filter only delays it.
10. Trapezoid `0.290 rad`, error bar `0.280–0.300 rad`; the rule has to be named in the function.
</details>
