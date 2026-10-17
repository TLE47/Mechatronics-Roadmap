---
id: 03-sensors.T2.03a
title: "Three-Phase Stator Reference Frames (abc -> alpha-beta -> d-q), Phase-Locked Loops & Sensor Random Walk"
track: "03"
tier: 2
prereqs:
  - 01-electronics.T2.02
  - 03-sensors.T1.04
new_concepts:
  - three_phase_balanced_sum_and_clarke_projection
  - park_rotating_frame_dc_demodulation
  - pll_velocity_tracking_and_noise_random_walk
uses:
  - electrical_vs_mechanical_pole_pairs
  - open_loop_three_phase_sine_modulation
  - so2_rotation_matrix
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters
This is the bridge module before Step 2.4 (`03-sensors.T2.04`). In a 3-phase BLDC motor spinning at $3000\text{ RPM}$ ($350\text{ Hz}$ electrical for $p=7$), the three stator currents $(i_a, i_b, i_c)$ are high-frequency AC sine waves that a standard PI controller cannot track without severe phase lag. Projecting the three $120^\circ$-spaced coils onto a 2D stationary frame ($\alpha$-$\beta$, **Clarke transform**) and then rotating that frame at the rotor's exact electrical angle $\theta_e$ ($d$-$q$, **Park transform**) turns those fast AC sine waves into two steady **DC numbers** $(i_d, i_q)$! Combine that with a **Phase-Locked Loop (PLL)** to estimate smooth velocity from quantized encoder angles and **random-walk noise scaling** ($\sigma \propto \sqrt{t}$) for IMUs, and you have the complete foundation for Step 2.4. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Imagine three people standing $120^\circ$ apart around a merry-go-round (`a` at $0^\circ$, `b` at $+120^\circ$, `c` at $-120^\circ$), passing a magnetic arrow around the circle so the arrow spins smoothly at speed $\omega_e$. Because the three coil wires meet at a floating star neutral point with nowhere else for current to go, Kirchoff's Current Law guarantees $i_a + i_b + i_c = 0$ at every instant. First, the **Clarke transform** projects the 2D tip of that spinning magnetic arrow in standard $(x, y)$ coordinates called $(\alpha, \beta)$ on the stationary floor. Second, if you jump onto the merry-go-round and spin *with* the rotor at angle $\theta_e$, the spinning magnetic arrow looks completely **stationary (DC)** to you! That rotating coordinate frame is the **Park $(d, q)$ frame**: the **$d$-axis (direct)** points straight along the rotor's North magnet pole (producing zero torque, only radial magnetic flux), and the **$q$-axis (quadrature)** points $90^\circ$ ahead of the magnet (producing $100\%$ of motor torque $\tau \propto i_q$).

## 3. Formalization
1. **Balanced Three-Phase Neutral Constraint & Amplitude-Invariant Clarke Transform ($abc \to \alpha\beta$):** With $i_a + i_b + i_c = 0$, the stationary orthogonal components $(i_\alpha, i_\beta)$ (in $\text{A}$) are:

$$
i_\alpha = i_a, \quad i_\beta = \frac{1}{\sqrt{3}}\left(i_a + 2 i_b\right) = \frac{i_b - i_c}{\sqrt{3}}
$$

   For balanced currents $i_a = I_{\text{pk}}\cos\theta_e$, $i_b = I_{\text{pk}}\cos(\theta_e - \frac{2\pi}{3})$, $i_c = I_{\text{pk}}\cos(\theta_e + \frac{2\pi}{3})$, this yields $i_\alpha = I_{\text{pk}}\cos\theta_e$ and $i_\beta = I_{\text{pk}}\sin\theta_e$, preserving peak amplitude $\sqrt{i_\alpha^2 + i_\beta^2} = I_{\text{pk}}$.
2. **Park Transform ($\alpha\beta \to dq$):** Rotating $(\alpha, \beta)$ by $-\theta_e$ into the rotor-locked $(d, q)$ frame gives:

