---
id: 03-sensors.T1.03a
title: "Electromagnets, Permanent Magnets, Pole Pairs, Quadrature Pulses & Faraday Back-EMF"
track: "03"
tier: 1
prereqs:
  - 01-electronics.T1.02
new_concepts:
  - lorentz_force_and_back_emf_constants
  - mechanical_vs_electrical_angle_pole_pairs
  - quadrature_ab_gray_code_direction
uses:
  - voltage_current_resistance_ohms_law
  - radians_unit_circle_and_atan2
  - pwm_duty_cycle_effective_voltage
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the bridge module before Step 1.4 (`03-sensors.T1.04`). Every electric motor is simultaneously an actuator ($\tau = K_t i$) and a generator ($v_{\text{bemf}} = K_e \omega_m$), every brushless motor has $p$ magnetic **pole pairs** that make its electrical phase spin $p$ times faster than its physical shaft ($\theta_e = p\theta_m$), and every incremental encoder determines rotation direction from two $90^\circ$-shifted pulse channels (`A` and `B`). Mastering these three ideas makes SimpleFOC and encoder feedback in Step 1.4 click immediately. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine a bicycle wheel with $p = 7$ pairs of North-South magnets glued around its rim, spinning past a stationary electromagnet coil on the frame. Every time the physical wheel turns by $1/7\text{th}$ of a revolution, a full North-South magnet pair sweeps past the coil—so the coil sees a complete $360^\circ$ ($2\pi\text{ rad}$) **electrical cycle** for every $1/7\text{th}$ of a **mechanical turn** ($\theta_e = p\theta_m$). When you push current $i$ into the coil, the magnetic push produces torque $\tau = K_t i$; conversely, as the magnets sweep past the coil at speed $\omega_m$, Faraday's law generates an opposing **Back-EMF voltage** $v_{\text{bemf}} = K_e \omega_m$ that fights the supply voltage (which is why a motor draws maximum stall current at $\omega_m = 0$ and less current as it speeds up!). Finally, to know which way the wheel is turning, a **quadrature encoder** places two optical or Hall sensors (`A` and `B`) a quarter-slot apart: if `A` rises before `B`, the wheel is spinning forward; if `B` rises before `A`, it is spinning backward.

## 3. Formalization
1. **Motor Torque Constant ($K_t$), Back-EMF Constant ($K_e$) & Steady-State DC Motor Equation:** In SI units ($\tau$ in $\text{N}\cdot\text{m}$, $i$ in $\text{A}$, $v_{\text{bemf}}$ in $\text{V}$, $\omega_m$ in $\text{rad/s}$), conservation of electromechanical power ($v_{\text{bemf}} i = \tau \omega_m$) guarantees $K_t = K_e$ ($\text{N}\cdot\text{m/A} \equiv \text{V}\cdot\text{s/rad}$):

$$
\tau = K_t i, \quad v_{\text{bemf}} = K_e \omega_m, \quad V_{\text{term}} = i R + K_e \omega_m
$$

   For a motor rated in $\text{KV}$ ($\text{RPM/V}$), $K_e = K_t = \frac{60}{2\pi \cdot \text{KV}}$ (for ideal phase-to-neutral scaling). Substituting $V_{\text{term}} = 12.0\text{ V}$, $R = 2.0\ \Omega$, $K_e = 0.05\text{ V}\cdot\text{s/rad}$, and $\omega_m = 100\text{ rad/s}$ gives $v_{\text{bemf}} = 5.0\text{ V}$ and current $i = (12.0 - 5.0)/2.0 = 3.5\text{ A}$.
2. **Pole Pairs ($p$) and Electrical vs. Mechanical Angle:** A rotor with $N_{\text{poles}} = 2p$ permanent magnets ($p$ North-South pole pairs) has electrical angle $\theta_e$ ($\text{rad}$) and electrical speed $\omega_e$ ($\text{rad/s}$):

$$
\theta_e = p \cdot \theta_m \pmod{2\pi}, \quad \omega_e = p \cdot \omega_m
$$

   Substituting $N_{\text{poles}} = 14$ ($p = 7$ pole pairs) and $\theta_m = \frac{\pi}{7}\text{ rad}$ gives $\theta_e = 7 \times \frac{\pi}{7} = \pi\text{ rad}$ ($180^\circ$ electrical).
