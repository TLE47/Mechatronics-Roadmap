---
id: 00-foundations.T1.00d
title: "Linear Equations, Unit-Circle Trig, Radians, atan2 & 2D Vectors"
track: "00"
tier: 1
prereqs:
  - 00-foundations.T1.00c
new_concepts:
  - linear_functions_and_slope
  - radians_unit_circle_and_atan2
  - 2d_vectors_and_components
uses:
  - python_variables_and_types
  - lists_dicts_and_numpy_arrays
  - si_base_and_derived_units
est_hours: 3.5
---

## 0. Skip Test
Pass without reading if you can compute the $(x, y)$ tip coordinates of a $L = 0.20\text{ m}$ link at angle $\theta = 120^\circ$ ($2\pi/3\text{ rad}$) and explain why `math.atan2(y, x)` succeeds in Quadrant II ($x < 0, y > 0$) where `math.atan(y / x)` returns the wrong quadrant.
- **Check:** $x = 0.20\cos(2\pi/3) = -0.10\text{ m}$, $y = 0.20\sin(2\pi/3) \approx +0.1732\text{ m}$, and `atan2(+0.1732, -0.10)` returns $+2.0944\text{ rad}$ ($+120^\circ$) whereas `atan(y/x)` returns $-60^\circ$.

## 1. Why This Matters
Robot links rotate in circles while targets live in $(x, y)$ Cartesian coordinates. To convert between joint angles and tip positions—or to calibrate a linear analog sensor $y = m x + b$—you need linear equations, radian angles on the unit circle, right-triangle components ($\cos\theta, \sin\theta$), and four-quadrant `atan2(y, x)`.

## 2. Mental Model
1. **Linear Calibration ($y = m x + b$):** Every proportional sensor (like a potentiometer or current shunt) maps input $x$ to output $y$ with sensitivity slope $m = \frac{\Delta y}{\Delta x}$ and zero-offset $b$.
2. **Radians on the Unit Circle:** One full circle ($360^\circ$) wraps an arc length of $2\pi \approx 6.2832$ radii around a circle of radius $1$. Thus $\pi\text{ rad} = 180^\circ$ and $\pi/2\text{ rad} = 90^\circ$.
3. **2D Vector Components & Magnitude:** A link of length $L$ at angle $\theta$ (measured counter-clockwise from $+x$) has horizontal shadow $x = L\cos\theta$ and vertical shadow $y = L\sin\theta$. By Pythagoras, its length is $\|\vec{v}\| = \sqrt{x^2 + y^2}$.
4. **Why `atan2(y, x)` Beats `atan(y/x)`:** Dividing $y/x$ loses the individual signs of $x$ and $y$ (since $\frac{-y}{-x} = \frac{+y}{+x}$) and crashes when $x = 0$. `math.atan2(y, x)` inspects both signs to return the exact angle in $(-\pi, +\pi]$.

## 3. Worked Example
A 1-link arm of length $L = 0.40\text{ m}$ points into Quadrant II at angle $\theta = 135^\circ = \frac{3\pi}{4}\text{ rad}$.
- **Step 1 (Forward projection to $x, y$):**
  $$x = 0.40\cos(3\pi/4) = -0.28284\text{ m}, \quad y = 0.40\sin(3\pi/4) = +0.28284\text{ m}$$
- **Step 2 (Length verification):**
  $$r = \sqrt{(-0.28284)^2 + (0.28284)^2} = \sqrt{0.08 + 0.08} = \sqrt{0.16} = 0.40\text{ m}$$
- **Step 3 (Four-quadrant angle recovery):**
  $$\theta_{\text{recovered}} = \operatorname{atan2}(+0.28284, -0.28284) = +2.35619\text{ rad} = +135.0^\circ$$

## 4. Code
```python
import math

L_m = 0.40
theta_rad = math.radians(135.0)

tip = [L_m * math.cos(theta_rad), L_m * math.sin(theta_rad)]
length_m = math.hypot(tip[0], tip[1])
recovered_deg = math.degrees(math.atan2(tip[1], tip[0]))
wrong_atan_deg = math.degrees(math.atan(tip[1] / tip[0]))

assert math.isclose(length_m, L_m, rel_tol=1e-9)
assert math.isclose(recovered_deg, 135.0, rel_tol=1e-9)
assert math.isclose(wrong_atan_deg, -45.0, rel_tol=1e-9)
print(f"tip=({tip[0]:.4f}, {tip[1]:.4f}) m, atan2={recovered_deg:.1f} deg, atan={wrong_atan_deg:.1f} deg")
```
Expected output:
```text
tip=(-0.2828, 0.2828) m, atan2=135.0 deg, atan=-45.0 deg
```

## 5. Exercise
A robot base sits at $(0, 0)$ and sees a target at $(x, y) = (-0.30\text{ m}, -0.40\text{ m})$ in Quadrant III. Compute the Euclidean distance $d = \sqrt{x^2 + y^2}$ and the heading angle in degrees using `math.degrees(math.atan2(y, x))`.
- **Check:** $d = 0.50\text{ m}$ and $\theta \approx -126.87^\circ$.

## 6. Gate Test
1. What angle in radians and degrees does `math.atan2(-1.0, 0.0)` return? (Answer: $-\pi/2\text{ rad} = -90^\circ$.)
2. An ADC reads $0.5\text{ V}$ at $0\text{ A}$ and $2.5\text{ V}$ at $10\text{ A}$. Write the linear equation $I(V) = m V + b$ for current $I$ as a function of voltage $V$. (Answer: Slope $m = \frac{10 - 0}{2.5 - 0.5} = 5.0\text{ A/V}$, offset $b = -2.5\text{ A}$, so $I = 5.0 V - 2.5$.)

## 7. Resources
- **3Blue1Brown — Fundamentals of Trigonometry & Vectors:** Visual unit-circle intuition `[UNVERIFIED]`.
- **Track 00 (`00-foundations/README.md`):** Prepares directly for Step 1.1 $SO(2)$ rotation matrices and angle wrapping `[VERIFIED 2026-10-15]`.
