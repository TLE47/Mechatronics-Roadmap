---
id: 00-foundations.T2.00f
title: "Sampling, Aliasing, Z-Transform Delay z^-1, Bilinear (Tustin) Transform & Biquad Filters"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00d
new_concepts:
  - nyquist_sampling_and_aliasing
  - z_transform_unit_delay_difference_eq
  - bilinear_tustin_frequency_prewarping
uses:
  - complex_impedance_and_transfer_function
  - bode_magnitude_db_and_phase
  - exponential_moving_average_filter
est_hours: 4.0
---

## 1. Why This Matters
Before running the Transposed Direct Form II (TDF-II) biquad notch filter in Step 2.1 (`00-foundations.T2.01`), you need to know why high-frequency PWM noise folds down into fake low-frequency oscillations if not filtered before sampling (aliasing), what $z^{-1}$ means in code (simply the previous sample `x_prev`), and why the Bilinear (Tustin) transform warps high frequencies unless you pre-warp the target notch frequency.

## 2. Mental Model
1. **Nyquist Frequency & Aliasing:**
   Sampling at $f_s\text{ Hz}$ can only uniquely represent frequencies below the Nyquist limit $f_{\text{Nyquist}} = f_s / 2$. Any analog frequency $f > f_s / 2$ folds back ("aliases") to an apparent frequency $f_{\text{alias}} = |f - k f_s|$ inside $[0, f_s/2]$.
2. **The Unit Delay Operator $z^{-1}$:**
   In discrete-time transfer functions $H(z)$, multiplying by $z^{-1}$ means "wait one sample period $T_s$":
   $$Y(z)\bigl(1 + a_1 z^{-1} + a_2 z^{-2}\bigr) = U(z)\bigl(b_0 + b_1 z^{-1} + b_2 z^{-2}\bigr)$$
   In C or Python, this is just the difference equation:
   $$y[k] = b_0 u[k] + b_1 u[k-1] + b_2 u[k-2] - a_1 y[k-1] - a_2 y[k-2]$$
3. **Bilinear (Tustin) Transform & Frequency Pre-Warping:**
   Approximating an integral by the trapezoidal rule substitutes $s \leftarrow \frac{2}{T_s}\frac{1 - z^{-1}}{1 + z^{-1}}$. Because this compresses the entire infinite analog axis $\omega_a \in [0, \infty)$ into the digital Nyquist band $\omega_d \in [0, \pi/T_s]$, frequencies warp according to $\omega_a = \frac{2}{T_s}\tan\!\left(\frac{\omega_d T_s}{2}\right)$. To place a digital notch filter at exact frequency $f_0$, pre-warp the analog prototype frequency to $\omega_{\text{pre}} = \frac{2}{T_s}\tan\!\left(\frac{\pi f_0}{f_s}\right)$.

## 3. Worked Example
1. **Aliasing:** An ADC samples motor current at $f_s = 1000\text{ Hz}$ ($f_{\text{Nyquist}} = 500\text{ Hz}$). A mechanical gear whine at $f = 900\text{ Hz}$ enters the ADC un-filtered.
   $$f_{\text{alias}} = |900 - 1 \times 1000| = 100\text{ Hz}$$
   The controller sees a phantom $100\text{ Hz}$ oscillation that cannot be removed by any digital filter after sampling!
2. **Tustin Pre-Warping:** You want a digital notch filter centered at $f_0 = 850\text{ Hz}$ in a $f_s = 4000\text{ Hz}$ loop ($T_s = 0.00025\text{ s}$).
   - Without pre-warping, an analog design at $\omega_0 = 2\pi(850) = 5340.7\text{ rad/s}$ lands at digital frequency:
     $$f_{\text{actual}} = \frac{f_s}{\pi}\arctan\!\left(\frac{\omega_0 T_s}{2}\right) = \frac{4000}{\pi}\arctan(0.66759) = 749.51\text{ Hz} \quad (\text{misses by } 100.49\text{ Hz!})$$
   - With pre-warping, design the analog prototype at:
     $$f_{\text{pre}} = \frac{f_s}{\pi}\tan\!\left(\frac{\pi f_0}{f_s}\right) = \frac{4000}{\pi}\tan(0.66759) = 1004.75\text{ Hz}$$
     When Tustin-mapped, the notch lands at exactly $850.00\text{ Hz}$.

## 4. Code
```python
import math

fs_hz = 1000.0
f_signal_hz = 900.0
f_alias_hz = abs(f_signal_hz - round(f_signal_hz / fs_hz) * fs_hz)
assert math.isclose(f_alias_hz, 100.0, rel_tol=1e-9)

fs_notch_hz = 4000.0
f_target_hz = 850.0
f_digital_unwarped_hz = (fs_notch_hz / math.pi) * math.atan(math.pi * f_target_hz / fs_notch_hz)
miss_hz = f_target_hz - f_digital_unwarped_hz
assert math.isclose(miss_hz, 100.49, abs_tol=0.05)

f_prewarped_hz = (fs_notch_hz / math.pi) * math.tan(math.pi * f_target_hz / fs_notch_hz)
f_digital_after_prewarp = (fs_notch_hz / math.pi) * math.atan(math.pi * f_prewarped_hz / fs_notch_hz)
assert math.isclose(f_digital_after_prewarp, 850.0, rel_tol=1e-12)
print(f"Alias={f_alias_hz:.1f} Hz, Unwarped={f_digital_unwarped_hz:.2f} Hz (miss={miss_hz:.2f} Hz), Prewarped={f_digital_after_prewarp:.2f} Hz")
```
Expected output:
```text
Alias=100.0 Hz, Unwarped=749.51 Hz (miss=100.49 Hz), Prewarped=850.00 Hz
```

## 5. Exercise
You sample a joint torque sensor at $f_s = 2000\text{ Hz}$ and want to place a digital Tustin notch filter at a structural resonance of $f_0 = 400\text{ Hz}$. Compute the pre-warped analog frequency $f_{\text{pre}}$ in Hz.
- **Check:** $f_{\text{pre}} = \frac{2000}{\pi}\tan\!\left(\frac{\pi \times 400}{2000}\right) = \frac{2000}{\pi}\tan(0.2\pi) \approx 462.53\text{ Hz}$.

## 6. Gate Test
1. Can a digital low-pass filter running at $f_s = 1\text{ kHz}$ remove $20\text{ kHz}$ PWM switching ripple after the ADC has already sampled the signal? (Answer: No—once sampled without an analog anti-aliasing filter, $20\text{ kHz}$ aliases down to $0\text{ Hz}$ DC offset and low-frequency noise.)
2. In the transfer function $H(z) = \frac{b_0 + b_1 z^{-1}}{1 + a_1 z^{-1}}$, write the single-line time-domain update equation for $y[k]$. (Answer: `y[k] = b0 * u[k] + b1 * u[k-1] - a1 * y[k-1]`.)

## 7. Resources
- **Oppenheim & Schafer — *Discrete-Time Signal Processing*:** Sampling theorem, aliasing, Z-transforms, and bilinear frequency warping (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 00 (`00-foundations/README.md`):** Directly prepares for the Step 2.1 pre-warped Tustin TDF-II biquad notch filter `[VERIFIED 2026-10-15]`.
