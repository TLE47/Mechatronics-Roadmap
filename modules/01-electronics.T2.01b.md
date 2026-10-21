---
id: 01-electronics.T2.01b
title: "Parasitic Loop Inductance (4-Layer Stackup), Bootstrap Gate Drivers & 48 V Pre-Charge/TVS Clamping"
track: "01"
tier: 2
prereqs:
  - 01-electronics.T2.01a
new_concepts:
  - parasitic_loop_inductance_voltage_overshoot
  - bootstrap_high_side_gate_driver_and_deadtime
  - precharge_resistor_inrush_and_tvs_clamp
uses:
  - mosfet_low_side_rds_on_switch
  - differential_shunt_gain_and_cmrr
  - kelvin_four_terminal_sense_routing
est_hours: 4.5
hardware_required: false
safety_level: high
resources_verified: true
difficulty:
  math: 4
  coding: 3
  tools: 4
  hardware_risk: high
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 4 of 10 · Power the joint: electronics**
>
> **Run this in the workbench.** [Open MechaLab with `EX.01-electronics.T2.01b` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.01-electronics.T2.01b) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the final bridge module in the Track 01 Tier 2 ladder before Step 2.2 (`01-electronics.T2.02`). Jumping from a $12\text{ V}$ breadboard to a custom $24\text{–}48\text{ V}$, $15\text{–}30\text{ A}$ 4-layer motor controller PCB introduces three critical physics challenges: (1) even $15\text{ nH}$ of PCB trace loop inductance creates a $\Delta V = L_{\text{loop}}\frac{di}{dt}$ voltage spike that can exceed your MOSFET's $V_{DS,\max}$ rating, (2) driving an N-channel MOSFET on the **high side** requires a **bootstrap capacitor** floating above the switching phase node, and (3) plugging a $48\text{ V}$ battery straight into uncharged bulk capacitors sparks a $>200\text{ A}$ inrush arc without a **pre-charge resistor circuit**. Already know this? Read `### Safety notes` first, then take the Skip test or the Ladder Gate test in section 7.

## 2. Intuition first
First, why does a 4-layer PCB with an unbroken **Layer-2 solid ground plane** beat a 2-layer board by $10\times$? High-frequency switching current always tries to return directly underneath the trace that sent it because opposing currents cancel each other's magnetic fields. Putting a solid ground plane $0.2\text{ mm}$ directly beneath your power stage shrinks the magnetic loop area to a paper-thin slit, slashing **parasitic loop inductance** $L_{\text{loop}}$ from $\sim 25\text{ nH}$ down to $<3\text{ nH}$. Second, how do you turn ON a high-side N-MOSFET whose Source pin is sitting at $+48\text{ V}$ when it conducts? You need $+58\text{ V}$ on its Gate ($V_{GS} = 10\text{ V}$ above Source)! A **bootstrap circuit** charges a small capacitor $C_{\text{boot}}$ to $12\text{ V}$ whenever the low-side FET pulls the phase node to $\text{GND}$, and then rides that capacitor up like an elevator on top of the $48\text{ V}$ phase node (`BST = SW + 12 V`). Third, an uncharged $1000\ \mu\text{F}$ capacitor bank looks like a dead short ($0\text{ V}$) at $t=0$: a **pre-charge resistor** ($R_{\text{pre}} \approx 47\ \Omega$) fills the tank gently over $\sim 0.2\text{ s}$ before the main contactor closes.

## 3. Formalization
1. **Commutation Loop Inductance & Turn-Off Voltage Overshoot:** When phase current $\Delta I$ ($\text{A}$) commutates in switching transition time $\Delta t_{\text{sw}}$ ($\text{s}$) through hot-loop parasitic inductance $L_{\text{loop}}$ ($\text{H}$), peak Drain-to-Source voltage reaches:

$$
V_{\text{peak}} = V_{\text{bus}} + L_{\text{loop}} \frac{\Delta I}{\Delta t_{\text{sw}}}
$$

   Substituting $V_{\text{bus}} = 48.0\text{ V}$, $\Delta I = 30.0\text{ A}$, $\Delta t_{\text{sw}} = 20\text{ ns}$ ($20 \times 10^{-9}\text{ s}$), and a sloppy 2-layer loop $L_{\text{loop}} = 20\text{ nH}$ ($20 \times 10^{-9}\text{ H}$) gives $V_{\text{peak}} = 48.0 + 20 \times \frac{30}{20} = 78.0\text{ V}$ (dangerously close to an $80\text{ V}$ FET ceiling!), whereas a tight PCB layout with $L_{\text{loop}} = 2.0\text{ nH}$ limits overshoot to $48.0 + 3.0 = 51.0\text{ V}$.
2. **High-Side Bootstrap Gate Voltage & Gate Drive Current ($I_G$):** To switch total gate charge $Q_g$ ($\text{C}$) in rise time $t_r$ ($\text{s}$), average gate drive current is:

