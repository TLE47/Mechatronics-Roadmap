---
id: 05-control.T1.05a
title: "Open-Loop vs. Closed-Loop Feedback, P/I/D Physical Roles & Actuator Saturation"
track: "05"
tier: 1
prereqs:
  - 00-foundations.T1.01
  - 04-embedded.T1.05
new_concepts:
  - open_vs_closed_loop_tracking_error
  - pid_spring_damper_integrator_intuition
  - actuator_saturation_and_integrator_windup
uses:
  - symplectic_euler_integration
  - hardware_timer_isr_and_jitter
  - pwm_duty_cycle_effective_voltage
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 3
  coding: 3
  tools: 1
  hardware_risk: low
  simulation: full
verification: ci-native
---

## 1. Why it matters
This is the bridge module before Step 1.6 (`05-control.T1.06`). If you command a robot arm joint with a fixed PWM duty cycle (open-loop), gravity, friction, or payload changes will leave it far from the target angle. Closing a feedback loop around encoder error $e(t) = r(t) - y(t)$ turns the motor into a programmable mechanical spring, shock absorber, and gravity compensator (**PID control**)—and understanding actuator saturation explains why an unclamped integral term causes violent overshoot (**integrator windup**). Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine steering a car toward the center of a lane. **Open-loop control** is closing your eyes and holding the steering wheel at a fixed angle based on a map—the first crosswind blows you off the road. **Closed-loop control** is looking at your distance from the lane center (the **error** $e = r - y$) every millisecond:
- **Proportional ($P$, virtual spring):** Pulls harder the farther you are from the target ($K_p e$). Alone, a strong spring overshoots and oscillates, and sags slightly under a steady crosswind or gravity load.
- **Derivative ($D$, virtual viscous damper):** Pushes *against* velocity ($-K_d \dot{y}$), acting like an oil-filled shock absorber that brakes the joint as it approaches the target so it doesn't overshoot.
- **Integral ($I$, steady-state bias eliminator):** Accumulates past error over time ($K_i \int e\,dt$), steadily ratcheting up torque until steady-state gravity sag is driven to zero. But if the motor hits its $100\%$ voltage limit (**saturation**), an unclamped integrator keeps ballooning to an enormous number (**windup**), causing a huge overshoot after reaching the target.

## 3. Formalization
1. **Closed-Loop Tracking Error ($e_k = r_k - y_k$):** At discrete control step $k$ with period $\Delta t$ ($\text{s}$), given reference target $r_k$ ($\text{rad}$) and measured position $y_k$ ($\text{rad}$), tracking error is $e_k = r_k - y_k$.
2. **Physical PD Virtual Spring-Damper + Integral Action:** Commanded unsaturated control effort $u_{\text{raw},k}$ ($\text{V}$ or $\text{N}\cdot\text{m}$) with proportional gain $K_p$, integral gain $K_i$, and derivative gain $K_d$ (applied on measurement velocity $\dot{y}_k$ to avoid derivative kick on step changes in $r_k$) is:

$$
u_{\text{raw},k} = \underbrace{K_p (r_k - y_k)}_{\text{Virtual Spring}} - \underbrace{K_d \dot{y}_k}_{\text{Virtual Damper}} + \underbrace{I_k}_{\text{Gravity/Friction Bias}}, \quad I_k = I_{k-1} + K_i e_k \Delta t
$$

   Substituting $r_k = 1.0\text{ rad}$, $y_k = 0.6\text{ rad}$ ($e_k = 0.4\text{ rad}$), $\dot{y}_k = 0.5\text{ rad/s}$, $I_k = 0.8\text{ N}\cdot\text{m}$, $K_p = 10.0$, and $K_d = 2.0$ gives $u_{\text{raw},k} = 10(0.4) - 2(0.5) + 0.8 = 3.8\text{ N}\cdot\text{m}$.
3. **Actuator Saturation and Clamping Anti-Windup:** Physical actuators saturate at $\pm u_{\max}$:

