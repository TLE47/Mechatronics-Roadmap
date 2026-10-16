---
lesson_id: P.10
title: "Radians, Rotational Speed (rad/s) and Right-Triangle Trigonometry"
ideas:
  - "Measuring angles in radians and rotational speed (rad/s)"
  - "Right-triangle trigonometry (cos, sin, atan2)"
typical_hours: "1.5-2.0"
slow_learner_hours: "2.5-3.5"
---

# Lesson P.10: Radians, Rotational Speed (`rad/s`) and Right-Triangle Trigonometry

## Goal
Convert angles between degrees and **radians** ($\pi\text{ rad} = 180^\circ$) and motor speeds between `RPM` and `rad/s`, and use `math.cos()`, `math.sin()`, and `math.atan2(y, x)` to compute 2D robot arm geometry.

- **New ideas (max 2):**
  1. **Measuring angles in radians and rotational speed (`rad/s`)**: Why one full turn ($360^\circ$) equals $2\pi\text{ radians}$, and how to convert revolutions per minute (`RPM`) into radians per second (`rad/s`).
  2. **Right-triangle trigonometry (`cos`, `sin`, `atan2`)**: Finding a robot link's horizontal reach $x = L\cos\theta$ and vertical height $y = L\sin\theta$, and recovering $\theta = \text{atan2}(y, x)$ in any quadrant.
- **New syntax:** `math.pi`, `math.radians(deg)`, `math.degrees(rad)`, `math.cos(rad)`, `math.sin(rad)`, `math.atan2(y, x)`.
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.6: Loading Modules (`import`) & Automated Self-Checks (`assert`)](P.6-modules-and-automated-asserts.md)
- [Lesson P.9: Rearranging Physics Formulas & Linear Range Scaling](P.9-rearranging-formulas-and-scaling.md)

```mermaid
flowchart LR
    P9["P.9: Rearranging Formulas & Scaling"] --> P10["P.10: Radians & Right-Triangle Trig"]
    P10 --> P11["P.11: Reading Time-Series Graphs"]
```

---

## Learn

