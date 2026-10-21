import React from 'react';
import { X, Printer } from 'lucide-react';
import { MathView } from './MathView';

interface CheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="bg-canvas border border-line rounded-xl w-full max-w-7xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 text-ink shadow-2xl relative print:border-none print:shadow-none print:max-h-none print:p-2 print:text-black print:bg-white">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-accent pb-3 mb-4 flex-wrap gap-2 print:border-b-black">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-ink print:text-black">
              ⚡ MechaLab — 1-Page Production Mechatronics & Robotics Reference Card
            </h1>
            <div className="text-xs text-muted print:text-gray-600 mt-1">
              Tracks 00–08 Core Equations, PCB Stackup Rules, Exact Kinematic Constraint, FOC Tuning Laws & Real-Time Safety Gates
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="bg-accent hover:bg-accent/80 text-inverse font-bold text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save 1-Page PDF</span>
            </button>
            <button
              onClick={onClose}
              className="bg-raise hover:bg-elevate text-ink text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all border border-line cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Close Reference</span>
            </button>
          </div>
        </div>

        {/* 3 Columns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2 text-[0.77rem] leading-relaxed">
          {/* COLUMN 1 */}
          <div className="space-y-3">
            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                00 · Lie Groups, Signals & Two-Mass Resonance
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Rodrigues SO(3) Exp Map & Small-Angle Guard:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\exp([\phi]_\times) = I + \frac{\sin\theta}{\theta}[\phi]_\times + \frac{1-\cos\theta}{\theta^2}[\phi]_\times^2" block={true} />
                </div>
                <div className="text-muted text-[0.72rem] print:text-gray-600">
                  For <MathView math="\theta < 10^{-4}\text{ rad}" />: use <MathView math="1 - \frac{\theta^2}{6}" /> and <MathView math="\frac{1}{2} - \frac{\theta^2}{24}" /> to prevent 0/0 NaN.
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Compliant Two-Mass Anti-Resonance & Resonance:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\omega_{ar} = \sqrt{\frac{k_s}{J_L}}, \qquad \omega_r = \omega_{ar}\sqrt{1 + \frac{J_L}{J_m}}" block={true} />
                </div>
              </div>
              <div>
                <span className="text-emerald font-bold print:text-emerald-700">Pre-Warped Tustin Biquad Notch (TDF-II):</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="s \leftarrow \frac{\omega_n}{\tan(\omega_n T_s/2)}\frac{z-1}{z+1}, \quad H(s)=\frac{s^2+\omega_n^2}{s^2+\frac{\omega_n}{Q}s+\omega_n^2}" block={true} />
                </div>
              </div>
            </div>

            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                01 · Power Stage, AFE & 6-Layer EMC PCB Rules
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Turn-Off Voltage Overshoot & Hot RDS(on)(Tj):</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="V_{DS,\text{peak}} = V_{\text{bus}} + L_{\text{loop}}\frac{di}{dt}, \quad R_{DS}(T_j) = R_{25}\big(1+\alpha(T_j-25)\big)" block={true} />
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">2nd-Order Bessel AAF & SAR ADC Charge Bucket:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="H_{\text{Bessel}}(s) = \frac{3}{(s/\omega_0)^2 + 3(s/\omega_0) + 3}, \quad C_{\text{filt}} \ge 20\,C_{sh}" block={true} />
                </div>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted text-[0.73rem] print:text-gray-700">
                <li><strong className="text-ink print:text-black">Golden PCB Rule:</strong> Keep <MathView math="L_{\text{loop}} < 2\text{ nH}" /> by placing 100V X7R MLCCs &lt;1.5 mm from HS drain / LS source over an <strong className="text-accent print:text-sky-700">unbroken L2 GND plane</strong>.</li>
                <li><strong className="text-ink print:text-black">Kelvin Shunts:</strong> Route differential sense traces from inner pads of 4-terminal shunts (<code className="text-emerald">CSS2H-2512R-1L00F</code>).</li>
              </ul>
            </div>
          </div>

          {/* COLUMN 2 */}
          <div className="space-y-3">
            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                02 · Precision Mechanics, Flexures & RNEA Dynamics
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Maxwell Exact Constraint & Abbe Offset Error:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\text{DOF} = 6 - C, \qquad \varepsilon_{\text{Abbe}} = L_{\text{offset}}\sin\theta_{\text{pitch}}" block={true} />
                </div>
                <div className="text-muted text-[0.72rem] print:text-gray-600">
                  Kelvin Coupling (3 + 2 + 1 = 6) locks all 6 DOF with zero thermal binding.
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Paros-Weisbord Circular Notch Flexure Stiffness:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="k_\theta = \frac{2 E b t^{5/2}}{9\pi\sqrt{R}}, \qquad \sigma_{\max} = K_t\frac{6 M_{\max}}{b t^2}" block={true} />
                </div>
              </div>
              <div>
                <span className="text-emerald font-bold print:text-emerald-700">QDD Reflected Inertia & Manipulator Passivity:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="J_{\text{refl}} = N^2 J_{\text{rotor}}, \quad x^\top(\dot{M}-2C)x = 0" block={true} />
                </div>
                <div className="text-muted text-[0.72rem] print:text-gray-600">
                  Principal moments must satisfy <MathView math="I_1 > 0" /> and triangle inequality <MathView math="I_1 + I_2 \ge I_3" />.
                </div>
              </div>
            </div>

            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                03 & 04 · 40 kHz PMSM FOC, SVPWM & Bare-Metal RT
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Synchronous d-q Voltage & Pole-Zero PI Law:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="v_d^* = u_d - \omega_e L_q i_q, \quad v_q^* = u_q + \omega_e(L_d i_d + \lambda_{pm})" block={true} />
                  <MathView math="K_{p,d} = L_d\omega_{bw}, \quad K_{p,q} = L_q\omega_{bw}, \quad K_i = R_s\omega_{bw}" block={true} />
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Min-Max Zero-Sequence SVPWM (+15.47% Boost):</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="v_{\text{off}} = -\frac{1}{2}\big(\min(v_{a,b,c}) + \max(v_{a,b,c})\big), \quad \sqrt{v_d^2+v_q^2} \le \frac{V_{\text{bus}}}{\sqrt{3}}" block={true} />
                </div>
              </div>
              <div>
                <span className="text-emerald font-bold print:text-emerald-700">Rate-Monotonic Response-Time Analysis (RTA):</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="R_i^{(k+1)} = C_i + B_i + \sum_{j\in hp(i)}\left\lceil\frac{R_i^{(k)}}{T_j}\right\rceil C_j \le D_i" block={true} />
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 3 */}
          <div className="space-y-3">
            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                05 & 06 · Loop Shaping, Joseph ESKF, WBC & CBF-QP
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Bode Waterbed & Gang-of-Four Sensitivity Bound:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\int_0^\infty \ln|S(j\omega)|\,d\omega = 0, \qquad M_s = \|S(j\omega)\|_\infty \le 1.75" block={true} />
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Joseph-Form Covariance & Multiplicative SO(3) Reset:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="P^+ = (I - KH)P^-(I - KH)^\top + K R K^\top, \quad \hat{R}^+ = \hat{R}^-\exp([\delta\hat{\theta}]_\times)" block={true} />
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Khatib Operational Inertia & Null-Space:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\Lambda(q) = (J M^{-1} J^\top)^{-1}, \quad N^\top = I - J^\top\bar{J}^\top" block={true} />
                </div>
              </div>
              <div>
                <span className="text-emerald font-bold print:text-emerald-700">Control Barrier Function (CBF) Safety Filter:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="u^* = \arg\min_{u} \|u - u_{\text{nom}}\|_2^2 \quad \text{s.t.} \quad \dot{h}(x,u) \ge -\alpha h(x)" block={true} />
                </div>
              </div>
            </div>

            <div className="bg-panel border border-line rounded-lg p-3 print:bg-white print:border-gray-300">
              <h2 className="text-[0.8rem] font-bold text-accent uppercase tracking-wider border-b border-line pb-1 mb-2 print:text-sky-700">
                07 & 08 · Schroeder SysID, Regen Clamp & Hardware STO
              </h2>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Schroeder Low-Crest-Factor Multisine & FRF:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="\phi_k = -\frac{\pi k(k-1)}{M}, \qquad \hat{P}(j\omega_k) = \frac{\hat{S}_{y d_{\text{exc}}}(j\omega_k)}{\hat{S}_{u d_{\text{exc}}}(j\omega_k)}" block={true} />
                </div>
              </div>
              <div className="mb-2">
                <span className="text-emerald font-bold print:text-emerald-700">Regenerative Braking Bus Voltage Surge & Chopper:</span>
                <div className="bg-canvas border-l-2 border-amber px-2 py-1 my-1 overflow-x-auto print:bg-gray-50 print:border-amber-600">
                  <MathView math="V_{\text{bus,peak}} = \sqrt{V_{\text{nom}}^2 + \frac{\eta J_{\text{tot}}\omega_0^2}{C_{\text{bus}}}}, \quad R_{\text{brake}} \le \frac{V_{\text{trip}}^2}{P_{\text{regen}}}" block={true} />
                </div>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-muted text-[0.73rem] print:text-gray-700">
                <li><strong className="text-ink print:text-black">IEC 61800-5-2 Dual-Channel STO:</strong> Independent <code className="text-accent">STO_A</code> + <code className="text-accent">STO_B</code> hardware gate disable (<code className="text-rose">TIM1-&gt;BDTR.MOE = 0</code>) in &lt;1.0 μs with 100 μs boot dark-pulse diagnostic.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
