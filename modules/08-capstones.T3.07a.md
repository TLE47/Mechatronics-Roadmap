---
id: 08-capstones.T3.07a
title: "System Error/Latency Budgeting, Cross-Domain Interface Contracts & Pre-Bring-Up Safety Sign-Off"
track: "08"
tier: 3
prereqs:
  - 06-robotics.T3.07
  - 07-systems.T3.06a
new_concepts:
  - rss_and_worst_case_spatial_error_budget
  - end_to_end_latency_and_phase_margin_erosion_budget
  - pre_bring_up_interface_and_safety_signoff_gate
uses:
  - loop_transfer_gain_and_phase_margin
  - iso_13849_category3_pld_dual_channel_sto
  - sim_to_real_domain_randomization_and_safety_shield
est_hours: 4.5
hardware_required: false
safety_level: high
resources_verified: true
---

## 1. Why it matters
This is the final bridge module in the entire repository before Step 3.8 (`08-capstones.T3.08`: **Capstone 1** High-Speed Precision Motion Stage, **Capstone 2** Balancing Mobility Robot, or **Capstone 3** 6-DOF Force-Controlled Tele-Impedance Manipulator — the **Graduate Goal**). Why do so many student and startup robot builds fail during final integration even when the CAD, PCB, firmware, and ROS 2 nodes each worked on their own benches? Because nobody added up the **end-to-end spatial error budget** ($\sigma_{\text{total}} = \sqrt{\sum \sigma_i^2}$), the **end-to-end latency & phase-margin erosion budget** ($\Delta\phi = \omega_{gc}\sum \tau_i$), or verified a formal **Cross-Domain Interface Contract (ICD) & Pre-Bring-Up Safety Sign-Off** before energizing the $48\text{ V}$ bus! Already know this? Read `### Safety notes` first, then take the Skip test or the Ladder Gate test in section 7.

## 2. Intuition first
When you bolt six joints, six encoders, a camera, a CAN-FD bus, a $1\text{ kHz}$ `ros2_control` loop, and a $50\text{ Hz}$ learned policy together, errors and delays accumulate across every domain boundary:
1. **Spatial Error Budgeting (RSS vs. Worst-Case):** Deterministic systematic offsets $b_i$ (like uncalibrated thermal expansion) add linearly ($\sum |b_i|$), whereas independent random errors $\sigma_i$ (encoder noise, bearing runout, structural deflection, calibration residual) add in **Root-Sum-Square (RSS)**: $\sigma_{\text{rss}} = \sqrt{\sum \sigma_i^2}$. Looking at the RSS breakdown tells you immediately which single subsystem dominates $80\%$ of your error so you don't waste \$1,000 on an ultra-precise encoder when link deflection is $10\times$ larger!
2. **End-to-End Latency & Phase-Margin Budget:** Every microsecond of sensor readout delay ($\tau_{\text{enc}}$), CAN-FD wire transport ($\tau_{\text{can}}$), digital filtering ($\tau_{\text{filt}}$), and zero-order hold ($\frac{1}{2}T_s$) adds up to total loop delay $\tau_{\text{total}} = \sum \tau_k$, which steals $\Delta\phi = \omega_{gc}\tau_{\text{total}}\frac{180^\circ}{\pi}$ degrees of Phase Margin from your servo loop (`05-control.T2.05a`).
3. **Cross-Domain Interface Control Document (ICD) & Pre-Bring-Up Sign-Off:** Before first motion on a multi-DOF capstone robot, every mechanical, electrical, firmware, control, and safety assertion must pass an automated **Go / No-Go Sign-Off Checklist**.

## 3. Formalization
1. **Combined Systematic + Root-Sum-Square (RSS) Spatial Error Budget:** Given $M$ subsystems with residual systematic bias $b_i$ and independent $1\sigma$ random error $\sigma_i$ mapped to end-effector tip displacement via sensitivity $s_i$:

