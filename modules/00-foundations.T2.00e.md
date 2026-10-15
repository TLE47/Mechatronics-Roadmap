---
id: 00-foundations.T2.00e
title: "Laplace Transform, Poles/Zeros, State-Space x_dot = Ax + Bu, Matrix Exponential & Discretization"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00d
new_concepts:
  - laplace_poles_and_zeros
  - continuous_state_space_matrices
  - discrete_state_transition_euler_tustin
uses:
  - matrix_vector_multiplication
  - second_order_ode_wn_zeta
  - complex_impedance_and_transfer_function
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters (Why This Matters)
Transfer functions $G(s)$ are great for single-input single-output filters, but modern control algorithms (LQR, Kalman filters, and Model Predictive Control in Track 05) operate on multi-variable **state-space models** $\dot{x} = Ax + Bu$ discretized into $x_{k+1} = A_d x_k + B_d u_k$. Connecting transfer-function poles and zeros to the eigenvalues of the state matrix $A$ is the direct foundation for Step 2.1 (`00-foundations.T2.01`). Already know this? Take the Skip test in section 8 first.

## 2. Intuition first (Mental Model)
Think of a second-order differential equation ($\ddot{q} = \dots$) as a two-story building, whereas a microcontroller prefers a ground-floor warehouse where every variable updates by a single first-order step ($\dot{x} = \dots$). By stacking position $q$ and velocity $\dot{q}$ into a column vector $x = [q, \dot{q}]^\top$, any $n$-th order differential equation flattens into a single matrix equation $\dot{x} = Ax + Bu$. The **poles** of the system (the eigenvalues of $A$) are the system's natural ringing modes—if their real parts are negative, disturbances die out; if positive, the system explodes. And **zeros** are specific frequencies where two internal pathways cancel each other out so the sensor sees almost zero motion even while the actuator is shaking hard (anti-resonance).

## 3. Formalization
1. **Laplace Poles and Zeros:** In $G(s) = \frac{N(s)}{D(s)}$ with complex frequency $s = \sigma + j\omega$ ($\text{s}^{-1}$):
   - **Poles** ($D(s) = 0$) determine stability and resonance peaks ($\operatorname{Re}(p_i) < 0$ is stable).
   - **Zeros** ($N(s) = 0$) are frequencies where transmission is blocked (such as the anti-resonance $\omega_{\text{ar}} = \sqrt{k_s/J_l}$ of a two-mass drive in Step 2.1).
2. **State-Space Companion Form ($\dot{x} = Ax + Bu$):** For a rotational drive $J\ddot{\theta} + b\dot{\theta} + k\theta = u$ with inertia $J$ ($\text{kg}\cdot\text{m}^2$), damping $b$ ($\text{N}\cdot\text{m}\cdot\text{s/rad}$), stiffness $k$ ($\text{N}\cdot\text{m/rad}$), torque $u$ ($\text{N}\cdot\text{m}$), and state $x = [\theta, \dot{\theta}]^\top$:
   $$\begin{bmatrix} \dot{\theta} \\ \ddot{\theta} \end{bmatrix} = \underbrace{\begin{bmatrix} 0 & 1 \\ -k/J & -b/J \end{bmatrix}}_{A} \begin{bmatrix} \theta \\ \dot{\theta} \end{bmatrix} + \underbrace{\begin{bmatrix} 0 \\ 1/J \end{bmatrix}}_{B} u$$
   Substituting $J = 1.0\text{ kg}\cdot\text{m}^2$, $k = 100.0\text{ N}\cdot\text{m/rad}$, and $b = 4.0\text{ N}\cdot\text{m}\cdot\text{s/rad}$ gives $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$ with $\operatorname{tr}(A) = -4\text{ s}^{-1}$ and $\det(A) = 100\text{ s}^{-2}$.
3. **Discretization ($\dot{x} = Ax + Bu \to x_{k+1} = A_d x_k + B_d u_k$):** Over sample period $T_s$ ($\text{s}$), Forward Euler gives $A_{d,\text{Euler}} = I + A T_s$, whereas Bilinear (Tustin) discretization preserves left-half-plane stability:
   $$A_{d,\text{Tustin}} = \left(I - \frac{T_s}{2}A\right)^{-1}\left(I + \frac{T_s}{2}A\right)$$
   At $T_s = 0.001\text{ s}$ on the above $A$, $|\lambda(A_{d,\text{Tustin}})| = 0.998002 < 1.0$.

