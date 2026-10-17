"""Exercise 00-foundations.T1.00a - reference solution.

The Python a robot script is built from before any hardware exists: a variable updated from the
right-hand side, a `while` loop that steps time forward, a `for` loop over `range(n)`, a one-sided
clamp, a function that catches a traceback's exception and reports its type, and the three-decimal
format the worked example prints.
"""


def step_position(pos_m, vel_m_s, dt_s):
    """x_next = x + v * dt. Negative time would run the simulator backwards."""
    if dt_s < 0.0:
        raise ValueError("time only runs forwards in this simulator")
    return pos_m + vel_m_s * dt_s


def steps_to_target(pos_0, vel_m_s, dt_s, target_m):
    """How many ticks of the loop the worked example takes to reach target_m."""
    if dt_s <= 0.0:
        raise ValueError("a zero time step never advances the position")
    if vel_m_s <= 0.0:
        raise ValueError("a robot that is not moving forward never reaches the target")
    steps = 0
    pos_m = pos_0
    while pos_m < target_m - 1e-9:
        pos_m = step_position(pos_m, vel_m_s, dt_s)
        steps += 1
    return steps


def battery_voltage_after_steps(v_start, drop_per_step, n_steps):
    """Subtract drop_per_step from v_start exactly n_steps times - range(n) has n terms."""
    if n_steps < 0:
        raise ValueError("a loop cannot run a negative number of times")
    v_now = v_start
    for _step in range(n_steps):
        v_now -= drop_per_step
    return v_now


def loop_total(n_steps):
    """The Skip test's accumulator: sum of i*2 for i in range(n_steps)."""
    if n_steps < 0:
        raise ValueError("a loop cannot run a negative number of times")
    total = 0
    for i in range(n_steps):
        total += i * 2
    return total


def clamp_pwm(u, u_max):
    """One-sided ceiling: u_max when u is above it, u itself otherwise."""
    if u_max <= 0.0:
        raise ValueError("a PWM ceiling must be positive")
    return u_max if u > u_max else u


def safe_divide(numerator, denominator):
    """Return (value, error_name) - a clean division reports an empty name."""
    try:
        return numerator / denominator, ""
    except ZeroDivisionError as exc:
        return None, type(exc).__name__


def format_position(pos_m):
    """The worked example's `{pos_m:.3f}` field, on its own."""
    return f"{pos_m:.3f}"


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
