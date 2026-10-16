---
lesson_id: P.1
title: "Variables and Fundamental Data Types"
ideas:
  - "Storing values in named variables"
  - "Fundamental data types (int, float, str, bool)"
typical_hours: "1.0-1.5"
slow_learner_hours: "2.0-3.0"
---

# Lesson P.1: Variables and Fundamental Data Types (`int`, `float`, `str`, `bool`)

## Goal
Store robot measurements such as battery voltage, encoder pulse counts, and safety status flags in named Python variables, and distinguish the four fundamental data types (`int`, `float`, `str`, `bool`).

- **New ideas (max 2):**
  1. **Storing values in named variables**: Using the assignment operator (`=`) to evaluate the right-hand side first and store the result inside a named memory box on the left.
  2. **Fundamental data types (`int`, `float`, `str`, `bool`)**: Distinguishing whole numbers (`int`), decimal measurements (`float`), quoted text (`str`), and truth flags (`bool`).
- **New syntax:** `=`, `#` comments, `print()`, `f"{value:.2f}"` formatted strings (`f-strings`).
- **Estimated time (untimed guesses):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–3.0 hours

---

## Prerequisites
- Basic school arithmetic (whole numbers and decimals).
- No prior programming or electronics experience required.

```mermaid
flowchart LR
    Start["Start Here: Track P"] --> P1["P.1: Variables & Data Types"]
    P1 --> P2["P.2: Arithmetic & Order of Operations"]
```

---

## Learn

