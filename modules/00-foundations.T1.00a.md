---
id: 00-foundations.T1.00a
title: "Running Python, Variables, Loops, Functions & Tracebacks"
track: "00"
tier: 1
prereqs: []
new_concepts:
  - python_variables_and_types
  - for_while_loops_and_functions
  - traceback_error_reading
uses: []
est_hours: 3.0
---

## 0. Skip Test
Pass without reading if you can predict the output of this loop and fix the bug in `def scale(x): return k * x` when `k` is undefined:
```python
total = 0
for i in range(4):
    total += i * 2
print(total)  # Must predict: 12 (0 + 2 + 4 + 6)
```

## 1. Why This Matters
Every mechatronics simulation and telemetry parser in this roadmap runs as a Python script before we touch microcontroller C++ or hardware. If you have only used spreadsheets or calculators, you first need to know how to run a `.py` file, store sensor numbers in variables, repeat a physics update inside a `while` or `for` loop, wrap formulas into reusable functions, and read a Python error traceback without panicking.

## 2. Mental Model
Think of a Python script as a digital lab checklist executed top-to-bottom:
1. **Variables (`x = 0.0`):** Labeled storage boxes in memory holding an integer (`int`, like `steps = 10`), a decimal floating-point number (`float`, like `voltage = 3.3`), or a boolean (`bool`, `True`/`False`). Note that `=` means *assign the value on the right into the box on the left*, so `x = x + 1` means "take the old value of `x`, add `1`, and store the result back in `x`."
2. **Loops (`while` and `for`):** Instead of copying a formula 1,000 times, a `while t < 1.0:` loop repeats the indented block of lines until the condition becomes `False`.
3. **Functions (`def f(x):`):** Named machines that take input arguments, compute a result, and hand it back via `return`.
4. **Tracebacks:** When Python stops with an error, read the **very last line first** (e.g., `ZeroDivisionError: division by zero` or `NameError: name 'vel' is not defined`) and look at the line number right above it.

## 3. Worked Example
Suppose a robot slider starts at position $x_0 = 0.0\text{ m}$ and moves at constant speed $v = 0.5\text{ m/s}$ with time step $\Delta t = 0.25\text{ s}$. How many steps does it take to reach $1.0\text{ m}$?
- **Step 1:** Each step advances position by $\Delta x = v \cdot \Delta t = 0.5 \times 0.25 = 0.125\text{ m}$.
- **Step 2:** Starting from $0.0\text{ m}$, adding $0.125\text{ m}$ per iteration reaches $1.0\text{ m}$ after $1.0 / 0.125 = 8$ loop iterations.
- **Step 3:** If someone accidentally divides by a time step of `dt = 0.0`, Python raises `ZeroDivisionError`, which we can catch or fix by checking `dt > 0`.

## 4. Code
```python
import math

def step_position(pos_m: float, vel_m_s: float, dt_s: float) -> float:
    return pos_m + vel_m_s * dt_s

pos_m = 0.0
vel_m_s = 0.5
dt_s = 0.25
steps = 0

while pos_m < 1.0 - 1e-9:
    pos_m = step_position(pos_m, vel_m_s, dt_s)
    steps += 1

assert steps == 8
assert math.isclose(pos_m, 1.0, rel_tol=1e-9)

caught_error = ""
try:
    bad_ratio = 1.0 / 0.0
except ZeroDivisionError as exc:
    caught_error = type(exc).__name__

assert caught_error == "ZeroDivisionError"
print(f"steps={steps}, pos_m={pos_m:.3f} m, caught={caught_error}")
```
Expected output:
```text
steps=8, pos_m=1.000 m, caught=ZeroDivisionError
```

## 5. Exercise
Write a function `battery_voltage_after_steps(v_start, drop_per_step, n_steps)` that uses a `for` loop to subtract `drop_per_step` from `v_start` `n_steps` times, and verify that starting at `12.0` V with a drop of `0.15` V over `10` steps returns `10.5` V.
- **Check:** `assert math.isclose(battery_voltage_after_steps(12.0, 0.15, 10), 10.5, rel_tol=1e-9)`

## 6. Gate Test
1. What is the value of `x` after running `x = 5; x = x + 3; x = x * 2`? (Answer: `16`)
2. If Python prints `NameError: name 'kp_gain' is not defined` on line 14, what is the mistake? (Answer: `kp_gain` was used before being assigned a value, or its name was misspelled.)

## 7. Resources
- **Official Python Tutorial (Sections 3–4):** Informal introduction to numbers, loops, and functions `[UNVERIFIED]`.
- **Stage 0 (`00-foundations/README.md`):** Links into the interactive Stage 0 physics playground once you finish Level -1 (`00a`–`00e`) `[VERIFIED 2026-10-15]`.
