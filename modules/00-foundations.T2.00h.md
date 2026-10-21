---
id: 00-foundations.T2.00h
title: "Winding Impedance, Transfer Functions, Decibels & the Resonance Peak"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00d
new_concepts:
  - complex_impedance_and_transfer_function
  - bode_magnitude_db_and_phase
uses:
  - complex_numbers_and_euler_formula
  - first_order_ode_time_constant
  - second_order_ode_wn_zeta
  - radians_unit_circle_and_atan2
est_hours: 3.0
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
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 3 of 10 · Make a joint move: foundations**
>
> **Run this in the workbench.** [Open MechaLab with `EX.00-foundations.T2.00h` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.00-foundations.T2.00h) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
A motor winding is a resistor and an inductor in series, and at $1\,\text{krad/s}$ the inductor's opposition is not a number you can add to the resistor's - it is $90^\circ$ out of phase with it. Write both as one complex number and the arithmetic becomes trivial: magnitudes form a hypotenuse, angles add, and a current loop's PI gains have something to be tuned against. The same ratio, read across frequency, is the **Bode plot** that tells you where a joint resonates, how much it lags, and whether a filter will make it worse. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Tap a bell and it rings at its own frequency; tap it faster than it can respond and it barely moves. A transfer function is the ratio of how hard you tapped to how far it moved, at each frequency - and it is a complex number because the bell does not move in step with your hand. Plotted as magnitude in decibels on a log frequency axis, a joint's response is flat, then peaks sharply at its resonance, then rolls off; plotted as phase, it slides from $0^\circ$ through $-90^\circ$ to nearly $-180^\circ$. The two curves are the same complex number read two ways, which is why one measurement gives both.

## 3. Formalization
1. **Substituting $j\omega$ for the derivative:** a steady sinusoid $u(t) = e^{j\omega t}$ has $\frac{d}{dt}e^{j\omega t} = j\omega e^{j\omega t}$, so every derivative becomes multiplication by $j\omega$ and a differential equation becomes algebra. For the first-order filter $\tau\dot{y} + y = u$:

$$
H(j\omega) = \frac{1}{1 + j\omega\tau}
$$

   A series $R$-$L$ winding has impedance $Z(j\omega) = R + j\omega L$ (ohms), and the current is $I = V/Z$. With $R = 3.0\ \Omega$, $L = 4.0\,\text{mH}$ and $\omega = 1000\,\text{rad/s}$, $|Z| = \sqrt{3^2 + 4^2} = 5.0\ \Omega$ at $\operatorname{atan2}(4, 3) = 53.13^\circ$ - the hypotenuse, not $3 + 4 = 7$.
2. **Second-order response:** the canonical oscillator $\ddot{y} + 2\zeta\omega_n\dot{y} + \omega_n^2 y = \omega_n^2 u$ gives

$$
G(j\omega) = \frac{\omega_n^2}{(j\omega)^2 + 2\zeta\omega_n(j\omega) + \omega_n^2}
$$

   At $\omega = \omega_n$ the two $\omega_n^2$ terms cancel and $G = 1/(j2\zeta)$, so $|G| = 1/(2\zeta)$ and the phase is exactly $-90^\circ$: with $\zeta = 0.05$, $|G| = 10$ ($+20\,\text{dB}$).
3. **Decibels and the resonance peak:** amplitude ratios convert with

$$
\lvert H\rvert_{\text{dB}} = 20\log_{10}\lvert H\rvert
$$

   so $|H| = 1/\sqrt{2}$ is $-3.0103\,\text{dB}$. The peak of $|G|$ is at

$$
\omega_r = \omega_n\sqrt{1 - 2\zeta^2}, \qquad |G(j\omega_r)| = \frac{1}{2\zeta\sqrt{1-\zeta^2}}
$$

   which exists only for $\zeta < 1/\sqrt{2}$ and is *below* $\omega_n$ - at $\zeta = 0.05$, $99.7497\,\text{rad/s}$ and $10.0125$ (a little above the $10$ read at $\omega_n$).

