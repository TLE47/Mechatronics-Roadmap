# Bridge visuals — inventory and reader-page status

Every lesson with a `### Bridge Notes` section, the batch it belongs to, and whether the
workbench reader actually renders that page. A card can only mount where `reader?` is yes:
the payload generator copies a visual onto a page the reader loads (`resources/bridge-visuals.json`,
`scripts/generate_lesson_pages.py`), and an unregistered page has no payload to carry it.

- 57 lessons with Bridge Notes; **47 are reader pages**, 10 are not.
- 35 cards shipped; each is named in the table with the claim it teaches.
- `blocked` means the lesson is not in `generate_python_lessons_data.build_lessons()`; the card is
  not built, because a chunk nothing can mount is dead weight. Registering the page is the unlock.

```mermaid
flowchart LR
  lesson["lesson .md with Bridge Notes"] --> registered{"in build_lessons()"}
  registered -- yes --> payload["payload carries the visual"]
  payload --> card["lazy *Lab.tsx chunk mounts on the reader page"]
  registered -- no --> blocked["blocked: recorded here, no card built"]
```

| lesson | page | reader? | batch | tier | visual | status | core claim |
| :-- | :-- | :-- | --: | :-: | :-- | :-- | :-- |
| 00.1 | `00-foundations/00.1-effort-flow-and-first-order-lag.md` | yes | 2 | A | lag-power | shipped | 1τ is 63.2 %, 5τ is 99.3 %; power is effort × flow, so 9.0 × 0.0 = 0.0 W. |
| 00.2 | `00-foundations/00.2-mass-spring-damper-oscillations.md` | yes | 3 | A | mass-spring | shipped | ωn = √(k/m) = 10.0 rad/s; ζ = b/(2√(mk)) is 0.20 / 1.00 / 2.00 for b = 4 / 20 / 40 N·s/m — and 2× larger without the 2. |
| 00.3 | `00-foundations/00.3-modeling-discipline-and-sanity-checks.md` | yes | 1 | A | sign-flip | shipped | τ_hold = +mgLcosθ: +1.962 N·m at 0°, +0.981 at 60°, +0.000 at 90°; sin(0) hides it. |
| 01.1 | `01-electronics-and-power/01.1-mosfet-inductor-flyback.md` | yes | 3 | B | flyback-spike | shipped | 0.5 mH at 2.0 A switched off in 2.0 µs is 512.0 V on the Drain against a 60 V part; the flyback diode holds 12.7 V, and 2.0 A through 0.02 Ω is 80.0 mW. |
| 01.2 | `01-electronics-and-power/01.2-h-bridge-and-stall-current.md` | **no** | 1 | A | — | blocked | Stall is 12.0/4.0 = 3.00 A, 100 rad/s is 0.50 A. |
| 01.3 | `01-electronics-and-power/01.3-power-regulators-and-power-budget.md` | yes | 2 | A | regulator-budget | shipped | An LDO burns 3.50 W where the buck draws 0.231 A and loses 0.28 W. |
| 01.4 | `01-electronics-and-power/01.4-grounding-and-rc-lowpass-filters.md` | yes | 3 | A | rc-filter | shipped | τ = RC = 1.0 ms, fc = 1/(2πRC) = 159.15 Hz; 20 kHz PWM passes at 0.008, or 0.0499 when fc is written as 1/RC. |
| 02.1 | `02-mechanics-kinematics-dynamics/02.1-1d-link-fk-and-coord-frames.md` | yes | 4 | B | — | planned | L1 = 0.25 m; the four cardinal angles put the tip on one axis at ±0.25. |
| 02.2 | `02-mechanics-kinematics-dynamics/02.2-2link-planar-forward-kinematics.md` | yes | 4 | B | — | planned | θ1=90°, θ2=0° gives (0, 0.30); forgetting θ1 leaves the forearm horizontal. |
| 02.3 | `02-mechanics-kinematics-dynamics/02.3-2link-planar-inverse-kinematics.md` | yes | 4 | B | — | planned | Clamp cosθ2 to [−1,1] and IK→FK returns the target within 1e-6 m. |
| 02.4 | `02-mechanics-kinematics-dynamics/02.4-rotational-inertia-and-gear-ratios.md` | yes | 1 | A | gear-squared | shipped | 50:1 makes reflected inertia N² = 2,500× smaller and the output 50× slower. |
| 02.5 | `02-mechanics-kinematics-dynamics/02.5-bearings-belts-and-3d-printing.md` | yes | 2 | A | belt-geometry | shipped | 60 teeth at 2.0 mm pitch is 3.0:1 and r = 19.10 mm, so 1.50 N·m is 78.5 N. |
| 02.6 | `02-mechanics-kinematics-dynamics/02.6-thinking-in-comments.md` | yes | 1 | A | — | planned | Four comments (input, output, edge, check) turn the page into four jobs. |
| 03.1 | `03-sensors-and-actuators/03.1-quadrature-and-magnetic-encoders.md` | yes | 1 | A | — | planned | 4×500×10 = 20,000 counts/rev (0.018°); a magnetic encoder has 4,096. |
| 03.2 | `03-sensors-and-actuators/03.2-three-phase-bldc-and-electrical-angle.md` | yes | 3 | B | electrical-angle | shipped | θe = Np·θm: 30° of shaft is 120° at Np = 4; the 90° lead gives 100 % torque, and driving from the mechanical angle gives 0 %. |
| 03.3 | `03-sensors-and-actuators/03.3-encoder-to-fk-integration-microlab.md` | yes | 4 | B | — | planned | A swapped sign moves the tip from (0.10, 0.12) to (−0.10, 0.12): 200 mm. |
| 04.1 | `04-embedded-and-realtime/04.1-c-types-and-hardware-timer-isr.md` | yes | 2 | A | timer-wrap | shipped | 0.020 rad in 1.0 ms is 20.0 rad/s; a stalled loop prints 100.0, and uint16 wraps to 65,535. |
| 04.2 | `04-embedded-and-realtime/04.2-packed-structs-and-crc8-telemetry.md` | yes | 4 | B | — | planned | 10 B at 1 kHz is 86.8 % of 115,200 baud; 20 B is 173.6 %; 230,400 is the floor. |
| 04.3 | `04-embedded-and-realtime/04.3-structs-and-pointers-labeled-boxes.md` | yes | 2 | A | pointer-box | shipped | Pass-by-value updates a photocopy, so the caller's pos_rad stays 0.0; a pointer is 4 bytes. |
| 05.1 | `05-control-and-estimation/05.1-pid-virtual-spring-damper-and-anti-windup.md` | yes | 3 | B | pid-windup | shipped | Kp = 4.0 sags 0.150 rad; unclamped Ki overshoots 0.372 rad, the clamped integral 0.047 — 7.9× less. |
| 05.2 | `05-control-and-estimation/05.2-complementary-imu-sensor-fusion.md` | yes | 3 | B | complementary-imu | shipped | α = 0.98 at 100 Hz is τc = 0.490 s; a 1 °/s bias walks 60.0° in a minute on the gyro alone and stops at 0.490° with the filter. |
| 06.1 | `06-robotics-and-autonomy/06.1-cubic-trajectories-and-compliant-joints.md` | yes | 3 | B | cubic-trajectory | shipped | 3s²−2s³ covers 0.156 of a 1.0 rad move at s = 0.25 where a line covers 0.250; the 0.5 s move peaks at 3.00 rad/s instead of 2.00. |
| 07.1 | `07-systems-hil-and-production/07.1-safe-bringup-and-sine-sweep-sysid.md` | yes | 2 | A | bringup | shipped | R_rail > 100 Ω and I_limit ≤ 0.15 A before the loop closes; 100 Ω exactly fails. |
| 08.1 | `08-capstone-projects/08.1-tier1-2dof-compliant-arm-capstone.md` | yes | 3 | B | capstone-frame | shipped | 20 B at 1 kHz needs 200 kbit/s: the 256-byte ring drops 412 frames at 115.2 kbaud and 0 at 500 kbaud, while the arm holds 2.40 mm peak / 0.91 mm RMS. |
| R.1 | `ramp/R.1-rate-of-change.md` | yes | 2 | A | count-rate | shipped | One count is 0.00153 rad, so 1 count/ms is a fake 1.53 rad/s. |
| R.2 | `ramp/R.2-accumulation.md` | yes | 2 | A | accumulate | shipped | Left/right bracket the area, the trapezoid halves the gap, a bias integrates forever. |
| R.3 | `ramp/R.3-state-vectors.md` | yes | 2 | A | state-slots | shipped | x has two slots: q̇ = qd and q̈ = (τ − B·qd)/J. |
| R.4 | `ramp/R.4-matrix-updates.md` | yes | 2 | A | matrix-tick | shipped | A holds rates per second; dt lives in the tick, so one A fits 1 kHz and 100 Hz. |
| R.5 | `ramp/R.5-phasors.md` | yes | 2 | A | arrow-multiply | shipped | A rotation is a multiplication; |z| is never negative and phase is radians. |
| R.6 | `ramp/R.6-frequency-response.md` | yes | 3 | A | — | planned | Measured −79.798° against −84.289° at 200 rad/s. |
| S0.0 | `stage-0/S0.0-why-electricity-is-like-flow.md` | yes | 2 | A | water-analogue | shipped | Effort × Flow = Power, so 9.0 V × 0.0 A is 0.0 W. |
| S0.1 | `stage-0/S0.1-closed-circuits-and-ohms-law.md` | **no** | 1 | A | — | blocked | 5.0 V across 1 kΩ is 5.0 mA; an open loop is 0.0 A. |
| S0.2 | `stage-0/S0.2-series-parallel-and-voltage-dividers.md` | **no** | 2 | A | — | blocked | Equal resistors halve the rail (2.50 V); 12 V on 4.7 k/10 k gives 3.84 V. |
| S0.3 | `stage-0/S0.3-breadboards-and-short-circuits.md` | **no** | 4 | B | — | blocked | One row is one node: a leg two rows apart is a 0 Ω wire drawing 100 A. |
| S0.4 | `stage-0/S0.4-leds-and-resistor-power.md` | **no** | 2 | A | — | blocked | (5.0 − 2.0)/0.015 = 200 Ω; the 220 Ω part runs 13.6 mA and 45 mW of 125 mW. |
| S0.5 | `stage-0/S0.5-multimeters-and-current-limited-supplies.md` | **no** | 4 | B | — | blocked | A voltmeter is 10 MΩ in parallel, an ammeter 0.05 Ω in series; wired wrong it draws 100 A. |
| S0.6 | `stage-0/S0.6-capacitors-and-decoupling.md` | yes | 3 | A | rc-charge | shipped | 10 kΩ and 100 µF is τ = 1.00 s: 3.16 V at 1 s (63.2 %), 4.32 V at 2 s (86.5 %), 4.97 V at 5 s (99.3 %), where a straight line claims 100 % at 1 s. |
| S0.7 | `stage-0/S0.7-arduino-uno-digital-io-and-pullups.md` | **no** | 4 | B | — | blocked | INPUT_PULLUP is 20–50 kΩ to 5 V, so released is HIGH and pressed is LOW. |
| S0.8 | `stage-0/S0.8-adc-analog-read-and-serial-monitor.md` | **no** | 1 | A | — | blocked | 512 of 1023 is 2.50 V, but 512 / 1023 is 0 in C. |
| S0.9 | `stage-0/S0.9-pwm-duty-cycle-and-analog-write.md` | **no** | 1 | A | — | blocked | duty = val/255; 490 Hz is 2.04 ms; 1000 % 256 is 232. |
| S0.M | `stage-0/S0.M-stage-0-milestone.md` | **no** | 2 | A | — | blocked | Button LOW forces pwm 0; otherwise adc/4 (800 → 200). |
| P.1 | `track-p/P.1-variables-and-data-types.md` | yes | 1 | A | string-sum | shipped | "12" + "5" is "125"; int() makes 17. |
| P.2 | `track-p/P.2-arithmetic-and-order-of-operations.md` | yes | 5 | A | order-of-operations | shipped | 12.0 V on 20 k/10 k is 4.00 V with the bar; without it, 10,006.00. |
| P.2.5 | `track-p/P.2.5-thinking-in-comments.md` | yes | 1 | A | — | planned | Four comments first: the unit decides the arithmetic. |
| P.3 | `track-p/P.3-decisions-and-clamping.md` | yes | 5 | A | clamp-command | shipped | 310 wraps to 54; clamping holds 255, and e-stop holds 0. |
| P.4 | `track-p/P.4-lists-and-for-loops.md` | yes | 1 | A | — | planned | Four samples are offsets 0…3; samples[4] is not there; the loop averages 11.9. |
| P.5 | `track-p/P.5-functions-and-while-loops.md` | yes | 2 | A | clamp-function | shipped | print instead of return gives None, then TypeError; clamp(310) is 255. |
| P.6 | `track-p/P.6-modules-and-automated-asserts.md` | yes | 2 | A | assert-guard | shipped | √(3²+4²) = 5.0 passes; 0.1+0.2 = 0.30000000000000004 needs round(…, 4). |
| P.7 | `track-p/P.7-si-units-and-metric-prefixes.md` | yes | 1 | A | prefix-shift | shipped | 15 mm is ×1,000 off 0.015 m; 500 µs ×1,000,000 off; 4,700 Ω is 4.7 kΩ. |
| P.8 | `track-p/P.8-frequency-and-binary-bits.md` | yes | 1 | A | freq-bits | shipped | T = 1/f (50 Hz → 20 ms) and a count stops at 2^N−1: 255, 1023, 4095. |
| P.9 | `track-p/P.9-rearranging-formulas-and-scaling.md` | yes | 5 | B | scaling-dials | shipped | 511.5 of 1023 is 0.500: 2.50 V and 127.5 at once, from two different tops. |
| P.10 | `track-p/P.10-radians-and-right-triangle-trig.md` | yes | 1 | A | radian-convert | shipped | cos/sin want radians (180° = 3.1416), so cos(90) is −0.4481. |
| P.11 | `track-p/P.11-reading-time-series-graphs.md` | yes | 3 | B | — | planned | Slope divides by Δt (velocity); a rectangle multiplies by it (distance). |
| P.12 | `track-p/P.12-forces-and-lever-torque.md` | yes | 1 | A | lever-cos | shipped | τ_grav = mgLcosθ: 0.981 N·m at 0° and 0.000 at 90°. |
| P.13 | `track-p/P.13-reading-a-datasheet-table.md` | yes | 2 | A | datasheet-limits | shipped | DRV8833 stops at 10.8 V rec / 11.8 V abs; 12.0 V is a TB6612 job. |
| P.14 | `track-p/P.14-analysis-workflow-given-unknown-model-check-answer.md` | yes | 2 | A | answer-check | shipped | 12 V / 2.4 Ω = 5.0 A against a 3.2 A limit: the answer names the limit. |
| P.M | `track-p/P.M-track-p-milestone.md` | yes | 4 | A | — | planned | 502 of 1023 is the 0.981 N·m that holds the arm; 30 RPM for 3×100 ms is 0.942 rad. |

