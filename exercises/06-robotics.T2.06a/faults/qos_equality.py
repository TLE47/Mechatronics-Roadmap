"""Planted fault: QoS compatibility requires the policies to be equal.

Equality is the intuitive reading and it rejects the pair that matters - a Reliable publisher with
a Best-Effort subscriber, which ROS 2 connects every day.
"""

import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def qos_compatible(pub_reliable, pub_transient_local, sub_reliable, sub_transient_local):
    return bool(pub_reliable) == bool(sub_reliable) and \
        bool(pub_transient_local) == bool(sub_transient_local)


def urdf_revolute_z(xyz, q_rad):
    c = math.cos(q_rad)
    s = math.sin(q_rad)
    return [[c, -s, 0.0, xyz[0]], [s, c, 0.0, xyz[1]], [0.0, 0.0, 1.0, xyz[2]],
            [0.0, 0.0, 0.0, 1.0]]


def mat4_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def transform_point(t, p):
    return [sum(t[i][j] * p[j] for j in range(3)) + t[i][3] for i in range(3)]


def invert_rigid(t):
    r_t = [[t[j][i] for j in range(3)] for i in range(3)]
    inverse = [[r_t[i][0], r_t[i][1], r_t[i][2],
                -(r_t[i][0] * t[0][3] + r_t[i][1] * t[1][3] + r_t[i][2] * t[2][3])]
               for i in range(3)]
    inverse.append([0.0, 0.0, 0.0, 1.0])
    return inverse


def interpolate(t_a, value_a, t_b, value_b, t_query):
    if t_b == t_a:
        raise ValueError("the buffer's two stamps must differ")
    alpha = (t_query - t_a) / (t_b - t_a)
    return (1.0 - alpha) * value_a + alpha * value_b


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    return n_subs * size_bytes * rate_hz / 1e6
