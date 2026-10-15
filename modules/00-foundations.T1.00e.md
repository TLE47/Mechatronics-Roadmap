---
id: 00-foundations.T1.00e
title: "Position, Velocity, Acceleration, Force, Mass, Energy & Torque in a Loop"
track: "00"
tier: 1
prereqs:
  - 00-foundations.T1.00d
new_concepts:
  - discrete_kinematics_pos_vel_acc
  - newtons_second_law_and_torque
  - spring_energy_and_power
uses:
  - for_while_loops_and_functions
  - si_base_and_derived_units
  - 2d_vectors_and_components
est_hours: 4.0
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
Before Step 1.1 (`00-foundations.T1.01`) compares numerical integration stability on an oscillating joint, you must connect physical push (force and torque), inertia (mass and rotational inertia), and stored energy (kinetic and spring potential energy) inside a discrete time-stepping loop. This final Level -1 module turns Newton's Second Law and Hooke's spring law into a 15-line Python simulation whose energy balance you can audit at every step. Already know this? Take the Skip test or Gate test in section 7 first.

## 2. Intuition first
Attach a heavy wheeled cart to a wall with a coil spring, pull the cart back by $10\text{ cm}$, and let go. At the moment of release, the cart is motionless, so all the energy you put in is stored in the stretched spring coils. The spring pulls the cart toward the wall: force causes acceleration, acceleration builds up velocity, and velocity moves the cart's position. By the time the cart passes the unstretched center mark, the spring force is zero, yet the cart is moving at peak speed—all of the spring's stored energy has sloshed into the moving mass's momentum, which then compresses the spring on the other side.

## 3. Formalization
1. **Newton's Second Law and Hooke's Spring Law:** A cart of mass $m$ in kilograms ($\text{kg}$) at displacement $x$ in meters ($\text{m}$) pulled by a linear spring of stiffness $k$ in newtons per meter ($\text{N/m}$) experiences net restoring force $F_{\text{net}}$ in newtons ($\text{N}$) and acceleration $a$ in $\text{m/s}^2$:

$$
F_{\text{net}} = -k x, \qquad a = \frac{F_{\text{net}}}{m}
$$

   For $m = 2.0\text{ kg}$, $k = 50.0\text{ N/m}$, and $x_0 = 0.10\text{ m}$, $F_{\text{net}} = -(50.0\text{ N/m})(0.10\text{ m}) = -5.0\text{ N}$ and $a_0 = \frac{-5.0\text{ N}}{2.0\text{ kg}} = -2.5\text{ m/s}^2$.
2. **Rotational Analog (Torque $\tau$):** A perpendicular force $F_\perp = F\sin\phi$ in newtons ($\text{N}$) applied at lever arm radius $r$ in meters ($\text{m}$) produces torque $\tau$ in newton-meters ($\text{N}\cdot\text{m}$) on rotational inertia $J$ in $\text{kg}\cdot\text{m}^2$, causing angular acceleration $\alpha$ in $\text{rad/s}^2$:

$$
\tau = r F\sin\phi = J\alpha
$$

   For $r = 0.25\text{ m}$, $F = 20.0\text{ N}$, and $\phi = 90^\circ$, $\tau = (0.25\text{ m})(20.0\text{ N})(1.0) = 5.0\text{ N}\cdot\text{m}$.
3. **Discrete Loop Update and Mechanical Energy ($E$):** Over time step $\Delta t$ in seconds ($\text{s}$), velocity $v$ ($\text{m/s}$) and position $x$ ($\text{m}$) update sequentially (`v += a*dt; x += v*dt`), while total mechanical energy $E$ in joules ($\text{J} = \text{N}\cdot\text{m}$) sums kinetic and potential energy:

$$
E = \frac{1}{2}m v^2 + \frac{1}{2}k x^2
$$

   At release ($x_0 = 0.10\text{ m}, v_0 = 0.0\text{ m/s}$), $E_0 = 0 + 0.5(50.0\text{ N/m})(0.10\text{ m})^2 = 0.2500\text{ J}$, so peak speed at $x = 0$ is $v_{\max} = \sqrt{2 E_0 / m} = \sqrt{0.50\text{ J} / 2.0\text{ kg}} = 0.5000\text{ m/s}$.

