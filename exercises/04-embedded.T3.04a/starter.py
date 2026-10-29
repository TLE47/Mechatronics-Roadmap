"""Exercise 04-embedded.T3.04a - the learner's file.

The center-aligned auto-reload value and the low-side window it leaves open, the Q1.31 word the
CORDIC coprocessor takes, the even/odd sequence check, and the ISR's share of the CPU. Fill the
eight TODOs:

    EXERCISE_TARGET=exercises/04-embedded.T3.04a/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T3.04a -p 'test_*.py'
"""

import math

Q31_SCALE = 1 << 31
Q31_MIN = -(1 << 31)
Q31_MAX = (1 << 31) - 1


def center_aligned_arr(f_tim_hz, f_pwm_hz):
    """The auto-reload value that gives this PWM frequency in center-aligned mode."""
    raise NotImplementedError("TODO 1: the auto-reload value for this PWM frequency in center-aligned mode")


def pwm_frequency(f_tim_hz, arr):
    """The PWM frequency this auto-reload value produces in center-aligned mode."""
    raise NotImplementedError("TODO 2: the PWM frequency this auto-reload value produces")


def low_side_window_ns(d_max, t_dead_ns, f_pwm_hz):
    """The shortest low-side on-time this duty limit leaves, in nanoseconds."""
    raise NotImplementedError("TODO 3: the shortest low-side window this duty limit leaves, after both dead-time intervals")


def q31_encode(x):
    """The Q1.31 word for this value, clamped to the format's range."""
    raise NotImplementedError("TODO 4: the Q1.31 word for this value, with the format's full-scale limits")


def q31_decode(word):
    """The real value this Q1.31 word represents."""
    raise NotImplementedError("TODO 5: the real value this Q1.31 word represents")


def angle_to_q31(theta_rad):
    """The Q1.31 word for this angle, carried relative to a straight angle."""
    raise NotImplementedError("TODO 6: the Q1.31 word for this angle; the format stores it relative to a straight angle")


def seqlock_valid(s1, s2):
    """Whether the two sequence copies describe a tear-free read."""
    raise NotImplementedError("TODO 7: whether the two sequence copies describe a tear-free read")


def isr_cpu_percent(wcet_us, period_us):
    """The ISR's share of the CPU, as a percentage."""
    raise NotImplementedError("TODO 8: the ISR's share of the CPU, as a percentage")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
