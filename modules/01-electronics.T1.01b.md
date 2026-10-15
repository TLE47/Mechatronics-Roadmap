---
id: 01-electronics.T1.01b
title: "Capacitors, Inductors, Flyback Diodes, MOSFETs as Switches, PWM & H-Bridge Basics"
track: "01"
tier: 1
prereqs:
  - 01-electronics.T1.01a
  - 00-foundations.T1.01
new_concepts:
  - capacitor_inductor_vi_relations
  - flyback_diode_inductive_clamp
  - mosfet_pwm_h_bridge_topology
uses:
  - ohms_law_and_joule_power
  - kirchhoff_kvl_kcl_and_dividers
  - rc_cutoff_phase_lag
est_hours: 4.5
---

## 0. Skip Test
Pass without reading if you can answer both without looking anything up:
1. Why does turning off a MOSFET in series with an inductive motor coil without a freewheeling/flyback path destroy the MOSFET instantly?
   - **Check:** An inductor resists sudden changes in current ($V_L = L \frac{dI}{dt}$); opening the switch makes $\frac{dI}{dt}$ huge, producing a voltage spike of hundreds of volts that avalanches the MOSFET.
2. What is "shoot-through" in a 4-MOSFET H-bridge, and how does dead-time prevent it?
   - **Check:** Shoot-through occurs when both the high-side and low-side MOSFETs in the same half-bridge leg conduct simultaneously, shorting $V_{\text{bus}}$ directly to $\text{GND}$. Dead-time inserts a brief delay where both switches are off during transitions.

## 1. Why This Matters
Step 1.2 (`01-electronics.T1.02`) jumps straight into DRV8833 H-bridge slow-decay vs. fast-decay circulating currents, bulk vs. ceramic decoupling capacitors, and ground bounce. This module gives you the physical building blocks first: how capacitors store voltage ($I = C\frac{dV}{dt}$), how motor inductances store current ($V = L\frac{dI}{dt}$), why opening an inductive switch requires a flyback recirculation diode, and how four MOSFET switches form a reversible PWM H-bridge.

## 2. Mental Model
1. **Capacitors vs. Inductors (Dual Energy Stores):**
   - **Capacitor ($I_C = C\frac{dV_C}{dt}$):** Resists sudden changes in **voltage**. Placed right across a driver's power pins (`VM` to `GND`), a decoupling capacitor supplies instant current spikes locally so supply voltage does not droop.
   - **Inductor ($V_L = L\frac{dI_L}{dt}$):** Resists sudden changes in **current**. Every motor winding is an inductor; if you try to stop current in $100\text{ ns}$, $L\frac{dI}{dt}$ spikes to destructive voltages unless you provide a closed path (a flyback diode or secondary MOSFET) for current to keep flowing.
2. **MOSFET as a Voltage-Controlled Switch & PWM:**
   Driving the Gate-to-Source voltage $V_{GS}$ above threshold turns a MOSFET fully ON with low on-resistance $R_{DS(\text{on})}$ (milliohms). Switching between $100\%$ ON and $100\%$ OFF at $20\text{ kHz}$ with duty cycle $D \in [0, 1]$ applies an average voltage $V_{\text{avg}} = D \cdot V_{\text{bus}}$ while wasting minimal heat in the switch.
3. **The 4-Switch H-Bridge:**
   Two half-bridge legs (`Q1/Q2` on Left, `Q3/Q4` on Right) surround the motor. Closing `Q1` (High-Left) + `Q4` (Low-Right) drives current Left-to-Right (Forward); closing `Q3` (High-Right) + `Q2` (Low-Left) reverses current across the motor using a single positive supply rail.

