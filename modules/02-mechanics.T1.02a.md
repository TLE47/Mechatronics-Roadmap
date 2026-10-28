---
id: 02-mechanics.T1.02a
title: "Free-Body Diagrams, Gravity Lever-Arm Torque & Gear Speed/Torque Power Scaling"
track: "02"
tier: 1
prereqs:
  - 00-foundations.T1.00e
new_concepts:
  - free_body_diagram_static_equilibrium
  - gravity_lever_arm_cosine_torque
  - gear_reduction_speed_torque_power_conservation
uses:
  - radians_unit_circle_and_atan2
  - newtons_second_law_and_torque
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 2
  coding: 3
  tools: 1
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 5 of 10 · Build the arm: mechanics**
>
> **Run this in the workbench.** [Open MechaLab with `EX.02-mechanics.T1.02a` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.02-mechanics.T1.02a) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the bridge module before Step 1.3 (`02-mechanics.T1.03`). Before sizing a robot arm motor or computing $N^2$ reflected inertia in Step 1.3, you need to isolate a link in a **Free-Body Diagram (FBD)**, calculate how gravity torque varies with shoulder angle ($\tau_g = m g L_{\text{com}} \cos\theta$), and understand how a gearbox or timing belt trades speed for torque while conserving mechanical power ($P = \tau \omega$). Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first

<!-- figure: torque-vs-angle | Gravity torque is a cosine: largest with the link horizontal, zero with it vertical. -->

Hold a heavy dumbbell straight out at shoulder height ($\theta = 0\text{ rad}$ horizontal): your shoulder muscles burn because gravity acts at the full horizontal lever arm $L\cos(0) = L$. Now raise your arm straight overhead ($\theta = \pi/2\text{ rad}$ vertical): the dumbbell rests directly over your shoulder pivot with zero horizontal lever arm ($L\cos(\pi/2) = 0$), requiring zero holding torque! Drawing a **Free-Body Diagram (FBD)** means cutting the link free from the rest of the world and drawing arrows for every force and torque acting on it so nothing is forgotten. And a **gearbox** with ratio $N:1$ acts as a rotary lever: much like a $10\times$ crowbar moves your hand $10\times$ farther to multiply force by $10\times$, an $N:1$ gear reducer spins the motor shaft $N$ times faster than the output joint while multiplying output torque by $N\times$.

## 3. Formalization
1. **Free-Body Diagram & Static Equilibrium ($\sum F = 0,\ \sum \tau = 0$):** For a rigid body to remain stationary ($\ddot{x} = 0, \ddot{\theta} = 0$), the vector sum of external forces $\sum F_x = 0, \sum F_y = 0$ (in $\text{N}$) and the sum of torques about any pivot $\sum \tau_z = 0$ (in $\text{N}\cdot\text{m}$) must vanish.
2. **Planar Link Gravity Holding Torque ($\tau_g(\theta)$):** For a link of mass $m$ ($\text{kg}$) whose center of mass lies at distance $L_{\text{com}}$ ($\text{m}$) from the joint pivot at angle $\theta$ ($\text{rad}$) measured from the horizontal $+x$-axis, gravity $m g$ acts straight down ($-y$), creating perpendicular lever arm $r_\perp = L_{\text{com}}\cos\theta$. The joint torque required to hold the link plus a tip payload $m_{\text{tip}}$ at length $L$ is:

$$
\tau_g(\theta) = \left(m L_{\text{com}} + m_{\text{tip}} L\right) g \cos\theta
$$

   Substituting $m = 0.40\text{ kg}$, $L_{\text{com}} = 0.10\text{ m}$, $m_{\text{tip}} = 0.50\text{ kg}$, $L = 0.20\text{ m}$, $g = 9.81\text{ m/s}^2$, and $\theta = 0\text{ rad}$ gives $\tau_{\max} = (0.04 + 0.10)(9.81)\cos(0) = 1.3734\text{ N}\cdot\text{m}$.
3. **Gear Ratio Speed/Torque Scaling and Power Conservation:** For an ideal gear or belt reduction of ratio $N = \omega_{\text{motor}} / \omega_{\text{load}} = r_{\text{load}} / r_{\text{motor}}$ with efficiency $\eta \in (0, 1]$:

$$
\omega_{\text{load}} = \frac{\omega_{\text{motor}}}{N}, \quad \tau_{\text{load}} = \eta N \tau_{\text{motor}}, \quad P_{\text{load}} = \tau_{\text{load}}\omega_{\text{load}} = \eta P_{\text{motor}}
$$

   Substituting $N = 8.0$, $\eta = 1.0$, $\tau_{\text{motor}} = 0.25\text{ N}\cdot\text{m}$, and $\omega_{\text{motor}} = 160\text{ rad/s}$ gives $\tau_{\text{load}} = 2.0\text{ N}\cdot\text{m}$, $\omega_{\text{load}} = 20\text{ rad/s}$, and $P = 40.0\text{ W}$ on both sides.

## 4. Worked example
**Predict first (before you run it):** The link is $m = 0.40\text{ kg}$ with its center of mass at $L_{\text{com}} = 0.10\text{ m}$, the payload is $m_{\text{tip}} = 0.50\text{ kg}$ at $L = 0.20\text{ m}$, and the motor sits behind an $N = 6.0$, $\eta = 0.90$ planetary gearbox. Commit to three numbers before the block runs: (1) the holding torque at the horizontal pose, in $\text{N}\cdot\text{m}$ — nearer $1$ or nearer $2$; (2) whether the torque at $60^\circ$ is exactly half the horizontal value; (3) whether the motor torque $\tau_{\text{motor}}$ comes out above or below $\tau_{\text{load}}(0)/N$, and why. Two tells that a wrong answer is a mistake rather than a surprise: a horizontal torque near $0.9\text{ N}\cdot\text{m}$ means the link's own mass at $L_{\text{com}}$ was left out, leaving only the payload's $0.50 \times 0.20 \times 9.81$; and a motor torque larger than the load torque means $N$ was multiplied where it should have been divided.

Size the motor torque $\tau_{\text{motor}}$ required to hold a horizontal single-link robot arm ($m_{\text{link}} = 0.40\text{ kg}, L_{\text{com}} = 0.10\text{ m}, L = 0.20\text{ m}$) carrying a tip payload $m_{\text{tip}} = 0.50\text{ kg}$ at $\theta = 0\text{ rad}$ and $\theta = \pi/3\text{ rad}$ ($60^\circ$) through an $N = 6.0$, $\eta = 0.90$ planetary gearbox.

```python
import math

def arm_gravity_torque(theta_rad: float, m_link: float = 0.40, l_com: float = 0.10,
                       m_tip: float = 0.50, l_total: float = 0.20, g: float = 9.81) -> float:
    return (m_link * l_com + m_tip * l_total) * g * math.cos(theta_rad)

tau_0 = arm_gravity_torque(0.0)
tau_60 = arm_gravity_torque(math.pi / 3.0)
N = 6.0
eta = 0.90
tau_motor_0 = tau_0 / (eta * N)

assert math.isclose(tau_0, 1.3734, rel_tol=1e-9)
assert math.isclose(tau_60, 0.5 * 1.3734, rel_tol=1e-9)
assert math.isclose(tau_motor_0, 0.254333333, rel_tol=1e-6)
print(f"tau_load(0 deg)={tau_0:.4f} N*m, tau_load(60 deg)={tau_60:.4f} N*m, tau_motor={tau_motor_0:.4f} N*m")
```
Expected output:
```text
tau_load(0 deg)=1.3734 N*m, tau_load(60 deg)=0.6867 N*m, tau_motor=0.2543 N*m
```

## 5. Exercise
A timing-belt reduction connects a motor pulley with $Z_{\text{motor}} = 16$ teeth to a joint pulley with $Z_{\text{joint}} = 72$ teeth ($\eta = 0.95$). Compute the gear ratio $N = Z_{\text{joint}} / Z_{\text{motor}}$, the output speed $\omega_{\text{joint}}$ when $\omega_{\text{motor}} = 90\text{ rad/s}$, and the output torque $\tau_{\text{joint}}$ when $\tau_{\text{motor}} = 0.40\text{ N}\cdot\text{m}$. Verify $N = 4.5$, $\omega_{\text{joint}} = 20.0\text{ rad/s}$, and $\tau_{\text{joint}} = 1.71\text{ N}\cdot\text{m}$ ($\pm 10^{-6}$).
- **If your result differs:** Check that the driven pulley tooth count ($72$) is divided by the driving motor pulley tooth count ($16$): $72 / 16 = 4.5$, and multiply $\tau_{\text{motor}} \times N \times \eta = 0.40 \times 4.5 \times 0.95 = 1.71\text{ N}\cdot\text{m}$.

