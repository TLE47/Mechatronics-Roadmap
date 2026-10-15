# MechaLab Complete Curriculum Syllabus (~8 hrs/week Study Plan)

> **Target Audience:** Absolute beginners (assumes only basic computer literacy, arithmetic, and English reading; programming, algebra, trigonometry, SI units, and physics are taught from scratch or tested out via Skip/Gate Tests).  
> **Study Pace:** `~8.0 hours/week`  
> **Graduate Goal:** Build and tune a custom multi-DOF robot arm with `ROS 2` (`ros2_control`), deploy a learned visuomotor/RL policy (`LeRobot` / `ACT` / `PPO`) wrapped in a real-time Control Barrier Function (`CBF`) & impedance safety shield, and explain how it integrates into an Industry 4.0 / `IEC 63278` Asset Administration Shell (`AAS`) and `ISO 13849-1 PLd` dual-channel `STO` architecture.

---

## 1. Curriculum Summary & Total Hours by Pass

| Curriculum Phase | Bridge Modules (`modules/`) | Legacy Steps (`README.md` & Tracks `00`–`08`) | Bridge Hours | Legacy Step Hours | Total Phase Hours | Weeks @ `8 hrs/wk` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Pass 1 — Tier 1 (Beginner / Breakout Pass, incl. Level -1 & Stage 0)** | 16 | 8 (`1.1`–`1.8`) + Stage 0 (`L0.1`–`L0.3`) | `53.0 h` | `40.5 h` | `93.5 h` | **Weeks 1–12** (`12 wks`) |
| **Pass 2 — Tier 2 (Intermediate / Applied Custom Engineering Pass)** | 14 | 8 (`2.1`–`2.8`) | `61.5 h` | `44.5 h` | `106.0 h` | **Weeks 13–25** (`13 wks`) |
| **Pass 3 — Tier 3 (Advanced / Production & Embodied AI Pass)** | 10 | 8 (`3.1`–`3.8`) | `49.0 h` | `54.5 h` | `103.5 h` | **Weeks 26–38** (`13 wks`) |
| **Total (64 Modules: 40 Bridge + 24 Legacy)** | **40** | **24** | **`163.5 h`** | **`139.5 h`** | **`303.0 h`** | **38 Weeks (~9 Months)** |

---

## 2. Fast-Track Personas (Using Skip Tests & Ladder Gate Tests)

Every bridge module includes a **Module Skip Test** (`§7 Checkpoint -> ### Skip test`), and every ladder-final bridge module includes an 8-question **Ladder Gate Test** (`§7 Checkpoint -> ### Gate test`). Passing a Ladder Gate Test ($\ge 80\%$ overall, $100\%$ on `[SAFETY]` questions after reading `## Safety notes`) lets you bypass the preceding bridge modules in that ladder:

| Learner Background | Ladders to Test Out Via Gate Tests | Bridge Hours Saved | Adjusted Time @ `8 hrs/wk` |
| :--- | :--- | :---: | :---: |
| **Absolute Beginner** (No prior coding, math beyond arithmetic, or electronics) | Complete all 40 bridge modules + 24 legacy steps in sequence | `0.0 h` | **38 Weeks (`303.0 h`)** |
| **Software / CS Engineer** (Fluent in Python, C, Git, linear algebra, and ROS 2 basics) | Gate-test out of `00-foundations.T1.00a`–`00d`, `04-embedded.T1.04a`, `00-foundations.T2.00a`–`00b`, `06-robotics.T2.06a`, `04-embedded.T3.04a`, `06-robotics.T3.06a` | `37.0 h` | **33 Weeks (`266.0 h`)** |
| **Electrical / Embedded Engineer** (Fluent in KVL/KCL, op-amps, KiCad, C ISRs, SPI/DMA, RTOS) | Gate-test out of `01-electronics.T1.01a`–`01b`, `04-embedded.T1.04a`–`04b`, `01-electronics.T2.01a`–`01b`, `04-embedded.T2.04a`–`04b`, `01-electronics.T3.01a`, `04-embedded.T3.04a` | `46.0 h` | **32 Weeks (`257.0 h`)** |
| **Mechanical / Controls Engineer** (Fluent in FBDs, $SE(3)$, Jacobians, ODEs, Laplace/Bode, PID/LQR) | Gate-test out of `00-foundations.T1.00c`–`00e`, `02-mechanics.T1.02a`, `05-control.T1.05a`, `00-foundations.T2.00a`–`00e`, `02-mechanics.T2.02a`, `05-control.T2.05a`, `02-mechanics.T3.02a`, `05-control.T3.05a` | `55.5 h` | **31 Weeks (`247.5 h`)** |

