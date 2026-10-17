"""Planted fault: the quantization step divides the span by 2^bits, not 2^bits - 1.

The 12-bit, 36 N*m field then steps by 8.789 mN*m instead of 8.791 mN*m - a 0.024% error that
hides inside every round-trip check and only shows up when the step itself is measured.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""


def _task_pair(task):
    """A task as (c_us, t_us), accepting the worked example's (name, c_us, t_us) triples too."""
    if not isinstance(task, (list, tuple)):
        raise ValueError("each task is (name, c_us, t_us) or (c_us, t_us)")
    if len(task) == 2:
        c_us, t_us = task
    elif len(task) == 3:
        _name, c_us, t_us = task
    else:
        raise ValueError("each task is (name, c_us, t_us) or (c_us, t_us)")
    return float(c_us), float(t_us)


def cpu_utilization(tasks):
    """U = sum C_i / T_i for a periodic task set, in the same unit of time for C and T."""
    if not tasks:
        raise ValueError("a task set needs at least one task")
    total = 0.0
    for task in tasks:
        c_us, t_us = _task_pair(task)
        if c_us < 0.0:
            raise ValueError("a worst-case execution time cannot be negative")
        if t_us <= 0.0:
            raise ValueError("a period must be positive")
        if c_us > t_us:
            raise ValueError("a task whose worst case exceeds its period cannot be scheduled")
        total += c_us / t_us
    return total


def liu_layland_bound(n):
    """The sufficient Rate-Monotonic bound U <= n (2^(1/n) - 1): 0.7798 for three tasks."""
    if n < 1:
        raise ValueError("a task set has at least one task")
    return n * (2.0 ** (1.0 / n) - 1.0)


def response_time_us(c_h_us, b_i_us, c_m_us=0.0, inheritance=True):
    """Worst-case response of the high-priority task: C_H + B_i, plus C_M without inheritance."""
    for value, name in ((c_h_us, "c_h_us"), (b_i_us, "b_i_us"), (c_m_us, "c_m_us")):
        if value < 0.0:
            raise ValueError("%s cannot be negative" % name)
    preemption = 0.0 if inheritance else c_m_us
    return c_h_us + b_i_us + preemption


def can_winner(ids):
    """The 11-bit CAN identifier that wins non-destructive arbitration: the lowest number."""
    if not ids:
        raise ValueError("arbitration needs at least one frame")
    winner = None
    for can_id in ids:
        if isinstance(can_id, bool) or not isinstance(can_id, int):
            raise ValueError("a CAN identifier is an integer")
        if not 0 <= can_id <= 0x7FF:
            raise ValueError("a standard CAN identifier is 11 bits, 0..0x7FF")
        if winner is None or can_id < winner:
            winner = can_id
    return winner


def _check_range(x_min, x_max, bits):
    if isinstance(bits, bool) or not isinstance(bits, int) or bits < 1:
        raise ValueError("a packed field is at least one bit wide")
    if x_max <= x_min:
        raise ValueError("the span must be positive: x_max > x_min")


def encode_fixed(x, x_min, x_max, bits):
    """u = round((x - x_min) / (x_max - x_min) * (2^bits - 1)), the MIT-mode pack."""
    _check_range(x_min, x_max, bits)
    if not x_min <= x <= x_max:
        raise ValueError("a value outside the declared range has no code: %r" % (x,))
    return int(round((x - x_min) / (x_max - x_min) * ((1 << bits) - 1)))


def decode_fixed(u, x_min, x_max, bits):
    """The inverse pack: x_hat = x_min + u / (2^bits - 1) * (x_max - x_min)."""
    _check_range(x_min, x_max, bits)
    if isinstance(u, bool) or not isinstance(u, int):
        raise ValueError("a packed code is an integer")
    if not 0 <= u <= (1 << bits) - 1:
        raise ValueError("a %d-bit field holds 0..%d, not %d" % (bits, (1 << bits) - 1, u))
    return x_min + (u / float((1 << bits) - 1)) * (x_max - x_min)


def quantization_step(x_min, x_max, bits):
    """One count of the packed field: (x_max - x_min) / 2^bits."""
    _check_range(x_min, x_max, bits)
    return (x_max - x_min) / float(1 << bits)
