---
id: 03-sensors.T3.03a
title: "Rotating-Frame Cross-Coupling (omega_e L i), Min-Max SVPWM Bus Utilization (1/sqrt(3)) & Encoder Harmonic Calibration"
track: "03"
tier: 3
prereqs:
  - 01-electronics.T3.02
  - 03-sensors.T2.04
new_concepts:
  - dq_inductive_cross_coupling_feedforward
  - svpwm_zero_sequence_hexagonal_limit
  - encoder_spatial_harmonic_error_fit
uses:
  - synchronous_dq_foc_current_loop
  - amplitude_invariant_clarke_park_transform
  - sar_adc_c0g_charge_bucket_design
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the final bridge module in the Track 03 Tier 3 ladder before Step 3.4 (`03-sensors.T3.04`). In Tier 2 (`03-sensors.T2.04`), you closed two independent PI current loops on $i_d$ and $i_q$ using sinusoidal PWM (`SPWM`). When you spin a joint actuator at high electrical speed $\omega_e = p \omega_m$ ($> 1000\text{ rad/s}$), three production bottlenecks emerge: (1) rotating the reference frame at $\omega_e$ creates physical Coriolis-like **inductive cross-coupling voltages** ($-\omega_e L_q i_q$ on the $d$-axis and $+\omega_e L_d i_d + \omega_e \psi_m$ on the $q$-axis) that cause $i_d$ to sag and waste torque unless canceled by **decoupling feedforward**, (2) pure sine modulation clips at phase peak $V_{\text{bus}}/2 = 0.500\,V_{\text{bus}}$, whereas **Min-Max Zero-Sequence Space-Vector PWM (`SVPWM`)** shifts the floating neutral point to unlock the full hexagon inscribed circle $V_{\text{bus}}/\sqrt{3} \approx 0.5774\,V_{\text{bus}}$ (**$+15.47\%$ more speed/voltage for free!**), and (3) off-axis magnetic encoder mounting eccentricity injects $1\times$ and $2\times$ spatial angle ripple that causes torque ripple unless canceled by a **Fourier harmonic lookup table (LUT)**. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Three physical insights make high-speed FOC and precision metrology click:
- **Why $d$ and $q$ Cross-Couple at High Speed ($\omega_e L i$):** In a stationary coil, voltage is $v = R i + L \frac{di}{dt}$. When you jump into a reference frame spinning at electrical speed $\omega_e$, any magnetic flux vector $\psi_{dq} = [L_d i_d + \psi_m,\ L_q i_q]^\top$ rotating with the frame sweeps across the stationary stator windings at rate $\omega_e \times \psi_{dq}$—generating $-\omega_e L_q i_q$ along the $d$-axis and $+\omega_e(L_d i_d + \psi_m)$ along the $q$-axis! Adding those exact terms to the PI controller outputs makes the $d$ and $q$ axes behave like two completely independent DC RL circuits at any speed.
- **Min-Max Zero-Sequence SVPWM (`+15.47%` Voltage Boost):** In a 3-phase star-connected motor with floating neutral, only the **line-to-line voltages** ($v_a - v_b$, $v_b - v_c$, $v_c - v_a$) drive motor current! Adding the **same common-mode offset $v_0(t)$** to all three phases ($v_a + v_0, v_b + v_0, v_c + v_0$) cancels out completely in $v_a - v_b$! By setting $v_0 = -\frac{1}{2}(\max(v_a, v_b, v_c) + \min(v_a, v_b, v_c))$, we center the three phase voltages inside the $[0, V_{\text{bus}}]$ rail at every instant, creating the characteristic "saddle-wave" duty cycle that reaches phase amplitude $V_{\max} = V_{\text{bus}} / \sqrt{3} \approx 0.57735\,V_{\text{bus}}$ before clipping!
- **Fourier Encoder Eccentricity & Anticogging LUT:** If a diametric magnet is off-center by just $0.1\text{ mm}$ relative to the Hall/AMR sensor chip, the measured angle $\hat{\theta}_m$ oscillates once per mechanical revolution ($a_1 \cos\theta_m + b_1 \sin\theta_m$), and magnetic ovality adds a twice-per-revolution term ($2\theta_m$). Sweeping the rotor slowly at constant speed and fitting the first $H$ Fourier harmonics removes $> 95\%$ of systematic encoder error in a 2-line LUT lookup!