$$
u_k = \operatorname{clip}(u_{\text{raw},k},\ -u_{\max},\ +u_{\max})
$$

   Clamping anti-windup freezes $I_k$ whenever $|u_{\text{raw},k}| > u_{\max}$ and $\operatorname{sign}(e_k) = \operatorname{sign}(u_{\text{raw},k})$ (or clamps $|I_k| \le I_{\max}$).

## 4. Worked example
**Predict first (before you run it):** The loop below runs $3000$ ticks of $1\ \text{ms}$ on an arm with $J = 0.02\ \text{kg}\cdot\text{m}^2$, $b = 0.05\ \text{N}\cdot\text{m}\cdot\text{s/rad}$, a gravity load $\tau_g = 0.60\ \text{N}\cdot\text{m}$, a $u_{\max} = 1.20\ \text{N}\cdot\text{m}$ rail and target $r = 1.0\ \text{rad}$. Before you run it, commit to three numbers: where the pure-P run ($K_p = 4.0$, $K_i = 0$) comes to rest, which of the two $K_i = 12.0$ runs overshoots more, and how far past $1.0\ \text{rad}$ the worse one peaks. Two tells that a wrong answer is a mistake rather than a surprise: the PD resting angle must sit *below* $1.0\ \text{rad}$ with a shortfall that multiplies back to exactly $\tau_g = 0.60\ \text{N}\cdot\text{m}$, so resting above the target means the feedback sign is inverted; and the two PID peaks must differ, because equal peaks mean the anti-windup branch never engaged.

Simulate a 1-DOF rotational arm ($J = 0.02\text{ kg}\cdot\text{m}^2$, $b = 0.05\text{ N}\cdot\text{m}\cdot\text{s/rad}$) lifting against a constant gravity torque $\tau_g = 0.60\text{ N}\cdot\text{m}$ under actuator limit $u_{\max} = 1.20\text{ N}\cdot\text{m}$ to compare (1) pure P control (leaves steady-state sag), (2) unclamped PID (suffers huge windup overshoot), and (3) anti-windup PID (zero steady-state error and minimal overshoot).

```python
import math

def sim_arm(kp: float, ki: float, kd: float, anti_windup: bool) -> tuple[float, float]:
    J, b, tau_g, u_max, dt = 0.02, 0.05, 0.60, 1.20, 0.001
    q, dq, i_term, max_q = 0.0, 0.0, 0.0, 0.0
    r = 1.0
    for _ in range(3000):
        e = r - q
        i_candidate = i_term + ki * e * dt
        if anti_windup:
            i_candidate = max(-u_max, min(u_max, i_candidate))
        u_raw = kp * e - kd * dq + i_candidate
        if anti_windup and abs(u_raw) > u_max and (e * u_raw > 0.0):
            u_raw = kp * e - kd * dq + i_term
        else:
            i_term = i_candidate
        u = max(-u_max, min(u_max, u_raw))
        ddq = (u - b * dq - tau_g) / J
        dq += ddq * dt
        q += dq * dt
        max_q = max(max_q, q)
    return q, max_q - r

q_p, _ = sim_arm(kp=4.0, ki=0.0, kd=0.4, anti_windup=False)
q_windup, os_windup = sim_arm(kp=4.0, ki=12.0, kd=0.4, anti_windup=False)
q_aw, os_aw = sim_arm(kp=4.0, ki=12.0, kd=0.4, anti_windup=True)

assert math.isclose(1.0 - q_p, 0.60 / 4.0, abs_tol=1e-2)  # Pure P sags by tau_g / Kp = 0.15 rad!
assert abs(1.0 - q_aw) < 1e-3                             # PID eliminates steady-state sag!
assert os_windup > os_aw + 0.10                           # Anti-windup cuts overshoot!
print(f"PD final q={q_p:.3f} rad (sag={1-q_p:.3f}), Unclamped OS={os_windup:.3f} rad, Anti-windup OS={os_aw:.3f} rad")
```
Expected output:
```text
PD final q=0.850 rad (sag=0.150), Unclamped OS=0.372 rad, Anti-windup OS=0.047 rad
```

