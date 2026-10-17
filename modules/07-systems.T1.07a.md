---
id: 07-systems.T1.07a
title: "Industrial State Machines, Cyclic PLC Scan, E-Stop Chains & Sine-Sweep Gain/Phase"
track: "07"
tier: 1
prereqs:
  - 06-robotics.T1.07
new_concepts:
  - cyclic_plc_scan_read_execute_write
  - normally_closed_hardware_estop_chain
  - single_tone_sine_sweep_gain_phase
uses:
  - finite_state_machine_switch_enum
  - ten_step_power_on_bringup
  - rc_cutoff_phase_lag
est_hours: 3.5
hardware_required: false
safety_level: high
resources_verified: true
verification: ci-native
---

## 1. Why it matters
This is the bridge module before the Tier 1 Boss Capstone (`07-systems.T1.08`, Step 1.8). Integrating a multi-DOF robot into a workcell requires three system-level skills: structuring supervisory logic around a deterministic **Read-Inputs $\to$ Execute-Logic $\to$ Write-Outputs cyclic PLC scan**, wiring a fail-safe **Normally-Closed (NC) hardware Emergency-Stop chain** that cuts motor power even if a wire breaks or the CPU freezes, and measuring your assembled robot's empirical bandwidth via a **single-tone sine sweep**. Already know this? Read `### Safety notes` first, then take the Skip test or the Ladder Gate test in section 7.

## 2. Intuition first
Imagine a factory supervisor who inspects a workcell every $10\text{ ms}$. Instead of letting sensors change halfway through a calculation, the supervisor takes a frozen snapshot of all switches at the top of the cycle (**1. Read Inputs**), computes the state machine rules on that snapshot (**2. Execute Logic**), and updates all relays at the end of the cycle (**3. Write Outputs**)—that is an **IEC 61131-3 cyclic PLC scan**. Next, why are industrial Emergency-Stop buttons wired **Normally-Closed (NC)** in series so current must flow continuously to hold the motor power relay closed? Because if a rat chews through an E-stop wire or a connector vibrates loose, the current stops and the machine fails **SAFE** (stops immediately)—whereas a Normally-Open (NO) wire break would silently leave you with a dead E-stop button that does nothing when pressed! Finally, a **sine sweep** shakes the joint with one pure sine frequency at a time and compares output amplitude $B$ and lag $\Delta t$ against input amplitude $A$ to plot the real hardware's frequency response.

## 3. Formalization
1. **Cyclic Scan Loop (`Read -> Execute -> Write`):** Each scan cycle $k$ latches input image $I_k$, evaluates pure state transition function $(S_{k+1}, Q_k) = f(S_k, I_k)$, and writes output image $Q_k$. Input changes arriving mid-scan cannot cause race conditions between rungs.
2. **Fail-Safe Normally-Closed (NC) Series E-Stop Chain:** For $N$ series NC contacts $E_1, E_2, \dots, E_N \in \{0, 1\}$ (where `1` = closed/healthy and `0` = pressed OR broken wire) and hardware watchdog `WD_OK`:

$$
\text{PWR-ENABLE} = E_1 \land E_2 \land \dots \land E_N \land \text{WD-OK}
$$

   Any single open contact or severed wire forces $\text{PWR-ENABLE} = 0$, dropping the motor supply contactor/enable hardware line without relying on software.
