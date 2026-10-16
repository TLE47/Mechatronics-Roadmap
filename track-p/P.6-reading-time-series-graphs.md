# Lesson P.6: Reading Time-Series Graphs — Slope (Rate of Change) & Area (Accumulation)

## Goal
Read position-vs-time and velocity-vs-time telemetry plots by connecting **slope** ($\text{rise}/\text{run}$) to rate of change (velocity and acceleration) and **rectangle area** ($\text{height} \times \text{width}$) to accumulated change over a time step $\Delta t$.

- **New ideas (max 2):**
  1. **Graph slope as rate of change ($\Delta y / \Delta t$)**: Why the steepness (slope) of a position-vs-time graph equals **velocity** ($v = \Delta x / \Delta t$), and the slope of a velocity-vs-time graph equals **acceleration** ($a = \Delta v / \Delta t$).
  2. **Area under a curve as accumulation ($v \cdot \Delta t$)**: Why the rectangular area under a velocity-vs-time graph over a small time step $\Delta t$ equals the **change in position** ($\Delta x = v \cdot \Delta t$), which is how every computer simulation steps forward in time.
- **New syntax:** Finite-difference slope `(pos_now - pos_prev) / dt_s` and discrete Euler integration `pos_m = pos_m + (vel_m_s * dt_s)`.
- **Estimated time (untimed guesses):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.2: Decisions (`if/else`), `for` Loops & Lists](P.2-decisions-loops-and-lists.md)
- [Lesson P.4: SI Units, Metric Prefixes, Binary Bits & Frequency (`Hz`)](P.4-units-prefixes-binary-and-frequency.md)

```mermaid
flowchart LR
    P5["P.5: Algebra, Trig & Radians"] --> P6["P.6: Reading Time-Series Graphs"]
    P6 --> P7["P.7: Forces, Torque & Rotation"]
```

---

## Learn

### Idea 1: Graph Slope as Rate of Change ($\Delta y / \Delta t$)
- **Primary resource:** [The Physics Classroom — Meaning of Slope for a p-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-3/Meaning-of-Slope-for-a-p-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]` & [Determining the Slope on a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Determining-the-Slope-on-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact heading **`Meaning of Slope for a p-t Graph`** on the Lesson 3 page, and read exact headings **`Determining the Slope on a v-t Graph`** and **`Using the Slope Equation`** on the Lesson 4 page.
  - **What to skip:** Skip the bottom navigation links to free-fall lessons.
  - **Key takeaway:** On any **time-series graph** (where horizontal axis is time $t$), the **slope** ($\frac{\text{rise}}{\text{run}} = \frac{\text{change in vertical axis}}{\text{change in time}}$) tells you how fast the vertical quantity is changing. A flat horizontal line on a position graph means slope $= 0$ (stopped), an upward-sloping line means positive **velocity**, and the slope of a velocity-vs-time graph equals **acceleration** ($\text{m/s}^2$).
  - **Alternative resource:** [The Physics Classroom — Meaning of Shape for a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Meaning-of-Shape-for-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Constant Velocity versus Changing Velocity`**, **`The Importance of Slope`**, and **`Positive Velocity versus Negative Velocity`**.

