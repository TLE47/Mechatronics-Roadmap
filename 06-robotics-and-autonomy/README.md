# Track 06: Robotics, Whole-Body Control, Perception & Autonomous Systems

> **Prerequisites:** [Track 02: Mechanics, Kinematics & Dynamics](../02-mechanics-kinematics-dynamics/README.md), [Track 04: Embedded & Real-Time](../04-embedded-and-realtime/README.md), [Track 05: Control & Estimation](../05-control-and-estimation/README.md)  
> **Feeds Into:** [Track 07: Systems, HIL & Production](../07-systems-hil-and-production/README.md), [Track 08: Capstone Projects](../08-capstone-projects/README.md)  
> **Core Principle:** High-level autonomy (SLAM, motion planning, task policies) is only as reliable as the real-time bridge connecting it to physical joint torques and contact forces. Modern robotic systems replace rigid trajectory replay with **Operational-Space Impedance Control, Hierarchical Whole-Body Quadratic Programming (WBC-QP), and Factor-Graph State Estimation**.

---

## 1. Module Overview & System Context

Classical industrial robots operating inside safety cages execute pre-taught joint position trajectories with high-ratio gearboxes ($N > 100$) that are stiff and blind to external contact. Modern mechatronic and robotic systems—collaborative manipulators, surgical robots, quadrupeds, humanoids, and autonomous mobile manipulators—must interact compliantly with uncertain environments, fuse asynchronous cameras/lidars/IMUs/encoders in real time, and replan collision-free trajectories online.

This track bridges high-rate joint control with system-level robotic autonomy:
1. **Real-Time Middleware & System Architecture:** `PREEMPT_RT` Linux kernel tuning, `ros2_control` hardware interfaces, DDS QoS determinism, and zero-copy shared-memory IPC (`iceoryx2` / `Zenoh`).
2. **Operational-Space Impedance & Whole-Body Control (WBC):** Khatib's Operational Space formulation, Hogan's Mechanical Impedance Control, hierarchical null-space projection, and Contact-Consistent Whole-Body QP with friction cones.
3. **Multi-Sensor Spatial Perception & Factor-Graph SLAM:** Camera/Lidar-IMU extrinsic calibration (`Kalibr`), IMU preintegration on manifolds (Forster et al.), Visual-Inertial Odometry (VIO), and `GTSAM` factor graphs.
4. **Kinodynamic Motion Planning & Trajectory Generation:** Sampling-based (`RRT*`, `BIT*`), optimization-based (`CHOMP`, `TrajOpt`, `GCOPTER`), and time-optimal jerk-bounded spline generation (`TOPP-RA`, `Ruckig`).
5. **Sim-to-Real Transfer & System Identification:** Least-squares base inertial parameter identification, domain randomization, and actuator neural/physics hybrid modeling.

---

## 2. Full-Stack Autonomous Robotic Software & Hardware Architecture

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

---

## 3. Operational-Space Impedance & Whole-Body Control (WBC)

### 3.1 Hogan's Impedance Control vs. Stiff Position Control
When a stiff position-controlled robot contacts a rigid surface at position $x_{\text{env}}$ with environment stiffness $k_{\text{env}} \approx 10^5\text{ N/m}$, a tiny $1\text{ mm}$ position trajectory error generates $100\text{ N}$ of contact force and triggers an emergency fault. **Mechanical Impedance Control** regulates the *dynamic relationship* between end-effector pose error $\tilde{x} = x - x_d$ and interaction wrench $\mathcal{F}_{\text{ext}}$:

$$\Lambda(q)\ddot{\tilde{x}} + D_x \dot{\tilde{x}} + K_x \tilde{x} = \mathcal{F}_{\text{ext}}$$

where $\Lambda(q) = \left(J(q) M^{-1}(q) J(q)^\top\right)^{-1}$ is **Khatib's Operational-Space Inertia Matrix** (the effective mass/inertia felt at the end-effector tip).
* **Cartesian Impedance Control Law (Without Force Sensor Requirement):**
  For backdrivable or torque-controlled joints, shaping desired stiffness $K_x \in \mathbb{R}^{6\times 6}$ and damping $D_x \in \mathbb{R}^{6\times 6}$ requires only the manipulator Jacobian $J(q)$ and gravity compensation $g(q)$:
  $$\tau = J(q)^\top \Big(-K_x \tilde{x} - D_x J(q)\dot{q}\Big) + g(q) + \underbrace{\left(I - J(q)^\top \bar{J}(q)^\top\right) \tau_{\text{null}}}_{\text{Redundant Null-Space Posture Torque}}$$
  where $\bar{J}(q) = M^{-1}(q) J(q)^\top \Lambda(q)$ is the **dynamically consistent generalized inverse** of $J(q)$, guaranteeing that null-space torques $\tau_{\text{null}}$ produce **zero acceleration at the end-effector**!