## 4. Worked example (Worked Example & Code)
For $J=1\text{ kg}\cdot\text{m}^2$, $b=4\text{ N}\cdot\text{m}\cdot\text{s/rad}$, $k=100\text{ N}\cdot\text{m/rad}$, verify that the eigenvalues of $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$ match the roots of $s^2 + 4s + 100 = 0$ ($\lambda = -2 \pm j\sqrt{96}\text{ s}^{-1}$) and compare Forward Euler vs. Tustin discretization at $T_s = 0.05\text{ s}$.

```python
import cmath
import math

def eigvals_2x2(M: list[list[float]]) -> tuple[complex, complex]:
    tr = M[0][0] + M[1][1]
    det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return (0.5 * (tr + disc), 0.5 * (tr - disc))

A = [[0.0, 1.0], [-100.0, -4.0]]
l1, l2 = eigvals_2x2(A)
assert math.isclose(l1.real, -2.0, rel_tol=1e-9) and math.isclose(l2.real, -2.0, rel_tol=1e-9)
assert math.isclose(abs(l1.imag), math.sqrt(96.0), rel_tol=1e-9)

Ts = 0.05
Ad_euler = [[1.0 + Ts * A[0][0], Ts * A[0][1]], [Ts * A[1][0], 1.0 + Ts * A[1][1]]]
# Tustin: (I - 0.5*Ts*A)^(-1) * (I + 0.5*Ts*A) for 2x2
M_minus = [[1.0 - 0.5 * Ts * A[0][0], -0.5 * Ts * A[0][1]], [-0.5 * Ts * A[1][0], 1.0 - 0.5 * Ts * A[1][1]]]
M_plus  = [[1.0 + 0.5 * Ts * A[0][0],  0.5 * Ts * A[0][1]], [ 0.5 * Ts * A[1][0], 1.0 + 0.5 * Ts * A[1][1]]]
det_m = M_minus[0][0] * M_minus[1][1] - M_minus[0][1] * M_minus[1][0]
M_inv = [[M_minus[1][1] / det_m, -M_minus[0][1] / det_m], [-M_minus[1][0] / det_m, M_minus[0][0] / det_m]]
Ad_tustin = [
    [M_inv[0][0] * M_plus[0][0] + M_inv[0][1] * M_plus[1][0], M_inv[0][0] * M_plus[0][1] + M_inv[0][1] * M_plus[1][1]],
    [M_inv[1][0] * M_plus[0][0] + M_inv[1][1] * M_plus[1][0], M_inv[1][0] * M_plus[0][1] + M_inv[1][1] * M_plus[1][1]],
]

rho_euler = max(abs(x) for x in eigvals_2x2(Ad_euler))
rho_tustin = max(abs(x) for x in eigvals_2x2(Ad_tustin))
assert rho_euler > 1.0       # Forward Euler goes unstable at Ts=0.05s!
assert rho_tustin < 1.0      # Tustin stays strictly stable (< 1.0)!
print(f"rho_euler={rho_euler:.4f} (unstable), rho_tustin={rho_tustin:.4f} (stable)")
```
Expected output:
```text
rho_euler=1.0247 (unstable), rho_tustin=0.9258 (stable)
```

## 5. Exercise
Compute the spectral radius $\rho(A_{d,\text{Tustin}})$ of the same system at $T_s = 0.001\text{ s}$ ($1\text{ kHz}$ servo loop) and verify using `trace = Ad[0][0] + Ad[1][1]`, `det = Ad[0][0]*Ad[1][1] - Ad[0][1]*Ad[1][0]`, and `cmath.sqrt(trace**2 - 4*det)` that the spectral radius $\max(|\lambda_1|, |\lambda_2|)$ equals `0.998002` ($\pm 10^{-6}$, strictly inside the unit circle).
- **If your result differs:** Check that you inverted `(I - 0.5 * Ts * A)` and multiplied by `(I + 0.5 * Ts * A)` rather than swapping the plus and minus signs (which places the poles outside the unit circle at `1.002002`).

## 6. Sim-first path (Simulation path)
Open **Tab 1 (Two-Mass Resonance & Biquad Notch)** and **Tab 4 (Furuta Pendulum State-Space LQR)** in the MechaLab Workbench (`npm run dev`) to inspect how continuous state-space matrices $(A, B)$ are discretized for real-time closed-loop simulation.

