---
id: 03-sensors.T2.03a
title: "Three-Phase Stator Reference Frames (abc -> alpha-beta -> d-q), Phase-Locked Loops & Sensor Random Walk"
track: "03"
tier: 2
prereqs:
  - 01-electronics.T2.01b
  - 03-sensors.T1.03a
new_concepts:
  - three_phase_balanced_sum_and_clarke_projection
  - park_rotating_frame_dc_demodulation
  - pll_velocity_tracking_and_noise_random_walk
owns:
  - so2_rotation_matrix
uses:
  - electrical_vs_mechanical_pole_pairs
  - open_loop_three_phase_sine_modulation
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 3
  coding: 3
  tools: 1
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
This is the bridge module before Step 2.4 (`03-sensors.T2.04`). In a 3-phase BLDC motor spinning at $3000\text{ RPM}$ ($350\text{ Hz}$ electrical for $p=7$), the three stator currents $(i_a, i_b, i_c)$ are high-frequency AC sine waves that a standard PI controller cannot track without severe phase lag. Projecting the three $120^\circ$-spaced coils onto a 2D stationary frame ($\alpha$-$\beta$, **Clarke transform**) and then rotating that frame at the rotor's exact electrical angle $\theta_e$ ($d$-$q$, **Park transform**) turns those fast AC sine waves into two steady **DC numbers** $(i_d, i_q)$! Combine that with a **Phase-Locked Loop (PLL)** to estimate smooth velocity from quantized encoder angles and **random-walk noise scaling** ($\sigma \propto \sqrt{t}$) for IMUs, and you have the complete foundation for Step 2.4. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine three people standing $120^\circ$ apart around a merry-go-round (`a` at $0^\circ$, `b` at $+120^\circ$, `c` at $-120^\circ$), passing a magnetic arrow around the circle so the arrow spins smoothly at speed $\omega_e$. Because the three coil wires meet at a floating star neutral point with nowhere else for current to go, Kirchoff's Current Law guarantees $i_a + i_b + i_c = 0$ at every instant. First, the **Clarke transform** projects the 2D tip of that spinning magnetic arrow in standard $(x, y)$ coordinates called $(\alpha, \beta)$ on the stationary floor. Second, if you jump onto the merry-go-round and spin *with* the rotor at angle $\theta_e$, the spinning magnetic arrow looks completely **stationary (DC)** to you! That rotating coordinate frame is the **Park $(d, q)$ frame**: the **$d$-axis (direct)** points straight along the rotor's North magnet pole (producing zero torque, only radial magnetic flux), and the **$q$-axis (quadrature)** points $90^\circ$ ahead of the magnet (producing $100\%$ of motor torque $\tau \propto i_q$).

## 3. Formalization
1. **Balanced Three-Phase Neutral Constraint & Amplitude-Invariant Clarke Transform ($abc \to \alpha\beta$):** With $i_a + i_b + i_c = 0$, the stationary orthogonal components $(i_\alpha, i_\beta)$ (in $\text{A}$) are:

$$
i_\alpha = i_a, \quad i_\beta = \frac{1}{\sqrt{3}}\left(i_a + 2 i_b\right) = \frac{i_b - i_c}{\sqrt{3}}
$$

   For balanced currents $i_a = I_{\text{pk}}\cos\theta_e$, $i_b = I_{\text{pk}}\cos(\theta_e - \frac{2\pi}{3})$, $i_c = I_{\text{pk}}\cos(\theta_e + \frac{2\pi}{3})$, this yields $i_\alpha = I_{\text{pk}}\cos\theta_e$ and $i_\beta = I_{\text{pk}}\sin\theta_e$, preserving peak amplitude $\sqrt{i_\alpha^2 + i_\beta^2} = I_{\text{pk}}$.
2. **Park Transform ($\alpha\beta \to dq$):** Rotating $(\alpha, \beta)$ by $-\theta_e$ into the rotor-locked $(d, q)$ frame gives:

