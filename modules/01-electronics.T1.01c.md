---
id: 01-electronics.T1.01c
title: "Multimeter, Current-Limited Bench Supply, Breadboard & ESD/Short-Circuit Safety"
track: "01"
tier: 1
prereqs:
  - 01-electronics.T1.01a
new_concepts:
  - breadboard_internal_bus_connectivity
  - multimeter_and_current_limited_psu_safety
  - esd_and_short_circuit_prevention
uses:
  - voltage_current_resistance_ohms_law
  - kvl_kcl_and_voltage_divider
  - electrical_power_i2r_dissipation
est_hours: 2.5
hardware_required: false
safety_level: high
resources_verified: true
difficulty:
  math: 2
  coding: 3
  tools: 3
  hardware_risk: high
  simulation: full
verification: ci-native
---

## 1. Why it matters
More beginner circuits are destroyed in the first five seconds of power-on by a breadboard row short, a multimeter lead left in the $10\text{ A}$ current jack, or an unprotected LiPo battery than by any software bug. Mastering how solderless breadboard clips are wired internally, how to measure voltage vs. current safely with a Digital Multimeter (DMM), and how to set a bench power supply's Constant-Current (CC) limit protects every board you build from Stage 0 (`L0.1`) through Track 08. Already know this? Read `### Safety notes` first, then take the Skip test in section 7.

## 2. Intuition first
Imagine a solderless breadboard as an apartment building with hidden copper hallways underneath the plastic holes: the long vertical side strips (`+` and `-`) are power elevators running the full height of the board, while each horizontal group of 5 holes (`a–b–c–d–e` and `f–g–h–i–j`, split by a center ravine) shares a single metal clip. Plugging both legs of a resistor into the *same* 5-hole row shorts the resistor out completely! Next, a **Digital Multimeter (DMM)** in **Voltage mode (`V`)** acts like an infinitely high-resistance stethoscope ($R_{\text{DMM,V}} \approx 10\text{ M}\Omega$) that you touch *across* two points in parallel; in **Current mode (`A`)**, it acts like a near-zero-ohm pipe ($R_{\text{shunt}} \approx 0.01\ \Omega$) that must be placed *in series* by breaking the circuit. Finally, a **current-limited bench supply** is an automatic circuit breaker that smoothly folds back its output voltage the instant current exceeds your preset ceiling $I_{\text{limit}}$.

## 3. Formalization
1. **Solderless Breadboard Internal Topology:**
   - Each 5-hole terminal row `(a1, b1, c1, d1, e1)` is a single electrical node ($R_{\text{clip}} \approx 0.05\ \Omega$, continuous current rating $\le 1.0\text{ A}$).
   - The center channel (`e` to `f`) is open circuit so dual-inline IC packages (`DIP` / breakout boards) straddle the gap without shorting opposite pins.
2. **DMM Input Impedance (Parallel Voltage vs. Series Current):**
   - **Voltage mode (`V` jack):** $R_{\text{in}} = 10\text{ M}\Omega$. Probing a $12.0\text{ V}$ rail draws only $I = 12.0 / 10^7 = 1.2\ \mu\text{A}$.
   - **Current mode (`10A` jack):** $R_{\text{shunt}} = 0.010\ \Omega$. Accidentally probing across a $12.0\text{ V}$ source with leads in the `10A` jack attempts to draw $I_{\text{short}} = 12.0\text{ V} / 0.010\ \Omega = 1200\text{ A}$, immediately blowing the DMM fuse or arcing!
3. **Bench Supply Constant-Voltage (CV) to Constant-Current (CC) Foldback:** Given voltage setting $V_{\text{set}}$, current limit $I_{\text{limit}}$, and load resistance $R_{\text{load}}$, the actual terminal voltage is:

$$
V_{\text{out}} = \min\!\left(V_{\text{set}},\ I_{\text{limit}} \cdot R_{\text{load}}\right)
$$

   Substituting $V_{\text{set}} = 12.0\text{ V}$, $I_{\text{limit}} = 0.20\text{ A}$, and a wiring short $R_{\text{load}} = 0.5\ \Omega$ folds output voltage down to $V_{\text{out}} = 0.20 \times 0.5 = 0.10\text{ V}$ and caps fault power at $P = I_{\text{limit}}^2 R_{\text{load}} = 0.020\text{ W}$ instead of $288\text{ W}$!

