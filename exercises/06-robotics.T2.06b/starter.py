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
    raise NotImplementedError("TODO 1: how many simulation steps a timer period needs, never early")


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    """Bandwidth not copied by composable subscribers, in MB/s."""
    raise NotImplementedError("TODO 2: the bandwidth the subscriber group avoids copying, for all its members")


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    """Sustained write rate for `(name, frequency, payload_bytes)` topics."""
    raise NotImplementedError("TODO 3: the sustained write rate with every message's index overhead and the recording's compression")


def bag_size_mb(disk_rate, duration_s):
    """File size of a recording."""
    raise NotImplementedError("TODO 4: the file size this recording reaches over the duration")


def replay_derivative(t_a, value_a, t_b, value_b):
    """Derivative from the message's own timestamps."""
    raise NotImplementedError("TODO 5: the rate of change between the two samples, on the recording's own clock")


def wall_delay_s(t_a, t_b, rate):
    """Wall-clock delay a `--rate r` replay sleeps for a message gap."""
    raise NotImplementedError("TODO 6: the wall-clock wait a replay spends on that message gap at this rate")


def control_decimation(f_sim_hz, f_ctrl_hz):
    """How many simulator steps each controller update spans."""
    raise NotImplementedError("TODO 7: the decimation, refusing a controller rate that does not fit the simulator evenly")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
