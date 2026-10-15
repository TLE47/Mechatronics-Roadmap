---
id: 01-electronics.T1.01b
title: "Low-Side MOSFET Switching, PWM Duty Cycle & H-Bridge Polarity Reversal"
track: "01"
tier: 1
prereqs:
  - 01-electronics.T1.01d
new_concepts:
  - mosfet_low_side_rds_on_switch
  - pwm_duty_cycle_effective_voltage
  - h_bridge_four_switch_polarity_and_shoot_through
uses:
  - voltage_current_resistance_ohms_law
  - electrical_power_i2r_dissipation
  - multimeter_and_current_limited_psu_safety
  - rc_time_constant_and_filtering
  - inductor_flyback_and_freewheeling_diode
est_hours: 3.5
hardware_required: false
safety_level: high
resources_verified: true
---

## 1. Why it matters (Why This Matters)
This is the final bridge module in the Track 01 Tier 1 ladder before Step 1.2 (`01-electronics.T1.02`). A microcontroller GPIO pin can only source $\sim 20\text{ mA}$ at $3.3\text{ V}$—connecting a motor directly to it destroys the pin immediately. Power MOSFETs act as voltage-controlled electronic switches that let a tiny $3.3\text{ V}$ logic signal throttle amperes of motor current via **Pulse-Width Modulation (PWM)** and reverse direction via a 4-switch **H-Bridge**. Already know this? Read `## 7. Safety notes` first, then take the Skip test or the Ladder Gate test in section 8.

## 2. Intuition first (Mental Model)
Think of a MOSFET as a spring-loaded water valve whose handle (the **Gate**) is controlled by pressure rather than flow. When the Gate voltage is $0\text{ V}$ relative to the **Source** ($V_{GS} = 0$), the valve is shut tight and zero current flows into the **Drain**. When you raise $V_{GS}$ above the threshold with a $3.3\text{ V}$ or $5\text{ V}$ logic signal, the valve snaps wide open with a tiny on-resistance $R_{DS(\text{on})}$ of just a few milliohms. Instead of cracking the valve half-open (which would burn huge heat inside the valve), we flick it 100% open and 100% closed twenty thousand times per second (**PWM**); the motor's inductance smooths those rapid pulses into a smooth average voltage $V_{\text{eff}} = D \cdot V_{\text{bus}}$. And to spin the motor backward, an **H-Bridge** arranges four MOSFETs like an "H" around the motor so closing one diagonal pair pushes current left-to-right and closing the opposite diagonal pushes current right-to-left.

## 3. Formalization
1. **Low-Side N-Channel MOSFET Switch & Conduction Loss:** When gate-to-source voltage $V_{GS}$ exceeds the logic-level rating, the MOSFET conducts drain current $I_D$ ($\text{A}$) with on-resistance $R_{DS(\text{on})}$ ($\Omega$), dissipating conduction heat power $P_{\text{cond}}$ ($\text{W}$):
   $$P_{\text{cond}} = I_D^2 \cdot R_{DS(\text{on})}$$
   Substituting $I_D = 5.0\text{ A}$ and $R_{DS(\text{on})} = 0.010\ \Omega$ ($10\text{ m}\Omega$) gives $P_{\text{cond}} = 25.0 \times 0.010 = 0.25\text{ W}$ (whereas dropping $6\text{ V}$ linearly at $5\text{ A}$ would waste $30.0\text{ W}$!). A $10\text{ k}\Omega$ pull-down resistor from Gate to Source keeps $V_{GS} = 0\text{ V}$ while MCU pins float during boot.
2. **PWM Duty Cycle ($D \in [0, 1]$):** Switching $V_{\text{bus}}$ ($\text{V}$) ON for time $t_{\text{on}}$ over period $T_{\text{pwm}} = 1/f_{\text{pwm}}$ defines duty cycle $D = t_{\text{on}}/T_{\text{pwm}}$ and average effective voltage:
   $$V_{\text{eff}} = D \cdot V_{\text{bus}}$$
   Substituting $V_{\text{bus}} = 12.0\text{ V}$ and $D = 0.75$ ($75\%$) gives $V_{\text{eff}} = 9.0\text{ V}$.
3. **H-Bridge Diagonal Switching & Shoot-Through:** Four switches $(Q_{\text{AH}}, Q_{\text{AL}})$ on leg A and $(Q_{\text{BH}}, Q_{\text{BL}})$ on leg B apply terminal voltage $V_{\text{AB}} = V_A - V_B$:
   - Forward: $(Q_{\text{AH}}, Q_{\text{BL}})$ ON $\implies V_{\text{AB}} = +V_{\text{bus}}$.
   - Reverse: $(Q_{\text{BH}}, Q_{\text{AL}})$ ON $\implies V_{\text{AB}} = -V_{\text{bus}}$.
   - **Shoot-Through Hazard:** Turning ON both switches of the *same* vertical leg $(Q_{\text{AH}}$ and $Q_{\text{AL}})$ simultaneously shorts $V_{\text{bus}}$ directly to $\text{GND}$ through $2 R_{DS(\text{on})}$; inserting **dead-time** $t_d$ (both OFF briefly during transitions) prevents shoot-through.