$$
\begin{bmatrix} i_d \\ i_q \end{bmatrix} = \begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix} \begin{bmatrix} i_\alpha \\ i_\beta \end{bmatrix}
$$

   When current is driven $90^\circ$ ahead of the rotor flux ($i_\alpha = -I_{\text{pk}}\sin\theta_e,\ i_\beta = I_{\text{pk}}\cos\theta_e$), substituting into the Park matrix yields constant DC values $i_d = 0\text{ A}$ and $i_q = I_{\text{pk}}$ across all $\theta_e \in [0, 2\pi)$!

   That matrix *is* the 2D rotation group: $R(\theta_e) = \begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix}$ is the $SO(2)$ member at this angle, so $\det R = 1$, $R(-\theta_e) = R(\theta_e)^\top = R(\theta_e)^{-1}$, and $R(\theta_a)R(\theta_b) = R(\theta_a + \theta_b)$. Those three facts are what make the inverse Park transform a transpose, why the forward Park rotation uses $-\theta_e$ rather than $+\theta_e$, and why two successive frame rotations compose by adding their angles.
3. **Tracking Loop (PLL) & White Noise vs. Random Walk:**
   - A Type-II tracking PLL drives angle residual $e_\theta = \operatorname{wrap}(\theta_{\text{meas}} - \hat{\theta})$ to zero via $\dot{\hat{\omega}} = K_i e_\theta$ and $\dot{\hat{\theta}} = \hat{\omega} + K_p e_\theta$, extracting lag-free velocity $\hat{\omega}$ without finite-difference noise spikes.
   - Integrating zero-mean white gyro noise of spectral density $\sigma_g$ ($\text{rad/s}/\sqrt{\text{Hz}}$) over averaging window $\tau$ ($\text{s}$) reduces rate standard deviation as $\sigma_{\bar{\omega}}(\tau) = \frac{\sigma_g}{\sqrt{\tau}}$ (slope $-1/2$ on a log-log Allan deviation plot).

## 4. Worked example
**Predict first (before you run it):** Commit to three numbers before the code runs. (1) With $I_{\text{pk}} = 10.0\text{ A}$ and $\theta_e = 0.85\text{ rad}$, what are $(i_\alpha, i_\beta)$ for the pure $q$-axis current set? (2) What must $\sqrt{i_\alpha^2 + i_\beta^2}$ come out to, whatever the angle? (3) If the averaging window grows from $1.0\text{ s}$ to $100\text{ s}$, by what factor does the averaged rate noise fall? Two tells that your result is wrong rather than the module: a vector magnitude that drifts away from $10.00\text{ A}$ means the $2$ in $i_\beta = (i_a + 2 i_b)/\sqrt{3}$ is misplaced, and a $i_d$ of $0.00\text{ A}$ is the correct answer while a $i_d$ of $10.00\text{ A}$ means you swapped the $d$ and $q$ rows of the Park matrix.

Verify that balanced 3-phase currents of peak amplitude $I_{\text{pk}} = 10.0\text{ A}$ phased $90^\circ$ ahead of rotor angle $\theta_e = 0.85\text{ rad}$ map via Clarke + Park to $i_d = 0.0\text{ A}, i_q = 10.0\text{ A}$, and verify the $\tau^{-1/2}$ white-noise averaging law.

```python
import math

def clarke_park(ia: float, ib: float, theta_e: float) -> tuple[float, float, float, float]:
    i_alpha = ia
    i_beta = (ia + 2.0 * ib) / math.sqrt(3.0)
    c, s = math.cos(theta_e), math.sin(theta_e)
    id_val = c * i_alpha + s * i_beta
    iq_val = -s * i_alpha + c * i_beta
    return i_alpha, i_beta, id_val, iq_val

I_pk = 10.0
theta_e = 0.85
# Pure q-axis current (phased +90 deg ahead of rotor flux):
ia = -I_pk * math.sin(theta_e)
ib = -I_pk * math.sin(theta_e - 2.0 * math.pi / 3.0)
ic = -I_pk * math.sin(theta_e + 2.0 * math.pi / 3.0)
assert math.isclose(ia + ib + ic, 0.0, abs_tol=1e-9)

i_alpha, i_beta, id_val, iq_val = clarke_park(ia, ib, theta_e)
assert math.isclose(math.hypot(i_alpha, i_beta), I_pk, rel_tol=1e-9)
assert math.isclose(id_val, 0.0, abs_tol=1e-9)
assert math.isclose(iq_val, 10.0, rel_tol=1e-9)

# White-noise Allan deviation scaling: increasing averaging window tau by 100x reduces sigma by 10x
sigma_tau1 = 0.02 / math.sqrt(1.0)
sigma_tau100 = 0.02 / math.sqrt(100.0)
assert math.isclose(sigma_tau1 / sigma_tau100, 10.0, rel_tol=1e-9)
print(f"i_alpha={i_alpha:.2f} A, i_beta={i_beta:.2f} A -> i_d={id_val:.2f} A, i_q={iq_val:.2f} A")
```
Expected output:
```text
i_alpha=-7.51 A, i_beta=6.60 A -> i_d=-0.00 A, i_q=10.00 A
```

