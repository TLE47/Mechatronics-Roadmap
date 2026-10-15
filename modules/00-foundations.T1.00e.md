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
---

## 0. Skip Test
Pass without reading if you can compute the torque $\tau = r F \sin\theta$ of a $20\text{ N}$ vertical force at the tip of a horizontal $0.25\text{ m}$ link, and write the two discrete update lines that advance velocity $v$ and position $x$ over $\Delta t$ for a mass $m$ pulled by a spring $F = -k x$.
- **Check:** $\tau = 0.25 \times 20 \times \sin(90^\circ) = 5.0\text{ N}\cdot\text{m}$; in loop: `v += (-k * x / m) * dt; x += v * dt`.

## 1. Why This Matters
Before Step 1.1 (`00-foundations.T1.01`) compares numerical integration stability on a spring-mass oscillator, you need to know what position, velocity, acceleration, force, mass, spring stiffness, torque, and energy actually mean physically. This module turns Newton's Second Law ($F = m a$ and $\tau = J \alpha$) and Hooke's spring law ($F = -k x$) into a 10-line Python `while` loop.

## 2. Mental Model
1. **Position ($x$), Velocity ($v$), Acceleration ($a$):**
   - Velocity is how fast position changes: $\Delta x = v \cdot \Delta t$.
   - Acceleration is how fast velocity changes: $\Delta v = a \cdot \Delta t$.
2. **Newton's Second Law ($F_{\text{net}} = m a$) & Springs ($F_s = -k x - b v$):**
   - Mass $m$ ($\text{kg}$) resists acceleration: $a = F_{\text{net}} / m$.
   - A spring with stiffness $k$ ($\text{N/m}$) pulls back toward $x = 0$ with force $-k x$; a damper with coefficient $b$ ($\text{N}\cdot\text{s/m}$) resists velocity with force $-b v$.
3. **Rotational Analog ($\tau = r F\sin\phi = J \alpha$):**
   - Pushing with force $F$ at lever arm radius $r$ produces **torque** $\tau = r F_\perp$ ($\text{N}\cdot\text{m}$), which causes angular acceleration $\alpha = \tau / J$ ($\text{rad/s}^2$), where $J$ ($\text{kg}\cdot\text{m}^2$) is rotational inertia.
4. **Mechanical Energy ($E = \frac{1}{2}m v^2 + \frac{1}{2}k x^2$):**
   - A moving mass stores kinetic energy $K = \frac{1}{2}m v^2$; a stretched spring stores potential energy $U = \frac{1}{2}k x^2$. With zero damping ($b = 0$), total energy $E = K + U$ stays constant as energy sloshes back and forth between spring and mass.

## 3. Worked Example
A $m = 2.0\text{ kg}$ cart on a spring of stiffness $k = 50.0\text{ N/m}$ is pulled to $x_0 = 0.10\text{ m}$ and released from rest ($v_0 = 0.0\text{ m/s}$).
- **Step 1 (Initial stored energy):**
  $$E_0 = \frac{1}{2} k x_0^2 + \frac{1}{2} m v_0^2 = 0.5 \times 50.0 \times (0.10)^2 + 0 = 0.25\text{ J}$$
- **Step 2 (Initial acceleration at release):**
  $$F = -k x_0 = -50.0 \times 0.10 = -5.0\text{ N} \implies a_0 = \frac{F}{m} = \frac{-5.0}{2.0} = -2.5\text{ m/s}^2$$
- **Step 3 (Maximum speed when passing through $x = 0$):**
  At $x = 0$, all $0.25\text{ J}$ of potential energy has converted to kinetic energy $\frac{1}{2} m v_{\max}^2 = 0.25\text{ J}$, so $v_{\max} = \sqrt{2 E_0 / m} = \sqrt{0.50 / 2.0} = 0.50\text{ m/s}$.

## 4. Code
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
Add viscous damping $F_{\text{damp}} = -b v$ with $b = 4.0\text{ N}\cdot\text{s/m}$ to the loop above ($F_{\text{net}} = -k x - b v$) and verify that after $2.0\text{ s}$ (`4000` steps of `0.0005` s), more than $95\%$ of the initial $0.25\text{ J}$ mechanical energy has been dissipated as heat ($E_{\text{final}} < 0.0125\text{ J}$).
- **Check:** `assert e_final_j < 0.0125`

## 6. Gate Test
1. A robot arm link of length $r = 0.30\text{ m}$ holds a $2.0\text{ kg}$ payload horizontally under gravity ($g = 9.81\text{ m/s}^2$). What holding torque $\tau$ must the shoulder joint supply? (Answer: $F_g = 2.0 \times 9.81 = 19.62\text{ N}$, so $\tau = 0.30\text{ m} \times 19.62\text{ N} = 5.886\text{ N}\cdot\text{m}$.)
2. If you double the velocity $v$ of a moving robot carriage, by what factor does its kinetic energy $K = \frac{1}{2}m v^2$ (and required braking work) increase? (Answer: It quadruples—$4\times$.)

## 7. Resources
- **Stage 0 (`00-foundations/README.md`):** Now that you have completed `00a`–`00e`, step through Stage 0 (`L0.1`–`L0.3`) and Step 1.1 (`00-foundations.T1.01`) `[VERIFIED 2026-10-15]`.
- **Bolton — *Mechatronics* (Ch. 7):** Mechanical system building blocks (translational and rotational springs, masses, and dampers) `[VERIFIED 2026-10-15]`.
