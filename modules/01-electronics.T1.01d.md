---
id: 01-electronics.T1.01d
title: "Capacitors, Inductors, RC Time Constants & Inductive Flyback"
track: "01"
tier: 1
prereqs:
  - 01-electronics.T1.01c
new_concepts:
  - capacitor_charge_storage_and_decoupling
  - rc_time_constant_and_filtering
  - inductor_flyback_and_freewheeling_diode
uses:
  - voltage_current_resistance_ohms_law
  - kvl_kcl_and_voltage_divider
  - multimeter_and_current_limited_psu_safety
est_hours: 3.0
hardware_required: false
safety_level: low
resources_verified: true
difficulty:
  math: 3
  coding: 3
  tools: 2
  hardware_risk: medium
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 4 of 10 · Power the joint: electronics**
>
> **Run this in the workbench.** [Open MechaLab with `EX.01-electronics.T1.01d` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.01-electronics.T1.01d) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
Resistors respond instantaneously to voltage changes, but every real motor drive is dominated by two energy-storage components: **capacitors** (which store electric-field energy to stabilize power rails and filter noisy sensors) and **inductors** (the copper coils inside every motor, which store magnetic-field energy and unleash destructive high-voltage flyback spikes if switched off without a return path). Understanding $I_C = C\frac{dV}{dt}$ and $V_L = L\frac{dI}{dt}$ prepares you directly for PWM switching in `01-electronics.T1.01b` and Step 1.2 (`01-electronics.T1.02`). Already know this? Take the Skip test in section 7 first.

## 2. Intuition first

<!-- figure: rc-charge | RC is the time constant: 63% charged after one, within a percent after five. -->

Think of a **capacitor** as a rubber diaphragm stretched across a water pipe—or a tiny rechargeable pressure tank mounted right next to a thirsty valve. Voltage across a capacitor cannot jump instantaneously ($I_C = C\frac{dV}{dt}$): when a microcontroller or H-bridge suddenly gulps a spike of current, a **decoupling capacitor** right next to its pins supplies that instant gulp before the long supply wires can droop. Conversely, think of an **inductor** (a motor coil) as a heavy paddlewheel spinning inside the pipe. Because of magnetic inertia, **current through an inductor cannot stop instantaneously** ($V_L = L\frac{dI}{dt}$). If you slam a valve shut on a spinning paddlewheel, the water hammers against the closed valve with a massive pressure spike (**inductive flyback**) that bursts the pipe—unless you provide a **freewheeling diode** loop so the current can coast down smoothly through its own coil resistance.

## 3. Formalization
1. **Capacitor Law ($I_C = C\frac{dV}{dt}$) and Stored Energy:** A capacitor of capacitance $C$ in farads ($\text{F}$) stores charge $Q = C V$ ($\text{C}$) and electric energy $E_C = \frac{1}{2} C V^2$ ($\text{J}$). To hold rail voltage droop $\Delta V$ ($\text{V}$) below a limit during a current pulse $\Delta I$ ($\text{A}$) lasting $\Delta t$ ($\text{s}$):

$$
\Delta V = \frac{\Delta I \cdot \Delta t}{C} \iff C \ge \frac{\Delta I \cdot \Delta t}{\Delta V}
$$

   Substituting $\Delta I = 2.0\text{ A}$, $\Delta t = 5.0\ \mu\text{s}$, and max droop $\Delta V = 0.10\text{ V}$ requires $C \ge 100\ \mu\text{F}$.
2. **RC Charging Time Constant ($\tau = R C$) and Cutoff Frequency ($f_c$, the $-3\text{ dB}$ Half-Power Point):** Charging a capacitor $C$ through resistor $R$ ($\Omega$) from $0\text{ V}$ toward $V_{\text{in}}$ follows:

$$
V_C(t) = V_{\text{in}}\left(1 - e^{-t/(RC)}\right), \quad \tau = R C, \quad f_c = \frac{1}{2\pi R C}
$$

   At $t = 1\tau$, $V_C(\tau) = 0.6321\,V_{\text{in}}$; at $t = 5\tau$, $V_C(5\tau) = 0.9933\,V_{\text{in}}$. For a sine-wave input at the **cutoff frequency** $f = f_c$, output amplitude drops to $\frac{1}{\sqrt{2}} \approx 0.7071$ ($70.71\%$ of input voltage, or $\left(\frac{1}{\sqrt{2}}\right)^2 = 50\%$ power, called the **$-3\text{ dB}$ point** on the logarithmic decibel scale $20\log_{10}(0.7071) \approx -3.01\text{ dB}$ taught inline in [`07-systems.T1.07a`](07-systems.T1.07a.md)) with $-45^\circ$ phase lag. Substituting $R = 1.0\text{ k}\Omega$ and $C = 1.0\ \mu\text{F}$ gives $\tau = 1.0\text{ ms}$ and $f_c = 159.15\text{ Hz}$.
