# Track 03: Sensors, Metrology, Actuators & Field-Oriented Drive Systems

> **Part of the [MechaLab Multi-Pass Tiered Roadmap](../README.md)**  
> **Prerequisites:** [Track 01: Mixed-Signal & Power Electronics](../01-electronics-and-power/README.md), [Track 02: Precision Mechanics, Kinematics & Dynamics](../02-mechanics-kinematics-dynamics/README.md)  
> **Feeds Into:** [Track 04: Embedded & Real-Time](../04-embedded-and-realtime/README.md), [Track 05: Control & Estimation](../05-control-and-estimation/README.md)  
> **Core Principle:** A closed-loop system is fundamentally bounded by the noise floor, bandwidth, and non-linearity of its sensors and the torque-ripple and saturation limits of its actuators. Calibrating transducer systematics and executing deterministic Field-Oriented Control (FOC) transforms raw electromagnetic hardware into an ideal linear torque source.

---

## 🔄 Linear Level-Up Navigation (Follow Your Current Pass Across Track 00 → Track 08)

Complete **only your current Tier section** below, verify its hands-on milestone, and proceed directly to **Track 04 in the same Tier**:

| Pass / Level | Previous Step in Pass | Current Track 03 Section | Next Linear Step in This Pass |
| :--- | :--- | :--- | :--- |
| **🟢 Pass 1: Tier 1 (Beginner)** | [← Track 02 (Tier 1)](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive) | [§1 Tier 1: Quadrature/Magnetic Encoders & Open-Loop BLDC (`SimpleFOC`)](#tier-1-beginner--intuitive) | [**Next in Pass 1 → Track 04 (Tier 1: Killing `delay()` & $1\text{ kHz}$ Timer ISR)**](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive) |
| **🔵 Pass 2: Tier 2 (Applied)** | [← Track 02 (Tier 2)](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied) | [§2 Tier 2: Clarke/Park Transforms, Type-II PLLs & Allan Variance](#tier-2-intermediate--applied) | [**Next in Pass 2 → Track 04 (Tier 2: FreeRTOS, DMA & CAN-FD)**](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied) |
| **🌉 Bridge Concept** | — | [§3 Bridging the Gap: Hobby Drone ESC / Voltage Mode $\to$ Center-Aligned Current FOC](#bridging-the-gap-maker-to-custom) | [Inspect Tier 3 Production Mastery ↓](#tier-3-advanced--production) |
| **🟣 Pass 3: Tier 3 (Production)** | [← Track 02 (Tier 3)](../02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production) | [§4 Tier 3: $25\text{–}40\text{ kHz}$ Decoupled $d$-$q$ FOC, SVPWM & Harmonic LUT](#tier-3-advanced--production) | [**Next in Pass 3 → Track 04 (Tier 3: `TIM1`$\to$`ADC`, CORDIC & `WaitFreeSeqLock`)**](../04-embedded-and-realtime/README.md#tier-3-advanced--production) |

---

## Tier 1 (Beginner / Intuitive)

> **Goal of Pass 1 (Track 03):** Read rotor position accurately using quadrature optical and on-axis magnetic encoders (`AS5600`/`AS5048`), understand how a 3-phase brushless motor rotates a magnetic field, and spin your first gimbal BLDC motor smoothly in angle mode using `SimpleFOC` and a `DRV8313`/`SimpleFOCMini` breakout.

### 1.1 Incremental (`A/B`) vs. Absolute Magnetic Encoders (`AS5600` / `AS5048`)
* **Incremental Quadrature Encoders (`A/B/Z`):** Two square waves offset by $90^\circ$ electrical let a hardware timer count $4\times$ edges per slot and detect direction from which channel leads. *Catch:* On power-up, the MCU does not know absolute angle until it rotates past the index pulse `Z`.
* **On-Axis Diametric Magnetic Encoders (`AS5600` I2C / `AS5048A` SPI / `MT6835`):** A tiny $6\text{ mm}$ diametrically magnetized neodymium magnet glued to the rear shaft rotates above a Hall/AMR sensor IC, providing instant **12-bit to 16-bit absolute angle** ($0\text{–}360^\circ$) the microsecond power turns on!

### 1.2 How a 3-Phase Brushless (BLDC / PMSM) Motor Actually Spins
* Unlike a brushed DC motor that mechanically switches coils via carbon brushes, a 3-phase brushless motor has three stator coil phases ($A, B, C$) separated by $120^\circ$ and a permanent-magnet rotor with $N_p$ pole pairs.
* **The Golden Law of Torque:** Maximum torque is produced when the stator's magnetic field vector is held exactly **$90^\circ$ electrical ahead of the rotor's permanent magnet poles** ($\theta_e = N_p \theta_{\text{mech}}$). If the stator field aligns with the rotor ($0^\circ$), you just pull radially on the magnets ($i_d$) and generate zero torque!

### 1.3 Sinusoidal Voltage Commutation with `SimpleFOC`
Using an `ESP32`/`STM32` + `SimpleFOCMini` (`DRV8313` 3-phase driver breakout) + `AS5600` magnetic encoder, you can close a smooth position/velocity loop in 20 lines of C++ (`SimpleFOC`) by commanding sinusoidal phase voltages $v_a, v_b, v_c$ locked to the measured encoder angle $\theta_e$.

### ✅ Tier 1 Milestone Gate (`Track 03 · Pass 1`)
* Wire a gimbal BLDC motor + `AS5600`/`AS5048` magnetic encoder + `DRV8313` breakout on your bench, run the electrical zero-offset alignment routine, and hold a target shaft angle with spring-like feel (or explore **Tab 3: 25 kHz PMSM FOC** in the interactive workbench).
* **Next Linear Step in Pass 1:** [**Proceed to Track 04 (Tier 1: Killing `delay()`, $1\text{ kHz}$ Timer ISRs & Binary Serial) →**](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive)

---

## Tier 2 (Intermediate / Applied)

> **Goal of Pass 2 (Track 03):** Move beyond voltage-mode `SimpleFOC` into true mathematical **Clarke & Park Coordinate Transforms**, **Type-II Phase-Locked Loop (PLL) Velocity Observers** (eliminating finite-difference quantization spikes), and **IMU Allan Variance** noise characterization.

### 2.1 Clarke ($\{a,b,c\}\to\{\alpha,\beta\}$) & Park ($\{\alpha,\beta\}\to\{d,q\}$) Intuition
Trying to tune a PI controller on three $1\text{ kHz}$ AC sine waves ($i_a, i_b, i_c$) fails because PI integrators always lag behind a moving target.
1. **Clarke Transform:** Projects the 3-phase currents ($i_a + i_b + i_c = 0$) onto a 2D stationary orthogonal frame $(i_\alpha, i_\beta)$.
2. **Park Transform:** Rotates that 2D frame by the live electrical rotor angle $\theta_e = N_p \theta_m$ so the axes spin *with* the rotor magnets:
   * **$d$-axis (Direct):** Points straight through the magnet North pole (controls wasted radial flux $\to$ regulate $i_d^* = 0$).
   * **$q$-axis (Quadrature):** Points $90^\circ$ ahead of the magnet (controls pure torque $\tau = \frac{3}{2}N_p \lambda_{pm} i_q$).
   * *Magic result:* In the $(d,q)$ frame, the AC sine waves become **flat DC numbers**, so standard PI controllers achieve zero steady-state error!

### 2.2 Why Finite-Difference Velocity Fails at $25\text{ kHz}$ (Type-II PLL Observer)
At $f_s = 25\text{ kHz}$ ($T_s = 40\ \mu\text{s}$), a 14-bit encoder's single-LSB quantization step ($\Delta q = 0.000383\text{ rad}$) divided by $T_s$ creates a **$\pm 9.6\text{ rad/s}$ ($91\text{ RPM}$) velocity spike**! Instead of $(\theta_k - \theta_{k-1})/T_s$, production drives run a **Type-II Angle Tracking Observer (PLL)**:

$$
e_\theta = \text{atan2}(\sin(\theta_{\text{meas}} - \hat{\theta}), \cos(\theta_{\text{meas}} - \hat{\theta})), \qquad \dot{\hat{\omega}} = K_i e_\theta, \qquad \dot{\hat{\theta}} = \hat{\omega} + K_p e_\theta
$$

### 2.3 IMU Metrology & Allan Deviation ($\sigma_A(\tau)$)
Extract Angle Random Walk ($N$, slope $-1/2$ at $\tau = 1\text{ s}$), Bias Instability ($B$, flat minimum floor), and Rate Random Walk ($K$, slope $+1/2$ at $\tau = 3\text{ s}$) from a static IMU log so your Track 05 Kalman filter uses measured physical covariances instead of guessed numbers.

### ✅ Tier 2 Milestone Gate (`Track 03 · Pass 2`)
* In **Tab 3: 25 kHz PMSM FOC**, test how Clarke/Park transforms convert $i_a, i_b, i_c$ into DC $i_d, i_q$, and verify how the Type-II PLL velocity observer tracks rotor speed cleanly without finite-difference quantization spikes.
* **Next Linear Step in Pass 2:** [**Proceed to Track 04 (Tier 2: FreeRTOS Scheduling, DMA Buffers & CAN-FD MIT Mode) →**](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied)

---

## Bridging the Gap: Maker to Custom

### From Hobby Drone ESCs & Voltage-Mode `SimpleFOC` to $25\text{–}40\text{ kHz}$ Center-Aligned Current FOC

| Feature | Tier 1 Maker Approach (Drone BLHeli ESC / Voltage-Mode `SimpleFOC`) | Tier 2/3 Custom Approach ($25\text{–}40\text{ kHz}$ Current-Regulated $d$-$q$ FOC) |
| :--- | :--- | :--- |
| **Zero-Speed Torque** | Drone ESCs use back-EMF zero-crossing and **cannot control torque at $0\text{ RPM}$** (they cog and stutter at low speed). | High-res SPI encoder + $d$-$q$ current loop delivers **100% smooth holding torque at $0.00\text{ RPM}$**. |
| **Thermal Runaway vs. True Torque** | Voltage-mode `SimpleFOC` sets $v_q$ without measuring phase current—as coils heat up ($R_s$ rises 40%), torque drops, or stall current melts windings. | Inner $d$-$q$ PI current loop measures true amps via Kelvin shunts at every PWM peak, guaranteeing exact torque $\tau = K_t i_q$ regardless of winding temperature. |
| **High-Speed Cross-Coupling** | Above $500\text{ RPM}$, uncompensated $\omega_e L_q i_q$ pushes phase current out of alignment. | Feedforward decoupling ($v_d^* = u_d - \omega_e L_q i_q$, $v_q^* = u_q + \omega_e(L_d i_d + \lambda_{pm})$) + SVPWM keeps $i_d \approx 0\text{ A}$ up to base speed. |

---

## Tier 3 (Advanced / Production)

> **Goal of Pass 3 (Track 03):** Master production actuator & metrology engineering: encoder spatial harmonic LUT calibration, Allan variance error budgets, pole-zero cancellation $d$-$q$ current PI synthesis, feedforward back-EMF/cross-coupling decoupling, Min-Max SVPWM (+15.47% bus utilization), and anticogging torque-ripple suppression.
> * [**Next Linear Step in Pass 3 → Track 04 (Tier 3: Bare-Metal `TIM1`$\to$`ADC`, CORDIC & C++20 `WaitFreeSeqLock`)**](../04-embedded-and-realtime/README.md#tier-3-advanced--production)

### 4.1 Field-Oriented Control (FOC) & Metrology Architecture

```mermaid
flowchart LR
    subgraph REF_CMD["Outer Servo Loop (1–4 kHz)"]
        POS_VEL["Position / Velocity / Impedance Controller<br/>τ_ref = K_p(q_d - q) + K_d(q̇_d - q̇) + τ_ff"]
        MTPA["MTPA & Field-Weakening Map<br/>τ_ref, ω_e, V_bus ↦ (i_d*, i_q*)"]
        COG["Anticogging Lookup Table<br/>+i_q,cog(θ_m)"]
        
        POS_VEL --> MTPA
        COG --> MTPA
    end

    subgraph INNER_FOC["Hard Real-Time Inner Current Loop (20–50 kHz)"]
        PI_DQ["Synchronous d-q PI Controllers<br/>+ Back-EMF & Cross-Coupling Decoupling:<br/>v_d* = PI_d(e_d) - ω_e L_q i_q<br/>v_q* = PI_q(e_q) + ω_e (L_d i_d + λ_pm)"]
        IPARK["Inverse Park Transform<br/>(v_d*, v_q*, θ_e) ↦ (v_α*, v_β*)"]
        SVPWM["Space Vector PWM (SVPWM)<br/>+ Dead-Time Compensation<br/>(v_α*, v_β*, V_bus) ↦ (d_a, d_b, d_c)"]
        CLARKE["Clarke Transform<br/>(i_a, i_b, i_c) ↦ (i_α, i_β)"]
        PARK["Park Transform<br/>(i_α, i_β, θ_e) ↦ (i_d, i_q)"]

        MTPA -->|i_d*, i_q*| PI_DQ
        PI_DQ --> IPARK --> SVPWM
        CLARKE --> PARK
        PARK -->|i_d, i_q| PI_DQ
    end

    subgraph HW_PLANT["Inverter, PMSM & Transducer Hardware"]
        INV["3-Phase Inverter<br/>+ Shunt/Hall Current Sense"]
        PMSM(["3-Phase PMSM / BLDC<br/>Pole Pairs N_p"])
        ENC["Calibrated High-Res Encoder<br/>(BiSS-C / SPI + Harmonic LUT)<br/>+ PLL Velocity Tracker"]

        SVPWM -->|PWM Duty| INV
        INV ==>|I_abc| PMSM
        PMSM --> ENC
        INV -->|ADC DMA Sync| CLARKE
        ENC -->|θ_e = N_p · θ_m, ω_e| PARK
        ENC -->|θ_e| IPARK
        ENC -->|θ_m, ω_m| POS_VEL
    end

    style REF_CMD fill:#1e3a8a,stroke:#60a5fa,color:#eff6ff
    style INNER_FOC fill:#064e3b,stroke:#34d399,color:#ecfdf5
    style HW_PLANT fill:#3b0764,stroke:#c084fc,color:#faf5ff
```

### 4.2 Rotary & Linear Position Encoders & Allan Variance Table

| Encoder Technology | Typical Resolution | Max Speed / Bandwidth | Interface Protocol | Primary Error Sources & Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **Optical Incremental** | $1,000 - 10,000\text{ CPR}$ ($\times 4$) | $> 1\text{ MHz}$ edge rate | RS-422 Diff `A/A-, B/B-, Z/Z-` | Disk eccentricity ($1\times$ harmonic); requires homing to index `Z` on boot |
| **Optical Sin/Cos Interpolated** | $20 - 26\text{ bits}$ ($1\text{ V}_{\text{pp}}$) | $500\text{ kHz}$ analog | Diff $1\text{ V}_{\text{pp}}$ + EnDat 2.2 / BiSS-C | Lissajous offset, amplitude mismatch, phase error; Heydemann calibration |
| **Magnetic (Hall / AMR / TMR)** | $14 - 18\text{ bits}$ absolute | $10 - 50\text{ kHz}$ SPI | SPI / BiSS-C / SSI | $1\times, 2\times, 4\times$ spatial harmonics from magnet tilt; calibrate via harmonic LUT |
| **Inductive (IncOder / Eddy)** | $16 - 22\text{ bits}$ absolute | $10 - 40\text{ kHz}$ | BiSS-C / SPI | Immune to oil, dust, and stray magnetic fields; ideal for harsh robot joints |
| **Electromagnetic Resolver** | $12 - 16\text{ bits}$ (`AD2S1210`) | $>150^\circ\text{C}$, $50g$ shock | $2\text{–}10\text{ kHz}$ sine excitation | Phase shift between excitation and secondary windings |

| Noise Process | Allan Deviation Log-Log Slope | Extraction Point on $\sigma_A(\tau)$ Curve | Continuous Kalman Covariance Parameter |
| :--- | :--- | :--- | :--- |
| **Quantization Noise ($Q_n$)** | $-1$ | Read at $\tau = \sqrt{3}$ | Fixed by ADC bit depth |
| **Angle / Velocity Random Walk ($N$)** | $-\frac{1}{2}$ | Read directly at $\tau = 1\text{ s}$ | Continuous white noise PSD $\sigma_g^2 = N^2$ |
| **Bias Instability ($B$, $1/f$ Flicker)** | $0$ (Flat minimum floor) | Minimum divided by $\sqrt{\frac{2\ln 2}{\pi}} \approx 0.664$ | Bounds best achievable static bias convergence |
| **Rate Random Walk ($K$, Bias Drift)** | $+\frac{1}{2}$ | Read at $\tau = 3\text{ s}$ on $+1/2$ slope | Bias random walk PSD $\sigma_{bg}^2 = K^2$ |

### 4.3 PMSM Synchronous $d$-$q$ Dynamics, Decoupling & Min-Max SVPWM

1. **Amplitude-Invariant Clarke & Park Transforms:**

$$
\begin{bmatrix} i_\alpha \\ i_\beta \end{bmatrix} = \begin{bmatrix} i_a \\ \frac{1}{\sqrt{3}}(i_a + 2i_b) \end{bmatrix}, \qquad \begin{bmatrix} i_d \\ i_q \end{bmatrix} = \begin{bmatrix} \cos\theta_e & \sin\theta_e \\ -\sin\theta_e & \cos\theta_e \end{bmatrix}\begin{bmatrix} i_\alpha \\ i_\beta \end{bmatrix}
$$

2. **Stator Voltage & Electromagnetic Torque Equations:**

$$
v_d = R_s i_d + L_d \frac{di_d}{dt} - \omega_e L_q i_q, \qquad v_q = R_s i_q + L_q \frac{di_q}{dt} + \omega_e L_d i_d + \omega_e \lambda_{pm}, \qquad \tau_e = \frac{3}{2} N_p \Big(\lambda_{pm} i_q + (L_d - L_q) i_d i_q\Big)
$$

3. **Pole-Zero Cancellation Current PI Gains & Feedforward Decoupling:**

$$
K_{p,d} = L_d \omega_{bw,i}, \quad K_{i,d} = R_s \omega_{bw,i}, \qquad K_{p,q} = L_q \omega_{bw,i}, \quad K_{i,q} = R_s \omega_{bw,i}
$$

$$
v_d^* = u_d - \hat{\omega}_e \hat{L}_q i_q, \qquad v_q^* = u_q + \hat{\omega}_e (\hat{L}_d i_d + \hat{\lambda}_{pm})
$$

4. **Fast Embedded Min-Max SVPWM (Zero Trigonometry, $+15.47\%$ Bus Utilization):**

$$
v_{\text{offset}} = -\frac{1}{2}\big(\max(v_a^*, v_b^*, v_c^*) + \min(v_a^*, v_b^*, v_c^*)\big), \qquad d_{a,b,c} = \frac{1}{2} + \frac{v_{a,b,c}^* + v_{\text{offset}}}{V_{\text{bus}}} \in [0, 1]
$$

---

## 5. Failure Modes, Pitfalls & Anti-Patterns

1. **Sampling ADC Currents During PWM Switching Edges:** Always trigger simultaneous ADC conversions at the exact center of the low-side MOSFET on-time (`TIM1_TRGO2` at `CNT == ARR`).
2. **Missing Integrator Anti-Windup During Voltage Circle Saturation:** Prioritize $v_d^*$ when clamping $\sqrt{v_d^{*2} + v_q^{*2}} \le V_{\text{bus}}/\sqrt{3}$ so rotor flux orientation is never lost.
3. **Electrical Zero Offset Error ($\theta_{e,\text{offset}}$):** Calibrate electrical zero by averaging bidirectional $d$-axis alignment sweeps to cancel friction hysteresis.
4. **6th-Harmonic Torque Ripple from Dead-Time & Cogging:** Combine current-sign dead-time voltage compensation with a position-indexed Anticogging LUT.

---

## 6. Tier 3 Production Lab & Milestone Gate (`Lab 03`)

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **Calibrated Encoder Nonlinearity (INL)** | Peak-to-peak error $< \pm 0.04^\circ$ mechanical across full $360^\circ$ rotation | Harmonic Fourier LUT calibration cross-check |
| **Current Loop Bandwidth ($-3\text{ dB}$)** | $f_{-3\text{dB}} \ge 2.0\text{ kHz}$ with overshoot $< 4\%$ and zero steady-state error | $i_q^*$ step response ($90\%$ rise time $\le 180\ \mu\text{s}$) in Tab 3 FOC Simulator |
| **$d$-$q$ Axis Cross-Coupling Rejection** | Peak $\lvert i_d \rvert$ perturbation $< 0.15\text{ A}$ during $0 \to 10\text{ A}$ $i_q^*$ step at $2,000\text{ RPM}$ | Compare Decoupling ON vs. OFF in Tab 3 FOC Simulator |
| **Cogging Torque Ripple Suppression** | Peak-to-peak velocity ripple reduced by $\ge 75\%$ at $10\text{ RPM}$ with Anticogging LUT | PLL velocity spectrum FFT at $1\times, 6\times, N_{\text{slots}}\times$ harmonics |