### Graded package - the lever, the gearbox and the reflected inertia
[`exercises/02-mechanics.T1.02a/`](../exercises/02-mechanics.T1.02a/) turns this section into a test. `starter.py` holds seven holes: `gravity_torque` (the cosine lever arm, link plus tip), `balance_force`, `gear_ratio`, `gear_output_speed`, `gear_output_torque` ($\eta N \tau$), `mechanical_power` and `reflected_inertia` ($N^2$). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/02-mechanics.T1.02a/starter.py \
  python3 -m unittest discover -s exercises/02-mechanics.T1.02a -p 'test_*.py'
```

**29 tests.** The torque is checked at the worked example, at the horizontal maximum and at vertical poses, so a sine where the cosine belongs fails; the balance force is checked at the Skip test's $60\text{ N}$; the belt drive is checked at the exercise's $4.5$, $20\text{ rad/s}$ and $1.71\text{ N}\cdot\text{m}$, so an inverted ratio, a multiplied output speed or a dropped efficiency each fail; and the reflected inertia is checked at $N^2$ rather than $N$. The transfer suite runs **the plant's own arm**: the submission's shoulder term must reproduce `plant.gravity_torque`'s difference between the two links at four poses, the folded elbow's full lever arm is checked (the pose that looks vertical is not the zero-torque one), the $2.5\text{ N}\cdot\text{m}$ clamp is pushed back through an $8{:}1$ belt, and `plant.I1` reflected through $4{:}1$ is $0.128\text{ kg}\cdot\text{m}^2$. Five planted faults - `gravity_uses_sine`, `balance_divides_wrong`, `gear_ratio_inverted`, `output_speed_multiplies`, `torque_ignores_efficiency` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (*SI Rotational Units*), [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*Radians, Cosine Law & `math.atan2`*), and [`00-foundations.T1.00e`](00-foundations.T1.00e.md) (*Rotational Kinetic Energy*).
  - **Core Concepts to Review First:** Lever torque $\tau = r F \sin\theta$, static equilibrium ($\sum F = 0, \sum \tau = 0$), gear ratio torque/speed scaling and reflected inertia $J_{\text{refl}} = N^2 J_{\text{motor}}$, and 2-link planar FK/IK in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Lynch & Park *Modern Robotics* Ch. 3 & Ch. 6 (`hades.mech.northwestern.edu`)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics) and [Track 02 Tier 1 (`02-mechanics-kinematics-dynamics/README.md`)](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution below ---
import math


def gravity_torque(theta_rad, m_link, l_com, m_tip=0.0, l_total=0.0, g=9.81):
    """The shoulder torque that holds a link plus a tip payload at angle theta."""
    # TODO 1: the lever arm is the HORIZONTAL distance, so the angle factor is a cosine
    ...


def balance_force(force_1, x_1, x_2):
    """The upward force at x_2 that balances F_1 at x_1 about the pivot."""
    # TODO 2: a longer lever needs less force, so divide by x_2
    ...


def gear_ratio(z_driven, z_driver):
    """The reduction ratio N of two pulleys."""
    # TODO 3: the DRIVEN pulley is on top of the fraction
    ...


def gear_output_speed(omega_motor, ratio):
    """The joint speed behind a reducer."""
    # TODO 4: a reducer divides the speed by N
    ...


def gear_output_torque(tau_motor, ratio, eta=1.0):
    """The joint torque behind a reducer."""
    # TODO 5: motor torque times ratio times efficiency — the efficiency is part of the lever
    ...


def mechanical_power(torque, omega):
    """P = tau * omega."""
    # TODO 6: multiply them
    ...


def reflected_inertia(j_motor, ratio):
    """The motor inertia as the joint feels it."""
    # TODO 7: the ratio is SQUARED
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **The ratio comes from the teeth, in the right order.** The joint pulley is the driven one, so $N = 72/16 = 4.5$; writing $16/72$ gives $0.222$ and every downstream number inherits it.
2. **A reducer slows and strengthens.** $\omega_{\text{joint}} = 90/4.5 = 20.0\text{ rad/s}$ and $\tau_{\text{joint}} = 0.95 \times 4.5 \times 0.40 = 1.71\text{ N}\cdot\text{m}$ — speed divided by $N$, torque multiplied by $N$.
3. **The efficiency belongs on the torque, not the speed.** $\eta = 0.95$ costs $5\%$ of the torque ($1.80\text{ N}\cdot\text{m}$ without it) and none of the speed.
4. **Power is the check that the two sides agree.** $\tau_{\text{joint}}\omega_{\text{joint}} = 1.71 \times 20.0 = 34.2\text{ W}$ equals $\eta \tau_{\text{motor}}\omega_{\text{motor}} = 0.95 \times 0.40 \times 90 = 34.2\text{ W}$; if the two differ, the speed or the torque was scaled the wrong way.

5. **What the suite refuses.** `gravity_torque` raises on a negative mass; `balance_force` raises on a lever arm at the pivot (which balances nothing); `gear_ratio` raises on a zero tooth count; `gear_output_speed` raises on a zero ratio; and `gear_output_torque` raises on a gear efficiency outside `(0, 1]`. Each of those is a `ValueError`.

### Full Solution
```python
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def gravity_torque(theta_rad, m_link, l_com, m_tip=0.0, l_total=0.0, g=9.81):
    """tau_g = (m_link l_com + m_tip l_total) g cos(theta), theta measured from horizontal."""
    if m_link < 0.0 or m_tip < 0.0:
        raise ValueError("a mass cannot be negative")
    if l_com < 0.0 or l_total < 0.0:
        raise ValueError("a lever arm cannot be negative")
    if g <= 0.0:
        raise ValueError("gravity must point somewhere")
    return (m_link * l_com + m_tip * l_total) * g * math.cos(theta_rad)