## 4. Worked example
Simulate a $m = 2.0\text{ kg}$ mass on a $k = 50.0\text{ N/m}$ spring released from $x_0 = 0.10\text{ m}$, $v_0 = 0.0\text{ m/s}$ for $2,000$ steps of $\Delta t = 0.0005\text{ s}$ ($1.0\text{ s}$ total) and verify that total energy stays conserved at $0.2500\text{ J}$ and peak speed reaches $0.5000\text{ m/s}$.

```python
import math

m_kg = 2.0
k_nm = 50.0
x_m = 0.10
v_ms = 0.0
dt_s = 0.0005

e_initial_j = 0.5 * k_nm * (x_m**2) + 0.5 * m_kg * (v_ms**2)
v_peak_ms = 0.0

for _ in range(2000):
    f_net_n = -k_nm * x_m
    a_ms2 = f_net_n / m_kg
    v_ms = v_ms + a_ms2 * dt_s
    x_m = x_m + v_ms * dt_s
    if abs(v_ms) > v_peak_ms:
        v_peak_ms = abs(v_ms)

e_final_j = 0.5 * k_nm * (x_m**2) + 0.5 * m_kg * (v_ms**2)

assert math.isclose(e_initial_j, 0.25, rel_tol=1e-9)
assert math.isclose(e_final_j, e_initial_j, rel_tol=1e-3)
assert math.isclose(v_peak_ms, 0.50, rel_tol=1e-3)
print(f"E_init={e_initial_j:.4f} J, E_final={e_final_j:.4f} J, v_peak={v_peak_ms:.4f} m/s")
```
Expected output:
```text
E_init=0.2500 J, E_final=0.2500 J, v_peak=0.5000 m/s
```