3. **Inductor Law ($V_L = L\frac{dI}{dt}$), Stored Magnetic Energy & Flyback Clamp:** A motor winding of inductance $L$ in henries ($\text{H}$) carrying current $I$ ($\text{A}$) stores magnetic energy $E_L = \frac{1}{2} L I^2$ ($\text{J}$) and induces voltage:

$$
V_L = L \frac{dI}{dt}
$$

   Interrupting $I = 2.0\text{ A}$ in $L = 5.0\text{ mH}$ over $\Delta t = 1.0\ \mu\text{s}$ without a diode produces $|V_L| = 0.005 \times (2.0 / 10^{-6}) = 10{,}000\text{ V}$, punching through any silicon transistor! Placing a freewheeling diode across the coil clamps the switch node to $V_{\text{bus}} + V_f$ ($\approx V_{\text{bus}} + 0.7\text{ V}$).

## 4. Worked example
**Predict first (before you run it):** Commit to two numbers before you run the block. (1) The capacitor starts at $0\text{ V}$ and charges toward $3.3\text{ V}$ through $\tau = RC = 1.0\text{ ms}$: at $t = 1\tau$, do you expect $V_C$ to have crossed half of $3.3\text{ V}$, and roughly where between $1.6\text{ V}$ and $2.2\text{ V}$ does it actually land? (2) Opening a $L = 3.0\text{ mH}$ coil carrying $I = 2.0\text{ A}$ in $\Delta t = 0.5\ \mu\text{s}$ is a $4\ \text{A}/\mu\text{s}$ current slope: predict whether $|V_L| = L\frac{di}{dt}$ comes out near the $12.0\text{ V}$ bus, near $120\text{ V}$, or three orders of magnitude above the bus. Wrong-result signatures: a $V_C(1\tau)$ below $1.6\text{ V}$ means you evaluated $t = \tau/2$ or mis-signed the exponent, and an unclamped spike within a few volts of the bus means the micro prefix on $\Delta t$ was dropped ($0.5\text{ ms}$ instead of $0.5\ \mu\text{s}$).
Compute the RC charging curve at $t = 1\tau$ and $t = 5\tau$ for $R = 10\text{ k}\Omega, C = 0.1\ \mu\text{F}$ ($\tau = 1.0\text{ ms}$), and compare the unclamped inductive flyback spike of a $L = 3.0\text{ mH}$ coil carrying $I = 2.0\text{ A}$ opened in $\Delta t = 0.5\ \mu\text{s}$ against a diode-clamped switch node on a $12.0\text{ V}$ bus.

```python
import math

R = 10_000.0
C = 0.1e-6
tau = R * C
fc = 1.0 / (2.0 * math.pi * R * C)
v_1tau = 3.3 * (1.0 - math.exp(-1.0))
v_5tau = 3.3 * (1.0 - math.exp(-5.0))

L = 0.003
I_coil = 2.0
dt_open = 0.5e-6
v_flyback_unclamped = L * (I_coil / dt_open)
v_flyback_clamped = 12.0 + 0.7
e_mag_j = 0.5 * L * (I_coil ** 2)

assert math.isclose(tau, 0.001, rel_tol=1e-9)
assert math.isclose(fc, 159.154943, rel_tol=1e-5)
assert math.isclose(v_1tau, 2.086014, rel_tol=1e-5)
assert math.isclose(v_5tau, 3.277765, rel_tol=1e-5)
assert math.isclose(v_flyback_unclamped, 12_000.0, rel_tol=1e-9)
assert math.isclose(v_flyback_clamped, 12.7, rel_tol=1e-9)
assert math.isclose(e_mag_j, 0.006, rel_tol=1e-9)
print(f"tau={tau*1e3:.1f} ms, fc={fc:.2f} Hz, Unclamped flyback={v_flyback_unclamped:.0f} V vs Clamped={v_flyback_clamped:.1f} V")
```
Expected output:
```text
tau=1.0 ms, fc=159.15 Hz, Unclamped flyback=12000 V vs Clamped=12.7 V
```