## 4. Worked example
**Predict first (before you run it):** commit to three numbers. (1) The winding at $1\,\text{krad/s}$ is $3 + j4$; is its magnitude $7\ \Omega$ or $5\ \Omega$? (2) Is the current ahead of or behind the voltage, and by roughly how many degrees? (3) A first-order corner that reads $-3.0103\,\text{dB}$ in amplitude decibels - what does the same corner read if you accidentally use $10\log_{10}$? Two tells that a wrong result is a mistake: the magnitude must be **smaller** than the sum of resistance and reactance (a hypotenuse), and the corner's phase must be exactly $-45^\circ$, so a reading near $-90^\circ$ means the corner was evaluated a decade too high.

```python
import cmath
import math

R, L, omega = 3.0, 0.004, 1000.0
Z = complex(R, omega * L)
tau = 0.01

corner = 1.0 / (1.0 + 1j * 1.0)          # omega = 1/tau
resonance = (100.0 ** 2) / (-(100.0 ** 2) + 2j * 0.05 * 100.0 * 100.0 + 100.0 ** 2)

print("Z=%.2f%+.2fj ohm | |Z|=%.2f at %.2f deg | corner=%.4f dB, %.2f deg | peak=%.1fx"
      % (Z.real, Z.imag, abs(Z), math.degrees(cmath.phase(Z)),
         20.0 * math.log10(abs(corner)), math.degrees(cmath.phase(corner)), abs(resonance)))
```
Expected output:
```text
Z=3.00+4.00j ohm | |Z|=5.00 at 53.13 deg | corner=-3.0103 dB, -45.00 deg | peak=10.0x
```

## 5. Exercise
For the second-order plant with $\omega_n = 100\,\text{rad/s}$ and $\zeta = 0.05$, evaluate the response at $\omega = 1000\,\text{rad/s}$ and verify $|G|_{\text{dB}} = -39.9127\,\text{dB}$ ($\pm 10^{-3}$) and $\angle G = -179.4213^\circ$ ($\pm 10^{-3}$). Then find the peak: it must sit at $\omega_r = \omega_n\sqrt{1 - 2\zeta^2}$, not at $\omega_n$, and the reported peak must be a point **on** the reported curve.
- **If your result differs:** make sure you used `20.0 * math.log10(abs(G))` (amplitude decibels), not `10.0 * math.log10(abs(G))` (power decibels, which halves every reading).

