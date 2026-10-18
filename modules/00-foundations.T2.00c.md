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
difficulty:
  math: 3
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

## 1. Why it matters
Every motor winding, thermal heatsink, and RC filter obeys a first-order differential equation governed by a time constant $\tau$, while every compliant robot joint and closed-loop PID servo obeys a second-order differential equation governed by natural frequency $\omega_n$ and damping ratio $\zeta$. Knowing how $\omega_n$ and $\zeta$ determine overshoot and settling time lets you compute exact controller gains instead of guessing by trial and error. Already know this? Take the Skip test in section 7 first.

## 2. Intuition first
Push open a heavy glass office door equipped with an overhead hydraulic closer. If the closer valve is wide open (underdamped), the door swings fast, slams past the frame, and rings back and forth several times before stopping. If a mechanic tightens the hydraulic valve way too far (overdamped), the door creeps shut painfully slowly without ever overshooting. Right on the boundary between those two regimes sits a sweet spot (critical damping) where the door snaps shut as fast as physically possible with zero rebound.

## 3. Formalization
1. **First-Order System ($\tau\dot{y} + y = u$):** Driven by a unit step $u(t) = 1$ from $y(0) = 0$, the solution is $y(t) = 1 - e^{-t/\tau}$, where time constant $\tau$ in seconds ($\text{s}$) is the time to reach $1 - e^{-1} \approx 63.2\%$ of the step. At $t = \tau = 0.010\text{ s}$, $y(0.010\text{ s}) = 1 - e^{-1} = 0.6321$.
2. **Canonical Second-Order ODE ($\omega_n$ and $\zeta$):** Dividing rotary joint dynamics $J\ddot{\theta} + b\dot{\theta} + k\theta = \tau_{\text{in}}$ by inertia $J$ ($\text{kg}\cdot\text{m}^2$) yields the canonical form with natural frequency $\omega_n$ ($\text{rad/s}$) and dimensionless damping ratio $\zeta$:

$$
\ddot{\theta} + 2\zeta\omega_n\dot{\theta} + \omega_n^2\theta = \frac{\tau_{\text{in}}}{J}, \qquad \omega_n = \sqrt{\frac{k}{J}}, \qquad \zeta = \frac{b}{2\sqrt{Jk}}
$$

   For $J = 0.02\text{ kg}\cdot\text{m}^2$, stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, and damping $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$, $\omega_n = \sqrt{\frac{8.0}{0.02}} = 20.0\text{ rad/s}$ and $\zeta = \frac{0.40}{2\sqrt{0.02 \times 8.0}} = 0.50$.
3. **Characteristic Roots, Damped Frequency $\omega_d$ & Peak Overshoot $M_p$:** The characteristic polynomial $s^2 + 2\zeta\omega_n s + \omega_n^2 = 0$ has roots $s = -\zeta\omega_n \pm j\omega_d$ for $0 < \zeta < 1$, where damped oscillation frequency $\omega_d$ ($\text{rad/s}$) and fractional step overshoot $M_p$ are:

$$
\omega_d = \omega_n\sqrt{1 - \zeta^2}, \qquad M_p = \exp\!\left(\frac{-\pi\zeta}{\sqrt{1 - \zeta^2}}\right)
$$

   For $\omega_n = 20.0\text{ rad/s}$ and $\zeta = 0.50$, $\omega_d = 20.0\sqrt{0.75} = 17.3205\text{ rad/s}$ and $M_p = \exp(-\pi \times 0.50 / \sqrt{0.75}) = 0.16303$ ($16.30\%$ overshoot).