## 5. Exercise
Suppose you only measure two phase currents $i_a = +6.0\text{ A}$ and $i_b = -2.0\text{ A}$ using two low-side shunt amplifiers in an isolated neutral star-wound motor. Compute (a) the third phase current $i_c = -(i_a + i_b)$, (b) the Clarke stationary components $(i_\alpha, i_\beta)$, and (c) the vector magnitude $\sqrt{i_\alpha^2 + i_\beta^2}$. Verify $i_c = -4.0\text{ A}$, $i_\alpha = 6.0\text{ A}$, $i_\beta = \frac{2.0}{\sqrt{3}} \approx 1.154701\text{ A}$, and magnitude $\approx 6.110101\text{ A}$ ($\pm 10^{-5}\text{ A}$).
- **If your result differs:** Substitute $i_a = 6.0$ and $i_b = -2.0$ into $i_\beta = (i_a + 2i_b)/\sqrt{3} = (6.0 - 4.0)/\sqrt{3} = 2.0/\sqrt{3}\text{ A}$.

### Graded package - the elbow, demodulated and tracked
[`exercises/03-sensors.T2.03a/`](../exercises/03-sensors.T2.03a/) turns this section into a test. `starter.py` holds seven holes: `wrap_pi`, `third_phase`, `clarke`, `park`, `inverse_park`, `pll_step` (the residual wrapped **before** the gains) and `allan_deviation`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/03-sensors.T2.03a/starter.py \
  python3 -m unittest discover -s exercises/03-sensors.T2.03a -p 'test_*.py'
