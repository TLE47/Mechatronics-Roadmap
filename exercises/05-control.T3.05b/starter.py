"""Exercise 05-control.T3.05b - your implementation.

Three holes, one per idea the module promised: Rodrigues' exponential from a rotation vector to
SO(3), the multiplicative injection that folds an attitude correction into the nominal rotation,
and the update that resets the error-state mean after that injection.

Fill each one in, then run the tests the way CI does:

    EXERCISE_TARGET=exercises/05-control.T3.05b/starter.py \\
      python3 -m unittest discover -s exercises/05-control.T3.05b -p 'test_*.py'
"""

import math


def exp_so3(rotvec):
    """Rodrigues' formula for exp([rotvec]_x), returning a 3x3 list of lists."""
    raise NotImplementedError(
        "exp_so3: build the skew matrix of rotvec, then I + (sin t / t) K + ((1 - cos t) / t^2) K^2"
    )


def inject_rotation(r_nominal, d_theta):
    """R^+ = R^- exp([d_theta]_x): matrix-multiply the nominal rotation by the correction."""
    raise NotImplementedError("inject_rotation: r_nominal @ exp_so3(d_theta)")


def eskf_rotation_update(r_nominal, d_theta, innovation):
    """Inject d_theta, reset the error-state mean to zero, then apply the next innovation.

    Hint: the reset is what makes the second step safe. Without it the correction just applied is
    still sitting in the mean and goes in again, even when the next innovation is exactly zero.
    """
    raise NotImplementedError(
        "eskf_rotation_update: inject d_theta, set the mean to [0, 0, 0], then inject innovation"
    )
