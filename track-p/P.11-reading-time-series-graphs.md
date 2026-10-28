---
lesson_id: P.11
title: "Reading Time-Series Graphs — Slope and Area"
ideas:
  - "Graph slope as rate of change"
  - "Area under a curve as accumulated change"
typical_hours: "1.5-2.0"
slow_learner_hours: "2.5-3.5"
---

# Lesson P.11: Reading Time-Series Graphs — Slope and Area

<!-- run-callout:start -->
> **Step 1 of 10 · Python and the maths a robot needs**
>
> **Run this in the workbench.** [Open MechaLab with `P.11` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.11) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Read position-vs-time and velocity-vs-time telemetry plots by connecting **slope** ($\Delta y / \Delta t$) to rate of change (velocity and acceleration) and **rectangle area** ($v \cdot \Delta t$) to accumulated displacement.

- **New ideas (max 2):**
  1. **Graph slope as rate of change**: Computing $\text{slope} = \frac{y_{\text{now}} - y_{\text{prev}}}{\Delta t}$ to find velocity from a position graph or acceleration from a velocity graph.
  2. **Area under a curve as accumulated change**: Multiplying height by time step ($v \cdot \Delta t$) to accumulate change in position (`pos = pos + vel * dt`).
- **New syntax:** None (uses Python `for` loops and functions from Lessons P.4 and P.5).
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.4: Ordered Lists & Repeating Actions with `for` Loops](P.4-lists-and-for-loops.md)
- [Lesson P.5: Reusable Functions (`def`/`return`) & `while` Loops](P.5-functions-and-while-loops.md)

```mermaid
flowchart LR
    P10["P.10: Radians & Right-Triangle Trig"] --> P11["P.11: Reading Time-Series Graphs"]
    P11 --> P12["P.12: Forces & Lever Torque"]
```

---

## Learn

<!-- figure: slope-is-velocity | Slope is a derivative and area is an integral: the same graph answers both questions, and the tangent is where you read one from the other. -->