```

The tests are behavioural: a balanced set at **four** angles must project to the same amplitude (a Clarke with the 2 misplaced agrees at $\theta = 0$ and nowhere else); the quarter turn must give $i_q = -5$ (a Park at $+\theta$ gives $+5$); quadrature current must demodulate to constant DC at five angles; the inverse must undo the rotation; the two-shunt exercise must give $i_c = -4$ A and $6.110101$ A; a PLL must lock onto $350\text{ Hz}$ electrical, hold its speed with zero residual, and **not** spike when the estimate sits just below $-\pi$ and the measurement just above it; and the averaging law must be $\tau^{-1/2}$ (the $1/\tau$ version fails on the first pair). Four planted faults - `clarke_wrong_scale`, `park_plus_theta`, `pll_raw_residual`, `allan_linear` - each fail the test named for them. The transfer suite tracks the **shared arm's elbow**: its velocity estimate must beat a one-tick finite difference on the same quantized samples, a three-phase set built from the joint's own angle must demodulate to constant $i_q$ tick after tick, and the plant's seeded white noise must average down as predicted within 12%.

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the full solution below ---
import math


def wrap_pi(angle):
    """Wrap an angle into (-pi, pi]."""
    # TODO 1: fmod into one turn, then shift by pi
    ...


def third_phase(i_a, i_b):
    """The third current, from the neutral point."""
    # TODO 2: Kirchhoff, not 120 degrees of phase
    ...


def clarke(i_a, i_b):
    """Amplitude-invariant Clarke: (i_alpha, i_beta) from two phase currents."""
    # TODO 3: i_alpha = i_a, i_beta = (i_a + 2 i_b)/sqrt(3)
    ...


def park(i_alpha, i_beta, theta_e):
    """(i_d, i_q) in the rotor frame."""
    # TODO 4: rotate by -theta_e: [c, s; -s, c]
    ...


def inverse_park(i_d, i_q, theta_e):
    """(i_alpha, i_beta) back in the stationary frame."""
    # TODO 5: the transpose of the Park rotation
    ...


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    """One Type-II PLL step; returns (theta_hat, omega_hat)."""
    # TODO 6: wrap the residual BEFORE the gains; ki integrates it, kp corrects the angle
    ...


def allan_deviation(sigma_density, tau):
    """Rate standard deviation after averaging white noise for `tau` seconds."""
    # TODO 7: the law is sigma / sqrt(tau), not sigma / tau
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** for $i_a = 6.0\text{ A}$ and $i_b = -2.0\text{ A}$, $i_c = -4.0\text{ A}$, $(i_\alpha, i_\beta) = (6.0, 1.154701)\text{ A}$, and $\sqrt{i_\alpha^2 + i_\beta^2} = 6.110101\text{ A}$.

### Hint ladder
1. **KCL gives the third shunt for free.** The star point floats, so $i_c = -(i_a + i_b) = -4.0\text{ A}$ - no $120^\circ$ phase factor, and no need for a third amplifier.
2. **Clarke keeps the peak amplitude.** $i_\alpha = i_a$ and $i_\beta = (i_a + 2i_b)/\sqrt{3} = (6.0 - 4.0)/\sqrt{3} = 1.154701\text{ A}$: the $2$ multiplies $i_b$ only, which is why the magnitude $6.110101\text{ A}$ is slightly above $6.0$ rather than exactly $I_{\text{pk}}$ - these two measurements are not a balanced set at one instant.
3. **Park rotates the other way.** The frame turns *with* the rotor, so the matrix is $[\cos\theta_e, \sin\theta_e;\ -\sin\theta_e, \cos\theta_e]$ and its transpose (inverse, determinant $1$) takes $(d, q)$ back out. Driving pure $q$ current then gives $i_d = 0$ and $i_q = I_{\text{pk}}$ at every angle.
4. **Wrap before the gains.** $\theta_{\text{meas}} - \hat{\theta}$ is a difference of two points on a circle: unwrapped, it reads $2\pi$ once per turn and the velocity estimate spikes at exactly the rollover. Then the integral law: averaging white noise for $\tau$ scales the rate deviation as $\tau^{-1/2}$, so $\tau = 100\text{ s}$ cuts it by $10$, not $100$.

5. **What the suite refuses.** `allan_deviation` refuses a window of zero samples: there is no deviation to average over, so a zero window raises `ValueError` rather than reporting `0.0`.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def wrap_pi(angle):
    """Wrap an angle into (-pi, pi]."""
    wrapped = math.fmod(angle + math.pi, 2.0 * math.pi)
    if wrapped <= 0.0:
        wrapped += 2.0 * math.pi
    return wrapped - math.pi


def third_phase(i_a, i_b):
    """The neutral star point forces `i_c = -(i_a + i_b)`."""
    return -(i_a + i_b)


def clarke(i_a, i_b):
    """Amplitude-invariant Clarke: (i_alpha, i_beta) from two phase currents."""
    return i_a, (i_a + 2.0 * i_b) / math.sqrt(3.0)


def park(i_alpha, i_beta, theta_e):
    """Rotate the stationary frame onto the rotor: the inverse of the rotor's own rotation."""
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_alpha + s * i_beta, -s * i_alpha + c * i_beta


def inverse_park(i_d, i_q, theta_e):
    """(i_alpha, i_beta) from the rotor frame - Park's transpose, since it is a rotation."""
    c = math.cos(theta_e)
    s = math.sin(theta_e)
    return c * i_d - s * i_q, s * i_d + c * i_q


def pll_step(theta_hat, omega_hat, theta_meas, kp, ki, dt):
    """One Type-II tracking-loop step; returns (theta_hat, omega_hat) after `dt`.

    The residual is wrapped: the measurement and the estimate live on a circle, and their plain
    difference jumps by 2*pi at the rollover.
    """
    error = wrap_pi(theta_meas - theta_hat)
    omega_hat = omega_hat + ki * error * dt
    theta_hat = wrap_pi(theta_hat + (omega_hat + kp * error) * dt)
    return theta_hat, omega_hat


def allan_deviation(sigma_density, tau):
    """Rate standard deviation after averaging white noise of density `sigma_density` for `tau`."""
    if tau <= 0.0:
        raise ValueError("averaging window must be positive")
    return sigma_density / math.sqrt(tau)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

i_a, i_b = 6.0, -2.0
i_c = third_phase(i_a, i_b)
i_alpha, i_beta = clarke(i_a, i_b)
magnitude = math.hypot(i_alpha, i_beta)

I_pk, theta_e = 10.0, 0.85
pure_q = (-I_pk * math.sin(theta_e), -I_pk * math.sin(theta_e - 2.0 * math.pi / 3.0))
alpha_beta = clarke(*pure_q)
i_d, i_q = park(alpha_beta[0], alpha_beta[1], theta_e)
i_d_clean = 0.0 if abs(i_d) < 1e-9 else i_d    # the residual is rounding, not torque
back = inverse_park(i_d, i_q, theta_e)
# The seam: an estimate just below -pi and a measurement just above +pi differ by ~2e-9, not 2pi.
seam = wrap_pi((math.pi - 1e-9) - (-math.pi + 1e-9))
theta_locked, omega_locked = pll_step(2.0 * math.pi - 1e-3, 350.0 * 2.0 * math.pi, 1e-3, 40.0, 400.0, 1e-4)

assert math.isclose(i_c, -4.0, rel_tol=1e-12)
assert math.isclose(i_alpha, 6.0, rel_tol=1e-12)
assert math.isclose(i_beta, 1.154701, abs_tol=1e-6)
assert math.isclose(magnitude, 6.110101, abs_tol=1e-5)
assert math.isclose(i_d, 0.0, abs_tol=1e-9) and math.isclose(i_q, I_pk, rel_tol=1e-9)
assert math.isclose(back[0], alpha_beta[0], rel_tol=1e-9) and math.isclose(back[1], alpha_beta[1], rel_tol=1e-9)
assert math.isclose(seam, -2e-9, abs_tol=1e-12)
assert math.isclose(allan_deviation(0.02, 100.0), 0.002, rel_tol=1e-12)
assert -math.pi < theta_locked <= math.pi

print("i_c=%.1f A | (i_alpha, i_beta)=(%.6f, %.6f) A | |i|=%.6f A" % (i_c, i_alpha, i_beta, magnitude))
print("pure-q -> i_d=%.2f A, i_q=%.2f A | inverse-park exact | seam error=%.1e rad | sigma(tau=100 s)=%.3f rad/s"
      % (i_d_clean, i_q, seam, allan_deviation(0.02, 100.0)))
```