3. **Quadrature `A`/`B` ($4\times$) Decoding & Angle Resolution:** An incremental encoder with $N_{\text{lines}}$ lines (cycles per revolution) produces $4$ quadrature edges (`00 -> 10 -> 11 -> 01 -> 00`) per line, yielding $\text{CPR} = 4 N_{\text{lines}}$ counts per mechanical revolution and angular resolution:

$$
\Delta\theta_{\text{rad}} = \frac{2\pi}{\text{CPR}} = \frac{2\pi}{4 N_{\text{lines}}}
$$

   Substituting $N_{\text{lines}} = 1024$ gives $\text{CPR} = 4096\text{ counts/rev}$ and $\Delta\theta_{\text{rad}} = \frac{2\pi}{4096} \approx 0.001534\text{ rad}$ ($0.0879^\circ$).

## 4. Worked example
**Predict first (before you run it):** The gimbal motor has $R = 4.0\ \Omega$ and $K_e = 0.06\text{ V}\cdot\text{s/rad}$ on a $12.0\text{ V}$ supply with $p = 7$ pole pairs, and the decode walks $(A, B)$ through five forward edges. Commit to four numbers before the block runs: (1) the stall current $I_{\text{stall}}$ in amperes; (2) the no-load speed $\omega_{\text{no-load}}$ in $\text{rad/s}$; (3) the electrical frequency $\omega_e$ at that speed; (4) the count the five-edge walk adds. Two tells that a wrong answer is a mistake rather than a surprise: $\omega_e$ must come out exactly $7\times$ the mechanical speed, so any other ratio means poles and pole pairs were confused; and a quadrature total of $10$ after five edges means both edges of each transition were counted, when each forward transition contributes exactly one count.

Compute the no-load speed $\omega_{\text{no-load}}$, stall current $I_{\text{stall}}$, electrical frequency $\omega_e$ for a $14$-pole ($p=7$) gimbal motor with $R = 4.0\ \Omega, K_e = 0.06\text{ V}\cdot\text{s/rad}$ driven at $V_{\text{term}} = 12.0\text{ V}$, and decode a sequence of quadrature $(A, B)$ state transitions.

```python
import math

V_term = 12.0
R = 4.0
Ke = 0.06
p = 7

i_stall = V_term / R
w_noload = V_term / Ke
we_noload = p * w_noload

# 4x Quadrature state transition table: (prev_AB, curr_AB) -> +1 or -1 count
QUAD_TABLE = {
    (0b00, 0b10): +1, (0b10, 0b11): +1, (0b11, 0b01): +1, (0b01, 0b00): +1,
    (0b00, 0b01): -1, (0b01, 0b11): -1, (0b11, 0b10): -1, (0b10, 0b00): -1,
}
states = [0b00, 0b10, 0b11, 0b01, 0b00, 0b10]  # 5 forward steps
count = sum(QUAD_TABLE.get((states[k], states[k + 1]), 0) for k in range(len(states) - 1))

assert math.isclose(i_stall, 3.0, rel_tol=1e-9)
assert math.isclose(w_noload, 200.0, rel_tol=1e-9)
assert math.isclose(we_noload, 1400.0, rel_tol=1e-9)
assert count == 5
print(f"I_stall={i_stall:.1f} A, w_noload={w_noload:.0f} rad/s, w_e={we_noload:.0f} rad/s, quad_count={count}")
```
Expected output:
```text
I_stall=3.0 A, w_noload=200 rad/s, w_e=1400 rad/s, quad_count=5
```

## 5. Exercise
A $2208$ gimbal BLDC motor has $12$ stator slots and $14$ rotor magnet poles (`12N14P`). Compute (a) the number of pole pairs $p = N_{\text{poles}} / 2$, (b) the mechanical angle $\theta_m$ in degrees corresponding to one full $360^\circ$ electrical cycle ($360^\circ / p$), and (c) the encoder angle resolution $\Delta\theta_{\text{deg}} = 360^\circ / 2^{14}$ of a 14-bit (`16384` counts/rev) `AS5048A` magnetic encoder. Verify $p = 7$, $\theta_m = 51.4286^\circ$ ($\pm 10^{-3}$), and $\Delta\theta_{\text{deg}} = 0.02197^\circ$ ($\pm 10^{-4}$).
- **If your result differs:** Remember that `12N14P` means `12` stator teeth and `14` rotor magnets ($7$ North + $7$ South), so $p = 14 / 2 = 7$ pole pairs (not $14$).

