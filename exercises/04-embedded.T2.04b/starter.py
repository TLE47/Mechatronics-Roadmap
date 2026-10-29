"""Exercise 04-embedded.T2.04b - starter. Fill in the seven holes.

Run the way CI does:

    EXERCISE_TARGET=exercises/04-embedded.T2.04b/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T2.04b -p 'test_*.py'
"""


def cpu_utilization(tasks):
    """The fraction of CPU the task set needs. Each task is (name, c_us, t_us) or (c_us, t_us)."""
    # Trap: the utilisation is a ratio, so C and T must be in the same unit - and a task that
    # overruns its period is refused, not silently counted above 1.0.
    raise NotImplementedError("the fraction of CPU this task set needs")


def liu_layland_bound(n):
    """The sufficient Rate-Monotonic bound for this many tasks."""
    # Trap: the bound is not 1.0, and the exponent follows the task count.
    raise NotImplementedError("the Rate-Monotonic bound for this many tasks")


def response_time_us(c_h_us, b_i_us, c_m_us=0.0, inheritance=True):
    """Worst-case response of the high-priority task, with and without priority inheritance."""
    # Trap: with the mutex the medium task is kept out entirely.
    raise NotImplementedError("the high-priority task's worst-case response, with and without inheritance")


def can_winner(ids):
    """The identifier that wins CAN bitwise arbitration."""
    # Trap: bit 0 is dominant, so the winner is not the first frame sent.
    raise NotImplementedError("the identifier that wins arbitration")


def encode_fixed(x, x_min, x_max, bits):
    """The MIT-mode code for this value."""
    # Trap: the scale counts intervals, not codes.
    raise NotImplementedError("the MIT-mode code for this value, rounded to the nearest step")


def decode_fixed(u, x_min, x_max, bits):
    """The inverse pack."""
    # Trap: the offset returns after the scale.
    raise NotImplementedError("the value this MIT-mode code represents")


def quantization_step(x_min, x_max, bits):
    """One count of the packed field, in the field's own units."""
    # Trap: the step counts intervals, not codes.
    raise NotImplementedError("the value one code step represents")


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a print here would be a mismatch for a correct answer.
