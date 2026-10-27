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
difficulty:
  math: 3
  coding: 3
  tools: 0
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 3 of 10 · Make a joint move: foundations**
>
> **Run this in the workbench.** [Open MechaLab with `EX.00-foundations.T1.00e` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.00-foundations.T1.00e) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
Before Step 1.1 (`00-foundations.T1.01`) compares numerical integration stability on an oscillating joint, you must connect physical push (force and torque), inertia (mass and rotational inertia), and stored energy (kinetic and spring potential energy) inside a discrete time-stepping loop. This final Level -1 module turns Newton's Second Law and Hooke's spring law into a 15-line Python simulation whose energy balance you can audit at every step. Already know this? Take the Skip test or Gate test in section 7 first.

## 2. Intuition first
<!-- figure: motion-chain | Position, velocity and acceleration are one quantity read at three rates of change. -->

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
**Predict first (before you run it):** With $m = 2.0\text{ kg}$, $k = 50.0\text{ N/m}$ and $\Delta t = 0.0005\text{ s}$, the $2,000$-step run covers $1.0\text{ s}$ — less than one full oscillation. Commit to three things before you run it: (1) the oscillation period $T = 2\pi\sqrt{m/k}$, and so what fraction of a cycle $1.0\text{ s}$ is; (2) where the cart ends up, nearer the release point $x_0 = 0.10\text{ m}$ or nearer the center $x = 0$, and which way it is moving; (3) the size of the drift in total energy, $E_{\text{final}} - E_0$ — exactly zero, a few $10^{-4}\text{ J}$, or a few $10^{-2}\text{ J}$? Two tells that a wrong answer is a mistake rather than a surprise: a drift of $10^{-2}\text{ J}$ (4% of $0.2500\text{ J}$) means $\Delta t$ is far too coarse for a $1.26\text{ s}$ period, and an $E_{\text{final}}$ that matches $E_0$ to four decimals means the energy was computed before the loop rather than after it.

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
E_init=0.2500 J, E_final=0.2502 J, v_peak=0.5000 m/s
```

## 5. Exercise
Add viscous damping $F_{\text{damp}} = -b v$ with $b = 4.0\text{ N}\cdot\text{s/m}$ to the loop (`f_net_n = -k_nm * x_m - b * v_ms`) and run for `4000` steps ($2.0\text{ s}$). Verify that $> 95\%$ of the initial $0.25\text{ J}$ energy is dissipated as heat (`e_final_j < 0.0125`).
- **If your result differs:** Check the sign on `-b * v_ms`; writing `+b * v_ms` injects energy (negative damping) and causes the oscillation to explode instead of decay.

### Graded package - the loop, its energy and its torque
[`exercises/00-foundations.T1.00e/`](../exercises/00-foundations.T1.00e/) turns this section into a test. `starter.py` holds seven holes: `spring_force` (Hooke's law, with the minus sign), `acceleration` ($F/m$), `euler_step` (velocity first, then position, with the damper), `mechanical_energy` (both stores), `peak_speed` ($\sqrt{2E/m}$), `torque` ($r F \sin\phi$) and `angular_acceleration` ($\tau/J$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/00-foundations.T1.00e/starter.py \
  python3 -m unittest discover -s exercises/00-foundations.T1.00e -p 'test_*.py'
```

**34 tests.** The behaviour suite checks the worked example's $-5.0\text{ N}$, $-2.5\text{ m/s}^2$, $0.2500\text{ J}$ and $0.5000\text{ m/s}$, the exercise's 4000-step damped run (final energy under $0.0125\text{ J}$, with a 500-step coarse-step run that catches a position updated from the old velocity: forward Euler grows to $144\times$ where the new-velocity ordering stays within a few percent), and both Skip-test and Gate-test values - $5.886\text{ N}\cdot\text{m}$, $2.20\text{ J}$, $0.198\text{ m}$ and $30\text{ rad/s}^2$. Five planted faults - `spring_force_sign_dropped`, `damping_sign_flipped`, `forward_euler_position`, `energy_forgets_the_spring`, `torque_uses_cosine` - each fail the test named for them. The transfer suite then runs **the plant's own numbers**: the submission's $r F \sin\phi$ reproduces `plant.gravity_torque`'s cosine lever at four shoulder poses, the $2.5\text{ N}\cdot\text{m}$ clamp over `plant.I1` and `plant.I2` gives $312.5$ and $833.3\text{ rad/s}^2$, the plant's $1\text{ ms}$ tick is $1257\times$ finer than the spring's $1.26\text{ s}$ period (so one second of the loop holds $0.25\text{ J}$), and a coasting joint decays with the plant's $I_1/B_1 = 0.2\text{ s}$ time constant.

