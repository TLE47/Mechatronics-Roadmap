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

<!-- run-callout:start -->
> **Step 1 of 10 · Python and the maths a robot needs**
>
> **Run this in the workbench.** [Open MechaLab with `P.3` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.3) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Use comparison operators and `if / elif / else` statements to make safety decisions in code and clamp out-of-range motor commands into a safe hardware range (`[0, 255]`).

- **New ideas (max 2):**
  1. **Conditional branching (`if/elif/else`)**: Testing conditions that evaluate to `True` or `False` and running indented blocks of code only when a condition matches.
  2. **Clamping actuator commands within safe limits**: Using `if / elif` bounds checks so a calculated command never exceeds a hardware maximum or drops below a minimum.
- **New syntax:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `if`, `elif`, `else`, colon `:`, 4-space block indentation.
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.5–2.0 hours | Slow-learner: 2.5–3.5 hours

### Requirements (what counts as complete)

Your finished program must satisfy **all** of these conditions:

- [ ] **Runs:** every TODO is completed and the script finishes without a Python error.
- [ ] **Types and given values:** keep the names, types, and units the starter gives; leave any value a TODO does not name unchanged.
- [ ] **Required end state:** the grader checks clamped_high (255), clamped_low (0); safe_output (0 when E-Stop active).
- [ ] **Exact strings:** any label, name, or unit in the checks above must match its exact spelling.
- [ ] **Output:** the printed output matches the Expected Output block.
- [ ] **Alternate inputs:** the grader also covers in-range commands and an E-Stop that has been released; it changes the inputs, so a hardcoded result fails.

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

<!-- figure: decision-fork | One comparison, two roads; clamping is the branch that keeps the command inside the limit. -->


