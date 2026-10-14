# ⚡ MechaLab — Multi-Pass Tiered Mechatronics & Robotics Roadmap

> **Built for Software Engineers & Self-Learners Transitioning into Hardware, Mixed-Signal Electronics, and Real-Time Robotics.**
>
> **How This Roadmap Works (Linear "Level-Up" Spiral Architecture):**
> Instead of getting stuck in graduate-level $SO(3)$ Lie groups on Track 00 before ever spinning a motor, you traverse the entire curriculum in **three horizontal "Level-Up" passes** from **Track 00 $\to$ Track 08**:
> 1. **[Stage 0 — Level 0 Prerequisite On-Ramp](#stage-0-global-level-0-prerequisite-on-ramp):** Hydraulic/software analogies for voltage, current, capacitance, and inductance; smoke-free breadboard, multimeter, and bench PSU habits; and your first `ESP32`/`Arduino`/`STM32` GPIO, PWM, and ADC loops.
> 2. **[Pass 1 — Tier 1 (Beginner / Intuitive Pass: Track 00 → Track 08)](#pass-1-tier-1-linear-roadmap-beginner--intuitive-pass-track-00--track-08):** Go linearly from Track 00 to Track 08 using breadboards, off-the-shelf breakout modules (`DRV8833`, `SimpleFOCMini`, `AS5600`), and high-level code to build your first 2-DOF compliant desktop robot.
> 3. **[Pass 2 — Tier 2 (Intermediate / Applied Pass: Track 00 → Track 08)](#pass-2-tier-2-linear-roadmap-intermediate--applied-pass-track-00--track-08):** Loop back to Track 00 and upgrade every subsystem from maker breakouts to custom engineering: 4-layer KiCad PCBs, SMD soldering, Kelvin current shunts, URDF/MuJoCo models, Clarke/Park + PLL observers, FreeRTOS + DMA, CAN-FD, and LQR.
> 4. **[Pass 3 — Tier 3 (Advanced / Production Pass: Track 00 → Track 08)](#pass-3-tier-3-linear-roadmap-advanced--production-pass-track-00--track-08):** Loop back to Track 00 for final production mastery: $SO(3)/SE(3)$ Lie groups, $<2\text{ nH}$ 6-layer $48\text{ V}/30\text{ A}$ inverters, SAR charge buckets, $O(n)$ spatial RNEA, $40\text{ kHz}$ bare-metal `STM32G474` FOC, C++20 `WaitFreeSeqLock`, Joseph-form ESKF, CBF-QP safety walls, and $<1\ \mu\text{s}$ dual-channel hardware STO.

---

## 🗺️ Master Multi-Pass Navigation Matrix (Tracks 00–08 × Tiers 1–3)

Read **down a column** to execute a linear pass from Track 00 to Track 08, or read **across a row** to see how a single discipline levels up from breadboards to production hardware:

| Track Folder & Module | Pass 1: Tier 1 (Beginner / Intuitive) | Pass 2: Tier 2 (Intermediate / Applied) | Pass 3: Tier 3 (Advanced / Production) | Bridge Concept (Maker $\to$ Custom) |
| :--- | :--- | :--- | :--- | :--- |
| **[Track 00: Foundations](00-foundations/README.md)** | [Calculus as `while` Loops, 2D Rotations & RC Smoothing](00-foundations/README.md#tier-1-beginner--intuitive) | [State-Space Matrices, Quaternions & Tustin Biquads](00-foundations/README.md#tier-2-intermediate--applied) | [Lie Groups $SO(3)/SE(3)$ & Symplectic Port-Hamiltonian](00-foundations/README.md#tier-3-advanced--production) | [Moving Average $\to$ Pre-Warped TDF-II Biquad Notch](00-foundations/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 01: Electronics & Power](01-electronics-and-power/README.md)** | [Breadboard H-Bridges (`DRV8833`), Logic Levels & Decoupling](01-electronics-and-power/README.md#tier-1-beginner--intuitive) | [4-Layer KiCad PCBs, Gate Drivers & Kelvin Shunts](01-electronics-and-power/README.md#tier-2-intermediate--applied) | [6-Layer $<2\text{ nH}$ $48\text{ V}/30\text{ A}$ Inverter & SAR Charge Buckets](01-electronics-and-power/README.md#tier-3-advanced--production) | [`L298N`/`INA219` Breakouts $\to$ `DRV8353` + `INA240` Kelvin PCB](01-electronics-and-power/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 02: Mechanics & Dynamics](02-mechanics-kinematics-dynamics/README.md)** | [2D Planar Kinematics, Gear Ratios ($N^2$ Inertia) & Bearings](02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive) | [Maxwell Exact Constraint, `CadQuery` & URDF/MuJoCo](02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied) | [Screw PoE, `Ti-6Al-4V` Flexures & Featherstone $O(n)$ RNEA](02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production) | [200:1 Hobby Servos $\to$ 8:1 Backdrivable QDD Planetary Actuator](02-mechanics-kinematics-dynamics/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 03: Sensors & Actuators](03-sensors-and-actuators/README.md)** | [Quadrature/Magnetic Encoders & Open-Loop BLDC (`SimpleFOC`)](03-sensors-and-actuators/README.md#tier-1-beginner--intuitive) | [Clarke/Park Transforms, Type-II PLLs & Allan Variance](03-sensors-and-actuators/README.md#tier-2-intermediate--applied) | [$25\text{–}40\text{ kHz}$ Decoupled $d$-$q$ FOC, SVPWM & Harmonic LUT](03-sensors-and-actuators/README.md#tier-3-advanced--production) | [Hobby ESC / Voltage Mode $\to$ Center-Aligned ADC Current FOC](03-sensors-and-actuators/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 04: Embedded & Real-Time](04-embedded-and-realtime/README.md)** | [Killing `delay()`, $1\text{ kHz}$ Timer ISRs & Binary Serial](04-embedded-and-realtime/README.md#tier-1-beginner--intuitive) | [FreeRTOS Scheduling (RTA), DMA Buffers & CAN-FD (`MIT Mode`)](04-embedded-and-realtime/README.md#tier-2-intermediate--applied) | [Bare-Metal `TIM1`$\to$`ADC`, CORDIC & C++20 `WaitFreeSeqLock`](04-embedded-and-realtime/README.md#tier-3-advanced--production) | [Global Structs / `mutex` $\to$ DMA Pipelines & `WaitFreeSeqLock`](04-embedded-and-realtime/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 05: Control & Estimation](05-control-and-estimation/README.md)** | [PID Virtual Spring-Damper, Anti-Windup & Complementary IMU](05-control-and-estimation/README.md#tier-1-beginner--intuitive) | [Bode Loop Shaping, Gang of Four, Swing-Up LQR & Linear KF](05-control-and-estimation/README.md#tier-2-intermediate--applied) | [Joseph-Form Manifold ESKF, MPC & Control Barrier QPs](05-control-and-estimation/README.md#tier-3-advanced--production) | [Trial-and-Error PID / `if` Limits $\to$ LQR + Predictive CBF-QP](05-control-and-estimation/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 06: Robotics & Autonomy](06-robotics-and-autonomy/README.md)** | [Cubic/Trapezoidal Trajectories & Joint Virtual Springs](06-robotics-and-autonomy/README.md#tier-1-beginner--intuitive) | [Jacobian Transpose Cartesian Compliance & `Ruckig` S-Curves](06-robotics-and-autonomy/README.md#tier-2-intermediate--applied) | [Khatib Operational Inertia $\Lambda(q)$ & Null-Space WBC](06-robotics-and-autonomy/README.md#tier-3-advanced--production) | [Rigid `servo.write()` Stepping $\to$ $1\text{ kHz}$ Torque/Impedance Control](06-robotics-and-autonomy/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 07: Systems, HIL & Safety](07-systems-hil-and-production/README.md)** | [10-Step Safe Bring-Up Protocol & Single-Tone Sine Sweeps](07-systems-hil-and-production/README.md#tier-1-beginner--intuitive) | [Regen Braking Bus Clamps, CRC Watchdogs & HIL Faults](07-systems-hil-and-production/README.md#tier-2-intermediate--applied) | [Schroeder Multisine Closed-Loop SysID & $<1\ \mu\text{s}$ Hardware STO](07-systems-hil-and-production/README.md#tier-3-advanced--production) | [Software `if(fault) pwm=0` $\to$ Dual-Channel Hardware STO Cutoff](07-systems-hil-and-production/README.md#bridging-the-gap-maker-to-custom) |
| **[Track 08: Capstone Projects](08-capstone-projects/README.md)** | [Tier 1 Boss: Breadboard/Breakout 2-DOF Desktop Robot](08-capstone-projects/README.md#tier-1-capstone-builds-beginner--breakout-pass) | [Tier 2 Boss: Custom 4-Layer CAN Servo + LQR/MuJoCo Twin](08-capstone-projects/README.md#tier-2-capstone-builds-intermediate--applied-pass) | [Tier 3 Boss: Full Capstones I–IV ($48\text{ V}$ FOC, Furuta, 6-DOF, Hopper)](08-capstone-projects/README.md#tier-3-capstone-builds-advanced--production-pass) | [Progressive 3-Pass Hardware/Software Capstone Evolution](08-capstone-projects/README.md) |

### 📚 Supporting Reference & Lab Setup Guides
* **[Tiered Hardware Lab & Workbench BOM (`resources/lab-workbench-bom.md`)](resources/lab-workbench-bom.md):** Exact shopping lists for **Level 0 / Tier 1 ($150 Starter Bench)**, **Tier 2 ($600 Custom PCB & CAN Bench)**, and **Tier 3 ($3,500+ Production Metrology & HIL Lab)**.
* **[1-Page Production Engineering Cheat Sheet (`resources/mechatronics-cheatsheet.md`)](resources/mechatronics-cheatsheet.md)**
* **[Open-Source Toolchains (`resources/open-source-toolchains.md`)](resources/open-source-toolchains.md)** & **[Curated Textbooks & Papers (`resources/textbooks-and-papers.md`)](resources/textbooks-and-papers.md)**

---

## 🔄 Visual Progression Architecture: The 3-Pass Level-Up Loop

```mermaid
flowchart TB
    subgraph L0["STAGE 0: Level 0 Prerequisite On-Ramp (No Prior EE)"]
        L0_1["L0.1 Hydraulic & Software Analogies<br/>(V, I, R, C, L, State Structs)"] --> L0_2["L0.2 Practical Bench Tools<br/>(Breadboard, DMM, CC/CV PSU, Scope)"] --> L0_3["L0.3 Starter MCU Loops<br/>(ESP32/STM32 GPIO, 20kHz PWM, ADC)"]
    end

    subgraph P1["PASS 1: TIER 1 (Beginner / Intuitive Pass: Track 00 → Track 08)"]
        T1_0["Track 00 (T1)<br/>Finite-Diff Sims & RC Filters"] --> T1_1["Track 01 (T1)<br/>Breadboard H-Bridge & Decoupling"] --> T1_2["Track 02 (T1)<br/>2D Planar IK & Gear Ratios"] --> T1_3["Track 03 (T1)<br/>Encoders & SimpleFOC Sine"] --> T1_4["Track 04 (T1)<br/>1kHz Timer ISR & Binary Serial"] --> T1_5["Track 05 (T1)<br/>PID Spring-Damper & Comp IMU"] --> T1_6["Track 06/07 (T1)<br/>Cubic Paths & Bring-Up Checklist"] --> T1_8["🏆 Track 08 (T1 Boss)<br/>Breakout 2-DOF Desktop Arm"]
    end

    subgraph P2["PASS 2: TIER 2 (Intermediate / Applied Pass: Track 00 → Track 08)"]
        T2_0["Track 00 (T2)<br/>State-Space & Tustin Biquad Notch"] --> T2_1["Track 01 (T2)<br/>4-Layer KiCad PCB & Kelvin Shunts"] --> T2_2["Track 02 (T2)<br/>Exact Constraint, CadQuery & MuJoCo"] --> T2_3["Track 03 (T2)<br/>Clarke/Park & Type-II Velocity PLL"] --> T2_4["Track 04 (T2)<br/>FreeRTOS, DMA & CAN-FD MIT Mode"] --> T2_5["Track 05 (T2)<br/>Loop Shaping, Swing-Up LQR & KF"] --> T2_6["Track 06/07 (T2)<br/>Jacobian Transpose, S-Curves & Regen"] --> T2_8["🏆 Track 08 (T2 Boss)<br/>Custom 4-Layer CAN Servo + LQR"]
    end

    subgraph P3["PASS 3: TIER 3 (Advanced / Production Pass: Track 00 → Track 08)"]
        T3_0["Track 00 (T3)<br/>SO(3)/SE(3) Lie Groups & Symplectic"] --> T3_1["Track 01 (T3)<br/><2nH 48V/30A PCB & SAR Buckets"] --> T3_2["Track 02 (T3)<br/>Screw PoE, Ti Flexures & O(n) RNEA"] --> T3_3["Track 03 (T3)<br/>40kHz Decoupled FOC & SVPWM"] --> T3_4["Track 04 (T3)<br/>TIM1->ADC, CORDIC & WaitFreeSeqLock"] --> T3_5["Track 05 (T3)<br/>Joseph ESKF, MPC & CBF-QP Walls"] --> T3_6["Track 06/07 (T3)<br/>Khatib WBC, Schroeder SysID & <1µs STO"] --> T3_8["🏆 Track 08 (T3 Mastery)<br/>Full Production Capstones I–IV"]
    end

    L0_3 ==>|"Unlock Pass 1"| T1_0
    T1_8 ==>|"Loop Back & Level Up to Tier 2"| T2_0
    T2_8 ==>|"Loop Back & Level Up to Tier 3"| T3_0

    style L0 fill:#0f172a,stroke:#38bdf8,color:#f1f5f9
    style P1 fill:#064e3b,stroke:#34d399,color:#f1f5f9
    style P2 fill:#1e1b4b,stroke:#38bdf8,color:#f1f5f9
    style P3 fill:#3b0764,stroke:#c084fc,color:#f1f5f9
```

---

## 🛠️ STAGE 0: Global "Level 0" Prerequisite On-Ramp

If you come from a pure software background, start here before opening Track 00.

### 1. Everyday Analogies (Hydraulic & Software Mental Models)
* **Voltage ($V$) $\leftrightarrow$ Water Pressure / Potential:** Measured *across* two points relative to Ground (`GND`). Voltage pushes charges; it never "flows."
* **Current ($I$) $\leftrightarrow$ Flow Rate (Liters/sec):** Actual charge flowing *through* a conductor. High current requires thick traces and dissipates heat as $P = I^2 R$.
* **Capacitance ($C$) $\leftrightarrow$ Rubber Diaphragm / Local L1 Cache:** Resists sudden changes in *voltage* ($I = C\frac{dV}{dt}$). A $100\text{ nF}$ ceramic capacitor placed $1\text{ mm}$ from a microcontroller power pin supplies instant nanosecond current spikes when internal logic gates switch.
* **Inductance ($L$) $\leftrightarrow$ Heavy Flywheel / Momentum:** Resists sudden changes in *current* ($V = L\frac{dI}{dt}$). Abruptly switching off a spinning motor coil forces $\frac{dI}{dt} \to -\infty$, generating a destructive high-voltage arc unless a **flyback diode** or half-bridge recirculation path is present.
* **State Vector ($x$) $\leftrightarrow$ Core Program State Struct:** The minimal set of energy-storing variables ($x = [q, \dot{q}, i_d, i_q]^\top$) that completely summarizes the system's past so you can predict its future.

### 2. Practical Bench Tools (Solderless First)
* **Solderless Breadboards:** Learn how 5-pin spring clips and vertical bus rails work—and why ~0.1 $\Omega$ contact resistance and ~10 pF stray capacitance restrict breadboards to $<2\text{ A}$ and $<10\text{ MHz}$.
* **Digital Multimeter (DMM):** Always run a **Continuity Beep Test** between `VCC` and `GND` before powering any board.
* **Current-Limited Bench Power Supply (CC/CV):** Your hardware `try/catch` block. Set $12.0\text{ V}$ and a $150\text{ mA}$ current limit during initial power-up so a wiring mistake folds back voltage harmlessly instead of releasing magic smoke.
* **USB Logic Analyzer & Entry Oscilloscope:** Decode digital `SPI`/`I2C`/`CAN` frames with a logic analyzer; inspect analog PWM edges, ringing, and RC rise times with an oscilloscope.

### 3. Starter Hardware (`ESP32` / `Arduino` / `STM32 Nucleo`)
* **Milestone L0:** Wire a potentiometer voltage divider to a 12-bit `ADC` pin, output a $20\text{ kHz}$ hardware timer `PWM` signal to a logic-level N-MOSFET + flyback diode, and control the speed of a $12\text{ V}$ DC fan/motor with zero `delay()` calls.

---

## 🟢 PASS 1: Tier 1 Linear Roadmap (`Beginner / Intuitive Pass: Track 00 → Track 08`)

Complete all 8 steps below in order using breadboards, breakout modules, and high-level libraries:

1. **[Step 1.1 — Track 00 (Tier 1)](00-foundations/README.md#tier-1-beginner--intuitive):** Code a forward-Euler spring-mass-damper simulator in Python, visualize 2D rotation matrices, and smooth noisy signals with an exponential moving average.
2. **[Step 1.2 — Track 01 (Tier 1)](01-electronics-and-power/README.md#tier-1-beginner--intuitive):** Wire a bidirectional H-bridge breakout (`DRV8833`/`TB6612FNG`) on a breadboard with bulk electrolytic + $100\text{ nF}$ ceramic decoupling capacitors so motor reversals never brown-out the MCU.
3. **[Step 1.3 — Track 02 (Tier 1)](02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive):** Derive 2-link planar forward/inverse kinematics using the Law of Cosines, understand why gearboxes multiply reflected inertia by $N^2$, and support shafts with radial ball bearings.
4. **[Step 1.4 — Track 03 (Tier 1)](03-sensors-and-actuators/README.md#tier-1-beginner--intuitive):** Read a 14-bit magnetic encoder (`AS5600`/`AS5048`) and spin a 3-phase gimbal BLDC motor smoothly in angle mode using `SimpleFOC` and a `DRV8313` breakout.
5. **[Step 1.5 — Track 04 (Tier 1)](04-embedded-and-realtime/README.md#tier-1-beginner--intuitive):** Eliminate `delay()` forever—trigger a deterministic $1\text{ kHz}$ hardware timer ISR and stream packed binary telemetry structs with an 8-bit checksum.
6. **[Step 1.6 — Track 05 (Tier 1)](05-control-and-estimation/README.md#tier-1-beginner--intuitive):** Tune a physical PID loop ($K_p$ spring, $K_d$ damper, $K_i$ offset accumulator) with integrator anti-windup clamping, and fuse IMU tilt with a 2-line complementary filter.
7. **[Step 1.7 — Track 06 & 07 (Tier 1)](06-robotics-and-autonomy/README.md#tier-1-beginner--intuitive):** Generate smooth cubic polynomial trajectories, program a compliant virtual spring wall, and run the [10-Step Safe Bring-Up Checklist](07-systems-hil-and-production/README.md#tier-1-beginner--intuitive).
8. **[Step 1.8 — Track 08 (Tier 1 Boss Capstone)](08-capstone-projects/README.md#tier-1-capstone-builds-beginner--breakout-pass):** Build an off-the-shelf 2-DOF compliant desktop robot arm or rotary pendulum to **unlock Pass 2 (Tier 2)**!

---

## 🔵 PASS 2: Tier 2 Linear Roadmap (`Intermediate / Applied Pass: Track 00 → Track 08`)

Loop back to Track 00 and level up every module from breadboard breakouts to custom engineering:

1. **[Step 2.1 — Track 00 (Tier 2)](00-foundations/README.md#tier-2-intermediate--applied):** Discretize state-space matrices ($\dot{x}=Ax+Bu$), represent 3D rotations with unit quaternions, and design pre-warped Tustin `float32` biquad notch filters (`TDF-II`) that suppress mechanical resonance by $\ge 25\text{ dB}$.
2. **[Step 2.2 — Track 01 (Tier 2)](01-electronics-and-power/README.md#tier-2-intermediate--applied):** Design a custom 4-layer PCB in KiCad (`Sig / GND / PWR / Sig`) with a half-bridge gate driver (`DRV8323`/`DRV8353`), 4-terminal Kelvin current shunts (`INA240`), and SMD hot-air/stencil assembly.
3. **[Step 2.3 — Track 02 (Tier 2)](02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied):** Apply Maxwell's exact constraint rule ($\text{DOF}=6-C$), generate parametric `.step`/`.stl` CAD in Python (`CadQuery`), and build inertia-validated URDF & MuJoCo MJCF models ($I \succ 0,\ I_1+I_2 \ge I_3$).
4. **[Step 2.4 — Track 03 (Tier 2)](03-sensors-and-actuators/README.md#tier-2-intermediate--applied):** Implement amplitude-invariant Clarke & Park transforms from scratch, build a lag-free Type-II tracking PLL velocity observer, and extract IMU noise parameters via Allan variance.
5. **[Step 2.5 — Track 04 (Tier 2)](04-embedded-and-realtime/README.md#tier-2-intermediate--applied):** Schedule multi-rate tasks in `FreeRTOS` verified by Rate-Monotonic Response-Time Analysis (RTA), offload `SPI`/`ADC` transfers to hardware DMA circular buffers, and implement the 8-byte MIT CAN-FD actuator protocol with CRC-16.
6. **[Step 2.6 — Track 05 (Tier 2)](05-control-and-estimation/README.md#tier-2-intermediate--applied):** Shape loop sensitivity (`Gang of Four`, $M_s \le 1.75$), pump energy into an inverted pendulum with Åström swing-up, catch it upright with full-state LQR ($u = -Kx$), and run a Linear Kalman Filter.
7. **[Step 2.7 — Track 06 & 07 (Tier 2)](06-robotics-and-autonomy/README.md#tier-2-intermediate--applied):** Command Cartesian hand compliance via Jacobian Transpose control ($\tau = J^\top F_x + g(q)$), generate jerk-bounded S-curves (`Ruckig`), and size [regenerative braking bus choppers + HIL watchdogs](07-systems-hil-and-production/README.md#tier-2-intermediate--applied).
8. **[Step 2.8 — Track 08 (Tier 2 Boss Capstone)](08-capstone-projects/README.md#tier-2-capstone-builds-intermediate--applied-pass):** Integrate your custom 4-layer CAN servo PCB, DMA RTOS firmware, and MuJoCo digital twin to **unlock Pass 3 (Tier 3)**!

---

## 🟣 PASS 3: Tier 3 Linear Roadmap (`Advanced / Production Pass: Track 00 → Track 08`)

Loop back to Track 00 one final time for graduate theoretical depth and industrial production qualification:

1. **[Step 3.1 — Track 00 (Tier 3)](00-foundations/README.md#tier-3-advanced--production):** Operate on Matrix Lie Groups $SO(3)/SE(3)$ with Rodrigues exponential/logarithmic maps, Taylor small-angle guards ($\theta < 10^{-4}\text{ rad}$), Adjoint maps, and symplectic port-Hamiltonian integrators ($|\Delta E| < 10^{-9}\text{ J}$).
2. **[Step 3.2 — Track 01 (Tier 3)](01-electronics-and-power/README.md#tier-3-advanced--production):** Engineer a 6-layer $<2\text{ nH}$ $48\text{ V}/30\text{ A}$ inverter ($V_{DS,\text{peak}} < 58\text{ V}$), 2nd-order Bessel anti-aliasing filters ($<2.5^\circ$ lag @ $2.5\text{ kHz}$), SAR ADC charge buckets ($C_{\text{filt}} \ge 20\,C_{\text{sh}}$), and coupled electro-thermal $T_j(R_{DS(\text{on})})$ solvers.
3. **[Step 3.3 — Track 02 (Tier 3)](02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production):** Design monolithic `Ti-6Al-4V` Paros-Weisbord notch flexures, 3-2-1 Kelvin couplings, Screw Product of Exponentials kinematics, and Featherstone $O(n)$ spatial Recursive Newton-Euler (RNEA) dynamics.
4. **[Step 3.4 — Track 03 (Tier 3)](03-sensors-and-actuators/README.md#tier-3-advanced--production):** Execute $25\text{–}40\text{ kHz}$ pole-zero-canceled $d$-$q$ PI current control with synchronous cross-coupling decoupling ($\pm\omega_e L_{d,q}i_{d,q}$), min-max zero-sequence SVPWM ($+15.47\%$ boost), and Fourier LUT encoder calibration ($\text{INL} < 0.04^\circ$).
5. **[Step 3.5 — Track 04 (Tier 3)](04-embedded-and-realtime/README.md#tier-3-advanced--production):** Link bare-metal `STM32G474` `TIM1_TRGO2` $\to$ dual SAR ADCs, execute 6-cycle hardware CORDIC Q1.31 trig from zero-wait-state CCM SRAM with zero heap allocations, and pass multi-word telemetry via C++20 `WaitFreeSeqLock<T>` ($0$ torn reads in $<30\text{ ns}$).
6. **[Step 3.6 — Track 05 (Tier 3)](05-control-and-estimation/README.md#tier-3-advanced--production):** Fuse 6-DOF attitude on $SO(3)$ with a Joseph-form Error-State Kalman Filter ($\text{NEES} \in \chi^2_{6,95\%}$), solve box-constrained MPC, and enforce hard workspace boundaries via Exponential Control Barrier Function QPs (ECBF-QP).
7. **[Step 3.7 — Track 06 & 07 (Tier 3)](06-robotics-and-autonomy/README.md#tier-3-advanced--production):** Formulate Khatib Operational-Space Inertia $\Lambda(q)$ + dynamically consistent null-space projection ($N^\top = I - J^\top\bar{J}^\top$), run [Schroeder quadratic-phase multisine closed-loop SysID ($\text{CF}=1.66$)](07-systems-hil-and-production/README.md#tier-3-advanced--production), and verify IEC 61800-5-2 dual-channel hardware Safe Torque Off ($<1\ \mu\text{s}$ trip).
8. **[Step 3.8 — Track 08 (Tier 3 Production Mastery)](08-capstone-projects/README.md#tier-3-capstone-builds-advanced--production-pass):** Complete all four production Capstones (48V/30A FOC Smart Actuator, Furuta Pendulum, 6-DOF Serial Arm, 3-DOF QDD Hopping Leg).

---

## 💻 Running the Interactive MechaLab React Workbench

```bash
# Install dependencies
npm install

# Start the interactive workbench on http://localhost:3000
npm run dev

# Type-check and build for production
npm run build
```