## 4. Worked example
**Predict first (before you run it):** commit to three numbers before the code runs. With the limit at $I_{\text{limit}} = 0.20\text{ A}$, is the supply in `"CV"` or `"CC"` on the $R_{\text{short}} = 0.25\ \Omega$ miswire, and is the fault power nearer $0.01\text{ W}$ or $576\text{ W}$? Then estimate the DMM short current from the $0.010\ \Omega$ shunt — an order of magnitude is enough ($\approx 1\text{ A}$ or $\approx 1000\text{ A}$?). Write both down. If your two fault powers come out within a factor of $100$ of each other, you ran the battery case in `"CC"` as well: a $50\text{ A}$ source does **not** clamp at $0.25\ \Omega$. If the DMM number lands in microamps, you divided by the voltmeter's $10\text{ M}\Omega$ input instead of the current shunt.
Compare the fault power dissipated in a $R_{\text{short}} = 0.25\ \Omega$ breadboard miswire across a $12.0\text{ V}$ rail when powered by (a) a bench supply with $I_{\text{limit}} = 0.20\text{ A}$ versus (b) an unprotected $12\text{ V}$ battery capable of $50\text{ A}$, and compute the DMM current-jack short current.

```python
import math

def psu_output(v_set: float, i_limit: float, r_load: float) -> tuple[float, float, float, str]:
    i_unclamped = v_set / r_load
    if i_unclamped <= i_limit:
        v_out, i_out, mode = v_set, i_unclamped, "CV"
    else:
        i_out = i_limit
        v_out = i_limit * r_load
        mode = "CC"
    return v_out, i_out, v_out * i_out, mode

v_cc, i_cc, p_cc, mode_cc = psu_output(12.0, 0.20, 0.25)
v_bat, i_bat, p_bat, _ = psu_output(12.0, 50.0, 0.25)
i_dmm_short = 12.0 / 0.010

assert mode_cc == "CC"
assert math.isclose(v_cc, 0.05, rel_tol=1e-9)
assert math.isclose(p_cc, 0.01, rel_tol=1e-9)
assert math.isclose(p_bat, 576.0, rel_tol=1e-9)
assert math.isclose(i_dmm_short, 1200.0, rel_tol=1e-9)
print(f"Bench PSU: mode={mode_cc}, V={v_cc:.2f} V, P={p_cc:.3f} W vs Battery fault P={p_bat:.0f} W")
```
Expected output:
```text
Bench PSU: mode=CC, V=0.05 V, P=0.010 W vs Battery fault P=576 W
```

## 5. Exercise
Your circuit has normal quiescent resistance $R_{\text{idle}} = 240\ \Omega$ at $V_{\text{set}} = 12.0\text{ V}$ (drawing $50\text{ mA}$). If you set the bench supply current limit to $I_{\text{limit}} = 0.10\text{ A}$ ($100\text{ mA}$), verify using `psu_output(12.0, 0.10, 240.0)` that normal operation stays in `"CV"` mode at $12.0\text{ V}$, and compute the exact threshold resistance $R_{\text{crit}} = V_{\text{set}} / I_{\text{limit}}$ below which the supply drops into `"CC"` mode ($R_{\text{crit}} = 120.0\ \Omega$).
- **If your result differs:** Divide $V_{\text{set}} = 12.0\text{ V}$ by $I_{\text{limit}} = 0.10\text{ A}$ to get $R_{\text{crit}} = 120.0\ \Omega$.

### Graded package - the supply's two modes and the DMM's two jacks
[`exercises/01-electronics.T1.01c/`](../exercises/01-electronics.T1.01c/) turns this section into a test. `starter.py` holds seven holes: `psu_output` (the CC/CV foldback, returning voltage, current, power and mode), `critical_resistance`, `dmm_voltage_loading_current`, `dmm_short_current`, `clip_power`, `led_current_ma` and `is_short`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/01-electronics.T1.01c/starter.py \
  python3 -m unittest discover -s exercises/01-electronics.T1.01c -p 'test_*.py'