## 5. Exercise
Add viscous damping $F_{\text{damp}} = -b v$ with $b = 4.0\text{ N}\cdot\text{s/m}$ to the loop (`f_net_n = -k_nm * x_m - b * v_ms`) and run for `4000` steps ($2.0\text{ s}$). Verify that $> 95\%$ of the initial $0.25\text{ J}$ energy is dissipated as heat (`e_final_j < 0.0125`).
- **If your result differs:** Check the sign on `-b * v_ms`; writing `+b * v_ms` injects energy (negative damping) and causes the oscillation to explode instead of decay.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00a`](00-foundations.T1.00a.md)–[`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Loops, SI Units & 2D Vectors*).
  - **Core Concepts to Review First:** Newton's second law $a = F_{\text{net}}/m$ with viscous damping $F_{\text{damp}} = -b v$, symplectic Euler updates (`v += a*dt; x += v*dt`), and total mechanical energy $E = \frac{1}{2}mv^2 + \frac{1}{2}kx^2$ in `## 3. Formalization` (Items 1–3) and `## 4. Worked example` above.
  - **Physics & Simulation Study Links:** [MyPhysicsLab: Interactive Mass-Spring-Damper Simulation & Equations (`myphysicslab.com`)](https://www.myphysicslab.com/springs/single-spring-en.html) and [R. H. Bishop *The Mechatronics Handbook* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md).
  - **Curriculum Reference:** [Track 00 Tier 1 (`00-foundations/README.md#tier-1-beginner--intuitive`)](../00-foundations/README.md#tier-1-beginner--intuitive) (Step 1.1 Calculus as `while` Loops).

## 6. Simulation path
Run the worked example in Python, then open **Tab 2 (Two-Mass & Notch Bode)** and **Tab 4 (Furuta Pendulum)** in the MechaLab Workbench to see coupled spring-mass-damper and pendulum energy loops in action.

No hardware required for this module (`hardware_required: false`). In Track 05 (`Step 1.6`), a closed-loop PD motor controller creates this exact spring-damper behavior electronically:
```text
[Encoder Angle x, Velocity v] ---> [MCU: tau = -Kp*x - Kd*v] ---> [Motor Torque = Virtual Spring + Damper]
```
Pass/fail verification in simulation: `E_init == 0.2500 J`, `E_final == 0.2500 J`, and `v_peak == 0.5000 m/s`.


```mermaid
flowchart LR
    A["00-foundations.T1.00e: discrete_kinematics_pos_vel_acc"] --> B["newtons_second_law_and_torque"]
    B --> C["spring_energy_and_power"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: complete the Skip test ($\ge 80\%$) to pass this module, or pass the 8-question Gate test ($\ge 80\%$) to test out of the entire Level -1 ladder (`00a`–`00e`).

### Skip test
1. `[Recall] [Concept: newtons_second_law_and_torque]` Compute the holding torque $\tau$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 0.01\text{ N}\cdot\text{m}$) required at the shoulder to hold a $2.0\text{ kg}$ payload horizontally at lever arm $r = 0.30\text{ m}$ under gravity $g = 9.81\text{ m/s}^2$.
2. `[Apply] [Concept: spring_energy_and_power]` Compute the total mechanical energy $E$ in joules (tolerance $\pm 10^{-4}\text{ J}$) of a $m = 1.0\text{ kg}$ mass moving at $v = 2.0\text{ m/s}$ while attached to a spring of stiffness $k = 40.0\text{ N/m}$ stretched by $x = 0.10\text{ m}$.
3. `[Transfer] [Concept: discrete_kinematics_pos_vel_acc]` Trace one step ($\Delta t = 0.01\text{ s}$) starting from $x_0 = 0.20\text{ m}, v_0 = 0.0\text{ m/s}$ with $m = 1.0\text{ kg}, k = 100.0\text{ N/m}$ using `a = -k*x/m; v += a*dt; x += v*dt`, and report $x_1$ in meters (tolerance $\pm 10^{-6}\text{ m}$).
4. `[Spaced review -> 00-foundations.T1.00d — Concept: radians_unit_circle_and_atan2] [Concept: newtons_second_law_and_torque]` A force $F = 10.0\text{ N}$ pulls at angle $\phi = 30.0^\circ$ relative to a $r = 0.40\text{ m}$ link. Compute the torque $\tau = r F \sin\phi$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-4}\text{ N}\cdot\text{m}$).

**Answer key:**
```python
import math

q1_tau = 0.30 * (2.0 * 9.81)
q2_energy = 0.5 * 1.0 * (2.0**2) + 0.5 * 40.0 * (0.10**2)
v1 = 0.0 + (-100.0 * 0.20 / 1.0) * 0.01
q3_x1 = 0.20 + v1 * 0.01
q4_tau = 0.40 * 10.0 * math.sin(math.radians(30.0))

assert math.isclose(q1_tau, 5.886, rel_tol=1e-6)
assert math.isclose(q2_energy, 2.20, rel_tol=1e-9)
assert math.isclose(q3_x1, 0.198, rel_tol=1e-9)
assert math.isclose(q4_tau, 2.0, rel_tol=1e-9)
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1 or Q4, study `## 3. Formalization`; if you missed Q2, study `## 2. Intuition first` and `## 3. Formalization`; if you missed Q3, study `## 4. Worked example`. On pass, proceed to `## 10. Next modules`.

### Gate test
1. `[Concept: python_variables_and_types] [Concept: traceback_error_reading]` Trace `val = 3.0; val += 2.0; val *= 4.0` and compute `val` (tolerance $\pm 10^{-9}$).
2. `[Concept: for_while_loops_and_functions]` Compute the integer returned by `sum(k * k for k in range(1, 5))`.
3. `[Concept: lists_dicts_and_numpy_arrays] [Concept: matplotlib_time_series_plotting] [Concept: terminal_and_git_basics]` For `arr = [2.0, 4.0, 6.0, 8.0]`, compute `sum(arr) / len(arr) + arr[-1]` (tolerance $\pm 10^{-9}$).
4. `[Concept: si_base_and_derived_units] [Concept: dimensional_analysis_unit_checks]` Convert $1800\text{ RPM}$ to $\text{rad/s}$ and multiply by torque $\tau = 0.50\text{ N}\cdot\text{m}$ to find shaft power $P$ in watts (tolerance $\pm 0.05\text{ W}$).
5. `[Concept: scientific_notation_and_prefixes]` Compute the RC time constant $\tau = R C$ in milliseconds ($\text{ms}$, tolerance $\pm 10^{-4}\text{ ms}$) for $R = 4.7\text{ k}\Omega$ and $C = 1.0\,\mu\text{F}$.
6. `[Concept: radians_unit_circle_and_atan2] [Concept: linear_functions_and_slope] [Concept: 2d_vectors_and_components]` Compute `math.degrees(math.atan2(-0.5, -0.5))` in degrees (tolerance $\pm 0.01^\circ$).
7. `[Concept: newtons_second_law_and_torque] [Concept: discrete_kinematics_pos_vel_acc]` A rotational joint with inertia $J = 0.05\text{ kg}\cdot\text{m}^2$ experiences net torque $\tau = 1.5\text{ N}\cdot\text{m}$. Compute angular acceleration $\alpha = \tau / J$ in $\text{rad/s}^2$ (tolerance $\pm 10^{-4}\text{ rad/s}^2$).
8. `[Concept: spring_energy_and_power]` If you double the speed $v$ of a moving robot carriage from $1.5\text{ m/s}$ to $3.0\text{ m/s}$, by what exact factor does its kinetic energy $K = \frac{1}{2}m v^2$ increase?
   - **A.** $1.414\times$
   - **B.** $2.0\times$
   - **C.** $4.0\times$
   - **D.** $8.0\times$

**Answer key:**
```python
import math

g1 = (3.0 + 2.0) * 4.0
g2 = sum(k * k for k in range(1, 5))
arr = [2.0, 4.0, 6.0, 8.0]
g3 = sum(arr) / len(arr) + arr[-1]
g4 = 0.50 * (1800.0 * 2.0 * math.pi / 60.0)
g5 = (4.7e3 * 1.0e-6) * 1e3
g6 = math.degrees(math.atan2(-0.5, -0.5))
g7 = 1.5 / 0.05
g8 = "C"

assert math.isclose(g1, 20.0, rel_tol=1e-9)
assert g2 == 30
assert math.isclose(g3, 13.0, rel_tol=1e-9)
assert math.isclose(g4, 94.2477796, rel_tol=1e-5)
assert math.isclose(g5, 4.7, rel_tol=1e-9)
assert math.isclose(g6, -135.0, rel_tol=1e-9)
assert math.isclose(g7, 30.0, rel_tol=1e-9)
assert g8 == "C"
```
- **Pass mark:** $\ge 80\%$ ($4/4$ on Skip test; $\ge 7/8$ on Gate test). Missed Gate Q1–Q2: study `00-foundations.T1.00a`; Q3: `00-foundations.T1.00b`; Q4–Q5: `00-foundations.T1.00c`; Q6: `00-foundations.T1.00d`; Q7–Q8: `## 3. Formalization` above.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Simulated spring-mass amplitude grows without bound | Updated `x` using old `v` before updating `v` (unstable forward Euler) with a large `dt`. | Update velocity first (`v += a * dt`) and then update position using the new velocity (`x += v * dt`). |
| Gravity torque is wrong by a factor of $9.81$ | Multiplied payload mass in $\text{kg}$ directly by lever arm $r$ without multiplying by $g = 9.81\text{ m/s}^2$. | Compute weight force $F_g = m g$ in newtons first, then $\tau = r F_g$. |
| Energy check drifts rapidly | Used a coarse time step $\Delta t = 0.1\text{ s}$ on a fast oscillator. | Keep $\Delta t \le \frac{1}{50} T_{\text{osc}}$ (e.g., $\Delta t \le 1\text{ ms}$). |

## 9. Resources
- **Track 00 ([`00-foundations/README.md`](../00-foundations/README.md#tier-1-beginner--intuitive)) & [MyPhysicsLab Interactive Spring-Damper Sim](https://www.myphysicslab.com/springs/single-spring-en.html):** Unlocks Stage 0 (`L0.1`–`L0.3`) and Step 1.1 (`00-foundations.T1.01`) symplectic Euler vs. forward Euler comparison `[VERIFIED 2026-10-15]`.
- **W. Bolton — [*Mechatronics* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md):** Mechanical translational and rotational springs, masses, and dampers `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to Legacy Step 1.1: [`00-foundations.T1.01`](../00-foundations/README.md#tier-1-beginner--intuitive) (*Calculus as `while` Loops, 2D Rotations & RC Smoothing*).
