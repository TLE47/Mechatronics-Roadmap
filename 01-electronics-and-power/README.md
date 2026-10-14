# Track 01: Mixed-Signal Electronics, Power Stages & High-Speed PCB Design

> **Prerequisites:** [Track 00: Mathematical, Signal & Physical Foundations](../00-foundations/README.md)  
> **Feeds Into:** [Track 03: Sensors & Actuators](../03-sensors-and-actuators/README.md), [Track 04: Embedded & Real-Time](../04-embedded-and-realtime/README.md), [Track 07: Systems, HIL & Production](../07-systems-hil-and-production/README.md)  
> **Core Principle:** At $20\text{–}100\text{ kHz}$ PWM switching frequencies and $>50\text{ V/ns}$ slew rates, there is no such thing as an ideal wire or a "ground node." Every PCB trace is a coupled RLC transmission line, and precision microvolt sensing survives next to kilowatt switching stages only through deliberate loop-inductance minimization, return-current control, and differential signal conditioning.

---

## 1. Module Overview & System Context

Mechatronic hardware uniquely forces two hostile regimes onto the same printed circuit board (or enclosure):
1. **High-Power Switching Stages:** 24 V–800 V DC buses switching 10 A–300 A in tens of nanoseconds via Si MOSFETs, SiC FETs, or GaN HEMTs.
2. **Precision Analog & Digital Front-Ends:** Strain-gauge bridges ($\mu\text{V}$), current-sense shunts ($\pm 50\text{ mV}$ full-scale across $500\ \mu\Omega$ riding on a $48\text{ V}$ switching node), optical encoder differential lines, and 3.3 V / 1.8 V MCU/FPGA logic.

This track covers the complete hardware design chain: low-noise Analog Front-End (AFE) design, ADC topology selection and anti-aliasing, power converter topologies, 3-phase inverter gate-drive engineering, thermal management, and EMC-first multilayer PCB layout.

---

## 2. Mixed-Signal & Power Hardware Architecture

```mermaid
flowchart TB
    subgraph POWER_DOMAIN["High-Current Power & Inverter Domain (PGND / HVDC)"]
        BAT["DC Bus Supply<br/>24V – 48V Nominal<br/>TVS + Precharge / eFuse"]
        BULK["DC Link Capacitor Bank<br/>Electrolytic (Bulk Damping)<br/>+ X7R MLCC (< 2 nH Hot Loop)"]
        GATE["Isolated / Bootstrap 3-Phase Gate Driver<br/>(DRV8353 / UCC21520 / Si827x)<br/>Dead-Time, UVLO, Desat Protection"]
        INV["3-Phase Half-Bridge Array<br/>6x Low-Rds(on) MOSFETs / GaN<br/>Kelvin Source Connection"]
        SHUNT["3x Low-Inductance Shunt Resistors<br/>(0.5–2 mΩ, 4-Terminal Kelvin)<br/>or In-Line Hall/Fluxgate"]
        MOTOR(["3-Phase PMSM / BLDC<br/>Shielded Twisted-Pair Cable"])

        BAT ==> BULK
        BULK ==> INV
        GATE -->|HO_abc / LO_abc<br/>Separate Rg_on, Rg_off| INV
        INV ==>|Phase U, V, W| SHUNT
        SHUNT ==> MOTOR
    end

    subgraph ISOLATION["Galvanic / Kelvin Boundary & Signal Conditioning"]
        CSA["Bidirectional Current Sense Amp<br/>(INA240 / AD8418, >120 dB CMRR,<br/>Enhanced PWM Rejection)"]
        AAF["2nd/3rd-Order Differential<br/>Bessel Anti-Aliasing Filter<br/>+ SAR Charge-Bucket RC"]
        ISO_DIG["Digital Isolators / Level Shifters<br/>(ISO776x, >100 V/ns CMTI)<br/>(When High-Voltage Isolated)"]

        SHUNT -->|Kelvin Sense<br/>Differential Pair| CSA
        CSA -->|Biased around V_ref/2| AAF
    end

    subgraph CONTROL_DOMAIN["Precision Mixed-Signal & MCU Domain (AGND / DGND Unified Plane)"]
        REF["Ultra-Low-Noise Voltage Reference<br/>(REF5025 / ADR4525, <3 ppm/°C)"]
        ADC["Dual/Triple Simultaneous SAR ADC<br/>(STM32G4/H7 Synchronized to PWM Center)<br/>or Isolated ΣΔ Modulator (AMC1306)"]
        PWM["Advanced Motor Timer<br/>Center-Aligned Complementary PWM<br/>+ Hardware Break Input (BKIN)"]
        LDO["Power Tree: Sync Buck (5V/3.3V)<br/>+ Ultra-Low-Noise LDO (3.3V_A)<br/>Ferrite / RC Pi Filter"]

        REF --> ADC
        REF --> CSA
        AAF --> ADC
        PWM -->|6x PWM + Fault BKIN| ISO_DIG
        ISO_DIG --> GATE
        ADC -->|DMA Transfer Complete IRQ| PWM
    end

    BAT --> LDO
    LDO --> CONTROL_DOMAIN

    style POWER_DOMAIN fill:#450a0a,stroke:#f87171,color:#fef2f2
    style ISOLATION fill:#1e293b,stroke:#94a3b8,color:#f8fafc
    style CONTROL_DOMAIN fill:#064e3b,stroke:#34d399,color:#ecfdf5
```