$$
I_G = \frac{Q_g}{t_r}, \quad V_{\text{BST}} = V_{\text{SW}} + V_{\text{drv}}
$$

   Substituting $Q_g = 30\text{ nC}$ and $t_r = 30\text{ ns}$ gives $I_G = 1.0\text{ A}$. Because $C_{\text{boot}}$ only recharges when $V_{\text{SW}} \approx 0\text{ V}$ (low-side ON), a bootstrap driver cannot run at $100.0\%$ high-side duty cycle indefinitely without a brief low-side refresh pulse or trickle charge pump.
3. **Capacitor Bank Pre-Charge Time & Energy:** Pre-charging bus capacitance $C_{\text{bus}}$ ($\text{F}$) to $V_{\text{bus}}$ ($\text{V}$) through $R_{\text{pre}}$ ($\Omega$) limits initial peak inrush current to $I_{\text{pre,peak}} = V_{\text{bus}} / R_{\text{pre}}$ and dissipates total energy $E_{R,\text{pre}} = \frac{1}{2} C_{\text{bus}} V_{\text{bus}}^2$ ($\text{J}$) in $R_{\text{pre}}$ over $5\tau = 5 R_{\text{pre}} C_{\text{bus}}$. Substituting $V_{\text{bus}} = 48.0\text{ V}$, $C_{\text{bus}} = 1000\ \mu\text{F}$ ($0.001\text{ F}$), and $R_{\text{pre}} = 48.0\ \Omega$ gives $I_{\text{pre,peak}} = 1.0\text{ A}$, $5\tau = 0.24\text{ s}$, and $E_{R,\text{pre}} = 1.152\text{ J}$.

## 4. Worked example
**Predict first (before you run it):** Commit to three numbers before the block prints anything. (a) The sloppy board stores $10\times$ the loop inductance of the good one and commutates the same $\Delta I = 30.0\text{ A}$ in the same $\Delta t_{\text{sw}} = 20\text{ ns}$, so how many volts does $L_{\text{loop}} \frac{\Delta I}{\Delta t_{\text{sw}}}$ add on top of $V_{\text{bus}} = 48.0\text{ V}$ in each case, and does either land under a $75\text{ V}$ FET ceiling? (b) Pre-charging $C_{\text{bus}} = 1000\ \mu\text{F}$ to $48.0\text{ V}$ through $R_{\text{pre}} = 48.0\ \Omega$ burns exactly the energy the bank ends up storing, $\frac{1}{2} C_{\text{bus}} V_{\text{bus}}^2$, so is the resistor's total heating greater than, equal to, or less than $1.152\text{ J}$? (c) What peak current must $R_{\text{pre}}$ survive at $t = 0$? A printed $V_{\text{peak}}$ of $48.0\text{ V}$ means the $L \frac{\Delta I}{\Delta t}$ term dropped out of the call, a resistor energy above $1.152\text{ J}$ means you charged the bank twice, and an inrush below $1.0\text{ A}$ means $V_{\text{bus}}$ was divided by the wrong resistance.
Compare the turn-off voltage spike at $V_{\text{bus}} = 48.0\text{ V}, \Delta I = 30.0\text{ A}, \Delta t_{\text{sw}} = 20\text{ ns}$ for a sloppy 2-layer layout ($L_{\text{loop}} = 20\text{ nH}$) vs. a 4-layer solid-plane layout ($L_{\text{loop}} = 4\text{ nH}$), and size a $48\text{ V}$ pre-charge circuit for $C_{\text{bus}} = 1000\ \mu\text{F}$.

```python
import math

def v_peak_turnoff(v_bus: float, l_loop_nh: float, di_amp: float, dt_ns: float) -> float:
    return v_bus + (l_loop_nh * 1e-9) * (di_amp / (dt_ns * 1e-9))

vp_2layer = v_peak_turnoff(48.0, l_loop_nh=20.0, di_amp=30.0, dt_ns=20.0)
vp_4layer = v_peak_turnoff(48.0, l_loop_nh=4.0, di_amp=30.0, dt_ns=20.0)

v_bus = 48.0
c_bus = 1000e-6
r_pre = 48.0
i_inrush_pre = v_bus / r_pre
t_99pct = 5.0 * r_pre * c_bus
e_pre_j = 0.5 * c_bus * (v_bus ** 2)

assert math.isclose(vp_2layer, 78.0, rel_tol=1e-9)
assert math.isclose(vp_4layer, 54.0, rel_tol=1e-9)
assert math.isclose(i_inrush_pre, 1.0, rel_tol=1e-9)
assert math.isclose(t_99pct, 0.24, rel_tol=1e-9)
assert math.isclose(e_pre_j, 1.152, rel_tol=1e-9)
print(f"V_peak(20nH)={vp_2layer:.1f} V vs V_peak(4nH)={vp_4layer:.1f} V; Precharge I_max={i_inrush_pre:.1f} A, 5tau={t_99pct:.2f} s")
```
Expected output:
```text
V_peak(20nH)=78.0 V vs V_peak(4nH)=54.0 V; Precharge I_max=1.0 A, 5tau=0.24 s
```

