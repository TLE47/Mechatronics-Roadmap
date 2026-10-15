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
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters (Why This Matters)
Every motor winding, thermal heatsink, and RC filter obeys a first-order differential equation governed by a time constant $\tau$, while every compliant robot joint and closed-loop PID servo obeys a second-order differential equation governed by natural frequency $\omega_n$ and damping ratio $\zeta$. Knowing how $\omega_n$ and $\zeta$ determine overshoot and settling time lets you compute exact controller gains instead of guessing by trial and error. Already know this? Take the Skip test in section 8 first.

## 2. Intuition first (Mental Model)
Push open a heavy glass office door equipped with an overhead hydraulic closer. If the closer valve is wide open (underdamped), the door swings fast, slams past the frame, and rings back and forth several times before stopping. If a mechanic tightens the hydraulic valve way too far (overdamped), the door creeps shut painfully slowly without ever overshooting. Right on the boundary between those two regimes sits a sweet spot (critical damping) where the door snaps shut as fast as physically possible with zero rebound.

## 3. Formalization
1. **First-Order System ($\tau\dot{y} + y = u$):** Driven by a unit step $u(t) = 1$ from $y(0) = 0$, the solution is $y(t) = 1 - e^{-t/\tau}$, where time constant $\tau$ in seconds ($\text{s}$) is the time to reach $1 - e^{-1} \approx 63.2\%$ of the step. At $t = \tau = 0.010\text{ s}$, $y(0.010\text{ s}) = 1 - e^{-1} = 0.6321$.
2. **Canonical Second-Order ODE ($\omega_n$ and $\zeta$):** Dividing rotary joint dynamics $J\ddot{\theta} + b\dot{\theta} + k\theta = \tau_{\text{in}}$ by inertia $J$ ($\text{kg}\cdot\text{m}^2$) yields the canonical form with natural frequency $\omega_n$ ($\text{rad/s}$) and dimensionless damping ratio $\zeta$:
   $$\ddot{\theta} + 2\zeta\omega_n\dot{\theta} + \omega_n^2\theta = \frac{\tau_{\text{in}}}{J}, \qquad \omega_n = \sqrt{\frac{k}{J}}, \qquad \zeta = \frac{b}{2\sqrt{Jk}}$$
   For $J = 0.02\text{ kg}\cdot\text{m}^2$, stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, and damping $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$, $\omega_n = \sqrt{\frac{8.0}{0.02}} = 20.0\text{ rad/s}$ and $\zeta = \frac{0.40}{2\sqrt{0.02 \times 8.0}} = 0.50$.
3. **Characteristic Roots, Damped Frequency $\omega_d$ & Peak Overshoot $M_p$:** The characteristic polynomial $s^2 + 2\zeta\omega_n s + \omega_n^2 = 0$ has roots $s = -\zeta\omega_n \pm j\omega_d$ for $0 < \zeta < 1$, where damped oscillation frequency $\omega_d$ ($\text{rad/s}$) and fractional step overshoot $M_p$ are:
   $$\omega_d = \omega_n\sqrt{1 - \zeta^2}, \qquad M_p = \exp\!\left(\frac{-\pi\zeta}{\sqrt{1 - \zeta^2}}\right)$$
   For $\omega_n = 20.0\text{ rad/s}$ and $\zeta = 0.50$, $\omega_d = 20.0\sqrt{0.75} = 17.3205\text{ rad/s}$ and $M_p = \exp(-\pi \times 0.50 / \sqrt{0.75}) = 0.16303$ ($16.30\%$ overshoot).

## 4. Worked example (Worked Example & Code)
Compute $\omega_n$, $\zeta$, $\omega_d$, and analytical step overshoot $M_p$ for $J = 0.02\text{ kg}\cdot\text{m}^2$, $k = 8.0\text{ N}\cdot\text{m/rad}$, and $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$, and verify that a numerical time-stepping simulation matches $M_p = 16.30\%$.

