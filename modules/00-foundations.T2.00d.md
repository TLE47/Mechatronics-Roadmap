---
id: 00-foundations.T2.00d
title: "Complex Numbers, Euler's Formula, Phasors, Impedance & Frequency Response (Bode Plots)"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00c
new_concepts:
  - complex_numbers_and_euler_formula
  - complex_impedance_and_transfer_function
  - bode_magnitude_db_and_phase
uses:
  - radians_unit_circle_and_atan2
  - first_order_ode_time_constant
  - second_order_ode_wn_zeta
est_hours: 4.0
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters (Why This Matters)
When you vibrate a mechanical structure or inject a sine-wave voltage into a motor winding, every time derivative $\frac{d}{dt}$ turns into multiplication by $j\omega$ (where $j = \sqrt{-1}$). Complex numbers and Euler's formula collapse differential equations into simple algebra so you can read a Bode plot of magnitude (in decibels, $\text{dB}$) and phase lag (in degrees) at any frequency $\omega$ in Step 2.1 (`00-foundations.T2.01`) and Step 2.6 (`05-control.T2.06`). Already know this? Take the Skip test in section 8 first.

## 2. Intuition first (Mental Model)
Imagine pushing a child on a swing with a steady sinusoidal hand force at frequency $\omega$. When you push very slowly ($\omega \ll \omega_n$), the swing moves in sync with your hand ($0^\circ$ phase lag) at normal amplitude. When you push right at the swing's natural frequency ($\omega = \omega_n$), the swing's amplitude balloons by $10\times$ ($+20\text{ dB}$) and its position lags your hand force by a quarter cycle ($-90^\circ$). When you wiggle your hand frantically ($\omega \gg \omega_n$), the heavy swing barely moves at all (rolling off at $-40\text{ dB/decade}$) and moves opposite to your hand ($-180^\circ$ phase lag). A complex number $H(j\omega) = |H|e^{j\phi}$ packages both pieces of steady-state sine response—the amplitude ratio $|H|$ and the phase shift $\phi$—into a single arrow on a 2D plane, and a Bode plot directly graphs $|H|$ in decibels and $\phi$ in degrees across frequency.

## 3. Formalization
1. **Complex Plane and Euler's Formula:** A complex number $z = x + jy$ with real part $x$ (dimensionless or physical unit), imaginary part $y$, and $j = \sqrt{-1}$ has magnitude $|z| = \sqrt{x^2 + y^2}$ and phase angle $\angle z = \operatorname{atan2}(y, x)$ in radians ($\text{rad}$):
   $$z = x + jy = |z|e^{j\angle z} = |z|(\cos\angle z + j\sin\angle z)$$
   Substituting $x = 1.0$ and $y = -1.0$ gives $|z| = \sqrt{1^2 + (-1)^2} = \sqrt{2} \approx 1.4142$ and $\angle z = \operatorname{atan2}(-1, 1) = -\frac{\pi}{4}\text{ rad} = -45^\circ$.
2. **Frequency-Domain Transfer Function ($d/dt \to j\omega$):** For a steady-state sinusoid $u(t) = e^{j\omega t}$ at angular frequency $\omega = 2\pi f$ ($\text{rad/s}$), differentiating gives $\frac{d}{dt}e^{j\omega t} = j\omega e^{j\omega t}$. Thus a first-order filter $\tau\dot{y} + y = u$ with time constant $\tau$ ($\text{s}$) has complex frequency response:
   $$H(j\omega) = \frac{1}{1 + j\omega\tau}$$
   At the cutoff frequency $\omega_c = 1/\tau$, substituting $\omega\tau = 1$ gives $H(j\omega_c) = \frac{1}{1 + j1}$, so $|H(j\omega_c)| = \frac{1}{\sqrt{2}} \approx 0.7071$ and $\angle H(j\omega_c) = -45^\circ$.