## 5. Exercise
For the arm above with constant gravity load $\tau_g = 0.60\text{ N}\cdot\text{m}$ under PD control ($K_i = 0$), derive and verify the exact steady-state angle sag $e_{\text{ss}} = \tau_g / K_p$ when $K_p = 8.0\text{ N}\cdot\text{m/rad}$. Confirm that `sim_arm(kp=8.0, ki=0.0, kd=0.4, anti_windup=False)` settles to $q_{\text{ss}} = 0.925\text{ rad}$ ($e_{\text{ss}} = 0.075\text{ rad} \pm 10^{-3}\text{ rad}$).
- **If your result differs:** At steady state ($\dot{q} = \ddot{q} = 0$), the spring torque balances gravity: $K_p e_{\text{ss}} = \tau_g \implies e_{\text{ss}} = 0.60 / 8.0 = 0.075\text{ rad}$.

### Graded package - the spring, the damper, the bias and the rail
[`exercises/05-control.T1.05a/`](../exercises/05-control.T1.05a/) turns this section into a test. `starter.py` holds seven holes: `tracking_error`, `control_effort` (the spring, the damper on measured velocity, and the integral bias), `integral_step`, `anti_windup_integral` (frozen while the demand is past a rail *and* the error still pushes that way), `saturate`, `steady_state_sag` and `arm_acceleration`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/05-control.T1.05a/starter.py \
  python3 -m unittest discover -s exercises/05-control.T1.05a -p 'test_*.py'
