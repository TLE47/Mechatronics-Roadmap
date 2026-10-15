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
---

## 1. Why This Matters
In 3D robot arms and field-oriented motor drives, sensors measure vectors in one coordinate frame (such as an IMU mounted on a tilted wrist or three stator coils spaced $120^\circ$ apart), while actuators apply torques around 3D joint axes. You need the dot product to project forces onto motion axes, the 3D cross product to compute torque $\vec{\tau} = \vec{r} \times \vec{F}$, and change-of-basis matrices to translate vectors cleanly between coordinate frames.

## 2. Mental Model
1. **Dot Product ($\vec{a} \cdot \vec{b}$):** Measures how much two vectors point in the same direction:
   $$\vec{a} \cdot \vec{b} = a_x b_x + a_y b_y + a_z b_z = \|\vec{a}\|\,\|\vec{b}\|\cos\theta$$
   If $\vec{a} \cdot \vec{b} = 0$, the vectors are perpendicular (orthogonal).
2. **Cross Product ($\vec{a} \times \vec{b}$):** Produces a third vector perpendicular to both $\vec{a}$ and $\vec{b}$ following the right-hand rule, with magnitude $\|\vec{a}\|\,\|\vec{b}\|\sin\theta$:
   $$\vec{r} \times \vec{F} = \begin{bmatrix} r_y F_z - r_z F_y \\ r_z F_x - r_x F_z \\ r_x F_y - r_y F_x \end{bmatrix}$$
3. **Linear Independence & Change of Basis:** Three 3D basis vectors form an invertible matrix $B$ if none of them lies in the plane of the other two ($\det(B) \neq 0$). Multiplying by $B^{-1}$ converts coordinates from the standard frame into that new basis; if two axes line up ($\det(B) = 0$), you lose a degree of freedom (a kinematic singularity).

## 3. Worked Example
A robot link extends from the shoulder at origin $(0,0,0)$ to the wrist at $\vec{r} = [0.30,\; 0.40,\; 0.00]^T\text{ m}$. An external payload force $\vec{F} = [0.0,\; -20.0,\; 15.0]^T\text{ N}$ acts at the wrist.
- **Step 1 (Dot product — force along the link):**
  The link length is $\|\vec{r}\| = \sqrt{0.30^2 + 0.40^2} = 0.50\text{ m}$, so the unit vector along the link is $\hat{u}_r = [0.60,\; 0.80,\; 0.00]^T$.
  The axial tension force is $F_{\text{axial}} = \vec{F} \cdot \hat{u}_r = (0)(0.60) + (-20.0)(0.80) + (15.0)(0) = -16.0\text{ N}$ (compression).
- **Step 2 (Cross product — 3D torque at the shoulder):**
  $$\vec{\tau} = \vec{r} \times \vec{F} = \begin{bmatrix} (0.40)(15.0) - (0)(-20.0) \\ (0)(0) - (0.30)(15.0) \\ (0.30)(-20.0) - (0.40)(0) \end{bmatrix} = \begin{bmatrix} 6.0 \\ -4.5 \\ -6.0 \end{bmatrix}\text{ N}\cdot\text{m}$$
- **Step 3 (Orthogonality sanity check):**
  The torque vector $\vec{\tau}$ must be perpendicular to the lever arm $\vec{r}$:
  $$\vec{\tau} \cdot \vec{r} = (6.0)(0.30) + (-4.5)(0.40) + (-6.0)(0) = 1.80 - 1.80 + 0 = 0\text{ N}\cdot\text{m}^2$$

## 4. Code
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
Given lever arm $\vec{r} = [0.25,\; 0.00,\; 0.10]^T\text{ m}$ and force $\vec{F} = [10.0,\; 30.0,\; -20.0]^T\text{ N}$, compute $\vec{\tau} = \vec{r} \times \vec{F}$ and verify that $\vec{\tau} \cdot \vec{F} = 0$.
- **Check:** $\vec{\tau} = [-3.0,\; 6.0,\; 7.5]^T\text{ N}\cdot\text{m}$ and $\vec{\tau} \cdot \vec{F} = -30.0 + 180.0 - 150.0 = 0.0$.

## 6. Gate Test
1. If $\vec{a} \cdot \vec{b} < 0$, what does that tell you about the angle $\theta$ between $\vec{a}$ and $\vec{b}$? (Answer: $\theta > 90^\circ$; the vectors point partially opposite each other.)
2. What happens to the determinant $\det(B)$ of a $2\times 2$ Jacobian or basis matrix when a 2-link planar arm stretches completely straight out ($\theta_2 = 0$)? (Answer: The two column vectors become collinear/linearly dependent, so $\det(B) = 0$ and the matrix cannot be inverted.)

## 7. Resources
- **3Blue1Brown — Essence of Linear Algebra (Ch. 1–9):** Visual intuition for basis vectors, determinants, dot products, and cross products `[UNVERIFIED]`.
- **Track 00 (`00-foundations/README.md`):** Links directly into Tier 2 3D rotations and Tier 2 Track 02 Jacobian kinematics `[VERIFIED 2026-10-15]`.
