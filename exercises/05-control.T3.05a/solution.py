"""Exercise 05-control.T3.05a - reference solution.

Three Tier 3 tools that keep a floating-point filter honest and a fast joint off its stop: the
Joseph-form covariance update, the tangent-space error injection onto SO(3) with its reset, and
the 1D Control Barrier Function QP that projects a nominal command onto the safe half-space.
"""

import math


def _vector(value, length, name):
    """A plain list of floats of exactly `length` entries, or a ValueError naming the argument."""
    if not isinstance(value, (list, tuple)) or len(value) != length:
        raise ValueError("%s must be a %d-vector" % (name, length))
    return [float(item) for item in value]


def _matrix(value):
    """A 3x3 matrix as a list of three lists of three floats."""
    if not isinstance(value, (list, tuple)) or len(value) != 3:
        raise ValueError("a rotation is a 3x3 matrix")
    rows = []
    for row in value:
        if not isinstance(row, (list, tuple)) or len(row) != 3:
            raise ValueError("a rotation is a 3x3 matrix")
        rows.append([float(item) for item in row])
    return rows


def optimal_gain(p_minus, h, r):
    """The scalar Kalman gain K = P^- H / (H P^- H + R)."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if h <= 0.0:
        raise ValueError("a zero measurement Jacobian carries no information")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    return p_minus * h / (h * p_minus * h + r)


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K: a sum of two squares, so never negative."""
    if p_minus < 0.0:
        raise ValueError("a variance cannot be negative")
    if r <= 0.0:
        raise ValueError("measurement noise variance is strictly positive")
    a = 1.0 - k * h
    return a * a * p_minus + k * k * r


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """The CBF-QP's closed form for `hdot = -u`: u <= alpha * h, clipped to the actuator bounds.

    The constraint is `hdot + alpha h >= 0`; with `hdot = -u` it is `u <= alpha h`. When the
    nominal command already satisfies it the projection returns it unchanged - that is what
    "minimally invasive" means.
    """
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if u_min >= u_max:
        raise ValueError("the actuator bounds must leave an interval, not %r >= %r"
                         % (u_min, u_max))
    upper = min(u_max, alpha * h_value)
    if upper < u_min:
        raise ValueError("infeasible: the barrier allows at most %r, below u_min %r"
                         % (upper, u_min))
    return min(max(u_nom, u_min), upper)


def barrier_lower_bound(h0, alpha, t):
    """The guaranteed margin h(t) >= h0 exp(-alpha t) under the CBF condition, in the same unit."""
    if h0 < 0.0:
        raise ValueError("the initial margin is a distance, so it cannot be negative")
    if alpha <= 0.0:
        raise ValueError("the barrier gain must be positive")
    if t < 0.0:
        raise ValueError("time only runs forwards in this filter")
    return h0 * math.exp(-alpha * t)


def exp_so3(rotvec):
    """Rodrigues: exp([rotvec]_x), the rotation its axis-angle vector names."""
    w = _vector(rotvec, 3, "rotvec")
    theta = math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
    skew = [
        [0.0, -w[2], w[1]],
        [w[2], 0.0, -w[0]],
        [-w[1], w[0], 0.0],
    ]
    square = [
        [sum(skew[i][m] * skew[m][j] for m in range(3)) for j in range(3)]
        for i in range(3)
    ]
    if theta < 1e-8:
        # sin(theta)/theta -> 1 and (1 - cos theta)/theta^2 -> 1/2; the half-angle form keeps
        # the second coefficient exact instead of subtracting two numbers that are both 1.
        first, second = 1.0, 0.5
    else:
        first = math.sin(theta) / theta
        second = 2.0 * math.sin(0.5 * theta) ** 2 / (theta * theta)
    return [
        [(1.0 if i == j else 0.0) + first * skew[i][j] + second * square[i][j]
         for j in range(3)]
        for i in range(3)
    ]


def inject_rotation(r_nominal, d_theta):
    """R^+ = R^- exp([d_theta]_x): fold the posterior tangent-space error into the rotation."""
    r = _matrix(r_nominal)
    step = exp_so3(d_theta)
    return [
        [sum(r[i][m] * step[m][j] for m in range(3)) for j in range(3)]
        for i in range(3)
    ]


def nees_diagonal(error, variances):
    """NEES = e^T P^-1 e for a diagonal covariance: the sum of each error over its own variance."""
    e = [float(item) for item in error]
    v = [float(item) for item in variances]
    if not e or len(e) != len(v):
        raise ValueError("the error and its variances must be non-empty and the same length")
    for item in v:
        if item <= 0.0:
            raise ValueError("a variance must be strictly positive to be inverted")
    return sum(item * item / var for item, var in zip(e, v))
