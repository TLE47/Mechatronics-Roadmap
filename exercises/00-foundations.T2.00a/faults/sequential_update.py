"""Planted fault: x overwritten before v is computed.

The module's own "if your result differs" note. It passes every test whose initial velocity is zero
- which is most of them - and fails the moment the state carries velocity into the step.
"""

from solution import *  # noqa: F401,F403


def one_step(Ad, Bd, x, u):
    x0 = Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0] * u
    v0 = Ad[1][0] * x0 + Ad[1][1] * x[1] + Bd[1] * u       # injected: the NEW position
    return [x0, v0]