Printed: `i_c=-4.0 A | (i_alpha, i_beta)=(6.000000, 1.154701) A | |i|=6.110101 A`, then `pure-q -> i_d=0.00 A, i_q=10.00 A | inverse-park exact | seam error=-2.0e-09 rad | sigma(tau=100 s)=0.002 rad/s`.

**On the shared arm.** The Transfer suite in `exercises/03-sensors.T2.03a/` demodulates a balanced three-phase set built from the plant's own elbow angle, tick after tick:

```python
import math
import mechalab_plant as plant

theta = 0.40                      # an elbow angle the plant resolves in ~261 counts
i_alpha, i_beta = 10.0 * math.cos(theta), 10.0 * math.sin(theta)
i_d = i_alpha * math.cos(theta) + i_beta * math.sin(theta)
i_q = -i_alpha * math.sin(theta) + i_beta * math.cos(theta)

assert math.isclose(i_d, 10.0, rel_tol=1e-12)
assert math.isclose(i_q, 0.0, abs_tol=1e-12)
assert math.isclose(math.hypot(i_alpha, i_beta), 10.0, rel_tol=1e-12)
print("plant: elbow angle %.2f rad = %.1f counts | Park -> (i_d, i_q)=(%.1f, %.1f) A"
      % (theta, theta / (2.0 * math.pi / plant.ENCODER_CPR), i_d, i_q))
```

