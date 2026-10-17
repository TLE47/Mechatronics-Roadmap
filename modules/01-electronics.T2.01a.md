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
**Predict first (before you run it):** Commit to three numbers and one ordering before you touch the code. (1) With $G = 20\text{ V/V}$, $R_{\text{shunt}} = 3\text{ m}\Omega$ and $V_{\text{ref}} = 1.65\text{ V}$, what are $V_{\text{ADC}}$ at $+25\text{ A}$ and at $-25\text{ A}$, and is the $\pm 25\text{ A}$ span inside the $3.30\text{ V}$ rail? (2) Which error is larger *measured in amperes of misread current* — the $40\%$ non-Kelvin gain error from $R_{\text{trace}} = 0.6\text{ m}\Omega$ per pad, or the $93\text{ dB}$ CMRR residue produced by a $48\text{ V}$ common-mode step amplified by $G = 20$? Write down both in $\text{A}$ before comparing. Two tells that your result is wrong rather than the module: the two endpoints must come out mirror images about $V_{\text{ref}}$, so an asymmetric pair means a signed current or a wrong reference; and a non-Kelvin error that lands *below* $40\%$ on a $3\text{ m}\Omega$ shunt means you charged $R_{\text{trace}}$ to one pad instead of both ($2 R_{\text{trace}}$).
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

### Graded package - the shunt stage, its clip point and the Kelvin error
[`exercises/01-electronics.T2.01a/`](../exercises/01-electronics.T2.01a/) turns this section into a test. `starter.py` holds seven holes: `shunt_adc_voltage` ($V_{\text{ref}} + GIR$), `shunt_current_from_adc` (its inverse, sign kept), `max_measurable_current` ($(V_{\text{rail}} - V_{\text{ref}})/(GR)$), `kelvin_gain_error_pct` ($100 \cdot 2 R_{\text{trace}}/R_{\text{shunt}}$), `cmrr_input_error_v` ($\Delta V_{\text{CM}} 10^{-\text{CMRR}/20}$), `cmrr_current_error_a` (the same residue over the shunt) and `adc_code` (a 12-bit, clamped unipolar code). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/01-electronics.T2.01a/starter.py \
  python3 -m unittest discover -s exercises/01-electronics.T2.01a -p 'test_*.py'