## 5. Exercise
Calculate the minimum bulk decoupling capacitance $C_{\min}$ in microfarads ($\mu\text{F}$) needed to keep a $12.0\text{ V}$ motor bus from drooping by more than $\Delta V = 0.25\text{ V}$ during a $\Delta I = 3.0\text{ A}$ current transient lasting $\Delta t = 20\ \mu\text{s}$ ($20 \times 10^{-6}\text{ s}$). Verify $C_{\min} = \frac{\Delta I \cdot \Delta t}{\Delta V} = 240.0\ \mu\text{F}$.
- **If your result differs:** Check your unit conversion from farads to microfarads: $\frac{3.0 \times 20\times 10^{-6}}{0.25} = 0.00024\text{ F} = 240.0\ \mu\text{F}$.

### Graded package - the time constant, the droop and the spike
[`exercises/01-electronics.T1.01d/`](../exercises/01-electronics.T1.01d/) turns this section into a test. `starter.py` holds seven holes: `rc_time_constant`, `rc_voltage`, `rc_cutoff_hz` (the $2\pi$), `bulk_capacitance_f` (the transient time), `capacitor_energy` (the half), `inductor_energy` and `flyback_voltage` ($L\Delta I/\Delta t$, in volts not millivolts). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/01-electronics.T1.01d/starter.py \
  python3 -m unittest discover -s exercises/01-electronics.T1.01d -p 'test_*.py'
```

**29 tests.** The charging curve is checked at one time constant ($63.2\%$), five ($99.3\%$) and at the Break-it droop ($100\ \mu\text{F}$ sags $0.60\text{ V}$, $470\ \mu\text{F}$ $0.128\text{ V}$), so a linear ramp fails; the cutoff is checked against $1/(2\pi RC)$, so a missing $2\pi$ fails by $6.28\times$; the bulk value is checked at the exercise's $240\ \mu\text{F}$; the energies carry the $\tfrac12$; and the unclamped $12\text{ kV}$ spike is checked against a $12.7\text{ V}$ clamped node. The transfer suite puts **the plant's own constants** through the same laws: a $1\ \mu\text{F}$ capacitor with $159.155\ \Omega$ has its corner exactly on the plant's $1\text{ kHz}$ tick, the shoulder's $I_1/B_1 = 0.2\text{ s}$ mechanical lag obeys the same $63.2\% / 99.3\%$ law, and the elbow's $I_2/B_2$ is quicker. Five planted faults - `cutoff_forgets_2pi`, `charging_linear_ramp`, `bulk_missing_time`, `capacitor_energy_forgets_half`, `flyback_milli_dropped` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (SI Prefixes $\mu\text{F}, \text{mH}, \text{ns}$) and [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Stored Energy*).
  - **Prerequisite Bridge Modules:** [`01-electronics.T1.01a`](01-electronics.T1.01a.md) and [`01-electronics.T1.01c`](01-electronics.T1.01c.md).
  - **Core Concepts to Review First:** Capacitor current $I = C\frac{dV}{dt}$, RC time constant $\tau = RC$ and $-3\text{ dB}$ cutoff $f_c = \frac{1}{2\pi RC}$, and inductor voltage spike $V_L = L\frac{dI}{dt}$ with flyback clamping in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Falstad Interactive Circuit Simulator (`falstad.com/circuit`)](https://www.falstad.com/circuit/), [All About Circuits RC & L/R Time Constants](https://www.allaboutcircuits.com/textbook/direct-current/), and [Track 01 §1.1–1.3 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-1-beginner--intuitive).

### Starter code
The exercise is one droop budget: how much charge the transient moves, divided by how much sag you are willing to accept. Fill the seven TODOs, then compare against the full solution below.

```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import math

import mechalab_plant as plant  # noqa: F401  (the shared arm, as every graded package here imports it)


def rc_time_constant(r_ohm, c_farad):
    """tau = R C, in seconds."""
    # TODO 1: multiply resistance by capacitance; the farads are already farads
    ...


def rc_voltage(t_s, v_in, r_ohm, c_farad):
    """V_C(t) for a capacitor charging from zero."""
    # TODO 2: 1 - exp(-t / tau) - a straight ramp is the classic wrong answer
    ...


def rc_cutoff_hz(r_ohm, c_farad):
    """fc = 1 / (2 pi R C): the -3 dB corner."""
    # TODO 3: the 2 pi belongs in the denominator, with tau = R C
    ...