## 4. Worked example (Worked Example & Code)
Compare MOSFET conduction loss at $I_D = 4.0\text{ A}$, $R_{DS(\text{on})} = 0.020\ \Omega$ against linear drop loss at $V_{\text{bus}} = 12.0\text{ V}$, $D = 0.50$, and compute the catastrophic shoot-through current if both FETs in one leg turn on across $12.0\text{ V}$.

```python
import math

v_bus = 12.0
duty = 0.50
i_load = 4.0
rds_on = 0.020

v_eff = duty * v_bus
p_mosfet_pwm = duty * (i_load ** 2) * rds_on
p_linear_drop = (v_bus - v_eff) * i_load
i_shoot_through = v_bus / (2.0 * rds_on)

assert math.isclose(v_eff, 6.0, rel_tol=1e-9)
assert math.isclose(p_mosfet_pwm, 0.16, rel_tol=1e-9)
assert math.isclose(p_linear_drop, 24.0, rel_tol=1e-9)
assert math.isclose(i_shoot_through, 300.0, rel_tol=1e-9)
print(f"V_eff={v_eff:.1f} V, P_PWM={p_mosfet_pwm:.2f} W vs P_linear={p_linear_drop:.1f} W, I_shoot={i_shoot_through:.0f} A")
```
Expected output:
```text
V_eff=6.0 V, P_PWM=0.16 W vs P_linear=24.0 W, I_shoot=300 A
```

## 5. Exercise
For a `DRV8833` dual H-bridge ($R_{DS(\text{on, high})} + R_{DS(\text{on, low})} = 0.36\ \Omega$ total path resistance) driving $I = 1.2\text{ A}$ continuously at $D = 1.0$ from $V_{\text{bus}} = 9.0\text{ V}$, compute the total H-bridge conduction power loss $P_{\text{loss}} = I^2 (R_{\text{high}} + R_{\text{low}})$ in watts ($\text{W}$). Verify $P_{\text{loss}} = 0.5184\text{ W}$ ($\pm 10^{-4}\text{ W}$).
- **If your result differs:** Remember that in an H-bridge, motor current flows through **two** switches in series (one high-side FET in leg A and one low-side FET in leg B), so you must multiply $I^2$ by the combined high+low resistance ($0.36\ \Omega$).

