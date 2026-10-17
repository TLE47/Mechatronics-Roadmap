"""Planted fault: velocity without dividing by the sample time.

The most common discrete-derivative mistake, and the one the module warns about: the number looks
like a velocity, grows with sampling rate, and is wrong by exactly 1/dt. Caught by the test that
changes dt and expects the estimate to change with it.
"""

from solution import *  # noqa: F401,F403
from solution import joint_velocity as _joint_velocity


def joint_velocity(counts, dt, cpr=0):
    # Injected: the difference, in radians, never divided by dt.
    import mechalab_plant as plant

    cpr = cpr or plant.ENCODER_CPR
    velocities = [0.0]
    for k in range(1, len(counts)):
        delta = plant.wrap_pi(plant.counts_to_rad(counts[k], cpr=cpr)
                              - plant.counts_to_rad(counts[k - 1], cpr=cpr))
        velocities.append(delta)
    return velocities

# This module also hands `encoder_trace_angle` the raw difference, so the integration no longer
# cancels - a second symptom of the same missing scale factor.
_original_trace = encoder_trace_angle