def bulk_capacitance_f(delta_i, delta_t, delta_v):
    """C >= delta_I * delta_t / delta_V, in farads."""
    # TODO 4: the transient TIME is in the numerator, not the droop budget
    ...


def capacitor_energy(v_cap, c_farad):
    """E_C = 1/2 C V^2, in joules."""
    # TODO 5: the half, and the voltage squared
    ...


def inductor_energy(inductance_h, current):
    """E_L = 1/2 L I^2, in joules."""
    # TODO 6: the half, and the current squared
    ...


def flyback_voltage(inductance_h, current, dt_open_s):
    """The unclamped spike when the coil's current is interrupted."""
    # TODO 7: L * I / dt, with dt in SECONDS - 0.5 us is 0.5e-6, not 0.5
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **A capacitor is charge per volt.** The transient moves $Q = \Delta I\,\Delta t = 3.0 \times 20\ \mu\text{s} = 60\ \mu\text{C}$; spreading that over a $0.25\text{ V}$ budget needs $60\ \mu\text{C} / 0.25\text{ V} = 240\ \mu\text{F}$. Dropping $\Delta t$ leaves $12\text{ F}$, which no parts bin has.
2. **Convert once, at the end.** $240\ \mu\text{F} = 240 \times 10^{-6} = 0.00024\text{ F}$; do the arithmetic in farads and multiply by $10^6$ only for the printed answer.
3. **Droop falls as $1/C$.** With the same transient, $100\ \mu\text{F}$ sags $0.60\text{ V}$ ($2.4\times$ the budget) and $470\ \mu\text{F}$ sags $0.128\text{ V}$ — so the fix is a bigger reservoir, not a slower transient.
4. **The two energies both carry the $\tfrac12$, and the spike is a unit trap.** $E_C = \tfrac12 C V^2$, $E_L = \tfrac12 L I^2$, and $V_L = L\Delta I/\Delta t$ with $\Delta t = 0.5\ \mu\text{s} = 0.5 \times 10^{-6}\text{ s}$; entering $0.5$ makes the $12\text{ kV}$ spike read $12\text{ V}$.

5. **What the suite refuses.** `rc_voltage` raises on a negative time, `bulk_capacitance_f` on a zero droop, `capacitor_energy` on a negative capacitance, `inductor_energy` on a negative inductance, `flyback_voltage` on a zero opening time, and `rc_time_constant` or `rc_cutoff_hz` on a non-positive part - every one a `ValueError`, since a negative charge store is not a smaller capacitor.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def rc_time_constant(r_ohm, c_farad):
    if r_ohm <= 0.0 or c_farad <= 0.0:
        raise ValueError("a time constant needs a positive resistance and capacitance")
    return r_ohm * c_farad


def rc_voltage(t_s, v_in, r_ohm, c_farad):
    if t_s < 0.0:
        raise ValueError("time does not run backwards")
    return v_in * (1.0 - math.exp(-t_s / rc_time_constant(r_ohm, c_farad)))


def rc_cutoff_hz(r_ohm, c_farad):
    return 1.0 / (2.0 * math.pi * rc_time_constant(r_ohm, c_farad))


def bulk_capacitance_f(delta_i, delta_t, delta_v):
    if delta_v <= 0.0:
        raise ValueError("a droop budget must be positive")
    if delta_t < 0.0:
        raise ValueError("the transient duration cannot be negative")
    return delta_i * delta_t / delta_v


def capacitor_energy(v_cap, c_farad):
    if c_farad < 0.0:
        raise ValueError("a capacitance cannot be negative")
    return 0.5 * c_farad * v_cap * v_cap


def inductor_energy(inductance_h, current):
    if inductance_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    return 0.5 * inductance_h * current * current


def flyback_voltage(inductance_h, current, dt_open_s):
    if dt_open_s <= 0.0:
        raise ValueError("interrupting a current takes a positive time")
    if inductance_h < 0.0:
        raise ValueError("an inductance cannot be negative")
    return inductance_h * current / dt_open_s


# The exercise: 3.0 A for 20 us, allowed to sag 0.25 V.
delta_i, delta_t, delta_v = 3.0, 20e-6, 0.25
c_min_f = bulk_capacitance_f(delta_i, delta_t, delta_v)
c_min_uf = c_min_f * 1e6

# The same transient through the parts-bin alternatives: droop = Q / C, so it falls as 1/C.
def droop(c_farad):
    return delta_i * delta_t / c_farad


