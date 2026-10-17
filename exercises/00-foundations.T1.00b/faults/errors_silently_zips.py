"""Planted fault: the error list silently truncates a length mismatch through zip().

Three targets against two measurements return a two-sample error list and no complaint - the
same silent truncation that lets a mis-sized x-axis through to `plt.plot`, where it surfaces far
from the bug. The module's fix is to check the lengths before pairing.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math

GIT_TASKS = {
    "which lines changed": "git diff",
    "which files changed": "git status",
    "record a snapshot": 'git commit -am "msg"',
    "the history": "git log --oneline",
}


def timestamps(t0_s, dt_s, n):
    """t_i = t0 + i*dt."""
    if n < 1:
        raise ValueError("a recording needs at least one sample")
    if dt_s <= 0.0:
        raise ValueError("the sample spacing must be positive")
    return [t0_s + i * dt_s for i in range(n)]


def scaled_readings(values, config):
    """y_i = slope * x_i + offset."""
    if not isinstance(config, dict):
        raise ValueError("the calibration must be a dictionary with 'slope' and 'offset'")
    for key in ("slope", "offset"):
        if key not in config:
            raise ValueError("the calibration dictionary has no %r key" % key)
    slope = config["slope"]
    offset = config["offset"]
    return [slope * value + offset for value in values]


def mean_of(values):
    """The sample mean."""
    if not values:
        raise ValueError("an empty trace has no mean")
    return sum(values) / len(values)


def peak_to_peak(values):
    """max - min."""
    if not values:
        raise ValueError("an empty trace has no span")
    return max(values) - min(values)


def errors(target, measured):
    """Per-sample tracking error, zipped to the shorter of the two traces."""
    return [want - got for want, got in zip(target, measured)]


def rmse(target, measured):
    """sqrt(mean(e_i^2))."""
    per_sample = errors(target, measured)
    if not per_sample:
        raise ValueError("an empty trace has no error")
    return math.sqrt(sum(error * error for error in per_sample) / len(per_sample))


def git_command(task):
    """The command for a task."""
    if task not in GIT_TASKS:
        raise ValueError("no known Git task %r; try one of %s"
                         % (task, ", ".join(sorted(GIT_TASKS))))
    return GIT_TASKS[task]
