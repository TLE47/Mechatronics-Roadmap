"""Planted fault: the MCAP per-message index and timestamp are left out of the budget.

For a 128-byte joint state the 32-byte overhead is a fifth of the traffic, so the recording comes
out 20% smaller on paper than on disk.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def timer_steps(t_timer_s, dt_sim_s):
    if t_timer_s <= 0.0 or dt_sim_s <= 0.0:
        raise ValueError("timer period and simulation step must both be positive")
    return int(math.ceil(t_timer_s / dt_sim_s - 1e-12))


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    return n_subs * msg_bytes * rate_hz / 1e6


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    raw = sum(frequency * payload for _, frequency, payload in topics)
    return compression * raw / 1e6


def bag_size_mb(disk_rate, duration_s):
    return disk_rate * duration_s


def replay_derivative(t_a, value_a, t_b, value_b):
    if t_b == t_a:
        raise ValueError("two identical stamps have no derivative")
    return (value_b - value_a) / (t_b - t_a)


def wall_delay_s(t_a, t_b, rate):
    if rate <= 0.0:
        raise ValueError("playback rate must be positive")
    return (t_b - t_a) / rate


def control_decimation(f_sim_hz, f_ctrl_hz):
    if f_ctrl_hz <= 0.0:
        raise ValueError("controller rate must be positive")
    ratio = f_sim_hz / f_ctrl_hz
    if abs(ratio - round(ratio)) > 1e-9:
        raise ValueError("the controller rate must divide the simulation rate exactly")
    return int(round(ratio))