3. **Bode Magnitude (Decibels, $\text{dB}$) and Phase:** Converting linear amplitude ratio $|H(j\omega)|$ (dimensionless) to decibels ($\text{dB}$) uses:
   $$|H(j\omega)|_{\text{dB}} = 20\log_{10}|H(j\omega)|$$
   Substituting $|H(j\omega_c)| = 1/\sqrt{2} \approx 0.7071$ gives $20\log_{10}(1/\sqrt{2}) = -3.0103\text{ dB}$.

## 4. Worked example (Worked Example & Code)
Evaluate a second-order structural transfer function $G(j\omega) = \frac{\omega_n^2}{(j\omega)^2 + 2\zeta\omega_n(j\omega) + \omega_n^2}$ with natural frequency $\omega_n = 100\text{ rad/s}$ and damping ratio $\zeta = 0.05$ when excited right at resonance $\omega = \omega_n = 100\text{ rad/s}$:
$$G(j\omega_n) = \frac{\omega_n^2}{-\omega_n^2 + j2\zeta\omega_n^2 + \omega_n^2} = \frac{1}{j2\zeta} = \frac{1}{j2(0.05)} = -j10.0$$
Thus $|G(j100)| = 10.0$ ($+20.0\text{ dB}$) and $\angle G(j100) = -90.0^\circ$.

```python
import cmath
import math

def second_order_freq_response(wn: float, zeta: float, omega: float) -> tuple[float, float, float]:
    s = 1j * omega
    G = (wn**2) / (s**2 + 2.0 * zeta * wn * s + wn**2)
    mag = abs(G)
    mag_db = 20.0 * math.log10(mag)
    phase_deg = math.degrees(cmath.phase(G))
    return mag, mag_db, phase_deg

mag, mag_db, phase_deg = second_order_freq_response(wn=100.0, zeta=0.05, omega=100.0)
assert math.isclose(mag, 10.0, rel_tol=1e-9)
assert math.isclose(mag_db, 20.0, rel_tol=1e-9)
assert math.isclose(phase_deg, -90.0, abs_tol=1e-9)

H_rc = 1.0 / (1.0 + 1j * 1.0)
assert math.isclose(20.0 * math.log10(abs(H_rc)), -3.0103, abs_tol=1e-4)
assert math.isclose(math.degrees(cmath.phase(H_rc)), -45.0, abs_tol=1e-9)
print(f"Resonance mag={mag:.1f}x ({mag_db:.1f} dB), phase={phase_deg:.1f} deg")
```
Expected output:
```text
Resonance mag=10.0x (20.0 dB), phase=-90.0 deg
```

## 5. Exercise
For the same second-order plant ($\omega_n = 100\text{ rad/s}$, $\zeta = 0.05$), call `second_order_freq_response(100.0, 0.05, 1000.0)` at $\omega = 1000\text{ rad/s}$ ($10\times$ above resonance) and verify that $|G(j1000)|_{\text{dB}} = -39.9127\text{ dB}$ ($\pm 10^{-3}\text{ dB}$, rolling off at $-40\text{ dB/decade}$) and $\angle G(j1000) = -179.4213^\circ$ ($\pm 10^{-3}\text{ deg}$).
- **If your result differs:** Make sure you used `20.0 * math.log10(abs(G))` (amplitude decibels) rather than `10.0 * math.log10(abs(G))` (power decibels, which would give `-19.96 dB`).

## 6. Sim-first path (Simulation path)
Open **Tab 1 (Biquad Notch & Two-Mass Resonance)** in the MechaLab Workbench (`npm run dev`) to inspect how a lightly damped resonance peak ($+20\text{ dB}$) and $-180^\circ$ phase drop appear on an interactive Bode magnitude and phase plot.