### Graded package - back-EMF, pole pairs and the quadrature count
[`exercises/03-sensors.T1.03a/`](../exercises/03-sensors.T1.03a/) turns this section into a test. `starter.py` holds eight holes: `back_emf` (`Ke * omega`), `winding_current` (`(V_term - Ke omega) / R`, negative when generating), `motor_torque`, `pole_pairs` (`N_poles / 2`, not `N_poles`), `electrical_angle` (wrapped into one electrical cycle), `quadrature_cpr` (`4 N_lines`), `angle_resolution` and `quad_step` (one bit per edge, and a two-bit jump is not a step). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/03-sensors.T1.03a/starter.py \
  python3 -m unittest discover -s exercises/03-sensors.T1.03a -p 'test_*.py'
```

**48 tests.** The exercise's $p = 7$, $51.4286^\circ$ and $0.02197^\circ$ are checked alongside the worked example's 3.0 A stall current, 200 rad/s no-load speed and 5-count quadrature walk, the Skip test's 2.4 A and 2000 CPR, and the Gate test's 0.36 N*m, 300 rad/s and wrapped 0.7168 rad. The transfer suite runs **the plant's own encoder and actuator**: its 12-bit AS5600 is exactly a 1024-line encoder decoded $4\times$ ($4096$ counts, $2\pi/4096$ rad per count), at the plant's 1 kHz tick a single count lasts only 1.534 rad/s of shaft speed while the module's 200 rad/s passes ~130 counts per tick, the plant's `wrap_pi` is the same angle as one pole pair, the $-0.15\text{ N}\cdot\text{m}$ disturbance pulse is 2.5 A of braking current inside the 3.0 A stall, and the 2.5 N*m clamp needs 41.7 A that a 12 V / 4 $\Omega$ winding cannot supply. Five planted faults - `winding_current_ignores_bemf`, `pole_pairs_counts_poles`, `electrical_angle_unwrapped`, `cpr_equals_lines`, `quad_step_accepts_a_two_bit_jump` - each fail the test named for them.

The package is also a workbench entry: **Modules -> `EX.03-sensors.T1.03a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (SI Units & RPM-to-$\text{rad/s}$), [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Radians & Trigonometry*), and [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Electromechanical Power*).
  - **Prerequisite Bridge Module:** [`01-electronics.T1.01b`](01-electronics.T1.01b.md) (*PWM H-Bridges*).
  - **Core Concepts to Review First:** Quadrature $4\times$ decoding ($\text{CPR} = 4 N_{\text{lines}}$), SI motor constant identity $K_t = K_e$, brushed DC torque-speed line $\tau(\omega) = \tau_{\text{stall}}(1 - \omega/\omega_{\text{no-load}})$, and BLDC electrical angle $\theta_e = N_p \theta_m$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [SimpleFOC BLDC & Encoder Theory Docs (`docs.simplefoc.com`)](https://docs.simplefoc.com/) and [Track 03 Tier 1 (`03-sensors-and-actuators/README.md`)](../03-sensors-and-actuators/README.md#tier-1-beginner--intuitive).

### Break it on purpose
Inject the `pole_pairs_counts_poles` fault the graded package names, and diagnose it from the angles alone:
- **Inject:** set $p = N_{\text{poles}} = 14$ instead of $p = N_{\text{poles}}/2 = 7$ in the electrical-angle and electrical-speed terms, leaving $R$, $K_e$ and $V_{\text{term}}$ untouched.
- **Symptom:** the no-load electrical frequency doubles from $1400\text{ rad/s}$ to $2800\text{ rad/s}$, and the rotor angle $\theta_m = \pi/7\text{ rad}$ from `## 3. Formalization` reports $\theta_e = 14\pi/7 = 2\pi\text{ rad}$, which wraps to $0$ instead of $\pi$: the current vector is a full magnet step away from where the rotor actually is.
- **Diagnose:** stall current and no-load speed still match, so the winding and the constants are fine; the error appears only once the shaft turns, which localises it to the angle-scaling factor rather than the electrical model. Fourteen magnets are seven North–South pairs, so one electrical cycle fits in $360^\circ/7 = 51.4286^\circ$ of shaft travel — the exercise's own answer — not in $25.7143^\circ$, and the reported angle collapsing to zero exactly where it should read $\pi$ is the half-step that gives it away.
- **Fix:** restore $p = N_{\text{poles}}/2 = 7$. Then $\omega_e = 7 \times 200 = 1400\text{ rad/s}$ and $\theta_m = \pi/7$ maps to $\theta_e = \pi\text{ rad}$, half an electrical cycle, where the five-edge walk still adds $5$ counts.

## 6. Simulation path
Open **Tab 3 (25 kHz PMSM FOC)** in the MechaLab Workbench (`npm run dev`) to see how mechanical rotor angle $\theta_m$ multiplies by pole pairs $p$ into electrical commutation angle $\theta_e = p\theta_m$.

No hardware required for this module (`hardware_required: false`). In Step 1.4 (`03-sensors.T1.04`), you can verify pole pairs $p$ on a real BLDC motor by Energizing Phase A to $+1.5\text{ V}$ (current-limited to $0.5\text{ A}$) and Phase B/C to $\text{GND}$, rotating the rotor by hand through one full $360^\circ$ mechanical turn, and counting the $p$ magnetic detent lock positions:
```text
[Bench PSU 1.5V, 0.5A Limit] ---> [Phase A (+) / Phases B,C (-)] ---> Count p=7 magnetic detents per 1 turn
```
Pass/fail verification in simulation: `i_stall == 3.0 A`, `w_noload == 200.0 rad/s`, `we_noload == 1400.0 rad/s`, and `count == 5`.


```mermaid
flowchart LR
    A["03-sensors.T1.03a: lorentz_force_and_back_emf_constants"] --> B["mechanical_vs_electrical_angle_pole_pairs"]
    B --> C["quadrature_ab_gray_code_direction"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 1.4 (`03-sensors.T1.04`).

### Skip test
1. `[Recall] [Concept: lorentz_force_and_back_emf_constants]` A DC motor with winding resistance $R = 2.5\ \Omega$ and back-EMF constant $K_e = 0.10\text{ V}\cdot\text{s/rad}$ spins at $\omega_m = 40.0\text{ rad/s}$ while driven from $V_{\text{term}} = 10.0\text{ V}$. Compute the winding current $i = (V_{\text{term}} - K_e\omega_m)/R$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: mechanical_vs_electrical_angle_pole_pairs]` A `24N28P` outrunner motor has $28$ permanent magnet poles ($14$ North, $14$ South). Compute its number of pole pairs $p$ and its electrical speed $\omega_e = p\omega_m$ in $\text{rad/s}$ when $\omega_m = 10.0\text{ rad/s}$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: quadrature_ab_gray_code_direction]` An optical quadrature encoder disc has $N_{\text{lines}} = 500$ lines per revolution and is decoded in $4\times$ quadrature mode (counting rising and falling edges of both channels `A` and `B`). Compute the total counts per mechanical revolution ($\text{CPR} = 4 N_{\text{lines}}$, exact integer, tolerance $\pm 0$).
4. `[Spaced review -> 01-electronics.T1.02 — Concept: voltage_current_resistance_ohms_law] [Concept: quadrature_ab_gray_code_direction]` Why does a quadrature encoder require **two** channels (`A` and `B` shifted by $90^\circ$ electrical) instead of a single pulse channel `A`?
   - **A.** Because a single channel can only count up to 100.
   - **B.** Because a single pulse channel tells you speed (edge rate) but cannot distinguish clockwise from counter-clockwise rotation when the motor reverses direction.
   - **C.** To double the supply voltage.
   - **D.** Because channel `B` carries power.

**Answer key:**
```python
import math