## 5. Exercise
Calculate the maximum allowable parasitic commutation loop inductance $L_{\text{loop,max}}$ in nanohenries ($\text{nH}$) on a $V_{\text{bus}} = 48.0\text{ V}$ inverter switching $\Delta I = 30.0\text{ A}$ in $\Delta t_{\text{sw}} = 15\text{ ns}$ so that the peak turn-off voltage $V_{\text{peak}}$ never exceeds $60.0\text{ V}$ ($80\%$ of a $75\text{ V}$ rating). Verify $L_{\text{loop,max}} = \frac{(60.0 - 48.0) \times 15\text{ ns}}{30.0\text{ A}} = 6.0\text{ nH}$.
- **If your result differs:** Note that $\text{nH}/\text{ns} = 1\ \Omega$, so $\Delta V = L_{\text{nH}} \cdot \frac{\Delta I}{\Delta t_{\text{ns}}} \implies L_{\text{nH}} = 12.0 \times \frac{15.0}{30.0} = 6.0\text{ nH}$.

### Graded package - the loop, the bootstrap and the pre-charge
[`exercises/01-electronics.T2.01b/`](../exercises/01-electronics.T2.01b/) turns this section into a test. `starter.py` holds seven holes: `v_peak_turnoff` (the $L\,dI/dt$ spike, with $\text{nH}/\text{ns} = 1\ \Omega$), `max_loop_inductance_nh` (the headroom above the bus, not the ceiling), `gate_drive_current_a`, `bootstrap_gate_v` ($V_{\text{SW}} + V_{\text{drv}}$), `precharge_peak_a`, `precharge_time_s` (five time constants) and `bus_energy_j` ($\tfrac12 C V^2$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/01-electronics.T2.01b/starter.py \
  python3 -m unittest discover -s exercises/01-electronics.T2.01b -p 'test_*.py'
```

**39 tests (31 behaviour, 8 transfer).** The spike is checked at the worked example's $78.0\text{ V}$ 2-layer board and $54.0\text{ V}$ 4-layer board, at the Skip test's $56.0\text{ V}$ and the Gate test's $6.0\text{ V}$ fragment, so a commutation time in microseconds or a dropped nanohenry scale each fail; the inductance budget is checked at the exercise's $6.0\text{ nH}$ and re-evaluated to land on, never above, the $60\text{ V}$ ceiling; the gate current is checked at $1.0\text{ A}$ and the Skip test's $1.5\text{ A}$; the bootstrap gate is checked at $60\text{ V}$ absolute, which a driver-only $12\text{ V}$ cannot reach. The pre-charge is checked at $1.0\text{ A}$ inrush and $0.24\text{ s}$, and the bus energy at the worked $1.152\text{ J}$, the Skip test's $1.728\text{ J}$ and the Gate test's $2.304\text{ J}$. The transfer suite runs **the shared plant's clock and envelope**: the $0.24\text{ s}$ pre-charge is exactly 240 of the plant's $1\text{ kHz}$ ticks and 24% of the capstone's $1\text{ s}$ run; the $1.152\text{ J}$ bank would sustain the $2.5\text{ N}\cdot\text{m}$ clamp for 460.8 ticks; the same energy is the shoulder joint's $\tfrac12 I\omega^2$ at $16.97\text{ rad/s}$; the same commutation over one plant tick is $0.0006\text{ V}$, exactly $50\,000\times$ smaller than at $20\text{ ns}$; and the $2\text{ nH}$ plane clears a $75\text{ V}$ ceiling where the $25\text{ nH}$ 2-layer loop does not. Seven planted faults - `dt_in_microseconds`, `inductance_scale_dropped`, `max_inductance_ignores_headroom`, `gate_current_milli`, `bootstrap_forgets_swing`, `bus_energy_forgets_half`, `precharge_one_tau` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) ($\text{nC}, \text{ns}, \text{mJ}$ Units), [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Energy Storage*), and [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Impedance*).
  - **Prerequisite Bridge Modules:** [`01-electronics.T1.01d`](01-electronics.T1.01d.md) (*RC Time Constants*) and [`01-electronics.T2.01a`](01-electronics.T2.01a.md) (*Kelvin Shunts*).
  - **Core Concepts to Review First:** 4-layer KiCad stackup (`L2 Solid GND`), gate-driver bootstrap charge $I_g = Q_g/t_{sw}$ and shoot-through dead-time, and $48\text{ V}$ RC pre-charge sizing ($t_{\text{pre}} \approx 5 R_{\text{pre}} C_{\text{bus}}$) in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [KiCad Official Documentation (`docs.kicad.org`)](https://docs.kicad.org/), [TI SLUA887 (Gate Drive & Dead-Time Design)](https://www.ti.com/lit/pdf/slua887), and [Track 01 §2.1–2.2 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-2-intermediate--applied).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution below ---


def v_peak_turnoff(v_bus, l_loop_nh, di_amp, dt_ns):
    """The peak drain-source voltage at turn-off: V_bus + L dI/dt."""
    # TODO 1: nH/ns is already 1 ohm, so L[nH] * dI[A] / dt[ns] is already a volt
    ...


def max_loop_inductance_nh(v_bus, v_peak_max, di_amp, dt_ns):
    """The largest loop inductance that keeps the spike under a ceiling."""
    # TODO 2: only the HEADROOM (ceiling minus bus) drives the overshoot - rearrange TODO 1
    ...


def gate_drive_current_a(qg_nc, tr_ns):
    """The average gate drive current: I_G = Q_g / t_r."""
    # TODO 3: nC/ns = A already; no 1e-9 factors anywhere in this one
    ...


def bootstrap_gate_v(v_sw, v_drv):
    """The absolute gate voltage of a high-side N-MOSFET."""
    # TODO 4: the bootstrap capacitor rides ON TOP of the phase node
    ...


def precharge_peak_a(v_bus, r_pre):
    """The t = 0 inrush into an uncharged bank."""
    # TODO 5: an uncharged bank is a short, so Ohm's law is the whole answer
    ...


def precharge_time_s(r_pre, c_bus, taus=5.0):
    """The pre-charge settle time."""
    # TODO 6: five time constants, not one
    ...


def bus_energy_j(c_bus, v_bus):
    """The energy stored in the capacitor bank."""
    # TODO 7: 1/2 C V^2 - the half is not optional
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **The budget is a headroom, not a ceiling.** The $60.0\text{ V}$ limit is the *peak*, so only $60.0 - 48.0 = 12.0\text{ V}$ of it may come from the $L\,dI/dt$ term; budgeting the whole $60\text{ V}$ gives $12.5\text{ nH}$ and ships a board that overshoots.
2. **Units by inspection.** $\text{nH}/\text{ns} = 1\ \Omega$, so $\Delta V = L_{\text{nH}} \cdot \frac{\Delta I}{\Delta t_{\text{ns}}}$ needs no $10^{-9}$ anywhere; solving for $L$ gives $L_{\text{nH}} = \Delta V \cdot \frac{\Delta t_{\text{ns}}}{\Delta I}$.
3. **The check that proves it.** Feed $6.0\text{ nH}$ back into `v_peak_turnoff` at $\Delta I = 30.0\text{ A}$, $\Delta t = 15\text{ ns}$: it must land exactly on $60.0\text{ V}$, and $6.5\text{ nH}$ must land above it.
4. **Do not mix the other two answers in.** The bootstrap gate ($48 + 12 = 60\text{ V}$) and the pre-charge inrush ($48/48 = 1.0\text{ A}$) are separate helpers with their own units; only the inductance budget uses the $12\text{ V}$ headroom.

5. **What the suite refuses.** `v_peak_turnoff` raises on a negative bus or loop inductance and on a zero commutation time; `max_loop_inductance_nh` raises on a ceiling at or below the bus, a zero current change and a zero commutation time; `gate_drive_current_a` raises on a zero rise time, `bootstrap_gate_v` on a dead driver (a non-positive driver supply), `precharge_peak_a` on a zero pre-charge resistor (a bare wire) and `bus_energy_j` on a negative capacitance - every one a `ValueError`.

### Full Solution
```python
import math  # noqa: F401  (kept so the submission imports what the module uses)

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def v_peak_turnoff(v_bus, l_loop_nh, di_amp, dt_ns):
    """V_peak = V_bus + L_loop dI/dt, with L in nH and dt in ns (nH/ns = 1 ohm)."""
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if l_loop_nh < 0.0:
        raise ValueError("a loop inductance cannot be negative")
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    return v_bus + l_loop_nh * (di_amp / dt_ns)


def max_loop_inductance_nh(v_bus, v_peak_max, di_amp, dt_ns):
    """The largest loop inductance whose overshoot still fits under v_peak_max."""
    if dt_ns <= 0.0:
        raise ValueError("a commutation takes a positive time")
    if di_amp <= 0.0:
        raise ValueError("there is no overshoot without a current change")
    headroom = v_peak_max - v_bus
    if headroom <= 0.0:
        raise ValueError("a ceiling at or below the bus leaves no headroom")
    return headroom * dt_ns / di_amp


def gate_drive_current_a(qg_nc, tr_ns):
    """I_G = Q_g / t_r, with Q_g in nC and t_r in ns (nC/ns = 1 A)."""
    if qg_nc < 0.0:
        raise ValueError("a gate charge cannot be negative")
    if tr_ns <= 0.0:
        raise ValueError("a rise time must be positive")
    return qg_nc / tr_ns


def bootstrap_gate_v(v_sw, v_drv):
    """V_G = V_SW + V_drv: the bootstrap capacitor rides on top of the phase node."""
    if v_drv <= 0.0:
        raise ValueError("a gate driver needs a positive supply")
    return v_sw + v_drv


def precharge_peak_a(v_bus, r_pre):
    """I_pre,peak = V_bus / R_pre, the t = 0 inrush into an uncharged bank."""
    if v_bus < 0.0:
        raise ValueError("the bus voltage cannot be negative")
    if r_pre <= 0.0:
        raise ValueError("pre-charging needs a resistor, not a short")
    return v_bus / r_pre


def precharge_time_s(r_pre, c_bus, taus=5.0):
    """The settle time t = taus R C; five time constants is the module's 99.3% point."""
    if r_pre <= 0.0 or c_bus <= 0.0:
        raise ValueError("a time constant needs a positive resistance and capacitance")
    if taus <= 0.0:
        raise ValueError("a settle time needs a positive number of time constants")
    return taus * r_pre * c_bus


def bus_energy_j(c_bus, v_bus):
    """E = 1/2 C V^2, the energy stored in the bank - and the energy the pre-charge burns."""
    if c_bus < 0.0:
        raise ValueError("a capacitance cannot be negative")
    return 0.5 * c_bus * v_bus * v_bus


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

l_max = max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0)
v_at_max = v_peak_turnoff(48.0, l_max, 30.0, 15.0)
v_over = v_peak_turnoff(48.0, 6.5, 30.0, 15.0)

