---
id: 00-foundations.T1.00d
title: "Linear Equations, Unit-Circle Trig, Radians, atan2 & 2D Vectors"
track: "00"
tier: 1
prereqs:
  - 00-foundations.T1.00c
new_concepts:
  - linear_functions_and_slope
  - radians_unit_circle_and_atan2
  - 2d_vectors_and_components
uses:
  - python_variables_and_types
  - lists_dicts_and_numpy_arrays
  - si_base_and_derived_units
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 2
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
Robot joints rotate in angles while cameras and workpieces sit at Cartesian $(x, y)$ coordinates, and analog sensors output voltages that scale linearly with current or angle. Mastering linear calibration lines, radian angles on the unit circle, 2D vector projections, and four-quadrant `atan2(y, x)` prevents your robot arm from snapping $180^\circ$ into the wrong quadrant when crossing the negative $x$-axis. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Lay a rigid $40\text{ cm}$ ruler flat on your desk with one end pinned at the origin $(0,0)$ and shine a flashlight straight down from the ceiling and straight across from the right wall. As you swing the ruler counter-clockwise by an angle $\theta$, its horizontal shadow on the desk bottom edge is the cosine projection ($x$), and its vertical shadow on the left wall is the sine projection ($y$). If someone tells you only the single fraction $y/x$, you cannot tell whether the ruler points up-and-left ($x < 0, y > 0$) or down-and-right ($x > 0, y < 0$) because both give a negative fraction—which is why robotics code always passes both shadows separately into `atan2(y, x)`.

## 3. Formalization
1. **Linear Calibration ($y = m x + b$):** An analog sensor with output $y$ in volts ($\text{V}$), input current $x$ in amperes ($\text{A}$), sensitivity slope $m = \frac{\Delta y}{\Delta x}$ in $\text{V/A}$, and zero-offset $b$ in $\text{V}$ obeys:

$$
y = m x + b
$$

   Substituting $m = 0.20\text{ V/A}$, $x = 5.0\text{ A}$, and $b = 1.65\text{ V}$ gives $y = (0.20\text{ V/A})(5.0\text{ A}) + 1.65\text{ V} = 2.65\text{ V}$.
2. **Radians and 2D Vector Projections:** One full revolution ($360^\circ$) spans $2\pi \approx 6.2832\text{ rad}$, so $\theta_{\text{rad}} = \theta_{\text{deg}}\frac{\pi}{180^\circ}$. A link of length $L$ in meters ($\text{m}$) at angle $\theta$ in radians has tip coordinates $(x, y)$ and Euclidean norm $r$:

$$
x = L\cos\theta, \qquad y = L\sin\theta, \qquad r = \sqrt{x^2 + y^2}
$$

   For $L = 0.40\text{ m}$ and $\theta = 135^\circ = 2.35619\text{ rad}$, $x = 0.40\cos(2.35619\text{ rad}) = -0.28284\text{ m}$, $y = 0.40\sin(2.35619\text{ rad}) = +0.28284\text{ m}$, and $r = \sqrt{(-0.28284\text{ m})^2 + (0.28284\text{ m})^2} = 0.40\text{ m}$.
3. **Four-Quadrant Angle Recovery (`atan2`):** Given tip coordinates $(x, y)$ in meters, $\theta = \operatorname{atan2}(y, x)$ inspects the signs of both $y$ and $x$ to return the unique angle in $(-\pi, +\pi]\text{ rad}$:

$$
\theta = \operatorname{atan2}(+0.28284\text{ m},\; -0.28284\text{ m}) = +2.35619\text{ rad} = +135.0^\circ
$$

   By contrast, single-argument $\arctan(y/x) = \arctan(-1.0) = -0.78540\text{ rad} = -45.0^\circ$ (wrong quadrant by $180^\circ$).

