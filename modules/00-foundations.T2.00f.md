---
id: 00-foundations.T2.00f
title: "Nyquist Sampling & Aliasing, Pre-Warped Tustin Biquad Filters & Gaussian Covariance"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00e
new_concepts:
  - nyquist_sampling_and_aliasing
  - tustin_frequency_prewarping_and_biquad
  - gaussian_variance_and_covariance_matrix
uses:
  - bode_magnitude_db_and_phase
  - discrete_state_transition_euler_tustin
  - matrix_vector_multiplication
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 4
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
This is the final bridge module before Step 2.1 (`00-foundations.T2.01`). When a digital controller samples sensors at $f_s = 4\text{ kHz}$, high-frequency vibrations above $f_s/2$ fold down as fake low-frequency signals (aliasing), naive Tustin discretization shifts notch filter center frequencies downward (frequency warping), and multi-dimensional Kalman filters represent sensor uncertainty using covariance matrices $\Sigma$. Mastering these three tools unlocks all of Tier 2 (`2.1`–`2.8`). Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Have you ever watched a car commercial where the spoked wheels appear to spin backward even though the car is speeding forward? The camera shutter (sampling rate $f_s$) is taking snapshots too slowly to catch each spoke's true speed, so a fast rotation masquerades as a slow phantom rotation (**aliasing**). Next, when you map the infinite analog frequency axis onto a digital clock that repeats every $f_s$, the Tustin formula squishes frequencies like a fisheye camera lens (**frequency warping**)—so if you want a digital notch filter to land on $850\text{ Hz}$, you must aim slightly higher in analog first (**pre-warping**). Finally, a **covariance matrix** $\Sigma$ defines a 2D error ellipse showing how uncertain your position and velocity estimates are and whether an error in one tends to go hand-in-hand with an error in the other.

## 3. Formalization
1. **Nyquist Limit and Aliasing:** Sampling at rate $f_s = 1/T_s$ ($\text{Hz}$) can uniquely represent frequencies only up to the Nyquist frequency $f_{\text{Nyquist}} = f_s / 2$. Any analog frequency $f > f_s/2$ folds to an apparent alias frequency in $[0, f_s/2]$:

$$
f_{\text{alias}} = \left| f - k f_s \right| \in \left[0, \frac{f_s}{2}\right]
$$

   Substituting a $f = 3150\text{ Hz}$ vibration sampled at $f_s = 4000\text{ Hz}$ ($k=1$) gives $f_{\text{alias}} = |3150 - 4000| = 850\text{ Hz}$.
2. **Bilinear (Tustin) Warping and Pre-Warped Biquad (`TDF-II`):** The unwarped Tustin transform substitutes $s = \frac{2}{T_s}\frac{1 - z^{-1}}{1 + z^{-1}}$, which maps an analog target frequency $\omega_0 = 2\pi f_0$ ($\text{rad/s}$) to a lower digital frequency $\omega_{\text{actual}} = \frac{2}{T_s}\arctan\left(\frac{\omega_0 T_s}{2}\right)$. To force the digital notch to land on $f_0$, we **pre-warp** the analog prototype frequency $\omega_a$ before substituting:

$$
\omega_a = \frac{2}{T_s}\tan\left(\frac{\pi f_0}{f_s}\right)
$$

   At $f_0 = 850\text{ Hz}$ and $f_s = 4000\text{ Hz}$ ($T_s = 0.00025\text{ s}$), unwarped Tustin lands at $f_{\text{actual}} = \frac{4000}{\pi}\arctan\left(\frac{\pi\cdot 850}{4000}\right) = 749.49\text{ Hz}$ (missing by $100.51\text{ Hz}$!), whereas pre-warping uses $\omega_a = 8000\tan(0.2125\pi) = 6306.69\text{ rad/s}$ ($1003.74\text{ Hz}$) so the digital notch lands on $850.00\text{ Hz}$. The resulting $z$-domain biquad $H(z) = \frac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 + a_1 z^{-1} + a_2 z^{-2}}$ executes in 2 delay states ($w_1, w_2$) via Transposed Direct Form II (`TDF-II`).