$$
e_{3\sigma,\text{total}} = \sum_{i=1}^{M} |s_i b_i| + 3\sqrt{\sum_{i=1}^{M} (s_i \sigma_i)^2} \le e_{\text{spec}}
$$

   The fractional variance contribution of source $i$ is $w_i = \frac{(s_i \sigma_i)^2}{\sum_j (s_j \sigma_j)^2}$ ($\sum w_i = 1$).
2. **End-to-End Loop Latency & Phase-Margin Erosion Budget:** Across sensor delay $\tau_{\text{sens}}$, bus transport $\tau_{\text{bus}}$, filter group delay $\tau_{\text{filt}}$, compute time $\tau_{\text{comp}}$, and Zero-Order Hold $\tau_{\text{zoh}} = \frac{1}{2}T_s$:

$$
\tau_{\text{total}} = \tau_{\text{sens}} + \tau_{\text{bus}} + \tau_{\text{filt}} + \tau_{\text{comp}} + \frac{1}{2}T_s, \quad \text{PM}_{\text{net}} = \text{PM}_0 - \omega_{gc}\tau_{\text{total}}\frac{180^\circ}{\pi} \ge \text{PM}_{\min}
$$

3. **Cross-Domain ICD & Pre-Bring-Up Go/No-Go Sign-Off Function:** A capstone build is cleared for energized closed-loop testing (`GO = True`) iff all 5 domain gates hold simultaneously:

$$
\text{GO} = (e_{3\sigma,\text{total}} \le e_{\text{spec}}) \land (\text{PM}_{\text{net}} \ge 45^\circ) \land (\text{CPU-Util} \le 0.70) \land (\text{CAN-Term-Ohm} \in [55, 65]) \land (\text{Cat3-STO-Verified} = \text{True})
$$


## 4. Worked example
**Predict first (before you run it):** Commit to four numbers, a dominant source and one verdict. (1) For $1\sigma$ sources of $0.03, 0.06, 0.08, 0.03\text{ mm}$, is $\sigma_{\text{rss}}$ nearer $0.10$ or $0.14\text{ mm}$? (2) With $20 + 180 + 250 + 150\ \mu\text{s}$ plus the zero-order hold, is $\tau_{\text{total}}$ nearer $0.6$ or $1.1\text{ ms}$? (3) At $\omega_{gc} = 150\text{ rad/s}$ and $\text{PM}_0 = 62.0^\circ$, does the loop keep the $45^\circ$ floor? (4) Which source owns most of the variance? Then answer the exercise's verdict after a $10$-tap filter pushes $\tau_{\text{total}}$ to $3.40\text{ ms}$: GO or NO-GO? Two tells that a wrong answer is a mistake rather than a convention: a systematic term of $0.0548\text{ mm}$ instead of $0.10\text{ mm}$ means the four biases were Root-Sum-Squared like the random errors (they add linearly); and a net margin above $62.0^\circ$ means the erosion was added to the nominal margin instead of subtracted from it.

Evaluate the complete system error budget, latency/phase-margin budget, and 5-domain Pre-Bring-Up Go/No-Go Sign-Off for Capstone 3 (the 6-DOF Tele-Impedance Manipulator with $e_{\text{spec}} = 0.50\text{ mm}$ repeatability, $\omega_{gc} = 150\text{ rad/s}$, and nominal $\text{PM}_0 = 62.0^\circ$).