```

**30 tests.** The foldback is checked on both sides of the $120\ \Omega$ threshold, so a supply that ignores its limit fails; the DMM is checked in the **current jack** across a $0.020\ \Omega$ shunt ($1200\text{ A}$ of available fault current) and in the voltage mode across $10\text{ M}\Omega$ ($1.2\ \mu\text{A}$); the clip's heat is checked as $I^2R$ (so a missing square fails); the LED's $10\text{ mA}$ is checked; and `is_short` is checked either side of $10\ \Omega$, so an inverted comparison fails. The transfer suite compares **the protected supply against a bare battery** on the same $0.25\ \Omega$ miswire - $0.01\text{ W}$ against $576\text{ W}$ - computes the one-second run energy on the plant's own `TICKS * DT`, and proves the foldback is memoryless at the plant's $1\text{ ms}$ tick. Five planted faults - `psu_ignores_limit`, `critical_resistance_multiplies`, `dmm_uses_voltmeter_input`, `clip_power_without_square`, `is_short_inverted` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00a`](00-foundations.T1.00a.md) (*Conditional Logic*) and [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (SI Units & Power $P = VI$).
  - **Prerequisite Bridge Module:** [`01-electronics.T1.01a`](01-electronics.T1.01a.md) (*Ohm's Law & Short-Circuit Current*).
  - **Core Concepts to Review First:** Breadboard 5-pin spring-clip topology, DMM continuity vs. current-jack hazards, and CC/CV power supply current clamping $V_{\text{out}} = \min(V_{\text{set}}, I_{\text{limit}} R_{\text{load}})$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [SparkFun How to Use a Breadboard](https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard), [SparkFun How to Use a Multimeter](https://learn.sparkfun.com/tutorials/how-to-use-a-multimeter), and [Track 00 §0.2 (`00-foundations/README.md`)](../00-foundations/README.md#level-0-global-prerequisite-on-ramp-intuition--bench-tools).

### Starter code
The exercise is one question asked twice: is the supply still in CV at $240\ \Omega$, and where is the exact resistance at which it stops being CV? Fill the seven TODOs, then compare against the full solution below.

```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import mechalab_plant as plant  # noqa: F401  (the shared arm, as every graded package here imports it)


def psu_output(v_set, i_limit, r_load):
    """(v_out, i_out, p_out, mode) for a CV/CC bench supply."""
    # TODO 1: compare V_set / R_load with the limit; above it, fold back to I_limit * R_load
    ...


def critical_resistance(v_set, i_limit):
    """R_crit = V_set / I_limit: below this the supply enters CC."""
    # TODO 2: the limit is a current, so divide the voltage by it (do not multiply)
    ...


def dmm_voltage_loading_current(v_rail, r_in=10_000_000.0):
    """Current a voltmeter steals from the rail it probes."""
    # TODO 3: V / R_in - the 10 Mohm input barely loads anything
    ...


def dmm_short_current(v_rail, r_shunt=0.010, r_leads=0.0):
    """The surge from a lead left in the current jack."""
    # TODO 4: the SHUNT is the resistance here, not the 10 Mohm voltmeter input
    ...


def clip_power(current, r_clip):
    """P = I^2 R in one breadboard spring clip."""
    # TODO 5: square the current before scaling by the contact resistance
    ...


def led_current_ma(v_supply, v_f, resistance):
    """Series LED current in milliamps."""
    # TODO 6: subtract the forward drop, divide by R, then scale to mA
    ...


def is_short(resistance, threshold=10.0):
    """True when the power-off resistance check reads below the threshold."""
    # TODO 7: BELOW the threshold is a short - do not power on
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **Foldback is a comparison, not a formula to memorise.** Compute the current the load *would* draw at $V_{\text{set}}$; if that is above $I_{\text{limit}}$, the supply gives up voltage until the current equals the limit, so $V_{\text{out}} = I_{\text{limit}} R_{\text{load}}$.
2. **The threshold is $V_{\text{set}}/I_{\text{limit}}$.** $12.0/0.10 = 120\ \Omega$: at exactly $120\ \Omega$ the unclamped current equals the limit and the supply is still in CV, and $119\ \Omega$ is already in CC at $0.10 \times 119 = 11.9\text{ V}$.
3. **Two DMM jacks, two resistances.** In voltage mode the rail sees $10\text{ M}\Omega$ ($12.0/10^7 = 1.2\ \mu\text{A}$); in the current jack the rail sees the shunt ($12.0/(0.010 + 0.010) = 600\text{ A}$) — dividing by $10\text{ M}\Omega$ there gives microamps and hides the destroyed fuse.
4. **The power-off check compares the other way.** A healthy $240\ \Omega$ build must return `False` from `is_short`; only a reading *below* $10\ \Omega$ is the short you are hunting.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def psu_output(v_set, i_limit, r_load):
    if v_set < 0.0:
        raise ValueError("the voltage setting cannot be negative")
    if i_limit <= 0.0:
        raise ValueError("the current limit must be positive - it is the whole safety feature")
    if r_load <= 0.0:
        raise ValueError("a load resistance must be positive")
    unclamped = v_set / r_load
    if unclamped <= i_limit:
        return v_set, unclamped, v_set * unclamped, "CV"
    v_out = i_limit * r_load
    return v_out, i_limit, v_out * i_limit, "CC"


def critical_resistance(v_set, i_limit):
    if v_set < 0.0:
        raise ValueError("the voltage setting cannot be negative")
    if i_limit <= 0.0:
        raise ValueError("the current limit must be positive")
    return v_set / i_limit


def dmm_voltage_loading_current(v_rail, r_in=10_000_000.0):
    if r_in <= 0.0:
        raise ValueError("a voltmeter needs a positive input resistance")
    return v_rail / r_in


def dmm_short_current(v_rail, r_shunt=0.010, r_leads=0.0):
    if r_shunt <= 0.0:
        raise ValueError("a current shunt must be positive")
    if r_leads < 0.0:
        raise ValueError("lead resistance cannot be negative")
    return v_rail / (r_shunt + r_leads)


def clip_power(current, r_clip):
    if r_clip < 0.0:
        raise ValueError("a contact resistance cannot be negative")
    return current * current * r_clip


def led_current_ma(v_supply, v_f, resistance):
    if resistance <= 0.0:
        raise ValueError("the series resistance must be positive")
    return max(0.0, (v_supply - v_f) / resistance) * 1000.0


def is_short(resistance, threshold=10.0):
    if resistance < 0.0:
        raise ValueError("a resistance cannot be negative")
    if threshold <= 0.0:
        raise ValueError("the short threshold must be positive")
    return resistance < threshold


# The exercise: 240 ohm at 12.0 V draws 50 mA, under the 100 mA limit.
v_out, i_out, p_out, mode = psu_output(12.0, 0.10, 240.0)
r_crit = critical_resistance(12.0, 0.10)
v_cc, i_cc, p_cc, mode_cc = psu_output(12.0, 0.10, r_crit - 1.0)

# The two jack modes, and the clip that melts at 5 A.
steal_ua = dmm_voltage_loading_current(12.0) * 1e6
i_surge = dmm_short_current(12.0, 0.010, 0.010)
p_clip = clip_power(5.0, 0.12)

assert mode == "CV" and math.isclose(v_out, 12.0, rel_tol=1e-12)
assert math.isclose(i_out, 0.05, rel_tol=1e-12) and math.isclose(p_out, 0.6, rel_tol=1e-12)
assert math.isclose(r_crit, 120.0, rel_tol=1e-12)
assert mode_cc == "CC" and math.isclose(v_cc, 11.9, rel_tol=1e-12)
assert math.isclose(steal_ua, 1.2, rel_tol=1e-9)
assert math.isclose(i_surge, 600.0, rel_tol=1e-12)
assert math.isclose(p_clip, 3.0, rel_tol=1e-12)
assert not is_short(240.0) and is_short(5.0)

print(f"mode={mode}, V_out={v_out:.2f} V, I_out={i_out * 1000.0:.1f} mA, P={p_out * 1000.0:.1f} mW; "
      f"R_crit={r_crit:.1f} ohm; {r_crit - 1.0:.0f} ohm -> {mode_cc} at {v_cc:.2f} V")
```

Printed: `mode=CV, V_out=12.00 V, I_out=50.0 mA, P=600.0 mW; R_crit=120.0 ohm; 119 ohm -> CC at 11.90 V`

### Break it on purpose
This is the classic first-power-on mistake, and it is a **fault you inject on purpose** so you can recognise the symptom later:
- **Inject:** the same $R_{\text{short}} = 0.25\ \Omega$ miswire across a $12.0\text{ V}$ rail, but the current limit raised to $I_{\text{limit}} = 2.0\text{ A}$ because the $0.20\text{ A}$ setting kept folding back during bring-up.
- **Symptom:** the supply still sits in `"CC"` and its voltmeter reads $V_{\text{out}} = 2.0 \times 0.25 = 0.50\text{ V}$ — but the fault now dissipates $P = I_{\text{limit}}^2 R_{\text{short}} = (2.0)^2 (0.25) = 1.0\text{ W}$, one hundred times the $0.01\text{ W}$ the protected setting allowed, through a spring clip rated for $\le 1.0\text{ A}$.
- **Diagnose:** read the two displays together. The *current* reads exactly your limit ($2.0\text{ A}$) while the *voltage* sags far below $V_{\text{set}}$, so the supply is in Constant-Current foldback and the load is resistive — a short or a half-wired build, not an open circuit (an open would read $V_{\text{set}}$ at $0\text{ A}$). If the current sits at the limit and the clip is warm, the limit is the thing that decided how much heat you made.
- **Fix:** drop the limit back to $0.10\text{–}0.20\text{ A}$ for logic builds, treat foldback as the signal to power **off** and hunt the short, and prove the fix by measuring $V_{\text{bus}}$-to-$\text{GND}$ resistance in $\Omega$ mode: $\ge 240\ \Omega$ (the healthy $R_{\text{idle}}$) means the miswire is gone, $< 10\ \Omega$ means it is still there.

## 6. Simulation path
Simulate a current-limited voltage source and breadboard layout in [Falstad Circuit Simulator](https://www.falstad.com/circuit/) or [Wokwi](https://wokwi.com/) (`resources/open-source-toolchains.md`).

The graded package is also a workbench entry: **Modules -> `EX.01-electronics.T1.01c`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

### Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before touching hardware or taking the Skip test):**
> 1. **Voltage & Current Ceilings:** Keep all Tier 1 breadboard rails at $\le 12.0\text{ V}$ and $\le 1.0\text{ A}$ continuous (`L0.1`). Solderless breadboard spring clips overheat and melt plastic above $1.5\text{–}2.0\text{ A}$.
> 2. **Power-Off Continuity Check First:** Before enabling power on any new build, unplug the power supply and measure resistance between $V_{\text{bus}}$ and $\text{GND}$ with your DMM in $\Omega$ mode. If it reads $< 10\ \Omega$, find and fix the short before applying power.
> 3. **DMM Lead Jack Discipline:** Keep the red DMM lead in the **`V/Ω` jack** at all times. If you ever move it to the `10A` or `mA` jack to measure series current, move it back to `V/Ω` the instant you finish—probing a voltage rail with the lead in `10A` creates a dead short.
> 4. **ESD & First Power-On Rule:** Touch a grounded metal frame before handling bare CMOS MOSFETs or MCUs, and **always** power a new circuit from a current-limited bench supply ($I_{\text{limit}} = 0.1\text{–}0.2\text{ A}$ for logic, $0.5\text{–}1.5\text{ A}$ for small motors), never directly from a LiPo battery.


```mermaid
flowchart LR
    A["01-electronics.T1.01c: breadboard_internal_bus_connectivity"] --> B["multimeter_and_current_limited_psu_safety"]
    B --> C["esd_and_short_circuit_prevention"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: read `### Safety notes`, run the worked example and exercise asserts, or score $\ge 80\%$ ($4/5$) on the Skip test ($100\%$ required on `[SAFETY]` questions).

### Skip test
1. `[Recall] [Concept: breadboard_internal_bus_connectivity]` A solderless breadboard spring clip has contact resistance $R_{\text{clip}} = 0.12\ \Omega$. If you mistakenly route $I = 5.0\text{ A}$ of motor current through that clip, compute the localized heat power $P = I^2 R_{\text{clip}}$ in watts ($\text{W}$, tolerance $\pm 10^{-6}\text{ W}$) that melts the ABS plastic housing.
2. `[Apply] [Concept: multimeter_and_current_limited_psu_safety]` A bench power supply is configured to $V_{\text{set}} = 12.0\text{ V}$ and current limit $I_{\text{lim}} = 0.25\text{ A}$. If you connect it across a $R_{\text{load}} = 4.0\ \Omega$ resistor, the supply enters Constant-Current (CC) foldback. Compute the clamped output voltage $V_{\text{out}} = \min(V_{\text{set}}, I_{\text{lim}} R_{\text{load}})$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$).
3. `[Transfer] [SAFETY] [Concept: multimeter_and_current_limited_psu_safety]` If you leave the red multimeter lead plugged into the current-shunt jack ($R_{\text{shunt}} = 0.010\ \Omega$ internal resistance, $R_{\text{leads}} = 0.010\ \Omega$ probe resistance, total $0.020\ \Omega$) and touch the probes in parallel across an un-current-limited $24.0\text{ V}$ battery rail, compute the instantaneous short-circuit surge current $I_{\text{short}} = \frac{24.0}{R_{\text{shunt}} + R_{\text{leads}}}$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}\text{ A}$).
4. `[Spaced review -> 01-electronics.T1.01a — Concept: voltage_current_resistance_ohms_law] [SAFETY] [Concept: esd_and_short_circuit_prevention]` Before turning ON the output of your bench power supply on a freshly wired breadboard circuit, what two steps are mandatory?
   - **A.** Connect a LiPo battery in parallel and set current limit to maximum.
   - **B.** With power OFF, verify $V_{\text{bus}}$-to-$\text{GND}$ resistance is not a short using a DMM in $\Omega$ mode, and pre-configure the bench PSU to target voltage with a low Constant-Current limit ($0.1\text{–}0.2\text{ A}$).
   - **C.** Touch the $12\text{ V}$ wire to the MCU `3.3V` pin to test ESD protection.
   - **D.** Remove all ground wires.
5. `[Concept: breadboard_internal_bus_connectivity]` A $5.0\text{ V}$ rail powers an LED ($V_f = 2.0\text{ V}$) through a $R = 300\ \Omega$ series resistor placed across the breadboard center ravine (`e10` to `f10`). Compute the series LED current $I = \frac{V_{\text{sup}} - V_f}{R} \times 1000$ in milliamperes ($\text{mA}$, tolerance $\pm 10^{-6}$).

**Answer key:**
```python
import math

q1_p_clip = (5.0 ** 2) * 0.12
q2_v_foldback = min(12.0, 0.25 * 4.0)
q3_safety_ishort = 24.0 / (0.010 + 0.010)
q4_safety_choice = "B"
q5_i_ma = ((5.0 - 2.0) / 300.0) * 1000.0
assert math.isclose(q1_p_clip, 3.0, rel_tol=1e-9)
assert math.isclose(q2_v_foldback, 1.0, rel_tol=1e-9)
assert math.isclose(q3_safety_ishort, 1200.0, rel_tol=1e-9)  # Mandatory [SAFETY] 100% required
assert q4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert math.isclose(q5_i_ma, 10.0, rel_tol=1e-9)
```
- **Pass mark:** $4/5$ overall ($80\%+$) AND $2/2$ ($100\%$) on Q3 and Q4 (`[SAFETY]`). If you missed Q1 or Q5, study `## 3. Formalization` item 1; if you missed Q2 or Q3, study `## 3. Formalization` item 2–3; if you missed Q4, study `### Safety notes`. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 01 Tier 1 bridge ladder (`01-electronics.T1.01a` $\to$ `01-electronics.T1.01c` $\to$ `01-electronics.T1.01d` $\to$ `01-electronics.T1.01b`) before Step 1.2 (`01-electronics.T1.02`):
1. `[Concept: breadboard_internal_bus_connectivity]` Compute the heat $P = I^2 R_{\text{clip}}$ in watts ($\text{W}$, tolerance $\pm 10^{-9}$) in a breadboard clip of $R_{\text{clip}} = 0.08\ \Omega$ carrying $3.0\text{ A}$.
2. `[Concept: multimeter_and_current_limited_psu_safety]` A bench supply is set to $V_{\text{set}} = 15.0\text{ V}$ with $I_{\text{limit}} = 0.30\text{ A}$ and is wired across $R_{\text{load}} = 20.0\ \Omega$. Compute the clamped output voltage $V_{\text{out}} = \min(V_{\text{set}}, I_{\text{limit}} R_{\text{load}})$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$).
3. `[SAFETY] [Concept: multimeter_and_current_limited_psu_safety]` With the red lead still in the `10A` jack ($R_{\text{shunt}} = 0.010\ \Omega$) and $0.008\ \Omega$ of probe lead, you probe across an $18.0\text{ V}$ battery. Compute the surge current in amperes ($\text{A}$, tolerance $\pm 10^{-6}$).
4. `[SAFETY] [Concept: esd_and_short_circuit_prevention]` Why does a grounded wrist strap protect a MOSFET gate oxide that a voltmeter never seems to damage?
   - **A.** The gate oxide is hundreds of volts thick, so only the DMM can break it.
   - **B.** A charged human body is a capacitor of roughly $100\text{ pF}$ at several kilovolts; the strap bleeds that charge to ground through a resistor before it can discharge through the gate's nanometre-thin oxide, which a $10\text{ M}\Omega$ voltmeter never stresses.
   - **C.** The strap increases the gate threshold voltage.
   - **D.** Static charge only damages bipolar transistors.
