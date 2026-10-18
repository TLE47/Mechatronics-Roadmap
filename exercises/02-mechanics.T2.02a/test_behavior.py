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
                    self.assertAlmostEqual(
                        J[row][col], oracle[row][col], delta=1e-6,
                        msg="expected every Jacobian entry to match the numerical derivative at "
                            "each of the five poses, including the folded and far-reached ones; "
                            "a mismatch means the analytic form is only right at the worked pose "
                            "- check the q1 + q2 terms",
                    )

    def test_uses_the_link_lengths_it_is_given(self):
        q = (0.4, 0.9)
        long_arm = submission.jacobian(*q, l1=0.30, l2=0.25)
        oracle = harness.numerical_jacobian(*q, l1=0.30, l2=0.25)
        short_arm = submission.jacobian(*q)
        self.assertGreater(
            abs(long_arm[0][0] - short_arm[0][0]), 0.15,
            msg="expected changed link lengths to move the first Jacobian entry by more than "
                "0.15; a tiny difference means the function ignored l1/l2 and used the plant "
                "defaults - check the arguments reach the formula",
        )
        for row in range(2):
            for col in range(2):
                self.assertAlmostEqual(
                    long_arm[row][col], oracle[row][col], delta=1e-6,
                    msg="expected the long-arm Jacobian to match the numerical derivative with "
                        "the same lengths; a mismatch means l1 and l2 enter the formula in the "
                        "wrong places - check each lever term",
                )

    def test_determinant_is_l1_l2_sin_q2(self):
        for q1, q2 in self.POSES:
            det = harness.det2(submission.jacobian(q1, q2))
            self.assertAlmostEqual(
                det, 0.10 * 0.10 * math.sin(q2), delta=1e-9,
                msg="expected the determinant to be l1 l2 sin(q2) at every pose, zero at a "
                    "folded arm; a different value means the q2 dependence is missing - check "
                    "which sine the determinant reduces to",
            )


class ForceTests(unittest.TestCase):
    def test_zero_force_yields_zero_torque(self):
        for q1, q2 in ((0.0, 0.0), (0.7, -0.4)):
            tau = submission.joint_torques(submission.jacobian(q1, q2), (0.0, 0.0))
            self.assertEqual(
                tuple(tau), (0.0, 0.0),
                msg="expected a zero Cartesian force to need no joint torque at any pose; a "
                    "nonzero value means the transpose multiplication added an offset - check "
                    "the product starts from zero",
            )

    def test_torque_is_the_transpose_not_the_matrix(self):
        # An asymmetric Jacobian is the only place J F and J^T F differ, and at a general pose
        # this one is asymmetric in the first row.
        q1, q2 = 0.37, 1.15
        J = submission.jacobian(q1, q2)
        F = (3.0, -7.0)
        tau = submission.joint_torques(J, F)
        self.assertAlmostEqual(
            tau[0], J[0][0] * F[0] + J[1][0] * F[1], delta=1e-12,
            msg="expected the first joint torque to be the first row of J^T, using J[1][0]; a "
                "different value means J was multiplied by F directly - check the transpose",
        )
        self.assertAlmostEqual(
            tau[1], J[0][1] * F[0] + J[1][1] * F[1], delta=1e-12,
            msg="expected the second joint torque to pair J[0][1] with F[0] and J[1][1] with "
                "F[1], the second column of J; a swap means the rows were used instead",
        )
        wrong = (J[0][0] * F[0] + J[0][1] * F[1], J[1][0] * F[0] + J[1][1] * F[1])
        self.assertGreater(
            max(abs(tau[0] - wrong[0]), abs(tau[1] - wrong[1])), 0.5,
            msg="expected the transposed answer to differ from the untransposed one by more than "
                "half a newton-metre here, which is the module's whole point; equality means the "
                "test pose is not asymmetric enough to discriminate - check the pose",
        )

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
        self.assertAlmostEqual(
            joint_power, task_power, delta=1e-12,
            msg="expected the joint torques dotted with joint speeds to equal the tip force "
                "dotted with tip speed, virtual work at one pose; a gap means the transpose or "
                "the velocity product is wrong - check both sides use the same J",
        )


