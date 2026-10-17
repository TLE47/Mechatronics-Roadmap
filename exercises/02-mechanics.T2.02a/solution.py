"""Exercise 02-mechanics.T2.02a - reference solution.

This is the file the tests are expected to pass. It is also the file a learner compares against
*after* attempting the exercise, not instead of it.

The one thing to notice: `gravity_from_com_jacobians` never mentions the arm's gravity formula.
It builds two CoM Jacobians and sums J^T w, which reproduces `plant.gravity_torque` to ~1e-16
N*m. That identity is what lets a controller feed a payload forward without new physics.
"""

import math

import mechalab_plant as plant


def jacobian(q1, q2, l1=plant.L1, l2=plant.L2):
    """The 2x2 geometric Jacobian of the tip, m/rad."""
    s1, c1 = math.sin(q1), math.cos(q1)
    s12, c12 = math.sin(q1 + q2), math.cos(q1 + q2)
    return [[-l1 * s1 - l2 * s12, -l2 * s12],
            [l1 * c1 + l2 * c12, l2 * c12]]


def joint_torques(J, force):
    """tau = J^T F: the tip force mapped into the joints, N*m."""
    return (J[0][0] * force[0] + J[1][0] * force[1],
            J[0][1] * force[0] + J[1][1] * force[1])


def gravity_from_com_jacobians(q1, q2):
    """Gravity holding torque from the two CoM Jacobians, N*m."""
    s1, c1 = math.sin(q1), math.cos(q1)
    s12, c12 = math.sin(q1 + q2), math.cos(q1 + q2)   # the elbow's world angle, not q2
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


def singular_elbow_angles():
    """det J = l1 l2 sin(q2) vanishes at the stretched and folded poses."""
    return (0.0, math.pi)


def potential_gradient(q1, q2, m_p=0.05, h=1e-6):
    """dU/dq for U = m_p g y_tip, by central differences."""

    def potential(a1, a2):
        return m_p * plant.G * plant.fk(a1, a2)[1]

    return ((potential(q1 + h, q2) - potential(q1 - h, q2)) / (2.0 * h),
            (potential(q1, q2 + h) - potential(q1, q2 - h)) / (2.0 * h))


def payload_run(m_payload, compensate):
    """The capstone's figure-8 with a point mass at the tip, graded on tip error."""
    q_des = plant.ik(*plant.figure8_target(0.0))
    state = (q_des[0], q_des[1], 0.0, 0.0)
    previous = q_des
    sum_sq = 0.0
    peak_mm = 0.0

    for step in range(plant.TICKS):
        t = step * plant.DT
        x_des, y_des = plant.figure8_target(t)
        q_des = plant.ik(x_des, y_des)
        if step:
            dq_des = ((q_des[0] - previous[0]) / plant.DT,
                      (q_des[1] - previous[1]) / plant.DT)
        else:
            dq_des = (0.0, 0.0)
        previous = q_des

        tau_g = plant.gravity_torque(state[0], state[1])
        payload = joint_torques(jacobian(state[0], state[1]),
                                (0.0, m_payload * plant.G))
        feed = payload if compensate else (0.0, 0.0)

        tau1 = (plant.KP1 * (q_des[0] - state[0])
                + plant.KD1 * (dq_des[0] - state[2]) + tau_g[0] + feed[0])
        tau2 = (plant.KP2 * (q_des[1] - state[1])
                + plant.KD2 * (dq_des[1] - state[3]) + tau_g[1] + feed[1])
        tau = (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau1)),
               max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau2)))

        pulse = plant.disturbance_torque(t)
        state = plant.step_arm(state, tau,
                               dist=(pulse[0] - payload[0], pulse[1] - payload[1]))

        error_mm = math.dist((x_des, y_des), plant.fk(state[0], state[1])) * 1000.0
        sum_sq += error_mm * error_mm
        peak_mm = max(peak_mm, error_mm)

    return {"rms_mm": math.sqrt(sum_sq / plant.TICKS), "peak_mm": peak_mm}

# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
