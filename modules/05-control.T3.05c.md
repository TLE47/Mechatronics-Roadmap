---
id: 05-control.T3.05c
title: "Control Barrier Functions, Forward Invariance & the 1D CBF-QP Safety Filter"
track: "05"
tier: 3
prereqs:
  - 05-control.T3.05b
new_concepts:
  - control_barrier_forward_invariance_qp
uses:
  - tangent_space_eskf_error_injection
  - discrete_infinite_horizon_lqr
  - continuous_state_space_matrices
est_hours: 2.0
hardware_required: false
safety_level: none
resources_verified: true
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
A controller that is fast and correct in free space can still drive a joint through its hard stop, because nothing in an LQR cost knows where the stop is. A **Control Barrier Function** turns "stay inside the safe set" into one linear inequality on the command, and the **CBF-QP** projects the nominal command onto it - minimally, so tracking is untouched until the constraint actually binds. This is the last of the three Track 05 Tier 3 bridges: `05-control.T3.05a` fixed the covariance, `05-control.T3.05b` fixed the injection, and this module adds the safety layer that runs between the nominal controller and the torque loop. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
A guardrail at the edge of a road does not steer the car all the time; it only matters when you drift into it, and then it pushes exactly as hard as needed and no harder. That "only as hard as needed" is what **minimally invasive** means: when the nominal command already stays clear of the rail, the filter hands it back unchanged. The second half of the idea is **braking distance**: a heavy joint that is already moving cannot stop instantly, so the barrier must be applied to the margin you still have, not to zero.

## 3. Formalization
1. **Safe Set and Barrier Function:** for a state $x$ and constraint $x \le x_{\max}$, define

$$
h(x) = x_{\max} - x \ge 0
$$

   so $h$ is the margin left before the stop, in the constraint's own unit (metres or radians).
2. **Forward Invariance (the CBF Condition):** the set $\{h \ge 0\}$ is forward invariant if, for a class-$\mathcal{K}$ gain $\alpha > 0$,

$$
\dot{h}(x, u) \ge -\alpha h(x)
$$

   With $\dot{h} = -u$ (a velocity-controlled joint moving toward $x_{\max}$) this becomes $u \le \alpha h(x)$, which caps the command and leaves a retreat untouched.
3. **The 1D CBF-QP in Closed Form:** solving $\min_u \frac{1}{2}(u - u_{\text{nom}})^2$ subject to $u \le \alpha h$ and $u \in [u_{\min}, u_{\max}]$ gives the projection

$$
u^\ast = \min\big(\max(u_{\text{nom}}, u_{\min}),\ \min(u_{\max}, \alpha h)\big)
$$

   With $u_{\text{nom}} = 0.80\,\text{m/s}$, $h = 0.04\,\text{m}$ and $\alpha = 5.0\,\text{s}^{-1}$ the cap is $0.20\,\text{m/s}$ and $u^\ast = 0.20$; with $u_{\text{nom}} = -0.40$ and the same cap it is $-0.40$, untouched. The guaranteed margin under the condition is $h(t) \ge h_0e^{-\alpha t}$, so $h_0 = 0.20$ at $\alpha = 2.0$ is still $0.0736\,\text{m}$ after $0.50\,\text{s}$.

## 4. Worked example
**Predict first (before you run it):** commit to four numbers before the block runs: (1) the cap $\alpha h$ at $h = 0.04\,\text{m}$ and $\alpha = 5.0\,\text{s}^{-1}$, and whether a $0.80\,\text{m/s}$ request survives it; (2) $u^\ast$ for the exercise's $h = 0.10\,\text{rad}$ and $\alpha = 8.0\,\text{s}^{-1}$ against a $1.20\,\text{rad/s}$ request; (3) whether a $-0.40\,\text{rad/s}$ retreat at $h = 0.05\,\text{rad}$ is modified at all; (4) the margin left after $0.50\,\text{s}$ from $h_0 = 0.20\,\text{m}$ at $\alpha = 2.0\,\text{s}^{-1}$. Two tells that a wrong answer is a mistake rather than a surprise: a command *above* $\alpha h$ means the inequality was solved with the sign flipped, and a retreat that changes means the cap was applied as a floor.

Solve the filter for a joint approaching a wall, on the shared arm's own clamp numbers.

