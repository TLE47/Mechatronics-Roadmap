# Lesson P.1: Thinking Like a Computer — Variables, Data Types & Arithmetic Expressions

## Goal
Store robot measurements such as battery voltage and wheel encoder counts in named Python variables, distinguish the four fundamental data types, and translate multi-step physics formulas into bug-free computer arithmetic.

- **New ideas (max 2):**
  1. **Variables and data types (`int`, `float`, `str`, `bool`)**: Storing whole numbers, decimal measurements, text labels, and true/false flags inside named memory boxes using the assignment operator (`=`).
  2. **Computer arithmetic and order of operations**: Using explicit multiplication (`*`), division (`/`), exponents (`**`), and parentheses `()` so numerators and denominators evaluate in the exact intended order.
- **New syntax:** `=`, `+`, `-`, `*`, `/`, `**`, `()`, `#` comments, `print()`, `f"{value:.2f}"` formatted strings (`f-strings`).
- **Estimated time (untimed guesses):** Typical: 2.0–2.5 hours | Slow-learner: 3.5–4.5 hours

---

## Prerequisites
- Basic school arithmetic (addition, subtraction, multiplication, division, and fractions).
- No prior programming or electronics experience required.

```mermaid
flowchart LR
    Start["Start Here: Track P"] --> P1["P.1: Variables, Types & Arithmetic"]
    P1 --> P2["P.2: Decisions, Loops & Lists"]
```

---

## Learn