## 4. Worked example
**Predict first (before you run it):** Before running the block, commit to four results for $L = 0.40\text{ m}$ at $\theta = 135.0^\circ$: the sign of each tip coordinate; the Euclidean length $r$ (is it $0.40\text{ m}$, or the $|x| + |y|$ shortcut?); the degrees `math.atan2(y, x)` reports; and the degrees `math.atan(y / x)` reports instead of that. Two tells that a wrong result is a mistake rather than a surprise: a positive $x$ is impossible at $135^\circ$, since the angle sits in Quadrant II, and an `atan` reading of $135.0^\circ$ means the block never exercised the single-argument version at all.

Project a $L = 0.40\text{ m}$ link at $\theta = 135.0^\circ$ into $(x, y)$ coordinates, verify its length $r = 0.40\text{ m}$, and compare four-quadrant `math.atan2(y, x)` against `math.atan(y / x)`.

```python
import math

L_m = 0.40
theta_rad = math.radians(135.0)

tip = [L_m * math.cos(theta_rad), L_m * math.sin(theta_rad)]
length_m = math.hypot(tip[0], tip[1])
recovered_deg = math.degrees(math.atan2(tip[1], tip[0]))
wrong_atan_deg = math.degrees(math.atan(tip[1] / tip[0]))

assert math.isclose(length_m, L_m, rel_tol=1e-9)
assert math.isclose(recovered_deg, 135.0, rel_tol=1e-9)
assert math.isclose(wrong_atan_deg, -45.0, rel_tol=1e-9)
print(f"tip=({tip[0]:.4f}, {tip[1]:.4f}) m, atan2={recovered_deg:.1f} deg, atan={wrong_atan_deg:.1f} deg")
```
Expected output:
```text
tip=(-0.2828, 0.2828) m, atan2=135.0 deg, atan=-45.0 deg
```

