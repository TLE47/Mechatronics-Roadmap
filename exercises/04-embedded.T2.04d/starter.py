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
    raise NotImplementedError("TODO 1: the time one message occupies the wire, header included")


def link_utilization(streams, bits_per_byte, bit_rate):
    """How much of the link all the streams use together, as a fraction."""
    raise NotImplementedError("TODO 2: how much of the link all the streams use together")


def handle_total(n_timers, n_subs, n_srvs, n_clients):
    """The exact static capacity `rclc_executor_init` needs."""
    raise NotImplementedError("TODO 3: the exact handle capacity the executor is initialised with")


def spin_wcet_us(t_io_us, callbacks_us):
    """Worst-case time for one `rclc_executor_spin_some`."""
    raise NotImplementedError("TODO 4: the worst-case time one spin spends, with every callback registered")


def ntp_rtt_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """Round-trip delay from the four timestamps."""
    raise NotImplementedError("TODO 5: the two-way delay, with the host's own processing taken out")


def ntp_offset_us(t1_mcu, t2_host, t3_host, t4_mcu):
    """The clock offset the four timestamps report."""
    raise NotImplementedError("TODO 6: the clock offset the four timestamps report")


def rtos_utilization(tasks):
    """The share of their periods the task set spends executing."""
    raise NotImplementedError("TODO 7: the share of their periods the task set spends executing, taken together")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
