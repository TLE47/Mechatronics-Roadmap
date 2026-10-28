"""Exercise 00-foundations.T1.00b - the learner's file.

A recorded window, a scaled sensor trace, the two summary statistics, the per-sample tracking
error with its RMS, and the Git command behind a task. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00b/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00b -p 'test_*.py'
"""

import math


def timestamps(t0_s, dt_s, n):
    """t_i = t0 + i*dt for i = 0 .. n-1."""
    raise NotImplementedError("TODO 1: start at zero, so the last index is one less than the count")


def scaled_readings(values, config):
    """y_i = slope * x_i + offset, both constants looked up by name."""
    raise NotImplementedError("TODO 2: look up the slope and offset by name, then apply the line they define")


def mean_of(values):
    """The sample mean."""
    raise NotImplementedError("TODO 3: sum the values, then divide by how many there are")


def peak_to_peak(values):
    """max - min, the span a plot has to cover."""
    raise NotImplementedError("TODO 4: the span is a MAXIMUM minus a MINIMUM, not a half-span")


def errors(target, measured):
    """e_i = target_i - measured_i, paired by zip()."""
    raise NotImplementedError("TODO 5: target minus measured, sample by sample, same length")


def rmse(target, measured):
    """sqrt(mean(e_i^2))."""
    raise NotImplementedError("TODO 6: SQUARE each error before averaging — signed errors cancel")


def git_command(task):
    """The command for a task."""
    raise NotImplementedError("TODO 7: a dictionary lookup by task name, and refuse a miss")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
