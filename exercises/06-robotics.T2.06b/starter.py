"""Exercise 06-robotics.T2.06b - the learner's file.

A simulated clock, a composable node's saving, a recording's cost, a replay's wall time and the
simulator's decimation. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T2.06b/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T2.06b -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def timer_steps(t_timer_s, dt_sim_s):
    """Simulation steps between timer firings."""
    raise NotImplementedError("TODO 1: a ceiling, not a rounded quotient")


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    """Bandwidth not copied by composable subscribers, in MB/s."""
    raise NotImplementedError("TODO 2: multiply by the subscriber count, not by one")


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    """Sustained write rate for `(name, frequency, payload_bytes)` topics."""
    raise NotImplementedError("TODO 3: meta bytes per message, compression on the total")


def bag_size_mb(disk_rate, duration_s):
    """File size of a recording."""
    raise NotImplementedError("TODO 4: rate times duration")


def replay_derivative(t_a, value_a, t_b, value_b):
    """Derivative from the message's own timestamps."""
    raise NotImplementedError("TODO 5: divide by the MESSAGE gap, not the wall-clock gap")


def wall_delay_s(t_a, t_b, rate):
    """Wall-clock delay a `--rate r` replay sleeps for a message gap."""
    raise NotImplementedError("TODO 6: the message gap divided by the rate")


def control_decimation(f_sim_hz, f_ctrl_hz):
    """Integer decimation `D = f_sim / f_ctrl`."""
    raise NotImplementedError("TODO 7: refuse a ratio that is not a whole number")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
