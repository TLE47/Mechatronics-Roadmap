---
id: 00-foundations.T1.00b
title: "Lists, Dictionaries, NumPy Arrays, Plotting & Git/Terminal Basics"
track: "00"
tier: 1
prereqs:
  - 00-foundations.T1.00a
new_concepts:
  - lists_dicts_and_numpy_arrays
  - matplotlib_time_series_plotting
  - terminal_and_git_basics
uses:
  - python_variables_and_types
  - for_while_loops_and_functions
est_hours: 3.5
---

## 0. Skip Test
Pass without reading if you can write one line of NumPy code to compute $y = 2.5 x - 1.0$ for `x = np.array([0.0, 1.0, 2.0])` without a loop, and explain what `git status` and `git diff` show.
- **Check:** `assert np.allclose(2.5 * np.array([0.0, 1.0, 2.0]) - 1.0, [-1.0, 1.5, 4.0])`

## 1. Why This Matters
A 5-second motor test at $1\text{ kHz}$ records 5,000 time steps of angle, velocity, and current. You need Python `list` and `dict` containers to organize parameters, `numpy` arrays to do math on thousands of samples at once, `matplotlib` to plot time-series curves, and basic terminal/`git` commands to run scripts and save working checkpoints.

## 2. Mental Model
1. **Lists (`[10, 20, 30]`):** Ordered sequences indexed starting at `0` (`my_list[0]` is `10`, `my_list[-1]` is the last item `30`).
2. **Dictionaries (`{"kp": 4.0, "kd": 0.2}`):** Key-value lookup tables so you never mix up parameter order.
3. **NumPy Arrays (`np.array([1.0, 2.0, 3.0])`):** Contiguous vectors/matrices that apply arithmetic element-by-element (`2.0 * arr` doubles every element at C speed without a Python `for` loop).
4. **Git & Terminal Basics:** `pwd` shows your current folder, `python3 script.py` runs a file, `git status` lists modified files, and `git commit -am "message"` saves a snapshot you can always roll back to.

## 3. Worked Example
We record 5 timestamps $t = [0.0, 0.1, 0.2, 0.3, 0.4]\text{ s}$ and compute a noisy sensor reading $y = 3.0 t + 0.5$, then calculate the mean and peak-to-peak span using NumPy.
- **Step 1:** Create `t = np.linspace(0.0, 0.4, 5)` which produces `[0.0, 0.1, 0.2, 0.3, 0.4]`.
- **Step 2:** Vectorized evaluation gives `y = 3.0 * t + 0.5 = [0.5, 0.8, 1.1, 1.4, 1.7]`.
- **Step 3:** The mean is $\bar{y} = 1.1$ and the span is $\max(y) - \min(y) = 1.7 - 0.5 = 1.2$.

## 4. Code
```python
import math

config = {"slope": 3.0, "offset": 0.5}
t_s = [0.0 + 0.1 * i for i in range(5)]
y_v = [config["slope"] * t + config["offset"] for t in t_s]

mean_v = sum(y_v) / len(y_v)
span_v = max(y_v) - min(y_v)

assert len(y_v) == 5
assert math.isclose(y_v[0], 0.5, rel_tol=1e-9)
assert math.isclose(y_v[-1], 1.7, rel_tol=1e-9)
assert math.isclose(mean_v, 1.1, rel_tol=1e-9)
assert math.isclose(span_v, 1.2, rel_tol=1e-9)
print(f"t={[round(x, 2) for x in t_s]}, y={[round(y, 2) for y in y_v]}, mean={mean_v:.2f}, span={span_v:.2f}")
```
Expected output:
```text
t=[0.0, 0.1, 0.2, 0.3, 0.4], y=[0.5, 0.8, 1.1, 1.4, 1.7], mean=1.10, span=1.20
```

## 5. Exercise
Given two NumPy arrays `target = np.array([1.0, 2.0, 3.0, 4.0])` and `measured = np.array([0.9, 2.1, 2.8, 4.2])`, compute the error array `err = target - measured` and the Root-Mean-Square Error `rmse = np.sqrt(np.mean(err**2))`.
- **Check:** `assert math.isclose(float(np.sqrt(np.mean((target - measured)**2))), math.sqrt(0.025), rel_tol=1e-9)`

## 6. Gate Test
1. What is the difference between `[1, 2, 3] * 2` on a Python list vs. `np.array([1, 2, 3]) * 2` on a NumPy array? (Answer: The Python list repeats `[1, 2, 3, 1, 2, 3]`, whereas the NumPy array multiplies each number to give `array([2, 4, 6])`.)
2. What does `arr[-1]` return for `arr = np.array([10.0, 20.0, 30.0])`? (Answer: `30.0`, the last element.)

## 7. Resources
- **NumPy Quickstart Tutorial (`numpy.org/doc/stable/user/quickstart.html`):** Array creation, indexing, and vectorized math `[UNVERIFIED]`.
- **Pro Git Book (Ch. 1–2):** Free guide to `git init`, `status`, `diff`, and `commit` `[UNVERIFIED]`.