class GravityTests(unittest.TestCase):
    POSES = [(0.0, 0.0), (0.0, math.pi / 2.0), (math.pi / 2.0, 0.0), (0.55, 1.2), (-1.3, 0.4)]

    def test_matches_the_plant_oracle(self):
        for q1, q2 in self.POSES:
            got = submission.gravity_from_com_jacobians(q1, q2)
            want = harness.plant.gravity_torque(q1, q2)
            self.assertAlmostEqual(
                got[0], want[0], delta=1e-12,
                msg="expected the shoulder torque from the CoM Jacobians to match the plant's "
                    "oracle at every pose, straight up and folded included; a mismatch means the "
                    "link's own weight was levered in the wrong frame - check the CoM row",
            )
            self.assertAlmostEqual(
                got[1], want[1], delta=1e-12,
                msg="expected the elbow torque to match the plant's own gravity map as well; a "
                    "mismatch here means the second CoM Jacobian used the wrong joint angle - "
                    "check q1 + q2",
            )

    def test_elbow_needs_no_torque_when_vertical(self):
        tau = submission.gravity_from_com_jacobians(math.pi / 2.0, 0.0)
        self.assertAlmostEqual(
            tau[1], 0.0, delta=1e-12,
            msg="expected the elbow to need no holding torque when the arm is straight up, since "
                "its payload sits directly below; a nonzero value means the CoM Jacobian was "
                "built in the elbow's local frame instead of the world frame - check the frame",
        )


class SingularityTests(unittest.TestCase):
    def test_reports_the_two_singular_angles(self):
        angles = tuple(submission.singular_elbow_angles())
        self.assertEqual(
            angles, (0.0, math.pi),
            msg="expected the folded-straight pair 0 and pi as the singular elbow angles, the "
                "two poses where l1 and l2 line up; another pair means the determinant's zeros "
                "were misread - check sin(q2) = 0",
        )

    def test_determinant_vanishes_there_and_jacobian_stays_finite(self):
        for q2 in submission.singular_elbow_angles():
            J = submission.jacobian(0.3, q2)
            self.assertAlmostEqual(
                harness.det2(J), 0.0, delta=1e-12,
                msg="expected the Jacobian determinant to vanish at each reported singularity, "
                "which is what makes them singular; a nonzero determinant means the reported "
                "angles are not the determinant's zeros - check sin(q2)",
            )
            tau = submission.joint_torques(J, (1.0, 2.0))
            self.assertTrue(
                all(math.isfinite(v) for v in tau),
                msg="expected finite joint torques at the singularity, since the module multiplies "
                    "by J^T and never inverts it; an infinite or NaN value means the submission "
                    "solved J^-1 instead - check the direction of the multiplication",
            )


class EnergyRouteTests(unittest.TestCase):
    def test_gradient_matches_the_transposed_payload_force(self):
        for q1, q2 in ((0.0, math.pi / 2.0), (0.30, 0.60), (-1.10, 1.40)):
            by_force = submission.joint_torques(submission.jacobian(q1, q2), (0.0, 0.05 * 9.81))
            by_energy = submission.potential_gradient(q1, q2)
            self.assertAlmostEqual(
                by_energy[0], by_force[0], delta=1e-9,
                msg="expected the potential-energy gradient's first component to equal the "
                    "transposed payload force at every pose; a gap means the two routes use "
                    "different Jacobians - check both evaluate the same pose",
            )
            self.assertAlmostEqual(
                by_energy[1], by_force[1], delta=1e-9,
                msg="expected the gradient's second component to match the force route as well, "
                    "the energy and virtual-work views agreeing; a gap means a term was dropped "
                    "in one route",
            )
            oracle = harness.payload_torque(q1, q2, 0.05)
            self.assertAlmostEqual(
                by_energy[0], oracle[0], delta=1e-9,
                msg="expected the gradient's shoulder component to match the payload oracle for "
                    "a 0.05 kg mass; a mismatch means the payload weight or its lever arm is "
                    "wrong - check m g on the tip",
            )
            self.assertAlmostEqual(
                by_energy[1], oracle[1], delta=1e-9,
                msg="expected the gradient's elbow component to match the same oracle; a "
                    "mismatch means the tip mass was levered at the shoulder angle twice - check "
                    "the second row",
            )


if __name__ == "__main__":
    unittest.main()