```python
import math

# 1. Spatial Repeatability Budget (in mm): (name, systematic_bias_mm, sigma_1_mm)
error_sources = [
    ("Encoder quantization & noise", 0.01, 0.03),
    ("Harmonic/planetary backlash",  0.04, 0.06),
    ("Structural link deflection",   0.03, 0.08),
    ("Thermal drift (calibrated)",   0.02, 0.03),
]
sys_sum_mm = sum(abs(b) for _, b, _ in error_sources)
rss_1sigma_mm = math.sqrt(sum(s ** 2 for _, _, s in error_sources))
e_3sigma_mm = sys_sum_mm + 3.0 * rss_1sigma_mm
dominant_source = max(error_sources, key=lambda item: item[2] ** 2)[0]
assert math.isclose(rss_1sigma_mm, math.sqrt(0.03**2 + 0.06**2 + 0.08**2 + 0.03**2), rel_tol=1e-9)
assert e_3sigma_mm < 0.50  # Meets 0.50 mm spec!

# 2. End-to-End Loop Latency Budget at 1 kHz (Ts = 1000 us) and w_gc = 150 rad/s
tau_sens_us, tau_can_us, tau_filt_us, tau_comp_us, ts_us = 20.0, 180.0, 250.0, 150.0, 1000.0
tau_total_s = (tau_sens_us + tau_can_us + tau_filt_us + tau_comp_us + 0.5 * ts_us) * 1e-6  # 0.0011 s (1.1 ms)
pm0_deg, w_gc = 62.0, 150.0
pm_net_deg = pm0_deg - w_gc * tau_total_s * (180.0 / math.pi)
assert math.isclose(tau_total_s, 0.0011, rel_tol=1e-9)
assert pm_net_deg >= 45.0  # 52.55 deg >= 45 deg!

# 3. Pre-Bring-Up 5-Domain Go/No-Go Sign-Off Gate
def capstone_signoff(e_3sig: float, pm_net: float, cpu_u: float, can_ohm: float, sto_cat3_ok: bool) -> bool:
    return (e_3sig <= 0.50) and (pm_net >= 45.0) and (cpu_u <= 0.70) and (55.0 <= can_ohm <= 65.0) and sto_cat3_ok

assert capstone_signoff(e_3sigma_mm, pm_net_deg, cpu_u=0.42, can_ohm=60.0, sto_cat3_ok=True) is True
assert capstone_signoff(e_3sigma_mm, pm_net_deg, cpu_u=0.42, can_ohm=60.0, sto_cat3_ok=False) is False
print(f"e_3sigma={e_3sigma_mm:.3f} mm (dominant: {dominant_source}), tau={tau_total_s*1e3:.2f} ms, PM_net={pm_net_deg:.2f} deg, GO=True")
```
Expected output:
```text
e_3sigma=0.426 mm (dominant: Structural link deflection), tau=1.10 ms, PM_net=52.55 deg, GO=True
```

## 5. Exercise
Suppose an engineer replaces the $250\ \mu\text{s}$ low-pass filter in the $1\text{ kHz}$ loop above with a heavy 10-tap moving-average filter that adds $\tau_{\text{filt,new}} = 2550\ \mu\text{s}$ of delay (so $\tau_{\text{total}}$ increases from $1.10\text{ ms}$ to $3.40\text{ ms}$). Compute the new net Phase Margin $\text{PM}_{\text{net}} = 62.0^\circ - 150.0 \times 0.0034 \times \frac{180^\circ}{\pi}$ in degrees, and verify whether `capstone_signoff` returns `True` or `False`. Verify $\text{PM}_{\text{net}} = 32.779^\circ < 45.0^\circ$ and `capstone_signoff == False`.
- **If your result differs:** Multiply $150.0\text{ rad/s} \times 0.0034\text{ s} = 0.51\text{ rad}$, convert to degrees ($0.51 \times 180/\pi = 29.2208^\circ$), and subtract from $62.0^\circ$ ($32.78^\circ < 45^\circ \implies \text{NO-GO}$).


### Graded package - the error budget, the delay and the sign-off
[`exercises/08-capstones.T3.07a/`](../exercises/08-capstones.T3.07a/) turns this section into a test. `starter.py` holds nine holes: `rss`, `systematic_sum`, `error_budget_3sigma`, `variance_fraction`, `zoh_delay_us`, `total_latency_s`, `net_phase_margin_deg`, `max_allowable_delay_ms` and `capstone_signoff`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/08-capstones.T3.07a/starter.py \
  python3 -m unittest discover -s exercises/08-capstones.T3.07a -p 'test_*.py'
