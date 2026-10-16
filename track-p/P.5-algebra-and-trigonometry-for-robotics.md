# Lesson P.5: Robot Geometry — Rearranging Formulas, Right-Triangle Trig & Radians

## Goal
Rearrange physics equations to solve for any unknown variable, map sensor readings linearly from one range to another, and use right-triangle trigonometry (`sin`, `cos`, `atan2`) in **radians** to calculate robot arm tip positions.

- **New ideas (max 2):**
  1. **Rearranging equations and linear range scaling**: Isolating an unknown variable on one side of `=` by doing the same opposite operation to both sides, and mapping a number proportionally from an input range to an output range.
  2. **Right-triangle trigonometry (`sin`, `cos`, `atan2`) and radians**: Resolving a tilted robot link of length $L$ at angle $\theta$ into its horizontal ($x = L\cos\theta$) and vertical ($y = L\sin\theta$) coordinates using **radians** ($180^\circ = \pi\text{ rad}$).
- **New syntax:** `math.sin(rad)`, `math.cos(rad)`, `math.atan2(y, x)`, `math.radians(deg)`, `math.degrees(rad)`.
- **Estimated time (untimed guesses):** Typical: 2.0–2.5 hours | Slow-learner: 3.5–4.5 hours

---

## Prerequisites
- [Lesson P.3: Reusable Functions (`def`/`return`), Self-Tests (`assert`) & `import`](P.3-functions-assert-and-import.md) (`import math`, `math.pi`, `math.sqrt()`)
- [Lesson P.4: SI Units, Metric Prefixes, Binary Bits & Frequency (`Hz`)](P.4-units-prefixes-binary-and-frequency.md)

```mermaid
flowchart LR
    P4["P.4: Units, Binary & Frequency"] --> P5["P.5: Algebra, Trig & Radians"]
    P5 --> P6["P.6: Reading Time-Series Graphs"]
```

---

## Learn

