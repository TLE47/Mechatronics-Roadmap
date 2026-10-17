"""Exercise 04-embedded.T3.04a - reference solution.

The three primitives a 40 kHz current loop is built from once RTOS locks are banned: the
center-aligned timer that puts the ADC trigger on the triangle peak, the Q1.31 word the CORDIC
coprocessor eats, and the even/odd sequence check that makes a reader's copy tear-proof.
"""

import math

Q31_SCALE = 1 << 31
Q31_MIN = -(1 << 31)
Q31_MAX = (1 << 31) - 1


def center_aligned_arr(f_tim_hz, f_pwm_hz):
    """ARR = f_tim / (2 f_pwm): an up-down counter spends two ticks per PWM period."""
    if f_tim_hz <= 0.0 or f_pwm_hz <= 0.0:
        raise ValueError("timer and PWM frequencies are positive")
    arr = int(round(f_tim_hz / (2.0 * f_pwm_hz)))
    if arr < 1:
        raise ValueError("the carrier is too fast for this timer: ARR would be zero")
    return arr


def pwm_frequency(f_tim_hz, arr):
    """f_pwm = f_tim / (2 ARR) - the inverse of the register the carrier is built from."""
    if f_tim_hz <= 0.0:
        raise ValueError("the timer clock is positive")
    if arr < 1:
        raise ValueError("ARR counts up and back down, so it needs at least one tick")
    return f_tim_hz / (2.0 * float(arr))


def low_side_window_ns(d_max, t_dead_ns, f_pwm_hz):
    """t_low,min = (1 - d_max) T_pwm - 2 t_dead, with one dead time at each switching edge."""
    if not 0.0 <= d_max <= 1.0:
        raise ValueError("a duty cycle is a fraction in [0, 1]")
    if t_dead_ns < 0.0:
        raise ValueError("dead time cannot be negative")
    if f_pwm_hz <= 0.0:
        raise ValueError("the PWM frequency is positive")
    period_ns = 1e9 / f_pwm_hz
    return (1.0 - d_max) * period_ns - 2.0 * t_dead_ns


def q31_encode(x):
    """X = clamp(round(x * 2^31), -2^31, 2^31 - 1): +1.0 has no representation, it overflows."""
    if not math.isfinite(x):
        raise ValueError("a Q1.31 input must be finite")
    word = int(round(x * Q31_SCALE))
    return max(Q31_MIN, min(Q31_MAX, word))


def q31_decode(word):
    """x_hat = X / 2^31 - the inverse of the encoding, exact for every representable word."""
    if not isinstance(word, int):
        raise ValueError("a Q1.31 word is a signed 32-bit integer")
    if not Q31_MIN <= word <= Q31_MAX:
        raise ValueError("a Q1.31 word lives in [-2^31, 2^31 - 1], not %d" % word)
    return word / float(Q31_SCALE)


def angle_to_q31(theta_rad):
    """Normalise the electrical angle to x = theta / pi in [-1, 1) before encoding it."""
    if not math.isfinite(theta_rad):
        raise ValueError("an electrical angle must be finite")
    if not -math.pi <= theta_rad < math.pi:
        raise ValueError("normalise the angle into [-pi, pi) first, not %g rad" % theta_rad)
    return q31_encode(theta_rad / math.pi)


def seqlock_valid(s1, s2):
    """A copy is tear-free iff the counter it started on was even and it never moved."""
    if not isinstance(s1, int) or not isinstance(s2, int):
        raise ValueError("sequence numbers are integers")
    if s1 < 0 or s2 < 0:
        raise ValueError("a sequence counter only counts up")
    return (s1 % 2 == 0) and s1 == s2


def isr_cpu_percent(wcet_us, period_us):
    """100 * WCET / T_pwm: the share of the CPU the fast ISR takes."""
    if wcet_us <= 0.0:
        raise ValueError("a worst-case execution time is positive")
    if period_us <= 0.0:
        raise ValueError("the ISR period is positive")
    return 100.0 * wcet_us / period_us


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