### Idea 1: Measuring angles in radians and rotational speed (`rad/s`)
- **Primary resource:** [MathsIsFun — Radians](https://www.mathsisfun.com/geometry/radians.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Radians`** and **`Radians and Degrees`**.
  - **What to skip:** Skip the bottom arc-area exercises once $\pi\text{ rad} = 180^\circ$ is clear.
  - **Key takeaway:** A **radian (`rad`)** is the natural angle unit where walking 1 radius around a circle sweeps out $1\text{ radian}$ ($\approx 57.3^\circ$). Because a full circle's circumference is $2\pi r$, one full revolution ($360^\circ$) is **$2\pi\text{ radians}$** ($\approx 6.283\text{ rad}$) and a half-turn ($180^\circ$) is **$\pi\text{ radians}$**. Consequently, converting motor speed from **Revolutions Per Minute (`RPM`)** into SI **radians per second (`rad/s`)** multiplies by $\frac{2\pi\text{ rad}}{60\text{ s}}$.
  - **Alternative resource:** [BetterExplained — Intuitive Guide to Angles, Degrees and Radians](https://betterexplained.com/articles/intuitive-guide-to-angles-degrees-and-radians/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Radians Rule, Degrees Drool`**, **`Radians: The Unselfish Choice`**, and **`Using Radians`**.

### Idea 2: Right-triangle trigonometry (`cos`, `sin`, `atan2`)
- **Primary resource:** [MathsIsFun — Sine, Cosine and Tangent](https://www.mathsisfun.com/sine-cosine-tangent.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Right Triangle`**, **`Sine, Cosine and Tangent`**, and **`Sohcahtoa`**.
  - **What to skip:** Skip **`Less Common Functions`** (secant, cosecant, cotangent).
  - **Key takeaway:** When a robot arm link of length $L$ (the **hypotenuse**) tilts upward by angle $\theta$ from the horizontal $x$-axis, its **horizontal reach** is $x = L\cos(\theta)$ and its **vertical height** is $y = L\sin(\theta)$. To go backward from target coordinates $(x, y)$ to joint angle $\theta$, always use **four-quadrant inverse tangent** `math.atan2(y, x)` (which takes `y` first, then `x`).
  - **Optional extra:** [PhET — Trig Tour Interactive Simulation](https://phet.colorado.edu/en/simulations/trig-tour) `[verify in-app]` — Drag the point around the circle with **`Radians`** selected `[verify in-app]` to watch $\cos\theta$ and $\sin\theta$ change live.

### Bridge Notes
Every programming language (`Python`, `C`, `C++`, `MATLAB`) expects angles inside `cos()` and `sin()` to be in **radians**, never degrees! A radian measures an angle by the distance walked around a unit circle of radius $r = 1$: walking halfway around the circle ($180^\circ$) covers $\pi \approx 3.1416\text{ radians}$, and walking a full turn ($360^\circ$) covers $2\pi \approx 6.2832\text{ radians}$. Use these two conversion rules constantly:
1. **Degrees $\leftrightarrow$ Radians:** $\text{rad} = \text{deg} \times \frac{\pi}{180}$ (`math.radians(deg)`), and $\text{deg} = \text{rad} \times \frac{180}{\pi}$ (`math.degrees(rad)`).
2. **`RPM` $\rightarrow$ `rad/s` (Angular Velocity $\omega$):** Motor datasheets list rotational speed in **Revolutions Per Minute (`RPM`)**, whereas physics equations need **radians per second (`rad/s`)**. Since $1\text{ rev} = 2\pi\text{ rad}$ and $1\text{ minute} = 60\text{ s}$:

$$
\omega_{\text{rad/s}} = \text{RPM} \times \frac{2\pi}{60}
$$

Across this entire roadmap, we measure a robot arm link's angle $\theta$ upward from the **horizontal $x$-axis** ($\theta = 0^\circ$ = horizontal pointing right; $\theta = 90^\circ = \pi/2\text{ rad}$ = pointing straight up):
- **Horizontal distance from pivot:** $x = L \cdot \cos(\theta)$
- **Vertical height above pivot:** $y = L \cdot \sin(\theta)$
- **Angle from target $(x, y)$:** $\theta = \text{atan2}(y, x)$ (`math.atan2(y, x)` in Python, which takes `y` first and safely handles $x = 0$ and all four quadrants).

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `rpm_to_rad_s` (`TODO 1`), `arm_tip_xy` (`TODO 2`), and `target_angle_deg` (`TODO 3`):

```python
import math


def rpm_to_rad_s(rpm):
    # TODO 1: Convert RPM to rad/s by multiplying rpm by ((2.0 * math.pi) / 60.0)
    return 0.0


def arm_tip_xy(length_m, angle_deg):
    # TODO 2: Convert angle_deg to radians using math.radians(angle_deg),
    #         then return [length_m * math.cos(rad), length_m * math.sin(rad)]
    return [0.0, 0.0]


def target_angle_deg(x_m, y_m):
    # TODO 3: Use math.atan2(y_m, x_m) (note: y_m first!) and convert to degrees with math.degrees(...)
    return 0.0


omega = rpm_to_rad_s(60.0)
tip = arm_tip_xy(0.20, 60.0)
ang = target_angle_deg(-0.10, 0.10)

print(f"60.0 RPM = {omega:.4f} rad/s")
print(f"Arm tip at 60 deg: x={tip[0]:.4f} m, y={tip[1]:.4f} m")
print(f"Angle to (-0.10, 0.10): {ang:.1f} deg")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
60.0 RPM = 6.2832 rad/s
Arm tip at 60 deg: x=0.1000 m, y=0.1732 m
Angle to (-0.10, 0.10): 135.0 deg
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

At `60.0 RPM` (1 revolution per second), `rpm_to_rad_s(60.0)` should return $2\pi \approx 6.2832\text{ rad/s}$. In `arm_tip_xy`, convert `rad = math.radians(angle_deg)` before calling `math.cos(rad)` and `math.sin(rad)`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def rpm_to_rad_s(rpm):
    return rpm * ((2.0 * math.pi) / 60.0)

def arm_tip_xy(length_m, angle_deg):
    rad = math.radians(angle_deg)
    return [length_m * math.cos(rad), length_m * math.sin(rad)]

def target_angle_deg(x_m, y_m):
    return math.degrees(math.atan2(y_m, x_m))
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
import math


def rpm_to_rad_s(rpm):
    return rpm * ((2.0 * math.pi) / 60.0)


def arm_tip_xy(length_m, angle_deg):
    rad = math.radians(angle_deg)
    return [length_m * math.cos(rad), length_m * math.sin(rad)]


def target_angle_deg(x_m, y_m):
    return math.degrees(math.atan2(y_m, x_m))


omega = rpm_to_rad_s(60.0)
tip = arm_tip_xy(0.20, 60.0)
ang = target_angle_deg(-0.10, 0.10)

assert round(omega, 4) == 6.2832
assert round(tip[0], 4) == 0.1000
assert round(tip[1], 4) == 0.1732
assert round(ang, 1) == 135.0

print(f"60.0 RPM = {omega:.4f} rad/s")
print(f"Arm tip at 60 deg: x={tip[0]:.4f} m, y={tip[1]:.4f} m")
print(f"Angle to (-0.10, 0.10): {ang:.1f} deg")
```
</details>

---

## Common mistakes & troubleshooting
- **Passing degrees directly into `math.cos(60)`:** `math.cos(60)` computes the cosine of `60 radians` (`-0.9524`), NOT $60^\circ$ (`+0.5`)! Always call `math.radians(deg)` first.
- **Swapping arguments in `math.atan2(y, x)`:** `atan2` takes vertical **`y` first** and horizontal **`x` second** (`math.atan2(y, x)`), because $\tan\theta = \frac{\text{opposite}}{\text{adjacent}} = \frac{y}{x}$.

---

## Check yourself

1. **Degrees to radians:** How many radians are in $360^\circ$, $180^\circ$, $90^\circ$, and $0^\circ$?
   <details>
   <summary><strong>Answer</strong></summary>

   $360^\circ = \mathbf{2\pi\text{ rad}}$ ($\approx 6.283$), $180^\circ = \mathbf{\pi\text{ rad}}$ ($\approx 3.142$), $90^\circ = \mathbf{\pi/2\text{ rad}}$ ($\approx 1.571$), and $0^\circ = \mathbf{0\text{ rad}}$.
   </details>

2. **`RPM` to `rad/s`:** A gearmotor shaft spins at $300\text{ RPM}$. How many revolutions per second is that, and what is its angular velocity $\omega$ in `rad/s`?
   <details>
   <summary><strong>Answer</strong></summary>

   $\frac{300}{60} = 5\text{ rev/s}$, so $\omega = 5 \times 2\pi = 10\pi \approx \mathbf{31.42\text{ rad/s}}$.
   </details>

3. **Horizontal reach at $0^\circ$ vs. $90^\circ$:** For a link of length $L = 0.25\text{ m}$ at angle $\theta$ from horizontal, what is the horizontal reach $x = L\cos\theta$ when $\theta = 0^\circ$ (horizontal) versus when $\theta = 90^\circ$ (straight up)?
   <details>
   <summary><strong>Answer</strong></summary>

   At $\theta = 0^\circ$, $\cos(0) = 1$, so horizontal reach is the full length $x = \mathbf{0.25\text{ m}}$. At $\theta = 90^\circ$, $\cos(90^\circ) = 0$, so horizontal reach is $\mathbf{0.0\text{ m}}$ (the tip is directly above the pivot).
   </details>

---

## Recap
- One full turn ($360^\circ$) is **$2\pi\text{ radians}$**, and rotational speed converts via $\omega_{\text{rad/s}} = \text{RPM} \times \frac{2\pi}{60}$.
- For a link of length $L$ at angle $\theta$ from the horizontal $x$-axis, $x = L\cos\theta$, $y = L\sin\theta$, and $\theta = \text{atan2}(y, x)$.

### You're ready to move on when...
- [ ] You always convert degrees to radians before calling `math.cos()` or `math.sin()`.
- [ ] You can convert `RPM` to `rad/s` and compute $(x, y) = (L\cos\theta, L\sin\theta)$.
- [ ] Your **Do it yourself** script passes all assertions.
- **Next lesson:** [Lesson P.11: Reading Time-Series Graphs — Slope & Area](P.11-reading-time-series-graphs.md)
