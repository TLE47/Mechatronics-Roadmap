---
lesson_id: P.2
title: "Computer Arithmetic and Order of Operations"
ideas:
  - "Computer arithmetic operators"
  - "Parentheses and order of operations"
typical_hours: "1.0-1.5"
slow_learner_hours: "2.0-2.5"
---

# Lesson P.2: Computer Arithmetic and Order of Operations

## Goal
Translate multi-step physics and circuit formulas into bug-free Python arithmetic using explicit multiplication (`*`), division (`/`), exponents (`**`), and parentheses `()`.

- **New ideas (max 2):**
  1. **Computer arithmetic operators**: Performing addition (`+`), subtraction (`-`), multiplication (`*`), float division (`/`), integer floor division (`//`), and exponents (`**`).
  2. **Parentheses and order of operations**: Using parentheses `()` around numerators and denominators so multi-term engineering fractions evaluate in the exact intended order.
- **New syntax:** `+`, `-`, `*`, `/`, `//`, `**`, `()`.
- **Estimated time (untimed guesses):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–2.5 hours

---

## Prerequisites
- [Lesson P.1: Variables and Fundamental Data Types](P.1-variables-and-data-types.md)

```mermaid
flowchart LR
    P1["P.1: Variables & Data Types"] --> P2["P.2: Arithmetic & Order of Operations"]
    P2 --> P3["P.3: Decisions & Clamping"]
```

---

## Learn