### Idea 1: Graph slope as rate of change
- **Primary resource:** [The Physics Classroom — Meaning of Slope for a p-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-3/Meaning-of-Slope-for-a-p-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact heading **`Meaning of Slope for a p-t Graph`**.
  - **What to skip:** Skip the bottom "Check Your Understanding" widgets if the rise-over-run example is clear.
  - **Key takeaway:** On any **time-series graph** (where horizontal axis = time $t$), the **slope** ($\frac{\text{rise}}{\text{run}} = \frac{\Delta y}{\Delta t}$) is the **rate of change** of the vertical quantity. On a position-vs-time graph, slope is **velocity** ($v = \frac{x_{\text{now}} - x_{\text{prev}}}{\Delta t}$); on a velocity-vs-time graph, slope is **acceleration** ($a = \frac{v_{\text{now}} - v_{\text{prev}}}{\Delta t}$).
  - **Alternative resource:** [The Physics Classroom — Determining the Slope on a p-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-3/Determining-the-Slope-on-a-p-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact heading **`Using the Slope Equation`**.

### Idea 2: Area under a curve as accumulated change
- **Primary resource:** [The Physics Classroom — Determining the Area on a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Determining-the-Area-on-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Determining the Area on a v-t Graph`** and **`Calculating the Area of a Rectangle`**.
  - **What to skip:** Skip **`Calculating the Area of a Triangle`** and trapezoid exercises (in computer simulations with small time step $\Delta t$, each step is a narrow rectangle `vel * dt`).
  - **Key takeaway:** On a velocity-vs-time graph, the **area** of a rectangle slice of height $v$ and width $\Delta t$ equals the **displacement** (change in position $\Delta x = v \cdot \Delta t$) during that slice. Adding up those rectangles in a loop (`pos = pos + vel * dt`) is how every physics simulator advances position over time!
  - **Alternative resource:** [The Physics Classroom — Meaning of Shape for a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Meaning-of-Shape-for-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`The Importance of Slope`** and **`Positive Velocity versus Negative Velocity`**.

### Bridge Notes
Every telemetry plot in robotics puts **time ($t$, in seconds)** on the horizontal axis. You can read any time-series plot using just two geometric ideas—**slope** and **rectangle area**:

1. **Slope = Rate of Change (Dividing by $\Delta t$):**
   - Between two sensor samples separated by time step $\Delta t$, the change is $\Delta x = x_{\text{now}} - x_{\text{prev}}$ (where the triangle symbol $\Delta$, capital Greek **Delta**, simply means *"change in"*).
   - **Velocity** is the slope of position: `vel = (pos_now - pos_prev) / dt_s`.
   - **Acceleration** is the slope of velocity: `acc = (vel_now - vel_prev) / dt_s`.
   - A flat horizontal line has slope `0` (stationary on a position graph; constant speed on a velocity graph). A downward-sloping line has a **negative** rate of change.

2. **Rectangle Area = Accumulation (Multiplying by $\Delta t$):**
   - Over one short time step $\Delta t$, a robot moving at velocity $v$ covers distance $\Delta x = v \cdot \Delta t$—the exact area ($\text{height} \times \text{width}$) of that slice under the velocity graph!
   - Adding each slice in a loop (`pos = pos + vel * dt_s`) accumulates total position.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `slope_velocity` (`TODO 1`) and `accumulate_positions` (`TODO 2`) to compute velocity from two position readings and accumulate position across 5 velocity steps of $\Delta t = 0.5\text{ s}$:

```python
def slope_velocity(pos_prev_m, pos_now_m, dt_s):
    # TODO 1: Return the slope — how far it moved, over how long it took
    return 0.0


def accumulate_positions(velocities_m_s, dt_s):
    pos_m = 0.0
    history = []
    for v in velocities_m_s:
        # TODO 2: Add this step's rectangle — the speed times the step — to the
        #         running position, then append the rounded value to the history.
        history.append(round(pos_m, 2))
    return history


v_est = slope_velocity(1.20, 2.20, 0.5)
pos_trace = accumulate_positions([2.0, 2.0, 4.0, 0.0, -2.0], 0.5)

print(f"Estimated velocity: {v_est:.1f} m/s")
print(f"Position trace: {pos_trace} | Final pos: {pos_trace[4]:.2f} m")
```

### Expected Output
When `TODO 1` and `TODO 2` are completed, running the script prints:

```text
Estimated velocity: 2.0 m/s
Position trace: [1.0, 2.0, 4.0, 4.0, 3.0] | Final pos: 3.00 m
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, subtract `pos_now_m - pos_prev_m` in parentheses before dividing by `dt_s`. In `TODO 2`, update `pos_m = pos_m + (v * dt_s)` before calling `history.append(round(pos_m, 2))`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def slope_velocity(pos_prev_m, pos_now_m, dt_s):
    return (pos_now_m - pos_prev_m) / dt_s

def accumulate_positions(velocities_m_s, dt_s):
    pos_m = 0.0
    history = []
    for v in velocities_m_s:
        pos_m = pos_m + (v * dt_s)
        history.append(round(pos_m, 2))
    return history
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def slope_velocity(pos_prev_m, pos_now_m, dt_s):
    return (pos_now_m - pos_prev_m) / dt_s


def accumulate_positions(velocities_m_s, dt_s):
    pos_m = 0.0
    history = []
    for v in velocities_m_s:
        pos_m = pos_m + (v * dt_s)
        history.append(round(pos_m, 2))
    return history


v_est = slope_velocity(1.20, 2.20, 0.5)
pos_trace = accumulate_positions([2.0, 2.0, 4.0, 0.0, -2.0], 0.5)

assert round(v_est, 1) == 2.0
assert pos_trace == [1.0, 2.0, 4.0, 4.0, 3.0]

print(f"Estimated velocity: {v_est:.1f} m/s")
print(f"Position trace: {pos_trace} | Final pos: {pos_trace[4]:.2f} m")
```
</details>

---

## Common mistakes & troubleshooting
- **Subtracting `pos_prev - pos_now` (backward sign):** Rate of change is always `new_value - old_value` divided by `dt_s`. Reversing the subtraction flips the sign of velocity!
- **Forgetting to multiply by `dt_s` when accumulating area:** Writing `pos_m = pos_m + v` pretends $\Delta t = 1.0\text{ s}$. Always multiply height `v` by width `dt_s`: `pos_m = pos_m + (v * dt_s)`.

---

## Check yourself

1. **Slope from a position graph:** At $t = 1.0\text{ s}$, a robot is at $x = 0.20\text{ m}$. At $t = 3.0\text{ s}$, it is at $x = 1.40\text{ m}$. What is its velocity (slope) in `m/s`?
   <details>
   <summary><strong>Answer</strong></summary>

   $v = \frac{1.40 - 0.20}{3.0 - 1.0} = \frac{1.20\text{ m}}{2.0\text{ s}} = \mathbf{0.60\text{ m/s}}$.
   </details>

2. **Signed area under a velocity graph:** If a wheel moves backward at $v = -0.50\text{ m/s}$ for $\Delta t = 0.4\text{ s}$, what is its change in position $\Delta x$?
   <details>
   <summary><strong>Answer</strong></summary>

   $\Delta x = (-0.50\text{ m/s}) \times 0.4\text{ s} = \mathbf{-0.20\text{ m}}$ ($20\text{ cm}$ backward).
   </details>

3. **Acceleration as the slope of velocity:** A motor's speed drops from $1.60\text{ m/s}$ at $t = 2.0\text{ s}$ to $0.0\text{ m/s}$ at $t = 2.5\text{ s}$. What is its acceleration $a$ in $\text{m/s}^2$?
   <details>
   <summary><strong>Answer</strong></summary>

   $a = \frac{0.0 - 1.60}{2.5 - 2.0} = \frac{-1.60}{0.5} = \mathbf{-3.20\text{ m/s}^2}$ (braking deceleration).
   </details>

---

## Recap
- **Slope** ($\Delta y / \Delta t$) measures rate of change: slope of position is **velocity**, and slope of velocity is **acceleration**.
- **Rectangle area** ($v \cdot \Delta t$) under a velocity graph measures **change in position** (`pos = pos + vel * dt_s`).

### You're ready to move on when...
- [ ] You can compute velocity from two points on a position-vs-time graph.
- [ ] You can accumulate position from a list of velocities and a time step `dt_s`.
- [ ] Your **Do it yourself** script prints `Position trace: [1.0, 2.0, 4.0, 4.0, 3.0]`.

<!-- next-step:start -->
👉 **Next:** [Step 1 · Python and the maths a robot needs — Lesson P.12: Linear Forces (F = ma) and Lever Torque (tau = m*g*L*cos(theta))](P.12-forces-and-lever-torque.md)
<!-- next-step:end -->
