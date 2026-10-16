# Mechatronics Beginner Troubleshooting Guide (`Track P` → `Stage 0` → `Track 01`)

Use this symptom-to-fix table whenever your Python script, Falstad simulation, Wokwi Arduino sketch, or breadboard circuit behaves unexpectedly.

```mermaid
flowchart LR
    Sym["1. Observe Exact Symptom or Error"] --> Iso["2. Isolate Layer: Python / Falstad / Wokwi / Wiring"]
    Iso --> Fix["3. Apply Targeted Fix & Re-Test"]
```

---

## 1. Python Errors (`Track P` & Simulation Scripts)

| Symptom / Exact Error Message | Root Cause | How to Fix It |
| :--- | :--- | :--- |
| **`TypeError: 'int' object is not callable`** (or `'float' object is not callable`) | You wrote math with implicit multiplication next to parentheses, such as `2(r1 + r2)` or `length_m(math.cos(rad))`. Python thinks you are trying to call the number `2` as a function! | Always write the explicit multiplication asterisk `*`: `2 * (r1 + r2)` and `length_m * math.cos(rad)` ([Lesson P.2](../track-p/P.2-arithmetic-and-order-of-operations.md)). |
| **`NameError: name 'true' is not defined`** (or `'false' is not defined`) | You wrote lowercase `true` or `false` (C++/JavaScript style) in Python. | Capitalize the first letter of booleans in Python: **`True`** and **`False`** ([Lesson P.1](../track-p/P.1-variables-and-data-types.md)). |
| **`SyntaxError: invalid syntax` on an `if` or `elif` line** | Either you used single `=` (assignment) instead of double `==` (comparison) inside `if x = 5:`, or you forgot the colon `:` at the end of the `if ...:` line. | Use double equals **`==`** to compare values (`if x == 5:`) and end every `if`, `elif`, `else`, `for`, `while`, and `def` header with a colon `:` ([Lesson P.3](../track-p/P.3-decisions-and-clamping.md)). |
| **`IndentationError: expected an indented block`** | The line after `if:`, `for:`, `while:`, or `def:` is not indented by 4 spaces, or you mixed tabs and spaces. | Indent every block body by **4 spaces** per nesting level ([Lesson P.3](../track-p/P.3-decisions-and-clamping.md)). |
| **`IndexError: list index out of range`** | You tried to access `items[len(items)]` (e.g., `items[4]` on a 4-item list). | Remember **zero-based indexing**: a list of 4 items has valid indices `0, 1, 2, 3` (or `items[-1]` for the last item) ([Lesson P.4](../track-p/P.4-lists-and-for-loops.md)). |
| **`TypeError: unsupported operand type(s) for +: 'NoneType' and 'float'`** | Inside a function, you wrote `print(result)` instead of `return result`, so the function returned `None`. | Replace `print(result)` inside the function with **`return result`** ([Lesson P.5](../track-p/P.5-functions-and-while-loops.md)). |
| **`math.cos(60)` gives `-0.9524` instead of `0.5`** | `math.sin()` and `math.cos()` expect **radians**, not degrees! | Convert degrees to radians first: `math.cos(math.radians(60))` ([Lesson P.10](../track-p/P.10-radians-and-right-triangle-trig.md)). |
| **Voltage divider or slope formula gives a huge wrong number** | Missing parentheses around the numerator or denominator: `r2 / r1 + r2` evaluates `(r2 / r1) + r2` instead of `r2 / (r1 + r2)`. | Always wrap multi-term numerators and denominators in parentheses: **`(top) / (bottom)`** ([Lesson P.2](../track-p/P.2-arithmetic-and-order-of-operations.md), [P.11](../track-p/P.11-reading-time-series-graphs.md)). |

---

## 2. Falstad Circuit Simulator Issues (`Stage 0` & `Lesson 01.1`)

| Symptom in Falstad (`falstad.com/circuit/circuitjs.html`) | Root Cause | How to Fix It |
| :--- | :--- | :--- |
| **Red wire + `"Matrix error"` or `"Voltage source/wire loop with no resistance"`** | You wired a dead **short circuit** directly across a voltage source or inductor with $0\ \Omega$ resistance. | Remove the unintended bypass wire or insert a realistic series resistance (e.g., $220\ \Omega$ for an LED or $0.05\ \Omega$ wire resistance for a short-circuit model) ([Lesson S0.3](../stage-0/S0.3-breadboards-and-short-circuits.md)). |
| **Current flows in `mA` or `nA` when you expected `A` (or vice versa)** | Metric prefix typo in a component value dialog: in Falstad, lowercase **`m`** is milli ($10^{-3}$) and uppercase **`M`** is Mega ($10^6$). | Check component values carefully: type `1k` for $1{,}000\ \Omega$ and `100u` for $100\ \mu\text{F}$ ([Lesson P.7](../track-p/P.7-si-units-and-metric-prefixes.md), [S0.6](../stage-0/S0.6-capacitors-and-decoupling.md)). |
| **No oscilloscope graph visible at the bottom of the window** | You haven't added the component to the scope yet. | Right-click the component or wire of interest and select **`View in Scope`** `[verify in-app]` ([Lesson S0.9](../stage-0/S0.9-pwm-duty-cycle-and-analog-write.md)). |