```

**34 tests.** The stage is checked at the worked example's $+3.15\text{ V}$ and $0.15\text{ V}$, at the mirror point about $1.65\text{ V}$, at $60\text{ mV/A}$, and at the exercise's $33.0\text{ A}$ with its $3.30\text{ V}$ boundary, so a dropped reference, a headroom measured from the rail, one-pad Kelvin copper, a voltage-ratio CMRR or a $4096$-count ADC each fail their own test. The transfer suite runs the stage on the workbench's own hardware: one count of the 12-bit ADC is $13.4\text{ mA}$ through a $3\text{ m}\Omega$ shunt and the plant only gets one decision per $1\text{ kHz}$ tick; the $50\text{ V/V}$ variant clips at $11\text{ A}$; the $40\%$ non-Kelvin error is worth $10\text{ A}$ at $25\text{ A}$ against the $93\text{ dB}$ residue's $0.36\text{ A}$ (and $1.33$ ADC counts); the module's $2\text{ m}\Omega$ shunt spends only $36\%$ of the $\pm 15\text{ A}$ range; and a REF tied to GND reports $0.00\text{ V}$ at zero current and clips every negative sample to code $0$. Five planted faults - `reference_dropped`, `kelvin_charges_one_pad`, `cmrr_amplifies`, `max_current_uses_rail_only`, `adc_code_uses_4096` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) ($\text{m}\Omega$ Shunt Scaling), [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Affine Range Mapping*), [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Frequency Response*), and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Nyquist Aliasing & Anti-Aliasing Cutoff*).
  - **Prerequisite Bridge Module:** [`01-electronics.T1.01b`](01-electronics.T1.01b.md) and Legacy **Step 1.2 (`01-electronics.T1.02`)**.
  - **Core Concepts to Review First:** 4-terminal Kelvin sense connections, differential op-amp output $V_{\text{out}} = V_{\text{ref}}/2 + G(I_{\text{phase}}R_{\text{shunt}})$, and active RC anti-aliasing filter sizing in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI INA240 Current-Sense Amplifier Datasheet (`ti.com/lit/gpn/ina240`)](https://www.ti.com/lit/gpn/ina240), [TI Op Amps for Everyone (SLOD006)](https://www.ti.com/lit/pdf/slod006), and [Track 01 §2.3 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-2-intermediate--applied).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution below ---


def shunt_adc_voltage(i_amp, r_shunt, gain=20.0, v_ref=1.65):
    """The ADC voltage for a phase current: V_ref + G I R_shunt."""
    # TODO 1: the reference is an offset, not a divisor - and the sign of I must survive
    ...


def shunt_current_from_adc(v_adc, r_shunt, gain=20.0, v_ref=1.65):
    """The current the ADC voltage reports: the inverse of the stage above."""
    # TODO 2: subtract the reference FIRST, then divide by G * R_shunt
    ...


def max_measurable_current(v_ref, v_rail, gain, r_shunt):
    """The positive current at which the output just reaches the rail."""
    # TODO 3: the half-scale swing is V_rail - V_ref, not the whole rail
    ...


def kelvin_gain_error_pct(r_shunt, r_trace):
    """The percentage gain error a 2-terminal (non-Kelvin) layout adds."""
    # TODO 4: both pads carry copper - the factor of 2 - and the answer is a percentage
    ...


def cmrr_input_error_v(delta_v_cm, cmrr_db):
    """A common-mode step, referred back to the amplifier input."""
    # TODO 5: dB is a power ratio, so 10^(-CMRR/20) - not 10^(-CMRR)
    ...


def cmrr_current_error_a(delta_v_cm, cmrr_db, r_shunt):
    """The same residue expressed as a misread current."""
    # TODO 6: an INPUT-referred volt is divided by R_shunt, not by G * R_shunt
    ...


def adc_code(v_adc, v_rail=3.3, bits=12):
    """The unipolar ADC code, rounded and clamped to full scale."""
    # TODO 7: full scale is 2**bits - 1, and a negative input clips to code 0
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **Which quantity the exercise asks for.** The rail is symmetric about $V_{\text{ref}}$, so the positive swing left is $3.30 - 1.65 = 1.65\text{ V}$; dividing that by the stage's $\text{V/A}$ figure, $G R_{\text{shunt}} = 50.0 \times 0.001 = 0.050\text{ V/A}$, gives the current at the boundary.
2. **Why the answer is not $66\text{ A}$.** Measuring the swing from $\text{GND}$ instead of from $V_{\text{ref}}$ doubles the numerator; the amplifier's output can only rise $1.65\text{ V}$ above its zero-current point before it saturates at the $3.30\text{ V}$ rail.
3. **The check that catches both mistakes.** Feed $I_{\max}$ back through `shunt_adc_voltage`: it must land exactly on $3.30\text{ V}$, and $-I_{\max}$ must land exactly on $0.00\text{ V}$, because the two endpoints mirror about $1.65\text{ V}$.
4. **Keep the sign.** `shunt_current_from_adc` is the inverse of the stage, so the recovered current at $0.00\text{ V}$ is $-33.0\text{ A}$, not $+33.0\text{ A}$.

### Full Solution
```python
import math


def shunt_adc_voltage(i_amp, r_shunt, gain=20.0, v_ref=1.65):
    return v_ref + gain * i_amp * r_shunt


def shunt_current_from_adc(v_adc, r_shunt, gain=20.0, v_ref=1.65):
    return (v_adc - v_ref) / (gain * r_shunt)


def max_measurable_current(v_ref, v_rail, gain, r_shunt):
    return (v_rail - v_ref) / (gain * r_shunt)


def kelvin_gain_error_pct(r_shunt, r_trace):
    return 100.0 * 2.0 * r_trace / r_shunt


def cmrr_input_error_v(delta_v_cm, cmrr_db):
    return delta_v_cm * 10.0 ** (-cmrr_db / 20.0)


def cmrr_current_error_a(delta_v_cm, cmrr_db, r_shunt):
    return cmrr_input_error_v(delta_v_cm, cmrr_db) / r_shunt


def adc_code(v_adc, v_rail=3.3, bits=12):
    full_scale = 2 ** bits - 1
    return max(0, min(full_scale, int(round(v_adc / v_rail * full_scale))))


i_max = max_measurable_current(1.65, 3.30, 50.0, 0.001)
v_at_max = shunt_adc_voltage(i_max, 0.001, 50.0)
v_at_min = shunt_adc_voltage(-i_max, 0.001, 50.0)