# And the laws either side of it: the corner, and the energy both parts store.
tau = rc_time_constant(1_000.0, 1e-6)
fc = rc_cutoff_hz(1_000.0, 1e-6)
e_cap = capacitor_energy(12.0, 240e-6)
e_coil = inductor_energy(2e-3, 3.0)
v_spike = flyback_voltage(2e-3, 3.0, 0.5e-6)

assert math.isclose(c_min_f, 240e-6, rel_tol=1e-12)
assert math.isclose(c_min_uf, 240.0, rel_tol=1e-12)
assert math.isclose(droop(100e-6), 0.60, rel_tol=1e-9)
assert math.isclose(droop(470e-6), 0.127660, rel_tol=1e-5)
assert math.isclose(tau, 1e-3, rel_tol=1e-12)
assert math.isclose(fc, 159.154943, rel_tol=1e-6)
assert math.isclose(rc_voltage(tau, 3.3, 1_000.0, 1e-6), 3.3 * (1.0 - math.exp(-1.0)), rel_tol=1e-12)
assert math.isclose(e_cap, 0.01728, rel_tol=1e-12) and math.isclose(e_coil, 0.009, rel_tol=1e-12)
assert math.isclose(v_spike, 12_000.0, rel_tol=1e-12)

print(f"C_min={c_min_uf:.1f} uF; 100 uF droops {droop(100e-6):.3f} V, 470 uF droops "
      f"{droop(470e-6):.3f} V; tau={tau * 1e3:.3f} ms, fc={fc:.2f} Hz")
```

Printed: `C_min=240.0 uF; 100 uF droops 0.600 V, 470 uF droops 0.128 V; tau=1.000 ms, fc=159.15 Hz`

**On the shared arm.** The Transfer suite reads the arm's mechanical lag as the same first-order charging law:

```python
import math
import mechalab_plant as plant

# The shoulder's inertia over damping is a time constant, and it charges like an RC: 63.2% after
# one tau, 99.3% after five.
tau_mech = plant.I1 / plant.B1
assert abs(tau_mech - 0.2) < 1e-12
assert abs((1.0 - math.exp(-1.0)) - 0.6321205588) < 1e-9
assert 1.0 - math.exp(-5.0) > 0.99
print("plant shoulder tau=I1/B1=%.3f s | 1 tau=%.1f%%, 5 tau=%.3f%%"
      % (tau_mech, 100.0 * (1.0 - math.exp(-1.0)), 100.0 * (1.0 - math.exp(-5.0))))
```

### Break it on purpose
Swap the bulk reservoir for the wrong part and diagnose the droop from the measurement alone:
- **Inject:** build the same $12.0\text{ V}$ bus but fit the $100\ \mu\text{F}$ electrolytic you had in the parts bin instead of the $240\ \mu\text{F}$ the droop budget demanded, leaving $\Delta I = 3.0\text{ A}$ and $\Delta t = 20\ \mu\text{s}$ unchanged.
- **Symptom:** the loaded bus sags by $\Delta V = \frac{\Delta I \cdot \Delta t}{C} = \frac{3.0 \times 20\ \mu\text{s}}{100\ \mu\text{F}} = 0.60\text{ V}$ — that is $2.4\times$ the $0.25\text{ V}$ budget, roughly $5\%$ of a $12.0\text{ V}$ rail, and it shows up as flickering logic on the same bus, not as a hot part.
- **Diagnose:** droop scales as $\Delta V \propto 1/C$ while the transient itself ($\Delta I$, $\Delta t$, and the $6.0 \times 10^{-5}\text{ C}$ of charge it moves) has not changed, so a droop $2.4\times$ over budget means the capacitance is $100/240 \approx 0.42\times$ what the calculation required. Confirm it by measuring the sag with a scope or a fast multimeter at the driver's $V_{\text{bus}}$ pin rather than at the supply terminals — a droop that vanishes at the supply and persists at the pin is a missing local reservoir, while a droop at both is a supply-side limit.
- **Fix:** fit at least the $240\ \mu\text{F}$ of low-ESR bulk capacitance ($470\ \mu\text{F}$ electrolytic is the comfortable standard substitution) in parallel with the $100\text{ nF}$ ceramic at the pins, and prove it: $\Delta V = \frac{3.0 \times 20\ \mu\text{s}}{470\ \mu\text{F}} = 0.128\text{ V}$, half the $0.25\text{ V}$ budget even before the electrolytic's worst-case tolerance and aging derating are applied.

## 6. Simulation path
Simulate an RC step response and an inductive coil turn-off with and without a flyback diode in [Falstad Circuit Simulator](https://www.falstad.com/circuit/) (`Circuits -> Inductors -> Inductive Kickback`).

The graded package is also a workbench entry: **Modules -> `EX.01-electronics.T1.01d`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). When wiring Electrolytic bulk capacitors ($100\text{–}470\ \mu\text{F}$) in Step 1.2 (`01-electronics.T1.02`), always align the negative stripe (`-`) with $\text{GND}$ and choose a voltage rating $\ge 2\times V_{\text{bus}}$ (e.g., $\ge 25\text{ V}$ capacitor for a $12\text{ V}$ bus):
```text
[+12V Bus] ---+--- [100 uF Electrolytic (Stripe to GND)] ---+--- [100 nF Ceramic] ---+---> [H-Bridge VM Pin]
              |_____________________GND_____________________|________________________|
