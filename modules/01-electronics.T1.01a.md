---
id: 01-electronics.T1.01a
title: "Voltage, Current, Resistance, Ohm's Law, KVL/KCL, Dividers & Multimeter Safety"
track: "01"
tier: 1
prereqs:
  - 00-foundations.T1.00c
  - 00-foundations.T1.00d
new_concepts:
  - ohms_law_and_joule_power
  - kirchhoff_kvl_kcl_and_dividers
  - multimeter_series_parallel_measurement
uses:
  - si_base_and_derived_units
  - scientific_notation_and_prefixes
  - linear_functions_and_slope
est_hours: 4.0
---

## 0. Skip Test
Pass without reading if you can answer both without looking anything up:
1. A $24\text{ V}$ battery feeds a resistive divider with $R_{\text{top}} = 68\text{ k}\Omega$ and $R_{\text{bot}} = 10\text{ k}\Omega$ connected to a microcontroller ADC pin. What is the ADC pin voltage $V_{\text{out}}$ and the power dissipated in $R_{\text{top}}$?
   - **Check:** $V_{\text{out}} = 24 \times \frac{10}{68 + 10} = 3.0769\text{ V}$, and $P_{\text{top}} = \frac{(24 - 3.0769)^2}{68000} = 6.438\text{ mW}$.
2. Why does touching a multimeter's leads across a battery while the leads are plugged into the $10\text{ A}$ current jack blow the meter fuse immediately?
   - **Check:** Current mode places an ultra-low-resistance shunt ($\approx 0.01\,\Omega$) between the leads, creating a direct short circuit across the battery.

## 1. Why This Matters
Every sensor interface, motor winding, and PCB trace obeys Ohm's Law and Kirchhoff's circuit laws. Before wiring the breadboard H-bridge and logic-level bus in Step 1.2 (`01-electronics.T1.02`), you must be able to calculate resistor voltage dividers to scale $12\text{ V}$ or $24\text{ V}$ supply rails safely down to $3.3\text{ V}$ ADC pins, size resistors so they do not burn up from $I^2 R$ heating, and measure voltage and current without shorting your bench supply.

## 2. Mental Model
1. **Voltage ($V$), Current ($I$), and Resistance ($R$):**
   - **Voltage ($V$, Volts):** Electrical potential difference (push/pressure) between two points. Voltage is always measured *across* two nodes with respect to a reference node called **Ground ($\text{GND} = 0\text{ V}$)**.
   - **Current ($I$, Amperes):** Flow rate of electric charge *through* a wire or component.
   - **Ohm's Law & Joule Heating:** $V = I R$, and electrical power turned into heat is $P = V I = I^2 R = \frac{V^2}{R}$.
2. **Kirchhoff's Laws & Voltage Dividers:**
   - **KCL (Current Law):** Current flowing into any junction equals current flowing out ($\sum I_{\text{in}} = \sum I_{\text{out}}$).
   - **KVL (Voltage Law):** Voltage drops around any closed loop sum to zero. For two resistors in series across $V_{\text{in}}$:
     $$V_{\text{out}} = V_{\text{in}} \frac{R_{\text{bot}}}{R_{\text{top}} + R_{\text{bot}}}$$
3. **Multimeter Rules:**
   - Measure **Voltage in parallel** (high internal impedance $\approx 10\text{ M}\Omega$).
   - Measure **Current in series** (break the wire so current flows through the meter's low-resistance shunt). Never touch a current-mode probe across a voltage source!

## 3. Worked Example
You want to monitor a $12.0\text{ V}$ motor battery using a $3.3\text{ V}$ microcontroller ADC pin with $R_{\text{top}} = 30\text{ k}\Omega$ and $R_{\text{bot}} = 10\text{ k}\Omega$.
- **Step 1 (Series current by KVL + Ohm's Law):**
  $$I = \frac{V_{\text{in}}}{R_{\text{top}} + R_{\text{bot}}} = \frac{12.0\text{ V}}{30000\,\Omega + 10000\,\Omega} = 0.0003\text{ A} = 0.30\text{ mA}$$
- **Step 2 (Output voltage at ADC pin):**
  $$V_{\text{out}} = I \times R_{\text{bot}} = 0.0003\text{ A} \times 10000\,\Omega = 3.00\text{ V} \le 3.3\text{ V (Safe!)}$$
- **Step 3 (Power dissipation check):**
  $$P_{\text{total}} = V_{\text{in}} I = 12.0\text{ V} \times 0.0003\text{ A} = 3.60\text{ mW} \ll 250\text{ mW (standard 1/4 W resistor rating)}$$

## 4. Code
```python
import math

def analyze_voltage_divider(v_in: float, r_top_ohm: float, r_bot_ohm: float) -> tuple[float, float, float]:
    i_amp = v_in / (r_top_ohm + r_bot_ohm)
    v_out = i_amp * r_bot_ohm
    p_total_mw = (v_in * i_amp) * 1e3
    return v_out, i_amp * 1e3, p_total_mw

v_out, i_ma, p_mw = analyze_voltage_divider(12.0, 30_000.0, 10_000.0)
assert math.isclose(v_out, 3.0, rel_tol=1e-9)
assert math.isclose(i_ma, 0.30, rel_tol=1e-9)
assert math.isclose(p_mw, 3.60, rel_tol=1e-9)
print(f"V_out={v_out:.2f} V, I={i_ma:.2f} mA, P={p_mw:.2f} mW")
```
Expected output:
```text
V_out=3.00 V, I=0.30 mA, P=3.60 mW
```

## 5. Exercise
An LED requires $V_{\text{LED}} = 2.0\text{ V}$ at $I = 10\text{ mA}$ when powered from a $5.0\text{ V}$ rail. Calculate the series current-limiting resistor $R$ and the power $P_R$ dissipated in the resistor.
- **Check:** $R = \frac{5.0 - 2.0}{0.010} = 300\,\Omega$ and $P_R = (0.010)^2 \times 300 = 30.0\text{ mW}$.

## 6. Gate Test
1. What happens to the output voltage of a $30\text{ k}\Omega / 10\text{ k}\Omega$ divider if you accidentally connect a heavy $100\,\Omega$ load across $R_{\text{bot}}$? (Answer: The parallel combination $10\text{ k}\Omega \parallel 100\,\Omega \approx 99\,\Omega$ collapses $V_{\text{out}}$ from $3.0\text{ V}$ down to $0.039\text{ V}$.)
2. If you double the current through a motor sense resistor, by what factor does its $I^2 R$ heat dissipation increase? (Answer: $4\times$, because power scales with the square of current.)

## 7. Resources
- **Horowitz & Hill — *The Art of Electronics* (Ch. 1):** Foundations of voltage dividers, Thevenin equivalents, and power dissipation (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Stage 0 Level 0.1 (`README.md`):** Links into the Wokwi virtual multimeter & breadboard sanity checks `[VERIFIED 2026-10-15]`.
