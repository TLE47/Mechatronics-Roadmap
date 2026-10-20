---
lesson_id: P.12
title: "Linear Forces (F = ma) and Lever Torque (tau = m*g*L*cos(theta))"
ideas:
  - "Linear force (F = ma) and gravitational weight (W = mg)"
  - "Lever torque from horizontal arm angle (tau = m*g*L*cos(theta))"
typical_hours: "1.5-2.0"
slow_learner_hours: "2.5-3.5"
---

# Lesson P.12: Linear Forces ($F = ma$) and Lever Torque ($\tau = mgL\cos\theta$)

<!-- run-callout:start -->
> **Run this in the workbench.** [Open MechaLab](https://tle47.github.io/Mechatronics-Roadmap/) → **Tab 2, Run Python Lessons** → search `P.12` and pick it from the list. The starter code, hints and graded check live there; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Calculate linear forces ($F = ma$) and gravitational weight ($W = mg$), and compute the **lever torque** ($\tau = F \cdot r_\perp = m g L \cos\theta$) required for a robot joint to hold a payload at any angle $\theta$ measured from the horizontal.

- **New ideas (max 2):**
  1. **Linear force ($F = ma$) and gravitational weight ($W = mg$)**: Distinguishing mass (`kg`) from downward gravitational force in Newtons (`N`, $W = m \cdot 9.81$), and relating net force to acceleration ($F_{\text{net}} = m \cdot a$).
  2. **Lever torque from horizontal arm angle ($\tau = mgL\cos\theta$)**: Computing rotational twisting effort in Newton-meters (`N·m`) as downward weight $W = mg$ times the **perpendicular horizontal lever arm** $r_\perp = L\cos\theta$.
- **New syntax:** None (uses `math.cos(math.radians(theta_deg))` from Lesson P.10).
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.10: Radians, Rotational Speed (`rad/s`) & Right-Triangle Trigonometry](P.10-radians-and-right-triangle-trig.md)
- [Lesson P.11: Reading Time-Series Graphs — Slope & Area](P.11-reading-time-series-graphs.md)

```mermaid
flowchart LR
    P11["P.11: Reading Time-Series Graphs"] --> P12["P.12: Forces & Lever Torque"]
    P12 --> PM["P.M: Track P Milestone"]
```

---

## Learn

