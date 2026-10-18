"""Planted fault: the input column enters the position row instead of the velocity row.

Units localise it: `B_d u` sits in the velocity row, so it must be metres per second, and
`dt/m * u` is a velocity increment while putting it in row 0 moves the cart before it has moved.
"""

from solution import *  # noqa: F401,F403


def state_matrices(m, k, b, dt):
    Ad = [[1.0, dt],
          [-(k / m) * dt, 1.0 - (b / m) * dt]]
    Bd = [dt / m, 0.0]                                     # injected: rows swapped
    return Ad, Bd