q1_current = (10.0 - 0.10 * 40.0) / 2.5
q2_p = 28 // 2
q2_we = q2_p * 10.0
q3_cpr = 4 * 500
q4_choice = "B"

assert math.isclose(q1_current, 2.4, rel_tol=1e-9)
assert q2_p == 14
assert math.isclose(q2_we, 140.0, rel_tol=1e-9)
assert q3_cpr == 2000
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2, study `## 3. Formalization` item 2; Q3 or Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.
### Gate test
Covers the complete Track 03 Tier 1 bridge ladder (`03-sensors.T1.03a`) before Step 1.4 (`03-sensors.T1.04`):
1. `[Concept: lorentz_force_and_back_emf_constants]` Compute the electromagnetic torque $\tau = K_t i$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$) produced by a motor with $K_t = 0.08\text{ N}\cdot\text{m/A}$ carrying $i = 4.5\text{ A}$.
2. `[Concept: lorentz_force_and_back_emf_constants]` Compute the theoretical no-load speed $\omega_{\text{no-load}} = V_{\text{term}} / K_e$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$) when $V_{\text{term}} = 24.0\text{ V}$ and $K_e = 0.08\text{ V}\cdot\text{s/rad}$ (ignoring friction).
3. `[Concept: lorentz_force_and_back_emf_constants]` Why does a DC or BLDC motor draw its highest current when stalled ($\omega_m = 0$) and much lower current when spinning fast under light load?
   - **A.** Because winding resistance $R$ increases by $100\times$ when spinning.
   - **B.** Because spinning generates opposing back-EMF $v_{\text{bemf}} = K_e \omega_m$, leaving less net voltage $(V_{\text{term}} - K_e\omega_m)$ to push current through $R$.
   - **C.** Because the battery disconnects at high speed.
   - **D.** Because inductance $L$ blocks DC current.