$$
\begin{bmatrix} i_d \\ i_q \end{bmatrix} = \begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix} \begin{bmatrix} i_\alpha \\ i_\beta \end{bmatrix}
$$

   When current is driven $90^\circ$ ahead of the rotor flux ($i_\alpha = -I_{\text{pk}}\sin\theta_e,\ i_\beta = I_{\text{pk}}\cos\theta_e$), substituting into the Park matrix yields constant DC values $i_d = 0\text{ A}$ and $i_q = I_{\text{pk}}$ across all $\theta_e \in [0, 2\pi)$!
3. **Tracking Loop (PLL) & White Noise vs. Random Walk:**
   - A Type-II tracking PLL drives angle residual $e_\theta = \operatorname{wrap}(\theta_{\text{meas}} - \hat{\theta})$ to zero via $\dot{\hat{\omega}} = K_i e_\theta$ and $\dot{\hat{\theta}} = \hat{\omega} + K_p e_\theta$, extracting lag-free velocity $\hat{\omega}$ without finite-difference noise spikes.
   - Integrating zero-mean white gyro noise of spectral density $\sigma_g$ ($\text{rad/s}/\sqrt{\text{Hz}}$) over averaging window $\tau$ ($\text{s}$) reduces rate standard deviation as $\sigma_{\bar{\omega}}(\tau) = \frac{\sigma_g}{\sqrt{\tau}}$ (slope $-1/2$ on a log-log Allan deviation plot).

## 4. Worked example
Verify that balanced 3-phase currents of peak amplitude $I_{\text{pk}} = 10.0\text{ A}$ phased $90^\circ$ ahead of rotor angle $\theta_e = 0.85\text{ rad}$ map via Clarke + Park to $i_d = 0.0\text{ A}, i_q = 10.0\text{ A}$, and verify the $\tau^{-1/2}$ white-noise averaging law.

```python
import math

def clarke_park(ia: float, ib: float, theta_e: float) -> tuple[float, float, float, float]:
    i_alpha = ia
    i_beta = (ia + 2.0 * ib) / math.sqrt(3.0)
    c, s = math.cos(theta_e), math.sin(theta_e)
    id_val = c * i_alpha + s * i_beta
    iq_val = -s * i_alpha + c * i_beta
    return i_alpha, i_beta, id_val, iq_val

I_pk = 10.0
theta_e = 0.85
# Pure q-axis current (phased +90 deg ahead of rotor flux):
ia = -I_pk * math.sin(theta_e)
ib = -I_pk * math.sin(theta_e - 2.0 * math.pi / 3.0)
ic = -I_pk * math.sin(theta_e + 2.0 * math.pi / 3.0)
assert math.isclose(ia + ib + ic, 0.0, abs_tol=1e-9)

i_alpha, i_beta, id_val, iq_val = clarke_park(ia, ib, theta_e)
assert math.isclose(math.hypot(i_alpha, i_beta), I_pk, rel_tol=1e-9)
assert math.isclose(id_val, 0.0, abs_tol=1e-9)
assert math.isclose(iq_val, 10.0, rel_tol=1e-9)

# White-noise Allan deviation scaling: increasing averaging window tau by 100x reduces sigma by 10x
sigma_tau1 = 0.02 / math.sqrt(1.0)
sigma_tau100 = 0.02 / math.sqrt(100.0)
assert math.isclose(sigma_tau1 / sigma_tau100, 10.0, rel_tol=1e-9)
print(f"i_alpha={i_alpha:.2f} A, i_beta={i_beta:.2f} A -> i_d={id_val:.2f} A, i_q={iq_val:.2f} A")
```
Expected output:
```text
i_alpha=-7.51 A, i_beta=6.60 A -> i_d=-0.00 A, i_q=10.00 A
```