## 6. Simulation path
Simulate a low-side MOSFET PWM switch and 4-FET H-bridge in [Falstad Circuit Simulator](https://www.falstad.com/circuit/) or inspect **Tab 2 (Power Stage & Gate Driver Dead-Time)** in the MechaLab Workbench (`npm run dev`).

## 7. Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before touching hardware or taking the Skip/Gate test):**
> 1. **Maximum Voltage & Current Limits:** Keep Tier 1 breadboard motor supplies at $\le 12.0\text{ V}$ and set your bench power supply current limit to $\le 1.5\text{ A}$ before powering on (`L0.1`).
> 2. **Shoot-Through & Short-Circuit Prevention:** Never wire discrete H-bridge gates without hardware dead-time or interlock logic; a simultaneous high-side + low-side ON state across an unprotected battery can dump $>100\text{ A}$, melting breadboard strips and rupturing LiPo cells. Use integrated drivers with built-in shoot-through protection (`DRV8833` in Step 1.2) and always power first from a current-limited bench supply, never directly from a LiPo battery.
> 3. **Gate Pull-Down & Flyback Protection:** Always include a $10\text{ k}\Omega$ Gate-to-Source pull-down resistor so the motor cannot spin unexpectedly while the MCU is in reset, and never switch an inductive coil with a single FET without a freewheeling flyback diode across the coil.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: read `## 7. Safety notes`, run the worked example and exercise asserts, or score $\ge 80\%$ ($4/5$) on the Skip test ($100\%$ required on `[SAFETY]` items). Passing the 8-question Ladder Gate test ($\ge 80\%$, $100\%$ on `[SAFETY]` items) unlocks Step 1.2 (`01-electronics.T1.02`).

### Skip test
1. `[Concept: pwm_duty_cycle_effective_voltage]` Compute the average effective motor voltage $V_{\text{eff}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for a $V_{\text{bus}} = 12.0\text{ V}$ supply switched at duty cycle $D = 0.65$ ($65\%$).
2. `[Concept: mosfet_low_side_rds_on_switch]` Compute the conduction heat dissipation $P_{\text{cond}} = I_D^2 R_{DS(\text{on})}$ in watts ($\text{W}$, tolerance $\pm 10^{-9}$) in a MOSFET with $R_{DS(\text{on})} = 0.015\ \Omega$ carrying $I_D = 6.0\text{ A}$ at $100\%$ duty cycle.
3. `[Concept: h_bridge_four_switch_polarity_and_shoot_through]` Which pair of H-bridge switches must close to apply $-V_{\text{bus}}$ ($V_A = 0\text{ V}, V_B = +V_{\text{bus}}$) across the motor?
   - **A.** $Q_{\text{AH}}$ and $Q_{\text{AL}}$
   - **B.** $Q_{\text{AH}}$ and $Q_{\text{BL}}$
   - **C.** $Q_{\text{BH}}$ and $Q_{\text{AL}}$
   - **D.** $Q_{\text{AH}}$ and $Q_{\text{BH}}$
4. `[SAFETY] [Concept: h_bridge_four_switch_polarity_and_shoot_through]` What happens if both $Q_{\text{AH}}$ (high-side leg A) and $Q_{\text{AL}}$ (low-side leg A) turn ON at the same instant, and what hardware feature prevents it during PWM transitions?
   - **A.** The motor brakes gently; no protection is needed.
   - **B.** Shoot-through shorts $V_{\text{bus}}$ directly to $\text{GND}$ through the two FETs (`300 A` surge); **dead-time** (turning off the outgoing FET before turning on the incoming FET) and a current-limited bench supply prevent destruction.
   - **C.** The ADC reads zero; a pull-up resistor prevents it.
   - **D.** The motor reverses direction smoothly.
5. `[SAFETY] [Concept: mosfet_low_side_rds_on_switch]` Why must a discrete low-side N-MOSFET gate have a $10\text{ k}\Omega$ pull-down resistor to Source (`GND`)?
   - **A.** To increase the PWM frequency.
   - **B.** To bleed off gate charge and hold $V_{GS} = 0\text{ V}$ while the microcontroller GPIO pin is floating (high-Z) during boot or reset, preventing unintended motor runaway or linear-region overheating.
   - **C.** To measure motor current.
   - **D.** To boost $3.3\text{ V}$ to $12\text{ V}$.

**Answer key:**
```python
import math

q1_veff = 0.65 * 12.0
q2_pcond = (6.0 ** 2) * 0.015
q3_choice = "C"
q4_safety_choice = "B"
q5_safety_choice = "B"

assert math.isclose(q1_veff, 7.8, rel_tol=1e-9)
assert math.isclose(q2_pcond, 0.54, rel_tol=1e-9)
assert q3_choice == "C"
assert q4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert q5_safety_choice == "B"  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $4/5$ overall AND $2/2$ ($100\%$) on Q4 and Q5 (`[SAFETY]`). If you missed Q1, study `## 3. Formalization` item 2; Q2 or Q5, study `## 3. Formalization` item 1; Q3 or Q4, study `## 3. Formalization` item 3 and `## 7. Safety notes`.

### Gate test
Covers the complete Track 01 Tier 1 bridge ladder (`01-electronics.T1.01a` $\to$ `01-electronics.T1.01c` $\to$ `01-electronics.T1.01d` $\to$ `01-electronics.T1.01b`) before Step 1.2 (`01-electronics.T1.02`):
1. `[Concept: voltage_current_resistance_ohms_law]` Compute the current $I$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) when $9.0\text{ V}$ is applied across a $4.5\ \Omega$ resistor.
2. `[Concept: kvl_kcl_and_voltage_divider]` Compute the unloaded output voltage $V_{\text{out}}$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) of a divider with $V_{\text{in}} = 12.0\text{ V}$, $R_1 = 30\text{ k}\Omega$ (top), and $R_2 = 10\text{ k}\Omega$ (bottom).
3. `[Concept: electrical_power_i2r_dissipation]` Compute the power dissipated in watts ($\text{W}$, tolerance $\pm 10^{-9}$) by a $0.10\ \Omega$ resistor carrying $5.0\text{ A}$.
4. `[SAFETY] [Concept: multimeter_and_current_limited_psu_safety]` Why must you **never** probe a voltage source ($12\text{ V}$ rail to $\text{GND}$) while your digital multimeter leads are plugged into the $10\text{ A}$ current jack?
   - **A.** The multimeter screen will show hex numbers.
   - **B.** The $10\text{ A}$ current jack is a near-zero-ohm dead short ($\sim 0.01\ \Omega$) across the leads, short-circuiting the power supply and blowing the meter fuse or arcing at the probes.
   - **C.** It drains the multimeter's $9\text{ V}$ battery slightly faster.
   - **D.** It changes the PWM duty cycle.
