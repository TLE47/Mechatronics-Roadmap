"""Planted fault: the elbow link's CoM Jacobian built in its own frame.

One substitution away from the solution - `sin(q2), cos(q2)` where the world angle `q1 + q2`
belongs. This is the mistake a link-local URDF frame hands you. It is caught by the gravity oracle
and by the pose where the elbow needs no torque at all; it is not caught by the determinant, which
only depends on q2.
"""

import math

import mechalab_plant as plant
from solution import joint_torques


def gravity_from_com_jacobians(q1, q2):
    s1, c1 = math.sin(q1), math.cos(q1)
    s12, c12 = math.sin(q2), math.cos(q2)            # injected: the elbow's own angle
    j_link1 = [[-plant.LC1 * s1, 0.0],
               [plant.LC1 * c1, 0.0]]
    j_link2 = [[-plant.L1 * s1 - plant.LC2 * s12, -plant.LC2 * s12],
               [plant.L1 * c1 + plant.LC2 * c12, plant.LC2 * c12]]
    tau1 = 0.0
    tau2 = 0.0
    for j_com, mass in ((j_link1, plant.M1), (j_link2, plant.M2)):
        t1, t2 = joint_torques(j_com, (0.0, mass * plant.G))
        tau1 += t1
        tau2 += t2
    return tau1, tau2
