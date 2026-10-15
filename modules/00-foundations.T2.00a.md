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
---

## 1. Why This Matters
In Tier 1 (`00-foundations.T1.01`), you updated position `x` and velocity `v` as separate scalar lines inside a `while` loop. In Tier 2 (`00-foundations.T2.01`), multi-mass drivetrains, Kalman filters, and LQR controllers stack all system variables into a single **state vector** $\vec{x}_k$ and advance the entire physical system in one matrix-vector multiply: $\vec{x}_{k+1} = A_d \vec{x}_k + B_d u_k$. This module shows you that a matrix is nothing more than a compact table of loop update equations.

## 2. Mental Model
1. **Derivatives & Integrals Are Just Loop Operations You Already Know:**
   - **Numerical Derivative (slope):** $\frac{dx}{dt} \approx \frac{x_k - x_{k-1}}{\Delta t}$ (how much $x$ changed per second).
   - **Numerical Integral (accumulated area):** $\int v\,dt \approx \sum v_k \Delta t$ (running sum of rectangles).
2. **A Matrix Is a Coupled Update Rule:**
   Take the two scalar Euler lines for a spring-mass-damper:
   $$x_{k+1} = 1 \cdot x_k + \Delta t \cdot v_k + 0 \cdot u_k$$
   $$v_{k+1} = \left(-\frac{k}{m}\Delta t\right) x_k + \left(1 - \frac{b}{m}\Delta t\right) v_k + \left(\frac{\Delta t}{m}\right) u_k$$
   Stacking $\vec{x}_k = \begin{bmatrix} x_k \\ v_k \end{bmatrix}$ lets us write both lines as a single matrix equation $\vec{x}_{k+1} = A_d \vec{x}_k + B_d u_k$:
   $$\begin{bmatrix} x_{k+1} \\ v_{k+1} \end{bmatrix} = \underbrace{\begin{bmatrix} 1 & \Delta t \\ -\frac{k}{m}\Delta t & 1 - \frac{b}{m}\Delta t \end{bmatrix}}_{A_d} \begin{bmatrix} x_k \\ v_k \end{bmatrix} + \underbrace{\begin{bmatrix} 0 \\ \frac{\Delta t}{m} \end{bmatrix}}_{B_d} u_k$$

## 3. Worked Example
Let $m = 1.0\text{ kg}$, $k = 100.0\text{ N/m}$, $b = 10.0\text{ N}\cdot\text{s/m}$, $\Delta t = 0.01\text{ s}$, initial state $\vec{x}_0 = [0.10\text{ m},\; 0.0\text{ m/s}]^T$, and input force $u_0 = 5.0\text{ N}$.
- **Step 1 (Build $A_d$ and $B_d$):**
  $$A_d = \begin{bmatrix} 1.0 & 0.01 \\ -1.0 & 0.90 \end{bmatrix}, \quad B_d = \begin{bmatrix} 0.0 \\ 0.01 \end{bmatrix}$$
- **Step 2 (Row-by-column dot products for $\vec{x}_1 = A_d \vec{x}_0 + B_d u_0$):**
  $$x_1 = (1.0)(0.10) + (0.01)(0.0) + (0.0)(5.0) = 0.10\text{ m}$$
  $$v_1 = (-1.0)(0.10) + (0.90)(0.0) + (0.01)(5.0) = -0.10 + 0.05 = -0.05\text{ m/s}$$

## 4. Code
```python
import math

m, k, b, dt = 1.0, 100.0, 10.0, 0.01
Ad = [[1.0, dt],
      [-(k / m) * dt, 1.0 - (b / m) * dt]]
Bd = [0.0, dt / m]

x0 = [0.10, 0.00]
u0 = 5.0

# Matrix update: x1 = Ad @ x0 + Bd * u0
x1_mat = [
    Ad[0][0] * x0[0] + Ad[0][1] * x0[1] + Bd[0] * u0,
    Ad[1][0] * x0[0] + Ad[1][1] * x0[1] + Bd[1] * u0,
]

# Scalar update check
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
Run `x = Ad @ x + Bd @ u0` in a loop for `500` steps (`5.0` seconds) with constant force $u_0 = 5.0\text{ N}$ and verify that position $x$ converges to the static Hooke's Law equilibrium $x_{\text{eq}} = u_0 / k = 5.0 / 100.0 = 0.05\text{ m}$ and velocity $v$ converges to $0.0\text{ m/s}$.
- **Check:** `assert math.isclose(float(x[0, 0]), 0.05, rel_tol=1e-3)` and `assert abs(float(x[1, 0])) < 1e-4`

## 6. Gate Test
1. If matrix $A$ has shape $(4, 4)$ and state vector $\vec{x}$ has shape $(4, 1)$, what is the shape of $A \vec{x}$? (Answer: $(4, 1)$.)
2. In the matrix $\vec{x}_{k+1} = A_d \vec{x}_k$, why is the top-right entry of $A_d$ for $\vec{x} = [x, v]^T$ equal to $\Delta t$? (Answer: Because Row 1 computes $x_{k+1} = 1 \cdot x_k + \Delta t \cdot v_k$.)

## 7. Resources
- **3Blue1Brown — Essence of Linear Algebra (Ch. 3–4):** Linear transformations and matrix multiplication as composition `[UNVERIFIED]`.
- **Strang — *Introduction to Linear Algebra*:** Matrix-vector multiplication and difference equations (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