5. `[Concept: breadboard_internal_bus_connectivity]` Which statement about a solderless breadboard's internal wiring is true?
   - **A.** Every hole in a column `a1`–`j1` is connected.
   - **B.** The two `+`/`-` side strips run the full board height as separate buses, while each row of five holes is one node and the centre ravine separates `a–e` from `f–j`.
   - **C.** All holes on the board are one node until a wire is inserted.
   - **D.** The centre ravine is a low-resistance link between the two halves.
6. `[Concept: voltage_current_resistance_ohms_law]` Compute the current in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) through a $75\ \Omega$ resistor with $15.0\text{ V}$ across it.
7. `[Concept: kvl_kcl_and_voltage_divider]` Compute the unloaded midpoint voltage in volts ($\text{V}$, tolerance $\pm 10^{-6}$) of a $20\text{ k}\Omega$ (top) / $10\text{ k}\Omega$ (bottom) divider on a $15.0\text{ V}$ rail.
8. `[Concept: electrical_power_i2r_dissipation]` Compute the power in watts ($\text{W}$, tolerance $\pm 10^{-9}$) dissipated by a $0.24\ \Omega$ shunt carrying $1.5\text{ A}$.
9. `[Concept: rc_time_constant_and_filtering]` Compute $\tau = R C$ in seconds ($\text{s}$, tolerance $\pm 10^{-12}$) for $R = 3.3\text{ k}\Omega$ and $C = 22\ \mu\text{F}$.
10. `[Concept: capacitor_charge_storage_and_decoupling]` Why does a motor-driver board carry a $100\text{ nF}$ ceramic **and** a $470\ \mu\text{F}$ electrolytic across $V_{\text{bus}}$?
   - **A.** The ceramic shunts the nanosecond switching edge and the electrolytic supplies the millisecond current surge, because no single capacitor has both low inductance and large charge storage.
   - **B.** The two capacitances add to $570\text{ nF}$, which is the only value the driver accepts.
   - **C.** The electrolytic blocks DC while the ceramic passes it.
   - **D.** They are decorative; the regulator alone is sufficient.
