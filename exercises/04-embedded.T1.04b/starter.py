"""Exercise 04-embedded.T1.04b - starter.

Fill in the eight holes below. Every one of them is a trap a `delay()` sketch falls into:
the timer that wraps, the deadline that drifts, the ISR that eats the CPU, the fault that clears
itself. Run the tests the way CI does:

    EXERCISE_TARGET=exercises/04-embedded.T1.04b/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T1.04b -p 'test_*.py'
"""

STATE_NAMES = ("IDLE", "HOMING", "RUN", "FAULT")
UINT32_MASK = 0xFFFFFFFF
HOMING_PWM = 0.2


def elapsed_us(now_us, last_us, bits=32):
    """Unsigned elapsed ticks between two timer readings `bits` wide, wrap included.

    Hint: subtract first, then mask - comparing the raw readings is what breaks at rollover.
    """
    raise NotImplementedError("elapsed_us: subtract, then apply the (1 << bits) - 1 mask")


def tick_due(now_us, last_us, period_us):
    """True when another whole period has elapsed.

    Hint: at exactly one period the answer is already True.
    """
    raise NotImplementedError("tick_due: compare the masked elapsed time with the period")


def next_deadline_us(last_us, period_us):
    """Advance the deadline on its own grid, so a late check never accumulates drift.

    Hint: add the period to the old deadline, do not resynchronise to the current reading.
    """
    raise NotImplementedError("next_deadline_us: last + period, masked to 32 bits")


def isr_utilization_pct(t_exec_us, f_isr_hz):
    """The CPU fraction an ISR costs, in percent.

    Hint: microseconds are 1e-6 seconds; forgetting that factor reports 4.5 million percent.
    """
    raise NotImplementedError("isr_utilization_pct: 100 * t_exec_us * 1e-6 * f_isr_hz")


def max_isr_exec_us(u_max_pct, f_isr_hz):
    """The longest an ISR may run inside its budget.

    Hint: the budget arrives as a percentage, so divide it by 100 before using it.
    """
    raise NotImplementedError("max_isr_exec_us: (u_max_pct / 100) * (1e6 / f_isr_hz)")


def fault_latency_us(n_debounce, f_isr_hz):
    """How long N consecutive samples take at the ISR rate.

    Hint: seconds to microseconds is 1e6, not 1e3.
    """
    raise NotImplementedError("fault_latency_us: (n_debounce / f_isr_hz) * 1e6")


def ticks_in(duration_us, period_us):
    """Complete ticks of `period_us` inside `duration_us`.

    Hint: integer division - a partial tick has not run.
    """
    raise NotImplementedError("ticks_in: duration_us // period_us")


def fsm_step(state, current_a, i_max_a, pos_rad, pwm_cmd):
    """One control tick of the actuator FSM: (next_state, pwm).

    Hint: FAULT is a latch, not a measurement - it must survive a current that has recovered.
    """
    raise NotImplementedError("fsm_step: latch FAULT, force the PWM to zero, then advance the states")