## 3. Formalization
1. **Synchronous $d$-$q$ Voltage Equations & Decoupling Feedforward:** In the rotor $d$-$q$ frame rotating at electrical speed $\omega_e = p \omega_m$ ($\text{rad/s}$):

$$
\begin{aligned}
v_d &= R_s i_d + L_d \frac{di_d}{dt} \underbrace{- \omega_e L_q i_q}_{\text{cross-coupling}}, \qquad &v_d^* &= u_{d,\text{PI}} - \omega_e \hat{L}_q i_q \\
v_q &= R_s i_q + L_q \frac{di_q}{dt} + \underbrace{\omega_e (L_d i_d + \psi_m)}_{\text{cross-coupling + back-EMF}}, \qquad &v_q^* &= u_{q,\text{PI}} + \omega_e (\hat{L}_d i_d + \hat{\psi}_m)
\end{aligned}
$$

2. **Min-Max Zero-Sequence Space-Vector PWM (`SVPWM`):** Given inverse-Clarke phase voltage references $(v_a^*, v_b^*, v_c^)$ with $v_a^ + v_b^* + v_c^* = 0$ and bus voltage $V_{\text{bus}}$:

$$
v_0 = -\frac{\max(v_a^*, v_b^*, v_c^*) + \min(v_a^*, v_b^*, v_c^*)}{2}, \qquad d_x = \frac{1}{2} + \frac{v_x^* + v_0}{V_{\text{bus}}} \in [0, 1] \quad (x \in \{a, b, c\})
$$

   Maximum unclipped fundamental phase peak: $V_{\phi,\max}^{\text{SVPWM}} = \frac{V_{\text{bus}}}{\sqrt{3}} = \frac{2}{\sqrt{3}} V_{\phi,\max}^{\text{SPWM}} \approx 1.1547 \, V_{\phi,\max}^{\text{SPWM}}$.
3. **Fourier Harmonic Encoder Error Model:** For mechanical angle $\theta \in [0, 2\pi)$, systematic eccentricity/ellipticity error $\Delta\theta(\theta)$ is parameterized by harmonics $h \in \{1, 2, \dots, H\}$:

$$
\Delta\theta(\theta) = c_0 + \sum_{h=1}^{H} \left(a_h \cos(h\theta) + b_h \sin(h\theta)\right), \qquad a_h = \frac{2}{N}\sum_{k=0}^{N-1} e_k \cos(h\theta_k), \quad b_h = \frac{2}{N}\sum_{k=0}^{N-1} e_k \sin(h\theta_k)
$$


## 4. Worked example
Compute (1) the $d$-$q$ decoupling feedforward voltages $(v_{d,\text{ff}}, v_{q,\text{ff}})$ for a PMSM spinning at $\omega_e = 1500\text{ rad/s}$ with $i_d = 0\text{ A}, i_q = 20.0\text{ A}$, (2) verify that Min-Max SVPWM fits a phase amplitude of $V_{\text{peak}} = V_{\text{bus}}/\sqrt{3} \approx 27.71\text{ V}$ inside $[0, 1]$ duty cycles on a $48.0\text{ V}$ bus (where SPWM clips above $24.0\text{ V}$), and (3) extract 1st and 2nd harmonic encoder errors via discrete Fourier projection.

