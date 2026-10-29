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
    raise NotImplementedError("TODO 1: whether this offer satisfies this request on both policies")


def urdf_revolute_z(xyz, q_rad):
    """The homogeneous transform of a revolute joint about +Z."""
    raise NotImplementedError("TODO 2: the pose this joint contributes")


def mat4_mul(a, b):
    """Product of two 4x4 homogeneous transforms."""
    raise NotImplementedError("TODO 3: the transform that applies A's pose before B's")


def transform_point(t, p):
    """Apply a homogeneous transform to a 3-vector."""
    raise NotImplementedError("TODO 4: where the point lands in the other frame")


def invert_rigid(t):
    """Inverse of a rigid transform."""
    raise NotImplementedError("TODO 5: the transform that undoes this one")


def interpolate(t_a, value_a, t_b, value_b, t_query):
    """Linear interpolation in time; raise ValueError outside the buffer."""
    raise NotImplementedError("TODO 6: the value at this time, or a ValueError outside the buffer")


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    """Unicast bandwidth to `n_subs` subscribers, in MB/s."""
    raise NotImplementedError("TODO 7: the bandwidth this fan-out needs, in MB/s")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