---

## 3. Wokwi & Arduino Uno Firmware Issues (`Stage 0` & `Lesson 01.1`)

| Symptom in Wokwi (`wokwi.com`) | Root Cause | How to Fix It |
| :--- | :--- | :--- |
| **Voltage prints as `0.00` for every `analogRead(A0)` value from `0` to `1022`** | C/C++ **integer division trap**: writing `(adc_raw / 1023) * 5.0` divides two integers (`512 / 1023 == 0`) before multiplying. | Include `.0` decimal points so C/C++ performs floating-point division: **`(adc_raw / 1023.0) * 5.0`** ([Lesson S0.8](../stage-0/S0.8-adc-analog-read-and-serial-monitor.md)). |
| **Two fixed `wokwi-resistor` parts wired as a voltage divider into `A0` don't work** | Wokwi only has a digital pull-up/pull-down resistor model and does not simulate analog fixed-resistor voltage dividers (`docs.wokwi.com/parts/wokwi-resistor`). | Test fixed-resistor voltage dividers in **Falstad** (`falstad/S0.5-voltage-divider.txt`), and use Wokwi's **`wokwi-potentiometer`** part when feeding an adjustable $0\text{–}5.0\text{ V}$ analog signal into `A0` ([Lesson S0.5](../stage-0/S0.5-series-parallel-and-voltage-dividers.md)). |
| **LED brightness resets from bright to dark 4 times as you turn the potentiometer from `0` to `1023`** | You passed 10-bit `adc_raw` (`0..1023`) directly into 8-bit `analogWrite(9, adc_raw)` (`0..255`), which wraps modulo 256 (`256 -> 0`, `512 -> 0`, `768 -> 0`). | Divide the 10-bit ADC reading by `4` first: **`int pwm_val = adc_raw / 4;`** (`0..255`) ([Lesson S0.9](../stage-0/S0.9-pwm-duty-cycle-and-analog-write.md), [S0.M](../stage-0/S0.M-stage-0-milestone.md)). |
| **`analogWrite(pin, 128)` acts like a simple ON/OFF switch instead of dimming** | You connected the LED to a non-PWM pin (such as Pin `2, 4, 7, 8, 12, 13`). | Move the LED wire to one of the 6 hardware PWM pins on the Arduino Uno marked with **`~`**: **Pins `3, 5, 6, 9, 10, 11`** ([Lesson S0.9](../stage-0/S0.9-pwm-duty-cycle-and-analog-write.md)). |
| **Pushbutton reads randomly or works backward** | Either you used `pinMode(2, INPUT)` with no pull-up resistor (floating pin), or you checked `== HIGH` instead of `== LOW` for a button wired to `GND`. | Use **`pinMode(2, INPUT_PULLUP);`**, wire the button between `Pin 2` and `GND`, and check **`if (digitalRead(2) == LOW)`** for a button press ([Lesson S0.7](../stage-0/S0.7-arduino-uno-digital-io-and-pullups.md)). |
| **Serial Monitor is completely blank** | Missing `Serial.begin(9600);` in `void setup()`. | Add `Serial.begin(9600);` inside `setup()` and use `Serial.println(...)` inside `setup()` or `loop()` ([Lesson S0.8](../stage-0/S0.8-adc-analog-read-and-serial-monitor.md)). |
| **Low-side MOSFET motor switch never turns on (or burns out on turn-on)** | Missing **common ground** between the $12\text{ V}$ supply and Arduino `GND`, or the **flyback diode** was installed upside down (cathode stripe pointing down to Drain instead of up to $+12\text{ V}$). | Tie $12\text{ V}$ battery `-` to Arduino `GND`, and verify the flyback diode's **cathode stripe (`-`) connects to $+12\text{ V}$** ([Lesson 01.1](../01-electronics-and-power/01.1-mosfet-inductor-flyback.md)). |