## 5. Exercise
Suppose you only measure two phase currents $i_a = +6.0\text{ A}$ and $i_b = -2.0\text{ A}$ using two low-side shunt amplifiers in an isolated neutral star-wound motor. Compute (a) the third phase current $i_c = -(i_a + i_b)$, (b) the Clarke stationary components $(i_\alpha, i_\beta)$, and (c) the vector magnitude $\sqrt{i_\alpha^2 + i_\beta^2}$. Verify $i_c = -4.0\text{ A}$, $i_\alpha = 6.0\text{ A}$, $i_\beta = \frac{2.0}{\sqrt{3}} \approx 1.154701\text{ A}$, and magnitude $\approx 6.110101\text{ A}$ ($\pm 10^{-5}\text{ A}$).
- **If your result differs:** Substitute $i_a = 6.0$ and $i_b = -2.0$ into $i_\beta = (i_a + 2i_b)/\sqrt{3} = (6.0 - 4.0)/\sqrt{3} = 2.0/\sqrt{3}\text{ A}$.

### Graded package - the elbow, demodulated and tracked
[`exercises/03-sensors.T2.03a/`](../exercises/03-sensors.T2.03a/) turns this section into a test. `starter.py` holds seven holes: `wrap_pi`, `third_phase`, `clarke`, `park`, `inverse_park`, `pll_step` (the residual wrapped **before** the gains) and `allan_deviation`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/03-sensors.T2.03a/starter.py \
  python3 -m unittest discover -s exercises/03-sensors.T2.03a -p 'test_*.py'
