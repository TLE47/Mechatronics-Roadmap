import { TabId } from './types';

export type ActiveTierPass = 'level0' | 'tier1' | 'tier2' | 'tier3';

export interface LinearTrackStep {
  stepNumber: string;
  trackCode: string;
  trackTitle: string;
  tierBadge: string;
  headline: string;
  coreWhy: string;
  topics: string[];
  bridgeTitle?: string;
  bridgeFrom?: string;
  bridgeTo?: string;
  bridgeHow?: string;
  equation: string;
  milestoneId: string;
  milestoneTask: string;
  deliverableGate: string;
  linkedTab: TabId;
  presetId: string;
  presetLabel: string;
  studyLinks: { label: string; url: string; note?: string }[];
  quiz?: {
    q1: string;
    a1: string;
    q2: string;
    a2: string;
  };
}

export interface TierPassMeta {
  id: ActiveTierPass;
  levelNumber: string;
  name: string;
  tagline: string;
  goalSummary: string;
  hardwareStack: string;
  softwareStack: string;
  mathDepth: string;
  unlockRequirement: string;
}

export const TIER_PASS_META: Record<ActiveTierPass, TierPassMeta> = {
  level0: {
    id: 'level0',
    levelNumber: 'LEVEL 0',
    name: 'Hardware Intuition & Bench On-Ramp',
    tagline: 'For Software Engineers with Zero Prior EE Background',
    goalSummary:
      'Build physical intuition for voltage, current, inductance, and capacitance using hydraulic/software analogies, master your multimeter and bench power supply without releasing magic smoke, and run your first GPIO/PWM/ADC hardware loops.',
    hardwareStack: 'Solderless Breadboard · ESP32 / Arduino / STM32 Nucleo · Digital Multimeter · CC/CV Bench PSU',
    softwareStack: 'Basic C/C++ Loop · Hardware Timer PWM · Serial Plotter',
    mathDepth: 'Ohm’s Law (V = IR), Power (P = I²R), RC Time Constant (τ = RC)',
    unlockRequirement: 'Starting Point — Complete all 3 Level-0 Bench Modules to unlock the Tier 1 Pass.',
  },
  tier1: {
    id: 'tier1',
    levelNumber: 'TIER 1 PASS',
    name: 'Beginner / Intuitive Pass (Tracks 00 → 08)',
    tagline: 'Pass 1 of 3 · Breadboards, Breakout Modules & Core Physical "Why"',
    goalSummary:
      'Go linearly from Track 00 to Track 08 using off-the-shelf breakout boards (DRV8833, SimpleFOCMini, AS5600) and high-level code. Understand WHY motors spark, WHY shafts vibrate, and HOW PID virtual springs work before touching custom PCBs.',
    hardwareStack: 'Breakout Modules (DRV8833 / DRV8313) · I2C/SPI Magnetic Encoders · 3D-Printed Brackets & Hobby Servos',
    softwareStack: 'Python Finite-Difference Sims · SimpleFOC · Non-Blocking Timer ISRs · Basic PID',
    mathDepth: 'Finite Differences (Δx/Δt), 2D Trigonometry, First-Order RC Filters, Basic PID Law',
    unlockRequirement: 'Complete Tracks 00–08 (Tier 1) to graduate from breadboards and unlock Tier 2.',
  },
  tier2: {
    id: 'tier2',
    levelNumber: 'TIER 2 PASS',
    name: 'Intermediate / Applied Pass (Tracks 00 → 08)',
    tagline: 'Pass 2 of 3 · Custom KiCad PCBs, SMD Soldering, RTOS/DMA & Model-Based Control',
    goalSummary:
      'Loop back to Track 00 and level up every subsystem from maker breakouts to custom engineering: capture schematics in KiCad, solder SMD gate drivers and Kelvin shunts, model URDFs in MuJoCo, write Clarke/Park + PLL observers, and run LQR + FreeRTOS + CAN.',
    hardwareStack: 'Custom 2–4 Layer KiCad PCBs · Half-Bridge Gate Drivers · 4-Terminal Kelvin Shunts · 6:1–8:1 Planetary Gears',
    softwareStack: 'FreeRTOS / Zephyr · DMA Circular Buffers · CAN-FD MIT Protocol · MuJoCo XML · LQR & Linear KF',
    mathDepth: 'State-Space Matrices (ẋ = Ax+Bu), Quaternions, Pre-Warped Tustin Biquads, Bode Loop Shaping',
    unlockRequirement: 'Complete Tracks 00–08 (Tier 2) to master custom PCBs & RTOS and unlock Tier 3.',
  },
  tier3: {
    id: 'tier3',
    levelNumber: 'TIER 3 PASS',
    name: 'Advanced / Production Pass (Tracks 00 → 08)',
    tagline: 'Pass 3 of 3 · Lie Groups, <2 nH 48V/30A Inverters, 40 kHz Bare-Metal FOC & Safety QPs',
    goalSummary:
      'The final mastery pass across Tracks 00 to 08. Implement graduate-level math and industrial safety standards: SO(3)/SE(3) Lie groups, <2 nH 6-layer 48V/30A power stages, SAR ADC charge buckets, O(n) spatial RNEA, WaitFreeSeqLock IPC, Joseph ESKF, CBF-QP safety walls, and <1 µs hardware STO.',
    hardwareStack: '6-Layer 48V/30A FOC PCB (STM32G474 + DRV8353 + OptiMOS 6) · Ti-6Al-4V Flexures · Dual-Channel Hardware STO',
    softwareStack: '40 kHz Zero-Wait-State CCM ISR · Hardware CORDIC · C++20 WaitFreeSeqLock · ECBF-QP & Khatib WBC',
    mathDepth: 'Matrix Lie Algebras so(3)/se(3), Featherstone Spatial Algebra, Joseph ESKF, Schroeder Spectral SysID',
    unlockRequirement: 'Final Production Mastery — All 12 Automated Hardware, Firmware & Control Verification Gates.',
  },
};

export const LEVEL_0_STEPS: LinearTrackStep[] = [
  {
    stepNumber: 'L0.1',
    trackCode: 'LEVEL 0 · MODULE 1',
    trackTitle: 'Everyday Hydraulic & Software Analogies for Electronics',
    tierBadge: 'LEVEL 0 ON-RAMP',
    headline: 'Map Voltage, Current, Capacitance & Inductance to Software Concepts You Already Know',
    coreWhy:
      'As a software engineer, you cannot see electrons moving in a wire. By mapping every passive electrical property to a concrete hydraulic/mechanical equivalent or a computer architecture concept, circuit behavior becomes predictable before you ever pick up a soldering iron.',
    topics: [
      'Voltage (V) = Water Pressure / Potential Difference: Always measured ACROSS two points relative to Ground (GND). Voltage pushes; it does not flow.',
      'Current (I) = Flow Rate (Amps = Coulombs/sec): Actual charge flowing THROUGH a wire. Traces carrying 20A need wide copper pours just like a firehose, and dissipate heat as P = I²R.',
      'Capacitance (C) = Rubber Diaphragm / L1 RAM Cache: Resists voltage changes (I = C·dV/dt). A 100 nF decoupling capacitor right next to a microcontroller VCC pin acts like an L1 cache—supplying instant nanosecond current spikes when CPU clocks toggle.',
      'Inductance (L) = Heavy Flywheel / Momentum: Resists current changes (V = L·dI/dt). If you suddenly switch off a spinning motor coil, the magnetic field collapses and generates a massive voltage spike (inductive kickback) that arcs across switches.',
      'State Vector (x) = Core Program State Struct: The minimal struct of physical energy variables (position q, velocity q̇, coil current i) needed to predict all future motion.',
    ],
    equation: 'V = I \\cdot R, \\qquad P_{\\text{heat}} = I^2 R, \\qquad I_C = C\\frac{dV}{dt}, \\qquad V_L = L\\frac{dI}{dt}',
    milestoneId: 'l0_m1',
    milestoneTask: 'Predict the voltage spike when a 1 mH motor coil carrying 5 A is switched off in 100 ns without a diode (V = L·ΔI/Δt = 50,000 V!), explaining why every inductive load needs a recirculation path.',
    deliverableGate: 'Concept Check: Explain V, I, R, C, L, and State Vectors without looking at notes.',
    linkedTab: 'tab-arch',
    presetId: 'wafer_scanner',
    presetLabel: 'Inspect Two-Mass Energy Analogy',
    studyLinks: [
      {
        label: 'Falstad Interactive Circuit Simulator (falstad.com)',
        url: 'https://www.falstad.com/circuit/',
        note: 'Visualizes voltage as color and current as animated dots in real time in your browser.',
      },
      {
        label: 'SparkFun: Voltage, Current, Resistance, and Ohm’s Law',
        url: 'https://learn.sparkfun.com/tutorials/voltage-current-resistance-and-ohms-law',
        note: 'Water-tank physical analogies tailored for absolute hardware beginners.',
      },
      {
        label: 'All About Circuits: Inductors & Capacitors (Vol. I)',
        url: 'https://www.allaboutcircuits.com/textbook/direct-current/',
        note: 'Open-access textbook explaining energy storage in electric and magnetic fields.',
      },
    ],
    quiz: {
      q1: 'Why does a 100 nF ceramic capacitor need to be placed within 1–2 mm of a microcontroller’s VCC pin even if the main power supply has a large 1,000 µF capacitor 15 cm away?',
      a1: 'Long wires and PCB traces have stray inductance (L) that resists rapid changes in current (V = L·dI/dt). When CPU clock edges switch in nanoseconds, the distant supply is blocked by trace inductance; the local 100 nF capacitor acts like an L1 RAM cache, supplying instant local charge.',
      q2: 'A motor coil with inductance L = 2 mH carries I = 4 A. If a transistor switches the current off in Δt = 200 ns without a flyback diode, what theoretical voltage spike is generated?',
      a2: 'Using V_L = L·(ΔI/Δt) = (2×10⁻³ H)·(4 A / 200×10⁻⁹ s) = 40,000 V (40 kV). This immediately destroys the transistor via avalanche breakdown unless a flyback diode provides a safe current path.',
    },
  },
  {
    stepNumber: 'L0.2',
    trackCode: 'LEVEL 0 · MODULE 2',
    trackTitle: 'Practical Bench Tools & Smoke-Free Bring-Up',
    tierBadge: 'LEVEL 0 ON-RAMP',
    headline: 'Breadboards, Multimeters, Current-Limited Bench Supplies & Logic Analyzers',
    coreWhy:
      'In software, a bug throws a stack trace; in hardware, a wiring bug burns a $15 chip in 5 milliseconds. Learning how to use a current-limited power supply and a multimeter gives you a hardware "try/catch" block and "printf" debugger.',
    topics: [
      'Solderless Breadboard Anatomy: How 5-pin horizontal spring clips and vertical power buses connect—and why breadboards fail above 2 A or 10 MHz due to ~0.1 Ω contact resistance and ~10 pF stray capacitance.',
      'Digital Multimeter (DMM) Ritual: Always run a Continuity Beep Test between VCC and GND before applying power. Measure DC rail voltages and out-of-circuit resistor values.',
      'CC/CV Bench Power Supply as a Hardware Try/Catch: Set Constant Voltage (e.g., 12.0 V) and Constant Current limit (e.g., 0.10 A) on first power-on. If there is a short, the supply safely drops voltage to 0.2 V instead of burning the board.',
      'Oscilloscope vs. USB Logic Analyzer: Use a $20 24MHz Logic Analyzer (PulseView) to decode digital I2C/SPI/UART bytes; use an Oscilloscope to see analog voltage ringing, RC rise times, and power rail droop.',
    ],
    equation: 'V_{\\text{measured}} = V_{\\text{supply}} - I_{\\text{load}} R_{\\text{breadboard}}, \\qquad \\tau_{RC} = R \\cdot C',
    milestoneId: 'l0_m2',
    milestoneTask: 'Wire a 1 kΩ + 100 nF RC low-pass filter on a breadboard, verify zero VCC-to-GND shorts with a DMM, power via a current-limited supply, and measure the 0–63.2% rise time (τ = 100 µs) on a scope.',
    deliverableGate: 'Bench Gate: Safe CC/CV power-up + DMM continuity check + Scope trigger capture.',
    linkedTab: 'tab-cadpcb',
    presetId: 'pcb_6layer_opt',
    presetLabel: 'Compare Breadboard vs. 6-Layer PCB',
    studyLinks: [
      {
        label: 'SparkFun: How to Use a Breadboard',
        url: 'https://learn.sparkfun.com/tutorials/how-to-use-a-breadboard',
        note: 'Cutaway photos showing internal metal spring clips and split power rails.',
      },
      {
        label: 'SparkFun: How to Use a Multimeter',
        url: 'https://learn.sparkfun.com/tutorials/how-to-use-a-multimeter',
        note: 'Step-by-step guide to continuity testing, voltage probing, and avoiding blown current fuses.',
      },
      {
        label: 'sigrok PulseView Logic Analyzer Manual',
        url: 'https://sigrok.org/wiki/PulseView',
        note: 'Open-source protocol decoder documentation for I2C, SPI, UART, and CAN.',
      },
    ],
    quiz: {
      q1: 'You power on a new ESP32 + sensor prototype using a bench PSU set to 12.0 V and a 0.10 A CC limit. Immediately, the display reads 0.45 V and 0.10 A with the CC LED lit. What happened?',
      a1: 'The board is drawing more than 100 mA (likely a near-short or reversed IC), so the supply automatically crossed from Constant Voltage (CV) into Constant Current (CC) mode—clamping current at 100 mA by dropping voltage to 0.45 V and saving your hardware.',
      q2: 'Why shouldn’t you run 10 A of motor current through a solderless breadboard strip?',
      a2: 'Each breadboard spring contact has ~0.1–0.2 Ω of contact resistance. At 10 A, a single connection dissipates P = I²R = 100 × 0.15 = 15 W of heat, melting the ABS plastic housing within seconds.',
    },
  },
  {
    stepNumber: 'L0.3',
    trackCode: 'LEVEL 0 · MODULE 3',
    trackTitle: 'Starter Hardware: GPIO, PWM & ADC on ESP32 / Arduino / STM32',
    tierBadge: 'LEVEL 0 ON-RAMP',
    headline: 'Your First Physical Input-Output Loops: Pull-Up Resistors, Timer PWM & Voltage Dividers',
    coreWhy:
      'Before building closed-loop robots, you must master the three fundamental microcontroller peripherals that bridge software variables to physical voltages: Digital GPIO, Pulse-Width Modulation (PWM), and Analog-to-Digital Conversion (ADC).',
    topics: [
      'GPIO & Why Unconnected Pins Float: High-impedance CMOS inputs act like tiny antennas that toggle randomly from 60 Hz room hum. Anchor them deterministically with 10 kΩ pull-up or pull-down resistors.',
      'Hardware Timer PWM: A microcontroller pin cannot output 1.65 V directly—instead, it switches between 0 V and 3.3 V at 20 kHz with a 50% duty cycle, letting the motor coil’s inductance average the current.',
      'Low-Side N-MOSFET Switching + Flyback Diode: Driving a 12 V DC fan/motor from a 3.3 V MCU pin using a logic-level MOSFET and a parallel flyback diode (1N5819 Schottky) to catch inductive turn-off spikes.',
      'ADC Quantization & Voltage Dividers: Reading a 10 kΩ potentiometer or NTC thermistor into a 12-bit integer (0..4095) and converting counts to physical Volts.',
    ],
    equation: 'V_{\\text{avg}} = D \\cdot V_{\\text{bus}}, \\qquad \\text{ADC}_{\\text{code}} = \\left\\lfloor 4095 \\cdot \\frac{V_{\\text{in}}}{3.3\\text{ V}} \\right\\rfloor',
    milestoneId: 'l0_m3',
    milestoneTask: 'Flash an ESP32 or STM32 Nucleo to read a potentiometer via 12-bit ADC and modulate the speed of a 12 V DC motor via a 20 kHz hardware PWM MOSFET stage, streaming live RPM/ADC telemetry at 100 Hz.',
    deliverableGate: 'Level 0 Graduation Gate: Working Potentiometer → ADC → MCU → 20kHz PWM → MOSFET → Motor loop.',
    linkedTab: 'tab-foc',
    presetId: 'foc_cobot_joint',
    presetLabel: 'Preview 3-Phase PWM Simulator',
    studyLinks: [
      {
        label: 'Wokwi Browser ESP32 & STM32 Simulator',
        url: 'https://wokwi.com/',
        note: 'Test GPIO buttons, PWM, and ADCs in your browser before wiring physical hardware.',
      },
      {
        label: 'STM32 Step-by-Step Official Beginner Wiki',
        url: 'https://wiki.st.com/stm32mcu/wiki/STM32StepByStep:STM32_step_by_step_overview',
        note: 'Hands-on tutorial series covering STM32 Nucleo GPIO, timers, PWM, and ADCs.',
      },
      {
        label: 'SparkFun: Pull-Up Resistors & Pulse Width Modulation',
        url: 'https://learn.sparkfun.com/tutorials/pull-up-resistors',
        note: 'Explains why floating digital inputs fail and how pull-up resistors solve it.',
      },
    ],
    quiz: {
      q1: 'Why can’t you drive a 12 V, 1.5 A DC motor directly from an STM32 or ESP32 GPIO pin?',
      a1: 'A microcontroller GPIO pin only outputs 3.3 V and can source at most ~15–25 mA before its internal microscopic CMOS transistors burn out. You need an external MOSFET power switch rated for the motor’s voltage and current.',
      q2: 'You want to measure a 24 V battery rail using an STM32 ADC pin whose maximum input is 3.3 V. Using R₁ = 68 kΩ from V_bat to the ADC pin and R₂ = 10 kΩ to GND, what is V_ADC when V_bat = 25.2 V?',
      a2: 'V_ADC = 25.2 V × (10 / (68 + 10)) = 3.231 V (safely < 3.3 V), which corresponds to 12-bit ADC code floor(4095 × 3.231 / 3.3) = 4009.',
    },
  },
];

