---
id: 00-foundations.T1.00c
title: "SI Units, Engineering Prefixes & Dimensional Analysis"
track: "00"
tier: 1
prereqs:
  - 00-foundations.T1.00b
new_concepts:
  - si_base_and_derived_units
  - scientific_notation_and_prefixes
  - dimensional_analysis_unit_checks
uses:
  - python_variables_and_types
  - for_while_loops_and_functions
est_hours: 2.5
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters
Real motors and power stages fail violently when units are mixed up: plugging a $1\text{ ms}$ sample period into a derivative formula as `dt = 1` instead of `dt = 0.001` multiplies motor torque commands by $1,000\times$, and confusing RPM with radians per second ruins back-EMF calculations. Dimensional analysis lets you catch wrong equations before running code by checking that units cancel cleanly on both sides of `=`. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine building a table where one blueprint sheet gives leg lengths in millimeters, another gives the tabletop in meters, and a third lists weight in grams. If you add the raw numbers $500$ and $1.2$ without converting them to the same ruler first, the table collapses. In engineering code, we adopt one universal rule: convert every incoming number at the boundary of your program into standard base SI units (meters, kilograms, seconds, amperes, volts, radians), tag variable names with their unit suffix (`omega_rad_s`, `tau_nm`, `dt_s`), and treat unit labels like fractions where matching top and bottom labels cancel out.

## 3. Formalization
1. **Base and Derived SI Units:** Store length in meters ($\text{m}$), mass in kilograms ($\text{kg}$), time in seconds ($\text{s}$), current in amperes ($\text{A}$), and plane angle in radians ($\text{rad}$). Mechanical power $P$ in watts ($\text{W} = \text{J/s} = \text{N}\cdot\text{m/s}$) is the product of torque $\tau$ in newton-meters ($\text{N}\cdot\text{m}$) and angular velocity $\omega$ in radians per second ($\text{rad/s}$):
   $$P = \tau \cdot \omega$$
   Substituting $\tau = 0.45\text{ N}\cdot\text{m}$ and $\omega = 251.3274\text{ rad/s}$ gives $P = (0.45\text{ N}\cdot\text{m})(251.3274\text{ rad/s}) = 113.0973\text{ W}$.
2. **Engineering Prefixes ($10^{3k}$):** Convert prefixed datasheet quantities into base SI units on input: $\text{milli (m)} = 10^{-3}$, $\text{micro (}\mu\text{)} = 10^{-6}$, $\text{nano (n)} = 10^{-9}$, $\text{kilo (k)} = 10^{3}$, and $\text{mega (M)} = 10^{6}$. For an RC filter with resistance $R = 10\text{ k}\Omega = 10\times 10^3\,\Omega$ and capacitance $C = 100\text{ nF} = 100\times 10^{-9}\text{ F}$, the time constant $\tau_{RC}$ in seconds ($\text{s} = \Omega\cdot\text{F}$) is:
   $$\tau_{RC} = R \cdot C = (10\times 10^3\,\Omega)(100\times 10^{-9}\text{ F}) = 1.0\times 10^{-3}\text{ s} = 1.00\text{ ms}$$
3. **Dimensional Cancellation (RPM to $\text{rad/s}$):** Given shaft speed $N$ in revolutions per minute ($\text{RPM}$), cancel revolutions and minutes using $2\pi\text{ rad} = 1\text{ rev}$ and $60\text{ s} = 1\text{ min}$:
   $$\omega = N\,\left[\frac{\text{rev}}{\text{min}}\right] \times \frac{2\pi\text{ rad}}{1\text{ rev}} \times \frac{1\text{ min}}{60\text{ s}}$$
   For $N = 2400\text{ RPM}$, $\omega = 2400 \times \frac{2\pi}{60}\text{ rad/s} = 80\pi\text{ rad/s} \approx 251.3274\text{ rad/s}$.

## 4. Worked example
Convert $N = 2400\text{ RPM}$ and $\tau = 450\text{ mN}\cdot\text{m}$ into base SI units to compute mechanical shaft power $P$ in watts, and compute the time constant $\tau_{RC}$ of a $10\text{ k}\Omega$, $100\text{ nF}$ filter.

```python
import math

def rpm_to_rad_s(rpm: float) -> float:
    return rpm * (2.0 * math.pi / 60.0)

omega_rad_s = rpm_to_rad_s(2400.0)
tau_nm = 450.0 * 1e-3
power_w = tau_nm * omega_rad_s

rc_time_constant_s = (10.0 * 1e3) * (100.0 * 1e-9)  # 10 kOhm * 100 nF = 1 ms

assert math.isclose(omega_rad_s, 80.0 * math.pi, rel_tol=1e-9)
assert math.isclose(power_w, 113.0973355, rel_tol=1e-6)
assert math.isclose(rc_time_constant_s, 1.0e-3, rel_tol=1e-9)
print(f"omega={omega_rad_s:.2f} rad/s, P={power_w:.2f} W, tau_RC={rc_time_constant_s*1e3:.2f} ms")
```
Expected output:
```text
omega=251.33 rad/s, P=113.10 W, tau_RC=1.00 ms
```

## 5. Exercise
A $48\text{ V}$ supply delivers $I = 15\text{ A}$ through a PCB trace of resistance $R = 12\text{ m}\Omega$ ($12\times 10^{-3}\,\Omega$). Compute the voltage drop $V_{\text{drop}} = I R$ in volts ($\text{V}$) and the trace heat dissipation $P_{\text{loss}} = I^2 R$ in watts ($\text{W}$). Expected result: `V_drop = 0.18 V` and `P_loss = 2.70 W` (tolerance $\pm 10^{-6}$).
- **If your result differs:** Check that you converted $12\text{ m}\Omega$ to $0.012\,\Omega$ (`12e-3`) before multiplying by $15^2 = 225\text{ A}^2$.

