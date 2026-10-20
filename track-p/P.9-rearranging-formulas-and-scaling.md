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
> **Run this in the workbench.** [Open MechaLab on `P.9`](https://tle47.github.io/Mechatronics-Roadmap/?lesson=P.9) - Tab 2 opens with that entry selected, starter code, hints and graded check ready. This page is the reading copy, and nothing you type here is saved.
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

---

## Recap
- Isolate an unknown variable by performing the **opposite operation on both sides** of `=` (undoing addition/subtraction before multiplication/division).
- **Linear scaling** multiplies the input's fraction of full scale $\left(\frac{x}{X_{\max}}\right)$ by the target full scale $Y_{\max}$.

### You're ready to move on when...
- [ ] You can rearrange $d = s \cdot t$ and $x = s \cdot t + x_0$ for any variable without guessing.
- [ ] You can scale any `[0, 1023]` sensor reading into `[0.0, 5.0]` or `[0, 255]`.
- [ ] Your **Do it yourself** script prints `200.0 m/s`, `2.50 units`, and `Cmd = 127.5`.
- **Next lesson:** [Lesson P.10: Radians, Rotational Speed (`rad/s`) & Right-Triangle Trigonometry](P.10-radians-and-right-triangle-trig.md)
