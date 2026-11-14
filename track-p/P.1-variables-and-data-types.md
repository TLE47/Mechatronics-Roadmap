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

<!-- run-callout:start -->
> **Step 1 of 10 · Python and the maths a robot needs**
>
> **Run this in the workbench.** [Open MechaLab with `P.1` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.1) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

**Step 1 of the Python on-ramp — start here.** The callout above opens this entry directly; the roadmap shows the same on-ramp above Level 0, with a count of the entries you have actually run and passed. Read on if you prefer to work in your own Python 3.

## Goal
Update three robot-state values in place: `encoder_ticks` must end 25 ticks above its starting value, `battery_level` must end 0.45 V below its starting value, and `robot_mode` must become the active mode string. Keep every type unchanged, leave `is_estop_active` alone, and compute both numeric updates from the variable's own previous value so they also work on unseen starting states.

- **New ideas (max 2):**
  1. **Storing values in named variables**: Using the assignment operator (`=`) to evaluate the right-hand side first and store the result inside a named memory box on the left.
  2. **Fundamental data types (`int`, `float`, `str`, `bool`)**: Distinguishing whole numbers (`int`), decimal measurements (`float`), quoted text (`str`), and truth flags (`bool`).
- **New syntax:** `=`, `#` comments, `print()`, `f"{value:.2f}"` formatted strings (`f-strings`).
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–3.0 hours

### Requirements (what counts as complete)

Your finished program must satisfy **all** of these conditions:

- [ ] The script runs without a Python error.
- [ ] `encoder_ticks` is still an `int`, and its final reading is `25` ticks above its starting value.
- [ ] `battery_level` is still a `float`, and its final reading is `0.45` V below its starting value.
- [ ] `robot_mode` is exactly the active mode string shown in Expected Output.
- [ ] `is_estop_active` is still `False` and still a `bool`.
- [ ] Both numeric updates use the variable's own previous value; typing a final number fails the grader's two other starting states.
- [ ] The two printed lines match Expected Output.

---

## Prerequisites
- Basic school arithmetic (whole numbers and decimals).
- No prior programming or electronics experience required.

```mermaid
flowchart LR
    Start["Start Here: Step 1"] --> P1["P.1: Variables & Data Types"]
    P1 --> P2["P.2: Arithmetic & Order of Operations"]
```

---

## Learn

<!-- figure: value-types | Every value in this lesson is one of these four boxes; most first bugs are a value in the wrong box. -->


