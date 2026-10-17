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
resources_verified: true
difficulty:
  math: 3
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
---

## 1. Why it matters
When you vibrate a mechanical structure or inject a sine-wave voltage into a motor winding, every time derivative $\frac{d}{dt}$ turns into multiplication by $j\omega$ (where $j = \sqrt{-1}$). Complex numbers and Euler's formula collapse differential equations into simple algebra so you can read a Bode plot of magnitude (in decibels, $\text{dB}$) and phase lag (in degrees) at any frequency $\omega$ in Step 2.1 (`00-foundations.T2.01`) and Step 2.6 (`05-control.T2.06`). Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine pushing a child on a swing with a steady sinusoidal hand force at frequency $\omega$. When you push very slowly ($\omega \ll \omega_n$), the swing moves in sync with your hand ($0^\circ$ phase lag) at normal amplitude. When you push right at the swing's natural frequency ($\omega = \omega_n$), the swing's amplitude balloons by $10\times$ ($+20\text{ dB}$) and its position lags your hand force by a quarter cycle ($-90^\circ$). When you wiggle your hand frantically ($\omega \gg \omega_n$), the heavy swing barely moves at all (rolling off at $-40\text{ dB/decade}$) and moves opposite to your hand ($-180^\circ$ phase lag). A complex number $H(j\omega) = |H|e^{j\phi}$ packages both pieces of steady-state sine response—the amplitude ratio $|H|$ and the phase shift $\phi$—into a single arrow on a 2D plane, and a Bode plot directly graphs $|H|$ in decibels and $\phi$ in degrees across frequency.

## 3. Formalization
1. **Complex Plane and Euler's Formula:** A complex number $z = x + jy$ with real part $x$ (dimensionless or physical unit), imaginary part $y$, and $j = \sqrt{-1}$ has magnitude $|z| = \sqrt{x^2 + y^2}$ and phase angle $\angle z = \operatorname{atan2}(y, x)$ in radians ($\text{rad}$):

$$
z = x + jy = |z|e^{j\angle z} = |z|(\cos\angle z + j\sin\angle z)
$$

   Substituting $x = 1.0$ and $y = -1.0$ gives $|z| = \sqrt{1^2 + (-1)^2} = \sqrt{2} \approx 1.4142$ and $\angle z = \operatorname{atan2}(-1, 1) = -\frac{\pi}{4}\text{ rad} = -45^\circ$.
2. **Frequency-Domain Transfer Function ($d/dt \to j\omega$):** For a steady-state sinusoid $u(t) = e^{j\omega t}$ at angular frequency $\omega = 2\pi f$ ($\text{rad/s}$), differentiating gives $\frac{d}{dt}e^{j\omega t} = j\omega e^{j\omega t}$. Thus a first-order filter $\tau\dot{y} + y = u$ with time constant $\tau$ ($\text{s}$) has complex frequency response:

$$
H(j\omega) = \frac{1}{1 + j\omega\tau}
$$

   At the cutoff frequency $\omega_c = 1/\tau$, substituting $\omega\tau = 1$ gives $H(j\omega_c) = \frac{1}{1 + j1}$, so $|H(j\omega_c)| = \frac{1}{\sqrt{2}} \approx 0.7071$ and $\angle H(j\omega_c) = -45^\circ$.
3. **Bode Magnitude (Decibels, $\text{dB}$) and Phase:** Converting linear amplitude ratio $|H(j\omega)|$ (dimensionless) to decibels ($\text{dB}$) uses:

$$
\lvert H(j\omega)\rvert_{\text{dB}} = 20\log_{10}\lvert H(j\omega)\rvert
$$

   Substituting $|H(j\omega_c)| = 1/\sqrt{2} \approx 0.7071$ gives $20\log_{10}(1/\sqrt{2}) = -3.0103\text{ dB}$.

