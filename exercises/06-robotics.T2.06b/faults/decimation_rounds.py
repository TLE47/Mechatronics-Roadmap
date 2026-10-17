"""Planted fault: a non-integral decimation is rounded to the nearest integer.

1000 / 300 becomes 3, which silently runs the controller at 333 Hz - a number nobody asked for and
no one will find in the launch file.
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
    raw = sum(frequency * (payload + meta_bytes) for _, frequency, payload in topics)
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
    return int(round(f_sim_hz / f_ctrl_hz))
