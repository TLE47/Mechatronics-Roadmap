---
id: 00-foundations.T2.00e
title: "State Vectors, Continuous x_dot = Ax + Bu, Eigenvalues, Stability & ZOH Discretization"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00d
new_concepts:
  - continuous_state_space_matrices
  - eigenvalues_and_modal_stability
  - matrix_exponential_zoh_discretization
uses:
  - state_vector_one_step_update
  - second_order_ode_wn_zeta
  - complex_numbers_and_euler_formula
est_hours: 4.5
---

## 1. Why This Matters
Step 2.1 (`00-foundations.T2.01`) models a two-mass motor-and-load drive train as a 4-state continuous state-space system $\dot{x} = A_c x + B_c u$ and converts it into a discrete update $x_{k+1} = A_d x_k + B_d u_k$. This module shows you how any high-order differential equation packs cleanly into first-order matrix form $\dot{x} = A_c x + B_c u$, how the eigenvalues of $A_c$ reveal every natural resonance and damping mode, and how the Zero-Order Hold (ZOH) matrix exponential $e^{A_c \Delta t}$ produces an exact discrete step.

## 2. Mental Model
1. **Packing Higher-Order ODEs into $\dot{x} = A_c x + B_c u$:**
   Instead of writing second derivatives $\ddot{\theta}$, define a column vector of states $x = [\theta,\; \omega]^T$. Then $\dot{\theta} = \omega$ (Row 1) and $\dot{\omega} = -\frac{k}{J}\theta - \frac{b}{J}\omega + \frac{1}{J}u$ (Row 2):
   $$\begin{bmatrix} \dot{\theta} \\ \dot{\omega} \end{bmatrix} = \underbrace{\begin{bmatrix} 0 & 1 \\ -k/J & -b/J \end{bmatrix}}_{A_c} \begin{bmatrix} \theta \\ \omega \end{bmatrix} + \underbrace{\begin{bmatrix} 0 \\ 1/J \end{bmatrix}}_{B_c} u$$
2. **Eigenvalues ($\det(\lambda I - A_c) = 0$):**
   The eigenvalues $\lambda_i$ of $A_c$ are the exact characteristic roots of the system:
   - Continuous stability requires $\operatorname{Re}(\lambda_i) < 0$ for all eigenvalues.
   - Complex conjugate eigenvalues $\lambda = -\sigma \pm j\omega_d$ oscillate at $\omega_d$ and decay as $e^{-\sigma t}$.
3. **Zero-Order Hold (ZOH) Discretization:**
   A digital microcontroller holds the command $u_k$ constant over each sample interval $\Delta t$. The exact discrete update is $x_{k+1} = A_d x_k + B_d u_k$ where $A_d = e^{A_c \Delta t} = I + A_c \Delta t + \frac{1}{2!}(A_c \Delta t)^2 + \dots$, and discrete stability requires $|\lambda(A_d)| < 1$.

## 3. Worked Example
For a damped joint with $J = 0.02\text{ kg}\cdot\text{m}^2$, $k = 8.0\text{ N}\cdot\text{m/rad}$, and $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$:
- **Step 1 (Form $A_c$ and $B_c$):**
  $$A_c = \begin{bmatrix} 0 & 1 \\ -400 & -20 \end{bmatrix}, \quad B_c = \begin{bmatrix} 0 \\ 50 \end{bmatrix}$$
- **Step 2 (Find eigenvalues of $A_c$):**
  $$\det(\lambda I - A_c) = \lambda(\lambda + 20) + 400 = \lambda^2 + 20\lambda + 400 = 0 \implies \lambda = -10 \pm j17.3205$$
  Since $\operatorname{Re}(\lambda) = -10 < 0$, the continuous system is asymptotically stable with $\omega_n = |\lambda| = \sqrt{10^2 + 17.3205^2} = 20.0\text{ rad/s}$.
