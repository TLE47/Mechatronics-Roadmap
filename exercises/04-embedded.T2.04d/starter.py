"""Exercise 04-embedded.T2.04d - the learner's file.

Four budgets and one clock: wire time, link utilisation, the static handle count, the spin WCET and
the NTP offset. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/04-embedded.T2.04d/starter.py \
        python3 -m unittest discover -s exercises/04-embedded.T2.04d -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def wire_time_us(payload_bytes, xrce_bytes, bits_per_byte, bit_rate):
    """Wire time for one message, in microseconds, framing included."""
    raise NotImplementedError("TODO 1: eight bits per byte on CAN, ten on 8N1 — plus the XRCE header")


def link_utilization(streams, bits_per_byte, bit_rate):
    """Sum of `frequency * wire_time` over the streams, as a fraction of the link."""
    raise NotImplementedError("TODO 2: weight every stream by its own frequency before adding the shares up")


def handle_total(n_timers, n_subs, n_srvs, n_clients):
    """The exact static capacity `rclc_executor_init` needs."""
    raise NotImplementedError("TODO 3: the executor allocates one handle per entity, no slack")


def spin_wcet_us(t_io_us, callbacks_us):
    """Worst-case time for one `rclc_executor_spin_some`."""
    raise NotImplementedError("TODO 4: transport I/O plus EVERY callback")


def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Round-trip delay from the four timestamps."""
    raise NotImplementedError("TODO 5: subtract the host's processing time from the elapsed time")


def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Clock offset `t_ros2 - t_mcu` from the NTP midpoint."""
    raise NotImplementedError("TODO 6: average the forward and backward offsets")


def rtos_utilization(tasks):
    """`sum(C_i / T_i)` over `(execution_us, period_us)` tasks."""
    raise NotImplementedError("TODO 7: each task's execution share, added across tasks — not their mean")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
