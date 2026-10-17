"""Exercise 06-robotics.T2.06b - reference solution.

Five operational numbers: how many simulation steps a timer waits, what a composable node avoids
copying, what a recording costs on disk, how a replay scales wall time, and how often the
controller runs inside the simulator. The timer step count is a ceiling - a 3.5-step period cannot
fire every 3 steps without drifting ahead of the clock.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def timer_steps(t_timer_s, dt_sim_s):
    """Simulation steps between timer firings: `ceil(T / dt)`, never a rounded quotient."""
    if t_timer_s <= 0.0 or dt_sim_s <= 0.0:
        raise ValueError("timer period and simulation step must both be positive")
    return int(math.ceil(t_timer_s / dt_sim_s - 1e-12))


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    """Bandwidth not copied when `n_subs` composable subscribers take a unique_ptr, in MB/s."""
    return n_subs * msg_bytes * rate_hz / 1e6


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    """Sustained write rate for `(name, frequency, payload_bytes)` topics, in MB/s."""
    raw = sum(frequency * (payload + meta_bytes) for _, frequency, payload in topics)
    return compression * raw / 1e6


def bag_size_mb(disk_rate, duration_s):
    """File size of a recording: rate times duration."""
    return disk_rate * duration_s


def replay_derivative(t_a, value_a, t_b, value_b):
    """Numerical derivative from the message's own timestamps - the same at any playback rate."""
    if t_b == t_a:
        raise ValueError("two identical stamps have no derivative")
    return (value_b - value_a) / (t_b - t_a)


def wall_delay_s(t_a, t_b, rate):
    """Wall-clock delay a `--rate r` replay actually sleeps for a `t_b - t_a` message gap."""
    if rate <= 0.0:
        raise ValueError("playback rate must be positive")
    return (t_b - t_a) / rate


def control_decimation(f_sim_hz, f_ctrl_hz):
    """Integer decimation `D = f_sim / f_ctrl`, refusing a ratio that is not integral."""
    if f_ctrl_hz <= 0.0:
        raise ValueError("controller rate must be positive")
    ratio = f_sim_hz / f_ctrl_hz
    if abs(ratio - round(ratio)) > 1e-9:
        raise ValueError("the controller rate must divide the simulation rate exactly")
    return int(round(ratio))


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
