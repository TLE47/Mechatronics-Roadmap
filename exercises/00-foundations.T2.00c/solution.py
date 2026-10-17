"""Exercise 00-foundations.T2.00c - reference solution.

The two orders answer different questions. A first-order system has one number, tau, and reaches
63.2% of a step at t = tau. A second-order system has two, wn and zeta, and those two predict the
overshoot before you simulate anything. The third answer is about the simulation itself: the scheme
is only stable while dt * wn stays below 2, which is a property of the integrator, not the physics.
"""

import math

import mechalab_plant as plant


def first_order_response(t, tau):
    """1 - exp(-t/tau)."""
    return 1.0 - math.exp(-t / tau)


def second_order_params(j, k, b):
    """Natural frequency, damping ratio, damped frequency and fractional overshoot."""
    wn = math.sqrt(k / j)
    zeta = b / (2.0 * math.sqrt(j * k))
    if zeta >= 1.0:
        return {"wn": wn, "zeta": zeta, "wd": 0.0, "mp": 0.0}
    root = math.sqrt(1.0 - zeta * zeta)
    return {"wn": wn, "zeta": zeta, "wd": wn * root, "mp": math.exp(-math.pi * zeta / root)}


def critical_damping(j, k):
    """b at zeta = 1.0."""
    return 2.0 * math.sqrt(j * k)


def settling_time(wn, zeta, tolerance=0.02):
    """2% settling time for a second-order step, 4 / (zeta wn)."""
    if zeta <= 0.0:
        raise ValueError("an undamped or unstable system never settles")
    return 4.0 / (zeta * wn)


def simulate_step(j, k, b, dt, steps, theta0=0.0, omega0=0.0):
    """Semi-implicit Euler on the closed-loop joint, velocity before position."""
    theta = theta0
    omega = omega0
    max_theta = theta
    for _ in range(steps):
        alpha = (k * (1.0 - theta) - b * omega) / j
        omega += alpha * dt
        theta += omega * dt
        if theta > max_theta:
            max_theta = theta
    return {"theta": theta, "max_theta": max_theta, "mp": max(0.0, max_theta - 1.0)}


def max_stable_dt(j, k):
    """Largest dt for which the semi-implicit map stays bounded: 2 / wn."""
    return 2.0 / math.sqrt(k / j)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
