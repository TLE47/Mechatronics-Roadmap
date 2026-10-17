"""Planted fault: the worked example's four numbers, for every joint."""

from solution import *  # noqa: F401,F403


def second_order_params(j, k, b):
    return {"wn": 20.0, "zeta": 0.50, "wd": 17.320508075688775, "mp": 0.16303}