3. **Gaussian Variance and Covariance Matrix ($\Sigma$):** A scalar sensor with standard deviation $\sigma$ has variance $\sigma^2$. For a state vector $x \in \mathbb{R}^n$ with mean $\mu$, the symmetric positive semi-definite covariance matrix is $\Sigma = \mathbb{E}[(x - \mu)(x - \mu)^\top]$. Propagating $y = A x + w$ (where $w$ has covariance $Q$) updates the covariance via the quadratic sandwich rule:

$$
\Sigma_y = A \Sigma_x A^\top + Q
$$

   Substituting $A = \begin{bmatrix} 1 & 0.1 \\ 0 & 1 \end{bmatrix}$, $\Sigma_x = \begin{bmatrix} 1 & 0 \\ 0 & 4 \end{bmatrix}$, and $Q = 0$ gives $\Sigma_y = \begin{bmatrix} 1.04 & 0.4 \\ 0.4 & 4.0 \end{bmatrix}$.

## 4. Worked example
**Predict first (before you run it):** Commit to four numbers before running it: where unwarped Tustin lands an $850\text{ Hz}$ target sampled at $f_s = 4000\text{ Hz}$, how many hertz it misses by, the pre-warped analog frequency $\omega_a$ in $\text{rad/s}$, and the off-diagonal entry of $\Sigma_y$ for $A = \begin{bmatrix} 1 & 0.1 \\ 0 & 1 \end{bmatrix}$, $\Sigma_x = \operatorname{diag}(0.01, 0.25)$ and $Q = \operatorname{diag}(0.001, 0.002)$. Two tells: an unwarped prototype that lands exactly on $850.00\text{ Hz}$ means the pre-warp was applied twice, because the unwarped map is the one that misses; and a covariance whose off-diagonal comes out $0$ even though $A$ has an off-diagonal entry means $A \Sigma_x A^\top$ was computed as $A \Sigma_x$, dropping the transpose.

Compare an unwarped vs. pre-warped Tustin notch filter targeting $f_0 = 850\text{ Hz}$ at $f_s = 4000\text{ Hz}$ ($Q_{\text{notch}} = 5$), and verify the covariance propagation $\Sigma_y = A \Sigma_x A^\top + Q$.

```python
import math

fs = 4000.0
Ts = 1.0 / fs
f0 = 850.0
w0 = 2.0 * math.pi * f0

# 1. Unwarped Tustin lands at f_actual = (1/(pi*Ts)) * atan(w0 * Ts / 2)
f_unwarped = (1.0 / (math.pi * Ts)) * math.atan(w0 * Ts / 2.0)
miss_hz = f0 - f_unwarped
assert math.isclose(f_unwarped, 749.4803, abs_tol=1e-3)
assert math.isclose(miss_hz, 100.5197, abs_tol=1e-3)

# 2. Pre-warped analog frequency wa puts the digital notch right on f0 = 850.0 Hz
wa = (2.0 / Ts) * math.tan(math.pi * f0 / fs)
f_landed = (1.0 / (math.pi * Ts)) * math.atan(wa * Ts / 2.0)
assert math.isclose(f_landed, 850.0, rel_tol=1e-12)

# 3. 2x2 Covariance propagation: Sigma_y = A * Sigma_x * A^T + Q
# For A = [[1, 0.1], [0, 1]], Sigma_x = diag(0.01, 0.25), Q = diag(0.001, 0.002)
Sigma_y = [
    [0.01 + 0.1 * 0.1 * 0.25 + 0.001, 0.1 * 0.25],
    [0.1 * 0.25,                      0.25 + 0.002],
]
det_sy = Sigma_y[0][0] * Sigma_y[1][1] - Sigma_y[0][1] * Sigma_y[1][0]
assert math.isclose(Sigma_y[0][1], Sigma_y[1][0], rel_tol=1e-12)
assert Sigma_y[0][0] > 0.0 and det_sy > 0.0
print(f"Unwarped lands at {f_unwarped:.2f} Hz (misses by {miss_hz:.2f} Hz); pre-warped lands at {f_landed:.2f} Hz")
```
Expected output:
```text
Unwarped lands at 749.48 Hz (misses by 100.52 Hz); pre-warped lands at 850.00 Hz
```