def balance_force(force_1, x_1, x_2):
    """The upward force at x_2 that balances F_1 at x_1: F_2 = F_1 x_1 / x_2."""
    if x_2 <= 0.0:
        raise ValueError("a balance point must be a positive distance from the pivot")
    return force_1 * x_1 / x_2


def gear_ratio(z_driven, z_driver):
    """N = driven teeth / driver teeth; a reducer has N > 1."""
    if z_driver <= 0.0 or z_driven <= 0.0:
        raise ValueError("tooth counts are positive integers")
    return z_driven / z_driver


def gear_output_speed(omega_motor, ratio):
    """A reducer slows the output: omega_load = omega_motor / N."""
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    return omega_motor / ratio


def gear_output_torque(tau_motor, ratio, eta=1.0):
    """A reducer multiplies torque by eta * N, where eta is the efficiency in (0, 1]."""
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    if not 0.0 < eta <= 1.0:
        raise ValueError("efficiency is a fraction in (0, 1]")
    return eta * ratio * tau_motor


def mechanical_power(torque, omega):
    """P = tau * omega."""
    return torque * omega


def reflected_inertia(j_motor, ratio):
    """Inertia seen at the output: J_refl = N^2 J_motor."""
    if j_motor < 0.0:
        raise ValueError("an inertia cannot be negative")
    if ratio <= 0.0:
        raise ValueError("the ratio must be positive")
    return ratio * ratio * j_motor


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.

ratio = gear_ratio(72, 16)
omega_joint = gear_output_speed(90.0, ratio)
tau_joint = gear_output_torque(0.40, ratio, 0.95)
p_joint = mechanical_power(tau_joint, omega_joint)
p_motor = 0.95 * mechanical_power(0.40, 90.0)

assert math.isclose(ratio, 4.5, abs_tol=1e-12)
assert math.isclose(omega_joint, 20.0, abs_tol=1e-12)
assert math.isclose(tau_joint, 1.71, abs_tol=1e-12)
assert math.isclose(p_joint, p_motor, abs_tol=1e-12)
assert math.isclose(gravity_torque(0.0, 0.40, 0.10, 0.50, 0.20), 1.3734, abs_tol=1e-12)
assert math.isclose(reflected_inertia(0.008, 4.0), 0.128, abs_tol=1e-12)
assert math.isclose(balance_force(30.0, 0.20, 0.10), 60.0, abs_tol=1e-12)

print(f"N={ratio:.2f} | omega_joint={omega_joint:.2f} rad/s | tau_joint={tau_joint:.4f} N*m")
print(f"P_joint={p_joint:.2f} W | P_motor*eta={p_motor:.2f} W | J_reflected(4:1)={reflected_inertia(0.008, 4.0):.3f} kg*m^2")

