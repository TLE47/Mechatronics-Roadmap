---
lesson_id: P.7
title: "Base SI Units and Metric Prefixes (M, k, m, µ)"
ideas:
  - "Base SI units for mechatronics"
  - "Metric prefixes (M, k, m, µ)"
typical_hours: "1.0-1.5"
slow_learner_hours: "2.0-2.5"
---

# Lesson P.7: Base SI Units and Metric Prefixes (`M`, `k`, `m`, `µ`)

<!-- run-callout:start -->
> **Step 1 of 10 · Python and the maths a robot needs**
>
> **Run this in the workbench.** [Open MechaLab with `P.7` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.7) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Identify the base SI units (`m`, `kg`, `s`) and unit symbols (`A`, `V`, `Ω`) used in mechatronics, and convert values with metric prefixes (`M`, `k`, `m`, `µ`) into base units before plugging them into equations.

- **New ideas (max 2):**
  1. **Base SI units for mechatronics**: Why engineering formulas require standard base units (meters `m`, kilograms `kg`, seconds `s`, plus electrical unit symbols `A`, `V`, `Ω`).
  2. **Metric prefixes (`M`, `k`, `m`, `µ`)**: Scaling numbers by powers of $1{,}000$ (`mega` $= 10^6$, `kilo` $= 10^3$, `milli` $= 10^{-3}$, `micro` $= 10^{-6}$).
- **New syntax:** Python scientific notation `1e6`, `1e3`, `1e-3`, `1e-6`.
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–2.5 hours

---

## Prerequisites
- [Lesson P.2: Computer Arithmetic and Order of Operations](P.2-arithmetic-and-order-of-operations.md)
- [Lesson P.6: Loading Modules (`import`) & Automated Self-Checks (`assert`)](P.6-modules-and-automated-asserts.md)

```mermaid
flowchart LR
    P6["P.6: Modules & Automated Asserts"] --> P7["P.7: SI Units & Metric Prefixes"]
    P7 --> P8["P.8: Frequency (Hz) & Binary Bits"]
```

---

## Learn

<!-- figure: prefix-ladder | Each rung is a thousand; converting a value is moving one step along the ladder. -->