4. `[Concept: mechanical_vs_electrical_angle_pole_pairs]` For a motor with $p = 7$ pole pairs, compute the wrapped electrical angle $\theta_e = (p\theta_m) \bmod (2\pi)$ in radians (tolerance $\pm 10^{-6}$) when mechanical angle is $\theta_m = 1.0\text{ rad}$.
5. `[Concept: mechanical_vs_electrical_angle_pole_pairs]` How many full $2\pi$ electrical cycles occur during one full $2\pi$ mechanical revolution of a $p = 11$ pole-pair motor?
6. `[Concept: quadrature_ab_gray_code_direction]` Compute the angular resolution $\Delta\theta = \frac{2\pi}{4096}$ in radians (tolerance $\pm 10^{-6}$) of a 12-bit (`4096` CPR) encoder.
7. `[Concept: quadrature_ab_gray_code_direction]` In $4\times$ quadrature Gray code (`00 -> 10 -> 11 -> 01`), how many bits of `(A, B)` are allowed to change on a valid single-step edge transition?
8. `[Concept: quadrature_ab_gray_code_direction]` If a quadrature decoder observes an immediate jump from `00` to `11` (both bits flipped in one sample), what does that indicate?
   - **A.** Normal half-speed rotation.
   - **B.** An invalid/missed transition (glitch or sample rate too slow for the shaft speed).
   - **C.** Zero velocity.
   - **D.** Index pulse detected.

**Gate answer key:**
```python
import math

g1_tau = 0.08 * 4.5
g2_wnl = 24.0 / 0.08
g3_choice = "B"
g4_theta_e = math.fmod(7.0 * 1.0, 2.0 * math.pi)
g5_cycles = 11
g6_res_rad = (2.0 * math.pi) / 4096.0
g7_bits = 1
g8_choice = "B"

assert math.isclose(g1_tau, 0.36, rel_tol=1e-9)
assert math.isclose(g2_wnl, 300.0, rel_tol=1e-9)
assert g3_choice == "B"
assert math.isclose(g4_theta_e, 7.0 - 2.0 * math.pi, rel_tol=1e-6)
assert g5_cycles == 11
assert math.isclose(g6_res_rad, 0.00153398, abs_tol=1e-6)
assert g7_bits == 1
assert g8_choice == "B"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q3 $\to$ `## 3. Formalization` item 1; Q4–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Entered `14` instead of `7` as pole pairs in `BLDCMotor(14)` for a `12N14P` motor | Confused total magnet poles ($2p = 14$) with pole pairs ($p = 7$). | Divide the rotor magnet pole count (`14P`) by `2` to get pole pairs $p = 7$. |
| Encoder angle reads $4\times$ too small ($90^\circ$ after one full turn) | Used line count $N_{\text{lines}}$ instead of $4\times$ quadrature count $\text{CPR} = 4 N_{\text{lines}}$. | Rotate the shaft through one exact $360^\circ$ turn by hand against a mark and verify `count == CPR`. |
| Magnetic encoder (`AS5600`) reads erratic non-linear jumps | Used an axially magnetized disc magnet (North on top, South on bottom) instead of a **diametrically magnetized** magnet (North on left half, South on right half). | Always use a diametrically magnetized cylinder magnet centered $0.5\text{–}2\text{ mm}$ above the Hall sensor IC. |

## 9. Resources
- **Jacob Fraden — *Handbook of Modern Sensors* & SimpleFOC Docs (`docs.simplefoc.com`, `resources/open-source-toolchains.md`):** Practical guide to optical/magnetic encoders, pole pairs, and BLDC commutation `[VERIFIED 2026-10-15]`.
- **Track 03 (`03-sensors-and-actuators/README.md`):** Directly continues into Step 1.4 (`03-sensors.T1.04`) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 1.4 (`03-sensors.T1.04`)** in [`03-sensors-and-actuators/README.md`](../03-sensors-and-actuators/README.md#tier-1-beginner--intuitive).