```python
import math

# 1. d-q decoupling feedforward at w_e = 1500 rad/s, L_d = L_q = 120 uH, psi_m = 0.008 Wb, i_d = 0, i_q = 20 A:
we, Ld, Lq, psi_m = 1500.0, 120e-6, 120e-6, 0.008
id_meas, iq_meas = 0.0, 20.0
vd_ff = -we * Lq * iq_meas
vq_ff = we * (Ld * id_meas + psi_m)
assert math.isclose(vd_ff, -3.60, rel_tol=1e-9)
assert math.isclose(vq_ff, 12.0, rel_tol=1e-9)

# 2. Min-Max SVPWM at peak inscribed voltage V_peak = V_bus / sqrt(3) on V_bus = 48.0 V at theta_e = 0 rad:
V_bus = 48.0
V_peak = V_bus / math.sqrt(3.0)
va = V_peak * math.cos(0.0)
vb = V_peak * math.cos(-2.0 * math.pi / 3.0)
vc = V_peak * math.cos(+2.0 * math.pi / 3.0)
v0 = -0.5 * (max(va, vb, vc) + min(va, vb, vc))
da, db, dc = [0.5 + (v + v0) / V_bus for v in (va, vb, vc)]
assert all(0.0 - 1e-12 <= d <= 1.0 + 1e-12 for d in (da, db, dc))
assert math.isclose(da - db, (va - vb) / V_bus, rel_tol=1e-12)  # Line-to-line preserved exactly!

# 3. Fourier 1st & 2nd harmonic encoder calibration over N = 64 points:
N = 64
thetas = [2.0 * math.pi * k / N for k in range(N)]
err_samples = [0.012 * math.cos(th) - 0.005 * math.sin(2.0 * th) for th in thetas]
a1_hat = (2.0 / N) * sum(err_samples[k] * math.cos(thetas[k]) for k in range(N))
b2_hat = (2.0 / N) * sum(err_samples[k] * math.sin(2.0 * thetas[k]) for k in range(N))
assert math.isclose(a1_hat, 0.012, rel_tol=1e-9)
assert math.isclose(b2_hat, -0.005, rel_tol=1e-9)
print(f"vd_ff={vd_ff:.2f}V, vq_ff={vq_ff:.2f}V, SVPWM da={da:.4f}, a1={a1_hat:.4f} rad, b2={b2_hat:.4f} rad")
```
Expected output:
```text
vd_ff=-3.60V, vq_ff=12.00V, SVPWM da=0.9330, a1=0.0120 rad, b2=-0.0050 rad
```