```

Printed: `N=4.50 | omega_joint=20.00 rad/s | tau_joint=1.7100 N*m`, then `P_joint=34.20 W | P_motor*eta=34.20 W | J_reflected(4:1)=0.128 kg*m^2`.

**On the shared arm.** The Transfer suite in `exercises/02-mechanics.T1.02a/` drives the plant's own lever arms and its 2.5 N·m clamp through this module's gearbox maths:

```python
import math
import mechalab_plant as plant

ratio, eta = 8.0, 0.9
motor_torque = plant.TAU_LIMIT / (eta * ratio)

assert math.isclose(motor_torque * ratio * eta, plant.TAU_LIMIT, rel_tol=1e-12)
assert math.isclose(4.0 ** 2 * plant.I1, 16.0 * plant.I1, rel_tol=1e-15)  # 4:1 -> N^2
assert plant.gravity_torque(0.0, 0.0)[0] > 0.0
assert math.isclose(plant.gravity_torque(math.pi / 2.0, 0.0)[0], 0.0, abs_tol=1e-12)
print("plant: clamp %.1f N*m -> %.4f N*m at the motor (8:1, 90%%) | 4:1 reflected I1=%.3f kg*m^2"
      % (plant.TAU_LIMIT, motor_torque, 16.0 * plant.I1))
```

### Break it on purpose
Inject the `gravity_uses_sine` fault the graded package names, and diagnose it from the two poses in the worked example:
- **Inject:** replace `math.cos(theta_rad)` with `math.sin(theta_rad)` inside `arm_gravity_torque`, leaving the masses, the lever arms and $g = 9.81\text{ m/s}^2$ untouched.
- **Symptom:** the horizontal pose now reads $\tau_0 = 0.0000\text{ N}\cdot\text{m}$ — an arm that hangs out flat and needs no holding torque — while $60^\circ$ reads $1.3734 \times 0.8660 = 1.1894\text{ N}\cdot\text{m}$ instead of $0.6867\text{ N}\cdot\text{m}$, so the printed order is reversed and the motor is sized at $1.1894 / (0.90 \times 6.0) = 0.2203\text{ N}\cdot\text{m}$ instead of $0.2543\text{ N}\cdot\text{m}$.
- **Diagnose:** the amplitude $1.3734\text{ N}\cdot\text{m}$ still appears in the output, just at the wrong angle, so $(m L_{\text{com}} + m_{\text{tip}} L)g$ and the unit chain are correct and only the angle factor can be wrong. Gravity's lever arm is the horizontal distance $L_{\text{com}}\cos\theta$ from the pivot: largest when the link lies along the horizon, zero when it points straight up. A sine factor peaks at $90^\circ$ from the horizontal — the vertical pose, where the arm balances over its own pivot — and that is the one symptom a mass error cannot produce.
- **Fix:** put `math.cos` back. Then $\tau_0 = 1.3734\text{ N}\cdot\text{m}$, $\tau_{60} = 0.6867\text{ N}\cdot\text{m}$, and $\tau_{\text{motor}} = 1.3734 / (0.90 \times 6.0) = 0.2543\text{ N}\cdot\text{m}$ — the worst-case gravity load the gearbox must hold, which is the number a motor is sized on.

## 6. Simulation path
Open **URDF / MuJoCo & STO** in the MechaLab Workbench (`npm run dev`) to visualize how link lengths and joint angles change the horizontal moment arm of a planar robot arm.

The graded package is also a workbench entry: **Modules -> `EX.02-mechanics.T1.02a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 1.3 (`02-mechanics.T1.03`) and Step 1.7 (`06-robotics.T1.07`), your gravity torque equation $\tau_g(\theta) = M g L_{\text{eff}}\cos\theta$ becomes the exact **gravity feedforward compensation term** added to the PID controller output:
```text
[Encoder Angle theta] ---> [tau_ff = (m*L_com + m_tip*L)*g*cos(theta)] ---> (+) ---> [Motor Torque Command]
```
Pass/fail verification in simulation: `tau_0 == 1.3734 N*m`, `tau_60 == 0.6867 N*m`, and `tau_motor_0 == 0.2543 N*m`.


