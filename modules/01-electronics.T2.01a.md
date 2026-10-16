---
id: 01-electronics.T2.01a
title: "Operational Amplifiers, Differential Shunt Amplification, Common-Mode Voltage & Kelvin Sensing"
track: "01"
tier: 2
prereqs:
  - 01-electronics.T1.02
  - 00-foundations.T2.01
new_concepts:
  - opamp_negative_feedback_virtual_short
  - differential_shunt_gain_and_cmrr
  - kelvin_four_terminal_sense_routing
uses:
  - voltage_current_resistance_ohms_law
  - kvl_kcl_and_voltage_divider
  - star_grounding
est_hours: 4.0
hardware_required: false
safety_level: low
resources_verified: true
---

## 1. Why it matters
To control motor torque at $20\text{–}40\text{ kHz}$ in Tier 2 (`01-electronics.T2.02` and `03-sensors.T2.04`), your microcontroller must measure phase currents of $\pm 15\text{ A}$ across a tiny $R_{\text{shunt}} = 2\text{ m}\Omega$ resistor. That produces a signal of only $\pm 30\text{ mV}$ riding on top of a noisy power ground or switching phase node! Understanding how **operational amplifiers (op-amps)** and dedicated current-sense amplifiers (`INA240`) amplify microvolt differential drops around a $V_{\text{ref}} = 1.65\text{ V}$ mid-supply bias while rejecting common-mode bounce—and why **4-terminal Kelvin traces** are mandatory—prevents 50% current measurement errors on your first custom PCB. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine trying to measure the height of a $3\text{ cm}$ ripple on the surface of the ocean while both you and the ripple are riding up and down on a $48\text{ m}$ tidal wave. The $48\text{ m}$ wave is the **common-mode voltage** $V_{\text{CM}}$ (shared equally by both ends of the shunt resistor), and the $3\text{ cm}$ ripple is the **differential shunt voltage** $V_{\text{diff}} = I \cdot R_{\text{shunt}}$. A **differential current-sense amplifier** (`INA240`) subtracts the two pins so the tidal wave cancels out (**Common-Mode Rejection Ratio, CMRR**), multiplies only the $3\text{ cm}$ ripple by gain $G = 20\text{ V/V}$, and centers the result at $V_{\text{ref}} = 1.65\text{ V}$ so the $0\text{–}3.3\text{ V}$ ADC can read both positive ($+15\text{ A}$) and negative ($-15\text{ A}$) currents. And why **4-terminal Kelvin connections**? Because if your sense traces tap into the heavy copper power pads where $15\text{ A}$ is flowing, even $1\text{ m}\Omega$ of solder/trace resistance adds a $50\%$ fake voltage error to a $2\text{ m}\Omega$ shunt!

## 3. Formalization
1. **Ideal Op-Amp Under Negative Feedback:** With negative feedback active and output unsaturated, an ideal op-amp draws zero input bias current ($I_+ = I_- = 0$) and drives its differential input voltage to zero ($V_+ \approx V_-$, the **virtual short**).
2. **Bidirectional Differential Shunt Amplifier Transfer Function:** For phase current $I_{\text{phase}}$ ($\text{A}$) through shunt resistance $R_{\text{shunt}}$ ($\Omega$), amplifier gain $G$ ($\text{V/V}$), and mid-rail reference $V_{\text{ref}} = 1.65\text{ V}$, the ADC pin voltage is:

$$
V_{\text{ADC}} = V_{\text{ref}} + G \cdot I_{\text{phase}} \cdot R_{\text{shunt}}
$$

   Substituting $V_{\text{ref}} = 1.65\text{ V}$, $G = 20.0\text{ V/V}$, $R_{\text{shunt}} = 0.003\ \Omega$ ($3\text{ m}\Omega$), and $I_{\text{phase}} = +15.0\text{ A}$ gives $V_{\text{ADC}} = 1.65 + 20(15.0)(0.003) = 2.55\text{ V}$ (and $0.75\text{ V}$ at $-15.0\text{ A}$). A common-mode jump $\Delta V_{\text{CM}}$ attenuated by $\text{CMRR}_{\text{dB}}$ adds input-referred error $\Delta V_{\text{err,in}} = \Delta V_{\text{CM}} \cdot 10^{-\text{CMRR}_{\text{dB}}/20}$.
3. **2-Terminal vs. 4-Terminal Kelvin Shunt Parasitic Error:** If two sense traces tap into the load current path with parasitic copper/solder resistance $R_{\text{trace}}$ ($\Omega$) on each pad, the apparent shunt resistance becomes $R_{\text{meas}} = R_{\text{shunt}} + 2 R_{\text{trace}}$, creating relative gain error:

$$
\varepsilon_{\text{gain}} = \frac{2 R_{\text{trace}}}{R_{\text{shunt}}}
$$

   Substituting $R_{\text{shunt}} = 2.0\text{ m}\Omega$ and $R_{\text{trace}} = 0.6\text{ m}\Omega$ gives $\varepsilon_{\text{gain}} = 1.2 / 2.0 = +60\%$ error! Tapping dedicated non-current-carrying inner Kelvin sense pads reduces $I_{\text{sense}} \approx 0$, eliminating the $2 R_{\text{trace}}$ drop.