### Idea 1: Computer arithmetic operators
- **Primary resource:** [Official Python 3 Tutorial — Section 3.1: Using Python as a Calculator](https://docs.python.org/3/tutorial/introduction.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`3.1. Using Python as a Calculator`** and **`3.1.1. Numbers`**.
  - **What to skip:** Skip **`3.1.2. Text`** and **`3.1.3. Lists`** (covered in Lesson P.4).
  - **Key takeaway:** In Python, multiplication always requires an explicit asterisk `*` (never write `2x` or `2(3)`), standard division `/` always produces a decimal `float` (`8 / 2` gives `4.0`), floor division `//` drops the fractional remainder (`1023 // 4` gives `255`), and powers use a double asterisk `**` (`3 ** 2` computes $3^2 = 9$).
  - **Alternative resource:** [Harvard CS50P Lecture 0 Notes](https://cs50.harvard.edu/python/2022/notes/0/) `[HTTP 200 — Verified by scripts/check_links.py]` — Review exact headings **`Integers or int`** and **`Float Basics`**.

### Idea 2: Parentheses and order of operations
- **Primary resource:** [MathsIsFun — Order of Operations (PEMDAS/BODMAS)](https://www.mathsisfun.com/operation-order-pemdas.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Order of Operations`** and **`How Do I Remember It All ... ?`**.
  - **What to skip:** Skip the bottom puzzle links once the four precedence levels are clear.
  - **Key takeaway:** Python evaluates **Parentheses `()`** first, then **Exponents `**`**, then **Multiplication `*` and Division `/` / `//`** (from left to right), and finally **Addition `+` and Subtraction `-`** (from left to right). Whenever a printed fraction has a horizontal bar with multiple terms on top or bottom, you must wrap the numerator and denominator in parentheses: `(top) / (bottom)`.
  - **Alternative resource:** [Official Python 3 Tutorial — Section 3.1.1: Numbers](https://docs.python.org/3/tutorial/introduction.html) `[HTTP 200 — Verified by scripts/check_links.py]` — Review the parentheses examples under **`3.1.1. Numbers`**.

### Bridge Notes
On paper, engineers write multiplication by placing letters side by side ($F = ma$) and write fractions with a horizontal bar:

$$
V_{\text{out}} = V_{\text{in}} \cdot \frac{R_2}{R_1 + R_2}
$$

When you type that formula on a single line of code, the horizontal fraction bar disappears! If you type `v_in * r2 / r1 + r2`, Python's **order of operations** performs `v_in * r2 / r1` first and then adds `r2` at the very end—producing a completely wrong voltage. Wrapping the denominator in **parentheses** (`v_in * (r2 / (r1 + r2))`) forces Python to add `r1 + r2` first, just like the horizontal bar on paper.

Similarly, when computing kinetic energy $E_k = \frac{1}{2} m v^2$ in Python, write `0.5 * mass_kg * (vel_m_s ** 2)` using `**` for the **exponent** (never `^`, which is a bitwise operator in Python). Whenever you are unsure which operation happens first, add parentheses `()`—extra parentheses never slow down your code and make your intent unmistakable.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `TODO 1`, `TODO 2`, and `TODO 3` to calculate a robot's updated position, a battery voltage-divider reading, and the kinetic energy of a moving cart:

```python
wheel_speed_m_s = 1.25
dt_s = 0.05
start_pos_m = 2.0

v_battery = 12.0
r1_ohms = 20000
r2_ohms = 10000

cart_mass_kg = 2.0
cart_vel_m_s = 3.0

# TODO 1: Compute new_pos_m = start_pos_m + (wheel_speed_m_s * dt_s)
new_pos_m = 0.0

# TODO 2: Compute v_sensor_pin = v_battery * (r2_ohms / (r1_ohms + r2_ohms))
#         Keep parentheses around (r1_ohms + r2_ohms)!
v_sensor_pin = 0.0

# TODO 3: Compute kinetic_energy_j = 0.5 * cart_mass_kg * (cart_vel_m_s ** 2)
kinetic_energy_j = 0.0

print(f"New Position: {new_pos_m:.4f} m")
print(f"Sensor Pin Voltage: {v_sensor_pin:.2f} V")
print(f"Kinetic Energy: {kinetic_energy_j:.2f} J")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
New Position: 2.0625 m
Sensor Pin Voltage: 4.00 V
Kinetic Energy: 9.00 J
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

Use `*` for multiplication, `/` for division, and `** 2` to square `cart_vel_m_s`. Make sure `r1_ohms + r2_ohms` is inside parentheses `(r1_ohms + r2_ohms)`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
new_pos_m = start_pos_m + (wheel_speed_m_s * dt_s)
v_sensor_pin = v_battery * (r2_ohms / (r1_ohms + r2_ohms))
kinetic_energy_j = 0.5 * cart_mass_kg * (cart_vel_m_s ** 2)
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
wheel_speed_m_s = 1.25
dt_s = 0.05
start_pos_m = 2.0

v_battery = 12.0
r1_ohms = 20000
r2_ohms = 10000

cart_mass_kg = 2.0
cart_vel_m_s = 3.0

new_pos_m = start_pos_m + (wheel_speed_m_s * dt_s)
v_sensor_pin = v_battery * (r2_ohms / (r1_ohms + r2_ohms))
kinetic_energy_j = 0.5 * cart_mass_kg * (cart_vel_m_s ** 2)

print(f"New Position: {new_pos_m:.4f} m")
print(f"Sensor Pin Voltage: {v_sensor_pin:.2f} V")
print(f"Kinetic Energy: {kinetic_energy_j:.2f} J")
```
</details>

---

## Common mistakes & troubleshooting
- **`TypeError: 'int' object is not callable`:** You wrote implicit multiplication like `2(3 + 4)` instead of `2 * (3 + 4)`. Always write `*` explicitly.
- **Using `^` instead of `**` for exponents:** In Python, `3 ^ 2` performs bitwise XOR (`1`), NOT $3^2 = 9$. Always write `3 ** 2`.
- **Missing denominator parentheses:** Writing `30 / 2 * 3` computes `(30 / 2) * 3 = 45.0` instead of `30 / (2 * 3) = 5.0`.

---

## Check yourself

1. **Order of operations bug:** You want to compute $\frac{10 + 20}{2 \times 3} = 5.0$, so you type `10 + 20 / 2 * 3`. What number does Python actually produce, and how do you fix it?
   <details>
   <summary><strong>Answer</strong></summary>

   Python computes **`40.0`** (`20 / 2` is `10.0`, times `3` is `30.0`, plus `10` is `40.0`). Fix it with parentheses: `(10 + 20) / (2 * 3)`, which gives **`5.0`**.
   </details>

2. **Exponents and division:** What value does `(2 ** 3) + (15 / 2)` produce?
   <details>
   <summary><strong>Answer</strong></summary>

   **`15.5`**. First `2 ** 3` is `8`, then `15 / 2` is `7.5`, and `8 + 7.5` equals **`15.5`**.
   </details>

3. **Float division `/` vs. floor division `//`:** What is the difference between `1023 / 4` and `1023 // 4` in Python?
   <details>
   <summary><strong>Answer</strong></summary>

   `1023 / 4` returns the exact decimal `float` **`255.75`**, whereas `1023 // 4` discards the decimal remainder and returns the whole `int` **`255`**.
   </details>

---

## Recap
- Python requires explicit `*` for multiplication, `/` for decimal division, `//` for whole-number floor division, and `**` for exponents.
- Always wrap multi-term numerators and denominators in parentheses: `(numerator) / (denominator)`.

### You're ready to move on when...
- [ ] You never write `^` for exponents or omit `*` in multiplication.
- [ ] You can translate any fraction with a multi-term denominator into parentheses-safe Python.
- [ ] Your **Do it yourself** script prints `2.0625 m`, `4.00 V`, and `9.00 J`.
- **Next lesson:** [Lesson P.3: Conditional Decisions (`if/elif/else`) & Command Clamping](P.3-decisions-and-clamping.md)