```mermaid
flowchart LR
    A["02-mechanics.T1.02a: free_body_diagram_static_equilibrium"] --> B["gravity_lever_arm_cosine_torque"]
    B --> C["gear_reduction_speed_torque_power_conservation"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 1.3 (`02-mechanics.T1.03`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: free_body_diagram_static_equilibrium]` A horizontal massless beam is pivoted at $x = 0\text{ m}$. A downward load of $F_1 = 30.0\text{ N}$ acts at $x_1 = 0.20\text{ m}$. What upward force $F_2$ in newtons ($\text{N}$, tolerance $\pm 10^{-9}$) must act at $x_2 = 0.10\text{ m}$ to maintain static torque equilibrium ($\sum \tau_z = 0$)?
2. `[Apply] [Concept: gravity_lever_arm_cosine_torque]` Compute the gravity holding torque $\tau_g = m g L \cos\theta$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-6}$) for a point mass $m = 1.0\text{ kg}$ at arm length $L = 0.30\text{ m}$ with $g = 9.81\text{ m/s}^2$ when the arm is straight up ($\theta = \pi/2\text{ rad}$ from horizontal).
3. `[Transfer] [Concept: gear_reduction_speed_torque_power_conservation]` An ideal ($\eta = 1.0$) planetary gearbox with ratio $N = 9.0$ is driven by a motor producing $\tau_m = 0.20\text{ N}\cdot\text{m}$ at $\omega_m = 90.0\text{ rad/s}$. Compute the output torque $\tau_{\text{load}}$ ($\text{N}\cdot\text{m}$) and output speed $\omega_{\text{load}}$ ($\text{rad/s}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 00-foundations.T1.00d — Concept: radians_unit_circle_and_atan2] [Concept: gravity_lever_arm_cosine_torque]` At what shoulder angle $\theta$ (measured from the horizontal $+x$-axis) does a planar robot link experience the **maximum** gravity holding torque?
   - **A.** $\theta = 0\text{ rad}$ (horizontal)
   - **B.** $\theta = \pi/4\text{ rad}$ ($45^\circ$)
   - **C.** $\theta = \pi/2\text{ rad}$ (vertical overhead)
   - **D.** Gravity torque is constant at all angles.

**Answer key:**
```python
import math

q1_f2 = (30.0 * 0.20) / 0.10
q2_tau_90 = 1.0 * 9.81 * 0.30 * math.cos(math.pi / 2.0)
q3_tau_load = 9.0 * 0.20
q3_w_load = 90.0 / 9.0
q4_choice = "A"

assert math.isclose(q1_f2, 60.0, rel_tol=1e-9)
assert math.isclose(q2_tau_90, 0.0, abs_tol=1e-9)
assert math.isclose(q3_tau_load, 1.8, rel_tol=1e-9)
assert math.isclose(q3_w_load, 10.0, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q4, study `## 3. Formalization` item 2; Q3, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 02 Tier 1 bridge ladder (`02-mechanics.T1.02a`) before Step 1.3 (`02-mechanics.T1.03`):
1. `[Concept: free_body_diagram_static_equilibrium]` A $2.5\text{ kg}$ robot base rests stationary on a flat table ($g = 9.81\text{ m/s}^2$). Compute the upward normal force $F_N$ in newtons ($\text{N}$, tolerance $\pm 10^{-6}$) from $\sum F_y = F_N - m g = 0$.
2. `[Concept: free_body_diagram_static_equilibrium]` If a joint experiences a clockwise external load torque of $-2.4\text{ N}\cdot\text{m}$, what counter-clockwise motor torque $\tau_m$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$) is required for static equilibrium ($\sum \tau = 0$)?
3. `[Concept: gravity_lever_arm_cosine_torque]` Compute the worst-case horizontal ($\theta = 0\text{ rad}$) gravity holding torque $\tau_{\max}$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-6}$) for a massless link of length $L = 0.25\text{ m}$ carrying a tip mass $m = 0.80\text{ kg}$ ($g = 9.81\text{ m/s}^2$).
4. `[Concept: gravity_lever_arm_cosine_torque]` For the same link ($L = 0.25\text{ m}, m = 0.80\text{ kg}, g = 9.81\text{ m/s}^2$), compute $\tau_g(\theta)$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-6}$) at $\theta = \pi/3\text{ rad}$ ($60^\circ$ above horizontal).
5. `[Concept: gear_reduction_speed_torque_power_conservation]` A motor pulley ($Z_1 = 20$ teeth) drives a joint pulley ($Z_2 = 100$ teeth). Compute the reduction ratio $N = Z_2 / Z_1$ (tolerance $\pm 10^{-9}$).
6. `[Concept: gear_reduction_speed_torque_power_conservation]` Using the $N = 5.0$ reduction above with efficiency $\eta = 0.92$ and motor torque $\tau_m = 0.50\text{ N}\cdot\text{m}$, compute the output joint torque $\tau_{\text{load}} = \eta N \tau_m$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-9}$).
7. `[Concept: gear_reduction_speed_torque_power_conservation]` If the motor spins at $\omega_m = 150\text{ rad/s}$ into the $N = 5.0$ reducer, compute the output joint angular velocity $\omega_{\text{load}}$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$).
8. `[Concept: gear_reduction_speed_torque_power_conservation]` Why can a gearbox with ratio $N > 1$ multiply torque ($\tau_{\text{load}} = N \tau_m$) **without** violating conservation of energy?
   - **A.** Because it simultaneously divides angular velocity by the exact same factor ($\omega_{\text{load}} = \omega_m / N$), so mechanical power $P = \tau_{\text{load}}\omega_{\text{load}} = \tau_m \omega_m$ is conserved (minus friction loss).
   - **B.** Because gears create energy out of steel teeth.
   - **C.** Because both speed and torque increase by $N$.
   - **D.** Because torque does not have units of energy.