## 4. Worked example
**Predict first (before you run it):** Commit to four numbers before the code runs, for $J = 0.02\text{ kg}\cdot\text{m}^2$, $k = 8.0\text{ N}\cdot\text{m/rad}$ and $b = 0.40\text{ N}\cdot\text{m}\cdot\text{s/rad}$: (1) $\omega_n$ and $\zeta$; (2) the analytic overshoot $M_p$; (3) will the numerical loop report a few hundredths of a percent *more* or *less* than the formula? Two tells that a wrong answer is a mistake: $\zeta$ must be $0.50$, exactly half of $b_{\text{crit}} = 0.80\text{ N}\cdot\text{m}\cdot\text{s/rad}$, so $0.25$ means the factor $2$ was dropped from $b/(2\sqrt{Jk})$; and $\omega_d = \omega_n\sqrt{1-\zeta^2}$ must come out *below* $\omega_n = 20.0\text{ rad/s}$, so $\omega_d > \omega_n$ means the $\sqrt{1-\zeta^2}$ was left out.
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
wn=20.0 rad/s, zeta=0.50, Mp_analytic=16.30%, Mp_sim=16.28%
```

## 5. Exercise
For the same inertia $J = 0.02\text{ kg}\cdot\text{m}^2$ and stiffness $k = 8.0\text{ N}\cdot\text{m/rad}$, compute the critical damping coefficient $b_{\text{crit}} = 2\sqrt{Jk}$ ($\zeta = 1.0$) and verify in the simulation loop that `mp_sim < 1e-6` ($0.0\%$ overshoot). Expected result: `b_crit = 0.80 N*m*s/rad`.
- **If your result differs:** Check that you took the square root of the product $\sqrt{J k} = \sqrt{0.16} = 0.40$ before multiplying by $2$, rather than computing $2 J k = 0.32$.

### Graded package - two orders, and the step size that lies
[`exercises/00-foundations.T2.00c/`](../exercises/00-foundations.T2.00c/) turns this section into a test. `starter.py` holds six holes: `first_order_response`, `second_order_params` (`wn`, `zeta`, `wd`, `mp`), `critical_damping`, `settling_time` (refusing an undamped system), `simulate_step` (semi-implicit, velocity first) and `max_stable_dt`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T2.00c/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T2.00c -p 'test_*.py'
```

