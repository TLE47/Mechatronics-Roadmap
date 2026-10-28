"""Exercise 00-foundations.T2.00c - the learner's file.

One first-order response, one second-order response, and the step size where the simulation stops
telling the truth. Fill the six TODOs, then run the tests:

    EXERCISE_TARGET=exercises/00-foundations.T2.00c/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00c -p 'test_*.py'

Units are the module's: seconds, radians, kg*m^2, N*m/rad, N*m*s/rad.
"""

import math

import mechalab_plant as plant


def first_order_response(t, tau):
    """Unit-step response 1 - exp(-t/tau). At t = tau this is 0.6321, by definition."""
    raise NotImplementedError("TODO 1: the exponential step response")


def second_order_params(j, k, b):
    """{"wn", "zeta", "wd", "mp"} for J theta'' + b theta' + k theta = k u.

    TODO 2: the four numbers of a second-order system: its natural frequency, the damping
    ratio, the damped frequency, and the overshoot each one predicts. At or past critical
    damping nothing rings, so there is no overshoot and no damped frequency.
    """
    raise NotImplementedError("TODO 2: the four numbers that describe a second-order system")


def critical_damping(j, k):
    """The b that makes zeta exactly 1.0."""
    raise NotImplementedError(
        "TODO 3: the damping that makes the ratio exactly one, not the value that makes the numerator one"
    )


def settling_time(wn, zeta, tolerance=0.02):
    """The 2% settling time, 4 / (zeta * wn) - and refuse zeta <= 0 (it never settles)."""
    raise NotImplementedError("TODO 4: the envelope's exponential decay is what sets the time")


def simulate_step(j, k, b, dt, steps, theta0=0.0, omega0=0.0):
    """Semi-implicit Euler on J theta'' = k (1 - theta) - b theta'.

    Returns {"theta", "max_theta", "mp"} where mp = max(0, max_theta - 1). Update velocity first,
    then position with the NEW velocity - the same order the plant uses.
    """
    raise NotImplementedError("TODO 5: the simulation the worked example runs")


def max_stable_dt(j, k):
    """The largest dt this semi-implicit scheme tolerates for an undamped joint: 2 / wn."""
    raise NotImplementedError("TODO 6: the stability limit, not a guess")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
