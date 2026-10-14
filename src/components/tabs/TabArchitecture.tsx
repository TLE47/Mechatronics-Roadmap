import React from 'react';
import { MathView, MathPanel } from '../MathView';
import { ExternalLink, Play } from 'lucide-react';

interface TabArchitectureProps {
  onLoadPreset: (presetId: string) => void;
}

export const TabArchitecture: React.FC<TabArchitectureProps> = ({ onLoadPreset }) => {
  return (
    <div className="space-y-4">
      {/* Beginner Guide Card */}
      <div className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 border-l-4 border-l-[#38bdf8] rounded-lg p-3.5 text-xs text-[#cbd5e1] leading-relaxed">
        <strong className="text-[#38bdf8] text-[0.85rem] block mb-1">
          Beginner's Plain-English Guide — How to Read This Workbench:
        </strong>
        Every robot or precision machine is just <strong>three parts talking in a fast circle</strong>:{' '}
        (1) <strong>Muscles & Skeleton</strong> (motors, gears, and metal links governed by Newton's <MathView math="F=ma" />),{' '}
        (2) <strong>Nerves & Heart</strong> (amplifiers that clean up tiny sensor voltages and MOSFET switches that chop 48V battery power at 40,000 times/sec), and{' '}
        (3) <strong>The Brain & Spinal Cord</strong> (a microcontroller running a fast 25 kHz reflex loop for motor current and a 1 kHz balance/safety loop).<br />
        <span className="text-[#94a3b8] italic inline-block mt-1">
          Symbol Cheat-Sheet: <MathView math="q" /> = joint angle, <MathView math="\dot{q}" /> = joint speed, <MathView math="\ddot{q}" /> = joint acceleration,{' '}
          <MathView math="\tau" /> = motor torque, <MathView math="M(q)" /> = mass/inertia matrix, <MathView math="J(q)" /> = leverage Jacobian,{' '}
          <MathView math="i_q" /> = torque current, and <MathView math="h(x) \ge 0" /> = safety wall distance (Control Barrier Function).
        </span>
      </div>

      {/* Master Cyber-Physical Coupling Equation & Architecture */}
      <div className="bg-[#111827] border border-[#334155] rounded-xl p-4">
        <h2 className="text-sm font-bold text-[#38bdf8] mb-2 flex justify-between items-center">
          <span>Master Cyber-Physical Coupling Equation & Architecture</span>
          <span className="text-xs font-mono text-[#94a3b8]">Energy Flow & Safety Filter</span>
        </h2>
        <MathPanel
          math="\underbrace{M(q)\ddot{q} + C(q,\dot{q})\dot{q} + g(q) + \tau_{\text{fric}}(\dot{q})}_{\text{Continuous Mechanical Plant }\mathcal{P}} = \underbrace{N\eta\,\frac{3}{2}N_p\big(\lambda_{pm}i_q + (L_d - L_q)i_d i_q\big)}_{\text{Electromagnetic Transducer}} - J(q)^\top \mathcal{F}_{\text{ext}}, \qquad \underbrace{\dot{h}(\hat{x}, u) \ge -\alpha\big(h(\hat{x})\big)}_{\text{Discrete CBF Safety Filter }\mathcal{C}}"
        />

        {/* Architecture Flowchart */}
        <div className="bg-[#0d1322] border border-[#334155] rounded-lg p-3 overflow-x-auto text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Plant */}
            <div className="bg-[#111827] border border-[#1e293b] p-3 rounded-md">
              <div className="text-[#38bdf8] font-bold text-xs uppercase mb-2 border-b border-[#1e293b] pb-1">
                Physical Plant (Continuous Energy)
              </div>
              <div className="space-y-2">
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>PMSM / QDD Actuator:</strong> Generates torque <MathView math="\tau" /> via 3-phase stator coils.
                </div>
                <div className="text-center text-[#38bdf8]">↓ Torque τ</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>Multibody Mechanics:</strong> <MathView math="M(q)\ddot{q} + C(q,\dot{q})\dot{q} + g(q)" />
                </div>
                <div className="text-center text-[#38bdf8]">↓ State q, q̇</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>Sensors:</strong> Encoders, MEMS IMU, Kelvin current shunts.
                </div>
              </div>
            </div>

            {/* Mixed-Signal */}
            <div className="bg-[#111827] border border-[#1e293b] p-3 rounded-md">
              <div className="text-[#34d399] font-bold text-xs uppercase mb-2 border-b border-[#1e293b] pb-1">
                Mixed-Signal & Power Interface
              </div>
              <div className="space-y-2">
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>48V 30A Inverter + Gate Drive:</strong> Low-inductance MLCC commutation loop (<MathView math="<2\text{ nH}" />).
                </div>
                <div className="text-center text-[#34d399]">⇄ High-Rate Switched PWM</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>AFE & Anti-Aliasing:</strong> 2nd-order Bessel filter (<MathView math="<2.5^\circ" /> phase lag @ 2.5 kHz) + simultaneous SAR ADC.
                </div>
                <div className="text-center text-[#34d399]">↓ Hardware STO Protection</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>Dual STO BIST:</strong> Independent <MathView math="\text{STO}_A" /> & <MathView math="\text{STO}_B" /> gate disable in <MathView math="<1\ \mu\text{s}" />.
                </div>
              </div>
            </div>

            {/* Compute Hierarchy */}
            <div className="bg-[#111827] border border-[#1e293b] p-3 rounded-md">
              <div className="text-[#c084fc] font-bold text-xs uppercase mb-2 border-b border-[#1e293b] pb-1">
                Real-Time Compute Hierarchy
              </div>
              <div className="space-y-2">
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>Tier-0 ISR (25–40 kHz):</strong> Clarke/Park, d-q PI current regulators, SVPWM duty generation.
                </div>
                <div className="text-center text-[#c084fc]">↕ WaitFreeSeqLock IPC</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>Tier-1 RTOS (1–2 kHz):</strong> Manifold ESKF attitude estimation, Impedance WBC, CBF-QP safety filter.
                </div>
                <div className="text-center text-[#c084fc]">↕ Zero-Copy Shm</div>
                <div className="p-2 bg-[#0b0f19] border border-[#334155] rounded text-[0.74rem]">
                  <strong>High-Level Planner (50–200 Hz):</strong> Real-time trajectory generation, RTI-NMPC & VIO factor graph.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Track Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Track 00 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 00 · FOUNDATIONS</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Applied Math, Lie Groups & Bond Graphs</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Matrix Lie groups <MathView math="SO(3)/SE(3)" />, pre-warped Tustin discretization, and port-Hamiltonian energy conservation.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="\exp([\phi]_\times) = I + \frac{\sin\theta}{\theta}[\phi]_\times + \frac{1-\cos\theta}{\theta^2}[\phi]_\times^2" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="|\Delta E| < 10^{-9}\text{ J}" /> · <MathView math="\text{Notch} \le -25\text{ dB}" />
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                MIT 18.06 <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://arxiv.org/abs/1812.01537" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Solà Lie Theory <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('wafer_scanner')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> ASML Stage (390Hz)
            </button>
            <button onClick={() => onLoadPreset('surgical_cable')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Da Vinci Cable (142Hz)
            </button>
            <button onClick={() => onLoadPreset('cnc_ballscrew')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> CNC Ballscrew (291Hz)
            </button>
          </div>
        </div>

        {/* Track 01 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 01 · ELECTRONICS & POWER</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Mixed-Signal AFE, Inverters & EMC PCB</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Kelvin current shunts, 2nd-order Bessel anti-aliasing, SAR charge buckets, and low-inductance switching loops.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="V_{DS,\text{peak}} = V_{\text{bus}} + L_{\text{loop}}\frac{dI}{dt}, \quad L_{\text{loop}} < 2\text{ nH}" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="V_{DS,\text{peak}} < 58\text{ V}" /> · <MathView math="\text{Lag} < 2.5^\circ" /> @ 2.5 kHz
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://www.ti.com/lit/pdf/slua618" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                TI SLUA618 <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://docs.kicad.org/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                KiCad Docs <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('pcb_6layer_opt')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 6-Layer 1.6nH PCB
            </button>
            <button onClick={() => onLoadPreset('pcb_2layer_bad')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 2-Layer Overshoot
            </button>
            <button onClick={() => onLoadPreset('pcb_peak_30a')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 30A Peak Thermal
            </button>
          </div>
        </div>

        {/* Track 02 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 02 · MECHANICS & DYNAMICS</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Exact Constraint, Screw PoE & O(n) RNEA</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Maxwell constraint (<MathView math="\text{DOF}=6-C" />), Abbe error, Product of Exponentials, and Featherstone spatial dynamics.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="T(q) = e^{[\mathcal{S}_1]q_1}\cdots e^{[\mathcal{S}_n]q_n}M, \quad x^\top(\dot{M}-2C)x = 0" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="\|\tau_{\text{RNEA}} - \tau_{\text{Lag}}\|_\infty < 10^{-11}\text{ N}\cdot\text{m}" />
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://hades.mech.northwestern.edu/index.php/Modern_Robotics" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Modern Robotics <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://mujoco.readthedocs.io/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                MuJoCo Docs <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('cad_flexure_stage')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Ti Notch Flexure
            </button>
            <button onClick={() => onLoadPreset('cad_kelvin_mount')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Kelvin 3-2-1 Mount
            </button>
            <button onClick={() => onLoadPreset('cad_qdd_carrier')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 8:1 QDD Carrier
            </button>
          </div>
        </div>

        {/* Track 03 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 03 · SENSORS & ACTUATORS</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Metrology, Allan Variance & 25 kHz FOC</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Fourier encoder calibration, Type-II PLL velocity observer, synchronous d-q PI + back-EMF decoupling, SVPWM.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="v_q^* = K_p e_q + K_i \!\int\! e_q dt + \omega_e(L_d i_d + \lambda_{pm})" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="\text{INL} < 0.04^\circ" /> · <MathView math="t_{\text{rise}} \le 180\ \mu\text{s}" />
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://dspace.mit.edu/handle/1721.1/118671" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Ben Katz Thesis <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://docs.simplefoc.com/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                SimpleFOC <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('foc_cobot_joint')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Cobot Joint 1200RPM
            </button>
            <button onClick={() => onLoadPreset('foc_drone_prop')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Drone 5500RPM
            </button>
            <button onClick={() => onLoadPreset('foc_qdd_jump')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 24A Hopper Jump
            </button>
          </div>
        </div>

        {/* Track 04 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 04 · EMBEDDED & REAL-TIME</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Cortex-M7/M4F TCM, Lock-Free C++20 & CAN-FD</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Hardware TIM1_TRGO2 $\to$ Dual ADC DMA, CORDIC sin/cos, WaitFreeSeqLock, and CAN-FD MIT CRC-16.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="R_i^{(k+1)} = C_i + B_i + \sum_{j \in hp(i)} \left\lceil \frac{R_i^{(k)}}{T_j} \right\rceil C_j \le D_i" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: 0 heap allocs · STM32G474 40 kHz ISR
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://www.st.com/resource/en/reference_manual/rm0440-stm32g4-series-advanced-armbased-32bit-mcus-stmicroelectronics.pdf" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                STM32 RM0440 <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://www.freertos.org/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                FreeRTOS <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('sto_desat_short')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> &lt;1μs Desat Trip
            </button>
            <button onClick={() => onLoadPreset('sto_enc_crc')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Encoder CRC Break
            </button>
            <button onClick={() => onLoadPreset('eskf_seqlock_clean')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> WaitFreeSeqLock
            </button>
          </div>
        </div>

        {/* Track 05 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 05 · CONTROL & ESTIMATION</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Gang of Four, Joseph ESKF, CBF-QP & MPC</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Bode sensitivity integral, anti-windup PID, Joseph-form manifold ESKF, and Control Barrier Functions.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="P^+ = (I - KH)P^-(I - KH)^\top + K R K^\top" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="M_s \le 1.75" /> · <MathView math="\text{NEES} \in \chi^2_{95\%}" />
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://fbswiki.org/wiki/index.php/Main_Page" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Åström FBS2e <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://arxiv.org/abs/1711.02508" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Solà ESKF PDF <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('pend_swingup')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Swing-Up Catch
            </button>
            <button onClick={() => onLoadPreset('pend_cbf_wall')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> CBF Wall ±0.50m
            </button>
            <button onClick={() => onLoadPreset('eskf_high_drift')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> ESKF Bias Recovery
            </button>
          </div>
        </div>

        {/* Track 06 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 06 · ROBOTICS & AUTONOMY</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Operational-Space Impedance, WBC & VIO</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Khatib operational inertia <MathView math="\Lambda(q)" />, null-space <MathView math="\bar{J}(q)" />, manifold preintegration.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="\Lambda(q) = (J M^{-1} J^\top)^{-1}, \quad N^\top = I - J^\top \bar{J}^\top" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: <MathView math="\|\ddot{x}_{\text{null}}\| < 10^{-12}\text{ m/s}^2" /> · Overshoot &lt; 15%
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://underactuated.mit.edu/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Underactuated <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://manipulation.csail.mit.edu/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                Manipulation <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('robot_hopper_crouch')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Hopper Crouch
            </button>
            <button onClick={() => onLoadPreset('robot_arm_polish')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Arm 20° Ramp
            </button>
            <button onClick={() => onLoadPreset('robot_furuta_bal')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Furuta Balance
            </button>
          </div>
        </div>

        {/* Track 07 & 08 */}
        <div className="bg-[#111827] border border-[#334155] hover:border-[#38bdf8] rounded-xl p-3.5 transition-all flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-[#38bdf8] tracking-wider">TRACK 07 & 08 · SYSTEMS, HIL & CAPSTONES</div>
            <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 mb-1.5">Schroeder SysID, Dual STO & URDF/MJCF</h3>
            <p className="text-xs text-[#94a3b8] mb-2 leading-relaxed">
              Closed-loop spectral identification, Safe Torque Off fault injection, and 6 validated URDF/MuJoCo models.
            </p>
            <div className="bg-[#080d1a] border border-[#1e293b] rounded p-2 mb-2 text-xs overflow-x-auto">
              <MathView math="\hat{P}(j\omega_k) = \frac{\hat{S}_{y d}(j\omega_k)}{\hat{S}_{u d}(j\omega_k)}, \quad \phi_k = -\frac{\pi k(k-1)}{M}" block={true} />
            </div>
            <div className="text-[0.73rem] bg-[#34d399]/10 text-[#34d399] border-l-2 border-[#34d399] px-2 py-1 rounded mb-2">
              Gate: STO trip <MathView math="< 1\ \mu\text{s}" /> · 6 Models SPD
            </div>
            <div className="text-[0.72rem] text-[#94a3b8] mb-3 flex flex-wrap gap-1 items-center">
              <span className="text-[#f1f5f9] font-medium">Free Study:</span>
              <a href="https://www.ti.com/lit/pdf/slla547" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                TI Functional Safety <ExternalLink className="w-2.5 h-2.5" />
              </a>
              ·
              <a href="https://www.nasa.gov/reference/systems-engineering-handbook/" target="_blank" rel="noreferrer" className="text-[#34d399] hover:underline flex items-center gap-0.5">
                NASA SE <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#1e293b]">
            <button onClick={() => onLoadPreset('sysid_schroeder_clean')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> 48-Tone Schroeder
            </button>
            <button onClick={() => onLoadPreset('sysid_zero_clip')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Zero-Phase Clip
            </button>
            <button onClick={() => onLoadPreset('sysid_noisy_avg')} className="text-[0.71rem] bg-[#38bdf8]/15 border border-[#38bdf8]/40 text-[#38bdf8] hover:bg-[#38bdf8]/25 px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 font-medium">
              <Play className="w-2 h-2 fill-current" /> Noisy 20-Period
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
