---
lesson_id: P.9
title: "Rearranging Physics Formulas and Linear Range Scaling"
ideas:
  - "Rearranging three-variable physics formulas"
  - "Linear range scaling"
typical_hours: "1.0-1.5"
slow_learner_hours: "2.0-3.0"
---

# Lesson P.9: Rearranging Physics Formulas and Linear Range Scaling

## Goal
Rearrange physics and circuit formulas to isolate any unknown variable on the left side of `=`, and linearly map sensor counts (`0..1023`) into physical units (`0..5.0 V`) or actuator commands (`0..255`).

- **New ideas (max 2):**
  1. **Rearranging three-variable physics formulas**: Doing the exact same opposite operation to both sides of an equation to solve for any unknown variable ($V = IR \leftrightarrow I = V/R \leftrightarrow R = V/I$).
  2. **Linear range scaling**: Converting a number from an input interval $[0, X_{\max}]$ to an output interval $[0, Y_{\max}]$ via the fraction of full scale $\left(\frac{x}{X_{\max}}\right) \times Y_{\max}$.
- **New syntax:** None (uses Python functions and arithmetic from Lessons P.2 and P.5).
- **Estimated time (untimed guesses):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–3.0 hours

---

## Prerequisites
- [Lesson P.5: Reusable Functions (`def`/`return`) & `while` Loops](P.5-functions-and-while-loops.md)
- [Lesson P.8: Cycle Frequency (`Hz`), Period & Binary Bits](P.8-frequency-and-binary-bits.md)

```mermaid
flowchart LR
    P8["P.8: Frequency & Binary Bits"] --> P9["P.9: Rearranging Formulas & Scaling"]
    P9 --> P10["P.10: Radians & Right-Triangle Trig"]
```

---

## Learn