assert math.isclose(l_max, 6.0, abs_tol=1e-9)
assert math.isclose(v_at_max, 60.0, abs_tol=1e-12)
assert v_over > 60.0
assert math.isclose(gate_drive_current_a(45.0, 30.0), 1.5, abs_tol=1e-12)
assert math.isclose(bootstrap_gate_v(48.0, 12.0), 60.0, abs_tol=1e-12)
assert math.isclose(precharge_peak_a(48.0, 48.0), 1.0, abs_tol=1e-12)
assert math.isclose(precharge_time_s(48.0, 1000e-6), 0.24, abs_tol=1e-12)
assert math.isclose(bus_energy_j(1000e-6, 48.0), 1.152, abs_tol=1e-12)

print(f"L_loop_max={l_max:.2f} nH | V_peak at the ceiling={v_at_max:.2f} V | V_peak at 6.5 nH={v_over:.2f} V")
print(f"gate I={gate_drive_current_a(45.0, 30.0):.2f} A | bootstrap V_G={bootstrap_gate_v(48.0, 12.0):.0f} V")
print(f"inrush={precharge_peak_a(48.0, 48.0):.2f} A | 5tau={precharge_time_s(48.0, 1000e-6):.2f} s | E={bus_energy_j(1000e-6, 48.0):.3f} J")
```

Printed: `L_loop_max=6.00 nH | V_peak at the ceiling=60.00 V | V_peak at 6.5 nH=61.00 V`, then `gate I=1.50 A | bootstrap V_G=60 V`, then `inrush=1.00 A | 5tau=0.24 s | E=1.152 J`.

**On the shared arm.** The Transfer suite puts this module's pre-charge and bus energy on the plant's clock and its torque clamp:

```python
import mechalab_plant as plant

