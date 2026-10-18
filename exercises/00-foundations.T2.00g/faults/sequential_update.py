"""Planted fault: x overwritten before the velocity row is computed.

Correct whenever the initial velocity is zero, which is every equilibrium demo. The state with
v = 0.20 is what separates it from a simultaneous update.
"""

from solution import *  # noqa: F401,F403


def one_step(Ad, Bd, x, u):
    x1 = Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0] * u
    v1 = Ad[1][0] * x1 + Ad[1][1] * x[1] + Bd[1] * u       # injected: the NEW position
    return [x1, v1]
