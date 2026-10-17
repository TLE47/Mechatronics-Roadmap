"""Exercise 00-foundations.T2.00a - the learner's file.

Bring the encoder reading into the state vector: difference it for velocity, integrate it back,
then pack the plant into the one-step matrix update. Fill the six TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00a/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00a -p 'test_*.py'

Units are the plant's: radians, seconds, metres, newtons, kilograms. The encoder is the capstone's
12-bit AS5600 (`plant.ENCODER_CPR`), so a count is `2*pi/4096` rad and the quantisation is real.
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
    """Rectangular running integral: out[k] = out[k-1] + values[k] * dt, out[-1] = 0.

    TODO 3: one accumulator, same length as the input. This is the inverse of `joint_velocity`.
    """
    raise NotImplementedError("TODO 3: accumulate, do not re-integrate from scratch each step")


def state_matrices(m, k, b, dt):
    """(Ad, Bd) for the mass-spring-damper Euler update, as lists.

    x_{k+1} = Ad x_k + Bd u_k,  x = [position, velocity]
    Ad = [[1, dt], [-k/m*dt, 1 - b/m*dt]],  Bd = [0, dt/m]
    """
    raise NotImplementedError("TODO 4: build Ad and Bd from m, k, b, dt")


def one_step(Ad, Bd, x, u):
    """One simultaneous matrix step: both new components use the OLD x. Returns [x1, v1]."""
    raise NotImplementedError("TODO 5: compute both rows before overwriting anything")


def simulate(Ad, Bd, x0, u, steps):
    """Run `steps` matrix steps with constant input `u`; return the final [x, v]."""
    raise NotImplementedError("TODO 6: loop one_step, replacing the state each time")


def encoder_trace_angle(counts, dt, cpr=plant.ENCODER_CPR):
    """Integrate the velocity estimate back into an angle series, starting from the first count.

    This is the round trip an encoder-based observer makes: counts -> velocity -> integral, and it
    must land back on the encoder's own angle (to within quantisation).
    """
    raise NotImplementedError("TODO 7: velocity, then running_integral, then add the start angle")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
