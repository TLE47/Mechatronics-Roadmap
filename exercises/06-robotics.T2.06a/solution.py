"""Exercise 06-robotics.T2.06a - reference solution.

A ROS 2 graph is a set of promises about who can talk to whom, and a tf2 tree is a product of
homogeneous transforms. The QoS rule is an inequality on each policy, not a match: a Best-Effort
publisher cannot feed a Reliable subscriber. The transform chain is `T = Rz(q1) Trans(L1) Rz(q2)
Trans(L2)`, whose translation is exactly the plant's forward kinematics.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def qos_compatible(pub_reliable, pub_transient_local, sub_reliable, sub_transient_local):
    """`offered >= requested` on reliability and on durability, both of them."""
    reliable_ok = int(bool(pub_reliable)) >= int(bool(sub_reliable))
    durability_ok = int(bool(pub_transient_local)) >= int(bool(sub_transient_local))
    return reliable_ok and durability_ok


def urdf_revolute_z(xyz, q_rad):
    """A revolute joint about +Z with its origin offset: `[Rz(q), xyz; 0, 1]`."""
    c = math.cos(q_rad)
    s = math.sin(q_rad)
    return [[c, -s, 0.0, xyz[0]],
            [s, c, 0.0, xyz[1]],
            [0.0, 0.0, 1.0, xyz[2]],
            [0.0, 0.0, 0.0, 1.0]]


def mat4_mul(a, b):
    """Product of two 4x4 homogeneous transforms."""
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def transform_point(t, p):
    """Apply a homogeneous transform to a 3-vector (the homogeneous 1 is implicit)."""
    return [sum(t[i][j] * p[j] for j in range(3)) + t[i][3] for i in range(3)]


def invert_rigid(t):
    """Inverse of a rigid transform: `R^T` and `-R^T p`, never a general 4x4 inverse."""
    r_t = [[t[j][i] for j in range(3)] for i in range(3)]
    inverse = [[r_t[i][0], r_t[i][1], r_t[i][2],
                -(r_t[i][0] * t[0][3] + r_t[i][1] * t[1][3] + r_t[i][2] * t[2][3])]
               for i in range(3)]
    inverse.append([0.0, 0.0, 0.0, 1.0])
    return inverse


def interpolate(t_a, value_a, t_b, value_b, t_query):
    """Linear interpolation in time; a query outside the buffer is refused, as tf2 refuses it."""
    if t_b == t_a:
        raise ValueError("the buffer's two stamps must differ")
    if t_query < min(t_a, t_b) or t_query > max(t_a, t_b):
        raise ValueError("extrapolation: %.6f is outside [%.6f, %.6f]" % (t_query, t_a, t_b))
    alpha = (t_query - t_a) / (t_b - t_a)
    return (1.0 - alpha) * value_a + alpha * value_b


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    """Unicast bandwidth to `n_subs` subscribers, in MB/s."""
    return n_subs * size_bytes * rate_hz / 1e6


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
