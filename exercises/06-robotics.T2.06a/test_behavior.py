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
                            "pub=(%s,%s) sub=(%s,%s)" % (pub_rel, pub_dur, sub_rel, sub_dur))

    def test_the_two_that_fail(self):
        self.assertFalse(submission.qos_compatible(False, False, True, False))
        self.assertFalse(submission.qos_compatible(True, False, True, True))

    def test_matching_policies_connect(self):
        self.assertTrue(submission.qos_compatible(True, True, True, True))
        self.assertTrue(submission.qos_compatible(False, False, False, False))


class JointTests(unittest.TestCase):
    def test_a_zero_joint_is_a_translation(self):
        t = submission.urdf_revolute_z((0.25, 0.0, 0.1), 0.0)
        self.assertEqual([row[:3] for row in t[:3]],
                         [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        self.assertEqual([t[0][3], t[1][3], t[2][3]], [0.25, 0.0, 0.1])

    def test_a_quarter_turn_turns_the_right_way(self):
        t = submission.urdf_revolute_z((0.0, 0.0, 0.0), math.pi / 2.0)
        out = submission.transform_point(t, [1.0, 0.0, 0.0])
        self.assertAlmostEqual(out[0], 0.0, delta=1e-12)
        self.assertAlmostEqual(out[1], 1.0, delta=1e-12)

    def test_the_bottom_row_is_the_homogeneous_one(self):
        t = submission.urdf_revolute_z((0.1, 0.2, 0.3), 0.7)
        self.assertEqual(t[3], [0.0, 0.0, 0.0, 1.0])


class ChainTests(unittest.TestCase):
    def test_the_worked_pose(self):
        t_b_l1 = submission.urdf_revolute_z((0.0, 0.0, 0.10), 0.0)
        t_l1_tool = submission.urdf_revolute_z((0.25, 0.0, 0.0), math.pi / 2.0)
        t = submission.mat4_mul(t_b_l1, t_l1_tool)
        p = submission.transform_point(t, [0.15, 0.0, 0.0])
        self.assertAlmostEqual(p[0], 0.25, delta=1e-9)
        self.assertAlmostEqual(p[1], 0.15, delta=1e-9)
        self.assertAlmostEqual(p[2], 0.10, delta=1e-9)

    def test_order_matters(self):
        # A quarter turn, then a translation along the base's x: the origin lands 0.1 m up the y.
        # The other order lands it 0.2 m along x. Both are asserted absolutely, because comparing
        # the two products against each other is symmetric under swapping them.
        a = submission.urdf_revolute_z((0.10, 0.0, 0.0), math.pi / 2.0)
        b = submission.urdf_revolute_z((0.10, 0.0, 0.0), 0.0)
        left = submission.transform_point(submission.mat4_mul(a, b), [0.0, 0.0, 0.0])
        right = submission.transform_point(submission.mat4_mul(b, a), [0.0, 0.0, 0.0])
        self.assertAlmostEqual(left[0], 0.10, delta=1e-12)
        self.assertAlmostEqual(left[1], 0.10, delta=1e-12)
        self.assertAlmostEqual(right[0], 0.20, delta=1e-12)
        self.assertAlmostEqual(right[1], 0.0, delta=1e-12)

    def test_two_joints_reach_the_sum_of_their_offsets(self):
        p = submission.transform_point(chain(0.0, 0.0), [0.0, 0.0, 0.0])
        self.assertAlmostEqual(p[0], 0.20, delta=1e-12)
        self.assertAlmostEqual(p[1], 0.0, delta=1e-12)


class InverseTests(unittest.TestCase):
    def test_it_undoes_the_transform(self):
        t = submission.mat4_mul(submission.urdf_revolute_z((0.3, -0.2, 0.1), 0.9),
                                submission.urdf_revolute_z((0.1, 0.0, 0.0), -1.4))
        inverse = submission.invert_rigid(t)
        target = [0.05, -0.07, 0.02]
        there = submission.transform_point(t, target)
        back = submission.transform_point(inverse, there)
        for i in range(3):
            self.assertAlmostEqual(back[i], target[i], delta=1e-12)

    def test_the_inverse_rotation_is_the_transpose(self):
        t = submission.urdf_revolute_z((0.0, 0.0, 0.0), 1.1)
        inverse = submission.invert_rigid(t)
        self.assertAlmostEqual(inverse[0][0], t[0][0], delta=1e-15)
        self.assertAlmostEqual(inverse[0][1], t[1][0], delta=1e-15)
        self.assertAlmostEqual(inverse[3][3], 1.0, delta=0.0)

    def test_the_inverse_of_a_translation_is_its_negative(self):
        t = submission.urdf_revolute_z((0.4, 0.5, 0.6), 0.0)
        inverse = submission.invert_rigid(t)
        self.assertAlmostEqual(inverse[0][3], -0.4, delta=1e-15)
        self.assertAlmostEqual(inverse[2][3], -0.6, delta=1e-15)


class InterpolationTests(unittest.TestCase):
    def test_the_worked_query(self):
        self.assertAlmostEqual(submission.interpolate(1.000, 0.20, 1.010, 0.25, 1.004), 0.22,
                               delta=1e-9)

    def test_the_ends_are_the_samples(self):
        self.assertAlmostEqual(submission.interpolate(2.0, 7.0, 3.0, 9.0, 2.0), 7.0, delta=1e-12)
        self.assertAlmostEqual(submission.interpolate(2.0, 7.0, 3.0, 9.0, 3.0), 9.0, delta=1e-12)

    def test_extrapolation_is_refused(self):
        with self.assertRaises(ValueError):
            submission.interpolate(1.0, 0.0, 1.1, 1.0, 1.2)
        with self.assertRaises(ValueError):
            submission.interpolate(1.0, 0.0, 1.1, 1.0, 0.9)


class BandwidthTests(unittest.TestCase):
    def test_unicast_multiplies_by_the_subscriber_count(self):
        self.assertAlmostEqual(submission.topic_bandwidth_mb_s(3, 1200, 30.0), 0.108, delta=1e-12)
        self.assertAlmostEqual(submission.topic_bandwidth_mb_s(1, 1200, 30.0), 0.036, delta=1e-12)

    def test_no_subscribers_is_no_traffic(self):
        self.assertEqual(submission.topic_bandwidth_mb_s(0, 5000, 100.0), 0.0)


if __name__ == "__main__":
    unittest.main()