```

The tests are behavioural: a balanced set at **four** angles must project to the same amplitude (a Clarke with the 2 misplaced agrees at $\theta = 0$ and nowhere else); the quarter turn must give $i_q = -5$ (a Park at $+\theta$ gives $+5$); quadrature current must demodulate to constant DC at five angles; the inverse must undo the rotation; the two-shunt exercise must give $i_c = -4$ A and $6.110101$ A; a PLL must lock onto $350\text{ Hz}$ electrical, hold its speed with zero residual, and **not** spike when the estimate sits just below $-\pi$ and the measurement just above it; and the averaging law must be $\tau^{-1/2}$ (the $1/\tau$ version fails on the first pair). Four planted faults - `clarke_wrong_scale`, `park_plus_theta`, `pll_raw_residual`, `allan_linear` - each fail the test named for them. The transfer suite tracks the **shared arm's elbow**: its velocity estimate must beat a one-tick finite difference on the same quantized samples, a three-phase set built from the joint's own angle must demodulate to constant $i_q$ tick after tick, and the plant's seeded white noise must average down as predicted within 12%.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T2.00a`](00-foundations.T2.00a.md) (*2D Rotation Matrix Multiplication*), [`00-foundations.T2.00c`](00-foundations.T2.00c.md) (*Critically Damped 2nd-Order Poles*), and [`00-foundations.T2.00f`](00-foundations.T2.00f.md) (*Gaussian Variance & Noise Density*).
  - **Prerequisite Bridge Module:** [`03-sensors.T1.03a`](03-sensors.T1.03a.md) and Legacy **Step 1.4 (`03-sensors.T1.04`)**.
  - **Core Concepts to Review First:** Amplitude-invariant Clarke ($i_\alpha, i_\beta$) and Park ($i_d, i_q$) transforms, Type-II PLL velocity observer gains ($K_p = 2\zeta\omega_n, K_i = \omega_n^2$), and MEMS IMU Allan deviation $\sigma_A(\tau)$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [TI Sensored FOC of 3-Phase PMSM Motors (BPRA073)](https://www.ti.com/lit/pdf/bpra073), [VectorNav Allan Variance Guide](https://www.vectornav.com/resources/inertial-navigation-primer/specifications--and--error-budgets/specs-imuspecs), and [Track 03 Tier 2 (`03-sensors-and-actuators/README.md`)](../03-sensors-and-actuators/README.md#tier-2-intermediate--applied).

## 6. Simulation path
Open **Tab 3 (25 kHz PMSM FOC: Clarke & Park Transforms)** in the MechaLab Workbench (`npm run dev`) to watch the 3-phase AC waveforms $(i_a, i_b, i_c)$ collapse into flat DC lines $(i_d, i_q)$ in real time.

The graded package is also a workbench entry: **Modules -> `EX.03-sensors.T2.03a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.

No hardware required for this module (`hardware_required: false`). In Step 2.4 (`03-sensors.T2.04`), `clarke_park(ia, ib, theta_e)` runs inside the microcontroller's $20\text{ kHz}$ ADC interrupt immediately after reading the `INA240` shunts and SPI magnetic encoder:
```text
[ADC ia, ib] ---> [Clarke (ia, ib) -> (i_alpha, i_beta)] ---> [Park (theta_e) -> (id, iq)] ---> [PI Loops]
```
Pass/fail verification in simulation: `ia + ib + ic == 0.0`, `id_val == 0.0 A`, and `iq_val == 10.0 A`.


```mermaid
flowchart LR
    A["03-sensors.T2.03a: three_phase_balanced_sum_and_clarke_projection"] --> B["park_rotating_frame_dc_demodulation"]
    B --> C["pll_velocity_tracking_and_noise_random_walk"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 2.4 (`03-sensors.T2.04`).

### Skip test
1. `[Recall] [Concept: three_phase_balanced_sum_and_clarke_projection]` In a balanced 3-phase star-connected motor with floating neutral ($i_a + i_b + i_c = 0$), if $i_a = 8.0\text{ A}$ and $i_b = -3.0\text{ A}$, compute $i_c$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
2. `[Apply] [Concept: three_phase_balanced_sum_and_clarke_projection]` Using the amplitude-invariant Clarke formula $i_\alpha = i_a,\ i_\beta = \frac{i_a + 2i_b}{\sqrt{3}}$, compute $i_\beta$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) when $i_a = 0.0\text{ A}$ and $i_b = \sqrt{3}\text{ A}$.
3. `[Transfer] [Concept: park_rotating_frame_dc_demodulation]` Using the Park rotation $i_d = i_\alpha\cos\theta_e + i_\beta\sin\theta_e$ and $i_q = -i_\alpha\sin\theta_e + i_\beta\cos\theta_e$, compute $i_q$ in amperes ($\text{A}$, tolerance $\pm 10^{-6}$) when $(i_\alpha, i_\beta) = (-6\sqrt{3}, 6.0)\text{ A}$ at electrical angle $\theta_e = 60^\circ$ ($\pi/3\text{ rad}$).
4. `[Spaced review -> 01-electronics.T2.02 — Concept: electrical_vs_mechanical_pole_pairs] [Concept: park_rotating_frame_dc_demodulation]` In surface-mounted PMSM Field-Oriented Control (FOC) below base speed, why do we command $i_d^{*} = 0\text{ A}$ and put all current into $i_q^{*}$?
   - **A.** Because $d$-axis current aligns with the rotor magnets and produces zero torque (only $I^2 R$ heat), whereas $q$-axis current is perpendicular ($90^\circ$) to the rotor flux and maximizes torque per ampere ($\tau = \frac{3}{2} p \psi_m i_q$).
   - **B.** Because $i_d$ cannot be measured.
   - **C.** Because $i_q$ does not flow through the stator windings.
   - **D.** Because $i_d$ reverses the encoder direction.
5. `[Concept: pll_velocity_tracking_and_noise_random_walk]` Integrating a gyroscope with white noise density $\sigma_g = 0.02\text{ rad/s}/\sqrt{\text{s}}$ over $t = 25.0\text{ s}$ produces random-walk angle uncertainty $\sigma_\theta(t) = \sigma_g \sqrt{t}$. Compute $\sigma_\theta(25.0\text{ s})$ in radians ($\text{rad}$, tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_ic = -(8.0 + (-3.0))
q2_ibeta = (0.0 + 2.0 * math.sqrt(3.0)) / math.sqrt(3.0)
theta_e = math.pi / 3.0
q3_iq = -(-6.0 * math.sqrt(3.0)) * math.sin(theta_e) + 6.0 * math.cos(theta_e)
q4_choice = "A"
q5_sigma_theta = 0.02 * math.sqrt(25.0)
assert math.isclose(q1_ic, -5.0, rel_tol=1e-9)
assert math.isclose(q2_ibeta, 2.0, rel_tol=1e-6)
assert math.isclose(q3_iq, 12.0, rel_tol=1e-6)
assert q4_choice == "A"
assert math.isclose(q5_sigma_theta, 0.10, rel_tol=1e-9)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1 or Q2, study `## 3. Formalization` item 1; if you missed Q3 or Q4, study `## 3. Formalization` item 2; if you missed Q5, study `## 3. Formalization` item 3. On pass, proceed to `## 10. Next modules`.


### Gate test
Covers the complete Track 03 Tier 2 bridge ladder (`03-sensors.T2.03a`) before Step 2.4 (`03-sensors.T2.04`):
1. `[Concept: three_phase_balanced_sum_and_clarke_projection]` Why do many 3-phase motor drivers only require **two** current-sense shunts (on phases A and B) instead of three?
   - **A.** Because KCL at the isolated motor neutral point guarantees $i_c = -(i_a + i_b)$ at every instant.
   - **B.** Because phase C never carries current.
   - **C.** Because phase C is connected to ground.
   - **D.** Because Clarke transform ignores phase B.
2. `[Concept: three_phase_balanced_sum_and_clarke_projection]` For balanced currents $i_a = 5.0\text{ A}, i_b = -2.5\text{ A}, i_c = -2.5\text{ A}$ (at $\theta_e = 0$), compute $i_\alpha$ and $i_\beta$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
3. `[Concept: park_rotating_frame_dc_demodulation]` For $(i_\alpha, i_\beta) = (5.0, 0.0)\text{ A}$ at $\theta_e = \pi/2\text{ rad}$, compute $i_d = i_\alpha\cos\theta_e + i_\beta\sin\theta_e$ and $i_q = -i_\alpha\sin\theta_e + i_\beta\cos\theta_e$ in amperes ($\text{A}$, tolerance $\pm 10^{-9}$).
4. `[Concept: park_rotating_frame_dc_demodulation]` What is the determinant of the $2\times 2$ Park rotation matrix $\begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix}$ for any angle $\theta_e$ (tolerance $\pm 10^{-9}$)?
5. `[Concept: park_rotating_frame_dc_demodulation]` Why is it much easier for a PI controller to regulate $(i_d, i_q)$ than to regulate $(i_a, i_b, i_c)$ directly at high RPM?
   - **A.** Because in the synchronous $(d, q)$ frame, steady-state currents are **DC quantities** ($\omega = 0$), where a PI integrator achieves zero steady-state tracking error regardless of rotor speed $\omega_e$.
   - **B.** Because $(i_d, i_q)$ are integers.
   - **C.** Because Park transform removes winding resistance $R_s$.
   - **D.** Because $(i_a, i_b, i_c)$ are DC signals.
6. `[Concept: pll_velocity_tracking_and_noise_random_walk]` Why must the phase residual in an angle-tracking PLL wrap $\theta_{\text{meas}} - \hat{\theta}$ into $[-\pi, \pi)$ via `atan2(sin(err), cos(err))` before multiplying by $K_p$ and $K_i$?
   - **A.** To prevent a spurious $\pm 2\pi$ step spike every time the encoder crosses the $2\pi \to 0$ rollover boundary.
   - **B.** To convert radians to degrees.
   - **C.** To make the PLL unstable.
   - **D.** Because encoders only read $[0, 1]$.
7. `[Concept: pll_velocity_tracking_and_noise_random_walk]` If a gyroscope has Angle Random Walk white noise density $\sigma_g = 0.01\text{ rad/s}/\sqrt{\text{Hz}}$, compute the averaged rate standard deviation $\sigma_{\bar{\omega}}(\tau) = \sigma_g / \sqrt{\tau}$ in $\text{rad/s}$ (tolerance $\pm 10^{-9}$) over an averaging time $\tau = 4.0\text{ s}$.
8. `[Concept: pll_velocity_tracking_and_noise_random_walk]` On a log-log Allan deviation plot $\log_{10}\sigma_A(\tau)$ vs. $\log_{10}\tau$, what slope corresponds to white rate noise ($\sigma_A(\tau) \propto \tau^{-1/2}$)? (Report the numeric slope, tolerance $\pm 10^{-9}$.)

**Gate answer key:**
```python
import math

g1_choice = "A"
g2_ialpha = 5.0
g2_ibeta = (5.0 + 2.0 * (-2.5)) / math.sqrt(3.0)
g3_id = 5.0 * math.cos(math.pi / 2.0)
g3_iq = -5.0 * math.sin(math.pi / 2.0)
g4_det = 1.0
g5_choice = "A"
g6_choice = "A"
g7_sigma = 0.01 / math.sqrt(4.0)
g8_slope = -0.5

assert g1_choice == "A"
assert math.isclose(g2_ialpha, 5.0, rel_tol=1e-9) and math.isclose(g2_ibeta, 0.0, abs_tol=1e-9)
assert math.isclose(g3_id, 0.0, abs_tol=1e-9) and math.isclose(g3_iq, -5.0, rel_tol=1e-9)
assert math.isclose(g4_det, 1.0, rel_tol=1e-9)
assert g5_choice == "A"
assert g6_choice == "A"
assert math.isclose(g7_sigma, 0.005, rel_tol=1e-9)
assert math.isclose(g8_slope, -0.5, rel_tol=1e-9)
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q2 $\to$ `## 3. Formalization` item 1; Q3–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Motor locks up at a fixed angle or draws huge current with zero torque when FOC starts | Used mechanical angle $\theta_m$ instead of electrical angle $\theta_e = p(\theta_m - \theta_{\text{offset}})$ in the Park transform, or forgot to calibrate the zero electric offset $\theta_{\text{offset}}$. | Run a 1-second open-loop $d$-axis alignment ($v_d = 1.5\text{ V}, v_q = 0$) at boot to latch $\theta_{\text{offset}}$ where the rotor aligns with Phase A ($\theta_e = 0$). |
| PLL velocity estimate kicks violently once per revolution | Subtracted raw angles $\theta_{\text{meas}} - \hat{\theta}$ without wrapping across the $\pm\pi$ seam. | Always wrap angle error using `math.atan2(math.sin(err), math.cos(err))` before feeding the PLL integrator. |
| Inverse Park transform rotates in the wrong direction | Used the forward Park matrix ($-\theta_e$) instead of its transpose ($+\theta_e$) when transforming $(v_d, v_q) \to (v_\alpha, v_\beta)$. | Use $\begin{bmatrix} \cos\theta_e & -\sin\theta_e \\ \sin\theta_e & \cos\theta_e \end{bmatrix}$ for the inverse Park transform. |

## 9. Resources
- **Texas Instruments — *Field Oriented Control of Permanent Magnet Motors* (`SPRABZ0`, `resources/textbooks-and-papers.md`):** Complete derivation of Clarke, Park, and inverse Park transforms `[VERIFIED 2026-10-15]`.
- **Track 03 (`03-sensors-and-actuators/README.md`):** Directly continues into Step 2.4 (`03-sensors.T2.04`) `[VERIFIED 2026-10-15]`.
## 10. Next modules
- Proceed to legacy **Step 2.4 (`03-sensors.T2.04`)** in [`03-sensors-and-actuators/README.md`](../03-sensors-and-actuators/README.md#tier-2-intermediate--applied).
