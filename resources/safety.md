# Mechatronics Beginner Safety Guide (`Stage 0` → `Track 01`)

Even when you start in browser simulators (**Falstad** and **Wokwi**) and later move to a \$15–\$25 desktop breadboard kit, building safe habits from Day 1 protects your components, your USB ports, and yourself.

```mermaid
flowchart LR
    Off["1. Power OFF: Build & Inspect"] --> Cont["2. Continuity Check: 5V-to-GND Not Shorted"]
    Cont --> CCCV["3. Set CC/CV Supply Current Limit"]
    CCCV --> On["4. Power ON & Monitor Temperatures"]
```

---

## 1. Power-Off Continuity Check & Current-Limited (`CC/CV`) Bench Supplies ([Lesson S0.3](../stage-0/S0.3-breadboards-and-short-circuits.md), [Lesson S0.5](../stage-0/S0.5-multimeters-and-current-limited-supplies.md))
- **Never wire or re-wire a circuit while power is connected.** Always unplug the USB cable or switch off the power supply before moving jumper wires.
- **Run a 5-second Continuity Test before applying power:** Set your multimeter to **Continuity mode** (the sound-wave icon) with power **OFF**, and touch the probes between your **`5V` (or `+12V`) rail and `GND`**. The meter should **stay silent** (open or high resistance). If it beeps ($R \approx 0\ \Omega$), you have a dead **short circuit** between power and ground—find and remove the misplaced wire before plugging in!
- **Use a Current-Limited (`CC/CV`) Bench Power Supply whenever possible:** Set your target voltage ($V_{\text{set}}$, e.g., $5.0\text{ V}$) and a conservative **current limit** ($I_{\text{limit}}$, e.g., $0.10\text{ A}$ for logic breadboards) before enabling output. Under normal load ($I < I_{\text{limit}}$), the supply operates in **Constant-Voltage (`CV`)** mode. If an accidental short circuit occurs, the supply automatically switches into **Constant-Current (`CC`)** mode—clamping current at $I_{\text{limit}}$ and folding terminal voltage down to $V_{\text{out}} = I_{\text{limit}} \cdot R_{\text{short}} \approx 0\text{ V}$ so wires and chips never burn!

---

## 2. Multimeter Probing Safety: Voltage in Parallel, Current in Series ([Lesson S0.5](../stage-0/S0.5-multimeters-and-current-limited-supplies.md))
- **Measuring Voltage (`V`):** Keep the red lead in the **`V / Ω` socket**. Touch the probes **in parallel** (across the component). A voltmeter has huge internal resistance ($\approx 10\text{ M}\Omega$), so touching it across `5V` and `GND` is completely safe.
- **Measuring Current (`mA` / `A`):** An ammeter has **near-zero internal resistance** ($\approx 0.1\ \Omega$). You **must** break the circuit and wire the ammeter **in series** so current flows through the meter to the load. **Never touch ammeter probes in parallel across a battery or `5V`/`GND` rails**—doing so creates a dead short straight through the multimeter and immediately blows its internal fuse!

---

## 3. Component Polarity & Current Limits ([Lesson S0.4](../stage-0/S0.4-leds-and-resistor-power.md), [Lesson S0.6](../stage-0/S0.6-capacitors-and-decoupling.md), [Lesson S0.7](../stage-0/S0.7-arduino-uno-digital-io-and-pullups.md))
- **LEDs Always Need a Series Resistor:** Never connect an LED directly across `5V` and `GND` or directly from an Arduino pin to `GND`. Always include a series resistor ($220\ \Omega$ to $1\text{ k}\Omega$) and check its power dissipation ($P = V_R \cdot I \le 0.125\text{ W}$ for a $0.25\text{ W}$ resistor).
- **Electrolytic Capacitors Are Polarized (`-` Stripe to `GND`):** Cylindrical aluminum electrolytic capacitors ($10\ \mu\text{F}$, $100\ \mu\text{F}$, $470\ \mu\text{F}$) have a white or black stripe marked **`-`** along one side (with a shorter leg). That **`-` cathode leg MUST connect to `GND`**. Connecting an electrolytic capacitor backward across a power supply causes its internal electrolyte to boil and burst the metal can!
- **Respect the Arduino Uno $20\text{ mA}$ Pin Limit:** An Arduino Uno GPIO pin (`0`–`13`, `A0`–`A5`) can safely source or sink **$20\text{ mA}$ continuous** ($40\text{ mA}$ absolute maximum) and only tolerates voltages between **$0.0\text{ V}$ and $5.0\text{ V}$**. Never connect a motor, solenoid, or relay coil directly to an Arduino pin, and never feed $> 5.0\text{ V}$ into `A0` without a verified voltage divider ([Lesson S0.2](../stage-0/S0.2-series-parallel-and-voltage-dividers.md)).

---

## 4. Inductive Loads, Flyback Diodes & Motor Safety ([Lesson 01.1](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md))
- **Every Inductive Load Needs a Flyback Diode:** Whenever you switch a motor coil, relay, or solenoid with a MOSFET, wire a **flyback diode** in parallel across the coil with its **cathode stripe (`-`) connected to $+V_{\text{supply}}$** and its **anode (`+`) connected to the MOSFET Drain**.
  - Without the diode, turning the MOSFET off produces a hundred-volt inductive kickback spike ($V_L = L \frac{\Delta I}{\Delta t}$) that destroys the MOSFET.
  - Installed upside down (cathode stripe toward `GND`), the diode creates a dead short across the power supply the instant the MOSFET turns on!
- **Keep a Hardware Kill-Switch Within Reach:** Before spinning any motor or actuator on your desk, clamp the motor body down so it cannot jump off the table, keep fingers and loose sleeves clear of gears/propellers, and always wire an accessible **kill-switch** ([Lesson S0.M](../stage-0/S0.M-stage-0-milestone.md)) or power cutoff switch.
