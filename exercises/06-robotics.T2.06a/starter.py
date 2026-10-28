"""Exercise 06-robotics.T2.06a - the learner's file.

The graph's QoS rule, a tf2 chain, its inverse, the buffer's interpolation and a bandwidth budget.
Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T2.06a/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T2.06a -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def qos_compatible(pub_reliable, pub_transient_local, sub_reliable, sub_transient_local):
    """True when the publisher's offer satisfies the subscriber's request on both policies."""
    raise NotImplementedError("TODO 1: two independent inequalities, not a match")


def urdf_revolute_z(xyz, q_rad):
    """`[Rz(q), xyz; 0, 1]` for a revolute joint about +Z."""
    raise NotImplementedError("TODO 2: the rotation is in the top-left block, the offset in the last column")


def mat4_mul(a, b):
    """Product of two 4x4 homogeneous transforms."""
    raise NotImplementedError("TODO 3: row-by-column over four, in the right order - A then B")


def transform_point(t, p):
    """Apply a homogeneous transform to a 3-vector."""
    raise NotImplementedError("TODO 4: rotate, then add the translation")


def invert_rigid(t):
    """Inverse of a rigid transform."""
    raise NotImplementedError("TODO 5: the transpose of the rotation for the inverse, and its negated offset")


def interpolate(t_a, value_a, t_b, value_b, t_query):
    """Linear interpolation in time; raise ValueError outside the buffer."""
    raise NotImplementedError("TODO 6: compute alpha first, then refuse the extrapolation")


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    """Unicast bandwidth to `n_subs` subscribers, in MB/s."""
    raise NotImplementedError("TODO 7: bytes times rate times subscribers, over 1e6")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