### 3.2 Floating-Base Whole-Body Control via Quadratic Programming (WBC-QP)
For a floating-base system (quadruped, humanoid, or mobile manipulator) with configuration $q = [p_b^\top, q_b^\top, q_j^\top]^\top$ and generalized velocity $v = [\mathcal{V}_b^\top, \dot{q}_j^\top]^\top \in \mathbb{R}^{6+n_j}$, the equations of motion split into 6 unactuated floating-base rows and $n_j$ actuated joint rows via selection matrix $S = [0_{n_j \times 6},\ I_{n_j \times n_j}]$:

$$M(q)\dot{v} + h(q,v) = S^\top \tau + J_c(q)^\top f_c$$

At $1\text{ kHz}$, the Whole-Body Controller solves a convex QP over decision variables $\xi = [\dot{v}^\top, f_c^\top, \tau^\top]^\top$:

$$\begin{aligned}
\min_{\dot{v}, f_c, \tau} \quad & \sum_{k} w_k \left\| J_k(q)\dot{v} + \dot{J}_k(q,v)v - \ddot{x}_{k,\text{des}} \right\|_2^2 + \|f_c\|_{W_f}^2 + \|\tau\|_{W_\tau}^2 \\
\text{subject to} \quad & M(q)\dot{v} + h(q,v) = S^\top \tau + J_c(q)^\top f_c \quad \text{(Full Rigid-Body Dynamics)} \\
& J_{\text{stance}}(q)\dot{v} + \dot{J}_{\text{stance}}(q,v)v = 0 \quad \text{(Zero Stance Foot Slip)} \\
& |f_{c,x}| \le \mu f_{c,z},\quad |f_{c,y}| \le \mu f_{c,z},\quad f_{c,z} \ge f_{z,\min} > 0 \quad \text{(Linearized Pyramid Friction Cone)} \\
& \tau_{\min} \le \tau \le \tau_{\max} \quad \text{(Actuator Torque-Speed Envelope)}
\end{aligned}$$

### 3.3 Distributed PD+Feedforward Impedance Split Across Fieldbus
Never close a $1\text{ kHz}$ position/velocity PD loop exclusively over a CAN or Ethernet bus if the actuator node itself has a local high-rate encoder! Bus delay ($\tau_{\text{bus}} = 0.5\text{–}1.5\text{ ms}$) severely limits the stable $K_p, K_d$ gains. Instead, transmit the **5-tuple command packet** `(q_des, dq_des, kp, kd, tau_ff)` from the central computer at $1\text{ kHz}$ (where $\tau_{ff}$ comes from the WBC-QP), and evaluate the local PD impedance term inside the actuator's $25\text{–}40\text{ kHz}$ MCU loop:
$$\tau_{\text{cmd}}(t) = \tau_{ff} + K_p (q_{\text{des}} - q_{\text{local}}) + K_d (\dot{q}_{\text{des}} - \dot{q}_{\text{local}})$$

---

## 4. Real-Time Linux (`PREEMPT_RT`) & ROS 2 Determinism

Standard Ubuntu/Linux kernels and default ROS 2 configurations are **not** real-time safe (page faults, CPU frequency scaling, kernel RCU callbacks, and DDS dynamic heap allocations cause $5\text{–}50\text{ ms}$ latency spikes). To achieve $< 50\ \mu\text{s}$ worst-case wakeup latency on `x86_64` or `ARM64`:

1. **Kernel & Boot Parameters:** Run a `PREEMPT_RT` patched kernel with boot flags `isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 irqaffinity=0,1 idle=poll processor.max_cstate=1`.
2. **Process Memory Locking & Scheduling:** Inside the real-time control process startup:
   * Call `mlockall(MCL_CURRENT | MCL_FUTURE)` so no page fault ever touches swap/disk.
   * Pre-fault stack memory (`memset` a stack array before entering the loop).
   * Pin the control thread to isolated core 2 (`pthread_setaffinity_np`) with `SCHED_FIFO` priority `80`.