- **Step 3 (Discretize at $\Delta t = 0.001\text{ s}$):**
  Evaluating the matrix exponential $A_d = e^{A_c \Delta t}$ yields discrete eigenvalues $|\lambda_d| = |e^{(-10 \pm j17.3205)(0.001)}| = e^{-0.01} \approx 0.99005 < 1$.

## 4. Code
```python
import cmath
import math

def matmul(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    n, m, p = len(A), len(B), len(B[0])
    return [[sum(A[i][k] * B[k][j] for k in range(m)) for j in range(p)] for i in range(n)]

def expm_taylor_3x3(M: list[list[float]], terms: int = 18) -> list[list[float]]:
    res = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    term = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for k in range(1, terms + 1):
        term = matmul(term, M)
        term = [[val / float(k) for val in row] for row in term]
        res = [[res[i][j] + term[i][j] for j in range(3)] for i in range(3)]
    return res

def eigvals_2x2(A: list[list[float]]) -> tuple[complex, complex]:
    tr = A[0][0] + A[1][1]
    det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return (tr + disc) / 2.0, (tr - disc) / 2.0

Ac = [[0.0, 1.0],
      [-400.0, -20.0]]
Bc = [0.0, 50.0]
dt = 0.001

eig_c1, eig_c2 = eigvals_2x2(Ac)
assert eig_c1.real < 0.0 and eig_c2.real < 0.0
assert math.isclose(abs(eig_c1), 20.0, rel_tol=1e-9)

aug = [
    [Ac[0][0] * dt, Ac[0][1] * dt, Bc[0] * dt],
    [Ac[1][0] * dt, Ac[1][1] * dt, Bc[1] * dt],
    [0.0, 0.0, 0.0],
]
exp_aug = expm_taylor_3x3(aug)
Ad = [row[:2] for row in exp_aug[:2]]

eig_d1, eig_d2 = eigvals_2x2(Ad)
assert abs(eig_d1) < 1.0 and abs(eig_d2) < 1.0
assert math.isclose(abs(eig_d1), math.exp(-10.0 * dt), rel_tol=1e-9)
print(f"eig_c={eig_c1.real:.2f}+{eig_c1.imag:.2f}j, |eig_d|={abs(eig_d1):.5f}, Ad[0,1]={Ad[0][1]:.6f}")
```
Expected output:
```text
eig_c=-10.00+17.32j, |eig_d|=0.99005, Ad[0,1]=0.000990
```

## 5. Exercise
Modify the viscous damping to $b = 0.0\text{ N}\cdot\text{m}\cdot\text{s/rad}$ (undamped oscillator), compute the eigenvalues of $A_c$, and verify that $|\lambda(A_d)| = 1.00000$ under exact ZOH discretization, whereas forward Euler $I + A_c \Delta t$ has $|\lambda| = \sqrt{1 + (20\Delta t)^2} > 1$ (artificially unstable!).
- **Check:** Exact ZOH gives $|\lambda(A_d)| = 1.0$, while forward Euler gives $|\lambda| = 1.00020 > 1$.

## 6. Gate Test
1. How do you check from the eigenvalues of $A_c$ vs. $A_d$ whether a linear system is stable? (Answer: Continuous $A_c$ requires $\operatorname{Re}(\lambda_i) < 0$ in the left half-plane; discrete $A_d$ requires $|\lambda_i| < 1$ inside the unit circle.)
2. For a 4-state two-mass drive train with states $[\theta_m, \omega_m, \theta_L, \omega_L]^T$, what are the dimensions of $A_c$ and $B_c$ for a single motor torque input $u$? (Answer: $A_c$ is $4 \times 4$ and $B_c$ is $4 \times 1$.)

## 7. Resources
- **Åström & Murray — *Feedback Systems* (Ch. 6–7):** State-space modeling, eigenvalues, and matrix exponentials (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 00 (`00-foundations/README.md`):** Directly unlocks Step 2.1 (`00-foundations.T2.01`) two-mass resonance state-space model `[VERIFIED 2026-10-15]`.
