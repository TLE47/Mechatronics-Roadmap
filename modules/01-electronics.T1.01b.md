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
difficulty:
  math: 3
  coding: 3
  tools: 2
  hardware_risk: high
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 4 of 10 · Power the joint: electronics**
>
> **Run this in the workbench.** [Open MechaLab with `EX.01-electronics.T1.01b` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.01-electronics.T1.01b) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the final bridge module in the Track 01 Tier 1 ladder before Step 1.2 (`01-electronics.T1.02`). A microcontroller GPIO pin can only source $\sim 20\text{ mA}$ at $3.3\text{ V}$—connecting a motor directly to it destroys the pin immediately. Power MOSFETs act as voltage-controlled electronic switches that let a tiny $3.3\text{ V}$ logic signal throttle amperes of motor current via **Pulse-Width Modulation (PWM)** and reverse direction via a 4-switch **H-Bridge**. Already know this? Read `### Safety notes` first, then take the Skip test or the Ladder Gate test in section 7.

## 2. Intuition first
Think of a MOSFET as a spring-loaded water valve whose handle (the **Gate**) is controlled by pressure rather than flow. When the Gate voltage is $0\text{ V}$ relative to the **Source** ($V_{GS} = 0$), the valve is shut tight and zero current flows into the **Drain**. When you raise $V_{GS}$ above the threshold with a $3.3\text{ V}$ or $5\text{ V}$ logic signal, the valve snaps wide open with a tiny on-resistance $R_{DS(\text{on})}$ of only a few milliohms. Instead of cracking the valve half-open (which would burn huge heat inside the valve), we flick it 100% open and 100% closed twenty thousand times per second (**PWM**); the motor's inductance smooths those rapid pulses into a smooth average voltage $V_{\text{eff}} = D \cdot V_{\text{bus}}$. And to spin the motor backward, an **H-Bridge** arranges four MOSFETs like an "H" around the motor so closing one diagonal pair pushes current left-to-right and closing the opposite diagonal pushes current right-to-left.

## 3. Formalization
1. **Low-Side N-Channel MOSFET Switch & Conduction Loss:** When gate-to-source voltage $V_{GS}$ exceeds the logic-level rating, the MOSFET conducts drain current $I_D$ ($\text{A}$) with on-resistance $R_{DS(\text{on})}$ ($\Omega$), dissipating conduction heat power $P_{\text{cond}}$ ($\text{W}$):

$$
P_{\text{cond}} = I_D^2 \cdot R_{DS(\text{on})}
$$

   Substituting $I_D = 5.0\text{ A}$ and $R_{DS(\text{on})} = 0.010\ \Omega$ ($10\text{ m}\Omega$) gives $P_{\text{cond}} = 25.0 \times 0.010 = 0.25\text{ W}$ (whereas dropping $6\text{ V}$ linearly at $5\text{ A}$ would waste $30.0\text{ W}$!). A $10\text{ k}\Omega$ pull-down resistor from Gate to Source keeps $V_{GS} = 0\text{ V}$ while MCU pins float during boot.
2. **PWM Duty Cycle ($D \in [0, 1]$):** Switching $V_{\text{bus}}$ ($\text{V}$) ON for time $t_{\text{on}}$ over period $T_{\text{pwm}} = 1/f_{\text{pwm}}$ defines duty cycle $D = t_{\text{on}}/T_{\text{pwm}}$ and average effective voltage:

$$
V_{\text{eff}} = D \cdot V_{\text{bus}}
$$

   Substituting $V_{\text{bus}} = 12.0\text{ V}$ and $D = 0.75$ ($75\%$) gives $V_{\text{eff}} = 9.0\text{ V}$.