The tests are behavioural: the first-order response must be $1 - e^{-1}$ at $t = \tau$ and must change when $\tau$ changes; `zeta` must be `b / (2 sqrt(J k))` at a plant that is not the worked one; the overshoot formula is checked at $\zeta = 0.3$, where dropping the $\sqrt{1-\zeta^2}$ is visible; a critically damped simulation must overshoot by less than $10^{-6}$; and the scheme must stay bounded at $0.9$ of its limit and diverge at $1.5$ - the integrator's property, not the physics. The transfer suite runs the plant's own elbow (whose viscous damping `plant.B2` is part of `b`, not a free parameter) and the plant's motor, where the current must reach 63.2% of steady at $t = L/R$. Four planted faults - `zeta_no_two`, `linear_bcrit`, `wrong_mp`, `hardcoded_params` - each fail the test named for them.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Spring-Mass-Damper Loop*) and [`00-foundations.T2.00b`](00-foundations.T2.00b.md).
  - **Core Concepts to Review First:** Standard second-order ODE $\ddot{q} + 2\zeta\omega_n\dot{q} + \omega_n^2 q = \omega_n^2 q_{\text{ref}}$, natural frequency $\omega_n = \sqrt{k/J}$, damping ratio $\zeta = \frac{b}{2\sqrt{Jk}}$, and critical damping $b_{\text{crit}} = 2\sqrt{Jk}$ ($\zeta = 1.0$) in `## 3. Formalization` (Items 2–3) and `## 4. Worked example` above.
  - **ODEs & Damping Study Links:** [Åström & Murray *Feedback Systems* Ch. 6 (`fbsbook.org`)](https://www.fbsbook.org/), [Paul's Online Math Notes: Second-Order Differential Equations & Mechanical Vibrations](https://tutorial.math.lamar.edu/Classes/DE/Vibrations.aspx), and [MIT OCW 18.03 Differential Equations](https://ocw.mit.edu/courses/18-03sc-differential-equations-fall-2011/).
  - **Curriculum Reference:** [Track 00 Tier 2 (`00-foundations/README.md#tier-2-intermediate--applied`)](../00-foundations/README.md#tier-2-intermediate--applied) and [Track 05 (`05-control-and-estimation/README.md`)](../05-control-and-estimation/README.md).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution ---
import math


def first_order_response(t, tau):
    """Unit-step response; at t = tau it must read 0.6321."""
    # TODO 1: 1 - exp(-t/tau)
    ...


def second_order_params(j, k, b):
    """{"wn", "zeta", "wd", "mp"} for J theta'' + b theta' + k theta = k u."""
    # TODO 2: wn = sqrt(k/J); zeta = b/(2 sqrt(J k)); wd = wn sqrt(1-zeta^2);
    #         mp = exp(-pi zeta / sqrt(1-zeta^2)); at zeta >= 1, mp = 0 and wd = 0
    ...


def critical_damping(j, k):
    """The b that makes zeta exactly 1.0."""
    # TODO 3: 2 sqrt(J k) - a square root, not 2 J k
    ...


def settling_time(wn, zeta, tolerance=0.02):
    """The 2% settling time, and a ValueError when the system never settles."""
    # TODO 4: 4/(zeta wn), refusing zeta <= 0
    ...


def simulate_step(j, k, b, dt, steps, theta0=0.0, omega0=0.0):
    """Semi-implicit Euler on J theta'' = k(1 - theta) - b theta'; return theta, max_theta, mp."""
    # TODO 5: alpha from the current theta and omega, update omega, then theta with the NEW omega
    ...


def max_stable_dt(j, k):
    """Largest dt the semi-implicit scheme tolerates for an undamped joint."""
    # TODO 6: 2/wn - the integrator's limit, not a guess
    ...


print("scaffold ready: 6 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $b_{\text{crit}} = 2\sqrt{0.02 \times 8.0} = 0.80\text{ N}\cdot\text{m}\cdot\text{s/rad}$; at $b = 0.80$ the $20,000$-step run of $1\text{ ms}$ ticks overshoots by less than $10^{-6}$; the worked $b = 0.40$ joint reads $\omega_n = 20.0$, $\zeta = 0.50$, $M_p = 0.16303$.

### Hint ladder
1. **$\zeta$ carries a factor of two.** $\zeta = b/(2\sqrt{Jk})$, so $b = 0.40$, $J = 0.02$, $k = 8.0$ gives $\zeta = 0.40/(2 \times 0.40) = 0.50$. Dropping the 2 doubles every damping ratio you report, and the module's $M_p$ check at $\zeta = 0.3$ is where that shows up.
2. **Overshoot needs the damped frequency.** $M_p = e^{-\pi\zeta/\sqrt{1-\zeta^2}}$, not $e^{-\pi\zeta}$: at $\zeta = 0.50$ the former is $0.16303$, the latter $0.2079$. Above $\zeta = 1$ there is no oscillation at all, so the block returns $M_p = 0$ and $\omega_d = 0$ rather than a complex number.
3. **Critical damping is a square root.** $b_{\text{crit}} = 2\sqrt{Jk} = 2\sqrt{0.16} = 0.80$, while $2Jk = 0.32$ is underdamped ($\zeta = 0.40$) and overshoots by about $25.4\%$ - the exercise's own "if your result differs" case.
4. **The stability limit belongs to the integrator.** With velocity updated first, the map stays bounded while $\Delta t \omega_n < 2$, so $\Delta t_{\max} = 0.10\text{ s}$ at $\omega_n = 20$. At $0.9\Delta t_{\max}$ the response is bounded; at $1.5\Delta t_{\max}$ it diverges, and no physical damping saves it.

5. **What the suite refuses.** `settling_time` refuses a system that never settles - a zero or negative time constant, or an envelope the decay can never reach - because its settling time would be infinite; it raises `ValueError`.

### Full Solution
```python
import math


def first_order_response(t, tau):
    return 1.0 - math.exp(-t / tau)


def second_order_params(j, k, b):
    wn = math.sqrt(k / j)
    zeta = b / (2.0 * math.sqrt(j * k))
    if zeta >= 1.0:
        return {"wn": wn, "zeta": zeta, "wd": 0.0, "mp": 0.0}
    root = math.sqrt(1.0 - zeta * zeta)
    return {"wn": wn, "zeta": zeta, "wd": wn * root, "mp": math.exp(-math.pi * zeta / root)}


def critical_damping(j, k):
    return 2.0 * math.sqrt(j * k)


def settling_time(wn, zeta, tolerance=0.02):
    if zeta <= 0.0:
        raise ValueError("an undamped or unstable system never settles")
    return 4.0 / (zeta * wn)


def simulate_step(j, k, b, dt, steps, theta0=0.0, omega0=0.0):
    theta, omega = theta0, omega0
    max_theta = theta
    for _ in range(steps):
        alpha = (k * (1.0 - theta) - b * omega) / j
        omega += alpha * dt
        theta += omega * dt
        if theta > max_theta:
            max_theta = theta
    return {"theta": theta, "max_theta": max_theta, "mp": max(0.0, max_theta - 1.0)}


def max_stable_dt(j, k):
    return 2.0 / math.sqrt(k / j)


# The exercise: critical damping at J = 0.02, k = 8.0, then the same loop at b = 0.40.
j, k = 0.02, 8.0
b_crit = critical_damping(j, k)
critical = simulate_step(j, k, b_crit, 1e-4, 20000)
worked = second_order_params(j, k, 0.40)
worked_run = simulate_step(j, k, 0.40, 1e-4, 10000)

assert math.isclose(b_crit, 0.80, abs_tol=1e-12)
assert math.isclose(second_order_params(j, k, b_crit)["zeta"], 1.0, abs_tol=1e-12)
assert critical["mp"] < 1e-6, critical
assert math.isclose(worked["wn"], 20.0, abs_tol=1e-9)
assert math.isclose(worked["zeta"], 0.50, abs_tol=1e-9)
assert math.isclose(worked["wd"], 20.0 * math.sqrt(0.75), abs_tol=1e-9)
assert math.isclose(worked["mp"], 0.16303, abs_tol=1e-5)
assert abs(worked_run["mp"] - worked["mp"]) < 1e-3, worked_run
assert math.isclose(max_stable_dt(j, k), 0.10, abs_tol=1e-12)
assert math.isclose(first_order_response(0.010, 0.010), 1.0 - math.exp(-1.0), abs_tol=1e-12)

print("b_crit=%.2f -> zeta=%.1f, overshoot %.2e | worked: wn=%.1f, zeta=%.2f, Mp=%.5f, Ts=%.4f s"
      % (b_crit, 1.0, critical["mp"], worked["wn"], worked["zeta"], worked["mp"],
         settling_time(worked["wn"], worked["zeta"])))
```

Printed: `b_crit=0.80 -> zeta=1.0, overshoot 0.00e+00 | worked: wn=20.0, zeta=0.50, Mp=0.16303, Ts=0.4000 s` - the critical coefficient with its near-zero overshoot, then the worked joint's four numbers and its $4/(\zeta\omega_n) = 0.4000\text{ s}$ settling time.

**On the shared arm.** The Transfer suite measures the plant's elbow joint under a PD law and finds this module's first-order time constant in the plant's own tick:

```python
import math
import mechalab_plant as plant

assert math.isclose(10e3 * 100e-9, plant.DT, rel_tol=0.0, abs_tol=1e-15)
assert math.isclose(1.0 / plant.DT, 1000.0, rel_tol=1e-15)
elbow_k = 8.0
wn = math.sqrt(elbow_k / plant.I2)
print("plant tick=%.3f ms is the 10 kOhm / 100 nF RC constant | elbow wn=%.3f rad/s"
      % (plant.DT * 1e3, wn))
```

### Break it on purpose
Inject the square-root slip the exercise warns about - $b_{\text{crit}} = 2 J k$ instead of $2\sqrt{Jk}$ - and diagnose it from the step response alone, keeping $J = 0.02\text{ kg}\cdot\text{m}^2$ and $k = 8.0\text{ N}\cdot\text{m/rad}$:
- **Inject:** set $b = 2 J k = 0.32\text{ N}\cdot\text{m}\cdot\text{s/rad}$ and call it critical damping.
- **Symptom:** the response is underdamped, not critical: $\zeta = 0.32 / (2\sqrt{0.02 \times 8.0}) = 0.40$, so the simulation overshoots by $M_p = \exp(-\pi(0.40)/\sqrt{0.84}) \approx 25.4\%$ instead of the $< 10^{-6}$ the exercise requires.
- **Diagnose:** a 25% overshoot cannot be critical damping at any $J$ or $k$, so the fault is in $b_{\text{crit}}$, not in the integrator - the same loop at $b = 0.80$ gives no overshoot, which rules out the step size and the initial condition. The giveaway is numerical: $2 J k = 0.32$ is *smaller* than $2\sqrt{Jk} = 0.80$ whenever $Jk < 1$ in these units, so the "critical" value always lands underdamped.
- **Fix:** use $b_{\text{crit}} = 2\sqrt{Jk} = 0.80\text{ N}\cdot\text{m}\cdot\text{s/rad}$; then $\zeta = 1.00$ and the same loop reports `mp_sim < 1e-6`, which is the proof the repair worked.

## 6. Simulation path
Run the worked example in Python, then open **Tab 2 (Two-Mass & Notch Bode)** in the MechaLab Workbench to watch how low structural damping $\zeta$ creates a sharp time-domain ringing transient.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T2.00c`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). On a physical servo joint in Track 05 (`Step 1.6`), proportional gain $K_p$ sets $k$ and derivative gain $K_d$ sets $b$:
```text
[Step Command 1.0 rad] ---> [PD Loop: Kp=8.0, Kd=0.80 on J=0.02] ---> [Critically Damped Shaft Response (zeta=1.0)]
```
Pass/fail verification in simulation: `wn == 20.0 rad/s`, `zeta == 0.50`, and `Mp == 16.30%`.


```mermaid
flowchart LR
    A["00-foundations.T2.00c: first_order_ode_time_constant"] --> B["second_order_ode_wn_zeta"]
    B --> C["characteristic_polynomial_roots"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
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
5. `[Spaced review -> 00-foundations.T2.00b — Concept: dot_product_projection] [Concept: first_order_ode_time_constant]` Compute $\vec{u}\cdot\vec{v}$ (tolerance $\pm 10^{-9}$) for $\vec{u} = [1.0, 0.0, -2.0]^T$ and $\vec{v} = [3.0, 5.0, 1.5]^T$.

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
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1, Q2, or Q3, study `## 3. Formalization`; if you missed Q4, study `## 4. Worked example`; if you missed Q5, study `## 3. Formalization` (and review `00-foundations.T2.00b`). On pass, proceed to `## 10. Next modules`.

### Gate test
This is the exit examination for the whole Track 00 Tier 2 ladder - [`00-foundations.T2.00a`](00-foundations.T2.00a.md), [`00-foundations.T2.00g`](00-foundations.T2.00g.md), and [`00-foundations.T2.00b`](00-foundations.T2.00b.md) through [`00-foundations.T2.00f`](00-foundations.T2.00f.md) - before Step 2.1 (`00-foundations.T2.01`). Questions 1-6 are this module's own three tools; 7-11 recap one module each.
1. `[Concept: first_order_ode_time_constant]` A winding with $\tau = 2.0\,\text{ms}$ is driven by a unit step. Compute the fraction of the steady-state value reached at $t = 6.0\,\text{ms}$, $1 - e^{-t/\tau}$ (tolerance $\pm 10^{-6}$).
2. `[Concept: first_order_ode_time_constant]` What does the time constant $\tau$ mean for a first-order system?
   - **A.** The time to reach $1 - e^{-1} \approx 63.2\%$ of a step, not the time to settle.
   - **B.** The time to reach $99\%$ of a step.
   - **C.** The period of the response's ringing.
   - **D.** The delay before the output starts moving at all.
3. `[Concept: second_order_ode_wn_zeta]` For $J = 0.02\,\text{kg}\cdot\text{m}^2$ and $k = 8.0\,\text{N}\cdot\text{m/rad}$, compute $\omega_n = \sqrt{k/J}$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: second_order_ode_wn_zeta]` With $\zeta = 0.50$ and $\omega_n = 20.0\,\text{rad/s}$, compute the damped frequency $\omega_d = \omega_n\sqrt{1 - \zeta^2}$ in $\text{rad/s}$ (tolerance $\pm 10^{-6}$).
5. `[Concept: characteristic_polynomial_roots]` The characteristic polynomial $s^2 + 4s + 100 = 0$ has a complex pair. Compute the real part of each root, $\operatorname{Re}(s) = -\zeta\omega_n$, in $\text{s}^{-1}$ (tolerance $\pm 10^{-9}$).
6. `[Concept: second_order_ode_wn_zeta]` At $\zeta = 0.50$, compute the fractional overshoot $M_p = e^{-\pi\zeta/\sqrt{1-\zeta^2}}$ (tolerance $\pm 10^{-5}$).
7. `[Concept: finite_difference_derivative_and_integral] [Concept: matrix_vector_multiplication] [Concept: state_vector_one_step_update]` For `00-foundations.T2.00a`'s running integral, from $I_0 = 0.25\,\text{m}\cdot\text{s}$ add one sample $x_k = 0.08\,\text{m}$ at $\Delta t = 0.02\,\text{s}$. Compute $I_1$ (tolerance $\pm 10^{-9}$).
8. `[Concept: dot_product_projection] [Concept: cross_product_3d_moment] [Concept: basis_change_and_invertibility]` For `00-foundations.T2.00b`'s $\vec{r} = [0.30,\; 0.40,\; 0.00]^\top\text{m}$ and $\vec{F} = [0.0,\; -20.0,\; 15.0]^\top\text{N}$, compute $\tau_x = r_y F_z - r_z F_y$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$).
9. `[Concept: complex_numbers_and_euler_formula] [Concept: complex_impedance_and_transfer_function] [Concept: bode_magnitude_db_and_phase]` For `00-foundations.T2.00d`'s $z = -1.0 - j1.0$, compute its phase $\angle z = \operatorname{atan2}(y, x)$ in degrees (tolerance $\pm 10^{-6}$).
10. `[Concept: laplace_poles_and_zeros] [Concept: continuous_state_space_matrices] [Concept: discrete_state_transition_euler_tustin]` For `00-foundations.T2.00e`'s $A = \begin{bmatrix} 0 & 1 \\ -100 & -4 \end{bmatrix}$ at $T_s = 0.001\,\text{s}$, compute the spectral radius of $A_d = I + A T_s$ (tolerance $\pm 10^{-6}$).
11. `[Concept: nyquist_sampling_and_aliasing] [Concept: tustin_frequency_prewarping_and_biquad] [Concept: gaussian_variance_and_covariance_matrix]` For `00-foundations.T2.00f`'s pre-warped Tustin with $f_0 = 500\,\text{Hz}$ and $f_s = 4000\,\text{Hz}$, compute $\omega_a = \frac{2}{T_s}\tan(\pi f_0/f_s)$ in $\text{rad/s}$ (tolerance $\pm 10^{-3}$).

**Gate answer key:**
```python
import math

g1_frac = 1.0 - math.exp(-6.0 / 2.0)
g2_choice = "A"
g3_wn = math.sqrt(8.0 / 0.02)
g4_wd = 20.0 * math.sqrt(1.0 - 0.50 ** 2)
g5_real = -0.5 * 4.0
g6_mp = math.exp(-math.pi * 0.50 / math.sqrt(1.0 - 0.50 ** 2))
g7_int = 0.25 + 0.08 * 0.02
g8_tau_x = 0.40 * 15.0 - 0.0 * (-20.0)
g9_phase_deg = math.degrees(math.atan2(-1.0, -1.0))
Ad_euler = [[1.0, 0.001], [-0.1, 0.996]]
g10_radius = math.sqrt(Ad_euler[0][0] * Ad_euler[1][1] - Ad_euler[0][1] * Ad_euler[1][0])
g11_omega_a = (2.0 / 0.00025) * math.tan(math.pi * 500.0 / 4000.0)

assert math.isclose(g1_frac, 0.950213, abs_tol=1e-6)
assert g2_choice == "A"
assert math.isclose(g3_wn, 20.0, rel_tol=1e-9)
assert math.isclose(g4_wd, 17.320508, abs_tol=1e-6)
assert math.isclose(g5_real, -2.0, rel_tol=1e-9)
assert math.isclose(g6_mp, 0.16303, abs_tol=1e-5)
assert math.isclose(g7_int, 0.2516, rel_tol=1e-9)
assert math.isclose(g8_tau_x, 6.0, rel_tol=1e-9)
assert math.isclose(g9_phase_deg, -135.0, abs_tol=1e-6)
assert math.isclose(g10_radius, 0.998048, abs_tol=1e-6)
assert math.isclose(g11_omega_a, 3313.7085, abs_tol=1e-3)
```
- **Pass mark:** $\ge 80\%$ ($4/5$ on Skip test; $\ge 9/11$ on Gate test). Missed Gate Q1-Q2: study `00-foundations.T2.00c`; Q3-Q6: `00-foundations.T2.00c`; Q7: `00-foundations.T2.00a`; Q8: `00-foundations.T2.00b`; Q9: `00-foundations.T2.00d`; Q10: `00-foundations.T2.00e`; Q11: `00-foundations.T2.00f`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Cranking up $K_p$ ($k$) makes the joint ring more instead of less | Increasing $k$ with fixed $b$ reduces $\zeta = \frac{b}{2\sqrt{Jk}} \propto 1/\sqrt{k}$. | Scale derivative damping $b$ ($K_d$) up by $\sqrt{\text{factor}}$ whenever you increase $K_p$ by $\text{factor}$. |
| Forgot to divide $b$ and $k$ by inertia $J$ in canonical form | Set $2\zeta\omega_n = b$ instead of $b / J$. | Always normalize the highest derivative coefficient to $1$ ($\ddot{\theta} + \frac{b}{J}\dot{\theta} + \frac{k}{J}\theta$) first. |
| `ValueError: math domain error` in $\sqrt{1 - \zeta^2}$ | Used the underdamped formula when $\zeta > 1$ (overdamped). | Check `if zeta < 1.0:` before computing $\omega_d$ and $M_p$. |

## 9. Resources
- **Åström & Murray — [*Feedback Systems: An Introduction for Scientists and Engineers* (`fbsbook.org`)](https://www.fbsbook.org/) ([`resources/textbooks-and-papers.md`](../resources/textbooks-and-papers.md)):** Open-access textbook chapters on first- and second-order linear systems `[VERIFIED 2026-10-15]`.
- **Track 05 ([`05-control-and-estimation/README.md`](../05-control-and-estimation/README.md)) & [Paul's Online Math Notes (Vibrations)](https://tutorial.math.lamar.edu/Classes/DE/Vibrations.aspx):** Applies $\omega_n = \sqrt{K_p/J}$ and $K_d = 2\zeta\sqrt{JK_p}$ to joint PD tuning `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*Complex Numbers, Euler's Formula, Phasors, Impedance & Frequency Response (Bode Plots)*).