3. **Single-Tone Sine-Sweep Gain (dB) and Phase Lag (Self-Contained Logarithm & Decibel Primer):**
   - **What $\log_{10}$ and Decibels ($\text{dB}$) Mean:** The base-10 logarithm $\log_{10}(x)$ (`math.log10(x)` in Python) simply asks: "To what power must we raise $10$ to get $x$?" Thus $\log_{10}(1) = 0$ (since $10^0 = 1$), $\log_{10}(0.1) = -1$ (since $10^{-1} = 0.1$), and $\log_{10}(1/\sqrt{2}) \approx \log_{10}(0.7071) \approx -0.1505$. Because mechanical and electrical amplitude ratios $B/A$ span factors of $1000\times$, engineers compress them onto an additive scale called **decibels ($\text{dB}$)** defined as $20\log_{10}(B/A)$ (and invert back to a linear ratio via $B/A = 10^{\text{dB}/20}$):
     - $B/A = 1.0 \implies 20\log_{10}(1.0) = 0.0\text{ dB}$ (no attenuation).
     - $B/A = 1/\sqrt{2} \approx 0.7071 \implies 20\log_{10}(0.7071) \approx -3.01\text{ dB}$ (the **$-3\text{ dB}$ bandwidth cutoff**).
     - $B/A = 0.50 \implies 20\log_{10}(0.50) \approx -6.02\text{ dB}$ (half amplitude).
     - $B/A = 0.10 \implies 20\log_{10}(0.10) = -20.0\text{ dB}$ (one-tenth amplitude).
   - **Empirical Frequency-Response Magnitude & Phase:** Injecting $u(t) = A\sin(2\pi f t)$ at frequency $f$ ($\text{Hz}$, period $T = 1/f$) and measuring steady-state response $y(t) = B\sin(2\pi f(t - \Delta t))$ gives empirical magnitude $\lvert G(j2\pi f)\rvert_{\text{dB}}$ (standard shorthand for gain at frequency $f$ in decibels) and phase lag $\angle G(j2\pi f)$:

$$
\lvert G(j2\pi f)\rvert_{\text{dB}} = 20\log_{10}\!\left(\frac{B}{A}\right), \quad \angle G(j2\pi f) = -360^\circ \cdot f \cdot \Delta t
$$

   Substituting $A = 1.0\text{ rad}$, $B = 0.7071\text{ rad}$, $f = 5.0\text{ Hz}$, and peak delay $\Delta t = 0.025\text{ s}$ gives $|G|_{\text{dB}} = -3.01\text{ dB}$ and $\angle G = -360^\circ \times 5.0 \times 0.025 = -45.0^\circ$.

## 4. Worked example
**Predict first (before you run it):** Two things happen in one block: a cyclic PLC scan walking `IDLE -> RUNNING -> ESTOP_LATCHED` on a break in `estop2_nc`, and a $5.0\ \text{Hz}$ sine sweep with input amplitude $A = 1.0\ \text{rad}$, output $B = 0.7071\ \text{rad}$ and a peak delay $\Delta t = 0.025\ \text{s}$. Before you run it, commit to three numbers: the lag in degrees, the gain in decibels, and whether re-closing the snipped wire while Start is still held returns power. Two tells that a wrong answer is a mistake rather than a surprise: the lag must be negative, because a peak that arrives *after* the input is lag, so a positive number means the sign of $\Delta t$ was dropped; and the gain must be negative, because $B < A$, so a positive decibel value means the ratio was inverted or the $20$ became a $10$.

Simulate a cyclic PLC scan controlling a workcell with two series NC E-stop buttons and a guard door interlock (verifying that a broken wire immediately drops motor power and latches `FAULT`), and compute the empirical Bode gain and phase from a $5.0\text{ Hz}$ sine-sweep measurement.

```python
import math

def plc_scan_step(state: str, estop1_nc: bool, estop2_nc: bool, door_nc: bool,
                  start_btn_no: bool, reset_btn_no: bool) -> tuple[str, bool]:
    safety_chain_ok = estop1_nc and estop2_nc and door_nc
    if not safety_chain_ok:
        return "ESTOP_LATCHED", False
    if state == "ESTOP_LATCHED":
        next_state = "IDLE" if (reset_btn_no and not start_btn_no) else "ESTOP_LATCHED"
        return next_state, False
    if state == "IDLE" and start_btn_no:
        return "RUNNING", True
    if state == "RUNNING":
        return "RUNNING", True
    return state, False

st, pwr = plc_scan_step("IDLE", True, True, True, start_btn_no=True, reset_btn_no=False)
assert st == "RUNNING" and pwr is True
# Simulate broken wire on estop2_nc (drops to False):
st, pwr = plc_scan_step(st, True, False, True, start_btn_no=False, reset_btn_no=False)
assert st == "ESTOP_LATCHED" and pwr is False
# Verify releasing E-stop alone does NOT auto-restart without explicit reset:
st, pwr = plc_scan_step(st, True, True, True, start_btn_no=True, reset_btn_no=False)
assert st == "ESTOP_LATCHED" and pwr is False

gain_db = 20.0 * math.log10(0.70710678 / 1.0)
phase_deg = -360.0 * 5.0 * 0.025
assert math.isclose(gain_db, -3.0103, abs_tol=1e-4)
assert math.isclose(phase_deg, -45.0, abs_tol=1e-9)
print(f"Safety state={st}, pwr={pwr}, Sine-sweep @ 5Hz: {gain_db:.2f} dB, {phase_deg:.1f} deg")
```
Expected output:
```text
Safety state=ESTOP_LATCHED, pwr=False, Sine-sweep @ 5Hz: -3.01 dB, -45.0 deg
```

