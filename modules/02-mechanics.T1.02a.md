---
id: 02-mechanics.T1.02a
title: "Free-Body Diagrams, Static Torque Balance, Pulleys/Gears & Rotational Inertia"
track: "02"
tier: 1
prereqs:
  - 00-foundations.T1.01
new_concepts:
  - free_body_diagram_static_equilibrium
  - gravity_lever_arm_cosine_torque
  - gear_reduction_speed_torque_power_conservation
uses:
  - radians_unit_circle_and_atan2
  - newtons_second_law_and_torque
  - so2_rotation_matrix
est_hours: 3.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the bridge module before Step 1.3 (`02-mechanics.T1.03`). Before sizing a robot arm motor or computing $N^2$ reflected inertia in Step 1.3, you need to isolate a link in a **Free-Body Diagram (FBD)**, calculate how gravity torque varies with shoulder angle ($\tau_g = m g L_{\text{com}} \cos\theta$), and understand how a gearbox or timing belt trades speed for torque while conserving mechanical power ($P = \tau \omega$). Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Hold a heavy dumbbell straight out at shoulder height ($\theta = 0\text{ rad}$ horizontal): your shoulder muscles burn because gravity acts at the full horizontal lever arm $L\cos(0) = L$. Now raise your arm straight overhead ($\theta = \pi/2\text{ rad}$ vertical): the dumbbell rests directly over your shoulder pivot with zero horizontal lever arm ($L\cos(\pi/2) = 0$), requiring zero holding torque! Drawing a **Free-Body Diagram (FBD)** means cutting the link free from the rest of the world and drawing arrows for every force and torque acting on it so nothing is forgotten. And a **gearbox** with ratio $N:1$ acts as a rotary lever: much like a $10\times$ crowbar moves your hand $10\times$ farther to multiply force by $10\times$, an $N:1$ gear reducer spins the motor shaft $N$ times faster than the output joint while multiplying output torque by $N\times$.

## 3. Formalization
1. **Free-Body Diagram & Static Equilibrium ($\sum F = 0,\ \sum \tau = 0$):** For a rigid body to remain stationary ($\ddot{x} = 0, \ddot{\theta} = 0$), the vector sum of external forces $\sum F_x = 0, \sum F_y = 0$ (in $\text{N}$) and the sum of torques about any pivot $\sum \tau_z = 0$ (in $\text{N}\cdot\text{m}$) must vanish.
2. **Planar Link Gravity Holding Torque ($\tau_g(\theta)$):** For a link of mass $m$ ($\text{kg}$) whose center of mass lies at distance $L_{\text{com}}$ ($\text{m}$) from the joint pivot at angle $\theta$ ($\text{rad}$) measured from the horizontal $+x$-axis, gravity $m g$ acts straight down ($-y$), creating perpendicular lever arm $r_\perp = L_{\text{com}}\cos\theta$. The joint torque required to hold the link plus a tip payload $m_{\text{tip}}$ at length $L$ is:
   $$\tau_g(\theta) = \left(m L_{\text{com}} + m_{\text{tip}} L\right) g \cos\theta$$
   Substituting $m = 0.40\text{ kg}$, $L_{\text{com}} = 0.10\text{ m}$, $m_{\text{tip}} = 0.50\text{ kg}$, $L = 0.20\text{ m}$, $g = 9.81\text{ m/s}^2$, and $\theta = 0\text{ rad}$ gives $\tau_{\max} = (0.04 + 0.10)(9.81)\cos(0) = 1.3734\text{ N}\cdot\text{m}$.
3. **Gear Ratio Speed/Torque Scaling and Power Conservation:** For an ideal gear or belt reduction of ratio $N = \omega_{\text{motor}} / \omega_{\text{load}} = r_{\text{load}} / r_{\text{motor}}$ with efficiency $\eta \in (0, 1]$:
   $$\omega_{\text{load}} = \frac{\omega_{\text{motor}}}{N}, \quad \tau_{\text{load}} = \eta N \tau_{\text{motor}}, \quad P_{\text{load}} = \tau_{\text{load}}\omega_{\text{load}} = \eta P_{\text{motor}}$$
   Substituting $N = 8.0$, $\eta = 1.0$, $\tau_{\text{motor}} = 0.25\text{ N}\cdot\text{m}$, and $\omega_{\text{motor}} = 160\text{ rad/s}$ gives $\tau_{\text{load}} = 2.0\text{ N}\cdot\text{m}$, $\omega_{\text{load}} = 20\text{ rad/s}$, and $P = 40.0\text{ W}$ on both sides.

## 4. Worked example
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

## 6. Simulation path
Open **Tab 3 (2-Link Planar Arm Kinematics & Workspace)** in the MechaLab Workbench (`npm run dev`) to visualize how link lengths and joint angles change the horizontal moment arm of a planar robot arm.

No hardware required for this module (`hardware_required: false`). In Step 1.3 (`02-mechanics.T1.03`) and Step 1.7 (`06-robotics.T1.07`), your gravity torque equation $\tau_g(\theta) = M g L_{\text{eff}}\cos\theta$ becomes the exact **gravity feedforward compensation term** added to the PID controller output:
```text
[Encoder Angle theta] ---> [tau_ff = (m*L_com + m_tip*L)*g*cos(theta)] ---> (+) ---> [Motor Torque Command]
```
Pass/fail verification in simulation: `tau_0 == 1.3734 N*m`, `tau_60 == 0.6867 N*m`, and `tau_motor_0 == 0.2543 N*m`.

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 1.3 (`02-mechanics.T1.03`).

### Skip test
1. `[Recall] [Concept: free_body_diagram_static_equilibrium]` A horizontal massless beam is pivoted at $x = 0\text{ m}$. A downward load of $F_1 = 30.0\text{ N}$ acts at $x_1 = 0.20\text{ m}$. What upward force $F_2$ in newtons ($\text{N}$, tolerance $\pm 10^{-9}$) must act at $x_2 = 0.10\text{ m}$ to maintain static torque equilibrium ($\sum \tau_z = 0$)?
2. `[Apply] [Concept: gravity_lever_arm_cosine_torque]` Compute the gravity holding torque $\tau_g = m g L \cos\theta$ in $\text{N}\cdot\text{m}$ (tolerance $\pm 10^{-6}$) for a point mass $m = 1.0\text{ kg}$ at arm length $L = 0.30\text{ m}$ with $g = 9.81\text{ m/s}^2$ when the arm is straight up ($\theta = \pi/2\text{ rad}$ from horizontal).
3. `[Transfer] [Concept: gear_reduction_speed_torque_power_conservation]` An ideal ($\eta = 1.0$) planetary gearbox with ratio $N = 9.0$ is driven by a motor producing $\tau_m = 0.20\text{ N}\cdot\text{m}$ at $\omega_m = 90.0\text{ rad/s}$. Compute the output torque $\tau_{\text{load}}$ ($\text{N}\cdot\text{m}$) and output speed $\omega_{\text{load}}$ ($\text{rad/s}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 00-foundations.T1.01 — Concept: radians_unit_circle_and_atan2] [Concept: gravity_lever_arm_cosine_torque]` At what shoulder angle $\theta$ (measured from the horizontal $+x$-axis) does a planar robot link experience the **maximum** gravity holding torque?
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
- Proceed to legacy **Step 1.3 (`02-mechanics.T1.03`)** in [`02-mechanics-kinematics-dynamics/README.md`](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive).
