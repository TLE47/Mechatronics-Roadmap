# Track 06: Robotics, Whole-Body Control, Perception & Autonomous Systems

> **Part of the [MechaLab Multi-Pass Tiered Roadmap](../README.md)**  
> **Prerequisites:** [Track 02: Mechanics, Kinematics & Dynamics](../02-mechanics-kinematics-dynamics/README.md), [Track 04: Embedded & Real-Time](../04-embedded-and-realtime/README.md), [Track 05: Control & Estimation](../05-control-and-estimation/README.md)  
> **Feeds Into:** [Track 07: Systems, HIL & Production](../07-systems-hil-and-production/README.md), [Track 08: Capstone Projects](../08-capstone-projects/README.md)  
> **Core Principle:** High-level autonomy (SLAM, motion planning, task policies) is only as reliable as the real-time bridge connecting it to physical joint torques and contact forces. Modern robotic systems replace rigid trajectory replay with **Operational-Space Impedance Control, Hierarchical Whole-Body Quadratic Programming (WBC-QP), and Factor-Graph State Estimation**.

---

## 🔄 Linear Level-Up Navigation (Follow Your Current Pass Across Track 00 → Track 08)

Complete **only your current Tier section** below, verify its hands-on milestone, and proceed directly to **Track 07 in the same Tier**:

| Pass / Level | Previous Step in Pass | Current Track 06 Section | Next Linear Step in This Pass |
| :--- | :--- | :--- | :--- |
| **🟢 Pass 1: Tier 1 (Beginner)** | [← Track 05 (Tier 1)](../05-control-and-estimation/README.md#tier-1-beginner--intuitive) | [§1 Tier 1: Cubic/Trapezoidal Trajectories & Joint Virtual Springs](#tier-1-beginner--intuitive) | [**Next in Pass 1 → Track 07 (Tier 1: 10-Step Safe Bring-Up & Sine Sweeps)**](../07-systems-hil-and-production/README.md#tier-1-beginner--intuitive) |
| **🔵 Pass 2: Tier 2 (Applied)** | [← Track 05 (Tier 2)](../05-control-and-estimation/README.md#tier-2-intermediate--applied) | [§2 Tier 2: Jacobian Transpose Cartesian Compliance & `Ruckig` S-Curves](#tier-2-intermediate--applied) | [**Next in Pass 2 → Track 07 (Tier 2: Regen Clamps, CRC & HIL Faults)**](../07-systems-hil-and-production/README.md#tier-2-intermediate--applied) |
| **🌉 Bridge Concept** | — | [§3 Bridging the Gap: Rigid `servo.write()` Stepping → 1 kHz Torque/Impedance Control](#bridging-the-gap-maker-to-custom) | [Inspect Tier 3 Production Mastery ↓](#tier-3-advanced--production) |
| **🟣 Pass 3: Tier 3 (Production)** | [← Track 05 (Tier 3)](../05-control-and-estimation/README.md#tier-3-advanced--production) | [§4 Tier 3: Khatib Operational Inertia Λ(q) & Null-Space WBC](#tier-3-advanced--production) | [**Next in Pass 3 → Track 07 (Tier 3: Schroeder Multisine SysID & <1 μs STO)**](../07-systems-hil-and-production/README.md#tier-3-advanced--production) |

---

## Tier 1 (Beginner / Intuitive)

> **Goal of Pass 1 (Track 06):** Stop commanding sudden step jumps (`q_des = 90.0`) that slam robot joints! Learn to generate smooth **Cubic Polynomial & Trapezoidal Velocity Trajectories** so velocity starts and ends at zero, and implement **Joint-Space Virtual Springs (Compliant PD + Gravity Offset)** so a human hand can safely push the robot arm out of the way.
> **📚 Required Foundations & Bridge Modules for Pass 1 (Track 06):** Complete Tier 1 Foundations [`00-foundations.T1.00a`](../modules/00-foundations.T1.00a.md) (*Python Functions & Loops*), [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md) (*Trigonometry for Gravity Torque*), and [`00-foundations.T1.00e`](../modules/00-foundations.T1.00e.md) (*Kinematics & Virtual Springs*) plus the Track 06 Tier 1 Bridge [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md).

### 1.1 Why Step Commands Break Gears: Smooth Cubic Spline Interpolation
- **Core Summary:** Stepping a target angle `q_des` instantaneously demands infinite velocity and acceleration at $t = 0$, slamming the actuator into current saturation and shaking the robot frame. A **rest-to-rest cubic polynomial** $q_d(t) = q_0 + (3s^2 - 2s^3)(q_f - q_0)$ (with normalized time $s = t/T \in [0, 1]$) guarantees smooth position and strictly zero velocity $\dot{q}\kern0pt_d(0) = \dot{q}\kern0pt_d(T) = 0$ at both endpoints.

$$
q_d(t) = q_0 + (3s^2 - 2s^3)(q_f - q_0), \qquad \dot{q}_d(t) = \frac{6s(1 - s)}{T}(q_f - q_0)
$$

- **Curated Free Resources:**
  - 🔗 [Lynch & Park: Modern Robotics — Chapter 9: Trajectory Generation (Free Northwestern PDF & Videos)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics) — *Derives cubic, quintic, and trapezoidal time-scaling polynomials with clear physical plots.*
  - 🔗 [Russ Tedrake (MIT 6.4210): Robotic Manipulation — Trajectory Planning](https://manipulation.csail.mit.edu/trajectories.html) — *Interactive Python notebooks showing smooth spline interpolation for robot arms.*
  - 🔗 [Webots Open-Source 3D Robot Simulator (cyberbotics.com)](https://cyberbotics.com/) — *Zero-setup cross-platform simulator with 100+ pre-built mobile robots and arms for testing Tier 1 Python/C++ trajectories.*
  - 🔗 [Cyrill Stachniss (University of Bonn): Mobile Sensing and Robotics — Photogrammetry & SLAM Lectures (YouTube)](https://www.youtube.com/c/CyrillStachniss) — *Accessible visual lectures on odometry, occupancy grids, Kalman/Particle filters, and graph SLAM.*
- **🧪 Hands-On Exercise:**
  - *Task:* Write a 10-line Python or C++ function that evaluates $q_d(t)$, $\dot{q}\kern0pt_d(t)$, and $\ddot{q}\kern0pt_d(t)$ for a $1.0\text{ rad}$ move over $T = 0.8\text{ s}$ using both a cubic polynomial ($3s^2 - 2s^3$) and a quintic polynomial ($10s^3 - 15s^4 + 6s^5$). Verify that the quintic polynomial has zero acceleration $\ddot{q}\kern0pt_d(0) = \ddot{q}\kern0pt_d(T) = 0$ at the start and end of the move!
  - *📚 What to Learn & Resource Links for This Exercise:* Study discrete velocity/acceleration kinematics in Foundations [`00-foundations.T1.00e`](../modules/00-foundations.T1.00e.md) and rest-to-rest cubic polynomial & trapezoidal velocity profiling in [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md) (`## 3. Formalization` Items 1–2 & `## 4. Worked example`), plus [Lynch & Park *Modern Robotics* Ch. 9 (Trajectory Generation)](https://hades.mech.northwestern.edu/index.php/Modern_Robotics).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** During a rest-to-rest cubic polynomial trajectory $q_d(t) = q_0 + (3s^2 - 2s^3)\Delta q$ over duration $T$, at what instant $t$ does the peak velocity $\dot{q}\kern0pt_{\max}$ occur, and how much larger is it than the average velocity $\Delta q / T$?
  * **Answer / Explanation:** Setting $\ddot{q}\kern0pt_d = 0$ gives $s = 0.5$ ($t = T/2$, the exact midpoint of the move). At $s = 0.5$, $\dot{q}\kern0pt_{\max} = \frac{6(0.5)(0.5)}{T}\Delta q = 1.5 \frac{\Delta q}{T}$—exactly **$50\%$ higher** than the average speed!

  **Q2:** Why do high-speed arms prefer a **quintic (5th-order)** polynomial $s(\tau) = 10\tau^3 - 15\tau^4 + 6\tau^5$ over a cubic (3rd-order) polynomial?
  * **Answer & Explanation:** A cubic polynomial has only 4 coefficients (matching $q(0), q(T), \dot{q}(0), \dot{q}(T)$), so its acceleration $\ddot{q}(t)$ jumps discontinuously at $t = 0$ and $t = T$ (infinite jerk!). A quintic polynomial has 6 coefficients, allowing you to constrain $\ddot{q}(0) = \ddot{q}(T) = 0$ so motor torque ramps up smoothly from zero.
  </details>

### 1.2 Joint-Space Compliant Control (Virtual Spring-Damper + Gravity Feedforward)
- **Core Summary:** Setting the integral gain $K_i = 0$ and pairing a soft PD virtual spring-damper with analytical gravity compensation $\tau_{\text{cmd}} = K_p(q_d - q) + K_d(\dot{q}\kern0pt_d - \dot{q}) + m g l_c \cos(q)$ allows a robot arm to hold any pose in space weightlessly while yielding safely like a mechanical spring whenever a human hand pushes it.

$$
\tau_{\text{cmd}} = K_p (q_d(t) - q) + K_d (\dot{q}_d(t) - \dot{q}) + \underbrace{m g l_c \cos(q)}_{\text{Gravity Feedforward } g(q)}
$$

- **Curated Free Resources:**
  - 🔗 [Neville Hogan (1985 Seminal Paper): Impedance Control — An Approach to Manipulation](https://mec560sbu.github.io/2016/09/28/Hogan1985/) — *The foundational robotics paper explaining why robots interacting with the physical world must control mechanical impedance (stiffness & damping) rather than rigid position.*
  - 🔗 [Albu-Schäffer et al. (DLR): Soft Robotics & Joint-Level Torque/Impedance Control](https://ieeexplore.ieee.org/document/4543189) — *Shows how gravity compensation (* $K_p = 0, K_d = 0$ *) creates "zero-gravity lead-through teaching" on collaborative arms.*
- **🧪 Hands-On Exercise:**
  - *Task:* Set $K_p = 0$ and $K_d = 0.05\text{ N}\cdot\text{m}\cdot\text{s/rad}$ in your 1-DOF or 2-DOF arm simulation while keeping gravity feedforward $\tau = \hat{g}(q)$ active ("Zero-G Teaching Mode"). Verify that you can move the arm to any angle and it stays floating in place without falling!
  - *📚 What to Learn & Resource Links for This Exercise:* Study lever torque $\tau = m g L_{\text{com}}\cos q$ in [`02-mechanics.T1.02a`](../modules/02-mechanics.T1.02a.md), PD virtual spring-damper control in [`05-control.T1.05a`](../modules/05-control.T1.05a.md), and joint-space compliant PD + gravity compensation in [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md) (`## 3. Formalization` Item 3 & `## 4. Worked example`).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why must you set the integral gain $K_i = 0$ during compliant physical human-robot interaction or contact tasks?
  * **Answer / Explanation:** If a human pushes the robot arm away from $q_d$ and holds it for 5 seconds, a non-zero integral term $K_i \int (q_d - q)\,dt$ will wind up to maximum actuator torque trying to fight the human—and when the human lets go, the arm will whip back violently! Compliant impedance control relies on feedforward physics ($\hat{g}(q)$) for accuracy and keeps $K_i = 0$.

  **Q2:** If a $0.5\text{ kg}$ robot link has its center of mass at $l_c = 0.20\text{ m}$ from the pivot, what feedforward torque $\tau_g(q)$ is required when the link is horizontal ($q = 0\text{ rad}$) vs. straight up ($q = \pi/2\text{ rad}$)?
  * **Answer & Explanation:** Using $\tau_g(q) = m g l_c \cos(q)$: at $q = 0$ (horizontal), $\tau_g = 0.5 \times 9.81 \times 0.20 \times \cos(0) = 0.981\text{ N}\cdot\text{m}$. At $q = \pi/2$ (straight up), $\cos(\pi/2) = 0$, so $\tau_g = 0.0\text{ N}\cdot\text{m}$.
  </details>

### ✅ Tier 1 Milestone Gate (`Track 06 · Pass 1`)
* Replace step setpoints on your 1-DOF or 2-DOF gimbal arm with a rest-to-rest cubic polynomial generator and gravity feedforward $g(q)$, verifying that you can gently push the link away by hand and watch it return smoothly without overshoot.
* **Next Linear Step in Pass 1:** [**Proceed to Track 07 (Tier 1: 10-Step Safe Bring-Up Protocol & Single-Tone Sine Sweeps) →**](../07-systems-hil-and-production/README.md#tier-1-beginner--intuitive)

---

## Tier 2 (Intermediate / Applied)

> **Goal of Pass 2 (Track 06):** Upgrade from joint-space springs to **Cartesian Task-Space Impedance Control (`tau = J^T F_cart + g(q)`)**—allowing you to specify independent $(x, y, z)$ stiffness in millimeters/Newtons—and eliminate structural vibration using **Jerk-Bounded S-Curve Trajectories (`Ruckig`)**.
> **📚 Required Foundations & Bridge Modules for Pass 2 (Track 06):** Complete Tier 2 Foundations [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md) (*Matrix Transpose & Inverse*) and [`00-foundations.T2.00b`](../modules/00-foundations.T2.00b.md) (*3D Coordinate Frames*) plus the Track 06 Tier 2 Bridge Ladder [`06-robotics.T2.06a`](../modules/06-robotics.T2.06a.md) (*ROS 2 Nodes, Topics, Services, Actions & TF2*) → [`06-robotics.T2.06b`](../modules/06-robotics.T2.06b.md) (*ROS 2 Launch, Parameters, `ros2_control` & Cartesian Impedance / S-Curves*).

### 2.1 Sensorless Cartesian Impedance via the Jacobian Transpose ($\tau = J(q)^\top F_{\text{cart}} + g(q)$)
- **Core Summary:** Using the virtual-work duality $\tau = J(q)^\top F_{\text{cart}} + g(q)$ with $F_{\text{cart}} = K_x(x_d - x) + D_x(\dot{x}\kern0pt_d - J(q)\dot{q})$, a multi-DOF robot can act as an anisotropic 3D virtual spring-damper at its gripper—for example, very stiff vertically ($K_z = 1000\text{ N/m}$) while compliant horizontally ($K_x = 50\text{ N/m}$)—without requiring inverse kinematics or an external force/torque sensor!
- **Curated Free Resources:**
  - 🔗 [Russ Tedrake (MIT 6.4210): Chapter 8 — Manipulator Force & Cartesian Stiffness Control](https://manipulation.csail.mit.edu/force.html) — *Derives* $\tau = J(q)^\top F_{\text{cart}} + g(q)$ *and demonstrates how anisotropic stiffness enables peg-in-hole assembly and surface wiping.*
  - 🔗 [Khatib (1987 Seminal Paper): A Unified Approach for Motion and Force Control of Robot Manipulators](https://cs.stanford.edu/groups/manips/publications/pdfs/Khatib_1987_RA.pdf) — *Introduces operational-space control directly in end-effector coordinates.*
  - 🔗 [Siciliano, Sciavicco, Villani & Oriolo: Robotics — Modelling, Planning and Control (Springer)](https://link.springer.com/book/10.1007/978-1-84628-642-1) — *Complete textbook coverage of Cartesian impedance, hybrid force/motion control, and visual servoing.*
- **🧪 Hands-On Exercise:**
  - *Task:* Run `./06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py` or open **Tab 5: URDF / MuJoCo & STO** to simulate a 2-link/3-link leg or arm hitting an unexpected rigid wall at $x_{\text{wall}}$ under Cartesian Impedance Control ($K_x = 400\text{ N/m}$), verifying that steady-state contact force settles cleanly to $F_x = K_x(x_d - x_{\text{wall}})$.
  - *📚 What to Learn & Resource Links for This Exercise:* Study $2\times 2$ matrix multiplication in Foundations [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md), Jacobian virtual work $\tau = J(q)^\top F$ in [`02-mechanics.T2.02a`](../modules/02-mechanics.T2.02a.md), ROS 2 TF2 transforms in [`06-robotics.T2.06a`](../modules/06-robotics.T2.06a.md), and Cartesian impedance + `ros2_control` `JointImpedanceController` in [`06-robotics.T2.06b`](../modules/06-robotics.T2.06b.md) (`## 3. Formalization` Items 2–3 & `## 4. Worked example`).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why does Cartesian Impedance Control $\tau = J(q)^\top \big(K_x(x_d - \text{FK}(q)) - D_x J(q)\dot{q}\big) + g(q)$ remain completely stable even when the robot passes right through a kinematic singularity ($\det J(q) = 0$)?
  * **Answer & Explanation:** Because it only uses **Forward Kinematics $\text{FK}(q)$ and the transpose $J(q)^\top$**—it never inverts $J(q)^{-1}$! At a singularity, components of $F_{\text{cart}}$ along the singular direction simply map to zero joint torque via $J(q)^\top F_{\text{cart}}$, avoiding the infinite velocity blow-up of inverse differential kinematics.

  **Q2:** If you command a desired gripper height $z_d = -0.35\text{ m}$ with vertical Cartesian stiffness $K_z = 800\text{ N/m}$, and the foot touches the ground early at $z = -0.32\text{ m}$ at rest, what vertical ground reaction force $F_z$ does the leg exert?
  * **Answer & Explanation:** $F_z = K_z (z_d - z) = 800 \times (-0.35 - (-0.32)) = -24.0\text{ N}$ downward onto the ground ($+24.0\text{ N}$ upward ground reaction support force).
  </details>

### 2.2 Why Trapezoidal Velocity Still Vibrates Arms: Jerk-Bounded S-Curves (`Ruckig`)
- **Core Summary:** A trapezoidal velocity profile steps acceleration instantaneously ($\dddot{q} = \pm\infty$), acting like a hammer blow that excites flexible link and gearbox resonances. **3rd-order Jerk-Bounded S-Curve generators (`Ruckig`)** bound maximum velocity, acceleration, *and* jerk ($\lvert\dddot{q}\rvert \le j_{\max}$) across 7 smooth phases so structural modes are never rung.
- **Curated Free Resources:**
  - 🔗 [Ruckig Open-Source Online Jerk-Limited Trajectory Library (GitHub & Docs)](https://github.com/pantor/ruckig) — *Production C++20/Python library used in ROS 2 (`MoveIt 2`) and Franka Emika arms for sub-millisecond time-optimal S-curve generation from arbitrary initial states.*
  - 🔗 [ROS 2 Jazzy Jalisco / Lyrical Luth (`docs.ros.org`), `ros2_control`, `MoveIt 2` & `Nav2`](https://docs.ros.org/) — *Modern robotics middleware stack with `rmw_zenoh_cpp` low-overhead networking, `Gazebo Harmonic` simulation, and `Rerun.io` / `Foxglove` `.mcap` multimodal telemetry.*
  - 🔗 [Biagiotti & Melchiorri: Trajectory Planning for Automatic Machines and Robots — Double-S / S-Curve Profiles](https://link.springer.com/book/10.1007/978-3-540-85629-0) — *Complete analytical equations for 7-segment jerk-limited trajectories.*
- **🧪 Hands-On Exercise:**
  - *Task:* Run `./06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py` to compare the high-frequency structural vibration of a flexible joint driven by a trapezoidal velocity profile vs. a 7-segment jerk-bounded S-curve ($\lvert\dddot{q}\rvert \le 20\text{ rad/s}^3$).
  - *📚 What to Learn & Resource Links for This Exercise:* Study second-order structural resonance excitation in Foundations [`00-foundations.T2.00c`](../modules/00-foundations.T2.00c.md) and jerk-bounded S-curve acceleration ramp time $T_j = a_{\max}/j_{\max}$ in [`06-robotics.T2.06b`](../modules/06-robotics.T2.06b.md) (`## 3. Formalization` Item 3 & `## 4. Worked example`), plus [Ruckig Real-Time Jerk-Limited Trajectory Library (`github.com/pantor/ruckig`)](https://github.com/pantor/ruckig).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** What are the **7 phases** of a full time-optimal 3rd-order S-curve point-to-point move?
  * **Answer / Explanation:** (1) Positive max jerk $+j_{\max}$ (ramping acceleration up), (2) Constant max acceleration $+a_{\max}$ ($j = 0$), (3) Negative max jerk $-j_{\max}$ (ramping acceleration back to $0$ as velocity reaches $v_{\max}$), (4) Constant max velocity cruise $v_{\max}$ ($a = 0, j = 0$), (5) Negative max jerk $-j_{\max}$ (ramping deceleration to $-a_{\max}$), (6) Constant max deceleration $-a_{\max}$, and (7) Positive max jerk $+j_{\max}$ (ramping deceleration smoothly to $0$ at target).

  **Q2:** Physically, why does bounding **jerk** ($\dddot{q}$) directly limit the rate of change of motor phase current ($\frac{di_q}{dt}$) and prevent voltage saturation?
  * **Answer & Explanation:** Because motor torque is proportional to acceleration ($\tau = J \ddot{q} = K_t i_q$), the time derivative of torque—**yank / jerk** ($J \dddot{q} = K_t \frac{di_q}{dt}$)—is directly proportional to the inductive voltage drop $L_q \frac{di_q}{dt}$ required from the DC bus! Infinite jerk demands infinite $\frac{di_q}{dt}$, which immediately saturates the inverter bus voltage $V_{\text{bus}}$.
  </details>

### ✅ Tier 2 Milestone Gate (`Track 06 · Pass 2`)
* Test the 3-DOF QDD Hopping Leg and 6-DOF Arm kinematics in **Tab 5: URDF / MuJoCo & STO**, verifying Jacobian transpose force mapping across the workspace.
* **Next Linear Step in Pass 2:** [**Proceed to Track 07 (Tier 2: Regen Braking Bus Clamps, CRC Watchdogs & HIL Faults) →**](../07-systems-hil-and-production/README.md#tier-2-intermediate--applied)

---

## Bridging the Gap: Maker to Custom

### From Rigid `servo.write(angle)` Stepping to $1\text{ kHz}$ Distributed Torque & Operational-Space Impedance Control

| Feature | Tier 1 Maker Approach (`servo.write(angle)` Hobby RC Servo) | Tier 2/3 Custom Approach ($1\text{ kHz}$ CAN-FD Torque + Operational Impedance) |
| :--- | :--- | :--- |
| **Control Interface** | $50\text{ Hz}$ PWM pulse width ($1000\text{–}2000\ \mu\text{s}$) commands angle only; internal potentiometer loop is hidden and un-tunable. | $1\text{–}2\text{ kHz}$ CAN-FD / EtherCAT frame commands `(q_des, dq_des, Kp, Kd, tau_ff)` to a $40\text{ kHz}$ FOC loop. |
| **Unplanned Wall Contact** | Stalls at maximum current until plastic/brass gears strip or the LDO thermal-trips. | Regulates exact Cartesian contact wrench $\mathcal{F} = K_x \Delta x$ ($10.0\text{ N} \pm 0.5\text{ N}$) with zero gear damage. |
| **Multi-Joint Coordination** | Independent joint loops fight each other along straight lines. | Khatib's Operational Inertia $\Lambda(q)$ decouples $(x,y,z)$ dynamics and projects posture tasks into the dynamically consistent null-space $N^\top(q)$. |

---

## Tier 3 (Advanced / Production)

> **Goal of Pass 3 (Track 06):** Master full-stack robotic autonomy and whole-body control: Khatib's Operational-Space Inertia $\Lambda(q)$ & dynamically consistent null-space projection $\bar{J}(q)$, Floating-Base Whole-Body Control QPs (`WBC-QP`) with friction cones, `PREEMPT_RT` Linux kernel isolation (`<50 µs` jitter), Forster's Manifold IMU Preintegration for Factor-Graph SLAM (`GTSAM`), and Visuomotor Imitation Learning (`ACT`, `Diffusion Policy`, `LeRobot`) & Vision-Language-Action (`VLA`) models.
> **📚 Required Foundations & Bridge Modules for Pass 3 (Track 06):** Complete Tier 3 Foundations [`00-foundations.T3.00a`](../modules/00-foundations.T3.00a.md) ($SO(3)$ Exponential/Log Maps & Port-Hamiltonians) and **Step 3.1 (`00-foundations.T3.01`)** (Lie Groups $SO(3)/SE(3)$) plus the Track 06 Tier 3 Bridge Ladder [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) (Khatib $\Lambda(q)$, Friction-Cone WBC & IMU Preintegration) → [`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) (*ACT Chunking, Diffusion DDIM & Sim-to-Real*). **also depends on:** [`07-systems.T3.06a`](../modules/07-systems.T3.06a.md).
> * [**Next Linear Step in Pass 3 → Track 07 (Tier 3: Schroeder Multisine Closed-Loop SysID & <1 μs Hardware STO)**](../07-systems-hil-and-production/README.md#tier-3-advanced--production)

### 4.1 Full-Stack Autonomous Robotic Software & Hardware Architecture

```mermaid
flowchart TB
    subgraph PERCEPTION["Perception & Factor-Graph State Estimation (30–400 Hz)"]
        CAM_LIDAR["Global-Shutter Stereo Camera (60 Hz)<br/>+ 3D Spinning/Solid-State Lidar (20 Hz)<br/>Hardware PTP / GPIO Triggered"]
        IMU_PROP["IMU Preintegration on Manifold<br/>ΔR_ij, Δv_ij, Δp_ij (400–1000 Hz)<br/>+ Leg/Wheel Kinematic Odometry"]
        FG_SLAM["Sliding-Window Factor Graph (GTSAM / iSAM2)<br/>Visual-Inertial-Kinematic Odometry<br/>+ Occupancy / ESDF Voxel Map (nvblox)"]

        CAM_LIDAR --> FG_SLAM
        IMU_PROP --> FG_SLAM
    end

    subgraph PLANNING["Motion Planning & Centroidal MPC (20–200 Hz)"]
        GLOBAL["Global Kinodynamic Planner<br/>(SE(3) RRT* / Hybrid A* / TrajOpt)"]
        LOCAL_SPLINE["Online Jerk-Limited Trajectory Generator<br/>(Ruckig / TOPP-RA / MINCO Splines)"]
        CMPC["Centroidal / Task-Space MPC (100–250 Hz)<br/>Optimizes Contact Forces f_c & CoM Trajectory"]

        FG_SLAM -->|Pose T_wb, Twist V_wb, ESDF| GLOBAL
        GLOBAL -->|Waypoints & Safe Corridors| LOCAL_SPLINE
        LOCAL_SPLINE --> CMPC
        FG_SLAM -->|High-Rate State x̂| CMPC
    end

    subgraph RT_CONTROL["Hard Real-Time Linux PREEMPT_RT Core (1–2 kHz, Isolated CPU Core)"]
        WBC["Whole-Body Control QP (WBC-QP) /<br/>Operational-Space Impedance Controller<br/>min ‖J_task q̈ + J̇_task q̇ - ẍ_des‖²_W<br/>s.t. M q̈ + h = Sᵀ τ + J_cᵀ f_c,  f_c ∈ Friction Cone"]
        ROS2_HW["ros2_control HardwareInterface<br/>Zero-Allocation read() / update() / write()<br/>over EtherCAT DC / CAN-FD"]

        CMPC -->|Desired Wrench / CoM / Foot Swing| WBC
        FG_SLAM -->|Zero-Copy Shared Memory State| WBC
        WBC -->|τ_ff, q_des, q̇_des, K_p, K_d| ROS2_HW
    end

    subgraph ACT_BUS["Distributed Joint Actuator Nodes (25–40 kHz FOC)"]
        JOINTS(["N x Smart QDD / Harmonic Actuator Modules<br/>τ_cmd = τ_ff + K_p(q_des - q) + K_d(q̇_des - q̇)"])
        ROS2_HW <==>|EtherCAT / CAN-FD 1–2 kHz| JOINTS
    end

    style PERCEPTION fill:#1e3a8a,stroke:#60a5fa,color:#eff6ff
    style PLANNING fill:#3b0764,stroke:#c084fc,color:#faf5ff
    style RT_CONTROL fill:#064e3b,stroke:#34d399,color:#ecfdf5
    style ACT_BUS fill:#450a0a,stroke:#f87171,color:#fef2f2
```

### 4.2 Khatib Operational-Space Impedance & Dynamically Consistent Null-Space Projection
- **Core Summary:** Standard Jacobian transpose impedance $J^\top(K_x\tilde{x} + D_x\dot{\tilde{x}})$ suffers from configuration-dependent apparent mass at the gripper. **Khatib's Operational-Space Inertia Matrix $\Lambda(q) = (J M^{-1} J^\top)^{-1}$** decouples the Cartesian dynamics into a true unit-mass system in $(x,y,z)$, while the **dynamically consistent generalized inverse $\bar{J} = M^{-1} J^\top \Lambda$** defines a null-space projector $N^\top = I - J^\top \bar{J}^\top$ that allows redundant posture motions (such as moving a 7-DOF elbow) with **strictly zero acceleration perturbation** at the gripper.

$$
\Lambda(q) = \left(J(q) M^{-1}(q) J(q)^\top\right)^{-1}, \qquad \bar{J}(q) = M^{-1}(q) J(q)^\top \Lambda(q)
$$

$$
\tau = J(q)^\top \Big(\Lambda(q)\ddot{x}_d - K_x \tilde{x} - D_x \dot{\tilde{x}}\Big) + g(q) + \left(I - J(q)^\top \bar{J}(q)^\top\right) \tau_{\text{null}}
$$

- **Curated Free Resources:**
  - 🔗 [Oussama Khatib (Stanford CS223A / CS327A): Operational Space Formulation & Redundant Manipulators](https://see.stanford.edu/Course/CS223A) — *Full Stanford video lectures and course reader by the creator of Operational Space Control.*
  - 🔗 [Lab 06 Script: `06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py`](./lab/lab06_impedance_and_ruckig.py) — *Executable Python verification proving* $J(q) M^{-1}(q) (I - J^\top \bar{J}^\top) \tau_{\text{null}} = \mathbf{0}$ *to machine precision.*
- **🧪 Hands-On Exercise:**
  - *Task:* Run `./06-robotics-and-autonomy/lab/lab06_impedance_and_ruckig.py` to compare the Euclidean pseudo-inverse null-space projector $(I - J^\top (J^+)^\top)$ (which leaks false accelerations into the end-effector whenever $M(q) \ne I$) against Khatib's dynamically consistent projector $(I - J^\top \bar{J}^\top)$.
  - *📚 What to Learn & Resource Links for This Exercise:* Study matrix inverses in Foundations [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md) and Khatib's operational-space inertia matrix $\Lambda(q) = (J M^{-1} J^\top)^{-1}$ + dynamically consistent generalized inverse $\bar{J} = M^{-1} J^\top \Lambda$ in [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) (`## 3. Formalization` Item 1 & `## 4. Worked example`), plus [Khatib (1987) *A Unified Approach for Motion and Force Control*](https://ieeexplore.ieee.org/document/1087068).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why does the standard Moore-Penrose kinematic null-space projector $N_{\text{kin}}^\top = I - J^\top (J J^\top)^{-1} J$ fail to keep the end-effector stationary when applying a posture torque $\tau_{\text{null}}$?
  * **Answer & Explanation:** Because joint torques accelerate the arm through the **inverse mass matrix $M^{-1}(q)$**: $\ddot{x} = J M^{-1} \tau$! Since $J M^{-1} N_{\text{kin}}^\top \ne 0$ when $M(q) \ne I$, inertial coupling causes elbow torques to jerk the gripper. Weighting the generalized inverse by $M^{-1}(q)$ via $\bar{J} = M^{-1} J^\top \Lambda$ guarantees $J M^{-1} (I - J^\top \bar{J}^\top) = J M^{-1} - (J M^{-1} J^\top)\Lambda J M^{-1} = J M^{-1} - I J M^{-1} \equiv \mathbf{0}$!

  **Q2:** Physically, what do the eigenvalues and eigenvectors of the $3\times 3$ translational operational inertia matrix $\Lambda_v(q)$ represent?
  * **Answer & Explanation:** They form the **Beltrami / Khatib Inertial Ellipsoid** at the gripper: the eigenvectors point along the principal directions of maximum and minimum effective mass, and the eigenvalues equal the exact physical mass (in $\text{kg}$) a human or workpiece feels when colliding with the tip along each axis.
  </details>

### 4.3 Floating-Base Whole-Body Control QP (`WBC-QP`) & `PREEMPT_RT` Linux
- **Core Summary:** Legged robots (quadrupeds, bipeds) have an **unactuated 6-DOF floating base** ($S = [0_{n\times 6}, I_{n\times n}]$) and can only accelerate their center of mass by pushing against the ground through unilateral friction cones ($\lvert f_{c,x}\rvert \le \mu f_{c,z}$, $f_{c,z} \ge 0$). A $1\text{ kHz}$ **Whole-Body Control Quadratic Program (`WBC-QP`)** running on an isolated `PREEMPT_RT` Linux CPU core solves simultaneously for joint accelerations $\dot{v}$, contact forces $f_c$, and actuator torques $\tau$.

$$
\begin{aligned}
\min_{\dot{v}, f_c, \tau} \quad & \sum_{k} w_k \left\| J_k(q)\dot{v} + \dot{J}_k(q,v)v - \ddot{x}_{k,\text{des}} \right\|_2^2 + \|f_c\|_{W_f}^2 + \|\tau\|_{W_\tau}^2 \\
\text{subject to} \quad & M(q)\dot{v} + h(q,v) = S^\top \tau + J_c(q)^\top f_c, \qquad J_{\text{stance}}(q)\dot{v} + \dot{J}_{\text{stance}}(q,v)v = 0 \\
& |f_{c,x}| \le \mu f_{c,z},\quad |f_{c,y}| \le \mu f_{c,z},\quad f_{c,z} \ge f_{z,\min} > 0, \qquad \tau_{\min} \le \tau \le \tau_{\max}
\end{aligned}
$$

* **Hard Real-Time Linux (`PREEMPT_RT`) Checklist:**
  1. Boot parameters: `isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 irqaffinity=0,1 processor.max_cstate=1`.
  2. Call `mlockall(MCL_CURRENT | MCL_FUTURE)` and pin the $1\text{ kHz}$ control thread to isolated core 2 with `SCHED_FIFO` priority `80`.
  3. Bridge `ros2_control` to DDS via lock-free `realtime_tools::RealtimeBuffer<T>` or `iceoryx` zero-copy shared memory.

- **Curated Free Resources:**
  - 🔗 [ETH Zurich Robotic Systems Lab (Marco Hutter): Quadrupedal Locomotion & Whole-Body Control Lecture Notes](https://rsl.ethz.ch/education-students/lectures/robot-dynamics.html) — *Industry-standard derivations of floating-base dynamics, friction pyramids, and hierarchical WBC-QP.*
  - 🔗 [Linux Foundation Real-Time Linux Wiki: Configuring `PREEMPT_RT`, `mlockall`, and `cyclictest`](https://wiki.linuxfoundation.org/realtime/start) — *Production guide to eliminating page faults, CPU C-state wake latency, and scheduler jitter on Linux.*
- **🧪 Hands-On Exercise:**
  - *Task:* Open **Tab 5: URDF / MuJoCo & STO** in the interactive workbench, select the **3-DOF QDD Hopping Leg (`Capstone 4`)**, and inspect how stance phase enforces the unilateral friction cone $\sqrt{f_x^2 + f_y^2} \le \mu f_z$ ($f_z \ge 0$) before transitioning smoothly to flight-phase Raibert foot placement.
  - *📚 What to Learn & Resource Links for This Exercise:* Study linearized pyramid friction-cone constraints ($f_z \ge f_{z,\min}, |f_x| \le \mu f_z, |f_y| \le \mu f_z$) in [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) (`## 3. Formalization` Item 2 & `## 4. Worked example`).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** In the floating-base equation of motion $M(q)\dot{v} + h(q,v) = S^\top \tau + J_c(q)^\top f_c$, why are the first 6 rows of $S^\top \tau$ identically zero?
  * **Answer / Explanation:** Because the robot's 6-DOF torso/pelvis in space has no giant skyhook motor attached to the room! The top 6 rows of $M(q)\dot{v} + h(q,v) = J_{c,\text{base}}^\top f_c$ are the **Newton-Euler centroidal dynamics** of the floating base, proving that the robot can only accelerate its Center of Mass or angular momentum via external contact forces $f_c$.

  **Q2:** Why is calling `mlockall(MCL_CURRENT | MCL_FUTURE)` mandatory at the start of a $1\text{ kHz}$ `PREEMPT_RT` Linux control process?
  * **Answer & Explanation:** Without `mlockall`, the Linux virtual memory manager can swap pages out or lazily allocate physical pages on first touch—triggering a major/minor **page fault** that stalls your $1\text{ kHz}$ `SCHED_FIFO` thread for milliseconds while waiting on NVMe disk I/O or kernel page tables!
  </details>

### 4.4 Hardware-Synchronized VIO & Manifold IMU Preintegration
- **Core Summary:** High-rate IMUs ($400\text{–}1000\text{ Hz}$) run $10\text{–}30\times$ faster than camera keyframes ($30\text{ Hz}$). **Forster's Manifold IMU Preintegration** integrates relative motion $(\Delta R_{ij}, \Delta v_{ij}, \Delta p_{ij})$ between keyframes in the local body frame and uses a first-order Lie-algebra Jacobian $\exp\left(\frac{\partial \Delta\tilde{R}\kern0pt_{ij}}{\partial b_g}(b_g^+ - \bar{b}\kern0pt_g)\right)$ so factor-graph optimizers (`GTSAM`/`iSAM2`) can update gyro/accel biases across past keyframes without ever re-integrating raw $1\text{ kHz}$ IMU packets.

$$
\Delta R_{ij}(b_g^+) \approx \Delta\tilde{R}_{ij} \exp\left(\frac{\partial \Delta\tilde{R}_{ij}}{\partial b_g} (b_g^+ - \bar{b}_g)\right)
$$

- **Curated Free Resources:**
  - 🔗 [Christian Forster, Luca Carlone, Frank Dellaert, Davide Scaramuzza (IEEE TRO): On-Manifold Preintegration for Real-Time Visual-Inertial Odometry (PDF)](https://rpg.ifi.uzh.ch/docs/TRO16_forster.pdf) — *The landmark paper behind modern VIO/SLAM (`GTSAM`, `VINS-Mono`, `ORB-SLAM3`).*
  - 🔗 [Frank Dellaert: Factor Graphs for Robot Perception (`GTSAM` Monograph)](https://gtsam.org/tutorials/intro.html) — *Interactive tutorial on factor graphs, `iSAM2` incremental smoothing, and manifold optimization.*
  - 🔗 [Thrun, Burgard & Fox: Probabilistic Robotics & Timothy D. Barfoot: State Estimation for Robotics (Free PDF)](http://asrl.utias.utoronto.ca/~tdb/bib/barfoot_ser17.pdf) — *Complete Bayesian filtering and matrix Lie group* $SE(3)$ *estimation references.*
- **🧪 Hands-On Exercise:**
  - *Task:* Calculate how many raw IMU samples would have to be re-integrated on every $30\text{ Hz}$ camera frame across a 5-second sliding window of 150 keyframes at $1\text{ kHz}$ if Forster's first-order bias Jacobian correction were not used ($5000$ integrations per frame vs. $1$ matrix multiply per keyframe!).
  - *📚 What to Learn & Resource Links for This Exercise:* Study $SO(3)$ exponential map $\operatorname{Exp}(\phi)$ in Foundations [`00-foundations.T3.00a`](../modules/00-foundations.T3.00a.md) and Forster's first-order IMU preintegration bias Jacobian update $\Delta\tilde{R}_{ij}(\bar{b}_g + \delta b_g) \approx \Delta\tilde{R}_{ij}(\bar{b}_g)\operatorname{Exp}(J_{\Delta R}^{b_g}\delta b_g)$ in [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) (`## 3. Formalization` Item 3), plus [Forster et al. (IEEE TRO 2017, `arXiv:1512.02363`)](https://arxiv.org/abs/1512.02363).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why must stereo cameras used in dynamic legged/aerial VIO use **Global-Shutter** CMOS sensors hardware-triggered via an `FSYNC` wire from the IMU clock instead of Rolling-Shutter webcams?
  * **Answer / Explanation:** A rolling-shutter sensor exposes each row of pixels sequentially over $10\text{–}15\text{ ms}$. On a vibrating drone or trotting quadruped, the camera rotates significantly between the top row and bottom row of the image ("jello skew"), violating the single-timestamp pinhole projection geometry and causing VIO to diverge!

  **Q2:** Why can't you simply preintegrate IMU measurements in the global World frame $W$ between keyframe $i$ and keyframe $j$?
  * **Answer & Explanation:** Because the gravity vector $g^W$ in the body frame depends on the keyframe's initial world orientation $R_{WB_i}$! If the optimizer adjusts $R_{WB_i}$, a World-frame integral becomes invalid. Preintegrating in the local frame $B_i$ isolates $R_{WB_i}$ outside the integral so $(\Delta R_{ij}, \Delta v_{ij}, \Delta p_{ij})$ depend only on the local biases $(b_g, b_a)$.
  </details>

### 4.5 Embodied AI: Visuomotor Imitation Learning (`ACT`, `Diffusion Policy`, `LeRobot`) & `VLA` Models
- **Core Summary:** Contact-rich manipulation tasks with deformable objects (folding cloth, cable routing, bimanual food prep) defy hand-coded state machines. **Action Chunking with Transformers (`ACT`)** and **Visuomotor Diffusion Policies** predict smooth $k$-step future target trajectory chunks $\mathbf{A}\kern0pt_t = [\hat{q}\kern0pt_{t+1}, \dots, \hat{q}\kern0pt_{t+k}]$ at $30\text{–}50\text{ Hz}$ from wrist/overhead RGB cameras and joint proprioception, which are then tracked at $1\text{ kHz}$ by the underlying low-level impedance/FOC controller.
- **Curated Free Resources:**
  - 🔗 [Hugging Face `LeRobot` Open-Source PyTorch Robotics Library (github.com/huggingface/lerobot)](https://github.com/huggingface/lerobot) — *End-to-end teleoperation, dataset collection, and training for `ACT`, `Diffusion Policy`, and `SmolVLA` on low-cost `SO-101` and `ALOHA` hardware.*
  - 🔗 [Capuano et al. (2025 Tutorial): Robot Learning — A Tutorial (arXiv:2510.12403)](https://arxiv.org/abs/2510.12403) — *Comprehensive modern walkthrough of behavioral cloning, action chunking, diffusion policies, and Vision-Language-Action (`VLA`) models.*
  - 🔗 [Chi et al. (RSS / IJRR): Diffusion Policy — Visuomotor Policy Learning via Action Diffusion](https://diffusion-policy.cs.columbia.edu/) & [Zhao et al. (RSS): ACT / ALOHA Bimanual Manipulation](https://tonyzhaozh.github.io/aloha/) — *Seminal papers solving multimodal demonstration distributions and compounding behavioral-cloning covariate shift.*
  - 🔗 [OpenVLA (`openvla.github.io`) & Physical Intelligence `openpi` (π₀ Flow-Matching VLA)](https://github.com/Physical-Intelligence/openpi) — *Open-weight Vision-Language-Action foundation models fine-tunable via LoRA for generalist manipulation.*
- **🧪 Hands-On Exercise:**
  - *Task:* Implement **Temporal Ensembling** in Python for an Action Chunking policy that outputs a $k = 10$-step trajectory prediction $\hat{q}\kern0pt_{t \to t+10}$ at every $20\text{ ms}$ camera frame: maintain a sliding buffer of overlapping predictions for the current timestep $t$ and compute the exponentially weighted average $q_{\text{cmd}}(t) = \frac{\sum_i \exp(-m \cdot i) \hat{q}\kern0pt_t^{(t-i)}}{\sum_i \exp(-m \cdot i)}$ ($m = 0.01$) so chunk boundaries never cause torque discontinuities!
  - *📚 What to Learn & Resource Links for This Exercise:* Study ACT exponential temporal ensembling, DDIM denoising steps, and Sim-to-Real domain randomization in [`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) (`## 3. Formalization` Items 1–3 & `## 4. Worked example`), plus [Zhao et al. *Learning Fine-Grained Bimanual Manipulation (ACT)* (`arXiv:2304.13705`)](https://arxiv.org/abs/2304.13705) and [HuggingFace LeRobot (`github.com/huggingface/lerobot`)](https://github.com/huggingface/lerobot).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why does naive single-step Behavioral Cloning $\pi(o_t) \to \hat{a}\kern0pt_t$ fail when an obstacle can be avoided equally well by going *left* OR going *right* in human demonstrations?
  * **Answer / Explanation:** A standard MSE regression loss averages the multimodal "go left" ($-1$) and "go right" ($+1$) demonstrations into $\hat{a}\kern0pt_t = 0$ ("drive straight into the obstacle")! **Diffusion Policy** (score-based Langevin denoising) and **CVAE Action Chunking (`ACT`)** model the full multimodal conditional distribution $p(\mathbf{A}\kern0pt_t \mid o_t)$ so the policy commits cleanly to one valid mode.

  **Q2:** Why must a $30\text{ Hz}$ VLA or Diffusion Policy output **desired joint/Cartesian impedance targets** $(q_d, \dot{q}\kern0pt_d)$ into a $1\text{ kHz}$ low-level PD/FOC loop rather than raw $30\text{ Hz}$ motor currents?
  * **Answer & Explanation:** A $30\text{ Hz}$ ($33.3\text{ ms}$ period) neural network inference loop is far too slow to damp mechanical resonances or maintain passivity during rigid contact ($\omega_c < \frac{\phi_m}{\tau_{\text{delay}}}$ caps stability at $< 4\text{ Hz}$!). Outputting smooth action chunks $(q_d(t), K_p, K_d)$ evaluated inside a $1\text{–}40\text{ kHz}$ real-time impedance/FOC loop combines high-level semantic intelligence with sub-millisecond physical stability.
  </details>

---

## 5. Failure Modes, Pitfalls & Anti-Patterns

1. **Rolling-Shutter Cameras in High-Vibration VIO:** Always specify Global-Shutter CMOS sensors (`OV9281`, `IMX296`) hardware-triggered via `FSYNC` from the IMU clock.
2. **Exciting Structural Modes with Step/Trapezoidal Velocity Profiles:** Always bound jerk ($\lvert\dddot{q}\rvert \le j_{\max}$) using 3rd-order S-curves (`Ruckig`).
3. **Kinematic Singularities in Inverse Differential Kinematics:** Monitor manipulability $w(q) = \sqrt{\det(JJ^\top)}$ and smoothly ramp damping $\lambda^2(w)$ when $w < w_{\text{thresh}}$.

---

## 6. Tier 3 Production Lab & Milestone Gate (`Lab 06`)

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **`ros2_control` Update Loop Determinism** | $p99.99$ loop period jitter $< 50\ \mu\text{s}$ at $1\text{ kHz}$; `0` page faults after init | `mlockall` + `cyclictest` / `getrusage` verification |
| **Free-Space Cartesian Tracking Error** | RMS position error $< 1.5\text{ mm}$ at $1.0\text{ m/s}$ peak speed with bounded jerk $\lvert\dddot{x}\rvert \le 20\text{ m/s}^3$ | Online `Ruckig` S-curve trajectory generator |
| **Unplanned Rigid Contact Force Overshoot** | Peak contact force overshoot $< 15\%$ above steady-state $K_x \Delta x$ at $0.3\text{ m/s}$ impact | Operational-Space Impedance wall-contact test |
| **Null-Space Decoupling Accuracy** | End-effector perturbation $< 0.2\text{ mm}$ during $\pm 0.5\text{ rad}$ null-space elbow motion | Dynamically consistent projector $N^\top = I - J^\top \bar{J}^\top$ check |

---

## 7. Track 06 Bridge Modules & Fast-Track Skip/Gate Tests (`modules/`)

- **Tier 1 (Cubic/Quintic Boundary Polynomials & Gravity Feedforward → Step 1.7):** [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md) *(Ladder Gate Test)*
- **Tier 2 (ROS 2 Graph, Executors, QoS, TF2, URDF, `ros2_control`, Launch, `rosbag2` MCAP & Gazebo/MuJoCo Sim Bridge → Step 2.7):** [`06-robotics.T2.06a`](../modules/06-robotics.T2.06a.md) · [`06-robotics.T2.06b`](../modules/06-robotics.T2.06b.md) *(Ladder Gate Test)*
- **Tier 3 (Behavior Cloning, ACT/Diffusion Policies, PPO RL & Sim-to-Real → Step 3.7):** [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) · [`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) *(Ladder Gate Test)*