```
Pass/fail verification in simulation: `tau == 1.0 ms`, `fc == 159.15 Hz`, `v_flyback_unclamped == 12000 V`, and `v_flyback_clamped == 12.7 V`.

### Safety notes
> **⚠️ Bench Safety Note (`safety_level: low`):** Always verify probe placement (`V/Ohm` voltage port, never the `10A` shunt port in parallel) and set your CC/CV bench power supply current limit ($\le 0.5\text{ A}$) before energizing any breadboard or sensor circuit.


```mermaid
flowchart LR
    A["01-electronics.T1.01d: capacitor_charge_storage_and_decoupling"] --> B["rc_time_constant_and_filtering"]
    B --> C["inductor_flyback_and_freewheeling_diode"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: rc_time_constant_and_filtering]` Compute the time constant $\tau = R C$ in seconds ($\text{s}$, tolerance $\pm 10^{-9}$) for $R = 4.7\text{ k}\Omega$ ($4700\ \Omega$) and $C = 10\ \mu\text{F}$ ($10 \times 10^{-6}\text{ F}$).
2. `[Apply] [Concept: rc_time_constant_and_filtering]` What percentage of the step input voltage $V_{\text{in}}$ does an initially uncharged capacitor reach after exactly $t = 1\tau$ ($100 \times (1 - e^{-1})$, tolerance $\pm 0.01\%$)?
3. `[Transfer] [Concept: inductor_flyback_and_freewheeling_diode]` Compute the stored magnetic energy $E_L = \frac{1}{2} L I^2$ in joules ($\text{J}$, tolerance $\pm 10^{-9}$) in a $L = 4.0\text{ mH}$ ($0.004\text{ H}$) motor phase winding carrying $I = 5.0\text{ A}$.
4. `[Concept: capacitor_charge_storage_and_decoupling]` Why do motor driver PCBs and breadboards place **both** a $100\text{ nF}$ ($0.1\ \mu\text{F}$) ceramic capacitor and a $100\text{–}470\ \mu\text{F}$ electrolytic bulk capacitor across $V_{\text{bus}}$ and $\text{GND}$ right at the driver IC?
   - **A.** Ceramic capacitors look nicer next to tall cylinders.
   - **B.** The small low-inductance $100\text{ nF}$ ceramic cap shunts nanosecond high-frequency switching edges, while the large $100\text{–}470\ \mu\text{F}$ electrolytic reservoir supplies millisecond motor current surges without bus droop.
   - **C.** Putting two capacitors in parallel divides the voltage in half.
   - **D.** The ceramic capacitor converts DC into AC.
5. `[Spaced review -> 01-electronics.T1.01a — Concept: voltage_current_resistance_ohms_law]` A $12.0\,\text{V}$ rail drives $470\ \Omega$. Compute the current in milliamperes (tolerance $\pm 10^{-6}$).

**Answer key:**
```python
import math

q1_tau_s = 4700.0 * 10e-6
q2_pct_1tau = 100.0 * (1.0 - math.exp(-1.0))
q3_energy_j = 0.5 * 0.004 * (5.0 ** 2)
q4_choice = "B"

