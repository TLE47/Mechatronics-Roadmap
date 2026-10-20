import React, { useState, useEffect, useRef } from 'react';
import {
  Compass,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Terminal,
  Cpu,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';

export interface PlacementQuestion {
  id: string;
  stageBadge: string;
  moduleId: string;
  lessonId: string;
  lessonTitle: string;
  prereqChain: string[];
  question: string;
  codeSnippet?: string;
  options: { label: string; isCorrect: boolean; explanation: string }[];
  recommendedTab?: number;
}

export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  {
    id: 'q1-python-loops',
    stageBadge: 'Track P · P.1–P.6',
    moduleId: '00-foundations.T1.00a',
    lessonId: 'P.3',
    lessonTitle: 'Track P: Python Variables, Clamping, Loops & Functions (P.1–P.6)',
    prereqChain: ['none (Zero-Background Entry)'],
    question:
      'Skip-Gate 1 (Python & Clamping): A controller computes cmd = 15.4 V for a 12.0 V motor driver. What does max(-12.0, min(12.0, cmd)) return, and how many times does for k in range(5): execute?',
    codeSnippet: `cmd = 15.4\nclamped = max(-12.0, min(12.0, cmd))\ncount = sum(1 for k in range(5))`,
    options: [
      {
        label: 'clamped = 12.0 V, and range(5) executes 5 times (k = 0, 1, 2, 3, 4)',
        isCorrect: true,
        explanation:
          'Correct! min(12.0, 15.4) caps the upper bound at 12.0 V, and range(5) produces 5 zero-indexed steps.',
      },
      {
        label: 'clamped = -12.0 V, and range(5) executes 6 times (k = 0..5)',
        isCorrect: false,
        explanation:
          'Start at Track P (Lesson P.1 / P.3) to master clamping bounds and zero-indexed Python loops.',
      },
      {
        label: 'clamped = 15.4 V, and range(5) executes 4 times',
        isCorrect: false,
        explanation:
          'Start at Track P (Lesson P.1 / P.3) to build fluency with Python variables, clamping, and loops.',
      },
    ],
    recommendedTab: 8,
  },
  {
    id: 'q2-si-trig-torque',
    stageBadge: 'Gate P→0 · P.7–P.14 & P.M',
    moduleId: '00-foundations.T1.00c',
    lessonId: 'P.14',
    lessonTitle: 'Gate P→0: SI Prefixes, Loop+Assert & DRV8833 Datasheet Table (P.7–P.14)',
    prereqChain: ['P.1–P.6', '00-foundations.T1.00a'],
    question:
      'Skip-Gate 2 / Gate P→0 (15-Min Track P → Stage 0 Check): Convert (15 mA, 4.7 kΩ, 500 µs) to base SI units, and read the DRV8833 datasheet table (VM Recommended: 2.7–10.8 V, Abs Max: 11.8 V) to check if a 12.0 V supply is safe:',
    options: [
      {
        label: '0.015 A, 4700 Ω, 0.0005 s; 12.0 V exceeds both the 10.8 V recommended max and 11.8 V abs max (use 6–9 V on DRV8833 or TB6612FNG for 12 V)',
        isCorrect: true,
        explanation:
          'Correct! You passed Gate P→0 (SI prefix conversion + datasheet table reading) and are ready for Stage 0 (Lesson S0.0)!',
      },
      {
        label: '1.5 A, 470 Ω, 0.05 s; 12.0 V is safe because 12.0 V is close to 11.8 V',
        isCorrect: false,
        explanation:
          'Targeted review (not "start over"): review Lesson P.7 (SI prefixes) and Lesson P.14 (Reading a Datasheet Table: Recommended vs. Abs Max).',
      },
      {
        label: '0.0015 A, 47000 Ω, 0.005 s; DRV8833 operates up to 24 V',
        isCorrect: false,
        explanation:
          'Targeted review (not "start over"): review Lesson P.7 (milli = ÷1000, kilo = ×1000, micro = ÷1e6) and Lesson P.14 (DRV8833 datasheet table).',
      },
    ],
    recommendedTab: 8,
  },
  {
    id: 'q3-stage0-circuits',
    stageBadge: 'Stage 0 · S0.1–S0.M',
    moduleId: '01-electronics.T1.01a',
    lessonId: '00.1',
    lessonTitle: 'Stage 0: Ohm’s Law, Voltage Dividers, CC/CV Supplies & Arduino ADC/PWM (S0.1–S0.M)',
    prereqChain: ['Track P (P.1–P.M)'],
    question:
      'Skip-Gate 3 (DC Circuits & ADC): Two 10 kΩ resistors form a 1:1 voltage divider across a 5.0 V rail, feeding an Arduino Uno 10-bit ADC (0..1023 over 0..5.0 V). What is the midpoint voltage and ADC count?',
    options: [
      {
        label: 'V_mid = 2.50 V, and ADC count ≈ 512 (half of 1023)',
        isCorrect: true,
        explanation:
          'Correct! Equal series resistors divide 5.0 V in half to 2.50 V, which maps to ~512 on a 10-bit (0..1023) ADC.',
      },
      {
        label: 'V_mid = 5.00 V, and ADC count = 255',
        isCorrect: false,
        explanation:
          'Complete Stage 0 (Lessons S0.1–S0.8 in Falstad & Wokwi) before starting Track 00/01.',
      },
      {
        label: 'V_mid = 1.25 V, and ADC count = 1023',
        isCorrect: false,
        explanation:
          'Complete Stage 0 (Lessons S0.1–S0.8) to master Ohm’s Law, voltage dividers, and 10-bit ADC scaling.',
      },
    ],
    recommendedTab: 0,
  },
  {
    id: 'q4-track00-dynamics',
    stageBadge: 'Track 00 · 00.1–00.3',
    moduleId: '00-foundations.T1.00e',
    lessonId: '00.1',
    lessonTitle: 'Track 00 (Tier 1): Effort/Flow Power, First-Order Lag & Mass-Spring-Damper (00.1–00.3)',
    prereqChain: ['00-foundations.T1.00a..d'],
    question:
      'Skip-Gate 4 (1st & 2nd Order Dynamics): After 1 time constant (t = tau) of a step command, what fraction of the step has a first-order lag reached? And for m = 1 kg, k = 100 N/m, what damping b gives critical damping (zeta = 1.0)?',
    options: [
      {
        label: '63.2% (1 - e^-1) at t = tau, and b_crit = 2 * sqrt(m * k) = 20.0 N·s/m',
        isCorrect: true,
        explanation:
          'Correct! First-order lag reaches 1 - e^-1 = 63.2% at t = tau, and critical damping requires b = 2*sqrt(m*k) = 20 N·s/m.',
      },
      {
        label: '50.0% at t = tau, and b_crit = 10.0 N·s/m',
        isCorrect: false,
        explanation:
          'Start at Depth 1, Track 00 Lesson 00.1 & 00.2 (and Bridge Ladder T1.00a..e).',
      },
      {
        label: '95.0% at t = tau, and b_crit = 100.0 N·s/m',
        isCorrect: false,
        explanation:
          'Start at Depth 1, Track 00 Lesson 00.1 (Effort/Flow & First-Order Time Constant tau).',
      },
    ],
    recommendedTab: 1,
  },
  {
    id: 'q5-track01-electronics',
    stageBadge: 'Track 01 · 01.1–01.4',
    moduleId: '01-electronics.T1.01b',
    lessonId: '01.3',
    lessonTitle: 'Track 01 (Tier 1): MOSFET Flyback, DRV8833 vs TB6612FNG H-Bridges & RC Filters (01.1–01.4)',
    prereqChain: ['00-foundations.T1.01', '01-electronics.T1.01a..d'],
    question:
      'Skip-Gate 5 (Power & H-Bridges): Why is a DRV8833 unsafe on a 12.0 V motor rail, and what is the stall current of a 12.0 V motor with winding resistance R = 2.4 Ω at startup (omega = 0)?',
    options: [
      {
        label: 'DRV8833 is rated 2.7–10.8 V operating (11.8 V abs max, so use TB6612FNG at 12 V); I_stall = 12.0 / 2.4 = 5.0 A',
        isCorrect: true,
        explanation:
          'Correct! DRV8833 abs max is 11.8 V (use 6–9 V on DRV8833 or TB6612FNG for 12 V), and at stall back-EMF is 0 V so I = V/R = 5.0 A.',
      },
      {
        label: 'DRV8833 requires 24 V minimum; I_stall = 0.2 A',
        isCorrect: false,
        explanation:
          'Start at Track 01 Lesson 01.1–01.4 (and Bridge Ladder T1.01a..d) to master H-bridges, stall current, and decoupling.',
      },
      {
        label: 'DRV8833 only drives stepper motors; I_stall = 28.8 A',
        isCorrect: false,
        explanation:
          'Start at Track 01 Lesson 01.2 (H-Bridges, Back-EMF & Startup Stall Current).',
      },
    ],
    recommendedTab: 5,
  },
  {
    id: 'q6-track02-03-mech-sensors',
    stageBadge: 'Tracks 02–03 · 02.1–03.2',
    moduleId: '03-sensors.T1.03a',
    lessonId: '02.1',
    lessonTitle: 'Tracks 02–03 (Tier 1): 2-Link FK/IK, N² Reflected Inertia, Encoders & 3-Phase BLDC (02.1–03.2)',
    prereqChain: ['02-mechanics.T1.02a', '03-sensors.T1.03a'],
    question:
      'Skip-Gate 6 (Kinematics, Gear Inertia & Encoders): By what factor does an N = 10:1 gearbox multiply motor rotor inertia at the joint output, and what electrical angle corresponds to a 10° mechanical rotation on a 7-pole-pair (14-pole) BLDC motor?',
    options: [
      {
        label: 'Reflected inertia scales by N² = 100×, and electrical angle is theta_e = 7 * 10° = 70°',
        isCorrect: true,
        explanation:
          'Correct! Kinetic energy conservation scales reflected inertia by N² = 100, and N_p = 7 pole pairs multiply mechanical angle by 7.',
      },
      {
        label: 'Reflected inertia scales by N = 10×, and electrical angle is 10° / 7 = 1.43°',
        isCorrect: false,
        explanation:
          'Start at Track 02 Lesson 02.4 (N² Reflected Inertia) and Track 03 Lesson 03.1–03.2 (Encoders & 3-Phase BLDC).',
      },
      {
        label: 'Reflected inertia is unchanged, and electrical angle is 140°',
        isCorrect: false,
        explanation:
          'Start at Track 02 (Lessons 02.1–02.5) and Track 03 (Lessons 03.1–03.2).',
      },
    ],
    recommendedTab: 2,
  },
  {
    id: 'q7-track04-embedded-cpp',
    stageBadge: 'Track 04 · 04.1–04.3',
    moduleId: '04-embedded.T1.04a',
    lessonId: '04.1',
    lessonTitle: 'Track 04 (Tier 1): 3-Part C Bridge — Fixed-Width Ints (04.1), Bitwise/CRC8 (04.2) & Struct Pointers (04.3)',
    prereqChain: ['04-embedded.T1.04a', '04-embedded.T1.04b'],
    question:
      'Skip-Gate 7 (3-Part Python→C Bridge & 1 kHz ISRs): Why must a boolean ISR flag be declared volatile, what happens when a uint8_t counter at 255 increments by 1, and why does void update(JointBox *p) use a pointer instead of JointBox b?',
    options: [
      {
        label: 'volatile prevents register-caching; uint8_t wraps 255 -> 0; passing JointBox *p updates the caller’s struct in-place via p->pos_rad instead of mutating a discarded photocopy',
        isCorrect: true,
        explanation:
          'Correct! You mastered all 3 parts of the Python→C bridge: fixed-width rollover (04.1), bitwise/CRC-8 framing (04.2), and struct pointers as labeled boxes (04.3).',
      },
      {
        label: 'volatile makes 64-bit floats atomic; uint8_t saturates at 255; C structs are always passed by reference automatically',
        isCorrect: false,
        explanation:
          'Targeted review: start at Lesson 04.1 (uint8_t wrap at 255), 04.2 (CRC-8), and 04.3 (C structs as labeled boxes & pointers).',
      },
      {
        label: 'volatile stores variables in Flash ROM; uint8_t overflows to -1; pointers are only needed for strings',
        isCorrect: false,
        explanation:
          'Targeted review: start at Lesson 04.1 & 04.3 to master fixed-width C types, volatile ISR flags, and struct pointers.',
      },
    ],
    recommendedTab: 7,
  },
  {
    id: 'q8-track05-08-control-robotics',
    stageBadge: 'Tracks 05–08 · 05.1–08.1',
    moduleId: '05-control.T1.05a',
    lessonId: '05.1',
    lessonTitle: 'Tracks 05–08 (Tier 1): PID Anti-Windup, Complementary IMU, Cubic Splines & 2-DOF Boss Arm (05.1–08.1)',
    prereqChain: ['05-control.T1.05a', '06-robotics.T1.06a', '07-systems.T1.07a'],
    question:
      'Skip-Gate 8 (PID Anti-Windup, IMU Fusion & Compliant Robotics): What causes PID integrator windup during a large step move, and why does adding gravity feedforward tau_g = m*g*L*cos(q) beat cranking up K_p on a collaborative robot arm?',
    options: [
      {
        label: 'Actuator saturation lets error_sum grow huge (causing massive overshoot unless clamped); gravity feedforward cancels weight with zero sag while keeping K_p soft and human-safe',
        isCorrect: true,
        explanation:
          'Correct! You have mastered the entire Tier 1 conceptual foundation and are ready for the Lesson 08.1 2-DOF Capstone or Depth 2 (Tier 2)!',
      },
      {
        label: 'Derivative kick causes windup; high K_p is always safer than gravity feedforward',
        isCorrect: false,
        explanation:
          'Start at Track 05 Lesson 05.1–05.2 and Track 06 Lesson 06.1 (PID Anti-Windup, Complementary IMU & Gravity Feedforward).',
      },
      {
        label: 'Low sample rate causes windup; gravity torque only applies at vertical q = 90°',
        isCorrect: false,
        explanation:
          'Start at Track 05 Lesson 05.1 (PID Virtual Spring-Damper & Anti-Windup Clamping).',
      },
    ],
    recommendedTab: 3,
  },
];

