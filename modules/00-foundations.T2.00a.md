---
id: 00-foundations.T2.00a
title: "Numerical Derivatives, Integrals & Matrices as One-Step State Updaters"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T1.00e
new_concepts:
  - finite_difference_derivative_and_integral
  - matrix_vector_multiplication
  - state_vector_one_step_update
uses:
  - symplectic_euler_integration
  - discrete_kinematics_pos_vel_acc
est_hours: 4.0
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

## 1. Why it matters
In Tier 1 (`00-foundations.T1.01`), you updated position and velocity as separate scalar lines inside a `while` loop, which becomes unwieldy when a two-mass drivetrain or 6-DOF arm has $4$ to $12$ coupled states. Stacking all state variables into a single state vector $\vec{x}_k$ lets a single matrix-vector update $\vec{x}_{k+1} = A_d \vec{x}_k + B_d u_k$ advance the entire physical plant, Kalman filter, or LQR controller in one step. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Imagine a spreadsheet where Column A holds a cart's position and Column B holds its velocity. To compute the next row, you follow two fixed recipes: "new position equals $1$ times old position plus $\Delta t$ times old velocity," and "new velocity equals stiffness-factor times old position plus damping-factor times old velocity plus input-factor times motor force." Instead of writing those two long sentences on every row, you write the four multiplier weights once inside a $2\times 2$ grid called matrix $A_d$ and the two force weights inside a $2\times 1$ column called $B_d$. Multiplying a matrix by a column vector consists of taking each row of the grid and matching its weights against the state column.

## 3. Formalization
1. **Finite-Difference Derivative and Running Integral:** Given discrete positions $x_k$ in meters ($\text{m}$) sampled every $\Delta t$ seconds ($\text{s}$), the backward-difference velocity $v_k$ ($\text{m/s}$) and rectangular integral $I_k$ ($\text{m}\cdot\text{s}$) are:

$$
v_k = \frac{x_k - x_{k-1}}{\Delta t}, \qquad I_k = I_{k-1} + x_k \Delta t
$$

   For $x_{k-1} = 0.10\text{ m}$, $x_k = 0.12\text{ m}$, and $\Delta t = 0.01\text{ s}$, $v_k = \frac{0.12\text{ m} - 0.10\text{ m}}{0.01\text{ s}} = 2.0\text{ m/s}$.
2. **Matrix-Vector Multiplication ($\vec{y} = A\vec{x}$):** Multiplying a $2\times 2$ matrix $A$ by a $2\times 1$ column vector $\vec{x} = [x_1,\; x_2]^T$ computes the dot product of each row of $A$ with $\vec{x}$: $y_i = A_{i1}x_1 + A_{i2}x_2$.
3. **Discrete State-Vector One-Step Update ($\vec{x}_{k+1} = A_d \vec{x}_k + B_d u_k$):** For a mass $m$ ($\text{kg}$), stiffness $k$ ($\text{N/m}$), damping $b$ ($\text{N}\cdot\text{s/m}$), state vector $\vec{x}_k = [x_k,\; v_k]^T$, and input force $u_k$ ($\text{N}$), the Euler update packs into:

$$
\begin{bmatrix} x_{k+1} \\ v_{k+1} \end{bmatrix} = \underbrace{\begin{bmatrix} 1 & \Delta t \\ -\frac{k}{m}\Delta t & 1 - \frac{b}{m}\Delta t \end{bmatrix}}_{A_d} \begin{bmatrix} x_k \\ v_k \end{bmatrix} + \underbrace{\begin{bmatrix} 0 \\ \frac{\Delta t}{m} \end{bmatrix}}_{B_d} u_k
$$

   Substituting $m = 1.0\text{ kg}$, $k = 100.0\text{ N/m}$, $b = 10.0\text{ N}\cdot\text{s/m}$, $\Delta t = 0.01\text{ s}$, $\vec{x}_0 = [0.10\text{ m},\; 0.0\text{ m/s}]^T$, and $u_0 = 5.0\text{ N}$ yields $x_1 = (1.0)(0.10\text{ m}) + (0.01\text{ s})(0.0\text{ m/s}) = 0.1000\text{ m}$ and $v_1 = (-1.0\text{ s}^{-1})(0.10\text{ m}) + (0.90)(0.0\text{ m/s}) + (0.01\text{ kg}^{-1}\text{s})(5.0\text{ N}) = -0.0500\text{ m/s}$.

