"""Exercise 00-foundations.T1.00b - the learner's file.

A recorded window, a scaled sensor trace, the two summary statistics, the per-sample tracking
error with its RMS, and the Git command behind a task. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00b/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00b -p 'test_*.py'
"""

import math


def timestamps(t0_s, dt_s, n):
    """The timestamps of n evenly spaced steps from the start."""
    raise NotImplementedError("TODO 1: the timestamp of each evenly spaced step")


def scaled_readings(values, config):
    """The readings converted with the sensor's own named calibration."""
    raise NotImplementedError("TODO 2: the readings converted with the sensor's own named calibration")


def mean_of(values):
    """The sample mean."""
    raise NotImplementedError("TODO 3: the typical value of the sample")


def peak_to_peak(values):
    """The full span between the smallest and largest value."""
    raise NotImplementedError("TODO 4: the full span the samples cover")


def errors(target, measured):
    """The per-sample gap between the two series, in order."""
    raise NotImplementedError("TODO 5: the gap between target and measurement at each sample")


def rmse(target, measured):
    """The root-mean-square of the per-sample errors."""
    raise NotImplementedError("TODO 6: the overall error magnitude, with signs unable to cancel")


def git_command(task):
    """The command for a task."""
    raise NotImplementedError("TODO 7: the command recorded for the task, refusing an unknown one")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