## 5. Exercise
During a single-tone sine sweep at $f = 8.0\text{ Hz}$ ($T = 0.125\text{ s}$) with input amplitude $A = 0.20\text{ rad}$, the joint encoder output has steady-state amplitude $B = 0.10\text{ rad}$ and its peaks lag the input peaks by $\Delta t = 0.03125\text{ s}$. Compute $\lvert G(j2\pi f)\rvert_{\text{dB}}$ and $\angle G(j2\pi f)$ in degrees. Verify $|G|_{\text{dB}} = -6.0206\text{ dB}$ ($\pm 10^{-3}$) and $\angle G = -90.0^\circ$ ($\pm 10^{-6}$).
- **If your result differs:** Check that $-360^\circ \times 8.0\text{ Hz} \times 0.03125\text{ s} = -90.0^\circ$ (a quarter period of $0.125\text{ s}$) and $20\log_{10}(0.10 / 0.20) = -6.0206\text{ dB}$.

### Graded package - the scan, the chain and the sweep
[`exercises/07-systems.T1.07a/`](../exercises/07-systems.T1.07a/) turns this section into a test. `starter.py` holds seven holes: `scan_frequency_hz`, `safety_chain_ok` (all contacts, never any), `plc_scan_step` (the latch and the reset), `gain_db` (20 log10), `phase_lag_deg` (negative), `sine_amplitude` (the lock-in) and `db_to_ratio`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/07-systems.T1.07a/starter.py \
  python3 -m unittest discover -s exercises/07-systems.T1.07a -p 'test_*.py'