## 4. Worked example
Design a bidirectional current-sense stage using an `INA240A1` ($G = 20\text{ V/V}$, $\text{CMRR} = 93\text{ dB}$ AC) with $R_{\text{shunt}} = 0.003\ \Omega$ ($3\text{ m}\Omega$) and $V_{\text{ref}} = 1.65\text{ V}$ for $I \in [-25\text{ A}, +25\text{ A}]$, and compare the 2-terminal parasitic copper error ($R_{\text{trace}} = 0.6\text{ m}\Omega$ per pad) against a 4-terminal Kelvin layout.

```python
import math

def shunt_adc_voltage(i_amp: float, r_shunt: float = 0.003, gain: float = 20.0, v_ref: float = 1.65) -> float:
    return v_ref + gain * i_amp * r_shunt

v_pos25 = shunt_adc_voltage(+25.0)
v_neg25 = shunt_adc_voltage(-25.0)
kelvin_err_pct = 100.0 * (2.0 * 0.0006) / 0.003
cm_err_mv = (48.0 * (10.0 ** (-93.0 / 20.0)) * 20.0) * 1000.0

assert math.isclose(v_pos25, 3.15, rel_tol=1e-9) and v_pos25 < 3.30
assert math.isclose(v_neg25, 0.15, rel_tol=1e-9) and v_neg25 > 0.00
assert math.isclose(kelvin_err_pct, 40.0, rel_tol=1e-9)
assert math.isclose(cm_err_mv, 21.5008, abs_tol=1e-2)
print(f"V_ADC(+25A)={v_pos25:.2f} V, V_ADC(-25A)={v_neg25:.2f} V, Non-Kelvin error={kelvin_err_pct:.1f}%")
```
Expected output:
```text
V_ADC(+25A)=3.15 V, V_ADC(-25A)=0.15 V, Non-Kelvin error=40.0%
```

