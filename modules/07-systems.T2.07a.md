---
id: 07-systems.T2.07a
title: "Regenerative Braking Shunt Choppers, CAN-FD CRC-16 + Rolling-Counter Watchdogs & SIL/HIL Fault Injection"
track: "07"
tier: 2
prereqs:
  - 01-electronics.T2.02
  - 04-embedded.T2.05
  - 06-robotics.T2.07
new_concepts:
  - regenerative_bus_energy_and_chopper_sizing
  - can_fd_crc16_and_rolling_counter_watchdog
  - sil_hil_fault_injection_verification
uses:
  - regenerative_braking_bus_voltage_surge
  - can_fd_mit_impedance_packet_packing
  - precharge_resistor_inrush_and_tvs_clamp
est_hours: 4.5
hardware_required: false
safety_level: high
resources_verified: true
verification: ci-native
---

## 1. Why it matters
This is the dedicated Track 07 Tier 2 bridge module before Step 2.8 (`07-systems.T2.08`, the Tier 2 Boss Capstone). When your custom 4-layer $24\text{ V}/15\text{ A}$ CAN-FD servo (`01-electronics.T2.02` + `04-embedded.T2.05`) decelerates a heavy link or Furuta pendulum arm rapidly (`06-robotics.T2.07`), the motor acts as a generator and pumps kinetic energy back into the DC bus. Because bench power supplies have series output protection diodes and cannot sink reverse current, an unclamped stop from $30\text{ rad/s}$ spikes a $24\text{ V}$ bus above $160\text{ V}$ in milliseconds! Before running the Tier 2 Boss Capstone, you must size an **active hysteretic shunt brake chopper** (`MOSFET + power resistor`), protect every CAN-FD command frame with a **CRC-16 checksum, 4-bit rolling counter, and hardware Window Watchdog (`WWDG`) timeout**, and verify fault recovery via **Software/Hardware-in-the-Loop (SIL/HIL) fault injection**. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Three systems-engineering barriers separate a benchtop demo from an industrial-grade custom servo drive:
- **Regenerative Braking & Active Shunt Brake Chopper:** When torque $\tau$ and velocity $\omega$ have opposite signs ($P_{\text{mech}} = \tau\omega < 0$), the motor converts mechanical kinetic energy $E_k = \frac{1}{2}J\omega_0^2$ into electrical charge on the DC bus capacitor $C_{\text{bus}}$. Without a return path, capacitor energy $\frac{1}{2}C_{\text{bus}}(V_{\text{peak}}^2 - V_{\text{nom}}^2) = \eta E_k$ forces $V_{\text{peak}}$ to skyrocket. An **active shunt brake chopper** places a low-side MOSFET + power resistor $R_{\text{brake}}$ across the DC bus: a hardware comparator or ADC watchdog turns the MOSFET ON whenever $V_{\text{bus}} \ge V_{\text{on}}$ (e.g. $27.5\text{ V}$) and OFF when $V_{\text{bus}} \le V_{\text{off}}$ ($25.5\text{ V}$), burning the regenerated kinetic energy safely as heat in $R_{\text{brake}}$!
- **CAN-FD End-to-End Integrity (`CRC-16` + `4-Bit Rolling Counter` + `Window Watchdog`):** What if a loose connector freezes the last `MIT Mode` torque packet in a buffer (`stale data`), or EMI flips bits on the bus? Every command frame adds an application-layer **4-bit rolling counter** (`0..15` incrementing by $+1 \pmod{16}$ each tick) plus a **16-bit CRC**, monitored by a hardware **Window Watchdog (`WWDG`)** that trips to zero-torque damping if $> N_{\text{miss}}$ consecutive frames arrive late or corrupted.
- **SIL/HIL Fault Injection Matrix:** Never wait for an accidental crash to discover whether your over-voltage, encoder-open, or CAN-timeout handlers work! A **SIL/HIL Fault Injection Matrix** systematically injects each fault (open encoder SPI `MISO`, drop 5 consecutive CAN frames, inject a $+5\text{ V}$ bus surge) and verifies that the drive transitions to a safe state within its deterministic fault reaction time budget $t_{\text{react}} \le t_{\text{max}}$.

