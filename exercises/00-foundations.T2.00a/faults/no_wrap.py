"""Planted fault: the raw count difference, no wrap.

Correct everywhere except one sample per revolution, where 4095 -> 0 is read as -4095 counts: the
joint appears to spin backwards at -2*pi/dt rad/s for one tick. Exactly the fault an encoder learner
hits, and invisible in any test that never crosses the zero.
"""

from solution import *  # noqa: F401,F403
import mechalab_plant as plant


def joint_velocity(counts, dt, cpr=plant.ENCODER_CPR):
    velocities = [0.0]
    for k in range(1, len(counts)):
        delta = plant.counts_to_rad(counts[k], cpr=cpr) - plant.counts_to_rad(counts[k - 1], cpr=cpr)
        velocities.append(delta / dt)
    return velocities
