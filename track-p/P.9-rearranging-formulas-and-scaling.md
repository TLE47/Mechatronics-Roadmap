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

<!-- run-callout:start -->
> **Step 1 of 10 · Python and the maths a robot needs**
>
> **Run this in the workbench.** [Open MechaLab with `P.9` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.9) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## Goal
Rearrange physics formulas to isolate any unknown variable on the left side of `=`, and linearly map 10-bit sensor counts (`0..1023`) into physical units (`0..5.0`) or 8-bit actuator commands (`0..255`).

- **New ideas (max 2):**
  1. **Rearranging three-variable physics formulas**: Doing the exact same opposite operation to both sides of an equation to solve for any unknown variable ($d = s \cdot t \leftrightarrow s = d/t \leftrightarrow t = d/s$).
  2. **Linear range scaling**: Converting a number from an input interval $[0, X_{\max}]$ to an output interval $[0, Y_{\max}]$ via the fraction of full scale $\left(\frac{x}{X_{\max}}\right) \times Y_{\max}$.
- **New syntax:** None (uses Python functions and arithmetic from Lessons P.2 and P.5).
- **Target time (unmeasured — [log yours](../.github/ISSUE_TEMPLATE/beginner-timing-log.md)):** Typical: 1.0–1.5 hours | Slow-learner: 2.0–3.0 hours

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
  - **Key takeaway:** An equation is a balanced scale: to isolate an unknown variable, undo whatever is attached to it by performing the **opposite operation on both sides**. If the unknown is multiplied by $t$ ($d = s \cdot t$), divide both sides by $t$ to get $s = \frac{d}{t}$; if an offset $x_0$ is added ($x_{\text{total}} = s \cdot t + x_0$), subtract $x_0$ from both sides first to get $s \cdot t = x_{\text{total}} - x_0$.