## 3. Formalization
1. **Unclamped Regenerative Voltage Surge & Shunt Brake Resistor Sizing:**
   - **Unclamped Peak Voltage:** When rotor inertia $J$ decelerates from $\omega_0$ to $0\text{ rad/s}$ with net regeneration efficiency $\eta \in (0, 1]$ into bus capacitance $C_{\text{bus}}$ starting at $V_{\text{nom}}$:

$$
\Delta E_{\text{regen}} = \eta \left(\frac{1}{2} J \omega_0^2\right), \qquad V_{\text{bus,unclamped}} = \sqrt{V_{\text{nom}}^2 + \frac{2 \, \Delta E_{\text{regen}}}{C_{\text{bus}}}}
$$

   - **Maximum Brake Resistor Bound:** To absorb peak regenerative power $P_{\text{regen,peak}} = \eta |\tau_{\max} \omega_0|$ while keeping the bus clamped at or below $V_{\text{clamp}}$, the shunt brake resistor $R_{\text{brake}}$ must dissipate at least $P_{\text{regen,peak}}$ at voltage $V_{\text{clamp}}$:

$$
P_{\text{chopper}} = \frac{V_{\text{clamp}}^2}{R_{\text{brake}}} \ge P_{\text{regen,peak}} \implies R_{\text{brake}} \le \frac{V_{\text{clamp}}^2}{P_{\text{regen,peak}}}, \qquad I_{\text{brake,peak}} = \frac{V_{\text{clamp}}}{R_{\text{brake}}}
$$

2. **CAN-FD Rolling-Counter Continuity & Watchdog Timeout Budget:**
   - Given 4-bit counter $c_k \in \{0, \dots, 15\}$, the modular step difference between consecutive received frames is $\Delta c_k = (c_k - c_{k-1}) \bmod 16$. A valid sequential stream has $\Delta c_k = 1$; $\Delta c_k = 0$ indicates a **frozen/duplicate frame**, while $1 < \Delta c_k \le N_{\text{max-drop}}$ indicates $\Delta c_k - 1$ dropped frames.
   - For nominal frame period $T_{\text{cmd}}$ (e.g., $1.0\text{ ms}$) and maximum tolerated consecutive missed frames $N_{\text{miss}}$ (e.g., $3$), the watchdog timeout window is:

$$
T_{\text{wdg}} = N_{\text{miss}} \cdot T_{\text{cmd}}
$$

3. **SIL/HIL Fault-Injection Coverage & Safe Reaction Margin:**
   - Across a catalog of $F_{\text{total}}$ required fault modes (Over-Voltage, Over-Current, Encoder SPI CRC Loss, CAN Watchdog Timeout, Thermal $I^2t$ Derating), fault-injection coverage is $C_{\text{hil}} = F_{\text{passed}} / F_{\text{total}}$, and every fault $i$ must satisfy measured reaction latency $t_{\text{react},i} \le t_{\text{budget},i}$.

## 4. Worked example
Size a regenerative shunt brake chopper for a $24\text{ V}$ custom servo decelerating $J = 0.04\text{ kg}\cdot\text{m}^2$ from $\omega_0 = 30.0\text{ rad/s}$ ($\tau_{\max} = 8.0\text{ N}\cdot\text{m}, \eta = 0.75, C_{\text{bus}} = 1000\ \mu\text{F}$) so the bus stays clamped at $V_{\text{clamp}} = 28.0\text{ V}$, and verify the 4-bit rolling-counter + watchdog detector across normal, dropped, and frozen CAN-FD frames.