## 4. Worked example
**Predict first (before you run it):** Commit to two numbers before running the block. (1) With $m = 1.0\text{ kg}$, $k = 100.0\text{ N/m}$, $b = 10.0\text{ N}\cdot\text{s/m}$, $\Delta t = 0.01\text{ s}$, $\vec{x}_0 = [0.10\text{ m},\; 0.0\text{ m/s}]^T$ and $u_0 = 5.0\text{ N}$, what are $x_1$ and $v_1$ after one step? (2) The 500-step loop with the same $u_0$ settles at $x_{\text{eq}} = u_0/k$ — is that above or below $0.10\text{ m}$, and what value does it reach? Two tells that a wrong result is a mistake rather than a surprise: $x_1$ must still read $0.1000\text{ m}$, because the first step has no velocity to move it, so any change there means the position row consumed the *new* velocity; and $v_1$ must come out at exactly $-0.0500\text{ m/s}$, whose magnitude is $\Delta t \cdot u_0 / m$, so $+0.0500$ means a sign slipped in the force row.
Build the $2\times 2$ discrete transition matrix $A_d$ and input matrix $B_d$ for $m = 1.0\text{ kg}$, $k = 100.0\text{ N/m}$, $b = 10.0\text{ N}\cdot\text{s/m}$, $\Delta t = 0.01\text{ s}$, and verify that one matrix step from $\vec{x}_0 = [0.10, 0.00]^T$ with $u_0 = 5.0\text{ N}$ matches the scalar update identically.

```python
import math

m, k, b, dt = 1.0, 100.0, 10.0, 0.01
Ad = [[1.0, dt],
      [-(k / m) * dt, 1.0 - (b / m) * dt]]
Bd = [0.0, dt / m]

x0 = [0.10, 0.00]
u0 = 5.0

x1_mat = [
    Ad[0][0] * x0[0] + Ad[0][1] * x0[1] + Bd[0] * u0,
    Ad[1][0] * x0[0] + Ad[1][1] * x0[1] + Bd[1] * u0,
]

x1_scalar = x0[0] + dt * x0[1]
v1_scalar = x0[1] + dt * ((-k * x0[0] - b * x0[1] + u0) / m)

assert math.isclose(x1_mat[0], x1_scalar, rel_tol=1e-12)
assert math.isclose(x1_mat[1], v1_scalar, rel_tol=1e-12)
assert math.isclose(x1_mat[1], -0.05, rel_tol=1e-12)
print(f"x1={x1_mat[0]:.4f} m, v1={x1_mat[1]:.4f} m/s")
```
Expected output:
```text
x1=0.1000 m, v1=-0.0500 m/s
```

## 5. Exercise
Iterate `x = [Ad[0][0]*x[0] + Ad[0][1]*x[1] + Bd[0]*u0, Ad[1][0]*x[0] + Ad[1][1]*x[1] + Bd[1]*u0]` for `500` steps ($5.0\text{ s}$) with constant force $u_0 = 5.0\text{ N}$ and verify that position converges to static Hooke equilibrium $x_{\text{eq}} = u_0 / k = 0.0500\text{ m}$ (tolerance $\pm 10^{-3}\text{ m}$) and velocity converges to $0.0000\text{ m/s}$ (tolerance $\pm 10^{-4}\text{ m/s}$).
- **If your result differs:** Make sure you compute both new components `x_next` and `v_next` from the *previous* step's `x[0]` and `x[1]` before overwriting `x`.

