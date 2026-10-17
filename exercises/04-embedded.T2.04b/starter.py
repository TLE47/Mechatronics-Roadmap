"""Exercise 04-embedded.T2.04b - starter. Fill in the seven holes.

Run the way CI does:

    EXERCISE_TARGET=exercises/04-embedded.T2.04b/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T2.04b -p 'test_*.py'
"""


def cpu_utilization(tasks):
    """U = sum C_i / T_i. Each task is (name, c_us, t_us) or (c_us, t_us)."""
    # Trap: the utilisation is a ratio, so C and T must be in the same unit - and a task that
    # overruns its period is refused, not silently counted above 1.0.
    raise NotImplementedError("sum C_i / T_i over the task set")


def liu_layland_bound(n):
    """The sufficient Rate-Monotonic bound U <= n (2^(1/n) - 1)."""
    # Trap: the bound is not 1.0, and the exponent is 1/n, not n.
    raise NotImplementedError("n * (2 ** (1 / n) - 1)")


def response_time_us(c_h_us, b_i_us, c_m_us=0.0, inheritance=True):
    """Worst-case response of the high-priority task, with and without priority inheritance."""
    # Trap: with the mutex the medium task is kept out, so C_M must not be added.
    raise NotImplementedError("C_H + B_i, plus C_M only without inheritance")


def can_winner(ids):
    """The identifier that wins CAN bitwise arbitration."""
    # Trap: bit 0 is dominant, so the lowest number wins - not the first frame sent.
    raise NotImplementedError("the smallest 11-bit identifier")


def encode_fixed(x, x_min, x_max, bits):
    """u = round((x - x_min) / (x_max - x_min) * (2^bits - 1))."""
    # Trap: the scale is 2^bits - 1, the number of intervals, not 2^bits.
    raise NotImplementedError("the MIT-mode pack, rounded to the nearest code")


def decode_fixed(u, x_min, x_max, bits):
    """The inverse pack."""
    # Trap: the offset goes back on after the scale, and the divisor is 2^bits - 1 again.
    raise NotImplementedError("x_min + u / (2^bits - 1) * (x_max - x_min)")


def quantization_step(x_min, x_max, bits):
    """One count of the packed field, in the field's own units."""
    # Trap: it is the span over 2^bits - 1, so a 12-bit, 36 N*m field steps by 8.79 mN*m.
    raise NotImplementedError("(x_max - x_min) / (2^bits - 1)")


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a print here would be a mismatch for a correct answer.