### Idea 1: Variables and Data Types (`int`, `float`, `str`, `bool`)
- **Primary resource:** [futurecoder.io — Chapters 1, 2, 3, and 7 (f-strings)](https://futurecoder.io/course/#toc) `[HTTP 200 — SPA/App: verify in-app]` *(Chapter titles verified against [futurecoder GitHub source `core/chapters`](https://github.com/alexmojaki/futurecoder/tree/main/core/chapters) `[HTTP 200 — Verified by scripts/check_links.py]`)*
  - **What to read/complete:** Complete **Chapter 1 (`The Shell`)**, **Chapter 2 (`String Basics`)**, **Chapter 3 (`Variables`)**, and the **`f-strings`** page inside **Chapter 7 (`A Bit More About Strings`)** `[verify in-app]`.
  - **What to skip:** Skip Chapters 4, 5, 6, and 8–12 for now (we cover loops, conditionals, lists, and functions in Lessons P.2 and P.3).
  - **Key takeaway:** A **variable** is a named storage box in computer memory where the assignment symbol `=` calculates the right-hand side first and stores the result into the name on the left. Python separates data into whole-number integers (`int`), decimal numbers (`float`), quoted text strings (`str`), and `True`/`False` booleans (`bool`), and formatted strings (`f"..."`) let you print variable values cleanly with units.
  - **Alternative resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Functions`**, **`Variables`**, **`Comments`**, **`Formatting Strings`**, **`Integers or int`**, and **`Float Basics`** (skip **`Strings and Parameters`**, **`More on Strings`**, and **`Def`**).

### Idea 2: Computer Arithmetic and Order of Operations
- **Primary resource:** [Official Python 3 Tutorial — Section 3.1: Using Python as a Calculator](https://docs.python.org/3/tutorial/introduction.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`3.1. Using Python as a Calculator`** and **`3.1.1. Numbers`**.
  - **What to skip:** Skip **`3.1.2. Text`** (string indexing/slicing) and **`3.1.3. Lists`** (covered in Lesson P.2).
  - **Key takeaway:** Python evaluates parentheses `()` first, then exponents `**`, then multiplication `*` and division `/`, and finally addition `+` and subtraction `-`. Division `/` always produces a decimal `float`, and multi-term fractions written on a single line require parentheses around the entire numerator and the entire denominator: `(top) / (bottom)`.
  - **Alternative resource:** [MathsIsFun — Order of Operations (PEMDAS/BODMAS)](https://www.mathsisfun.com/operation-order-pemdas.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Order of Operations`** and **`How Do I Remember It All ... ?`**.

### Bridge Notes
In mechatronics, every number represents a physical quantity with a unit. When you write `battery_voltage = 12.0` in a **program** (an ordered list of instructions executed top-to-bottom), the **assignment** operator (`=`) creates a variable named `battery_voltage` holding the **float** (floating-point decimal number) `12.0`. Because Python evaluates the right side of `=` before storing it on the left, `encoder_ticks = encoder_ticks + 25` reads the current **int** (integer whole number) inside `encoder_ticks`, adds `25`, and writes the new total back into `encoder_ticks`.

Text inside quotes like `"FAULT"` is a **str** (string), while a safety flag like `is_estop_active = False` is a **bool** (boolean, which is strictly `True` or `False` with capital first letters). Never wrap numbers in quotes if you plan to do math with them: `12 + 5` equals `17`, whereas `"12" + "5"` glues text into `"125"`. When translating an engineering fraction such as a resistor voltage divider $V_{\text{out}} = V_{\text{in}} \frac{R_2}{R_1 + R_2}$, always write explicit `*` for multiplication and wrap the denominator in parentheses: `v_in * (r2 / (r1 + r2))`. Finally, use a **comment** (`#`) to document physical units, and use an **f-string** (`f"Voltage: {v_out:.2f} V"`) with `print()` to display decimals rounded to two places.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (either zero-install in the [futurecoder.io code editor](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Copy this starter script into your Python editor. It runs right now without crashing, but prints `0.0` for `new_pos_m` and `v_sensor_pin` until you replace the two `TODO` lines:

```python
# Robot state variables (units noted in comments)
wheel_speed_m_s = 1.25       # float: forward speed in meters per second
dt_s = 0.05                  # float: time step duration in seconds
start_pos_m = 2.0            # float: starting position in meters
encoder_ticks = 400          # int: pulse count from wheel sensor
is_estop_active = False      # bool: emergency stop switch state

# Battery voltage divider values
v_battery = 12.0             # float: 12-volt battery pack
r1_ohms = 20000              # int: top resistor (20,000 ohms)
r2_ohms = 10000              # int: bottom resistor (10,000 ohms)

# TODO 1: Update new_pos_m to equal start_pos_m + (wheel_speed_m_s * dt_s),
#         and add 25 to encoder_ticks.
new_pos_m = 0.0
encoder_ticks = encoder_ticks

# TODO 2: Calculate v_sensor_pin = v_battery * (r2_ohms / (r1_ohms + r2_ohms))
#         Be sure to keep parentheses around (r1_ohms + r2_ohms)!
v_sensor_pin = 0.0

print(f"New Position: {new_pos_m:.4f} m | Encoder Ticks: {encoder_ticks}")
print(f"Battery: {v_battery:.1f} V -> Sensor Pin: {v_sensor_pin:.2f} V | E-Stop: {is_estop_active}")
```

### Expected Output
When both `TODO` sections are completed correctly, running the script prints:

```text
New Position: 2.0625 m | Encoder Ticks: 425
Battery: 12.0 V -> Sensor Pin: 4.00 V | E-Stop: False
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

For `TODO 1`, multiply `wheel_speed_m_s` by `dt_s` using `*` and add `start_pos_m` using `+`. To increase `encoder_ticks` by `25`, assign `encoder_ticks = encoder_ticks + 25`. For `TODO 2`, divide `r2_ohms` by the sum `(r1_ohms + r2_ohms)` and multiply by `v_battery`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

Check your parentheses on the voltage divider line:
- If you write `r2_ohms / r1_ohms + r2_ohms`, Python divides `10000 / 20000` (`0.5`) and then adds `10000`, giving `10000.5`!
- Wrap the sum in parentheses: `v_battery * (r2_ohms / (r1_ohms + r2_ohms))`.
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
wheel_speed_m_s = 1.25
dt_s = 0.05
start_pos_m = 2.0
encoder_ticks = 400
is_estop_active = False

v_battery = 12.0
r1_ohms = 20000
r2_ohms = 10000

new_pos_m = start_pos_m + (wheel_speed_m_s * dt_s)
encoder_ticks = encoder_ticks + 25
v_sensor_pin = v_battery * (r2_ohms / (r1_ohms + r2_ohms))

print(f"New Position: {new_pos_m:.4f} m | Encoder Ticks: {encoder_ticks}")
print(f"Battery: {v_battery:.1f} V -> Sensor Pin: {v_sensor_pin:.2f} V | E-Stop: {is_estop_active}")
```
</details>

---

## Common mistakes & troubleshooting
- **`TypeError: 'int' object is not callable`:** You wrote math with implicit multiplication like `2(3 + 4)` instead of `2 * (3 + 4)`. Python thinks `2(...)` is trying to call `2` as a function. Always write the `*` symbol.
- **`NameError: name 'true' is not defined`:** Booleans in Python must start with a capital letter: `True` and `False`, never `true` or `false`.
- **Using `^` for powers:** In Python, `3 ^ 2` is a bitwise XOR operation (which gives `1`), NOT $3^2 = 9$. Always use double asterisks `**` for exponents (`3 ** 2` gives `9`).
- **Missing `f` before quotes:** If `print("{v_sensor_pin:.2f}")` prints literal curly braces `{v_sensor_pin:.2f}` on screen, you forgot the letter `f` right before the opening quotation mark: `print(f"{v_sensor_pin:.2f}")`.

---

## Check yourself

1. **Tracing variable updates:** What number is printed by these three lines of Python?
   ```python
   count = 10
   count = count + 4
   print(count * 2)
   ```
   <details>
   <summary><strong>Answer</strong></summary>

   **`28`**. Line 1 stores `10` in `count`. Line 2 calculates `10 + 4` (`14`) and stores `14` back into `count`. Line 3 multiplies `14 * 2` and prints `28`.
   </details>

2. **Spotting the order-of-operations bug:** You want to calculate $\frac{10 + 20}{2 \times 3} = \frac{30}{6} = 5.0$, so you type `10 + 20 / 2 * 3`. What number does Python actually compute, and how do you fix it?
   <details>
   <summary><strong>Answer</strong></summary>

   Python computes **`40.0`** because it performs division and multiplication before addition (`20 / 2` is `10.0`, times `3` is `30.0`, plus `10` is `40.0`). Fix it by wrapping the numerator and denominator in parentheses: `(10 + 20) / (2 * 3)`, which evaluates to **`5.0`**.
   </details>

3. **Identifying data types:** Name the Python data type (`int`, `float`, `str`, or `bool`) of each value: `1023`, `"1023"`, `0.0`, and `False`.
   <details>
   <summary><strong>Answer</strong></summary>

   - `1023` is an **`int`** (whole number with no decimal point).
   - `"1023"` is a **`str`** (text wrapped in quotes).
   - `0.0` is a **`float`** (has a decimal point).
   - `False` is a **`bool`** (boolean true/false switch).
   </details>

4. **Exponent calculation:** What value does Python produce for `(2 ** 3) + (15 / 2)`?
   <details>
   <summary><strong>Answer</strong></summary>

   **`15.5`**. First `2 ** 3` computes $2^3 = 8$, then `15 / 2` computes `7.5` (a `float`), and `8 + 7.5` equals **`15.5`**.
   </details>

---

## Recap
- A **variable** stores a value in memory using `=`, where the right side is always evaluated before being stored into the name on the left.
- The four core types are **`int`** (whole numbers), **`float`** (decimals), **`str`** (text in quotes), and **`bool`** (`True`/`False`).
- Multi-term fractions require parentheses around `(numerator) / (denominator)` and explicit `*` for multiplication.

### You're ready to move on when...
- [ ] You can trace variable re-assignment like `x = x + 1` without confusion.
- [ ] You can distinguish `int`, `float`, `str`, and `bool` values at a glance.
- [ ] You completed the starter code in **Do it yourself** and verified the exact expected output.
- **Next lesson:** [Lesson P.2: Decisions (`if/else`), `for` Loops & Lists](P.2-decisions-loops-and-lists.md)