### Idea 1: Rearranging three-variable physics formulas
- **Primary resource:** [MathsIsFun — Algebra: Balance when Adding and Subtracting / Multiplying](https://www.mathsisfun.com/algebra/introduction-multiply.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Solve It`** and **`Balance`** (applying the opposite operation to both sides of `=`).
  - **What to skip:** Skip multi-variable polynomial factoring links.
  - **Key takeaway:** An equation is a balanced scale: to isolate an unknown variable, undo whatever is attached to it by performing the **opposite operation on both sides**. If the unknown is multiplied by $R$ ($V = I \cdot R$), divide both sides by $R$ to get $I = \frac{V}{R}$; if $V_f$ is added ($V_s = V_R + V_f$), subtract $V_f$ from both sides to get $V_R = V_s - V_f$.

### Idea 2: Linear range scaling
- **Primary resource:** [SparkFun — Analog to Digital Conversion ("Relating ADC Value to Voltage")](https://learn.sparkfun.com/tutorials/analog-to-digital-conversion) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact heading **`Relating ADC Value to Voltage`**.
  - **What to skip:** Skip the rest of the ADC hardware tutorial for now (we cover the full ADC in Lesson S0.8).
  - **Key takeaway:** A proportion like $\frac{\text{ADC}}{1023} = \frac{V}{5.0\text{ V}}$ says that the sensor reading's **fraction of full scale** (`adc_raw / 1023.0`, a number between `0.0` and `1.0`) equals the voltage's fraction of $5.0\text{ V}$. Multiplying both sides by $5.0\text{ V}$ gives $V = \left(\frac{\text{adc}\_\text{raw}}{1023.0}\right) \times 5.0\text{ V}$.

### Bridge Notes
In mechatronics, you do not need to memorize three separate formulas for every physical law—you only need one formula and the balance rule:
- Start with Ohm's Law: $V = I \cdot R$.
- Need current $I$? Divide both sides by $R$: $I = \frac{V}{R}$.
- Need resistance $R$? Divide both sides by $I$: $R = \frac{V}{I}$.

What if an equation has both addition and multiplication, like sizing a resistor for an LED ($V_{\text{supply}} = I \cdot R + V_f$)? Undo addition/subtraction **first** by subtracting $V_f$ from both sides ($V_{\text{supply}} - V_f = I \cdot R$), and then divide both sides by $I$:

$$
R = \frac{V_{\text{supply}} - V_f}{I}
$$

The exact same algebra powers **linear range scaling**. Whenever you map a reading $x \in [0, X_{\max}]$ into a target range $y \in [0, Y_{\max}]$:
1. Divide by the input maximum to get the normalized fraction $\frac{x}{X_{\max}} \in [0.0, 1.0]$.
2. Multiply that fraction by the output maximum $Y_{\max}$: $y = \left(\frac{x}{X_{\max}}\right) \times Y_{\max}$.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `solve_for_resistance` (`TODO 1`), `adc10_to_volts` (`TODO 2`), and `adc10_to_pwm8` (`TODO 3`):

```python
def solve_for_resistance(v_supply, v_led, current_a):
    # TODO 1: Rearrange v_supply = (current_a * r_ohms) + v_led to solve for r_ohms:
    #         r_ohms = (v_supply - v_led) / current_a
    return 0.0


def adc10_to_volts(adc_raw):
    # TODO 2: Scale adc_raw from [0, 1023] to [0.0, 5.0] Volts:
    #         (adc_raw / 1023.0) * 5.0
    return 0.0


def adc10_to_pwm8(adc_raw):
    # TODO 3: Scale adc_raw from [0, 1023] to [0.0, 255.0]:
    #         (adc_raw / 1023.0) * 255.0
    return 0.0


r_led = solve_for_resistance(5.0, 2.0, 0.015)
v_mid = adc10_to_volts(511.5)
pwm_mid = adc10_to_pwm8(511.5)

print(f"LED Resistor: {r_led:.1f} ohms")
print(f"ADC 511.5 -> {v_mid:.2f} V | PWM = {pwm_mid:.1f}")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
LED Resistor: 200.0 ohms
ADC 511.5 -> 2.50 V | PWM = 127.5
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, wrap `(v_supply - v_led)` in parentheses before dividing by `current_a`. In `TODO 2` and `TODO 3`, compute the fraction `adc_raw / 1023.0` first, then multiply by `5.0` or `255.0`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def solve_for_resistance(v_supply, v_led, current_a):
    return (v_supply - v_led) / current_a

def adc10_to_volts(adc_raw):
    return (adc_raw / 1023.0) * 5.0

def adc10_to_pwm8(adc_raw):
    return (adc_raw / 1023.0) * 255.0
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def solve_for_resistance(v_supply, v_led, current_a):
    return (v_supply - v_led) / current_a


def adc10_to_volts(adc_raw):
    return (adc_raw / 1023.0) * 5.0


def adc10_to_pwm8(adc_raw):
    return (adc_raw / 1023.0) * 255.0


r_led = solve_for_resistance(5.0, 2.0, 0.015)
v_mid = adc10_to_volts(511.5)
pwm_mid = adc10_to_pwm8(511.5)

assert round(r_led, 1) == 200.0
assert round(v_mid, 2) == 2.50
assert round(pwm_mid, 1) == 127.5

print(f"LED Resistor: {r_led:.1f} ohms")
print(f"ADC 511.5 -> {v_mid:.2f} V | PWM = {pwm_mid:.1f}")
```
</details>

---

## Common mistakes & troubleshooting
- **Dividing before subtracting when rearranging $V_s = IR + V_f$:** Writing $R = \frac{V_s}{I} - V_f$ is wrong because $I$ only multiplies $R$, not $V_f$. Subtract $V_f$ from both sides *first* to get $V_s - V_f = IR$, then divide the entire left side by $I$: $R = \frac{V_s - V_f}{I}$.
- **Multiplying by `1023.0 / 5.0` instead of `5.0 / 1023.0`:** Check your endpoints! When `adc_raw = 1023`, the voltage must equal `5.0 V`, which requires `(1023 / 1023.0) * 5.0 = 5.0`.

---

## Check yourself

1. **Rearranging a motor equation:** The voltage across a spinning DC motor is $V = I \cdot R + V_{\text{emf}}$. Rearrange this equation to solve for the motor current $I$.
   <details>
   <summary><strong>Answer</strong></summary>

   Subtract $V_{\text{emf}}$ from both sides ($V - V_{\text{emf}} = I \cdot R$), then divide both sides by $R$ to get $I = \frac{V - V_{\text{emf}}}{R}$ (`(v - v_emf) / r`).
   </details>

2. **Scaling a 10-bit reading:** If `analogRead(A0)` returns `682` on a `5.0 V` Arduino Uno (`0..1023`), what fraction of full scale is the knob at, and what is the voltage in Volts?
   <details>
   <summary><strong>Answer</strong></summary>

   The fraction is $\frac{682}{1023} = \mathbf{\frac{2}{3} \approx 0.6667}$ ($66.7\%$), and the voltage is $0.6667 \times 5.0\text{ V} = \mathbf{3.33\text{ V}}$.
   </details>

3. **Inverse scaling (Volts to ADC count):** Rearrange $V = \left(\frac{\text{ADC}}{1023}\right) \times 5.0$ to solve for $\text{ADC}$ when $V = 1.25\text{ V}$.
   <details>
   <summary><strong>Answer</strong></summary>

   $\text{ADC} = \left(\frac{V}{5.0}\right) \times 1023 = \left(\frac{1.25}{5.0}\right) \times 1023 = 0.25 \times 1023 = \mathbf{255.75}$ (which rounds to integer count **`256`**).
   </details>

---

## Recap
- Isolate an unknown variable by performing the **opposite operation on both sides** of `=` (undoing addition/subtraction before multiplication/division).
- **Linear scaling** multiplies the input's fraction of full scale $\left(\frac{x}{X_{\max}}\right)$ by the target full scale $Y_{\max}$.

### You're ready to move on when...
- [ ] You can rearrange $V = IR$ and $V_s = IR + V_f$ for any variable without guessing.
- [ ] You can scale any `[0, 1023]` sensor reading into `[0.0, 5.0] V` or `[0, 255]`.
- [ ] Your **Do it yourself** script prints `200.0 ohms`, `2.50 V`, and `PWM = 127.5`.
- **Next lesson:** [Lesson P.10: Radians, Rotational Speed (`rad/s`) & Right-Triangle Trigonometry](P.10-radians-and-right-triangle-trig.md)
