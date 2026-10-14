import React, { useState } from 'react';
import { MathView, MathPanel } from '../MathView';
import { ExternalLink, Play, Layers, Wrench, Cpu, ArrowRightLeft } from 'lucide-react';

interface TabArchitectureProps {
  onLoadPreset: (presetId: string) => void;
}

type TierFilter = 'all' | 'tier1' | 'tier2' | 'tier3' | 'bridge';

interface TrackCurriculum {
  id: string;
  title: string;
  subtitle: string;
  equation: string;
  gate: string;
  tier1: {
    focus: string;
    bullets: string[];
    milestone: string;
  };
  tier2: {
    focus: string;
    bullets: string[];
    milestone: string;
  };
  tier3: {
    focus: string;
    bullets: string[];
    milestone: string;
  };
  bridge: {
    fromMaker: string;
    toCustom: string;
    explanation: string;
  };
  links: { label: string; url: string }[];
  presets: { id: string; label: string }[];
}

const CURRICULUM_TRACKS: TrackCurriculum[] = [
  {
    id: 'TRACK 00 · FOUNDATIONS',
    title: 'Applied Math, Signals, Lie Groups & Bond Graphs',
    subtitle: 'From discrete software arrays & hydraulic analogies to SO(3) manifolds and port-Hamiltonian conservation.',
    equation: '\\exp([\\phi]_\\times) = I + \\frac{\\sin\\theta}{\\theta}[\\phi]_\\times + \\frac{1-\\cos\\theta}{\\theta^2}[\\phi]_\\times^2',
    gate: 'Gate: |ΔE| < 10⁻⁹ J · Pre-warped float32 Biquad Notch ≤ -25 dB',
    tier1: {
      focus: 'Differential Equations as While-Loops & 2D Rotations',
      bullets: [
        'Translate calculus into code: derivatives as finite differences (dx/dt ≈ (x[k]-x[k-1])/dt) and integrals as running accumulators.',
        '2D rotation matrices and why Euler angles (roll-pitch-yaw) lock up at 90° pitch (Gimbal Lock).',
        'Time-domain vs. frequency-domain intuition: moving average filters vs. simple RC low-pass filters.',
      ],
      milestone: 'Milestone 0.1: Code a Python forward-Euler spring-mass simulator and plot position vs. velocity phase portraits.',
    },
    tier2: {
      focus: 'State-Space Matrices, Bilinear (Tustin) Discretization & Quaternions',
      bullets: [
        'Linear state-space representation (ẋ = Ax + Bu) and matrix exponential discretization for fixed-step timers.',
        'Frequency pre-warping and Transposed Direct Form II (TDF-II) digital biquad notch filters.',
        'Unit quaternions for 3D orientation and energy-routing Bond Graphs (effort × flow = power).',
      ],
      milestone: 'Milestone 0.2: Design a 25 kHz float32 digital notch filter in C/Python that attenuates a 291 Hz shaft resonance by >25 dB.',
    },
    tier3: {
      focus: 'Matrix Lie Groups SO(3)/SE(3) & Port-Hamiltonian Symplectic Integrators',
      bullets: [
        'Rodrigues exponential/logarithmic maps on Lie algebras so(3)/se(3) with Taylor small-angle guards (θ < 10⁻⁴ rad).',
        'Adjoint transformations, Jacobians on curved manifolds, and structure-preserving symplectic integration.',
      ],
      milestone: 'Milestone 0.3: Pass Lab 00 verification gate with <10⁻⁹ J energy drift over 10,000 steps and exact SO(3) tangent space tests.',
    },
    bridge: {
      fromMaker: 'Naive `angle += gyro_z * dt` & `delay(10)` loops',
      toCustom: 'Pre-warped Tustin Biquads & Manifold Lie Group Integration',
      explanation: 'Why `float` Euler integration explodes at high rates and how to replace `ArduinoFilter` libraries with zero-allocation TDF-II biquads and SO(3) exponential maps.',
    },
    links: [
      { label: 'MIT 18.06 (Strang)', url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/' },
      { label: 'Solà Micro Lie Theory', url: 'https://arxiv.org/abs/1812.01537' },
      { label: 'Smith DSP Guide', url: 'https://www.dspguide.com/' },
    ],
    presets: [
      { id: 'wafer_scanner', label: 'ASML Stage (390Hz)' },
      { id: 'surgical_cable', label: 'Da Vinci Cable (142Hz)' },
      { id: 'cnc_ballscrew', label: 'CNC Ballscrew (291Hz)' },
    ],
  },
  {
    id: 'TRACK 01 · ELECTRONICS & POWER',
    title: 'Mixed-Signal AFE, Power Inverters & EMC PCB Layout',
    subtitle: 'From breadboard H-bridges and multimeter checks to 6-layer <2 nH switching loops and Kelvin current sensing.',
    equation: 'V_{DS,\\text{peak}} = V_{\\text{bus}} + L_{\\text{loop}}\\frac{dI}{dt}, \\quad L_{\\text{loop}} < 2\\text{ nH}',
    gate: 'Gate: V_DS,peak < 58 V @ 30 A turn-off · Bessel AFE phase lag < 2.5° @ 2.5 kHz',
    tier1: {
      focus: 'Breadboard DC Motor Control, Flyback Diodes & Decoupling Capacitors',
      bullets: [
        'Why inductive loads (motors/solenoids) generate destructive high-voltage arcs when switched off—and how a flyback diode provides a safe recirculation path.',
        'Using pre-built H-bridge breakouts (DRV8833 / TB6612FNG) with an ESP32/Arduino and a current-limited bench supply.',
        'Why digital chips reset when motors spin up: placing 100 nF ceramic and 100 µF bulk electrolytic capacitors across power rails.',
      ],
      milestone: 'Milestone 1.1: Wire a breadboard DC motor driver with a shunt resistor, scope the PWM switching node, and measure stall current.',
    },
    tier2: {
      focus: 'Schematic Capture, Half-Bridge Gate Drivers & Differential Op-Amp Sensing',
      bullets: [
        'Reading datasheets for MOSFETs (R_DS(on), Q_g, V_DS) and dedicated half-bridge gate drivers with bootstrap capacitors and dead-time.',
        '4-terminal Kelvin shunt footprints: why solder pad resistance ruins milliohm current measurements.',
        'Designing a 2-to-4 layer PCB in KiCad with ground planes, thermal vias, and SMD hot-air/reflow soldering.',
      ],
      milestone: 'Milestone 1.2: Capture and route a single-phase half-bridge + inline current sense amplifier board in KiCad that passes DRC with zero unrouted nets.',
    },
    tier3: {
      focus: '48V/30A 3-Phase Inverter, SAR ADC Charge Buckets & <2 nH Commutation Loops',
      bullets: [
        'Minimizing parasitic commutation inductance (L_loop < 2 nH) using tight MLCC placement over an unbroken Layer-2 solid ground plane.',
        '2nd-order Bessel anti-aliasing filters and RC charge-bucket design (C_filt ≥ 20 C_sh) for simultaneous multi-MSPS SAR ADCs.',
        'Coupled electro-thermal iterative solving for MOSFET junction temperature T_j(R_DS(on)).',
      ],
      milestone: 'Milestone 1.3: Verify the 43-net Capstone I 48V/30A FOC PCB stackup with <58V peak drain-source overshoot and 99.1% inverter efficiency.',
    },
    bridge: {
      fromMaker: 'L298N / DRV8825 Breakout Modules & INA219 I2C Sensors',
      toCustom: 'DRV8353 + OptiMOS 6 Half-Bridges + INA240 PWM-Rejection Kelvin Shunts',
      explanation: 'Why slow I2C current sensors cannot survive 40 kHz FOC loops, and how to move from lossy BJT/darlington breakouts to 2.5 mΩ discrete MOSFET stages with hardware desaturation protection.',
    },
    links: [
      { label: 'TI SLUA618 Gate Drivers', url: 'https://www.ti.com/lit/pdf/slua618' },
      { label: 'ADI Op-Amp Handbook', url: 'https://www.analog.com/en/resources/technical-books/op-amp-applications-handbook.html' },
      { label: 'KiCad Documentation', url: 'https://docs.kicad.org/' },
    ],
    presets: [
      { id: 'pcb_6layer_opt', label: '6-Layer 1.6nH PCB' },
      { id: 'pcb_2layer_bad', label: '2-Layer Overshoot' },
      { id: 'pcb_peak_30a', label: '30A Peak Thermal' },
    ],
  },
  {
    id: 'TRACK 02 · MECHANICS & DYNAMICS',
    title: 'Exact Constraint Design, Screw Kinematics & O(n) RNEA Dynamics',
    subtitle: 'From 3D-printed brackets and hobby servos to monolithic flexures, Kelvin couplings, and Featherstone spatial algebra.',
    equation: 'T(q) = e^{[\\mathcal{S}_1]q_1}\\cdots e^{[\\mathcal{S}_n]q_n}M, \\quad x^\\top(\\dot{M}-2C)x = 0',
    gate: 'Gate: ‖τ_RNEA - τ_Lagrange‖_∞ < 10⁻¹¹ N·m · Watertight 2-Manifold STEP/STL',
    tier1: {
      focus: 'Degrees of Freedom, Gear Ratios, Backlash & 2-Link Planar Kinematics',
      bullets: [
        'Why 3D-printed parts warp and bind: basic bearing arrangement (radial vs. preload) and belt/pulley tensioning.',
        'Forward and inverse kinematics of a 2-DOF planar robot arm using basic trigonometry (law of cosines).',
        'How gear reduction multiplies torque by N while multiplying reflected rotor inertia by N².',
      ],
      milestone: 'Milestone 2.1: CAD and 3D-print a 2-link planar arm driven by belt pulleys and command XY circle trajectories in Python.',
    },
    tier2: {
      focus: 'Maxwell Exact Constraint, Parametric CAD (CadQuery) & URDF/MuJoCo Modeling',
      bullets: [
        'Maxwell constraint rule (DOF = 6 - C), Abbe alignment error, and Hertzian contact stress in bearings and gear pins.',
        'Programmatic CAD generation (STEP/STL) and validating watertight mesh topology (Euler characteristic χ).',
        'Writing physically valid URDF and MuJoCo MJCF XML models (positive-definite inertia tensors and triangle inequality I₁+I₂ ≥ I₃).',
      ],
      milestone: 'Milestone 2.2: Generate parametric STEP/STL models and simulate a 3-DOF hopping leg in MuJoCo with validated link inertias.',
    },
    tier3: {
      focus: 'Product of Exponentials (PoE), Paros-Weisbord Flexures & O(n) Spatial RNEA',
      bullets: [
        'Screw theory Product of Exponentials forward/inverse kinematics and space/body manipulator Jacobians.',
        'Monolithic Ti-6Al-4V circular notch flexure hinges and 3-2-1 Kelvin kinematic couplings for sub-micron repeatability.',
        'Featherstone O(n) Recursive Newton-Euler Algorithm (RNEA) and passivity skew-symmetry (Ṁ - 2C).',
      ],
      milestone: 'Milestone 2.3: Achieve <10⁻¹¹ N·m agreement between analytical Euler-Lagrange equations and recursive spatial RNEA.',
    },
    bridge: {
      fromMaker: 'SG90 Hobby Servos & Over-Constrained 4-Bolt 3D-Printed Plates',
      toCustom: '8:1 Quasi-Direct Drive (QDD) Planetary Actuators & Exact-Constraint Mounts',
      explanation: 'Why 200:1 hobby gearboxes shatter on impact and cannot feel external forces, and how low-ratio (6:1–9:1) backdrivable QDD actuators let software sense contact directly through motor current.',
    },
    links: [
      { label: 'Modern Robotics PDF', url: 'https://hades.mech.northwestern.edu/index.php/Modern_Robotics' },
      { label: 'CadQuery Docs', url: 'https://cadquery.readthedocs.io/' },
      { label: 'MuJoCo Documentation', url: 'https://mujoco.readthedocs.io/' },
    ],
    presets: [
      { id: 'cad_flexure_stage', label: 'Ti Notch Flexure' },
      { id: 'cad_kelvin_mount', label: 'Kelvin 3-2-1 Mount' },
      { id: 'cad_qdd_carrier', label: '8:1 QDD Carrier' },
    ],
  },
  {
    id: 'TRACK 03 · SENSORS & ACTUATORS',
    title: 'Precision Metrology, Allan Variance & 25 kHz Field-Oriented Control',
    subtitle: 'From quadrature encoder interrupts and open-loop BLDC commutation to synchronous d-q FOC and encoder calibration.',
    equation: 'v_q^* = K_p e_q + K_i \\!\\int\\! e_q dt + \\omega_e(L_d i_d + \\lambda_{pm})',
    gate: 'Gate: Calibrated Encoder INL < 0.04° · q-Axis Current Rise Time ≤ 180 µs',
    tier1: {
      focus: 'Quadrature Encoders, I2C IMUs & 6-Step Trapezoidal BLDC Commutation',
      bullets: [
        'Reading optical/magnetic encoders using hardware timer quadrature decoders instead of noisy GPIO interrupts.',
        'How brushless motors work: energizing 3 coil phases in a 6-step sequence using Hall effect sensors.',
        'Open-loop sinusoidal voltage control using the SimpleFOC library on an ESP32/STM32.',
      ],
      milestone: 'Milestone 3.1: Spin a gimbal BLDC motor smoothly in velocity and angle mode using SimpleFOC and a magnetic SPI encoder.',
    },
    tier2: {
      focus: 'Clarke/Park Transforms, Type-II PLL Velocity Observers & IMU Allan Variance',
      bullets: [
        'Why finite-difference velocity ((θ[k]-θ[k-1])/dt) is unusable at high sample rates—implementing a Type-II tracking PLL observer.',
        'Transforming 3-phase currents (i_a, i_b, i_c) into rotating rotor coordinates (i_d, i_q) via Clarke and Park transforms.',
        'Characterizing MEMS IMU noise (angle random walk vs. bias instability) from log-log Allan deviation plots.',
      ],
      milestone: 'Milestone 3.2: Implement Clarke/Park transforms and a Type-II velocity PLL in C++ and verify zero steady-state lag on constant-velocity ramps.',
    },
    tier3: {
      focus: '25–40 kHz Synchronous d-q PI + Back-EMF Decoupling, SVPWM & Harmonic Calibration',
      bullets: [
        'Pole-zero cancellation PI tuning (K_p = L·ω_bw, K_i = R·ω_bw) with synchronous speed cross-coupling feedforward (±ω_e L i_dq).',
        'Min-max zero-sequence Space Vector PWM (SVPWM) for +15.47% bus voltage utilization and circular voltage clamping.',
        'Fourier LUT calibration of off-axis magnetic encoder eccentricity and cogging torque ripple.',
      ],
      milestone: 'Milestone 3.3: Achieve ≤180 µs 0–90% torque step response with <0.04° encoder integral nonlinearity (INL).',
    },
    bridge: {
      fromMaker: 'Hobby ESCs (BLHeli) & `SimpleFOC` Default Voltage Mode',
      toCustom: 'Center-Aligned Timer ADC-Triggered True Current-Loop FOC',
      explanation: 'Why hobby drone ESCs fail at zero-speed holding torque, and how sampling phase shunts at the exact SVPWM timer peak eliminates switching noise without phase lag.',
    },
    links: [
      { label: 'Ben Katz MIT QDD Thesis', url: 'https://dspace.mit.edu/handle/1721.1/118671' },
      { label: 'SimpleFOC Theory', url: 'https://docs.simplefoc.com/' },
      { label: 'NIST Allan Variance', url: 'https://www.nist.gov/publications/handbook-frequency-stability-analysis' },
    ],
    presets: [
      { id: 'foc_cobot_joint', label: 'Cobot Joint 1200RPM' },
      { id: 'foc_drone_prop', label: 'Drone 5500RPM' },
      { id: 'foc_qdd_jump', label: '24A Hopper Jump' },
    ],
  },
  {
    id: 'TRACK 04 · EMBEDDED & REAL-TIME',
    title: 'Cortex-M7/M4F Architecture, Lock-Free C++20 & CAN-FD Bus',
    subtitle: 'From Arduino superloops and FreeRTOS tasks to zero-jitter DMA peripheral triggering and WaitFreeSeqLock IPC.',
    equation: 'R_i^{(k+1)} = C_i + B_i + \\sum_{j \\in hp(i)} \\left\\lceil \\frac{R_i^{(k)}}{T_j} \\right\\rceil C_j \\le D_i',
    gate: 'Gate: 0 Heap Allocations · 40 kHz STM32G474 ISR & Lock-Free SeqLock (0 Torn Reads)',
    tier1: {
      focus: 'Non-Blocking State Machines, Hardware Timers & Basic Serial/UART Framing',
      bullets: [
        'Eliminating `delay()` forever: structuring embedded software around hardware timer ticks and finite state machines.',
        'Understanding volatile registers, interrupt service routines (ISRs), and why long ISRs break main-loop timing.',
        'Binary packet framing with start bytes, length fields, and checksums over UART/SPI.',
      ],
      milestone: 'Milestone 4.1: Replace a blocking Arduino sketch with a deterministic 1 kHz hardware-timer state machine streaming binary telemetry.',
    },
    tier2: {
      focus: 'FreeRTOS Preemptive Scheduling, DMA Circular Buffers & CAN Bus (MIT Mode)',
      bullets: [
        'Task priorities, mutex priority inversion, and Rate-Monotonic Response-Time Analysis (RTA).',
        'Configuring Direct Memory Access (DMA) so ADC and SPI peripherals transfer data to RAM with zero CPU cycles.',
        'Packing 16-bit position, 12-bit velocity, and Kp/Kd impedance commands into 8-byte CAN frames with CRC-16.',
      ],
      milestone: 'Milestone 4.2: Build a multi-rate FreeRTOS application (1 kHz control task + 100 Hz telemetry task) using DMA-backed SPI/UART.',
    },
    tier3: {
      focus: 'Bare-Metal TIM1→ADC Trigger Chains, CORDIC Q1.31 Math & WaitFreeSeqLock<T>',
      bullets: [
        'Linking `TIM1_TRGO2` directly to dual simultaneous SAR ADCs and hardware CORDIC sin/cos co-processors on STM32G474.',
        'Placing hot ISR code and state structs into zero-wait-state Tightly Coupled Memory (ITCM/DTCM) to avoid cache misses.',
        'C++20 `WaitFreeSeqLock<T>` atomic sequence counters to pass multi-word state structs between 40 kHz ISRs and 1 kHz threads with zero torn reads.',
      ],
      milestone: 'Milestone 4.3: Verify <30 ns lock-free read latency and zero torn reads across 250,000 contested ISR/planner transactions.',
    },
    bridge: {
      fromMaker: '`Arduino.h` `analogRead()` + `std::mutex` / Global Variables',
      toCustom: 'Hardware-Triggered DMA Pipelines & Lock-Free Sequence Locks',
      explanation: 'Why reading a multi-float struct shared with a fast interrupt causes violent "torn-read" control spikes, and how a 15-line `WaitFreeSeqLock` fixes it without disabling interrupts.',
    },
    links: [
      { label: 'STM32G4 RM0440 Manual', url: 'https://www.st.com/resource/en/reference_manual/rm0440-stm32g4-series-advanced-armbased-32bit-mcus-stmicroelectronics.pdf' },
      { label: 'FreeRTOS Kernel Book', url: 'https://www.freertos.org/Documentation/02-Kernel/07-Books-and-manual/01-RTOS_book' },
      { label: 'Zephyr RTOS Docs', url: 'https://docs.zephyrproject.org/' },
    ],
    presets: [
      { id: 'sto_desat_short', label: '<1μs Desat Trip' },
      { id: 'sto_enc_crc', label: 'Encoder CRC Break' },
      { id: 'eskf_seqlock_clean', label: 'WaitFreeSeqLock' },
    ],
  },
  {
    id: 'TRACK 05 · CONTROL & ESTIMATION',
    title: 'Loop Shaping, Joseph-Form ESKF, LQR/MPC & Control Barrier Functions',
    subtitle: 'From basic PID tuning and complementary filters to manifold Kalman filtering and safety-critical QP filters.',
    equation: 'P^+ = (I - KH)P^-(I - KH)^\\top + K R K^\\top',
    gate: 'Gate: Sensitivity Peak M_s ≤ 1.75 (±25% J_L) · ESKF NEES ∈ χ²_95% · 0 CBF Violations',
    tier1: {
      focus: 'PID Intuition, Integrator Windup & Complementary IMU Filtering',
      bullets: [
        'Physical meaning of P (virtual spring), D (virtual damper), and I (steady-state gravity/friction offset eliminator).',
        'Why actuator saturation causes violent integrator overshoot (windup) and how clamping the integral fixes it.',
        'Fusing noisy accelerometer tilt with drifting gyroscope integration using a 2-line complementary filter.',
      ],
      milestone: 'Milestone 5.1: Stabilize a 1-DOF pendulum or reaction wheel in simulation/hardware with an anti-windup PID controller.',
    },
    tier2: {
      focus: 'Frequency-Domain Loop Shaping, LQR Full-State Feedback & Linear Kalman Filters',
      bullets: [
        'Bode plots, phase margin, and the "Gang of Four" transfer functions: why high gain amplifies high-frequency sensor noise.',
        'Designing Linear Quadratic Regulators (LQR) by trading off state error penalties (Q) against motor effort (R).',
        'Linear Kalman Filter prediction/innovation cycle and observability of hidden velocity/bias states.',
      ],
      milestone: 'Milestone 5.2: Swing up an inverted Furuta pendulum using Åström energy pumping and catch it upright with LQR.',
    },
    tier3: {
      focus: 'Joseph-Form Manifold ESKF, Receding-Horizon MPC & Control Barrier Function QPs',
      bullets: [
        '6-DOF Error-State Kalman Filter (ESKF) on SO(3) with Joseph-form symmetric covariance updates and χ² NEES consistency.',
        'Linear/Nonlinear Model Predictive Control (MPC) under hard voltage/torque box constraints.',
        'Exponential Control Barrier Functions (ECBF) formulated as real-time Quadratic Programs (QP) to enforce hard workspace walls.',
      ],
      milestone: 'Milestone 5.3: Enforce hard ±x_max cart walls under aggressive impulse disturbances with zero boundary violations.',
    },
    bridge: {
      fromMaker: 'Heuristic Trial-and-Error PID & `if (pos > limit) stop()` Clauses',
      toCustom: 'Model-Based LQR/Loop-Shaping + Predictive CBF Safety Filters',
      explanation: 'Why hard `if/else` position limits fail when a heavy robot link has momentum, and how a Control Barrier Function smoothly computes the exact braking deceleration needed to stop at the boundary.',
    },
    links: [
      { label: 'Åström & Murray FBS2e', url: 'https://fbswiki.org/wiki/index.php/Main_Page' },
      { label: 'Barfoot State Estimation', url: 'http://asrl.utias.utoronto.ca/~tdb/bib/barfoot_ser17.pdf' },
      { label: 'Solà ESKF Quaternion PDF', url: 'https://arxiv.org/abs/1711.02508' },
    ],
    presets: [
      { id: 'pend_swingup', label: 'Swing-Up Catch' },
      { id: 'pend_cbf_wall', label: 'CBF Wall ±0.50m' },
      { id: 'eskf_high_drift', label: 'ESKF Bias Recovery' },
    ],
  },
  {
    id: 'TRACK 06 · ROBOTICS & AUTONOMY',
    title: 'Operational-Space Impedance Control, Whole-Body Control & Trajectories',
    subtitle: 'From point-to-point joint interpolation to Khatib operational-space impedance and jerk-limited trajectories.',
    equation: '\\Lambda(q) = (J M^{-1} J^\\top)^{-1}, \\quad N^\\top = I - J^\\top \\bar{J}^\\top',
    gate: 'Gate: Null-Space Task Acceleration ‖ẍ_null‖ < 10⁻¹² m/s² · Contact Force Overshoot < 15%',
    tier1: {
      focus: 'Cubic/Trapezoidal Trajectories & Virtual Joint Springs (PD Impedance)',
      bullets: [
        'Why step position commands shake robots apart: generating smooth trapezoidal velocity and cubic polynomial profiles.',
        'Making a motor feel like a physical spring and damper (τ = K_p(q_des - q) - K_d q̇) without position-integral stiffness.',
      ],
      milestone: 'Milestone 6.1: Program a virtual spring wall and viscous damper on a 1-DOF actuator or simulated 2-DOF arm.',
    },
    tier2: {
      focus: 'Task-Space Jacobian Transpose Control & Minimum-Jerk S-Curves (Ruckig)',
      bullets: [
        'Mapping Cartesian hand forces F_x to joint torques via the Jacobian transpose (τ = J(q)ᵀ F_x + g(q)).',
        'Time-optimal third-order jerk-bounded trajectory generation to prevent exciting structural resonances.',
      ],
      milestone: 'Milestone 6.2: Command a multi-DOF manipulator to trace a compliant surface while regulating normal contact force.',
    },
    tier3: {
      focus: 'Khatib Operational-Space Inertia Λ(q) & Dynamically Consistent Null-Space Projection',
      bullets: [
        'Decoupling nonlinear multi-link inertia in Cartesian coordinates using operational inertia Λ(q) = (J M⁻¹ Jᵀ)⁻¹.',
        'Projecting secondary posture tasks into the dynamically consistent null-space Nᵀ = I - Jᵀ J̄ᵀ with zero end-effector acceleration coupling.',
      ],
      milestone: 'Milestone 6.3: Polish a 20° inclined ramp with <15% contact force overshoot while optimizing elbow posture in the null space.',
    },
    bridge: {
      fromMaker: 'Rigid `servo.write(angle)` Point-to-Point Stepping',
      toCustom: '1 kHz Operational-Space Torque/Impedance Control with Gravity Compensation',
      explanation: 'Why position-controlled industrial robots break fragile objects on contact, and how torque-controlled robots render programmable Cartesian compliance.',
    },
    links: [
      { label: 'Tedrake Underactuated', url: 'https://underactuated.mit.edu/' },
      { label: 'MIT Robotic Manipulation', url: 'https://manipulation.csail.mit.edu/' },
      { label: 'Pinocchio C++ Library', url: 'https://github.com/stack-of-tasks/pinocchio' },
    ],
    presets: [
      { id: 'robot_hopper_crouch', label: 'Hopper Crouch' },
      { id: 'robot_arm_polish', label: 'Arm 20° Ramp' },
      { id: 'robot_furuta_bal', label: 'Furuta Balance' },
    ],
  },
  {
    id: 'TRACK 07 & 08 · SYSTEMS, HIL & CAPSTONES',
    title: 'Schroeder Closed-Loop SysID, Dual-Channel STO & Full-Stack Capstones',
    subtitle: 'From benchtop smoke tests and E-stop buttons to IEC 61800-5-2 hardware STO and nonparametric spectral SysID.',
    equation: '\\hat{P}(j\\omega_k) = \\frac{\\hat{S}_{y d_{\\text{exc}}}(j\\omega_k)}{\\hat{S}_{u d_{\\text{exc}}}(j\\omega_k)}, \\quad \\phi_k = -\\frac{\\pi k(k-1)}{M}',
    gate: 'Gate: Hardware STO Trip < 1 µs · Schroeder CF < 1.8 · 6 Validated Capstone Models',
    tier1: {
      focus: 'Benchtop Bring-Up Checklist, Current Limiting & Sine-Sweep Frequency Testing',
      bullets: [
        'Safe hardware bring-up protocol: continuity check, current-limited supply set to 100 mA, logic verification before high-power bus.',
        'Measuring system response by injecting one sine frequency at a time and recording amplitude/phase lag.',
      ],
      milestone: 'Milestone 7.1: Execute a 10-step bring-up checklist and plot an empirical Bode curve from discrete sine sweeps.',
    },
    tier2: {
      focus: 'Hardware-in-the-Loop (HIL) Fault Injection, Watchdogs & Regenerative Braking Clamps',
      bullets: [
        'Calculating DC bus voltage surge during emergency braking (½ J ω² → ½ C ΔV²) and sizing a resistive brake chopper.',
        'Automated fault injection for SPI encoder wire breaks (CRC-16 failures) and windowed watchdog timers.',
      ],
      milestone: 'Milestone 7.2: Build an automated Python/C++ HIL test harness that injects sensor dropouts and verifies safe ramp-down.',
    },
    tier3: {
      focus: 'Schroeder Multisine Closed-Loop SysID, <1 µs Dual-Channel STO & Capstone Integration',
      bullets: [
        'Manfred Schroeder quadratic phase multisine excitation (CF ≈ 1.66) for rapid, non-saturating closed-loop FRF estimation P̂ = S_yd / S_ud.',
        'IEC 61800-5-2 dual-channel hardware Safe Torque Off (STO_A / STO_B) with <1 µs desaturation gate shutdown and 100 µs dark-pulse BIST.',
        'Full-stack integration across Capstones I–IV (48V FOC Drive, Furuta Pendulum, 6-DOF Arm, 3-DOF QDD Hopper).',
      ],
      milestone: 'Milestone 8.1: Pass all 12 automated verification suites across CAD, PCB thermal budget, STM32G4 firmware, and closed-loop control.',
    },
    bridge: {
      fromMaker: 'Software `if (fault) pwm = 0` & Manual Trial-and-Error Tuning',
      toCustom: 'Dual-Channel Hardware STO Gate Cutoff + Automated Schroeder Spectral SysID',
      explanation: 'Why software E-stops fail when a microcontroller clock glitches or a MOSFET latches up, and how independent hardware comparators + dual-channel STO guarantee safe torque removal in under 1 microsecond.',
    },
    links: [
      { label: 'TI Functional Safety STO', url: 'https://www.ti.com/lit/pdf/slla547' },
      { label: 'NASA Systems Eng Handbook', url: 'https://www.nasa.gov/reference/systems-engineering-handbook/' },
    ],
    presets: [
      { id: 'sysid_schroeder_clean', label: '48-Tone Schroeder' },
      { id: 'sysid_zero_clip', label: 'Zero-Phase Clip' },
      { id: 'sysid_noisy_avg', label: 'Noisy 20-Period' },
    ],
  },
];

export const TabArchitecture: React.FC<TabArchitectureProps> = ({ onLoadPreset }) => {
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  return (
    <div className="space-y-5">
      {/* Global Level 0 Prerequisite Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e293b] pb-3 mb-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-[#38bdf8]">
              GLOBAL PREREQUISITE · LEVEL 0 ON-RAMP FOR SOFTWARE ENGINEERS
            </div>
            <h2 className="text-base font-bold text-[#f1f5f9] mt-0.5">
              Track 00-Pre: Physical Intuition, Bench Tools & First Hardware Loops (No Prior EE Required)
            </h2>
          </div>
          <div className="text-xs text-[#94a3b8]">
            Start here before SPICE, KiCad, or Lie Groups
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs leading-relaxed">
          {/* Pillar 1: Everyday Analogies */}
          <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#38bdf8] font-bold text-sm mb-2">
              <Layers className="w-4 h-4" />
              <span>1. Everyday Hydraulic & Software Analogies</span>
            </div>
            <ul className="space-y-1.5 text-[#cbd5e1]">
              <li>
                <strong className="text-[#f1f5f9]">Voltage (<MathView math="V" />) = Water Pressure / Potential:</strong> The "push" trying to move charges. Measured <em>across</em> two points (always relative to Ground <code className="text-[#38bdf8]">GND</code>).
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Current (<MathView math="I" />) = Flow Rate (Liters/sec):</strong> Actual charge flowing <em>through</em> a wire. High current = thick copper traces & heat (<MathView math="P = I^2 R" />).
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Capacitance (<MathView math="C" />) = Rubber Diaphragm / Local RAM Cache:</strong> Absorbs sudden pressure spikes and supplies instant local current when digital chips switch.
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Inductance (<MathView math="L" />) = Heavy Flywheel / Momentum:</strong> Fights changes in current (<MathView math="V = L\,dI/dt" />). Slamming a valve shut on a spinning flywheel causes a destructive pressure spike (why motor coils spark!).
              </li>
              <li>
                <strong className="text-[#f1f5f9]">State Vector (<MathView math="x" />) = Struct of Memory Variables:</strong> The minimal set of numbers (e.g., position, velocity, coil current) that completely summarizes the system's past so you can predict its future.
              </li>
            </ul>
          </div>

          {/* Pillar 2: Practical Bench Tools */}
          <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#34d399] font-bold text-sm mb-2">
              <Wrench className="w-4 h-4" />
              <span>2. Practical Bench Tools (Solderless First)</span>
            </div>
            <ul className="space-y-1.5 text-[#cbd5e1]">
              <li>
                <strong className="text-[#f1f5f9]">Solderless Breadboard:</strong> Understand internal spring-clip rows vs. vertical power buses—and why breadboards have ~10 pF stray capacitance and ~0.1 Ω contact resistance (great for 5V logic, bad for 20A motors).
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Digital Multimeter (DMM):</strong> Your hardware `printf` debugger. Always run a <em>continuity beep test</em> between power (<code className="text-[#fb7185]">VCC</code>) and ground (<code className="text-[#38bdf8]">GND</code>) before plugging in a battery.
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Current-Limited Bench Power Supply (CC/CV):</strong> Your hardware `try/catch` block. Set voltage to 12V and current limit to 0.15A on first power-up so a wiring mistake folds back voltage harmlessly instead of releasing magic smoke.
              </li>
              <li>
                <strong className="text-[#f1f5f9]">USB Logic Analyzer & Oscilloscope:</strong> Logic analyzers decode digital bytes (SPI/I2C/CAN); oscilloscopes plot analog voltage vs. time to catch ringing, noise, and RC rise times.
              </li>
            </ul>
          </div>

          {/* Pillar 3: Starter Hardware */}
          <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg p-4">
            <div className="flex items-center gap-2 text-[#c084fc] font-bold text-sm mb-2">
              <Cpu className="w-4 h-4" />
              <span>3. Starter Hardware (ESP32 / Arduino / STM32 Nucleo)</span>
            </div>
            <ul className="space-y-1.5 text-[#cbd5e1]">
              <li>
                <strong className="text-[#f1f5f9]">GPIO & Pull-Up/Down Resistors:</strong> Why an unconnected input pin ("floating") reads random 0/1 noise from room static, and how a 10 kΩ pull-up resistor anchors logic states.
              </li>
              <li>
                <strong className="text-[#f1f5f9]">PWM (Pulse-Width Modulation):</strong> How a digital 3.3V pin simulates an analog voltage by toggling ON/OFF at 20 kHz while the motor's inductance averages the duty cycle.
              </li>
              <li>
                <strong className="text-[#f1f5f9]">Basic ADC Reading & Quantization:</strong> Turning a 0–3.3V potentiometer or thermistor divider into a 12-bit integer (<code className="text-[#34d399]">0..4095</code>) and plotting real-time sensor noise.
              </li>
              <li className="pt-1 text-[#34d399] font-medium">
                ✓ Level 0 Gate: Dim an LED with hardware timer PWM, read a voltage divider via ADC, and trigger a logic-level MOSFET on a breadboard with zero `delay()` calls.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Master Cyber-Physical Coupling Equation & Architecture */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-bold text-[#38bdf8]">
            Master Cyber-Physical Coupling Equation & System Architecture
          </h2>
          <span className="text-xs font-mono text-[#94a3b8]">
            Muscles & Skeleton (Plant) ⇄ Nerves & Heart (Power/AFE) ⇄ Brain & Spinal Cord (Real-Time Compute)
          </span>
        </div>
        <MathPanel
          math="\underbrace{M(q)\ddot{q} + C(q,\dot{q})\dot{q} + g(q) + \tau_{\text{fric}}(\dot{q})}_{\text{Continuous Mechanical Plant }\mathcal{P}} = \underbrace{N\eta\,\frac{3}{2}N_p\big(\lambda_{pm}i_q + (L_d - L_q)i_d i_q\big)}_{\text{Electromagnetic Transducer}} - J(q)^\top \mathcal{F}_{\text{ext}}, \qquad \underbrace{\dot{h}(\hat{x}, u) \ge -\alpha\big(h(\hat{x})\big)}_{\text{Discrete CBF Safety Filter }\mathcal{C}}"
        />
      </div>

      {/* Progressive Tier Selector Bar */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#f1f5f9]">
            Progressive 3-Tier Curriculum Explorer (Tracks 00–08)
          </h3>
          <p className="text-xs text-[#94a3b8]">
            Filter every track by learning stage or inspect how to bridge from off-the-shelf maker modules to custom production hardware.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-[#0b0f19] p-1 rounded-lg border border-[#1e293b]">
          {[
            { id: 'all', label: 'All Tiers + Bridge' },
            { id: 'tier1', label: 'Tier 1: Beginner / Intuitive' },
            { id: 'tier2', label: 'Tier 2: Intermediate / Applied' },
            { id: 'tier3', label: 'Tier 3: Advanced / Production' },
            { id: 'bridge', label: 'Bridging Maker → Custom' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setTierFilter(btn.id as TierFilter)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                tierFilter === btn.id
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9] border border-transparent'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scaffolded Track Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {CURRICULUM_TRACKS.map((track) => (
          <div
            key={track.id}
            className="bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col justify-between space-y-3"
          >
            <div>
              {/* Kicker & Title */}
              <div className="flex items-center justify-between gap-2 text-xs text-[#38bdf8] font-mono font-bold">
                <span>{track.id}</span>
                <span className="text-[#34d399] font-normal">{track.gate}</span>
              </div>
              <h3 className="text-base font-bold text-[#f1f5f9] mt-1">{track.title}</h3>
              <p className="text-xs text-[#94a3b8] mt-0.5 mb-2.5">{track.subtitle}</p>

              {/* Core Equation */}
              <div className="bg-[#080d1a] border border-[#1e293b] rounded-md p-2 mb-3 text-xs overflow-x-auto">
                <MathView math={track.equation} block={true} />
              </div>

              {/* Tier Sections */}
              <div className="space-y-2.5 text-xs">
                {(tierFilter === 'all' || tierFilter === 'tier1') && (
                  <div className="bg-[#0b0f19] border-l-2 border-l-[#34d399] border border-[#1e293b] rounded-r-md p-3">
                    <div className="font-bold text-[#34d399] mb-1">
                      Tier 1 (Beginner / Intuitive) — {track.tier1.focus}
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[#cbd5e1]">
                      {track.tier1.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[0.74rem] text-[#94a3b8] font-mono">
                      ✓ {track.tier1.milestone}
                    </div>
                  </div>
                )}

                {(tierFilter === 'all' || tierFilter === 'tier2') && (
                  <div className="bg-[#0b0f19] border-l-2 border-l-[#38bdf8] border border-[#1e293b] rounded-r-md p-3">
                    <div className="font-bold text-[#38bdf8] mb-1">
                      Tier 2 (Intermediate / Applied) — {track.tier2.focus}
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[#cbd5e1]">
                      {track.tier2.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[0.74rem] text-[#94a3b8] font-mono">
                      ✓ {track.tier2.milestone}
                    </div>
                  </div>
                )}

                {(tierFilter === 'all' || tierFilter === 'tier3') && (
                  <div className="bg-[#0b0f19] border-l-2 border-l-[#c084fc] border border-[#1e293b] rounded-r-md p-3">
                    <div className="font-bold text-[#c084fc] mb-1">
                      Tier 3 (Advanced / Production) — {track.tier3.focus}
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-[#cbd5e1]">
                      {track.tier3.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[0.74rem] text-[#94a3b8] font-mono">
                      ✓ {track.tier3.milestone}
                    </div>
                  </div>
                )}

                {(tierFilter === 'all' || tierFilter === 'bridge') && (
                  <div className="bg-[#1e293b]/40 border border-[#fbbf24]/30 rounded-md p-3">
                    <div className="flex items-center gap-1.5 font-bold text-[#fbbf24] mb-1">
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Bridging the Gap: {track.bridge.fromMaker} → {track.bridge.toCustom}</span>
                    </div>
                    <p className="text-[#cbd5e1] leading-relaxed">{track.bridge.explanation}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer: Study Links & Interactive Simulator Presets */}
            <div className="pt-3 border-t border-[#1e293b] flex flex-wrap items-center justify-between gap-2">
              <div className="text-[0.73rem] text-[#94a3b8] flex flex-wrap gap-2 items-center">
                <span className="text-[#f1f5f9] font-semibold">Open References:</span>
                {track.links.map((lk, idx) => (
                  <React.Fragment key={lk.url}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <a
                      href={lk.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#34d399] hover:underline inline-flex items-center gap-0.5"
                    >
                      {lk.label} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {track.presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onLoadPreset(p.id)}
                    className="text-[0.72rem] bg-[#1e293b] hover:bg-[#38bdf8]/20 border border-[#334155] hover:border-[#38bdf8] text-[#38bdf8] px-2.5 py-1 rounded-md cursor-pointer inline-flex items-center gap-1 font-medium transition-colors"
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