### Graded package - the same six steps on the arm's encoder
[`exercises/00-foundations.T2.00a/`](../exercises/00-foundations.T2.00a/) turns this section into a test. It runs on the shared capstone arm (`resources/plants/`), not on the $m = 1.0\text{ kg}$ cart above: the cart isolates the matrix update, and the arm is the plant Tier 1 built - so its transfer suite is where the two meet on purpose. `starter.py` holds six holes: `joint_velocity` (backward difference of the capstone's 12-bit AS5600 counts, wrapped across zero), `running_integral`, `state_matrices`, `one_step`, `simulate`, and `encoder_trace_angle` (counts -> velocity -> integral, which must land back on the encoder's own angle). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00a/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00a -p 'test_*.py'
```

The tests are behavioural: the velocity estimate must change by exactly 10 when $\Delta t$ changes by 10, must use the `cpr` it is given, and must treat the `4095 -> 0` step as +1 count; the integral must be running, not restarted; the one-step test uses a state that *carries velocity*, where computing `v` from the new `x` is wrong by $10^{-2}$; the transfer suite moves the exercise onto the arm's own figure-8 encoder trace and a second plant with $m = 2.5$ kg. Four planted faults - `missing_dt`, `no_wrap`, `hardcoded_counts`, `sequential_update` - each fail the test named for them, and a print-only file passes nothing (`scripts/run_exercise.py`).

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Module:** [`00-foundations.T1.00e`](00-foundations.T1.00e.md) and Legacy **Step 1.1 (`00-foundations.T1.01`)** in [`00-foundations/README.md`](../00-foundations/README.md#tier-1-beginner--intuitive).
  - **Core Concepts to Review First:** $2\times 2$ matrix-vector multiplication $A_d x_k + B_d u_k$ and simultaneous state update in `## 3. Formalization` (Items 2–3) and `## 4. Worked example` above.
  - **Linear Algebra & State-Space Study Links:** [3Blue1Brown: Linear Transformations and Matrices (`3blue1brown.com`)](https://www.3blue1brown.com/lessons/linear-transformations) and [Brunton & Kutz *Data-Driven Science and Engineering* (`databookuw.com`)](https://databookuw.com/).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) and [`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution ---
import math

TWO_PI = 2.0 * math.pi


def joint_velocity(counts, dt, cpr=4096):
    """Joint speed in rad/s from consecutive encoder counts, one sample per `dt`.

    TODO 1: difference consecutive samples, turn counts into radians, divide by dt.
    TODO 2: wrap each difference into (-pi, pi] - 4095 -> 0 is +1 count, not -4095.
    Return one value per sample; the first has no previous sample, so 0.0.
    """
    ...


def running_integral(values, dt):
    """out[k] = out[k-1] + values[k]*dt, one entry per input value."""
    # TODO 3: accumulate in one variable; never restart the sum at zero
    ...


def state_matrices(m, k, b, dt):
    """(Ad, Bd) for the mass-spring-damper Euler update, as [[...], [...]] and [...]."""
    # TODO 4: Ad = [[1, dt], [-k/m*dt, 1 - b/m*dt]], Bd = [0, dt/m]
    ...


def one_step(Ad, Bd, x, u):
    """One matrix step [x1, v1] from the OLD state `x`."""
    # TODO 5: compute both components before you write either one back
    ...


def simulate(Ad, Bd, x0, u, steps):
    """Run `steps` matrix steps with constant input `u`; return the final [x, v]."""
    # TODO 6: copy x0, then loop one_step
    ...


def encoder_trace_angle(counts, dt, cpr=4096):
    """counts -> velocity -> running integral, added back onto the first sample's angle."""
    # TODO 7: this must land on the encoder's own angle, to within one count
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $m = 1.0\text{ kg}$, $k = 100\text{ N/m}$, $b = 10$, $\Delta t = 0.01\text{ s}$ give $x_{\text{eq}} = 0.0500\text{ m}$ after $500$ steps ($\pm 10^{-3}\text{ m}$) with $v \to 0.0000\text{ m/s}$ ($\pm 10^{-4}$); one encoder count per $1\text{ ms}$ sample is $1.534\text{ rad/s}$ on the capstone's $4096$-count encoder.

### Hint ladder
1. **The wrap is one modulo, not a special case.** Turn the raw difference into radians, then `(delta + math.pi) % TWO_PI - math.pi`. At `4095 -> 0` the raw difference is $-4095$ counts; wrapping it gives the $+1$ count the physical shaft actually moved, which is why the velocity is one count's worth and not $-4095\times$.
2. **Why the integral must be running.** `out[k] = out[k-1] + values[k]*dt` telescopes against the backward difference: summing the diffs returns the last count minus the first, so counts -> velocity -> integral lands back on the encoder angle. Re-integrating each step from zero gives a sawtooth, and the round-trip test fails everywhere except the first sample.
3. **$B_d$ carries $\Delta t$.** $B_d u$ is added to the velocity row, so it must be a velocity: $\Delta t u / m = 0.01 \times 5.0 / 1.0 = 0.05\text{ m/s}$ per step. Writing $1/m$ instead adds $5.0\text{ m/s}$ per step, which is an acceleration sitting in a velocity's slot, and no equilibrium is ever reached.
4. **Simultaneous means simultaneous.** In `one_step`, compute `x1` and `v1` into new names first; assigning back into `x[0]` before computing `v1` feeds the new position into the old state, and the test's state $[0.10, 0.20]$ separates the two answers by more than $10^{-2}$.

### Full Solution
```python
import math

TWO_PI = 2.0 * math.pi


def joint_velocity(counts, dt, cpr=4096):
    per_count = TWO_PI / cpr
    velocities = [0.0]
    for k in range(1, len(counts)):
        delta = (counts[k] - counts[k - 1]) * per_count
        delta = (delta + math.pi) % TWO_PI - math.pi
        velocities.append(delta / dt)
    return velocities


def running_integral(values, dt):
    out = []
    total = 0.0
    for value in values:
        total += value * dt
        out.append(total)
    return out


def state_matrices(m, k, b, dt):
    Ad = [[1.0, dt], [-(k / m) * dt, 1.0 - (b / m) * dt]]
    Bd = [0.0, dt / m]
    return Ad, Bd


def one_step(Ad, Bd, x, u):
    x1 = Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0] * u
    v1 = Ad[1][0] * x[0] + Ad[1][1] * x[1] + Bd[1] * u
    return [x1, v1]


def simulate(Ad, Bd, x0, u, steps):
    x = [x0[0], x0[1]]
    for _ in range(steps):
        x = one_step(Ad, Bd, x, u)
    return x


def encoder_trace_angle(counts, dt, cpr=4096):
    start = counts[0] * TWO_PI / cpr
    return [start + value for value in running_integral(joint_velocity(counts, dt, cpr), dt)]


# The exercise: 500 steps of 0.01 s with a constant 5.0 N pull.
Ad, Bd = state_matrices(1.0, 100.0, 10.0, 0.01)
x_final = simulate(Ad, Bd, [0.10, 0.0], 5.0, 500)

assert math.isclose(x_final[0], 0.05, abs_tol=1e-3), x_final
assert math.isclose(x_final[1], 0.0, abs_tol=1e-4), x_final
assert math.isclose(Ad[0][1], 0.01, abs_tol=1e-12) and math.isclose(Ad[1][0], -1.0, abs_tol=1e-12)
assert math.isclose(Ad[1][1], 0.90, abs_tol=1e-12) and math.isclose(Bd[1], 0.01, abs_tol=1e-12)
assert math.isclose(one_step(Ad, Bd, [0.0, 1.0], 0.0)[0], 0.01, abs_tol=1e-12)

# One count per 1 ms sample, and the 4095 -> 0 step that must not read as a full turn.
one_count_speed = joint_velocity([0, 1, 2, 3], 1e-3)[1]
wrapped = joint_velocity([4094, 4095, 0, 1], 1e-3)
assert math.isclose(one_count_speed, TWO_PI / 4096 / 1e-3, abs_tol=1e-6)
assert all(math.isclose(value, one_count_speed, abs_tol=1e-6) for value in wrapped[1:])

print("500 steps of 0.01 s -> x=%.4f m, v=%.4f m/s | one count per ms = %.3f rad/s"
      % (x_final[0], x_final[1], one_count_speed))
```

Printed: `500 steps of 0.01 s -> x=0.0500 m, v=... m/s | one count per ms = 1.534 rad/s` - the position settles on $u_0/k = 0.0500\text{ m}$, and the velocity is within $10^{-4}\text{ m/s}$ of rest.

**On the shared arm.** The Transfer suite differentiates the plant's own figure-8 joint trace through this module's state-space estimate, so one encoder count at 1 kHz sets its velocity noise floor:

```python
import math
import mechalab_plant as plant

count_rad = 2.0 * math.pi / plant.ENCODER_CPR
assert abs(count_rad / plant.DT - 1.5339807878856412) < 1e-12
target = plant.figure8_target(0.25)
q1, q2 = plant.ik(*target)
tip = plant.fk(q1, q2)
assert abs(tip[0] - target[0]) < 1e-9
assert abs(tip[1] - target[1]) < 1e-9
print("plant: one count at 1 kHz = %.4f rad/s | figure-8 at t=0.25 s round-trips to (%.4f, %.4f) m"
      % (count_rad / plant.DT, tip[0], tip[1]))
```

### Break it on purpose
Inject the `## 8. Common mistakes` row about a $B_d$ that skipped $\Delta t$, and diagnose it from the numbers alone, keeping $m = 1.0\text{ kg}$ and $\Delta t = 0.01\text{ s}$:
- **Inject:** form the input column as $B_d = [0,\; 1/m]^T$ instead of $[0,\; \Delta t/m]^T$, so the force enters the update as an acceleration but is added to a velocity.
- **Symptom:** $x_1$ is still $0.1000\text{ m}$, but $v_1$ jumps to $-1.0(0.10) + 1.0(5.0) = +4.9000\text{ m/s}$ instead of $-0.0500\text{ m/s}$, and the 500-step loop no longer converges to $x_{\text{eq}} = 0.0500\text{ m}$: each tick adds $5.0\text{ m/s}$ to the velocity where the correct column adds $\Delta t \cdot 5.0 = 0.05\text{ m/s}$, so the state runs away.
- **Diagnose:** the units localise it. $B_d u_k$ sits in the velocity row, so it must carry $\text{m/s}$; $(1/m)u_0 = 5.0\text{ m/s}^2$ is an acceleration, while $\Delta t u_0/m = 0.05\text{ m/s}$ is a velocity increment. The position row is untouched ($x_1$ still $0.1000\text{ m}$), which rules out $A_d$ and points only at the input column.
- **Fix:** multiply the force row by $\Delta t$, so $B_d = [0,\; 0.01]^T$; then $v_1 = -0.0500\text{ m/s}$ matches the scalar update to $10^{-12}$, and the 500-step loop lands on $x_{\text{eq}} = 0.0500\text{ m}$ within $\pm 10^{-3}\text{ m}$ with velocity under $10^{-4}\text{ m/s}$.

## 6. Simulation path
Run the worked example in Python, then open **Tab 2 (Two-Mass & Notch Bode)** in the MechaLab Workbench to see a 4-state matrix updater driving a motor + flexible shaft + load plant.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). On the STM32/ESP32 in Pass 2 (`Track 05`), this exact matrix-vector product executes inside the $1\text{ kHz}$ Kalman filter prediction step:
```text
[State Vector x_k] ---> [Matrix Multiply: x_{k+1} = Ad * x_k + Bd * u_k] ---> [Predicted State x_{k+1}]
```
Pass/fail verification in simulation: `x1 == 0.1000 m` and `v1 == -0.0500 m/s`.


