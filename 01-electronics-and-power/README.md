# Track 01: Mixed-Signal Electronics, Power Stages & High-Speed PCB Design

> **Part of the [MechaLab Multi-Pass Tiered Roadmap](../README.md)**  
> **Prerequisites:** [Track 00: Foundations, Bench Intuition & Multi-Domain Mathematics](../00-foundations/README.md)  
> **Feeds Into:** [Track 03: Sensors & Actuators](../03-sensors-and-actuators/README.md), [Track 04: Embedded & Real-Time](../04-embedded-and-realtime/README.md), [Track 07: Systems, HIL & Production](../07-systems-hil-and-production/README.md)  
> **Core Principle:** At $20\text{–}100\text{ kHz}$ PWM switching frequencies and $>50\text{ V/ns}$ slew rates, there is no such thing as an ideal wire or a "ground node." Every PCB trace is a coupled RLC transmission line, and precision microvolt sensing survives next to kilowatt switching stages only through deliberate loop-inductance minimization, return-current control, and differential signal conditioning.

---

## 🔄 Linear Level-Up Navigation (Follow Your Current Pass Across Track 00 → Track 08)

Complete **only your current Tier section** below, verify its hands-on milestone, and proceed directly to **Track 02 in the same Tier**:

| Pass / Level | Previous Step in Pass | Current Track 01 Section | Next Linear Step in This Pass |
| :--- | :--- | :--- | :--- |
| **🟢 Pass 1: Tier 1 (Beginner)** | [← Track 00 (Tier 1)](../00-foundations/README.md#tier-1-beginner--intuitive) | [§1 Tier 1: Breadboard H-Bridges (`DRV8833`), Logic Levels & Decoupling](#tier-1-beginner--intuitive) | [**Next in Pass 1 → Track 02 (Tier 1: 2D Planar IK & Gear Ratios)**](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive) |
| **🔵 Pass 2: Tier 2 (Applied)** | [← Track 00 (Tier 2)](../00-foundations/README.md#tier-2-intermediate--applied) | [§2 Tier 2: 4-Layer KiCad PCBs, Gate Drivers & Kelvin Shunts](#tier-2-intermediate--applied) | [**Next in Pass 2 → Track 02 (Tier 2: Exact Constraint, `CadQuery` & URDF)**](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied) |
| **🌉 Bridge Concept** | — | [§3 Bridging the Gap: `L298N`/`INA219` Breakouts $\to$ `DRV8353` + `INA240` Kelvin PCB](#bridging-the-gap-maker-to-custom) | [Inspect Tier 3 Production Mastery ↓](#tier-3-advanced--production) |
| **🟣 Pass 3: Tier 3 (Production)** | [← Track 00 (Tier 3)](../00-foundations/README.md#tier-3-advanced--production) | [§4 Tier 3: $<2\text{ nH}$ $48\text{ V}/30\text{ A}$ 6-Layer Inverter & SAR Charge Buckets](#tier-3-advanced--production) | [**Next in Pass 3 → Track 02 (Tier 3: Screw PoE, Flexures & $O(n)$ RNEA)**](../02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production) |

---

## Tier 1 (Beginner / Intuitive)

> **Goal of Pass 1 (Track 01):** Learn how low-voltage logic safely controls higher-voltage motor power without browning out or frying your microcontroller, using breadboard-friendly MOSFETs and modern H-bridge breakout modules (`DRV8833` / `TB6612FNG`).

### 1.1 Logic Levels ($3.3\text{ V}$ vs. $5\text{ V}$) & Open-Drain Pull-Ups
* **Why $5\text{ V}$ Kills $3.3\text{ V}$ MCU Pins:** Modern microcontrollers (`ESP32`, `STM32`, `RP2040`) run on $3.3\text{ V}$ CMOS logic and have internal ESD protection diodes from every GPIO pin to the `3.3V` rail. Feeding a $5\text{ V}$ sensor signal directly into a non-5V-tolerant pin forward-biases that diode, dumping current into the MCU rail until the pin latches up or burns.
* **Open-Drain buses (`I2C`) & Level Shifting:** `I2C` lines (`SDA`, `SCL`) only pull **down** to `GND` using an internal N-MOSFET; external pull-up resistors ($2.2\text{ k}\Omega\text{–}4.7\text{ k}\Omega$ to `3.3V`) pull the line high. Use a bidirectional MOSFET level-shifter breakout (`BSS138`) whenever bridging $3.3\text{ V}$ and $5\text{ V}$ devices.

### 1.2 Low-Side MOSFET Switching, Flyback Diodes & H-Bridge Breakouts
* **Why an MCU Pin Cannot Drive a Motor Directly:** An `ESP32`/`STM32` GPIO pin sources at most $12\text{–}20\text{ mA}$, whereas even a small DC gearmotor draws $500\text{–}2000\text{ mA}$ on startup.
* **The Flyback Diode Rule:** A motor winding is an inductor ($V = L\frac{dI}{dt}$). When a transistor switches off motor current in $100\text{ ns}$, $\frac{dI}{dt}$ spikes negatively, generating a $+100\text{ V}$ inductive kickback that instantly punctures the transistor unless a **flyback diode** (or an H-bridge's internal body/freewheeling diodes) provides a recirculation loop.
* **Bidirectional H-Bridge Breakouts (`DRV8833` / `TB6612FNG`):** Four MOSFETs arranged in an "H" around the motor allow full forward/reverse PWM speed control from two logic pins.

### 1.3 Why Motors Reboot Microcontrollers (Star Grounding & Decoupling)
* **The Classic Beginner Bug:** Everything works until the motor reverses direction—then the `ESP32`/`Arduino` randomly resets or loses USB connection!
* **The Cause:** Motor stall current ($1\text{–}3\text{ A}$) flowing through thin breadboard ground jumpers creates a voltage bounce ($\Delta V = I R + L\frac{dI}{dt}$) and sags the power rail below the MCU brown-out threshold.
* **The Cure:**
  1. Place a **$470\ \mu\text{F}$ electrolytic bulk capacitor** directly across `VMOT` and `GND` on the motor driver breakout to supply millisecond current surges.
  2. Place a **$100\text{ nF}$ (`0.1 µF`) ceramic capacitor** right across the MCU `3.3V` and `GND` pins to supply nanosecond clock edges.
  3. Run separate `GND` wires from the motor driver and the MCU back to a single **Star Ground point** at the bench power supply negative terminal.

### ✅ Tier 1 Milestone Gate (`Track 01 · Pass 1`)
* Wire an `ESP32` or `STM32 Nucleo` + `DRV8833`/`TB6612FNG` H-bridge breakout on a breadboard powered from a $12\text{ V}$ bench supply, add $470\ \mu\text{F}$ bulk + $100\text{ nF}$ ceramic decoupling, and verify on your oscilloscope that instantaneous $+100\% \to -100\%$ PWM motor reversals produce $<100\text{ mV}$ of ripple on the MCU `3.3V` rail.
* **Next Linear Step in Pass 1:** [**Proceed to Track 02 (Tier 1: 2D Planar Kinematics, Gear Ratios & Bearings) →**](../02-mechanics-kinematics-dynamics/README.md#tier-1-beginner--intuitive)

---

## Tier 2 (Intermediate / Applied)

> **Goal of Pass 2 (Track 01):** Graduate from solderless breadboards and maker breakout modules to designing and SMD-soldering your own **4-layer KiCad PCB** with dedicated 3-phase gate drivers (`DRV8323`/`DRV8353`), 4-terminal Kelvin current shunts (`INA240`), and active RC anti-aliasing filters.

### 2.1 Schematic Capture, SMD Footprints & 4-Layer KiCad PCB Layout
* **Why 4 Layers Is the Minimum for Motor Control:** A 2-layer board forces you to cut up the bottom ground plane with signal cross-unders. Moving to a cheap **4-layer stackup (`L1: Signal/Power` $\to$ `L2: Unbroken Solid GND` $\to$ `L3: 3.3V/12V Pours` $\to$ `L4: Components/Signals`)** gives every high-speed trace and power switch an immediate low-inductance return plane $0.2\text{ mm}$ underneath on Layer 2.
* **Hands-On SMD Assembly (`0603` / `SOIC` / `QFN`):** Using solder paste, a stainless-steel stencil, a $60 mini hotplate, and a temperature-controlled iron + hot air, assembling `0603` passives and `QFN` gate drivers is faster and cleaner than through-hole soldering!

### 2.2 Gate Driver Bootstrap Circuits & Shoot-Through Dead-Time
* To switch an N-channel MOSFET on the high side of a $24\text{ V}$ half-bridge, its gate must be driven to $24\text{ V} + 10\text{ V} = 34\text{ V}$ relative to `GND`. A **Bootstrap Capacitor (`C_boot`)** + diode charges to $10\text{–}12\text{ V}$ whenever the low-side FET pulls the phase node to `GND`, then rides up on top of the switching node to turn on the high-side FET.
* **Dead-Time ($t_{\text{dead}}$):** If the high-side and low-side MOSFETs overlap for even $50\text{ ns}$, they short the $24\text{ V}$ bus directly to `GND` (**shoot-through**). Dedicated 3-phase gate drivers (`DRV8323`/`DRV8353`) enforce hardware dead-time ($100\text{–}400\text{ ns}$) and under-voltage lockout (`UVLO`).

### 2.3 4-Terminal Kelvin Current Shunts & Differential Sense Amplifier (`INA240`)
* A $1\text{ m}\Omega$ shunt resistor carrying $20\text{ A}$ produces only $20\text{ mV}$ of signal—less than the voltage drop across $3\text{ mm}$ of ordinary copper solder pad!
* **Kelvin Connection:** Never tap sense traces from the high-current power pads. Route two narrow differential sense traces (`IN+`, `IN-`) from the **inner center edges** of the shunt pads directly to a high-CMRR current-sense amplifier (`INA240`, gain $20\text{ V/V}$) followed by a 1st/2nd-order RC filter into the MCU ADC.

### ✅ Tier 2 Milestone Gate (`Track 01 · Pass 2`)
* Inspect the **Tab 6: 3D CAD & 48V PCB** thermal/inductance solver and the reference KiCad netlist in [`08-capstone-projects/eda-capstone1-foc-drive/capstone1_foc_48v30a.net`](../08-capstone-projects/eda-capstone1-foc-drive/capstone1_foc_48v30a.net), verifying ERC rules, Kelvin shunt net separation, and MOSFET junction temperature $T_j < 125^\circ\text{C}$.
* **Next Linear Step in Pass 2:** [**Proceed to Track 02 (Tier 2: Exact Constraint, `CadQuery` & URDF/MuJoCo) →**](../02-mechanics-kinematics-dynamics/README.md#tier-2-intermediate--applied)

---

## Bridging the Gap: Maker to Custom

### From an `L298N` + `INA219` Breakout Pair to a Custom `DRV8353` + `INA240` Kelvin PCB

| Feature | Tier 1 Maker Breakout (`L298N` + `INA219`) | Tier 2/3 Custom Engineering (`DRV8353RS` + `ISC030N08NM6` + `INA240`) |
| :--- | :--- | :--- |
| **Switch Technology & Voltage Drop** | Bipolar Darlington transistors drop **$2.5\text{–}4.0\text{ V}$**, burning $8\text{ W}$ of heat at just $2\text{ A}$! | Trench MOSFETs with $R_{DS(\text{on})} = 2.4\text{ m}\Omega$ drop only **$48\text{ mV}$ at $20\text{ A}$** ($0.96\text{ W}$ conduction loss). |
| **Current Sensing Bandwidth & Lag** | `INA219` reads over $400\text{ kHz}$ `I2C` with millisecond conversion delay—useless for $25\text{ kHz}$ FOC. | Analog `INA240A2` ($400\text{ kHz}$ bandwidth, PWM rejection) feeds simultaneous SAR ADCs in $<400\text{ ns}$. |
| **Commutation Loop Inductance ($L_{\text{loop}}$)** | $30\text{–}80\text{ nH}$ across header pins & jumper wires; rings violently above $10\text{ kHz}$. | **$< 2.0\text{ nH}$** via top-layer X7R MLCC array + immediate Layer-2 solid ground return plane. |

---

## Tier 3 (Advanced / Production)

> **Goal of Pass 3 (Track 01):** Master production-grade mixed-signal and power hardware: $<2\text{ nH}$ 6-layer switching loops, Si/SiC/GaN gate-drive design, Bessel anti-aliasing filters, SAR ADC charge buckets, and coupled electro-thermal Cauer/Foster verification.
> * [**Next Linear Step in Pass 3 → Track 02 (Tier 3: Screw PoE, `Ti-6Al-4V` Flexures & $O(n)$ RNEA)**](../02-mechanics-kinematics-dynamics/README.md#tier-3-advanced--production)

### 4.1 Mixed-Signal & Power Hardware Architecture

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

### 4.2 Precision Analog Front-End (AFE) & SAR ADC Charge-Bucket Engineering

#### Real-World Op-Amp & Instrumentation Amplifier Non-Idealities
* **Input Offset Voltage ($V_{os}$) & Drift ($dV_{os}/dT$):** For a $1\text{ m}\Omega$ shunt measuring $1\text{ A}$ ($V_{shunt} = 1\text{ mV}$), a standard op-amp with $V_{os} = 1\text{ mV}$ has a **100% zero-offset error**. Use zero-drift/chopper-stabilized amplifiers ($V_{os} < 10\ \mu\text{V}$, drift $< 0.05\ \mu\text{V}/^\circ\text{C}$).
* **Common-Mode Rejection Ratio (CMRR) at High $dV/dt$:** Inline phase current sensing exposes amplifier inputs to a $0\text{ V} \leftrightarrow 48\text{ V}$ rectangular wave slewing at $20\text{ V/ns}$. Use dedicated PWM-rejection current-sense amplifiers (`INA240`, `AD8418`) or isolated $\Sigma\Delta$ modulators (`AMC1306`).
* **Total Output Referred Noise Calculation:**

$$
E_{n,\text{rms,in}} = \sqrt{ e_{n,\text{white}}^2 \left( f_{ce} \ln\frac{f_H}{f_L} + \text{ENBW} \right) + (i_n R_{eq})^2 \text{ENBW} + 4 k_B T R_{eq} \text{ENBW} }
$$

#### Anti-Aliasing Filter Topologies: Butterworth vs. Chebyshev vs. Bessel

| Filter Topology | Magnitude Response | Step Response Overshoot | Group Delay $\tau_g(\omega) = -\frac{d\phi}{d\omega}$ | Mechatronics Application |
| :--- | :--- | :--- | :--- | :--- |
| **Butterworth** | Maximally flat passband | Moderate ($\sim 4.3\%$ for 2nd-order) | Nonlinear near cutoff | General data acquisition, vibration spectral analysis |
| **Bessel (Thomson)** | Gradual roll-off in transition band | **Zero / Minimal overshoot ($<0.5\%$)** | **Maximally flat group delay (linear phase)** | **Fast closed-loop current, force, and position control paths** |
| **Chebyshev Type I** | Equiripple passband, steep roll-off | High overshoot & ringing | Severe group-delay peaking near $f_c$ | Avoid inside high-bandwidth feedback loops |

#### SAR Charge-Bucket Input Driver
A Successive Approximation Register (SAR) ADC connects an internal sampling capacitor $C_{sh}$ ($5\text{–}20\text{ pF}$) to the input pin for an acquisition window $t_{acq}$ ($50\text{–}300\text{ ns}$). Choose external reservoir $C_{filt} \approx 22 \cdot C_{sh}$ (NP0/C0G dielectric only!) and $R_{filt}$ such that $t_{acq} \ge \ln(2^{N+1}) \cdot R_{filt} C_{sh}$ so charge kickback settles to $< 0.25\text{ LSB}$.

### 4.3 Power Electronics, Gate Drives & Inverter Thermal Network

| Device Technology | Typical Voltage Rating | Switching Frequency | Reverse Recovery Charge $Q_{rr}$ | $dV/dt$ Slew Rate | Key Gate-Drive Constraint |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Si Trench MOSFET** | $20\text{ V} - 200\text{ V}$ | $20\text{ kHz} - 100\text{ kHz}$ | Moderate ($20\text{–}100\text{ nC}$) | $5\text{–}25\text{ V/ns}$ | Standard $10\text{–}12\text{ V}$ drive; watch Miller plateau $Q_{gd}/Q_{gs}$ ratio |
| **SiC MOSFET** | $650\text{ V} - 1700\text{ V}$ | $40\text{ kHz} - 200\text{ kHz}$ | Near zero (capacitive $Q_{oss}$) | $30\text{–}100\text{ V/ns}$ | Asymmetric drive ($+18\text{ V}$ on, $-4\text{ V}$ off), requires active Miller clamp & Desat |
| **eGaN HEMT** | $40\text{ V} - 650\text{ V}$ | $100\text{ kHz} - 1\text{ MHz}$ | **Zero ($Q_{rr} = 0$)** | $50\text{–}200\text{ V/ns}$ | Strict $V_{GS} = 5.0\text{ V}$ ($V_{GS,\max} = 6.0\text{ V}$!); requires $< 1\text{ nH}$ Kelvin-source gate loop |

* **Miller Shoot-Through Immunity & Minimum Safe Dead-Time:**

$$
V_{GS,\text{induced}} \approx R_{g,\text{off,total}} \cdot C_{gd} \cdot \frac{dV_{DS}}{dt} < V_{GS(\text{th}),\min}, \qquad t_{\text{dead}} \ge \left(t_{d(\text{off}),\max} + t_{f,\max} + \Delta t_{\text{prop,skew}}\right) - t_{d(\text{on}),\min} + t_{\text{margin}}
$$

* **Switching Loop Parasitic Inductance & Coupled Electro-Thermal Loss:**

$$
V_{\text{peak}} = V_{\text{bus}} + L_{\text{loop}} \frac{dI}{dt}, \qquad P_{\text{total}} = I_{\text{rms}}^2 R_{DS(\text{on})}(T_j) + \frac{1}{2} V_{\text{bus}} I_{\text{load}} (t_r + t_f) f_{sw} + \frac{1}{2} C_{oss} V_{\text{bus}}^2 f_{sw} + V_{\text{bus}} Q_{rr} f_{sw}
$$

$$
R_{DS(\text{on})}(T_j) \approx R_{DS(\text{on})}(25^\circ\text{C}) \cdot \left(1 + \alpha (T_j - 25^\circ\text{C})\right), \qquad T_j = T_{\text{ambient}} + P_{\text{total}} \cdot \left(R_{\theta,\text{JC}} + R_{\theta,\text{TIM}} + R_{\theta,\text{HS-A}}\right)
$$

### 4.4 Reference 6-Layer Mixed-Signal Motor-Drive PCB Stackup

| Layer | Copper Weight | Function & Routing Rules | Dielectric Spacing |
| :--- | :--- | :--- | :--- |
| **L1 (Top)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | High-current power switches, MLCC hot-loop decoupling, short gate traces, critical AFE components | $0.15\text{ mm}$ prepreg to L2 |
| **L2 (Inner 1)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | **UNBROKEN Solid Ground Reference Plane (`GND`)** — Never split this plane under signal traces! | $0.35\text{ mm}$ core to L3 |
| **L3 (Inner 2)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | High-speed digital (SPI, CAN-FD, Encoder diff pairs), Kelvin sense differential pairs (shielded between L2 & L4) | $0.20\text{ mm}$ prepreg to L4 |
| **L4 (Inner 3)** | $1\text{ oz}$ ($35\ \mu\text{m}$) | Solid Reference / Power Pours (`3V3_D`, `3V3_A`, `5V`, `12V_GATE`) with stitching vias to L2 | $0.35\text{ mm}$ core to L5 |
| **L5 (Inner 4)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | High-current `V_BUS` / `PGND` return polygon directly beneath L1 power stage for flux cancellation | $0.15\text{ mm}$ prepreg to L6 |
| **L6 (Bottom)** | $2\text{ oz}$ ($70\ \mu\text{m}$) | Secondary power pours, thermal via pads bonded through TIM to aluminum baseplate/heatsink | — |

---

## 5. Failure Modes, Pitfalls & Anti-Patterns

1. **Bootstrap Capacitor Starvation at 100% Duty Cycle:** Clamp PWM duty cycle to $95\text{–}98\%$ maximum or use a gate driver with an internal trickle charge pump (`DRV8353`).
2. **MLCC DC Bias Derating:** `0402`/`0603` X5R ceramic capacitors lose 70–85% of their capacitance at $40\text{ V}$ DC! Use `1206`/`1210` X7R capacitors rated at $\ge 2\times V_{\text{bus}}$ and NP0/C0G in analog filter paths.
3. **Inductive Kickback on Hot-Plug Battery Connection:** Low-ESR MLCCs ring to $2\times V_{\text{bat}}$ on hot-plug unless damped by a bulk electrolytic capacitor ($R_{\text{ESR}} \ge \sqrt{L_{\text{cable}}/C_{\text{MLCC}}}$), TVS diode, or precharge circuit.
4. **Common-Source Inductance ($L_{CS}$) Oscillation:** Always use MOSFET packages with a dedicated Kelvin Source pin or branch the gate-driver return directly at the source pad.

---

## 6. Tier 3 Production Lab & Milestone Gate (`Lab 01`)

| Metric | Target Requirement | Verification Method |
| :--- | :--- | :--- |
| **Half-Bridge Voltage Overshoot** | $V_{DS,\text{peak}} < 58\text{ V}$ at $V_{\text{bus}} = 48\text{ V}$, $I_D = 30\text{ A}$, $t_{sw} \le 25\text{ ns}$ | Double-Pulse Test (DPT) in SPICE & Tab 6 PCB Simulator ($L_{\text{loop}} \le 2\text{ nH}$) |
| **Current AFE Phase Lag & Settling** | Phase lag $< 2.5^\circ$ at $2.5\text{ kHz}$; ADC sample error $< 0.25\text{ LSB}$ (12-bit) | 2nd-order Bessel AFE + SAR charge bucket ($C_{\text{filt}} \ge 20 C_{sh}$) |
| **Current Noise Floor (PWM Active)** | $< 15\text{ mA}_{\text{rms}}$ at ADC output with $48\text{ V}$ bus switching at $40\text{ kHz}$ | 10,000-sample DMA capture at PWM center trigger |
| **Thermal Rise at Continuous Load** | $\Delta T_{\text{PCB/Case}} < 40^\circ\text{C}$ ($T_j < 125^\circ\text{C}$) at $15\text{ A}_{\text{rms}}$ continuous ($30\text{ A}$ peak) | Coupled Cauer thermal solver & thermal camera soak test |
