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
            self.assertAlmostEqual(tip[0], expected[0], delta=1e-12)
            self.assertAlmostEqual(tip[1], expected[1], delta=1e-12)
            self.assertAlmostEqual(tip[2], 0.0, delta=1e-12)

    def test_the_chain_stays_in_the_plane(self):
        t = arm_chain(0.9, -0.3)
        self.assertAlmostEqual(t[2][0], 0.0, delta=1e-15)
        self.assertAlmostEqual(t[2][1], 0.0, delta=1e-15)
        self.assertAlmostEqual(t[2][3], 0.0, delta=1e-15)

    def test_a_tool_point_is_the_fk_of_the_tool(self):
        # A point `d` along the tool's own +X is the tip of an arm whose second link is L2 + d.
        d = 0.03
        for q1, q2 in ((0.2, 0.5), (-0.7, 1.3)):
            p = submission.transform_point(arm_chain(q1, q2), [d, 0.0, 0.0])
            expected = plant.fk(q1, q2)[0] + d * math.cos(q1 + q2), plant.fk(q1, q2)[1] + d * math.sin(q1 + q2)
            self.assertAlmostEqual(p[0], expected[0], delta=1e-12)
            self.assertAlmostEqual(p[1], expected[1], delta=1e-12)


class InverseTransformTests(unittest.TestCase):
    def test_the_inverse_reports_the_arms_own_angle(self):
        for q1, q2 in ((0.3, 0.4), (-0.9, 1.1)):
            inverse = submission.invert_rigid(arm_chain(q1, q2))
            # R^T = Rz(-(q1 + q2)); its (0,1) entry is sin(q1 + q2) and its (0,0) is cos(q1 + q2).
            theta = math.atan2(inverse[0][1], inverse[0][0])
            self.assertAlmostEqual(theta, q1 + q2, delta=1e-12)

    def test_the_inverse_is_the_base_seen_from_the_tool(self):
        for q1, q2 in ((0.4, -0.6), (0.1, 0.2)):
            t = arm_chain(q1, q2)
            inverse = submission.invert_rigid(t)
            base_in_tool = [inverse[0][3], inverse[1][3], inverse[2][3]]
            # The base is exactly the tip's distance away, and it maps back to the origin.
            self.assertAlmostEqual(math.hypot(base_in_tool[0], base_in_tool[1]),
                                   math.hypot(*plant.fk(q1, q2)), delta=1e-12)
            back = submission.transform_point(t, base_in_tool)
            self.assertAlmostEqual(back[0], 0.0, delta=1e-12)
            self.assertAlmostEqual(back[1], 0.0, delta=1e-12)


class TelemetryBandwidthTests(unittest.TestCase):
    def test_the_plants_frame_to_three_subscribers(self):
        rate = 1.0 / plant.DT
        bandwidth = submission.topic_bandwidth_mb_s(3, plant.FRAME_BYTES, rate)
        self.assertAlmostEqual(bandwidth, 3 * plant.FRAME_BYTES * 1000.0 / 1e6, delta=1e-12)
        self.assertLess(bandwidth, 1.0, "20-byte frames at 1 kHz are not a megabyte per second")


if __name__ == "__main__":
    unittest.main()