```mermaid
flowchart LR
    A["00-foundations.T2.00a: finite_difference_derivative_and_integral"] --> B["matrix_vector_multiplication"]
    B --> C["state_vector_one_step_update"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and 500-step equilibrium exercise with zero assertion errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: finite_difference_derivative_and_integral]` An encoder reads $x_{k-1} = 1.20\text{ rad}$ and $x_k = 1.26\text{ rad}$ at sample step $\Delta t = 0.002\text{ s}$. Compute the backward finite-difference velocity $v_k$ in $\text{rad/s}$ (tolerance $\pm 0.01\text{ rad/s}$).
2. `[Apply] [Concept: matrix_vector_multiplication]` Multiply $A = \begin{bmatrix} 2.0 & -1.0 \\ 0.5 & 3.0 \end{bmatrix}$ by $\vec{x} = \begin{bmatrix} 4.0 \\ 2.0 \end{bmatrix}$ and report the second row entry $(A\vec{x})_1$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: state_vector_one_step_update]` Using $A_d = \begin{bmatrix} 1.0 & 0.01 \\ -1.0 & 0.90 \end{bmatrix}$, $B_d = \begin{bmatrix} 0.0 \\ 0.01 \end{bmatrix}$, $\vec{x}_0 = \begin{bmatrix} 0.0 \\ 1.0 \end{bmatrix}$, and $u_0 = 0.0$, compute the updated position $x_1$ after one step (tolerance $\pm 10^{-9}\text{ m}$).
4. `[Concept: finite_difference_derivative_and_integral]` Given zero initial integral $I_0 = 0.0$, tracking error $e_1 = 2.5\text{ rad}$, and sample period $\Delta t = 0.004\text{ s}$, compute the rectangular integral update $I_1 = I_0 + e_1 \Delta t$ in $\text{rad}\cdot\text{s}$ (tolerance $\pm 10^{-9}$).
5. `[Spaced review -> 00-foundations.T1.01 — Concept: symplectic_euler_integration] [Concept: state_vector_one_step_update]` For an undamped spring-mass system, why does updating velocity first and then using the new velocity to update position preserve energy better than standard forward Euler?
   - **A.** It sets the spring stiffness $k$ to zero.
   - **B.** It is a symplectic map that preserves phase-space area instead of spiraling outward.
   - **C.** It doubles the time step $\Delta t$.
   - **D.** It ignores the mass $m$.

**Answer key:**
```python
import math