assert math.isclose(q1_tau_s, 0.047, rel_tol=1e-9)
assert math.isclose(q2_pct_1tau, 63.21205588, abs_tol=1e-2)
assert math.isclose(q3_energy_j, 0.05, rel_tol=1e-9)
assert q4_choice == "B"
q5_review = 1000.0 * 12.0 / 470.0
assert math.isclose(q5_review, 25.531914893617, rel_tol=1e-9, abs_tol=1e-06)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 2; Q3, study `## 3. Formalization` item 3; Q4, study `## 3. Formalization` item 1. If you missed  Q5, review `01-electronics.T1.01a`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 01 Tier 1 bridge ladder (`01-electronics.T1.01a` $\to$ `01-electronics.T1.01c` $\to$ `01-electronics.T1.01d` $\to$ `01-electronics.T1.01b`) before Step 1.2 (`01-electronics.T1.02`):
1. `[Concept: capacitor_charge_storage_and_decoupling]` Compute the stored energy $E = \frac{1}{2} C V^2$ in joules ($\text{J}$, tolerance $\pm 10^{-9}$) in a $470\ \mu\text{F}$ capacitor charged to $12.0\text{ V}$.
2. `[Concept: rc_time_constant_and_filtering]` Compute $\tau = R C$ in seconds ($\text{s}$, tolerance $\pm 10^{-12}$) for $R = 4.7\text{ k}\Omega$ and $C = 0.10\ \mu\text{F}$.
3. `[Concept: inductor_flyback_and_freewheeling_diode]` A $2.0\text{ mH}$ coil carrying $6.0\text{ A}$ is interrupted in $4.0\ \mu\text{s}$ without a freewheeling diode. Compute the peak spike $|V_L| = L\,\Delta I/\Delta t$ in volts ($\text{V}$, tolerance $\pm 10^{-6}$).
4. `[SAFETY] [Concept: inductor_flyback_and_freewheeling_diode]` Where does a freewheeling diode go across an inductive load switched by a low-side N-MOSFET, and why there?
   - **A.** From Drain to $V_{\text{bus}}$, so the coil current keeps circulating through the diode instead of forcing the Drain node hundreds of volts above the bus.
   - **B.** From Gate to Source, so the gate capacitance discharges faster.
   - **C.** In series with the coil, so current can only flow one way.
   - **D.** From Drain to $\text{GND}$, which shorts the supply while the FET is on.
5. `[Concept: voltage_current_resistance_ohms_law]` Compute the current in amperes ($\text{A}$, tolerance $\pm 10^{-9}$) through a $45\ \Omega$ resistor with $9.0\text{ V}$ across it.
6. `[Concept: kvl_kcl_and_voltage_divider]` Compute the unloaded midpoint voltage in volts ($\text{V}$, tolerance $\pm 10^{-6}$) of a $15\text{ k}\Omega$ (top) / $5.0\text{ k}\Omega$ (bottom) divider on an $18.0\text{ V}$ rail.
7. `[Concept: electrical_power_i2r_dissipation]` Compute the power in watts ($\text{W}$, tolerance $\pm 10^{-9}$) dissipated by a $0.06\ \Omega$ trace carrying $3.5\text{ A}$.
8. `[Concept: breadboard_internal_bus_connectivity]` You place a $100\text{ nF}$ decoupling capacitor with one leg in `a10` and the other in `b10`. What have you built?
   - **A.** A working decoupling capacitor.
   - **B.** A short: both holes are one node, so the capacitor is bypassed and the rail is tied to whatever `a10`–`b10` connects.
   - **C.** A $200\text{ nF}$ capacitor.
   - **D.** An open circuit, because the row is split.
9. `[Concept: multimeter_and_current_limited_psu_safety]` A supply is set to $24.0\text{ V}$ with $I_{\text{limit}} = 0.25\text{ A}$ and wired across $8.0\ \Omega$. Compute the clamped output voltage in volts ($\text{V}$, tolerance $\pm 10^{-9}$).
10. `[Concept: esd_and_short_circuit_prevention]` Why is a $10\text{ M}\Omega$ resistor built into a wrist strap's ground lead?
   - **A.** To limit the current through your body if you touch a live conductor, while still bleeding static charge away.
   - **B.** To measure your pulse through the strap.
   - **C.** To keep the strap from working at all.
   - **D.** To increase the static charge on your hands.