```python
import math

# 1. Unclamped regenerative voltage surge vs Active Shunt Brake Chopper sizing:
V_nom, V_clamp = 24.0, 28.0
J_kgm2, omega0_rads, tau_max_nm, eta = 0.04, 30.0, 8.0, 0.75
C_bus_f = 1000e-6

E_regen_j = eta * 0.5 * J_kgm2 * (omega0_rads ** 2)  # 13.5 J
V_unclamped = math.sqrt(V_nom**2 + (2.0 * E_regen_j) / C_bus_f)
P_regen_peak_w = eta * tau_max_nm * omega0_rads      # 180.0 W
R_brake_max_ohm = (V_clamp ** 2) / P_regen_peak_w    # 4.3556 Ohm -> select 4.0 Ohm power resistor!
R_brake_sel_ohm = 4.0
I_brake_peak_a = V_clamp / R_brake_sel_ohm           # 7.0 A

assert math.isclose(E_regen_j, 13.5, rel_tol=1e-9)
assert math.isclose(V_unclamped, math.sqrt(27576.0), rel_tol=1e-9)  # 166.06 V!
assert math.isclose(P_regen_peak_w, 180.0, rel_tol=1e-9)
assert R_brake_sel_ohm <= R_brake_max_ohm
assert math.isclose(I_brake_peak_a, 7.0, rel_tol=1e-9)

# 2. CAN-FD 4-bit rolling counter (mod 16) & watchdog timeout check:
def check_rolling_counter(prev_c: int, curr_c: int, max_drop: int = 2) -> str:
    delta = (curr_c - prev_c) % 16
    if delta == 1:
        return "OK"
    if delta == 0:
        return "FAULT_FROZEN"
    if delta - 1 <= max_drop:
        return f"WARN_DROPPED_{delta - 1}"
    return "FAULT_SEQ_JUMP"

assert check_rolling_counter(15, 0) == "OK"              # Clean wrap 15 -> 0
assert check_rolling_counter(4, 4) == "FAULT_FROZEN"     # Duplicate/stale frame
assert check_rolling_counter(4, 6) == "WARN_DROPPED_1"   # Counter 5 was lost (1 drop)
assert check_rolling_counter(4, 10) == "FAULT_SEQ_JUMP"  # 5 drops > max_drop=2
print(f"V_unclamped={V_unclamped:.1f} V, R_brake_max={R_brake_max_ohm:.2f} Ohm, I_brake={I_brake_peak_a:.1f} A")
```
Expected output:
```text
V_unclamped=166.1 V, R_brake_max=4.36 Ohm, I_brake=7.0 A
```

## 5. Exercise
A $48.0\text{ V}$ actuator bus ($C_{\text{bus}} = 500\ \mu\text{F}$) absorbs $\Delta E_{\text{regen}} = 6.648\text{ J}$ of net regenerative braking energy with peak regenerative power $P_{\text{regen,peak}} = 250.0\text{ W}$, and the active brake chopper clamps at $V_{\text{clamp}} = 52.0\text{ V}$. Compute (a) the unclamped peak bus voltage $V_{\text{bus,unclamped}} = \sqrt{48.0^2 + \frac{2 \times 6.648}{500 \times 10^{-6}}}$ in Volts ($\text{V}$), and (b) the maximum allowable brake resistance $R_{\text{brake,max}} = \frac{V_{\text{clamp}}^2}{P_{\text{regen,peak}}}$ in Ohms ($\Omega$). Verify $V_{\text{bus,unclamped}} = 170.0\text{ V}$ and $R_{\text{brake,max}} = 10.816\ \Omega$.
- **If your result differs:** Check that $48.0^2 = 2304$ and $\frac{2 \times 6.648}{0.0005} = 26{,}592$, so $\sqrt{2304 + 26592} = \sqrt{28896} = 170.0\text{ V}$, and $52.0^2 / 250.0 = 2704.0 / 250.0 = 10.816\ \Omega$.

### Graded package - the elbow as a regenerative load
[`exercises/07-systems.T2.07a/`](../exercises/07-systems.T2.07a/) turns this section into a test. `starter.py` holds seven holes: `regen_energy_j` (efficiency included), `unclamped_bus_v` (the square-root form), `brake_resistor_max_ohm` (an **upper bound**, not a target), `brake_peak_current_a`, `rolling_counter_status` (modular, so $15 \to 0$ is a normal step), `watchdog_timeout_s` and `hil_coverage`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/07-systems.T2.07a/starter.py \
  python3 -m unittest discover -s exercises/07-systems.T2.07a -p 'test_*.py'