---

## 3. Precision Analog Front-End (AFE) & ADC Engineering

### 3.1 Real-World Op-Amp & Instrumentation Amplifier Non-Idealities
When amplifying low-level transducer outputs (Wheatstone bridges, thermocouples, shunt resistors), ideal op-amp assumptions fail:
* **Input Offset Voltage ($V_{os}$) & Drift ($dV_{os}/dT$):** For a $1\text{ m}\Omega$ shunt measuring $1\text{ A}$ ($V_{shunt} = 1\text{ mV}$), a standard op-amp with $V_{os} = 1\text{ mV}$ has a **100% zero-offset error**. Use zero-drift/chopper-stabilized amplifiers ($V_{os} < 10\ \mu\text{V}$, drift $< 0.05\ \mu\text{V}/^\circ\text{C}$) for precision DC/low-frequency paths, while checking that the internal chopper clock ($50\text{–}400\text{ kHz}$) does not intermodulate with your PWM frequency.
* **Common-Mode Rejection Ratio (CMRR) at High $dV/dt$:** Inline phase current sensing exposes the amplifier inputs to a $0\text{ V} \leftrightarrow 48\text{ V}$ rectangular wave slewing at $20\text{ V/ns}$. DC CMRR ($120\text{ dB}$) drops at $20\text{ dB/decade}$ above the amplifier's CMRR corner frequency. Use dedicated PWM-rejection current-sense amplifiers (e.g., TI `INA240`, Analog Devices `AD8418`/`LTC6102`) or isolated $\Sigma\Delta$ modulators (`AMC1306`).
* **Total Output Referred Noise Calculation:** Combine voltage noise density $e_n$ ($\text{nV}/\sqrt{\text{Hz}}$), current noise density $i_n$ ($\text{pA}/\sqrt{\text{Hz}}$), $1/f$ (flicker) corner $f_{ce}$, and Johnson-Nyquist resistor thermal noise $e_R = \sqrt{4 k_B T R_{eq}}$ over effective noise bandwidth $\text{ENBW} = \frac{\pi}{2} f_{-3\text{dB}}$ (for a 1st-order roll-off):

$$
E_{n,\text{rms,in}} = \sqrt{ e_{n,\text{white}}^2 \left( f_{ce} \ln\frac{f_H}{f_L} + \text{ENBW} \right) + (i_n R_{eq})^2 \text{ENBW} + 4 k_B T R_{eq} \text{ENBW} }
$$

### 3.2 Anti-Aliasing Filter Topologies: Butterworth vs. Chebyshev vs. Bessel
In a closed-loop feedback path, **phase delay is often more destructive than gentle passband roll-off**. Every degree of phase lag added by an analog filter at the control crossover frequency $\omega_c$ directly subtracts from the system's phase margin.

