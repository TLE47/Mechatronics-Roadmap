---
lesson_id: P.M
title: "Track P Milestone — Gravity-Holding Robot Arm Link Simulator"
ideas:
  - "End-to-end sense-compute-simulate loop"
typical_hours: "1.0-1.5"
slow_learner_hours: "2.0-2.5"
---

# Lesson P.M: Track P Milestone — Gravity-Holding Robot Arm Link Simulator

<!-- run-callout:start -->
> **Run this in the workbench.** [Open MechaLab on `P.M`](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.M) - Tab 2 opens with that entry selected, starter code, hints and graded check ready. This page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Combine everything from Track P (variables, clamping, loops, functions, `assert`, metric conversions, 10-bit scaling, radians, time-series area integration, and $\tau = mgL\cos\theta$ gravity torque) into a self-testing Python simulation of a single-joint robot arm lifting a payload against gravity.

- **New ideas (max 2):**
  1. **End-to-end sense-compute-simulate loop**: Connecting a 10-bit digital command (`0..1023`), linear torque scaling, horizontal-angle gravity torque ($\tau_{\text{grav}} = mgL\cos\theta$), and discrete time-stepping (`angle = angle + omega * dt`) in one script.
- **New syntax:** None (integrates Lessons P.1 through P.14).
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–2.5 hours

---

## Prerequisites
- All Track P lessons: [P.1](P.1-variables-and-data-types.md)–[P.12](P.12-forces-and-lever-torque.md) and [P.14](P.14-reading-a-datasheet-table.md).

```mermaid
flowchart LR
    P12["P.12: Forces & Lever Torque"] --> P14["P.14: Reading a Datasheet Table"]
    P14 --> PM["P.M: Track P Milestone"]
    PM --> S00["Stage 0 (S0.0): Why Electricity Is Like Flow"]
```

---

## Learn