## 5. Exercise
Calculate the maximum measurable current magnitude $I_{\max}$ in amperes ($\text{A}$) before clipping a $0\text{–}3.30\text{ V}$ ADC centered at $V_{\text{ref}} = 1.65\text{ V}$ when using an amplifier with gain $G = 50.0\text{ V/V}$ and a $R_{\text{shunt}} = 0.001\ \Omega$ ($1\text{ m}\Omega$) Kelvin shunt. Verify $I_{\max} = \frac{1.65}{50.0 \times 0.001} = 33.0\text{ A}$ ($\pm 10^{-6}\text{ A}$).
- **If your result differs:** Available half-scale voltage swing around $1.65\text{ V}$ is $3.30 - 1.65 = 1.65\text{ V}$; divide $1.65\text{ V}$ by $(G \cdot R_{\text{shunt}}) = 0.050\text{ V/A}$ to get $33.0\text{ A}$.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) ($\text{m}\Omega$ Shunt Scaling), [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Affine Range Mapping*), [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Frequency Response*), and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Nyquist Aliasing & Anti-Aliasing Cutoff*).
  - **Prerequisite Bridge Module:** [`01-electronics.T1.01b`](01-electronics.T1.01b.md) and Legacy **Step 1.2 (`01-electronics.T1.02`)**.
  - **Core Concepts to Review First:** 4-terminal Kelvin sense connections, differential op-amp output $V_{\text{out}} = V_{\text{ref}}/2 + G(I_{\text{phase}}R_{\text{shunt}})$, and active RC anti-aliasing filter sizing in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI INA240 Current-Sense Amplifier Datasheet (`ti.com/lit/gpn/ina240`)](https://www.ti.com/lit/gpn/ina240), [TI Op Amps for Everyone (SLOD006)](https://www.ti.com/lit/pdf/slod006), and [Track 01 §2.3 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-2-intermediate--applied).

## 6. Simulation path
Open **Tab 3 (25 kHz PMSM FOC)** and **Tab 6 (3D CAD & 48V PCB)** in the MechaLab Workbench (`npm run dev`) or simulate a differential amplifier in [LTspice](https://www.analog.com/en/resources/design-tools-and-calculators/ltspice-simulator.html) (`resources/open-source-toolchains.md`).

No hardware required for this module (`hardware_required: false`). In Step 2.2 (`01-electronics.T2.02`), your KiCad PCB footprint routes the two inner Kelvin pads (`S+`, `S-`) as a tightly coupled differential pair directly to the `INA240` inputs, completely separate from the high-current power pours:
```text
[High-Current Pour 15A] ===> [Pad 1 (Force+)] [Pad 2 (Sense+)] ---> (Diff Pair) ---> [INA240 IN+]
                                        [ 3 mOhm Shunt ]
[PGND Power Pour   15A] <=== [Pad 4 (Force-)] [Pad 3 (Sense-)] ---> (Diff Pair) ---> [INA240 IN-]
```
Pass/fail verification in simulation: `v_pos25 == 3.15 V`, `v_neg25 == 0.15 V`, and `kelvin_err_pct == 40.0%`.

### Safety notes
> **⚠️ Bench Safety Note (`safety_level: low`):** Always verify probe placement (`V/Ohm` voltage port, never the `10A` shunt port in parallel) and set your CC/CV bench power supply current limit ($\le 0.5\text{ A}$) before energizing any breadboard or sensor circuit.


```mermaid
flowchart LR
    A["01-electronics.T2.01a: opamp_negative_feedback_virtual_short"] --> B["differential_shunt_gain_and_cmrr"]
    B --> C["kelvin_four_terminal_sense_routing"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: differential_shunt_gain_and_cmrr]` Compute the ADC voltage $V_{\text{ADC}} = V_{\text{ref}} + G \cdot I \cdot R_{\text{shunt}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for $V_{\text{ref}} = 1.65\text{ V}$, $G = 20.0\text{ V/V}$, $R_{\text{shunt}} = 0.005\ \Omega$ ($5\text{ m}\Omega$), and $I = -10.0\text{ A}$.
2. `[Apply] [Concept: kelvin_four_terminal_sense_routing]` A $2.0\text{ m}\Omega$ shunt is routed without Kelvin connections, adding $0.4\text{ m}\Omega$ of copper trace resistance in series with each of the two pads ($2 R_{\text{trace}} = 0.8\text{ m}\Omega$). Compute the percentage gain error $100 \times \frac{2 R_{\text{trace}}}{R_{\text{shunt}}}$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: opamp_negative_feedback_virtual_short]` For a bidirectional current-sense amplifier biased at $V_{\text{ref}} = 1.65\text{ V}$ feeding a $0\text{–}3.30\text{ V}$ ADC with gain $G = 20.0\text{ V/V}$ and $R_{\text{shunt}} = 0.005\ \Omega$, compute the maximum positive current $I_{\max} = \frac{3.30 - V_{\text{ref}}}{G \cdot R_{\text{shunt}}}$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) before the op-amp output saturates at $3.30\text{ V}$.
4. `[Spaced review -> 01-electronics.T1.02 — Concept: voltage_current_resistance_ohms_law] [Concept: kelvin_four_terminal_sense_routing]` Why do the two inner Kelvin sense traces carry almost zero current ($I_{\text{sense}} \approx 0$)?
   - **A.** Because they terminate into the very high input impedance of the differential amplifier, so virtually none of the $15\text{ A}$ motor current flows through the sense traces or their solder joints.
   - **B.** Because the sense traces are made of plastic.
   - **C.** Because the shunt resistor is open circuit.
   - **D.** Because $V_{\text{ref}}$ blocks current.

**Answer key:**
```python
import math

q1_vadc = 1.65 + 20.0 * (-10.0) * 0.005
q2_err_pct = 100.0 * (2.0 * 0.4) / 2.0
q3_imax = (3.30 - 1.65) / (20.0 * 0.005)
q4_choice = "A"
assert math.isclose(q1_vadc, 0.65, rel_tol=1e-9)
assert math.isclose(q2_err_pct, 40.0, rel_tol=1e-9)
assert math.isclose(q3_imax, 16.5, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 2; if you missed Q2 or Q4, study `## 3. Formalization` item 3; if you missed Q3, study `## 3. Formalization` item 1 & 2. On pass, proceed to `## 10. Next modules`.


## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Current reading is $30\text{–}60\%$ higher than a calibrated bench ammeter | Tapped the sense traces off the outer power copper pour instead of dedicated inner Kelvin pads. | Use a 4-pad Kelvin footprint (`Net-Tie` at the shunt pads) so sense traces connect only to the inner blade edges of the shunt element. |
| ADC reads $1.65\text{ V}$ for positive current and clips at $0.0\text{ V}$ for negative current | Tied the amplifier's `REF` pin to $\text{GND}$ instead of a low-impedance $1.65\text{ V}$ reference (`VREF/2`). | Tie `REF1` and `REF2` of the `INA240` together to $V_{\text{ADC,ref}}/2 = 1.65\text{ V}$. |
| Large current spikes appear on ADC whenever adjacent phase switches | Sense traces were routed far apart, creating a magnetic loop that picks up $d\Phi/dt$ from the switching node. | Route `IN+` and `IN-` as a tightly coupled differential pair over an unbroken Layer-2 ground plane. |

## 9. Resources
- **Texas Instruments — *INA240 Zero-Drift, Bidirectional Current-Sense Amplifier Datasheet & Kelvin Layout Guide* (`resources/textbooks-and-papers.md`):** Enhanced PWM rejection and 4-terminal shunt PCB layout rules `[VERIFIED 2026-10-15]`.
- **Horowitz & Hill — *The Art of Electronics* (3e, Ch. 4 Operational Amplifiers):** Virtual short, differential amplifiers, and CMRR `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to [`01-electronics.T2.01b`](01-electronics.T2.01b.md) (KiCad 4-Layer Stackup, Parasitic Loop Inductance ($L\,di/dt$), Bootstrap Gate Drivers & 48 V Pre-Charge Safety).
