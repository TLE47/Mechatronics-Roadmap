"""Exercise 04-embedded.T2.04d - reference solution.

Four budgets and one clock. The wire budget is `bits per byte` - 10 on an 8N1 UART, 8 on CAN-FD -
and the utilisation is the sum of `frequency * wire_time`, which is the number that has to stay
below one. The clock offset is the NTP midpoint, exact only while the two directions are
symmetric: an asymmetric link biases it by half the difference.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def wire_time_us(payload_bytes, xrce_bytes, bits_per_byte, bit_rate):
    """Wire time for one message, in microseconds, framing included."""
    if bit_rate <= 0.0:
        raise ValueError("bit rate must be positive")
    bits = bits_per_byte * (payload_bytes + xrce_bytes)
    return 1e6 * bits / bit_rate


def link_utilization(streams, bits_per_byte, bit_rate):
    """Sum over `(frequency_hz, payload_bytes, xrce_bytes)` streams of `f * t_wire`."""
    total = 0.0
    for frequency, payload, xrce in streams:
        total += frequency * wire_time_us(payload, xrce, bits_per_byte, bit_rate)
    return total / 1e6


def handle_total(n_timers, n_subs, n_srvs, n_clients):
    """The exact static capacity `rclc_executor_init` needs."""
    return n_timers + n_subs + n_srvs + n_clients


def spin_wcet_us(t_io_us, callbacks_us):
    """Worst-case time for one `rclc_executor_spin_some`: transport I/O plus every callback."""
    return t_io_us + sum(callbacks_us)


def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Round-trip delay: the four timestamps minus the host's own processing time."""
    return (t4_mcu - t1_mcu) - (t3_host - t2_host)


def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Clock offset such that `t_ros2 ~= t_mcu + offset`, from the NTP midpoint."""
    return ((t2_host - t1_mcu) + (t3_host - t4_mcu)) / 2.0


def rtos_utilization(tasks):
    """`sum(C_i / T_i)` over `(execution_us, period_us)` tasks."""
    if any(period <= 0.0 for _, period in tasks):
        raise ValueError("every period must be positive")
    return sum(execution / period for execution, period in tasks)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