# The 0.24 s pre-charge is 240 plant ticks, and the 1.152 J bank would hold the arm's 2.5 N*m
# clamp for 460.8 ticks - the bank outlasts the window that filled it.
precharge_ticks = 0.24 / plant.DT
per_tick_j = plant.TAU_LIMIT * plant.DT
assert abs(precharge_ticks - 240.0) < 1e-9
assert abs(1.152 / per_tick_j - 460.8) < 1e-9
assert 1.152 / per_tick_j > precharge_ticks
print("plant tick=%.0f ms | pre-charge=%.0f ticks | 1.152 J holds the clamp for %.1f ticks"
      % (plant.DT * 1e3, precharge_ticks, 1.152 / per_tick_j))
```

### Break it on purpose
- **Inject:** the timing bug that ships real boards — hand the overshoot helper a time in microseconds instead of seconds (`dt_s = 20e-6` where the transition is really $\Delta t_{\text{sw}} = 20\text{ ns} = 20 \times 10^{-9}\text{ s}$), then re-run the $20\text{ nH}$ 2-layer case.
- **Symptom:** $V_{\text{peak}} = 48.0 + (20 \times 10^{-9}) \frac{30.0}{20 \times 10^{-6}} = 48.0 + 0.03 = 48.03\text{ V}$ — a $0.03\text{ V}$ overshoot where the physics says $30.0\text{ V}$. The check now reads "comfortably under $75\text{ V}$" and the $20\text{ nH}$ board ships with a real $78.0\text{ V}$ spike into FETs rated $75\text{ V}$.
- **Diagnose:** the overshoot term is inversely proportional to switching time, so a spike that comes out near zero is a units error, never a good layout: a $\Delta V$ a factor of $10^{3}$ too small is exactly the $10^{3}$ gap between $\mu\text{s}$ and $\text{ns}$ (a $10^{6}$ gap would mean $\text{ms}$). Sanity-check the exponent before trusting the number — $20\text{ ns}$ of commutation is tens of volts, $20\ \mu\text{s}$ is millivolts.
- **Fix:** keep the whole chain in SI seconds (`dt_s = 20e-9`), or use this module's own shortcut that $\text{nH}/\text{ns} = 1\ \Omega$: $L_{\text{nH}} \cdot \frac{\Delta I}{\Delta t_{\text{ns}}} = 20.0 \times \frac{30.0}{20.0} = 30.0\text{ V}$ of overshoot. The check that proves the fix is the asserted value itself: $V_{\text{peak}} = 48.0 + 30.0 = 78.0\text{ V}$, which is *not* under the $75\text{ V}$ ceiling — only the 4-layer $L_{\text{loop}} = 4.0\text{ nH}$ layout brings it back to $54.0\text{ V}$.

## 6. Simulation path
Open **3D CAD & 48V PCB — Loop Inductance Ringing & Thermal Solver** in the MechaLab Workbench (`npm run dev`) and sweep $L_{\text{loop}}$ from $2\text{ nH}$ to $25\text{ nH}$ to watch the $V_{DS}$ turn-off ringing spike grow toward the MOSFET avalanche limit, or run the Worked Example Python script above (for `KiCad 8+` and `kicad-cli` installation, verification, and ERC/DRC/Gerber export, see [`resources/open-source-toolchains.md` §0](../resources/open-source-toolchains.md#0-core-supported-os-environment-terminal-bootstrap--python-venv-setup) and [`01-electronics-and-power/README.md` §2.1](../01-electronics-and-power/README.md#21-schematic-capture-smd-footprints--4-layer-kicad-pcb-layout)).

### Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before touching hardware or taking the Skip/Gate test):**
> 1. **48 V Bus Pre-Charge & Bleeder Discipline:** Never hot-plug a $24\text{–}48\text{ V}$ battery or high-current supply directly into an uncharged inverter capacitor bank ($>500\ \mu\text{F}$). Always engage a series **pre-charge resistor** ($33\text{–}100\ \Omega$ power resistor) until $V_{\text{cap}} \ge 0.95\,V_{\text{bus}}$ before closing the main contactor/switch, and include a permanent **bleeder resistor + LED** across the DC bus so stored energy discharges to $<5\text{ V}$ after power-off.
> 2. **Voltage Overshoot & TVS Clamping:** Always derate silicon MOSFET $V_{DS,\max}$ to $\ge 1.6\times V_{\text{bus}}$ (e.g., $80\text{–}100\text{ V}$ FETs for a $48\text{ V}$ bus) and place an SMBJ58A/SMBJ60A Transient Voltage Suppressor (TVS) diode across the DC bus.
> 3. **Protective Eyewear & Current-Limited First Bring-Up:** Wear safety glasses during initial $48\text{ V}$ power-stage bring-up and bring up gate drive waveforms at $V_{\text{bus}} = 12\text{ V}$, $I_{\text{limit}} = 0.5\text{ A}$ with no motor attached before stepping up to $48\text{ V}$.
> 4. **Oscilloscope Earth-Ground Clip Short Hazard & Pigtail Spring Tip Rule:** Every standard bench oscilloscope BNC shell and passive probe alligator ground clip is wired directly to **AC mains protective earth ground**. Never clip a passive probe's ground lead onto a floating switching phase node (`SW`) or high-side MOSFET source—doing so creates a dead short to earth ground when the high-side FET turns on! Always connect passive probe ground clips **only to DC bus negative (`PGND`)** using the coaxial **pigtail spring ground tip** ($<3\text{ mm}$ loop, avoiding the $15\text{ cm}$ alligator lead's $\sim 150\text{ nH}$ ringing inductance), and use a **High-Voltage Differential Probe** (or two channels in `CH1 - CH2` math mode with ground clips on `PGND`) to inspect high-side $V_{GS}$.


```mermaid
flowchart LR
    A["01-electronics.T2.01b: parasitic_loop_inductance_voltage_overshoot"] --> B["bootstrap_high_side_gate_driver_and_deadtime"]
    B --> C["precharge_resistor_inrush_and_tvs_clamp"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: read `### Safety notes`, score $\ge 80\%$ ($5/6$, $100\%$ on `[SAFETY]` items) on the Skip test, or score $\ge 80\%$ ($7/8$, $100\%$ on `[SAFETY]` items) on the Ladder Gate test to unlock Step 2.2 (`01-electronics.T2.02`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: parasitic_loop_inductance_voltage_overshoot]` Compute the peak Drain-to-Source voltage $V_{\text{peak}} = V_{\text{bus}} + L_{\text{loop}}\frac{\Delta I}{\Delta t}$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) when $V_{\text{bus}} = 48.0\text{ V}$, $L_{\text{loop}} = 5.0\text{ nH}$, and $\Delta I = 24.0\text{ A}$ turns off in $\Delta t = 15.0\text{ ns}$.
2. `[Apply] [Concept: bootstrap_high_side_gate_driver_and_deadtime]` Compute the average gate drive current $I_G = Q_g / t_r$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) required to charge a MOSFET gate with $Q_g = 45\text{ nC}$ in $t_r = 30\text{ ns}$.
3. `[Transfer] [Concept: precharge_resistor_inrush_and_tvs_clamp]` Compute the stored bus energy $E_{\text{cap}} = \frac{1}{2} C_{\text{bus}} V_{\text{bus}}^2$ in joules ($\text{J}$, tolerance $\pm 10^{-6}$) in a $C_{\text{bus}} = 1500\ \mu\text{F}$ ($0.0015\text{ F}$) inverter capacitor bank charged to $V_{\text{bus}} = 48.0\text{ V}$.
4. `[SAFETY] [Concept: precharge_resistor_inrush_and_tvs_clamp]` What happens if you hot-plug a $48\text{ V}$ LiPo battery ($R_{\text{internal}} = 15\text{ m}\Omega$) directly into an uncharged $1500\ \mu\text{F}$ inverter capacitor bank without a pre-charge resistor?
   - **A.** Nothing; capacitors block inrush current.
   - **B.** The uncharged capacitor bank acts as a $0\text{ V}$ short at $t=0$, drawing an instantaneous inrush surge of $>1000\text{ A}$ that vaporizes connector pins, welds relays shut, and can avalanche the MOSFETs via $L\,di/dt$ ringing.
   - **C.** The battery voltage drops permanently to $12\text{ V}$.
   - **D.** The CAN bus baud rate doubles.
5. `[SAFETY] [Concept: parasitic_loop_inductance_voltage_overshoot]` On a 4-layer motor controller PCB (`L1: Signal/Power`, `L2: Solid GND`, `L3: Power/Signal`, `L4: Signal`), why must you **never** cut slots across the Layer-2 ground plane beneath the high-speed gate drive or commutation loop?
   - **A.** Because slots make the PCB heavier.
   - **B.** Because cutting the return plane forces high-frequency return current to detour around the slot, dramatically expanding magnetic loop area, increasing $L_{\text{loop}}$ voltage spikes, and injecting common-mode noise into ADC signals.
   - **C.** Because KiCad cannot export Gerbers with slots.
   - **D.** Because copper planes only conduct DC.
6. `[Spaced review -> 01-electronics.T2.01a — Concept: differential_shunt_gain_and_cmrr]` A differential amplifier has a gain of $20.0$ and a differential input of $50.0\,\text{mV}$. Compute its output in volts (tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_vpeak = 48.0 + 5.0 * (24.0 / 15.0)
q2_ig = 45.0 / 30.0
q3_ecap = 0.5 * 0.0015 * (48.0 ** 2)
q4_safety_choice = "B"
q5_safety_choice = "B"
assert math.isclose(q1_vpeak, 56.0, rel_tol=1e-6)
assert math.isclose(q2_ig, 1.5, rel_tol=1e-6)
assert math.isclose(q3_ecap, 1.728, rel_tol=1e-9)
assert q4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert q5_safety_choice == "B"  # Mandatory [SAFETY] 100% required
q6_review = 20.0 * 50.0e-3
assert math.isclose(q6_review, 1.0, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $5/6$ overall ($80\%+$) AND $2/2$ ($100\%$) on Q4 and Q5 (`[SAFETY]`). If you missed Q1 or Q5, study `## 3. Formalization` item 1; if you missed Q2, study `## 3. Formalization` item 2; if you missed Q3 or Q4, study `## 3. Formalization` item 3 and `### Safety notes`. If you missed  Q6, review `01-electronics.T2.01a`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 01 Tier 2 bridge ladder (`01-electronics.T2.01a` $\to$ `01-electronics.T2.01b`) before Step 2.2 (`01-electronics.T2.02`):
1. `[Concept: opamp_negative_feedback_virtual_short]` Under negative feedback without saturation, what is the ideal voltage difference $V_+ - V_-$ across an op-amp's inputs (tolerance $\pm 10^{-6}\text{ V}$)?
2. `[Concept: differential_shunt_gain_and_cmrr]` Compute the ADC voltage $V_{\text{ADC}} = 1.65 + G \cdot I \cdot R_{\text{shunt}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for $G = 20.0\text{ V/V}$, $R_{\text{shunt}} = 0.002\ \Omega$, and $I = +20.0\text{ A}$.
3. `[Concept: kelvin_four_terminal_sense_routing]` Why must the two sense traces from a $2\text{ m}\Omega$ current shunt tap dedicated inner Kelvin pads rather than the main power solder pads?
   - **A.** To eliminate the $I_{\text{load}} R_{\text{trace}}$ voltage drop across the power solder joint and copper pour, which would otherwise cause $30\text{–}60\%$ current gain error.
   - **B.** To increase the shunt resistance to $10\ \Omega$.
   - **C.** To bypass the differential amplifier.
   - **D.** To heat up the ADC pin.
4. `[Concept: parasitic_loop_inductance_voltage_overshoot]` Compute the inductive voltage spike $\Delta V = L_{\text{loop}} \frac{\Delta I}{\Delta t}$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$) for $L_{\text{loop}} = 3.0\text{ nH}$, $\Delta I = 30.0\text{ A}$, and $\Delta t = 15.0\text{ ns}$.
5. `[Concept: bootstrap_high_side_gate_driver_and_deadtime]` When a high-side MOSFET is conducting and the switching node sits at $V_{\text{SW}} = 48.0\text{ V}$, what absolute voltage $V_G$ (relative to $\text{GND}$, tolerance $\pm 10^{-6}\text{ V}$) must a $12.0\text{ V}$ bootstrap gate driver apply to the high-side Gate pin to achieve $V_{GS} = +12.0\text{ V}$?
6. `[Concept: precharge_resistor_inrush_and_tvs_clamp]` Compute the initial peak pre-charge current $I_{\text{pre}} = V_{\text{bus}} / R_{\text{pre}}$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) when pre-charging a $48.0\text{ V}$ bus through $R_{\text{pre}} = 60.0\ \Omega$.
7. `[SAFETY] [Concept: precharge_resistor_inrush_and_tvs_clamp]` Compute the stored electric energy $E = \frac{1}{2} C_{\text{bus}} V_{\text{bus}}^2$ in joules ($\text{J}$, tolerance $\pm 10^{-6}$) in a $C_{\text{bus}} = 2000\ \mu\text{F}$ ($0.002\text{ F}$) capacitor bank charged to $V_{\text{bus}} = 48.0\text{ V}$.
8. `[SAFETY] [Concept: precharge_resistor_inrush_and_tvs_clamp]` Before touching or probing a powered-down $48\text{ V}$ motor inverter PCB with metal tools, what mandatory check must you perform?
   - **A.** Assume the capacitors discharged instantly and touch the bus bars with a screwdriver.
   - **B.** Verify the bleeder LED is extinguished **and** measure $V_{\text{bus}}$-to-$\text{GND}$ with a DMM to confirm the bulk capacitors have discharged below $<5.0\text{ V}$.
   - **C.** Short the $48\text{ V}$ bus with tweezers.
   - **D.** Unplug the USB cable only.