```

**48 tests.** The demand is checked at the section-3 worked $3.8\text{ N}\cdot\text{m}$ and at the Skip test's $4.0$, in both velocity directions, so a derivative term added instead of subtracted fails; the sag is checked at the exercise's $0.075\text{ rad}$ and $0.925\text{ rad}$, so a sag that multiplies the gain fails; the integral tick is checked at the Gate test's $0.005$, so a missing $\Delta t$ fails; the freeze is checked at $+15\text{ V}$ past a $12\text{ V}$ rail, so an anti-windup that never freezes fails; and the clamp is checked on **both** rails, so a one-sided clip fails. A closed-loop simulation assembled only from the submission's functions reproduces the section-4 output - PD resting at $0.850\text{ rad}$ (sag $0.150$), anti-windup PID at $<10^{-3}\text{ rad}$ of error with under $0.05\text{ rad}$ of overshoot, and the unclamped integrator overshooting by more than a further $0.10\text{ rad}$. The transfer suite drives **the plant's own shoulder**: its $0.318825\text{ N}\cdot\text{m}$ horizontal load sags $0.0319\text{ rad}$ at $K_p = 10$, the $2.5\text{ N}\cdot\text{m}$ clamp is $312.5\text{ rad/s}^2$ over `plant.I1`, the clamp freezes the integral while the unclamped tick still adds $0.0048$, and one encoder count at the $1\text{ kHz}$ tick is $1.534\text{ rad/s}$, which $K_d = 0.4$ turns into $24.5\%$ of the torque budget. Five planted faults - `effort_adds_the_damping`, `sag_multiplies_the_gain`, `integral_missing_dt`, `anti_windup_never_freezes`, `saturate_clips_one_rail` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00a`](00-foundations.T1.00a.md) (*Time-Stepping Loops & Clamping*), [`00-foundations.T1.00b`](00-foundations.T1.00b.md) (*Arrays & Plotting*), [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Mass-Spring-Damper Dynamics*), and Legacy **Step 1.1 (`00-foundations.T1.01`)** (*1st-Order EMA Filtering*).
  - **Core Concepts to Review First:** Discrete PID virtual spring-damper control, integrator windup clamping & derivative-on-measurement (`-Kd * (y[k] - y[k-1]) / dt`), and complementary IMU sensor fusion $\hat{\theta}_k = \alpha(\hat{\theta}_{k-1} + \omega_{\text{gyro}}\Delta t) + (1-\alpha)\theta_{\text{acc},k}$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Åström & Murray *Feedback Systems* Ch. 11 (`fbsbook.org`)](https://www.fbsbook.org/), [Brian Douglas PID Control Lectures](https://www.youtube.com/user/ControlLectures), and [Track 05 Tier 1 (`05-control-and-estimation/README.md`)](../05-control-and-estimation/README.md#tier-1-beginner--intuitive).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution below ---

def tracking_error(r, y):
    """e = r - y."""
    # TODO 1: the reference minus the measurement - the sign is what makes the loop stable
    ...

def control_effort(r, y, dy, i_term, kp, kd):
    """u_raw = Kp (r - y) - Kd dy + I."""
    # TODO 2: the damper SUBTRACTS Kd dy - it opposes velocity, not error
    ...

def integral_step(i_prev, ki, e, dt):
    """I_k = I_{k-1} + Ki e dt."""
    # TODO 3: the tick includes dt - without it the bias grows a thousandfold at 1 kHz
    ...

def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    """The integral this tick may keep, frozen while the demand is past a rail."""
    # TODO 4: freeze only when |u_raw| > u_max AND e pushes the same way as u_raw
    ...

def saturate(u_raw, u_max):
    """clip(u_raw, -u_max, +u_max)."""
    # TODO 5: both rails - a one-sided clip lets a large negative demand through
    ...

def steady_state_sag(tau_g, kp):
    """e_ss = tau_g / Kp."""
    # TODO 6: at rest the spring supplies all of tau_g, so the sag is tau_g / Kp
    ...

def arm_acceleration(torque, dq, tau_g, j, b):
    """ddq = (u - b dq - tau_g) / J."""
    # TODO 7: damping and gravity come OFF the torque before dividing by J
    ...

print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $e_{\text{ss}} = 0.075\ \text{rad}$; $q_{\text{ss}} = 0.925\ \text{rad}$.

### Hint ladder
1. **Steady state is a spring balance.** At rest $\dot q = 0$, so the damper and the integral are both zero and $K_p e_{\text{ss}} = \tau_g$: $e_{\text{ss}} = 0.60/8.0 = 0.075\ \text{rad}$, which puts $q_{\text{ss}}$ at $1.0 - 0.075 = 0.925\ \text{rad}$.
2. **The sign of the sag is a check on the whole loop.** A settling angle *above* $1.0\ \text{rad}$ means the feedback sign is inverted; below it by exactly $\tau_g/K_p$ means the loop is right and only the spring is carrying the load.
3. **The damper subtracts velocity, not error.** `u_raw = kp * (r - y) - kd * dy + i` reproduces the worked example's $3.8\ \text{N}\cdot\text{m}$; adding `+ kd * dy` would give $5.8$ and would drive the joint away from the target as it speeds up.
4. **One tick is one millisecond.** With $\Delta t = 0.001$ the integral gains $K_i e \Delta t$ per step; leaving $\Delta t$ out multiplies the accumulator by $1000$ and is the windup the next module is about.

### Full Solution
```python
def tracking_error(r, y):
    return r - y

def control_effort(r, y, dy, i_term, kp, kd):
    return kp * (r - y) - kd * dy + i_term

def integral_step(i_prev, ki, e, dt):
    return i_prev + ki * e * dt

def anti_windup_integral(i_prev, ki, e, dt, u_raw, u_max, i_max=None):
    candidate = integral_step(i_prev, ki, e, dt)
    if i_max is not None:
        candidate = max(-i_max, min(i_max, candidate))
    if abs(u_raw) > u_max and e * u_raw > 0.0:
        return i_prev
    return candidate

def saturate(u_raw, u_max):
    return max(-u_max, min(u_max, u_raw))

def steady_state_sag(tau_g, kp):
    return tau_g / kp

def arm_acceleration(torque, dq, tau_g, j, b):
    return (torque - b * dq - tau_g) / j

u_worked = control_effort(1.0, 0.6, 0.5, 0.8, 10.0, 2.0)
sag = steady_state_sag(0.60, 8.0)

q, dq, i_term, dt = 0.0, 0.0, 0.0, 0.001
for _ in range(3000):
    e = tracking_error(1.0, q)
    u = saturate(control_effort(1.0, q, dq, i_term, 8.0, 0.4), 1.20)
    dq += arm_acceleration(u, dq, 0.60, 0.02, 0.05) * dt
    q += dq * dt

assert abs(u_worked - 3.8) < 1e-12
assert abs(sag - 0.075) < 1e-12
assert abs((1.0 - q) - sag) < 1e-3
assert abs(saturate(-15.0, 12.0) + 12.0) < 1e-12
assert abs(integral_step(0.0, 20.0, 0.25, 0.001) - 0.005) < 1e-12
assert anti_windup_integral(0.5, 12.0, 0.4, 0.001, 15.0, 12.0) == 0.5

print(f"u_raw={u_worked:.2f} N*m | e_ss={sag:.4f} rad | q_ss={q:.3f} rad")
```

Printed: `u_raw=3.80 N*m | e_ss=0.0750 rad | q_ss=0.925 rad`

### Break it on purpose
- **Inject:** run `sim_arm(kp=4.0, ki=12.0, kd=0.4, anti_windup=False)` — the worked example's PID with the clamp and the freeze removed, so $I_k$ keeps adding $K_i e\Delta t$ while the demand sits past the $1.20\ \text{N}\cdot\text{m}$ rail.
- **Symptom:** the run reaches the target and sails on to a peak $0.372\ \text{rad}$ above $1.0\ \text{rad}$ instead of the clamped run's $0.047\ \text{rad}$; the pure-P run in the same script is untouched at its $0.150\ \text{rad}$ sag.
- **Diagnose:** only the $K_i = 12.0$ runs are affected, and the two of them differ solely in the clamp and freeze, so the plant, $K_p$ and $K_d$ are ruled out; the PD run still rests $0.150\ \text{rad}$ short, exactly $\tau_g / K_p$, which says the damage is stored in $I_k$ and not in the spring.
- **Fix:** restore `anti_windup=True`, which clips $\lvert I_k\rvert \le u_{\max}$ and freezes the accumulator while $\lvert u_{\text{raw}}\rvert > u_{\max}$ and $e_k$ still pushes that way; the overshoot then reads $0.047\ \text{rad}$ and the steady-state error falls under $10^{-3}\ \text{rad}$.

## 6. Simulation path
Run the Python simulation script above or open **Tab 4 (Control Loop & Saturation)** in the MechaLab Workbench (`npm run dev`) to observe how actuator saturation interacts with closed-loop feedback gains.

No hardware required for this module (`hardware_required: false`). In Step 1.6 (`05-control.T1.06`), this exact discrete PID + anti-windup law executes inside the $1\text{ kHz}$ timer ISR on your microcontroller driving the H-bridge or BLDC stage:
```text
[Reference r_k] ---> (+) ---> [PID + Anti-Windup] ---> [clip(-V_bus, +V_bus)] ---> [Motor + Encoder y_k]
                      ^___________________________________________________________________|
```
Pass/fail verification in simulation: PD steady-state sag equals $\tau_g / K_p = 0.150\text{ rad}$, anti-windup steady-state error $< 0.001\text{ rad}$, and anti-windup overshoot $< 0.05\text{ rad}$.


```mermaid
flowchart LR
    A["05-control.T1.05a: open_vs_closed_loop_tracking_error"] --> B["pid_spring_damper_integrator_intuition"]
    B --> C["actuator_saturation_and_integrator_windup"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 1.6 (`05-control.T1.06`).

### Skip test
1. `[Recall] [Concept: open_vs_closed_loop_tracking_error]` A pure proportional controller ($K_p = 5.0\text{ N}\cdot\text{m/rad}$, $K_i = 0$) holds an arm against a constant gravity torque $\tau_g = 0.50\text{ N}\cdot\text{m}$ at steady state ($\dot{q} = \ddot{q} = 0$). Compute the steady-state angle error $e_{\text{ss}} = \tau_g / K_p$ in radians ($\text{rad}$, tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: pid_spring_damper_integrator_intuition]` Given $r_k = 2.0\text{ rad}$, $y_k = 1.5\text{ rad}$, $\dot{y}_k = 0.4\text{ rad/s}$, $K_p = 10.0$, and $K_d = 2.5$ (with $I_k = 0$), compute the PD control effort $u_k = K_p(r_k - y_k) - K_d \dot{y}_k$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: actuator_saturation_and_integrator_windup]` An actuator with voltage rails $\pm 12.0\text{ V}$ has proportional term $P_k = 9.5\text{ V}$, derivative term $D_k = 0.0\text{ V}$, and unclamped integral candidate $I_{\text{cand}} = 6.0\text{ V}$. With anti-windup clamping $I_k \in [-4.0\text{ V}, +4.0\text{ V}]$, compute the saturated actuator output $u_k = \operatorname{clip}(P_k + I_k + D_k, -12.0, +12.0)$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 00-foundations.T1.01 — Concept: symplectic_euler_integration] [Concept: pid_spring_damper_integrator_intuition]` Which PID term acts as a virtual viscous shock absorber that opposes velocity to damp out oscillations?
   - **A.** Proportional ($K_p$)
   - **B.** Integral ($K_i$)
   - **C.** Derivative ($K_d$)
   - **D.** Feedforward gravity torque