| Filter Topology | Magnitude Response | Step Response Overshoot | Group Delay $\tau_g(\omega) = -\frac{d\phi}{d\omega}$ | Mechatronics Application |
| :--- | :--- | :--- | :--- | :--- |
| **Butterworth** | Maximally flat passband | Moderate ($\sim 4.3\%$ for 2nd-order, $\sim 8.1\%$ for 3rd) | Nonlinear near cutoff | General data acquisition, acoustic/vibration spectral analysis |
| **Bessel (Thomson)** | Gradual roll-off in transition band | **Zero / Minimal overshoot ($<0.5\%$)** | **Maximally flat group delay (linear phase)** | **Fast closed-loop current, force, and position control paths** |
| **Chebyshev Type I** | Equiripple passband, steep roll-off | High overshoot & ringing | Severe group-delay peaking near $f_c$ | Avoid inside high-bandwidth feedback loops |

### 3.3 SAR Charge-Bucket Input Driver & $\Sigma\Delta$ vs. SAR Selection
A Successive Approximation Register (SAR) ADC connects an internal sampling capacitor $C_{sh}$ ($5\text{–}20\text{ pF}$) to the input pin for an acquisition window $t_{acq}$ ($50\text{–}300\text{ ns}$). Without an external charge reservoir capacitor $C_{filt} \ge 20 \cdot C_{sh}$ and isolation resistor $R_{filt}$, the charge injection kickback corrupts the op-amp output and degrades Effective Number of Bits ($\text{ENOB} = \frac{\text{SINAD} - 1.76}{6.02}$).
* **Rule of Thumb for SAR Charge Bucket:** Choose $C_{filt} \approx 22 \cdot C_{sh}$ (NP0/C0G dielectric only—never X7R in the signal path due to voltage coefficient distortion!) and $R_{filt}$ such that the time constant $\tau = R_{filt} C_{filt}$ settles to $< \frac{1}{2}\text{ LSB}$ within $t_{acq}$, i.e., $t_{acq} \ge \ln(2^{N+1}) \cdot R_{filt} C_{sh}$.

---

## 4. Power Electronics, Gate Drives & Inverter Design

### 4.1 Power Switch Comparison: Si MOSFET vs. SiC MOSFET vs. GaN HEMT

| Device Technology | Typical Voltage Rating | Switching Frequency | Reverse Recovery Charge $Q_{rr}$ | $dV/dt$ Slew Rate | Key Gate-Drive Constraint |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Si Trench MOSFET** | $20\text{ V} - 200\text{ V}$ | $20\text{ kHz} - 100\text{ kHz}$ | Moderate ($20\text{–}100\text{ nC}$) | $5\text{–}25\text{ V/ns}$ | Standard $10\text{–}12\text{ V}$ drive; watch Miller plateau $Q_{gd}/Q_{gs}$ ratio |
| **SiC MOSFET** | $650\text{ V} - 1700\text{ V}$ | $40\text{ kHz} - 200\text{ kHz}$ | Near zero (capacitive $Q_{oss}$) | $30\text{–}100\text{ V/ns}$ | Asymmetric drive ($+18\text{ V}$ on, $-4\text{ V}$ off), requires active Miller clamp & Desat |
| **eGaN HEMT** | $40\text{ V} - 650\text{ V}$ | $100\text{ kHz} - 1\text{ MHz}$ | **Zero ($Q_{rr} = 0$)** | $50\text{–}200\text{ V/ns}$ | Strict $V_{GS} = 5.0\text{ V}$ ($V_{GS,\max} = 6.0\text{ V}$!); requires $< 1\text{ nH}$ Kelvin-source gate loop |

### 4.2 Gate-Drive Engineering, Miller Shoot-Through & Dead-Time Calculation
1. **Peak Gate Current & Gate Resistor Sizing:**
   To switch total gate charge $Q_g$ in transition time $t_{sw}$, the required average gate current is $I_g = Q_g / t_{sw}$. Separate turn-on ($R_{g,\text{on}}$) and turn-off ($R_{g,\text{off}}$ via fast Schottky diode bypass) resistors must be used so that turn-on is controlled to limit $dV/dt$ EMI while turn-off is fast and low-impedance to prevent **dv/dt-induced Miller turn-on** (false turn-on of the low-side FET when the high-side FET turns on):