## 6. Simulation path
Run the worked example script in Python, then open **Tab 3 (25 kHz PMSM FOC)** in the MechaLab Workbench to see how rotor speed in $\text{RPM}$ ($2800\text{ RPM}$) converts to electrical $\text{rad/s}$ and shaft power in watts.

No hardware required for this module (`hardware_required: false`). On the physical bench in Stage 0 (`L0.2`), this unit discipline prevents DMM and oscilloscope scaling errors:
```text
[Datasheet: R=5 mOhm, I=20 A] ---> [SI Conversion: 0.005 Ohm * 20 A] ---> [DMM Readout: 0.100 V (100 mV)]
```
Pass/fail verification in simulation: `omega == 251.33 rad/s`, `P == 113.10 W`, and `tau_RC == 1.00 ms`.

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: dimensional_analysis_unit_checks]` Convert $3000\text{ RPM}$ into angular velocity $\omega$ in $\text{rad/s}$ (tolerance $\pm 0.01\text{ rad/s}$).
2. `[Apply] [Concept: scientific_notation_and_prefixes]` Compute the voltage drop in millivolts ($\text{mV}$, tolerance $\pm 0.01\text{ mV}$) across a $5\text{ m}\Omega$ shunt resistor carrying $20\text{ A}$.
3. `[Transfer] [Concept: scientific_notation_and_prefixes]` What is the loop period $T_s = 1 / f_s$ in microseconds ($\mu\text{s}$, tolerance $\pm 0.01\,\mu\text{s}$) for a $25\text{ kHz}$ FOC control loop?
4. `[Concept: si_base_and_derived_units]` Given position $x$ in $\text{m}$, velocity $v$ in $\text{m/s}$, acceleration $a$ in $\text{m/s}^2$, and time step $\Delta t$ in $\text{s}$, which expression is dimensionally valid?
   - **A.** $x_{\text{new}} = x + v + a\,\Delta t$
   - **B.** $x_{\text{new}} = x + v\,\Delta t + 0.5\,a\,\Delta t^2$
   - **C.** $x_{\text{new}} = x\,\Delta t + v + a / \Delta t$
   - **D.** $x_{\text{new}} = x + v / \Delta t$
5. `[Spaced review -> 00-foundations.T1.00b — Concept: lists_dicts_and_numpy_arrays] [Concept: si_base_and_derived_units]` Given `currents_ma = [500.0, 1500.0, 2500.0]`, compute the mean current in base amperes ($\text{A}$, tolerance $\pm 10^{-9}\text{ A}$).

**Answer key:**
```python
import math

q1_omega = 3000.0 * (2.0 * math.pi / 60.0)
q2_mv = (20.0 * 5.0e-3) * 1e3
q3_us = (1.0 / 25_000.0) * 1e6
q4_choice = "B"
q5_mean_a = (sum([500.0, 1500.0, 2500.0]) / 3.0) * 1e-3

assert math.isclose(q1_omega, 314.159265, rel_tol=1e-5)
assert math.isclose(q2_mv, 100.0, rel_tol=1e-9)
assert math.isclose(q3_us, 40.0, rel_tol=1e-9)
assert q4_choice == "B"
assert math.isclose(q5_mean_a, 1.5, rel_tol=1e-9)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q4, study `## 3. Formalization`; if you missed Q2 or Q3, study `## 4. Worked example`; if you missed Q5, study `## 3. Formalization` (and review `00-foundations.T1.00b`). On pass, proceed to `## 10. Next modules`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Derivative term $K_d (e_k - e_{k-1}) / \Delta t$ is $1000\times$ too small | Plugged $\Delta t = 1$ (milliseconds) instead of $\Delta t = 0.001\text{ s}$. | Name the variable `dt_s = 1.0e-3` and convert all times to seconds on entry. |
| Motor power calculation $P = \tau N$ is $9.55\times$ too high | Multiplied torque $\text{N}\cdot\text{m}$ directly by $\text{RPM}$ instead of $\omega$ in $\text{rad/s}$. | Multiply $\text{RPM}$ by $2\pi / 60 \approx 0.10472$ before computing $P = \tau\omega$. |
| Capacitor filter cutoff is off by $10^3$ | Confused nanofarads ($\text{nF} = 10^{-9}\text{ F}$) with microfarads ($\mu\text{F} = 10^{-6}\text{ F}$). | Write scientific notation explicitly (`100e-9` for $100\text{ nF}$). |

## 9. Resources
- **Bolton — *Mechatronics: Electronic Control Systems in Mechanical and Electrical Engineering* (`resources/textbooks-and-papers.md`):** Measurement systems, SI units, and engineering prefixes `[VERIFIED 2026-10-15]`.
- **Track 00 (`00-foundations/README.md`):** Enforces SI unit consistency ($K_t \equiv K_e$ in $\text{N}\cdot\text{m/A}$ and $\text{V}\cdot\text{s/rad}$) across all tracks `[VERIFIED 2026-10-15]`.
- **NIST Guide to the SI (`physics.nist.gov/cuu/Units/`):** Reference tables for base and derived SI units `[UNVERIFIED]`.
## 10. Next modules
- Proceed to [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Linear Equations, Unit-Circle Trig, Radians, atan2 & 2D Vectors*).
