"""Transfer tests for 06-robotics.T2.06a - the plant's arm as a tf2 chain.

Two claims, measured on the shared plant:
  1. the URDF chain `Rz(q1) Trans(L1) Rz(q2) Trans(L2)`, built from the plant's own link lengths,
     reproduces `plant.fk(q1, q2)` at every pose - so the graph's transform tree and the
     kinematics the capstone publishes are the same map;
  2. the chain's inverse is the transform tf2 would look up in the other direction, and the
     rotation it reports is the arm's own `q1 + q2`.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def arm_chain(q1, q2):
    """`base_link -> link_1 -> tool0` for the plant: joint 2 sits L1 along the first link."""
    shoulder = submission.urdf_revolute_z((0.0, 0.0, 0.0), q1)
    elbow_offset = submission.urdf_revolute_z((plant.L1, 0.0, 0.0), q2)
    tip_offset = submission.urdf_revolute_z((plant.L2, 0.0, 0.0), 0.0)
    return submission.mat4_mul(submission.mat4_mul(shoulder, elbow_offset), tip_offset)


class ChainMatchesKinematicsTests(unittest.TestCase):
    def test_the_chain_reproduces_plant_fk(self):
        for q1, q2 in ((0.0, 0.0), (0.3, 0.4), (-1.2, 0.7), (2.0, -1.1), (0.0, math.pi / 2.0)):
            tip = submission.transform_point(arm_chain(q1, q2), [0.0, 0.0, 0.0])
            expected = plant.fk(q1, q2)
            self.assertAlmostEqual(
                tip[0], expected[0], delta=1e-12,
                msg="expected the chain's tip x to match plant.fk at every pose in this loop; "
                    "a mismatch likely used the wrong link length for L1 - check the elbow "
                    "offset",
            )
            self.assertAlmostEqual(
                tip[1], expected[1], delta=1e-12,
                msg="expected the chain's tip y to match plant.fk at every pose in this loop; "
                    "a sign flip likely transposed one joint's rotation - check Rz turns "
                    "counter-clockwise",
            )
            self.assertAlmostEqual(
                tip[2], 0.0, delta=1e-12,
                msg="expected the planar chain's tip to stay at z = 0 at every pose in this "
                    "loop; a nonzero z likely put a link length into the z column",
            )

    def test_the_chain_stays_in_the_plane(self):
        t = arm_chain(0.9, -0.3)
        self.assertAlmostEqual(
            t[2][0], 0.0, delta=1e-15,
            msg="expected no roll term in the third row's x entry for a planar chain; a nonzero "
                "value likely used a full 3D rotation for a Z joint",
        )
        self.assertAlmostEqual(
            t[2][1], 0.0, delta=1e-15,
            msg="expected no pitch term in the third row's y entry; a nonzero value likely "
                "mixed the joint axes - check every rotation is about +Z",
        )
        self.assertAlmostEqual(
            t[2][3], 0.0, delta=1e-15,
            msg="expected the chain's base height to be zero; a nonzero z offset likely added "
                "the link length to the wrong column",
        )

    def test_a_tool_point_is_the_fk_of_the_tool(self):
        # A point `d` along the tool's own +X is the tip of an arm whose second link is L2 + d.
        d = 0.03
        for q1, q2 in ((0.2, 0.5), (-0.7, 1.3)):
            p = submission.transform_point(arm_chain(q1, q2), [d, 0.0, 0.0])
            expected = plant.fk(q1, q2)[0] + d * math.cos(q1 + q2), plant.fk(q1, q2)[1] + d * math.sin(q1 + q2)
            self.assertAlmostEqual(
                p[0], expected[0], delta=1e-12,
                msg="expected a tool point 0.03 along +X to extend the tip by d*cos(q1+q2) at "
                    "every pose in this loop; a mismatch likely rotated by q2 alone - check "
                    "the angles add",
            )
            self.assertAlmostEqual(
                p[1], expected[1], delta=1e-12,
                msg="expected the tool point's y to extend the tip by d*sin(q1+q2) at every "
                    "pose in this loop; the wrong sine likely used only the shoulder angle",
            )


class InverseTransformTests(unittest.TestCase):
    def test_the_inverse_reports_the_arms_own_angle(self):
        for q1, q2 in ((0.3, 0.4), (-0.9, 1.1)):
            inverse = submission.invert_rigid(arm_chain(q1, q2))
            # R^T = Rz(-(q1 + q2)); its (0,1) entry is sin(q1 + q2) and its (0,0) is cos(q1 + q2).
            theta = math.atan2(inverse[0][1], inverse[0][0])
            self.assertAlmostEqual(
                theta, q1 + q2, delta=1e-12,
                msg="expected the inverse rotation to report q1 + q2 as its angle at every "
                    "pose in this loop; a value near -q1 - q2 likely skipped the transpose - "
                    "check R^T",
            )

    def test_the_inverse_is_the_base_seen_from_the_tool(self):
        for q1, q2 in ((0.4, -0.6), (0.1, 0.2)):
            t = arm_chain(q1, q2)
            inverse = submission.invert_rigid(t)
            base_in_tool = [inverse[0][3], inverse[1][3], inverse[2][3]]
            # The base is exactly the tip's distance away, and it maps back to the origin.
            self.assertAlmostEqual(
                math.hypot(base_in_tool[0], base_in_tool[1]),
                math.hypot(*plant.fk(q1, q2)), delta=1e-12,
                msg="expected the base seen from the tool to sit exactly one tip-distance away "
                    "at every pose in this loop; a mismatch likely negated the translation "
                    "without rotating it first - check -R^T p",
            )
            back = submission.transform_point(t, base_in_tool)
            self.assertAlmostEqual(
                back[0], 0.0, delta=1e-12,
                msg="expected the base's x to map back to the origin at every pose in this "
                    "loop; a residual likely used a general inverse - check R^T and -R^T p",
            )
            self.assertAlmostEqual(
                back[1], 0.0, delta=1e-12,
                msg="expected the base's y to map back to the origin at every pose in this "
                    "loop; a residual likely transposed the wrong way - check the inverse "
                    "composes to identity",
            )


class TelemetryBandwidthTests(unittest.TestCase):
    def test_the_plants_frame_to_three_subscribers(self):
        rate = 1.0 / plant.DT
        bandwidth = submission.topic_bandwidth_mb_s(3, plant.FRAME_BYTES, rate)
        self.assertAlmostEqual(
            bandwidth, 3 * plant.FRAME_BYTES * 1000.0 / 1e6, delta=1e-12,
            msg="expected three copies of the plant's 20-byte frame at 1 kHz to be 0.06 MB/s; "
                "another value likely used the raw frame rate - check the subscriber count",
        )
        self.assertLess(
            bandwidth, 1.0,
            msg="expected three 20-byte frames at 1 kHz to stay well under 1 MB/s; a larger "
                "figure likely counted bits as megabytes - check the 1e6 divisor",
        )


if __name__ == "__main__":
    unittest.main()