q1_vel = (1.26 - 1.20) / 0.002
q2_row1 = 0.5 * 4.0 + 3.0 * 2.0
q3_x1 = 1.0 * 0.0 + 0.01 * 1.0
q4_int1 = 0.0 + 2.5 * 0.004
q5_choice = "B"

assert math.isclose(q1_vel, 30.0, rel_tol=1e-9)
assert math.isclose(q2_row1, 8.0, rel_tol=1e-9)
assert math.isclose(q3_x1, 0.01, rel_tol=1e-9)
assert math.isclose(q4_int1, 0.01, rel_tol=1e-9)
assert q5_choice == "B"
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1, study `## 3. Formalization`; if you missed Q2, Q3, or Q4, study `## 4. Worked example`; if you missed Q5, study `## 2. Intuition first` (and review `00-foundations.T1.01`). On pass, proceed to `## 10. Next modules`.

### Gate test
This is the exit examination for the whole Track 00 Tier 2 ladder - [`00-foundations.T2.00a`](00-foundations.T2.00a.md) through [`00-foundations.T2.00f`](00-foundations.T2.00f.md) - before Step 2.1 (`00-foundations.T2.01`). Questions 1-6 are this module's own three tools; 7-11 recap each later module once, so nothing on the ladder goes unexamined.
1. `[Concept: finite_difference_derivative_and_integral]` An encoder reads $x_{k-1} = 0.24\,\text{rad}$ and $x_k = 0.30\,\text{rad}$ at $\Delta t = 0.002\,\text{s}$. Compute the backward-difference velocity $v_k = (x_k - x_{k-1})/\Delta t$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$).
2. `[Concept: finite_difference_derivative_and_integral]` From $I_0 = 0.50\,\text{m}\cdot\text{s}$, one more sample $x_k = 0.12\,\text{m}$ at $\Delta t = 0.01\,\text{s}$ gives $I_1 = I_0 + x_k\Delta t$. Compute $I_1$ (tolerance $\pm 10^{-9}$).
3. `[Concept: matrix_vector_multiplication]` For $A = \begin{bmatrix} 3.0 & -2.0 \\ 1.0 & 4.0 \end{bmatrix}$ and $\vec{x} = [1.5,\; 2.5]^\top$, compute $(A\vec{x})_0$ (tolerance $\pm 10^{-9}$).
4. `[Concept: matrix_vector_multiplication]` Why does $A\vec{x}$ come out as a column of length $2$ rather than a $2\times 2$ matrix?
   - **A.** Each output entry is one row of $A$ dotted with $\vec{x}$, so there is one output per row.
   - **B.** $A\vec{x}$ is the elementwise product of $A$ and $\vec{x}$, which keeps $A$'s shape.
   - **C.** Python reshapes $A$ into a column before multiplying.
   - **D.** $\vec{x}$ is transposed into a row first.
