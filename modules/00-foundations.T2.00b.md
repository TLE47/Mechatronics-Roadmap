---
id: 00-foundations.T2.00b
title: "Vectors, Dot & Cross Products, Linear Independence & Change of Basis"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00a
new_concepts:
  - dot_product_projection
  - cross_product_3d_moment
  - basis_change_and_invertibility
uses:
  - matrix_vector_multiplication
  - radians_unit_circle_and_atan2
  - 2d_vectors_and_components
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
In 3D robot manipulators and field-oriented brushless drives, forces and magnetic fields act along tilted 3D axes while joints rotate around specific hinge vectors. You need the dot product to project forces onto a link axis, the 3D cross product to compute the moment vector $\vec{\tau} = \vec{r} \times \vec{F}$, and basis-change determinants to detect when a robot arm hits a kinematic singularity. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Hold a wrench horizontally along your desk pointing northeast, and pull on the wrench handle with a string angled partly inward and partly upward. Only the component of pull parallel to the wrench shaft tries to stretch or compress the metal handle—that parallel overlap is measured by the **dot product**. Meanwhile, the components of pull perpendicular to the handle twist the bolt around an axis perpendicular to both the handle and the string (found by curling the fingers of your right hand from the wrench vector toward the force vector; your thumb points along the torque axis)—that perpendicular twist vector is the **cross product**. Finally, if two joint axes line up parallel to each other, they can no longer span 3D space independently, which is what a zero determinant warns you about.

## 3. Formalization
1. **3D Dot Product ($\vec{a} \cdot \vec{b}$):** Given force $\vec{F} = [F_x, F_y, F_z]^T$ in newtons ($\text{N}$) and unit link direction $\hat{u}_r = \vec{r} / \|\vec{r}\|$ (dimensionless), the axial force projection $F_{\text{axial}}$ in newtons ($\text{N}$) is:

$$
F_{\text{axial}} = \vec{F} \cdot \hat{u}_r = F_x u_{rx} + F_y u_{ry} + F_z u_{rz}
$$

   For $\vec{r} = [0.30, 0.40, 0.00]^T\text{ m}$ ($\|\vec{r}\| = 0.50\text{ m}$, so $\hat{u}_r = [0.60, 0.80, 0.00]^T$) and $\vec{F} = [0.0, -20.0, 15.0]^T\text{ N}$, $F_{\text{axial}} = (0)(0.60) + (-20.0\text{ N})(0.80) + (15.0\text{ N})(0) = -16.0\text{ N}$.
2. **3D Cross Product ($\vec{\tau} = \vec{r} \times \vec{F}$):** The 3D moment vector $\vec{\tau}$ in newton-meters ($\text{N}\cdot\text{m}$) at the shoulder origin is:

$$
\vec{\tau} = \vec{r} \times \vec{F} = \begin{bmatrix} r_y F_z - r_z F_y \\ r_z F_x - r_x F_z \\ r_x F_y - r_y F_x \end{bmatrix}
$$

   Substituting $\vec{r} = [0.30, 0.40, 0.00]^T\text{ m}$ and $\vec{F} = [0.0, -20.0, 15.0]^T\text{ N}$ gives $\vec{\tau} = [(0.40)(15.0) - 0,\; 0 - (0.30)(15.0),\; (0.30)(-20.0) - 0]^T = [6.0, -4.5, -6.0]^T\text{ N}\cdot\text{m}$, which is strictly orthogonal to $\vec{r}$ since $\vec{\tau}\cdot\vec{r} = 1.80 - 1.80 + 0 = 0.0\text{ N}\cdot\text{m}^2$.
3. **Linear Independence & Basis Determinant:** Two 2D column vectors $\vec{b}_1 = [a, c]^T$ and $\vec{b}_2 = [b, d]^T$ form an invertible basis matrix $B$ iff $\det(B) = a d - b c \neq 0$. For $B = \begin{bmatrix} 1.0 & 2.0 \\ 2.0 & 4.0 \end{bmatrix}$, $\det(B) = (1.0)(4.0) - (2.0)(2.0) = 0.0$ (collinear/singular).