3. **H-Bridge Diagonal Switching, Shoot-Through & Reading a Driver Datasheet (`DRV8833`):** Four switches $(Q_{\text{AH}}, Q_{\text{AL}})$ on leg A and $(Q_{\text{BH}}, Q_{\text{BL}})$ on leg B apply terminal voltage $V_{\text{AB}} = V_A - V_B$:
   - Forward: $(Q_{\text{AH}}, Q_{\text{BL}})$ ON $\implies V_{\text{AB}} = +V_{\text{bus}}$.
   - Reverse: $(Q_{\text{BH}}, Q_{\text{AL}})$ ON $\implies V_{\text{AB}} = -V_{\text{bus}}$.
   - **Shoot-Through Hazard:** Turning ON both switches of the *same* vertical leg $(Q_{\text{AH}}$ and $Q_{\text{AL}})$ simultaneously shorts $V_{\text{bus}}$ directly to $\text{GND}$ through $2 R_{DS(\text{on})}$; inserting **dead-time** $t_d$ (both OFF briefly during transitions) prevents shoot-through.
   - **Canonical Walkthrough — How to Read a Component Datasheet in 5 Minutes (`TI DRV8833`):** Whenever you meet a new IC, check four datasheet tables before wiring power: (1) **Pin Configuration & Functions** (maps physical pins to signals), (2) **Absolute Maximum Ratings** (destruction ceiling, e.g. $V_{\text{VM},\max} = 11.8\text{ V}$—never operate at this limit!), (3) **Recommended Operating Conditions** (safe continuous window: $V_{\text{VM}} \in [2.7\text{ V}, 10.8\text{ V}]$, $I_{\text{rms}} \le 1.5\text{ A}$), and (4) **Electrical Characteristics** (where combined high-side + low-side on-resistance $R_{DS(\text{on}),\text{HS}+\text{LS}} \approx 0.36\ \Omega$ is specified at $25^\circ\text{C}$).
   - **`DRV8833` Breakout Pinout & Wiring Checklist:**
     - `VM` & `GND`: Motor supply ($2.7\text{–}10.8\text{ V}$ from CC/CV bench supply) and star-ground return; place a $100\text{–}470\ \mu\text{F}$ electrolytic cap + $100\text{ nF}$ ceramic cap right across `VM` and `GND`.
     - `nSLEEP` (`SLP`): Active-low enable pin—**must be tied HIGH to `3.3V`** to wake the chip (`LOW` puts the driver into sleep mode with outputs disabled!).
     - `AIN1`, `AIN2`: $3.3\text{ V}$ PWM/logic inputs from MCU timer pins (`0,0` = Coast; `1,0` = Forward; `0,1` = Reverse; `1,1` = Dynamic Brake).
     - `AOUT1`, `AOUT2`: High-current H-bridge outputs wired to the two brushed DC motor leads.
     - `nFAULT` (`FLT`): Open-drain active-low fault output (pulls `LOW` on overcurrent, thermal shutdown, or undervoltage lockout).

## 4. Worked example
**Predict first (before you run it):** Commit to two numbers. (1) The same $I_D = 4.0\text{ A}$ is either switched by a MOSFET ($R_{DS(\text{on})} = 0.020\ \Omega$) or dropped linearly across the remaining $6.0\text{ V}$ at $D = 0.50$ — is the linear-drop loss tens of times or hundreds of times worse than the conduction loss? (2) Both FETs of one leg ON across $V_{\text{bus}} = 12.0\text{ V}$ with $0.020\ \Omega$ each: commit to the shoot-through current in amperes. Write both down, then run the block. If your second answer sits in the tens of amperes — the same order as the $4.0\text{ A}$ load you are switching — you have let the bus voltage fall across a load instead of across two milliohm-scale on-resistances in series, and the real number is an order of magnitude larger.

Compare MOSFET conduction loss at $I_D = 4.0\text{ A}$, $R_{DS(\text{on})} = 0.020\ \Omega$ against linear drop loss at $V_{\text{bus}} = 12.0\text{ V}$, $D = 0.50$, and compute the catastrophic shoot-through current if both FETs in one leg turn on across $12.0\text{ V}$.