$$
V_{GS,\text{induced}} \approx R_{g,\text{off,total}} \cdot C_{gd} \cdot \frac{dV_{DS}}{dt} < V_{GS(\text{th}),\min}
$$

2. **Minimum Safe Dead-Time ($t_{\text{dead}}$):**

$$
t_{\text{dead}} \ge \left(t_{d(\text{off}),\max} + t_{f,\max} + \Delta t_{\text{prop,skew}}\right) - t_{d(\text{on}),\min} + t_{\text{margin}}
$$

   *Trade-off:* Excessive dead-time forces current through the MOSFET body diode (or GaN 3rd-quadrant conduction with high $V_{SD} \approx 2\text{–}3\text{ V}$), causing high dead-time conduction loss $P_{dt} = 2 \cdot V_{SD} \cdot I_{\text{load}} \cdot t_{\text{dead}} \cdot f_{sw}$ and severe zero-crossing voltage distortion in FOC torque loops.
3. **Switching Loop Parasitic Inductance & Voltage Overshoot:**
   During turn-off at current commutation rate $dI/dt$ (often $2\text{–}10\text{ A/ns}$), the stray inductance $L_{\text{loop}}$ of the commutation loop (High-side FET $\to$ Low-side FET $\to$ High-frequency MLCC decoupling cap) generates a voltage spike:

$$
V_{\text{peak}} = V_{\text{bus}} + L_{\text{loop}} \frac{dI}{dt}
$$

   If $V_{\text{bus}} = 48\text{ V}$, $dI/dt = 5\text{ A/ns}$, and poor layout yields $L_{\text{loop}} = 10\text{ nH}$, the voltage spike adds $50\text{ V}$, reaching $98\text{ V}$ and destroying an $80\text{ V}$ MOSFET via avalanche breakdown. Keep $L_{\text{loop}} < 2\text{ nH}$ using adjacent top-layer MLCCs and an immediate Layer-2 solid return plane ($0.1\text{–}0.2\text{ mm}$ prepreg spacing).

### 4.3 Inverter Loss Model & Thermal Resistance Network
Total per-switch power dissipation combines conduction, switching, gate-drive, output-capacitance, and dead-time losses:

$$
P_{\text{total}} = \underbrace{I_{\text{rms}}^2 R_{DS(\text{on})}(T_j)}_{\text{Conduction}} + \underbrace{\frac{1}{2} V_{\text{bus}} I_{\text{load}} (t_r + t_f) f_{sw}}_{\text{Overlap Switching}} + \underbrace{\frac{1}{2} C_{oss} V_{\text{bus}}^2 f_{sw}}_{\text{Output Cap}} + \underbrace{V_{\text{bus}} Q_{rr} f_{sw}}_{\text{Reverse Recovery}}
$$

Note the positive thermal feedback loop on $R_{DS(\text{on})}(T_j) \approx R_{DS(\text{on})}(25^\circ\text{C}) \cdot \left(1 + \alpha (T_j - 25^\circ\text{C})\right)$ where $\alpha \approx 0.004\text{–}0.006\text{ K}^{-1}$. Junction temperature $T_j$ is verified via the Cauer/Foster thermal impedance network:

$$
T_j = T_{\text{ambient}} + P_{\text{total}} \cdot \left(R_{\theta,\text{JC}} + R_{\theta,\text{TIM}} + R_{\theta,\text{HS-A}}\right)
$$

---

## 5. High-Speed Mixed-Signal PCB Stackup & EMC/EMI Architecture

### 5.1 Reference 6-Layer Mixed-Signal Motor-Drive / Controller Stackup

