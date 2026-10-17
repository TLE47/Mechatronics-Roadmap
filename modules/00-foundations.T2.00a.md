---
id: 00-foundations.T2.00a
title: "Numerical Derivatives, Integrals & Matrices as One-Step State Updaters"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T1.01
new_concepts:
  - finite_difference_derivative_and_integral
  - matrix_vector_multiplication
  - state_vector_one_step_update
uses:
  - symplectic_euler_integration
  - so2_rotation_matrix
  - discrete_kinematics_pos_vel_acc
est_hours: 4.0
hardware_required: false
safety_level: none
resources_verified: true
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
[`exercises/00-foundations.T2.00a/`](../exercises/00-foundations.T2.00a/) turns this section into a test. `starter.py` holds six holes: `joint_velocity` (backward difference of the capstone's 12-bit AS5600 counts, wrapped across zero), `running_integral`, `state_matrices`, `one_step`, `simulate`, and `encoder_trace_angle` (counts -> velocity -> integral, which must land back on the encoder's own angle). Edit it, then run the tests the way CI does:

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