## 7. Hardware path (and Safety notes)
No hardware required for this module (`hardware_required: false`). In Track 01 and Track 07, the exact same complex ratio $H(j\omega) = Y(j\omega)/U(j\omega)$ is measured on real actuators by injecting sinusoidal current commands and comparing encoder output amplitude and phase lag:
```text
[Sine Excitation u(t) = A sin(wt)] ---> [Motor + Gearbox] ---> [Encoder y(t) = B sin(wt + phi)]
                                                                 |H(jw)|_dB = 20*log10(B/A), <H = phi
```
Pass/fail verification in simulation: `mag == 10.0`, `mag_db == +20.0 dB`, and `phase_deg == -90.0 deg`.

> **Safety Note (`safety_level: none`):** Pure simulation, math, and software module (`hardware_required: false`); no physical energization hazards.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: complex_numbers_and_euler_formula]` Compute the magnitude $|z|$ (tolerance $\pm 10^{-9}$) and phase angle in degrees $\angle z$ (tolerance $\pm 10^{-9}$) of the complex number $z = 3 + j4$.
2. `[Apply] [Concept: complex_impedance_and_transfer_function]` Compute the magnitude $|Z|$ in ohms ($\Omega$, tolerance $\pm 10^{-6}$) of a series RL motor winding impedance $Z(j\omega) = R + j\omega L$ with $R = 3.0\ \Omega$, $L = 0.004\text{ H}$, and $\omega = 1000\text{ rad/s}$.
3. `[Transfer] [Concept: bode_magnitude_db_and_phase]` Convert a linear amplitude gain of $|H| = 0.10$ into decibels ($\text{dB}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 00-foundations.T2.00c — Concept: radians_unit_circle_and_atan2] [Concept: bode_magnitude_db_and_phase]` At what phase lag (in degrees) does a first-order low-pass filter $H(j\omega) = \frac{1}{1 + j\omega\tau}$ operate when $\omega = 1/\tau$?
   - **A.** $0^\circ$
   - **B.** $-45^\circ$
   - **C.** $-90^\circ$
   - **D.** $-180^\circ$

**Answer key:**
```python
import cmath
import math

z = 3.0 + 4.0j
q1_mag = abs(z)
q1_phase_deg = math.degrees(cmath.phase(z))
q2_z_ohm = abs(3.0 + 1j * 1000.0 * 0.004)
q3_db = 20.0 * math.log10(0.10)
q4_choice = "B"

assert math.isclose(q1_mag, 5.0, rel_tol=1e-9)
assert math.isclose(q1_phase_deg, 53.13010235415598, rel_tol=1e-9)
assert math.isclose(q2_z_ohm, 5.0, rel_tol=1e-9)
assert math.isclose(q3_db, -20.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2, study `## 3. Formalization` item 2; Q3 or Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 11. Next modules`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Bode dB value is half of expected (`+10 dB` instead of `+20 dB`) | Used $10\log_{10}|H|$ instead of $20\log_{10}|H|$ for amplitude ratios. | Always use $20\log_{10}(|H|)$ for voltage, current, force, or position amplitude ratios. |
| Natural logarithm used instead of base-10 log | Called `math.log(mag)` (natural log $\ln$) instead of `math.log10(mag)`. | Explicitly call `math.log10(mag)` when computing decibels. |
| Phase angle wraps unexpectedly or is in radians | Forgot `math.degrees(...)` on `cmath.phase(G)`. | Wrap `cmath.phase(G)` with `math.degrees(...)` when plotting Bode phase in degrees. |

## 10. Resources
- **Oppenheim & Willsky — *Signals and Systems* (`resources/textbooks-and-papers.md`):** Frequency response, phasors, and Bode diagrams `[UNVERIFIED]`.
- **Track 00 (`00-foundations/README.md`):** Prepares directly for Step 2.1 two-mass torsional resonance and anti-resonance Bode analysis `[VERIFIED 2026-10-15]`.
## 11. Next modules
- Proceed to [`00-foundations.T2.00e`](00-foundations.T2.00e.md) (*Laplace Transform, Poles/Zeros, State-Space $\dot{x} = Ax + Bu$, Matrix Exponential & Discretization*).