```

**38 tests.** The $3\sigma$ budget is checked at the worked example's $0.4259\text{ mm}$ and the Gate test's $0.35\text{ mm}$, and a $-0.02\text{ mm}$ bias must still add $0.02\text{ mm}$ rather than cancel, so a linear sum or a signed sum each fail; the latency chain is checked at $1100\ \mu\text{s}$ and at the 10-tap filter's $3400\ \mu\text{s}$, so a chain that forgets the $500\ \mu\text{s}$ zero-order hold fails; the phase subtraction is checked in degrees at $52.55^\circ$, $32.78^\circ$ and $48.54^\circ$, so a raw radian result fails; and the sign-off is checked at the 4-of-5 `STO` case, an out-of-window $50\ \Omega$ bus, and the inclusive boundaries of all five limits. The transfer suite runs **the plant**: one count of its 12-bit encoder seen at the full $0.20\text{ m}$ reach is $0.3068\text{ mm}$, so $3\sigma$ is $0.9204\text{ mm}$ and the $0.50\text{ mm}$ capstone spec is already lost before any other source is counted; its $1\text{ kHz}$ tick is the worked $1000\ \mu\text{s}$ period and erodes $8.59^\circ$ at $150\text{ rad/s}$; and the $17^\circ$ between the nominal margin and the $45^\circ$ floor buys $1.978\text{ ms}$, which the module's filter swap spends nearly twice over. Five planted faults - `rss_adds_linearly`, `systematic_forgets_abs`, `latency_forgets_zoh`, `phase_margin_forgets_radians`, `signoff_ignores_sto` - each fail the test named for them.

### Break it on purpose
Inject the `latency_forgets_zoh` fault and diagnose it from the budget alone, keeping $T_s = 1000\ \mu\text{s}$ and $\omega_{gc} = 150\text{ rad/s}$:
- **Inject:** sum the four measured delays and drop the zero-order hold term, i.e. `tau_total_s = (tau_sens_us + tau_bus_us + tau_filt_us + tau_comp_us) * 1e-6` instead of adding `0.5 * ts_us`.
- **Symptom:** the worked case reports $0.60\text{ ms}$ and $56.84^\circ$ instead of $1.10\text{ ms}$ and $52.55^\circ$, so it still says GO and a smoke test passes; the exercise's $3.40\text{ ms}$ becomes $2.90\text{ ms}$ and $37.08^\circ$ instead of $32.78^\circ$ (still NO-GO, but $4.3^\circ$ of margin that no longer exists), and the transfer suite's one-plant-tick erosion halves from $8.59^\circ$ to $4.30^\circ$. The error is always exactly $0.5\text{ ms}$ of delay, regardless of which filter is installed.
- **Diagnose:** the constant offset separates it from a sensor or bus latency mistake. A wrong measured delay changes with the hardware and shifts every case by a different amount, whereas a gap that is exactly $\frac{1}{2}T_s$ in all four cases - and that leaves $\text{PM}_0$, the $3\sigma$ budget and the $5$-domain gate untouched - can only be the sampling term, not `max_allowable_delay_ms` or a degrees/radians slip.
- **Fix:** restore `+ 0.5 * ts_us` in the chain and prove it at the two numbers CI checks: $1.10\text{ ms}$ and $52.55^\circ$ for the worked example, $3.40\text{ ms}$ and $32.78^\circ$ for the filter swap, plus the gate's $500\ \mu\text{s}$ ZOH. `latency_forgets_zoh` must fail `test_behavior`, and the plant-tick transfer check ($8.59^\circ$ at $150\text{ rad/s}$) must pass.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Bode Phase Margin*), [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Root-Sum-Square Variance Summation*), and [`00-foundations.T3.00a`](00-foundations.T3.00a.md) (*Multi-Domain Power & Energy Balance*).
  - **Prerequisite Tier 3 Modules:** [`01-electronics.T3.02`](../01-electronics-and-power/README.md), [`02-mechanics.T3.03`](../02-mechanics-kinematics-dynamics/README.md), [`03-sensors.T3.04`](../03-sensors-and-actuators/README.md), [`04-embedded.T3.05`](../04-embedded-and-realtime/README.md), [`05-control.T3.06`](../05-control-and-estimation/README.md), and [`06-robotics.T3.07`](../06-robotics-and-autonomy/README.md).
  - **Core Concepts to Review First:** End-to-end latency phase erosion $\Delta\phi(\omega_{gc}) = -\omega_{gc}\tau_{\text{total}}\frac{180^\circ}{\pi}$ and net phase margin $\text{PM}_{\text{net}} = \text{PM}_0 - |\Delta\phi|$, coupled electro-thermo-mechanical power sizing, and `ISO 13855` safety stopping distance in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Slocum *Precision Machine Design*](https://ocw.mit.edu/courses/2-75-precision-machine-design-fall-2001/), [NASA Systems Engineering Handbook (`NASA/SP-2016-6105`)](https://www.nasa.gov/reference/systems-engineering-handbook/), and [Track 08 Capstones (`08-capstone-projects/README.md`)](../08-capstone-projects/README.md#tier-3-capstone-builds-advanced--production-pass).

## 6. Simulation path
Open **Tab 5 (URDF / MuJoCo & STO — Capstone 3: 6-DOF Force-Controlled Tele-Impedance Manipulator & System Verification)** in the MechaLab Workbench (`npm run dev`), or run the standalone verification script `python3 08-capstone-projects/urdf-mujoco-capstone3-6dof/verify_capstone3_kinematics_cbf.py`.

### Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before energizing any Capstone hardware build or taking the Skip/Gate test):**
> 1. **Mandatory 5-Stage Progressive Bring-Up Sequence:** Never power up a newly assembled multi-DOF robot and immediately enable full-torque closed-loop trajectory tracking. Always execute in strict order:
>    - **Stage 0 (Power-Off Bench Check):** Verify bus resistance (`> 10 kOhm` `+Vbus` to `GND`), CAN termination ($60\ \Omega$), fastener torque witness marks, and mechanical hard stops.
>    - **Stage 1 (Current-Limited Logic & Sensor Check):** Current-limited bench PSU ($24\text{ V}/48\text{ V}$ at $0.5\text{ A}$), verify encoder counts, joint signs, `tf2` tree directions in `RViz2`, and dual-channel `STO` cut-off (`torque_removed == True`).
>    - **Stage 2 (Single-Joint Open-Loop / Low-Current FOC Alignment):** Align electrical zero angle $\theta_e$ with mechanical load uncoupled or arm supported in a safe cradle.
>    - **Stage 3 (Zero-Stiffness Gravity Compensation + Damping Mode):** Set $K_p = 0$, $K_d > 0$, $\tau_{\text{ff}} = g(q)$ with $20\%$ torque ceiling; move the arm by hand to verify smooth backdrivability and confirm that pushing each link produces damped resistance (positive damping, not positive feedback!).
>    - **Stage 4 (Full Closed-Loop Impedance + CBF Safety Shield + E-Stop Live Test):** Enable Cartesian impedance / learned policy only after Stages 0–3 and a live physical E-stop cut test pass.


```mermaid
flowchart LR
    A["08-capstones.T3.07a: rss_and_worst_case_spatial_error_budget"] --> B["end_to_end_latency_and_phase_margin_erosion_budget"]
    B --> C["pre_bring_up_interface_and_safety_signoff_gate"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: read `### Safety notes`, score $\ge 80\%$ ($4/5$, $100\%$ on `[SAFETY]` items) on the Skip test, or score $\ge 80\%$ ($7/8$, $100\%$ on `[SAFETY]` items) on the Ladder Gate test to unlock Step 3.8 (`08-capstones.T3.08`).

### Skip test
1. `[Recall] [Concept: rss_and_worst_case_spatial_error_budget]` Three independent random error sources have $1\sigma$ end-effector contributions $\sigma_1 = 0.03\text{ mm}$, $\sigma_2 = 0.04\text{ mm}$, and $\sigma_3 = 0.12\text{ mm}$. Compute the combined Root-Sum-Square (RSS) $1\sigma$ error $\sigma_{\text{rss}} = \sqrt{\sigma_1^2 + \sigma_2^2 + \sigma_3^2}$ in millimeters ($\text{mm}$, tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: rss_and_worst_case_spatial_error_budget]` In Q1 ($\sigma_1 = 0.03, \sigma_2 = 0.04, \sigma_3 = 0.12\text{ mm}$, so $\sigma_{\text{rss}} = 0.13\text{ mm}$), what fraction of the total error variance $\sigma_3^2 / \sigma_{\text{rss}}^2$ comes from source 3 alone (tolerance $\pm 10^{-4}$)?
3. `[Transfer] [Concept: end_to_end_latency_and_phase_margin_erosion_budget]` A servo loop has crossover $\omega_{gc} = 200\text{ rad/s}$, delay-free Phase Margin $\text{PM}_0 = 60.0^\circ$, and total end-to-end loop delay $\tau_{\text{total}} = 0.001\text{ s}$ ($1.0\text{ ms}$). Compute the net Phase Margin $\text{PM}_{\text{net}} = \text{PM}_0 - \omega_{gc}\tau_{\text{total}}\frac{180^\circ}{\pi}$ in degrees (tolerance $\pm 0.01^\circ$).
4. `[Spaced review -> 06-robotics.T3.07 — Concept: loop_transfer_gain_and_phase_margin] [SAFETY] [Concept: pre_bring_up_interface_and_safety_signoff_gate]` During **Stage 3** of progressive bring-up on a 6-DOF robot arm (before enabling stiff position trajectories), you set $K_p = 0$, $K_d = 1.5\text{ N}\cdot\text{m}\cdot\text{s/rad}$, and $\tau_{\text{ff}} = g(q)$ at a $20\%$ torque limit and gently push Joint 2 by hand. Why is this test mandatory before enabling $K_p > 0$?
   - **A.** To polish the aluminum links.
   - **B.** It safely verifies at low torque that encoder direction, motor phase sequence, velocity sign ($-K_d\dot{q}$), and gravity vector $g(q)$ all oppose external disturbances rather than accelerating into positive-feedback runaway!
   - **C.** Because $K_p$ is never used in robotics.
   - **D.** To discharge the battery.
5. `[SAFETY] [Concept: pre_bring_up_interface_and_safety_signoff_gate]` If 4 out of 5 pre-bring-up gates pass (`e_3sigma <= spec`, `PM_net >= 45 deg`, `CPU_Util <= 0.70`, `CAN_Term == 60 Ohm`), but the dual-channel Category 3 `STO` test has **not** been verified (`sto_cat3_ok = False`), what integer value must `int(all(gates))` return (`0` for `False / NO-GO`, `1` for `True / GO`, exact integer, tolerance $\pm 0$)?

**Answer key:**
```python
import math

q1_rss_mm = math.sqrt(0.03**2 + 0.04**2 + 0.12**2)
q2_var_frac = (0.12 ** 2) / (q1_rss_mm ** 2)
q3_pm_net = 60.0 - 200.0 * 0.001 * (180.0 / math.pi)
q4_safety_choice = "B"
q5_safety_go = int(all([True, True, True, True, False]))

assert math.isclose(q1_rss_mm, 0.13, rel_tol=1e-9)
assert math.isclose(q2_var_frac, 144.0 / 169.0, rel_tol=1e-4)
assert math.isclose(q3_pm_net, 48.540844, abs_tol=1e-2)
assert q4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert q5_safety_go == 0         # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $4/5$ overall AND $2/2$ ($100\%$) on Q4 and Q5 (`[SAFETY]`). If you missed Q1 or Q2, study `## 3. Formalization` item 1; Q3, study `## 3. Formalization` item 2; Q4 or Q5, study `## 3. Formalization` item 3 and `### Safety notes`. On pass, proceed to `## 10. Next modules`.
### Gate test
Covers the complete Track 08 Tier 3 Capstone Engineering bridge ladder (`08-capstones.T3.07a`) before Step 3.8 (`08-capstones.T3.08`):
1. `[Concept: rss_and_worst_case_spatial_error_budget]` Compute the $3\sigma$ total error $e_{3\sigma} = |b| + 3\sqrt{\sigma_1^2 + \sigma_2^2}$ in millimeters ($\text{mm}$, tolerance $\pm 10^{-9}$) for systematic bias $b = 0.05\text{ mm}$ and independent random errors $\sigma_1 = 0.06\text{ mm}, \sigma_2 = 0.08\text{ mm}$.
2. `[Concept: rss_and_worst_case_spatial_error_budget]` Why is reducing a small error source ($\sigma_1 = 0.02\text{ mm}$) to zero almost useless when another subsystem has $\sigma_2 = 0.20\text{ mm}$?
   - **A.** Because in Root-Sum-Square $\sqrt{0.02^2 + 0.20^2} = 0.2010\text{ mm} \to 0.2000\text{ mm}$, the largest variance source ($\sigma_2^2 = 99\%$ of variance) dominates the total RSS sum!
   - **B.** Because square roots cannot be computed on small numbers.
   - **C.** Because encoders do not affect accuracy.
   - **D.** Because systematic bias cancels random noise.
3. `[Concept: end_to_end_latency_and_phase_margin_erosion_budget]` In a digital control loop running at sample period $T_s = 1000\ \mu\text{s}$ ($1\text{ kHz}$), what is the effective Zero-Order Hold (ZOH) delay $\tau_{\text{zoh}} = \frac{1}{2}T_s$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}$)?
4. `[Concept: end_to_end_latency_and_phase_margin_erosion_budget]` Compute the maximum allowable total loop delay $\tau_{\max} = \frac{\Delta\phi_{\max}}{\omega_{gc}}$ in milliseconds ($\text{ms}$, tolerance $\pm 10^{-3}\text{ ms}$) if a loop with crossover $\omega_{gc} = 200\text{ rad/s}$ can afford to lose at most $\Delta\phi_{\max} = 0.20\text{ rad}$ ($\approx 11.46^\circ$) of Phase Margin.
5. `[Concept: pre_bring_up_interface_and_safety_signoff_gate]` Why must a Cross-Domain Interface Control Document (ICD) explicitly lock down coordinate frame conventions (`REP-103` `+X` fwd, `+Y` left, `+Z` up), joint rotation sign (`+q` right-hand rule about joint axis), and SI units (`rad`, `N*m`, `A`) across Mechanical, Firmware, and ROS 2 teams?
   - **A.** Because a single sign inversion or deg/rad unit mismatch across the CAN-FD interface turns negative feedback into violent positive-feedback instability on the very first control tick!
   - **B.** To make the README file longer.
   - **C.** Because C++ does not support negative numbers.
   - **D.** To change the motor winding resistance.