| Layer | Copper Weight | Function & Routing Rules | Dielectric Spacing |
| :--- | :--- | :--- | :--- |
| **L1 (Top)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | High-current power switches, MLCC hot-loop decoupling, short gate traces, critical AFE components | $0.15\text{ mm}$ prepreg to L2 |
| **L2 (Inner 1)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | **UNBROKEN Solid Ground Reference Plane (`GND`)** — Never split this plane under signal traces! | $0.35\text{ mm}$ core to L3 |
| **L3 (Inner 2)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | High-speed digital (SPI, CAN-FD, Encoder diff pairs), Kelvin sense differential pairs (shielded between L2 & L4) | $0.20\text{ mm}$ prepreg to L4 |
| **L4 (Inner 3)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | Solid Reference / Power Pours (`3V3_D`, `3V3_A`, `5V`, `12V_GATE`) with stitching vias to L2 at layer transitions | $0.35\text{ mm}$ core to L5 |
| **L5 (Inner 4)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | High-current `V_BUS` / `PGND` return polygon directly beneath L1 power stage for flux cancellation | $0.15\text{ mm}$ prepreg to L6 |
| **L6 (Bottom)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | Secondary power pours, thermal via pads bonded through TIM to aluminum baseplate/heatsink | — |

### 5.2 Return Current Physics & The "Split Ground Plane" Myth
At frequencies above a few kilohertz ($f > \frac{R_{\text{trace}}}{2\pi L_{\text{loop}}}$), return current does **not** follow the path of least DC resistance; it follows the path of **least loop inductance**—flowing in the reference plane directly underneath the signal trace.
* **Fatal Mistake:** Cutting a slot between `AGND` and `DGND` and routing even a single SPI or PWM trace across the slot forces its return current to detour around the perimeter of the board, creating a massive loop antenna that radiates EMI and couples switching noise directly into the ADC.
* **Production Rule:** Use a **single, unbroken solid ground plane (L2)** across the entire board, and achieve isolation through **spatial partitioning** (Analog section, Digital section, Power section) so that high-$dI/dt$ power return currents on L1/L5 physically cannot flow through the analog region.
* **4-Terminal Kelvin Sensing:** Route shunt-resistor sense traces (`SENSE+`, `SENSE-`) from the inner edges of the shunt pads as a tightly coupled $100\ \Omega$ differential pair on L3, flanked by ground vias, directly to the current-sense amplifier inputs.

---

## 6. Failure Modes, Pitfalls & Anti-Patterns

1. **Bootstrap Capacitor Starvation at 100% or 0% Duty Cycle:** High-side N-channel gate drivers using bootstrap supplies (`C_boot`) require the low-side FET to turn on periodically to recharge `C_boot`. Clamping PWM duty cycle to $95\text{–}98\%$ maximum (or using an isolated gate supply / internal charge pump like `DRV8353`) is mandatory to prevent high-side UVLO drop-out under stall conditions.
2. **MLCC DC Bias Derating:** A tiny `0402` or `0603` $10\ \mu\text{F}$ 50 V X5R ceramic capacitor loses up to **70–85% of its rated capacitance** when biased at $40\text{ V}$ DC! Always inspect manufacturer DC-bias curves (e.g., Murata SimSurfing) and use `1206`/`1210` X7R/C0G packages rated at $\ge 2\times V_{\text{bus}}$.
3. **Inductive Kickback on Hot-Plug Battery Connection:** Plugging a low-impedance LiPo/LiFePO4 battery ($R_{\text{int}} < 10\text{ m}\Omega$) into an inverter with low-ESR ceramic capacitors forms an underdamped series $LC$ circuit ($L_{\text{cable}}, C_{\text{MLCC}}$) that rings to **nearly $2\times V_{\text{bat}}$**, blowing the gate driver and MCU buck regulator on plug-in. Always include either an active precharge circuit, an eFuse/hot-swap controller, or an electrolytic bulk damping capacitor ($R_{\text{ESR}} \ge \sqrt{L_{\text{cable}}/C_{\text{MLCC}}}$) plus a Bidirectional TVS diode.
4. **Common-Source Inductance ($L_{CS}$) Oscillation:** Sharing a single PCB trace between the MOSFET power source current ($I_D$) and the gate-driver return ($I_G$) injects negative feedback $V_{L_{CS}} = L_{CS} \frac{dI_D}{dt}$ directly into the gate-source loop, slowing switching or causing $50\text{–}200\text{ MHz}$ parasitic gate oscillation. Always use packages with a dedicated **Kelvin Source pin** or split the gate return trace right at the source pad.

---

## 7. Curated Learning Resources

