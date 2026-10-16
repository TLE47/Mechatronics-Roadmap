---
lesson_id: P.3
title: "Conditional Decisions (if/elif/else) and Command Clamping"
ideas:
  - "Conditional branching (if/elif/else)"
  - "Clamping actuator commands within safe limits"
typical_hours: "1.5-2.0"
slow_learner_hours: "2.5-3.5"
---

# Lesson P.3: Conditional Decisions (`if/elif/else`) and Command Clamping

## Goal
Use comparison operators and `if / elif / else` statements to make safety decisions in code and clamp out-of-range motor commands into a safe hardware range (`[0, 255]`).

- **New ideas (max 2):**
  1. **Conditional branching (`if/elif/else`)**: Testing conditions that evaluate to `True` or `False` and running indented blocks of code only when a condition matches.
  2. **Clamping actuator commands within safe limits**: Using `if / elif` bounds checks so a calculated command never exceeds a hardware maximum or drops below a minimum.
- **New syntax:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `if`, `elif`, `else`, colon `:`, 4-space block indentation.
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

---

## Prerequisites
- [Lesson P.1: Variables and Fundamental Data Types](P.1-variables-and-data-types.md)
- [Lesson P.2: Computer Arithmetic and Order of Operations](P.2-arithmetic-and-order-of-operations.md)

```mermaid
flowchart LR
    P2["P.2: Arithmetic & Order of Operations"] --> P3["P.3: Decisions & Clamping"]
    P3 --> P4["P.4: Lists & For Loops"]
```

---

## Learn