11. `[Concept: inductor_flyback_and_freewheeling_diode]` A $3.0\text{ mH}$ winding carrying $4.0\text{ A}$ is switched off in $1.5\ \mu\text{s}$ with no freewheeling path. Compute the spike $|V_L| = L\,\Delta I/\Delta t$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$).
12. `[Concept: mosfet_low_side_rds_on_switch] [Concept: pwm_duty_cycle_effective_voltage]` A low-side FET with $R_{DS(\text{on})} = 45\text{ m}\Omega$ switches $2.0\text{ A}$ at $D = 0.80$. Compute its average conduction loss $P = D I^2 R_{DS(\text{on})}$ in watts ($\text{W}$, tolerance $\pm 10^{-9}$).
13. `[Concept: h_bridge_four_switch_polarity_and_shoot_through]` An H-bridge runs $D_A = 0.90$ and $D_B = 0.30$ from $V_{\text{bus}} = 10.0\text{ V}$. Compute the average signed motor voltage in volts ($\text{V}$, tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

g1_pclip = (3.0 ** 2) * 0.08
g2_vout = min(15.0, 0.30 * 20.0)
g3_safety_ishort = 18.0 / (0.010 + 0.008)
g4_safety_choice = "B"
g5_choice = "B"
g6_i = 15.0 / 75.0
g7_vdiv = 15.0 * (10_000.0 / (20_000.0 + 10_000.0))
g8_p = (1.5 ** 2) * 0.24
g9_tau = 3_300.0 * 22e-6
g10_choice = "A"
g11_vl = 3.0e-3 * (4.0 / 1.5e-6)
g12_ploss = 0.80 * (2.0 ** 2) * 0.045
g13_vab = (0.90 - 0.30) * 10.0

assert math.isclose(g1_pclip, 0.72, rel_tol=1e-9)
assert math.isclose(g2_vout, 6.0, rel_tol=1e-9)
assert math.isclose(g3_safety_ishort, 1000.0, rel_tol=1e-6)  # Mandatory [SAFETY] 100% required
assert g4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert g5_choice == "B"
assert math.isclose(g6_i, 0.20, rel_tol=1e-9)
assert math.isclose(g7_vdiv, 5.0, rel_tol=1e-6)
assert math.isclose(g8_p, 0.54, rel_tol=1e-9)
assert math.isclose(g9_tau, 0.0726, rel_tol=1e-12)
assert g10_choice == "A"
assert math.isclose(g11_vl, 8000.0, rel_tol=1e-6)
assert math.isclose(g12_ploss, 0.144, rel_tol=1e-9)
assert math.isclose(g13_vab, 6.0, rel_tol=1e-9)
```
- **Pass mark:** $11/13$ overall ($80\%+$) AND $2/2$ ($100\%$) on Q3 and Q4 (`[SAFETY]`). Remediation: Q1, Q5, Q8 $\to$ `## 3. Formalization` and `01-electronics.T1.01c`; Q2 $\to$ `## 3. Formalization` item 3; Q3–Q4 $\to$ `### Safety notes`; Q6–Q7 $\to$ `01-electronics.T1.01a`; Q9–Q11 $\to$ `01-electronics.T1.01d`; Q12–Q13 $\to$ `01-electronics.T1.01b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Circuit gets $0\text{ V}$ halfway down the breadboard power rail | Many full-size breadboards have a split break halfway down the long `+`/`-` side rails. | Install short jumper wires bridging the midpoint gap on both `+` and `-` rails and verify continuity with your DMM. |
| DMM reads `0.00 A` forever in current mode | Blew the internal $250\text{ mA}$ or $10\text{ A}$ HRC fuse by probing across a voltage rail in current mode. | Test fuse continuity from the `V/Ω` lead to the `mA`/`10A` jack and replace with the exact rated HRC fuse. |
| Breakout board pins short together on breadboard | Plugged both rows of a breakout board into the same side of the center ravine instead of straddling it. | Straddle the center ravine so left pins land in column `e` and right pins land in column `f`. |

## 9. Resources
- **Stage 0 Onboarding (`README.md#stage-0--pre-tier-1-absolute-beginner-on-ramp`, `L0.1`):** Breadboard, multimeter, and current-limited PSU bring-up checklist `[VERIFIED 2026-10-15]`.
- **Paul Scherz & Simon Monk — *Practical Electronics for Inventors* (`resources/textbooks-and-papers.md`):** Hands-on guide to multimeters, bench supplies, and breadboard prototyping `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to [`01-electronics.T1.01d`](01-electronics.T1.01d.md) (*Capacitors, Inductors, RC Time Constants & Inductive Flyback*).