### Idea 2: Linear range scaling
- **Primary resource:** [MathsIsFun — Proportions](https://www.mathsisfun.com/algebra/proportions.html) `[HTTP 200 — Verified by scripts/check_links.py]`
  - **What to read:** Read exact headings **`Proportions`**, **`Working With Proportions`**, and **`Using Proportions to Solve Percents`**.
  - **What to skip:** Skip **`Using Proportions to Solve Triangles`** at the bottom of the page.
  - **Key takeaway:** A proportion like $\frac{x}{1023} = \frac{y}{5.0}$ says that the sensor reading's **fraction of full scale** (`x / 1023.0`, a number between `0.0` and `1.0`) equals the output's fraction of $5.0$. Multiplying both sides by $5.0$ gives $y = \left(\frac{x}{1023.0}\right) \times 5.0$.

### Bridge Notes
In mechatronics, you do not need to memorize three separate formulas for every physical law—you only need one formula and the balance rule:
- Start with distance equals speed times time: $d = s \cdot t$.
- Need speed $s$? Divide both sides by $t$: $s = \frac{d}{t}$.
- Need time $t$? Divide both sides by $s$: $t = \frac{d}{s}$.

What if an equation has both addition and multiplication, like a cart starting at offset $x_0$ ($x_{\text{final}} = s \cdot t + x_0$)? Undo addition/subtraction **first** by subtracting $x_0$ from both sides ($x_{\text{final}} - x_0 = s \cdot t$), and then divide both sides by $t$:

$$
s = \frac{x_{\text{final}} - x_0}{t}
$$

The exact same algebra powers **linear range scaling**. Whenever you map a 10-bit reading $x \in [0, X_{\max}]$ into a target range $y \in [0, Y_{\max}]$:
1. Divide by the input maximum to get the normalized fraction $\frac{x}{X_{\max}} \in [0.0, 1.0]$.
2. Multiply that fraction by the output maximum $Y_{\max}$: $y = \left(\frac{x}{X_{\max}}\right) \times Y_{\max}$.

---

## Do it yourself

- **What is simulated and in which tool:** Runs 100% in Python (zero-install in [futurecoder.io](https://futurecoder.io/course/) `[verify in-app]` or locally via `python3`).
- **What is real-hardware only:** Nothing in this lesson requires hardware.

### Starter Code (runs as-is — fill in the TODOs)
Complete `solve_for_speed` (`TODO 1`), `scale10_to_five` (`TODO 2`), and `scale10_to_cmd8` (`TODO 3`):

```python
def solve_for_speed(x_final, x_start, time_s):
    # TODO 1: Rearrange x_final = (speed * time_s) + x_start to solve for speed:
    #         speed = (x_final - x_start) / time_s
    return 0.0


def scale10_to_five(raw_10bit):
    # TODO 2: Scale raw_10bit from [0, 1023] to [0.0, 5.0]:
    #         (raw_10bit / 1023.0) * 5.0
    return 0.0


def scale10_to_cmd8(raw_10bit):
    # TODO 3: Scale raw_10bit from [0, 1023] to [0.0, 255.0]:
    #         (raw_10bit / 1023.0) * 255.0
    return 0.0


speed_val = solve_for_speed(5.0, 2.0, 0.015)
out_mid = scale10_to_five(511.5)
cmd_mid = scale10_to_cmd8(511.5)

print(f"Solved Speed: {speed_val:.1f} m/s")
print(f"Count 511.5 -> {out_mid:.2f} units | Cmd = {cmd_mid:.1f}")
```

### Expected Output
When all three `TODO`s are completed, running the script prints:

```text
Solved Speed: 200.0 m/s
Count 511.5 -> 2.50 units | Cmd = 127.5
```

### Hint Ladder

<details>
<summary><strong>Hint 1 (Concept nudge)</strong></summary>

In `TODO 1`, wrap `(x_final - x_start)` in parentheses before dividing by `time_s`. In `TODO 2` and `TODO 3`, compute the fraction `raw_10bit / 1023.0` first, then multiply by `5.0` or `255.0`.
</details>

<details>
<summary><strong>Hint 2 (Formula / structure)</strong></summary>

```python
def solve_for_speed(x_final, x_start, time_s):
    return (x_final - x_start) / time_s

def scale10_to_five(raw_10bit):
    return (raw_10bit / 1023.0) * 5.0

def scale10_to_cmd8(raw_10bit):
    return (raw_10bit / 1023.0) * 255.0
```
</details>

<details>
<summary><strong>Full Solution</strong></summary>

```python
def solve_for_speed(x_final, x_start, time_s):
    return (x_final - x_start) / time_s


def scale10_to_five(raw_10bit):
    return (raw_10bit / 1023.0) * 5.0


def scale10_to_cmd8(raw_10bit):
    return (raw_10bit / 1023.0) * 255.0


speed_val = solve_for_speed(5.0, 2.0, 0.015)
out_mid = scale10_to_five(511.5)
cmd_mid = scale10_to_cmd8(511.5)

assert round(speed_val, 1) == 200.0
assert round(out_mid, 2) == 2.50
assert round(cmd_mid, 1) == 127.5

print(f"Solved Speed: {speed_val:.1f} m/s")
print(f"Count 511.5 -> {out_mid:.2f} units | Cmd = {cmd_mid:.1f}")
```
</details>

---

## Common mistakes & troubleshooting
- **Dividing before subtracting when rearranging $x_{\text{final}} = s \cdot t + x_0$:** Writing $s = \frac{x_{\text{final}}}{t} - x_0$ is wrong because $t$ only multiplies $s$, not $x_0$. Subtract $x_0$ from both sides *first* to get $x_{\text{final}} - x_0 = s \cdot t$, then divide the entire left side by $t$: $s = \frac{x_{\text{final}} - x_0}{t}$.
- **Multiplying by `1023.0 / 5.0` instead of `5.0 / 1023.0`:** Check your endpoints! When `raw_10bit = 1023`, the scaled output must equal `5.0`, which requires `(1023 / 1023.0) * 5.0 = 5.0`.

---

## Check yourself

1. **Rearranging a motion equation:** The velocity of an accelerating cart is $v = a \cdot t + v_0$. Rearrange this equation to solve for the acceleration $a$.
   <details>
   <summary><strong>Answer</strong></summary>

   Subtract $v_0$ from both sides ($v - v_0 = a \cdot t$), then divide both sides by $t$ to get $a = \frac{v - v_0}{t}$ (`(v - v0) / t`).
   </details>

2. **Scaling a 10-bit reading:** If a 10-bit sensor (`0..1023`) returns `682` on a `5.0`-unit full scale, what fraction of full scale is the sensor at, and what is the scaled value?
   <details>
   <summary><strong>Answer</strong></summary>

   The fraction is $\frac{682}{1023} = \mathbf{\frac{2}{3} \approx 0.6667}$ ($66.7\%$), and the scaled value is $0.6667 \times 5.0 = \mathbf{3.33}$.
   </details>

3. **Inverse scaling:** Rearrange $y = \left(\frac{x}{1023}\right) \times 5.0$ to solve for $x$ when $y = 1.25$.
   <details>
   <summary><strong>Answer</strong></summary>

   $x = \left(\frac{y}{5.0}\right) \times 1023 = \left(\frac{1.25}{5.0}\right) \times 1023 = 0.25 \times 1023 = \mathbf{255.75}$ (which rounds to integer count **`256`**).
   </details>

### Independence check — a week later, no formula supplied
The starter above hands you every expression in a comment, so it tests translation more than derivation. This one does the opposite, on different numbers, with the formula left out. Do it a week after the lesson, closed book: read the word problem, write the three unit sentences on paper, *then* code. If you have to open the hint or the answer to finish, mark the attempt **assisted** and redo it a week later without looking — that second attempt is the one that counts.

**The job.** A belt-driven gantry: a **200 full-step/rev** stepper, a driver at **16 microsteps** per full step, a **5:1** gearbox on the output, a **20-tooth** pulley and a **2.0 mm** belt pitch. The carriage must travel **137.5 mm**, and that move takes **0.55 s** at constant speed.

Before writing code, complete these three sentences with units as well as numbers:
1. One motor microstep turns the output shaft by ______ revolutions.
2. One output revolution moves the belt ______ mm.
3. So one microstep moves the carriage ______ mm, and one millimetre is ______ microsteps.

Now write the three functions. The docstrings must state the unit of what comes back — that sentence is part of the answer, not decoration.

```python
STEPS_PER_REV = 200
MICROSTEPS_PER_STEP = 16
GEAR_RATIO = 5.0
PULLEY_TEETH = 20
PITCH_MM = 2.0


def mm_per_microstep():
    # TODO 1: unit of the return value in the docstring first, then the value
    ...


def microsteps_for_mm(travel_mm):
    # TODO 2: whole microsteps, and say why the answer is not a fraction
    ...


def speed_mm_s(travel_mm, time_s):
    # TODO 3: no gearbox needed here - say why in the docstring
    ...


print(f"one microstep = {mm_per_microstep():.4f} mm | 137.5 mm = {microsteps_for_mm(137.5)} "
      f"microsteps | speed = {speed_mm_s(137.5, 0.55):.1f} mm/s")
assert round(mm_per_microstep(), 6) == 0.0025
assert microsteps_for_mm(137.5) == 55000
assert round(speed_mm_s(137.5, 0.55), 6) == 250.0
print("INDEPENDENCE CHECK PASS: 0.0025 mm per microstep, 55000 microsteps, 250.0 mm/s")
```

<details>
<summary><strong>Answer and the units sentence</strong></summary>

One motor microstep is `1 / (200 × 16) = 1/3200` of a motor revolution, and the 5:1 gearbox turns that into `1/16000` of an **output** revolution. One output revolution pays out `20 × 2.0 = 40 mm` of belt, so one microstep moves the carriage `40 / 16000 = 0.0025 mm`, and one millimetre is `16000 / 40 = 400` microsteps. `137.5 mm × 400 = 55000` microsteps, and `137.5 mm / 0.55 s = 250.0 mm/s`.

The units sentence that has to come first: *millimetres per microstep is a length divided by a count, so it gets smaller as the gearing gets finer; microsteps per millimetre is its reciprocal and gets larger.* Choosing the reciprocal by accident gives `400 mm` per microstep, which the endpoint test catches: put `137.5` through `400` and the move is `0.34 mm`, not 137.5.

```python
def mm_per_microstep():
    """Millimetres of carriage travel per motor microstep."""
    output_revs_per_microstep = 1.0 / (STEPS_PER_REV * MICROSTEPS_PER_STEP * GEAR_RATIO)
    return output_revs_per_microstep * PULLEY_TEETH * PITCH_MM


def microsteps_for_mm(travel_mm):
    """Whole motor microsteps for a carriage move - an integer count, not a length."""
    return round(travel_mm / mm_per_microstep())


def speed_mm_s(travel_mm, time_s):
    """Carriage speed in mm/s: the gearbox is already inside the distance, not the time."""
    if time_s <= 0.0:
        raise ValueError("a move needs a positive duration")
    return travel_mm / time_s
```
</details>

---

## Recap
- Isolate an unknown variable by performing the **opposite operation on both sides** of `=` (undoing addition/subtraction before multiplication/division).
- **Linear scaling** multiplies the input's fraction of full scale $\left(\frac{x}{X_{\max}}\right)$ by the target full scale $Y_{\max}$.

### You're ready to move on when...
- [ ] You can rearrange $d = s \cdot t$ and $x = s \cdot t + x_0$ for any variable without guessing.
- [ ] You can scale any `[0, 1023]` sensor reading into `[0.0, 5.0]` or `[0, 255]`.
- [ ] Your **Do it yourself** script prints `200.0 m/s`, `2.50 units`, and `Cmd = 127.5`.

<!-- next-step:start -->
👉 **Next:** [Step 1 · Python and the maths a robot needs — Lesson P.10: Radians, Rotational Speed (rad/s) and Right-Triangle Trigonometry](P.10-radians-and-right-triangle-trig.md)
<!-- next-step:end -->