**Answer key:**
```python
import math

q1_ess = 0.50 / 5.0
q2_u = 10.0 * (2.0 - 1.5) - 2.5 * 0.4
q3_u_sat = min(12.0, 9.5 + min(4.0, 6.0))
q4_choice = "C"
assert math.isclose(q1_ess, 0.10, rel_tol=1e-9)
assert math.isclose(q2_u, 4.0, rel_tol=1e-9)
assert math.isclose(q3_u_sat, 12.0, rel_tol=1e-9)
assert q4_choice == "C"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2 or Q4, study `## 3. Formalization` item 2; if you missed Q3, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 05 Tier 1 bridge ladder (`05-control.T1.05a`) before Step 1.6 (`05-control.T1.06`):
1. `[Concept: open_vs_closed_loop_tracking_error]` If target angle is $r = 1.57\text{ rad}$ and measured angle is $y = 1.27\text{ rad}$, compute tracking error $e = r - y$ in $\text{rad}$ (tolerance $\pm 10^{-9}$).
2. `[Concept: open_vs_closed_loop_tracking_error]` Why does an open-loop voltage command $V = D \cdot V_{\text{bus}}$ fail to hold a robot arm at a fixed angle when a payload is placed in the gripper?
   - **A.** Because open-loop control does not measure angle $y(t)$ and therefore cannot increase torque when the payload pulls the joint downward.
   - **B.** Because PWM only works at $0\text{ RPM}$.
   - **C.** Because encoders cannot measure negative angles.
   - **D.** Because Ohm's law stops holding under load.