export interface SchoolMathTopic {
  id: string;
  title: string;
  checkQuestion: string;
  refresherText: string;
  lessonId: string;
  lessonTitle: string;
}

export const SCHOOL_MATH_DIAGNOSTIC: SchoolMathTopic[] = [
  {
    id: 'math-1-ratios',
    title: '1. Negative Numbers, Fractions, Percentages & Ratios',
    checkQuestion: 'Can you evaluate -15 + 40 = +25 and compute a voltage-divider ratio 10 / (10 + 20) = 0.3333 (33.3%)?',
    refresherText:
      'Adding a positive number to a negative moves right on the number line (-15 + 40 = +25). A ratio part / whole = 10 / 30 = 1/3 ≈ 0.3333; multiply by 100 to express as 33.3%. Used in voltage dividers (P.2, S0.2) and signed command clamping (P.3).',
    lessonId: 'P.2',
    lessonTitle: 'Lesson P.2: Computer Arithmetic & Order of Operations',
  },
  {
    id: 'math-2-powers',
    title: '2. Powers, Square Roots & Scientific Notation',
    checkQuestion: 'Do you know why 2**10 = 1024, sqrt(3² + 4²) = 5.0, and 1.5e-3 = 0.0015?',
    refresherText:
      'An exponent 2**N multiplies 2 by itself N times (10-bit ADC has 2**10 = 1024 levels, 0..1023). The Pythagorean distance is sqrt(x² + y²). Scientific notation 1.5e-3 shifts the decimal 3 places left (0.0015).',
    lessonId: 'P.8',
    lessonTitle: 'Lesson P.8: Cycle Frequency (Hz) & Binary Bits (2^N)',
  },
  {
    id: 'math-3-units',
    title: '3. Unit Conversion & Metric Prefixes (M, k, m, µ)',
    checkQuestion: 'Can you convert 15 mA to 0.015 A, 0.22 kΩ to 220 Ω, and 500 µs to 0.0005 s without guessing whether to multiply or divide?',
    refresherText:
      'kilo (k) = ×1,000; Mega (M) = ×1,000,000; milli (m) = ÷1,000; micro (µ) = ÷1,000,000. Always convert to base SI units (Volts, Amps, Ohms, Seconds, Meters, Kilograms) before plugging into physics formulas.',
    lessonId: 'P.7',
    lessonTitle: 'Lesson P.7: Base SI Units & Metric Prefixes',
  },
  {
    id: 'math-4-rearrange',
    title: '4. Rearranging a Simple Formula & Linear Scaling',
    checkQuestion: 'Given Δx = v · Δt, can you isolate v = Δx / Δt and map a 0..1023 ADC reading to 0.0..5.0 V?',
    refresherText:
      'To isolate v in Δx = v · Δt, divide both sides by Δt: v = (x_final - x_start) / Δt. To scale a raw count in [0, 1023] to [0, Y_max], compute (raw / 1023.0) * Y_max.',
    lessonId: 'P.9',
    lessonTitle: 'Lesson P.9: Rearranging Physics Formulas & Linear Range Scaling',
  },
  {
    id: 'math-5-graphs',
    title: '5. Reading a Graph & Estimating Slope or Area',
    checkQuestion: 'On a position-vs-time plot, can you find velocity from the slope (Δx/Δt) and distance from the area under a velocity curve (v · Δt)?',
    refresherText:
      'Slope = rise / run = (pos_now - pos_prev) / dt_s gives rate of change (velocity, or derivative in PID). Area of each time slice = vel_m_s * dt_s gives accumulated change (position, or integral in PID).',
    lessonId: 'P.11',
    lessonTitle: 'Lesson P.11: Reading Time-Series Graphs — Slope & Area',
  },
  {
    id: 'math-6-trig',
    title: '6. Radians & Basic Sine / Cosine',
    checkQuestion: 'Can you convert 180° = π rad and use (L·cos θ, L·sin θ) for arm tip position and τ = m·g·L·cos θ for horizontal lever torque?',
    refresherText:
      '1full turn = 360° = 2π rad (so 60 RPM = 2π rad/s). Measured from horizontal (+x), cos(θ) gives horizontal reach (1 at 0°, 0 at 90°) and sin(θ) gives vertical height (0 at 0°, 1 at 90°).',
    lessonId: 'P.10',
    lessonTitle: 'Lesson P.10: Radians, Rotational Speed & Right-Triangle Trig',
  },
];