3. **Zero-Copy ROS 2 / `ros2_control` Rules:**
   * All `controller_interface::ControllerInterface::update(const rclcpp::Time&, const rclcpp::Duration&)` methods must execute with **zero dynamic memory allocation**, zero blocking mutexes (`std::mutex::lock`), and zero `RCLCPP_INFO` console prints.
   * Use `realtime_tools::RealtimeBuffer<T>` and `RealtimePublisher<T>` to bridge the `SCHED_FIFO` `ros2_control` loop to non-real-time DDS topics, or enable **Loaned Messages (`publish_loaned_message`)** over `iceoryx` shared memory.

---

## 5. Multi-Sensor Calibration, VIO & Factor-Graph State Estimation

### 5.1 Hardware Time Synchronization & Extrinsic Calibration
Fusing a $60\text{ Hz}$ camera or $20\text{ Hz}$ lidar with a $400\text{ Hz}$ IMU fails if timestamps are assigned when USB/Ethernet packets arrive in user space ($2\text{–}15\text{ ms}$ variable OS jitter).
* **Hardware Sync:** Drive the camera's hardware exposure trigger pin (`FSYNC`) directly from the IMU's data-ready divider or a shared MCU hardware timer so every image exposure midpoint $t_{\text{cam}}$ is stamped on the same crystal clock as the IMU samples.
* **Spatiotemporal Calibration (`Kalibr`):** Jointly estimate the $SE(3)$ extrinsic transform $T_{\text{cam\_imu}}$, camera intrinsics, and residual hardware trigger time offset $t_d$ by exciting all 6 rotational/translational axes in front of an AprilGrid target.

### 5.2 IMU Preintegration on Manifolds & Factor Graphs
Instead of re-integrating thousands of $1\text{ kHz}$ IMU measurements every time a non-linear solver updates past keyframe poses $x_i, x_j$, **Forster's Manifold Preintegration** accumulates relative motion increments $(\Delta\tilde{R}_{ij}, \Delta\tilde{v}_{ij}, \Delta\tilde{p}_{ij})$ between keyframes *in the local frame $i$*, complete with first-order Jacobians with respect to IMU biases $\left(\frac{\partial \Delta R_{ij}}{\partial b_g}, \frac{\partial \Delta v_{ij}}{\partial b_a}, \dots\right)$ so bias updates require only a fast tangent-space correction:
$$\Delta R_{ij}(b_g^+) \approx \Delta\tilde{R}_{ij} \exp\left(\frac{\partial \Delta\tilde{R}_{ij}}{\partial b_g} (b_g^+ - \bar{b}_g)\right)$$

---

## 6. Failure Modes, Pitfalls & Anti-Patterns

1. **Rolling-Shutter Cameras in High-Vibration Robotic VIO:** Cheap rolling-shutter CMOS sensors expose scanlines sequentially over $10\text{–}30\text{ ms}$. Under angular vibration or agile motion, straight lines bend ("jello effect"), causing catastrophic VIO scale drift and divergence. **Always specify Global-Shutter monochrome/RGB sensors** (e.g., `OV9281`, `IMX296`) with hardware trigger pins for robotics.
2. **Exciting Structural Modes with Step/Trapezoidal Velocity Profiles:** Trapezoidal velocity profiles have discontinuous acceleration (infinite jerk $\dddot{q} = \pm\infty$), acting as a broadband hammer blow that excites every structural flex mode in the robot arm. Always filter trajectories through a **3rd-order (S-curve, bounded jerk)** or **4th-order (bounded snap)** profile generator (`Ruckig`).
3. **Kinematic Singularities in Task-Space Inverse Differential Kinematics:** Near wrist alignment ($q_5 \to 0$) or elbow full extension, $\det(J(q)J(q)^\top) \to 0$ and standard $J^\dagger = J^\top(JJ^\top)^{-1}$ commands infinite joint velocities. Always monitor the manipulability index $w(q) = \sqrt{\det(JJ^\top)}$ and smoothly ramp damping $\lambda^2(w)$ in Damped Least-Squares:
   $$\lambda^2(w) = \begin{cases} \lambda_0^2 \left(1 - \frac{w}{w_{\text{thresh}}}\right)^2 & w < w_{\text{thresh}} \\ 0 & w \ge w_{\text{thresh}} \end{cases}$$

---

## 7. Curated Learning Resources