**Gate answer key:**
```python
import math

g1_fn = 2.5 * 9.81
g2_taum = 2.4
g3_tau_max = 0.80 * 9.81 * 0.25 * math.cos(0.0)
g4_tau_60 = 0.80 * 9.81 * 0.25 * math.cos(math.pi / 3.0)
g5_ratio = 100.0 / 20.0
g6_tau_load = 0.92 * 5.0 * 0.50
g7_w_load = 150.0 / 5.0
g8_choice = "A"

assert math.isclose(g1_fn, 24.525, rel_tol=1e-6)
assert math.isclose(g2_taum, 2.4, rel_tol=1e-9)
assert math.isclose(g3_tau_max, 1.962, rel_tol=1e-6)
assert math.isclose(g4_tau_60, 0.981, rel_tol=1e-6)
assert math.isclose(g5_ratio, 5.0, rel_tol=1e-9)
assert math.isclose(g6_tau_load, 2.3, rel_tol=1e-9)
assert math.isclose(g7_w_load, 30.0, rel_tol=1e-9)
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q4 $\to$ `## 3. Formalization` item 2; Q5–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Used $\sin\theta$ instead of $\cos\theta$ for gravity torque when $\theta = 0$ is defined as horizontal | Mixed up the angle measured from the horizontal $+x$-axis vs. the vertical $-y$-axis. | Always check $\theta = 0$: if $\theta = 0$ is horizontal, gravity torque is maximum ($\cos 0 = 1$); if $\theta = 0$ is hanging straight down, gravity torque is zero ($\sin 0 = 0$). |
| Omitted the link's own mass $m_{\text{link}}$ when sizing the shoulder motor | Calculated $m_{\text{tip}} g L$ for the payload only and forgot $m_{\text{link}} g L_{\text{com}}$. | Sum $(m_{\text{link}} L_{\text{com}} + m_{\text{tip}} L) g \cos\theta$ across both link self-weight and payload. |
| Multiplied speed by $N$ instead of dividing by $N$ on a speed reducer | Inverted the gear ratio definition $N = \omega_{\text{motor}} / \omega_{\text{load}}$. | Sanity-check that a speed reducer ($N > 1$) makes the output joint spin **slower** ($\omega_{\text{load}} = \omega_m / N$) and push **harder** ($\tau_{\text{load}} = \eta N \tau_m$). |

## 9. Resources
- **Shigley's *Mechanical Engineering Design* & Lynch/Park *Modern Robotics* (`resources/textbooks-and-papers.md`):** Free-body diagrams, static equilibrium, and gear transmission basics `[VERIFIED 2026-10-15]`.
- **Track 02 (`02-mechanics-kinematics-dynamics/README.md`):** Directly continues into Step 1.3 (`02-mechanics.T1.03`) `[VERIFIED 2026-10-15]`.
## 10. Next modules

<!-- next-step:start -->
👉 **Next:** [Step 6 · Measure the joint: sensors — Lesson 03.1: Quadrature Encoders (4x Counting) and 12-Bit Magnetic Angle Sensors](../03-sensors-and-actuators/03.1-quadrature-and-magnetic-encoders.md)
<!-- next-step:end -->
