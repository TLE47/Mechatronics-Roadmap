"""Exercise 00-foundations.T1.00a - the learner's file.

Seven small functions that make up one robot script: the position update, the loop that counts
steps to the end of the track, the battery sag, the Skip test's accumulator, the one-sided PWM
clamp, a division that reports the name of the exception it caught, and the three-decimal format.

    EXERCISE_TARGET=exercises/00-foundations.T1.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00a -p 'test_*.py'
"""


def step_position(pos_m, vel_m_s, dt_s):
    """x_next = x + v * dt."""
    raise NotImplementedError("TODO 1: multiply the speed by the time step, then add the position")


def steps_to_target(pos_0, vel_m_s, dt_s, target_m):
    """How many ticks of the loop the worked example takes to reach target_m."""
    raise NotImplementedError("TODO 2: a `while pos_m < target` loop that COUNTS its own iterations")


def battery_voltage_after_steps(v_start, drop_per_step, n_steps):
    """Subtract drop_per_step from v_start n_steps times."""
    raise NotImplementedError("TODO 3: range(n_steps) runs n times - range(1, n) only runs n-1")


def loop_total(n_steps):
    """The Skip test's accumulator: sum of i*2 for i in range(n_steps)."""
    raise NotImplementedError("TODO 4: start at 0 and add i * 2 inside the loop, not after it")


def clamp_pwm(u, u_max):
    """One-sided ceiling: u_max when u is above it, u itself otherwise."""
    raise NotImplementedError("TODO 5: return u_max only when u > u_max, otherwise u")


def safe_divide(numerator, denominator):
    """Return (value, error_name)."""
    raise NotImplementedError("TODO 6: try/except ZeroDivisionError, and report type(exc).__name__")


def format_position(pos_m):
    """The worked example's `{pos_m:.3f}` field, on its own."""
    raise NotImplementedError("TODO 7: an f-string with the .3f format spec, not str()")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