### Idea 1: End-to-end sense-compute-simulate loop
- **Primary resource:** [The Physics Classroom — Determining the Area on a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Determining-the-Area-on-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Review exact heading **`Calculating the Area of a Rectangle`**.
  - **What to skip:** No new external chapters required—this milestone synthesizes the ideas you already practiced in Lessons P.1–P.12.
  - **Key takeaway:** A physical simulation is a loop that repeats three simple steps at every time slice $\Delta t$: (1) convert commands and geometry into base SI units (`m`, `kg`, `s`, `rad`, `N·m`), (2) compare motor torque against gravity torque $\tau_{\text{grav}} = mgL\cos\theta$, and (3) advance angle and tip $(x, y) = (L\cos\theta, L\sin\theta)$ over $\Delta t$.
  - **Alternative resource:** [HyperPhysics — Torque](http://hyperphysics.phy-astr.gsu.edu/hbase/torq.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Review exact heading **`Torque = Force applied x lever arm`**.

### Bridge Notes
Congratulations on reaching the **Track P Milestone**! Before moving on to electronics and microcontrollers in Stage 0, you will build a complete **end-to-end sense-compute-simulate loop** in Python to prove you can read, write, and debug every prerequisite concept without guessing.

Here is the physical system you are modeling using our consistent horizontal-angle convention:
- A single robot arm link has length $L = 250\text{ mm}$ ($0.25\text{ m}$) and carries a tip mass $m = 0.40\text{ kg}$ ($g = 9.81\text{ m/s}^2$).
- When the link sits at angle $\theta$ measured upward from the horizontal $x$-axis ($0^\circ$ = horizontal, $90^\circ$ = straight up), the perpendicular horizontal lever arm distance from the pivot to the vertical line of gravity force is $r_\perp = L\cos(\theta)$, so downward gravity pulls with opposing torque $\tau_{\text{grav}} = m \cdot g \cdot L \cdot \cos(\theta)$.
- A 10-bit digital command `cmd_10bit` (`0` to `1023`) commands motor torque linearly from $0.0\text{ N}\cdot\text{m}$ up to $\tau_{\max} = 2.0\text{ N}\cdot\text{m}$.
- You will first check whether a given command can hold the arm up against gravity at $\theta = 0^\circ$ (horizontal), and then step the arm upward at constant angular speed $\omega = 30\text{ RPM}$ over 3 steps of $\Delta t = 100\text{ ms}$ ($0.10\text{ s}$).

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this milestone requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `TODO 1`, `TODO 2`, `TODO 3`, and `TODO 4` so the milestone script converts units, scales the 10-bit command, computes horizontal-angle gravity torque $\tau_{\text{grav}} = m \cdot g \cdot L \cdot \cos(\theta)$, and steps the arm angle forward over 3 ticks of `100 ms`:

```python
import math


def cmd10_to_torque(cmd_10bit, max_torque_nm):
    # TODO 1: Clamp cmd_10bit into [0, 1023], then scale linearly to [0.0, max_torque_nm]:
    #         (clamped_cmd / 1023.0) * max_torque_nm
    return 0.0


def holding_torque_nm(length_m, mass_kg, angle_from_horiz_rad):
    # TODO 2: Gravity pulls straight down on the perpendicular horizontal lever arm (length_m * cos(angle)).
    #         Return (mass_kg * 9.81) * length_m * math.cos(angle_from_horiz_rad)
    return 0.0


# Arm parameters (convert 250 mm and 100 ms to base SI units!)
# TODO 3: Convert 250.0 mm to meters (length_m) and 100.0 ms to seconds (dt_s),
#         and convert 30.0 RPM to rad/s: omega_rad_s = 30.0 * ((2.0 * math.pi) / 60.0)
length_m = 0.0
dt_s = 0.0
omega_rad_s = 0.0
mass_kg = 0.40

motor_tau = cmd10_to_torque(767.25, 2.0)
grav_tau_0 = holding_torque_nm(length_m, mass_kg, 0.0)
can_lift = motor_tau > grav_tau_0
print(f"Motor torque: {motor_tau:.2f} N*m | Gravity at 0 deg: {grav_tau_0:.4f} N*m | Can lift: {can_lift}")

angle_rad = 0.0
for step in range(3):
    # TODO 4: Advance angle_rad by (omega_rad_s * dt_s) using rectangle-area accumulation
    angle_rad = angle_rad
    tip_x = length_m * math.cos(angle_rad)
    tip_y = length_m * math.sin(angle_rad)
    tau_g = holding_torque_nm(length_m, mass_kg, angle_rad)
    print(f"Step {step}: angle={math.degrees(angle_rad):.1f} deg | tip=({tip_x:.4f}, {tip_y:.4f}) m | tau_g={tau_g:.4f} N*m")
```

### Expected Output
When `TODO 1` through `TODO 4` are completed, running the script prints:

```text
Motor torque: 1.50 N*m | Gravity at 0 deg: 0.9810 N*m | Can lift: True
Step 0: angle=18.0 deg | tip=(0.2378, 0.0773) m | tau_g=0.9330 N*m
Step 1: angle=36.0 deg | tip=(0.2023, 0.1469) m | tau_g=0.7936 N*m
Step 2: angle=54.0 deg | tip=(0.1469, 0.2023) m | tau_g=0.5766 N*m
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

For `TODO 1`, use an `if / elif` block to clamp `cmd_10bit` between `0` and `1023`, then return `(cmd_10bit / 1023.0) * max_torque_nm`. For `TODO 3`, `250.0 mm / 1000.0` is `0.25 m`, and `100.0 ms / 1000.0` is `0.10 s`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

Check your `TODO 3` and `TODO 4` lines:
```python
length_m = 250.0 / 1000.0
dt_s = 100.0 / 1000.0
omega_rad_s = 30.0 * ((2.0 * math.pi) / 60.0)
```
And inside the `for` loop (`TODO 4`):
```python
angle_rad = angle_rad + (omega_rad_s * dt_s)
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
import math


def cmd10_to_torque(cmd_10bit, max_torque_nm):
    if cmd_10bit < 0:
        cmd_10bit = 0
    elif cmd_10bit > 1023:
        cmd_10bit = 1023
    return (cmd_10bit / 1023.0) * max_torque_nm


def holding_torque_nm(length_m, mass_kg, angle_from_horiz_rad):
    return (mass_kg * 9.81) * length_m * math.cos(angle_from_horiz_rad)


length_m = 250.0 / 1000.0
dt_s = 100.0 / 1000.0
omega_rad_s = 30.0 * ((2.0 * math.pi) / 60.0)
mass_kg = 0.40

motor_tau = cmd10_to_torque(767.25, 2.0)
grav_tau_0 = holding_torque_nm(length_m, mass_kg, 0.0)
can_lift = motor_tau > grav_tau_0
assert round(motor_tau, 2) == 1.50
assert round(grav_tau_0, 4) == 0.9810
assert can_lift is True
print(f"Motor torque: {motor_tau:.2f} N*m | Gravity at 0 deg: {grav_tau_0:.4f} N*m | Can lift: {can_lift}")

angle_rad = 0.0
for step in range(3):
    angle_rad = angle_rad + (omega_rad_s * dt_s)
    tip_x = length_m * math.cos(angle_rad)
    tip_y = length_m * math.sin(angle_rad)
    tau_g = holding_torque_nm(length_m, mass_kg, angle_rad)
    print(f"Step {step}: angle={math.degrees(angle_rad):.1f} deg | tip=({tip_x:.4f}, {tip_y:.4f}) m | tau_g={tau_g:.4f} N*m")

assert round(math.degrees(angle_rad), 1) == 54.0
```
</details>

---

## Common mistakes & troubleshooting
- **Forgetting to convert `250.0 mm` to `0.25 m` or `100.0 ms` to `0.10 s`:** Leaving `length_m = 250.0` multiplies torque by $1{,}000\times$ (`981.0 N*m`), and leaving `dt_s = 100.0` spins the arm by $18{,}000^\circ$ per step!
- **Passing degrees into `holding_torque_nm`:** Because `angle_rad` is already in radians inside the loop, pass `angle_rad` directly to `math.cos(angle_rad)` and only call `math.degrees(angle_rad)` inside `print()`.

---

## Check yourself

1. **Interpreting the simulation output:** Why does `tau_g` decrease from `0.9810 N*m` at `0 deg` down to `0.5766 N*m` at `54.0 deg` as the arm lifts upward?
   <details>
   <summary><strong>Answer</strong></summary>

   As the arm rotates upward toward vertical (`90 deg`), the tip mass moves closer horizontally to the shoulder pivot (the perpendicular horizontal lever arm $x = L\cos\theta$ shrinks from `0.2500 m` down to `0.1469 m`). Shorter perpendicular lever arm distance means gravity has less leverage!
   </details>

2. **Minimum 10-bit command to hold horizontal:** Since gravity torque at `0 deg` is `0.9810 N*m` and full scale (`1023`) produces `2.0 N*m`, what is the smallest integer `cmd_10bit` (`0..1023`) that produces at least `0.9810 N*m`?
   <details>
   <summary><strong>Answer</strong></summary>

   Rearranging $\tau = \frac{\text{cmd}}{1023} \times 2.0 \ge 0.9810$ gives $\text{cmd} \ge \frac{0.9810}{2.0} \times 1023 = 501.78$. Rounding up to the next whole integer gives **`502`** (which produces $\frac{502}{1023} \times 2.0 \approx 0.9814\text{ N}\cdot\text{m}$).
   </details>

3. **Angular displacement check:** At `30 RPM` ($0.5\text{ rev/s} = 180^\circ\text{/s}$), how many degrees should the arm turn in each `0.10 s` (`100 ms`) step? Does that match `Step 0: 18.0 deg`, `Step 1: 36.0 deg`, `Step 2: 54.0 deg`?
   <details>
   <summary><strong>Answer</strong></summary>

   $180^\circ\text{/s} \times 0.10\text{ s} = \mathbf{18.0^\circ\text{ per step}}$, which matches `18.0 -> 36.0 -> 54.0 deg`!
   </details>

---

## Recap
- You combined Python variables, functions, `if/elif` clamping, `for` loops, metric conversions, 10-bit scaling, radians trigonometry, time-step integration, and horizontal-angle gravity torque ($\tau = mgL\cos\theta$) into a working robot arm simulation.

### You're done with Track P when...
- [ ] Your milestone script prints the exact 4 expected lines and passes all `assert` checks.
- [ ] You can explain every single line of the milestone solution in plain English without looking anything up.
- **Next lesson:** [Stage 0 (Lesson S0.0): Why Electricity Is Like Water Flow — Effort, Flow & Pipe Constriction](../stage-0/S0.0-why-electricity-is-like-flow.md)