### Idea 1: Rearranging Equations and Linear Range Scaling
- **Primary resource:** [MathsIsFun — Equations and Formulas ("Changing the Subject")](https://www.mathsisfun.com/algebra/equation-formula.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Equations and Formulas`**, **`What is a Formula?`**, **`Subject of a Formula`**, and **`Changing the Subject`**.
  - **What to skip:** Skip the bottom problem-set links if the volume rearrangement example is clear.
  - **Key takeaway:** An equation is a balanced scale: to isolate an unknown variable (make it the **subject** of the formula), apply the exact opposite arithmetic operation to **both** sides (undoing addition with subtraction, and multiplication with division). The same algebra lets you scale any measurement $x$ from $[x_{\min}, x_{\max}]$ into a target range $[y_{\min}, y_{\max}]$ via the **fraction of full scale**: $y = y_{\min} + \frac{x - x_{\min}}{x_{\max} - x_{\min}}(y_{\max} - y_{\min})$.
  - **Alternative resource:** [MathsIsFun — Linear Equations](https://www.mathsisfun.com/algebra/linear-equations.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Linear Equations`** and **`Slope-Intercept Form`**.

### Idea 2: Right-Triangle Trigonometry (`sin`, `cos`, `atan2`) and Radians
- **Primary resource:** [MathsIsFun — Sine, Cosine and Tangent](https://www.mathsisfun.com/sine-cosine-tangent.html) `[HTTP 200 — Verified by scripts/check_links.py]` & [BetterExplained — Intuitive Guide to Angles, Degrees and Radians](https://betterexplained.com/articles/intuitive-guide-to-angles-degrees-and-radians/) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** On MathsIsFun, read exact headings **`Right Triangle`**, **`Sine, Cosine and Tangent`**, **`Sohcahtoa`**, and **`Angles From 0° to 360°`**. On BetterExplained, read exact headings **`Radians: The Unselfish Choice`**, **`Using Radians`**, and **`Radian Example 1: Wheels of the Bus`**.
  - **What to skip:** Skip secant/cosecant/cotangent identities and infinite Taylor series.
  - **Key takeaway:** In a right triangle with hypotenuse length $L$ at angle $\theta$ from the horizontal axis, the horizontal adjacent reach is $x = L\cos(\theta)$ and the vertical opposite height is $y = L\sin(\theta)$. Whereas degrees split a circle into an arbitrary $360^\circ$, **radians** measure angle by the actual arc distance traveled along a unit circle ($360^\circ = 2\pi\text{ rad}$, $180^\circ = \pi\text{ rad}$, $90^\circ = \pi/2\text{ rad}$), and Python's `math.sin()` and `math.cos()` **always expect radians**.
  - **Alternative resource:** [MathsIsFun — Radians](https://www.mathsisfun.com/geometry/radians.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Radians`** and **`Radians and Degrees`**.
  - **Optional extra:** [PhET — Trig Tour Interactive Simulation](https://phet.colorado.edu/en/simulations/trig-tour) `[HTTP 200 — SPA/App: verify in-app]` — Drag the red point around the unit circle and click the **`Radians`** radio button `[verify in-app]` to watch $\cos\theta$ and $\sin\theta$ change live.

### Bridge Notes
In electronics and mechanics, one law is used in three directions. Take Ohm's Law, $V = I \cdot R$. If you know voltage $V$ and current $I$ and need resistance $R$, divide both sides by $I$ to get $R = \frac{V}{I}$. Similarly, **linear scaling** maps an Arduino 10-bit sensor value (`0..1023`) to voltage (`0..5.0 V`) by computing the fraction $\frac{\text{adc}\_\text{raw}}{1023}$ and multiplying by $5.0\text{ V}$.

When a robot arm link of length $L$ (the **hypotenuse**) rotates upward by angle $\theta$ from the horizontal $x$-axis, its tip sits at horizontal coordinate $x = L\cos(\theta)$ (**cosine** = adjacent / hypotenuse) and vertical coordinate $y = L\sin(\theta)$ (**sine** = opposite / hypotenuse). Conversely, if you know a target's $(x, y)$ coordinates and want the joint angle $\theta$, use **four-quadrant inverse tangent** `math.atan2(y, x)`, which inspects the signs of both `y` and `x` to return the exact angle in $[-\pi, +\pi]\text{ rad}$. Always remember: `math.sin()`, `math.cos()`, and `math.atan2()` use **radians** ($1\text{ rad} \approx 57.3^\circ$, $\pi\text{ rad} = 180^\circ$). Use `math.radians(deg)` to convert degrees to radians and `math.degrees(rad)` to convert radians back to degrees.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete the three functions (`adc_to_volts`, `arm_tip_xy`, and `angle_to_target_deg`) so the script scales an ADC reading, computes the $(x, y)$ position of a $0.20\text{ m}$ robot arm link at $60^\circ$, and finds the angle to a target at $(x = 0.0\text{ m}, y = 0.20\text{ m})$:

```python
import math


def adc_to_volts(adc_raw):
    # TODO 1: Scale adc_raw from the 10-bit range [0, 1023] to [0.0, 5.0] volts:
    #         volts = (adc_raw / 1023.0) * 5.0
    return 0.0


def arm_tip_xy(length_m, angle_deg):
    # TODO 2: Convert angle_deg to radians using math.radians(angle_deg),
    #         then compute x = length_m * math.cos(rad) and y = length_m * math.sin(rad)
    x_m = 0.0
    y_m = 0.0
    return [x_m, y_m]


def angle_to_target_deg(x_m, y_m):
    # TODO 3: Use math.atan2(y_m, x_m) to get the angle in radians,
    #         then convert it to degrees with math.degrees(...)
    return 0.0


tip = arm_tip_xy(0.20, 60.0)
print(f"ADC 511.5 -> {adc_to_volts(511.5):.2f} V")
print(f"Arm tip at 60 deg: x={tip[0]:.4f} m, y={tip[1]:.4f} m")
print(f"Angle to (0.0, 0.20): {angle_to_target_deg(0.0, 0.20):.1f} deg")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
ADC 511.5 -> 2.50 V
Arm tip at 60 deg: x=0.1000 m, y=0.1732 m
Angle to (0.0, 0.20): 90.0 deg
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `arm_tip_xy`, store `rad = math.radians(angle_deg)` first, then pass `rad` (never `angle_deg`!) into `math.cos(rad)` and `math.sin(rad)`. In `angle_to_target_deg`, notice that `math.atan2(y_m, x_m)` takes **`y_m` first, then `x_m`**.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

- `adc_to_volts`: `return (adc_raw / 1023.0) * 5.0`
- `arm_tip_xy`:
  ```python
  rad = math.radians(angle_deg)
  x_m = length_m * math.cos(rad)
  y_m = length_m * math.sin(rad)
  return [x_m, y_m]
  ```
- `angle_to_target_deg`: `return math.degrees(math.atan2(y_m, x_m))`
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
import math


def adc_to_volts(adc_raw):
    return (adc_raw / 1023.0) * 5.0


def arm_tip_xy(length_m, angle_deg):
    rad = math.radians(angle_deg)
    x_m = length_m * math.cos(rad)
    y_m = length_m * math.sin(rad)
    return [x_m, y_m]


def angle_to_target_deg(x_m, y_m):
    return math.degrees(math.atan2(y_m, x_m))


tip = arm_tip_xy(0.20, 60.0)
assert round(adc_to_volts(511.5), 2) == 2.50
assert round(tip[0], 4) == 0.1000
assert round(tip[1], 4) == 0.1732
assert round(angle_to_target_deg(0.0, 0.20), 1) == 90.0

print(f"ADC 511.5 -> {adc_to_volts(511.5):.2f} V")
print(f"Arm tip at 60 deg: x={tip[0]:.4f} m, y={tip[1]:.4f} m")
print(f"Angle to (0.0, 0.20): {angle_to_target_deg(0.0, 0.20):.1f} deg")
```
</details>

---

## Common mistakes & troubleshooting
- **Passing degrees directly into `math.cos(60)`:** `math.cos(60)` computes the cosine of `60 radians` ($\approx 3437.7^\circ$), which returns `-0.9524` instead of `+0.5`! Always convert degrees to radians first with `math.radians(60)`.
- **Swapping arguments in `math.atan2(y, x)`:** Unlike coordinate pairs `(x, y)`, `atan2` takes the vertical opposite side **`y` first** and the horizontal adjacent side **`x` second** (`math.atan2(y, x)`), because tangent is $\frac{\text{opposite}}{\text{adjacent}} = \frac{y}{x}$.
- **Dividing instead of multiplying when rearranging:** To solve $I = \frac{V}{R}$ for $V$, multiply both sides by $R$ to get $V = I \cdot R$. To solve for $R$, multiply both sides by $R$ ($I \cdot R = V$) and divide by $I$ to get $R = \frac{V}{I}$.

---

## Check yourself

1. **Rearranging a motor equation:** The voltage across a spinning brushed DC motor is $V = I \cdot R + V_{\text{emf}}$. Rearrange this formula to solve for the motor current $I$.
   <details>
   <summary><strong>Answer</strong></summary>

   First subtract $V_{\text{emf}}$ from both sides: $V - V_{\text{emf}} = I \cdot R$. Then divide both sides by $R$ to get $I = \frac{V - V_{\text{emf}}}{R}$ (in Python: `current_a = (v_supply - v_emf) / r_ohms`).
   </details>

2. **Degrees to radians:** Without a calculator, how many radians are in $360^\circ$, $180^\circ$, $90^\circ$, and $45^\circ$?
   <details>
   <summary><strong>Answer</strong></summary>

   - $360^\circ = \mathbf{2\pi\text{ rad}} \approx 6.283\text{ rad}$
   - $180^\circ = \mathbf{\pi\text{ rad}} \approx 3.142\text{ rad}$
   - $90^\circ = \mathbf{\pi/2\text{ rad}} \approx 1.571\text{ rad}$
   - $45^\circ = \mathbf{\pi/4\text{ rad}} \approx 0.785\text{ rad}$
   </details>

3. **Horizontal and vertical reach:** A robot arm link of length $L = 0.30\text{ m}$ points straight up at $\theta = 90^\circ$ ($\pi / 2\text{ rad}$). What are its $(x, y)$ tip coordinates? What if it points straight forward at $\theta = 0^\circ$ ($0\text{ rad}$)?
   <details>
   <summary><strong>Answer</strong></summary>

   - At $\theta = 90^\circ$: $\cos(90^\circ) = 0$ and $\sin(90^\circ) = 1$, so $(x, y) = \mathbf{(0.0\text{ m},\ 0.30\text{ m})}$.
   - At $\theta = 0^\circ$: $\cos(0^\circ) = 1$ and $\sin(0^\circ) = 0$, so $(x, y) = \mathbf{(0.30\text{ m},\ 0.0\text{ m})}$.
   </details>

4. **Why `atan2(y, x)` instead of `atan(y / x)`?** What happens if you try to compute `math.atan(y / x)` when the robot arm points straight up at $(x = 0.0, y = 0.20)$, versus calling `math.atan2(0.20, 0.0)`?
   <details>
   <summary><strong>Answer</strong></summary>

   `y / x` divides by `0.0` and crashes your program with a **`ZeroDivisionError`**! `math.atan2(0.20, 0.0)` handles `x = 0.0` safely without dividing by zero and returns $\pi / 2\text{ rad}$ (`90.0°`).
   </details>

---

## Recap
- Isolate an unknown variable by applying the opposite arithmetic operation to both sides of `=`, and wrap numerators/denominators in parentheses.
- Convert angles to **radians** ($\pi\text{ rad} = 180^\circ$) before calling `math.cos()` or `math.sin()`.
- For a link of length $L$ at angle $\theta$, horizontal reach is $x = L\cos\theta$, vertical height is $y = L\sin\theta$, and `math.atan2(y, x)` recovers $\theta$ safely in all four quadrants.

### You're ready to move on when...
- [ ] You can rearrange $V = I \cdot R + V_{\text{emf}}$ for $I$ on paper and in Python.
- [ ] You remember to convert degrees to radians with `math.radians()` before calling `sin` or `cos`.
- [ ] Your **Do it yourself** script outputs `x=0.1000 m, y=0.1732 m` and `90.0 deg`.
- **Next lesson:** [Lesson P.6: Reading Time-Series Graphs — Slope (Rate of Change) & Area (Accumulation)](P.6-reading-time-series-graphs.md)
