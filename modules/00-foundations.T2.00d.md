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
---

## 1. Why This Matters
When you vibrate a mechanical structure or inject a sine-wave voltage into a motor winding, every derivative $\frac{d}{dt}$ turns into multiplication by $j\omega$ (where $j = \sqrt{-1}$). Complex numbers and Euler's formula ($e^{j\theta} = \cos\theta + j\sin\theta$) collapse differential equations into simple algebra, letting you read a Bode plot of magnitude (in decibels, $\text{dB}$) and phase lag (in degrees) at any frequency $\omega$.

## 2. Mental Model
1. **Complex Plane & Euler's Formula:**
   A complex number $z = x + jy$ has magnitude $|z| = \sqrt{x^2 + y^2}$ and phase angle $\angle z = \operatorname{atan2}(y, x)$. By Euler's formula, $z = |z|e^{j\angle z}$. Multiplying two complex numbers multiplies their magnitudes and adds their phase angles.
2. **Replacing $\frac{d}{dt}$ with $j\omega$:**
   For a sinusoidal signal at frequency $\omega = 2\pi f$, differentiating shifts its phase forward by $+90^\circ$ ($+j$) and scales its amplitude by $\omega$. Thus a first-order filter $\tau\dot{y} + y = u$ becomes:
   $$H(j\omega) = \frac{Y(j\omega)}{U(j\omega)} = \frac{1}{1 + j\omega\tau}$$
3. **Bode Magnitude (dB) and Phase:**
   - Magnitude in decibels: $|H(j\omega)|_{\text{dB}} = 20\log_{10}|H(j\omega)|$.
   - At the cutoff frequency $\omega_c = 1/\tau$, $H(j\omega_c) = \frac{1}{1 + j1}$, so $|H| = \frac{1}{\sqrt{2}} \approx 0.7071$ ($-3.01\text{ dB}$) and $\angle H = -\arctan(1) = -45^\circ$.

## 3. Worked Example
Evaluate a second-order structural transfer function $G(s) = \frac{\omega_n^2}{s^2 + 2\zeta\omega_n s + \omega_n^2}$ with $\omega_n = 100\text{ rad/s}$ and $\zeta = 0.05$ when excited right at its natural frequency $s = j\omega_n = j100\text{ rad/s}$.
- **Step 1 (Substitute $s = j\omega_n$):**
  $$G(j\omega_n) = \frac{\omega_n^2}{(j\omega_n)^2 + 2\zeta\omega_n(j\omega_n) + \omega_n^2} = \frac{\omega_n^2}{-\omega_n^2 + j2\zeta\omega_n^2 + \omega_n^2} = \frac{1}{j2\zeta}$$
- **Step 2 (Compute magnitude and dB peak):**
  $$|G(j\omega_n)| = \frac{1}{2\zeta} = \frac{1}{2(0.05)} = 10.0 \implies 20\log_{10}(10.0) = +20.0\text{ dB}$$
  The lightly damped mechanical resonance amplifies vibrations by $10\times$ ($+20\text{ dB}$)!
- **Step 3 (Compute phase lag at resonance):**
  Since $\frac{1}{j} = -j = e^{-j\pi/2}$, the phase at $\omega = \omega_n$ is exactly $-90^\circ$.

## 4. Code
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

# Check first-order RC filter at cutoff omega = 1/tau
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
For the same second-order plant ($\omega_n = 100\text{ rad/s}$, $\zeta = 0.05$), compute $|G(j\omega)|_{\text{dB}}$ and $\angle G(j\omega)$ at $\omega = 1000\text{ rad/s}$ ($10\times$ above resonance).
- **Check:** $|G(j1000)|_{\text{dB}} \approx -39.91\text{ dB}$ (rolling off at $-40\text{ dB/decade}$) and $\angle G(j1000) \approx -179.42^\circ$.

## 6. Gate Test
1. What does $-20\text{ dB}$ mean in terms of linear amplitude ratio? (Answer: $10^{-20/20} = 0.10$, so the output amplitude is one-tenth of the input amplitude.)
2. Why does adding a low-pass filter inside a feedback control loop reduce stability if you set its cutoff frequency too low? (Answer: Every filter adds negative phase lag $\angle H(j\omega)$, pushing the loop closer to $-180^\circ$ where negative feedback turns into positive feedback.)

## 7. Resources
- **Oppenheim & Willsky — *Signals and Systems*:** Frequency response, phasors, and Bode diagrams (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 00 (`00-foundations/README.md`):** Prepares directly for Step 2.1 two-mass torsional resonance/anti-resonance Bode analysis `[VERIFIED 2026-10-15]`.
