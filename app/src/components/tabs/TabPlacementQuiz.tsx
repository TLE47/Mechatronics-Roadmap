import React, { useState } from 'react';
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
    stageBadge: 'Track P · P.7–P.M',
    moduleId: '00-foundations.T1.00c',
    lessonId: 'P.7',
    lessonTitle: 'Track P: SI Prefixes, Binary Bits, Radians & Gravity Lever Torque (P.7–P.M)',
    prereqChain: ['P.1–P.6', '00-foundations.T1.00a'],
    question:
      'Skip-Gate 2 (SI Units, Binary & Lever Torque): How many distinct counts does a 12-bit encoder have, and what is the gravity torque tau = m * g * L * cos(theta) on a horizontal arm (theta = 0 rad) with m = 0.5 kg, g = 9.81 m/s², L = 0.20 m?',
    options: [
      {
        label: '2^12 = 4096 counts (0..4095), and tau = 0.5 * 9.81 * 0.20 * cos(0) = 0.981 N·m',
        isCorrect: true,
        explanation:
          'Correct! 12 bits yield 4096 states, and at horizontal (theta = 0 rad), cos(0) = 1.0 gives peak gravity torque 0.981 N·m.',
      },
      {
        label: '1200 counts, and tau = 0.0 N·m because sin(0) = 0',
        isCorrect: false,
        explanation:
          'Start at Lesson P.7 / P.10 / P.12 to master binary powers of 2 and the horizontal lever-torque convention.',
      },
      {
        label: '2048 counts, and tau = 9.81 N·m',
        isCorrect: false,
        explanation:
          'Start at Lesson P.7 / P.8 to review 2^N binary resolution and SI unit conversions.',
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
          'Start Pass 1 at Track 00 Lesson 00.1 & 00.2 (and Bridge Ladder T1.00a..e).',
      },
      {
        label: '95.0% at t = tau, and b_crit = 100.0 N·s/m',
        isCorrect: false,
        explanation:
          'Start Pass 1 at Track 00 Lesson 00.1 (Effort/Flow & First-Order Time Constant tau).',
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
    stageBadge: 'Track 04 · 04.1–04.2',
    moduleId: '04-embedded.T1.04a',
    lessonId: '04.1',
    lessonTitle: 'Track 04 (Tier 1): C/C++ Fixed-Width Types, volatile 1 kHz Timer ISRs & Binary CRC8 (04.1–04.2)',
    prereqChain: ['04-embedded.T1.04a', '04-embedded.T1.04b'],
    question:
      'Skip-Gate 7 (Embedded C/C++ & Real-Time ISRs): Why must a boolean flag written inside a 1 kHz hardware timer ISR and polled in loop() be declared volatile in C/C++, and what is (uint16_t)(4 - 65530)?',
    options: [
      {
        label: 'volatile prevents compiler register-caching of ISR-modified RAM; unsigned 16-bit rollover yields 10 ticks',
        isCorrect: true,
        explanation:
          'Correct! Without volatile, -O2 optimization caches the flag in a CPU register forever; modulo 65536 subtraction gives (4 - 65530) & 0xFFFF = 10.',
      },
      {
        label: 'volatile makes the variable thread-safe across 64-bit floats; subtraction gives -65526',
        isCorrect: false,
        explanation:
          'Start at Track 04 Lesson 04.1 & Bridge Module 04-embedded.T1.04a (Python-to-C++ Transition & 1 kHz Timer ISRs).',
      },
      {
        label: 'volatile stores the variable in Flash ROM; subtraction overflows to 0',
        isCorrect: false,
        explanation:
          'Start at Track 04 Lesson 04.1 & 04.2 to master C/C++ fixed-width types, volatile ISR flags, and packed binary structs.',
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
          'Correct! You have mastered the entire Tier 1 conceptual foundation and are ready for the Lesson 08.1 2-DOF Capstone or Pass 2 (Tier 2)!',
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

interface TabPlacementQuizProps {
  onOpenPyodideLesson: (lessonId: string) => void;
  onSwitchSimulatorTab: (tabIdx: number) => void;
}

export const TabPlacementQuiz: React.FC<TabPlacementQuizProps> = ({
  onOpenPyodideLesson,
  onSwitchSimulatorTab,
}) => {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);

  const selectOption = (qId: string, optIdx: number) => {
    setAnswers((prev) => ({ ...prev, [qId]: optIdx }));
  };

  const resetQuiz = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const answeredCount = Object.keys(answers).length;

  // Determine placement from dependency graph: first question answered incorrectly or unanswered
  const firstGapQuestion = PLACEMENT_QUESTIONS.find((q) => {
    const idx = answers[q.id];
    if (idx === undefined) return true;
    return !q.options[idx]?.isCorrect;
  });

  const totalCorrect = PLACEMENT_QUESTIONS.filter((q) => {
    const idx = answers[q.id];
    return idx !== undefined && q.options[idx]?.isCorrect;
  }).length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#c084fc] flex items-center gap-2">
            <Compass className="w-3.5 h-3.5" />
            PREREQUISITE DEPENDENCY GRAPH PLACEMENT DIAGNOSTIC · MODULE SKIP-TEST GATES
          </div>
          <h2 className="text-lg font-bold text-[#f1f5f9] mt-0.5">
            Find Your Exact Starting Module & Beginner Lesson from the Curriculum Dependency Graph
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Answer the 8 skip-gate questions below (covering Track P, Stage 0, and Tracks 00–08 Tier 1). We trace the first unmastered node in <code className="text-[#38bdf8]">modules/_index.yaml</code> to recommend your exact entry point.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#0b0f19] border border-[#1e293b] px-3.5 py-2 rounded-lg text-right">
            <div className="text-[10px] font-mono uppercase text-[#94a3b8]">Progress</div>
            <div className="text-sm font-mono font-bold text-[#f1f5f9]">
              {answeredCount} / {PLACEMENT_QUESTIONS.length} Answered
            </div>
          </div>
          <button
            onClick={resetQuiz}
            className="px-3 py-2 rounded-lg text-xs font-mono bg-[#0b0f19] hover:bg-[#1e293b] text-[#cbd5e1] border border-[#334155] flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Placement Recommendation Card (shown when submitted or at least 1 answer selected) */}
      {(submitted || answeredCount > 0) && (
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
                    All 8 Tier 1 Skip-Gates Passed! Start at Lesson 08.1 (2-DOF Boss Capstone) or Pass 2 (Tier 2)
                  </h3>
                  <p className="text-xs text-[#cbd5e1]">
                    You passed every Track P, Stage 0, and Pass 1 skip test. Run the{' '}
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
                onClick={() =>
                  onOpenPyodideLesson(firstGapQuestion ? firstGapQuestion.lessonId : '08.1')
                }
                className="px-3.5 py-2 rounded-lg text-xs font-mono font-bold bg-[#34d399] hover:bg-[#10b981] text-[#0b0f19] flex items-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                Open Lesson {firstGapQuestion ? firstGapQuestion.lessonId : '08.1'} in Python Runner
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  onSwitchSimulatorTab(firstGapQuestion?.recommendedTab ?? 3)
                }
                className="px-3.5 py-2 rounded-lg text-xs font-mono font-semibold bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/40 flex items-center gap-1.5"
              >
                <Cpu className="w-3.5 h-3.5" />
                Open Matched Simulator Tab
              </button>
            </div>
          </div>
        </div>
      )}

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
                        className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-start gap-2 ${
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
          className="px-4 py-2 rounded-lg text-xs font-mono font-bold bg-[#38bdf8] hover:bg-[#0284c7] text-[#0b0f19] flex items-center gap-1.5"
        >
          <ShieldCheck className="w-4 h-4" />
          Compute Final Placement Recommendation
        </button>
      </div>
    </div>
  );
};
