---
id: 05-control.T1.05a
title: "Open-Loop vs Closed-Loop Feedback, Tracking Error, P/I/D Roles & Integrator Windup"
track: "05"
tier: 1
prereqs:
  - 00-foundations.T1.01
  - 04-embedded.T1.05
new_concepts:
  - open_vs_closed_loop_feedback
  - pid_proportional_integral_derivative_terms
  - actuator_saturation_and_windup
uses:
  - symplectic_euler_integration
  - exponential_moving_average_filter
  - hardware_timer_isr_and_jitter
est_hours: 4.5
---

## 0. Skip Test
Pass without reading if you can answer both without looking anything up:
1. A vertical robot link holds a payload against gravity using a pure Proportional ($P$) controller $u = K_p (r - y)$. Why can the steady-state error $e = r - y$ never reach zero?
   - **Check:** If error $e = 0$, the proportional output $u = K_p(0) = 0$, which produces zero torque to hold up the weight; therefore the link must sag by $e_{\text{ss}} = \tau_{\text{gravity}} / K_p$.
2. What happens to the integral term $\int e\,dt$ if a joint is physically blocked for 3 seconds while trying to reach a target, and what does the arm do when the obstacle is removed?
   - **Check:** The integral accumulates a huge value ("integrator windup") even though the actuator is already saturated at $100\%$; when released, the joint violently overshoots past the target until negative error drains the wound-up integral.

## 1. Why This Matters
Step 1.6 (`05-control.T1.06`) implements a discrete-time PID controller with integrator clamping anti-windup and a filtered derivative-on-measurement term. Before writing that production control loop, you need a rock-solid intuition for what each of the three terms—Proportional ($P$), Integral ($I$), and Derivative ($D$)—actually does to a physical mass, why sensor quantization spikes ruin naive derivative $\frac{de}{dt}$, and why actuator limits cause integrator windup.

## 2. Mental Model
1. **Open-Loop vs. Closed-Loop Feedback:**
   Open-loop sends a command and hopes for the best. Closed-loop measures the actual position $y(t)$, computes the **tracking error** $e(t) = r(t) - y(t)$, and adjusts the actuator command $u(t)$ every sample tick $T_s$.
2. **Physical Analogy of $P$, $I$, and $D$:**
   - **Proportional ($K_p e$):** Acts like a **virtual mechanical spring** pulling the joint toward the target $r$. Higher $K_p$ makes the spring stiffer and reduces steady-state sag, but a spring + mass alone oscillates forever!
   - **Derivative ($-K_d \dot{y}$):** Acts like a **virtual viscous shock absorber (damper)** that resists velocity, draining kinetic energy so the joint stops without bouncing. Computing derivative on measurement $-\dot{y}$ instead of $\dot{e}$ prevents a violent "derivative kick" when the setpoint $r$ steps instantaneously.
   - **Integral ($K_i \int e\,dt$):** Accumulates past error over time to automatically build up whatever steady holding torque is needed to cancel gravity or static friction ($e_{\text{ss}} \to 0$).
3. **Actuator Saturation & Integrator Windup:**
   Real power supplies clip at $\pm u_{\max}$ (e.g., $\pm 12\text{ V}$). If $u$ is already saturated at $+12\text{ V}$ and error $e > 0$ persists, continuing to add $K_i e \Delta t$ winds the integral state to an absurd number. **Anti-windup clamping** freezes the integrator whenever the output is saturated and the error pushes deeper into saturation.

## 3. Worked Example
A joint holds against a constant gravity disturbance torque $\tau_g = 0.60\text{ N}\cdot\text{m}$ with target $r = 1.00\text{ rad}$ and proportional gain $K_p = 4.0\text{ N}\cdot\text{m/rad}$:
- **Step 1 (Pure P steady-state error):**
  At rest ($\dot{y} = \ddot{y} = 0$), motor torque balances gravity:
  $$K_p (r - y_{\text{ss}}) = \tau_g \implies e_{\text{ss}} = \frac{\tau_g}{K_p} = \frac{0.60}{4.0} = 0.15\text{ rad} \implies y_{\text{ss}} = 0.85\text{ rad}$$
