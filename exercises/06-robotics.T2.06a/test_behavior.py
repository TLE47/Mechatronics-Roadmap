"""Behaviour tests for 06-robotics.T2.06a.

Each test names the mistake it catches:
  * a QoS rule that checks the publisher's offer against itself, or that requires equality - the
    Best-Effort -> Reliable pair is the one that matters and the one an equality rule gets backwards;
  * a joint matrix with the offset in the rotation block, or the rotation transposed (still
    orthonormal, still wrong: it turns the wrong way);
  * a product taken in the wrong order, which is right for one joint and wrong for two;
  * a rigid inverse computed as a general 4x4 inverse, which works until it does not;
  * an interpolation that silently extrapolates instead of raising, the way tf2 does.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def chain(q1, q2):
    t1 = submission.mat4_mul(submission.urdf_revolute_z((0.0, 0.0, 0.0), q1),
                             submission.urdf_revolute_z((0.10, 0.0, 0.0), 0.0))
    t2 = submission.mat4_mul(submission.urdf_revolute_z((0.0, 0.0, 0.0), q2),
                             submission.urdf_revolute_z((0.10, 0.0, 0.0), 0.0))
    return submission.mat4_mul(t1, t2)


class QosTests(unittest.TestCase):
    def test_the_whole_matrix(self):
        for pub_rel in (True, False):
            for pub_dur in (True, False):
                for sub_rel in (True, False):
                    for sub_dur in (True, False):
                        expected = (int(pub_rel) >= int(sub_rel)) and (int(pub_dur) >= int(sub_dur))
                        self.assertEqual(
                            submission.qos_compatible(pub_rel, pub_dur, sub_rel, sub_dur), expected,
                            msg="expected offered >= requested on both policies for every pair "
                                "in this loop; a mismatch likely demanded equality or compared "
                                "the subscriber to itself - check both policies",
                        )

    def test_the_two_that_fail(self):
        self.assertFalse(
            submission.qos_compatible(False, False, True, False),
            msg="expected Best-Effort to Reliable to fail; True likely compared the publisher "
                "to itself or tested equality - check the offer is at least the request",
        )
        self.assertFalse(
            submission.qos_compatible(True, False, True, True),
            msg="expected a volatile publisher to fail a transient-local subscriber; True "
                "likely checked reliability only - check durability is a second inequality",
        )

    def test_matching_policies_connect(self):
        self.assertTrue(
            submission.qos_compatible(True, True, True, True),
            msg="expected two identical Reliable, transient-local endpoints to connect; False "
                "likely used a strict > instead of >= - check equal offers satisfy the request",
        )
        self.assertTrue(
            submission.qos_compatible(False, False, False, False),
            msg="expected two identical Best-Effort, volatile endpoints to connect; False "
                "likely special-cased Reliable - check both policies compare by rank",
        )


class JointTests(unittest.TestCase):
    def test_a_zero_joint_is_a_translation(self):
        t = submission.urdf_revolute_z((0.25, 0.0, 0.1), 0.0)
        self.assertEqual(
            [row[:3] for row in t[:3]],
            [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            msg="expected a zero joint to leave the rotation identity; another matrix likely put "
                "the offset inside the rotation block - check the translation is in column 3",
        )
        self.assertEqual(
            [t[0][3], t[1][3], t[2][3]], [0.25, 0.0, 0.1],
            msg="expected the joint origin at (0.25, 0.0, 0.1); another translation likely read "
                "the wrong column - check the last column holds the offset",
        )

    def test_a_quarter_turn_turns_the_right_way(self):
        t = submission.urdf_revolute_z((0.0, 0.0, 0.0), math.pi / 2.0)
        out = submission.transform_point(t, [1.0, 0.0, 0.0])
        self.assertAlmostEqual(
            out[0], 0.0, delta=1e-12,
            msg="expected the x axis to leave no x component after a quarter turn; a value near "
                "1.0 likely left the rotation as identity - check cos(pi/2) is applied",
        )
        self.assertAlmostEqual(
            out[1], 1.0, delta=1e-12,
            msg="expected +x to rotate onto +y, since the joint is about +Z; -1.0 means the "
                "rotation was transposed - check the sign of the sine term",
        )

    def test_the_bottom_row_is_the_homogeneous_one(self):
        t = submission.urdf_revolute_z((0.1, 0.2, 0.3), 0.7)
        self.assertEqual(
            t[3], [0.0, 0.0, 0.0, 1.0],
            msg="expected the homogeneous bottom row [0, 0, 0, 1]; another row likely wrote the "
                "offset there - check only the top three rows are rigid",
        )


class ChainTests(unittest.TestCase):
    def test_the_worked_pose(self):
        t_b_l1 = submission.urdf_revolute_z((0.0, 0.0, 0.10), 0.0)
        t_l1_tool = submission.urdf_revolute_z((0.25, 0.0, 0.0), math.pi / 2.0)
        t = submission.mat4_mul(t_b_l1, t_l1_tool)
        p = submission.transform_point(t, [0.15, 0.0, 0.0])
        self.assertAlmostEqual(
            p[0], 0.25, delta=1e-9,
            msg="expected the tool point at x = 0.25 after the offset and quarter turn; 0.15 "
                "likely dropped the link offset - check both transforms are in the product",
        )
        self.assertAlmostEqual(
            p[1], 0.15, delta=1e-9,
            msg="expected the tool point at y = 0.15, the rotated local x; 0.0 likely skipped "
                "the quarter turn - check the rotation is applied before the offset",
        )
        self.assertAlmostEqual(
            p[2], 0.10, delta=1e-9,
            msg="expected the tool point at z = 0.10 from the base offset; 0.0 likely lost the "
                "z translation in the chain - check the offset column survives the multiply",
        )

    def test_order_matters(self):
        # A quarter turn, then a translation along the base's x: the origin lands 0.1 m up the y.
        # The other order lands it 0.2 m along x. Both are asserted absolutely, because comparing
        # the two products against each other is symmetric under swapping them.
        a = submission.urdf_revolute_z((0.10, 0.0, 0.0), math.pi / 2.0)
        b = submission.urdf_revolute_z((0.10, 0.0, 0.0), 0.0)
        left = submission.transform_point(submission.mat4_mul(a, b), [0.0, 0.0, 0.0])
        right = submission.transform_point(submission.mat4_mul(b, a), [0.0, 0.0, 0.0])
        self.assertAlmostEqual(
            left[0], 0.10, delta=1e-12,
            msg="expected rotation then translation to leave the origin 0.10 along x; another "
                "value likely swapped the two factors - check the product order",
        )
        self.assertAlmostEqual(
            left[1], 0.10, delta=1e-12,
            msg="expected rotation then translation to lift the origin 0.10 up y; 0.0 likely "
                "applied the offset in the base frame instead",
        )
        self.assertAlmostEqual(
            right[0], 0.20, delta=1e-12,
            msg="expected the other order to reach x = 0.20, since the rotated offset also "
                "contributes; 0.10 likely multiplied in the same order twice",
        )
        self.assertAlmostEqual(
            right[1], 0.0, delta=1e-12,
            msg="expected the other order to leave y at 0; a nonzero y likely rotated the "
                "already-offset translation - check b precedes a",
        )

    def test_two_joints_reach_the_sum_of_their_offsets(self):
        p = submission.transform_point(chain(0.0, 0.0), [0.0, 0.0, 0.0])
        self.assertAlmostEqual(
            p[0], 0.20, delta=1e-12,
            msg="expected two 0.10 m offsets at zero angle to add to 0.20 along x; 0.10 likely "
                "dropped one link from the chain - check both products are multiplied",
        )
        self.assertAlmostEqual(
            p[1], 0.0, delta=1e-12,
            msg="expected the straight chain to stay on the x axis; a nonzero y likely applied "
                "a nonzero joint angle - check both angles are zero",
        )


class InverseTests(unittest.TestCase):
    def test_it_undoes_the_transform(self):
        t = submission.mat4_mul(submission.urdf_revolute_z((0.3, -0.2, 0.1), 0.9),
                                submission.urdf_revolute_z((0.1, 0.0, 0.0), -1.4))
        inverse = submission.invert_rigid(t)
        target = [0.05, -0.07, 0.02]
        there = submission.transform_point(t, target)
        back = submission.transform_point(inverse, there)
        for i in range(3):
            self.assertAlmostEqual(
                back[i], target[i], delta=1e-12,
                msg="expected every component in this loop to return to its original value "
                    "after the inverse; a mismatch likely negated before transposing - check "
                    "-R^T p",
            )

    def test_the_inverse_rotation_is_the_transpose(self):
        t = submission.urdf_revolute_z((0.0, 0.0, 0.0), 1.1)
        inverse = submission.invert_rigid(t)
        self.assertAlmostEqual(
            inverse[0][0], t[0][0], delta=1e-15,
            msg="expected the diagonal to survive the transpose unchanged; another value likely "
                "negated the whole rotation - check R^T is not -R",
        )
        self.assertAlmostEqual(
            inverse[0][1], t[1][0], delta=1e-15,
            msg="expected the off-diagonal to mirror across the diagonal, R^T; the same entry "
                "likely means the rotation was copied unchanged - check it is transposed",
        )
        self.assertAlmostEqual(
            inverse[3][3], 1.0, delta=0.0,
            msg="expected the homogeneous scale to stay exactly 1.0; another value likely ran "
                "a general 4x4 inverse and divided by a determinant - check the bottom row",
        )

    def test_the_inverse_of_a_translation_is_its_negative(self):
        t = submission.urdf_revolute_z((0.4, 0.5, 0.6), 0.0)
        inverse = submission.invert_rigid(t)
        self.assertAlmostEqual(
            inverse[0][3], -0.4, delta=1e-15,
            msg="expected the inverse of a pure translation to move x by -0.4; +0.4 likely "
                "copied the offset - check the sign of R^T p",
        )
        self.assertAlmostEqual(
            inverse[2][3], -0.6, delta=1e-15,
            msg="expected the inverse to move z by -0.6; +0.6 likely skipped the sign - check "
                "the negated translation",
        )


class InterpolationTests(unittest.TestCase):
    def test_the_worked_query(self):
        self.assertAlmostEqual(
            submission.interpolate(1.000, 0.20, 1.010, 0.25, 1.004), 0.22,
            delta=1e-9,
            msg="expected 0.22 at 40 percent of the way from 0.20 to 0.25; 0.224 likely used "
                "the wrong weight - check (t - t_a) / (t_b - t_a)",
        )

    def test_the_ends_are_the_samples(self):
        self.assertAlmostEqual(
            submission.interpolate(2.0, 7.0, 3.0, 9.0, 2.0), 7.0, delta=1e-12,
            msg="expected the query at the first stamp to return the first sample exactly; a "
                "nearby value likely applied the slope to a zero interval - check alpha is 0",
        )
        self.assertAlmostEqual(
            submission.interpolate(2.0, 7.0, 3.0, 9.0, 3.0), 9.0, delta=1e-12,
            msg="expected the query at the last stamp to return the second sample exactly; a "
                "nearby value likely used alpha from the wrong end - check alpha is 1",
        )

    def test_extrapolation_is_refused(self):
        with self.assertRaises(ValueError):
            submission.interpolate(1.0, 0.0, 1.1, 1.0, 1.2)
        with self.assertRaises(ValueError):
            submission.interpolate(1.0, 0.0, 1.1, 1.0, 0.9)


class BandwidthTests(unittest.TestCase):
    def test_unicast_multiplies_by_the_subscriber_count(self):
        self.assertAlmostEqual(
            submission.topic_bandwidth_mb_s(3, 1200, 30.0), 0.108, delta=1e-12,
            msg="expected three subscribers of 1200 bytes at 30 Hz to be 0.108 MB/s; 0.036 "
                "likely sent one copy - check unicast multiplies by the count",
        )
        self.assertAlmostEqual(
            submission.topic_bandwidth_mb_s(1, 1200, 30.0), 0.036, delta=1e-12,
            msg="expected one subscriber of 1200 bytes at 30 Hz to be 0.036 MB/s; 36 likely "
                "left the answer in bytes - check the 1e6 divisor",
        )

    def test_no_subscribers_is_no_traffic(self):
        self.assertEqual(
            submission.topic_bandwidth_mb_s(0, 5000, 100.0), 0.0,
            msg="expected no subscribers to mean no unicast traffic; a nonzero value likely "
                "counted the publisher itself - check the count multiplies the frame",
        )


if __name__ == "__main__":
    unittest.main()