### Idea 1: Conditional branching (`if/elif/else`)
- **Primary resource:** [futurecoder.io — “If Statements”](https://futurecoder.io/course/#toc) `[verify in-app]`
  - **What to complete:** Complete **If Statements** `[verify in-app]`.
  - **What to skip:** Skip **For Loops** and **Lists** for now—we cover both in Lesson P.4 next.
  - **Key takeaway:** An `if` statement tests a **comparison** (`<`, `<=`, `>`, `>=`, `==` equal to, `!=` not equal to) that evaluates to `True` or `False`. When `True`, Python runs the **indented** lines (shifted right by 4 spaces) underneath the colon `:`; otherwise it checks any `elif` ("else if") branches or falls back to `else:`.
  - **Alternative resource:** [Harvard CS50P Lecture 1 Notes](https://cs50.harvard.edu/python/2022/notes/1/) `[HTTP 200 — Verified by scripts/check_links.py]` — Read exact headings **`Conditionals`**, **`if Statements`**, **`Control Flow, elif, and else`**, **`or`**, and **`and`** (skip **`Modulo`** and **`match`**).

### Idea 2: Clamping actuator commands within safe limits
- **Primary resource:** [Harvard CS50P Lecture 1 Notes](https://cs50.harvard.edu/python/2022/notes/1/) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Review **`Control Flow, elif, and else`** and trace how mutually exclusive `<` and `>` checks bound a number.
  - **What to skip:** Skip **`match`** statements.
  - **Key takeaway:** Real hardware outputs only accept a finite range of numbers—for example, a standard motor command register only accepts whole numbers from `0` to `255`. **Clamping** (also called **saturation**) uses `if cmd > 255: cmd = 255` and `elif cmd < 0: cmd = 0` so out-of-bounds math can never wrap around or cause hardware faults.

#### Micro focus: comparisons answer a question
<a id="micro-comparisons"></a>
A comparison uses `==`, never `=` — one equals sign stores a value, two equals signs ask whether two values are equal. Every comparison (`==`, `!=`, `<`, `<=`, `>`, `>=`) produces `True` or `False`, and an `if` runs the indented lines only when the comparison is `True`. An `elif` is checked only after the tests above it failed, and `else` runs when none of them matched.

#### Micro focus: clamping a command
<a id="micro-clamping"></a>
Clamping keeps a command inside `[0, 255]`, the range a standard motor register can hold. Check the ceiling first with `if cmd > 255: cmd = 255`, then the floor with `elif cmd < 0: cmd = 0`; anything already inside the range passes through untouched. Clamp the computed command before it reaches the output, because the register cannot store a larger number safely.

#### Micro focus: combining questions
<a id="micro-logic"></a>
`and` is True only when both sides are True, `or` is True when at least one side is, and `not` flips a boolean. Use them to write one safe condition instead of nested ifs: `if temp > 80 and fan_ok:` asks both questions before its body runs.

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

**`clamped_high` and `clamped_low` are two different outputs, not two names for one value.** Both use the same `[0, 255]` limits, but each is computed from a different raw command:
1. `raw_cmd_high` — hardcoded `310`, a command above the upper limit; only `clamped_high` reads it.
1. `raw_cmd_low` — hardcoded `-45`, a separate command below the lower limit; only `clamped_low` reads it.
1. `clamped_high` — starts as a copy of `raw_cmd_high`; `TODO 1` replaces it with `raw_cmd_high` clamped into `[0, 255]`, giving `255` here. It does not read `raw_cmd_low`.
1. `clamped_low` — starts as a copy of `raw_cmd_low`; `TODO 1` replaces it with `raw_cmd_low` clamped into `[0, 255]`, giving `0` here. It does not reuse `clamped_high`.
1. `raw_cmd_normal` — hardcoded `180`, an in-range command; it feeds `safe_output` when the E-stop is released.
1. `is_estop_pressed` — hardcoded `True`, the E-stop input; it decides whether `safe_output` is forced to `0`.
1. `safe_output` — starts as a copy of `raw_cmd_normal`; `TODO 2` sets it to `0` while `is_estop_pressed` is `True`. Otherwise it stays `180`.

Neither name is a limit itself: `0` and `255` are the limits, and each name is a command value after those limits are applied. The two clamp names therefore hold different values at the end: `clamped_high == 255` and `clamped_low == 0`.

**What each name means** (read this beside the code):

1. **Inputs** — the names set before the TODOs; the starter's inline comments give each one's role and unit.
1. **Results** — the names each TODO asks you to update or return; the TODO prompt names the result it wants.
1. **Given values** — keep every value that a TODO does not name unchanged.

```python
raw_cmd_high = 310  # count, 0-255
raw_cmd_low = -45  # count, 0-255
raw_cmd_normal = 180  # count, 0-255
is_estop_pressed = True

# TODO 1: Set clamped_high and clamped_low to their input commands held inside the allowed 0-255 range.
#         Clamp both inputs independently to the inclusive limits 0 and 255; do not type the final values.
clamped_high = raw_cmd_high  # TODO 1: clamp this input only

# Clamp raw_cmd_low into [0, 255] the same way:
clamped_low = raw_cmd_low    # TODO 1: clamp this separate input independently

# TODO 2: Set safe_output to the safe output for this E-stop state.
#         Compute it from the existing values; do not type the final answer from Expected Output.
safe_output = raw_cmd_normal

print(f"310 clamped -> {clamped_high} | -45 clamped -> {clamped_low}")
print(f"E-Stop={is_estop_pressed} -> Safe Output: {safe_output}")
```

### Expected Output
When `TODO 1` and `TODO 2` are completed, running the script prints (the first number is `clamped_high`, the second is `clamped_low`):

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
Apply the same pattern to `raw_cmd_low` -> `clamped_low` — a separate output, not a reuse of `clamped_high` — and use `if is_estop_pressed:` to set `safe_output = 0`.
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
raw_cmd_high = 310
raw_cmd_low = -45
raw_cmd_normal = 180
is_estop_pressed = True

# clamped_high comes only from raw_cmd_high
if raw_cmd_high > 255:
    clamped_high = 255
elif raw_cmd_high < 0:
    clamped_high = 0
else:
    clamped_high = raw_cmd_high

# clamped_low is separate; it comes only from raw_cmd_low
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
- **Treating `clamped_high` and `clamped_low` as one clamp's upper and lower bounds:** They are two separate outputs. `clamped_high` reads only `raw_cmd_high`; `clamped_low` reads only `raw_cmd_low`. Changing one raw value changes only its own output.

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

<!-- next-step:start -->
👉 **Next:** [Step 1 · Python and the maths a robot needs — Lesson P.4: Ordered Lists and Repeating Actions with for Loops](P.4-lists-and-for-loops.md)
<!-- next-step:end -->