## 3. Worked Example
A $12\text{ V}$ H-bridge with MOSFETs of $R_{DS(\text{on})} = 0.050\,\Omega$ each drives a DC motor winding ($L = 1.5\text{ mH}$, $R_m = 2.0\,\Omega$) at $D = 0.60$ duty cycle and steady average current $I = 2.5\text{ A}$ at $f_{\text{PWM}} = 20\text{ kHz}$ ($T = 50\,\mu\text{s}$).
- **Step 1 (Average applied voltage):**
  $$V_{\text{avg}} = D \cdot V_{\text{bus}} = 0.60 \times 12.0\text{ V} = 7.20\text{ V}$$
- **Step 2 (Conduction power loss in the two active MOSFETs):**
  Current passes through one high-side and one low-side switch in series:
  $$P_{\text{cond}} = 2 \times I^2 R_{DS(\text{on})} = 2 \times (2.5)^2 \times 0.050 = 0.625\text{ W}$$
- **Step 3 (Peak-to-peak inductor current ripple during ON time $t_{\text{on}} = D T = 30\,\mu\text{s}$):**
  During the ON interval, the net voltage across $L$ is $V_{\text{bus}} - V_{\text{avg}} = 12.0 - 7.2 = 4.8\text{ V}$:
  $$\Delta I_{pp} = \frac{(V_{\text{bus}} - D V_{\text{bus}}) \cdot D T}{L} = \frac{4.8\text{ V} \times 30\times 10^{-6}\text{ s}}{1.5\times 10^{-3}\text{ H}} = 0.096\text{ A} \;(96.0\text{ mA})$$

## 4. Code
```python
import math

v_bus = 12.0
duty = 0.60
r_dson = 0.050
i_avg = 2.5
L_h = 1.5e-3
f_pwm = 20_000.0

v_avg = duty * v_bus
p_cond_w = 2.0 * (i_avg**2) * r_dson
delta_i_pp = ((v_bus * (1.0 - duty)) * (duty / f_pwm)) / L_h

assert math.isclose(v_avg, 7.20, rel_tol=1e-9)
assert math.isclose(p_cond_w, 0.625, rel_tol=1e-9)
assert math.isclose(delta_i_pp, 0.096, rel_tol=1e-9)
print(f"V_avg={v_avg:.2f} V, P_cond={p_cond_w:.3f} W, dI_pp={delta_i_pp*1e3:.1f} mA")
```
Expected output:
```text
V_avg=7.20 V, P_cond=0.625 W, dI_pp=96.0 mA
```

## 5. Exercise
If you lower the PWM switching frequency from $20\text{ kHz}$ down to $2\text{ kHz}$ on the same $1.5\text{ mH}$ motor at $D = 0.50$ and $V_{\text{bus}} = 12.0\text{ V}$, calculate the new peak-to-peak inductor current ripple $\Delta I_{pp}$.
- **Check:** $\Delta I_{pp} = \frac{12.0 \times 0.50 \times 0.50}{1.5\times 10^{-3} \times 2000} = 1.00\text{ A}$ (a $10\times$ larger ripple that causes loud $2\text{ kHz}$ acoustic whine and extra motor heating).

## 6. Gate Test
1. Which component variable cannot jump instantaneously in a physical circuit: the voltage across a capacitor, or the current through an inductor? (Answer: Neither! Capacitor voltage $V_C$ and inductor current $I_L$ are both energy-storing state variables that must change continuously.)
2. In an H-bridge with High-Left (`Q1`), Low-Left (`Q2`), High-Right (`Q3`), and Low-Right (`Q4`), which pair of switches must NEVER be turned ON at the same time? (Answer: `Q1`+`Q2` on the left leg, or `Q3`+`Q4` on the right leg, as either pair shorts $V_{\text{bus}}$ directly to ground.)

## 7. Resources
- **Mohan, Undeland & Robbins — *Power Electronics*:** Switching converters, inductive freewheeling paths, and H-bridge DC drives (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 01 (`01-electronics-and-power/README.md`):** Directly prepares for Step 1.2 (`01-electronics.T1.02`) DRV8833 decay modes and star grounding `[VERIFIED 2026-10-15]`.