## 5. Exercise
For a 3-phase inverter with $V_{\text{bus}} = 48.0\text{ V}$ and instantaneous phase voltage references $v_a^ = +24.0\text{ V}$, $v_b^ = -12.0\text{ V}$, and $v_c^ = -12.0\text{ V}$, compute (a) the Min-Max zero-sequence offset $v_0 = -\frac{1}{2}(\max(v_{abc}^) + \min(v_{abc}^))$, and (b) the three SVPWM duty cycles $(d_a, d_b, d_c)$ using $d_x = 0.5 + (v_x^ + v_0)/V_{\text{bus}}$. Verify that $v_0 = -6.0\text{ V}$ and $(d_a, d_b, d_c) = (0.875, 0.125, 0.125)$ ($\pm 10^{-9}$), compared to SPWM $(1.000, 0.250, 0.250)$ which is already hitting the upper saturation rail!
- **If your result differs:** Check that $\max = +24.0\text{ V}$ and $\min = -12.0\text{ V}$, so $v_0 = -0.5 \times (24.0 - 12.0) = -6.0\text{ V}$ and $v_a^* + v_0 = +18.0\text{ V}$.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00d`](00-foundations.T2.00d.md) (*First-Order Transfer Functions & Bandwidth*) and [`00-foundations.T2.00e`](00-foundations.T2.00e.md) (*Coupled State-Space Equations*).
  - **Prerequisite Bridge Module:** [`03-sensors.T2.03a`](03-sensors.T2.03a.md) and Legacy **Step 2.4 (`03-sensors.T2.04`)**.
  - **Core Concepts to Review First:** Synchronous $d$-$q$ voltage equations and feedforward decoupling ($v_{d,\text{ff}} = -\omega_e L_q i_q, v_{q,\text{ff}} = \omega_e(L_d i_d + \lambda_{pm})$), pole-zero cancellation PI gains ($K_p = L\omega_{\text{bw}}, K_i = R\omega_{\text{bw}}$), and Min-Max zero-sequence SVPWM injection in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI Clarke, Park & SVPWM Theory (SPRU585 / BPRA073)](https://www.ti.com/lit/pdf/bpra073) and [Track 03 Tier 3 (`03-sensors-and-actuators/README.md`)](../03-sensors-and-actuators/README.md#tier-3-advanced--production) (**Tab 3: 25 kHz PMSM FOC**).

## 6. Simulation path
Open **Tab 2 (25–40 kHz Decoupled d-q PMSM FOC, SVPWM Saddle Wave & Anticogging)** in the MechaLab Workbench (`npm run dev`), or run `03-sensors-and-actuators/lab/lab03_foc_svpwm_and_lut.py` to compare coupled vs. decoupled step responses and SPWM vs. SVPWM duty waveforms.

No hardware required for this module (`hardware_required: false`). In Step 3.4 (`03-sensors.T3.04`) and Step 3.5 (`04-embedded.T3.05`), these exact decoupling and Min-Max SVPWM equations execute in $< 3.2\ \mu\text{s}$ inside the `STM32G474` $40\text{ kHz}$ `ADC_DMA_TC` ISR:
```text
[i_d, i_q, omega_e] ---> [PI_dq + Cross-Coupling Decoupling] ---> [Inverse Park] ---> [Min-Max SVPWM] ---> [TIM1 CCR1..3]
```
Pass/fail verification in simulation: `vd_ff == -3.60 V`, `vq_ff == 12.0 V`, `da - db == (va - vb) / V_bus`, and `a1_hat == 0.012 rad`.


```mermaid
flowchart LR
    A["03-sensors.T3.03a: dq_inductive_cross_coupling_feedforward"] --> B["svpwm_zero_sequence_hexagonal_limit"]
    B --> C["encoder_spatial_harmonic_error_fit"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 3.4 (`03-sensors.T3.04`).

### Skip test
1. `[Recall] [Concept: dq_inductive_cross_coupling_feedforward]` A PMSM with $L_q = 150\ \mu\text{H}$ ($1.5 \times 10^{-4}\text{ H}$) operates at electrical speed $\omega_e = 2000.0\text{ rad/s}$ and quadrature current $i_q = 15.0\text{ A}$. Compute the $d$-axis inductive cross-coupling feedforward term $v_{d,\text{ff}} = -\omega_e L_q i_q$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
2. `[Apply] [Concept: svpwm_zero_sequence_hexagonal_limit]` Compute the maximum unclipped fundamental phase peak voltage $V_{\phi,\max} = V_{\text{bus}} / \sqrt{3}$ in volts ($\text{V}$, tolerance $\pm 0.01\text{ V}$) achievable with Min-Max SVPWM on a $V_{\text{bus}} = 48.0\text{ V}$ DC bus.
3. `[Transfer] [Concept: svpwm_zero_sequence_hexagonal_limit]` Given instantaneous phase voltage commands $v_a^ = 18.0\text{ V}$, $v_b^ = -6.0\text{ V}$, and $v_c^ = -12.0\text{ V}$, compute the Min-Max zero-sequence offset $v_0 = -\frac{1}{2}(\max(v_a^, v_b^*, v_c^*) + \min(v_a^*, v_b^*, v_c^*))$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
4. `[Spaced review -> 03-sensors.T2.04 — Concept: synchronous_dq_foc_current_loop] [Concept: encoder_spatial_harmonic_error_fit]` Why does adding the same zero-sequence voltage $v_0(t)$ to all three inverter leg commands $(v_a^* + v_0, v_b^* + v_0, v_c^* + v_0)$ produce **zero** zero-sequence phase current in a 3-phase star-connected motor with an isolated (floating) neutral point?
   - **A.** Because the motor windings only respond to line-to-line voltage differences (such as $(v_a^* + v_0) - (v_b^* + v_0) = v_a^* - v_b^*$), so the common-mode offset $v_0(t)$ shifts the neutral potential without driving any current ($i_a + i_b + i_c \equiv 0$).
   - **B.** Because $v_0(t)$ is always zero at every angle.
   - **C.** Because the MOSFETs block common-mode voltages.
   - **D.** Because the encoder cancels $v_0(t)$.

**Answer key:**
```python
import math

q1_vd_ff = -2000.0 * 150e-6 * 15.0
q2_vmax_svpwm = 48.0 / math.sqrt(3.0)
q3_v0 = -0.5 * (max(18.0, -6.0, -12.0) + min(18.0, -6.0, -12.0))
q4_choice = "A"

assert math.isclose(q1_vd_ff, -4.50, rel_tol=1e-9)
assert math.isclose(q2_vmax_svpwm, 27.7128129, abs_tol=1e-2)
assert math.isclose(q3_v0, -3.0, rel_tol=1e-9)
assert q4_choice == "A"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` items 2–3. On pass, proceed to `## 10. Next modules`.

### Gate test
Covers the complete Track 03 Tier 3 bridge ladder (`03-sensors.T3.03a`) before Step 3.4 (`03-sensors.T3.04`):
1. `[Concept: dq_inductive_cross_coupling_feedforward]` A PMSM with flux linkage $\psi_m = 0.010\text{ Wb}$, $L_d = 100\ \mu\text{H}$, and $i_d = 0.0\text{ A}$ spins at electrical speed $\omega_e = 1800.0\text{ rad/s}$. Compute the $q$-axis back-EMF + cross-coupling feedforward voltage $v_{q,\text{ff}} = \omega_e(L_d i_d + \psi_m)$ in volts ($\text{V}$, tolerance $\pm 10^{-9}\text{ V}$).
2. `[Concept: dq_inductive_cross_coupling_feedforward]` What happens to $i_d$ and $i_q$ during a fast torque step at high rotor speed $\omega_e$ if the PI current controllers omit the $-\omega_e L_q i_q$ and $+\omega_e(L_d i_d + \psi_m)$ decoupling feedforward terms?
   - **A.** A step in $i_q$ injects a transient disturbance $-\omega_e L_q i_q$ into the $d$-axis (pulling $i_d$ away from zero) while the $q$-axis integral term must wind up slowly to fight back-EMF $\omega_e \psi_m$, degrading current loop bandwidth and phase margin.
   - **B.** The motor stops spinning immediately.
   - **C.** The encoder resolution doubles.
   - **D.** The bus voltage increases by $50\%$.
3. `[Concept: svpwm_zero_sequence_hexagonal_limit]` Compute the percentage increase in maximum linear phase voltage amplitude $100 \times \left(\frac{2}{\sqrt{3}} - 1\right)$ provided by SVPWM over sinusoidal PWM (`SPWM`, tolerance $\pm 0.01\%$).
4. `[Concept: svpwm_zero_sequence_hexagonal_limit]` For $V_{\text{bus}} = 24.0\text{ V}$ and phase voltage commands $v_a^ = 12.0\text{ V}$, $v_b^ = -6.0\text{ V}$, $v_c^ = -6.0\text{ V}$ (giving $v_0 = -3.0\text{ V}$), compute the phase-A SVPWM duty cycle $d_a = 0.5 + \frac{v_a^ + v_0}{V_{\text{bus}}}$ (tolerance $\pm 10^{-9}$).
5. `[Concept: svpwm_zero_sequence_hexagonal_limit]` Why does the Min-Max zero-sequence formula $v_0 = -\frac{1}{2}(\max(v_{abc}^*) + \min(v_{abc}^*))$ produce the exact same duty cycles as traditional sector-based $T_1, T_2, T_0$ Space-Vector PWM with far less CPU computation?
   - **A.** Because centering the maximum and minimum phase envelope inside $\pm V_{\text{bus}}/2$ allocates equal duration to the two zero vectors $V_0(000)$ and $V_7(111)$ without requiring `atan2` sector lookup or `sin()` table calls.
   - **B.** Because it sets all three duty cycles to $0.5$.
   - **C.** Because it only drives one phase at a time.
   - **D.** Because it disables the high-side MOSFETs.
6. `[Concept: encoder_spatial_harmonic_error_fit]` If a magnetic encoder disk is mounted with a radial eccentricity offset $e$ relative to the shaft rotation axis, which spatial harmonic order $h$ (in cycles per mechanical revolution, tolerance $\pm 10^{-9}$) dominates the angle error $\Delta\theta(\theta_m)$?
7. `[Concept: encoder_spatial_harmonic_error_fit]` Given harmonic calibration coefficients $a_1 = 0.008\text{ rad}$ and $b_1 = -0.006\text{ rad}$ for $\Delta\theta(\theta) = a_1 \cos\theta + b_1 \sin\theta$, compute the peak-to-zero amplitude $\sqrt{a_1^2 + b_1^2}$ of the 1st-harmonic error in radians ($\text{rad}$, tolerance $\pm 10^{-9}\text{ rad}$).
8. `[Concept: encoder_spatial_harmonic_error_fit]` Why must anticogging and encoder harmonic LUT calibration sweeps be recorded in **both** forward ($+\omega$) and reverse ($-\omega$) directions and averaged ($\frac{1}{2}(\tau_+(\theta) + \tau_-(\theta))$) before building the lookup table?
   - **A.** Because direction-dependent Coulomb friction $+\tau_c \operatorname{sign}(\omega)$ cancels out when averaging forward and reverse sweeps, isolating the true position-dependent magnetic cogging torque $\tau_{\text{cog}}(\theta)$.
   - **B.** To warm up the motor windings.
   - **C.** Because encoders only count in one direction.
   - **D.** To erase the flash memory.

**Gate answer key:**
```python
import math

g1_vq_ff = 1800.0 * (100e-6 * 0.0 + 0.010)
g2_choice = "A"
g3_boost_pct = 100.0 * (2.0 / math.sqrt(3.0) - 1.0)
g4_da = 0.5 + (12.0 + (-3.0)) / 24.0
g5_choice = "A"
g6_harmonic = 1
g7_amp_rad = math.sqrt(0.008**2 + (-0.006)**2)
g8_choice = "A"

assert math.isclose(g1_vq_ff, 18.0, rel_tol=1e-9)
assert g2_choice == "A"
assert math.isclose(g3_boost_pct, 15.4700538, abs_tol=1e-2)
assert math.isclose(g4_da, 0.875, rel_tol=1e-9)
assert g5_choice == "A"
assert g6_harmonic == 1
assert math.isclose(g7_amp_rad, 0.010, rel_tol=1e-9)
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Adding $d$-$q$ decoupling feedforward causes immediate current runaway at medium speed | Used mechanical speed $\omega_m$ instead of electrical speed $\omega_e = p \omega_m$, or swapped the signs ($+\omega_e L_q i_q$ on $d$-axis instead of $-\omega_e L_q i_q$). | Verify $\omega_e = p \omega_m$ and double-check that $v_{d,\text{ff}} = -\omega_e L_q i_q$ and $v_{q,\text{ff}} = +\omega_e(L_d i_d + \psi_m)$. |
| SVPWM duty cycles saturate harshly when $\sqrt{v_\alpha^2 + v_\beta^2} > V_{\text{bus}}/\sqrt{3}$, distorting phase current into square waves | Clamped $d_a, d_b, d_c$ independently instead of scaling the 2D vector $(v_\alpha^*, v_\beta^*)$ radially onto the $V_{\text{bus}}/\sqrt{3}$ circle. | Apply circular vector saturation: if $V_{\text{mag}} = \sqrt{v_d^{*2} + v_q^{*2}} > V_{\text{bus}}/\sqrt{3}$, scale both $(v_d^*, v_q^*)$ by $\frac{V_{\text{bus}}/\sqrt{3}}{V_{\text{mag}}}$ before Inverse Park. |
| Anticogging LUT increases vibration instead of canceling cogging torque | Indexed the LUT with electrical angle $\theta_e$ instead of mechanical angle $\theta_m \in [0, 2\pi)$, or applied $+i_{q,\text{cog}}$ with the wrong sign. | Index the LUT by mechanical rotor angle $\theta_m$ and verify that averaging forward and reverse slow sweeps removes Coulomb friction offset. |

## 9. Resources
- **instaspin / SimpleFOC & Ben Katz — *High-Bandwidth FOC & Anticogging Control for Quasi-Direct-Drive Actuators* (`resources/textbooks-and-papers.md`):** Synchronous $d$-$q$ decoupling, Min-Max SVPWM, and bidirectional cogging calibration `[VERIFIED 2026-10-15]`.
- **Track 03 (`03-sensors-and-actuators/README.md`):** Directly continues into Step 3.4 (`03-sensors.T3.04`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 3.4 (`03-sensors.T3.04`)** in [`03-sensors-and-actuators/README.md`](../03-sensors-and-actuators/README.md#tier-3-advanced--production).