## 7. Hardware path (and Safety notes)
No hardware required for this module (`hardware_required: false`). In Track 05 (`05-control.T2.06` and `05-control.T3.06`), the discretized matrices $(A_d, B_d)$ run inside the microcontroller's $1\text{ kHz}$ Kalman filter prediction step:
```text
[Offline Python: (A, B) ---> Tustin/ZOH ---> (A_d, B_d)] ---> [MCU 1 kHz Loop: x_hat = A_d * x_hat + B_d * u]
```
Pass/fail verification in simulation: `rho_euler == 1.0247 > 1.0` and `rho_tustin == 0.9258 < 1.0`.

> **Safety Note (`safety_level: none`):** Pure simulation, math, and software module (`hardware_required: false`); no physical energization hazards.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: laplace_poles_and_zeros]` For the transfer function $G(s) = \frac{s^2 + 400}{(s + 5)(s^2 + 4s + 900)}$, compute the anti-resonance zero frequency $\omega_{\text{ar}} > 0$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$) where $G(j\omega_{\text{ar}}) = 0$.
2. `[Apply] [Concept: continuous_state_space_matrices]` For $A = \begin{bmatrix} 0 & 1 \\ -25 & -6 \end{bmatrix}$, compute the trace $\operatorname{tr}(A)$ and determinant $\det(A)$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: discrete_state_transition_euler_tustin]` What is the stability boundary for eigenvalues $\lambda_d$ of a discrete-time state matrix $A_d$ in $x_{k+1} = A_d x_k$?
   - **A.** $\operatorname{Re}(\lambda_d) < 0$
   - **B.** $|\lambda_d| < 1$
   - **C.** $|\lambda_d| > 1$
   - **D.** $\operatorname{Im}(\lambda_d) = 0$
4. `[Spaced review -> 00-foundations.T2.00d — Concept: matrix_vector_multiplication] [Concept: discrete_state_transition_euler_tustin]` Compute the scalar Tustin discrete pole $a_d = \frac{1 + s_p T_s / 2}{1 - s_p T_s / 2}$ for a continuous pole $s_p = -100\text{ s}^{-1}$ sampled at $T_s = 0.01\text{ s}$ (tolerance $\pm 10^{-6}$).

**Answer key:**
```python
import math

q1_w_ar = math.sqrt(400.0)
q2_trace = 0.0 + (-6.0)
q2_det = 0.0 * (-6.0) - 1.0 * (-25.0)
q3_choice = "B"
q4_ad = (1.0 + (-100.0) * 0.01 / 2.0) / (1.0 - (-100.0) * 0.01 / 2.0)

assert math.isclose(q1_w_ar, 20.0, rel_tol=1e-9)
assert math.isclose(q2_trace, -6.0, rel_tol=1e-9)
assert math.isclose(q2_det, 25.0, rel_tol=1e-9)
assert q3_choice == "B"
assert math.isclose(q4_ad, 1.0 / 3.0, rel_tol=1e-6)
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2, study `## 3. Formalization` item 2; Q3 or Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 11. Next modules`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Checked $\operatorname{Re}(\lambda_d) < 0$ on discrete matrix $A_d$ | Confused continuous $s$-plane stability ($\operatorname{Re}(s) < 0$) with discrete $z$-plane stability ($|z| < 1$). | Always check `abs(eigvals(Ad)) < 1.0` for discrete state-transition matrices. |
| State-space signs flipped in bottom row of $A$ | Forgot to move $+k\theta + b\dot{\theta}$ to the right-hand side of $J\ddot{\theta} = -k\theta - b\dot{\theta} + u$. | Write $\ddot{\theta} = -(k/J)\theta - (b/J)\dot{\theta} + (1/J)u$ before filling row 2 of $A$. |
| Used elementwise `*` instead of `@` in Tustin formula | Multiplied matrix elements componentwise with `*` (Hadamard product) instead of matrix multiplication. | Use row-by-column matrix multiplication (`mat_mul2`) for all matrix products. |

## 10. Resources
- **Åström & Murray — *Feedback Systems* (`fbswiki.org`, Ch. 6–7):** Free textbook on state-space linear systems, eigenvalues, and transfer functions `[VERIFIED 2026-10-15]`.
- **Brunton & Kutz — *Data-Driven Science and Engineering* (`databookuw.com`):** State-space modeling and discretization (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
## 11. Next modules
- Proceed to [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Sampling, Aliasing, Nyquist, $z$-Transform, Bilinear (Tustin) Pre-Warping, Biquads & Gaussian Covariance*).
