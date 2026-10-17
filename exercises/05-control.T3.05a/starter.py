"""Exercise 05-control.T3.05a - your implementation.

Seven holes, one per idea the module promised: the Joseph-form covariance update, its optimal
gain, the CBF-QP projection, the exponential margin it guarantees, the SO(3) exponential, the
error-state injection, and the NEES that says whether the covariance was honest.

Fill each one in, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/05-control.T3.05a/starter.py \
      python3 -m unittest discover -s exercises/05-control.T3.05a -p 'test_*.py'
"""

import math


def optimal_gain(p_minus, h, r):
    """K = P^- H / (H P^- H + R). Hint: the denominator carries R, not just the prior."""
    raise NotImplementedError("optimal_gain: K = p_minus * h / (h * p_minus * h + r)")


def joseph_variance(p_minus, h, r, k):
    """P^+ = (1 - K H) P^- (1 - K H) + K R K. Hint: both terms are squares, never a subtraction."""
    raise NotImplementedError("joseph_variance: square the (1 - k * h) factor and add k^2 * r")


def cbf_command(u_nom, h_value, alpha, u_min=-2.0, u_max=2.0):
    """Project u_nom onto `u <= alpha * h` and the actuator bounds, minimally.

    Hint: `hdot = -u`, so the CBF inequality `hdot + alpha h >= 0` caps the command, it does not
    floor it. Refuse an empty admissible interval instead of clamping to nonsense.
    """
    raise NotImplementedError("cbf_command: upper = min(u_max, alpha * h_value), then clip")


def barrier_lower_bound(h0, alpha, t):
    """The guaranteed margin h0 exp(-alpha t). Hint: no alpha means a straight horizontal line."""
    raise NotImplementedError("barrier_lower_bound: h0 * math.exp(-alpha * t)")


def exp_so3(rotvec):
    """Rodrigues' formula for exp([rotvec]_x), returning a 3x3 list of lists."""
    raise NotImplementedError(
        "exp_so3: build the skew matrix of rotvec, then I + (sin t / t) K + ((1 - cos t) / t^2) K^2"
    )


def inject_rotation(r_nominal, d_theta):
    """R^+ = R^- exp([d_theta]_x): matrix-multiply the nominal rotation by the correction."""
    raise NotImplementedError("inject_rotation: r_nominal @ exp_so3(d_theta)")


def nees_diagonal(error, variances):
    """NEES = sum(e_i^2 / v_i) for a diagonal covariance. Hint: divide, do not subtract."""
    raise NotImplementedError("nees_diagonal: sum(e * e / v for e, v in zip(error, variances))")