### Graded package - a Bode plot measured on the arm
[`exercises/00-foundations.T2.00h/`](../exercises/00-foundations.T2.00h/) turns this section into a test. `starter.py` holds six holes: `impedance_rl`, `first_order_response`, `second_order_response`, `magnitude_db` (20 log10, not 10), `phase_deg`, and `resonance_peak` (its location and height, or no peak at all). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00h/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00h -p 'test_*.py'
```

The tests are behavioural: the winding's magnitude is checked as a hypotenuse and its DC impedance must lose the reactance entirely; the first-order corner must be $-3.0103\,\text{dB}$ and $-45^\circ$; the second-order DC gain must be 1 at every damping and the gain at $\omega_n$ must be $1/(2\zeta)$; `magnitude_db` is checked at 10 and 0.1 so power decibels fail; the phase is checked in degrees; and the reported resonance peak must be a point on the reported curve, which is what exposes `omega_r = omega_n` at $\zeta = 0.3$. The transfer suite measures the arm's elbow with a sine torque and a sine/cosine projection (a lock-in, like a bench sweep) and compares gain and phase with the submission's transfer function at three frequencies, then checks that the measured peak sits below $\omega_n$ - with `plant.B2` counted as part of the damping. **17 tests.** Five planted faults - `series_impedance_adds_magnitudes`, `ten_log`, `phase_radians`, `peak_at_natural`, `hardcoded_response` - each fail the test named for them, and a print-only file passes nothing (`scripts/run_exercise.py`).

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Module:** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (Complex Numbers, Euler's Formula & Phasors).
  - **Core Concepts to Review First:** the $j\omega$ substitution, $Z(j\omega) = R + j\omega L$, $G(j\omega) = \frac{\omega_n^2}{(\omega_n^2 - \omega^2) + j(2\zeta\omega_n\omega)}$, decibels, and the peak at $\omega_n\sqrt{1-2\zeta^2}$ in `## 3. Formalization` (Items 1-3).
  - **Bode Plot & Phasor Study Links:** [Brian Douglas: Bode Plots by Hand & Frequency Response (YouTube)](https://www.youtube.com/user/ControlLectures), [CTMS Frequency Response Tutorial (`ctms.engin.umich.edu`)](https://ctms.engin.umich.edu/CTMS/index.php?example=Introduction&section=ControlFrequency), and [Python `cmath` Documentation](https://docs.python.org/3/library/cmath.html).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) (**Two-Mass & Notch Bode**).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution ---
import cmath
import math

import mechalab_plant as plant


def impedance_rl(r_ohm, l_h, omega):
    """Series R-L impedance, as a complex number in ohms."""
    # TODO: the resistor is the real part, the inductor is j*omega*L
    ...


def first_order_response(tau, omega):
    """H(jw) of tau y' + y = u, evaluated at omega."""
    # TODO: d/dt becomes j*omega
    ...


def second_order_response(wn, zeta, omega):
    """G(jw) = wn^2 / ((jw)^2 + 2 zeta wn (jw) + wn^2)."""
    # TODO: substitute s = j*omega and keep it complex
    ...


def magnitude_db(h):
    """Amplitude in decibels: 20 log10 |h| - not 10 log10."""
    # TODO: amplitude decibels
    ...


def phase_deg(h):
    """Phase of h in degrees, in (-180, 180]."""
    # TODO: degrees, not radians
    ...


def resonance_peak(wn, zeta):
    """(omega_r, peak_magnitude), or (0.0, 1.0) when there is no peak."""
    # TODO: wn sqrt(1 - 2 zeta^2) and 1 / (2 zeta sqrt(1 - zeta^2))
    ...


print("scaffold ready: 6 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** at $\omega = 1000\,\text{rad/s}$, $-39.9127\,\text{dB}$ and $-179.4213^\circ$; at the corner, $-3.0103\,\text{dB}$ and $-45.00^\circ$; the peak at $99.7497\,\text{rad/s}$, height $10.0125$.

### Hint ladder
1. **`d/dt -> j omega` is the whole trick.** A first-order filter $\tau\dot{y} + y = u$ becomes $j\omega\tau H + H = 1$, so $H = 1/(1 + j\omega\tau)$ - divide, never subtract.
2. **The denominator is complex, not a length.** For the second-order plant write `s = 1j*omega` and evaluate `s*s + 2*zeta*wn*s + wn*wn`; taking `abs()` of the parts separately before that division is what turns $-39.9\,\text{dB}$ into a wrong sign.
3. **Decibels use 20, phase uses degrees.** `20*math.log10(abs(G))` and `math.degrees(cmath.phase(G))`; at $\omega = 1000$ the plant is almost $180^\circ$ away from the drive, so the phase you get should sit just above $-180^\circ$, not near $-90^\circ$.
4. **The peak is not at $\omega_n$.** Differentiating $|G|$ gives $\omega_r = \omega_n\sqrt{1 - 2\zeta^2}$: for $\zeta = 0.05$ that is $99.7497\,\text{rad/s}$, a little *below* $\omega_n$, and the peak height $1/(2\zeta\sqrt{1-\zeta^2})$ is a little *above* the $1/(2\zeta) = 10$ you read at $\omega_n$ itself.

### Full Solution
```python
import cmath
import math


def impedance_rl(r_ohm, l_h, omega):
    return complex(r_ohm, omega * l_h)


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
omega_r, peak = resonance_peak(wn, zeta)
corner = first_order_response(0.01, 100.0)

assert math.isclose(magnitude_db(g), -39.9127, abs_tol=1e-3)
assert math.isclose(phase_deg(g), -179.4213, abs_tol=1e-3)
assert math.isclose(magnitude_db(corner), -3.0103, abs_tol=1e-4)
assert math.isclose(phase_deg(corner), -45.0, abs_tol=1e-9)
assert math.isclose(abs(impedance_rl(3.0, 0.004, 1000.0)), 5.0, abs_tol=1e-9)
assert math.isclose(abs(second_order_response(wn, zeta, omega_r)), peak, rel_tol=1e-9)

print("G(j1000): %.4f dB, %.4f deg | Z=%.2f ohm | peak %.4f rad/s at %.4fx"
      % (magnitude_db(g), phase_deg(g), abs(impedance_rl(3.0, 0.004, 1000.0)),
         omega_r, peak))
```

Printed: `G(j1000): -39.9127 dB, -179.4213 deg | Z=5.00 ohm | peak 99.7497 rad/s at 10.0125x`.

**On the shared arm.** The Transfer suite sine-sweeps the plant's elbow and reads gain and phase back by lock-in, so $\omega_n$ and $\zeta$ below are the arm's own:

```python
import math
import mechalab_plant as plant

k = 8.0
wn = math.sqrt(k / plant.I2)
zeta = plant.B2 / (2.0 * math.sqrt(plant.I2 * k))
assert math.isclose(wn * wn * plant.I2, k, rel_tol=1e-12)
assert 0.0 < zeta < 1.0
omega_r = wn * math.sqrt(1.0 - 2.0 * zeta * zeta)
print("plant elbow: wn=%.3f rad/s, zeta=%.4f, resonance=%.3f rad/s" % (wn, zeta, omega_r))
```

### Break it on purpose
Inject the decibel-convention fault from the `## 8. Common mistakes` table and diagnose it from two readings, keeping $\omega_n = 100\,\text{rad/s}$ and $\zeta = 0.05$:
- **Inject:** compute the magnitude as `10.0 * math.log10(mag)` instead of `20.0 * math.log10(mag)`.
- **Symptom:** the resonance still sits at $\omega = 100\,\text{rad/s}$ but reads $+10.0\,\text{dB}$ instead of $+20.0\,\text{dB}$, and the first-order corner that must be $-3.0103\,\text{dB}$ reads $-1.505\,\text{dB}$ - every decibel value is exactly half of the truth.
- **Diagnose:** a uniform factor of two across two different circuits rules out a wrong $\zeta$ (which would move the peak height and the $\omega_r$ location, not halve every reading) and a wrong $\omega_n$ (which would shift where the features sit, not their height). The constant half says the log is the power form, because $10\log_{10}|H|^2 = 20\log_{10}|H|$ for an amplitude ratio.
- **Fix:** use $20\log_{10}|G|$; then the peak reads $+20.0\,\text{dB}$ and the RC corner $-3.0103\,\text{dB}$ to within $10^{-4}\,\text{dB}$, and the $\omega = 1000\,\text{rad/s}$ point lands on $-39.9127\,\text{dB}$.

## 6. Simulation path
Open **Two-Mass & Notch Bode** in the MechaLab Workbench (`npm run dev`) to inspect how a lightly damped resonance peak ($+20\,\text{dB}$) and $-180^\circ$ phase drop appear on an interactive Bode magnitude and phase plot.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00h`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Track 01 and Track 07, the exact same complex ratio $H(j\omega) = Y(j\omega)/U(j\omega)$ is measured on real actuators by injecting sinusoidal current commands and comparing encoder output amplitude and phase lag:
```text
[Sine Excitation u(t) = A sin(wt)] ---> [Motor + Gearbox] ---> [Encoder y(t) = B sin(wt + phi)]
                                                                 |H(jw)|_dB = 20*log10(B/A), <H = phi
```
Pass/fail verification in simulation: `|Z| == 5.0 ohm`, corner `== -3.0103 dB`, and the peak at `99.7497 rad/s`.

```mermaid
flowchart LR
    A["00-foundations.T2.00h: complex_impedance_and_transfer_function"] --> B["bode_magnitude_db_and_phase"]
    B --> C["First-order corner, second-order resonance"]
    C --> D["Measured on the arm's elbow by lock-in"]
    D --> E["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ on the Skip test below.

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: complex_impedance_and_transfer_function]` Compute the magnitude $|Z|$ in ohms ($\Omega$, tolerance $\pm 10^{-6}$) of a series RL winding $Z = R + j\omega L$ with $R = 3.0\ \Omega$, $L = 0.004\,\text{H}$ and $\omega = 1000\,\text{rad/s}$.
2. `[Apply] [Concept: complex_impedance_and_transfer_function]` For the first-order filter $H(j\omega) = 1/(1 + j\omega\tau)$ with $\tau = 0.01\,\text{s}$, compute $|H|$ at $\omega = 0$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: bode_magnitude_db_and_phase]` Convert a linear amplitude gain of $|H| = 0.10$ into decibels ($\text{dB}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 00-foundations.T2.00d — Concept: complex_numbers_and_euler_formula] [Concept: bode_magnitude_db_and_phase]` At what phase lag (in degrees) does a first-order low-pass filter operate when $\omega = 1/\tau$?
   - **A.** $0^\circ$
   - **B.** $-45^\circ$
   - **C.** $-90^\circ$
   - **D.** $-180^\circ$

**Answer key:**
```python
import math

q1_z_ohm = abs(3.0 + 1j * 1000.0 * 0.004)
q2_dc = abs(1.0 / (1.0 + 0.0j))
q3_db = 20.0 * math.log10(0.10)
q4_choice = "B"

assert math.isclose(q1_z_ohm, 5.0, rel_tol=1e-9)
assert math.isclose(q2_dc, 1.0, rel_tol=1e-9)
assert math.isclose(q3_db, -20.0, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` items 1-2; if you missed Q3 or Q4, study item 3. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
<!-- ladder-gate:start -->
This is the exit examination for the whole Track 00 Tier 2 ladder - every `00-foundations.T2.*` page in [`docs/SYLLABUS.md`](../docs/SYLLABUS.md) - before Step 2.1 (`00-foundations.T2.01`). Every Tier 2 page renders this same paper, so take it once after the last of them; the page you are on is only where you found it. Questions 1-6 are the matrix page's own tools; 7-14 recap each other page once, so nothing on the ladder goes unexamined.

1. `[Concept: matrix_vector_multiplication]` For $A = \begin{bmatrix} 3.0 & -2.0 \\ 1.0 & 4.0 \end{bmatrix}$ and $\vec{x} = [1.5,\; 2.5]^\top$, compute **both** entries of $A\vec{x}$: the first and the second (tolerances $\pm 10^{-9}$).
2. `[Concept: matrix_vector_multiplication]` Why does a $2\times2$ matrix times a length-2 column come out as a column of length $2$ rather than a $2\times2$ matrix?
   - **A.** $A\vec{x}$ is the elementwise product of $A$ and $\vec{x}$, which keeps $A$'s shape.
   - **B.** Python reshapes $A$ into a column before multiplying.
   - **C.** Each output entry is one row of $A$ dotted with $\vec{x}$, so there is one output per row.
   - **D.** $\vec{x}$ is transposed into a row first.
3. `[Concept: state_vector_one_step_update]` One step of $A_d = \begin{bmatrix} 1.0 & 0.02 \\ -2.0 & 0.80 \end{bmatrix}$, $B_d = [0.0,\; 0.02]^\top$, from $\vec{x}_0 = [0.50,\; 0.0]^\top$ with $u_0 = 10.0\,\text{N}$ gives $v_1$. Compute $v_1$ in $\text{m/s}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: state_vector_one_step_update]` In the same step, if the position row were evaluated using the *new* velocity, what would $x_1$ be (tolerance $\pm 10^{-9}\,\text{m}$)?
5. `[Concept: state_vector_one_step_update]` For the two-mass matrix with $m_1 = 1.0\,\text{kg}$, $m_2 = 2.0\,\text{kg}$, $k = 50.0\,\text{N/m}$, $b = 0$ and $\Delta t = 0.01\,\text{s}$, compute the first entry of its **fourth** row - the row that updates $v_2$ (tolerance $\pm 10^{-9}$).
6. `[Concept: state_vector_one_step_update]` Why do the diagonal $2\times2$ blocks of the 4-state matrix equal the single-mass update for each body when $k = b = 0$?
   - **A.** Because the 4-state matrix is always block-diagonal.
   - **B.** Because each mass then obeys the same mass-spring-damper form with its own mass and damping, and the coupling terms vanish.
   - **C.** Because $B_d$ only pushes $m_1$.
   - **D.** Because the Euler update is exact.
7. `[Concept: finite_difference_derivative_and_integral]` An encoder reads $x_{k-1} = 0.24\,\text{rad}$ and $x_k = 0.30\,\text{rad}$ at $\Delta t = 0.002\,\text{s}$. Compute the backward-difference velocity in $\text{rad/s}$ (tolerance $\pm 10^{-9}$).
8. `[Concept: dot_product_projection] [Concept: cross_product_3d_moment] [Concept: basis_change_and_invertibility]` Which triple is correct for `00-foundations.T2.00b`?
   - **A.** The projection uses the raw lever so force grows with its length, $\vec{r}\times\vec{F} = \vec{F}\times\vec{r}$, and a zero determinant means a valid basis.
   - **B.** The projection divides by $\|\vec{r}\|$ twice, the moment is a scalar, and the determinant is always positive.
   - **C.** The dot product returns a vector, the cross product is symmetric, and the determinant equals the trace.
   - **D.** The projection uses the lever's *unit* direction, the moment is $\vec{r}\times\vec{F}$ (anti-commutative), and a zero determinant means the two columns are collinear.
9. `[Concept: first_order_ode_time_constant] [Concept: second_order_ode_wn_zeta] [Concept: characteristic_polynomial_roots]` For `00-foundations.T2.00c`'s joint with $J = 0.02\,\text{kg}\cdot\text{m}^2$, $k = 8.0\,\text{N}\cdot\text{m/rad}$ and $b = 0.60\,\text{N}\cdot\text{m}\cdot\text{s/rad}$, compute the damping ratio $\zeta = b/(2\sqrt{Jk})$ (tolerance $\pm 10^{-9}$).
10. `[Concept: complex_numbers_and_euler_formula] [Concept: complex_impedance_and_transfer_function] [Concept: bode_magnitude_db_and_phase]` A series RL winding has $R = 4.0\ \Omega$ and $L = 2.0\,\text{mH}$ and is driven at $\omega = 2000\,\text{rad/s}$. Compute $|Z|$ in ohms, then $20\log_{10}|H|$ at the corner $\omega = 1/\tau$ of a first-order filter (tolerances $\pm 10^{-9}\,\Omega$ and $\pm 10^{-4}\,\text{dB}$).
11. `[Concept: laplace_poles_and_zeros] [Concept: continuous_state_space_matrices] [Concept: discrete_state_transition_euler_tustin]` For `00-foundations.T2.00e`'s $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$ sampled at $T_s = 0.05\,\text{s}$, compute the spectral radius of the Forward-Euler map $A_d = I + A T_s$ (tolerance $\pm 10^{-6}$).
12. `[Concept: nyquist_sampling_and_aliasing]` Which statement is correct for `00-foundations.T2.00f`?
   - **A.** Sampling represents any frequency, and aliasing affects only DC.
   - **B.** Sampling represents only frequencies up to $f_s/2$, and a faster tone folds to $|f - k f_s|$.
   - **C.** The Nyquist frequency is $f_s$, and aliasing doubles the frequency.
   - **D.** A digital low-pass filter placed after the ADC removes aliasing.
13. `[Concept: tustin_frequency_prewarping_and_biquad]` Compute the pre-warped analog prototype $\omega_a$ in $\text{rad/s}$ that lands a Tustin notch on $600\,\text{Hz}$ at $f_s = 2000\,\text{Hz}$, and the frequency the *unwarped* prototype $2\pi f_0$ would land on in $\text{Hz}$ (tolerances $\pm 10^{-3}\,\text{rad/s}$ and $\pm 0.01\,\text{Hz}$).
14. `[Concept: gaussian_variance_and_covariance_matrix]` For $A = \begin{bmatrix} 1 & 0.1 \\ 0 & 1 \end{bmatrix}$, $\Sigma_x = \operatorname{diag}(0.01, 0.25)$ and $Q = \operatorname{diag}(0.001, 0.002)$, compute the $(0,0)$ entry of $\Sigma_y = A\Sigma_x A^\top + Q$ (tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

# Q1-Q6: the matrix page. Two entries, evaluated one row at a time: the paper asks for both so a
# reader who reads the maths (1-indexed) and one who reads Python (0-indexed) agree on the answer.
g1_ax_first = 3.0 * 1.5 + (-2.0) * 2.5
g1_ax_second = 1.0 * 1.5 + 4.0 * 2.5
g2_choice = "C"
g3_v1 = -2.0 * 0.50 + 0.80 * 0.0 + 0.02 * 10.0
g4_x1_new_v = 1.0 * 0.50 + 0.02 * (-0.80)
g5_row4_first = (50.0 / 2.0) * 0.01
g6_choice = "B"

# Q7: the derivative page.
g7_velocity = (0.30 - 0.24) / 0.002

# Q8-Q12: one question per remaining page.
g8_choice = "D"
g9_zeta = 0.60 / (2.0 * math.sqrt(0.02 * 8.0))
g10_z_ohm = abs(4.0 + 1j * 2000.0 * 0.002)
g10_corner_db = 20.0 * math.log10(1.0 / math.sqrt(2.0))
Ad_euler = [[1.0, 0.05], [-5.0, 0.80]]
g11_radius = math.sqrt(Ad_euler[0][0] * Ad_euler[1][1] - Ad_euler[0][1] * Ad_euler[1][0])
g12_choice = "B"
g13_wa = (2.0 / 0.0005) * math.tan(math.pi * 600.0 / 2000.0)
g13_unwarped = (2000.0 / math.pi) * math.atan(math.pi * 600.0 / 2000.0)
g14_sigma00 = 0.01 + 0.1 * 0.1 * 0.25 + 0.001

assert math.isclose(g1_ax_first, -0.5, rel_tol=1e-9)
assert math.isclose(g1_ax_second, 11.5, rel_tol=1e-9)
assert g2_choice == "C"
assert math.isclose(g3_v1, -0.80, rel_tol=1e-9)
assert math.isclose(g4_x1_new_v, 0.484, rel_tol=1e-9)
assert math.isclose(g5_row4_first, 0.25, rel_tol=1e-9)
assert g6_choice == "B"
assert math.isclose(g7_velocity, 30.0, rel_tol=1e-9)
assert g8_choice == "D"
assert math.isclose(g9_zeta, 0.75, rel_tol=1e-9)
assert math.isclose(g10_z_ohm, 5.656854249492381, rel_tol=1e-9)
assert math.isclose(g10_corner_db, -3.0103, abs_tol=1e-4)
assert math.isclose(g11_radius, 1.024695, abs_tol=1e-6)
assert g12_choice == "B"
assert math.isclose(g13_wa, 5505.5277, abs_tol=1e-3)
assert math.isclose(g13_unwarped, 481.1534, abs_tol=1e-2)
assert math.isclose(g14_sigma00, 0.0135, rel_tol=1e-9)

print("gate key: Ax=[%.1f, %.1f], v1=%.2f m/s, x1(new v)=%.3f m, radius=%.6f"
      % (g1_ax_first, g1_ax_second, g3_v1, g4_x1_new_v, g11_radius))
```
- **Pass mark:** $\ge 12/14$. Every question is answered by the page named in its tags; the ladder is closed when this paper is passed once, after the last Tier 2 page.
<!-- ladder-gate:end -->

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Bode dB value is half of expected (`+10 dB` instead of `+20 dB`) | Used $10\log_{10}\lvert H\rvert $ instead of $20\log_{10}\lvert H\rvert $ for amplitude ratios. | Always use $20\log_{10}(\lvert H\rvert )$ for voltage, current, force, or position amplitude ratios. |
| Winding impedance comes out as a real number the size of $R + \omega L$ | Added the reactance to the resistance instead of forming a hypotenuse. | Keep it complex: `complex(R, omega*L)`; only `abs()` turns it into a magnitude. |
| Phase angle wraps unexpectedly or is in radians | Forgot `math.degrees(...)` on `cmath.phase(G)`. | Wrap `cmath.phase(G)` with `math.degrees(...)` when plotting Bode phase in degrees. |
| The resonance peak is reported at $\omega_n$ | Used the natural frequency instead of $\omega_n\sqrt{1-2\zeta^2}$. | Differentiate $\lvert G\rvert $; check the reported peak is an actual point on the curve. |

## 9. Resources
- **Oppenheim & Willsky — [*Signals and Systems* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md) & [Brian Douglas Bode Plot Lectures](https://www.youtube.com/user/ControlLectures):** Frequency response, phasors, and Bode diagrams `[VERIFIED 2026-10-15]`.
- **Track 00 ([`00-foundations/README.md#tier-2-intermediate--applied`](../00-foundations/README.md#tier-2-intermediate--applied)):** Prepares directly for Step 2.1 two-mass torsional resonance and anti-resonance Bode analysis `[VERIFIED 2026-10-15]`.

## 10. Next modules

<!-- next-step:start -->
👉 **Next:** [Step 3 · Make a joint move: foundations — 00-foundations.T2.00e: Laplace Transform, Poles/Zeros, Continuous State-Space (x_dot = Ax + Bu) & Euler/Tustin Discretization](00-foundations.T2.00e.md)
<!-- next-step:end -->