### Idea 2: Area Under a Time Graph as Accumulation ($v \cdot \Delta t$)
- **Primary resource:** [The Physics Classroom — Determining the Area on a v-t Graph](https://www.physicsclassroom.com/class/1DKin/Lesson-4/Determining-the-Area-on-a-v-t-Graph) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Determining the Area on a v-t Graph`** and **`Calculating the Area of a Rectangle`**.
  - **What to skip:** You may skim **`Calculating the Area of a Trapezoid`** (in code, we slice time into tiny rectangles of width $\Delta t$).
  - **Key takeaway:** On a velocity-vs-time graph, the **shaded area** between the velocity line and the time axis over a time interval $\Delta t$ equals the **displacement** (change in position, $\Delta x = \text{height} \times \text{width} = v \cdot \Delta t$). Adding up these tiny rectangular areas step by step (`pos = pos + vel * dt`) is how digital twins and PID controllers accumulate motion over time.
  - **Alternative resource:** [PhET — The Moving Man Interactive Simulation](https://phet.colorado.edu/en/simulations/moving-man) `[HTTP 200 — SPA/App: verify in-app]` — Open the **`Charts`** tab `[verify in-app]` and drag the person to watch Position, Velocity, and Acceleration graphs plot simultaneously.

### Bridge Notes
Every oscilloscope screen, Serial Plotter window, and control-loop log in this roadmap is a **time-series graph**: time $t$ (in seconds) runs along the horizontal axis, and a signal like position $x$ or velocity $v$ is plotted on the vertical axis. Mathematicians use the Greek capital letter delta ($\Delta$) as shorthand for **"change in"** ($\text{new value} - \text{old value}$), so a **time step** is written $\Delta t = t_{\text{now}} - t_{\text{prev}}$ (`dt_s` in code).

Two visual operations unlock every control theory concept later in the roadmap:
1. **Slope (Rate of Change / Derivative):** Dividing the change in position $\Delta x$ by the time step $\Delta t$ gives average **velocity** $v = \frac{\Delta x}{\Delta t}$ (in $\text{m/s}$). Dividing the change in velocity $\Delta v$ by $\Delta t$ gives average **acceleration** $a = \frac{\Delta v}{\Delta t}$ (in $\text{m/s}^2$, or "meters per second, per second").
2. **Area (Accumulation / Integral):** Multiplying velocity $v$ (rectangle height) by time step $\Delta t$ (rectangle width) gives the distance traveled during that slice: $\Delta x = v \cdot \Delta t$. Adding that slice at every tick (`pos_m = pos_m + vel_m_s * dt_s`) accumulates total position!

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `estimate_velocity_slope` (`TODO 1`) to calculate velocity from two position readings (`rise / run`), and complete the rectangle-area accumulation loop (`TODO 2`) to integrate a velocity profile over 4 time steps of `dt_s = 0.5 s`:

```python
def estimate_velocity_slope(pos_prev_m, pos_now_m, dt_s):
    # TODO 1: Return the slope (change in position divided by dt_s):
    #         (pos_now_m - pos_prev_m) / dt_s
    return 0.0


# Given a velocity-vs-time profile sampled every dt_s = 0.5 seconds:
velocities_m_s = [2.0, 2.0, 4.0, 0.0]
dt_s = 0.5
pos_m = 0.0

for i in range(len(velocities_m_s)):
    v = velocities_m_s[i]
    # TODO 2: Calculate the rectangle area slice (delta_x = v * dt_s)
    #         and add it to pos_m.
    delta_x = 0.0
    pos_m = pos_m + delta_x
    print(f"Step {i}: v={v:.1f} m/s | slice_area={delta_x:.2f} m | total_pos={pos_m:.2f} m")

v_est = estimate_velocity_slope(1.0, 2.0, 0.5)
print(f"Slope check (1.0 m to 2.0 m in 0.5 s): {v_est:.1f} m/s")
```

### Expected Output
When both `TODO`s are completed, running the script prints:

```text
Step 0: v=2.0 m/s | slice_area=1.00 m | total_pos=1.00 m
Step 1: v=2.0 m/s | slice_area=1.00 m | total_pos=2.00 m
Step 2: v=4.0 m/s | slice_area=2.00 m | total_pos=4.00 m
Step 3: v=0.0 m/s | slice_area=0.00 m | total_pos=4.00 m
Slope check (1.0 m to 2.0 m in 0.5 s): 2.0 m/s
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, wrap `pos_now_m - pos_prev_m` in parentheses before dividing by `dt_s`. In `TODO 2`, the area of one time-step rectangle is height (`v`) times width (`dt_s`).
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

- In `estimate_velocity_slope`: `return (pos_now_m - pos_prev_m) / dt_s`
- Inside the `for` loop:
  ```python
  delta_x = v * dt_s
  pos_m = pos_m + delta_x
  ```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def estimate_velocity_slope(pos_prev_m, pos_now_m, dt_s):
    return (pos_now_m - pos_prev_m) / dt_s


velocities_m_s = [2.0, 2.0, 4.0, 0.0]
dt_s = 0.5
pos_m = 0.0

for i in range(len(velocities_m_s)):
    v = velocities_m_s[i]
    delta_x = v * dt_s
    pos_m = pos_m + delta_x
    print(f"Step {i}: v={v:.1f} m/s | slice_area={delta_x:.2f} m | total_pos={pos_m:.2f} m")

v_est = estimate_velocity_slope(1.0, 2.0, 0.5)
assert pos_m == 4.0
assert v_est == 2.0
print(f"Slope check (1.0 m to 2.0 m in 0.5 s): {v_est:.1f} m/s")
```
</details>

---

## Common mistakes & troubleshooting
- **Subtracting in the wrong order (`pos_prev - pos_now`):** Always compute change as **`new - old`** (`pos_now_m - pos_prev_m`). Subtracting `old - new` flips the sign of your velocity so forward motion looks negative!
- **Confusing a flat line on a position graph vs. a velocity graph:**
  - A flat horizontal line at `y = 3.0` on a **position** graph means the robot is standing still at `3.0 m` (velocity $= 0\text{ m/s}$).
  - A flat horizontal line at `y = 3.0` on a **velocity** graph means the robot is moving forward at a constant `3.0 m/s` (acceleration $= 0\text{ m/s}^2$).
- **Forgetting to multiply by `dt_s` when accumulating area:** Writing `pos_m = pos_m + v` instead of `pos_m = pos_m + (v * dt_s)` pretends every time step is `1.0 second` wide, making your simulated robot move 500 times too fast in a `500 Hz` (`dt_s = 0.002 s`) loop!

---

## Check yourself

1. **Slope of a position graph:** At $t = 1.0\text{ s}$ a robot cart is at $x = 0.4\text{ m}$, and at $t = 1.2\text{ s}$ it is at $x = 1.0\text{ m}$. What is the time step $\Delta t$, the position change $\Delta x$, and the average velocity $v$?
   <details>
   <summary><strong>Answer</strong></summary>

   - $\Delta t = 1.2 - 1.0 = \mathbf{0.2\text{ s}}$
   - $\Delta x = 1.0 - 0.4 = \mathbf{0.6\text{ m}}$
   - $v = \frac{\Delta x}{\Delta t} = \frac{0.6\text{ m}}{0.2\text{ s}} = \mathbf{3.0\text{ m/s}}$
   </details>

2. **Negative slope:** On a position-vs-time graph, the line slopes **downward** from $x = 5.0\text{ m}$ at $t = 0\text{ s}$ to $x = 1.0\text{ m}$ at $t = 2.0\text{ s}$. What is the robot's velocity, and what does the negative sign mean physically?
   <details>
   <summary><strong>Answer</strong></summary>

   $v = \frac{1.0 - 5.0}{2.0 - 0.0} = \frac{-4.0}{2.0} = \mathbf{-2.0\text{ m/s}}$. The negative sign means the robot is moving **backward** (toward the origin) at $2.0\text{ m/s}$.
   </details>

3. **Area under a velocity graph:** A wheel spins at a constant velocity of $v = 1.5\text{ m/s}$ for $\Delta t = 4.0\text{ s}$, then reverses at $v = -1.0\text{ m/s}$ for $\Delta t = 2.0\text{ s}$. What is the net change in position?
   <details>
   <summary><strong>Answer</strong></summary>

   **$+4.0\text{ m}$**. The first rectangle has area $+1.5 \times 4.0 = +6.0\text{ m}$, and the second rectangle (below the time axis) has area $-1.0 \times 2.0 = -2.0\text{ m}$. Total displacement $= 6.0 + (-2.0) = \mathbf{4.0\text{ m}}$.
   </details>

4. **Slope of a velocity graph:** A motor's speed increases along a straight line from $v = 0.0\text{ m/s}$ at $t = 0.0\text{ s}$ to $v = 6.0\text{ m/s}$ at $t = 1.5\text{ s}$. What is its acceleration $a$?
   <details>
   <summary><strong>Answer</strong></summary>

   $a = \frac{\Delta v}{\Delta t} = \frac{6.0 - 0.0}{1.5 - 0.0} = \mathbf{4.0\text{ m/s}^2}$.
   </details>

---

## Recap
- The **slope** ($\Delta y / \Delta t$) of a time-series graph measures **rate of change**: slope of position is **velocity**, and slope of velocity is **acceleration**.
- The **area** ($y \cdot \Delta t$) under a time-series graph measures **accumulated change**: area under velocity is **change in position** ($\Delta x = v \cdot \Delta t$).

### You're ready to move on when...
- [ ] You can compute velocity from two points on a position-vs-time graph using `(pos_now - pos_prev) / dt_s`.
- [ ] You can explain why `pos_m = pos_m + (vel_m_s * dt_s)` adds the area of a narrow rectangle on the velocity graph.
- [ ] Your **Do it yourself** script prints `total_pos=4.00 m` and `2.0 m/s`.
- **Next lesson:** [Lesson P.7: Forces, Lever Torque & Rotational Speed](P.7-forces-torque-and-rotational-motion.md)