---

## 3. Master Week-by-Week Schedule (64 Modules in Topological Order)

### Pass 1 — Tier 1: Beginner / Intuitive Pass (Weeks 1–12, `93.5 hrs`)

| Week | Module ID & Path | Title | Type | Prereqs | Est. Hours | HW Req? | Safety |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: |
| **1** | [`00-foundations.T1.00a`](../modules/00-foundations.T1.00a.md) | Running Python, Variables, Loops, Functions & Tracebacks | Bridge | `[]` | `3.0 h` | No | `none` |
| **1** | [`00-foundations.T1.00b`](../modules/00-foundations.T1.00b.md) | Lists, Dictionaries, NumPy Arrays, Plotting & Git/Terminal Basics | Bridge | `00-foundations.T1.00a` | `3.5 h` | No | `none` |
| **1–2** | [`00-foundations.T1.00c`](../modules/00-foundations.T1.00c.md) | SI Units, Engineering Prefixes & Dimensional Analysis | Bridge | `00-foundations.T1.00b` | `3.0 h` | No | `none` |
| **2** | [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md) | Algebra, Linear Functions, Right-Triangle Trig, Radians & 2D Vectors | Bridge | `00-foundations.T1.00c` | `3.5 h` | No | `none` |
| **2–3** | [`00-foundations.T1.00e`](../modules/00-foundations.T1.00e.md) | Position, Velocity, Acceleration, Force, Mass, Energy & Torque in a Loop *(Gate)* | Bridge | `00-foundations.T1.00d` | `4.0 h` | No | `none` |
| **3** | [`Stage 0 (L0.1–L0.3)`](../README.md#stage-0-global-level-0-prerequisite-on-ramp) | Hydraulic Analogies, Breadboard/DMM/PSU Habits & Starter MCU Loops | Stage 0 | `00-foundations.T1.00e` | `4.5 h` | Sim/Opt | `low` |
| **3–4** | [`00-foundations.T1.01`](../00-foundations/README.md#tier-1-beginner--intuitive) | **Step 1.1:** Calculus as `while` Loops, 2D Rotations & RC Smoothing | Legacy | `00-foundations.T1.00e` | `4.5 h` | No | `none` |
| **4** | [`01-electronics.T1.01a`](../modules/01-electronics.T1.01a.md) | Voltage, Current, Resistance, Ohm's Law, KVL/KCL & Voltage Dividers | Bridge | `00-foundations.T1.00e` | `3.0 h` | No | `low` |
| **4–5** | [`01-electronics.T1.01c`](../modules/01-electronics.T1.01c.md) | Multimeter, Current-Limited Bench Supply, Breadboard & ESD/Short-Circuit Safety | Bridge | `01-electronics.T1.01a` | `3.0 h` | No | `high` |
| **5** | [`01-electronics.T1.01d`](../modules/01-electronics.T1.01d.md) | Capacitors, Inductors, RC Time Constants & Inductive Flyback | Bridge | `01-electronics.T1.01c` | `3.5 h` | No | `low` |
| **5–6** | [`01-electronics.T1.01b`](../modules/01-electronics.T1.01b.md) | Low-Side MOSFET Switching, PWM Duty Cycle & H-Bridge Polarity Reversal *(Gate)* | Bridge | `01-electronics.T1.01d` | `3.5 h` | No | `high` |
| **6** | [`01-electronics.T1.02`](../01-electronics-and-power/README.md#tier-1-beginner--intuitive) | **Step 1.2:** Breadboard H-Bridges (`DRV8833`), Logic Levels & Decoupling | Legacy | `00-foundations.T1.01`, `01-electronics.T1.01b` | `4.5 h` | Sim/Opt | `high` |
| **6–7** | [`02-mechanics.T1.02a`](../modules/02-mechanics.T1.02a.md) | Free-Body Diagrams, Static Torque Balance, Pulleys/Gears & Rotational Inertia *(Gate)* | Bridge | `00-foundations.T1.01` | `3.5 h` | No | `none` |
| **7** | [`02-mechanics.T1.03`](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive) | **Step 1.3:** 2D Planar Kinematics, Gear Ratios ($N^2$ Inertia) & Bearings | Legacy | `00-foundations.T1.01`, `02-mechanics.T1.02a` | `4.5 h` | No | `low` |
| **7–8** | [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md) | Electromagnets, Permanent Magnets, Pole Pairs, Quadrature Pulses & Back-EMF *(Gate)* | Bridge | `01-electronics.T1.02` | `3.0 h` | No | `low` |
| **8** | [`03-sensors.T1.04`](../03-sensors-and-actuators/README.md#tier-1-beginner--intuitive) | **Step 1.4:** Quadrature/Magnetic Encoders & Open-Loop BLDC (`SimpleFOC`) | Legacy | `01-electronics.T1.02`, `03-sensors.T1.03a` | `4.5 h` | Sim/Opt | `medium` |
| **8–9** | [`04-embedded.T1.04a`](../modules/04-embedded.T1.04a.md) | From Python to C/Arduino: Fixed-Width Types, Bitwise Masks, Structs & Pointers | Bridge | `00-foundations.T1.00b` | `3.0 h` | No | `none` |
| **9** | [`04-embedded.T1.04b`](../modules/04-embedded.T1.04b.md) | Non-Blocking `millis()`/`micros()` State Machines, Hardware ISRs & `volatile` *(Gate)* | Bridge | `04-embedded.T1.04a` | `3.0 h` | No | `low` |
| **9–10** | [`04-embedded.T1.05`](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive) | **Step 1.5:** Killing `delay()`, $1\text{ kHz}$ Timer ISRs & Binary Serial | Legacy | `01-electronics.T1.02`, `04-embedded.T1.04b` | `4.5 h` | Sim/Opt | `low` |
| **10** | [`05-control.T1.05a`](../modules/05-control.T1.05a.md) | Open-Loop vs. Closed-Loop Feedback, P/I/D Physical Roles & Saturation *(Gate)* | Bridge | `00-foundations.T1.01`, `04-embedded.T1.05` | `3.5 h` | No | `low` |
| **10–11** | [`05-control.T1.06`](../05-control-and-estimation/README.md#tier-1-beginner--intuitive) | **Step 1.6:** PID Virtual Spring-Damper, Anti-Windup & Complementary IMU | Legacy | `00-foundations.T1.01`, `04-embedded.T1.05`, `05-control.T1.05a` | `4.5 h` | Sim/Opt | `medium` |
| **11** | [`06-robotics.T1.06a`](../modules/06-robotics.T1.06a.md) | 1D Point-to-Point Motion, Boundary Conditions & Virtual Joint Spring-Damper *(Gate)* | Bridge | `02-mechanics.T1.03`, `05-control.T1.06` | `3.5 h` | No | `low` |
| **11–12** | [`06-robotics.T1.07`](../06-robotics-and-autonomy/README.md#tier-1-beginner--intuitive) | **Step 1.7:** Cubic Trajectories, Joint Springs & 10-Step Safe Bring-Up | Legacy | `02-mechanics.T1.03`, `05-control.T1.06`, `06-robotics.T1.06a` | `4.5 h` | Sim/Opt | `medium` |
| **12** | [`07-systems.T1.07a`](../modules/07-systems.T1.07a.md) | Industrial State Machines, Cyclic PLC Scan, E-Stop Chains & Sine-Sweep *(Gate)* | Bridge | `06-robotics.T1.07` | `3.5 h` | No | `high` |
| **12** | [`07-systems.T1.08`](../08-capstone-projects/README.md#tier-1-capstone-builds-beginner--breakout-pass) | **Step 1.8 (Tier 1 Boss):** Breadboard/Breakout 2-DOF Desktop Robot | Legacy | `06-robotics.T1.07`, `07-systems.T1.07a` | `4.5 h` | Sim/Opt | `high` |

---

### Pass 2 — Tier 2: Intermediate / Applied Custom Engineering Pass (Weeks 13–25, `106.0 hrs`)

| Week | Module ID & Path | Title | Type | Prereqs | Est. Hours | HW Req? | Safety |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: |
| **13** | [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md) | Limits, Derivatives as Slopes, Integrals as Area & $2\times 2 / 3\times 3$ Matrix Algebra | Bridge | `07-systems.T1.08` | `4.0 h` | No | `none` |
| **13** | [`00-foundations.T2.00b`](../modules/00-foundations.T2.00b.md) | 3D Vectors, Cross Products, Determinants, Inverses & Eigenvalues | Bridge | `00-foundations.T2.00a` | `4.0 h` | No | `none` |
| **14** | [`00-foundations.T2.00c`](../modules/00-foundations.T2.00c.md) | First- & Second-Order ODEs, $\omega_n$, $\zeta$ & Damping Regimes | Bridge | `00-foundations.T2.00b` | `4.0 h` | No | `none` |
| **14** | [`00-foundations.T2.00d`](../modules/00-foundations.T2.00d.md) | Complex Numbers, Euler's Formula, Phasors, Impedance & Bode Plots | Bridge | `00-foundations.T2.00c` | `4.0 h` | No | `none` |
| **15** | [`00-foundations.T2.00e`](../modules/00-foundations.T2.00e.md) | Laplace Transform, Poles/Zeros, State-Space $\dot{x}=Ax+Bu$ & Discretization | Bridge | `00-foundations.T2.00d` | `4.5 h` | No | `none` |
| **15** | [`00-foundations.T2.00f`](../modules/00-foundations.T2.00f.md) | Sampling, Aliasing, Nyquist, $z$-Transform, Tustin Pre-Warping & Covariance *(Gate)* | Bridge | `00-foundations.T2.00e` | `4.5 h` | No | `none` |
| **16** | [`00-foundations.T2.01`](../00-foundations/README.md#tier-2-intermediate--applied) | **Step 2.1:** State-Space Matrices, Two-Mass Resonance, Quaternions & Biquads | Legacy | `07-systems.T1.08`, `00-foundations.T2.00e`, `00-foundations.T2.00f` | `5.5 h` | No | `none` |
| **16–17** | [`01-electronics.T2.01a`](../modules/01-electronics.T2.01a.md) | Op-Amps, Differential Shunt Amplification, Common-Mode Voltage & Kelvin Sensing | Bridge | `01-electronics.T1.02`, `00-foundations.T2.01` | `4.0 h` | No | `low` |
| **17** | [`01-electronics.T2.01b`](../modules/01-electronics.T2.01b.md) | KiCad 4-Layer Stackup, Parasitic $L\frac{di}{dt}$, Bootstrap Drivers & $48\text{ V}$ Pre-Charge *(Gate)* | Bridge | `01-electronics.T2.01a` | `4.5 h` | No | `high` |
| **17–18** | [`01-electronics.T2.02`](../01-electronics-and-power/README.md#tier-2-intermediate--applied) | **Step 2.2:** 4-Layer KiCad PCBs, Bootstrap Gate Drivers & 4-Terminal Kelvin Shunts | Legacy | `01-electronics.T1.02`, `00-foundations.T2.01`, `01-electronics.T2.01b` | `5.5 h` | Sim/Opt | `high` |
| **18** | [`02-mechanics.T2.02a`](../modules/02-mechanics.T2.02a.md) | 6-DOF Rigid-Body DOF, 3D Homogeneous Transforms $SE(3)$, Jacobians & Inertia *(Gate)* | Bridge | `02-mechanics.T1.03`, `00-foundations.T2.01` | `4.5 h` | No | `none` |
| **19** | [`02-mechanics.T2.03`](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied) | **Step 2.3:** Maxwell Exact Constraint, `CadQuery` & URDF/MuJoCo Validation | Legacy | `02-mechanics.T1.03`, `00-foundations.T2.01`, `02-mechanics.T2.02a` | `5.5 h` | No | `low` |
| **19–20** | [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) | Three-Phase Stator Frames ($abc \to \alpha\beta \to dq$), PLLs & Sensor Random Walk *(Gate)* | Bridge | `01-electronics.T2.02`, `03-sensors.T1.04` | `4.5 h` | No | `low` |
| **20** | [`03-sensors.T2.04`](../03-sensors-and-actuators/README.md#tier-2-intermediate--applied) | **Step 2.4:** Clarke/Park Transforms, Type-II PLLs & Allan Variance | Legacy | `01-electronics.T2.02`, `03-sensors.T1.04`, `03-sensors.T2.03a` | `5.5 h` | Sim/Opt | `medium` |
| **21** | [`04-embedded.T2.04a`](../modules/04-embedded.T2.04a.md) | SPI/I2C Bus Transactions, DMA Ping-Pong Ring Buffers & Zero-CPU Peripherals | Bridge | `04-embedded.T1.05`, `03-sensors.T2.04` | `4.0 h` | No | `low` |
| **21–22** | [`04-embedded.T2.04b`](../modules/04-embedded.T2.04b.md) | RTOS Tasks, Priority Inversion, Rate-Monotonic Deadlines, CAN & Zephyr/micro-ROS *(Gate)* | Bridge | `04-embedded.T2.04a` | `5.0 h` | No | `low` |
| **22** | [`04-embedded.T2.05`](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied) | **Step 2.5:** FreeRTOS Scheduling (RTA), DMA Buffers & CAN-FD (`MIT Mode`) | Legacy | `04-embedded.T1.05`, `03-sensors.T2.04`, `04-embedded.T2.04b` | `5.5 h` | Sim/Opt | `medium` |
| **23** | [`05-control.T2.05a`](../modules/05-control.T2.05a.md) | Gain/Phase Margin, Sensitivity Waterbed ($S+T=1$), Luenberger Observers & Bryson LQR *(Gate)* | Bridge | `00-foundations.T2.01`, `02-mechanics.T2.03` | `4.5 h` | No | `none` |
| **23–24** | [`05-control.T2.06`](../05-control-and-estimation/README.md#tier-2-intermediate--applied) | **Step 2.6:** Bode Loop Shaping, Gang of Four, Swing-Up LQR & Linear KF | Legacy | `00-foundations.T2.01`, `02-mechanics.T2.03`, `05-control.T2.05a` | `5.5 h` | Sim/Opt | `medium` |
| **24** | [`06-robotics.T2.06a`](../modules/06-robotics.T2.06a.md) | ROS 2 Graph (Nodes, Topics, QoS, Actions, Executors), TF2, URDF & `ros2_control` *(Gate)* | Bridge | `02-mechanics.T2.03`, `04-embedded.T2.05`, `05-control.T2.06` | `5.5 h` | No | `low` |
| **24–25** | [`06-robotics.T2.07`](../06-robotics-and-autonomy/README.md#tier-2-intermediate--applied) | **Step 2.7:** Jacobian Transpose Compliance, `Ruckig` S-Curves & Regen Clamps | Legacy | `02-mechanics.T2.03`, `05-control.T2.06`, `06-robotics.T2.06a` | `5.5 h` | Sim/Opt | `high` |
| **25** | [`07-systems.T2.08`](../08-capstone-projects/README.md#tier-2-capstone-builds-intermediate--applied-pass) | **Step 2.8 (Tier 2 Boss):** Custom 4-Layer CAN Servo + LQR/MuJoCo Twin | Legacy | `01-electronics.T2.02`, `04-embedded.T2.05`, `06-robotics.T2.07` | `6.0 h` | Sim/Opt | `high` |

---

### Pass 3 — Tier 3: Advanced / Production & Embodied AI Pass (Weeks 26–38, `103.5 hrs`)

| Week | Module ID & Path | Title | Type | Prereqs | Est. Hours | HW Req? | Safety |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: |
| **26** | [`00-foundations.T3.00a`](../modules/00-foundations.T3.00a.md) | Skew-Symmetric Hat Map $[\omega]_\times$, Matrix Exponential $e^{At}$, Rodrigues & Energy *(Gate)* | Bridge | `07-systems.T2.08` | `5.0 h` | No | `none` |
| **26–27** | [`00-foundations.T3.01`](../00-foundations/README.md#tier-3-advanced--production) | **Step 3.1:** Lie Groups $SO(3)/SE(3)$, Van Loan ZOH & Port-Hamiltonian Energy | Legacy | `07-systems.T2.08`, `00-foundations.T3.00a` | `6.5 h` | No | `none` |
| **27–28** | [`01-electronics.T3.01a`](../modules/01-electronics.T3.01a.md) | 6-Layer `<2 nH` Stackup, Bessel Linear-Phase AFE, SAR Charge Buckets & Cauer Thermal *(Gate)* | Bridge | `01-electronics.T2.02`, `00-foundations.T3.01` | `4.5 h` | No | `high` |
| **28** | [`01-electronics.T3.02`](../01-electronics-and-power/README.md#tier-3-advanced--production) | **Step 3.2:** 6-Layer $<2\text{ nH}$ $48\text{ V}/30\text{ A}$ Inverter, Bessel AFE & SAR Charge Buckets | Legacy | `01-electronics.T2.02`, `00-foundations.T3.01`, `01-electronics.T3.01a` | `6.5 h` | Sim/Opt | `high` |
| **29** | [`02-mechanics.T3.02a`](../modules/02-mechanics.T3.02a.md) | 6D Spatial Twists/Wrenches, Paros-Weisbord Flexure Hinges & Two-Pass RNEA *(Gate)* | Bridge | `00-foundations.T3.01`, `02-mechanics.T2.03` | `4.5 h` | No | `low` |
| **29–30** | [`02-mechanics.T3.03`](../02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production) | **Step 3.3:** Screw PoE, `Ti-6Al-4V` Flexures, Featherstone $O(n)$ RNEA & GPU Physics | Legacy | `00-foundations.T3.01`, `02-mechanics.T2.03`, `02-mechanics.T3.02a` | `6.5 h` | No | `low` |
| **30–31** | [`03-sensors.T3.03a`](../modules/03-sensors.T3.03a.md) | Decoupled Synchronous $d$-$q$ FOC, Min-Max SVPWM & Harmonic/Cogging LUTs *(Gate)* | Bridge | `01-electronics.T3.02`, `03-sensors.T2.04` | `4.5 h` | No | `medium` |
| **31** | [`03-sensors.T3.04`](../03-sensors-and-actuators/README.md#tier-3-advanced--production) | **Step 3.4:** $25\text{–}40\text{ kHz}$ Decoupled $d$-$q$ FOC, SVPWM & Harmonic LUT | Legacy | `01-electronics.T3.02`, `03-sensors.T2.04`, `03-sensors.T3.03a` | `6.5 h` | Sim/Opt | `high` |
| **32** | [`04-embedded.T3.04a`](../modules/04-embedded.T3.04a.md) | Center-Aligned PWM-to-ADC Triggering, Q1.31 Fixed-Point CORDIC & Wait-Free SeqLock *(Gate)* | Bridge | `03-sensors.T3.04`, `04-embedded.T2.05` | `4.5 h` | No | `low` |
| **32–33** | [`04-embedded.T3.05`](../04-embedded-and-realtime/README.md#tier-3-advanced--production) | **Step 3.5:** Bare-Metal `TIM1`$\to$`ADC`, `CORDIC` & C++20 `WaitFreeSeqLock` | Legacy | `03-sensors.T3.04`, `04-embedded.T2.05`, `04-embedded.T3.04a` | `6.5 h` | Sim/Opt | `medium` |
| **33–34** | [`05-control.T3.05a`](../modules/05-control.T3.05a.md) | Joseph-Form Covariance, Tangent-Space Error-State KF, Box QP & Second-Order CBF *(Gate)* | Bridge | `00-foundations.T3.01`, `04-embedded.T3.05`, `05-control.T2.06` | `4.5 h` | No | `medium` |
| **34** | [`05-control.T3.06`](../05-control-and-estimation/README.md#tier-3-advanced--production) | **Step 3.6:** Joseph-Form Manifold ESKF, Embedded MPC & Control Barrier QPs | Legacy | `00-foundations.T3.01`, `04-embedded.T3.05`, `05-control.T2.06`, `05-control.T3.05a` | `6.5 h` | Sim/Opt | `high` |
| **35** | [`06-robotics.T3.06a`](../modules/06-robotics.T3.06a.md) | PyTorch Tensors, Automatic Differentiation (`autograd`), Loss & Behavior Cloning | Bridge | `06-robotics.T2.07` | `5.0 h` | No | `low` |
| **35–36** | [`06-robotics.T3.06b`](../modules/06-robotics.T3.06b.md) | MDPs, Policy Gradient / PPO, Action Chunking & Sim-to-Real Safety Wrappers *(Gate)* | Bridge | `06-robotics.T3.06a` | `5.5 h` | No | `high` |
| **36** | [`07-systems.T3.06a`](../modules/07-systems.T3.06a.md) | OPC UA Information Models, IEC 63278 AAS Submodels & ISO 13849-1 `PLd` *(Gate)* | Bridge | `06-robotics.T3.06b`, `07-systems.T2.08` | `5.5 h` | No | `high` |
| **37** | [`06-robotics.T3.07`](../07-systems-hil-and-production/README.md#tier-3-advanced--production) | **Step 3.7:** Khatib Operational WBC, Embodied AI (`LeRobot`), Schroeder SysID & $<1\ \mu\text{s}$ STO | Legacy | `02-mechanics.T3.03`, `05-control.T3.06`, `06-robotics.T2.07`, `06-robotics.T3.06b`, `07-systems.T3.06a` | `7.0 h` | Sim/Opt | `high` |
| **37–38** | [`08-capstones.T3.07a`](../modules/08-capstones.T3.07a.md) | System Error/Latency Budgeting, Cross-Domain ICD & Pre-Bring-Up Safety Sign-Off *(Gate)* | Bridge | `06-robotics.T3.07`, `07-systems.T3.06a` | `5.5 h` | No | `high` |
| **38** | [`08-capstones.T3.08`](../08-capstone-projects/README.md#tier-3-capstone-builds-advanced--production-pass) | **Step 3.8 (Graduate Goal):** Full Production Capstones I–V (`48 V` FOC, Furuta, 6-DOF Arm, Hopper, AMR) | Legacy | `03-sensors.T3.04`, `06-robotics.T3.07`, `07-systems.T2.08`, `08-capstones.T3.07a` | `8.5 h` | Sim/Opt | `high` |
