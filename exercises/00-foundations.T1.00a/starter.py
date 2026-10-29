"""Exercise 00-foundations.T1.00a - the learner's file.

Seven small functions that make up one robot script: the position update, the loop that counts
steps to the end of the track, the battery sag, the Skip test's accumulator, the one-sided PWM
clamp, a division that reports the name of the exception it caught, and the three-decimal format.

    EXERCISE_TARGET=exercises/00-foundations.T1.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00a -p 'test_*.py'
"""


def step_position(pos_m, vel_m_s, dt_s):
    """Where the position is after dt_s seconds."""
    raise NotImplementedError("TODO 1: where the wheel is after this tick, starting from its current position")


def steps_to_target(pos_0, vel_m_s, dt_s, target_m):
    """How many ticks of the loop the worked example takes to reach target_m."""
    raise NotImplementedError("TODO 2: how many ticks the wheel needs to reach the target")


def battery_voltage_after_steps(v_start, drop_per_step, n_steps):
    """The battery voltage after that many steps."""
    raise NotImplementedError("TODO 3: the voltage after that many steps of sag")


def loop_total(n_steps):
    """The Skip test's accumulator after n_steps of its loop."""
    raise NotImplementedError("TODO 4: the total the Skip test's loop accumulates")


def clamp_pwm(u, u_max):
    """The command, held to a one-sided ceiling."""
    raise NotImplementedError("TODO 5: the command, held at the ceiling if it goes past it")


def safe_divide(numerator, denominator):
    """Return (value, error_name)."""
    raise NotImplementedError("TODO 6: the value, or the error's own class name when the denominator is zero")


def format_position(pos_m):
    """The position as the worked example prints it."""
    raise NotImplementedError("TODO 7: the position to three decimal places")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