3. `[Concept: pid_spring_damper_integrator_intuition]` A pure proportional controller ($K_p > 0, K_i = 0, K_d = 0$) on a frictionless inertia $J\ddot{q} = -K_p(q - r)$ behaves like what physical system?
   - **A.** An undamped mass-spring oscillator that rings forever around $r$.
   - **B.** An overdamped dashpot.
   - **C.** A constant-velocity conveyor.
   - **D.** An open-loop stepper motor.
4. `[Concept: pid_spring_damper_integrator_intuition]` Compute the steady-state integral torque $I_{\text{ss}}$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$) when a PID controller holds an arm at zero steady-state error ($e_{\text{ss}} = 0, \dot{q} = 0$) against a constant gravity disturbance $\tau_g = 0.85\text{ N}\cdot\text{m}$.
5. `[Concept: pid_spring_damper_integrator_intuition]` Why do production PID loops compute the derivative term on measurement ($-K_d \dot{y}$) rather than on error ($+K_d \dot{e} = K_d(\dot{r} - \dot{y})$) when $r(t)$ is a step command?
   - **A.** To avoid **derivative kick**—an instantaneous step jump in $r(t)$ makes $\dot{r} = \Delta r / \Delta t$ huge for one tick, slamming the actuator into saturation.
   - **B.** Because $\dot{y}$ is always zero.
   - **C.** Because $r(t)$ cannot be stored in a float.
   - **D.** To increase steady-state error.