<!-- try -->
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

<!-- try-link:start -->
> **Try this in the workbench.** [Open these 17 lines with `EX.01-electronics.T1.01b` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.01-electronics.T1.01b#try=eyJ2IjoxLCJsZXNzb24iOiJFWC4wMS1lbGVjdHJvbmljcy5UMS4wMWIiLCJjb2RlIjoiaW1wb3J0IG1hdGhcblxudl9idXMgPSAxMi4wXG5kdXR5ID0gMC41MFxuaV9sb2FkID0gNC4wXG5yZHNfb24gPSAwLjAyMFxuXG52X2VmZiA9IGR1dHkgKiB2X2J1c1xucF9tb3NmZXRfcHdtID0gZHV0eSAqIChpX2xvYWQgKiogMikgKiByZHNfb25cbnBfbGluZWFyX2Ryb3AgPSAodl9idXMgLSB2X2VmZikgKiBpX2xvYWRcbmlfc2hvb3RfdGhyb3VnaCA9IHZfYnVzIC8gKDIuMCAqIHJkc19vbilcblxuYXNzZXJ0IG1hdGguaXNjbG9zZSh2X2VmZiwgNi4wLCByZWxfdG9sPTFlLTkpXG5hc3NlcnQgbWF0aC5pc2Nsb3NlKHBfbW9zZmV0X3B3bSwgMC4xNiwgcmVsX3RvbD0xZS05KVxuYXNzZXJ0IG1hdGguaXNjbG9zZShwX2xpbmVhcl9kcm9wLCAyNC4wLCByZWxfdG9sPTFlLTkpXG5hc3NlcnQgbWF0aC5pc2Nsb3NlKGlfc2hvb3RfdGhyb3VnaCwgMzAwLjAsIHJlbF90b2w9MWUtOSlcbnByaW50KGZcIlZfZWZmPXt2X2VmZjouMWZ9IFYsIFBfUFdNPXtwX21vc2ZldF9wd206LjJmfSBXIHZzIFBfbGluZWFyPXtwX2xpbmVhcl9kcm9wOi4xZn0gVywgSV9zaG9vdD17aV9zaG9vdF90aHJvdWdoOi4wZn0gQVwiKSJ9) - it opens on the **Run Python Lessons** tab with the snippet in a scratch editor: Run prints what the snippet prints, nothing is graded, and the draft you have for `EX.01-electronics.T1.01b` is left alone.
<!-- try-link:end -->

## 5. Exercise
Using the **Canonical `TI DRV8833` Datasheet Walkthrough** in `## 3. Formalization` Item 3 above, (a) extract the maximum Recommended Operating supply voltage $V_{\text{VM,rec,max}}$ ($10.8\text{ V}$) vs. the Absolute Maximum destruction ceiling $V_{\text{VM,abs,max}}$ ($11.8\text{ V}$) and verify that a $V_{\text{bus}} = 9.0\text{ V}$ supply is safely inside the recommended operating window (`2.7 <= 9.0 <= 10.8`), and (b) extract the combined high-side + low-side path on-resistance $R_{DS(\text{on, high})} + R_{DS(\text{on, low})} = 0.36\ \Omega$ to compute the total H-bridge conduction power loss $P_{\text{loss}} = I^2 (R_{\text{high}} + R_{\text{low}})$ in watts ($\text{W}$) when driving $I = 1.2\text{ A}$ continuously at $D = 1.0$. Verify $P_{\text{loss}} = 0.5184\text{ W}$ ($\pm 10^{-4}\text{ W}$).
- **If your result differs:** Remember that in an H-bridge, motor current flows through **two** switches in series (one high-side FET in leg A and one low-side FET in leg B), so you must multiply $I^2$ by the combined high+low resistance ($0.36\ \Omega$).

### Graded package - the switch, the duty and the leg
[`exercises/01-electronics.T1.01b/`](../exercises/01-electronics.T1.01b/) turns this section into a test. `starter.py` holds seven holes: `conduction_loss`, `pwm_effective_voltage`, `shoot_through_current` (two switches, not one), `h_bridge_voltage` (the difference, not the sum), `bridge_conduction_loss`, `within_recommended` and `duty_for_effective_voltage`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/01-electronics.T1.01b/starter.py \
  python3 -m unittest discover -s exercises/01-electronics.T1.01b -p 'test_*.py'
```

**25 tests.** The loss is checked at the module's $5\text{ A} / 10\text{ m}\Omega$ and at $6\text{ A} / 15\text{ m}\Omega$; the worked example's $150\times$ advantage over a linear drop is asserted as a ratio, not a constant; the shoot-through is checked at both the worked and the Skip-test buses, so one switch fails; the H-bridge is checked forward, reverse and at equal duties, so adding the duties fails; the bridge loss is checked against **one switch** ($2\times$ ratio) and against the datasheet pair; a $65\%$ command must raise rather than produce $780\text{ V}$; and $11.8\text{ V}$ (the absolute maximum) must fail the recommended window. The transfer suite **drives the plant at 70% duty**: a square wave switching its $2.5\text{ N}\cdot\text{m}$ clamp must average exactly $0.7 \times 2.5$, the schedule never exceeds the clamp, and full duty travels further than 70%; the two-switch bridge loss is exactly twice the one-switch loss. Five planted faults - `conduction_without_square`, `shoot_through_one_switch`, `bridge_counts_one_switch`, `h_bridge_adds_duties`, `duty_accepts_percentage` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00a`](00-foundations.T1.00a.md) (*Clamping Functions*), [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (*SI Units & Power Dissipation*), and [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Energy Balance*).
  - **Prerequisite Bridge Modules:** [`01-electronics.T1.01a`](01-electronics.T1.01a.md) (*DC Circuits*), [`01-electronics.T1.01c`](01-electronics.T1.01c.md) (*CC/CV Bench Safety*), and [`01-electronics.T1.01d`](01-electronics.T1.01d.md) (*Capacitor/Inductor Transients*).
  - **Core Concepts to Review First:** PWM average voltage $V_{\text{avg}} = D V_{\text{bus}}$, MOSFET $R_{\text{DS(on)}}$ conduction loss, H-bridge bidirectional truth table, and star-grounding in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI SLVA959 (Brushed DC Motor Driver H-Bridge Basics)](https://www.ti.com/lit/pdf/slva959), [Analog Devices MT-101 (Decoupling Techniques)](https://www.analog.com/media/en/training-seminars/tutorials/MT-101.pdf), and [Track 01 §1.2–1.3 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-1-beginner--intuitive).

### Starter code
The exercise reads the `DRV8833` datasheet twice: once for its recommended supply window, once for the pair of on-resistances the motor current actually crosses. Fill the seven TODOs, then compare against the full solution below.

```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import mechalab_plant as plant  # noqa: F401  (the shared arm, as every graded package here imports it)


def conduction_loss(current, rds_on, duty=1.0):
    """P = I^2 R_DS(on) D over one PWM period."""
    # TODO 1: square the current, then scale by the duty - the average, not the peak
    ...


def pwm_effective_voltage(v_bus, duty):
    """V_eff = D * V_bus."""
    # TODO 2: duty is a fraction in [0, 1] - refuse a percentage such as 65
    ...


def shoot_through_current(v_bus, rds_on):
    """The leg's short-circuit current with both switches on."""
    # TODO 3: TWO switches in series, so divide by 2 * rds_on
    ...


def h_bridge_voltage(v_bus, duty_a, duty_b):
    """The average signed terminal voltage."""
    # TODO 4: subtract the two duties BEFORE scaling by the bus
    ...


def bridge_conduction_loss(current, r_high, r_low, duty=1.0):
    """Motor current crosses two switches."""
    # TODO 5: add BOTH on-resistances - a single switch reads half the real loss
    ...


def within_recommended(v_supply, v_min=2.7, v_max=10.8):
    """True inside the datasheet's Recommended Operating Conditions."""
    # TODO 6: inclusive at both ends, and 11.8 V is the absolute maximum, not this window
    ...


def duty_for_effective_voltage(v_eff, v_bus):
    """D = V_eff / V_bus."""
    # TODO 7: refuse a demand the bus cannot deliver instead of returning D > 1
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **Conduction loss counts the switches in the loop.** In a bridge, motor current crosses one high-side FET in leg A and one low-side FET in leg B, so $P = I^2 (R_{\text{high}} + R_{\text{low}}) D$ — with a single $0.18\ \Omega$ the answer is exactly half of $0.5184\text{ W}$.
2. **Shoot-through is two switches as well.** Both FETs of one leg are in series across the bus, so with $0.020\ \Omega$ each the current is $9.0/(2 \times 0.020)$; dividing by one $R$ doubles it.
3. **The differential drive subtracts.** $V_{AB} = (D_A - D_B)V_{\text{bus}}$, so equal duties give $0\text{ V}$ (brake/coast) and $D_A = 0.25$, $D_B = 0.75$ at $24\text{ V}$ is $-12.0\text{ V}$, not $+24.0$.
4. **Read the window, not the ceiling.** $11.8\text{ V}$ is the Absolute Maximum; the Recommended Operating Conditions stop at $10.8\text{ V}$, which is why $9.0\text{ V}$ is inside and $11.8\text{ V}$ is not.
5. **What the suite refuses.** `conduction_loss` and `h_bridge_voltage` raise on a duty outside $[0, 1]$, `pwm_effective_voltage` raises on a percentage such as `65.0` instead of scaling it silently, `duty_for_effective_voltage` raises on a demand the bus cannot deliver, `shoot_through_current` raises on a zero resistance, and `within_recommended` raises on an inverted window with `v_min > v_max` - all `ValueError`.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def conduction_loss(current, rds_on, duty=1.0):
    if rds_on < 0.0:
        raise ValueError("an on-resistance cannot be negative")
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1]")
    return current * current * rds_on * duty


def pwm_effective_voltage(v_bus, duty):
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1], not a percentage")
    return duty * v_bus


def shoot_through_current(v_bus, rds_on):
    if rds_on <= 0.0:
        raise ValueError("an on-resistance must be positive")
    return v_bus / (2.0 * rds_on)


def h_bridge_voltage(v_bus, duty_a, duty_b):
    for duty in (duty_a, duty_b):
        if not 0.0 <= duty <= 1.0:
            raise ValueError("each leg's duty is a fraction in [0, 1]")
    return (duty_a - duty_b) * v_bus


def bridge_conduction_loss(current, r_high, r_low, duty=1.0):
    if r_high < 0.0 or r_low < 0.0:
        raise ValueError("on-resistances cannot be negative")
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1]")
    return current * current * (r_high + r_low) * duty


def within_recommended(v_supply, v_min=2.7, v_max=10.8):
    if v_min <= 0.0 or v_max <= v_min:
        raise ValueError("the recommended window is a positive, increasing interval")
    return v_min <= v_supply <= v_max


def duty_for_effective_voltage(v_eff, v_bus):
    if v_bus <= 0.0:
        raise ValueError("the bus voltage must be positive")
    duty = v_eff / v_bus
    if not 0.0 <= duty <= 1.0:
        raise ValueError("that average voltage is outside what this bus can produce")
    return duty


# The exercise: the DRV8833's 0.36 ohm path at 1.2 A, and a 9.0 V bus in its window.
p_loss = bridge_conduction_loss(1.2, 0.18, 0.18, 1.0)
inside = within_recommended(9.0)
at_ceiling = within_recommended(11.8)
duty = duty_for_effective_voltage(9.0, 12.0)
i_shoot = shoot_through_current(9.0, 0.18)
v_reverse = h_bridge_voltage(24.0, 0.25, 0.75)

assert math.isclose(p_loss, 0.5184, abs_tol=1e-4)
assert inside and not at_ceiling
assert math.isclose(duty, 0.75, rel_tol=1e-12)
assert math.isclose(i_shoot, 25.0, rel_tol=1e-12)
assert math.isclose(v_reverse, -12.0, rel_tol=1e-12)

print(f"P_loss={p_loss:.4f} W at I=1.2 A, R_high+R_low=0.36 ohm; 9.0 V recommended={inside}; "
      f"D(9.0 V on a 12.0 V bus)={duty:.2f}; shoot-through at 9.0 V={i_shoot:.0f} A")
```

Printed: `P_loss=0.5184 W at I=1.2 A, R_high+R_low=0.36 ohm; 9.0 V recommended=True; D(9.0 V on a 12.0 V bus)=0.75; shoot-through at 9.0 V=25 A`

**On the shared arm.** The Transfer suite switches the plant's own torque clamp at a duty cycle and measures the average it delivers:

```python
import mechalab_plant as plant

# 70% duty on the plant's 2.5 N*m clamp delivers 70% of it on average - the same arithmetic as
# a PWM'ed bus voltage, and never more than the clamp itself.
duty = 0.70
average_torque = duty * plant.TAU_LIMIT
assert abs(average_torque - 1.75) < 1e-12
assert average_torque < plant.TAU_LIMIT
print("plant clamp: %.1f N*m at %.0f%% duty averages %.3f N*m"
      % (plant.TAU_LIMIT, duty * 100.0, average_torque))
```

### Break it on purpose
Inject one realistic H-bridge analysis slip and diagnose it from the number alone:
- **Inject:** recompute the exercise's conduction loss with a single switch's $R = 0.18\ \Omega$ instead of the series pair $R_{\text{high}} + R_{\text{low}} = 0.36\ \Omega$, keeping $I = 1.2\text{ A}$ at $D = 1.0$.
- **Symptom:** $P_{\text{loss}} = (1.2\text{ A})^2 \times 0.18\ \Omega = 0.2592\text{ W}$ — exactly half the verified $0.5184\text{ W}$, which reads as a cooler, safer board than the part actually allows.
- **Diagnose:** a clean factor of two is the tell. Conduction loss scales with the *number of switches in the current loop*, so trace the truth-table path (leg A high-side $\to$ motor $\to$ leg B low-side) and count the on-resistances the motor current crosses before you believe any thermal margin.
- **Fix:** use the combined $R_{\text{high}} + R_{\text{low}} = 0.36\ \Omega$, which reproduces $P_{\text{loss}} = (1.2\text{ A})^2 \times 0.36\ \Omega = 0.5184\text{ W}$. Prove the fix by printing both loop models side by side: the ratio must be exactly the count of switches in the path (two), and any other ratio means the loop is not the one you think it is.

## 6. Simulation path
Simulate a low-side MOSFET PWM switch and 4-FET H-bridge in [Falstad Circuit Simulator](https://www.falstad.com/circuit/) or inspect **25 kHz PMSM FOC** and **3D CAD & 48V PCB** in the MechaLab Workbench (`npm run dev`).

The graded package is also a workbench entry: **Modules -> `EX.01-electronics.T1.01b`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

### Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before touching hardware or taking the Skip/Gate test):**
> 1. **Maximum Voltage & Current Limits:** Keep Tier 1 breadboard motor supplies at $\le 12.0\text{ V}$ and set your bench power supply current limit to $\le 1.5\text{ A}$ before powering on (`L0.1`).
> 2. **Shoot-Through & Short-Circuit Prevention:** Never wire discrete H-bridge gates without hardware dead-time or interlock logic; a simultaneous high-side + low-side ON state across an unprotected battery can dump $>100\text{ A}$, melting breadboard strips and rupturing LiPo cells. Use integrated drivers with built-in shoot-through protection (`DRV8833` in Step 1.2) and always power first from a current-limited bench supply, never directly from a LiPo battery.
> 3. **Gate Pull-Down & Flyback Protection:** Always include a $10\text{ k}\Omega$ Gate-to-Source pull-down resistor so the motor cannot spin unexpectedly while the MCU is in reset, and never switch an inductive coil with a single FET without a freewheeling flyback diode across the coil.


```mermaid
flowchart LR
    A["01-electronics.T1.01b: mosfet_low_side_rds_on_switch"] --> B["pwm_duty_cycle_effective_voltage"]
    B --> C["h_bridge_four_switch_polarity_and_shoot_through"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: read `### Safety notes`, run the worked example and exercise asserts, or score $\ge 80\%$ ($4/5$) on the Skip test ($100\%$ required on `[SAFETY]` items). Passing the 8-question Ladder Gate test ($\ge 80\%$, $100\%$ on `[SAFETY]` items) unlocks Step 1.2 (`01-electronics.T1.02`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: pwm_duty_cycle_effective_voltage]` Compute the average effective motor voltage $V_{\text{eff}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for a $V_{\text{bus}} = 12.0\text{ V}$ supply switched at duty cycle $D = 0.65$ ($65\%$).
2. `[Apply] [Concept: mosfet_low_side_rds_on_switch]` Compute the conduction heat dissipation $P_{\text{cond}} = I_D^2 R_{DS(\text{on})}$ in watts ($\text{W}$, tolerance $\pm 10^{-9}$) in a MOSFET with $R_{DS(\text{on})} = 0.015\ \Omega$ carrying $I_D = 6.0\text{ A}$ at $100\%$ duty cycle.
3. `[Transfer] [Concept: h_bridge_four_switch_polarity_and_shoot_through]` An H-bridge powered from $V_{\text{bus}} = 24.0\text{ V}$ drives Leg A at PWM duty cycle $D_A = 0.25$ and Leg B at $D_B = 0.75$. Compute the average signed motor voltage $V_{\text{motor}} = (D_A - D_B) V_{\text{bus}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 01-electronics.T1.01a — Concept: voltage_current_resistance_ohms_law] [SAFETY] [Concept: h_bridge_four_switch_polarity_and_shoot_through]` If both $Q_{\text{AH}}$ and $Q_{\text{AL}}$ ($R_{DS(\text{on})} = 0.020\ \Omega$ each, total series resistance $0.040\ \Omega$) turn ON simultaneously across an un-current-limited $V_{\text{bus}} = 12.0\text{ V}$ battery because dead-time was omitted, compute the instantaneous shoot-through fault current $I_{\text{shoot}} = \frac{V_{\text{bus}}}{2 R_{DS(\text{on})}}$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}\text{ A}$).
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
q3_vmotor = (0.25 - 0.75) * 24.0
q4_safety_ishoot = 12.0 / (2.0 * 0.020)
q5_safety_choice = "B"
assert math.isclose(q1_veff, 7.8, rel_tol=1e-9)
assert math.isclose(q2_pcond, 0.54, rel_tol=1e-9)
assert math.isclose(q3_vmotor, -12.0, rel_tol=1e-9)
assert math.isclose(q4_safety_ishoot, 300.0, rel_tol=1e-9)  # Mandatory [SAFETY] 100% required
assert q5_safety_choice == "B"  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $4/5$ overall ($80\%+$) AND $2/2$ ($100\%$) on Q4 and Q5 (`[SAFETY]`). If you missed Q1, study `## 3. Formalization` item 2; if you missed Q2 or Q5, study `## 3. Formalization` item 1; if you missed Q3 or Q4, study `## 3. Formalization` item 3 and `### Safety notes`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 01 Tier 1 bridge ladder (`01-electronics.T1.01a` $\to$ `01-electronics.T1.01c` $\to$ `01-electronics.T1.01d` $\to$ `01-electronics.T1.01b`) before Step 1.2 (`01-electronics.T1.02`):
1. `[Concept: voltage_current_resistance_ohms_law]` Compute the current $I$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) when $9.0\text{ V}$ is applied across a $4.5\ \Omega$ resistor.
2. `[Concept: kvl_kcl_and_voltage_divider]` Compute the unloaded output voltage $V_{\text{out}}$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) of a divider with $V_{\text{in}} = 12.0\text{ V}$, $R_1 = 30\text{ k}\Omega$ (top), and $R_2 = 10\text{ k}\Omega$ (bottom).
3. `[Concept: electrical_power_i2r_dissipation] [Concept: mosfet_low_side_rds_on_switch]` Compute the power dissipated in watts ($\text{W}$, tolerance $\pm 10^{-9}$) by a $0.10\ \Omega$ resistor carrying $5.0\text{ A}$.
4. `[SAFETY] [Concept: multimeter_and_current_limited_psu_safety] [Concept: breadboard_internal_bus_connectivity] [Concept: esd_and_short_circuit_prevention]` Why must you **never** probe a voltage source ($12\text{ V}$ rail to $\text{GND}$) while your digital multimeter leads are plugged into the $10\text{ A}$ current jack?
   - **A.** The multimeter screen will show hex numbers.
   - **B.** The $10\text{ A}$ current jack is a near-zero-ohm dead short ($\sim 0.01\ \Omega$) across the leads, short-circuiting the power supply and blowing the meter fuse or arcing at the probes.
   - **C.** It drains the multimeter's $9\text{ V}$ battery slightly faster.
   - **D.** It changes the PWM duty cycle.