```

The tests are behavioural: the worked $13.5\text{ J}$ and $166.06\text{ V}$; the resistor bound of $4.3556\ \Omega$ with $4.0$ inside it and $4.5$ outside; every counter outcome including the rollover and a three-frame jump; the watchdog as **frames times period**; and the HIL ratio with a refusal for an empty catalog. Four planted faults - `regen_no_eta`, `bus_linear`, `counter_plain_delta`, `watchdog_uses_period` - each fail the test named for them. The transfer suite sizes the chopper from the **shared plant**: the elbow is spun up under `plant.TAU_LIMIT`, its measured kinetic energy drives the bus surge past $28\text{ V}$, the resistor bound is tight at the peak, and the rolling counter runs over the plant's 1 kHz frame cadence, where a frame dropped every seven is a `WARN_DROPPED_1` and a stuck transmitter is a `FAULT_FROZEN`.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) ($\mu\text{F}$, Joules & Watts), [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (Rotational Kinetic Energy $\frac{1}{2}J\omega^2$), and [`01-electronics.T1.01d`](01-electronics.T1.01d.md) (Capacitor Energy $\frac{1}{2}C V^2$).
  - **Prerequisite Bridge Modules:** [`01-electronics.T2.02`](../01-electronics-and-power/README.md), [`04-embedded.T2.05`](../04-embedded-and-realtime/README.md), and [`06-robotics.T2.07`](../06-robotics-and-autonomy/README.md).
  - **Core Concepts to Review First:** Regenerative braking bus voltage rise $V_{\text{bus,unclamped}} = \sqrt{V_{\text{nom}}^2 + \frac{2\Delta E_{\text{regen}}}{C_{\text{bus}}}}$ and active brake chopper resistor sizing $R_{\text{brake,max}} = \frac{V_{\text{clamp}}^2}{P_{\text{regen,peak}}}$, CAN-FD CRC-16 + rolling counter watchdogs, and SIL/HIL fault injection in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI SLLA325 (Managing Regenerative Energy in BLDC Drives)](https://www.ti.com/lit/pdf/slla325) and [Track 07 Tier 2 (`07-systems-hil-and-production/README.md`)](../07-systems-hil-and-production/README.md#tier-2-intermediate--applied) (**Tab 5: URDF / MuJoCo & STO**).

## 6. Simulation path
Open **Tab 5 (URDF / MuJoCo Digital Twin & Fault Injection)** and **Tab 8 (CAN Framing & Watchdog)** in the MechaLab Workbench (`npm run dev`) to test regenerative braking bus clamping and fault injection recovery before connecting physical Tier 2 hardware.

The graded package is also a workbench entry: **Modules -> `EX.07-systems.T2.07a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.
```text
[Regen Braking: tau*omega < 0] ==> [V_bus >= 27.5 V Comparator/ADC] ==> [Shunt Chopper MOSFET + 4.0 Ohm Resistor]
[CAN-FD Command Stream 1 kHz]  ==> [CRC-16 + 4-Bit Counter + 3 ms WDG] ==> [Fault Latch: Pure Viscous Damping]
```
Pass/fail verification in simulation: `V_unclamped == 166.06 V` without chopper vs $\le 28.0\text{ V}$ with $4.0\ \Omega$ chopper, and `check_rolling_counter(15, 0) == "OK"`.

### Safety notes
- **Hazard:** Regenerative over-voltage capacitor explosion ($>160\text{ V}$ spike on a $24\text{ V}$ bus during fast deceleration), exposed hot brake-chopper power resistors ($>150^\circ\text{C}$ under repetitive braking), and runaway actuator motion on stale CAN-FD commands.
- **Mitigation:** Always verify the shunt brake chopper threshold ($V_{\text{on}} = 27.5\text{ V}$) with an adjustable bench supply before commanding high-speed deceleration, mount the wirewound brake resistor in an insulated heatsink cage with software $I^2t$ duty-cycle derating, and enforce a $3\text{ ms}$ hardware watchdog timeout that disables PWM or switches to passive damping on missed CAN frames.


