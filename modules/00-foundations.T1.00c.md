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
---

## 0. Skip Test
Pass without reading if you can convert $3000\text{ RPM}$ to $\text{rad/s}$ and compute the voltage drop across a $5\text{ m}\Omega$ current-sense shunt at $20\text{ A}$ in millivolts ($\text{mV}$).
- **Check:** $3000 \times \frac{2\pi}{60} = 100\pi \approx 314.159\text{ rad/s}$, and $V = 20\text{ A} \times 0.005\,\Omega = 0.100\text{ V} = 100\text{ mV}$.

## 1. Why This Matters
Real hardware blows up when units are mixed up: plugging milliseconds ($10^{-3}\text{ s}$) into a formula expecting seconds ($1\text{ s}$) makes a controller apply $1000\times$ too much derivative kick, and confusing degrees with radians ruins every trigonometric rotation. Dimensional analysis lets you catch wrong equations before running code by checking that the units on both sides of `=` match.

## 2. Mental Model
1. **Always Store Base SI Units in Code:** Inside variables, keep length in meters ($\text{m}$), mass in kilograms ($\text{kg}$), time in seconds ($\text{s}$), current in amperes ($\text{A}$), angle in radians ($\text{rad}$), force in newtons ($\text{N} = \text{kg}\cdot\text{m/s}^2$), torque in newton-meters ($\text{N}\cdot\text{m}$), and energy in joules ($\text{J} = \text{N}\cdot\text{m}$).
2. **Engineering Prefixes:** Powers of $10^3$:
   - $\text{milli (m)} = 10^{-3}$, $\text{micro (}\mu\text{)} = 10^{-6}$, $\text{nano (n)} = 10^{-9}$
   - $\text{kilo (k)} = 10^{3}$, $\text{mega (M)} = 10^{6}$, $\text{giga (G)} = 10^{9}$
3. **Dimensional Cancellation:** Treat units like algebraic fractions that cancel out:
   $$\omega\,\left[\frac{\text{rad}}{\text{s}}\right] = \text{RPM}\,\left[\frac{\text{rev}}{\text{min}}\right] \times \frac{2\pi\text{ rad}}{1\text{ rev}} \times \frac{1\text{ min}}{60\text{ s}}$$

## 3. Worked Example
A brushless motor spins at $N = 2400\text{ RPM}$ while producing $\tau = 450\text{ mN}\cdot\text{m}$ of torque. What mechanical power $P$ (in Watts, $\text{W} = \text{N}\cdot\text{m/s}$) does it deliver?
- **Step 1 (Convert speed to SI $\text{rad/s}$):**
  $$\omega = 2400 \times \frac{2\pi}{60} = 80\pi \approx 251.3274\text{ rad/s}$$
- **Step 2 (Convert torque to SI $\text{N}\cdot\text{m}$):**
  $$\tau = 450\text{ mN}\cdot\text{m} = 450 \times 10^{-3}\text{ N}\cdot\text{m} = 0.45\text{ N}\cdot\text{m}$$
- **Step 3 (Multiply and verify units):**
  $$P = \tau \cdot \omega = 0.45\,\text{[N}\cdot\text{m]} \times 251.3274\,\text{[rad/s]} = 113.0973\text{ W}$$

## 4. Code
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
A $48\text{ V}$ battery supplies $15\text{ A}$ through a PCB trace with resistance $R = 12\text{ m}\Omega$. Compute the voltage drop $V_{\text{drop}} = I R$ in Volts and the heat power dissipated in the trace $P_{\text{loss}} = I^2 R$ in Watts.
- **Check:** `V_drop = 0.18 V` and `P_loss = 2.70 W`.

## 6. Gate Test
1. Can you legally add $x + v$ in a physics formula where $x$ is in meters ($\text{m}$) and $v$ is in meters per second ($\text{m/s}$)? (Answer: Never—you can only add quantities with identical dimensions, such as $x + v\,\Delta t$.)
2. How many microseconds ($\mu\text{s}$) are in one millisecond ($1\text{ ms}$), and what period in $\mu\text{s}$ corresponds to a $25\text{ kHz}$ PWM loop? (Answer: $1000\,\mu\text{s}$ per $\text{ms}$; $1 / 25{,}000\text{ Hz} = 40\,\mu\text{s}$.)

## 7. Resources
- **NIST Guide to the SI (`physics.nist.gov/cuu/Units/`):** Standard reference for SI base units, derived units, and prefixes `[UNVERIFIED]`.
- **Bolton — *Mechatronics* (Ch. 1–2):** Measurement systems, units, and sensor characteristics (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