11. `[Concept: mosfet_low_side_rds_on_switch]` Compute the conduction loss $P = I_D^2 R_{DS(\text{on})}$ in watts ($\text{W}$, tolerance $\pm 10^{-9}$) for $I_D = 4.0\text{ A}$ and $R_{DS(\text{on})} = 15\text{ m}\Omega$.
12. `[Concept: pwm_duty_cycle_effective_voltage]` Compute the average voltage $V_{\text{eff}} = D V_{\text{bus}}$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$) for $V_{\text{bus}} = 24.0\text{ V}$ at $D = 0.60$.
13. `[Concept: h_bridge_four_switch_polarity_and_shoot_through]` An H-bridge runs $D_A = 0.50$ and $D_B = 0.90$ from $V_{\text{bus}} = 12.0\text{ V}$. Compute the average signed motor voltage in volts ($\text{V}$, tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

g1_energy = 0.5 * 470e-6 * (12.0 ** 2)
g2_tau = 4_700.0 * 0.10e-6
g3_vl = 2.0e-3 * (6.0 / 4.0e-6)
g4_safety_choice = "A"
g5_i = 9.0 / 45.0
g6_vdiv = 18.0 * (5_000.0 / (15_000.0 + 5_000.0))
g7_p = (3.5 ** 2) * 0.06
g8_choice = "B"
g9_vout = min(24.0, 0.25 * 8.0)
g10_choice = "A"
g11_pcond = (4.0 ** 2) * 0.015
g12_veff = 0.60 * 24.0
g13_vab = (0.50 - 0.90) * 12.0

assert math.isclose(g1_energy, 0.03384, rel_tol=1e-9)
assert math.isclose(g2_tau, 4.7e-4, rel_tol=1e-12)
assert math.isclose(g3_vl, 3000.0, rel_tol=1e-6)
assert g4_safety_choice == "A"  # Mandatory [SAFETY] 100% required
assert math.isclose(g5_i, 0.20, rel_tol=1e-9)
assert math.isclose(g6_vdiv, 4.5, rel_tol=1e-6)
assert math.isclose(g7_p, 0.735, rel_tol=1e-9)
assert g8_choice == "B"
assert math.isclose(g9_vout, 2.0, rel_tol=1e-9)
assert g10_choice == "A"
assert math.isclose(g11_pcond, 0.24, rel_tol=1e-9)
assert math.isclose(g12_veff, 14.4, rel_tol=1e-9)
assert math.isclose(g13_vab, -4.8, rel_tol=1e-9)
```
- **Pass mark:** $11/13$ overall ($80\%+$) AND $1/1$ ($100\%$) on Q4 (`[SAFETY]`). Remediation: Q1–Q4 $\to$ `## 3. Formalization` and `01-electronics.T1.01d`; Q5–Q7 $\to$ `01-electronics.T1.01a`; Q8–Q10 $\to$ `01-electronics.T1.01c`; Q11–Q13 $\to$ `01-electronics.T1.01b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Electrolytic capacitor pops or vents hot electrolyte | Inserted polarized electrolytic capacitor backward (`-` stripe on $+V_{\text{bus}}$) or exceeded its voltage rating. | Always connect the negative `-` stripe (shorter lead) to $\text{GND}$ and derate capacitor voltage by $\ge 2\times V_{\text{bus}}$. |
| Flyback diode gets smoking hot and shorts out when power is applied | Installed the freewheeling diode forward-biased from $+V_{\text{bus}}$ to $\text{GND}$ instead of reverse-biased (cathode stripe to $+V_{\text{bus}}$). | Orient the diode cathode stripe toward $+V_{\text{bus}}$ so it blocks current during normal ON states and conducts only coil flyback current at turn-off. |
| Decoupling capacitor placed $15\text{ cm}$ away on the far corner of the breadboard | Long jumper wires add $\sim 100\text{ nH}$ of parasitic inductance that blocks fast current delivery. | Place the $100\text{ nF}$ ceramic capacitor within $<1\text{ cm}$ of the IC's $V_{\text{CC}}$ and $\text{GND}$ pins. |

## 9. Resources
- **Horowitz & Hill — *The Art of Electronics* (3e, Ch. 1, `resources/textbooks-and-papers.md`):** Capacitive decoupling, RC filters, and inductive kickback protection `[VERIFIED 2026-10-15]`.
- **Track 01 (`01-electronics-and-power/README.md`):** Prepares directly for MOSFET switching in `01-electronics.T1.01b` and Step 1.2 (`01-electronics.T1.02`) `[VERIFIED 2026-10-15]`.
## 10. Next modules

<!-- next-step:start -->
👉 **Next:** [Step 5 · Build the arm: mechanics — Lesson 02.1: 2D Coordinate Frames and 1-Link Planar Arm Forward Kinematics](../02-mechanics-kinematics-dynamics/02.1-1d-link-fk-and-coord-frames.md)
<!-- next-step:end -->