```mermaid
flowchart LR
    A["07-systems.T2.07a: regenerative_bus_energy_and_chopper_sizing"] --> B["can_fd_crc16_and_rolling_counter_watchdog"]
    B --> C["sil_hil_fault_injection_verification"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 2.8 (`07-systems.T2.08`).

### Skip test
1. `[Recall] [Concept: regenerative_bus_energy_and_chopper_sizing]` Compute the maximum brake resistor value $R_{\text{brake,max}} = \frac{V_{\text{clamp}}^2}{P_{\text{regen,peak}}}$ in Ohms ($\Omega$, tolerance $\pm 10^{-6}\ \Omega$) required to dissipate $P_{\text{regen,peak}} = 200.0\text{ W}$ at a clamping voltage of $V_{\text{clamp}} = 30.0\text{ V}$.
2. `[Apply] [Concept: regenerative_bus_energy_and_chopper_sizing]` Compute the peak unclamped DC bus voltage $V_{\text{peak}} = \sqrt{V_{\text{nom}}^2 + \frac{2 \, \Delta E_{\text{regen}}}{C_{\text{bus}}}}$ in Volts ($\text{V}$, tolerance $\pm 10^{-6}\text{ V}$) when $\Delta E_{\text{regen}} = 3.0\text{ J}$ is dumped into a $C_{\text{bus}} = 1000\ \mu\text{F}$ ($0.001\text{ F}$) bus starting at $V_{\text{nom}} = 20.0\text{ V}$.
3. `[Transfer] [Concept: can_fd_crc16_and_rolling_counter_watchdog]` A $1\text{ kHz}$ ($T_{\text{cmd}} = 1.0\text{ ms}$) CAN-FD actuator node triggers a watchdog fault after $N_{\text{miss}} = 4$ consecutive missed frames, and its 4-bit rolling counter wraps modulo $16$ from $c_{k-1} = 14$ to $c_k = 1$. Compute the number of dropped frames $\Delta_{\text{dropped}} = ((c_k - c_{k-1}) \bmod 16) - 1$ between $c_{k-1}=14$ and $c_k=1$ (exact integer, tolerance $\pm 0$).
4. `[Spaced review -> 01-electronics.T2.01b — Concept: precharge_resistor_inrush_and_tvs_clamp] [Concept: sil_hil_fault_injection_verification]` Why does a bench power supply fail to prevent DC bus over-voltage during rapid motor deceleration, requiring an active shunt brake chopper on the inverter PCB?
   - **A.** Because bench power supplies have series output protection diodes/transistors that only source positive current and cannot sink reverse regenerative current from the motor.
   - **B.** Because bench power supplies have infinite capacitance.
   - **C.** Because motors absorb electrical energy during braking.
   - **D.** Because CAN-FD cables carry the braking energy back to the laptop.

**Answer key:**
```python
import math

q1_rbrake_ohm = (30.0 ** 2) / 200.0
q2_vpeak_v = math.sqrt(20.0**2 + (2.0 * 3.0) / 0.001)
q3_dropped = ((1 - 14) % 16) - 1
q4_choice = "A"

assert math.isclose(q1_rbrake_ohm, 4.5, rel_tol=1e-9)
assert math.isclose(q2_vpeak_v, 80.0, rel_tol=1e-9)
assert q3_dropped == 2
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, Q2, or Q4, study `## 3. Formalization` item 1; if you missed Q3, study `## 3. Formalization` item 2. On pass, proceed to `## 10. Next modules`.