## Blocked by the registry gap

| lesson | page | planned batch | why |
| :-- | :-- | --: | :-- |
| 01.2 | `01-electronics-and-power/01.2-h-bridge-and-stall-current.md` | 1 | not in the reader registry: no payload, no mount point |
| S0.1 | `stage-0/S0.1-closed-circuits-and-ohms-law.md` | 1 | not in the reader registry: no payload, no mount point |
| S0.2 | `stage-0/S0.2-series-parallel-and-voltage-dividers.md` | 2 | not in the reader registry: no payload, no mount point |
| S0.3 | `stage-0/S0.3-breadboards-and-short-circuits.md` | 4 | not in the reader registry: no payload, no mount point |
| S0.4 | `stage-0/S0.4-leds-and-resistor-power.md` | 2 | not in the reader registry: no payload, no mount point |
| S0.5 | `stage-0/S0.5-multimeters-and-current-limited-supplies.md` | 4 | not in the reader registry: no payload, no mount point |
| S0.7 | `stage-0/S0.7-arduino-uno-digital-io-and-pullups.md` | 4 | not in the reader registry: no payload, no mount point |
| S0.8 | `stage-0/S0.8-adc-analog-read-and-serial-monitor.md` | 1 | not in the reader registry: no payload, no mount point |
| S0.9 | `stage-0/S0.9-pwm-duty-cycle-and-analog-write.md` | 1 | not in the reader registry: no payload, no mount point |
| S0.M | `stage-0/S0.M-stage-0-milestone.md` | 2 | not in the reader registry: no payload, no mount point |

Unlock: add the page to the reader registry (a `readerPath` entry), then run
`python3 scripts/generate_lesson_pages.py`, add the manifest row and the registry row, and the
card already written for it can be built in its batch.

**01.1** and **S0.6** used to sit here. Both pages now carry a graded Python exercise
(`flyback_spike.py`, `rc_charge.py`) whose expected output matches the `INSTRUCTOR_TESTS` entry, a
hint ladder with the same two rungs and full solution every shipped lesson has, and a Requirements
checklist: they were removed from `FALSTAD_ONLY_LESSONS` in `scripts/lint_lessons.py` and the
Falstad-only counts in `tests/test_exercises.py` moved from 7 to 5 with them. Their Falstad netlist
is kept as a `### Falstad Netlist` appendix under the exercise, and the page's numbers (512.0 V /
12.7 V / 80.0 mW, and 1.00 s / 3.16 V / 4.32 V / 4.97 V) are printed by both the Python run and the
netlist run, so the prose, the payload and the tests agree.

The 10 lessons still blocked are the 5 remaining Falstad-only circuit lessons (`S0.1`–`S0.5`, whose
Falstad-mirror rule stays exactly as it was) and the 5 Arduino lessons (`01.2`, `S0.7`–`S0.M`).

