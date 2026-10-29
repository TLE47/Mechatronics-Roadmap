"""Exercise 00-foundations.T2.00a - the learner's file.

Bring the encoder reading into a velocity: difference it across one sample, wrap the difference at
the encoder's zero, then integrate it back and land on the angle you started from. Fill the three
holes (four TODOs), then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00a -p 'test_*.py'

Units are the plant's: radians and seconds. The encoder is the capstone's 12-bit AS5600
(`plant.ENCODER_CPR`), so a count is `2*pi/4096` rad and the quantisation is real.
"""

import math

import mechalab_plant as plant


def joint_velocity(counts, dt, cpr=plant.ENCODER_CPR):
    """Joint speed in rad/s from a sequence of absolute encoder counts, one sample per `dt`.

    Return a list the same length as `counts`; the first entry has no previous sample, so 0.0.
    """
    raise NotImplementedError("TODO 1/2: the joint speed each sample implies, even where the encoder rolls over")


def running_integral(values, dt):
    """The running total of these samples, one per `dt`.

    The result has the same length as the input, and its first entry is the first sample. This is
    the inverse of `joint_velocity`, whose own first entry is 0.0.
    """
    raise NotImplementedError("TODO 3: the running total of these samples, one entry per input")


def encoder_trace_angle(counts, dt, cpr=plant.ENCODER_CPR):
    """The angle series this encoder trace implies, starting from the first count.

    This is the round trip an encoder-based observer makes, and it must land back on the
    encoder's own angle (to within quantisation).
    """
    raise NotImplementedError("TODO 4: the angle series, starting from the first count")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