6. `[Concept: actuator_saturation_and_integrator_windup]` Given $u_{\text{raw}} = 18.5\text{ V}$ and supply limit $u_{\max} = 12.0\text{ V}$, compute the saturated output $u = \operatorname{clip}(u_{\text{raw}}, -u_{\max}, +u_{\max})$ in volts ($\text{V}$, tolerance $\pm 10^{-9}$).
7. `[Concept: actuator_saturation_and_integrator_windup]` Under clamping anti-windup, if $u_{\text{raw}} = +15.0\text{ V} > u_{\max} = 12.0\text{ V}$ and current error is $e_k = +0.4\text{ rad}$ (same sign as $u_{\text{raw}}$), what should happen to the integral accumulator $I_k$ on that tick?
   - **A.** Freeze $I_k$ ($I_k = I_{k-1}$; do not add $K_i e_k \Delta t$).
   - **B.** Multiply $I_k$ by $10$.
   - **C.** Set $K_p = 0$.
   - **D.** Reverse the motor polarity.
8. `[Concept: pid_spring_damper_integrator_intuition]` Compute the discrete integral update $\Delta I = K_i e_k \Delta t$ (tolerance $\pm 10^{-9}$) for $K_i = 20.0$, $e_k = 0.25\text{ rad}$, and $\Delta t = 0.001\text{ s}$.

**Gate answer key:**
```python
import math

g1_err = 1.57 - 1.27
g2_choice = "A"
g3_choice = "A"
g4_iss = 0.85
g5_choice = "A"
g6_u_sat = max(-12.0, min(12.0, 18.5))
g7_choice = "A"
g8_di = 20.0 * 0.25 * 0.001

assert math.isclose(g1_err, 0.30, rel_tol=1e-9)
assert g2_choice == "A"
assert g3_choice == "A"
assert math.isclose(g4_iss, 0.85, rel_tol=1e-9)
assert g5_choice == "A"
assert math.isclose(g6_u_sat, 12.0, rel_tol=1e-9)
assert g7_choice == "A"
assert math.isclose(g8_di, 0.005, rel_tol=1e-9)
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5, Q8 $\to$ `## 3. Formalization` item 2; Q6–Q7 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Joint violently runs away to mechanical hard-stop on startup | Feedback sign is inverted (positive error drives the motor *away* from the target instead of toward it). | Verify with small $K_p$ and hand deflection that the motor pushes *back* toward the setpoint, not away from it. |
| Huge overshoot after a large step command, but small steps look fine | Integrator windup during actuator saturation. | Clamp the integral accumulator (`anti_windup = True`) whenever $\lvert u_{\text{raw}}\rvert  > u_{\max}$. |
| Motor buzzes and chatters loudly when $K_d$ is increased | Unfiltered finite-difference velocity $(\theta_k - \theta_{k-1})/\Delta t$ amplifies encoder quantization noise by $1/\Delta t = 1000\times$. | Low-pass filter the velocity estimate before multiplying by $K_d$ (Step 1.6). |

## 9. Resources
- **Åström & Murray — *Feedback Systems* ([`fbsbook.org`](https://www.fbsbook.org/), Ch. 11 PID Control, `resources/textbooks-and-papers.md`):** Free textbook chapter on PID physical intuition, derivative filtering, and integrator anti-windup `[VERIFIED 2026-10-15]`.
- **Track 05 (`05-control-and-estimation/README.md`):** Directly continues into Step 1.6 (`05-control.T1.06`) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 1.6 (`05-control.T1.06`)** in [`05-control-and-estimation/README.md`](../05-control-and-estimation/README.md#tier-1-beginner--intuitive).
