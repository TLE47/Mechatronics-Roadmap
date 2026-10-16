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
| **🟢 Pass 1: Tier 1 (Beginner)** | [← Track 02 (Tier 1)](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive) | [§1 Tier 1: Quadrature/Magnetic Encoders & Open-Loop BLDC (`SimpleFOC`)](#tier-1-beginner--intuitive) | [**Next in Pass 1 → Track 04 (Tier 1: Killing `delay()` & 1 kHz Timer ISR)**](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive) |
| **🔵 Pass 2: Tier 2 (Applied)** | [← Track 02 (Tier 2)](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied) | [§2 Tier 2: Clarke/Park Transforms, Type-II PLLs & Allan Variance](#tier-2-intermediate--applied) | [**Next in Pass 2 → Track 04 (Tier 2: FreeRTOS, DMA & CAN-FD)**](../04-embedded-and-realtime/README.md#tier-2-intermediate--applied) |
| **🌉 Bridge Concept** | — | [§3 Bridging the Gap: Hobby Drone ESC / Voltage Mode → Center-Aligned Current FOC](#bridging-the-gap-maker-to-custom) | [Inspect Tier 3 Production Mastery ↓](#tier-3-advanced--production) |
| **🟣 Pass 3: Tier 3 (Production)** | [← Track 02 (Tier 3)](../02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production) | [§4 Tier 3: 25–40 kHz Decoupled d-q FOC, SVPWM & Harmonic LUT](#tier-3-advanced--production) | [**Next in Pass 3 → Track 04 (Tier 3: `TIM1`→`ADC`, CORDIC & `WaitFreeSeqLock`)**](../04-embedded-and-realtime/README.md#tier-3-advanced--production) |

---

## Tier 1 (Beginner / Intuitive)

> **Goal of Pass 1 (Track 03):** Read rotor position accurately using quadrature optical and on-axis magnetic encoders (`AS5600`/`AS5048`), understand how a 3-phase brushless motor rotates a magnetic field, and spin your first gimbal BLDC motor smoothly in angle mode using `SimpleFOC` and a `DRV8313`/`SimpleFOCMini` breakout.
> **📚 Required Foundations & Bridge Modules for Pass 1 (Track 03):** Complete Tier 1 Foundations [`00-foundations.T1.00c`](../modules/00-foundations.T1.00c.md) (SI Units & RPM-to-$\text{rad/s}$), [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md) (*Radians & 2D Vectors*), and [`01-electronics.T1.01b`](../modules/01-electronics.T1.01b.md) (*PWM H-Bridges*) plus the Track 03 Tier 1 Bridge [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md).

### Beginner-First Lesson Series (`03.1 – 03.2`, $\le 2$ new ideas per lesson)

If you are following the **Beginner-First Track (`Track P → Stage 0 → Track 00–08 Tier 1`)**, complete these two self-contained Python lessons before or alongside the hardware build steps below:

| Lesson | Title | New Ideas ($\le 2$) | Est. Time |
| :--- | :--- | :--- | :--- |
| **[03.1](03.1-quadrature-and-magnetic-encoders.md)** | **Quadrature Encoders ($4\times$ Counting) and 12-Bit Magnetic Angle Sensors** | 1. Incremental quadrature encoders (A/B channels & $4\times$ edge counting)<br>2. 12-bit absolute magnetic encoders (`AS5600` $0\text{–}4095$ counts to degrees/radians) | 45–60 min |
| **[03.2](03.2-three-phase-bldc-and-electrical-angle.md)** | **3-Phase Brushless Motors, Pole Pairs and $90^\circ$ Electrical Torque Lead** | 1. Pole pairs ($N_p$) and electrical angle vs. mechanical shaft angle ($\theta_e = N_p \theta_m$)<br>2. 3-phase sinusoidal commutation and the $90^\circ$ electrical torque lead rule | 45–60 min |

### 1.1 Incremental (`A/B`) vs. Absolute Magnetic Encoders (`AS5600` / `AS5048`)
- **Core Summary:** Incremental quadrature encoders output two $90^\circ$ phase-shifted square waves (`A/B`) that count relative steps ($4\times$ edges per slot) from boot, whereas on-axis diametric magnetic encoders (`AS5600` / `AS5048A` / `MT6835`) measure the magnetic field vector of a rear-shaft neodymium magnet to provide instant 12-to-16-bit absolute shaft angle ($0^\circ\text{–}360^\circ$) the microsecond power is applied.
  * **Incremental Quadrature Encoders (`A/B/Z`):** Two square waves offset by $90^\circ$ electrical let a hardware timer count $4\times$ edges per slot and detect direction from which channel leads. *Catch:* On power-up, the MCU does not know absolute angle until it rotates past the index pulse `Z`.
  * **On-Axis Diametric Magnetic Encoders (`AS5600` I2C / `AS5048A` SPI / `MT6835`):** A tiny $6\text{ mm}$ diametrically magnetized neodymium magnet glued to the rear shaft rotates above a Hall/AMR sensor IC, providing instant **12-bit to 16-bit absolute angle** ($0\text{–}360^\circ$) at boot.
- **Curated Free Resources:**
  - 🔗 [SimpleFOC Docs: Position Sensors (Magnetic, Quadrature & Hall)](https://docs.simplefoc.com/sensors) — *Practical wiring and code guide for connecting `AS5600`, `AS5048A`, and optical quadrature encoders to microcontrollers.*
  - 🔗 [Jacob Fraden: Handbook of Modern Sensors — Physics, Designs, and Applications (5th Ed.)](https://link.springer.com/book/10.1007/978-3-319-19303-8) — *Comprehensive physics reference for optical, magnetic (Hall/AMR/TMR), inductive, piezoelectric, and capacitive transducers.*
  - 🔗 [AMS AS5600 12-Bit Programmable Contactless Potentiometer Datasheet](https://look.ams-osram.com/m/7059eac7531a86fd/original/AS5600-DS000365.pdf) — *Shows why a diametrically magnetized magnet (N/S across the diameter, not top-to-bottom) is required for on-axis magnetic angle sensing.*
- **🧪 Hands-On Exercise:**
  - *Task:* Mount a $6\text{ mm} \times 2.5\text{ mm}$ diametrically magnetized N35 magnet to the rear shaft of a motor ($0.5\text{–}1.5\text{ mm}$ vertical airgap above an `AS5600` or `AS5048A` breakout, $<0.25\text{ mm}$ radial eccentricity).
    - **Canonical `AS5600` (`I2C`, Addr `0x36`) Wiring:** Connect `VCC -> 3.3V` (on 3.3V mode: bridge `VCC` and `3V3` pads or feed `3.3V`), `GND -> GND`, `SDA -> MCU SDA` (with $3.3\text{ k}\Omega$ pull-up to `3.3V`), `SCL -> MCU SCL` (with $3.3\text{ k}\Omega$ pull-up), and tie `DIR -> GND` (so clockwise rotation increases angle; leaving `DIR` floating causes random direction flips!).
    - Stream the raw 12-bit ($0\text{–}4095$) or 14-bit ($0\text{–}16383$) angle over Serial while rotating the shaft by hand, and verify that power-cycling the MCU preserves the exact absolute angle reading without homing.
  - *📚 What to Learn & Resource Links for This Exercise:* Study radians and angle wrapping in Foundations [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md), I2C/SPI sensor pull-ups in [`01-electronics.T1.01a`](../modules/01-electronics.T1.01a.md), and quadrature/magnetic encoder resolution ($\Delta\theta = \frac{2\pi}{4 N_{\text{lines}}}$ or $\frac{2\pi}{2^{N_{\text{bits}}}}$) in [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md), plus the [AMS AS5600 / AS5048A Magnetic Encoder Datasheet](https://ams-osram.com/).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** What happens if you accidentally glue a standard *axially* magnetized magnet (North on top flat face, South on bottom flat face) above an `AS5600` Hall encoder instead of a *diametrically* magnetized magnet?
  * **Answer / Explanation:** The sensor will output garbage or remain stuck at a constant angle! On-axis Hall/AMR angle sensors measure the in-plane rotation of the horizontal magnetic field vector $(B_x, B_y)$ across the chip die. An axially magnetized magnet produces a purely vertical $B_z$ field that does not change as the shaft spins.

  **Q2:** A quadrature optical encoder disk has $1000\text{ lines (CPR)}$. When decoded in $4\times$ quadrature mode (counting both rising and falling edges of both channels `A` and `B`), how many discrete counts per mechanical revolution do you get, and what is the angular resolution in degrees?
  * **Answer & Explanation:** $4 \times 1000 = 4000\text{ counts/rev}$. The angular resolution is $360^\circ / 4000 = 0.09^\circ$ per count ($0.00157\text{ rad}$).
  </details>

### 1.2 How a 3-Phase Brushless (BLDC / PMSM) Motor Actually Spins
- **Core Summary:** A 3-phase brushless motor contains three stator coil phases ($A, B, C$) spaced $120^\circ$ apart and a permanent-magnet rotor with $N_p$ pole pairs. Maximum torque is produced when the stator magnetic field vector is held exactly **$90^\circ$ electrical ahead of the rotor's magnetic poles** ($\theta_e = N_p \theta_{\text{mech}}$); pulling directly in line with the magnets ($0^\circ$) wastes current as radial force ($i_d$) with zero rotary torque.
- **Curated Free Resources:**
  - 🔗 [SimpleFOC Docs: Brushless Motor Theory & FOC Intuition](https://docs.simplefoc.com/foc_theory) — *Visualizes how 3-phase sinusoidal voltages create a smoothly rotating stator magnetic vector.*
  - 🔗 [GreatScott! (YouTube): Brushless DC Motors & ESCs Explained](https://www.youtube.com/watch?v=b5J5qkR722I) — *Intuitive hardware teardown of stator slots, rotor pole pairs, and electronic commutation.*
- **🧪 Hands-On Exercise:**
  - *Task:* Count the physical permanent magnets around the rotor bell of a gimbal BLDC motor (e.g., $14\text{ magnets}$ or $22\text{ magnets}$) and divide by $2$ to find its pole pairs $N_p$ ($7$ or $11$). Verify experimentally by energizing Phase A with $+3\text{ V}$ and Phases B/C with $\text{GND}$ (current-limited to $0.5\text{ A}$) and counting how many magnetic "detents" you feel when rotating the rotor by hand through one full $360^\circ$ mechanical turn.
  - *📚 What to Learn & Resource Links for This Exercise:* Study CC/CV bench power supply current limiting in [`01-electronics.T1.01c`](../modules/01-electronics.T1.01c.md) and DC motor constants ($K_t = K_e$ in SI) + pole-pair electrical angle $\theta_e = N_p \theta_m$ in [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md), plus [SimpleFOC Pole-Pair Finder & BLDC Theory Docs (`docs.simplefoc.com`)](https://docs.simplefoc.com/).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** A gimbal brushless motor has $N_p = 11$ pole pairs. When the physical shaft rotates by $10^\circ$ mechanical, by how many *electrical* degrees does the rotor's magnetic field advance?
  * **Answer / Explanation:** $\Delta \theta_e = N_p \cdot \Delta \theta_{\text{mech}} = 11 \times 10^\circ = 110^\circ\text{ electrical}$. Because the magnetic pattern repeats $11$ times per mechanical revolution, the electrical sine wave cycles $11\times$ faster than the mechanical shaft!

  **Q2:** Why does aligning the stator magnetic field at $0^\circ$ electrical relative to the rotor permanent magnet produce zero torque?
  * **Answer & Explanation:** Torque is the cross product $\boldsymbol{\tau} = \boldsymbol{\mu}_{\text{rotor}} \times \mathbf{B}_{\text{stator}}$, which is proportional to $\sin(\theta_{\text{stator}} - \theta_{\text{rotor}})$. At $0^\circ$, $\sin(0^\circ) = 0$: the stator coils merely pull or push radially on the rotor bearings (pure $d$-axis current $i_d$), generating heat without tangential force. At $90^\circ$, $\sin(90^\circ) = 1$, producing maximum tangential torque per amp (pure $q$-axis current $i_q$).
  </details>

### 1.3 Sinusoidal Voltage Commutation with `SimpleFOC`
- **Core Summary:** Using an `ESP32`/`STM32` + `SimpleFOCMini` (`DRV8313` 3-phase driver breakout) + `AS5600` magnetic encoder, you can close a smooth position/velocity loop in 20 lines of C++ (`SimpleFOC`) by commanding sinusoidal phase voltages $v_a, v_b, v_c$ locked $90^\circ$ electrical ahead of the measured encoder angle $\theta_e$.
- **Self-Contained C++ Sketch Anatomy Primer (Before Track 04 [`04-embedded.T1.04a`](../modules/04-embedded.T1.04a.md)):**
  Because Track 03 Tier 1 comes right before Track 04 Tier 1 in Pass 1, here is how to read a 20-line `SimpleFOC` Arduino/PlatformIO C++ sketch if you have only written Python so far:
  - `#include <SimpleFOC.h>` is C++'s `import SimpleFOC`. Every statement ends with `;`, and blocks use `{ ... }` instead of indentation.
  - `BLDCMotor motor = BLDCMotor(7);` and `BLDCDriver3PWM driver = BLDCDriver3PWM(25, 26, 27, 14);` instantiate C++ objects (for a 7-pole-pair motor and PWM pins `25, 26, 27` + enable pin `14`).
  - `void setup() { ... }` runs **once** at power-up (`driver.init(); motor.linkDriver(&driver); motor.init(); motor.initFOC();`—where `&driver` passes the memory address of `driver`).
  - `void loop() { motor.loopFOC(); motor.move(target_rad); }` repeats forever in an infinite hardware `while (true)` loop! (For `pio run -t upload` flashing instructions, see [`resources/open-source-toolchains.md` §0](../resources/open-source-toolchains.md#0-core-supported-os-environment-terminal-bootstrap--python-venv-setup).)
- **Curated Free Resources:**
  - 🔗 [SimpleFOC Official Documentation: Writing Your First Closed-Loop Angle Sketch](https://docs.simplefoc.com/angle_loop) — *Step-by-step wiring and Arduino/PlatformIO C++ code for sinusoidal voltage-mode position control.*
  - 🔗 [Texas Instruments DRV8313 Triple Half-Bridge Driver Datasheet](https://www.ti.com/lit/ds/symlink/drv8313.pdf) — *Reference datasheet for the* $8\text{–}60\text{ V}$ *,* $2.5\text{ A}$ *integrated 3-phase motor driver IC used on `SimpleFOCMini` breakouts.*
- **🧪 Hands-On Exercise:**
  - *Task:* Wire a gimbal BLDC motor + `AS5600`/`AS5048` magnetic encoder + `DRV8313` breakout on your bench, run the `SimpleFOC` electrical zero-offset alignment routine, and hold a target shaft angle with a spring-like feel (or explore **Tab 3: 25 kHz PMSM FOC** in the interactive workbench).
  - *📚 What to Learn & Resource Links for This Exercise:* Study unit-circle trigonometry ($\cos\theta_e, \sin\theta_e$) in Foundations [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md), C-for-Python syntax in [`04-embedded.T1.04a`](../modules/04-embedded.T1.04a.md), and torque-speed curves + electrical zero alignment in [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md), plus [SimpleFOC Closed-Loop Angle Control Guide (`docs.simplefoc.com`)](https://docs.simplefoc.com/angle_loop).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** What does the `SimpleFOC` initialization routine do when it briefly locks the motor rotor to a fixed position before starting closed-loop control?
  * **Answer / Explanation:** It performs **electrical zero offset calibration** (`zero_electric_angle`) and direction check! By applying a known stator voltage vector along Phase A ($\theta_e = 0$) and reading the absolute magnetic encoder angle $\theta_m$, the firmware learns the exact offset between the glued magnet's arbitrary mounting angle and the stator coils' electrical zero.

  **Q2:** Why is voltage-mode `SimpleFOC` only safe for high-resistance gimbal motors ($R_s \approx 5\text{–}15\ \Omega$) and dangerous for low-resistance drone/robotics motors ($R_s \approx 0.05\ \Omega$)?
  * **Answer & Explanation:** Without current sensors, stalling a motor at $v_q = 6\text{ V}$ causes steady-state phase current $I = v_q / R_s$. On a $10\ \Omega$ gimbal motor, $I = 0.6\text{ A}$ (safe). On a $0.05\ \Omega$ power motor, $I = 6\text{ V} / 0.05\ \Omega = 120\text{ A}$, which instantly vaporizes the MOSFETs and motor windings!
  </details>

### ✅ Tier 1 Milestone Gate (`Track 03 · Pass 1`)
* Wire a gimbal BLDC motor + `AS5600`/`AS5048` magnetic encoder + `DRV8313` breakout on your bench, run the electrical zero-offset alignment routine, and hold a target shaft angle with spring-like feel (or explore **Tab 3: 25 kHz PMSM FOC** in the interactive workbench).
* **Next Linear Step in Pass 1:** [**Proceed to Track 04 (Tier 1: Killing `delay()`, 1 kHz Timer ISRs & Binary Serial) →**](../04-embedded-and-realtime/README.md#tier-1-beginner--intuitive)

---

## Tier 2 (Intermediate / Applied)

> **Goal of Pass 2 (Track 03):** Move beyond voltage-mode `SimpleFOC` into true mathematical **Clarke & Park Coordinate Transforms**, **Type-II Phase-Locked Loop (PLL) Velocity Observers** (eliminating finite-difference quantization spikes), and **IMU Allan Variance** noise characterization.
> **📚 Required Foundations & Bridge Modules for Pass 2 (Track 03):** Complete Tier 2 Foundations [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md) (*Orthogonal Matrix Transforms*), [`00-foundations.T2.00c`](../modules/00-foundations.T2.00c.md) (*2nd-Order Critically Damped Poles*), and [`00-foundations.T2.00f`](../modules/00-foundations.T2.00f.md) (*Gaussian Noise Variance & PSD*) plus the Track 03 Tier 2 Bridge [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md).

### 2.1 Clarke ($\{a,b,c\}\to\{\alpha,\beta\}$) & Park ($\{\alpha,\beta\}\to\{d,q\}$) Intuition
- **Core Summary:** Standard PI controllers lag behind high-frequency AC sine waves ($i_a, i_b, i_c$). The **Clarke transform** projects balanced 3-phase currents onto a stationary 2D orthogonal frame $(i_\alpha, i_\beta)$, and the **Park transform** rotates that frame by the live electrical angle $\theta_e = N_p \theta_m$ into the rotor's $(d,q)$ frame—turning AC sine waves into flat DC quantities where $i_d^*= 0* $ regulates radial flux and $ *i_q^*$ directly commands torque $\tau = \frac{3}{2}N_p \lambda_{pm} i_q$.
- **Curated Free Resources:**
  - 🔗 [Texas Instruments Teaching Old Motors New Tricks — Part 1: Clarke & Park Transforms (YouTube)](https://www.youtube.com/watch?v=cdiZUszYLiA) — *Legendary lecture by Dave Wilson (TI) explaining why transforming AC currents into the rotating rotor frame makes FOC work.*
  - 🔗 [Microchip AN2590: Field-Oriented Control (FOC) of PMSMs](https://ww1.microchip.com/downloads/en/AppNotes/00002590B.pdf) — *Step-by-step vector diagrams and equations for Clarke, Park, and Inverse Park transforms.*
  - 🔗 [VESC Project Open-Source BLDC/FOC Motor Controller (vesc-project.com)](https://vesc-project.com/) — *Production open-source C firmware (`bldc`) implementing sensorless HFI/observer and sensored FOC with live `VESC Tool` telemetry.*
  - 🔗 [mjbots `moteus` Open-Source Brushless QDD Servo Controller (github.com/mjbots/moteus)](https://github.com/mjbots/moteus) — *STM32G4-based integrated CAN-FD FOC controller with on-board magnetic encoder LUT calibration.*
- **🧪 Hands-On Exercise:**
  - *Task:* Write a 15-line Python function that generates balanced 3-phase currents $i_a(t) = I_{\text{pk}}\cos(\omega_e t + \pi/2)$, $i_b(t) = I_{\text{pk}}\cos(\omega_e t + \pi/2 - 2\pi/3)$, $i_c(t) = -i_a - i_b$ for $I_{\text{pk}} = 10\text{ A}$ at $1000\text{ RPM}$, applies the amplitude-invariant Clarke and Park transforms using $\theta_e(t) = \omega_e t$, and verifies that the resulting $(i_d, i_q)$ stays rock-solid at $(0.0\text{ A}, 10.0\text{ A})$ across all time $t$.
  - *📚 What to Learn & Resource Links for This Exercise:* Study 2D rotation matrices in Foundations **Step 1.1 (`00-foundations.T1.01`)**, matrix multiplication in [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md), and amplitude-invariant Clarke ($i_\alpha, i_\beta$) & Park ($i_d, i_q$) transforms in [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) (`## 3. Formalization` Item 1 & `## 4. Worked example`), plus [TI Sensored Field Oriented Control of 3-Phase PMSM Motors (BPRA073)](https://www.ti.com/lit/pdf/bpra073).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why do you only need to measure **two** phase currents ($i_a$ and $i_b$) in a star-connected 3-phase motor to compute the full Clarke transform?
  * **Answer / Explanation:** Because the neutral star point is isolated (floating), Kirchhoff's Current Law requires $i_a + i_b + i_c = 0$ at all instants. Thus $i_c = -(i_a + i_b)$, and $i_\beta = \frac{1}{\sqrt{3}}(i_a + 2i_b)$ can be computed directly from $i_a$ and $i_b$ (though measuring all three phases allows choosing the two phases with the widest low-side PWM window at high modulation depth!).

  **Q2:** If a surface-mounted PMSM has $N_p = 7$ pole pairs and permanent magnet flux linkage $\lambda_{pm} = 0.012\text{ Wb}$, how much shaft torque $\tau_e$ is produced when $i_d = 0\text{ A}$ and $i_q = 8.0\text{ A}$?
  * **Answer & Explanation:** Using the amplitude-invariant torque equation $\tau_e = \frac{3}{2} N_p \lambda_{pm} i_q = 1.5 \times 7 \times 0.012 \times 8.0 = 1.008\text{ N}\cdot\text{m}$ (corresponding to a torque constant $K_t = \frac{3}{2}N_p \lambda_{pm} = 0.126\text{ N}\cdot\text{m/A}$).
  </details>

### 2.2 Why Finite-Difference Velocity Fails at $25\text{ kHz}$ (Type-II PLL Observer)
- **Core Summary:** Differentiating a quantized 14-bit encoder at $f_s = 25\text{ kHz}$ ($T_s = 40\ \mu\text{s}$) amplifies a single-LSB step ($\Delta q = 0.000383\text{ rad}$) into a massive $\pm 9.6\text{ rad/s}$ ($91\text{ RPM}$) velocity spike. Replacing $(\theta_k - \theta_{k-1})/T_s$ with a **Type-II Angle-Tracking Phase-Locked Loop (PLL)** tracks angle and velocity smoothly with zero steady-state lag at constant speed.

$$
e_\theta = \text{atan2}(\sin(\theta_{\text{meas}} - \hat{\theta}), \cos(\theta_{\text{meas}} - \hat{\theta})), \qquad \dot{\hat{\omega}} = K_i e_\theta, \qquad \dot{\hat{\theta}} = \hat{\omega} + K_p e_\theta
$$

- **Curated Free Resources:**
  - 🔗 [ODrive Firmware Docs: Encoder PLL Estimator Design](https://docs.odriverobotics.com/v/latest/control.html) — *Shows how production open-source motor drives implement a second-order tracking PLL with bandwidth* $\omega_{\text{pll}}$ *and critical damping (* $K_p = 2\omega_{\text{pll}}$ *,* $K_i = \omega_{\text{pll}}^2$ *).*
  - 🔗 [Lab 03 Script: `03-sensors-and-actuators/lab/lab03_foc_and_metrology.py`](./lab/lab03_foc_and_metrology.py) — *Executable reference comparing raw finite-difference velocity spikes against the Type-II PLL velocity observer.*
- **🧪 Hands-On Exercise:**
  - *Task:* In **Tab 3: 25 kHz PMSM FOC** or Python, simulate a 14-bit encoder spinning at $5.0\text{ rad/s}$ sampled at $25\text{ kHz}$. Compare the RMS velocity error of raw Euler backward difference $(\theta_k - \theta_{k-1})/T_s$ against a critically damped Type-II PLL with bandwidth $\omega_{\text{pll}} = 2\pi(150\text{ Hz})$ ($K_p = 2\omega_{\text{pll}}$, $K_i = \omega_{\text{pll}}^2$).
  - *📚 What to Learn & Resource Links for This Exercise:* Study second-order critical damping ($\zeta = 1.0, s^2 + 2\omega_n s + \omega_n^2$) in Foundations [`00-foundations.T2.00c`](../modules/00-foundations.T2.00c.md) and encoder quantization velocity noise + Type-II PLL observer tuning in [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) (`## 3. Formalization` Item 2), plus [ODrive Encoder PLL Estimator Documentation (`docs.odriverobotics.com`)](https://docs.odriverobotics.com/).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why must you compute the PLL phase error using `atan2(sin(theta_meas - theta_hat), cos(theta_meas - theta_hat))` instead of simple subtraction `theta_meas - theta_hat`?
  * **Answer / Explanation:** Because rotor angle wraps around at $\pm \pi$ (or $0 \leftrightarrow 2\pi$)! Simple subtraction across the wrap boundary (e.g., $\theta_{\text{meas}} = +3.14\text{ rad}$ and $\hat{\theta} = -3.14\text{ rad}$) produces a false $6.28\text{ rad}$ error jump that violent kicks the velocity integrator. The `atan2(sin, cos)` wrap maps the shortest angular distance onto $(-\pi, +\pi]$.

  **Q2:** Why is a **Type-II** PLL (which includes an integrator $\dot{\hat{\omega}} = K_i e_\theta$) required instead of a Type-I first-order low-pass filter?
  * **Answer & Explanation:** A Type-I filter has only one integrator in the loop, so it suffers from a steady-state phase lag $e_{\theta,\text{ss}} = \omega / K_p$ whenever the motor spins at constant velocity $\omega \ne 0$. That phase lag corrupts the Park transform angle $\hat{\theta}_e$ at high speed! A Type-II PLL has two integrators ($\hat{\omega}$ and $\hat{\theta}$), guaranteeing **zero steady-state angle and velocity error** during constant-velocity rotation.
  </details>

### 2.3 IMU Metrology & Allan Deviation ($\sigma_A(\tau)$)
- **Core Summary:** Allan Deviation $\sigma_A(\tau)$ plots two-sample variance across averaging cluster times $\tau$ on a log-log scale to separate white Angle/Velocity Random Walk ($N$, slope $-1/2$ at $\tau = 1\text{ s}$), $1/f$ Bias Instability ($B$, flat floor minimum), and brown Rate Random Walk ($K$, slope $+1/2$ at $\tau = 3\text{ s}$) for rigorous Kalman filter covariance tuning.
- **Curated Free Resources:**
  - 🔗 [MathWorks: Inertial Sensor Noise Analysis Using Allan Variance](https://www.mathworks.com/help/nav/ug/inertial-sensor-noise-analysis-using-allan-variance.html) — *Crystal-clear visual breakdown of the log-log slopes (* $-1, -1/2, 0, +1/2, +1$ *) on an Allan deviation curve.*
  - 🔗 [IEEE Std 952 / Freescale AN5087: Allan Variance Noise Characterization for MEMS Gyroscopes](https://www.nxp.com/docs/en/application-note/AN5087.pdf) — *Shows how to convert datasheet noise density (* $\text{mdps}/\sqrt{\text{Hz}}$ *) and Allan variance parameters into discrete-time Kalman filter* $Q$ *matrices.*
- **🧪 Hands-On Exercise:**
  - *Task:* Run `./03-sensors-and-actuators/lab/lab03_foc_and_metrology.py` to compute the Overlapping Allan Deviation $\sigma_A(\tau)$ of a simulated static MEMS gyroscope log and extract $N$ at $\tau = 1\text{ s}$, $B$ at the curve minimum, and $K$ at $\tau = 3\text{ s}$ on the $+1/2$ slope.
  - *📚 What to Learn & Resource Links for This Exercise:* Study Gaussian variance propagation ($\sigma^2$) in Foundations [`00-foundations.T2.00f`](../modules/00-foundations.T2.00f.md) and MEMS IMU Allan deviation $\sigma_A(\tau)$ slope identification in [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) (`## 3. Formalization` Item 3 & `## 4. Worked example`), plus [IEEE Std 952 / VectorNav Allan Variance IMU Characterization Guide](https://www.vectornav.com/resources/inertial-navigation-primer/specifications--and--error-budgets/specs-imuspecs).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** If you leave a MEMS gyroscope completely motionless on a granite table and average its output over longer and longer windows $\tau$, why does the error eventually start *increasing* again for large $\tau$?
  * **Answer / Explanation:** For short averaging times ($\tau < 10\text{ s}$), averaging reduces white thermo-mechanical noise along the $-1/2$ slope ($\sigma_A(\tau) = N/\sqrt{\tau}$). However, beyond the flat Bias Instability floor ($1/f$ flicker noise), slow thermal and random-walk drift in the bias itself (Rate Random Walk $K$, slope $+1/2$, $\sigma_A(\tau) = K\sqrt{\tau/3}$) dominates, causing longer averages to wander further away!

  **Q2:** A MEMS gyro datasheet lists a white rate noise density (Angle Random Walk) of $0.005\ ^\circ/\text{s}/\sqrt{\text{Hz}}$. What is the discrete standard deviation $\sigma_{\text{gyro}}$ of each sample when sampled at $f_s = 400\text{ Hz}$?
  * **Answer & Explanation:** $\sigma_{\text{gyro}} = \text{Noise Density} \times \sqrt{f_s} = 0.005 \times \sqrt{400} = 0.005 \times 20 = 0.10\ ^\circ/\text{s}$ ($0.00175\text{ rad/s}$).
  </details>

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
| **High-Speed Cross-Coupling** | Above $500\text{ RPM}$, uncompensated $\omega_e L_q i_q$ pushes phase current out of alignment. | Feedforward decoupling ($v_d^*= u_d - \omega_e L_q i_q* $, $ *v_q^* = u_q + \omega_e(L_d i_d + \lambda_{pm})$) + SVPWM keeps $i_d \approx 0\text{ A}$ up to base speed. |

---

## Tier 3 (Advanced / Production)

> **Goal of Pass 3 (Track 03):** Master production actuator & metrology engineering: encoder spatial harmonic LUT calibration, Allan variance error budgets, pole-zero cancellation $d$-$q$ current PI synthesis, feedforward back-EMF/cross-coupling decoupling, Min-Max SVPWM (+15.47% bus utilization), and anticogging torque-ripple suppression.
> **📚 Required Foundations & Bridge Modules for Pass 3 (Track 03):** Complete Tier 2/3 Foundations [`00-foundations.T2.00d`](../modules/00-foundations.T2.00d.md) (*Transfer Function Pole-Zero Cancellation*) and [`00-foundations.T2.00e`](../modules/00-foundations.T2.00e.md) (*State-Space Coupling*) plus the Track 03 Tier 3 Bridge [`03-sensors.T3.03a`](../modules/03-sensors.T3.03a.md).
> * [**Next Linear Step in Pass 3 → Track 04 (Tier 3: Bare-Metal `TIM1`→`ADC`, CORDIC & C++20 `WaitFreeSeqLock`)**](../04-embedded-and-realtime/README.md#tier-3-advanced--production)

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

### 4.2 Rotary & Linear Position Encoders & Spatial Harmonic LUT Calibration
- **Core Summary:** Even a 16-bit magnetic encoder suffers from $\pm 0.3^\circ\text{–}0.8^\circ$ Integral Non-Linearity (INL) caused by magnet eccentricity ($1\times$ harmonic) and Hall bridge anisotropy ($2\times, 4\times$ harmonics). Calibrating a Fourier harmonic lookup table (LUT) during a constant-speed back-EMF sweep reduces mechanical INL below $\pm 0.04^\circ$, while anticogging feedforward cancels stator slot cogging torque ripple.

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

- **Curated Free Resources:**
  - 🔗 [Ben Katz (MIT Master's Thesis): High-Performance Actuator Design & Encoder Calibration](https://dspace.mit.edu/handle/1721.1/118671) — *Details the exact off-axis/on-axis magnetic encoder lookup table (LUT) calibration routine used on the MIT Mini-Cheetah actuators.*
  - 🔗 [Open Dynamic Robot Initiative (ODRI): Open-Source Torque-Controlled Brushless Actuator Modules & Micro-Drivers](https://open-dynamic-robot-initiative.github.io/) — *Complete open-source mechanical/PCB/firmware specifications for the Solo-12 quadruped and Bolt biped actuators.*
  - 🔗 [Matthew Piccoli & Mark Yim (ICRA): Anticogging Torque Ripple Suppression](https://www.seas.upenn.edu/~piccoli/files/Piccoli_2016_ICRA.pdf) — *Classic robotics paper showing how to record* $i_{q,\text{cog}}(\theta_m)$ *across one mechanical revolution and play it back as feedforward current.*
- **🧪 Hands-On Exercise:**
  - *Task:* Run `./03-sensors-and-actuators/lab/lab03_foc_and_metrology.py` and inspect the Fourier harmonic fit of a magnetic encoder with $1\times, 2\times, 4\times$ eccentricity/tilt errors, verifying that the 4-harmonic LUT reduces peak-to-peak mechanical angle error from $> 0.45^\circ$ down to $< \pm 0.02^\circ$.
  - *📚 What to Learn & Resource Links for This Exercise:* Study Fourier harmonic basis functions ($\sin(k\theta), \cos(k\theta)$) in Foundations [`00-foundations.T1.00d`](../modules/00-foundations.T1.00d.md) and least-squares matrix fitting in [`00-foundations.T2.00a`](../modules/00-foundations.T2.00a.md), plus [`03-sensors-and-actuators/lab/lab03_foc_and_metrology.py`](lab/lab03_foc_and_metrology.py).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** Why does a $0.3^\circ$ mechanical encoder error on an $N_p = 21$ pole-pair torque motor cause a severe loss of torque efficiency?
  * **Answer / Explanation:** Because the electrical angle error is multiplied by the number of pole pairs: $\Delta \theta_e = N_p \cdot \Delta \theta_m = 21 \times 0.3^\circ = 6.3^\circ\text{ electrical}$! If the uncalibrated INL reaches $1.5^\circ$ mechanical, $\Delta \theta_e = 31.5^\circ$ electrical, wasting $1 - \cos(31.5^\circ) \approx 15\%$ of torque and injecting massive oscillating $i_d$ currents.

  **Q2:** Why must an anticogging lookup table be indexed by the **mechanical** angle $\theta_m \in [0, 2\pi)$ rather than the electrical angle $\theta_e$?
  * **Answer & Explanation:** Cogging torque arises from the physical interaction between individual stator teeth ($N_{\text{slots}}$) and individual rotor magnets ($2 N_p$), combined with slight manufacturing variations in stator lamination roundness—which repeat once per full *mechanical* revolution ($360^\circ$ mechanical).
  </details>

### 4.3 PMSM Synchronous $d$-$q$ Dynamics, Decoupling & Min-Max SVPWM
- **Core Summary:** In the synchronous $(d,q)$ frame, the $d$ and $q$ current dynamics are cross-coupled by speed-dependent back-EMF terms ($-\omega_e L_q i_q$ and $+\omega_e L_d i_d + \omega_e \lambda_{pm}$). Combining pole-zero cancellation PI gains ($K_p = L \omega_{\text{bw}}$, $K_i = R_s \omega_{\text{bw}}$) with feedforward cross-coupling decoupling and zero-trigonometry **Min-Max Space Vector PWM (SVPWM)** achieves a $2\text{ kHz}$ flat-phase current loop and $+15.47\%$ higher bus voltage utilization ($V_{\max} = V_{\text{bus}}/\sqrt{3}$).

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

- **Curated Free Resources:**
  - 🔗 [Texas Instruments SPRABQ7: Space Vector PWM (SVPWM) & Min-Max Zero-Sequence Injection](https://www.ti.com/lit/an/sprabq7a/sprabq7a.pdf) — *Proves mathematically why subtracting the average of* $\max(v_{a,b,c})$ *and* $\min(v_{a,b,c})$ *produces the exact same saddle waveform as sector-based Space Vector PWM with zero `atan2`/`sin` overhead.*
  - 🔗 [STMicroelectronics UM1052: STM32 Motor Control SDK (FOC Theory & Decoupling)](https://www.st.com/resource/en/user_manual/um1052-stm32f-pmsm-singledual-foc-sdk-v43-stmicroelectronics.pdf) — *Complete production equations for* $d$ *-* $q$ *PI current loops, feedforward decoupling, and circle-limitation voltage anti-windup.*
- **🧪 Hands-On Exercise:**
  - *Task:* Open **Tab 3: 25 kHz PMSM FOC** in the MechaLab Workbench, command a $0 \to 10\text{ A}$ step in $i_q^*$ at $2000\text{ RPM}$, and toggle **Cross-Coupling Decoupling ON vs. OFF** and **SVPWM vs. Sinusoidal PWM**. Observe the $i_d$ parasitic current spike drop below $0.15\text{ A}$ with decoupling active and inspect the classic triple-harmonic "saddle" duty waveforms $(d_a, d_b, d_c)$ of Min-Max SVPWM.
  - *📚 What to Learn & Resource Links for This Exercise:* Study first-order transfer functions in Foundations [`00-foundations.T2.00d`](../modules/00-foundations.T2.00d.md) and $d$-$q$ cross-coupling decoupling + pole-zero PI tuning ($K_p = L\omega_{\text{bw}}, K_i = R\omega_{\text{bw}}$) + Min-Max SVPWM zero-sequence injection in [`03-sensors.T3.03a`](../modules/03-sensors.T3.03a.md) (`## 3. Formalization` Items 1–3 & `## 4. Worked example`).
- **🧠 Knowledge Check:**
  <details>
  <summary><b>Click to toggle quiz questions & answers</b></summary>

  **Q1:** How does injecting the zero-sequence neutral offset voltage $v_{\text{offset}} = -\frac{1}{2}(\max + \min)$ onto all three phase terminals $(v_a^*, v_b^*, v_c^*)$ allow $+15.47\%$ more phase voltage without distorting the motor's phase currents?
  * **Answer / Explanation:** Because the motor's star neutral point is floating (unconnected), adding an identical common-mode voltage $v_{\text{offset}}$ to all three phases cancels out completely in every line-to-line voltage ($v_{ab} = (v_a^* + v_{\text{offset}}) - (v_b^* + v_{\text{offset}}) = v_a^* - v_b^*$). centering the instantaneous max and min phase voltages within $[0, V_{\text{bus}}]$ flattens the sine peaks (creating a 3rd-harmonic saddle wave), raising the maximum undistorted phase amplitude from $V_{\text{bus}}/2 = 0.500\,V_{\text{bus}}$ to $V_{\text{bus}}/\sqrt{3} \approx 0.57735\,V_{\text{bus}}$ ($+15.47\%$).

  **Q2:** Why does choosing $K_p = L \omega_{\text{bw}}$ and $K_i = R_s \omega_{\text{bw}}$ yield a clean first-order closed-loop response $\frac{1}{s/\omega_{\text{bw}} + 1}$?
  * **Answer & Explanation:** Once the $\omega_e L i$ cross-coupling terms are canceled by feedforward decoupling, the electrical plant is $G(s) = \frac{1}{L s + R_s}$. The PI controller transfer function is $C(s) = K_p + \frac{K_i}{s} = \frac{\omega_{\text{bw}}(L s + R_s)}{s}$. Multiplying them cancels the plant pole at $s = -R_s/L$ with the controller zero, leaving the loop transfer function $L(s) = C(s)G(s) = \frac{\omega_{\text{bw}}}{s}$ and closed-loop response $T(s) = \frac{1}{s/\omega_{\text{bw}} + 1}$ with zero overshoot!
  </details>

---

## 5. Failure Modes, Pitfalls & Anti-Patterns

1. **Sampling ADC Currents During PWM Switching Edges:** Always trigger simultaneous ADC conversions at the exact center of the low-side MOSFET on-time (`TIM1_TRGO2` at `CNT == ARR`).
2. **Missing Integrator Anti-Windup During Voltage Circle Saturation:** Prioritize $v_d^{}$ when clamping $\sqrt{v_d^{2} + v_q^{*2}} \le V_{\text{bus}}/\sqrt{3}$ so rotor flux orientation is never lost.
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

---

## 7. Track 03 Bridge Modules & Fast-Track Skip/Gate Tests (`modules/`)

- **Tier 1 (Quadrature Encoders, Pole Pairs & Offset Calibration → Step 1.4):** [`03-sensors.T1.03a`](../modules/03-sensors.T1.03a.md) *(Ladder Gate Test)*
- **Tier 2 (Stationary-to-Rotating Reference Frames: Clarke & Park → Step 2.4):** [`03-sensors.T2.03a`](../modules/03-sensors.T2.03a.md) *(Ladder Gate Test)*
- **Tier 3 (Decoupled Synchronous $d$-$q$ FOC, Min-Max SVPWM & Harmonic LUT → Step 3.4):** [`03-sensors.T3.03a`](../modules/03-sensors.T3.03a.md) *(Ladder Gate Test)*