5. `[Concept: rc_time_constant_and_filtering]` Compute the $-3\text{ dB}$ cutoff frequency $f_c = \frac{1}{2\pi R C}$ in $\text{Hz}$ (tolerance $\pm 0.01\text{ Hz}$) for $R = 1000\ \Omega$ and $C = 1.0\ \mu\text{F}$ ($10^{-6}\text{ F}$).
6. `[Concept: inductor_flyback_and_freewheeling_diode]` Compute the inductive flyback spike magnitude $|V_L| = L \left|\frac{di}{dt}\right|$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) if a $2.0\text{ mH}$ ($0.002\text{ H}$) coil carrying $3.0\text{ A}$ is interrupted in $\Delta t = 1.0\ \mu\text{s}$ ($10^{-6}\text{ s}$) without a flyback diode.
7. `[Concept: pwm_duty_cycle_effective_voltage]` Compute $V_{\text{eff}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for $V_{\text{bus}} = 24.0\text{ V}$ at $D = 0.25$.
8. `[SAFETY] [Concept: h_bridge_four_switch_polarity_and_shoot_through]` Before powering a newly wired breadboard H-bridge for the first time, what is the mandatory bench power supply procedure?
   - **A.** Connect a fully charged 3S LiPo battery first to burn off any solder flux.
   - **B.** Verify $V_{\text{bus}}$ to $\text{GND}$ resistance is not a short with a DMM, set the bench PSU voltage to target ($6\text{–}12\text{ V}$) with the **current limit set low ($0.2\text{–}0.5\text{ A}$)** before enabling the output, and verify dead-time / logic states before connecting the motor.
   - **C.** Set the bench PSU current limit to $30\text{ A}$ maximum.
   - **D.** Leave the MCU ground disconnected from the motor driver ground.

**Gate answer key:**
```python
import math

g1_i = 9.0 / 4.5
g2_vout = 12.0 * (10_000.0 / (30_000.0 + 10_000.0))
g3_pw = (5.0 ** 2) * 0.10
g4_safety = "B"
g5_fc = 1.0 / (2.0 * math.pi * 1000.0 * 1e-6)
g6_vl = 0.002 * (3.0 / 1e-6)
g7_veff = 0.25 * 24.0
g8_safety = "B"

assert math.isclose(g1_i, 2.0, rel_tol=1e-9)
assert math.isclose(g2_vout, 3.0, rel_tol=1e-6)
assert math.isclose(g3_pw, 2.5, rel_tol=1e-9)
assert g4_safety == "B"  # Mandatory [SAFETY] 100% required
assert math.isclose(g5_fc, 159.1549, abs_tol=1e-2)
assert math.isclose(g6_vl, 6000.0, rel_tol=1e-6)
assert math.isclose(g7_veff, 6.0, rel_tol=1e-9)
assert g8_safety == "B"  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $7/8$ overall AND $2/2$ ($100\%$) on `[SAFETY]` questions Q4 and Q8. Remediation: Q1–Q3 $\to$ `01-electronics.T1.01a`; Q4, Q8 $\to$ `01-electronics.T1.01c`; Q5–Q6 $\to$ `01-electronics.T1.01d`; Q7 $\to$ `01-electronics.T1.01b`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| MOSFET gets scorching hot at only $2\text{ A}$ | Used a standard $V_{GS(\text{th})} = 4\text{ V}$ MOSFET driven by a $3.3\text{ V}$ GPIO pin, leaving the FET only partially turned on in its high-resistance linear region. | Use a **logic-level** MOSFET rated for full $R_{DS(\text{on})}$ at $V_{GS} = 2.5\text{ V}$ or $3.3\text{ V}$, or use a dedicated gate driver / integrated H-bridge (`DRV8833`). |
| Motor jerks violently during MCU reset/flashing | Omitted the $10\text{ k}\Omega$ Gate-to-Source pull-down resistor. | Add a $10\text{ k}\Omega$ resistor directly between Gate and Source (`GND`). |
| Power supply current-limits immediately on PWM start | Both high-side and low-side switches in one H-bridge leg turned on simultaneously (shoot-through). | Insert dead-time between complementary PWM signals or use an H-bridge IC with internal shoot-through interlock. |

## 10. Resources
- **Texas Instruments — *Understanding Motor Driver Current Ratings and PWM Decay Modes* (`SLVA959` & `SLUA618`, `resources/textbooks-and-papers.md`):** Clear diagrams of H-bridge forward, reverse, brake, and coast states `[VERIFIED 2026-10-15]`.
- **Track 01 (`01-electronics-and-power/README.md`):** Directly continues into Step 1.2 (`01-electronics.T1.02`) `[VERIFIED 2026-10-15]`.

## 11. Next modules
- Proceed to legacy **Step 1.2 (`01-electronics.T1.02`)** in [`01-electronics-and-power/README.md`](../01-electronics-and-power/README.md#tier-1-beginner--intuitive).