export interface Tier1ExitGate {
  id: string;
  title: string;
  skillDomain: string;
  scenarioQuestion: string;
  options: {
    label: string;
    isReady: boolean;
    feedback: string;
  }[];
  refresherLessonId: string;
  refresherTitle: string;
}

export const TIER1_EXIT_GATES: Tier1ExitGate[] = [
  {
    id: 'exit-1-block-diagram',
    title: 'Exit Gate 1: Explain the Closed-Loop Arm / Motor Block Diagram',
    skillDomain: 'System Architecture & Signal Flow',
    scenarioQuestion:
      'In the Tier 1 2-DOF compliant robot arm (Lesson 08.1), what is the exact signal and physical power sequence inside each 1 kHz control tick?',
    options: [
      {
        label: 'Cartesian trajectory (xd, yd) -> Law-of-Cosines IK (q_d) -> PD + gravity feedforward torque (tau) -> clamped actuator command -> arm dynamics (ddq) -> encoder feedback (q)',
        isReady: true,
        feedback: 'Ready for Tier 2! You can trace reference generation, inverse kinematics, feedforward + feedback control, saturation, plant dynamics, and sensing.',
      },
      {
        label: 'Encoder reading -> Forward Kinematics -> open-loop delay(10) PWM -> gravity torque sensor',
        isReady: false,
        feedback: 'Review how closed-loop effort/flow and PD + gravity feedforward combine before jumping to Tier 2 state-space models.',
      },
    ],
    refresherLessonId: '00.1',
    refresherTitle: 'Lesson 00.1 & 05.1: Effort/Flow Power & Closed-Loop PID Control',
  },
  {
    id: 'exit-2-param-prediction',
    title: 'Exit Gate 2: Change a Model Parameter & Predict the Direction of Effect',
    skillDomain: 'Physical Intuition & Scaling Laws',
    scenarioQuestion:
      'If you double the gearbox ratio N from 10:1 to 20:1 on a joint while keeping the load inertia I_load constant, how does the load inertia reflected to the motor shaft (I_refl = I_load / N²) change?',
    options: [
      {
        label: 'Reflected load inertia at the motor shaft drops by a factor of 2² = 4× (to 1/4 of its previous value)',
        isReady: true,
        feedback: 'Ready for Tier 2! You understand N² impedance scaling and can predict how mechanical parameters shift dynamic response.',
      },
      {
        label: 'Reflected load inertia doubles by 2× at the motor shaft',
        isReady: false,
        feedback: 'Review rotational inertia and N² gearbox scaling in Lesson 02.4 before starting Tier 2 Lagrangian/Newton-Euler mechanics.',
      },
    ],
    refresherLessonId: '02.4',
    refresherTitle: 'Lesson 02.4: Rotational Inertia & N² Gear Ratio Scaling',
  },
  {
    id: 'exit-3-error-isolation',
    title: 'Exit Gate 3: Read an Error or Telemetry Fault & Isolate the Software Problem',
    skillDomain: 'Debugging & Embedded Telemetry',
    scenarioQuestion:
      'A 1 kHz control loop transmits a 20-byte packed telemetry frame (200 kbit/s on an 8N1 UART link), and the receiver logs frequent frame drops when the port is set to 115,200 baud. What is the root cause?',
    options: [
      {
        label: '20 bytes × 10 bits/byte × 1000 Hz = 200,000 bit/s exceeds a 115,200 baud link (173.6% utilization), overflowing the TX ring buffer; raise baud rate to ≥ 500,000 baud',
        isReady: true,
        feedback: 'Ready for Tier 2! You can diagnose real-time bandwidth bottlenecks, buffer overflows, and binary framing.',
      },
      {
        label: 'struct.pack("<BHIffffB") adds 100 bytes of ASCII padding that corrupts the CRC-8 polynomial',
        isReady: false,
        feedback: 'Review packed binary telemetry structs, CRC-8, and 8N1 UART bandwidth budgets in Lesson 04.2.',
      },
    ],
    refresherLessonId: '04.2',
    refresherTitle: 'Lesson 04.2: Packed Structs, CRC-8 & 8N1 UART Bandwidth Budgets',
  },
  {
    id: 'exit-4-graph-interpretation',
    title: 'Exit Gate 4: Interpret a Sensor Data Graph (Drift vs. High-Frequency Noise)',
    skillDomain: 'Signal Processing & Estimation',
    scenarioQuestion:
      'Looking at a 10-second plot of tilt angle where the raw accelerometer trace has ±0.10 rad high-frequency chatter around 0 rad, while the integrated gyro trace smoothly climbs from 0.00 rad to +0.50 rad, what fault is shown on each sensor?',
    options: [
      {
        label: 'Accelerometer has zero-mean mechanical vibration noise; gyroscope has a +0.05 rad/s constant bias whose integral ramps linearly with time (cured by a complementary filter)',
        isReady: true,
        feedback: 'Ready for Tier 2! You are ready for Bode frequency-domain filters (T2.00d/f) and Kalman covariance estimation (T2.05a).',
      },
      {
        label: 'Accelerometer has integral windup; gyroscope has Nyquist aliasing at 10 kHz',
        isReady: false,
        feedback: 'Review time-series slope/area (P.11) and complementary IMU sensor fusion (05.2).',
      },
    ],
    refresherLessonId: '05.2',
    refresherTitle: 'Lesson 05.2: Complementary IMU Sensor Fusion (Low-Pass Accel + High-Pass Gyro)',
  },
  {
    id: 'exit-5-safety-checks',
    title: 'Exit Gate 5: Explain the Purpose of Demonstrated Pre-Power Safety Checks',
    skillDomain: 'Hardware Bring-Up & Protection',
    scenarioQuestion:
      'During the 10-step bring-up (Lesson 07.1), applying a small positive test torque (+0.10 N·m) causes the encoder angle to decrease (-0.05 rad). Why must you abort immediately before enabling closed-loop PID?',
    options: [
      {
        label: 'Inverted encoder/motor sign turns negative feedback into positive feedback, driving the actuator to full-scale runaway against the hard stops',
        isReady: true,
        feedback: 'Ready for Tier 2! You understand why open-loop sign verification and CC/CV current limits precede every closed-loop test.',
      },
      {
        label: 'Negative encoder change only slows convergence slightly and can be fixed by increasing Ki',
        isReady: false,
        feedback: 'Review the 10-step safe bring-up checklist and positive-feedback runaway prevention in Lesson 07.1.',
      },
    ],
    refresherLessonId: '07.1',
    refresherTitle: 'Lesson 07.1: 10-Step Safe Bring-Up & Sine-Sweep SysID',
  },
  {
    id: 'exit-6-capstone-transfer',
    title: 'Exit Gate 6: Solve a Modified-Parameter Transfer Variation on the Capstone',
    skillDomain: 'Transfer & Synthesis',
    scenarioQuestion:
      'In the 2-DOF arm capstone (Lesson 08.1), if link 1 is held vertical (q1 = +90° = π/2 rad) and link 2 is straight out along link 1 (q2 = 0 rad), what is the gravity feedforward torque (tau_g1, tau_g2)?',
    options: [
      {
        label: 'Both tau_g1 = 0.0 N·m and tau_g2 = 0.0 N·m because cos(π/2) = 0 and both centers of mass lie directly above the shoulder pivot with zero horizontal lever arm',
        isReady: true,
        feedback: 'Ready for Tier 2! You can transfer the kinematic and gravity model to new postures without relying on memorized numbers.',
      },
      {
        label: 'Gravity torque is maximum at q1 = 90° because sin(π/2) = 1.0',
        isReady: false,
        feedback: 'Review horizontal lever-arm gravity torque (cos θ convention) in Lessons 00.3, 06.1, and 08.1.',
      },
    ],
    refresherLessonId: '08.1',
    refresherTitle: 'Lesson 08.1: Tier 1 Boss 2-DOF Compliant Arm Plant & PD + Gravity Control',
  },
];