```python
import math

J = 0.02
k = 8.0
b = 0.40

wn = math.sqrt(k / J)
zeta = b / (2.0 * math.sqrt(J * k))
wd = wn * math.sqrt(1.0 - zeta**2)
mp_analytic = math.exp(-math.pi * zeta / math.sqrt(1.0 - zeta**2))

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
For the same inertia $J = 0.02\text{ kg}\cdot\text{m}^2$ and stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, compute the critical damping coefficient $b_{\text{crit}} = 2\sqrt{Jk}$ ($\zeta = 1.0$) and verify in the simulation loop that `mp_sim < 1e-6` ($0.0\%$ overshoot). Expected result: `b_crit = 0.80 N*m*s/rad`.
- **If your result differs:** Check that you took the square root of the product $\sqrt{J k} = \sqrt{0.16} = 0.40$ before multiplying by $2$, rather than computing $2 J k = 0.32$.

## 6. Sim-first path (Simulation path)
Run the worked example in Python, then open **Tab 2 (Two-Mass & Notch Bode)** in the MechaLab Workbench to watch how low structural damping $\zeta$ creates a sharp time-domain ringing transient.

## 7. Hardware path (and Safety notes)
No hardware required for this module (`hardware_required: false`). On a physical servo joint in Track 05 (`Step 1.6`), proportional gain $K_p$ sets $k$ and derivative gain $K_d$ sets $b$:
```text
[Step Command 1.0 rad] ---> [PD Loop: Kp=8.0, Kd=0.80 on J=0.02] ---> [Critically Damped Shaft Response (zeta=1.0)]
```
Pass/fail verification in simulation: `wn == 20.0 rad/s`, `zeta == 0.50`, and `Mp == 16.30%`.

> **Safety Note (`safety_level: none`):** Pure simulation, math, and software module (`hardware_required: false`); no physical energization hazards.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: run the worked example and critical-damping exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: first_order_ode_time_constant]` A motor winding has inductance $L = 2.0\text{ mH}$ and resistance $R = 0.50\,\Omega$, giving electrical time constant $\tau_e = L / R = 4.0\text{ ms}$. What fraction of steady-state current (tolerance $\pm 0.005$) does it reach at $t = 4.0\text{ ms}$ after a voltage step?
2. `[Apply] [Concept: second_order_ode_wn_zeta]` Compute the undamped natural frequency $\omega_n = \sqrt{k / m}$ in $\text{rad/s}$ (tolerance $\pm 0.01\text{ rad/s}$) for $m = 0.50\text{ kg}$ and $k = 200.0\text{ N/m}$.
3. `[Transfer] [Concept: second_order_ode_wn_zeta]` For $m = 0.50\text{ kg}$ and $k = 200.0\text{ N/m}$, compute the damping ratio $\zeta = \frac{b}{2\sqrt{mk}}$ (tolerance $\pm 0.01$) when $b = 14.0\text{ N}\cdot\text{s/m}$.
4. `[Concept: characteristic_polynomial_roots]` Where do the roots of the characteristic polynomial $s^2 + 2\zeta\omega_n s + \omega_n^2 = 0$ lie when a second-order system is unstable with growing oscillations?
   - **A.** On the negative real axis ($s < 0$).
   - **B.** In the open right half-plane ($\operatorname{Re}(s) > 0, \operatorname{Im}(s) \neq 0$).
   - **C.** In the open left half-plane ($\operatorname{Re}(s) < 0, \operatorname{Im}(s) \neq 0$).
   - **D.** At $s = -\omega_n$ (repeated negative real root).
5. `[Spaced review -> 00-foundations.T2.00b — Concept: dot_product_projection]` Compute $\vec{u}\cdot\vec{v}$ (tolerance $\pm 10^{-9}$) for $\vec{u} = [1.0, 0.0, -2.0]^T$ and $\vec{v} = [3.0, 5.0, 1.5]^T$.

**Answer key:**
```python
import math

q1_frac = 1.0 - math.exp(-1.0)
q2_wn = math.sqrt(200.0 / 0.50)
q3_zeta = 14.0 / (2.0 * math.sqrt(0.50 * 200.0))
q4_choice = "B"
q5_dot = 1.0 * 3.0 + 0.0 * 5.0 + (-2.0) * 1.5

assert math.isclose(q1_frac, 0.63212056, rel_tol=1e-5)
assert math.isclose(q2_wn, 20.0, rel_tol=1e-9)
assert math.isclose(q3_zeta, 0.70, rel_tol=1e-9)
assert q4_choice == "B"
assert math.isclose(q5_dot, 0.0, abs_tol=1e-9)
```
- **Pass mark:** $4/5$ ($80\%+$). Missed Q1–Q3: study `## 3. Formalization`; Q4: study `## 4. Worked example`; Q5: review `00-foundations.T2.00b`. On pass, proceed to `## 11. Next modules`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Cranking up $K_p$ ($k$) makes the joint ring more instead of less | Increasing $k$ with fixed $b$ reduces $\zeta = \frac{b}{2\sqrt{Jk}} \propto 1/\sqrt{k}$. | Scale derivative damping $b$ ($K_d$) up by $\sqrt{\text{factor}}$ whenever you increase $K_p$ by $\text{factor}$. |
| Forgot to divide $b$ and $k$ by inertia $J$ in canonical form | Set $2\zeta\omega_n = b$ instead of $b / J$. | Always normalize the highest derivative coefficient to $1$ ($\ddot{\theta} + \frac{b}{J}\dot{\theta} + \frac{k}{J}\theta$) first. |
| `ValueError: math domain error` in $\sqrt{1 - \zeta^2}$ | Used the underdamped formula when $\zeta > 1$ (overdamped). | Check `if zeta < 1.0:` before computing $\omega_d$ and $M_p$. |

## 10. Resources
- **Åström & Murray — *Feedback Systems: An Introduction for Scientists and Engineers* (`resources/textbooks-and-papers.md`):** Open-access textbook chapters on first- and second-order linear systems `[VERIFIED 2026-10-15]`.
- **Track 05 (`05-control-and-estimation/README.md`):** Applies $\omega_n = \sqrt{K_p/J}$ and $K_d = 2\zeta\sqrt{JK_p}$ to joint PD tuning `[VERIFIED 2026-10-15]`.
## 11. Next modules
- Proceed to [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Complex Numbers, Euler's Formula, Phasors, Impedance & Frequency Response (Bode Plots)*).