### Break it on purpose
Keep the worked example's $350\text{ Hz}$ electrical angle ($p = 7$ at $3000\text{ RPM}$) and break the PLL the way the `## 8. Common mistakes` table warns, using the `pll_raw_residual` fault the package plants:
- **Inject:** feed the residual to the PLL gains as raw $\theta_{\text{meas}} - \hat{\theta}$, with no wrap into $[-\pi, \pi)$.
- **Symptom:** the loop locks and the angle trace looks clean, then each time the wrapped angle crosses the seam — $350$ times a second at this electrical speed — the estimate jumps by a full $2\pi$ and the velocity output spikes for a tick, while the quantized encoder input itself never moves discontinuously.
- **Diagnose:** the spike period is the tell. A gain error or a noisy measurement gives a spike every sample, and a wrong Clarke scale changes $i_\alpha$ and $i_\beta$ without moving the PLL at all; a disturbance that arrives exactly at the $2\pi \to 0$ rollover, once per revolution, can only come from the unwrapped subtraction.
- **Fix:** wrap with `math.atan2(math.sin(err), math.cos(err))` before the gains, then prove it the way the suite does: lock onto $350\text{ Hz}$ electrical, hold the speed estimate with zero residual, and confirm no spike as the estimate sits just below $-\pi$ and the measurement just above it.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00a`](00-foundations.T2.00a.md) (*2D Rotation Matrix Multiplication*), [`00-foundations.T2.00c`](00-foundations.T2.00c.md) (*Critically Damped 2nd-Order Poles*), and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Gaussian Variance & Noise Density*).
  - **Prerequisite Bridge Module:** [`03-sensors.T1.03a`](03-sensors.T1.03a.md) and Legacy **Step 1.4 (`03-sensors.T1.04`)**.
  - **Core Concepts to Review First:** Amplitude-invariant Clarke ($i_\alpha, i_\beta$) and Park ($i_d, i_q$) transforms, Type-II PLL velocity observer gains ($K_p = 2\zeta\omega_n, K_i = \omega_n^2$), and MEMS IMU Allan deviation $\sigma_A(\tau)$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI Sensored FOC of 3-Phase PMSM Motors (BPRA073)](https://www.ti.com/lit/pdf/bpra073), [VectorNav Allan Variance Guide](https://www.vectornav.com/resources/inertial-navigation-primer/specifications--and--error-budgets/specs-imuspecs), and [Track 03 Tier 2 (`03-sensors-and-actuators/README.md`)](../03-sensors-and-actuators/README.md#tier-2-intermediate--applied).

## 6. Simulation path
Open **Tab 3 (25 kHz PMSM FOC: Clarke & Park Transforms)** in the MechaLab Workbench (`npm run dev`) to watch the 3-phase AC waveforms $(i_a, i_b, i_c)$ collapse into flat DC lines $(i_d, i_q)$ in real time.

The graded package is also a workbench entry: **Modules -> `EX.03-sensors.T2.03a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 2.4 (`03-sensors.T2.04`), `clarke_park(ia, ib, theta_e)` runs inside the microcontroller's $20\text{ kHz}$ ADC interrupt immediately after reading the `INA240` shunts and SPI magnetic encoder:
```text
[ADC ia, ib] ---> [Clarke (ia, ib) -> (i_alpha, i_beta)] ---> [Park (theta_e) -> (id, iq)] ---> [PI Loops]
```
Pass/fail verification in simulation: `ia + ib + ic == 0.0`, `id_val == 0.0 A`, and `iq_val == 10.0 A`.