assert math.isclose(i_max, 33.0, abs_tol=1e-9)
assert math.isclose(v_at_max, 3.30, abs_tol=1e-12)
assert math.isclose(v_at_min, 0.0, abs_tol=1e-12)
assert math.isclose(shunt_current_from_adc(3.30, 0.001, 50.0), 33.0, abs_tol=1e-9)
assert math.isclose(kelvin_gain_error_pct(0.002, 0.0006), 60.0, abs_tol=1e-9)
assert math.isclose(cmrr_current_error_a(48.0, 93.0, 0.003), 0.358195382, abs_tol=1e-9)
assert adc_code(3.15) == 3909

print(f"V_ADC={v_at_max:.4f} V at I_max={i_max:.2f} A; V_ADC={abs(v_at_min):.2f} V at -I_max")
print(f"recovered I={shunt_current_from_adc(3.30, 0.001, 50.0):.2f} A | "
      f"2-terminal error={kelvin_gain_error_pct(0.002, 0.0006):.1f}% | adc_code(3.15 V)={adc_code(3.15)}")
```

Printed: `V_ADC=3.3000 V at I_max=33.00 A; V_ADC=0.00 V at -I_max`, then `recovered I=33.00 A | 2-terminal error=60.0% | adc_code(3.15 V)=3909`.

### Break it on purpose
Inject one realistic bring-up fault and diagnose it from the symptom alone, keeping $G = 20\text{ V/V}$ and $R_{\text{shunt}} = 3\text{ m}\Omega$:
- **Inject:** leave the `INA240` reference pin tied to $\text{GND}$ instead of the $V_{\text{ref}} = 1.65\text{ V}$ mid-rail reference (the mistake in the `## 8. Common mistakes` table, made on purpose).
- **Symptom:** the transfer function collapses to $V_{\text{ADC}} = G \cdot I \cdot R_{\text{shunt}}$, so $0\text{ A}$ now reads $0.00\text{ V}$ instead of $1.65\text{ V}$, $+25\text{ A}$ gives $+1.50\text{ V}$, and $-25\text{ A}$ wants $-1.50\text{ V}$, which the $0\text{–}3.30\text{ V}$ ADC clips to $0.00\text{ V}$ — the entire negative half of the bipolar range is gone.
- **Diagnose:** the zero-current point localizes it. A gain, shunt, or Kelvin error still leaves $0\text{ A}$ sitting at the $1.65\text{ V}$ reference and only scales the swing, whereas a *shifted* zero that drops to $0.00\text{ V}$ and clips every negative sample can only come from the `REF` pin, so neither the shunt value nor the CMRR is suspect.
- **Fix:** tie `REF1` and `REF2` together to a low-impedance $1.65\text{ V}$ source (a buffered `VREF/2` reference, not a high-value resistor divider that sags under the pin current), then prove it twice: short the amplifier inputs together ($0\text{ A}$) and the ADC must read $1.65\text{ V}$ to within $\pm 5\text{ mV}$, and drive $+25\text{ A}$ and confirm $3.15\text{ V}$, which is $0.15\text{ V}$ inside the $3.30\text{ V}$ rail.

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