### Authoritative Textbooks & Seminal Papers
* **Siciliano, B., Sciavicco, L., Villani, L., & Oriolo, G.** — *Robotics: Modelling, Planning and Control* (Springer, 2009). Comprehensive coverage of kinematics, Jacobians, operational-space control, and force control.
* **LaValle, S. M.** — *Planning Algorithms* (Cambridge University Press, 2006; free online at `lavalle.pl/planning`). Configuration spaces, `PRM`, `RRT`, kinodynamic planning, and feedback motion planning.
* **Khatib, O.** — *"A Unified Approach for Motion and Force Control of Robot Manipulators: The Operational Space Formulation"* (*IEEE J. Robotics and Automation*, 1987).
* **Hogan, N.** — *"Impedance Control: An Approach to Manipulation (Parts I–III)"* (*ASME J. Dynamic Systems, Measurement, and Control*, 1985).
* **Forster, C., Carlone, L., Dellaert, F., & Scaramuzza, D.** — *"On-Manifold Preintegration for Real-Time Visual-Inertial Odometry"* (*IEEE T-RO*, 2017).
* **Wensing, P. M., et al.** — *"Optimization-Based Control for Dynamic Legged Robots"* (*IEEE T-RO*, 2024).

### Open-Source Frameworks & Toolchains
* **ROS 2 (`Jazzy` / `Kilted`) + `ros2_control` + `MoveIt 2`** — Industry standard robotics middleware, real-time controller manager, and manipulation planning framework.
* **Pinocchio + Crocoddyl / Aligator** — Fast rigid-body dynamics, analytical derivatives, and contact-implicit Differential Dynamic Programming (DDP) / MPC.
* **GTSAM (`C++` / Python) & OpenVINS / VINS-Fusion** — Factor-graph optimization, `iSAM2` incremental smoothing, and Visual-Inertial Odometry.
* **Ruckig (`C++` / Python) & TOPP-RA** — Microsecond-fast online time-optimal jerk-constrained trajectory generation from arbitrary initial states.
* **MuJoCo, Drake (`MIT/TRI`), & Isaac Lab** — High-fidelity contact simulation and Sim-to-Real policy/controller validation.

---

## 8. Hands-On Lab & Milestone Gate

### Lab 06: Operational-Space Impedance Control, `Ruckig` Jerk-Bounded Planning & Factor-Graph Odometry

1. **Objective:** Implement a $1\text{ kHz}$ Operational-Space Cartesian Impedance Controller with null-space posture regulation on a redundant manipulator in MuJoCo/Drake (and `ros2_control`), paired with online `Ruckig` jerk-bounded trajectory generation and compliant contact interaction.
2. **Tasks:**
   * Configure a `ros2_control` `ControllerInterface` plugin in C++20 using `Pinocchio` to compute $M(q), h(q,\dot{q}), J(q), \Lambda(q)$ and dynamically consistent null-space projector $N(q) = I - J^\top \bar{J}^\top$.
   * Drive the end-effector along a 3D trajectory generated online by `Ruckig` while an unexpected rigid wall intersects the path; verify smooth transitions from free-space tracking to compliant force regulation without force spikes.
   * Run `cyclictest` alongside your `ros2_control` loop to verify zero heap allocations and bounded real-time wakeup jitter.
3. **Quantitative Acceptance Criteria:**

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **`ros2_control` Update Loop Determinism** | $p99.99$ loop period jitter $< 50\ \mu\text{s}$ at $1\text{ kHz}$ (`1000 μs` nominal); `0` page faults after init | `getrusage(RUSAGE_THREAD)` `ru_majflt`/`ru_minflt` check + latency histogram |
| **Free-Space Cartesian Tracking Error** | RMS position error $< 1.5\text{ mm}$ at $1.0\text{ m/s}$ peak speed with bounded jerk $\lvert\dddot{x}\rvert \le 20\text{ m/s}^3$ | Closed-loop trajectory log in MuJoCo/Drake |
| **Unplanned Rigid Contact Force Overshoot** | Peak contact force overshoot $< 15\%$ above steady-state impedance force $K_x \Delta x_{\text{penetration}}$ at $0.3\text{ m/s}$ impact | Simulated & bench force-plate collision test |
| **Null-Space Decoupling Accuracy** | End-effector perturbation $< 0.2\text{ mm}$ during $\pm 0.5\text{ rad}$ null-space elbow posture reconfiguration | Dynamic consistency verification test |