```python
import math

import mechalab_plant as plant


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    upper = min(u_max, alpha * h_value)
    if upper < u_min:
        raise ValueError("infeasible: the barrier allows at most %r, below u_min %r"
                         % (upper, u_min))
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    return h0 * math.exp(-alpha * t)


u_safe = cbf_command(0.80, 0.04, 5.0)                     # worked: 0.80 -> 0.20
u_ex = cbf_command(1.20, 0.10, 8.0, -2.0, 2.0)            # exercise: 1.20 -> 0.80
u_skip = cbf_command(0.80, 0.05, 6.0)                     # skip test: 0.80 -> 0.30
retreat = cbf_command(-0.40, 0.05, 6.0)                   # away from the stop: untouched
h_min = barrier_lower_bound(0.20, 2.0, 0.50)              # 0.20 * exp(-1)

# The plant's own numbers: a 1 ms tick is one time constant at alpha = 1/DT, and the 2.5 N*m
# clamp over I1 stops 0.3125 rad/s in one tick, a 1.5625e-4 rad stopping distance.
tick_margin = barrier_lower_bound(0.05, 1.0 / plant.DT, plant.DT)
accel = plant.TAU_LIMIT / plant.I1
stop_speed = accel * plant.DT

assert math.isclose(u_safe, 0.20, rel_tol=1e-12)
assert math.isclose(u_ex, 0.80, rel_tol=1e-12)
assert math.isclose(u_skip, 0.30, rel_tol=1e-12)
assert math.isclose(retreat, -0.40, rel_tol=1e-15)
assert math.isclose(h_min, 0.20 * math.exp(-1.0), rel_tol=1e-15)
assert math.isclose(tick_margin, 0.05 * math.exp(-1.0), rel_tol=1e-15)
assert math.isclose(accel, 312.5, rel_tol=1e-12)
assert math.isclose(stop_speed, 0.3125, rel_tol=1e-15)
print(f"u_safe={u_safe:.2f}, u_ex={u_ex:.2f}, u_skip={u_skip:.2f}, "
      f"retreat={retreat:.2f}, h_min={h_min:.6f}, tick_margin={tick_margin:.6f}")
```
Expected output:
```text
u_safe=0.20, u_ex=0.80, u_skip=0.30, retreat=-0.40, h_min=0.073576, tick_margin=0.018394
```

## 5. Exercise
A velocity-controlled joint approaches an upper limit $q_{\max} = 1.50\,\text{rad}$ from $q = 1.40\,\text{rad}$, with $h(q) = q_{\max} - q$, barrier gain $\alpha = 8.0\,\text{s}^{-1}$, nominal command $u_{\text{nom}} = +1.20\,\text{rad/s}$ and actuator bounds $u \in [-2.0, +2.0]\,\text{rad/s}$. Verify $h = 0.10\,\text{rad}$ and $u^\ast = 0.80\,\text{rad/s}$ ($\pm 10^{-9}$), then move the same joint past the stop to $h = -0.05$ and confirm the filter reverses the command to $-0.40\,\text{rad/s}$ instead of clamping it to zero.
- **If your result differs:** $u_{\text{nom}} = 1.20$ violates $u \le 8.0 \times 0.10 = 0.80$, so the closest admissible value is the boundary $0.80$; a result of $0.0$ means the constraint was applied as an equality instead of a one-sided cap.