5. `[Concept: state_vector_one_step_update]` One step of $A_d = \begin{bmatrix} 1.0 & 0.02 \\ -2.0 & 0.80 \end{bmatrix}$, $B_d = [0.0,\; 0.02]^\top$, from $\vec{x}_0 = [0.50,\; 0.0]^\top$ with $u_0 = 10.0\,\text{N}$ gives $v_1$. Compute $v_1$ in $\text{m/s}$ (tolerance $\pm 10^{-9}$).
6. `[Concept: state_vector_one_step_update]` Why must both new components be computed before either is written back into $\vec{x}$?
   - **A.** Every row of $A_d$ uses the *old* state; writing $x_{k+1}$ into `x[0]` first feeds the new position into the velocity row.
   - **B.** NumPy forbids in-place assignment.
   - **C.** The velocity row is by definition computed from the new position.
   - **D.** Because $B_d$ has a zero in the position row.
7. `[Concept: dot_product_projection] [Concept: cross_product_3d_moment] [Concept: basis_change_and_invertibility]` Which triple is correct for `00-foundations.T2.00b`?
   - **A.** The projection uses the lever's *unit* direction, the moment is $\vec{r}\times\vec{F}$ (anti-commutative), and a zero determinant means the two columns are collinear.
   - **B.** The projection uses the raw lever so force grows with its length, $\vec{r}\times\vec{F} = \vec{F}\times\vec{r}$, and a zero determinant means a valid basis.
   - **C.** The projection divides by $\|\vec{r}\|$ twice, the moment is a scalar, and the determinant is always positive.
   - **D.** The dot product returns a vector, the cross product is symmetric, and the determinant equals the trace.
