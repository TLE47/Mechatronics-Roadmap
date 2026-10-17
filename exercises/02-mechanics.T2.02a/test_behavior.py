"""Behaviour tests for 02-mechanics.T2.02a.

Each test names the mistake it catches:
  * multiple poses / changed lengths - a Jacobian true only at the worked-example pose;
  * a finite-difference comparison - an analytic derivative that is wrong everywhere;
  * virtual work and the asymmetry of J - J multiplied by F instead of J^T;
  * the plant's own gravity torque - a CoM Jacobian built in the elbow's local frame;
  * finite values at the singularity - someone inverting J when they should multiply by it.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class JacobianTests(unittest.TestCase):
    POSES = [(0.0, math.pi / 2.0), (0.37, 1.15), (-1.10, 0.62), (0.0, 0.0), (2.4, -0.9)]

    def test_matches_numerical_derivative_at_many_poses(self):
        for q1, q2 in self.POSES:
            J = submission.jacobian(q1, q2)
            oracle = harness.numerical_jacobian(q1, q2)
            for row in range(2):
                for col in range(2):
                    self.assertAlmostEqual(J[row][col], oracle[row][col], delta=1e-6,
                                           msg="J[%d][%d] at q=(%.3f, %.3f)" % (row, col, q1, q2))

    def test_uses_the_link_lengths_it_is_given(self):
        q = (0.4, 0.9)
        long_arm = submission.jacobian(*q, l1=0.30, l2=0.25)
        oracle = harness.numerical_jacobian(*q, l1=0.30, l2=0.25)
        short_arm = submission.jacobian(*q)
        self.assertGreater(abs(long_arm[0][0] - short_arm[0][0]), 0.15,
                           "the Jacobian ignored l1/l2 and used the plant defaults")
        for row in range(2):
            for col in range(2):
                self.assertAlmostEqual(long_arm[row][col], oracle[row][col], delta=1e-6)

    def test_determinant_is_l1_l2_sin_q2(self):
        for q1, q2 in self.POSES:
            det = harness.det2(submission.jacobian(q1, q2))
            self.assertAlmostEqual(det, 0.10 * 0.10 * math.sin(q2), delta=1e-9)


class ForceTests(unittest.TestCase):
    def test_zero_force_yields_zero_torque(self):
        for q1, q2 in ((0.0, 0.0), (0.7, -0.4)):
            tau = submission.joint_torques(submission.jacobian(q1, q2), (0.0, 0.0))
            self.assertEqual(tuple(tau), (0.0, 0.0))

    def test_torque_is_the_transpose_not_the_matrix(self):
        # An asymmetric Jacobian is the only place J F and J^T F differ, and at a general pose
        # this one is asymmetric in the first row.
        q1, q2 = 0.37, 1.15
        J = submission.jacobian(q1, q2)
        F = (3.0, -7.0)
        tau = submission.joint_torques(J, F)
        self.assertAlmostEqual(tau[0], J[0][0] * F[0] + J[1][0] * F[1], delta=1e-12)
        self.assertAlmostEqual(tau[1], J[0][1] * F[0] + J[1][1] * F[1], delta=1e-12)
        wrong = (J[0][0] * F[0] + J[0][1] * F[1], J[1][0] * F[0] + J[1][1] * F[1])
        self.assertGreater(max(abs(tau[0] - wrong[0]), abs(tau[1] - wrong[1])), 0.5)

    def test_joint_and_task_power_agree(self):
        q1, q2 = (-0.6, 0.85)
        J = submission.jacobian(q1, q2)
        dq = (0.21, -0.13)
        F = (4.0, 1.5)
        tau = submission.joint_torques(J, F)
        tip_velocity = (J[0][0] * dq[0] + J[0][1] * dq[1],
                        J[1][0] * dq[0] + J[1][1] * dq[1])
        joint_power = tau[0] * dq[0] + tau[1] * dq[1]
        task_power = F[0] * tip_velocity[0] + F[1] * tip_velocity[1]
        self.assertAlmostEqual(joint_power, task_power, delta=1e-12)


class GravityTests(unittest.TestCase):
    POSES = [(0.0, 0.0), (0.0, math.pi / 2.0), (math.pi / 2.0, 0.0), (0.55, 1.2), (-1.3, 0.4)]

    def test_matches_the_plant_oracle(self):
        for q1, q2 in self.POSES:
            got = submission.gravity_from_com_jacobians(q1, q2)
            want = harness.plant.gravity_torque(q1, q2)
            self.assertAlmostEqual(got[0], want[0], delta=1e-12, msg="tau1 at q=(%.3f, %.3f)" % (q1, q2))
            self.assertAlmostEqual(got[1], want[1], delta=1e-12, msg="tau2 at q=(%.3f, %.3f)" % (q1, q2))

    def test_elbow_needs_no_torque_when_vertical(self):
        tau = submission.gravity_from_com_jacobians(math.pi / 2.0, 0.0)
        self.assertAlmostEqual(tau[1], 0.0, delta=1e-12,
                               msg="a frame error shows up here, where the elbow is weightless")


class SingularityTests(unittest.TestCase):
    def test_reports_the_two_singular_angles(self):
        angles = tuple(submission.singular_elbow_angles())
        self.assertEqual(angles, (0.0, math.pi))

    def test_determinant_vanishes_there_and_jacobian_stays_finite(self):
        for q2 in submission.singular_elbow_angles():
            J = submission.jacobian(0.3, q2)
            self.assertAlmostEqual(harness.det2(J), 0.0, delta=1e-12)
            tau = submission.joint_torques(J, (1.0, 2.0))
            self.assertTrue(all(math.isfinite(v) for v in tau))


class EnergyRouteTests(unittest.TestCase):
    def test_gradient_matches_the_transposed_payload_force(self):
        for q1, q2 in ((0.0, math.pi / 2.0), (0.30, 0.60), (-1.10, 1.40)):
            by_force = submission.joint_torques(submission.jacobian(q1, q2), (0.0, 0.05 * 9.81))
            by_energy = submission.potential_gradient(q1, q2)
            self.assertAlmostEqual(by_energy[0], by_force[0], delta=1e-9)
            self.assertAlmostEqual(by_energy[1], by_force[1], delta=1e-9)
            oracle = harness.payload_torque(q1, q2, 0.05)
            self.assertAlmostEqual(by_energy[0], oracle[0], delta=1e-9)
            self.assertAlmostEqual(by_energy[1], oracle[1], delta=1e-9)


if __name__ == "__main__":
    unittest.main()
