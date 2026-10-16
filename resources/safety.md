# Mechatronics Beginner Safety Guide (`Stage 0` & `Pass 1`)

Even when you start 100% in browser simulators (**Falstad**, **Wokwi**, and **Python**), building safe habits now ensures that when you upgrade to a \$15–\$25 desktop hardware kit, you never damage your microcontroller, pop a capacitor, blow a multimeter fuse, or injure your hands or eyes.

```mermaid
flowchart LR
    Off["1. Power OFF: Check Continuity & Polarity"] --> Limit["2. Set Current Limit & Safety Gating"]
    Limit --> StandBack["3. Glasses On: First Power-Up"]
    StandBack --> EStop["4. Keep Hardware E-Stop in Reach"]
```

---

## 1. Power-Off Pre-Flight Checks (Before Connecting USB or a Battery)

1. **Continuity Check Between Power (`5V` / `12V`) and `GND` ([Lesson S0.2](../stage-0/S0.2-breadboards-multimeter-and-short-circuits.md)):**
   - Before plugging in your USB cable or battery, set your multimeter to **Continuity / Resistance ($\Omega$)** and touch the probes between `5V` and `GND` (and between `12V` and `GND`).
   - If the meter beeps ($R \approx 0\ \Omega$), you have a **dead short circuit** on your breadboard! Find and fix the misplaced wire before applying power.
2. **Never Rely on Wokwi to Catch Breadboard Shorts ([Lesson S0.2](../stage-0/S0.2-breadboards-multimeter-and-short-circuits.md)):**
   - Wokwi's breadboard only routes digital logic states and will **not** warn you if you wire `5V` directly to `GND`. Test analog power/ground layouts in **Falstad** (`https://www.falstad.com/circuit/circuitjs.html`) and always trace physical breadboard rows (`a–e` vs. `f–j`) by eye and with a multimeter.
3. **Multimeter Red Lead Rule ([Lesson S0.2](../stage-0/S0.2-breadboards-multimeter-and-short-circuits.md)):**
   - Keep your multimeter's red probe plugged into the **`V / Ω` socket** at all times.
   - The **`10A` / `mA` current socket** is a near-zero-ohm wire inside the meter: if you leave the red lead in the current socket and touch the probes across a battery or `5V` rail to "measure voltage," you create a direct short circuit through the meter and blow its internal fuse!

---

## 2. Component Polarity & Overvoltage Rules

1. **Electrolytic Capacitors Are Polarized — Wear Safety Glasses ([Lesson S0.4](../stage-0/S0.4-capacitors-and-power-rail-decoupling.md)):**
   - Cylindrical aluminum electrolytic capacitors (e.g., $100\ \mu\text{F}$) have a painted **negative stripe (`-`)** and a shorter negative leg.
   - Connecting an electrolytic capacitor backward (`-` stripe to $+5\text{ V}$ or $+12\text{ V}$, and `+` leg to `GND`) boils the internal liquid electrolyte into gas and can cause the metal can to **burst violently with hot vapor and debris**. Always double-check the `-` stripe faces `GND` and wear safety glasses on first power-up.
2. **Flyback Diode Orientation Across Motor Coils ([Lesson 01.1](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md)):**
   - Every inductive load (motor coil, solenoid, relay) switched by a single MOSFET **must** have a parallel flyback diode to clamp the $V_L = L \frac{\Delta I}{\Delta t}$ inductive kickback spike.
   - The flyback diode's **cathode stripe (`-`) MUST connect to $+V_{\text{supply}}$** (`+12 V`), and its **anode (`+`) to the MOSFET Drain** (reverse-biased during normal running). Installing the diode upside down creates a direct short circuit through the diode and MOSFET the instant the MOSFET turns on!
3. **Respect the Arduino Uno's `20 mA` & `5.0 V` Pin Limits ([Lesson S0.5](../stage-0/S0.5-arduino-uno-digital-io-and-pullups.md), [S0.6](../stage-0/S0.6-adc-analog-read-and-serial-monitor.md)):**
   - Never connect a motor, solenoid, or relay coil directly to an Arduino GPIO pin (safe continuous limit: **$20\text{ mA}$**; absolute max: $40\text{ mA}$). Always use a MOSFET (`Lesson 01.1`) or H-bridge driver (`Track 01`).
   - Never apply more than **$5.0\text{ V}$** to an Arduino Uno pin (or more than **$3.3\text{ V}$** when using $3.3\text{ V}$ boards like the ESP32 or STM32 in later tracks). When monitoring a $12\text{ V}$ battery with an ADC pin, scale the voltage down first with a resistor voltage divider (`Lesson S0.3`) and measure the midpoint with a voltmeter *before* connecting it to `A0`.

---

## 3. Power-Supply & Mechanical Motion Safety

1. **Always Tie Common Ground (`GND`), Never Tie Positive Supplies Together ([Lesson 01.1](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md)):**
   - Connect the negative (`GND`) terminal of your $12\text{ V}$ motor power supply to the Arduino Uno's `GND` pin so gate signals share a $0.0\text{ V}$ reference.
   - **Never** connect the $+12\text{ V}$ rail to the Arduino's `5V` pin!
2. **Add a $10\text{ k}\Omega$ Gate Pull-Down Resistor ([Lesson 01.1](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md)):**
   - Connect a $10\text{ k}\Omega$ resistor between every N-Channel MOSFET Gate and `GND` so the motor cannot jerk unexpectedly while the microcontroller is booting or resetting.
3. **Clamp Propellers, Wheels, and Robot Links Before Enabling Loops ([Lesson S0.M](../stage-0/S0.M-stage-0-milestone.md)):**
   - Remove propellers/arms or elevate wheels off the desk during initial firmware testing, and always wire and test an active-low **kill-switch (`INPUT_PULLUP`)** or power cutoff switch within arm's reach before commanding motion.