**Gate answer key:**
```python
import math

g1_vdiff = 0.0
g2_vadc = 1.65 + 20.0 * 20.0 * 0.002
g3_choice = "A"
g4_dv = 3.0 * (30.0 / 15.0)
g5_vg = 48.0 + 12.0
g6_ipre = 48.0 / 60.0
g7_energy_j = 0.5 * 0.002 * (48.0 ** 2)
g8_safety_choice = "B"

assert math.isclose(g1_vdiff, 0.0, abs_tol=1e-6)
assert math.isclose(g2_vadc, 2.45, rel_tol=1e-9)
assert g3_choice == "A"
assert math.isclose(g4_dv, 6.0, rel_tol=1e-6)
assert math.isclose(g5_vg, 60.0, rel_tol=1e-6)
assert math.isclose(g6_ipre, 0.80, rel_tol=1e-9)
assert math.isclose(g7_energy_j, 2.304, rel_tol=1e-6)  # Mandatory [SAFETY] 100% required
assert g8_safety_choice == "B"                         # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $7/8$ overall AND $2/2$ ($100\%$) on `[SAFETY]` questions Q7 and Q8. Remediation: Q1–Q3 $\to$ `01-electronics.T2.01a`; Q4–Q8 $\to$ `01-electronics.T2.01b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| High-side MOSFET turns off after a few milliseconds when commanded to $100\%$ duty cycle | Bootstrap capacitor $C_{\text{boot}}$ leaked its charge because the low-side FET never turned on to refresh it. | Clamp maximum PWM duty cycle to $\le 98\%$ so the low-side FET turns on briefly every PWM cycle to recharge $C_{\text{boot}}$ (or use a gate driver with an internal trickle charge pump like `DRV8323`/`DRV8353`). |
| XT60 connector tips vaporize with a loud pop on battery plug-in | No pre-charge circuit ahead of the bulk capacitor bank. | Use an anti-spark XT90-S connector or a $47\ \Omega$ pre-charge resistor switch before closing the main battery path. |
| MOSFETs fail in avalanche during fast turn-off at $48\text{ V}$ | High-frequency ceramic decoupling capacitors were placed too far from the half-bridge Drain/Source pins ($L_{\text{loop}} > 15\text{ nH}$). | Place low-ESL MLCC ceramic capacitors within $<2\text{ mm}$ of every half-bridge leg over an unbroken Layer-2 ground plane. |

## 9. Resources
- **Henry Ott — *Electromagnetic Compatibility Engineering* & Texas Instruments `SLVA714` (* Layout Guide for Motor Drivers*, `resources/textbooks-and-papers.md`):** 4-layer stackup, return-current planes, and hot-loop minimization `[VERIFIED 2026-10-15]`.
- **Track 01 (`01-electronics-and-power/README.md`):** Directly continues into Step 2.2 (`01-electronics.T2.02`) `[VERIFIED 2026-10-15]`.
## 10. Next modules

<!-- next-step:start -->
👉 **Next:** [Step 5 · Build the arm: mechanics — 02-mechanics.T2.02a: 6-DOF Rigid-Body Degrees of Freedom, 3D Homogeneous Transforms (SE(3)), Velocity Jacobians & Parallel-Axis Inertia](02-mechanics.T2.02a.md)
<!-- next-step:end -->