## 4. Worked example
**Predict first (before you run it):** Commit to three numbers and one ordering before the block runs, for the second-order structure with $\omega_n = 100\text{ rad/s}$ and $\zeta = 0.05$: (1) $|G(j\omega_n)|$ and its value in $\text{dB}$; (2) $\angle G(j\omega_n)$; (3) is $|G(j1000)|$ above or below the DC gain of $1.0$, and is that phase nearer $-90^\circ$ or $-180^\circ$? Two tells that a wrong answer is a mistake: the resonance peak must be exactly $1/(2\zeta) = 10.0$ ($+20.0\text{ dB}$), so a peak of $1.0$ means $\omega = 0$ was evaluated instead of $\omega_n$; and a reading of $+10.0\text{ dB}$ for that same peak means $10\log_{10}|G|$ (power decibels) was used instead of $20\log_{10}|G|$ (amplitude decibels).
Evaluate a second-order structural transfer function $G(j\omega) = \frac{\omega_n^2}{(j\omega)^2 + 2\zeta\omega_n(j\omega) + \omega_n^2}$ with natural frequency $\omega_n = 100\text{ rad/s}$ and damping ratio $\zeta = 0.05$ when excited right at resonance $\omega = \omega_n = 100\text{ rad/s}$:

$$
G(j\omega_n) = \frac{\omega_n^2}{-\omega_n^2 + j2\zeta\omega_n^2 + \omega_n^2} = \frac{1}{j2\zeta} = \frac{1}{j2(0.05)} = -j10.0
$$

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