// ============================================================================
// PASS 1: TIER 1 LINEAR ROADMAP (TRACK 00 -> TRACK 08: BEGINNER / INTUITIVE)
// ============================================================================
export const TIER_1_LINEAR_PASS: LinearTrackStep[] = [
  {
    stepNumber: 'T1 · Step 1 / 8',
    trackCode: 'TRACK 00 (TIER 1)',
    trackTitle: 'Foundations: Calculus as Code, 2D Rotations & RC Filters',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Turn Differential Equations into Simple `while` Loops & Understand Resonance Intuition',
    coreWhy:
      'Every physical Differential Equation is just a software loop updating state variables by a tiny time step `dt`. Once you see derivatives as `(x - x_prev)/dt` and integrals as `sum += x * dt`, physics equations read just like C or Python code.',
    topics: [
      'Finite-Difference Simulation: Coding spring-mass-damper systems (m·ẍ + b·ẋ + k·x = F) using 4 lines of Python/C.',
      'Why Robot Joints Whistle (Resonance Intuition): Connecting a motor to a heavy load through a slightly flexible shaft creates a specific frequency where vibrations amplify 16× (+24 dB).',
      '2D Rotation Matrices & Gimbal Lock: Rotating (x, y) coordinates with cos/sin and seeing visually why Roll-Pitch-Yaw Euler angles lock up at 90° pitch.',
      'First-Order Exponential Smoothing: Filtering noisy ADC readings with `y = alpha * raw + (1 - alpha) * y`.',
    ],
    equation: 'v_{k+1} = v_k + \\frac{F_k - b v_k - k x_k}{m}\\Delta t, \\qquad x_{k+1} = x_k + v_{k+1}\\Delta t',
    milestoneId: 't1_tr00',
    milestoneTask: 'Write a Python script that simulates a 2-mass spring-damper drive, injects a sine sweep, and plots the vibration amplitude peak.',
    deliverableGate: 'Tier 1.0 Gate: Working time-stepping physics loop + 2D rotation plotter.',
    linkedTab: 'tab-bode',
    presetId: 'surgical_cable',
    presetLabel: 'Open Two-Mass Resonance Sim (Tab 2)',
    studyLinks: [
      {
        label: '3Blue1Brown: Essence of Linear Algebra & Differential Equations',
        url: 'https://www.3blue1brown.com/topics/linear-algebra',
        note: 'Visual, geometric intuition for rotation matrices and state-space differential equations.',
      },
      {
        label: 'myPhysicsLab Interactive Spring-Mass Simulations',
        url: 'https://www.myphysicslab.com/',
        note: 'Browser-based interactive ODE physics applets with open-source JavaScript code.',
      },
      {
        label: 'The Scientist and Engineer’s Guide to DSP (dspguide.com)',
        url: 'https://www.dspguide.com/',
        note: 'Free textbook explaining moving averages and single-pole recursive filters with plain-English code.',
      },
    ],
    quiz: {
      q1: 'In a time-stepping physics loop, why does updating velocity FIRST and then updating position using the NEW velocity (semi-implicit Euler) work so much better than using the old velocity (explicit Euler)?',
      a1: 'Explicit Euler artificially injects phantom energy on every step, causing an undamped spring-mass simulation to spiral outward and explode. Semi-implicit Euler is symplectic—it preserves phase-space area and keeps oscillatory energy bounded.',
      q2: 'You run an exponential smoothing filter y[k] = α·x[k] + (1-α)·y[k-1] at f_s = 1000 Hz with α = 0.05. What is its approximate -3 dB cutoff frequency f_c?',
      a2: 'Using α ≈ 2πf_cΔt / (1 + 2πf_cΔt), we solve 2πf_c(0.001) = 0.05 / 0.95 = 0.05263, giving f_c ≈ 8.38 Hz.',
    },
  },
  {
    stepNumber: 'T1 · Step 2 / 8',
    trackCode: 'TRACK 01 (TIER 1)',
    trackTitle: 'Electronics & Power: H-Bridges, Logic Levels & Decoupling',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Drive Bidirectional Motors on a Breadboard Without Brown-Outs or Smoke',
    coreWhy:
      'Before designing custom 48V MOSFET PCBs, you need hands-on fluency with off-the-shelf H-bridge breakout boards, logic-level translation, and power rail decoupling so your microcontroller doesn’t reset every time a motor reverses.',
    topics: [
      'H-Bridge Polarity Reversal: How 4 switches flip voltage across a motor (+V to -V), and why closing top and bottom switches on the same leg shorts the power supply (shoot-through).',
      'Using Breakout Drivers (DRV8833 / TB6612FNG): Wiring `IN1/IN2` PWM pins, `nSLEEP`, and separate `VM` (motor) vs. `VCC` (3.3V logic) supplies.',
      'Bulk vs. Bypass Capacitors: Placing a 100 µF electrolytic capacitor on `VM` to absorb motor current surges and a 100 nF ceramic capacitor on `3.3V` to prevent MCU resets.',
      'Low-Side Shunt Resistor Basics: Measuring Ohm’s Law voltage drop across a 0.1 Ω resistor to observe motor torque current on a scope.',
    ],
    equation: 'V_{\\text{motor}} = (D_A - D_B) V_{\\text{bus}}, \\qquad V_{\\text{shunt}} = I_{\\text{motor}} R_{\\text{shunt}}',
    milestoneId: 't1_tr01',
    milestoneTask: 'Wire an ESP32/STM32 + DRV8833 breakout driving a 12 V DC gearmotor; capture clean PWM reversals on a scope with <100 mV droop on the 3.3 V MCU rail.',
    deliverableGate: 'Tier 1.1 Gate: Glitch-free bidirectional H-bridge breadboard build.',
    linkedTab: 'tab-cadpcb',
    presetId: 'pcb_6layer_opt',
    presetLabel: 'Open Power Stage Explorer (Tab 6)',
    studyLinks: [
      {
        label: 'TI SLVA959: Brushed DC Motor Driver Basics (H-Bridge)',
        url: 'https://www.ti.com/lit/pdf/slva959',
        note: 'Clear diagrams showing H-bridge current paths during forward, reverse, coast, and brake.',
      },
      {
        label: 'Analog Devices MT-101: Decoupling Techniques',
        url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-101.pdf',
        note: 'Explains why pairing a bulk electrolytic capacitor with a 100 nF ceramic cap stops brown-outs.',
      },
      {
        label: 'Adafruit DRV8833 DC/Stepper Motor Driver Breakout Guide',
        url: 'https://learn.adafruit.com/adafruit-drv8833-dc-stepper-motor-driver-breakout-board',
        note: 'Practical pinout and wiring walkthrough for a modern MOSFET H-bridge breakout.',
      },
    ],
    quiz: {
      q1: 'In an H-bridge, what is the physical difference between "Coast" (High-Z) and "Active Brake" (Low-Side Slow Decay) when stopping a spinning motor?',
      a1: 'In Coast mode, all 4 switches open so current decays rapidly and the rotor coasts freely. In Active Brake mode, both bottom switches turn ON, shorting the motor terminals together so the motor’s back-EMF drives a strong opposing braking current.',
      q2: 'Why does an older bipolar L298N module get burning hot at 2 A compared to a modern MOSFET breakout like the DRV8833?',
      a2: 'The L298N uses Darlington BJT transistors with a ~2.5 V saturation drop (P = 2.5 V × 2 A = 5.0 W of heat), whereas a MOSFET driver has R_DS(on) ≈ 0.36 Ω (P = I²R = 4 × 0.36 = 1.44 W).',
    },
  },
  {
    stepNumber: 'T1 · Step 3 / 8',
    trackCode: 'TRACK 02 (TIER 1)',
    trackTitle: 'Mechanics & Kinematics: 2D Linkages, Gear Ratios & Bearings',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Understand Gear Reductions, Reflected Inertia & 2-Link Planar Robot Kinematics',
    coreWhy:
      'Software only controls joint angles if the mechanical skeleton doesn’t flex, bind, or strip its gears. Here you learn basic bearing support, pulley reductions, and 2D forward/inverse trigonometry.',
    topics: [
      '2-Link Planar Forward & Inverse Kinematics: Using the Law of Cosines and `atan2(y, x)` to compute shoulder/elbow angles (q₁, q₂) for any target (x, y) hand position.',
      'Gear Ratio Torque vs. Speed Trade-off: Why an N:1 gearbox multiplies torque by N, divides speed by N, and multiplies the motor’s apparent inertia by N².',
      'Bearings, Shafts & 3D Printing Rules: Supporting rotating shafts with dual radial ball bearings (608/6804) instead of plastic-on-plastic friction.',
    ],
    equation: 'x = l_1\\cos q_1 + l_2\\cos(q_1+q_2), \\qquad J_{\\text{reflected}} = N^2 J_{\\text{rotor}}',
    milestoneId: 't1_tr02',
    milestoneTask: 'Code a 2-DOF planar inverse kinematics solver and command a 2-link arm (in simulation or with 2 hobby servos) to trace a figure-8 path.',
    deliverableGate: 'Tier 1.2 Gate: Zero-NaN 2-DOF IK solver + working 2-link trajectory tracker.',
    linkedTab: 'tab-models',
    presetId: 'robot_hopper_crouch',
    presetLabel: 'Open Kinematic Chain Inspector (Tab 5)',
    studyLinks: [
      {
        label: 'Modern Robotics Ch. 1–3 & Video Series (Lynch & Park)',
        url: 'https://hades.mech.northwestern.edu/index.php/Modern_Robotics',
        note: 'Free PDF textbook and short lecture videos introducing degrees of freedom and planar kinematics.',
      },
      {
        label: 'Red Blob Games: 2D Forward & Inverse Kinematics Guide',
        url: 'https://www.redblobgames.com/',
        note: 'Interactive visual tutorials for 2D coordinate transforms and trigonometry for programmers.',
      },
      {
        label: 'MIT 2.007 Design and Manufacturing I OpenCourseWare',
        url: 'https://ocw.mit.edu/courses/2-007-design-and-manufacturing-i-spring-2009/',
        note: 'Practical beginner mechanical design rules for shafts, bearings, pulleys, and gear ratios.',
      },
    ],
    quiz: {
      q1: 'Why Does J_reflected scale with the SQUARE of the gear ratio (N²) rather than linearly with N?',
      a1: 'For a 1 rad rotation of the output shaft, the motor rotor must spin N radians (multiplying angular acceleration by N), and the gearbox also multiplies the reaction torque back to the output by another factor of N: τ = N·(J_m·N·q̈) = N² J_m q̈.',
      q2: 'A small rotor has J_rotor = 0.05 kg·cm². If you attach a 100:1 harmonic drive, what is the reflected rotor inertia at the output joint?',
      a2: 'J_ref = 100² × 0.05 = 500 kg·cm² (0.05 kg·m²)—often heavier than the robot arm link itself, making the joint stiff and non-backdrivable.',
    },
  },
  {
    stepNumber: 'T1 · Step 4 / 8',
    trackCode: 'TRACK 03 (TIER 1)',
    trackTitle: 'Sensors & Actuators: Encoders & Open-Loop BLDC (`SimpleFOC`)',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Read High-Resolution Magnetic Encoders & Spin a 3-Phase Brushless Motor Smoothly',
    coreWhy:
      'Brushless PMSM/BLDC motors are the muscle of modern robotics, but unlike brushed DC motors, they have no mechanical commutator—your software must continuously rotate the magnetic field in sync with the rotor.',
    topics: [
      'Quadrature (A/B) vs. Magnetic SPI/I2C Encoders: Counting edge transitions with hardware timer encoder mode vs. reading 14-bit absolute angle from an AS5600/AS5048 sensor.',
      'Electrical vs. Mechanical Angle: Why a motor with N_p = 7 pole pairs completes 7 electrical 360° sine cycles for every 1 physical shaft revolution (θ_e = N_p · θ_m).',
      '3-Phase Sinusoidal Commutation with SimpleFOC: Using a 3-phase breakout (DRV8313 / SimpleFOCMini) to apply 3-phase sine voltages phased 90° ahead of the rotor.',
    ],
    equation: '\\theta_e = N_p \\theta_m, \\qquad v_a = V_q\\cos(\\theta_e), \\quad v_b = V_q\\cos(\\theta_e - \\tfrac{2\\pi}{3}), \\quad v_c = V_q\\cos(\\theta_e + \\tfrac{2\\pi}{3})',
    milestoneId: 't1_tr03',
    milestoneTask: 'Connect a magnetic encoder and a 3-phase DRV8313 breakout to an ESP32/STM32 using SimpleFOC, align the electrical zero offset, and run closed-loop angle control.',
    deliverableGate: 'Tier 1.3 Gate: Smooth 3-phase brushless position holding with SimpleFOC.',
    linkedTab: 'tab-foc',
    presetId: 'foc_cobot_joint',
    presetLabel: 'Open FOC & SVPWM Simulator (Tab 3)',
    studyLinks: [
      {
        label: 'SimpleFOC Official Theory & Getting Started Docs',
        url: 'https://docs.simplefoc.com/',
        note: 'The best beginner-friendly guide to spinning 3-phase brushless motors with open-source hardware.',
      },
      {
        label: 'GreatScott! Brushless DC Motor Fundamentals Video',
        url: 'https://www.youtube.com/c/greatscottlab',
        note: 'Visual animations of stator coils, permanent magnet poles, and electronic commutation.',
      },
      {
        label: 'ams AS5600 / AS5048 Magnetic Encoder App Notes',
        url: 'https://ams-osram.com/',
        note: 'Shows how a diametric magnet must be mounted over a Hall sensor array.',
      },
    ],
    quiz: {
      q1: 'What happens if you mount an axial magnet (north on top, south on bottom) over an AS5600/AS5048 magnetic encoder instead of a diametrically magnetized magnet?',
      a1: 'The encoder reading will fail or stay nearly constant! On-axis magnetic angle encoders measure the rotating horizontal magnetic field vector in the X-Y plane, which requires a diametrically magnetized magnet (North on left half, South on right half).',
      q2: 'A brushless gimbal motor has 14 magnets on its rotor bell. How many pole pairs (N_p) does it have, and how many electrical degrees correspond to a 10° mechanical rotation?',
      a2: '14 magnets = 7 pole pairs (N_p = 7). A 10° mechanical rotation equals θ_e = 7 × 10° = 70° electrical.',
    },
  },
  {
    stepNumber: 'T1 · Step 5 / 8',
    trackCode: 'TRACK 04 (TIER 1)',
    trackTitle: 'Embedded & Real-Time: Killing `delay()`, Timer ISRs & Binary Packets',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Structure Embedded Firmware Around Deterministic Hardware Timer Interrupts',
    coreWhy:
      'If your control loop uses `delay(10)` or blocking `Serial.print` strings, your sample period `dt` fluctuates wildly and your PID derivative term explodes. Real-time control requires a hardware timer heartbeat.',
    topics: [
      'Banning `delay()` Forever: Splitting firmware into a fast, fixed-period hardware timer Interrupt Service Routine (ISR) and a non-blocking background state machine.',
      'The `volatile` Keyword & Register Basics: Why the C++ compiler caches variables in CPU registers and why any flag shared with an ISR must be declared `volatile` or `std::atomic`.',
      'Binary Telemetry Structs + Checksum: Packing floats/ints into a compact C struct with a `0xAA 0x55` sync header and 8-bit XOR/CRC checksum for 1 kHz plotting.',
    ],
    equation: 'f_{\\text{ISR}} = \\frac{f_{\\text{timer\\_clk}}}{(\\text{PSC}+1)(\\text{ARR}+1)} = 1000\\text{ Hz}, \\qquad \\text{Jitter} < 2\\ \\mu\\text{s}',
    milestoneId: 't1_tr04',
    milestoneTask: 'Refactor an Arduino/STM32 loop into a hardware-timed 1 kHz ISR, toggle a GPIO debug pin inside the ISR to verify exact 1.000 ms spacing on a scope/logic analyzer, and stream binary packets.',
    deliverableGate: 'Tier 1.4 Gate: 1 kHz hardware-timer ISR verified on scope + binary packet parser.',
    linkedTab: 'tab-eskf',
    presetId: 'eskf_seqlock_clean',
    presetLabel: 'Open Real-Time Telemetry Sim (Tab 8)',
    studyLinks: [
      {
        label: 'Quantum Leaps: Modern Embedded Systems Programming Course',
        url: 'https://www.state-machine.com/video-course',
        note: 'Free video series showing memory registers, interrupts, stack frames, and why delay() fails.',
      },
      {
        label: 'Barr Group: Embedded C Coding Standard & volatile Rules',
        url: 'https://barrgroup.com/embedded-systems/books/embedded-c-coding-standard',
        note: 'Industry-standard rules for writing deterministic, bug-free embedded C/C++.',
      },
      {
        label: 'Adafruit: Multi-tasking the Arduino (Ditching delay)',
        url: 'https://learn.adafruit.com/multi-tasking-the-arduino-part-1',
        note: 'Accessible walkthrough of state machines and timer interrupts.',
      },
    ],
    quiz: {
      q1: 'Why should you NEVER call `Serial.println()` or `printf()` inside a 1 kHz hardware timer Interrupt Service Routine (ISR)?',
      a1: 'Formatting ASCII strings is slow, and once the UART transmit buffer fills up, `Serial.println()` blocks waiting for previous bytes to shift out—stalling the ISR past its 1 ms deadline and crashing timing.',
      q2: 'An STM32 timer runs from a 170 MHz clock. If you set Prescaler PSC = 169, what Auto-Reload Register (ARR) value gives an exact 1,000 Hz interrupt frequency?',
      a2: 'Timer tick frequency = 170 MHz / (169 + 1) = 1 MHz (1 µs per tick). For 1,000 Hz (1,000 ticks), set ARR = 1000 - 1 = 999.',
    },
  },
  {
    stepNumber: 'T1 · Step 6 / 8',
    trackCode: 'TRACK 05 (TIER 1)',
    trackTitle: 'Control & Estimation: PID Physical Intuition, Anti-Windup & Complementary IMU',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Master PID as a Virtual Spring-Damper & Fuse IMU Sensors in 2 Lines of Code',
    coreWhy:
      'PID is not magic math—P is a virtual spring, D is a virtual shock absorber, and I is a steady-state offset eliminator. Understanding physical saturation and sensor drift lets you stabilize real mechanisms immediately.',
    topics: [
      'Physical PID Tuning: Setting Kp for desired stiffness, Kd to critically damp oscillations, and Ki to eliminate gravity droop.',
      'Integrator Windup & Clamping: Preventing the I-term from accumulating huge values when the motor hits its voltage/torque ceiling.',
      '2-Line Complementary Filter: Combining high-pass gyroscope integration with low-pass accelerometer gravity vector tilt.',
    ],
    equation: 'u = K_p e + K_i \\text{clamp}\\!\\left(\\int e\\,dt\\right) - K_d \\dot{q}_{\\text{filt}}, \\qquad \\hat{\\theta} = 0.98(\\hat{\\theta} + \\omega_g\\Delta t) + 0.02\\,\\theta_{\\text{acc}}',
    milestoneId: 't1_tr05',
    milestoneTask: 'Tune a discrete PID controller with anti-windup and derivative filtering to stabilize a 1-DOF pendulum/arm, and fuse an MPU6050/LSM6DSO IMU using a complementary filter.',
    deliverableGate: 'Tier 1.5 Gate: Step response with <5% overshoot + drift-free IMU tilt angle.',
    linkedTab: 'tab-pend',
    presetId: 'pend_swingup',
    presetLabel: 'Open Pendulum Balancer Sim (Tab 4)',
    studyLinks: [
      {
        label: 'Brian Douglas Control Systems Lectures (Resourcium)',
        url: 'https://engineeringmedia.com/',
        note: 'Visual, intuitive video explanations of PID control, integrator windup, and filtering.',
      },
      {
        label: 'Åström & Murray: Feedback Systems (FBSwiki Open Textbook)',
        url: 'https://fbswiki.org/wiki/index.php/Main_Page',
        note: 'Chapter 11 provides the gold-standard practical formulation of PID with anti-windup.',
      },
      {
        label: 'Brett Beauregard: Improving the Beginner’s PID',
        url: 'http://brettbeauregard.com/blog/2011/04/improving-the-beginners-pid-introduction/',
        note: 'Step-by-step C code walkthrough fixing derivative kick, sample-time jitter, and windup.',
      },
    ],
    quiz: {
      q1: 'What is "Derivative Kick," and how do you eliminate it in one line of code?',
      a1: 'When the user suddenly steps the target setpoint q_des, the error derivative d(q_des - q)/dt spikes to a massive number, slamming the motor. Computing the derivative on the measured position ONLY (-Kd * dq/dt) eliminates derivative kick.',
      q2: 'Why can’t you get a reliable tilt angle on a moving robot using ONLY an accelerometer, or ONLY a gyroscope?',
      a2: 'An accelerometer measures gravity PLUS linear vibration/acceleration (noisy at high frequencies), while a gyroscope has a small DC zero-rate offset that drifts to infinity when integrated (noisy at low frequencies). The complementary filter combines the best of both.',
    },
  },
  {
    stepNumber: 'T1 · Step 7 / 8',
    trackCode: 'TRACK 06 & 07 (TIER 1)',
    trackTitle: 'Smooth Trajectories, Virtual Springs & Safe Benchtop Bring-Up',
    tierBadge: 'TIER 1 · BEGINNER',
    headline: 'Generate Smooth Cubic Polynomial Paths & Run a 10-Step Safe Bring-Up Checklist',
    coreWhy:
      'Jumping straight to a target angle jerks the robot violently. By feeding your controller smooth cubic/trapezoidal trajectories and following a disciplined power-up checklist, your robot moves gracefully and survives testing.',
    topics: [
      'Cubic Polynomial & Trapezoidal Profiles: Generating smooth position q_d(t) and velocity q̇_d(t) references that start and end at zero velocity.',
      'Joint-Space Virtual Spring-Damper (Impedance): Turning off the I-term so a backdrivable motor acts like a compliant mechanical spring you can safely push by hand.',
      'Software Watchdog & E-Stop Button: Wiring a physical normally-closed E-stop switch in series with motor power VM and halting PWM if command packets stop arriving for >50 ms.',
    ],
    equation: 'q_d(t) = a_0 + a_1 t + a_2 t^2 + a_3 t^3, \\qquad \\tau = K_p(q_d - q) + K_d(\\dot{q}_d - \\dot{q})',
    milestoneId: 't1_tr06',
    milestoneTask: 'Program a virtual spring wall (free motion for q < 45°, stiff spring for q ≥ 45°) and execute a sine-sweep frequency test across 1–50 Hz.',
    deliverableGate: 'Tier 1.6 Gate: Smooth cubic trajectory tracker + physical virtual wall demo.',
    linkedTab: 'tab-sysid',
    presetId: 'sysid_schroeder_clean',
    presetLabel: 'Open Frequency Identification Sim (Tab 7)',
    studyLinks: [
      {
        label: 'Underactuated Robotics Ch. 1–2 (Russ Tedrake, MIT)',
        url: 'https://underactuated.mit.edu/',
        note: 'Interactive HTML textbook with runnable Python notebooks on trajectories and compliance.',
      },
      {
        label: 'Modern Robotics Ch. 9: Trajectory Generation',
        url: 'https://hades.mech.northwestern.edu/index.php/Modern_Robotics',
        note: 'Derives cubic, quintic, and trapezoidal velocity profiles with clear diagrams.',
      },
    ],
    quiz: {
      q1: 'Why should an industrial or benchtop Emergency Stop (E-Stop) button be wired as Normally Closed (NC) rather than Normally Open (NO)?',
      a1: 'A Normally Closed circuit conducts continuous current when healthy. If a wire accidentally breaks or a connector vibrates loose, the circuit opens and immediately stops the robot (fail-safe). A broken wire on a Normally Open E-stop would go undetected until someone pressed the button and nothing happened!',
      q2: 'Why do we set Ki = 0 when running a compliant virtual spring-damper (impedance) controller meant to interact with human hands?',
      a2: 'If a human pushes and holds the robot arm away from q_d, an active integral term (Ki > 0) would wind up over time, fighting harder and harder until it overpowers the human or saturates the motor.',
    },
  },
  {
    stepNumber: 'T1 · Step 8 / 8 (LEVEL-UP BOSS)',
    trackCode: 'TRACK 08 (TIER 1 CAPSTONE)',
    trackTitle: 'Tier 1 Graduation Capstone: Off-the-Shelf 2-DOF Compliant Desktop Robot',
    tierBadge: 'TIER 1 · BOSS GATE',
    headline: 'Integrate Everything from Pass 1 into a Complete Working Desktop Robot to Unlock Tier 2',
    coreWhy:
      'Before moving to custom PCBs, SMD soldering, and advanced matrix control in Tier 2, consolidate your Tier 1 skills by building an end-to-end 2-DOF planar arm or desktop inverted pendulum using off-the-shelf breakout modules.',
    topics: [
      'Hardware Stack: ESP32 or STM32 Nucleo + 2× SimpleFOCMini (DRV8313) breakouts + 2× AS5600/AS5048 magnetic encoders + 3D-printed 2-link arm.',
      'Firmware Stack: 1 kHz hardware timer ISR + binary UART telemetry + anti-windup PD/PID control.',
      'Control Demo: Command smooth circle trajectories via 2D inverse kinematics and demonstrate compliant hand-guiding.',
    ],
    equation: '\\tau = K_p\\big(\\text{IK}(x_d, y_d) - q\\big) - K_d \\dot{q}',
    milestoneId: 't1_tr08',
    milestoneTask: 'Complete the Tier 1 2-DOF desktop robot (or pass all 8 interactive simulator presets in Tier 1 mode) to unlock the Tier 2 Applied Engineering Pass!',
    deliverableGate: '🏆 TIER 1 GRADUATION: Unlock Tier 2 (Custom PCBs, RTOS/DMA, LQR & MuJoCo).',
    linkedTab: 'tab-models',
    presetId: 'robot_arm_polish',
    presetLabel: 'Launch Capstone Inspector (Tab 5)',
    studyLinks: [
      {
        label: 'SimpleFOC Community Projects Showcase',
        url: 'https://community.simplefoc.com/',
        note: 'Open-source desktop robot arms and pendulums built with breakout modules.',
      },
      {
        label: 'ODrive Robotics Open-Source Hardware & Docs Archive',
        url: 'https://docs.odriverobotics.com/',
        note: 'Practical troubleshooting guide for encoders, power supplies, and brushless motor tuning.',
      },
    ],
    quiz: {
      q1: 'During first bring-up of your 2-DOF brushless robot arm, Joint 1 immediately snaps to a fixed angle and draws maximum current instead of tracking your target. What is the most likely cause?',
      a1: 'The encoder direction is inverted relative to the motor phase order (`ABZ` or `UVW` swapped), turning negative feedback into positive feedback! Swap any two motor phase wires or flip the sensor direction sign.',
      q2: 'Why is it critical to test open-loop trajectory generation and inverse kinematics in Python/simulation BEFORE enabling closed-loop motor power?',
      a2: 'A sign flip or `NaN` in inverse kinematics will command an instantaneous jump to an impossible angle at maximum torque, breaking 3D-printed brackets before you can hit the E-stop.',
    },
  },
];