### Idea 1: Storing values in named variables
- **Primary resource:** [futurecoder.io — “The Shell” and “Variables”](https://futurecoder.io/course/#toc) `[verify in-app]`
  - **What to complete:** Complete **The Shell** and **Variables** `[verify in-app]`.
  - **What to skip:** Skip **String Basics** for a moment (covered in Idea 2 below); leave **If Statements**, **For Loops**, **Lists**, and **Functions** for later lessons.
  - **Key takeaway:** A **variable** is a named storage box in computer memory. In Python, the single equals sign `=` is the **assignment** action—not a math equation: Python calculates the value on the right side of `=` first, and copies that result into the variable name on the left (`count = count + 1` increases `count` by `1`).
  - **Alternative resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Variables`** and **`Comments`**.

### Idea 2: Fundamental data types (`int`, `float`, `str`, `bool`)
- **Primary resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Formatting Strings`**, **`Integers or int`**, and **`Float Basics`**.
  - **What to skip:** Skip **`Strings and Parameters`**, **`More on Strings`**, and **`Def`**.
  - **Key takeaway:** Computers treat whole numbers, decimal numbers, text, and true/false switches differently: **`int`** holds exact whole numbers (`400`, `-5`), **`float`** holds numbers with a decimal point (`12.0`, `0.05`), **`str`** holds text inside quotation marks (`"READY"`), and **`bool`** holds `True` or `False` (capitalized).
  - **Alternative resource:** [futurecoder.io — “String Basics” and “A Bit More About Strings”](https://futurecoder.io/course/#toc) `[verify in-app]` — Complete **String Basics** and the **`f-strings`** page under **A Bit More About Strings** `[verify in-app]`.

#### Micro focus: variables
<a id="micro-variables"></a>
A **variable** is a named storage box. `plant_height = 12.60` stores the float 12.60 under that name. The single equals sign `=` is the assignment action, not a claim that the two sides are equal.

#### Micro focus: assignment order
<a id="micro-assignment-order"></a>
Python evaluates the right-hand side of `=` first, then stores the result. So `sticker_count = sticker_count + 25` reads the old value, adds 25, and writes the new value back.

#### Micro focus: int and float
<a id="micro-int-float"></a>
An **`int`** is a whole number such as `400`; a **`float`** is a decimal number such as `12.60`. Division with `/` produces a float even when the answer is whole: `8 / 2` gives `4.0`, not `4`.

#### Micro focus: strings
<a id="micro-strings"></a>
A **`str`** is text wrapped in quotes. `"sunny"` is text, not the weather itself. Joining two strings with `+` concatenates them: `"12" + "5"` produces `"125"`.

#### Micro focus: booleans
<a id="micro-booleans"></a>
A **`bool`** is `True` or `False`, with a capital first letter. A comparison produces a bool: `12.15 > 10` is `True`. Write `False`, never `false`.

#### Micro focus: mixed types and TypeError
<a id="micro-mixed-types"></a>
Python will not silently mix text and numbers. `"12" + 5` raises `TypeError`; convert one side first, for example `int("12") + 5`, which gives `17`. Numbers of different types can mix: `400 + 2.5` gives `402.5`.

#### Micro focus: f-strings
<a id="micro-f-strings"></a>
An **f-string** puts an `f` before the opening quote and evaluates names inside braces: `f"Plant: {plant_height:.2f} cm"`. The `.2f` format shows two digits after the decimal point.

### Bridge Notes
In mechatronics, every value inside your **program** (an ordered list of instructions executed top-to-bottom) represents a physical measurement or hardware state. When you write `battery_level = 12.60`, the **assignment** operator (`=`) creates a variable named `battery_level` holding the **float** (floating-point decimal number) `12.60`. Because Python always evaluates the right-hand side of `=` before storing it into the name on the left, writing `wheel_ticks = wheel_ticks + 25` reads the stored **int** (integer whole number) in `wheel_ticks`, adds `25`, and saves the updated total back into `wheel_ticks`.

Text wrapped in quotes like `"ARMED"` is a **str** (string), whereas a safety switch state like `is_estop_active = False` is a **bool** (boolean, written strictly `True` or `False` with capital first letters). Never put quotation marks around numbers you plan to use in calculations: `12 + 5` adds two integers to give `17`, whereas `"12" + "5"` glues two strings together into `"125"`. Finally, use a **comment** (`#`) to write human-readable unit reminders that Python ignores, and use an **f-string** (`f"Battery: {battery_level:.2f}"`) inside `print()` to display values cleanly.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Copy this starter script into your Python editor. It runs right now without crashing, but prints the initial un-updated values until you complete `TODO 1` and `TODO 2`:

**What each name means** (read this beside the code):
1. `battery_level` — the battery reading, starting at `12.60` V (a float). `TODO 1` updates it for a `0.45` V drop.
1. `encoder_ticks` — the wheel pulse count, starting at `400` pulses (an int). `TODO 1` updates it for a `25`-tick advance.
1. `robot_mode` — the operating label, starting at `"STANDBY"` (a string). `TODO 2` changes it to the active state.
1. `is_estop_active` — the emergency-stop switch state, starting `False` (a bool); it must stay `False`.
1. Both `print` lines read the four names after the TODOs; they do not create new values.

```python
# Robot state variables (units documented in comments)
battery_level = 12.60        # float, V: battery reading
encoder_ticks = 400          # int: wheel sensor pulse count
robot_mode = "STANDBY"       # str: active status label
is_estop_active = False      # bool: emergency stop switch state

# TODO 1: Update both numeric readings for this one event.
#         encoder_ticks ends 25 ticks higher than it started.
#         battery_level ends 0.45 V lower than it started.
#         Use each variable's own old value, not a typed-in final number.
encoder_ticks = encoder_ticks
battery_level = battery_level

# TODO 2: Change robot_mode to the active mode string.
#         The exact spelling is in Expected Output.
#         Leave is_estop_active unchanged.
robot_mode = robot_mode

print(f"Mode: {robot_mode} | E-Stop: {is_estop_active}")
print(f"Encoder Ticks: {encoder_ticks} | Battery: {battery_level:.2f} V")
```

### Expected Output
When both `TODO` sections are completed correctly, running the script prints:

```text
Mode: ACTIVE | E-Stop: False
Encoder Ticks: 425 | Battery: 12.15 V
```

### Test more than one case
The graded check does not stop at the starter's numbers. It re-runs your two update lines with different starting states, so a hardcoded final number is caught. The alternate starting states stay in the hidden check; solve each update from the variable's old value, not from the first row.

To try another case yourself, change the two starter assignments at the top (not the `TODO` lines) and re-run. Your `TODO` lines must keep reading the old value on the right, which is what makes them work on every run.

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
battery_level = battery_level - 0.45
robot_mode = "ACTIVE"
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
battery_level = 12.60
encoder_ticks = 400
robot_mode = "STANDBY"
is_estop_active = False

encoder_ticks = encoder_ticks + 25
battery_level = battery_level - 0.45
robot_mode = "ACTIVE"

print(f"Mode: {robot_mode} | E-Stop: {is_estop_active}")
print(f"Encoder Ticks: {encoder_ticks} | Battery: {battery_level:.2f} V")
```
</details>

---

## Common mistakes & troubleshooting
- **`NameError: name 'false' is not defined`:** Booleans in Python must begin with a capital letter: `True` and `False`, never `true` or `false`.
- **`NameError: name 'ACTIVE' is not defined`:** Text strings must be wrapped in quotes (`"ACTIVE"`). Without quotes, Python looks for a variable named `ACTIVE`.
- **Missing `f` before quotes:** If `print("{battery_level:.2f}")` prints literal curly braces `{battery_level:.2f}`, put the letter `f` immediately before the opening quote: `print(f"{battery_level:.2f}")`.

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

<!-- next-step:start -->
👉 **Next:** [Step 1 · Python and the maths a robot needs — Lesson P.2: Computer Arithmetic and Order of Operations](P.2-arithmetic-and-order-of-operations.md)
<!-- next-step:end -->
