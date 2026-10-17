"""Exercise 00-foundations.T1.00b - reference solution.

A recorded window as a list of timestamps, a sensor trace scaled from a parameter dictionary,
the two summary statistics a plot is read for (mean and peak-to-peak span), the per-sample error
of a tracker with its RMS, and the Git command that answers a given question.

Stdlib only, and no `__main__` block: the browser grades this file's stdout against the appended
self-check's single PASS line.
"""

import math

# The module's terminal workflow, as a dictionary: the task you have, the command that does it.
GIT_TASKS = {
    "which lines changed": "git diff",
    "which files changed": "git status",
    "record a snapshot": 'git commit -am "msg"',
    "the history": "git log --oneline",
}


def timestamps(t0_s, dt_s, n):
    """t_i = t0 + i*dt for i = 0 .. n-1, zero-indexed like the list it returns."""
    if n < 1:
        raise ValueError("a recording needs at least one sample")
    if dt_s <= 0.0:
        raise ValueError("the sample spacing must be positive")
    return [t0_s + i * dt_s for i in range(n)]


def scaled_readings(values, config):
    """y_i = slope * x_i + offset, with both constants read from the config dictionary by name."""
    if not isinstance(config, dict):
        raise ValueError("the calibration must be a dictionary with 'slope' and 'offset'")
    for key in ("slope", "offset"):
        if key not in config:
            raise ValueError("the calibration dictionary has no %r key" % key)
    slope = config["slope"]
    offset = config["offset"]
    return [slope * value + offset for value in values]


def mean_of(values):
    """The sample mean, sum(values) / len(values)."""
    if not values:
        raise ValueError("an empty trace has no mean")
    return sum(values) / len(values)


def peak_to_peak(values):
    """The span a plot's y-axis has to cover: max(values) - min(values)."""
    if not values:
        raise ValueError("an empty trace has no span")
    return max(values) - min(values)


def errors(target, measured):
    """Per-sample tracking error e_i = target_i - measured_i, paired by zip()."""
    if len(target) != len(measured):
        raise ValueError(
            "target and measured must hold the same number of samples, not %d and %d"
            % (len(target), len(measured))
        )
    return [want - got for want, got in zip(target, measured)]


def rmse(target, measured):
    """Root-mean-square error: sqrt(mean(e_i^2)), the square taken before the average."""
    per_sample = errors(target, measured)
    if not per_sample:
        raise ValueError("an empty trace has no error")
    return math.sqrt(sum(error * error for error in per_sample) / len(per_sample))


def git_command(task):
    """The command for a task; an unknown task is refused instead of guessed."""
    if task not in GIT_TASKS:
        raise ValueError("no known Git task %r; try one of %s"
                         % (task, ", ".join(sorted(GIT_TASKS))))
    return GIT_TASKS[task]