### Authoritative Textbooks & Application Notes
* **Horowitz, P., & Hill, W.** — *The Art of Electronics* (3rd ed., Cambridge University Press, 2015) & *The Art of Electronics: The x-Chapters* (2020). Unrivaled practical treatment of low-noise design, precision op-amps, ADCs, and power electronics.
* **Ott, H. W.** — *Electromagnetic Compatibility Engineering* (Wiley, 2009). The gold standard on return-current physics, PCB stackup design, cable shielding, and grounding.
* **Erickson, R. W., & Maksimović, D.** — *Fundamentals of Power Electronics* (3rd ed., Springer, 2020). Rigorous modeling of switch-mode converters, state-space averaging, magnetics, and control loops.
* **Johnson, H., & Graham, M.** — *High-Speed Digital Design: A Handbook of Black Magic* (Prentice Hall, 1993). Transmission lines, termination, crosstalk, and via inductance.
* **Texas Instruments & Analog Devices Seminar Notes:**
  * TI *SLUA618*: "Fundamentals of MOSFET and IGBT Gate Driver Circuits" (Laszlo Balogh).
  * Analog Devices *MT-001 to MT-100* Data Conversion Tutorials (Walt Kester).

### Open-Source Toolchains
* **KiCad 8/9** — Production ECAD suite with native SPICE (`ngspice`) integration, differential pair length-tuning, and IPC-2581 export.
* **ngspice / LTspice / Qucs-S** — Time-domain transient switching, small-signal AC loop stability, and Monte-Carlo tolerance analysis.
* **openEMS / FastHenry2 / FastCap2** — Open-source 3D electromagnetic field and parasitic inductance/capacitance extraction.

---

## 8. Hands-On Lab & Milestone Gate

### Lab 01: 48 V / 30 A 3-Phase Brushless Inverter & Precision Current-Sense PCB

1. **Objective:** Schematic capture, SPICE simulation, and 6-layer PCB layout in KiCad for a compact ($50\text{ mm} \times 50\text{ mm}$) 48 V, 30 A peak 3-phase motor drive stage with inline or low-side Kelvin current sensing and STM32G474 MCU.
2. **Tasks:**
   * Simulate a single half-bridge with realistic package parasitics ($L_{\text{loop}} = 1.5\text{ nH}$, $L_{CS} = 0.3\text{ nH}$) in `ngspice`/LTspice under a $30\text{ A}$ inductive load at $f_{sw} = 40\text{ kHz}$; tune $R_{g,\text{on}}$, $R_{g,\text{off}}$, and RC snubber values.
   * Design the 3-channel current-sense AFE + 2nd-order differential Bessel anti-aliasing filter ($f_c = 120\text{ kHz}$) + SAR charge bucket, and simulate AC phase lag at $2.5\text{ kHz}$ current-loop bandwidth plus step settling within a $250\text{ ns}$ ADC sample window.
   * Complete the 6-layer PCB layout adhering to IPC-2221 clearance/creepage and IPC-2152 thermal current rules.
3. **Quantitative Acceptance Criteria:**

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **Half-Bridge Voltage Overshoot** | $V_{DS,\text{peak}} < 58\text{ V}$ at $V_{\text{bus}} = 48\text{ V}$, $I_D = 30\text{ A}$, $t_{sw} \le 25\text{ ns}$ | Double-Pulse Test (DPT) in SPICE & on hardware with $>200\text{ MHz}$ low-inductance spring probe |
| **Current AFE Phase Lag & Settling** | Phase lag $< 2.5^\circ$ at $2.5\text{ kHz}$; ADC sample error $< 0.25\text{ LSB}$ (12-bit) | SPICE AC/transient simulation + bench sine-sweep injection |
| **Current Noise Floor (PWM Active)** | $< 15\text{ mA}_{\text{rms}}$ at ADC output with $48\text{ V}$ bus switching at $40\text{ kHz}$ ($50\%$ duty) | 10,000-sample DMA capture at PWM center trigger |
| **Thermal Rise at Continuous Load** | $\Delta T_{\text{PCB/Case}} < 40^\circ\text{C}$ at $15\text{ A}_{\text{rms}}$ continuous phase current ($T_a = 25^\circ\text{C}$) | Thermal camera / thermocouple soak test (30 minutes) |