## 5. Exercise
Compute the alias frequency $f_{\text{alias}} \in [0, f_s/2]$ when a $2700\text{ Hz}$ structural resonance is sampled at $f_s = 2000\text{ Hz}$ without an analog anti-aliasing filter, and compute the pre-warped analog frequency $\omega_a$ ($\text{rad/s}$) required to place a digital notch at $f_0 = 600\text{ Hz}$ when $f_s = 2000\text{ Hz}$. Verify $f_{\text{alias}} = 700.0\text{ Hz}$ and $\omega_a = 5505.5277\text{ rad/s}$ ($\pm 10^{-3}$).
- **If your result differs:** For aliasing, subtract the nearest integer multiple of $f_s$ ($|2700 - 1 \times 2000| = 700\text{ Hz}$). For pre-warping, check that $\tan(\pi f_0 / f_s)$ is evaluated in radians ($\pi \times 600 / 2000 = 0.3\pi\text{ rad}$).

### Graded package - sampling and estimating the arm's elbow
[`exercises/00-foundations.T2.00f/`](../exercises/00-foundations.T2.00f/) turns this section into a test. `starter.py` holds seven holes: `nyquist_hz`, `alias_hz` (fold **and** mirror), `tustin_hz` (where an analog frequency really lands), `prewarp_omega` (the exact inverse of that map), `notch_coeffs`, `apply_biquad` (Transposed Direct Form II) and `covariance_propagate` (the sandwich rule). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00f/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00f -p 'test_*.py'
```

The tests are behavioural: 3150 Hz at 4 kHz must alias to 850 Hz and 9000 Hz to 1000 Hz; 100 Hz and Nyquist itself must pass through; the pre-warp must land 850 Hz at 6306.69 rad/s and the round trip through `tustin_hz` must be an identity at four sample-rate pairs, while the unwarped prototype misses by 100.52 Hz; the notch must be symmetric, unity at DC, and actually null a sampled 850 Hz tone (RMS ratio below $10^{-3}$) while passing a 200 Hz one; and the covariance must reproduce `[[1.04, 0.4], [0.4, 4.0]]`. The transfer suite drives the plant itself: one closed-loop Euler step of the elbow must equal a `step_arm` tick to the plant's $O(T_s^2)$ ordering term and **not** to machine precision, the $8.2\text{ Hz}$ damped mode must alias to $3.8\text{ Hz}$ at a $12\text{ Hz}$ sample rate, and a 4000-sample Monte-Carlo of plant ticks must match the predicted covariance. Four planted faults - `alias_no_mirror`, `prewarp_unwarped`, `notch_unnormalized`, `covariance_no_transpose` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Bode Plots*) and [`00-foundations.T2.00e`](00-foundations.T2.00e.md) (*Tustin Discretization*).
  - **Core Concepts to Review First:** Nyquist folding $f_{\text{alias}} = |f_{\text{sig}} - k f_s|$ and Tustin frequency pre-warping $\omega_a = \frac{2}{T_s}\tan\!\left(\frac{\pi f_0}{f_s}\right)$ in `## 3. Formalization` (Items 1–2) and `## 4. Worked example` above.
  - **DSP, Biquad & Pre-Warping Study Links:** [The Scientist and Engineer's Guide to DSP (`dspguide.com`, Ch. 3 Sampling & Aliasing)](https://www.dspguide.com/), [Audio EQ Cookbook Biquad Formulas (`w3.org/TR/audio-eq-cookbook`)](https://www.w3.org/TR/audio-eq-cookbook/), and [Roger Labbe *Kalman and Bayesian Filters in Python* (Gaussian Covariance)](https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) (Step 2.1 Pre-Warped TDF-II Biquad Notch).

### Starter code
```python
"""Exercise 00-foundations.T2.00f - the learner's file.

Three tools a digital controller needs before it can trust a sample: what the Nyquist limit folds
high frequencies down to, where Tustin actually puts a frequency, and how an error ellipse grows
across one step. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00f/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00f -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def nyquist_hz(fs):
    """The highest frequency a sample rate `fs` can represent, in Hz."""
    raise NotImplementedError("TODO 1: fs / 2")


def alias_hz(f_sig, fs):
    """The frequency in [0, fs/2] that `f_sig` appears as after sampling at `fs`."""
    raise NotImplementedError("TODO 2: fold with fmod and mirror the second half down")


def tustin_hz(omega_rad_s, fs):
    """Where unwarped Tustin actually places an analog frequency, in Hz."""
    raise NotImplementedError("TODO 3: digital angle 2 atan(omega Ts / 2), then divide by 2 pi Ts")


def prewarp_omega(f0_hz, fs):
    """Analog prototype frequency that lands a Tustin filter exactly on f0_hz."""
    raise NotImplementedError("TODO 4: (2 / Ts) tan(pi f0 / fs)")


def notch_coeffs(f0_hz, fs, q):
    """(b0, b1, b2, a1, a2) for a unity-gain notch at f0_hz with quality factor q; a0 is 1."""
    raise NotImplementedError("TODO 5: alpha = sin(w0) / (2 q); b0 = b2 = 1 / (1 + alpha)")


def apply_biquad(coeffs, samples):
    """Run the TDF-II biquad over `samples` and return one output sample per input."""
    raise NotImplementedError("TODO 6: two delay states, w1 and w2, updated in that order")


def covariance_propagate(a, sigma, q):
    """One predict step: A Sigma A^T + Q, for 2x2 matrices."""
    raise NotImplementedError("TODO 7: the sandwich rule, both sides of Sigma")

def simulate_discrete(ad, bd, x0, u, steps):
    """Kept from 00e: iterate x_{k+1} = Ad x_k + Bd u with a constant u."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
```
**Expected numbers (the answer):** $f_{\text{alias}} = 700.0\text{ Hz}$ and $\omega_a = 5505.5277\text{ rad/s}$.

### Hint ladder
1. **Aliasing is folding, then mirroring.** `math.fmod(2700, 2000)` already gives $700$, but a case like $1300\text{ Hz}$ at $2000\text{ Hz}$ lands on $700$ too and a case like $3150$ at $4000$ gives $3150$, which is above Nyquist - so subtract from $f_s$ whenever the remainder exceeds $f_s/2$.
2. **Pre-warping is the inverse map, not a correction factor.** Unwarped Tustin maps $\omega_a$ to $f = \frac{1}{\pi T_s}\arctan(\omega_a T_s/2)$; invert it and you get $\omega_a = \frac{2}{T_s}\tan(\pi f_0/f_s)$. At $600\text{ Hz}$ on $2000\text{ Hz}$ the tangent argument is $0.3\pi$ radians, and `math.tan` takes radians, never degrees.
3. **Check the round trip, not the number.** `tustin_hz(prewarp_omega(600.0, 2000.0), 2000.0)` must return $600.0$ to $10^{-9}$; if it returns something like $520\text{ Hz}$, the tangent was applied to a frequency already divided by $f_s$.
4. **The sandwich has two multiplications.** $A\Sigma$ then $(A\Sigma)A^\top$; dropping the transpose leaves a non-symmetric matrix, which the module's Transfer test rejects on symmetry alone before it even compares entries.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def nyquist_hz(fs):
    """Half the sample rate."""
    return 0.5 * fs


def alias_hz(f_sig, fs):
    """Fold `f_sig` into [0, fs/2].

    `fmod` gives the remainder one fold down; a remainder past Nyquist is the mirror image of a
    frequency below it, so it is subtracted from fs.
    """
    folded = math.fmod(abs(f_sig), fs)
    if folded > 0.5 * fs:
        folded = fs - folded
    return folded


def tustin_hz(omega_rad_s, fs):
    """`s = j omega` maps to `z = e^{j theta}` with `theta = 2 atan(omega Ts / 2)`."""
    ts = 1.0 / fs
    return math.atan(omega_rad_s * ts / 2.0) / (math.pi * ts)


def prewarp_omega(f0_hz, fs):
    """Inverse of `tustin_hz` at f0: the analog frequency Tustin must be handed."""
    ts = 1.0 / fs
    return (2.0 / ts) * math.tan(math.pi * f0_hz / fs)


def notch_coeffs(f0_hz, fs, q):
    """Notch with zeros on the unit circle at e^{+-j w0}: a true null at f0, unity at DC."""
    w0 = 2.0 * math.pi * f0_hz / fs
    alpha = math.sin(w0) / (2.0 * q)
    norm = 1.0 / (1.0 + alpha)
    b0 = norm
    b1 = -2.0 * math.cos(w0) * norm
    a1 = b1
    a2 = (1.0 - alpha) * norm
    return (b0, b1, b0, a1, a2)


def apply_biquad(coeffs, samples):
    """Transposed Direct Form II, a0 normalized to 1."""
    b0, b1, b2, a1, a2 = coeffs
    w1 = 0.0
    w2 = 0.0
    out = []
    for x in samples:
        y = b0 * x + w1
        w1 = b1 * x - a1 * y + w2
        w2 = b2 * x - a2 * y
        out.append(y)
    return out


def covariance_propagate(a, sigma, q):
    """Sigma' = A Sigma A^T + Q."""
    asigma = [[sum(a[i][k] * sigma[k][j] for k in range(2)) for j in range(2)] for i in range(2)]
    out = [[0.0, 0.0], [0.0, 0.0]]
    for i in range(2):
        for j in range(2):
            out[i][j] = sum(asigma[i][k] * a[j][k] for k in range(2)) + q[i][j]
    return out


def simulate_discrete(ad, bd, x0, u, steps):
    """Kept from 00e: iterate x_{k+1} = Ad x_k + Bd u with a constant u."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

f_alias = alias_hz(2700.0, 2000.0)
wa = prewarp_omega(600.0, 2000.0)
round_trip = tustin_hz(wa, 2000.0)
sigma_y = covariance_propagate([[1.0, 0.1], [0.0, 1.0]], [[1.0, 0.0], [0.0, 4.0]],
                               [[0.0, 0.0], [0.0, 0.0]])

assert math.isclose(f_alias, 700.0, abs_tol=1e-3)
assert math.isclose(wa, 5505.5277, abs_tol=1e-3)
assert math.isclose(round_trip, 600.0, abs_tol=1e-9)
assert math.isclose(sigma_y[0][0], 1.04, abs_tol=1e-12)
assert math.isclose(sigma_y[0][1], 0.4, abs_tol=1e-12) and math.isclose(sigma_y[1][0], 0.4, abs_tol=1e-12)
assert math.isclose(sigma_y[1][1], 4.0, abs_tol=1e-12)
print("alias(2700 Hz @ 2 kHz)=%.1f Hz | prewarp(600 Hz @ 2 kHz)=%.4f rad/s (round trip %.6f Hz)"
      % (f_alias, wa, round_trip))
print("Sigma_y=[[%.4f, %.4f], [%.4f, %.4f]]" % (sigma_y[0][0], sigma_y[0][1], sigma_y[1][0], sigma_y[1][1]))
```

Printed: `alias(2700 Hz @ 2 kHz)=700.0 Hz | prewarp(600 Hz @ 2 kHz)=5505.5277 rad/s (round trip 600.000000 Hz)`, then `Sigma_y=[[1.0400, 0.4000], [0.4000, 4.0000]]`.

**On the shared arm.** The Transfer suite samples the plant's elbow: its damped mode against the 1 kHz tick and a 12 Hz loop, and the encoder's quantisation as a covariance:

```python
import math
import mechalab_plant as plant

k = 8.0
wn = math.sqrt(k / plant.I2)
zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * k))
f_damped = wn * math.sqrt(1.0 - zeta * zeta) / (2.0 * math.pi)
assert f_damped > 6.0                                   # the 12 Hz test's Nyquist limit
assert math.isclose(1.0 / plant.DT, 1000.0, rel_tol=1e-15)
sigma_q = (2.0 * math.pi / plant.ENCODER_CPR) / math.sqrt(12.0)
print("damped mode=%.3f Hz | fs=%.0f Hz | one-count sigma=%.3e rad"
      % (f_damped, 1.0 / plant.DT, sigma_q))
```

### Break it on purpose
Inject the `prewarp_unwarped` fault on purpose: design the $850\text{ Hz}$ notch from $\omega_0 = 2\pi f_0$ instead of the pre-warped prototype, and leave the biquad normalization alone.
- **Inject:** pass the target frequency straight into the Tustin substitution, as if the analog and digital frequency axes were the same line.
- **Symptom:** the notch centre lands at $749.48\text{ Hz}$ - a $100.52\text{ Hz}$ miss - so a true $850\text{ Hz}$ resonance is left almost unattenuated while a $749.5\text{ Hz}$ component is nulled instead. Symmetry and unity DC gain still hold, so every coefficient check except the landing frequency passes.
- **Diagnose:** the landing frequency is exactly the unwarped map's output: `tustin_hz(2 * math.pi * f0, fs)` returns $749.48\text{ Hz}$, while `tustin_hz(prewarp_omega(f0, fs), fs)` returns $850.00\text{ Hz}$ - the round trip is an identity only when the pre-warp is applied first, which localises the fault to the prototype frequency. A normalization error would move the DC gain and break the $b_0 = b_2$, $a_1 = b_1$ symmetry; a coefficient sign error would null nothing at all, including the target tone.
- **Fix:** pre-warp with $\omega_a = \frac{2}{T_s}\tan(\pi f_0/f_s) = 6306.69\text{ rad/s}$ at $850/4000$, then prove it twice: `tustin_hz(omega_a, fs)` returns $850.00\text{ Hz}$ to $10^{-9}$, and a sampled $850\text{ Hz}$ tone loses more than $99.9\%$ of its energy (RMS ratio below $10^{-3}$) while a $200\text{ Hz}$ tone passes through.

## 6. Simulation path
Open **Tab 2 (Two-Mass & Notch Bode)** in the MechaLab Workbench (`npm run dev`) and toggle pre-warping ON vs. OFF at $f_0 = 850\text{ Hz}$, $f_s = 4000\text{ Hz}$ to watch the notch center shift from $749.5\text{ Hz}$ right onto the $850\text{ Hz}$ resonance peak.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00f`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 2.1 (`00-foundations.T2.01`) and Step 2.4 (`03-sensors.T2.04`), the 5 pre-warped biquad coefficients $(b_0, b_1, b_2, a_1, a_2)$ execute inside the microcontroller's `TDF-II` filter loop on every ADC/encoder sample:
```text
[Analog Sensor] ---> [RC Anti-Alias Filter] ---> [ADC @ f_s=4 kHz] ---> [TDF-II Pre-Warped Biquad Notch]
```
Pass/fail verification in simulation: `f_unwarped == 749.49 Hz`, `f_landed == 850.00 Hz`, and `Sigma_y` symmetric positive definite.


```mermaid
flowchart LR
    A["00-foundations.T2.00f: nyquist_sampling_and_aliasing"] --> B["tustin_frequency_prewarping_and_biquad"]
    B --> C["gaussian_variance_and_covariance_matrix"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the module Skip test to pass this module, or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to verify readiness for Step 2.1 (`00-foundations.T2.01`).

### Skip test
1. `[Recall] [Concept: nyquist_sampling_and_aliasing]` A $3150\text{ Hz}$ motor switching harmonic is sampled at $f_s = 4000\text{ Hz}$ without an anti-aliasing filter. What alias frequency $f_{\text{alias}} \in [0, 2000]\text{ Hz}$ (tolerance $\pm 10^{-9}$) appears in the digital data?
2. `[Apply] [Concept: tustin_frequency_prewarping_and_biquad]` Compute the actual digital notch frequency $f_{\text{unwarped}}$ in $\text{Hz}$ (tolerance $\pm 0.01\text{ Hz}$) when an unwarped Tustin transform is applied to $f_0 = 850\text{ Hz}$ at $f_s = 4000\text{ Hz}$.
3. `[Transfer] [Concept: tustin_frequency_prewarping_and_biquad]` Why can a digital biquad notch filter **never** un-alias a signal that exceeded $f_s/2$ *before* the ADC sampled it?
   - **A.** Because digital filters only work below $100\text{ Hz}$.
   - **B.** Because once sampling folds $f > f_s/2$ into $[0, f_s/2]$, the aliased samples are mathematically indistinguishable from a true low-frequency signal; an **analog** anti-aliasing filter must precede the ADC.
   - **C.** Because TDF-II biquads require double-precision floating point.
   - **D.** Because Tustin pre-warping amplifies high frequencies.
4. `[Spaced review -> 00-foundations.T2.00e — Concept: bode_magnitude_db_and_phase] [Concept: gaussian_variance_and_covariance_matrix]` Given $\Sigma_x = \begin{bmatrix} 1.0 & 0.0 \\ 0.0 & 4.0 \end{bmatrix}$ and $A = \begin{bmatrix} 1.0 & 0.5 \\ 0.0 & 1.0 \end{bmatrix}$, compute the $(0,0)$ entry of $\Sigma_y = A \Sigma_x A^\top$ (tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_alias_hz = abs(3150.0 - 4000.0)
q2_unwarped_hz = (4000.0 / math.pi) * math.atan(math.pi * 850.0 / 4000.0)
q3_choice = "B"
q4_sigma00 = 1.0 * 1.0 * 1.0 + 0.5 * 4.0 * 0.5

assert math.isclose(q1_alias_hz, 850.0, rel_tol=1e-9)
assert math.isclose(q2_unwarped_hz, 749.4867, abs_tol=1e-2)
assert q3_choice == "B"
assert math.isclose(q4_sigma00, 2.0, rel_tol=1e-9)
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.
### Gate test
Covers the complete Track 00 Tier 2 bridge ladder (`00-foundations.T2.00a`, `00-foundations.T2.00g`, and `00-foundations.T2.00b` through `00-foundations.T2.00f`) before Step 2.1 (`00-foundations.T2.01`):
1. `[Concept: finite_difference_derivative_and_integral]` Given $x_{k-1} = 0.20\text{ m}$ and $x_k = 0.26\text{ m}$ sampled at $\Delta t = 0.02\text{ s}$, compute the backward-difference velocity $v_k$ in $\text{m/s}$ (tolerance $\pm 10^{-9}$).
2. `[Concept: matrix_vector_multiplication] [Concept: state_vector_one_step_update]` Multiply $A = \begin{bmatrix} 1 & 0.05 \\ 0 & 1 \end{bmatrix}$ by $x = \begin{bmatrix} 2.0 \\ 4.0 \end{bmatrix}$ and report the first element $(Ax)_0$ (tolerance $\pm 10^{-9}$).
3. `[Concept: cross_product_3d_moment] [Concept: dot_product_projection] [Concept: basis_change_and_invertibility]` For lever arm $r = [0.25, 0.0, 0.0]^\top\text{ m}$ and force $F = [0.0, 40.0, 0.0]^\top\text{ N}$, compute the $z$-component of torque $\tau_z = (r \times F)_z$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: second_order_ode_wn_zeta] [Concept: first_order_ode_time_constant] [Concept: characteristic_polynomial_roots]` Compute the undamped natural frequency $\omega_n$ in $\text{rad/s}$ and damping ratio $\zeta$ (tolerance $\pm 10^{-9}$) for $2\ddot{x} + 8\dot{x} + 200x = 0$.
5. `[Concept: bode_magnitude_db_and_phase] [Concept: complex_numbers_and_euler_formula] [Concept: complex_impedance_and_transfer_function]` Convert a resonance peak gain of $|G(j\omega_n)| = 10.0$ into decibels ($\text{dB}$, tolerance $\pm 10^{-9}$).
6. `[Concept: continuous_state_space_matrices] [Concept: laplace_poles_and_zeros] [Concept: discrete_state_transition_euler_tustin]` For $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$, compute the determinant $\det(A)$ (tolerance $\pm 10^{-9}$).
7. `[Concept: tustin_frequency_prewarping_and_biquad] [Concept: nyquist_sampling_and_aliasing]` Compute the pre-warped analog frequency $\omega_a$ in $\text{rad/s}$ (tolerance $\pm 0.01\text{ rad/s}$) for $f_0 = 850\text{ Hz}$ at $f_s = 4000\text{ Hz}$.
8. `[Concept: gaussian_variance_and_covariance_matrix]` Why must the covariance propagation equation write $A \Sigma_x A^\top + Q$ instead of $A \Sigma_x + Q$?
   - **A.** Because covariance scales quadratically with linear transformations and must remain a symmetric positive semi-definite $n \times n$ matrix.
   - **B.** Because $A^\top$ is the inverse of $A$.
   - **C.** Because $Q$ is always zero.
   - **D.** Because $A \Sigma_x$ is a scalar.

**Gate answer key:**
```python
import math

g1_vel = (0.26 - 0.20) / 0.02
g2_ax0 = 1.0 * 2.0 + 0.05 * 4.0
g3_tau_z = 0.25 * 40.0 - 0.0 * 0.0
g4_wn = math.sqrt(200.0 / 2.0)
g4_zeta = 8.0 / (2.0 * math.sqrt(2.0 * 200.0))
g5_db = 20.0 * math.log10(10.0)
g6_det = 0.0 * (-4.0) - 1.0 * (-100.0)
g7_wa = (2.0 * 4000.0) * math.tan(math.pi * 850.0 / 4000.0)
g8_choice = "A"

assert math.isclose(g1_vel, 3.0, rel_tol=1e-9)
assert math.isclose(g2_ax0, 2.2, rel_tol=1e-9)
assert math.isclose(g3_tau_z, 10.0, rel_tol=1e-9)
assert math.isclose(g4_wn, 10.0, rel_tol=1e-9)
assert math.isclose(g4_zeta, 0.2, rel_tol=1e-9)
assert math.isclose(g5_db, 20.0, rel_tol=1e-9)
assert math.isclose(g6_det, 100.0, rel_tol=1e-9)
assert math.isclose(g7_wa, 6306.6915, abs_tol=1e-2)
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `00-foundations.T2.00a`; Q3 $\to$ `00-foundations.T2.00b`; Q4 $\to$ `00-foundations.T2.00c`; Q5 $\to$ `00-foundations.T2.00d`; Q6 $\to$ `00-foundations.T2.00e`; Q7–Q8 $\to$ `00-foundations.T2.00f`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Notch filter misses $850\text{ Hz}$ resonance and lands at $749.5\text{ Hz}$ | Substituted $s = \frac{2}{T_s}\frac{1-z^{-1}}{1+z^{-1}}$ using unwarped $\omega_0 = 2\pi f_0$. | Pre-warp the analog notch frequency using $\omega_a = \frac{2}{T_s}\tan(\pi f_0 / f_s)$ before computing biquad coefficients. |
| Tried to remove aliased switching noise using a digital low-pass filter | Forgot that frequencies above $f_s/2$ fold into the baseband *at the moment of ADC sampling*. | Place an analog RC or Bessel anti-aliasing filter before the ADC pin so high frequencies are attenuated before sampling. |
| Covariance matrix $\Sigma$ loses symmetry in `float32` | Accumulated floating-point rounding errors across thousands of updates. | Enforce $\Sigma \leftarrow \frac{1}{2}(\Sigma + \Sigma^\top)$ and use the Joseph form in Step 3.6. |

## 9. Resources
- **Julius O. Smith III — [*Introduction to Digital Filters* (`ccrma.stanford.edu/~jos/filters/`)](https://ccrma.stanford.edu/~jos/filters/) & [DSP Guide (`dspguide.com`)](https://www.dspguide.com/) ([`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md)):** Standard biquad and Tustin pre-warping derivations `[VERIFIED 2026-10-15]`.
- **Track 00 ([`00-foundations/README.md#tier-2-intermediate--applied`](../00-foundations/README.md#tier-2-intermediate--applied)):** Directly continues into Step 2.1 (`00-foundations.T2.01`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 2.1 (`00-foundations.T2.01`)** in [`00-foundations/README.md`](../00-foundations/README.md#tier-2-intermediate--applied).