## 5. Exercise
A robot base at $(0, 0)$ observes a target at $(x, y) = (-0.30\text{ m}, -0.40\text{ m})$ in Quadrant III. Compute the Euclidean distance $d = \sqrt{x^2 + y^2}$ in meters and the heading angle in degrees using `math.degrees(math.atan2(y, x))`. Expected result: `d = 0.50 m` and `theta = -126.8699 deg` (tolerance $\pm 0.01^\circ$).
- **If your result differs:** Check that you passed `y` first and `x` second in `math.atan2(y, x)`; passing `atan2(x, y)` swaps the axes and returns $-143.13^\circ$.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00a`](00-foundations.T1.00a.md)–[`00-foundations.T1.00c`](00-foundations.T1.00c.md) (*Python Functions, Arrays & SI Units*).
  - **Core Concepts to Review First:** 2D vector tip coordinates $(L\cos\theta, L\sin\theta)$, Euclidean norm $\sqrt{x^2+y^2}$, and four-quadrant `math.atan2(y, x)` in `## 3. Formalization` (Items 2–3) and `## 4. Worked example` above.
  - **Trigonometry & 2D Vectors Study Links:** [3Blue1Brown: Essence of Linear Algebra — Vectors (`3blue1brown.com`)](https://www.3blue1brown.com/topics/linear-algebra), [Red Blob Games: Interactive 2D Trigonometry & `atan2` Guide](https://www.redblobgames.com/), and [Python `math.atan2` Documentation](https://docs.python.org/3/library/math.html#math.atan2).
  - **Curriculum Reference:** [Track 00 Tier 1 (`00-foundations/README.md`)](../00-foundations/README.md#tier-1-beginner--intuitive) and [Lynch & Park *Modern Robotics* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md).

### Graded package - the line, the norm and the heading
[`exercises/00-foundations.T1.00d/`](../exercises/00-foundations.T1.00d/) turns this section into a test. `starter.py` holds seven holes: `sensor_voltage` (the calibration line), `sensor_current` (subtract the offset *before* dividing), `polar_to_cartesian` ($\cos$ for $x$, $\sin$ for $y$, radians), `link_length` (the diagonal, not $|x| + |y|$), `heading_rad` (four-quadrant `atan2(y, x)`), `heading_deg` and `degrees_to_radians` ($\pi/180$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T1.00d/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T1.00d -p 'test_*.py'
```

### Starter code
```python
"""Exercise 00-foundations.T1.00d - the learner's file.

The calibration line and its inverse, the unit-circle projection, the Euclidean norm, the
four-quadrant heading and the radian conversion. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00d/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00d -p 'test_*.py'
"""

import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    """y = m x + b."""
    raise NotImplementedError("TODO 1: multiply, then add the zero-current offset")


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    """x = (y - b) / m."""
    raise NotImplementedError("TODO 2: subtract the offset BEFORE dividing by the slope")


def polar_to_cartesian(length_m, theta_rad):
    """(L cos t, L sin t)."""
    raise NotImplementedError("TODO 3: cosine for x, sine for y, and theta is in RADIANS")


def link_length(x_m, y_m):
    """r = sqrt(x^2 + y^2)."""
    raise NotImplementedError("TODO 4: the diagonal, not the taxi ride x + y")


def heading_rad(x_m, y_m):
    """Four-quadrant atan2(y, x) in (-pi, pi]."""
    raise NotImplementedError("TODO 5: atan2 takes y FIRST; plain atan cannot see the quadrant")


def heading_deg(x_m, y_m):
    """The same heading in degrees."""
    raise NotImplementedError("TODO 6: reuse heading_rad, then convert")


def degrees_to_radians(deg):
    """theta_rad = theta_deg * pi / 180."""
    raise NotImplementedError("TODO 7: 180 degrees is pi, not 180")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
```

### Hint ladder
1. **The line and its inverse are two different orders.** `y = m x + b` adds the offset last; `x = (y - b)/m` subtracts it first. At $V = 1.7\text{ V}$ on the $0.5\text{ V}$-at-$0\text{ A}$, $2.5\text{ V}$-at-$10\text{ A}$ sensor, the slope is `(2.5 - 0.5)/(10 - 0)` $= 0.2\text{ V/A}$, so the current is `(1.7 - 0.5)/0.2 = 6.0 A`.
2. **The projections are a cosine and a sine, in radians.** `polar_to_cartesian(0.40, math.radians(135.0))` gives `(-0.28284, 0.28284)`; passing degrees straight into `math.cos` is the `-0.448` row in the common-mistakes table.
3. **The norm is the diagonal.** For the exercise's target, `math.hypot(-0.30, -0.40)` is `0.50`; `|-0.30| + |-0.40| = 0.70` is the taxi-cab sum, not a distance.
4. **`atan2` takes `y` first, and that order is the whole four-quadrant trick.** `math.atan2(-0.40, -0.30)` is `-2.2143` rad $= -126.8699^\circ$; swapping the arguments gives $-143.13^\circ$, the mirrored heading the exercise warns about.

5. **What the suite refuses.** A zero readout where `sensor_current` divides by the slope, a negative radius passed to `polar_to_cartesian`, and the origin passed to `heading_rad` - where no heading exists - all raise `ValueError`.

### Full Solution
```python
import math


def sensor_voltage(slope_v_per_a, current_a, offset_v=0.0):
    """y = m x + b: the calibration line the datasheet gives you."""
    return slope_v_per_a * current_a + offset_v


def sensor_current(slope_v_per_a, voltage_v, offset_v=0.0):
    """The inverse of the line: x = (y - b) / m."""
    if slope_v_per_a == 0.0:
        raise ValueError("a zero slope has no inverse: the output never moves")
    return (voltage_v - offset_v) / slope_v_per_a


def polar_to_cartesian(length_m, theta_rad):
    """(L cos t, L sin t): the two shadows of the pinned ruler."""
    if length_m < 0.0:
        raise ValueError("a link length cannot be negative")
    return (length_m * math.cos(theta_rad), length_m * math.sin(theta_rad))


def link_length(x_m, y_m):
    """r = sqrt(x^2 + y^2)."""
    return math.hypot(x_m, y_m)


def heading_rad(x_m, y_m):
    """Four-quadrant atan2(y, x) in (-pi, pi]."""
    if x_m == 0.0 and y_m == 0.0:
        raise ValueError("the origin has no heading")
    return math.atan2(y_m, x_m)


def heading_deg(x_m, y_m):
    """The same heading, in degrees."""
    return math.degrees(heading_rad(x_m, y_m))


def degrees_to_radians(deg):
    """theta_rad = theta_deg * pi / 180."""
    return math.radians(deg)

x_m, y_m = -0.30, -0.40
distance_m = link_length(x_m, y_m)
theta_deg = heading_deg(x_m, y_m)

assert abs(distance_m - 0.50) <= 1e-12
assert abs(theta_deg - (-126.8699)) <= 0.01
assert abs(heading_deg(0.28284, 0.28284) - 45.0) <= 1e-4
assert abs(sensor_current(0.20, 2.65, 1.65) - 5.0) <= 1e-12
assert abs(polar_to_cartesian(0.40, degrees_to_radians(135.0))[1] - 0.28284) <= 1e-4

print("d=%.4f m | theta=%.4f deg | atan(x, y) swap=%.2f deg | I(V=1.7)=%.2f A"
      % (distance_m, theta_deg, math.degrees(math.atan2(-0.30, -0.40)),
         sensor_current(0.2, 1.7, 0.5)))
```

Printed: `d=0.5000 m | theta=-126.8699 deg | atan(x, y) swap=-143.13 deg | I(V=1.7)=6.00 A`.

**On the shared arm.** The Transfer suite builds the plant's tip as this module's two projections and checks its heading against the plant's own `wrap_pi`:

```python
import math
import mechalab_plant as plant

q1, q2 = 0.4, -0.7
tip_x = plant.L1 * math.cos(q1) + plant.L2 * math.cos(q1 + q2)
tip_y = plant.L1 * math.sin(q1) + plant.L2 * math.sin(q1 + q2)
assert abs(tip_x - plant.fk(q1, q2)[0]) < 1e-15
assert abs(tip_y - plant.fk(q1, q2)[1]) < 1e-15
assert abs(math.hypot(*plant.fk(0.0, 0.0)) - (plant.L1 + plant.L2)) < 1e-15
print("plant tip at (0.4, -0.7) = (%.4f, %.4f) m | full reach %.2f m"
      % (tip_x, tip_y, plant.L1 + plant.L2))
```

### Break it on purpose
Inject the single-argument arctan the `## 8. Common mistakes` table warns about, keeping the worked example's tip at $(-0.28284\text{ m},\ +0.28284\text{ m})$:
- **Inject:** replace `math.atan2(tip[1], tip[0])` with `math.atan(tip[1] / tip[0])` on those same coordinates.
- **Symptom:** the recovered heading prints `-45.0 deg` instead of `135.0 deg` — a $180^\circ$ error, while the tip is unchanged and the length still reads `0.40 m`.
- **Diagnose:** the projections and the norm survived, so $\cos$, $\sin$ and `hypot` are right and only the angle recovery is wrong. `atan` cannot return anything outside $(-90^\circ, +90^\circ)$, so $135^\circ$ was impossible before the code ran; the ratio $y/x = -1.0$ is identical for the correct tip and its $180^\circ$ mirror image, which is exactly the information the sign of $x$ supplies.
- **Fix:** pass both coordinates to `math.atan2(tip[1], tip[0])`, which returns `135.0 deg` to within $10^{-9}$ degrees, and check the exercise's target $(-0.30\text{ m},\ -0.40\text{ m})$ comes back `-126.8699 deg` rather than its $180^\circ$ mirror.

## 6. Simulation path
Run the worked example in Python and open **Tab 5 (URDF / MuJoCo & STO)** in the MechaLab Workbench to watch planar and 3D link angles map to tip $(x, y, z)$ coordinates in real time.

No hardware required for this module (`hardware_required: false`). In Track 03 (`Step 1.4`), an on-axis magnetic encoder (`AS5600`) uses two orthogonal Hall sensors ($B_x, B_y$) to run this exact `atan2(By, Bx)` calculation in silicon:
```text
[Diametric Magnet] ---> [Hall Sensors: Bx = B*cos(theta), By = B*sin(theta)] ---> [atan2(By, Bx) -> 12-bit Angle]
```
Pass/fail verification in simulation: `length_m == 0.40 m` and `recovered_deg == 135.0 deg`.


```mermaid
flowchart LR
    A["00-foundations.T1.00d: linear_functions_and_slope"] --> B["radians_unit_circle_and_atan2"]
    B --> C["2d_vectors_and_components"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: 2d_vectors_and_components]` Compute the $x$-coordinate in meters (tolerance $\pm 10^{-4}\text{ m}$) of a $L = 0.20\text{ m}$ link at angle $\theta = 120^\circ$ ($2\pi/3\text{ rad}$).
2. `[Apply] [Concept: radians_unit_circle_and_atan2]` Compute the angle in degrees (tolerance $\pm 0.01^\circ$) returned by `math.degrees(math.atan2(-1.0, -1.0))` in Quadrant III.
3. `[Transfer] [Concept: linear_functions_and_slope]` A current sensor outputs $0.5\text{ V}$ at $0\text{ A}$ and $2.5\text{ V}$ at $10\text{ A}$. Compute the current $I$ in amperes (tolerance $\pm 0.01\text{ A}$) when the sensor outputs $V = 1.7\text{ V}$.
4. `[Concept: radians_unit_circle_and_atan2]` What happens if your code evaluates `math.atan(y / x)` instead of `math.atan2(y, x)` when the robot arm points straight up along the $+y$ axis ($x = 0.0\text{ m}, y = 0.25\text{ m}$)?
   - **A.** It returns $+\pi/2\text{ rad}$ ($+90^\circ$).
   - **B.** It raises `ZeroDivisionError: float division by zero` before `atan` is even called.
   - **C.** It returns $0.0\text{ rad}$.
   - **D.** It returns $-\pi/2\text{ rad}$ ($-90^\circ$).
5. `[Spaced review -> 00-foundations.T1.00c — Concept: dimensional_analysis_unit_checks] [Concept: radians_unit_circle_and_atan2]` Convert an angular speed of $180.0\text{ deg/s}$ into $\text{rad/s}$ (tolerance $\pm 10^{-4}\text{ rad/s}$).

**Answer key:**
```python
import math

q1_x = 0.20 * math.cos(math.radians(120.0))
q2_deg = math.degrees(math.atan2(-1.0, -1.0))
slope_a_per_v = (10.0 - 0.0) / (2.5 - 0.5)
q3_current_a = slope_a_per_v * (1.7 - 0.5)
q4_choice = "B"
q5_rad_s = math.radians(180.0)

assert math.isclose(q1_x, -0.10, rel_tol=1e-9)
assert math.isclose(q2_deg, -135.0, rel_tol=1e-9)
assert math.isclose(q3_current_a, 6.0, rel_tol=1e-9)
assert q4_choice == "B"
assert math.isclose(q5_rad_s, math.pi, rel_tol=1e-9)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1, Q2, or Q3, study `## 3. Formalization`; if you missed Q4, study `## 4. Worked example`; if you missed Q5, study `## 3. Formalization` (and review `00-foundations.T1.00c`). On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 00 Tier 1 bridge ladder (`00-foundations.T1.00a` $\to$ `00-foundations.T1.00b` $\to$ `00-foundations.T1.00c` $\to$ `00-foundations.T1.00d` $\to$ `00-foundations.T1.00e`) before Step 1.1 (`00-foundations.T2.00a`):
1. `[Concept: linear_functions_and_slope]` A current sensor is calibrated as $V = 0.15\,I + 0.8$ volts. Compute the output at $I = 6.0\ \text{A}$ (tolerance $\pm 10^{-9}\ \text{V}$).
2. `[Concept: linear_functions_and_slope]` The same sensor reads $2.3\ \text{V}$. Compute the current in amperes (tolerance $\pm 10^{-9}\ \text{A}$).
3. `[Concept: radians_unit_circle_and_atan2] [Concept: 2d_vectors_and_components]` Compute `math.degrees(math.atan2(0.5, -0.5))` in degrees (tolerance $\pm 10^{-9}$ degrees).
4. `[Concept: radians_unit_circle_and_atan2]` A tip sits at $(-0.30\ \text{m}, -0.40\ \text{m})$. Why must the code call `atan2(y, x)` instead of `atan(y / x)`?
   - **A.** Because `atan` always returns radians and `atan2` returns degrees.
   - **B.** Because $y/x$ is the same fraction for $(-0.30, -0.40)$ and $(+0.30, +0.40)$, so the one-argument `atan` cannot recover the $180^\circ$ difference; `atan2` inspects both signs.
   - **C.** Because `atan` rejects negative arguments with a `ValueError`.
   - **D.** Because `atan2` is numerically faster.
5. `[Concept: radians_unit_circle_and_atan2]` Convert $150^\circ$ into radians (tolerance $\pm 10^{-9}\ \text{rad}$).
6. `[Concept: 2d_vectors_and_components]` A $L = 0.30\ \text{m}$ link points at $210^\circ$. Compute its $x$ coordinate in metres (tolerance $\pm 10^{-4}\ \text{m}$).
7. `[Concept: 2d_vectors_and_components]` Compute the Euclidean length of the vector $(0.18\ \text{m}, 0.24\ \text{m})$ in metres (tolerance $\pm 10^{-12}\ \text{m}$).
8. `[Concept: si_base_and_derived_units] [Concept: dimensional_analysis_unit_checks]` A joint delivers $0.6\ \text{N}\cdot\text{m}$ at $50\ \text{rad/s}$. Compute $P = \tau\omega$ in watts (tolerance $\pm 10^{-9}\ \text{W}$).
9. `[Concept: scientific_notation_and_prefixes]` A $2.2\ \text{k}\Omega$ resistor with a $470\ \text{nF}$ capacitor has $\tau_{RC} = RC$. Compute it in milliseconds (tolerance $\pm 10^{-9}\ \text{ms}$).
10. `[Concept: python_variables_and_types] [Concept: traceback_error_reading]` Trace `x = 2.0; x **= 2; x -= 1` and compute the final `x` (tolerance $\pm 10^{-9}$).
11. `[Concept: for_while_loops_and_functions]` Compute the integer returned by `sum(2 ** i for i in range(4))`.
12. `[Concept: lists_dicts_and_numpy_arrays] [Concept: matplotlib_time_series_plotting] [Concept: terminal_and_git_basics]` For `arr = [0.2, 0.9, 0.4, 0.7]`, compute `max(arr) - min(arr)` (tolerance $\pm 10^{-12}$).
13. `[Concept: discrete_kinematics_pos_vel_acc] [Concept: newtons_second_law_and_torque]` A $1.5\ \text{kg}$ carriage moving at $2.0\ \text{m/s}$ is pushed by $6.0\ \text{N}$ for $0.25\ \text{s}$. Compute its final speed in $\text{m/s}$ (tolerance $\pm 10^{-9}\ \text{m/s}$).
14. `[Concept: spring_energy_and_power]` You double a carriage's speed from $1.2\ \text{m/s}$ to $2.4\ \text{m/s}$. By what factor does its kinetic energy $\tfrac{1}{2} m v^2$ change?
   - **A.** $2\times$
   - **B.** $4\times$
   - **C.** $\sqrt{2}\times$
   - **D.** unchanged

**Gate answer key:**
```python
import math

g1_v = 0.15 * 6.0 + 0.8
g2_i = (2.3 - 0.8) / 0.15
g3_deg = math.degrees(math.atan2(0.5, -0.5))
g4_choice = "B"
g5_rad = math.radians(150.0)
g6_x = 0.30 * math.cos(math.radians(210.0))
g7_length = math.hypot(0.18, 0.24)
g8_power_w = 0.6 * 50.0
g9_tau_ms = (2.2e3 * 470e-9) * 1e3
x = 2.0
x **= 2
x -= 1
g10_x = x
g11_total = sum(2 ** i for i in range(4))
arr = [0.2, 0.9, 0.4, 0.7]
g12_span = max(arr) - min(arr)
g13_v = 2.0 + (6.0 / 1.5) * 0.25
g14_choice = "B"

assert math.isclose(g1_v, 1.7, rel_tol=1e-12)
assert math.isclose(g2_i, 10.0, rel_tol=1e-12)
assert math.isclose(g3_deg, 135.0, rel_tol=1e-12)
assert g4_choice == "B"
assert math.isclose(g5_rad, 2.617993878, abs_tol=1e-9)
assert math.isclose(g6_x, -0.2598, abs_tol=1e-4)
assert math.isclose(g7_length, 0.30, rel_tol=1e-12)
assert math.isclose(g8_power_w, 30.0, rel_tol=1e-12)
assert math.isclose(g9_tau_ms, 1.034, rel_tol=1e-9)
assert math.isclose(g10_x, 3.0, rel_tol=1e-12)
assert g11_total == 15
assert math.isclose(g12_span, 0.7, abs_tol=1e-12)
assert math.isclose(g13_v, 3.0, rel_tol=1e-12)
assert g14_choice == "B"
```
- **Pass mark:** $\ge 80\%$ ($4/5$ on Skip test; $\ge 12/14$ on Gate test). Missed Gate Q1-Q7: study this module's `## 3. Formalization`; Q8-Q9: `00-foundations.T1.00c`; Q10-Q12: `00-foundations.T1.00a` and `00-foundations.T1.00b`; Q13-Q14: `00-foundations.T1.00e`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| `math.cos(90)` returns `-0.448` instead of `0.0` | Passed degrees (`90`) into `math.cos()`, which expects radians. | Wrap degree inputs with `math.radians(deg)` or store all angles in radians. |
| Heading angle is mirrored across the $y = x$ diagonal | Called `math.atan2(x, y)` instead of `math.atan2(y, x)`. | Remember the alphabetical trap: `atan2(y, x)` always takes vertical `y` first, horizontal `x` second. |
| Arm jerks by $180^\circ$ when crossing $x = 0$ | Used `math.atan(y / x)` instead of four-quadrant `math.atan2(y, x)`. | Replace every `atan(y / x)` with `math.atan2(y, x)`. |

## 9. Resources
- **Track 00 ([`00-foundations/README.md`](../00-foundations/README.md)) & [Python `math` Library Docs](https://docs.python.org/3/library/math.html):** Uses unit-circle trigonometry and `math.atan2(y, x)` directly in Step 1.1 $SO(2)$ rotation matrices `[VERIFIED 2026-10-15]`.
- **Track 02 ([`02-mechanics-kinematics-dynamics/README.md`](../02-mechanics-kinematics-dynamics/README.md)) & [Red Blob Games Interactive 2D Math](https://www.redblobgames.com/):** Uses 2D vector projections and `atan2` in Step 1.3 planar 2-link kinematics `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Position, Velocity, Acceleration, Force, Mass, Energy & Torque in a Loop*).
