# Lesson P.7: Pushing & Spinning — Forces ($F = ma$), Lever Torque ($\tau = rF\sin\theta$) & Rotational Speed

## Goal
Calculate linear forces ($F = m \cdot a$) and gravitational weight ($W = m \cdot g$), compute the rotational **torque** ($\tau = r \cdot F \sin\theta$) required for a motor to hold up a robot arm link, and convert motor speed between `RPM` and `rad/s`.

- **New ideas (max 2):**
  1. **Force, mass, weight, and Newton's Second Law ($F_{\text{net}} = m \cdot a$)**: Distinguishing mass (`kg`) from gravitational weight force ($W = m \cdot g$ in Newtons `N`, where $g = 9.81\text{ m/s}^2$) and finding acceleration from net unbalanced force.
  2. **Torque ($\tau = r \cdot F \sin\theta$) and angular velocity ($\text{RPM}$ to $\text{rad/s}$)**: Calculating rotational twisting effort in Newton-meters ($\text{N}\cdot\text{m}$) at lever arm distance $r$ and converting revolutions per minute (`RPM`) into radians per second ($\omega = \text{RPM} \times \frac{2\pi}{60}$).
- **New syntax:** None (uses `math.sin()`, `math.radians()`, and `math.pi` from Lessons P.3 and P.5).
- **Estimated time (untimed guesses):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.5: Rearranging Formulas, Right-Triangle Trig & Radians](P.5-algebra-and-trigonometry-for-robotics.md)
- [Lesson P.6: Reading Time-Series Graphs — Slope & Area](P.6-reading-time-series-graphs.md)

```mermaid
flowchart LR
    P6["P.6: Reading Time-Series Graphs"] --> P7["P.7: Forces, Torque & Rotation"]
    P7 --> PM["P.M: Track P Milestone"]
```

---

## Learn

