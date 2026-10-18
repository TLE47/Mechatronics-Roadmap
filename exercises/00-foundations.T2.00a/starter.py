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

    TODO 1: difference consecutive samples, convert counts to radians, divide by dt.
    TODO 2: a count that steps 4095 -> 0 is a small positive angle, not a full turn: wrap it.
    Return a list the same length as `counts`; the first entry has no previous sample, so 0.0.
    """
    raise NotImplementedError("TODO 1/2: backward difference of encoder counts, wrapped")


def running_integral(values, dt):
    """Rectangular running integral: out[0] = values[0] * dt, out[k] = out[k-1] + values[k] * dt.

    TODO 3: one accumulator, same length as the input (the first entry already carries the first
    sample). This is the inverse of `joint_velocity`, whose own first entry is 0.0.
    """
    raise NotImplementedError("TODO 3: accumulate, do not re-integrate from scratch each step")


def encoder_trace_angle(counts, dt, cpr=plant.ENCODER_CPR):
    """Integrate the velocity estimate back into an angle series, starting from the first count.

    This is the round trip an encoder-based observer makes: counts -> velocity -> integral, and it
    must land back on the encoder's own angle (to within quantisation).
    """
    raise NotImplementedError("TODO 4: velocity, then running_integral, then add the start angle")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