### Gate test
Covers the complete Track 01 Tier 2 bridge ladder (`01-electronics.T2.01a` $\to$ `01-electronics.T2.01b`) before Step 2.2 (`01-electronics.T2.02`):
1. `[Concept: opamp_negative_feedback_virtual_short]` In an op-amp held in negative feedback and not saturated, compute the ideal differential input voltage $V_+ - V_-$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$).
2. `[Concept: differential_shunt_gain_and_cmrr]` Compute the ADC voltage $V_{\text{ADC}} = V_{\text{ref}} + G I R_{\text{shunt}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for $V_{\text{ref}} = 1.65\text{ V}$, $G = 25.0\text{ V/V}$, $R_{\text{shunt}} = 0.002\ \Omega$ and $I = +4.0\text{ A}$.
3. `[Concept: kelvin_four_terminal_sense_routing]` A $1.0\text{ m}\Omega$ shunt is tapped at its power pads, adding $0.15\text{ m}\Omega$ of trace on each pad ($2 R_{\text{trace}} = 0.30\text{ m}\Omega$). Compute the percentage gain error $100 \times 2 R_{\text{trace}}/R_{\text{shunt}}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: opamp_negative_feedback_virtual_short]` Why is the virtual short an approximation rather than a law?
   - **A.** Because the op-amp's finite open-loop gain $A_{OL}$ leaves $V_+ - V_- = V_{\text{out}}/A_{OL}$; with $A_{OL} = 10^6$ and $V_{\text{out}} = 2\text{ V}$ the residual is about $2\ \mu\text{V}$, small only because the gain is enormous.
   - **B.** Because the inputs draw microamps through $10\text{ M}\Omega$ resistors.
   - **C.** Because negative feedback removes the input stage.
   - **D.** Because it only holds when $V_{\text{out}} = 0$.
5. `[Concept: differential_shunt_gain_and_cmrr]` A $12\text{ V}$ common-mode step shifts both inputs by the same $12\text{ V}$. What keeps it out of the measured current?
   - **A.** The shunt is grounded, so common mode cannot enter.
   - **B.** A differential amplifier rejects the common part in proportion to its CMRR - the matched input network and the amplifier's own rejection turn a $12\text{ V}$ shift into an output error of microvolts-to-millivolts, which is why resistor matching and an in-amp with specified CMRR both matter.
   - **C.** The ADC subtracts $12\text{ V}$ in software.
   - **D.** Common-mode voltage is a myth.
6. `[Concept: kelvin_four_terminal_sense_routing]` Why do the two Kelvin sense wires carry almost no current?
   - **A.** They are wound around a ferrite bead.
   - **B.** They terminate in the amplifier's high input impedance, so the $I R$ drop across their own copper and solder joints is negligible: only the shunt's own $I R$ appears across the sense pair.
   - **C.** They are made of superconducting wire.
   - **D.** The shunt is an open circuit to them.
7. `[Concept: parasitic_loop_inductance_voltage_overshoot]` Compute the overshoot $\Delta V = L_{\text{loop}}\,\Delta I/\Delta t$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) for $L_{\text{loop}} = 4.0\text{ nH}$, $\Delta I = 25.0\text{ A}$ and $\Delta t = 20.0\text{ ns}$.
8. `[Concept: bootstrap_high_side_gate_driver_and_deadtime]` The switching node sits at $V_{\text{SW}} = 36.0\text{ V}$ and the driver's bootstrap capacitor supplies $12.0\text{ V}$ above it. Compute the high-side gate voltage relative to $\text{GND}$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$).
9. `[Concept: precharge_resistor_inrush_and_tvs_clamp]` Compute the initial pre-charge current $V_{\text{bus}}/R_{\text{pre}}$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) for a $60.0\text{ V}$ bus and $R_{\text{pre}} = 150\ \Omega$.
10. `[SAFETY] [Concept: precharge_resistor_inrush_and_tvs_clamp]` Compute the stored energy $E = \frac{1}{2} C_{\text{bus}} V_{\text{bus}}^2$ in joules ($\text{J}$, tolerance $\pm 10^{-9}$) for $C_{\text{bus}} = 1000\ \mu\text{F}$ at $V_{\text{bus}} = 60.0\text{ V}$.

**Gate answer key:**
```python
import math

g1_vdiff = 0.0
g2_vadc = 1.65 + 25.0 * 4.0 * 0.002
g3_err_pct = 100.0 * (2.0 * 0.15) / 1.0
g4_choice = "A"
g5_choice = "B"
g6_choice = "B"
g7_dv = 4.0e-9 * (25.0 / 20.0e-9)
g8_vg = 36.0 + 12.0
g9_ipre = 60.0 / 150.0
g10_safety_energy = 0.5 * 1000e-6 * (60.0 ** 2)

assert math.isclose(g1_vdiff, 0.0, abs_tol=1e-6)
assert math.isclose(g2_vadc, 1.85, rel_tol=1e-9)
assert math.isclose(g3_err_pct, 30.0, rel_tol=1e-9)
assert g4_choice == "A"
assert g5_choice == "B"
assert g6_choice == "B"
assert math.isclose(g7_dv, 5.0, rel_tol=1e-6)
assert math.isclose(g8_vg, 48.0, rel_tol=1e-6)
assert math.isclose(g9_ipre, 0.40, rel_tol=1e-9)
assert math.isclose(g10_safety_energy, 1.8, rel_tol=1e-9)  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $8/10$ overall ($80\%+$) AND $1/1$ ($100\%$) on Q10 (`[SAFETY]`). Remediation: Q1–Q6 $\to$ `01-electronics.T2.01a`; Q7–Q10 $\to$ `01-electronics.T2.01b`.

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
