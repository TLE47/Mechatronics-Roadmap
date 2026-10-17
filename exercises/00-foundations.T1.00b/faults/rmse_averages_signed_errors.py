"""Planted fault: the RMSE averages the signed errors instead of their squares.

The exercise's errors +0.1, -0.1, +0.2, -0.2 average to 0.0 rad, so this reports a perfect
tracker for a 0.158 rad error - exactly the cancellation the module's "If your result differs"
note warns about.

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
    """Per-sample tracking error."""
    if len(target) != len(measured):
        raise ValueError(
            "target and measured must hold the same number of samples, not %d and %d"
            % (len(target), len(measured))
        )
    return [want - got for want, got in zip(target, measured)]


def rmse(target, measured):
    """The mean signed error, labelled RMS - the squared terms never make it in."""
    per_sample = errors(target, measured)
    if not per_sample:
        raise ValueError("an empty trace has no error")
    return abs(sum(per_sample) / len(per_sample))


def git_command(task):
    """The command for a task."""
    if task not in GIT_TASKS:
        raise ValueError("no known Git task %r; try one of %s"
                         % (task, ", ".join(sorted(GIT_TASKS))))
    return GIT_TASKS[task]
