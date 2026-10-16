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
---

## 1. Why it matters
Resistors respond instantaneously to voltage changes, but every real motor drive is dominated by two energy-storage components: **capacitors** (which store electric-field energy to stabilize power rails and filter noisy sensors) and **inductors** (the copper coils inside every motor, which store magnetic-field energy and unleash destructive high-voltage flyback spikes if switched off without a return path). Understanding $I_C = C\frac{dV}{dt}$ and $V_L = L\frac{dI}{dt}$ prepares you directly for PWM switching in `01-electronics.T1.01b` and Step 1.2 (`01-electronics.T1.02`). Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
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


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (SI Prefixes $\mu\text{F}, \text{mH}, \text{ns}$) and [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Stored Energy*).
  - **Prerequisite Bridge Modules:** [`01-electronics.T1.01a`](01-electronics.T1.01a.md) and [`01-electronics.T1.01c`](01-electronics.T1.01c.md).
  - **Core Concepts to Review First:** Capacitor current $I = C\frac{dV}{dt}$, RC time constant $\tau = RC$ and $-3\text{ dB}$ cutoff $f_c = \frac{1}{2\pi RC}$, and inductor voltage spike $V_L = L\frac{dI}{dt}$ with flyback clamping in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Falstad Interactive Circuit Simulator (`falstad.com/circuit`)](https://www.falstad.com/circuit/), [All About Circuits RC & L/R Time Constants](https://www.allaboutcircuits.com/textbook/direct-current/), and [Track 01 §1.1–1.3 (`01-electronics-and-power/README.md`)](../01-electronics-and-power/README.md#tier-1-beginner--intuitive).

### Break it on purpose
Swap the bulk reservoir for the wrong part and diagnose the droop from the measurement alone:
- **Inject:** build the same $12.0\text{ V}$ bus but fit the $100\ \mu\text{F}$ electrolytic you had in the parts bin instead of the $240\ \mu\text{F}$ the droop budget demanded, leaving $\Delta I = 3.0\text{ A}$ and $\Delta t = 20\ \mu\text{s}$ unchanged.
- **Symptom:** the loaded bus sags by $\Delta V = \frac{\Delta I \cdot \Delta t}{C} = \frac{3.0 \times 20\ \mu\text{s}}{100\ \mu\text{F}} = 0.60\text{ V}$ — that is $2.4\times$ the $0.25\text{ V}$ budget, roughly $5\%$ of a $12.0\text{ V}$ rail, and it shows up as flickering logic on the same bus, not as a hot part.
- **Diagnose:** droop scales as $\Delta V \propto 1/C$ while the transient itself ($\Delta I$, $\Delta t$, and the $6.0 \times 10^{-5}\text{ C}$ of charge it moves) has not changed, so a droop $2.4\times$ over budget means the capacitance is $100/240 \approx 0.42\times$ what the calculation required. Confirm it by measuring the sag with a scope or a fast multimeter at the driver's $V_{\text{bus}}$ pin rather than at the supply terminals — a droop that vanishes at the supply and persists at the pin is a missing local reservoir, while a droop at both is a supply-side limit.
- **Fix:** fit at least the $240\ \mu\text{F}$ of low-ESR bulk capacitance ($470\ \mu\text{F}$ electrolytic is the comfortable standard substitution) in parallel with the $100\text{ nF}$ ceramic at the pins, and prove it: $\Delta V = \frac{3.0 \times 20\ \mu\text{s}}{470\ \mu\text{F}} = 0.128\text{ V}$, half the $0.25\text{ V}$ budget even before the electrolytic's worst-case tolerance and aging derating are applied.

## 6. Simulation path
Simulate an RC step response and an inductive coil turn-off with and without a flyback diode in [Falstad Circuit Simulator](https://www.falstad.com/circuit/) (`Circuits -> Inductors -> Inductive Kickback`).

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
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: rc_time_constant_and_filtering]` Compute the time constant $\tau = R C$ in seconds ($\text{s}$, tolerance $\pm 10^{-9}$) for $R = 4.7\text{ k}\Omega$ ($4700\ \Omega$) and $C = 10\ \mu\text{F}$ ($10 \times 10^{-6}\text{ F}$).
2. `[Apply] [Concept: rc_time_constant_and_filtering]` What percentage of the step input voltage $V_{\text{in}}$ does an initially uncharged capacitor reach after exactly $t = 1\tau$ ($100 \times (1 - e^{-1})$, tolerance $\pm 0.01\%$)?
3. `[Transfer] [Concept: inductor_flyback_and_freewheeling_diode]` Compute the stored magnetic energy $E_L = \frac{1}{2} L I^2$ in joules ($\text{J}$, tolerance $\pm 10^{-9}$) in a $L = 4.0\text{ mH}$ ($0.004\text{ H}$) motor phase winding carrying $I = 5.0\text{ A}$.
4. `[Spaced review -> 01-electronics.T1.01c — Concept: voltage_current_resistance_ohms_law] [Concept: capacitor_charge_storage_and_decoupling]` Why do motor driver PCBs and breadboards place **both** a $100\text{ nF}$ ($0.1\ \mu\text{F}$) ceramic capacitor and a $100\text{–}470\ \mu\text{F}$ electrolytic bulk capacitor across $V_{\text{bus}}$ and $\text{GND}$ right at the driver IC?
   - **A.** Ceramic capacitors look nicer next to tall cylinders.
   - **B.** The small low-inductance $100\text{ nF}$ ceramic cap shunts nanosecond high-frequency switching edges, while the large $100\text{–}470\ \mu\text{F}$ electrolytic reservoir supplies millisecond motor current surges without bus droop.
   - **C.** Putting two capacitors in parallel divides the voltage in half.
   - **D.** The ceramic capacitor converts DC into AC.

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
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 2; Q3, study `## 3. Formalization` item 3; Q4, study `## 3. Formalization` item 1. On pass, proceed to `## 10. Next modules`.

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
- Proceed to [`01-electronics.T1.01b`](01-electronics.T1.01b.md) (*Low-Side MOSFET Switching, PWM Duty Cycle & H-Bridge Polarity Reversal*).