### Gate test
Covers the Track 07 Tier 2 bridge ladder (`07-systems.T2.07a`) and cross-domain integration prerequisites before Step 2.8 (`07-systems.T2.08`, Tier 2 Boss Capstone):
1. `[Concept: regenerative_bus_energy_and_chopper_sizing]` Compute the net regenerated energy $\Delta E_{\text{regen}} = \eta \left(\frac{1}{2} J \omega_0^2\right)$ in Joules ($\text{J}$, tolerance $\pm 10^{-9}\text{ J}$) when a link of inertia $J = 0.05\text{ kg}\cdot\text{m}^2$ brakes from $\omega_0 = 20.0\text{ rad/s}$ to rest with regeneration efficiency $\eta = 0.80$.
2. `[Concept: regenerative_bus_energy_and_chopper_sizing]` Compute the peak current $I_{\text{brake}} = V_{\text{clamp}} / R_{\text{brake}}$ in Amperes ($\text{A}$, tolerance $\pm 10^{-9}\text{ A}$) flowing through an $R_{\text{brake}} = 5.0\ \Omega$ shunt brake resistor when the chopper MOSFET turns ON at $V_{\text{clamp}} = 27.5\text{ V}$.
3. `[Concept: regenerative_bus_energy_and_chopper_sizing]` If the hysteretic brake chopper turns ON at $V_{\text{on}} = 28.0\text{ V}$ and turns OFF at $V_{\text{off}} = 26.0\text{ V}$, compute the hysteresis band width $\Delta V_{\text{hyst}} = V_{\text{on}} - V_{\text{off}}$ in Volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
4. `[Concept: can_fd_crc16_and_rolling_counter_watchdog]` A CAN-FD actuator expects $500\text{ Hz}$ command packets ($T_{\text{cmd}} = 2.0\text{ ms}$) and latches a communication timeout fault after $N_{\text{miss}} = 3$ consecutive missed packets. Compute the watchdog timeout window $T_{\text{wdg}} = N_{\text{miss}} \cdot T_{\text{cmd}}$ in milliseconds ($\text{ms}$, tolerance $\pm 10^{-9}\text{ ms}$).
5. `[Concept: can_fd_crc16_and_rolling_counter_watchdog]` Why must safety-critical CAN-FD actuator frames include **both** a 16-bit CRC and a 4-bit rolling counter (`0..15`), rather than relying on the CRC alone?
   - **A.** A valid CRC only proves the bytes were not corrupted in transit; the rolling counter detects **frozen/stale buffer replay** (where a crashed host repeatedly transmits the exact same valid packet with a valid CRC) and counts dropped frames.
   - **B.** The 4-bit rolling counter doubles the CAN bus voltage.
   - **C.** CRC-16 only works on odd-numbered days.
   - **D.** Rolling counters replace termination resistors.
6. `[Concept: sil_hil_fault_injection_verification]` Across $F_{\text{total}} = 8$ mandatory Tier 2 HIL fault-injection tests, your drive passes $F_{\text{passed}} = 8$ within the reaction budget. If the allowed over-current reaction budget is $t_{\text{budget}} = 50.0\ \mu\text{s}$ and the measured hardware comparator trip time is $t_{\text{react}} = 1.5\ \mu\text{s}$, compute the safety timing margin $t_{\text{margin}} = t_{\text{budget}} - t_{\text{react}}$ in microseconds ($\mu\text{s}$, tolerance $\pm 10^{-9}\ \mu\text{s}$).
7. `[Concept: sil_hil_fault_injection_verification]` What is the safest fallback action for a backdrivable QDD robot joint (`MIT Mode`) when the CAN-FD command watchdog times out during a fast swing?
   - **A.** Immediately zero the feedforward torque and position stiffness ($K_p = 0, \tau_{\text{ff}} = 0$) and apply pure passive/viscous damping ($\tau = -K_{d,\text{safe}} \dot{q}$) before asserting Safe Torque Off once velocity decays near zero.
   - **B.** Hold the last commanded torque $\tau_{\text{ff}}$ forever at $100\%$ duty cycle.
   - **C.** Command maximum positive current to test the power supply.
   - **D.** Reboot the microcontroller while leaving the gate driver latched ON.
