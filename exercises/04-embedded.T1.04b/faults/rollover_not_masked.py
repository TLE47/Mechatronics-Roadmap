"""Planted fault `rollover_not_masked` - one edit from the reference solution.

`elapsed_us` returns the raw difference, so a 16-bit counter that passes its wrap reports -65508
instead of the 28 ticks that actually elapsed.
"""

STATE_NAMES = ("IDLE", "HOMING", "RUN", "FAULT")
UINT32_MASK = 0xFFFFFFFF
HOMING_PWM = 0.2


def elapsed_us(now_us, last_us, bits=32):
    if not isinstance(bits, int) or bits < 8 or bits > 32:
        raise ValueError("bits must be an integer timer width from 8 to 32, not %r" % (bits,))
    if not isinstance(now_us, int) or not isinstance(last_us, int):
        raise ValueError("timer counts are integers")
    return now_us - last_us


def tick_due(now_us, last_us, period_us):
    if not isinstance(period_us, int) or period_us <= 0:
        raise ValueError("a period is a positive integer number of microseconds")
    return elapsed_us(now_us, last_us) >= period_us


def next_deadline_us(last_us, period_us):
    if not isinstance(period_us, int) or period_us <= 0:
        raise ValueError("a period is a positive integer number of microseconds")
    if not isinstance(last_us, int):
        raise ValueError("timer counts are integers")
    return (last_us + period_us) & UINT32_MASK


def isr_utilization_pct(t_exec_us, f_isr_hz):
    if t_exec_us < 0.0:
        raise ValueError("an ISR cannot take negative time")
    if f_isr_hz <= 0.0:
        raise ValueError("an ISR frequency is positive")
    if t_exec_us > 1_000_000.0 / f_isr_hz:
        raise ValueError("an ISR longer than its own period (%g us) never returns"
                         % (1_000_000.0 / f_isr_hz))
    return 100.0 * (t_exec_us * 1e-6) * f_isr_hz


def max_isr_exec_us(u_max_pct, f_isr_hz):
    if not 0.0 < u_max_pct <= 100.0:
        raise ValueError("the budget is a percentage greater than 0 and at most 100")
    if f_isr_hz <= 0.0:
        raise ValueError("an ISR frequency is positive")
    return (u_max_pct / 100.0) * (1_000_000.0 / f_isr_hz)


def fault_latency_us(n_debounce, f_isr_hz):
    if not isinstance(n_debounce, int) or n_debounce < 1:
        raise ValueError("a debounce count is an integer of at least one sample")
    if f_isr_hz <= 0.0:
        raise ValueError("an ISR frequency is positive")
    return (n_debounce / f_isr_hz) * 1_000_000.0


def ticks_in(duration_us, period_us):
    if not isinstance(duration_us, int) or duration_us < 0:
        raise ValueError("a duration is a non-negative integer number of microseconds")
    if not isinstance(period_us, int) or period_us <= 0:
        raise ValueError("a period is a positive integer number of microseconds")
    return duration_us // period_us


def fsm_step(state, current_a, i_max_a, pos_rad, pwm_cmd):
    if state not in STATE_NAMES:
        raise ValueError("unknown state %r; expected one of %s" % (state, ", ".join(STATE_NAMES)))
    if i_max_a <= 0.0:
        raise ValueError("the current limit is positive")
    if current_a < 0.0:
        raise ValueError("a measured current magnitude is not negative")
    if not 0.0 <= pwm_cmd <= 1.0:
        raise ValueError("a duty cycle lies in [0, 1]")
    if state == "FAULT":
        return "FAULT", 0.0
    if current_a > i_max_a:
        return "FAULT", 0.0
    if state == "IDLE":
        return "HOMING", HOMING_PWM
    if state == "HOMING":
        return ("HOMING" if pos_rad < 0.0 else "RUN"), HOMING_PWM
    return "RUN", pwm_cmd