### Idea 1: Conditional branching (`if/elif/else`)
- **Primary resource:** [futurecoder.io — Chapter 5 (`If Statements`)](https://futurecoder.io/course/#toc) `[verify in-app]`
  - **What to complete:** Complete **Chapter 5 (`If Statements`)** `[verify in-app]`.
  - **What to skip:** Skip Chapter 4 (`For Loops`) and Chapter 6 (`Lists`) for now—we cover both in Lesson P.4 next.
  - **Key takeaway:** An `if` statement tests a **comparison** (`<`, `<=`, `>`, `>=`, `==` equal to, `!=` not equal to) that evaluates to `True` or `False`. When `True`, Python runs the **indented** lines (shifted right by 4 spaces) underneath the colon `:`; otherwise it checks any `elif` ("else if") branches or falls back to `else:`.
  - **Alternative resource:** [Harvard CS50P Lecture 1 Notes](https://cs50.harvard.edu/python/2022/notes/1/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Conditionals`**, **`if Statements`**, **`Control Flow, elif, and else`**, **`or`**, and **`and`** (skip **`Modulo`** and **`match`**).

### Idea 2: Clamping actuator commands within safe limits
- **Primary resource:** [Harvard CS50P Lecture 1 Notes](https://cs50.harvard.edu/python/2022/notes/1/) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Review **`Control Flow, elif, and else`** and trace how mutually exclusive `<` and `>` checks bound a number.
  - **What to skip:** Skip **`match`** statements.
  - **Key takeaway:** Real hardware outputs only accept a finite range of numbers—for example, a standard motor command register only accepts whole numbers from `0` to `255`. **Clamping** (also called **saturation**) uses `if cmd > 255: cmd = 255` and `elif cmd < 0: cmd = 0` so out-of-bounds math can never wrap around or cause hardware faults.

### Bridge Notes
Look closely at the difference between a single equals sign `=` and a double equals sign `==`:
- **`x = 255` (Assignment):** Stores the number `255` into variable `x`.
- **`x == 255` (Comparison):** Asks the question *"Is `x` currently equal to `255`?"* and produces `True` or `False`.

In Python, every `if`, `elif`, and `else` header ends with a colon `:`, and the lines that belong inside that decision branch must be **indented** by 4 spaces.

Why is **clamping** the most common `if/elif` pattern in robotics? Suppose your controller calculates a motor command of `310` when trying to catch a falling robot arm, or `-40` when braking. If you pass `310` or `-40` directly to a hardware output register that only holds `0` to `255`, the register overflows (`310` wraps around to `54`—suddenly cutting motor power when you needed maximum effort!). Clamping the command with `if motor_cmd > 255: motor_cmd = 255` and `elif motor_cmd < 0: motor_cmd = 0` guarantees safe behavior at the physical limits.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `TODO 1` and `TODO 2` to clamp `raw_cmd_high` (`310`) and `raw_cmd_low` (`-45`) into `[0, 255]`, and force the final output to `0` when `is_estop_pressed` is `True`:

```python
raw_cmd_high = 310
raw_cmd_low = -45
raw_cmd_normal = 180
is_estop_pressed = True

# TODO 1: Clamp raw_cmd_high into [0, 255] using if / elif:
#         if raw_cmd_high > 255, set clamped_high = 255;
#         elif raw_cmd_high < 0, set clamped_high = 0; else set clamped_high = raw_cmd_high.
clamped_high = raw_cmd_high

# Clamp raw_cmd_low into [0, 255] the same way:
clamped_low = raw_cmd_low

# TODO 2: If is_estop_pressed is True, set safe_output = 0;
#         else set safe_output = raw_cmd_normal.
safe_output = raw_cmd_normal

print(f"310 clamped -> {clamped_high} | -45 clamped -> {clamped_low}")
print(f"E-Stop={is_estop_pressed} -> Safe Output: {safe_output}")
```

### Expected Output
When `TODO 1` and `TODO 2` are completed, running the script prints:

```text
310 clamped -> 255 | -45 clamped -> 0
E-Stop=True -> Safe Output: 0
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

Check `if raw_cmd_high > 255:` first, then `elif raw_cmd_high < 0:`, and `else:`. Remember the colon `:` at the end of each `if`/`elif`/`else` line and 4 spaces of indentation on the line below it.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
if raw_cmd_high > 255:
    clamped_high = 255
elif raw_cmd_high < 0:
    clamped_high = 0
else:
    clamped_high = raw_cmd_high
```
Apply the same pattern to `raw_cmd_low` -> `clamped_low`, and use `if is_estop_pressed:` to set `safe_output = 0`.
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
raw_cmd_high = 310
raw_cmd_low = -45
raw_cmd_normal = 180
is_estop_pressed = True

if raw_cmd_high > 255:
    clamped_high = 255
elif raw_cmd_high < 0:
    clamped_high = 0
else:
    clamped_high = raw_cmd_high

if raw_cmd_low > 255:
    clamped_low = 255
elif raw_cmd_low < 0:
    clamped_low = 0
else:
    clamped_low = raw_cmd_low

if is_estop_pressed:
    safe_output = 0
else:
    safe_output = raw_cmd_normal

print(f"310 clamped -> {clamped_high} | -45 clamped -> {clamped_low}")
print(f"E-Stop={is_estop_pressed} -> Safe Output: {safe_output}")
```
</details>

---

## Common mistakes & troubleshooting
- **`SyntaxError: invalid syntax` on `if x = 5:`:** A single `=` is assignment; comparisons inside `if` require a double equals `if x == 5:`.
- **`IndentationError: expected an indented block`:** Every line controlled by `if`, `elif`, or `else` must be indented by 4 spaces (never mix tabs and spaces).
- **`SyntaxError: expected ':'`:** Every `if`, `elif`, and `else` header line must end with a colon `:`.

---

## Check yourself

1. **Tracing `if / elif / else`:** If `temp_c = 85.0`, what does this code print?
   ```python
   if temp_c >= 80.0:
       print("SHUTDOWN")
   elif temp_c >= 60.0:
       print("WARNING")
   else:
       print("NORMAL")
   ```
   <details>
   <summary><strong>Answer</strong></summary>

   **`SHUTDOWN`** only. Because `85.0 >= 80.0` is `True`, Python runs the first branch and skips the `elif` and `else` branches completely.
   </details>

2. **Boundary check (`>` vs. `>=`):** Does clamping into `[0, 255]` give a different result if you write `if cmd >= 255: cmd = 255` instead of `if cmd > 255: cmd = 255` when `cmd` is `255`?
   <details>
   <summary><strong>Answer</strong></summary>

   **No**—when `cmd` is `255`, both leave `cmd` equal to `255`.
   </details>

3. **`==` vs. `!=`:** What boolean value (`True` or `False`) does `1023 != 0` evaluate to?
   <details>
   <summary><strong>Answer</strong></summary>

   **`True`**, because `!=` means "is not equal to", and `1023` is not equal to `0`.
   </details>

---

## Recap
- Comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) produce `True` or `False` for `if / elif / else` decision blocks.
- **Clamping** bounds commands into a safe hardware interval like `[0, 255]` before they reach actuators.

### You're ready to move on when...
- [ ] You never confuse `=` (assignment) with `==` (equality test).
- [ ] You can write an `if / elif / else` clamping block from memory.
- [ ] Your **Do it yourself** script prints `310 clamped -> 255 | -45 clamped -> 0` and `Safe Output: 0`.
- **Next lesson:** [Lesson P.4: Ordered Lists & Repeating Actions with `for` Loops](P.4-lists-and-for-loops.md)