- **Step 2 (Adding Integral action $K_i = 10.0\text{ N}\cdot\text{m/(rad}\cdot\text{s)}$):**
  The integral state $I_k$ grows until $I_{\text{ss}} = \tau_g = 0.60\text{ N}\cdot\text{m}$, allowing the proportional error to shrink to $e_{\text{ss}} = 0.00\text{ rad}$ ($y_{\text{ss}} = 1.00\text{ rad}$).

## 4. Code
```python
import math

def simulate_joint(use_integral: bool, use_antiwindup: bool) -> tuple[float, float]:
    J, b, tau_g = 0.02, 0.30, 0.60
    kp, ki, kd = 4.0, (10.0 if use_integral else 0.0), 0.40
    u_max = 1.20  # Actuator torque limit [N*m]
    dt = 0.001
    y, omega, i_term = 0.0, 0.0, 0.0
    r = 1.0
    max_y = 0.0

    for _ in range(4000):
        err = r - y
        p_term = kp * err
        d_term = -kd * omega
        u_unsat = p_term + i_term + d_term
        u = max(-u_max, min(u_max, u_unsat))
        if not use_antiwindup or not ((u >= u_max and err > 0) or (u <= -u_max and err < 0)):
            i_term += ki * err * dt
        alpha = (u - tau_g - b * omega) / J
        omega += alpha * dt
        y += omega * dt
        if y > max_y:
            max_y = y
    return y, max_y

y_p, _ = simulate_joint(use_integral=False, use_antiwindup=True)
y_pi_windup, peak_windup = simulate_joint(use_integral=True, use_antiwindup=False)
y_pi_aw, peak_aw = simulate_joint(use_integral=True, use_antiwindup=True)

assert math.isclose(1.0 - y_p, 0.15, abs_tol=1e-3)
assert math.isclose(y_pi_aw, 1.0, abs_tol=1e-3)
assert peak_aw < peak_windup
print(f"P-only y_ss={y_p:.3f} rad, PI+AW y_ss={y_pi_aw:.3f} rad, peak_no_AW={peak_windup:.3f} vs peak_AW={peak_aw:.3f}")
```
Expected output:
```text
P-only y_ss=0.850 rad, PI+AW y_ss=1.000 rad, peak_no_AW=1.186 vs peak_AW=1.032
```

## 5. Exercise
In the simulation above, if the gravity load doubles to $\tau_g = 1.00\text{ N}\cdot\text{m}$ while $K_p = 4.0\text{ N}\cdot\text{m/rad}$ (with $K_i = 0$), calculate the new steady-state position $y_{\text{ss}}$ for target $r = 1.00\text{ rad}$.
- **Check:** $e_{\text{ss}} = \frac{1.00}{4.0} = 0.25\text{ rad}$, so $y_{\text{ss}} = 1.00 - 0.25 = 0.75\text{ rad}$.

## 6. Gate Test
1. Why is computing the derivative term on measurement ($-K_d \frac{dy}{dt}$) safer than computing it on tracking error ($+K_d \frac{de}{dt}$) when a user commands a sudden step change in target position $r$? (Answer: A step change in $r$ causes $\frac{dr}{dt} \to \infty$ for one sample tick, slamming the motor with a massive "derivative kick" torque spike, whereas the physical position $y$ changes smoothly.)
2. Which PID term acts like a mechanical damper, and which term acts like a mechanical spring? (Answer: The $D$ term acts like a viscous damper proportional to velocity; the $P$ term acts like a spring proportional to position error.)

## 7. Resources
- **Åström & Murray — *Feedback Systems* (Ch. 1, 11):** Feedback principles, PID control, derivative filtering, and anti-windup (`resources/textbooks-and-papers.md`) `[VERIFIED 2026-10-15]`.
- **Track 05 (`05-control-and-estimation/README.md`):** Directly prepares for Step 1.6 (`05-control.T1.06`) production discrete PID and complementary IMU filter `[VERIFIED 2026-10-15]`.
