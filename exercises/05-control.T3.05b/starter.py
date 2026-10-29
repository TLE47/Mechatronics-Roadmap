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
    """The rotation matrix this rotation vector describes, as a 3x3 list of lists."""
    raise NotImplementedError("exp_so3: the rotation matrix this rotation vector describes")


def inject_rotation(r_nominal, d_theta):
    """The nominal rotation with this small correction applied on its right."""
    raise NotImplementedError("inject_rotation: the nominal rotation with this small correction applied")


def eskf_rotation_update(r_nominal, d_theta, innovation):
    """The corrected rotation after this innovation, with the error-state mean reset to zero.

    Hint: the reset is what makes the second step safe. Without it the correction just applied is
    still sitting in the mean and goes in again, even when the next innovation is exactly zero.
    """
    raise NotImplementedError(
        "eskf_rotation_update: the corrected rotation after this innovation, with the error-state mean reset"
    )