6. `[Concept: pre_bring_up_interface_and_safety_signoff_gate]` During **Stage 0 (Power-Off Bench Check)**, what nominal DC resistance in ohms ($\Omega$, tolerance $\pm 10^{-9}$) must you measure between `CAN_H` and `CAN_L` across a properly terminated 6-joint CAN-FD daisy chain?
7. `[SAFETY] [Concept: pre_bring_up_interface_and_safety_signoff_gate]` During **Stage 3** bring-up, you push Joint 1 slightly in the $+\theta$ direction and feel the motor push your hand *further* in the $+\theta$ direction instead of resisting. What is the root cause and immediate action?
   - **A.** Hit E-Stop immediately; the encoder direction or motor phase order is inverted relative to the controller sign convention (positive feedback!), and must be flipped and re-tested at low current before proceeding.
   - **B.** Increase $K_p$ by $10\times$ to overpower it.
   - **C.** Remove the E-stop button.
   - **D.** Ignore it and start the neural network policy.
8. `[SAFETY] [Concept: pre_bring_up_interface_and_safety_signoff_gate]` Why must the physical hardware E-stop (`STO`) test in **Stage 1 / Stage 4** be tested under actual motion before running autonomous policies?
   - **A.** To prove end-to-end that pressing the physical E-stop mushroom immediately removes inverter gate drive power (`STO`), coasts/brakes the links safely within the stopping distance budget, and latches `FAULT` until manually reset.
   - **B.** To wear in the button spring.
   - **C.** To calibrate the camera focal length.
   - **D.** To test the Wi-Fi router.