5. `[Concept: rc_time_constant_and_filtering] [Concept: capacitor_charge_storage_and_decoupling]` Compute the $-3\text{ dB}$ cutoff frequency $f_c = \frac{1}{2\pi R C}$ in $\text{Hz}$ (tolerance $\pm 0.01\text{ Hz}$) for $R = 1000\ \Omega$ and $C = 1.0\ \mu\text{F}$ ($10^{-6}\text{ F}$).
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

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| MOSFET gets scorching hot at only $2\text{ A}$ | Used a standard $V_{GS(\text{th})} = 4\text{ V}$ MOSFET driven by a $3.3\text{ V}$ GPIO pin, leaving the FET only partially turned on in its high-resistance linear region. | Use a **logic-level** MOSFET rated for full $R_{DS(\text{on})}$ at $V_{GS} = 2.5\text{ V}$ or $3.3\text{ V}$, or use a dedicated gate driver / integrated H-bridge (`DRV8833`). |
| Motor jerks violently during MCU reset/flashing | Omitted the $10\text{ k}\Omega$ Gate-to-Source pull-down resistor. | Add a $10\text{ k}\Omega$ resistor directly between Gate and Source (`GND`). |
| Power supply current-limits immediately on PWM start | Both high-side and low-side switches in one H-bridge leg turned on simultaneously (shoot-through). | Insert dead-time between complementary PWM signals or use an H-bridge IC with internal shoot-through interlock. |

## 9. Resources
- **Texas Instruments — *Understanding Motor Driver Current Ratings and PWM Decay Modes* (`SLVA959` & `SLUA618`, `resources/textbooks-and-papers.md`):** Clear diagrams of H-bridge forward, reverse, brake, and coast states `[VERIFIED 2026-10-15]`.
- **Track 01 (`01-electronics-and-power/README.md`):** Directly continues into Step 1.2 (`01-electronics.T1.02`) `[VERIFIED 2026-10-15]`.
## 10. Next modules

<!-- next-step:start -->
👉 **Next:** [Step 4 · Power the joint: electronics — 01-electronics.T1.01c: Multimeter, Current-Limited Bench Supply, Breadboard & ESD/Short-Circuit Safety](01-electronics.T1.01c.md)
<!-- next-step:end -->