### Graded package - the barrier, the bound and the infeasible case
[`exercises/05-control.T3.05c/`](../exercises/05-control.T3.05c/) turns this section into a test. `starter.py` holds two holes: `cbf_command` (the projection onto $u \le \alpha h$ and $[u_{\min}, u_{\max}]$) and `barrier_lower_bound` ($h_0e^{-\alpha t}$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/05-control.T3.05c/starter.py \
  python3 -m unittest discover -s exercises/05-control.T3.05c -p 'test_*.py'
```

**16 tests.** The filter must return $0.20$ at the worked wall, $0.80$ on the exercise and $0.30$ at the Skip test's margin, leave a $-0.40$ retreat untouched, pass a satisfied command through unmodified, honour the $\pm 2\,\text{rad/s}$ actuator bound even at a far wall, reverse past the stop ($h = -0.05$ at $8\,\text{s}^{-1}$ admits only $u \le -0.40$), and refuse an infeasible barrier ($h = -0.50$ needs $u \le -4.0$). The bound is checked at $0.20e^{-1}$, at $t = 0$ (the initial margin), and it must shrink monotonically; bad margins, gains and times are refused. The transfer suite runs **the plant's own shoulder**: its $1\,\text{ms}$ tick is exactly one time constant of a $1000\,\text{s}^{-1}$ barrier, a $0.05\,\text{rad}$ margin allows $50\,\text{rad/s}$ so a $0.50\,\text{rad/s}$ command passes untouched, and the $2.5\,\text{N}\cdot\text{m}$ clamp over `I1` removes $0.3125\,\text{rad/s}$ per tick - a $1.5625\times10^{-4}\,\text{rad}$ stopping distance at which the barrier admits only $0.15625\,\text{rad/s}$. Five planted faults - `cbf_ignores_barrier`, `cbf_limit_sign_flipped`, `barrier_bound_ignores_alpha`, `cbf_ignores_actuator_max`, `cbf_ignores_infeasibility` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*State-Space & Covariance*) and Legacy **Step 3.1 (`00-foundations.T3.01`)** (*Van Loan ZOH & Lie Groups*).
  - **Prerequisite Bridge Modules:** [`05-control.T3.05a`](05-control.T3.05a.md) (*Joseph-form covariance*) and [`05-control.T3.05b`](05-control.T3.05b.md) (*tangent-space injection and reset*).
  - **Core Concepts to Review First:** the safe set, the CBF condition $\dot{h} \ge -\alpha h$ and the closed-form projection in `## 3. Formalization` (Items 1-3) and the four commands in `## 4. Worked example` above.
  - **Study Links & Resources:** [Ames et al. *Control Barrier Functions: Theory and Applications* (`arXiv:1903.11199`)](https://arxiv.org/abs/1903.11199) and [Track 05 Tier 3 (`05-control-and-estimation/README.md#tier-3-advanced--production`)](../05-control-and-estimation/README.md#tier-3-advanced--production) (**Tab 4**).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """Project u_nom onto `u <= alpha h` and the actuator bounds, minimally."""
    # TODO 1: the barrier caps the command at alpha * h (hdot = -u), so take the smaller cap
    # TODO 2: clip u_nom into [u_min, upper]; refuse an interval where upper < u_min
    ...


def barrier_lower_bound(h0, alpha, t):
    """The guaranteed margin h0 exp(-alpha t) under the CBF condition."""
    # TODO 3: exponential decay, not a straight line - the gain alpha is the rate
    ...


def stopping_speed(tau_limit, inertia, dt):
    """How much speed one tick of the torque clamp can remove: (tau / I) * dt."""
    # TODO 4: the plant's own numbers put this at 0.3125 rad/s for 2.5 N*m over I1 = 0.008
    ...


def stopping_distance(tau_limit, inertia, dt):
    """The distance covered while that tick of deceleration acts: 1/2 a dt^2."""
    # TODO 5: constant acceleration, so the 1/2 matters - it is 1.5625e-4 rad here
    ...


print("scaffold ready: 5 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $h = 0.10$, $\alpha = 8.0$ caps $1.20$ at $0.80\,\text{rad/s}$; $h = -0.05$ reverses the command to $-0.40$; $h = -0.50$ admits only $-4.0$ and is infeasible; $h_0 = 0.20$ at $\alpha = 2.0$ is $0.073576\,\text{m}$ after $0.50\,\text{s}$; one tick removes $0.3125\,\text{rad/s}$ over $1.5625\times10^{-4}\,\text{rad}$.

### Hint ladder
1. **Sign of the inequality.** With $\dot{h} = -u$, the condition $\dot{h} \ge -\alpha h$ is $u \le \alpha h$ - a **ceiling**, not a floor. At $h = 0.10$, $\alpha = 8.0$ the ceiling is $0.80$, so the $1.20$ request lands exactly on it.
2. **Past the stop.** At $h = -0.05$ the ceiling is $-0.40$: the filter does not clamp to zero, it commands a retreat that drives $h$ back up. A result of $0$ means the constraint was imposed as an equality.
3. **The infeasible case.** At $h = -0.50$ the ceiling is $-4.0$, below $u_{\min} = -2.0$; there is no admissible command and clamping to $-2.0$ would silently disobey the barrier, so raise instead.
4. **Braking distance, on the plant.** $a = 2.5/0.008 = 312.5\,\text{rad/s}^2$, so one $1\,\text{ms}$ tick removes $0.3125\,\text{rad/s}$ over $\tfrac12 a\Delta t^2 = 1.5625\times10^{-4}\,\text{rad}$; at that margin a $1000\,\text{s}^{-1}$ barrier admits only $0.15625\,\text{rad/s}$.

### Full Solution
```python
import math


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    upper = min(u_max, alpha * h_value)
    if upper < u_min:
        raise ValueError("infeasible: the barrier allows at most %r, below u_min %r" % (upper, u_min))
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    return h0 * math.exp(-alpha * t)


def stopping_speed(tau_limit, inertia, dt):
    return (tau_limit / inertia) * dt


def stopping_distance(tau_limit, inertia, dt):
    return 0.5 * (tau_limit / inertia) * dt * dt


u_ex = cbf_command(1.20, 0.10, 8.0)
retreat = cbf_command(-0.40, 0.05, 6.0)
u_work = cbf_command(0.80, 0.04, 5.0)
h_min = barrier_lower_bound(0.20, 2.0, 0.50)
speed = stopping_speed(2.5, 0.008, 1e-3)
distance = stopping_distance(2.5, 0.008, 1e-3)
one_tick = cbf_command(speed, distance, 1.0 / 1e-3)

assert math.isclose(u_ex, 0.80, abs_tol=1e-9)
assert math.isclose(retreat, -0.40, abs_tol=1e-15)
assert math.isclose(u_work, 0.20, abs_tol=1e-12)
assert math.isclose(h_min, 0.20 * math.exp(-1.0), rel_tol=1e-12)
assert math.isclose(speed, 0.3125, abs_tol=1e-15)
assert math.isclose(distance, 1.5625e-4, rel_tol=1e-12)
assert math.isclose(one_tick, 0.15625, abs_tol=1e-12)
try:
    cbf_command(0.0, -0.50, 8.0)
except ValueError:
    infeasible = True
else:
    infeasible = False
assert infeasible
print(f"u_ex={u_ex:.2f}, retreat={retreat:.2f}, u_work={u_work:.2f}, h_min={h_min:.6f}, "
      f"one_tick={one_tick:.5f}, infeasible={infeasible}")
```

Printed: `u_ex=0.80, retreat=-0.40, u_work=0.20, h_min=0.073576, one_tick=0.15625, infeasible=True`

### Break it on purpose
Inject the `## 8. Common mistakes` row about ignoring the barrier, keeping the worked example's $u_{\text{nom}} = 0.80\,\text{m/s}$, $h = 0.04\,\text{m}$ and $\alpha = 5.0\,\text{s}^{-1}$:
- **Inject:** delete the cap - `return min(max(u_nom, u_min), u_max)` - so the filter is only an actuator clamp and the barrier inequality never enters.
- **Symptom:** the command reads $0.80\,\text{m/s}$ instead of $0.20$ at a wall $0.04\,\text{m}$ away, a $4\times$ overshoot that closes the gap in $0.05\,\text{s}$; the retreat case and the infeasible case look fine, because neither one touches the barrier.
- **Diagnose:** only the cases where the barrier binds are wrong, and they are wrong by exactly $u_{\text{nom}} - \alpha h = 0.60$, which is the constraint itself - so the gain, the bounds and the retreat path are all ruled out. A sign flip would instead *raise* the command beyond $\alpha h$ while also modifying the retreat, and the retreat is untouched here.
- **Fix:** restore `upper = min(u_max, alpha * h_value)` and return `min(max(u_nom, u_min), upper)`. The worked case then reads $0.20$, the exercise $0.80$, the retreat stays $-0.40$, and the plant's one-tick margin admits only $0.15625\,\text{rad/s}$ against a $0.3125\,\text{rad/s}$ approach.

## 6. Simulation path
Open **Tab 4 (Swing-Up, LQR & Predictive Control Barrier Function QP)** in the MechaLab Workbench (`npm run dev`) and watch the nominal command and the filtered command separate only as the joint nears its stop, or run `05-control-and-estimation/lab/lab05_eskf_mpc_and_cbf.py`.

The graded package is also a workbench entry: **Modules -> `EX.05-control.T3.05c`**, where `selfcheck.py` is appended below the starter and **Verify** compares it against the instructor copy of the same self-check. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 3.6 (`05-control.T3.06`) this QP runs at $1\text{-}2\,\text{kHz}$ between the nominal controller and the FOC torque loop:
```text
[Nominal LQR / MPC u_nom] ---> [CBF-QP: min ||u - u_nom||^2 s.t. hdot >= -alpha h] ---> [Safe torque]
```
Pass/fail verification in simulation: `u_safe == 0.20`, `u_ex == 0.80`, `retreat == -0.40`, and `h_min == 0.073576` at $0.50\,\text{s}$.

### Safety notes
> **No hardware required (`safety_level: none`):** the filter is exercised on the plant's model in the browser. On a real joint the same inequality is the last software layer before the torque clamp, so it is never the only safeguard.

```mermaid
flowchart LR
    A["05-control.T3.05c: control_barrier_forward_invariance_qp"] --> B["Safe set h(x) >= 0"]
    B --> C["CBF condition hdot >= -alpha h"]
    C --> D["Projection onto the safe half-space"]
    D --> E["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and the exercise asserts clean, or score $\ge 80\%$ ($3/4$) on the Skip test below.

### Skip test
1. `[Recall] [Concept: control_barrier_forward_invariance_qp]` A joint at $q = 0.95\,\text{rad}$ approaches $q_{\max} = 1.00\,\text{rad}$ with $\alpha = 6.0\,\text{s}^{-1}$ and $u_{\text{nom}} = +0.80\,\text{rad/s}$. Compute $u^\ast$ (tolerance $\pm 10^{-9}\,\text{rad/s}$).
2. `[Apply] [Concept: control_barrier_forward_invariance_qp]` With the same margin and gain, what does the filter return for $u_{\text{nom}} = -0.40\,\text{rad/s}$ (moving away from the stop)?
3. `[Transfer] [Concept: control_barrier_forward_invariance_qp]` The guaranteed margin is $h_0e^{-\alpha t}$. Compute $h(0.50\,\text{s})$ from $h_0 = 0.20\,\text{m}$ at $\alpha = 2.0\,\text{s}^{-1}$ (tolerance $\pm 10^{-6}\,\text{m}$).
4. `[Spaced review -> 05-control.T3.05b — Concept: tangent_space_eskf_error_injection] [Concept: control_barrier_forward_invariance_qp]` Why is the CBF-QP called *minimally invasive*?
   - **A.** Because when the nominal command already satisfies $\dot{h} \ge -\alpha h$ the constraint is inactive and $u^\ast = u_{\text{nom}}$ exactly.
   - **B.** Because it turns the motors off near a wall.
   - **C.** Because it ignores the actuator limits.
   - **D.** Because it only runs at startup.

**Answer key:**
```python
import math

q1_u_star = min(0.80, 6.0 * (1.00 - 0.95))
q2_u_away = min(-0.40, 6.0 * 0.05)
q3_h_min = 0.20 * math.exp(-2.0 * 0.50)
q4_choice = "A"

assert math.isclose(q1_u_star, 0.30, rel_tol=1e-9)
assert math.isclose(q2_u_away, -0.40, rel_tol=1e-9)
assert math.isclose(q3_h_min, 0.20 * math.exp(-1.0), rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $3/4$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 3; if you missed Q3, item 2; if you missed Q4, study `## 2. Intuition first`. On pass, proceed to Step 3.6 (`05-control.T3.06`).

### Gate test
This is the exit examination for the whole Track 05 Tier 3 ladder - the three bridges [`05-control.T3.05a`](05-control.T3.05a.md), [`05-control.T3.05b`](05-control.T3.05b.md) and this module - before Step 3.6 (`05-control.T3.06`).
1. `[Concept: joseph_stabilized_covariance_update]` A scalar filter has $P^- = 10.0$, $H = 1.0$, $R = 1.0$, and a bug sets $K = 1.20$. Compute the Joseph-form posterior $(1-KH)^2P^- + K^2R$ (tolerance $\pm 10^{-9}$).
2. `[Concept: joseph_stabilized_covariance_update]` Why is that form mandatory in a 32-bit navigation filter?
   - **A.** Because it is a sum of two positive semi-definite quadratic forms, so symmetry and non-negativity survive roundoff and suboptimal gains.
   - **B.** Because it avoids the measurement noise $R$.
   - **C.** Because it sets $P^+ = 0$ after one step.
   - **D.** Because it does not use $H$.
3. `[Concept: tangent_space_eskf_error_injection]` A $0.05$ rad correction is injected, the error-state mean is reset, and the next update carries a zero innovation. What angle has the frame turned in total (tolerance $\pm 10^{-9}$ rad)?
4. `[Concept: tangent_space_eskf_error_injection]` The plant's encoder resolves $2\pi/4096$ rad per count. Compute that tangent-space step (tolerance $\pm 10^{-12}$ rad).
5. `[Concept: control_barrier_forward_invariance_qp]` At $h = -0.05\,\text{rad}$, $\alpha = 8.0\,\text{s}^{-1}$ and $u_{\text{nom}} = 0$, what command does the filter return (tolerance $\pm 10^{-9}\,\text{rad/s}$)?
6. `[Concept: control_barrier_forward_invariance_qp]` At $h = -0.50\,\text{rad}$, $\alpha = 8.0\,\text{s}^{-1}$ and $u \in [-2, 2]$, is the QP feasible? Answer `True` or `False`.

**Gate answer key:**
```python
import math

g1_p_joseph = ((1.0 - 1.20 * 1.0) ** 2) * 10.0 + (1.20 ** 2) * 1.0
g2_choice = "A"
g3_angle = 0.05
g4_count = 2.0 * math.pi / 4096.0
g5_u = max(min(0.0, 8.0 * -0.05), -2.0)
g6_feasible = 8.0 * -0.50 >= -2.0

assert math.isclose(g1_p_joseph, 1.84, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_angle, 0.05, rel_tol=1e-9)
assert math.isclose(g4_count, 0.0015339807878856412, rel_tol=1e-12)
assert math.isclose(g5_u, -0.40, rel_tol=1e-9)
assert g6_feasible is False
```
- **Pass mark:** $5/6$ ($80\%+$); on pass, proceed to Step 3.6 (`05-control.T3.06`).

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| The arm drives straight through its soft limit at full speed while every other behaviour looks normal | The barrier command is only an actuator clamp; $\alpha h$ never enters the return value. | Cap the command: `upper = min(u_max, alpha * h)`, then clip $u_{\text{nom}}$ into $[u_{\min}, upper]$. |
| A command moving *away* from the stop is modified, while one moving toward it is not | The inequality was applied as a floor ($u \ge \alpha h$) instead of a cap ($u \le \alpha h$). | With $\dot{h} = -u$, the condition $\dot{h} \ge -\alpha h$ becomes $u \le \alpha h$. |
| The QP raises an infeasibility error near the wall at high speed | A relative-degree-1 barrier on a second-order plant, or $\alpha$ too large for the available torque. | Use a stopping-distance barrier $h(q, \dot{q}) = (q_{\max} - q) - \frac{\dot{q}\lvert\dot{q}\rvert}{2a_{\max}}$ with $a_{\max} = \tau_{\max}/J$. |

## 9. Resources
- **Ames et al. - [*Control Barrier Functions: Theory and Applications* (`arXiv:1903.11199`)](https://arxiv.org/abs/1903.11199):** forward invariance, class-$\mathcal{K}$ gains and the QP formulation `[VERIFIED 2026-10-15]`.
- **Tedrake - [*Underactuated Robotics* (`underactuated.mit.edu`)](https://underactuated.mit.edu/):** barrier functions and safety filters in the control stack `[VERIFIED 2026-10-15]`.
- **Track 05 Tier 3 ([`05-control-and-estimation/README.md`](../05-control-and-estimation/README.md#tier-3-advanced--production)):** where the safety filter sits before the torque loop `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to Step 3.6 (`05-control.T3.06`) (*Joseph-Form Manifold ESKF, Embedded MPC & Control Barrier QPs*), which runs all three bridges in one $1\text{ kHz}$ stack.