```mermaid
flowchart LR
    A["03-sensors.T2.03a: three_phase_balanced_sum_and_clarke_projection"] --> B["park_rotating_frame_dc_demodulation"]
    B --> C["pll_velocity_tracking_and_noise_random_walk"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($5/6$) on the Skip test or score $\ge 80\%$ ($8/9$) on the Ladder Gate test below to unlock Step 2.4 (`03-sensors.T2.04`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: three_phase_balanced_sum_and_clarke_projection]` In a balanced 3-phase star-connected motor with floating neutral ($i_a + i_b + i_c = 0$), if $i_a = 8.0\text{ A}$ and $i_b = -3.0\text{ A}$, compute $i_c$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: three_phase_balanced_sum_and_clarke_projection]` Using the amplitude-invariant Clarke formula $i_\alpha = i_a,\ i_\beta = \frac{i_a + 2i_b}{\sqrt{3}}$, compute $i_\beta$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) when $i_a = 0.0\text{ A}$ and $i_b = \sqrt{3}\text{ A}$.
3. `[Transfer] [Concept: park_rotating_frame_dc_demodulation]` Using the Park rotation $i_d = i_\alpha\cos\theta_e + i_\beta\sin\theta_e$ and $i_q = -i_\alpha\sin\theta_e + i_\beta\cos\theta_e$, compute $i_q$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) when $(i_\alpha, i_\beta) = (-6\sqrt{3}, 6.0)\text{ A}$ at electrical angle $\theta_e = 60^\circ$ ($\pi/3\text{ rad}$).
4. `[Concept: park_rotating_frame_dc_demodulation]` In surface-mounted PMSM Field-Oriented Control (FOC) below base speed, why do we command $i_d^{*} = 0\text{ A}$ and put all current into $i_q^{*}$?
   - **A.** Because $d$-axis current aligns with the rotor magnets and produces zero torque (only $I^2 R$ heat), whereas $q$-axis current is perpendicular ($90^\circ$) to the rotor flux and maximizes torque per ampere ($\tau = \frac{3}{2} p \psi_m i_q$).
   - **B.** Because $i_d$ cannot be measured.
   - **C.** Because $i_q$ does not flow through the stator windings.
   - **D.** Because $i_d$ reverses the encoder direction.
5. `[Concept: pll_velocity_tracking_and_noise_random_walk]` Integrating a gyroscope with white noise density $\sigma_g = 0.02\text{ rad/s}/\sqrt{\text{s}}$ over $t = 25.0\text{ s}$ produces random-walk angle uncertainty $\sigma_\theta(t) = \sigma_g \sqrt{t}$. Compute $\sigma_\theta(25.0\text{ s})$ in radians ($\text{rad}$, tolerance $\pm 10^{-9}$).
6. `[Spaced review -> 03-sensors.T1.03a — Concept: mechanical_vs_electrical_angle_pole_pairs]` A motor has $4$ pole pairs. Compute the electrical angle in degrees for a mechanical angle of $90.0^\circ$ (tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_ic = -(8.0 + (-3.0))
q2_ibeta = (0.0 + 2.0 * math.sqrt(3.0)) / math.sqrt(3.0)
theta_e = math.pi / 3.0
q3_iq = -(-6.0 * math.sqrt(3.0)) * math.sin(theta_e) + 6.0 * math.cos(theta_e)
q4_choice = "A"
q5_sigma_theta = 0.02 * math.sqrt(25.0)
assert math.isclose(q1_ic, -5.0, rel_tol=1e-9)
assert math.isclose(q2_ibeta, 2.0, rel_tol=1e-6)
assert math.isclose(q3_iq, 12.0, rel_tol=1e-6)
assert q4_choice == "A"
assert math.isclose(q5_sigma_theta, 0.10, rel_tol=1e-9)
q6_review = 4.0 * 90.0
assert math.isclose(q6_review, 360.0, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $5/6$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 1; if you missed Q3 or Q4, study `## 3. Formalization` item 2; if you missed Q5, study `## 3. Formalization` item 3. If you missed  Q6, review `03-sensors.T1.03a`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 03 Tier 2 bridge ladder (`03-sensors.T2.03a`) before Step 2.4 (`03-sensors.T2.04`):
1. `[Concept: three_phase_balanced_sum_and_clarke_projection]` Why do many 3-phase motor drivers only require **two** current-sense shunts (on phases A and B) instead of three?
   - **A.** Because KCL at the isolated motor neutral point guarantees $i_c = -(i_a + i_b)$ at every instant.
   - **B.** Because phase C never carries current.
   - **C.** Because phase C is connected to ground.
   - **D.** Because Clarke transform ignores phase B.
2. `[Concept: three_phase_balanced_sum_and_clarke_projection]` For balanced currents $i_a = 5.0\text{ A}, i_b = -2.5\text{ A}, i_c = -2.5\text{ A}$ (at $\theta_e = 0$), compute $i_\alpha$ and $i_\beta$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
3. `[Concept: park_rotating_frame_dc_demodulation]` For $(i_\alpha, i_\beta) = (5.0, 0.0)\text{ A}$ at $\theta_e = \pi/2\text{ rad}$, compute $i_d = i_\alpha\cos\theta_e + i_\beta\sin\theta_e$ and $i_q = -i_\alpha\sin\theta_e + i_\beta\cos\theta_e$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
4. `[Concept: park_rotating_frame_dc_demodulation]` What is the determinant of the $2\times 2$ Park rotation matrix $\begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix}$ for any angle $\theta_e$ (tolerance $\pm 10^{-9}$)?
5. `[Concept: park_rotating_frame_dc_demodulation]` Why is it much easier for a PI controller to regulate $(i_d, i_q)$ than to regulate $(i_a, i_b, i_c)$ directly at high RPM?
   - **A.** Because in the synchronous $(d, q)$ frame, steady-state currents are **DC quantities** ($\omega = 0$), where a PI integrator achieves zero steady-state tracking error regardless of rotor speed $\omega_e$.
   - **B.** Because $(i_d, i_q)$ are integers.
   - **C.** Because Park transform removes winding resistance $R_s$.
   - **D.** Because $(i_a, i_b, i_c)$ are DC signals.
6. `[Concept: pll_velocity_tracking_and_noise_random_walk]` Why must the phase residual in an angle-tracking PLL wrap $\theta_{\text{meas}} - \hat{\theta}$ into $[-\pi, \pi)$ via `atan2(sin(err), cos(err))` before multiplying by $K_p$ and $K_i$?
   - **A.** To prevent a spurious $\pm 2\pi$ step spike every time the encoder crosses the $2\pi \to 0$ rollover boundary.
   - **B.** To convert radians to degrees.
   - **C.** To make the PLL unstable.
   - **D.** Because encoders only read $[0, 1]$.
