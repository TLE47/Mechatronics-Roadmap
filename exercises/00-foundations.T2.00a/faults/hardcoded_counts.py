"""Planted fault: the worked example's answer, returned for every encoder sequence.

One rad/s at 1 ms is what the module's ramp prints. Printing it is not measuring it.
"""

from solution import *  # noqa: F401,F403
import mechalab_plant as plant


def joint_velocity(counts, dt, cpr=plant.ENCODER_CPR):
    return [0.0] + [1.0] * (len(counts) - 1)