## 4. Worked example
Compute the axial force projection $F_{\text{axial}} = \vec{F}\cdot\hat{u}_r$ and 3D shoulder torque $\vec{\tau} = \vec{r}\times\vec{F}$ for lever arm $\vec{r} = [0.30, 0.40, 0.00]^T\text{ m}$ and wrist force $\vec{F} = [0.0, -20.0, 15.0]^T\text{ N}$, and assert orthogonality $\vec{\tau}\cdot\vec{r} = 0$.

```python
import math

def dot3(a: list[float], b: list[float]) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

def cross3(a: list[float], b: list[float]) -> list[float]:
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]

r_m = [0.30, 0.40, 0.00]
F_n = [0.0, -20.0, 15.0]

r_norm = math.sqrt(dot3(r_m, r_m))
u_r = [c / r_norm for c in r_m]
f_axial_n = dot3(F_n, u_r)
tau_nm = cross3(r_m, F_n)

assert math.isclose(r_norm, 0.50, rel_tol=1e-9)
assert math.isclose(f_axial_n, -16.0, rel_tol=1e-9)
assert all(math.isclose(a, b, abs_tol=1e-9) for a, b in zip(tau_nm, [6.0, -4.5, -6.0]))
assert math.isclose(dot3(tau_nm, r_m), 0.0, abs_tol=1e-9)
print(f"F_axial={f_axial_n:.1f} N, tau={tau_nm} N*m")
```
Expected output:
```text
F_axial=-16.0 N, tau=[6.0, -4.5, -6.0] N*m
```

## 5. Exercise
Given lever arm $\vec{r} = [0.25, 0.00, 0.10]^T\text{ m}$ and payload force $\vec{F} = [10.0, 30.0, -20.0]^T\text{ N}$, compute $\vec{\tau} = \vec{r}\times\vec{F}$ and verify that $\vec{\tau}\cdot\vec{F} = 0.0\text{ N}^2\cdot\text{m}$. Expected result: `tau = [-3.0, 6.0, 7.5] N*m` (tolerance $\pm 10^{-6}\text{ N}\cdot\text{m}$).
- **If your result differs:** Check the middle ($y$) component sign of the cross product: $\tau_y = r_z F_x - r_x F_z = (0.10)(10.0) - (0.25)(-20.0) = +6.0\text{ N}\cdot\text{m}$, not $-6.0\text{ N}\cdot\text{m}$.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*2D Vectors*) and [`00-foundations.T2.00a`](00-foundations.T2.00a.md) (*Matrix-Vector Multiplication*).
  - **Core Concepts to Review First:** 3D dot product $\vec{a}\cdot\vec{b} = \sum a_i b_i$ and 3D right-hand cross product $\vec{\tau} = \vec{r}\times\vec{F}$ in `## 3. Formalization` (Items 1–2) and `## 4. Worked example` above.
  - **Dot/Cross Product & Basis Change Study Links:** [3Blue1Brown: Dot Products and Cross Products (`3blue1brown.com`)](https://www.3blue1brown.com/lessons/cross-products) and [Lynch & Park *Modern Robotics* Ch. 3 (`hades.mech.northwestern.edu`)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) and [Track 02 Tier 2 (`02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied`)](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied).

## 6. Simulation path
Run the worked example in Python, then open **Tab 5 (URDF / MuJoCo & STO)** in the MechaLab Workbench to inspect how 3D joint axes and link lever arms produce spatial torques across the 6-DOF arm.

No hardware required for this module (`hardware_required: false`). In Track 03 (`Step 2.4`), the Clarke transform changes basis from three $120^\circ$-spaced stator coil axes $(a, b, c)$ into two orthogonal $(\alpha, \beta)$ axes via this exact projection:
```text
[3-Phase Coil Currents ia, ib, ic] ---> [Change-of-Basis Dot Projections] ---> [Orthogonal i_alpha, i_beta]
```
Pass/fail verification in simulation: `F_axial == -16.0 N` and `tau == [6.0, -4.5, -6.0] N*m`.


```mermaid
flowchart LR
    A["00-foundations.T2.00b: dot_product_projection"] --> B["cross_product_3d_moment"]
    B --> C["basis_change_and_invertibility"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: dot_product_projection]` Compute the dot product $\vec{a}\cdot\vec{b}$ (tolerance $\pm 10^{-9}$) for $\vec{a} = [2.0, -3.0, 1.0]^T$ and $\vec{b} = [4.0, 1.0, -2.0]^T$.
2. `[Apply] [Concept: cross_product_3d_moment]` Compute the $z$-component $\tau_z$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$) of $\vec{\tau} = \vec{r}\times\vec{F}$ for $\vec{r} = [0.20, 0.10, 0.0]^T\text{ m}$ and $\vec{F} = [5.0, 25.0, 0.0]^T\text{ N}$.
3. `[Transfer] [Concept: basis_change_and_invertibility]` Compute the determinant $\det(B) = a d - b c$ (tolerance $\pm 10^{-9}$) of $B = \begin{bmatrix} 3.0 & 2.0 \\ 1.5 & 4.0 \end{bmatrix}$.
4. `[Concept: dot_product_projection]` What does a dot product $\vec{a}\cdot\vec{b} = 0$ between two non-zero 3D vectors tell you geometrically?
   - **A.** The vectors are parallel and point in the same direction.
   - **B.** The vectors are perpendicular ($90^\circ$ apart).
   - **C.** The cross product $\vec{a}\times\vec{b}$ is also zero.
   - **D.** The vectors point in opposite directions ($180^\circ$ apart).
