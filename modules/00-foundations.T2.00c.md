---
id: 00-foundations.T2.00c
title: "First- & Second-Order ODEs, Characteristic Roots, Natural Frequency & Damping Ratio"
track: "00"
tier: 2
prereqs:
  - 00-foundations.T2.00b
new_concepts:
  - first_order_ode_time_constant
  - second_order_ode_wn_zeta
  - characteristic_polynomial_roots
uses:
  - finite_difference_derivative_and_integral
  - newtons_second_law_and_torque
  - spring_energy_and_power
est_hours: 4.5
---

## 1. Why This Matters
Every thermal sensor, RL motor winding, and RC filter obeys a first-order differential equation characterized by a time constant $\tau$, while every springy robot joint, compliant gripper, and closed-loop PID servo obeys a second-order differential equation characterized by natural frequency $\omega_n$ and damping ratio $\zeta$. Understanding how $\omega_n$ and $\zeta$ govern overshoot, oscillation frequency, and settling time lets you design mechanical structures and tune controllers scientifically instead of guessing gains.

## 2. Mental Model
1. **First-Order System ($\tau \dot{y} + y = u$):**
   Driven by a step input $u(t) = 1$, the state rises exponentially as $y(t) = 1 - e^{-t/\tau}$. After one time constant ($t = \tau$), it reaches $63.2\%$ of its final value; after $4\tau$, it is $98.2\%$ settled.
2. **Second-Order Mass-Spring-Damper ($m\ddot{x} + b\dot{x} + kx = F$):**
   Divide by $m$ to put the equation into standard canonical form:
   $$\ddot{x} + 2\zeta\omega_n\dot{x} + \omega_n^2 x = \frac{F}{m}, \quad \omega_n = \sqrt{\frac{k}{m}}, \quad \zeta = \frac{b}{2\sqrt{mk}}$$
3. **Characteristic Polynomial ($s^2 + 2\zeta\omega_n s + \omega_n^2 = 0$):**
   The roots $s = -\zeta\omega_n \pm \omega_n\sqrt{\zeta^2 - 1}$ determine the qualitative behavior:
   - $\zeta > 1$ (**Overdamped**): Two real negative roots; sluggish response, zero overshoot.
   - $\zeta = 1$ (**Critically damped**): Fastest step response without overshoot.
   - $0 < \zeta < 1$ (**Underdamped**): Complex conjugate roots $s = -\sigma \pm j\omega_d$; oscillates at damped frequency $\omega_d = \omega_n\sqrt{1-\zeta^2}$ with peak percentage overshoot $M_p = \exp\!\left(\frac{-\pi\zeta}{\sqrt{1-\zeta^2}}\right)$.

## 3. Worked Example
A rotary actuator link has inertia $J = 0.02\text{ kg}\cdot\text{m}^2$, torsional stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, and viscous damping $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$.
- **Step 1 (Natural frequency $\omega_n$):**
  $$\omega_n = \sqrt{\frac{k}{J}} = \sqrt{\frac{8.0}{0.02}} = \sqrt{400} = 20.0\text{ rad/s}$$
- **Step 2 (Damping ratio $\zeta$):**
  $$\zeta = \frac{b}{2\sqrt{Jk}} = \frac{0.40}{2\sqrt{0.02 \times 8.0}} = \frac{0.40}{2 \times 0.40} = 0.50$$
- **Step 3 (Damped oscillation frequency & peak overshoot):**
  $$\omega_d = \omega_n\sqrt{1 - \zeta^2} = 20.0\sqrt{1 - 0.25} = 17.3205\text{ rad/s}$$
  $$M_p = \exp\!\left(\frac{-\pi \times 0.50}{\sqrt{0.75}}\right) = \exp(-1.8138) \approx 0.1630 \;(16.30\%\text{ overshoot})$$

## 4. Code
```python
import math

J = 0.02
k = 8.0
b = 0.40

wn = math.sqrt(k / J)
zeta = b / (2.0 * math.sqrt(J * k))
wd = wn * math.sqrt(1.0 - zeta**2)
mp_analytic = math.exp(-math.pi * zeta / math.sqrt(1.0 - zeta**2))

# Verify via high-resolution numerical simulation of step response to target=1.0 rad
dt = 1e-4
theta = 0.0
omega = 0.0
max_theta = 0.0
for _ in range(10000):
    alpha = (k * (1.0 - theta) - b * omega) / J
    omega += alpha * dt
    theta += omega * dt
    if theta > max_theta:
        max_theta = theta

mp_sim = max_theta - 1.0
assert math.isclose(wn, 20.0, rel_tol=1e-9)
assert math.isclose(zeta, 0.50, rel_tol=1e-9)
assert math.isclose(mp_sim, mp_analytic, rel_tol=1e-2)
print(f"wn={wn:.1f} rad/s, zeta={zeta:.2f}, Mp_analytic={mp_analytic*100:.2f}%, Mp_sim={mp_sim*100:.2f}%")
```
Expected output:
```text
wn=20.0 rad/s, zeta=0.50, Mp_analytic=16.30%, Mp_sim=16.30%
```

## 5. Exercise
Using the same inertia $J = 0.02\text{ kg}\cdot\text{m}^2$ and stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, compute the viscous damping coefficient $b_{\text{crit}}$ required for critical damping ($\zeta = 1.0$) and verify that the simulated step response overshoot is $0.0\%$.
- **Check:** $b_{\text{crit}} = 2\sqrt{Jk} = 0.80\text{ N}\cdot\text{m}\cdot\text{s/rad}$, giving $\zeta = 1.0$ and $M_p = 0.0\%$.

## 6. Gate Test
1. If you quadruple the stiffness $k$ of a joint while keeping inertia $J$ and damping $b$ constant, how do $\omega_n$ and $\zeta$ change? (Answer: $\omega_n$ doubles, while $\zeta = \frac{b}{2\sqrt{Jk}}$ is cut in half, making the joint faster but more oscillatory.)
2. What does it mean physically if the characteristic roots of a system have a positive real part ($\zeta < 0$)? (Answer: Negative damping—oscillations grow exponentially in amplitude until the system saturates or breaks.)

## 7. Resources
- **Åström & Murray — *Feedback Systems: An Introduction for Scientists and Engineers* (Ch. 5–6):** Free open-access textbook covering linear ODEs and second-order canonical responses (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Bolton — *Mechatronics*:** Dynamic system modeling of mechanical, electrical, and thermal time constants `[VERIFIED 2026-10-15]`.