8. `[Concept: first_order_ode_time_constant] [Concept: second_order_ode_wn_zeta] [Concept: characteristic_polynomial_roots]` For `00-foundations.T2.00c`'s joint with $J = 0.02\,\text{kg}\cdot\text{m}^2$, $k = 8.0\,\text{N}\cdot\text{m/rad}$ and $b = 0.60\,\text{N}\cdot\text{m}\cdot\text{s/rad}$, compute the damping ratio $\zeta = b/(2\sqrt{Jk})$ (tolerance $\pm 10^{-9}$).
9. `[Concept: complex_numbers_and_euler_formula] [Concept: complex_impedance_and_transfer_function] [Concept: bode_magnitude_db_and_phase]` For `00-foundations.T2.00d`'s first-order filter $H(j\omega) = 1/(1 + j\omega\tau)$, compute $|H|$ in decibels at the cutoff $\omega = 1/\tau$ (tolerance $\pm 10^{-4}\,\text{dB}$).
10. `[Concept: laplace_poles_and_zeros] [Concept: continuous_state_space_matrices] [Concept: discrete_state_transition_euler_tustin]` For `00-foundations.T2.00e`'s $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$ sampled at $T_s = 0.05\,\text{s}$, compute the spectral radius of the Forward-Euler map $A_d = I + A T_s$ (tolerance $\pm 10^{-6}$).
11. `[Concept: nyquist_sampling_and_aliasing] [Concept: tustin_frequency_prewarping_and_biquad] [Concept: gaussian_variance_and_covariance_matrix]` Which triple is correct for `00-foundations.T2.00f`?
   - **A.** Sampling represents only frequencies up to $f_s/2$, a faster tone folds to $|f - k f_s|$, and pre-warping lifts the analog target so the digital notch lands on $f_0$.
   - **B.** Sampling represents any frequency, aliasing affects only DC, and Tustin never warps.
   - **C.** The Nyquist frequency is $f_s$, aliasing doubles the frequency, and pre-warping is a gain correction.
   - **D.** Covariance is a scalar, the sample rate is irrelevant to stability, and every bilinear pole lands outside the unit circle.