### Graded package - a Bode plot measured on the arm
[`exercises/00-foundations.T2.00d/`](../exercises/00-foundations.T2.00d/) turns this section into a test. `starter.py` holds seven holes: `to_polar`, `to_rect`, `first_order_response`, `second_order_response`, `magnitude_db` (20 log10, not 10), `phase_deg`, and `resonance_peak` (its location and height, or no peak at all). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00d/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00d -p 'test_*.py'
```

The tests are behavioural: the first-order corner must be $-3.0103$ dB and $-45^\circ$; the second-order DC gain must be 1 at every damping and the gain at $\omega_n$ must be $1/(2\zeta)$; `magnitude_db` is checked at 10 and 0.1 so power decibels fail; the phase is checked in degrees; and the reported resonance peak must be a point **on the reported curve**, which is what exposes `omega_r = omega_n` at $\zeta = 0.3$. The transfer suite measures the arm's elbow with a sine torque and a sine/cosine projection (a lock-in, like a bench sweep) and compares gain and phase with the submission's transfer function at three frequencies, then checks that the measured peak sits below $\omega_n$ - with `plant.B2` counted as part of the damping. Four planted faults - `ten_log`, `phase_radians`, `peak_at_natural`, `hardcoded_response` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Module:** [`00-foundations.T2.00c`](00-foundations.T2.00c.md) (Natural Frequency $\omega_n$ & Damping Ratio $\zeta$).
  - **Core Concepts to Review First:** Evaluating complex transfer function $G(j\omega) = \frac{\omega_n^2}{(\omega_n^2 - \omega^2) + j(2\zeta\omega_n\omega)}$, magnitude in decibels $20\log_{10}|G(j\omega)|$, and phase angle $\operatorname{atan2}(\operatorname{Im}, \operatorname{Re})$ in `## 3. Formalization` (Items 2–3) and `## 4. Worked example` above.
  - **Bode Plot & Phasor Study Links:** [Brian Douglas: Bode Plots by Hand & Frequency Response (YouTube)](https://www.youtube.com/user/ControlLectures), [CTMS Frequency Response Tutorial (`ctms.engin.umich.edu`)](https://ctms.engin.umich.edu/CTMS/index.php?example=Introduction&section=ControlFrequency), and [Python `cmath` Documentation](https://docs.python.org/3/library/cmath.html).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) (**Tab 2: Two-Mass & Notch Bode**).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution below ---
import cmath
import math

def to_polar(z):
    """(magnitude, phase_rad) of a complex number - Euler's formula, read backwards."""
    # TODO: `abs(z)` and `cmath.phase(z)`, no quadrant fix-ups
    ...

def to_rect(magnitude, phase_rad):
    """The complex number m e^{j phi}."""
    # TODO: `cmath.rect(m, phi)` - Euler's formula, not a cos/sin pair retyped here
    ...

def first_order_response(tau, omega):
    """H(jw) = 1 / (1 + j w tau), i.e. `d/dt` becomes `j*omega`."""
    # TODO: substitute j*omega for the derivative and divide
    ...

def second_order_response(wn, zeta, omega):
    """G(jw) = wn^2 / ((jw)^2 + 2 zeta wn (jw) + wn^2)."""
    # TODO: s = 1j*omega first, then evaluate the denominator on that complex s
    ...

def magnitude_db(h):
    """Amplitude in decibels."""
    # TODO: 20 log10 |h| - power decibels (10 log10) halve every reading
    ...

def phase_deg(h):
    """Phase of h in degrees."""
    # TODO: radians out of cmath.phase converted to degrees
    ...

def resonance_peak(wn, zeta):
    """(omega_r, peak_magnitude), or (0.0, 1.0) when |G| never rises above 1."""
    # TODO: omega_r = wn sqrt(1 - 2 zeta^2) only while zeta < 1/sqrt(2);
    #       peak = 1 / (2 zeta sqrt(1 - zeta^2)); otherwise return the flat pair
    ...

print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```
**Expected numbers (the answer):** at $\omega = 1000\text{ rad/s}$: $-39.9127\text{ dB}$ and $-179.4213^\circ$.

### Hint ladder
1. **`d/dt -> j omega` is the whole trick.** A first-order filter $\tau\dot{y} + y = u$ becomes $j\omega\tau H + H = 1$, so $H = 1/(1 + j\omega\tau)$ - divide, never subtract.
2. **The denominator is complex, not a length.** For the second-order plant write `s = 1j*omega` and evaluate `s*s + 2*zeta*wn*s + wn*wn`; taking `abs()` of the parts separately before that division is what turns $-39.9\text{ dB}$ into a wrong sign.
3. **Decibels use 20, phase uses degrees.** `20*math.log10(abs(G))` and `math.degrees(cmath.phase(G))`; at $\omega = 1000$ the plant is almost $180^\circ$ away from the drive, so the phase you get should sit just above $-180^\circ$, not near $-90^\circ$.
4. **The peak is not at $\omega_n$.** Differentiating $|G|$ gives $\omega_r = \omega_n\sqrt{1 - 2\zeta^2}$: for $\zeta = 0.05$ that is $99.7497\text{ rad/s}$, a little *below* $\omega_n$, and the peak height $1/(2\zeta\sqrt{1-\zeta^2})$ is a little *above* the $1/(2\zeta) = 10$ you read at $\omega_n$ itself.

### Full Solution
```python
import cmath
import math

def to_polar(z):
    return abs(z), cmath.phase(z)

def to_rect(magnitude, phase_rad):
    return cmath.rect(magnitude, phase_rad)

def first_order_response(tau, omega):
    return 1.0 / (1.0 + 1j * omega * tau)

def second_order_response(wn, zeta, omega):
    s = 1j * omega
    return (wn * wn) / (s * s + 2.0 * zeta * wn * s + wn * wn)

def magnitude_db(h):
    return 20.0 * math.log10(abs(h))

def phase_deg(h):
    return math.degrees(cmath.phase(h))

def resonance_peak(wn, zeta):
    if zeta <= 0.0 or zeta >= 1.0 / math.sqrt(2.0):
        return 0.0, 1.0
    root = math.sqrt(1.0 - 2.0 * zeta * zeta)
    return wn * root, 1.0 / (2.0 * zeta * math.sqrt(1.0 - zeta * zeta))

wn, zeta = 100.0, 0.05
g = second_order_response(wn, zeta, 1000.0)
g_db = magnitude_db(g)
g_phase = phase_deg(g)
omega_r, peak = resonance_peak(wn, zeta)
corner = first_order_response(0.01, 100.0)

assert math.isclose(g_db, -39.9127, abs_tol=1e-3)
assert math.isclose(g_phase, -179.4213, abs_tol=1e-3)
assert math.isclose(magnitude_db(corner), -3.0103, abs_tol=1e-4)
assert math.isclose(phase_deg(corner), -45.0, abs_tol=1e-9)
assert math.isclose(omega_r, wn * math.sqrt(1.0 - 2.0 * zeta ** 2), rel_tol=1e-12)
assert math.isclose(abs(second_order_response(wn, zeta, omega_r)), peak, rel_tol=1e-9)
print("G(j1000): %.4f dB, %.4f deg" % (g_db, g_phase))
print("resonance: %.4f rad/s at %.4fx (%.4f dB)" % (omega_r, peak, magnitude_db(peak)))
```

Printed: `G(j1000): -39.9127 dB, -179.4213 deg`, then `resonance: 99.7497 rad/s at 10.0125x (20.0109 dB)`.

### Break it on purpose
Inject the decibel-convention fault from the `## 8. Common mistakes` table and diagnose it from two readings, keeping $\omega_n = 100\text{ rad/s}$ and $\zeta = 0.05$:
- **Inject:** compute the magnitude as `10.0 * math.log10(mag)` instead of `20.0 * math.log10(mag)`.
- **Symptom:** the resonance still sits at $\omega = 100\text{ rad/s}$ but reads $+10.0\text{ dB}$ instead of $+20.0\text{ dB}$, and the first-order corner that must be $-3.0103\text{ dB}$ reads $-1.505\text{ dB}$ - every decibel value is exactly half of the truth.
- **Diagnose:** a uniform factor of two across two different circuits rules out a wrong $\zeta$ (which would move the peak height and the $\omega_r$ location, not halve every reading) and a wrong $\omega_n$ (which would shift where the features sit, not their height). The constant half says the log is the power form, because $10\log_{10}|H|^2 = 20\log_{10}|H|$ for an amplitude ratio.
- **Fix:** use $20\log_{10}|G|$; then the peak reads $+20.0\text{ dB}$ and the RC corner $-3.0103\text{ dB}$ to within $10^{-4}\text{ dB}$, and the $\omega = 1000\text{ rad/s}$ point lands on $-39.9127\text{ dB}$.

## 6. Simulation path
Open **Tab 2 (Two-Mass & Notch Bode)** in the MechaLab Workbench (`npm run dev`) to inspect how a lightly damped resonance peak ($+20\text{ dB}$) and $-180^\circ$ phase drop appear on an interactive Bode magnitude and phase plot.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00d`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Track 01 and Track 07, the exact same complex ratio $H(j\omega) = Y(j\omega)/U(j\omega)$ is measured on real actuators by injecting sinusoidal current commands and comparing encoder output amplitude and phase lag:
```text
[Sine Excitation u(t) = A sin(wt)] ---> [Motor + Gearbox] ---> [Encoder y(t) = B sin(wt + phi)]
                                                                 |H(jw)|_dB = 20*log10(B/A), <H = phi
```
Pass/fail verification in simulation: `mag == 10.0`, `mag_db == +20.0 dB`, and `phase_deg == -90.0 deg`.


```mermaid
flowchart LR
    A["00-foundations.T2.00d: complex_numbers_and_euler_formula"] --> B["complex_impedance_and_transfer_function"]
    B --> C["bode_magnitude_db_and_phase"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
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
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2, study `## 3. Formalization` item 2; Q3 or Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.

### Gate test
This is the exit examination for the whole Track 00 Tier 2 ladder - [`00-foundations.T2.00a`](00-foundations.T2.00a.md) through [`00-foundations.T2.00f`](00-foundations.T2.00f.md) - before Step 2.1 (`00-foundations.T2.01`):
1. `[Concept: complex_numbers_and_euler_formula]` Compute the magnitude $|z|$ of $z = 2 - j2$ (tolerance $\pm 10^{-9}$).
2. `[Concept: complex_numbers_and_euler_formula]` Multiplying a phasor by $j$ leaves its amplitude alone and does what to its phase?
   - **A.** Advances it by $+90^\circ$.
   - **B.** Delays it by $90^\circ$.
   - **C.** Doubles the amplitude and leaves the phase.
   - **D.** Negates the phasor and doubles its amplitude.
3. `[Concept: complex_impedance_and_transfer_function]` A motor winding is modelled as $Z(j\omega) = R + j\omega L$ with $R = 4.0\ \Omega$, $L = 2.0\text{ mH}$ and $\omega = 2000\text{ rad/s}$. Compute $|Z|$ in ohms (tolerance $\pm 10^{-6}$).
4. `[Concept: bode_magnitude_db_and_phase]` Convert a linear amplitude gain of $|H| = 0.01$ into decibels ($\text{dB}$, tolerance $\pm 10^{-9}$).
5. `[Concept: bode_magnitude_db_and_phase] [Concept: complex_impedance_and_transfer_function] [Concept: complex_numbers_and_euler_formula]` A first-order low-pass $H(j\omega) = \frac{1}{1 + j\omega\tau}$ is evaluated exactly at its corner $\omega = 1/\tau$. Compute $20\log_{10}|H|$ in decibels (tolerance $\pm 10^{-4}$).
6. `[Concept: laplace_poles_and_zeros] [Concept: continuous_state_space_matrices] [Concept: discrete_state_transition_euler_tustin]` For the companion matrix $A = \begin{bmatrix} 0 & 1 \\ -400 & -8 \end{bmatrix}$, compute $\det(A)$ (tolerance $\pm 10^{-9}$).
7. `[Concept: matrix_vector_multiplication] [Concept: state_vector_one_step_update]` With $A_d = \begin{bmatrix} 1.0 & 0.01 \\ -1.0 & 0.90 \end{bmatrix}$, $B_d = \begin{bmatrix} 0 \\ 0.01 \end{bmatrix}$, $\vec{x}_0 = \begin{bmatrix} 0.5 \\ 0.0 \end{bmatrix}$ and $u_0 = 0$, compute the updated position $x_1$ (tolerance $\pm 10^{-9}\text{ m}$).
8. `[Concept: finite_difference_derivative_and_integral] [Concept: first_order_ode_time_constant]` An RC filter uses $R = 2.2\text{ k}\Omega$ and $C = 10\ \mu\text{F}$. Compute its time constant $\tau = RC$ in milliseconds (tolerance $\pm 10^{-9}\text{ ms}$).
9. `[Concept: dot_product_projection] [Concept: cross_product_3d_moment] [Concept: basis_change_and_invertibility]` For lever arm $\vec{r} = [0.0, 0.50, 0.0]^T\text{ m}$ and force $\vec{F} = [30.0, 0.0, 0.0]^T\text{ N}$, compute the $z$-component of the moment $\tau_z = (\vec{r}\times\vec{F})_z$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$).
10. `[Concept: second_order_ode_wn_zeta] [Concept: characteristic_polynomial_roots]` For $\ddot{x} + 6\dot{x} + 25x = 0$, compute the damping ratio $\zeta$ (tolerance $\pm 10^{-9}$).
11. `[Concept: nyquist_sampling_and_aliasing] [Concept: tustin_frequency_prewarping_and_biquad]` A $2600\text{ Hz}$ vibration is sampled at $f_s = 2000\text{ Hz}$. Compute the alias frequency in $\text{Hz}$ (tolerance $\pm 10^{-9}$).
12. `[Concept: gaussian_variance_and_covariance_matrix]` Given $\Sigma_x = \begin{bmatrix} 1.0 & 0.0 \\ 0.0 & 4.0 \end{bmatrix}$, $A = \begin{bmatrix} 1.0 & 0.25 \\ 0.0 & 1.0 \end{bmatrix}$ and $Q = 0$, compute the $(0,0)$ entry of $\Sigma_y = A\Sigma_xA^\top + Q$ (tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import cmath
import math

g1_mag = abs(2.0 - 2.0j)
g2_choice = "A"
g3_z_ohm = abs(4.0 + 1j * 2000.0 * 0.002)
g4_db = 20.0 * math.log10(0.01)
g5_corner_db = 20.0 * math.log10(abs(1.0 / (1.0 + 1.0j)))
g6_det = 0.0 * (-8.0) - 1.0 * (-400.0)
g7_x1 = 1.0 * 0.5 + 0.01 * 0.0
g8_tau_ms = (2.2e3 * 10.0e-6) * 1e3
g9_tau_z = 0.0 * 0.0 - 0.50 * 30.0
g10_zeta = 6.0 / (2.0 * math.sqrt(25.0))
g11_alias_hz = abs(2600.0 - 2000.0)
g12_sigma00 = 1.0 * 1.0 * 1.0 + 0.25 * 4.0 * 0.25

assert math.isclose(g1_mag, 2.8284271247461903, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_z_ohm, 5.656854249492381, rel_tol=1e-9)
assert math.isclose(g4_db, -40.0, rel_tol=1e-9)
assert math.isclose(g5_corner_db, -3.0103, abs_tol=1e-4)
assert math.isclose(g6_det, 400.0, rel_tol=1e-9)
assert math.isclose(g7_x1, 0.5, rel_tol=1e-9)
assert math.isclose(g8_tau_ms, 22.0, rel_tol=1e-9)
assert math.isclose(g9_tau_z, -15.0, rel_tol=1e-9)
assert math.isclose(g10_zeta, 0.6, rel_tol=1e-9)
assert math.isclose(g11_alias_hz, 600.0, rel_tol=1e-9)
assert math.isclose(g12_sigma00, 1.25, rel_tol=1e-9)
```
- **Pass mark:** $\ge 80\%$ ($4/4$ on Skip test; $\ge 10/12$ on Gate test). Remediation: Q1–Q5 $\to$ this module's `## 3. Formalization`; Q6 $\to$ `00-foundations.T2.00e`; Q7 $\to$ `00-foundations.T2.00a`; Q8 $\to$ `00-foundations.T2.00c`; Q9 $\to$ `00-foundations.T2.00b`; Q10 $\to$ `00-foundations.T2.00c`; Q11–Q12 $\to$ `00-foundations.T2.00f`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Bode dB value is half of expected (`+10 dB` instead of `+20 dB`) | Used $10\log_{10}\lvert H\rvert $ instead of $20\log_{10}\lvert H\rvert $ for amplitude ratios. | Always use $20\log_{10}(\lvert H\rvert )$ for voltage, current, force, or position amplitude ratios. |
| Natural logarithm used instead of base-10 log | Called `math.log(mag)` (natural log $\ln$) instead of `math.log10(mag)`. | Explicitly call `math.log10(mag)` when computing decibels. |
| Phase angle wraps unexpectedly or is in radians | Forgot `math.degrees(...)` on `cmath.phase(G)`. | Wrap `cmath.phase(G)` with `math.degrees(...)` when plotting Bode phase in degrees. |

## 9. Resources
- **Oppenheim & Willsky — [*Signals and Systems* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md) & [Brian Douglas Bode Plot Lectures](https://www.youtube.com/user/ControlLectures):** Frequency response, phasors, and Bode diagrams `[VERIFIED 2026-10-15]`.
- **Track 00 ([`00-foundations/README.md#tier-2-intermediate--applied`](../00-foundations/README.md#tier-2-intermediate--applied)):** Prepares directly for Step 2.1 two-mass torsional resonance and anti-resonance Bode analysis `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`00-foundations.T2.00e`](00-foundations.T2.00e.md) (Laplace Transform, Poles/Zeros, State-Space $\dot{x} = Ax + Bu$, Matrix Exponential & Discretization).