### Idea 1: Base SI units for mechatronics
- **Primary resource:** [MathsIsFun — Metric System of Measurement](https://www.mathsisfun.com/measure/metric-system.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Metric System of Measurement`**, **`Meter`**, **`Kilogram`**, and **`Second`**.
  - **What to skip:** Skip **`Volume`** (liters) and **`Temperature`**.
  - **Key takeaway:** Every equation in physics and engineering assumes your numbers are expressed in **base SI units**: length in **meters (`m`)**, mass in **kilograms (`kg`)**, time in **seconds (`s`)**, Amperes (`A`), Volts (`V`), and Ohms (`Ω`).

### Idea 2: Metric prefixes (`M`, `k`, `m`, `µ`)
- **Primary resource:** [MathsIsFun — Metric Numbers (Kilo, Mega, Milli, Micro)](https://www.mathsisfun.com/metric-numbers.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Metric Numbers`**, **`Common Big and Small Numbers`**, and **`Much Bigger and Smaller`**.
  - **What to skip:** Skip `tera`, `peta`, `exa`, and `femto`—in beginner mechatronics you primarily use `M`, `k`, `m`, and `µ`.
  - **Key takeaway:** A **metric prefix** is a multiplier placed in front of a unit: **mega (`M`)** $= \times 1{,}000{,}000$ ($10^6$), **kilo (`k`)** $= \times 1{,}000$ ($10^3$), **milli (`m`)** $= \div 1{,}000$ ($10^{-3}$), and **micro (`µ` or `u`)** $= \div 1{,}000{,}000$ ($10^{-6}$). Always convert prefixed numbers into base SI units *before* multiplying or dividing!

### Bridge Notes
Mixing un-converted prefixes into an equation is the #1 calculation error in beginner robotics. Every formula you will meet in this roadmap—such as distance ($d = s \cdot t$) and kinetic energy ($E_k = \frac{1}{2} m s^2$)—strictly expects **un-prefixed base SI units**: meters (`m`), kilograms (`kg`), seconds (`s`), Amperes (`A`), Volts (`V`), and Ohms (`Ω`).


<!-- figure: unit-cancellation | Carry the units through the arithmetic and the equation checks itself. -->

For example, if a datasheet says a sensor is $15\text{ mm}$ (millimeters) wide or a pulse lasts $500\ \mu\text{s}$ (microseconds) and you forget to convert to meters or seconds before multiplying, your answer will be off by a factor of **$1{,}000\times$** or **$1{,}000{,}000\times$**! Follow a two-step habit on every problem:
1. **Convert all inputs to base SI units on the very first line of code** (so $15\text{ mA} \rightarrow 0.015\text{ A}$, $0.22\text{ k}\Omega \rightarrow 220\ \Omega$, and $250\text{ mm} \rightarrow 0.25\text{ m}$).
2. **Run the formula purely in base SI units**, and only convert back to `mA`, `ms`, or `mm` at the end if a display label needs it. In Python, scientific notation (`1e-3` for $10^{-3} = 0.001$ and `1e-6` for $10^{-6} = 0.000001$) makes prefix conversion clean and typo-proof:

| Prefix | Symbol | Multiplier | Power of 10 | Python Shorthand | Hardware Example |
| :--- | :---: | :--- | :---: | :--- | :--- |
| **mega** | `M` | $\times 1{,}000{,}000$ | $10^{6}$ | `* 1e6` | $1\text{ M}\Omega = 1{,}000{,}000\ \Omega$ |
| **kilo** | `k` | $\times 1{,}000$ | $10^3$ | `* 1e3` | $4.7\text{ k}\Omega = 4{,}700\ \Omega$ |
| **milli** | `m` | $\div 1{,}000$ | $10^{-3}$ | `* 1e-3` | $20\text{ mA} = 0.020\text{ A}$, $5\text{ ms} = 0.005\text{ s}$ |
| **micro** | `µ` (`u`) | $\div 1{,}000{,}000$ | $10^{-6}$ | `* 1e-6` | $500\ \mu\text{s} = 0.0005\text{ s}$ |

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `ma_to_amps` (`TODO 1`), `kohms_to_ohms` (`TODO 2`), and `us_to_seconds` (`TODO 3`) to convert prefixed hardware values into base SI units:

```python
def ma_to_amps(val_ma):
    # TODO 1: Convert milliamps to amperes — a milli is a thousandth of the base unit
    return 0.0


def kohms_to_ohms(r_kohms):
    # TODO 2: Convert kilo-ohms to ohms — a kilo is a thousand base units
    return 0.0


def us_to_seconds(time_us):
    # TODO 3: Convert microseconds to seconds — a micro is a millionth of a second
    return 0.0


i_a = ma_to_amps(15.0)
r_ohm = kohms_to_ohms(0.22)
v_drop = i_a * r_ohm
t_sec = us_to_seconds(500.0)

print(f"15.0 mA = {i_a:.4f} A | 0.22 kOhm = {r_ohm:.1f} Ohm | V = {v_drop:.2f} V")
print(f"500.0 us = {t_sec:.6f} s")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
15.0 mA = 0.0150 A | 0.22 kOhm = 220.0 Ohm | V = 3.30 V
500.0 us = 0.000500 s
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

`milli` (`m`) divides by `1000.0`, `kilo` (`k`) multiplies by `1000.0`, and `micro` (`µ`) divides by `1000000.0`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def ma_to_amps(val_ma):
    return val_ma / 1000.0

def kohms_to_ohms(r_kohms):
    return r_kohms * 1000.0

def us_to_seconds(time_us):
    return time_us / 1000000.0
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def ma_to_amps(val_ma):
    return val_ma / 1000.0


def kohms_to_ohms(r_kohms):
    return r_kohms * 1000.0


def us_to_seconds(time_us):
    return time_us / 1000000.0


i_a = ma_to_amps(15.0)
r_ohm = kohms_to_ohms(0.22)
v_drop = i_a * r_ohm
t_sec = us_to_seconds(500.0)

assert round(i_a, 4) == 0.0150
assert round(r_ohm, 1) == 220.0
assert round(v_drop, 2) == 3.30
assert round(t_sec, 6) == 0.000500

print(f"15.0 mA = {i_a:.4f} A | 0.22 kOhm = {r_ohm:.1f} Ohm | V = {v_drop:.2f} V")
print(f"500.0 us = {t_sec:.6f} s")
```
</details>

---

## Common mistakes & troubleshooting
- **Confusing lowercase `m` (`milli` $= 10^{-3}$) with uppercase `M` (`mega` $= 10^6$):** Those two letters differ by a factor of **one billion ($10^9$)**! A $10\text{ mm}$ spacer is $0.01\text{ m}$, whereas $10\text{ M}\Omega$ is $10{,}000{,}000\ \Omega$.
- **Multiplying instead of dividing for `milli` or `micro`:** Ask yourself: *"Is a millimeter smaller or larger than a meter?"* Smaller—so $250\text{ mm} = 0.25\text{ m}$, never $250{,}000\text{ m}$.

---

## Check yourself

1. **Prefix conversion drill:** Convert each measurement into its base SI unit: (a) $250\text{ mm}$ to `m`, (b) $4.7\text{ k}\Omega$ to `Ω`, and (c) $100\ \mu\text{s}$ to `s`.
   <details>
   <summary><strong>Answer</strong></summary>

   - (a) $250\text{ mm} = 250 \div 1000 = \mathbf{0.25\text{ m}}$
   - (b) $4.7\text{ k}\Omega = 4.7 \times 1000 = \mathbf{4{,}700\ \Omega}$
   - (c) $100\ \mu\text{s} = 100 \div 1{,}000{,}000 = \mathbf{0.0001\text{ s}}$ (`100e-6`)
   </details>

2. **Multiplying converted units:** If $I = 0.5\text{ mA}$ and $R = 10\text{ k}\Omega$, what is the product $I \times R$ after converting both to base units (`A` and `Ω`)?
   <details>
   <summary><strong>Answer</strong></summary>

   Convert first: $I = 0.5\text{ mA} = 0.0005\text{ A}$ and $R = 10\text{ k}\Omega = 10{,}000\ \Omega$. Then $0.0005 \times 10{,}000 = \mathbf{5.0\text{ V}}$.
   </details>

3. **Time conversion:** How many milliseconds (`ms`) and how many microseconds (`µs`) are in $0.002\text{ s}$?
   <details>
   <summary><strong>Answer</strong></summary>

   $0.002\text{ s} \times 1000 = \mathbf{2.0\text{ ms}}$, and $0.002\text{ s} \times 1{,}000{,}000 = \mathbf{2{,}000\ \mu\text{s}}$.
   </details>

---

## Recap
- Always convert measurements into **base SI units** (`m`, `kg`, `s`, `A`, `V`, `Ω`) before plugging them into formulas.
- **Mega (`M`)** $= 10^6$, **kilo (`k`)** $= 10^3$, **milli (`m`)** $= 10^{-3}$, and **micro (`µ`)** $= 10^{-6}$.

### You're ready to move on when...
- [ ] You can convert `mm`, `mA`, `ms`, `µs`, and `kΩ` into base SI units without guessing whether to multiply or divide.
- [ ] Your **Do it yourself** script passes all assertions and prints `V = 3.30 V`.

<!-- next-step:start -->
👉 **Next:** [Step 1 · Python and the maths a robot needs — Lesson P.8: Cycle Frequency (Hz), Period (T = 1/f) and Binary Bits (2^N)](P.8-frequency-and-binary-bits.md)
<!-- next-step:end -->