5. `[Spaced review -> 00-foundations.T2.00a — Concept: matrix_vector_multiplication] [Concept: basis_change_and_invertibility]` Compute the first entry $(B\vec{v})_0$ (tolerance $\pm 10^{-9}$) for $B = \begin{bmatrix} 3.0 & 2.0 \\ 1.5 & 4.0 \end{bmatrix}$ and $\vec{v} = \begin{bmatrix} 2.0 \\ -1.0 \end{bmatrix}$.

**Answer key:**
```python
import math

q1_dot = 2.0 * 4.0 + (-3.0) * 1.0 + 1.0 * (-2.0)
q2_tau_z = 0.20 * 25.0 - 0.10 * 5.0
q3_det = 3.0 * 4.0 - 2.0 * 1.5
q4_choice = "B"
q5_row0 = 3.0 * 2.0 + 2.0 * (-1.0)

assert math.isclose(q1_dot, 3.0, rel_tol=1e-9)
assert math.isclose(q2_tau_z, 4.5, rel_tol=1e-9)
assert math.isclose(q3_det, 9.0, rel_tol=1e-9)
assert q4_choice == "B"
assert math.isclose(q5_row0, 4.0, rel_tol=1e-9)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q4, study `## 3. Formalization`; if you missed Q2 or Q3, study `## 4. Worked example`; if you missed Q5, study `## 3. Formalization` (and review `00-foundations.T2.00a`). On pass, proceed to `## 10. Next modules`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Torque vector points in the exact opposite direction ($-\vec{\tau}$) | Computed $\vec{F}\times\vec{r}$ instead of $\vec{r}\times\vec{F}$ (cross product is anti-commutative). | Always place the lever arm $\vec{r}$ (from joint to force application point) first in $\vec{r}\times\vec{F}$. |
| Cross product $\vec{\tau}$ fails orthogonality check $\vec{\tau}\cdot\vec{r} = 0$ | Flipped the sign of the middle ($y$) component ($r_x F_z - r_z F_x$ instead of $r_z F_x - r_x F_z$). | Assert `abs(dot3(tau, r)) < 1e-9` and `abs(dot3(tau, F)) < 1e-9` in every kinematics script. |
| Matrix inversion crashes with `LinAlgError: Singular matrix` | Arm is fully stretched out ($\theta_2 = 0$), making basis/Jacobian columns collinear ($\det = 0$). | Check $\lvert \det(B)\rvert  > 10^{-6}$ or use damped least-squares before inverting. |

## 9. Resources
- **Gilbert Strang — [*Linear Algebra and Learning from Data* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md) & [3Blue1Brown Cross Products](https://www.3blue1brown.com/lessons/cross-products):** Orthogonality, projections, determinants, and change of basis `[VERIFIED 2026-10-15]`.
- **Lynch & Park — [*Modern Robotics* (`hades.mech.northwestern.edu`)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics) ([`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md)):** Spatial moments $\vec{r}\times\vec{F}$ and coordinate frames `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`00-foundations.T2.00c`](00-foundations.T2.00c.md) (*First- & Second-Order ODEs, Characteristic Roots, Natural Frequency & Damping Ratio*).