7. `[Concept: pll_velocity_tracking_and_noise_random_walk]` If a gyroscope has Angle Random Walk white noise density $\sigma_g = 0.01\text{ rad/s}/\sqrt{\text{Hz}}$, compute the averaged rate standard deviation $\sigma_{\bar{\omega}}(\tau) = \sigma_g / \sqrt{\tau}$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$) over an averaging time $\tau = 4.0\text{ s}$.
8. `[Concept: pll_velocity_tracking_and_noise_random_walk]` On a log-log Allan deviation plot $\log_{10}\sigma_A(\tau)$ vs. $\log_{10}\tau$, what slope corresponds to white rate noise ($\sigma_A(\tau) \propto \tau^{-1/2}$)? (Report the numeric slope, tolerance $\pm 10^{-9}$.)

9. `[Concept: so2_rotation_matrix]` The Park matrix is a member of $SO(2)$, so two rotations compose by adding angles: $R(0.7)\,R(1.1) = R(\theta_a + \theta_b)$. Compute the angle of the product in radians (tolerance $\pm 10^{-12}$).

**Gate answer key:**
```python
import math

g1_choice = "A"
g2_ialpha = 5.0
g2_ibeta = (5.0 + 2.0 * (-2.5)) / math.sqrt(3.0)
g3_id = 5.0 * math.cos(math.pi / 2.0)
g3_iq = -5.0 * math.sin(math.pi / 2.0)
g4_det = 1.0
g5_choice = "A"
g6_choice = "A"
g7_sigma = 0.01 / math.sqrt(4.0)
g8_slope = -0.5
g9_angle = 0.7 + 1.1

assert g1_choice == "A"
assert math.isclose(g2_ialpha, 5.0, rel_tol=1e-9) and math.isclose(g2_ibeta, 0.0, abs_tol=1e-9)
assert math.isclose(g3_id, 0.0, abs_tol=1e-9) and math.isclose(g3_iq, -5.0, rel_tol=1e-9)
assert math.isclose(g4_det, 1.0, rel_tol=1e-9)
assert g5_choice == "A"
assert g6_choice == "A"
assert math.isclose(g7_sigma, 0.005, rel_tol=1e-9)
assert math.isclose(g8_slope, -0.5, rel_tol=1e-9)
assert math.isclose(g9_angle, 1.8, rel_tol=1e-12)
```
- **Pass mark:** $8/9$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5, Q9 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Motor locks up at a fixed angle or draws huge current with zero torque when FOC starts | Used mechanical angle $\theta_m$ instead of electrical angle $\theta_e = p(\theta_m - \theta_{\text{offset}})$ in the Park transform, or forgot to calibrate the zero electric offset $\theta_{\text{offset}}$. | Run a 1-second open-loop $d$-axis alignment ($v_d = 1.5\text{ V}, v_q = 0$) at boot to latch $\theta_{\text{offset}}$ where the rotor aligns with Phase A ($\theta_e = 0$). |
| PLL velocity estimate kicks violently once per revolution | Subtracted raw angles $\theta_{\text{meas}} - \hat{\theta}$ without wrapping across the $\pm\pi$ seam. | Always wrap angle error using `math.atan2(math.sin(err), math.cos(err))` before feeding the PLL integrator. |
| Inverse Park transform rotates in the wrong direction | Used the forward Park matrix ($-\theta_e$) instead of its transpose ($+\theta_e$) when transforming $(v_d, v_q) \to (v_\alpha, v_\beta)$. | Use $\begin{bmatrix} \cos\theta_e & -\sin\theta_e \\ \sin\theta_e & \cos\theta_e \end{bmatrix}$ for the inverse Park transform. |

## 9. Resources
- **Texas Instruments — *Field Oriented Control of Permanent Magnet Motors* (`SPRABZ0`, `resources/textbooks-and-papers.md`):** Complete derivation of Clarke, Park, and inverse Park transforms `[VERIFIED 2026-10-15]`.
- **Track 03 (`03-sensors-and-actuators/README.md`):** Directly continues into Step 2.4 (`03-sensors.T2.04`) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 2.4 (`03-sensors.T2.04`)** in [`03-sensors-and-actuators/README.md`](../03-sensors-and-actuators/README.md#tier-2-intermediate--applied).
