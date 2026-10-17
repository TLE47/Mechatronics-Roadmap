"""Exercise 02-mechanics.T3.02a - reference solution.

The 6D screw axis of a joint, the mechanical power a twist delivers through a wrench, the
Paros-Weisbord stiffness and surface stress of a circular notch flexure, the thickness scaling
that law implies, and the two-pass (outward velocity, inward wrench) recursion on a two-link chain.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def _vector(value, length, name):
    """A plain list of floats of exactly `length` entries, or a ValueError naming the argument."""
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError("%s must be a %d-vector" % (name, length))
    return [float(item) for item in value]


def _cross3(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def screw_axis(omega, q):
    """The unit screw axis S = [omega, -omega x q] of a joint through q, in the base frame.

    `omega` is the joint's unit rotation axis; a prismatic joint passes the zero vector and gets
    zero angular part. `q` is a point on the axis in the home configuration.
    """
    w = _vector(omega, 3, "omega")
    point = _vector(q, 3, "q")
    norm = math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
    if norm != 0.0 and abs(norm - 1.0) > 1e-9:
        raise ValueError("omega must be a unit axis (or zero for a prismatic joint), not %r" % (omega,))
    linear = _cross3(w, point)
    return [w[0], w[1], w[2], -linear[0], -linear[1], -linear[2]]


def spatial_power(twist, wrench):
    """Instantaneous mechanical power P = V^T F = omega . m + v . f, in watts."""
    velocity = _vector(twist, 6, "twist")
    force = _vector(wrench, 6, "wrench")
    return sum(a * b for a, b in zip(velocity, force))


def flexure_stiffness(e_pa, b_m, t_m, r_m):
    """Paros-Weisbord rotational stiffness K_theta = 2 E b t^(5/2) / (9 pi sqrt(R)), N*m/rad."""
    if e_pa <= 0.0 or b_m <= 0.0 or t_m <= 0.0 or r_m <= 0.0:
        raise ValueError("E, b, t and R are all positive")
    if t_m >= r_m:
        raise ValueError("the thin-web formula assumes t << R, not t = %g m at R = %g m"
                         % (t_m, r_m))
    return (2.0 * e_pa * b_m * (t_m ** 2.5)) / (9.0 * math.pi * math.sqrt(r_m))


def flexure_stress(k_theta, theta_rad, b_m, t_m, r_m):
    """Peak surface bending stress, Pa: sigma = 6 Kt M_b / (b t^2) with M_b = K_theta * theta."""
    if b_m <= 0.0 or t_m <= 0.0 or r_m <= 0.0:
        raise ValueError("b, t and R are all positive")
    if not math.isfinite(k_theta) or not math.isfinite(theta_rad):
        raise ValueError("stiffness and deflection must be finite")
    concentration = 1.0 + t_m / (2.0 * r_m)
    return 6.0 * concentration * (k_theta * theta_rad) / (b_m * t_m * t_m)


def thickness_scale(factor):
    """How K_theta scales when the web thickness is multiplied by `factor`: factor^(5/2)."""
    if factor <= 0.0 or not math.isfinite(factor):
        raise ValueError("a thickness factor must be positive and finite")
    return factor ** 2.5


def rnea_2link(i1, i2, ddq1, ddq2):
    """Two-pass RNEA on a two-link chain: (tau_1, tau_2) for joint accelerations (ddq1, ddq2)."""
    if i1 <= 0.0 or i2 <= 0.0:
        raise ValueError("inertias are positive")
    alpha1 = ddq1
    alpha2 = alpha1 + ddq2  # the second link accelerates with the first one carried along
    tau2 = i2 * alpha2
    tau1 = i1 * alpha1 + tau2  # inward pass: the link's own torque plus everything outboard
    return tau1, tau2


def passivity_quadratic_form(m_dot, c, dq):
    """dq^T (Mdot - 2C) dq, the quadratic form Christoffel symbols make identically zero."""
    n = len(dq) if isinstance(dq, (list, tuple)) else -1
    if n <= 0:
        raise ValueError("dq must be a non-empty vector")
    for name, matrix in (("m_dot", m_dot), ("c", c)):
        if not isinstance(matrix, (list, tuple)) or len(matrix) != n:
            raise ValueError("%s must be a %d-by-%d matrix" % (name, n, n))
        for row in matrix:
            if not isinstance(row, (list, tuple)) or len(row) != n:
                raise ValueError("%s must be a %d-by-%d matrix" % (name, n, n))
    velocities = _vector(dq, n, "dq")
    total = 0.0
    for i in range(n):
        for j in range(n):
            total += velocities[i] * (m_dot[i][j] - 2.0 * c[i][j]) * velocities[j]
    return total


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
