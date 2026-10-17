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
difficulty:
  math: 3
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
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
**Predict first (before you run it):** Commit to four numbers and one ordering before the block runs. For $\vec{r} = [0.30, 0.40, 0.00]^T\text{ m}$ and $\vec{F} = [0.0, -20.0, 15.0]^T\text{ N}$: (1) what is $\|\vec{r}\|$, and which component of $\vec{F}$ contributes to the axial projection? (2) What are the three components of $\vec{\tau} = \vec{r}\times\vec{F}$, and which of them has the largest magnitude? Two tells that a wrong answer is a mistake: $F_{\text{axial}}$ must be $-16.0\text{ N}$, and $-20.0\text{ N}$ means you dotted $\vec{F}$ with $\vec{r}$ itself instead of the unit vector $\hat{u}_r = [0.60, 0.80, 0.00]^T$; and $\vec{\tau}\cdot\vec{r}$ must be exactly $0.0\text{ N}\cdot\text{m}^2$, so a non-zero dot product means the middle ($y$) component was formed as $r_x F_z - r_z F_x$ instead of $r_z F_x - r_x F_z$.
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

### Graded package - three tools, then the arm's own Jacobian
[`exercises/00-foundations.T2.00b/`](../exercises/00-foundations.T2.00b/) turns this section into a test. `starter.py` holds seven holes: `dot3`, `cross3`, `axial_force` (projection onto the lever's UNIT direction), `moment`, `det2`, `coordinates_in_basis` (Cramer's rule, refusing a singular pair), and `in_basis`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00b/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00b -p 'test_*.py'
```

The tests are behavioural: the projection must not grow when the lever gets longer, the cross product must be antisymmetric and orthogonal to both inputs, the determinant must be zero for a collinear pair, a singular basis must raise `ValueError` rather than return infinities, and moments are checked at several levers. The transfer suite then uses the shared plant: a 0.20 kg payload's moment about the shoulder must equal `-m g x` *and* the shoulder torque from a finite-difference Jacobian, and the arm's Jacobian columns are used as a basis - tip velocity to joint rates and back, with the stretched pose refusing the inversion. Four planted faults - `flipped_cross`, `not_normalised`, `det_plus`, `hardcoded_moment` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*2D Vectors*) and [`00-foundations.T2.00a`](00-foundations.T2.00a.md) (*Matrix-Vector Multiplication*).
  - **Core Concepts to Review First:** 3D dot product $\vec{a}\cdot\vec{b} = \sum a_i b_i$ and 3D right-hand cross product $\vec{\tau} = \vec{r}\times\vec{F}$ in `## 3. Formalization` (Items 1–2) and `## 4. Worked example` above.
  - **Dot/Cross Product & Basis Change Study Links:** [3Blue1Brown: Dot Products and Cross Products (`3blue1brown.com`)](https://www.3blue1brown.com/lessons/cross-products) and [Lynch & Park *Modern Robotics* Ch. 3 (`hades.mech.northwestern.edu`)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) and [Track 02 Tier 2 (`02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied`)](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution ---
import math


def dot3(a, b):
    """The 3D dot product."""
    # TODO 1: a_x b_x + a_y b_y + a_z b_z
    ...


def cross3(a, b):
    """The 3D cross product a x b, right-handed."""
    # TODO 2: three components, each a 2x2 difference
    ...


def axial_force(force, lever):
    """The component of `force` along the lever arm, in newtons."""
    # TODO 3: project onto the lever's UNIT direction - a longer lever must not multiply the force
    ...


def moment(lever, force):
    """The moment vector r x F in N*m."""
    # TODO 4: order matters - r x F is not F x r
    ...


def det2(b1, b2):
    """Determinant of the matrix whose columns are b1 = [a, c] and b2 = [b, d]."""
    # TODO 5: ad - bc; zero means the two directions are collinear
    ...


def coordinates_in_basis(vector, b1, b2):
    """(c1, c2) with c1*b1 + c2*b2 == vector; ValueError when the basis is singular."""
    # TODO 6: Cramer's rule, and refuse |det| < 1e-12 instead of returning inf or nan
    ...


def in_basis(vector, b1, b2):
    """Rebuild the vector from its coordinates."""
    # TODO 7: c1*b1 + c2*b2
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $\vec{r} = [0.25, 0.00, 0.10]^T\text{ m}$ and $\vec{F} = [10.0, 30.0, -20.0]^T\text{ N}$ give $\vec{\tau} = [-3.0, 6.0, 7.5]^T\text{ N}\cdot\text{m}$ with $\vec{\tau}\cdot\vec{F} = 0.0$; the worked projection is $-16.0\text{ N}$; $\det([3.0, 1.5],[2.0, 4.0]) = 9.0$.

### Hint ladder
1. **The cross product is three copies of one $2\times2$ determinant.** $\tau_x = r_yF_z - r_zF_y$, $\tau_y = r_zF_x - r_xF_z$, $\tau_z = r_xF_y - r_yF_x$. The middle term's sign is the one people flip: with $r_x = 0.25$, $r_z = 0.10$ and $F_z = -20.0$ it is $0.10(10.0) - 0.25(-20.0) = +6.0$, not $-6.0$.
2. **Normalise before projecting, or length leaks into force.** $\lVert r\rVert = \sqrt{0.30^2 + 0.40^2} = 0.50$, so the unit lever is $(0.6, 0.8, 0)$ and $\vec{F}\cdot\hat{r} = 0(-0.6) + (-20)(0.8) + 15(0) = -16.0\text{ N}$. Projecting on the raw lever gives $-12.8$, and doubling the lever to $(3.0, 4.0, 0)$ would double it again - a wrench whose force grows with the handle.
3. **A basis is invertible exactly when its determinant is not zero.** For columns $b_1 = [a, c]$ and $b_2 = [b, d]$, $\det = ad - bc$ is the signed area they span; $b_1 = [1,2]$, $b_2 = [2,4]$ gives $4 - 4 = 0$ and the pair cannot reach every vector, so `coordinates_in_basis` must raise rather than divide by roughly zero.
4. **Check the round trip, not the arithmetic.** Rebuilding $c_1b_1 + c_2b_2$ from your own coordinates and comparing with the input vector catches a swapped Cramer numerator faster than re-deriving it: for $b_1 = [2,0]$, $b_2 = [1,1]$ and $v = [5,3]$ the answers are $c_1 = 1$, $c_2 = 3$.

### Full Solution
```python
import math


def dot3(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross3(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def axial_force(force, lever):
    length = math.sqrt(dot3(lever, lever))
    if length == 0.0:
        raise ValueError("a zero-length lever has no direction to project onto")
    return dot3(force, [component / length for component in lever])


def moment(lever, force):
    return cross3(lever, force)


def det2(b1, b2):
    return b1[0] * b2[1] - b2[0] * b1[1]


def coordinates_in_basis(vector, b1, b2):
    det = det2(b1, b2)
    if abs(det) < 1e-12:
        raise ValueError("singular basis: det = %.3e" % det)
    return ((vector[0] * b2[1] - b2[0] * vector[1]) / det,
            (b1[0] * vector[1] - vector[0] * b1[1]) / det)


def in_basis(vector, b1, b2):
    c1, c2 = coordinates_in_basis(vector, b1, b2)
    return [c1 * b1[0] + c2 * b2[0], c1 * b1[1] + c2 * b2[1]]


# The exercise: the lever arm and payload force from section 5.
r = [0.25, 0.00, 0.10]
F = [10.0, 30.0, -20.0]
tau = moment(r, F)

assert all(math.isclose(got, want, abs_tol=1e-9) for got, want in zip(tau, [-3.0, 6.0, 7.5]))
assert math.isclose(dot3(tau, F), 0.0, abs_tol=1e-9)
assert math.isclose(axial_force([0.0, -20.0, 15.0], [0.30, 0.40, 0.00]), -16.0, abs_tol=1e-9)
assert math.isclose(det2([3.0, 1.5], [2.0, 4.0]), 9.0, abs_tol=1e-12)
assert math.isclose(det2([1.0, 2.0], [2.0, 4.0]), 0.0, abs_tol=1e-12)
rebuild = in_basis([5.0, 3.0], [2.0, 0.0], [1.0, 1.0])
assert all(math.isclose(got, want, abs_tol=1e-12) for got, want in zip(rebuild, [5.0, 3.0]))
try:
    coordinates_in_basis([1.0, 1.0], [1.0, 2.0], [2.0, 4.0])
except ValueError:
    pass
else:
    raise AssertionError("a collinear basis must be refused, not inverted")

print("tau=(%.1f, %.1f, %.1f) N*m | tau.F=%.1f | F_axial=%.1f N | det=%.1f"
      % (tau[0], tau[1], tau[2], dot3(tau, F), axial_force([0.0, -20.0, 15.0], [0.30, 0.40, 0.00]),
         det2([3.0, 1.5], [2.0, 4.0])))
```

Printed: `tau=(-3.0, 6.0, 7.5) N*m | tau.F=0.0 | F_axial=-16.0 N | det=9.0` - the moment, the orthogonality check that a sign flip survives, the projection that must not scale with the lever, and the determinant that decides invertibility.

### Break it on purpose
Inject the anti-commutation slip from the `## 8. Common mistakes` table and diagnose it without looking at the code, keeping $\vec{r} = [0.30, 0.40, 0.00]^T\text{ m}$ and $\vec{F} = [0.0, -20.0, 15.0]^T\text{ N}$:
- **Inject:** swap the operands, so the moment is computed as $\vec{F}\times\vec{r}$ instead of $\vec{r}\times\vec{F}$.
- **Symptom:** every component flips sign - $\vec{\tau} = [-6.0, +4.5, +6.0]^T\text{ N}\cdot\text{m}$ instead of $[6.0, -4.5, -6.0]^T$ - while $\vec{\tau}\cdot\vec{r}$ still reads $0.0\text{ N}\cdot\text{m}^2$ and $\|\vec{\tau}\|$ is still $9.60\text{ N}\cdot\text{m}$.
- **Diagnose:** orthogonality and magnitude are blind to the swap, so the usual assert cannot catch it; only the sign does. A $0.20\text{ kg}$ payload hanging at $x = 0.10\text{ m}$ must produce a moment about the shoulder of $-m g x = -0.1962\text{ N}\cdot\text{m}$ (a sagging, clockwise torque), and the swapped product returns $+0.1962\text{ N}\cdot\text{m}$, which would command the joint to lift instead of hold.
- **Fix:** put the lever arm first, $\vec{\tau} = \vec{r}\times\vec{F}$, then prove the sign on a case whose answer is known independently: the payload moment must come out $-0.1962\text{ N}\cdot\text{m}$ and $\vec{\tau}\cdot\vec{F}$ must vanish, so both orthogonality checks and the physical sign agree.

## 6. Simulation path
Run the worked example in Python, then open **Tab 5 (URDF / MuJoCo & STO)** in the MechaLab Workbench to inspect how 3D joint axes and link lever arms produce spatial torques across the 6-DOF arm.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00b`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

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

### Gate test
This is the exit examination for the whole Track 00 Tier 2 ladder - [`00-foundations.T2.00a`](00-foundations.T2.00a.md) through [`00-foundations.T2.00f`](00-foundations.T2.00f.md) - before Step 2.1 (`00-foundations.T2.01`). Questions 1-6 are this module's own three tools; 7-11 recap one module each, so the whole ladder is examined.
1. `[Concept: dot_product_projection]` Compute $\vec{a}\cdot\vec{b}$ (tolerance $\pm 10^{-9}$) for $\vec{a} = [2.0,\; -3.0,\; 1.0]^\top$ and $\vec{b} = [4.0,\; 1.0,\; -2.0]^\top$.
2. `[Concept: dot_product_projection]` A $\vec{r} = [0.30,\; 0.40,\; 0.00]^\top\text{m}$ lever carries $\vec{F} = [0.0,\; -20.0,\; 15.0]^\top\text{N}$. Compute the axial projection $\vec{F}\cdot\hat{u}_r$ in $\text{N}$ (tolerance $\pm 10^{-9}$), where $\hat{u}_r$ is the unit lever.
3. `[Concept: cross_product_3d_moment]` For $\vec{r} = [0.25,\; 0.00,\; 0.10]^\top\text{m}$ and $\vec{F} = [10.0,\; 30.0,\; -20.0]^\top\text{N}$, compute $\tau_y = r_z F_x - r_x F_z$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: cross_product_3d_moment]` Which statement about the moment vector is true?
   - **A.** $\vec{r}\times\vec{F} = -(\vec{F}\times\vec{r})$, and the result is orthogonal to both $\vec{r}$ and $\vec{F}$.
   - **B.** $\vec{r}\times\vec{F} = \vec{F}\times\vec{r}$, so the order does not matter.
   - **C.** The moment is parallel to $\vec{r}$ whenever the force is perpendicular to the lever.
   - **D.** The magnitude of the moment depends only on $\|\vec{F}\|$.
5. `[Concept: basis_change_and_invertibility]` Compute $\det(B) = ad - bc$ (tolerance $\pm 10^{-9}$) for $B = \begin{bmatrix} 3.0 & 2.0 \\ 1.5 & 4.0 \end{bmatrix}$ whose columns are $[3.0, 1.5]^\top$ and $[2.0, 4.0]^\top$.
6. `[Concept: basis_change_and_invertibility]` A pair of basis columns has $\det(B) = 0$. What must `coordinates_in_basis` do?
   - **A.** Raise `ValueError`: the columns are collinear, so the pair cannot span the plane and the coordinates do not exist.
   - **B.** Return $(0.0, 0.0)$ and let the caller notice.
   - **C.** Divide by the determinant anyway; the infinities are informative.
   - **D.** Transpose the basis and retry.
7. `[Concept: finite_difference_derivative_and_integral] [Concept: matrix_vector_multiplication] [Concept: state_vector_one_step_update]` For `00-foundations.T2.00a`'s $A_d = \begin{bmatrix} 1.0 & 0.01 \\ -1.0 & 0.90 \end{bmatrix}$ and $B_d = [0.0,\; 0.01]^\top$, one step from $\vec{x} = [0.20,\; 1.00]^\top$ with $u = 0$ gives $x_1$. Compute $x_1$ in $\text{m}$ (tolerance $\pm 10^{-9}$).
8. `[Concept: first_order_ode_time_constant] [Concept: second_order_ode_wn_zeta] [Concept: characteristic_polynomial_roots]` For `00-foundations.T2.00c`'s oscillator with $m = 0.50\,\text{kg}$ and $k = 200.0\,\text{N/m}$, compute $\omega_n = \sqrt{k/m}$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$).
9. `[Concept: complex_numbers_and_euler_formula] [Concept: complex_impedance_and_transfer_function] [Concept: bode_magnitude_db_and_phase]` For `00-foundations.T2.00d`'s complex number $z = 3.0 + j4.0$, compute $|z| = \sqrt{x^2 + y^2}$ (tolerance $\pm 10^{-9}$).
10. `[Concept: laplace_poles_and_zeros] [Concept: continuous_state_space_matrices] [Concept: discrete_state_transition_euler_tustin]` For `00-foundations.T2.00e`'s companion form with $J = 2.0\,\text{kg}\cdot\text{m}^2$ and $k = 50.0\,\text{N}\cdot\text{m/rad}$ (any damping), compute $\det(A) = k/J$ in $\text{s}^{-2}$ (tolerance $\pm 10^{-9}$).
11. `[Concept: nyquist_sampling_and_aliasing] [Concept: tustin_frequency_prewarping_and_biquad] [Concept: gaussian_variance_and_covariance_matrix]` Which triple is correct for `00-foundations.T2.00f`?
   - **A.** Sampling represents only frequencies up to $f_s/2$, a faster tone folds to $|f - k f_s|$, and a propagated covariance is a sandwich $A\Sigma A^\top + Q$.
   - **B.** Sampling represents any frequency, aliasing only shifts phase, and covariance is a scalar variance.
   - **C.** The Nyquist frequency is $2f_s$, aliasing doubles the amplitude, and pre-warping is unnecessary below $1\,\text{kHz}$.
   - **D.** Bilinear discretization is exact at every frequency, so no pre-warping is ever needed.

**Gate answer key:**
```python
import math

g1_dot = 2.0 * 4.0 + (-3.0) * 1.0 + 1.0 * (-2.0)
r, F = [0.30, 0.40, 0.0], [0.0, -20.0, 15.0]
g2_axial = sum(f * c for f, c in zip(F, [component / math.sqrt(sum(v * v for v in r)) for component in r]))
g3_tau_y = 0.10 * 10.0 - 0.25 * (-20.0)
g4_choice = "A"
g5_det = 3.0 * 4.0 - 2.0 * 1.5
g6_choice = "A"
g7_x1 = 1.0 * 0.20 + 0.01 * 1.00 + 0.0 * 0.0
g8_wn = math.sqrt(200.0 / 0.50)
g9_mag = math.sqrt(3.0 * 3.0 + 4.0 * 4.0)
g10_det_A = 50.0 / 2.0
g11_choice = "A"

assert math.isclose(g1_dot, 3.0, rel_tol=1e-9)
assert math.isclose(g2_axial, -16.0, rel_tol=1e-9)
assert math.isclose(g3_tau_y, 6.0, rel_tol=1e-9)
assert g4_choice == "A"
assert math.isclose(g5_det, 9.0, rel_tol=1e-9)
assert g6_choice == "A"
assert math.isclose(g7_x1, 0.21, rel_tol=1e-9)
assert math.isclose(g8_wn, 20.0, rel_tol=1e-9)
assert math.isclose(g9_mag, 5.0, rel_tol=1e-9)
assert math.isclose(g10_det_A, 25.0, rel_tol=1e-9)
assert g11_choice == "A"
```
- **Pass mark:** $\ge 80\%$ ($4/5$ on Skip test; $\ge 9/11$ on Gate test). Missed Gate Q1-Q2: study `00-foundations.T2.00b`; Q3-Q6: `00-foundations.T2.00b`; Q7: `00-foundations.T2.00a`; Q8: `00-foundations.T2.00c`; Q9: `00-foundations.T2.00d`; Q10: `00-foundations.T2.00e`; Q11: `00-foundations.T2.00f`.

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
