"""Fault: the notch stiffness uses t^2 where Paros-Weisbord has t^(5/2)."""

import math

import mechalab_plant as plant  # noqa: F401


def _vector(value, length, name):
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError("%s must be a %d-vector" % (name, length))
    return [float(item) for item in value]


def _cross3(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def screw_axis(omega, q):
    w = _vector(omega, 3, "omega")
    point = _vector(q, 3, "q")
    norm = math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
    if norm != 0.0 and abs(norm - 1.0) > 1e-9:
        raise ValueError("omega must be a unit axis (or zero for a prismatic joint), not %r" % (omega,))
    linear = _cross3(w, point)
    return [w[0], w[1], w[2], -linear[0], -linear[1], -linear[2]]


def spatial_power(twist, wrench):
    velocity = _vector(twist, 6, "twist")
    force = _vector(wrench, 6, "wrench")
    return sum(a * b for a, b in zip(velocity, force))


def flexure_stiffness(e_pa, b_m, t_m, r_m):
    if e_pa <= 0.0 or b_m <= 0.0 or t_m <= 0.0 or r_m <= 0.0:
        raise ValueError("E, b, t and R are all positive")
    if t_m >= r_m:
        raise ValueError("the thin-web formula assumes t << R")
    return (2.0 * e_pa * b_m * (t_m ** 2.0)) / (9.0 * math.pi * math.sqrt(r_m))


def flexure_stress(k_theta, theta_rad, b_m, t_m, r_m):
    if b_m <= 0.0 or t_m <= 0.0 or r_m <= 0.0:
        raise ValueError("b, t and R are all positive")
    concentration = 1.0 + t_m / (2.0 * r_m)
    return 6.0 * concentration * (k_theta * theta_rad) / (b_m * t_m * t_m)


def thickness_scale(factor):
    if factor <= 0.0:
        raise ValueError("a thickness factor must be positive")
    return factor ** 2.5


def rnea_2link(i1, i2, ddq1, ddq2):
    if i1 <= 0.0 or i2 <= 0.0:
        raise ValueError("inertias are positive")
    alpha1 = ddq1
    alpha2 = alpha1 + ddq2
    tau2 = i2 * alpha2
    tau1 = i1 * alpha1 + tau2
    return tau1, tau2


def passivity_quadratic_form(m_dot, c, dq):
    n = len(dq)
    velocities = _vector(dq, n, "dq")
    total = 0.0
    for i in range(n):
        for j in range(n):
            total += velocities[i] * (m_dot[i][j] - 2.0 * c[i][j]) * velocities[j]
    return total