### Idea 1: Linear force ($F = ma$) and gravitational weight ($W = mg$)
- **Primary resource:** [The Physics Classroom — Newton's Second Law](https://www.physicsclassroom.com/class/newtlaws/Lesson-3/Newton-s-Second-Law) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Newton's Second Law`** and **`The BIG Equation`** ($F_{\text{net}} = m \cdot a$).
  - **What to skip:** Skip the bottom multi-force free-body quiz table until you read the Bridge Notes below.
  - **Key takeaway:** **Mass** ($m$, in **kilograms `kg`**) measures how much matter an object contains. **Force** ($F$, in **Newtons `N`**) is a push or pull. **Newton's Second Law** states that net force equals mass times acceleration ($F_{\text{net}} = m \cdot a$). On Earth, gravity pulls every mass downward with acceleration $g = 9.81\text{ m/s}^2$, creating downward **weight** force $W = m \cdot g$ (so a $1.0\text{ kg}$ payload weighs $9.81\text{ N}$).
  - **Alternative resource:** [MathsIsFun — Force](https://www.mathsisfun.com/physics/force.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Force`**, **`Unbalanced`**, **`Newtons`**, and **`Calculations`**.

### Idea 2: Lever torque from horizontal arm angle ($\tau = mgL\cos\theta$)
- **Primary resource:** [HyperPhysics — Torque](http://hyperphysics.phy-astr.gsu.edu/hbase/torq.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact heading **`Torque = Force applied x lever arm`** (specifically the definition that the **lever arm** is the perpendicular distance from the pivot axis to the line of action of the force).
  - **What to skip:** Skip 3D vector cross-product determinant notation ($\vec{\tau} = \vec{r} \times \vec{F}$)—in 2D planar joints, perpendicular lever arm distance is all we need!
  - **Key takeaway:** **Torque** ($\tau$, Greek letter **tau**, measured in **Newton-meters `N·m`**) is rotational twisting effort around a pivot: $\tau = \text{Force} \times \text{Perpendicular Lever Arm}$. When a robot arm of length $L$ holds a payload of weight $W = mg$ at angle $\theta$ measured from the **horizontal** ($0^\circ$ = horizontal, $90^\circ$ = straight up), gravity pulls straight down vertically, so the **perpendicular lever arm** is the horizontal reach $r_\perp = L\cos\theta$ from Lesson P.10—giving $\tau_{\text{grav}} = m \cdot g \cdot L \cos\theta$!
  - **Optional extra:** [PhET — Torque Interactive Simulation](https://phet.colorado.edu/en/simulations/torque) `[verify in-app]` — Adjust the **Applied Force** and **Radius** sliders `[verify in-app]` to see torque scale with lever arm distance.

### Bridge Notes
We use **one consistent angle convention** for robot arm links everywhere in this roadmap:
- Arm angle $\theta$ is always measured upward from the **horizontal $x$-axis** ($\theta = 0^\circ$ when stretched out horizontally; $\theta = 90^\circ$ when pointing straight up).
- Gravity pulls a tip payload $m$ straight down with vertical weight force $W = m \cdot g$ ($g = 9.81\text{ m/s}^2$).
- By definition, the **lever arm ($r_\perp$)** is the perpendicular horizontal distance from the joint pivot to that vertical line of gravity force—which you already calculated in Lesson P.10 as the horizontal coordinate $x = L\cos\theta$!

Multiplying the downward weight $W = mg$ by the horizontal lever arm $r_\perp = L\cos\theta$ gives the gravity torque formula used across the entire roadmap:

$$
\tau_{\text{grav}} = W \cdot r_\perp = m \cdot g \cdot L \cdot \cos(\theta)
$$

Check the two physical extremes:
- **Horizontal ($\theta = 0^\circ$):** $\cos(0^\circ) = 1.0$, so $r_\perp = L$ and gravity torque is at its **maximum** ($\tau_{\text{grav}} = mgL$).
- **Straight up ($\theta = 90^\circ$):** $\cos(90^\circ) = 0.0$, so $r_\perp = 0$ (the weight sits directly over the pivot) and gravity torque is **$0.0\text{ N}\cdot\text{m}$**.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `weight_newtons` (`TODO 1`) and `gravity_torque_nm` (`TODO 2`) using $\tau = m \cdot g \cdot L \cdot \cos(\theta)$ where `angle_from_horiz_deg` is measured from the horizontal:

```python
import math


def weight_newtons(mass_kg):
    # TODO 1: Return downward gravitational force W = mass_kg * 9.81 (in Newtons)
    return 0.0


def gravity_torque_nm(mass_kg, length_m, angle_from_horiz_deg):
    # TODO 2:
    # 1. Compute w_n = weight_newtons(mass_kg)
    # 2. Compute perpendicular horizontal lever arm: r_perp_m = length_m * math.cos(math.radians(angle_from_horiz_deg))
    # 3. Return w_n * r_perp_m
    return 0.0


for angle_deg in [0.0, 60.0, 90.0]:
    tau = gravity_torque_nm(0.50, 0.30, angle_deg)
    print(f"Angle from horizontal = {angle_deg:4.1f} deg -> Gravity Torque = {tau:.4f} N*m")
```

### Expected Output
When `TODO 1` and `TODO 2` are completed, running the script prints:

```text
Angle from horizontal =  0.0 deg -> Gravity Torque = 1.4715 N*m
Angle from horizontal = 60.0 deg -> Gravity Torque = 0.7358 N*m
Angle from horizontal = 90.0 deg -> Gravity Torque = 0.0000 N*m
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, multiply `mass_kg * 9.81`. In `TODO 2`, convert `angle_from_horiz_deg` to radians with `math.radians(...)` before calling `math.cos(...)`, then multiply `weight_newtons(mass_kg) * length_m * math.cos(rad)`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def weight_newtons(mass_kg):
    return mass_kg * 9.81

def gravity_torque_nm(mass_kg, length_m, angle_from_horiz_deg):
    w_n = weight_newtons(mass_kg)
    r_perp_m = length_m * math.cos(math.radians(angle_from_horiz_deg))
    return w_n * r_perp_m
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
import math


def weight_newtons(mass_kg):
    return mass_kg * 9.81


def gravity_torque_nm(mass_kg, length_m, angle_from_horiz_deg):
    w_n = weight_newtons(mass_kg)
    r_perp_m = length_m * math.cos(math.radians(angle_from_horiz_deg))
    return w_n * r_perp_m


assert round(weight_newtons(0.50), 4) == 4.9050
assert round(gravity_torque_nm(0.50, 0.30, 0.0), 4) == 1.4715
assert round(gravity_torque_nm(0.50, 0.30, 60.0), 4) == 0.7358
assert round(gravity_torque_nm(0.50, 0.30, 90.0), 4) == 0.0000

for angle_deg in [0.0, 60.0, 90.0]:
    tau = gravity_torque_nm(0.50, 0.30, angle_deg)
    print(f"Angle from horizontal = {angle_deg:4.1f} deg -> Gravity Torque = {tau:.4f} N*m")
```
</details>

---

## Common mistakes & troubleshooting
- **Using mass `m` (`0.50 kg`) directly as force without multiplying by `g = 9.81 m/s²`:** Multiplying `0.50 kg * 0.30 m` gives `0.15 kg·m`, which is off by nearly $10\times$! Always multiply mass by `9.81` first to get force in Newtons (`N`).
- **Forgetting to convert link length from `mm` or `cm` to meters (`m`):** Torque is measured in **Newton-meters (`N·m`)**. A $30\text{ cm}$ ($300\text{ mm}$) link must be entered as `0.30` meters.

---

## Check yourself

1. **Mass vs. weight:** A robot gripper has a mass of $m = 0.20\text{ kg}$. What is its downward weight force $W$ in Newtons (`N`) on Earth ($g = 9.81\text{ m/s}^2$)?
   <details>
   <summary><strong>Answer</strong></summary>

   $W = 0.20\text{ kg} \times 9.81\text{ m/s}^2 = \mathbf{1.962\text{ N}}$.
   </details>

2. **Net force & acceleration:** A $2.0\text{ kg}$ wheeled robot is pushed forward by a $6.0\text{ N}$ wheel traction force while opposed by $1.0\text{ N}$ of rolling friction ($F_{\text{net}} = 6.0 - 1.0 = 5.0\text{ N}$). What is its forward acceleration $a = F_{\text{net}} / m$?
   <details>
   <summary><strong>Answer</strong></summary>

   $a = \frac{5.0\text{ N}}{2.0\text{ kg}} = \mathbf{2.5\text{ m/s}^2}$.
   </details>

3. **Horizontal vs. tilted torque:** Why does holding the $0.50\text{ kg}$ mass on a $0.30\text{ m}$ link at $\theta = 60^\circ$ above horizontal require exactly half the torque ($0.7358\text{ N}\cdot\text{m}$) of holding it at $\theta = 0^\circ$ horizontal ($1.4715\text{ N}\cdot\text{m}$)?
   <details>
   <summary><strong>Answer</strong></summary>

   Because at $\theta = 60^\circ$ above horizontal, the perpendicular horizontal lever arm shrinks to $r_\perp = L\cos(60^\circ) = 0.5 L$—half the horizontal reach means half the gravity torque!
   </details>

---

## Recap
- **Force** ($F = ma$) and **weight** ($W = mg$, with $g = 9.81\text{ m/s}^2$) are measured in **Newtons (`N`)**.
- Measuring arm angle $\theta$ from the **horizontal**, the perpendicular lever arm is $r_\perp = L\cos\theta$, so gravity torque is $\tau_{\text{grav}} = m g L \cos\theta$ (in **Newton-meters `N·m`**).

### You're ready to move on when...
- [ ] You always multiply mass (`kg`) by $9.81\text{ m/s}^2$ to get weight in Newtons (`N`).
- [ ] You can compute gravity holding torque $\tau = mgL\cos\theta$ at any angle $\theta$ from horizontal.
- [ ] Your **Do it yourself** script prints `1.4715 N*m`, `0.7358 N*m`, and `0.0000 N*m`.
- **Next lesson:** [Lesson P.14: Reading a Datasheet Table — Unit Columns, Min/Typ/Max & Safe Operating Bounds](P.14-reading-a-datasheet-table.md)