**Gate answer key:**
```python
import math

g1_e3sig = 0.05 + 3.0 * math.sqrt(0.06**2 + 0.08**2)
g2_choice = "A"
g3_zoh_us = 0.5 * 1000.0
g4_tau_max_ms = (0.20 / 200.0) * 1e3
g5_choice = "A"
g6_can_ohm = 60.0
g7_safety_choice = "A"
g8_safety_choice = "A"

assert math.isclose(g1_e3sig, 0.35, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_zoh_us, 500.0, rel_tol=1e-9)
assert math.isclose(g4_tau_max_ms, 1.0, rel_tol=1e-9)
assert g5_choice == "A"
assert math.isclose(g6_can_ohm, 60.0, rel_tol=1e-9)
assert g7_safety_choice == "A"  # Mandatory [SAFETY] 100% required
assert g8_safety_choice == "A"  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $7/8$ overall AND $2/2$ ($100\%$) on `[SAFETY]` questions Q7 and Q8. Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q4 $\to$ `## 3. Formalization` item 2; Q5–Q8 $\to$ `## 3. Formalization` item 3 and `### Safety notes`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Final 6-DOF arm misses its $0.5\text{ mm}$ repeatability spec by $3\times$ despite using $18\text{ -bit}$ encoders | Assumed encoder resolution equals tip accuracy and ignored structural link compliance and gearbox backlash in the RSS error budget. | Build the full sensitivity-weighted RSS table $e_{3\sigma} = \sum \lvert s_i b_i\rvert  + 3\sqrt{\sum (s_i\sigma_i)^2}$ before ordering parts, and use dual-encoder (motor + output-side) feedback if gearbox compliance dominates. |
| Individual joint loops are stable at $1\text{ kHz}$, but closing the Cartesian loop over USB/ROS 2 oscillates at $25\text{ Hz}$ | Unbudgeted USB buffer latency ($16\text{ ms}$ bulk transfer timer) eroded $> 60^\circ$ of Phase Margin. | Run torque/impedance loops inside `ros2_control` over deterministic CAN-FD ($\tau_{\text{bus}} < 0.25\text{ ms}$) or set `BM_LATENCY_TIMER = 1 ms` on FTDI adapters. |
| Enabled full-stiffness trajectory tracking on first power-up without running Stage 3 ($K_p = 0$ gravity/damping check) | Sign mismatch between URDF joint axis and actuator encoder caused an immediate full-torque slam into the hard stop. | Never skip Stage 3 ($K_p = 0$, $20\%$ torque limit backdrivability & damping sign check) before enabling position stiffness! |

## 9. Resources
- **Alexander Slocum — *Precision Machine Design* & NASA *Systems Engineering Handbook (`NASA/SP-2016-6105 Rev2`)* (`resources/textbooks-and-papers.md`):** Industry-standard methodology for structural error budgets, interface control documents (ICDs), and staged system verification `[VERIFIED 2026-10-15]`.
- **Track 08 (`08-capstone-projects/README.md`):** Directly unlocks Step 3.8 (`08-capstones.T3.08`: Capstones 1, 2, and 3) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 3.8 (`08-capstones.T3.08`)** in [`08-capstone-projects/README.md`](../08-capstone-projects/README.md) — **Capstone 1** (Precision Stage), **Capstone 2** (Balancing Robot), or **Capstone 3** (6-DOF Force-Controlled Tele-Impedance Manipulator — the **Graduate Goal**).