**Gate answer key:**
```python
import math

g1_velocity = (0.30 - 0.24) / 0.002
g2_integral = 0.50 + 0.12 * 0.01
g3_ax0 = 3.0 * 1.5 + (-2.0) * 2.5
g4_choice = "A"
g5_v1 = -2.0 * 0.50 + 0.80 * 0.0 + 0.02 * 10.0
g6_choice = "A"
g7_choice = "A"
g8_zeta = 0.60 / (2.0 * math.sqrt(0.02 * 8.0))
g9_db = 20.0 * math.log10(1.0 / math.sqrt(2.0))
Ad_euler = [[1.0, 0.05], [-5.0, 0.80]]
g10_radius = math.sqrt(Ad_euler[0][0] * Ad_euler[1][1] - Ad_euler[0][1] * Ad_euler[1][0])
g11_choice = "A"

assert math.isclose(g1_velocity, 30.0, rel_tol=1e-9)
assert math.isclose(g2_integral, 0.5012, rel_tol=1e-9)
assert math.isclose(g3_ax0, -0.5, rel_tol=1e-9)
assert g4_choice == "A"
assert math.isclose(g5_v1, -0.80, rel_tol=1e-9)
assert g6_choice == "A"
assert g7_choice == "A"
assert math.isclose(g8_zeta, 0.75, rel_tol=1e-9)
assert math.isclose(g9_db, -3.0103, abs_tol=1e-4)
assert math.isclose(g10_radius, 1.024695, abs_tol=1e-6)
assert g11_choice == "A"
```
- **Pass mark:** $\ge 80\%$ ($4/5$ on Skip test; $\ge 9/11$ on Gate test). Missed Gate Q1-Q2: study `00-foundations.T2.00a`; Q3-Q6: `00-foundations.T2.00a`; Q7: `00-foundations.T2.00b`; Q8: `00-foundations.T2.00c`; Q9: `00-foundations.T2.00d`; Q10: `00-foundations.T2.00e`; Q11: `00-foundations.T2.00f`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| In matrix math, elementwise `A  x` gives a $2\times 2$ matrix instead of a $2\times 1$ vector | Used elementwise `` instead of matrix-multiply `@`. | Always use `A @ x` for matrix-vector multiplication in NumPy. |
| Matrix update diverges even with positive damping $b$ | Overwrote `x[0]` in-place before using old `x[0]` to compute `x[1]`. | Compute the full new vector `[row0, row1]` before assigning it back to `x`. |
| Static equilibrium is off by $\Delta t$ | Forgot to multiply $B_c = [0,\; 1/m]^T$ by $\Delta t$ when forming $B_d$. | Check units: $B_d u_k$ in row 2 must have units of velocity ($\text{m/s} = \text{N}\cdot\text{s/kg}$). |

## 9. Resources
- **Gilbert Strang — [*Linear Algebra and Learning from Data* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md):** Matrix-vector multiplication and discrete difference equations `[VERIFIED 2026-10-15]`.
- **Brunton & Kutz — [*Data-Driven Science and Engineering* (`databookuw.com`)](https://databookuw.com/) ([`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md)):** Open-access PDF connecting linear algebra to dynamical systems `[VERIFIED 2026-10-15]`.
- **3Blue1Brown — [*Essence of Linear Algebra* (`3blue1brown.com/topics/linear-algebra`)](https://www.3blue1brown.com/topics/linear-algebra):** Visual intuition for matrices as linear transformations `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`00-foundations.T2.00b`](00-foundations.T2.00b.md) (*Vectors, Dot & Cross Products, Linear Independence & Change of Basis*).