8. `[Concept: sil_hil_fault_injection_verification]` In the Tier 2 Boss Capstone (`07-systems.T2.08`), why do we validate the LQR / Cartesian impedance controller against the URDF/MuJoCo digital twin (`validate_models.py`) *before* enabling the physical $24\text{ V}$ custom 4-layer PCB?
   - **A.** To verify sign conventions, inertia/gravity scaling, LQR gain stability, and watchdog fault recovery in zero-risk simulation before applying power to custom hardware.
   - **B.** Because MuJoCo automatically solders SMD components onto the PCB.
   - **C.** Because physical encoders only work after MuJoCo deletes the firmware.
   - **D.** To bypass the 10-step bring-up checklist.

**Gate answer key:**
```python
import math

g1_eregen_j = 0.80 * 0.5 * 0.05 * (20.0 ** 2)
g2_ibrake_a = 27.5 / 5.0
g3_vhyst_v = 28.0 - 26.0
g4_twdg_ms = 3.0 * 2.0
g5_choice = "A"
g6_margin_us = 50.0 - 1.5
g7_choice = "A"
g8_choice = "A"

assert math.isclose(g1_eregen_j, 8.0, rel_tol=1e-9)
assert math.isclose(g2_ibrake_a, 5.5, rel_tol=1e-9)
assert math.isclose(g3_vhyst_v, 2.0, rel_tol=1e-9)
assert math.isclose(g4_twdg_ms, 6.0, rel_tol=1e-9)
assert g5_choice == "A"
assert math.isclose(g6_margin_us, 48.5, rel_tol=1e-9)
assert g7_choice == "A"
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q3 $\to$ `## 3. Formalization` item 1; Q4–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3 & `06-robotics.T2.06b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Brake chopper MOSFET chatters at $50\text{ kHz}$ and overheats around the trip threshold | Used a zero-hysteresis threshold ($V_{\text{on}} = V_{\text{off}} = 27.5\text{ V}$), so the bus voltage bounces up and down across the threshold on every microsecond. | Implement a Schmitt-trigger hysteresis band ($V_{\text{on}} = 27.5\text{ V}, V_{\text{off}} = 25.5\text{ V}$) so the chopper stays cleanly ON until the bus discharges by $2\text{ V}$. |
| Shunt brake resistor smokes during continuous oscillatory trajectory tracking | Sized the resistor's Ohm value for peak power ($4\ \Omega$) but used a tiny $5\text{ W}$ resistor without software $I^2t$ duty-cycle protection. | Use a chassis-mounted $50\text{–}100\text{ W}$ aluminum-housed wirewound resistor and track cumulative chopper ON-time in software to derate speed if average braking power exceeds the continuous rating. |
| CAN-FD watchdog triggers false timeouts when the rolling counter wraps from `15` to `0` | Computed signed subtraction `curr_c - prev_c` (`0 - 15 = -15`) instead of unsigned modulo-16 arithmetic `(curr_c - prev_c) & 0x0F`. | Always compute `(curr_c - prev_c) & 0x0F == 1` so `15 -> 0` evaluates to `(-15) & 0x0F = 1`. |

## 9. Resources
- **ODrive Hardware Docs & TI SLLA325 — *Managing Regenerative Energy in Brushless DC Motor Drives* (`07-systems-hil-and-production/README.md`):** Bus capacitor energy balance and hysteretic brake chopper resistor sizing `[VERIFIED 2026-10-15]`.
- **Track 07 & Track 08 (`07-systems-hil-and-production/README.md`, `08-capstone-projects/README.md`):** Directly prepares for Step 2.8 (`07-systems.T2.08`, Tier 2 Boss Capstone) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 2.8 (`07-systems.T2.08`, Tier 2 Boss Capstone)** in [`07-systems-hil-and-production/README.md`](../07-systems-hil-and-production/README.md#tier-2-intermediate--applied) and [`08-capstone-projects/README.md`](../08-capstone-projects/README.md#tier-2-capstone-builds-intermediate--applied-pass).