The graded package is also a workbench entry: **Modules -> `EX.00-foundations.T1.00e`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line.

- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Prerequisite Foundations Modules:** [`00-foundations.T1.00a`](00-foundations.T1.00a.md)–[`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Loops, SI Units & 2D Vectors*).
  - **Core Concepts to Review First:** Newton's second law $a = F_{\text{net}}/m$ with viscous damping $F_{\text{damp}} = -b v$, symplectic Euler updates (`v += a*dt; x += v*dt`), and total mechanical energy $E = \frac{1}{2}mv^2 + \frac{1}{2}kx^2$ in `## 3. Formalization` (Items 1–3) and `## 4. Worked example` above.
  - **Physics & Simulation Study Links:** [MyPhysicsLab: Interactive Mass-Spring-Damper Simulation & Equations (`myphysicslab.com`)](https://www.myphysicslab.com/springs/single-spring-en.html) and [R. H. Bishop *The Mechatronics Handbook* (`resources/textbooks-and-papers.md`)](../resources/textbooks-and-papers.md).
  - **Curriculum Reference:** [Track 00 Tier 1 (`00-foundations/README.md#tier-1-beginner--intuitive`)](../00-foundations/README.md#tier-1-beginner--intuitive) (Step 1.1 Calculus as `while` Loops).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then compare against the numbers in the full solution ---
import math


def spring_force(k_nm, x_m):
    """Hooke's law: the force that always pulls the cart back toward x = 0."""
    # TODO 1: F = -k*x - the minus sign is the whole spring
    ...


def acceleration(force_n, mass_kg):
    """Newton's second law."""
    # TODO 2: divide the net force by the mass
    ...


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    """One symplectic Euler tick of the damped spring: return (x_new, v_new)."""
    # TODO 3: build a = (-k*x - b*v)/m, update v with it, then move x with the NEW v
    ...


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    """Kinetic plus spring potential energy, in joules."""
    # TODO 4: half the mass times v squared PLUS half the stiffness times x squared
    ...


def peak_speed(energy_j, m_kg):
    """The speed at the unstretched centre."""
    # TODO 5: v = sqrt(2E/m) - do not lose the 2
    ...


def torque(force_n, r_m, phi_rad):
    """Lever torque, with phi the angle between the arm and the force."""
    # TODO 6: sine, not cosine
    ...


def angular_acceleration(torque_nm, inertia_kg_m2):
    """tau = J alpha, so alpha = tau / J."""
    # TODO 7: divide by the inertia; do not invert the fraction
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

**Expected numbers (the answer):** $E_0 = 0.2500\text{ J}$; the $4,000$-step damped run of $2.0\text{ s}$ ends under $0.0125\text{ J}$ (more than $95\%$ dissipated); the Skip test's $5.886\text{ N}\cdot\text{m}$, $2.20\text{ J}$, $0.198\text{ m}$ and $30\text{ rad/s}^2$ still have to come out.

### Hint ladder
1. **Order of the two updates.** Update $v$ from the current $x$ and the current $v$, then move $x$ with the *new* $v$. A position updated with the old velocity is plain forward Euler: it gains energy every step instead of losing it, and at $\Delta t = 0.02\text{ s}$ it grows to $144\times$ the release energy in $500$ steps.
2. **Why the damper is $-bv$ and not $+bv$.** The damper always opposes motion, so the force changes sign with $v$; writing `+b*v` gives the cart a tailwind and the oscillation explodes. At $x = 0$, $v = 0.5\text{ m/s}$, $b = 4.0$ and $m = 2.0\text{ kg}$ the acceleration is $-1.0\text{ m/s}^2$, so one $1\text{ ms}$ tick turns $v = 0.5$ into $0.499$.
3. **The exercise check is an inequality.** The undamped worked example conserves energy to four decimals; the damped run must *lose* it. The envelope decays as $e^{-(b/m)t} = e^{-4} \approx 0.0183$, so $E(2.0\text{ s}) \approx 0.25 \times 0.0183 \approx 0.0046\text{ J}$, comfortably under the $0.0125\text{ J}$ pass mark - if yours sits above it, the damper sign or the update order is wrong, not the threshold.
4. **Units are the check.** $k x$ is newtons, $b v$ is $\text{N}\cdot\text{s/m} \times \text{m/s} = \text{N}$, and dividing their sum by kilograms leaves $\text{m/s}^2$ - the right thing to add to $v$ after multiplying by $\Delta t$, and the wrong thing to add to $x$.

5. **What the suite refuses.** `acceleration` raises on a non-positive mass, `spring_force` on a negative stiffness, `angular_acceleration` on a non-positive inertia, `peak_speed` on a non-positive mass or a negative energy, `mechanical_energy` on a non-positive mass or a negative stiffness, `torque` on a negative lever arm, and `euler_step` on a non-positive mass or time step, a negative stiffness or a negative damping - every one a `ValueError`.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (the same import the module's workbench entry uses)


def spring_force(k_nm, x_m):
    """Hooke's law: F = -k x, so the force always points back at the unstretched centre."""
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative: a spring pushes back, it does not run away")
    return -k_nm * x_m


def acceleration(force_n, mass_kg):
    """Newton's second law: a = F_net / m."""
    if mass_kg <= 0.0:
        raise ValueError("mass must be positive")
    return force_n / mass_kg


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    """One symplectic Euler tick of the damped spring: (x, v) -> (x_new, v_new).

    Velocity first, then position using the *new* velocity. That ordering is what keeps the energy
    bounded; a position updated with the old velocity gains energy on every step and explodes.
    """
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if dt_s <= 0.0:
        raise ValueError("a time step must be positive")
    if k_nm < 0.0 or b_nsm < 0.0:
        raise ValueError("stiffness and damping cannot be negative")
    # Newton's second law with both forces: the spring pulls back, the damper opposes the motion.
    a_ms2 = (spring_force(k_nm, x_m) - b_nsm * v_ms) / m_kg
    v_new = v_ms + a_ms2 * dt_s
    x_new = x_m + v_new * dt_s
    return x_new, v_new


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    """E = 1/2 m v^2 + 1/2 k x^2, in joules."""
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative")
    return 0.5 * m_kg * v_ms ** 2 + 0.5 * k_nm * x_m ** 2


def peak_speed(energy_j, m_kg):
    """The speed all of E becomes at the unstretched centre: v = sqrt(2 E / m)."""
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if energy_j < 0.0:
        raise ValueError("mechanical energy cannot be negative")
    return math.sqrt(2.0 * energy_j / m_kg)


def torque(force_n, r_m, phi_rad):
    """tau = r F sin(phi), with phi the angle between the lever arm and the force."""
    if r_m < 0.0:
        raise ValueError("a lever arm is a distance")
    return r_m * force_n * math.sin(phi_rad)


def angular_acceleration(torque_nm, inertia_kg_m2):
    """tau = J alpha, so alpha = tau / J."""
    if inertia_kg_m2 <= 0.0:
        raise ValueError("rotational inertia must be positive")
    return torque_nm / inertia_kg_m2


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

m, k, b, dt = 2.0, 50.0, 4.0, 0.0005
x, v = 0.10, 0.0
e_initial = mechanical_energy(m, v, k, x)
for _ in range(4000):
    x, v = euler_step(x, v, k, b, m, dt)
e_final = mechanical_energy(m, v, k, x)

assert math.isclose(e_initial, 0.25, rel_tol=1e-12)
assert e_final < 0.0125, e_final                 # > 95% of the release energy is gone
assert e_final > 0.0
# The undamped checks from the worked example and the Skip test still hold.
assert math.isclose(spring_force(50.0, 0.10), -5.0, abs_tol=1e-12)
assert math.isclose(acceleration(-5.0, 2.0), -2.5, abs_tol=1e-15)
x1, v1 = euler_step(0.20, 0.0, 100.0, 0.0, 1.0, 0.01)
assert math.isclose(v1, -0.2, abs_tol=1e-12) and math.isclose(x1, 0.198, abs_tol=1e-12)
assert math.isclose(peak_speed(0.25, 2.0), 0.5, abs_tol=1e-15)
assert math.isclose(torque(2.0 * 9.81, 0.30, math.pi / 2.0), 5.886, abs_tol=1e-9)
assert math.isclose(angular_acceleration(1.5, 0.05), 30.0, abs_tol=1e-9)

print("E0=%.4f J | damped 2.0 s: E_final=%.4f J, dissipated %.1f%% | under 0.0125 J: %s"
      % (e_initial, e_final, 100.0 * (1.0 - e_final / e_initial), e_final < 0.0125))
```

Printed: `E0=0.2500 J | damped 2.0 s: E_final=... J, dissipated ...% | under 0.0125 J: True` - the release energy, then the run's own final energy and the share of it that heating removed. The final energy sits near the $0.25e^{-4} \approx 0.0046\text{ J}$ envelope, so the last field reads `True`.

**On the shared arm.** The Transfer suite prices the plant's clamp against each joint's own inertia and checks the shoulder's horizontal gravity torque:

```python
import mechalab_plant as plant

shoulder_accel = plant.TAU_LIMIT / plant.I1
assert abs(shoulder_accel - 312.5) < 1e-12
assert abs(plant.I1 / plant.B1 - 0.2) < 1e-15
assert abs(plant.gravity_torque(0.0, 0.0)[0] - 0.318825) < 1e-12
print("plant: clamp/I1=%.1f rad/s^2 | I1/B1=%.2f s | horizontal shoulder torque=%.6f N*m"
      % (shoulder_accel, plant.I1 / plant.B1, plant.gravity_torque(0.0, 0.0)[0]))
```

### Break it on purpose
Inject the `spring_force_sign_dropped` fault the graded package names, and diagnose it from the first step alone:
- **Inject:** drop the minus sign in Hooke's law — write `f_net_n = k_nm * x_m` instead of `f_net_n = -k_nm * x_m`, leaving the damper, the mass and $\Delta t = 0.0005\text{ s}$ alone.
- **Symptom:** at release the force is $+5.0\text{ N}$ and $a = +2.5\text{ m/s}^2$, so after one step $v = +0.00125\text{ m/s}$ and $x = 0.100000625\text{ m}$: the cart is pushed away from the center instead of pulled toward it. Every step adds energy, so the $2,000$-step run ends at $2,756.74\text{ J}$ — four orders of magnitude above $0.2500\text{ J}$ — and `assert math.isclose(e_final_j, e_initial_j, rel_tol=1e-3)` fails.
- **Diagnose:** $E_0 = 0.2500\text{ J}$ and $v_0 = 0.0\text{ m/s}$ are both still right, so neither the initial condition nor the energy sum is at fault, and the sign appears only in the first acceleration. A spring that pushes harder the further it is stretched is a repulsive spring, not the one in `## 3. Formalization`; the energy check rules the rest out, because a restoring spring trades potential for kinetic and back while a repulsive one adds energy on every step.
- **Fix:** restore `f_net_n = -k_nm * x_m`. The first step then gives $v = -0.00125\text{ m/s}$ and $x = 0.099999375\text{ m}$, and the run closes at $E_{\text{final}} = 0.2502\text{ J}$ with $v_{\text{peak}} = 0.5000\text{ m/s}$ — energy held within $10^{-3}$ relative, and the release energy recovered at the center.

## 6. Simulation path
Run the worked example in Python, then open **Two-Mass & Notch Bode** and **Furuta Pendulum** in the MechaLab Workbench to see coupled spring-mass-damper and pendulum energy loops in action.

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
<!-- skip-test:start -->
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
<!-- skip-test:end -->

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

<!-- next-step:start -->
👉 **Next:** [Step 4 · Power the joint: electronics — Lesson 01.1: High-Current Switching — MOSFETs, Inductors (Motor Coils) and Flyback Diodes](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md)
<!-- next-step:end -->
