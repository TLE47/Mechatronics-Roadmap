"""Planted fault: "peak-to-peak" reports half the span, i.e. the amplitude.

A 0.5 V to 1.7 V trace is 1.20 V peak-to-peak; halving it makes the plot's y-axis too short and
reports the 0.60 V amplitude as if it were the full excursion.

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
    """The amplitude, (max - min) / 2, not the span."""
    if not values:
        raise ValueError("an empty trace has no span")
    return (max(values) - min(values)) / 2.0


def errors(target, measured):
    """Per-sample tracking error."""
    if len(target) != len(measured):
        raise ValueError(
            "target and measured must hold the same number of samples, not %d and %d"
            % (len(target), len(measured))
        )
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