### Idea 1: Force, Mass, Weight, and Newton's Second Law ($F_{\text{net}} = m \cdot a$)
- **Primary resource:** [The Physics Classroom — Newton's Second Law](https://www.physicsclassroom.com/class/newtlaws/Lesson-3/Newton-s-Second-Law) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Newton's Second Law`**, **`The BIG Equation`**, and **`The Direction of the Net Force and Acceleration`**.
  - **What to skip:** Skip **`Rocket Science!`** at the bottom.
  - **Key takeaway:** **Mass** ($m$, in kilograms `kg`) measures how much matter an object contains (its inertia or resistance to speeding up), while **force** ($F$, in **Newtons** `N`, where $1\text{ N} = 1\text{ kg}\cdot\text{m/s}^2$) is a push or pull. Earth's gravity pulls downward on any mass $m$ with a **weight** force $W = m \cdot g$ ($g \approx 9.81\text{ m/s}^2$), and an object's acceleration equals the **net (unbalanced) force** divided by its mass: $a = \frac{F_{\text{net}}}{m}$.
  - **Alternative resource:** [MathsIsFun — Force](https://www.mathsisfun.com/physics/force.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Force`**, **`Balanced`**, **`Unbalanced`**, and **`Newtons`**.

### Idea 2: Torque ($\tau = r \cdot F \sin\theta$) and Angular Velocity ($\text{RPM}$ to $\text{rad/s}$)
- **Primary resource:** [Wikipedia — Torque](https://en.wikipedia.org/wiki/Torque) `[HTTP 200 — Verified by scripts/check_links.py]` & [HyperPhysics — Torque](http://hyperphysics.phy-astr.gsu.edu/hbase/torq.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** On HyperPhysics, read **`Torque = Force applied x lever arm`**. On Wikipedia, read exact headings **`Definition and relation to other physical quantities`**, **`Principle of moments`**, and **`Units`**.
  - **What to skip:** On Wikipedia, skip 3D vector cross-product determinant matrices and quantum angular momentum.
  - **Key takeaway:** **Torque** ($\tau$, Greek letter *tau*, measured in **Newton-meters** $\text{N}\cdot\text{m}$) is rotational twisting effort: pushing with force $F$ at distance $r$ from a hinge produces torque $\tau = r \cdot F \sin(\theta)$, where $\theta$ is the angle between the lever arm and the force. When a motor spins, its **angular velocity** $\omega$ (Greek letter *omega*, in $\text{rad/s}$) converts from **RPM** (revolutions per minute) by multiplying by $2\pi\text{ rad/rev}$ and dividing by $60\text{ s/min}$: $\omega = \text{RPM} \times \frac{2\pi}{60}$.
  - **Alternative resource:** [PhET — Balancing Act Interactive Simulation](https://phet.colorado.edu/en/simulations/balancing-act) `[HTTP 200 — SPA/App: verify in-app]` — Open **`Intro`** or **`Balance Lab`** `[verify in-app]` and place a $5\text{ kg}$ brick at $1.0\text{ m}$ vs. a $10\text{ kg}$ brick at $0.5\text{ m}$ to see equal and opposite torques balance.

### Bridge Notes
Never confuse **mass** ($m$ in `kg`) with **weight** ($W$ in Newtons `N`). A $0.5\text{ kg}$ robot payload has a downward gravitational weight force of $W = m \cdot g = 0.5\text{ kg} \times 9.81\text{ m/s}^2 = 4.905\text{ N}$ (about the weight of a half-liter water bottle). By **Newton's Second Law**, if a linear actuator pushes that $0.5\text{ kg}$ mass upward with $6.905\text{ N}$ of force against gravity's $4.905\text{ N}$ downward pull, the **net force** is $F_{\text{net}} = 6.905 - 4.905 = +2.0\text{ N}$, producing an upward acceleration $a = \frac{F_{\text{net}}}{m} = \frac{2.0}{0.5} = 4.0\text{ m/s}^2$.

For rotating joints, motors produce **torque** ($\tau$, in $\text{N}\cdot\text{m}$). If a robot arm link holds a payload of weight $F = m \cdot g$ at a **lever arm** distance $r$ (in meters) from the shoulder pivot, gravity pulls straight down. When the link is horizontal ($\theta = 90^\circ$ between the link and downward gravity), gravity torque is at its maximum: $\tau_{\text{grav}} = r \cdot m \cdot g \cdot \sin(90^\circ) = r \cdot m \cdot g$. When the link hangs straight down ($\theta = 0^\circ$), $\sin(0^\circ) = 0$, so $\tau_{\text{grav}} = 0\text{ N}\cdot\text{m}$. Finally, motor datasheets list speed in **RPM**, while physics equations require **angular velocity** $\omega$ in $\text{rad/s}$: $\omega = \text{RPM} \times \frac{2\pi}{60}$.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `gravity_torque_nm` (`TODO 1`) to calculate the torque needed to hold a mass $m$ at lever arm $r$ and angle $\theta$ from vertical, and `rpm_to_rad_s` (`TODO 2`) to convert motor RPM into radians per second:

```python
import math


def gravity_torque_nm(mass_kg, lever_m, angle_from_vertical_deg):
    # TODO 1: Calculate weight_n = mass_kg * 9.81,
    #         convert angle_from_vertical_deg to radians using math.radians(...),
    #         and return lever_m * weight_n * math.sin(rad)
    return 0.0


def rpm_to_rad_s(rpm):
    # TODO 2: Convert revolutions per minute (rpm) to radians per second (rad/s):
    #         rpm * (2.0 * math.pi / 60.0)
    return 0.0


tau_horiz = gravity_torque_nm(0.5, 0.20, 90.0)
tau_45 = gravity_torque_nm(0.5, 0.20, 45.0)
omega_60 = rpm_to_rad_s(60.0)

print(f"Holding torque at 90 deg (horizontal): {tau_horiz:.4f} N*m")
print(f"Holding torque at 45 deg: {tau_45:.4f} N*m")
print(f"60 RPM in rad/s: {omega_60:.4f} rad/s")
```

### Expected Output
When both `TODO`s are completed, running the script prints:

```text
Holding torque at 90 deg (horizontal): 0.9810 N*m
Holding torque at 45 deg: 0.6937 N*m
60 RPM in rad/s: 6.2832 rad/s
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `gravity_torque_nm`, first multiply `mass_kg * 9.81` to get the downward force in Newtons, convert `angle_from_vertical_deg` to radians with `math.radians(...)`, and multiply `lever_m * weight_n * math.sin(rad)`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

- In `gravity_torque_nm`:
  ```python
  weight_n = mass_kg * 9.81
  rad = math.radians(angle_from_vertical_deg)
  return lever_m * weight_n * math.sin(rad)
  ```
- In `rpm_to_rad_s`: `return rpm * ((2.0 * math.pi) / 60.0)`
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
import math


def gravity_torque_nm(mass_kg, lever_m, angle_from_vertical_deg):
    weight_n = mass_kg * 9.81
    rad = math.radians(angle_from_vertical_deg)
    return lever_m * weight_n * math.sin(rad)


def rpm_to_rad_s(rpm):
    return rpm * ((2.0 * math.pi) / 60.0)


tau_horiz = gravity_torque_nm(0.5, 0.20, 90.0)
tau_45 = gravity_torque_nm(0.5, 0.20, 45.0)
omega_60 = rpm_to_rad_s(60.0)

assert round(tau_horiz, 4) == 0.9810
assert round(tau_45, 4) == 0.6937
assert round(omega_60, 4) == 6.2832

print(f"Holding torque at 90 deg (horizontal): {tau_horiz:.4f} N*m")
print(f"Holding torque at 45 deg: {tau_45:.4f} N*m")
print(f"60 RPM in rad/s: {omega_60:.4f} rad/s")
```
</details>

---

## Common mistakes & troubleshooting
- **Using mass (`kg`) directly as force (`N`) without multiplying by $g = 9.81\text{ m/s}^2$:** If you compute torque as `0.5 kg * 0.20 m = 0.10`, your answer is in $\text{kg}\cdot\text{m}$ instead of $\text{N}\cdot\text{m}$ and is $9.81\times$ too small! Always multiply mass in `kg` by `9.81` to get force in Newtons (`N`).
- **Leaving lever arm length in centimeters (`cm`) or millimeters (`mm`):** A `20 cm` (`200 mm`) arm must be converted to `0.20 m` before computing torque in $\text{N}\cdot\text{m}$.
- **Dividing by $2\pi$ instead of multiplying in `RPM -> rad/s`:** One full revolution is $2\pi \approx 6.2832\text{ radians}$. At `60 RPM` (1 revolution per second), the shaft turns through $6.2832\text{ rad/s}$.

---

## Check yourself

1. **Net force and acceleration:** A vertical thrust fan pushes upward with $F_{\text{thrust}} = 15.0\text{ N}$ on a $1.0\text{ kg}$ drone ($W = m \cdot g = 9.81\text{ N}$ downward). What is the net upward force $F_{\text{net}}$, and what is the upward acceleration $a$?
   <details>
   <summary><strong>Answer</strong></summary>

   - $F_{\text{net}} = 15.0\text{ N} - 9.81\text{ N} = \mathbf{5.19\text{ N}}$ upward.
   - $a = \frac{F_{\text{net}}}{m} = \frac{5.19\text{ N}}{1.0\text{ kg}} = \mathbf{5.19\text{ m/s}^2}$.
   </details>

2. **Lever arm scaling:** You double the length of a horizontal robot arm link from $r = 0.15\text{ m}$ to $r = 0.30\text{ m}$ while holding the same $1.0\text{ kg}$ weight at the tip. What happens to the holding torque $\tau$ required at the shoulder motor?
   <details>
   <summary><strong>Answer</strong></summary>

   The required torque **doubles** from $\tau = 0.15 \times 9.81 = \mathbf{1.4715\text{ N}\cdot\text{m}}$ to $\tau = 0.30 \times 9.81 = \mathbf{2.9430\text{ N}\cdot\text{m}}$. Longer robot arms require proportionally stronger motors!
   </details>

3. **Converting RPM to rad/s:** A brushed DC gearmotor spins at `300 RPM`. How many revolutions per second (`rev/s`) is that, and what is its angular velocity $\omega$ in `rad/s`?
   <details>
   <summary><strong>Answer</strong></summary>

   - Revolutions per second: $300 \div 60 = \mathbf{5.0\text{ rev/s}}$.
   - Angular velocity: $\omega = 5.0 \times 2\pi \approx \mathbf{31.4159\text{ rad/s}}$.
   </details>

---

## Recap
- **Weight** is the downward gravitational force $W = m \cdot g$ ($g = 9.81\text{ m/s}^2$), and **Newton's Second Law** relates net force to acceleration via $F_{\text{net}} = m \cdot a$.
- **Torque** is rotational twisting effort $\tau = r \cdot F \sin(\theta)$ in $\text{N}\cdot\text{m}$.
- Convert motor speed from **RPM** to **radians per second** via $\omega = \text{RPM} \times \frac{2\pi}{60}$.

### You're ready to move on when...
- [ ] You always multiply mass (`kg`) by `9.81` to get weight force in Newtons (`N`).
- [ ] You can compute holding torque $\tau = r \cdot m \cdot g \sin\theta$ in $\text{N}\cdot\text{m}$ and convert `RPM` to `rad/s`.
- [ ] Your **Do it yourself** script passes all assertions.
- **Next lesson:** [Lesson P.M: Track P Milestone — Gravity-Holding Robot Arm Link Simulator](P.M-track-p-milestone.md)
