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
    """ARR = f_tim / (2 f_pwm)."""
    raise NotImplementedError("TODO 1: up-down mode spends TWO timer ticks per PWM period")


def pwm_frequency(f_tim_hz, arr):
    """f_pwm = f_tim / (2 ARR)."""
    raise NotImplementedError("TODO 2: the same factor of two, solved for the frequency")


def low_side_window_ns(d_max, t_dead_ns, f_pwm_hz):
    """t_low,min = (1 - d_max) T_pwm - 2 t_dead."""
    raise NotImplementedError("TODO 3: there is a dead time at BOTH edges, so subtract two")


def q31_encode(x):
    """X = clamp(round(x * 2^31), -2^31, 2^31 - 1)."""
    raise NotImplementedError("TODO 4: the scale is 2 to the 31, and +1.0 clamps to 0x7FFFFFFF")


def q31_decode(word):
    """x_hat = X / 2^31."""
    raise NotImplementedError("TODO 5: divide by the same 2^31, not by 2^30")


def angle_to_q31(theta_rad):
    """x = theta / pi, then encoded."""
    raise NotImplementedError("TODO 6: normalise by PI first — the format stores the angle as a fraction of half a turn")


def seqlock_valid(s1, s2):
    """Tear-free iff s1 is even and s1 == s2."""
    raise NotImplementedError("TODO 7: an odd first sequence means a write was in flight, even when the two copies agree")


def isr_cpu_percent(wcet_us, period_us):
    """100 * WCET / T_pwm."""
    raise NotImplementedError("TODO 8: a percentage needs the multiply by 100")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