// ============================================================================
// PASS 2: TIER 2 LINEAR ROADMAP (TRACK 00 -> TRACK 08: INTERMEDIATE / APPLIED)
// ============================================================================
export const TIER_2_LINEAR_PASS: LinearTrackStep[] = [
  {
    stepNumber: 'T2 · Step 1 / 8',
    trackCode: 'TRACK 00 (TIER 2)',
    trackTitle: 'State-Space Matrices, Quaternions & Pre-Warped Tustin Biquads',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Level Up from Simple Loops to State-Space Discretization & Surgical Digital Notch Filters',
    coreWhy:
      'In Tier 1, you used simple moving averages and 2D trig. Now in Tier 2, you package multi-variable systems into state-space matrices (ẋ = Ax + Bu), represent 3D rotations with unit quaternions, and design pre-warped digital biquad notch filters to cancel mechanical resonances.',
    topics: [
      'State-Space Discretization: Converting continuous matrices (A, B) to exact discrete step matrices (A_d = exp(A·Ts)) for fixed-rate timers.',
      'Pre-Warped Tustin Biquad Filters (TDF-II): Designing surgical band-stop notch filters that knock out a 291 Hz structural resonance by -28 dB without phase-lagging low-frequency control.',
      '3D Unit Quaternions & Bond Graphs: Representing 3D attitude without gimbal lock and modeling electromechanical power flow (e·f = τ·ω).',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Math & DSP)',
    bridgeFrom: 'Tier 1: Naive `y = 0.9*y + 0.1*x` smoothing & Roll-Pitch-Yaw Euler angles',
    bridgeTo: 'Tier 2: Pre-warped Tustin Biquad Notch (`TDF-II`) & Unit Quaternions',
    bridgeHow:
      'Replace sluggish moving averages (which add heavy phase lag and destabilize PID loops) with a 5-multiply Transposed Direct Form II biquad notch tuned directly to the anti-resonance/resonance pair.',
    equation: 'H_{\\text{notch}}(s) = \\frac{s^2 + \\omega_n^2}{s^2 + \\frac{\\omega_n}{Q_n}s + \\omega_n^2}, \\qquad s \\leftarrow \\frac{\\omega_n}{\\tan(\\omega_n T_s/2)}\\frac{z-1}{z+1}',
    milestoneId: 't2_tr00',
    milestoneTask: 'Tune the Biquad Notch Filter in Tab 2 to cancel the 290.6 Hz two-mass resonance peak by >25 dB and verify float32 TDF-II stability.',
    deliverableGate: 'Tier 2.0 Gate: Pre-warped TDF-II notch filter achieving ≤ -25 dB attenuation at f_r.',
    linkedTab: 'tab-bode',
    presetId: 'cnc_ballscrew',
    presetLabel: 'Tune CNC Ballscrew Notch (Tab 2)',
    studyLinks: [
      {
        label: 'Julius O. Smith III: Introduction to Digital Filters (CCRMA Stanford)',
        url: 'https://ccrma.stanford.edu/~jos/filters/',
        note: 'Complete free online textbook covering biquad structures, TDF-II, and bilinear pre-warping.',
      },
      {
        label: 'Visualizing Quaternions Interactive Course (3Blue1Brown / Ben Eater)',
        url: 'https://eater.net/quaternions',
        note: 'Interactive 3D sphere in your browser for manipulating quaternion rotations.',
      },
      {
        label: 'Python Control Systems Library (python-control.readthedocs.io)',
        url: 'https://python-control.readthedocs.io/',
        note: 'Open-source Python library for state-space discretization, Bode plots, and notch design.',
      },
    ],
    quiz: {
      q1: 'Why is frequency pre-warping (K = ω_n / tan(ω_n T_s / 2)) required when discretizing a 350 Hz notch filter at a 1,000 Hz sample rate?',
      a1: 'The standard bilinear transform compresses the infinite analog frequency axis onto (-f_s/2, +f_s/2) via ω_a = (2/T_s)tan(ω_d T_s/2). Without pre-warping, the digital notch zero lands several Hz away from 350 Hz, missing the narrow mechanical resonance peak!',
      q2: 'Why is Transposed Direct Form II (TDF-II) preferred over Direct Form I for 32-bit float embedded biquad filters?',
      a2: 'TDF-II requires only 2 state registers instead of 4 and sums the numerator zeros before the high-gain feedback poles, preventing internal floating-point overflow and quantization limit cycles when Q is high.',
    },
  },
  {
    stepNumber: 'T2 · Step 2 / 8',
    trackCode: 'TRACK 01 (TIER 2)',
    trackTitle: 'Custom KiCad PCBs, Half-Bridge Gate Drivers & Kelvin Current Shunts',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Retire Your Breadboard: Design a 4-Layer Motor & Sensor PCB in KiCad & Solder SMD Parts',
    coreWhy:
      'Breakout boards on jumper wires cannot handle >5 A or 25 kHz switching without severe ground bounce. In Tier 2, you learn to read MOSFET/gate-driver datasheets, route 4-terminal Kelvin current shunts, and order your first custom 4-layer PCB.',
    topics: [
      'MOSFET Switching & Gate Drivers: Calculating gate charge current (I_g = Q_g / t_rise), bootstrap capacitor sizing, and dead-time insertion.',
      '4-Terminal Kelvin Current Shunts + INA240: Tapping differential sense traces directly from the inner pads of a 1 mΩ resistor so heavy solder-pad copper drops don’t corrupt current readings.',
      '4-Layer KiCad PCB Layout & SMD Assembly: Using an unbroken internal Layer-2 Ground Plane (`Sig / GND / PWR / Sig`), placing thermal vias under MOSFET pads, and reflowing SMD parts with a solder stencil and hot plate.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Power & PCBs)',
    bridgeFrom: 'Tier 1: DRV8833 / L298N Breakouts + Jumper Wires + I2C INA219',
    bridgeTo: 'Tier 2: Custom 4-Layer KiCad PCB + DRV8323/DRV8353 + INA240 Kelvin Shunts',
    bridgeHow:
      'Start by copying the manufacturer’s "Typical Application Schematic" from the DRV8353 and INA240 datasheets into KiCad, use a 4-layer stackup from JLCPCB, and let their SMT assembly service populate the passive 0402/0603 parts.',
    equation: 'I_{\\text{gate}} = \\frac{Q_g}{t_{\\text{rise}}}, \\qquad V_{\\text{sense}} = G_{\\text{INA240}} \\cdot (I_{\\text{phase}} R_{\\text{shunt}})',
    milestoneId: 't2_tr01',
    milestoneTask: 'Inspect the Capstone I 48V/30A BOM & thermal solver in Tab 6; compare the 2-layer 5.2 nH overshoot preset against the 6-layer 1.6 nH layout.',
    deliverableGate: 'Tier 2.1 Gate: DRC-clean KiCad half-bridge schematic/layout + Kelvin sense routing.',
    linkedTab: 'tab-cadpcb',
    presetId: 'pcb_2layer_bad',
    presetLabel: 'Inspect 2-Layer vs 6-Layer PCB (Tab 6)',
    studyLinks: [
      {
        label: 'KiCad Official Getting Started & PCB Layout Docs',
        url: 'https://docs.kicad.org/',
        note: 'Official step-by-step workflow from schematic capture to Gerber/BOM export.',
      },
      {
        label: 'TI SLUA618: Fundamentals of MOSFET and IGBT Gate Driver Circuits',
        url: 'https://www.ti.com/lit/pdf/slua618',
        note: 'The definitive engineering reference on gate charge, Miller plateau, bootstrap caps, and dead time.',
      },
      {
        label: 'Phil’s Lab KiCad Mixed-Signal & STM32 PCB Design Series',
        url: 'https://www.youtube.com/c/PhilsLab',
        note: 'Walks through 4-layer stackups, return paths, and JLCPCB SMT assembly files.',
      },
    ],
    quiz: {
      q1: 'In a half-bridge bootstrap gate driver, why can’t you hold the high-side N-MOSFET ON at 100% duty cycle indefinitely without a charge pump?',
      a1: 'The bootstrap capacitor C_boot only recharges when the low-side MOSFET turns ON and pulls the switch node SW to GND. At 100% high-side duty cycle, C_boot slowly drains through gate driver quiescent current and the high-side FET browns out.',
      q2: 'You use a 1 mΩ (0.001 Ω) shunt to measure 30 A. If your sense traces accidentally include 0.5 mΩ of main power-pad copper, what percentage error is introduced?',
      a2: 'The amplifier sees 1.5 mΩ instead of 1.0 mΩ—a massive +50% current measurement error! Kelvin sensing taps strictly inside the manganin shunt element to eliminate pad resistance.',
    },
  },
  {
    stepNumber: 'T2 · Step 3 / 8',
    trackCode: 'TRACK 02 (TIER 2)',
    trackTitle: 'Exact Constraint Design, Parametric CAD (`CadQuery`) & URDF/MuJoCo',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Generate Precision CAD Parts Programmatically & Build Validated Physics Models',
    coreWhy:
      'Instead of clicking around manually in hobby CAD or guessing robot inertias, Tier 2 teaches you to generate parametric `.step`/`.stl` parts in Python, apply Maxwell’s exact constraint rules, and validate URDF/MuJoCo models.',
    topics: [
      'Maxwell Exact Constraint (DOF = 6 - C) & Abbe Error: Designing mounts that never bind under thermal expansion and aligning encoders coaxial with load axes.',
      'Code-First Parametric CAD (CadQuery): Writing Python scripts that output watertight ISO 10303-21 `.step` and binary `.stl` meshes.',
      'URDF & MuJoCo MJCF Inertia Invariants: Enforcing positive-definite mass matrices and the principal inertia triangle inequality (I₁ + I₂ ≥ I₃) so physics engines never blow up.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Mechanics & Sim)',
    bridgeFrom: 'Tier 1: Over-constrained 3D-printed brackets & uncalibrated 2D stick figures',
    bridgeTo: 'Tier 2: Exact-Constraint Parametric CAD + Validated 3D URDF/MuJoCo Models',
    bridgeHow:
      'Export link mass, center-of-mass, and 3×3 inertia tensors directly from CAD into both URDF and MuJoCo XML files, and run automated Sylvester SPD and triangle-inequality assertions.',
    equation: '\\text{DOF} = 6 - C, \\qquad I_1 + I_2 \\ge I_3, \\qquad \\det(I) > 0',
    milestoneId: 't2_tr02',
    milestoneTask: 'Articulate all 3 Capstone URDF/MuJoCo models in Tab 5 and inspect the 3D CAD wireframes (Notch Flexure, Kelvin Coupling, 8:1 QDD Carrier) in Tab 6.',
    deliverableGate: 'Tier 2.2 Gate: Watertight STEP/STL meshes + SPD-validated URDF/MJCF robot models.',
    linkedTab: 'tab-models',
    presetId: 'robot_furuta_bal',
    presetLabel: 'Inspect URDF/MuJoCo Models (Tab 5)',
    studyLinks: [
      {
        label: 'MIT Precision Machine Design Principles (Slocum FUNdaMENTALS)',
        url: 'https://pergatory.mit.edu/resources/FUNdaMENTALS.html',
        note: 'Free textbook chapters by Prof. Alex Slocum on exact constraint, Abbe error, and bearings.',
      },
      {
        label: 'CadQuery Python Parametric CAD Documentation',
        url: 'https://cadquery.readthedocs.io/',
        note: 'Code-first Python CAD framework for generating STEP and STL files.',
      },
      {
        label: 'MuJoCo Physics Engine XML Modeling Guide',
        url: 'https://mujoco.readthedocs.io/en/stable/modeling.html',
        note: 'Explains rigid-body inertias, joint armatures, and actuator modeling.',
      },
    ],
    quiz: {
      q1: 'Why is supporting a single rigid shaft with THREE collinear radial ball bearings a classic mechanical design mistake?',
      a1: 'Two bearings already constrain 4 radial/tilt degrees of freedom. Adding a 3rd bearing over-constrains the shaft: any tiny misalignment bends the shaft on every rotation, causing massive friction and premature bearing failure.',
      q2: 'A colleague hand-types principal inertias I₁ = 0.01, I₂ = 0.01, I₃ = 0.05 kg·m² into a URDF file. Why will MuJoCo reject this link?',
      a2: 'It violates the principal inertia triangle inequality I₁ + I₂ ≥ I₃ (0.01 + 0.01 = 0.02 < 0.05). Even for an infinitely thin flat disc, I₃ can at most equal I₁ + I₂.',
    },
  },
  {
    stepNumber: 'T2 · Step 4 / 8',
    trackCode: 'TRACK 03 (TIER 2)',
    trackTitle: 'Clarke/Park Transforms, Type-II Velocity PLLs & IMU Allan Variance',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Look Inside the Black Box of FOC: Code Your Own Clarke/Park Transforms & Velocity Observer',
    coreWhy:
      'In Tier 1, `SimpleFOC` hid the math for you. In Tier 2, you write the Clarke and Park matrix transforms from scratch, build a Type-II Phase-Locked Loop (PLL) to get noise-free velocity from quantized encoders, and characterize IMU drift.',
    topics: [
      'Amplitude-Invariant Clarke & Park Transforms: Projecting (i_a, i_b, i_c) onto stationary (i_α, i_β) and rotating rotor (i_d, i_q) frames.',
      'Type-II Tracking PLL Velocity Observer: Eliminating the quantization spikes of `(θ[k] - θ[k-1])/dt` with a closed-loop phase/velocity observer.',
      'Allan Deviation Metrology: Plotting log-log σ(τ) curves from stationary IMU logs to extract exact Angle Random Walk (Q) and Bias Instability parameters for your Kalman filter.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Sensing & Commutation)',
    bridgeFrom: 'Tier 1: Calling `motor.move()` as a black box & finite-difference velocity',
    bridgeTo: 'Tier 2: Custom Clarke/Park C++ Structs + Type-II PLL Velocity Observer',
    bridgeHow:
      'Replace `(pos - last_pos)/dt` with a 6-line Type-II PLL (`err = wrap(theta_meas - theta_hat); w_hat += ki*err*dt; theta_hat += (w_hat + kp*err)*dt`) before feeding velocity to your D-term.',
    equation: '\\begin{bmatrix}i_d\\\\i_q\\end{bmatrix} = \\begin{bmatrix}\\cos\\theta_e & \\sin\\theta_e\\\\-\\sin\\theta_e & \\cos\\theta_e\\end{bmatrix} \\begin{bmatrix}i_\\alpha\\\\i_\\beta\\end{bmatrix}',
    milestoneId: 't2_tr03',
    milestoneTask: 'Explore the 25 kHz FOC simulator in Tab 3 across 1,200–5,500 RPM and observe how rotor speed couples into the d-q axes.',
    deliverableGate: 'Tier 2.3 Gate: Custom Clarke/Park implementation + lag-free Type-II velocity PLL.',
    linkedTab: 'tab-foc',
    presetId: 'foc_drone_prop',
    presetLabel: 'Test High-Speed FOC Coupling (Tab 3)',
    studyLinks: [
      {
        label: 'TI BPRA048: Field Orientated Control of 3-Phase AC-Motors',
        url: 'https://www.ti.com/lit/pdf/bpra048',
        note: 'Step-by-step derivation of Clarke and Park transforms with vector diagrams.',
      },
      {
        label: 'MathWorks: Inertial Sensor Noise Analysis Using Allan Variance',
        url: 'https://www.mathworks.com/help/nav/ug/inertial-sensor-noise-analysis-using-allan-variance.html',
        note: 'Shows how to read Angle Random Walk (-1/2 slope) and Bias Instability (0 slope) from σ(τ) plots.',
      },
    ],
    quiz: {
      q1: 'In a surface-mounted PMSM (where L_d = L_q), why do we command i_d* = 0 and put all current into i_q*?',
      a1: 'The d-axis aligns directly with the rotor permanent magnet flux—pushing current along d only pulls/pushes radially against the bearings without producing torque, wasting heat as I_d² R. The q-axis is perpendicular (90° electrical) to the magnet flux, producing 100% torque.',
      q2: 'Why does a Type-II PLL have zero steady-state phase lag during constant-velocity rotation, whereas a 1st-order low-pass filter on finite differences always lags?',
      a2: 'A Type-II PLL contains two integrators in its forward loop (one in velocity state ω̂ and one in angle state θ̂). By the Internal Model Principle, a double integrator tracks a ramp input (constant velocity) with zero steady-state error.',
    },
  },
  {
    stepNumber: 'T2 · Step 5 / 8',
    trackCode: 'TRACK 04 (TIER 2)',
    trackTitle: 'FreeRTOS Preemptive Scheduling, DMA Circular Buffers & CAN-FD (MIT Mode)',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Offload Peripherals to Hardware DMA & Command Multi-Joint Robots Over CAN Bus',
    coreWhy:
      'Polling SPI encoders or UART bytes wastes precious CPU microseconds. By configuring Direct Memory Access (DMA) and packing actuator commands into 8-byte CAN frames, one central computer can coordinate 12 robot joints at 1 kHz.',
    topics: [
      'Rate-Monotonic Scheduling & Response-Time Analysis (RTA): Mathematically proving that your 1 kHz control task, 200 Hz CAN task, and 50 Hz logging task will never miss a deadline (R_i ≤ D_i).',
      'Zero-CPU DMA Pipelines: Setting up SPI/ADC DMA channels so fresh sensor readings are waiting in RAM before the control interrupt even starts.',
      'MIT Cheetah CAN-FD Actuator Protocol: Bit-packing 16-bit position, 12-bit velocity, 12-bit Kp, 12-bit Kd, and 12-bit torque feedforward into 8 bytes + CRC-16.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Embedded Architecture)',
    bridgeFrom: 'Tier 1: Blocking `SPI.transfer()` calls & point-to-point USB Serial strings',
    bridgeTo: 'Tier 2: Hardware DMA Circular Buffers + Multi-Drop CAN-FD Bus with CRC-16',
    bridgeHow:
      'Add a $1.50 `TCAN1044V` transceiver to your MCU’s `FDCAN` pins, daisy-chain two twisted wires (`CAN_H` / `CAN_L`) across all robot joints, and pack commands using fixed-range bit shifts.',
    equation: 'R_i^{(k+1)} = C_i + B_i + \\sum_{j \\in hp(i)} \\left\\lceil \\frac{R_i^{(k)}}{T_j} \\right\\rceil C_j \\le D_i',
    milestoneId: 't2_tr04',
    milestoneTask: 'Verify multi-rate task schedulability and inspect real-time ISR-to-planner contention behavior in Tab 8.',
    deliverableGate: 'Tier 2.4 Gate: Exact RTA deadline proof + bit-exact MIT CAN frame encoder/decoder.',
    linkedTab: 'tab-eskf',
    presetId: 'eskf_seqlock_clean',
    presetLabel: 'Open RTOS & IPC Simulator (Tab 8)',
    studyLinks: [
      {
        label: 'FreeRTOS Official Mastering the Kernel Book (Free PDF)',
        url: 'https://www.freertos.org/Documentation/02-Kernel/07-Books-and-manual/01-RTOS_book',
        note: 'Covers preemptive scheduling, priority inheritance mutexes, and ISR notifications.',
      },
      {
        label: 'MaJerle STM32 USART/SPI DMA Circular Buffer Guide',
        url: 'https://github.com/MaJerle/stm32-usart-uart-dma-rx-tx',
        note: 'Production patterns for zero-CPU DMA ring buffers with half/complete interrupts.',
      },
      {
        label: 'TI SLOA101: Introduction to the Controller Area Network (CAN)',
        url: 'https://www.ti.com/lit/pdf/sloa101',
        note: 'Explains differential signaling, 120 Ω termination, and non-destructive bitwise arbitration.',
      },
    ],
    quiz: {
      q1: 'On a CAN bus, what happens if Joint 1 (CAN ID `0x01`) and Joint 5 (CAN ID `0x05`) start transmitting at the exact same microsecond?',
      a1: 'Neither packet is corrupted! CAN uses non-destructive bitwise arbitration where `0` is dominant and `1` is recessive. When transmitting the ID bits, `0x01` outputs dominant `0` while `0x05` outputs recessive `1`; Joint 5 sees the dominant bit, stops transmitting, and retries automatically once Joint 1 finishes.',
      q2: 'What is "Priority Inversion" in an RTOS, and how does Priority Inheritance fix it?',
      a2: 'Priority inversion occurs when a Low-priority task holds a mutex needed by a High-priority task, while a Medium-priority task preempts the Low-priority task—indirectly starving the High-priority task. Priority Inheritance temporarily boosts the Low-priority task to High priority until it releases the mutex.',
    },
  },
  {
    stepNumber: 'T2 · Step 6 / 8',
    trackCode: 'TRACK 05 (TIER 2)',
    trackTitle: 'Bode Loop Shaping, Gang of Four, LQR & Linear Kalman Filtering',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Move Beyond Single-Loop PID to Full-State LQR Balancing & Model-Based Kalman Filtering',
    coreWhy:
      'A single PID loop cannot easily stabilize an underactuated system like an inverted pendulum on a moving cart (1 motor, 2 degrees of freedom). LQR and Kalman filters let you control and estimate coupled multi-state systems systematically.',
    topics: [
      'Bode Sensitivity & The Waterbed Effect: Designing loop bandwidth and phase margin so sensitivity peak M_s ≤ 1.75 even when payload mass changes by ±25%.',
      'Åström Energy Swing-Up + LQR Catch: Pumping mechanical energy into a hanging pendulum until |θ| < 22°, then switching seamlessly to full-state feedback u = -Kx.',
      'Linear Kalman Filter Predict/Innovate Cycle: Estimating unmeasured velocities and disturbance forces from noisy position measurements.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Control & Estimation)',
    bridgeFrom: 'Tier 1: Hand-tuned PID gains & 2-line complementary filters',
    bridgeTo: 'Tier 2: Model-Based LQR State Feedback + Linear Kalman Filter',
    bridgeHow:
      'Linearize your nonlinear plant around upright equilibrium (A, B), choose diagonal state weights Q and effort weight R in Python (`scipy.linalg.solve_continuous_are`), and export the 4-element gain vector K to your firmware.',
    equation: 'u = -Kx, \\qquad K = R^{-1}B^\\top P, \\qquad A^\\top P + PA - PBR^{-1}B^\\top P + Q = 0',
    milestoneId: 't2_tr05',
    milestoneTask: 'Run the Furuta Pendulum simulator in Tab 4, adjust LQR angle weight Q_θ and swing-up gain k_E, and test impulse recovery.',
    deliverableGate: 'Tier 2.5 Gate: Autonomous pendulum swing-up and upright LQR stabilization.',
    linkedTab: 'tab-pend',
    presetId: 'pend_swingup',
    presetLabel: 'Run Swing-Up + LQR Sim (Tab 4)',
    studyLinks: [
      {
        label: 'Steve Brunton Control Bootcamp (LQR & Kalman Filter Lectures)',
        url: 'https://www.youtube.com/playlist?list=PLMrJAkhIeNNR20Mz-VpzgfQs5zrYi085m',
        note: 'Concise graduate-level intuition for state-space controllability, LQR, and Kalman filtering.',
      },
      {
        label: 'Kalman and Bayesian Filters in Python (Roger Labbe)',
        url: 'https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python',
        note: 'Interactive open-source Jupyter book building Kalman filters from scratch.',
      },
      {
        label: 'Åström & Murray: Feedback Systems Ch. 7, 8 & 12 (Gang of Four)',
        url: 'https://fbswiki.org/wiki/index.php/Main_Page',
        note: 'Covers sensitivity peak M_s, Bode’s integral theorem, and loop shaping.',
      },
    ],
    quiz: {
      q1: 'In Bode’s Sensitivity Integral ("The Waterbed Effect"), why does pushing down disturbance sensitivity |S(jω)| < 1 at low frequencies force |S(jω)| > 1 at higher frequencies?',
      a1: 'For any system with relative degree ≥ 2, the integral of ln|S(jω)| across all frequencies equals zero. Pushing down the waterbed in your control bandwidth forces a bulge (sensitivity peak M_s > 1) near crossover where noise and unmodeled resonances get amplified.',
      q2: 'Why do we augment a Kalman Filter’s state vector with a constant disturbance state d_k+1 = d_k when controlling a robot joint?',
      a2: 'Estimating the external disturbance torque d̂ and subtracting it from the motor command acts as a model-based Disturbance Observer (DOB), eliminating steady-state error without winding up an LQR controller.',
    },
  },
  {
    stepNumber: 'T2 · Step 7 / 8',
    trackCode: 'TRACK 06 & 07 (TIER 2)',
    trackTitle: 'Task-Space Jacobian Transpose, S-Curves, Regen Clamps & HIL Fault Testing',
    tierBadge: 'TIER 2 · APPLIED',
    headline: 'Command Cartesian Hand Forces Directly & Protect Hardware with Regen Choppers',
    coreWhy:
      'In Tier 2, your robot moves from joint-angle stepping to Cartesian hand compliance (τ = Jᵀ F_x), jerk-limited S-curve trajectories, and automated Hardware-in-the-Loop fault testing.',
    topics: [
      'Jacobian Transpose Cartesian Impedance: Making the robot’s hand behave like a 3D XYZ spring without solving inverse kinematics.',
      'Jerk-Bounded S-Curve Trajectories (Ruckig): Limiting the rate of change of acceleration (j_max) so fast moves never excite structural ringing.',
      'Regenerative Braking Bus Clamp & HIL Watchdogs: Sizing a braking resistor to absorb kinetic energy during emergency stops and injecting synthetic encoder CRC faults.',
    ],
    bridgeTitle: 'Bridging Tier 1 → Tier 2 (Robotics & Safety)',
    bridgeFrom: 'Tier 1: Joint-space cubic polynomials & manual benchtop E-stop switches',
    bridgeTo: 'Tier 2: Task-Space Jacobian Transpose Compliance + Active Regen Chopper + HIL Suite',
    bridgeHow:
      'Compute the 3×3 manipulator Jacobian J(q) at 1 kHz, multiply J(q)ᵀ by your desired Cartesian spring force F_x, and add a voltage comparator on V_bus to dump regenerative braking surge into a power resistor.',
    equation: '\\tau = J(q)^\\top \\big(K_x(x_d - x) - D_x \\dot{x}\\big) + g(q), \\qquad V_{\\text{bus,peak}} = \\sqrt{V_{\\text{nom}}^2 + \\frac{\\eta J\\omega_0^2}{C_{\\text{bus}}}}',
    milestoneId: 't2_tr06',
    milestoneTask: 'Test encoder wire-break CRC fault injection in Tab 5 and verify safe fault transitions.',
    deliverableGate: 'Tier 2.6 Gate: Working Cartesian Jacobian transpose controller + HIL fault test pass.',
    linkedTab: 'tab-models',
    presetId: 'sto_enc_crc',
    presetLabel: 'Test HIL Fault Injection (Tab 5)',
    studyLinks: [
      {
        label: 'Robotic Manipulation (Russ Tedrake, MIT Open Textbook)',
        url: 'https://manipulation.csail.mit.edu/',
        note: 'Covers Jacobian force duality (τ = Jᵀ F), Cartesian stiffness, and contact control.',
      },
      {
        label: 'Ruckig Online Jerk-Limited Trajectory Generator',
        url: 'https://github.com/pantor/ruckig',
        note: 'Open-source C++/Python library for time-optimal S-curve trajectories.',
      },
    ],
    quiz: {
      q1: 'Why does τ = J(q)ᵀ F_x remain completely well-defined and stable even when the robot arm stretches straight out into a kinematic singularity (det(J) = 0)?',
      a1: 'Unlike inverse kinematics (which divides by det(J) via J⁻¹ and explodes to infinity at a singularity), J(q)ᵀ only multiplies matrices—at full extension, forces perpendicular to the arm simply project to zero torque without dividing by zero.',
      q2: 'What happens if a heavy robot joint decelerates rapidly while powered by a benchtop power supply (which can only source current, not sink it) without a braking chopper?',
      a2: 'The motor acts as a generator and pumps kinetic energy into the DC bus capacitors, causing V_bus to skyrocket past the 60 V / 80 V rating of the MOSFETs and gate drivers, destroying the board.',
    },
  },
  {
    stepNumber: 'T2 · Step 8 / 8 (LEVEL-UP BOSS)',
    trackCode: 'TRACK 08 (TIER 2 CAPSTONE)',
    trackTitle: 'Tier 2 Graduation Capstone: Custom 4-Layer CAN Servo + LQR/Impedance Robot',
    tierBadge: 'TIER 2 · BOSS GATE',
    headline: 'Complete Your Applied Engineering Pass to Unlock Tier 3 Production Mastery',
    coreWhy:
      'You have transitioned from breadboards and maker libraries to custom KiCad PCBs, SMD assembly, DMA-driven RTOS firmware, MuJoCo physics models, and model-based LQR/Cartesian control.',
    topics: [
      'Hardware Deliverable: Custom 4-layer motor/sensor PCB with Kelvin current sensing and CAN-FD transceiver.',
      'Firmware Deliverable: DMA-backed SPI/ADC pipeline + Type-II velocity PLL + MIT-mode CAN impedance loop.',
      'Control Deliverable: Validated MuJoCo digital twin + autonomous swing-up LQR or multi-DOF Cartesian compliance.',
    ],
    equation: '\\tau_{\\text{cmd}} = K_p(q_{\\text{des}} - q) + K_d(v_{\\text{des}} - \\hat{v}_{\\text{PLL}}) + \\tau_{\\text{ff}}',
    milestoneId: 't2_tr08',
    milestoneTask: 'Complete all Tier 2 Applied Milestones across Tracks 00–08 to unlock the final Tier 3 Production & Graduate Mastery Pass!',
    deliverableGate: '🏆 TIER 2 GRADUATION: Unlock Tier 3 (Lie Groups, <2nH 48V FOC, WaitFreeSeqLock & STO).',
    linkedTab: 'tab-cadpcb',
    presetId: 'cad_qdd_carrier',
    presetLabel: 'Inspect QDD Actuator Design (Tab 6)',
    studyLinks: [
      {
        label: 'Ben Katz MIT Master’s Thesis: Low Cost Modular Actuators for Dynamic Robots',
        url: 'https://dspace.mit.edu/handle/1721.1/118671',
        note: 'The seminal open-access reference for custom FOC motor controllers, planetary QDD actuators, and MIT CAN mode.',
      },
      {
        label: 'Open Dynamic Robot Initiative (ODRI)',
        url: 'https://open-dynamic-robot-initiative.github.io/',
        note: 'Complete open-source mechanical, PCB, and firmware files for torque-controlled legged robots.',
      },
    ],
    quiz: {
      q1: 'Why do modern dynamic robots (like MIT Cheetah or humanoids) run the high-rate position/velocity impedance damper `Kp(q_d - q) + Kd(v_d - v)` ON THE MOTOR DRIVER MCU at 20–40 kHz rather than over the 1 kHz central CAN bus?',
      a1: 'A 1 ms CAN bus delay limits the maximum stable derivative damping gain Kd before high-frequency chatter occurs. Running the PD damper locally inside the 40 kHz actuator loop while streaming smooth setpoints + τ_ff at 1 kHz over CAN achieves 10× higher stable damping.',
      q2: 'Why do Quasi-Direct Drive (QDD) actuators use a low 6:1 to 9:1 single-stage planetary gear ratio instead of a 100:1 harmonic drive?',
      a2: 'Because reflected inertia scales as N², an 8:1 reduction has 64× rotor inertia whereas a 100:1 drive has 10,000× rotor inertia! Low reflected inertia lets the actuator absorb ground impacts without stripping gears and measure contact forces directly via motor current.',
    },
  },
];

// ============================================================================
// PASS 3: TIER 3 LINEAR ROADMAP (TRACK 00 -> TRACK 08: ADVANCED / PRODUCTION)
// ============================================================================
export const TIER_3_LINEAR_PASS: LinearTrackStep[] = [
  {
    stepNumber: 'T3 · Step 1 / 8',
    trackCode: 'TRACK 00 (TIER 3)',
    trackTitle: 'Matrix Lie Groups SO(3)/SE(3) & Symplectic Port-Hamiltonian Integration',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Operate Directly on Curved Rotation Manifolds with Zero Singularity & Exact Energy Conservation',
    coreWhy:
      'In production aerospace and legged robotics, Euler angles lock up and unnormalized quaternions drift off the unit sphere. Matrix Lie groups SO(3) and SE(3) with Taylor small-angle guards provide singularity-free 3D calculus.',
    topics: [
      'Rodrigues Exponential & Logarithmic Maps on so(3)/se(3) with machine-precision Taylor series branches for θ < 10⁻⁴ rad.',
      'Adjoint Wrench/Twist Transformations & Left/Right Manifold Jacobians.',
      'Symplectic Störmer-Verlet & Port-Hamiltonian Integrators with <10⁻⁹ J energy drift over 10,000 steps.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (Manifold Math)',
    bridgeFrom: 'Tier 2: Ad-hoc quaternion renormalization (`q /= norm(q)`) & RK4 energy drift',
    bridgeTo: 'Tier 3: Exact Lie Group `exp([ϕ]×)` Updates & Symplectic Port-Hamiltonian Solvers',
    bridgeHow:
      'Represent attitude errors in the 3D tangent vector space so(3) while storing nominal orientation as an exact 3×3 rotation matrix R ∈ SO(3) updated via R_new = R_old · exp([ω·dt]×).',
    equation: '\\exp([\\phi]_\\times) = I + \\frac{\\sin\\theta}{\\theta}[\\phi]_\\times + \\frac{1-\\cos\\theta}{\\theta^2}[\\phi]_\\times^2',
    milestoneId: 't3_tr00',
    milestoneTask: 'Verify the ASML Wafer Stage 390 Hz resonance suppression preset in Tab 2 and review the SO(3) small-angle guard in the 1-Page Reference Card.',
    deliverableGate: 'Tier 3.0 Gate: Lab 00 Suite — |ΔE| < 10⁻⁹ J & exact SO(3) tangent-space identities.',
    linkedTab: 'tab-bode',
    presetId: 'wafer_scanner',
    presetLabel: 'Run ASML Wafer Stage Sim (Tab 2)',
    studyLinks: [
      {
        label: 'Joan Solà: A Micro Lie Theory for State Estimation in Robotics (arXiv:1812.01537)',
        url: 'https://arxiv.org/abs/1812.01537',
        note: 'The definitive robotics tutorial on SO(3)/SE(3) exponential maps, Adjoints, and manifold Jacobians.',
      },
      {
        label: 'Barfoot: State Estimation for Robotics (Free PDF Textbook)',
        url: 'http://asrl.utias.utoronto.ca/~tdb/bib/barfoot_ser17.pdf',
        note: 'Graduate reference on matrix Lie groups and estimation on manifolds.',
      },
    ],
    quiz: {
      q1: 'In Rodrigues’ formula, why must production C++ code switch to the Taylor series 1 - θ²/6 and 1/2 - θ²/24 when θ < 10⁻⁴ rad?',
      a1: 'In IEEE-754 floating point, when θ → 0, cos(θ) rounds to 1.0, causing catastrophic cancellation in (1 - cos θ)/θ² and `0.0 / 0.0 = NaN` at rest. The Taylor series evaluates smoothly at θ = 0 with full machine precision.',
      q2: 'Why is the Box-Minus error ϕ = log(R_dᵀ R)^∨ invariant to choice of world coordinate frame?',
      a2: 'Rotating the world frame by R_0 transforms both R_d → R_0 R_d and R → R_0 R, so (R_0 R_d)ᵀ(R_0 R) = R_dᵀ R_0ᵀ R_0 R = R_dᵀ R—the arbitrary world frame cancels out completely.',
    },
  },
  {
    stepNumber: 'T3 · Step 2 / 8',
    trackCode: 'TRACK 01 (TIER 3)',
    trackTitle: '6-Layer <2 nH 48V/30A Inverter, Bessel AFE & SAR ADC Charge Buckets',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Eliminate 30A Switching Ringing, Size SAR Charge Buckets & Solve Coupled Electro-Thermal Loops',
    coreWhy:
      'At 48 V and 30 A switching in 20 ns (dI/dt = 1.5 A/ns), just 5 nH of stray PCB trace inductance spikes V_DS by +7.5 V and radiates severe EMI into your ADC. Production drives require <2 nH loops and sub-LSB SAR charge buckets.',
    topics: [
      'Sub-2 nH High-Frequency Commutation Loops: Placing 100 V X7R MLCC decoupling banks <1.5 mm from the high-side drain / low-side source over a solid Layer-2 ground plane.',
      '2nd-Order Bessel AAF & SAR ADC Charge Bucket Design: Sizing R_filt and C_filt ≥ 20·C_sh so the 4 MSPS SAR sampling switch kickback settles within 70 ns with <2.5° phase lag at 2.5 kHz.',
      'Coupled Electro-Thermal Fixed-Point Solver: Iterating MOSFET junction temperature T_j against temperature-dependent R_DS(on)(T_j) across conduction, switching, Q_rr, and dead-time losses.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (High-Power Mixed-Signal)',
    bridgeFrom: 'Tier 2: Basic 4-layer breakout carrier PCB & unbuffered ADC inputs',
    bridgeTo: 'Tier 3: 6-Layer 1.6 nH 48V/30A Inverter + Bessel AAF + SAR Charge Bucket',
    bridgeHow:
      'Use Layers 2 and 5 as solid reference planes immediately adjacent to outer signal/FET layers (prepreg height h = 0.1 mm) to cancel magnetic loop area, and place a 22 Ω + 1.5 nF NP0 charge bucket directly at the STM32 ADC pins.',
    equation: 'V_{DS,\\text{peak}} = V_{\\text{bus}} + L_{\\text{loop}}\\frac{dI}{dt} < 58\\text{ V}, \\qquad R_{DS}(T_j) = R_{25}\\big(1 + \\alpha(T_j - 25)\\big)',
    milestoneId: 't3_tr01',
    milestoneTask: 'Run the 30A Peak Torque Thermal Load preset in Tab 6 and verify V_DS,peak < 60 V and MOSFET T_j < 110 °C.',
    deliverableGate: 'Tier 3.1 Gate: Lab 01 & Capstone I PCB — V_DS,peak = 53.1 V, Efficiency = 99.11%.',
    linkedTab: 'tab-cadpcb',
    presetId: 'pcb_peak_30a',
    presetLabel: 'Run 30A Electro-Thermal Solver (Tab 6)',
    studyLinks: [
      {
        label: 'TI SBAA586: Charge-Bucket Circuit Design for SAR ADCs',
        url: 'https://www.ti.com/lit/pdf/sbaa586',
        note: 'Explains how to size R_filt and C_filt so SAR sampling kickback settles within <0.5 LSB.',
      },
      {
        label: 'Analog Devices MT-094: Microstrip & Stripline Design',
        url: 'https://www.analog.com/media/en/training-seminars/tutorials/MT-094.pdf',
        note: 'Formulas for loop inductance and high-speed image return currents.',
      },
    ],
    quiz: {
      q1: 'Why do we choose a 2nd-order Bessel filter alignment over a Butterworth or Chebyshev alignment for a motor current-sense anti-aliasing filter?',
      a1: 'A Bessel filter has maximally flat group delay (linear phase) in the passband and zero step-response overshoot, preserving exact peak current waveforms without eroding 2.5 kHz current-loop phase margin.',
      q2: 'Why can ignoring the temperature coefficient α_T of MOSFET R_DS(on) cause thermal runaway in a high-current motor drive?',
      a2: 'Silicon MOSFET R_DS(on) increases by ~50–70% from 25 °C to 125 °C. Higher T_j increases R_DS(on), which increases I²R heat, which further raises T_j in a positive feedback loop unless your heatsink thermal resistance R_θJA is small enough.',
    },
  },
  {
    stepNumber: 'T3 · Step 3 / 8',
    trackCode: 'TRACK 02 (TIER 3)',
    trackTitle: 'Screw PoE Kinematics, Paros-Weisbord Flexures & Featherstone O(n) RNEA',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Sub-Micron Monolithic Flexure Hinges, Kelvin 3-2-1 Couplings & O(n) Spatial Dynamics',
    coreWhy:
      'Precision lithography stages and legged robots demand zero-backlash mechanics and microsecond dynamics evaluation. Here you combine monolithic titanium flexures with Featherstone’s linear-time Recursive Newton-Euler Algorithm.',
    topics: [
      'Paros-Weisbord Circular Notch Flexures & Hertzian Kelvin Couplings: Designing monolithic Ti-6Al-4V elastic hinges (k_θ = 2Ebt^(5/2)/(9π√R)) and 3-2-1 kinematic mounts.',
      'Screw Theory Product of Exponentials (PoE): Computing forward kinematics and space/body Jacobians via matrix exponentials of 6D screw axes.',
      'Featherstone O(n) Spatial RNEA: Forward velocity/acceleration pass + backward wrench pass in 6D Plücker coordinates, verified against analytical Euler-Lagrange.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (Spatial Dynamics & Precision CAD)',
    bridgeFrom: 'Tier 2: Standard ball-bearing joints & numerical finite-difference Jacobians',
    bridgeTo: 'Tier 3: Monolithic Flexures / 8:1 QDD Carrier + Analytical O(n) RNEA',
    bridgeHow:
      'Replace rolling-element bearings in short-stroke precision axes with wire-EDM notch flexures, and compute exact inverse dynamics feedforward torques τ_ff = RNEA(q, q̇, q̈_d) inside your 1 kHz control loop.',
    equation: 'M(q)\\ddot{q} + C(q,\\dot{q})\\dot{q} + g(q) = \\tau, \\qquad k_\\theta = \\frac{2 E b t^{5/2}}{9\\pi\\sqrt{R}}',
    milestoneId: 't3_tr02',
    milestoneTask: 'Inspect the Ti-6Al-4V Notch Flexure and 440C Kelvin 3-2-1 Coupling in Tab 6 and tune web thickness t to observe rotational stiffness k_θ.',
    deliverableGate: 'Tier 3.2 Gate: Lab 02 Suite — ‖τ_RNEA - τ_Lagrange‖_∞ < 10⁻¹¹ N·m.',
    linkedTab: 'tab-cadpcb',
    presetId: 'cad_flexure_stage',
    presetLabel: 'Inspect Ti-6Al-4V Flexure CAD (Tab 6)',
    studyLinks: [
      {
        label: 'Roy Featherstone: Spatial Vector Algebra & RNEA Notes',
        url: 'https://royfeatherstone.org/spatial/',
        note: 'Official reference notes and code for 6D Plücker coordinates and O(n) RNEA.',
      },
      {
        label: 'Modern Robotics Ch. 4, 5 & 8 (Screw PoE & Dynamics)',
        url: 'https://hades.mech.northwestern.edu/index.php/Modern_Robotics',
        note: 'Complete derivations of Product of Exponentials and Newton-Euler inverse dynamics.',
      },
    ],
    quiz: {
      q1: 'In the Paros-Weisbord circular notch flexure equation, how sensitive is rotational stiffness k_θ to machining tolerances on minimum web thickness t?',
      a1: 'Because k_θ ∝ t^(5/2), a 10% machining error in minimum web thickness t changes rotational stiffness by 1.1^(2.5) - 1 ≈ +26.9%! That is why precision flexures are cut with wire-EDM (±2 µm tolerance).',
      q2: 'How do you set the base acceleration a_0 in the forward pass of RNEA so that all joint gravity torques g(q) are computed automatically without a separate gravity formula?',
      a2: 'Set the base spatial acceleration to point UPWARD at 1g (a_0 = -g_world = [0,0,0, 0,0,+9.81]ᵀ). By Einstein’s Equivalence Principle, accelerating the base upward at +g produces the exact same internal joint reaction forces as a downward gravitational field.',
    },
  },
  {
    stepNumber: 'T3 · Step 4 / 8',
    trackCode: 'TRACK 03 (TIER 3)',
    trackTitle: '25–40 kHz Decoupled d-q FOC, Min-Max SVPWM & Harmonic Encoder Calibration',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Sub-180 µs Current Step Response with Cross-Coupling Decoupling & Fourier LUT Metrology',
    coreWhy:
      'At high speeds (e.g., 5,500 RPM or explosive legged jumping), rotor back-EMF and ω_e L_q i_q cross-coupling overwhelm standard PI loops. Exact pole-zero cancellation + feedforward decoupling unlocks full bus utilization.',
    topics: [
      'Pole-Zero Cancellation PI + Synchronous Decoupling: Setting Kp = L·ω_bw, Ki = R·ω_bw and adding feedforward terms (-ω_e L_q i_q on d-axis, +ω_e(L_d i_d + λ_pm) on q-axis).',
      'Min-Max Zero-Sequence Space Vector PWM (SVPWM): Shifting neutral voltage by -½(max + min) to achieve +15.47% voltage boost with circular voltage vector clamping.',
      'Fourier Harmonic Encoder LUT Calibration: Eliminating off-axis magnet mounting eccentricity to achieve <0.04° Integral Nonlinearity (INL).',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (High-Dynamic FOC)',
    bridgeFrom: 'Tier 2: Uncoupled d-q PI loops & sinusoidal PWM (SPWM)',
    bridgeTo: 'Tier 3: Decoupled 40 kHz Current Loop + Min-Max SVPWM + Harmonic LUT',
    bridgeHow:
      'Add the two cross-coupling feedforward terms using your PLL velocity estimate ω_e, replace `sin()` modulation with min-max neutral injection, and subtract a 64-point flash LUT from raw SPI encoder readings.',
    equation: 'v_d^* = u_d - \\omega_e L_q i_q, \\quad v_q^* = u_q + \\omega_e(L_d i_d + \\lambda_{pm}), \\quad \\sqrt{v_d^{*2}+v_q^{*2}} \\le \\frac{V_{\\text{bus}}}{\\sqrt{3}}',
    milestoneId: 't3_tr03',
    milestoneTask: 'In Tab 3, toggle Cross-Coupling Decoupling OFF and ON at 2,500 RPM and run the 24A Hopper Jump preset to verify ≤180 µs rise time.',
    deliverableGate: 'Tier 3.3 Gate: Lab 03 Suite — t_rise ≤ 180 µs, INL < 0.04°, +15.47% SVPWM boost.',
    linkedTab: 'tab-foc',
    presetId: 'foc_qdd_jump',
    presetLabel: 'Run 24A Hopper Jump FOC (Tab 3)',
    studyLinks: [
      {
        label: 'TI SPRABQ2: Space Vector PWM (SVPWM) & Min-Max Injection',
        url: 'https://www.ti.com/lit/pdf/sprabq2',
        note: 'Proves the mathematical equivalence of 7-segment SVPWM and min-max neutral injection.',
      },
      {
        label: 'Ben Katz Thesis Ch. 3: High-Bandwidth Current Control & Encoder Calibration',
        url: 'https://dspace.mit.edu/handle/1721.1/118671',
        note: 'Details pole-zero cancellation PI tuning and lookup-table eccentricity calibration.',
      },
    ],
    quiz: {
      q1: 'Why does Min-Max Zero-Sequence injection increase the maximum undistorted line-to-line motor voltage by +15.47% without distorting phase currents?',
      a1: 'In a 3-phase motor with an isolated neutral star point, adding the same common-mode offset v_0 to all 3 phases cancels out in every line-to-line voltage (v_ab = v_a - v_b). Shifting v_0 = -0.5(max + min) centers the waveform and flattens the peaks by cos(30°) = √3/2, giving a 2/√3 = 1.1547× boost.',
      q2: 'What physical mounting errors create the 1st harmonic (sin θ_m) vs. the 2nd harmonic (sin 2θ_m) in an on-axis magnetic encoder’s INL curve?',
      a2: 'The 1st harmonic (once per rev) is caused by radial eccentricity (magnet center offset from shaft axis), whereas the 2nd harmonic (twice per rev) is caused by magnet tilt/skew or X/Y Hall gain mismatch.',
    },
  },
  {
    stepNumber: 'T3 · Step 5 / 8',
    trackCode: 'TRACK 04 (TIER 3)',
    trackTitle: 'Bare-Metal STM32G474 TIM1→ADC Triggering, CORDIC & C++20 `WaitFreeSeqLock<T>`',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Zero Heap Allocations, 6-Cycle Hardware CORDIC & 30 ns Lock-Free Multi-Thread Telemetry',
    coreWhy:
      'In a 40 kHz ISR (25 µs budget), a mutex lock or torn struct read between the motor interrupt and the 1 kHz planner causes violent torque glitches. Lock-free sequence locks guarantee atomic multi-word transfers in <30 ns.',
    topics: [
      'Hardware Autonomous Trigger Chain: `TIM1_TRGO2` center-aligned peak trigger → simultaneous `ADC1`/`ADC2` Kelvin shunt sampling → DMA completion ISR.',
      'STM32G474 Hardware CORDIC & Zero-Wait-State CCM SRAM: Computing Q1.31 sin/cos in 6 clock cycles and executing the entire ISR from Tightly Coupled Memory.',
      'C++20 `WaitFreeSeqLock<T>`: Using `std::atomic<uint32_t>` odd/even sequence counters with `memory_order_acquire`/`release` so the 1 kHz reader retries automatically if preempted by the 40 kHz ISR.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (Hard Real-Time Concurrency)',
    bridgeFrom: 'Tier 2: RTOS Mutexes / Critical Sections (`taskENTER_CRITICAL()`) that add ISR jitter',
    bridgeTo: 'Tier 3: Zero-Jitter `WaitFreeSeqLock<T>` + CCM SRAM Execution',
    bridgeHow:
      'Wrap your shared telemetry struct in a template `WaitFreeSeqLock<ActuatorState>`: the writer increments `seq` to odd before writing and even after; the reader loops `do { s0 = seq; copy; s1 = seq; } while (s0 != s1 || (s0 & 1));`.',
    equation: '\\text{SeqLock Retry Condition: } (s_0 \\neq s_1) \\lor (s_0 \\bmod 2 = 1)',
    milestoneId: 't3_tr04',
    milestoneTask: 'In Tab 8, toggle `WaitFreeSeqLock` vs. Unprotected Shared Struct to observe corrupted torn-read spikes vs. 0 torn reads across 250k cycles.',
    deliverableGate: 'Tier 3.4 Gate: Lab 04 & Firmware Suite — 0 heap allocs, 0 torn reads, <30 ns latency.',
    linkedTab: 'tab-eskf',
    presetId: 'eskf_torn_race',
    presetLabel: 'Compare Torn Reads vs SeqLock (Tab 8)',
    studyLinks: [
      {
        label: 'STM32G474 Reference Manual RM0440 (TIM1, ADC & CORDIC)',
        url: 'https://www.st.com/resource/en/reference_manual/rm0440-stm32g4-series-advanced-armbased-32bit-mcus-stmicroelectronics.pdf',
        note: 'Complete hardware reference for center-aligned PWM triggers and CORDIC acceleration.',
      },
      {
        label: 'Preshing on Programming: Acquire and Release Semantics',
        url: 'https://preshing.com/20120913/acquire-and-release-semantics/',
        note: 'Clear visual explanation of C++ atomic memory barriers and lock-free synchronization.',
      },
    ],
    quiz: {
      q1: 'In a 3-phase inverter with low-side Kelvin shunts, why must the ADC trigger specifically at the PEAK (Counter = ARR) of the center-aligned PWM triangle wave?',
      a1: 'Current only flows through the low-side shunt when the low-side MOSFET is ON. At the triangle peak (Counter = ARR), all three high-side FETs are OFF and all three low-side FETs are simultaneously ON in the middle of the V_0 zero vector, with switching transients already settled.',
      q2: 'In `WaitFreeSeqLock<T>`, why must the reader check BOTH `s0 != s1` AND `(s0 & 1) != 0`?',
      a2: 'If the reader starts while the 40 kHz ISR is already mid-write (`s0` is odd) and finishes before the ISR completes (`s1` equals the same odd `s0`), checking only `s0 != s1` would falsely accept a half-written struct! Checking `(s0 & 1)` catches any read that overlapped an active write.',
    },
  },
  {
    stepNumber: 'T3 · Step 6 / 8',
    trackCode: 'TRACK 05 (TIER 3)',
    trackTitle: 'Joseph-Form Manifold ESKF, Receding-Horizon MPC & Control Barrier Function QPs',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Estimate Hidden Gyro Biases on SO(3) & Enforce Hard Workspace Walls via Real-Time CBF-QPs',
    coreWhy:
      'Standard covariance updates P = (I - KH)P lose symmetry and go negative-definite in finite precision. Joseph-form updates guarantee positive-definiteness, while Control Barrier Functions act as a provable mathematical safety shield.',
    topics: [
      'Joseph-Form Manifold ESKF: Fusing 6-DOF IMU + vector observations to estimate attitude and hidden gyro bias b_g with χ²₆ NEES consistency.',
      'Box-Constrained Model Predictive Control (MPC): Solving multi-step lookahead trajectories under hard actuator voltage/torque limits.',
      'Exponential Control Barrier Functions (ECBF-QP): Filtering nominal LQR/MPC commands via h(x, ẋ) = (x_max - |x|) - |ẋ|/α ≥ 0 so the robot decelerates smoothly before hitting physical walls.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (Certifiable Estimation & Safety)',
    bridgeFrom: 'Tier 2: Standard EKF `(I-KH)P` updates & unconstrained LQR',
    bridgeTo: 'Tier 3: Symmetric Joseph-Form ESKF on SO(3) + Active-Set CBF-QP Filter',
    bridgeHow:
      'Wrap your LQR torque output u_nom in a 1D closed-form CBF projection `u_safe = clamp(u_nom, u_min_cbf(x, v), u_max_cbf(x, v))` that computes the exact braking force required to respect ±x_max.',
    equation: 'P^+ = (I - KH)P^-(I - KH)^\\top + KRK^\\top, \\qquad \\dot{h}(x,u) + \\alpha h(x) \\ge 0',
    milestoneId: 't3_tr05',
    milestoneTask: 'Test the Tight ±0.50m CBF Safety Wall preset in Tab 4 and the High Gyro Bias Recovery preset in Tab 8.',
    deliverableGate: 'Tier 3.5 Gate: Lab 05 Suite — NEES ∈ χ²_95% & 0 CBF safety wall violations.',
    linkedTab: 'tab-pend',
    presetId: 'pend_cbf_wall',
    presetLabel: 'Test Tight ±0.50m CBF Wall (Tab 4)',
    studyLinks: [
      {
        label: 'Joan Solà: Quaternion Kinematics for the Error-State Kalman Filter (arXiv:1711.02508)',
        url: 'https://arxiv.org/abs/1711.02508',
        note: 'Complete derivation of manifold ESKF prediction, injection, and reset.',
      },
      {
        label: 'Aaron Ames et al.: Control Barrier Functions Theory and Applications (arXiv:1903.11199)',
        url: 'https://arxiv.org/abs/1903.11199',
        note: 'Foundational tutorial on CBF-QP safety filters and relative-degree-2 ECBFs.',
      },
    ],
    quiz: {
      q1: 'Why does the standard Kalman covariance update P⁺ = (I - KH)P⁻ fail in long-running 32-bit float firmware, and how does the Joseph form fix it?',
      a1: 'Subtracting two nearly equal matrices (I - KH)P⁻ suffers from floating-point rounding that makes P⁺ asymmetric and eventually yields negative diagonal variances (NaN). The Joseph form (I-KH)P⁻(I-KH)ᵀ + KRKᵀ is the sum of two symmetric positive-definite quadratic forms, guaranteeing symmetry and positive definiteness.',
      q2: 'Why can’t you use the simple position barrier h(x) = x_max - x directly for a torque-controlled robot joint without including velocity ẋ?',
      a2: 'Position x has relative degree 2 with respect to motor torque u (torque controls acceleration ẍ, not velocity ẋ). Differentiating h(x) once gives ẋ, which does not contain u! An Exponential CBF h_e(x, ẋ) = (x_max - x) - ẋ/α has relative degree 1 so u appears directly in ḣ_e.',
    },
  },
  {
    stepNumber: 'T3 · Step 7 / 8',
    trackCode: 'TRACK 06 & 07 (TIER 3)',
    trackTitle: 'Khatib Operational-Space WBC, Schroeder Multisine SysID & <1 µs Dual-Channel STO',
    tierBadge: 'TIER 3 · PRODUCTION',
    headline: 'Dynamically Consistent Null-Space Control, Low-Crest-Factor SysID & IEC 61800-5-2 Hardware STO',
    coreWhy:
      'Production robots must identify their own resonances in closed loop without saturating actuators, decouple multi-link inertia during contact tasks, and cut MOSFET gate power in <1 µs via redundant hardware paths if a short occurs.',
    topics: [
      'Khatib Operational-Space Inertia Λ(q) & Null-Space Projector Nᵀ = I - Jᵀ J̄ᵀ: Zero end-effector acceleration coupling from secondary posture tasks.',
      'Schroeder Quadratic-Phase Multisine SysID: Injecting M harmonics with φ_k = -πk(k-1)/M (Crest Factor = 1.66) to estimate P̂(jω) = S_yd / S_ud in closed loop.',
      'IEC 61800-5-2 Dual-Channel Safe Torque Off (STO): Independent hardware `STO_A` + `STO_B` gate cutoff in 0.65 µs (<1 µs) with 100 µs boot dark-pulse BIST diagnostics.',
    ],
    bridgeTitle: 'Bridging Tier 2 → Tier 3 (Production WBC, SysID & Functional Safety)',
    bridgeFrom: 'Tier 2: Single-tone sine sweeps, kinematic pseudoinverses & software fault checks',
    bridgeTo: 'Tier 3: Schroeder Multisine Closed-Loop FRF + Inertia-Weighted J̄ + <1 µs Hardware STO',
    bridgeHow:
      'Replace zero-phase multisine bursts (which spike at t=0 and clip amplifiers) with Schroeder quadratic phases, and wire overcurrent comparator outputs directly to `TIM1_BKIN` and the gate driver enable pin.',
    equation: '\\phi_k^{\\text{Schroeder}} = -\\frac{\\pi k(k-1)}{M}, \\qquad \\Lambda(q) = (J M^{-1} J^\\top)^{-1}',
    milestoneId: 't3_tr06',
    milestoneTask: 'Compare Schroeder vs. Zero-Phase Clipping in Tab 7, and trigger the <1 µs 42A Short Desat Trip in Tab 5.',
    deliverableGate: 'Tier 3.6 Gate: Lab 06 & 07 Suites — CF = 1.66, RMS SysID error < 0.5 dB, STO trip = 0.65 µs.',
    linkedTab: 'tab-sysid',
    presetId: 'sysid_zero_clip',
    presetLabel: 'Compare Schroeder vs Zero-Phase (Tab 7)',
    studyLinks: [
      {
        label: 'Khatib (1987): A Unified Approach for Motion and Force Control (Operational Space)',
        url: 'https://cs.stanford.edu/groups/manips/publications/pdfs/Khatib_1987_RA.pdf',
        note: 'Seminal paper deriving Λ(q) and the dynamically consistent generalized inverse J̄.',
      },
      {
        label: 'TI SLLA547: Functional Safety Dual-Channel Safe Torque Off (STO) Design',
        url: 'https://www.ti.com/lit/pdf/slla547',
        note: 'Hardware schematic architectures for IEC 61800-5-2 SIL-3 Safe Torque Off.',
      },
    ],
    quiz: {
      q1: 'In a closed-loop servo system, why does the naive direct FRF estimator Y(jω)/U(jω) return a biased transfer function when sensor noise is present, and how does the indirect estimator S_yd / S_ud fix it?',
      a1: 'Because the feedback controller feeds sensor noise n(t) back into actuator command u(t), U(jω) is correlated with noise! Since the external Schroeder excitation d(t) is uncorrelated with sensor noise, dividing cross-spectra S_yd(jω) / S_ud(jω) cancels out the noise contribution.',
      q2: 'In an IEC 61800-5-2 SIL-3 Safe Torque Off circuit, why do we inject 100 µs "dark test pulses" into STO_A and STO_B at startup?',
      a2: 'To detect "latent faults" (such as a shorted transistor stuck in the ON state). If the MCU briefly pulses STO_A LOW and the feedback diagnostic pin does not drop LOW, the firmware refuses to arm the drive and flags a safety hardware fault.',
    },
  },
  {
    stepNumber: 'T3 · Step 8 / 8 (FINAL MASTERY)',
    trackCode: 'TRACK 08 (TIER 3 CAPSTONES)',
    trackTitle: 'Full Production Capstones I–IV: 48V FOC Drive, Furuta, 6-DOF Arm & QDD Hopper',
    tierBadge: 'TIER 3 · MASTERY',
    headline: 'Complete All 4 Production Capstones & Pass All 12 Automated Verification Suites',
    coreWhy:
      'You have completed all three passes across the mechatronics roadmap—progressing from Level 0 hydraulic analogies and breadboards to full production-grade electromechanical co-design.',
    topics: [
      'Capstone I: 48V / 30A FOC Smart Actuator (KiCad netlist, $40.47 BOM, thermal solver, STM32G474 40 kHz C++20 firmware).',
      'Capstone II: Furuta Rotary Inverted Pendulum (URDF/MJCF + Swing-Up + LQR + ECBF-QP safety walls).',
      'Capstone III: 6-DOF Serial Manipulator (Screw PoE + O(n) RNEA + Khatib Operational-Space Impedance + Ruckig).',
      'Capstone IV: 3-DOF QDD Hopping Leg (8:1 7075-T6 planetary carrier STEP/STL + Joseph ESKF + contact-scheduled WBC).',
    ],
    equation: '\\text{All 12 Hardware, CAD, PCB, Firmware & Control Verification Gates} = \\text{PASS}',
    milestoneId: 't3_tr08',
    milestoneTask: 'Complete all Tier 3 Production Milestones to achieve 100% MechaLab Roadmap Mastery!',
    deliverableGate: '🏆 FULL ROADMAP MASTERY: 12/12 Production Suites Verified.',
    linkedTab: 'tab-models',
    presetId: 'robot_hopper_crouch',
    presetLabel: 'Inspect All Capstone Models (Tab 5)',
    studyLinks: [
      {
        label: 'NASA Systems Engineering Handbook (SP-2016-6105 Rev2)',
        url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
        note: 'Authoritative guide to cyber-physical system verification, HIL testing, and qualification.',
      },
      {
        label: 'ETH Zürich Robotic Systems Lab (RSL) Publications',
        url: 'https://rsl.ethz.ch/publications.html',
        note: 'Production legged and mobile manipulation research papers and open-source code.',
      },
    ],
    quiz: {
      q1: 'Look at the Master Cyber-Physical Coupling Equation at the bottom of this tab. How does a 1.5 ms timing delay in the embedded RTOS (Track 04) directly cause physical structural chatter in the mechanical plant (Track 02)?',
      a1: 'A time delay T_d injects linear phase lag Δφ = -ω·T_d into the control loop. At the mechanical resonance frequency f_r (e.g., 290 Hz), 1.5 ms of delay eats 156° of phase margin, turning negative damping feedback into positive regenerative excitation of the flexible shaft!',
      q2: 'Across Capstones I–IV, why do we enforce automated CI verification gates (SPD inertia checks, thermal convergence, SeqLock zero torn reads, <1 µs STO) before deploying code to physical hardware?',
      a2: 'Because in cyber-physical systems, software bugs manifest as physical kinetic energy and thermal dissipation—catching an invalid inertia matrix, an uncalibrated encoder harmonic, or a torn struct read in automated CI prevents catastrophic hardware destruction.',
    },
  },
];

export const SIMULATOR_TIER_GUIDES: Record<
  Exclude<TabId, 'tab-arch'>,
  Record<ActiveTierPass, { badge: string; title: string; focus: string; actionHint: string }>
> = {
  'tab-bode': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Hydraulic/Mechanical Analogy: Heavy Bowling Ball on a Rubber Rod',
      focus: 'Before looking at transfer functions, picture spinning a bowling ball (J_L) with a stretchy rubber rod (k_s). At one specific speed (f_r), the rod twists violently (+24 dB).',
      actionHint: 'Drag Shaft Stiffness k_s up and down to feel how a stiffer rod raises the whistling pitch f_r.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Observing Mechanical Resonance & Why High PID Gains Shake Robots',
      focus: 'In Pass 1, understand the difference between the motor encoder curve (Cyan, which has an anti-resonance dip f_ar) and the load tip (Amber).',
      actionHint: 'Click "Da Vinci Cable" to see a low-stiffness 142 Hz surgical cable drive.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Designing a Pre-Warped Tustin Digital Biquad Notch Filter',
      focus: 'In Pass 2, you code a 5-multiply Transposed Direct Form II biquad filter H_notch(z) tuned to f_notch = f_r to surgically scoop out the resonance peak.',
      actionHint: 'Click "Auto-Tune f_notch ← f_r" and adjust Quality Factor Q_n to flatten the green curve.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'Sub-Nanometer Lithography Stage Loop Shaping & Float32 Quantization',
      focus: 'In Pass 3, verify ≥25 dB resonance attenuation on a 390 Hz wafer stage while maintaining phase margin and Gang-of-Four sensitivity bounds.',
      actionHint: 'Click "ASML Wafer" and verify Notch Gain @ f_r is ≤ -25 dB.',
    },
  },
  'tab-foc': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Wrench Analogy: Pulling on the Handle (i_d) vs. Pushing 90° Sideways (i_q)',
      focus: 'Imagine turning a bolt with a wrench: pulling straight along the handle (i_d) produces zero torque and just heats the bearing; pushing 90° perpendicular (i_q) produces 100% pure torque.',
      actionHint: 'Adjust Step q-Axis Command i_q* to see how motor torque current steps up.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: '3-Phase Sinusoidal Commutation & SimpleFOC Basics',
      focus: 'In Pass 1, observe the bottom plot: 3-phase duty cycles (da, db, dc) shifted by 120° that create a smoothly rotating magnetic field.',
      actionHint: 'Set Mechanical Speed to 1200 RPM ("Surgical Cobot") and inspect the 3-phase waveforms.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Clarke/Park d-q PI Tuning & Pole-Zero Cancellation',
      focus: 'In Pass 2, see how Proportional (Kp = L·ω_bw) and Integral (Ki = R·ω_bw) gains scale directly with your desired Current Loop Bandwidth f_bw.',
      actionHint: 'Drag Current Loop Bandwidth f_bw from 1000 Hz to 3500 Hz and watch 0–90% Rise Time drop.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: '25 kHz Synchronous Cross-Coupling Decoupling & +15.47% Min-Max SVPWM',
      focus: 'In Pass 3, observe how high rotor speed ω_e injects false d-axis current error (Rose curve) unless ±ω_e L_dq feedforward decoupling is active, plus saddle-wave SVPWM boost.',
      actionHint: 'Click "5500 RPM Drone" and toggle Decoupling ON/OFF to see the Rose i_d error spike vanish!',
    },
  },
  'tab-pend': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Playground Swing Pumping + Broomstick Balancing + Invisible Force-Field Bumper',
      focus: 'You cannot lift a heavy pendulum straight up with a weak motor—you pump it back and forth like a playground swing until upright, then balance it like a broomstick.',
      actionHint: 'Click "Reset Hanging" to watch the cart pump energy and catch the pendulum upright.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Stabilizing an Upright Pendulum Around Equilibrium',
      focus: 'In Pass 1, focus on the upright balancing phase (|θ| < 22°): when the rod tilts right, the cart accelerates right to get underneath the center of mass.',
      actionHint: 'Click "Reset Upright (θ₀ = 10°)" and adjust LQR Angle Weight Q_θ.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Åström Energy Pumping Swing-Up & Full-State LQR Handoff',
      focus: 'In Pass 2, tune Energy Swing-Up Gain k_E so total mechanical energy E(θ, θ̇) converges to the upright homoclinic orbit before switching to u = -Kx.',
      actionHint: 'Click "Inject +3.2 rad/s Kick" to test disturbance recovery.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'Exponential Control Barrier Function (ECBF-QP) Hard Workspace Wall Filter',
      focus: 'In Pass 3, the CBF safety filter h(x, ẋ) = (x_max - |x|) - |ẋ|/α ≥ 0 overrides LQR in real time whenever the cart approaches the dashed red walls ±x_max.',
      actionHint: 'Drag CBF Safety Wall x_max down to 0.50 m and inject a kick—watch the cart brake right at the red line!',
    },
  },
  'tab-models': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Forward Kinematics & Why Hardware Safety Switches Beat Software `if` Statements',
      focus: 'Move the joint sliders (q₁, q₂, q₃) to see how joint angles add up along a robot chain—and see how a hardware cutoff kills power if a short circuit happens.',
      actionHint: 'Drag Joint q₁, q₂, q₃ sliders to move the robot leg and watch the TCP coordinates update.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Multi-Link Forward Kinematics & End-Effector Workspace',
      focus: 'In Pass 1, explore how shoulder, hip, and knee angles map to foot/hand coordinates (x, y) across the Hopper, 6-DOF Arm, and Furuta models.',
      actionHint: 'Switch between Capstone IV Hopper, Capstone III 6-DOF Arm, and Capstone II Furuta.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Validated URDF / MuJoCo Inertia Tensors & SPI Encoder CRC Watchdogs',
      focus: 'In Pass 2, verify Sylvester positive-definiteness (I > 0) and the triangle inequality (I₁ + I₂ ≥ I₃), plus 2-cycle SPI encoder wire-break detection.',
      actionHint: 'Click "Encoder Wire Break" to simulate a 50.0 µs (2-cycle) CRC-16 watchdog trip.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'IEC 61800-5-2 Dual-Channel Hardware Safe Torque Off (<1 µs Desat Shutdown)',
      focus: 'In Pass 3, a 42 A phase short triggers hardware comparator `TIM1_BKIN` + `STO_A/B`, driving all 6 MOSFET gates to SAFE HIGH-Z in 0.65 µs without waiting for software.',
      actionHint: 'Click "Inject 42A Short (<1µs)" and observe the 0.65 µs hardware STO gate shutdown.',
    },
  },
  'tab-cadpcb': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Why Thin Titanium Bends Without Friction & Why Stray Wire Inductance Spikes Voltage',
      focus: 'Explore the 3 mechanical parts on the left and the 48V motor board heat budget on the right. Every amp of current generates heat P = I²R in the MOSFETs.',
      actionHint: 'Drag Phase Current I_rms from 5 A to 30 A and watch MOSFET Temperature T_j rise.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Reading a Bill of Materials (BOM) & Understanding Inverter Power Loss',
      focus: 'In Pass 1, inspect the 6 core chips on a brushless motor controller (MCU, Gate Driver, MOSFETs, Current Amps, Shunts, Encoder/CAN) and their voltage ratings.',
      actionHint: 'Review the $40.47 BOM table and switch between the 3 CAD parts.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: '4-Terminal Kelvin Shunts, Exact-Constraint Kelvin Couplings & 8:1 QDD Gears',
      focus: 'In Pass 2, examine how the 3-2-1 Kelvin coupling locks 6 DOF without thermal binding, and compare conduction losses vs. PWM switching losses.',
      actionHint: 'Select "Kelvin 3-2-1" and "8:1 QDD Carrier", and adjust SVPWM Frequency f_pwm.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'Paros-Weisbord Flexure Stiffness, <2 nH Commutation Loops & Coupled T_j(R_DS) Solver',
      focus: 'In Pass 3, solve the coupled electro-thermal loop for R_DS(on)(T_j) and keep parasitic loop inductance L_loop < 2 nH so turn-off V_DS,peak stays safely below 60 V.',
      actionHint: 'Drag Loop Inductance L_loop above 4.0 nH to see V_DS,peak breach the 60 V gate!',
    },
  },
  'tab-sysid': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Piano Chord Analogy: Hitting 32 Keys at t=0 vs. Playing a Smooth Arpeggio',
      focus: 'To test a robot across many frequencies at once, we inject a sum of sine waves. If they all peak at t=0, the huge spike clips the motor; staggering their phases spreads the energy smoothly.',
      actionHint: 'Click "Toggle Schroeder vs. Zero-Phase" to see the giant t=0 spike vs. smooth waveform.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Frequency Response Intuition & Signal-to-Noise Averaging',
      focus: 'In Pass 1, see how measurement noise σ_v scatters the identified green Bode dots, and how averaging across multiple periods P_avg cleans up the measurement.',
      actionHint: 'Drag Measurement Noise σ_v up to 0.25, then increase Averaged Periods P_avg to 20.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Crest Factor Compression & Multi-Harmonic Excitation Design',
      focus: 'In Pass 2, adjust the number of excited harmonics M and observe how Zero-Phase Crest Factor grows as √(2M) while Schroeder phasing stays below 1.7.',
      actionHint: 'Increase Excited Harmonics M to 48 and compare Zero-Phase CF vs. Schroeder CF.',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'Manfred Schroeder Quadratic Phase Law & Unbiased Closed-Loop Spectral FRF',
      focus: 'In Pass 3, compute φ_k = -πk(k-1)/M and extract the unbiased plant estimate P̂(jω_k) = S_yd(jω_k) / S_ud(jω_k) inside an active feedback loop with <0.5 dB RMS error.',
      actionHint: 'Click "48-Tone Schroeder" vs. "Zero-Phase Clipping" to see amplifier saturation bias.',
    },
  },
  'tab-eskf': {
    level0: {
      badge: 'LEVEL 0 INTUITION',
      title: 'Why Gyroscopes Drift Over Time & Why Concurrent Thread Reads Tear Data in Half',
      focus: 'Top plot: Even a tiny constant error in a gyroscope adds up into a runaway tilt angle (Rose curve) unless corrected by gravity. Bottom plot: Reading a struct while an interrupt writes it causes glitch spikes.',
      actionHint: 'Click "Toggle WaitFreeSeqLock" to see clean telemetry vs. red torn-read spikes.',
    },
    tier1: {
      badge: 'TIER 1 · BEGINNER PASS',
      title: 'Observing Uncompensated Gyro Bias Drift vs. Sensor Fusion',
      focus: 'In Pass 1, drag True Gyro Bias b_g up and watch how fast raw gyro integration (Rose curve) diverges to 45° within seconds while the filter (Emerald) stays flat.',
      actionHint: 'Drag True Gyro Bias b_g from 0.05 to 0.30 rad/s and watch the Cyan bias estimate converge.',
    },
    tier2: {
      badge: 'TIER 2 · APPLIED PASS',
      title: 'Kalman Filter Covariance Tuning & Multi-Rate ISR/Planner Contention',
      focus: 'In Pass 2, adjust Vector Measurement Noise σ_meas to see how the Kalman gain trades off noisy attitude updates against gyro bias convergence speed.',
      actionHint: 'Adjust Vector Measurement Noise σ_meas and ISR Contention Rate [%].',
    },
    tier3: {
      badge: 'TIER 3 · PRODUCTION PASS',
      title: 'Joseph-Form Manifold ESKF on SO(3) & C++20 `WaitFreeSeqLock<T>` Atomic IPC',
      focus: 'In Pass 3, verify symmetric Joseph-form covariance updates P⁺ = (I-KH)P⁻(I-KH)ᵀ + KRKᵀ with χ²₆ NEES consistency, paired with 29.6 ns lock-free sequence locking.',
      actionHint: 'Click "Enable SeqLock (0 Torn)" and verify Mean NEES (PASS) and 0 Torn Reads.',
    },
  },
};