### Idea 1: Storing values in named variables
- **Primary resource:** [futurecoder.io — Chapters 1 and 3 (`The Shell` & `Variables`)](https://futurecoder.io/course/#toc) `[verify in-app]`
  - **What to complete:** Complete **Chapter 1 (`The Shell`)** and **Chapter 3 (`Variables`)** `[verify in-app]`.
  - **What to skip:** Skip Chapter 2 for a moment (covered in Idea 2 below) and skip Chapters 4–12.
  - **Key takeaway:** A **variable** is a named storage box in computer memory. In Python, the single equals sign `=` is the **assignment** action—not a math equation: Python calculates the value on the right side of `=` first, and copies that result into the variable name on the left (`count = count + 1` increases `count` by `1`).
  - **Alternative resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Functions`**, **`Variables`**, and **`Comments`** (skip **`Def`**).

### Idea 2: Fundamental data types (`int`, `float`, `str`, `bool`)
- **Primary resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Formatting Strings`**, **`Integers or int`**, and **`Float Basics`**.
  - **What to skip:** Skip **`Strings and Parameters`**, **`More on Strings`**, and **`Def`**.
  - **Key takeaway:** Computers treat whole numbers, decimal numbers, text, and true/false switches differently: **`int`** holds exact whole numbers (`400`, `-5`), **`float`** holds numbers with a decimal point (`12.0`, `0.05`), **`str`** holds text inside quotation marks (`"READY"`), and **`bool`** holds `True` or `False` (capitalized).
  - **Alternative resource:** [futurecoder.io — Chapter 2 (`String Basics`) and Chapter 7 (`f-strings`)](https://futurecoder.io/course/#toc) `[verify in-app]` — Complete **Chapter 2 (`String Basics`)** and the **`f-strings`** page in **Chapter 7 (`A Bit More About Strings`)** `[verify in-app]`.

### Bridge Notes
In mechatronics, every value inside your **program** (an ordered list of instructions executed top-to-bottom) represents a physical measurement or hardware state. When you write `battery_voltage = 12.0`, the **assignment** operator (`=`) creates a variable named `battery_voltage` holding the **float** (floating-point decimal number) `12.0`. Because Python always evaluates the right-hand side of `=` before storing it into the name on the left, writing `encoder_ticks = encoder_ticks + 25` reads the current **int** (integer whole number) stored in `encoder_ticks`, adds `25`, and saves the updated total back into `encoder_ticks`.

Text wrapped in quotes like `"ARMED"` is a **str** (string), whereas a safety switch state like `is_estop_active = False` is a **bool** (boolean, written strictly `True` or `False` with capital first letters). Never put quotation marks around numbers you plan to use in calculations: `12 + 5` adds two integers to give `17`, whereas `"12" + "5"` glues two strings together into `"125"`. Finally, use a **comment** (`#`) to write human-readable unit reminders that Python ignores, and use an **f-string** (`f"Voltage: {battery_voltage:.2f} V"`) inside `print()` to display values cleanly with their units.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Copy this starter script into your Python editor. It runs right now without crashing, but prints the initial un-updated values until you complete `TODO 1` and `TODO 2`:

```python
# Robot state variables (units documented in comments)
battery_voltage = 12.60      # float: battery voltage in Volts
encoder_ticks = 400          # int: wheel sensor pulse count
robot_mode = "STANDBY"       # str: current status label
is_estop_active = False      # bool: emergency stop switch state

# TODO 1: Update encoder_ticks by adding 25 to its current value,
#         and update battery_voltage by subtracting 0.45 from its current value.
encoder_ticks = encoder_ticks
battery_voltage = battery_voltage

# TODO 2: Change robot_mode to "ACTIVE" (a string) and keep is_estop_active as False.
robot_mode = robot_mode

print(f"Mode: {robot_mode} | E-Stop: {is_estop_active}")
print(f"Encoder Ticks: {encoder_ticks} | Battery: {battery_voltage:.2f} V")
```

### Expected Output
When both `TODO` sections are completed correctly, running the script prints:

```text
Mode: ACTIVE | E-Stop: False
Encoder Ticks: 425 | Battery: 12.15 V
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, remember that `variable = variable + change` reads the old value on the right and stores the new value on the left. In `TODO 2`, wrap `"ACTIVE"` in double quotes so Python knows it is a string (`str`).
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

Replace the three `TODO` assignment lines with:
```python
encoder_ticks = encoder_ticks + 25
battery_voltage = battery_voltage - 0.45
robot_mode = "ACTIVE"
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
battery_voltage = 12.60
encoder_ticks = 400
robot_mode = "STANDBY"
is_estop_active = False

encoder_ticks = encoder_ticks + 25
battery_voltage = battery_voltage - 0.45
robot_mode = "ACTIVE"

print(f"Mode: {robot_mode} | E-Stop: {is_estop_active}")
print(f"Encoder Ticks: {encoder_ticks} | Battery: {battery_voltage:.2f} V")
```
</details>

---

## Common mistakes & troubleshooting
- **`NameError: name 'false' is not defined`:** Booleans in Python must begin with a capital letter: `True` and `False`, never `true` or `false`.
- **`NameError: name 'ACTIVE' is not defined`:** Text strings must be wrapped in quotes (`"ACTIVE"`). Without quotes, Python looks for a variable named `ACTIVE`.
- **Missing `f` before quotes:** If `print("{battery_voltage:.2f}")` prints literal curly braces `{battery_voltage:.2f}`, put the letter `f` immediately before the opening quote: `print(f"{battery_voltage:.2f}")`.

---

## Check yourself

1. **Tracing variable reassignment:** What number is printed by these three lines of Python?
   ```python
   ticks = 100
   ticks = ticks + 50
   print(ticks)
   ```
   <details>
   <summary><strong>Answer</strong></summary>

   **`150`**. Line 1 stores `100` in `ticks`. Line 2 evaluates `100 + 50` (`150`) and stores `150` back into `ticks`.
   </details>

2. **Identifying data types:** Name the Python data type (`int`, `float`, `str`, or `bool`) of each value: `1023`, `"1023"`, `0.0`, and `True`.
   <details>
   <summary><strong>Answer</strong></summary>

   - `1023` is an **`int`** (whole number with no decimal point).
   - `"1023"` is a **`str`** (text wrapped in quotes).
   - `0.0` is a **`float`** (has a decimal point).
   - `True` is a **`bool`** (boolean truth value).
   </details>

3. **Numbers vs. strings:** What is the difference between `print(10 + 5)` and `print("10" + "5")`?
   <details>
   <summary><strong>Answer</strong></summary>

   `print(10 + 5)` adds two integers and prints **`15`**, whereas `print("10" + "5")` joins two text strings side-by-side and prints **`105`**.
   </details>

---

## Recap
- A **variable** stores a value in memory using `=`, where the right-hand side is evaluated first and stored into the name on the left.
- The four fundamental types are **`int`** (whole numbers), **`float`** (decimals), **`str`** (quoted text), and **`bool`** (`True`/`False`).

### You're ready to move on when...
- [ ] You can trace variable updates like `x = x + 10` without hesitation.
- [ ] You can tell `int`, `float`, `str`, and `bool` apart at a glance.
- [ ] Your **Do it yourself** script prints the exact two expected lines.
- **Next lesson:** [Lesson P.2: Computer Arithmetic & Order of Operations](P.2-arithmetic-and-order-of-operations.md)