```

**32 tests.** The scan rate is checked against two different budgets, so seconds-for-milliseconds shows; the chain is checked with one open contact among three, so `any` fails; the state machine is checked with the chain healthy and Start still held, so a latch that clears itself fails; the gain is checked at half amplitude ($-6.02\text{ dB}$) and at one tenth ($-20\text{ dB}$), so `10 log10` fails; the phase is checked at a quarter period, so a positive lead fails; and the lock-in must recover a known amplitude through a $37\text{ Hz}$ interferer and a DC offset. The transfer suite measures **the plant's own figure-8**: `sine_amplitude` must return `plant.AX` and `plant.AY` from samples of `plant.figure8_target` to $10^{-6}$, reject the neighbouring frequency, read the plant's $1\text{ ms}$ budget as its $1\text{ kHz}$ tick, and drop the power enable on the very next scan after a wire break while refusing to restart without a reset. Five planted faults - `scan_in_seconds`, `chain_uses_any`, `phase_positive_lead`, `gain_10log`, `plc_no_latch` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00a`](00-foundations.T1.00a.md)–[`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Loops, Trigonometry & SI Units*), plus the self-contained inline logarithm and decibel primer in `## 3. Formalization` item 3 above (which previews Pass 2 [`00-foundations.T2.00d`](00-foundations.T2.00d.md)).
  - **Prerequisite Bridge Modules:** [`01-electronics.T1.01c`](01-electronics.T1.01c.md) (*CC/CV Bench Safety*), [`01-electronics.T1.01d`](01-electronics.T1.01d.md) (*RC Cutoff*), and [`05-control.T1.05a`](05-control.T1.05a.md) (*PID Control*).
  - **Core Concepts to Review First:** Deterministic `IEC 61131-3` PLC cyclic scan (`Read -> Execute -> Write`), single-tone sine-sweep System Identification ($|G|_{\text{dB}} = 20\log_{10}(B/A)$ and $\angle G = -360^\circ f \Delta t$), and the 10-step smoke-free hardware bring-up checklist in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [OpenPLC IEC 61131-3 Documentation (`autonomylogic.com`)](https://autonomylogic.com/) and [Track 07 Tier 1 (`07-systems-hil-and-production/README.md`)](../07-systems-hil-and-production/README.md#tier-1-beginner--intuitive).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution below ---
import math


def scan_frequency_hz(t_read_ms, t_exec_ms, t_write_ms):
    """The scan rate a Read -> Execute -> Write budget allows."""
    # TODO 1: sum the three phases in ms, then convert the period to Hz
    ...


def safety_chain_ok(*contacts):
    """True only when every series NC contact is closed."""
    # TODO 2: ONE open contact must drop the enable (all, not any)
    ...


def plc_scan_step(state, estop1_nc, estop2_nc, door_nc, start_btn_no, reset_btn_no):
    """One cyclic scan: (next state, power enable)."""
    # TODO 3: a trip latches; it clears only on a reset while Start is released
    ...


def gain_db(amplitude_out, amplitude_in):
    """Empirical magnitude in decibels."""
    # TODO 4: amplitude ratios are 20 log10, not 10 log10
    ...


def phase_lag_deg(f_hz, delay_s):
    """Phase lag in degrees for a peak delayed by `delay_s`."""
    # TODO 5: a LAG is negative - the output peaks after the input
    ...


def sine_amplitude(samples, f_hz, dt_s):
    """Lock-in amplitude at one frequency."""
    # TODO 6: correlate with sin and cos, take the mean of each, then 2 * hypot
    ...


def db_to_ratio(db):
    """Invert the decibel scale."""
    # TODO 7: B/A = 10 ** (dB / 20)
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $f_{\text{scan}} = 500.0\ \text{Hz}$ for the $0.40 + 1.10 + 0.50\ \text{ms}$ budget; $|G|_{\text{dB}} = -6.0206\ \text{dB}$ and $\angle G = -90.0^\circ$ at $8.0\ \text{Hz}$ with $\Delta t = 0.03125\ \text{s}$; the chain stays enabled only while all three contacts are closed, and the trip latches until a reset with Start released.

### Hint ladder
1. **The scan budget is a period.** $0.40 + 1.10 + 0.50 = 2.00\ \text{ms}$, so $f_{\text{scan}} = 1000/2.00 = 500\ \text{Hz}$; a result of $0.002$ Hz means the milliseconds were used as seconds.
2. **`all`, not `any`.** The series chain is $E_1 \land E_2 \land E_3$: with one open contact among three `all(...)` returns `False` while `any(...)` still returns `True` - exactly the bug that leaves a broken wire looking healthy.
3. **The latch is a state, not a flag.** After a trip, `state == "ESTOP_LATCHED"` must ignore a held Start button; only `reset_btn_no and not start_btn_no` returns `IDLE`, and even that scan keeps `pwr = False`.
4. **Decibels and the lag sign.** $20\log_{10}(0.10/0.20) = -6.0206\ \text{dB}$ (the $10\log_{10}$ form would give $-3.0103$), and $-360^\circ \times 8.0 \times 0.03125 = -90^\circ$ is a quarter of the $0.125\ \text{s}$ period, so a positive number means the sign of $\Delta t$ was dropped.

### Full Solution
```python
import math


def scan_frequency_hz(t_read_ms, t_exec_ms, t_write_ms):
    total_ms = t_read_ms + t_exec_ms + t_write_ms
    if total_ms <= 0.0:
        raise ValueError("a scan needs a positive period")
    return 1000.0 / total_ms


def safety_chain_ok(*contacts):
    if not contacts:
        raise ValueError("a safety chain needs at least one contact")
    return all(bool(contact) for contact in contacts)


def plc_scan_step(state, estop1_nc, estop2_nc, door_nc, start_btn_no, reset_btn_no):
    if not safety_chain_ok(estop1_nc, estop2_nc, door_nc):
        return "ESTOP_LATCHED", False
    if state == "ESTOP_LATCHED":
        if reset_btn_no and not start_btn_no:
            return "IDLE", False
        return "ESTOP_LATCHED", False
    if state == "IDLE":
        return ("RUNNING", True) if start_btn_no else ("IDLE", False)
    if state == "RUNNING":
        return "RUNNING", True
    raise ValueError("unknown state %r" % (state,))


def gain_db(amplitude_out, amplitude_in):
    if amplitude_in <= 0.0:
        raise ValueError("the input amplitude must be positive")
    return 20.0 * math.log10(amplitude_out / amplitude_in)


def phase_lag_deg(f_hz, delay_s):
    if f_hz < 0.0 or delay_s < 0.0:
        raise ValueError("frequency and delay cannot be negative")
    return -360.0 * f_hz * delay_s


def sine_amplitude(samples, f_hz, dt_s):
    if not samples:
        raise ValueError("a measurement needs samples")
    omega = 2.0 * math.pi * f_hz
    n = len(samples)
    re = sum(y * math.cos(omega * k * dt_s) for k, y in enumerate(samples)) / n
    im = sum(y * math.sin(omega * k * dt_s) for k, y in enumerate(samples)) / n
    return 2.0 * math.hypot(re, im)


def db_to_ratio(db):
    return 10.0 ** (db / 20.0)


# The exercise: 8 Hz at 0.20 rad in, 0.10 rad out, peaks 0.03125 s late.
f_scan = scan_frequency_hz(0.40, 1.10, 0.50)
gain = gain_db(0.10, 0.20)
phase = phase_lag_deg(8.0, 0.03125)
assert math.isclose(f_scan, 500.0, rel_tol=1e-12)
assert math.isclose(gain, -6.0206, abs_tol=1e-3)
assert math.isclose(phase, -90.0, abs_tol=1e-9)

# The chain, the latch, and the lock-in that must reject everything but its own frequency.
chain = safety_chain_ok(True, False, True)
state, pwr = plc_scan_step("RUNNING", True, False, True, start_btn_no=False, reset_btn_no=False)
assert chain is False and state == "ESTOP_LATCHED" and pwr is False
state, pwr = plc_scan_step(state, True, True, True, start_btn_no=True, reset_btn_no=True)
assert state == "ESTOP_LATCHED" and pwr is False          # Start is still held: no restart
samples = [math.sin(2.0 * math.pi * 5.0 * k * 0.001) for k in range(1000)]
amp = sine_amplitude(samples, 5.0, 0.001)
assert math.isclose(amp, 1.0, abs_tol=1e-9)
assert math.isclose(db_to_ratio(gain), 0.5, abs_tol=1e-6)

print("scan=%.1f Hz | chain=%s | state=%s pwr=%s" % (f_scan, chain, state, pwr))
print("gain=%.4f dB | phase=%.1f deg | sine_amp=%.4f rad | ratio=%.4f" % (gain, phase, amp, db_to_ratio(gain)))
```

Printed: `scan=500.0 Hz | chain=False | state=ESTOP_LATCHED pwr=False`, then `gain=-6.0206 dB | phase=-90.0 deg | sine_amp=1.0000 rad | ratio=0.5000`.

### Break it on purpose
- **Inject:** delete the `if state == "ESTOP_LATCHED"` branch from `plc_scan_step`, so a healthy chain and a held Start button fall straight through to the `state == "IDLE"` rule.
- **Symptom:** the worked example's third assertion fails — after the broken-wire scan the state is `ESTOP_LATCHED` with `pwr = False`, but the next scan, with `estop2_nc` repaired and `start_btn_no=True, reset_btn_no=False`, returns `("RUNNING", True)` instead of staying inhibited, so the motor re-energises the instant the mushroom is twisted out.
- **Diagnose:** the fault scan itself still drops power correctly, since $\text{PWR-ENABLE} = E_1 \land E_2 \land E_3$, and the sine-sweep numbers are untouched; the only scan that misbehaves is the one whose input state is `ESTOP_LATCHED`, which localises the fault to the missing latch branch.
- **Fix:** restore the branch so `ESTOP_LATCHED` leaves only on `reset_btn_no and not start_btn_no`; that scan then returns `("ESTOP_LATCHED", False)` and the third assertion passes, with `pwr` False as the expected output shows.

## 6. Simulation path
Test the cyclic PLC logic in [OpenPLC Editor](https://autonomylogic.com/) (`resources/open-source-toolchains.md`) or open **Tab 5 (Functional Safety & STO)** and **Tab 7 (System Identification)** in the MechaLab Workbench (`npm run dev`).

The graded package is also a workbench entry: **Modules -> `EX.07-systems.T1.07a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

### Safety notes
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before touching hardware or taking the Skip/Gate test):**
> 1. **Hardware E-Stop Must Break Power Physically:** A software `if (button_pressed)` check inside `loop()` is **never** a valid Emergency Stop—if the microcontroller hangs in an infinite loop or a MOSFET shorts failed-closed, software cannot stop the motor. The physical E-stop mushroom switch must directly interrupt the motor power supply (`VM`) or hardware driver enable (`nSLEEP`) via Normally-Closed (NC) contacts.
> 2. **No Automatic Restart After E-Stop Release:** Twisting/releasing a latched E-stop mushroom button must **never** cause the robot to resume motion automatically (`ESTOP_LATCHED -> IDLE` requires an explicit manual Reset action while Start is not asserted).
> 3. **Clear Workspace Before Sine Sweep:** Keep hands and loose cables outside the manipulator swept volume during sine-sweep excitation, and bound excitation amplitude to $\le 15\%$ of joint travel.


```mermaid
flowchart LR
    A["07-systems.T1.07a: cyclic_plc_scan_read_execute_write"] --> B["normally_closed_hardware_estop_chain"]
    B --> C["single_tone_sine_sweep_gain_phase"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: read `### Safety notes`, score $\ge 80\%$ ($4/5$) on the Skip test ($100\%$ on `[SAFETY]` items), or score $\ge 80\%$ ($7/8$, $100\%$ on `[SAFETY]` items) on the Ladder Gate test to unlock the Tier 1 Boss Capstone (`07-systems.T1.08`, Step 1.8).

### Skip test
1. `[Recall] [Concept: single_tone_sine_sweep_gain_phase]` A $10.0\text{ Hz}$ sine sweep with input amplitude $A = 0.50\text{ rad}$ produces steady-state output amplitude $B = 0.25\text{ rad}$ with peak time delay $\Delta t = 0.0125\text{ s}$. Compute the phase lag $\angle G = -360^\circ f \Delta t$ in degrees (tolerance $\pm 10^{-6}$).
2. `[Apply] [Concept: cyclic_plc_scan_read_execute_write]` An IEC 61131-3 PLC cyclic scan takes $t_{\text{read}} = 0.40\text{ ms}$ to freeze inputs, $t_{\text{exec}} = 1.10\text{ ms}$ to evaluate logic, and $t_{\text{write}} = 0.50\text{ ms}$ to latch outputs. Compute the deterministic scan frequency $f_{\text{scan}} = \frac{1000}{t_{\text{read}} + t_{\text{exec}} + t_{\text{write}}}$ in $\text{Hz}$ (tolerance $\pm 10^{-6}$).
3. `[Transfer] [SAFETY] [Concept: normally_closed_hardware_estop_chain]` Why are industrial Emergency-Stop buttons wired with **Normally-Closed (NC)** contacts in series rather than Normally-Open (NO) contacts in parallel?
   - **A.** Because NC switches are cheaper.
   - **B.** Because in a series NC chain, continuous current is required to hold power enabled; pressing any E-stop **or** severing/unplugging any wire drops current to zero and fails safe immediately.
   - **C.** Because NO contacts cannot carry $3.3\text{ V}$.
   - **D.** To make the motor spin faster.
4. `[Spaced review -> 06-robotics.T1.07 — Concept: finite_state_machine_switch_enum] [SAFETY] [Concept: normally_closed_hardware_estop_chain]` When an operator twists and releases a tripped E-stop button, what must the control state machine do?
   - **A.** Immediately resume the interrupted trajectory at full speed.
   - **B.** Remain inhibited in a safe latched state (`ESTOP_LATCHED` / `IDLE`) with motor torque disabled until a deliberate Reset command is issued.
   - **C.** Apply $100\%$ reverse PWM.
   - **D.** Bypass the current limit.
5. `[Concept: single_tone_sine_sweep_gain_phase]` What linear amplitude ratio $B/A$ (tolerance $\pm 10^{-3}$) corresponds to the $-3.01\text{ dB}$ closed-loop bandwidth frequency $f_{\text{BW}}$?

**Answer key:**
```python
import math

q1_phase_deg = -360.0 * 10.0 * 0.0125
q2_fscan_hz = 1000.0 / (0.40 + 1.10 + 0.50)
q3_safety_choice = "B"
q4_safety_choice = "B"
q5_ratio = 10.0 ** (-3.0102999566 / 20.0)
assert math.isclose(q1_phase_deg, -45.0, rel_tol=1e-6)
assert math.isclose(q2_fscan_hz, 500.0, rel_tol=1e-9)
assert q3_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert q4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert math.isclose(q5_ratio, 1.0 / math.sqrt(2.0), abs_tol=1e-3)
```
- **Pass mark:** $4/5$ overall ($80\%+$) AND $2/2$ ($100\%$) on Q3 and Q4 (`[SAFETY]`). If you missed Q1 or Q5, study `## 3. Formalization` item 3; if you missed Q2, study `## 3. Formalization` item 1; if you missed Q3 or Q4, study `## 3. Formalization` item 2 and `### Safety notes`. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 07 Tier 1 bridge ladder (`07-systems.T1.07a`) before Step 1.8 (`07-systems.T1.08`):
1. `[Concept: cyclic_plc_scan_read_execute_write]` If a PLC cyclic scan runs with period $T_{\text{scan}} = 5.0\text{ ms}$, how many complete scans execute per second ($\text{Hz}$, tolerance $\pm 10^{-9}$)?
2. `[Concept: cyclic_plc_scan_read_execute_write]` Why does freezing the input image at the start of each PLC scan prevent mid-scan race conditions?
   - **A.** Because every logic rung in that scan sees the exact same consistent boolean value for each sensor, even if the physical sensor bounces halfway through the scan.
   - **B.** Because it disables all sensors permanently.
   - **C.** Because it converts digital inputs to analog voltages.
   - **D.** Because it slows the CPU clock down to $1\text{ Hz}$.
3. `[SAFETY] [Concept: normally_closed_hardware_estop_chain]` Three NC safety switches (`EStop1`, `EStop2`, `GuardDoor`) are wired in series ($E_1 \land E_2 \land E_3$). If `EStop1 = 1`, `EStop2 = 1`, and a cable break sets `GuardDoor = 0`, what is the boolean state (`0` or `1`) of the hardware power-enable line?
4. `[SAFETY] [Concept: normally_closed_hardware_estop_chain]` Why is a software-only E-stop (`if (!digitalRead(ESTOP_PIN)) pwm = 0;`) unacceptable as the primary safety disconnect?
   - **A.** Because `digitalRead` takes $10\text{ s}$.
   - **B.** Because a firmware hang, stack overflow, ISR deadlock, or shorted power FET would leave the motor energized despite the button press; hardware E-stop must physically remove actuator power/enable.
   - **C.** Because GPIO pins cannot read buttons.
   - **D.** Because C++ does not support boolean logic.
5. `[SAFETY] [Concept: normally_closed_hardware_estop_chain]` After an E-stop event clears (`safety_chain_ok == True`), why must `plc_scan_step` check `reset_btn_no and not start_btn_no` before entering `IDLE`?
   - **A.** To prevent an operator from taping down the Start button and causing immediate motion the instant Reset is pressed.
   - **B.** To drain the capacitor bank.
   - **C.** To increase baud rate.
   - **D.** To invert the encoder direction.
6. `[Concept: single_tone_sine_sweep_gain_phase]` Compute the magnitude in decibels $20\log_{10}(B/A)$ (tolerance $\pm 10^{-4}\text{ dB}$) when input amplitude is $A = 0.40\text{ rad}$ and output amplitude is $B = 0.04\text{ rad}$.
7. `[Concept: single_tone_sine_sweep_gain_phase]` At $f = 4.0\text{ Hz}$ ($T = 0.25\text{ s}$), the output sine wave peaks $\Delta t = 0.0625\text{ s}$ after the input sine wave. Compute the phase lag in degrees (tolerance $\pm 10^{-6}$).
8. `[Concept: single_tone_sine_sweep_gain_phase]` Why must you discard the first $2\text{–}3$ cycles after stepping to a new frequency in a single-tone sine sweep before measuring amplitude $B$ and phase $\Delta t$?
   - **A.** To allow the initial transient response to decay so you measure pure steady-state sinusoidal response.
   - **B.** Because the encoder is turned off during the first 2 cycles.
   - **C.** Because $\sin(t)$ is zero for the first 3 cycles.
   - **D.** To let the resistor cool down.

**Gate answer key:**
```python
import math

g1_scan_hz = 1.0 / 0.005
g2_choice = "A"
g3_safety_pwr = 1 & 1 & 0
g4_safety_choice = "B"
g5_safety_choice = "A"
g6_db = 20.0 * math.log10(0.04 / 0.40)
g7_phase = -360.0 * 4.0 * 0.0625
g8_choice = "A"

assert math.isclose(g1_scan_hz, 200.0, rel_tol=1e-9)
assert g2_choice == "A"
assert g3_safety_pwr == 0       # Mandatory [SAFETY] 100% required
assert g4_safety_choice == "B"  # Mandatory [SAFETY] 100% required
assert g5_safety_choice == "A"  # Mandatory [SAFETY] 100% required
assert math.isclose(g6_db, -20.0, rel_tol=1e-6)
assert math.isclose(g7_phase, -90.0, rel_tol=1e-6)
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ overall AND $3/3$ ($100\%$) on `[SAFETY]` questions Q3, Q4, and Q5. Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5 $\to$ `## 3. Formalization` item 2 and `### Safety notes`; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Wired E-stop to the Normally-Open (NO) contacts instead of Normally-Closed (NC) | Misread the switch contact markings (`1-2` NC vs `3-4` NO). | Verify with a DMM in continuity mode that the E-stop switch is **closed ($0\ \Omega$) when unpressed** and **open ($\infty\ \Omega$) when pressed**. |
| Robot immediately lurches back into motion when E-stop mushroom is twisted out | State machine lacked a latched `ESTOP_LATCHED` state requiring a separate Reset edge. | Latch all safety trips into `ESTOP_LATCHED` and require an explicit Reset transition to `IDLE` before accepting `RUN` commands. |
| Sine-sweep Bode plot looks jagged and noisy at low amplitudes | Measured single-cycle peak-to-peak height instead of correlating against $\sin(2\pi f t)$ and $\cos(2\pi f t)$ over multiple steady-state cycles. | Discard 3 settling cycles and average over $\ge 5$ steady-state cycles at each frequency. |

## 9. Resources
- **Frank Petruzella — *Programmable Logic Controllers* & OpenPLC (`autonomylogic.com`, `resources/open-source-toolchains.md`):** IEC 61131-3 cyclic scan execution and safety interlock patterns `[VERIFIED 2026-10-15]`.
- **Track 07 & 08 (`07-systems-hil-and-production/README.md`, `08-capstone-projects/README.md`):** Directly continues into the Tier 1 Boss Capstone (`07-systems.T1.08`, Step 1.8) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 1.8 (`07-systems.T1.08`)** in [`08-capstone-projects/README.md`](../08-capstone-projects/README.md#tier-1-capstone-builds-beginner--breakout-pass).