interface TabPlacementQuizProps {
  onOpenPyodideLesson: (lessonId: string) => void;
  onSwitchSimulatorTab: (tabIdx: number) => void;
}

export const TabPlacementQuiz: React.FC<TabPlacementQuizProps> = ({
  onOpenPyodideLesson,
  onSwitchSimulatorTab,
}) => {
  const [diagnosticMode, setDiagnosticMode] = useState<'placement' | 'school-math' | 'tier1-exit'>(
    'placement'
  );
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [mathRoutes, setMathRoutes] = useState<
    Record<string, 'known' | 'refresher' | 'teach'>
  >({});
  const [exitAnswers, setExitAnswers] = useState<Record<string, number>>({});

  // The recommendation's two jump buttons act on the answers *as they are at click time*: an answer
  // and the button that opens its lesson can land in the same task, and the button drawn with the
  // older answers would send the learner to the previous gap. `answersRef` is written by every
  // answer write (and by the reset); the effect re-confirms it after each commit.
  const answersRef = useRef<Record<string, number>>(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const selectOption = (qId: string, optIdx: number) => {
    answersRef.current = { ...answersRef.current, [qId]: optIdx };
    setAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  };

  const resetQuiz = () => {
    answersRef.current = {};
    setAnswers({});
    setSubmitted(false);
    setMathRoutes({});
    setExitAnswers({});
  };

  const answeredCount = Object.keys(answers).length;

  // Determine placement from dependency graph: first question answered incorrectly or unanswered
  const firstGapOf = (answered: Record<string, number>) =>
    PLACEMENT_QUESTIONS.find((q) => {
      const idx = answered[q.id];
      if (idx === undefined) return true;
      return !q.options[idx]?.isCorrect;
    });

  const firstGapQuestion = firstGapOf(answers);

  // Click-time versions of the two jumps in the recommendation card, reading the live answers.
  const openRecommendedLesson = () => {
    const gap = firstGapOf(answersRef.current);
    onOpenPyodideLesson(gap ? gap.lessonId : '08.1');
  };

  const openRecommendedSimulator = () => {
    const gap = firstGapOf(answersRef.current);
    onSwitchSimulatorTab(gap?.recommendedTab ?? 3);
  };

  const totalCorrect = PLACEMENT_QUESTIONS.filter((q) => {
    const idx = answers[q.id];
    return idx !== undefined && q.options[idx]?.isCorrect;
  }).length;

  const exitReadyCount = TIER1_EXIT_GATES.filter((g) => {
    const idx = exitAnswers[g.id];
    return idx !== undefined && g.options[idx]?.isReady;
  }).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#c084fc] flex items-center gap-2">
            <Compass className="w-3.5 h-3.5" />
            <span>DIAGNOSTIC &amp; TIER-TRANSITION TOOLKIT · PLACEMENT, SCHOOL MATH &amp; TIER 1 EXIT REVIEW</span>
          </div>
          <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
            Find Your Starting Point, Refresh Assumed School Math Just-In-Time, or Verify Tier 1 &rarr; Tier 2 Readiness
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Switch between the <b>8-Gate Prerequisite Placement Quiz</b>, the no-penalty <b>Track P School-Math Diagnostic</b>, and the <b>6-Gate Tier 1 &rarr; Tier 2 Exit Readiness Review</b>.
          </p>

          {/* 3-Mode Sub-Tab Switcher */}
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() => setDiagnosticMode('placement')}
              data-testid="tab-mode-placement"
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                diagnosticMode === 'placement'
                  ? 'bg-[#38bdf8] text-[#0b0f19] border-[#38bdf8]'
                  : 'bg-[#0b0f19] text-[#cbd5e1] border-[#334155] hover:border-[#38bdf8]'
              }`}
            >
              1. Skip-Gate Placement Quiz (8 Gates)
            </button>
            <button
              onClick={() => setDiagnosticMode('school-math')}
              data-testid="tab-math-diagnostic"
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                diagnosticMode === 'school-math'
                  ? 'bg-[#34d399] text-[#0b0f19] border-[#34d399]'
                  : 'bg-[#0b0f19] text-[#cbd5e1] border-[#334155] hover:border-[#34d399]'
              }`}
            >
              2. Track P School-Math Diagnostic (6 Topics)
            </button>
            <button
              onClick={() => setDiagnosticMode('tier1-exit')}
              data-testid="tab-tier1-exit-review"
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer ${
                diagnosticMode === 'tier1-exit'
                  ? 'bg-[#c084fc] text-[#0b0f19] border-[#c084fc]'
                  : 'bg-[#0b0f19] text-[#cbd5e1] border-[#334155] hover:border-[#c084fc]'
              }`}
            >
              3. Tier 1 &rarr; Tier 2 Exit Readiness Review (6 Gates)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#0b0f19] border border-[#1e293b] px-3.5 py-2 rounded-lg text-right">
            <div className="text-[10px] font-mono uppercase text-[#94a3b8]">Progress</div>
            <div className="text-sm font-mono font-bold text-[#f1f5f9]">
              {`${answeredCount} / ${PLACEMENT_QUESTIONS.length} Answered`}
            </div>
          </div>
          <button
            onClick={resetQuiz}
            className="px-3 py-2 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* MODE 2: Track P Explicit School-Math Diagnostic (3 Routes per Topic) */}
      {diagnosticMode === 'school-math' && (
        <div className="space-y-4" data-testid="panel-school-math-diagnostic">
          <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
            <h3 className="text-sm font-bold text-[#34d399]">
              No-Penalty School-Math Diagnostic — Choose &ldquo;I know this&rdquo;, &ldquo;Show me a refresher&rdquo;, or &ldquo;Teach it from scratch&rdquo;
            </h3>
            <p className="text-xs text-[#94a3b8] mt-1">
              You do not need to take an entire math course before starting robotics. Check each of the 6 school-math skills below and pick the route you need right when a lesson uses it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SCHOOL_MATH_DIAGNOSTIC.map((item) => {
              const selectedRoute = mathRoutes[item.id];
              return (
                <div
                  key={item.id}
                  className="bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono font-bold text-[#38bdf8]">{item.title}</div>
                    <p className="text-xs text-[#f1f5f9] leading-relaxed">{item.checkQuestion}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          setMathRoutes((prev) => ({ ...prev, [item.id]: 'known' }))
                        }
                        className={`px-2.5 py-1.5 rounded text-xs font-mono border cursor-pointer ${
                          selectedRoute === 'known'
                            ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-[#0b0f19] border-[#334155] text-[#cbd5e1] hover:border-emerald-500/50'
                        }`}
                      >
                        I know this
                      </button>
                      <button
                        onClick={() =>
                          setMathRoutes((prev) => ({ ...prev, [item.id]: 'refresher' }))
                        }
                        className={`px-2.5 py-1.5 rounded text-xs font-mono border cursor-pointer ${
                          selectedRoute === 'refresher'
                            ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-bold'
                            : 'bg-[#0b0f19] border-[#334155] text-[#cbd5e1] hover:border-amber-500/50'
                        }`}
                      >
                        Show me a refresher
                      </button>
                      <button
                        onClick={() => {
                          setMathRoutes((prev) => ({ ...prev, [item.id]: 'teach' }));
                          onOpenPyodideLesson(item.lessonId);
                        }}
                        className="px-2.5 py-1.5 rounded text-xs font-mono border bg-[#0b0f19] border-[#38bdf8]/50 text-[#38bdf8] hover:bg-[#38bdf8]/15 cursor-pointer"
                      >
                        Teach it from scratch ({item.lessonId}) &rarr;
                      </button>
                    </div>

                    {selectedRoute === 'refresher' && (
                      <div className="p-3 rounded-lg bg-[#0b0f19] border border-amber-500/40 text-xs text-amber-200 leading-relaxed">
                        <span className="font-mono font-bold text-amber-400">2-Minute Refresher: </span>
                        {item.refresherText}
                      </div>
                    )}
                    {selectedRoute === 'known' && (
                      <div className="p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
                        Marked ready — you can skip directly to the code check in {item.lessonTitle}.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 3: Tier 1 -> Tier 2 Exit Readiness Review (6 Practical Gates + Self-Administered Exit Project) */}
      {diagnosticMode === 'tier1-exit' && (
        <div className="space-y-4" data-testid="panel-tier1-exit-review">
          <div className="bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#c084fc]">
                Gate 1&rarr;2 (&ldquo;Tier 1 Exit&rdquo;) Readiness Review ({exitReadyCount} / {TIER1_EXIT_GATES.length} Practical Gates Verified)
              </h3>
              <p className="text-xs text-[#94a3b8] mt-1">
                Before starting Tier 2 (`00-foundations.T2.00a` State-Space &amp; ODEs on the recurring arm), verify the 6 practical readiness gates below and complete the <b>2–3 Hour Self-Administered Position-Loop Exit Project</b>: <i>&ldquo;Given this motor&rsquo;s parameters, build a simulated position loop with anti-windup that meets &plusmn;2% overshoot and settles in &lt; 0.5 s; log and plot it.&rdquo;</i>
              </p>
            </div>
            <button
              onClick={() => onOpenPyodideLesson('08.1')}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-[#c084fc] text-[#0b0f19] cursor-pointer"
            >
              Launch 4-Stage 08.1 Boss &amp; Exit Spec &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TIER1_EXIT_GATES.map((gate) => {
              const picked = exitAnswers[gate.id];
              return (
                <div
                  key={gate.id}
                  className="bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-[#c084fc] font-bold">{gate.skillDomain}</span>
                      <span className="text-[#94a3b8]">Refresher: Lesson {gate.refresherLessonId}</span>
                    </div>
                    <h4 className="text-xs font-bold text-[#f1f5f9]">{gate.title}</h4>
                    <p className="text-xs text-[#cbd5e1] leading-relaxed">{gate.scenarioQuestion}</p>
                  </div>

                  <div className="space-y-2">
                    {gate.options.map((opt, oIdx) => {
                      const isSelected = picked === oIdx;
                      return (
                        <div key={oIdx} className="space-y-1.5">
                          <button
                            onClick={() =>
                              setExitAnswers((prev) => ({ ...prev, [gate.id]: oIdx }))
                            }
                            className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2 cursor-pointer ${
                              isSelected
                                ? opt.isReady
                                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200'
                                  : 'bg-rose-950/50 border-rose-500/60 text-rose-200'
                                : 'bg-[#0b0f19] border-[#1e293b] text-[#cbd5e1] hover:border-[#475569]'
                            }`}
                          >
                            <span className="font-mono font-bold shrink-0">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            <span className="flex-1">{opt.label}</span>
                          </button>
                          {isSelected && (
                            <div
                              className={`p-2.5 rounded text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                                opt.isReady
                                  ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-950/30 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              <span>{opt.feedback}</span>
                              {!opt.isReady && (
                                <button
                                  onClick={() => onOpenPyodideLesson(gate.refresherLessonId)}
                                  className="px-2.5 py-1 rounded font-mono font-bold bg-[#38bdf8] text-[#0b0f19] cursor-pointer"
                                >
                                  Open Targeted Refresher ({gate.refresherLessonId}) &rarr;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 1: Placement Recommendation Card & 8 Skip-Gate Questions */}
      {diagnosticMode === 'placement' && (submitted || answeredCount > 0) && (
        <div className="bg-gradient-to-r from-[#0f172a] via-[#111827] to-[#1e1b4b] border border-[#38bdf8]/50 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/40">
                <ShieldCheck className="w-3.5 h-3.5" />
                RECOMMENDED ENTRY POINT · {totalCorrect}/{PLACEMENT_QUESTIONS.length} SKIP-GATES PASSED
              </div>
              {firstGapQuestion ? (
                <>
                  <h3 className="text-base font-bold text-white">
                    Start at: {firstGapQuestion.lessonTitle}
                  </h3>
                  <p className="text-xs text-[#cbd5e1]">
                    Bridge Module ID:{' '}
                    <code className="px-1.5 py-0.5 rounded bg-[#0b0f19] text-[#34d399] font-mono">
                      {firstGapQuestion.moduleId}
                    </code>{' '}
                    · Prereqs Verified:{' '}
                    <span className="font-mono text-[#94a3b8]">
                      {firstGapQuestion.prereqChain.join(' → ')}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-base font-bold text-[#34d399]">
                    All 8 Tier 1 Skip-Gates Passed! Start at Lesson 08.1 (2-DOF Boss Capstone) or Depth 2 (Tier 2)
                  </h3>
                  <p className="text-xs text-[#cbd5e1]">
                    You passed every Track P, Stage 0 and Depth 1 skip test. Run the{' '}
                    <code className="px-1.5 py-0.5 rounded bg-[#0b0f19] text-[#34d399] font-mono">
                      Lesson 08.1
                    </code>{' '}
                    2-DOF compliant robot arm simulation or jump directly into Tier 2 (`00-foundations.T2.00a` State-Space & Quaternions).
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={openRecommendedLesson}
                data-testid="btn-open-recommended-lesson"
                className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] flex items-center gap-1.5 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                Open Lesson {firstGapQuestion ? firstGapQuestion.lessonId : '08.1'} in Python Runner
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={openRecommendedSimulator}
                data-testid="btn-open-recommended-simulator"
                className="px-3.5 py-2 rounded-lg text-xs font-mono font-semibold bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/40 flex items-center gap-1.5 cursor-pointer"
              >
                <Cpu className="w-3.5 h-3.5" />
                Open Matched Simulator Tab
              </button>
            </div>
          </div>
        </div>
      )}

      {diagnosticMode === 'placement' && (
        <>
          {/* 8 Diagnostic Gate Questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PLACEMENT_QUESTIONS.map((q, qIdx) => {
              const picked = answers[q.id];
              return (
                <div
                  key={q.id}
                  className="bg-[#111827] border border-[#334155] rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#0b0f19] text-[#38bdf8] border border-[#1e293b]">
                        Gate {qIdx + 1} · {q.stageBadge}
                      </span>
                      <span className="text-[10px] font-mono text-[#94a3b8] flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-[#c084fc]" />
                        {q.moduleId}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-[#f1f5f9] leading-relaxed">{q.question}</h4>

                    {q.codeSnippet && (
                      <pre className="p-2.5 rounded bg-[#0b0f19] border border-[#1e293b] font-mono text-[11px] text-[#38bdf8] overflow-x-auto">
                        {q.codeSnippet}
                      </pre>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = picked === oIdx;
                      const showFeedback = isSelected;
                      return (
                        <div key={oIdx} className="space-y-1">
                          <button
                            onClick={() => selectOption(q.id, oIdx)}
                            className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2 cursor-pointer ${
                              isSelected
                                ? opt.isCorrect
                                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200'
                                  : 'bg-rose-950/50 border-rose-500/60 text-rose-200'
                                : 'bg-[#0b0f19] border-[#1e293b] text-[#cbd5e1] hover:border-[#475569]'
                            }`}
                          >
                            <span className="font-mono font-bold shrink-0 mt-0.5">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            <span className="flex-1">{opt.label}</span>
                            {showFeedback &&
                              (opt.isCorrect ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              ) : (
                                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              ))}
                          </button>
                          {showFeedback && (
                            <div
                              className={`px-3 py-1.5 rounded text-[11px] ${
                                opt.isCorrect
                                  ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-950/30 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {opt.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setSubmitted(true)}
              className="px-4 py-2 rounded-lg text-xs font-mono font-bold bg-[#38bdf8] hover:bg-[#0284c7] text-[#0b0f19] flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Compute Final Placement Recommendation
            </button>
          </div>
        </>
      )}
    </div>
  );
};

