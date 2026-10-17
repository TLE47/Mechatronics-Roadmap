"""Transfer tests for 00-foundations.T1.00d - the same laws on the plant's own geometry.

Four claims, measured on the shared arm:
  1. the plant's forward kinematics is exactly two projections summed, so `polar_to_cartesian`
     must reproduce `plant.fk` at every pose;
  2. the plant's fully extended tip (0.20 m) is the norm of that projection;
  3. `heading_rad` and the plant's own `wrap_pi` agree on angles that leave the principal range;
  4. the model's 12-bit encoder cannot resolve the module's 0.01 deg tolerance - one count is
     0.0879 deg - so a quadrant-three heading survives the encoder word with at most half a count
     of error, and a 16-bit word would be needed to meet the module's own tolerance.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

POSES = ((0.0, 0.0), (0.4, -0.7), (-1.1, 0.9), (math.pi / 2.0, 0.3))
OUT_OF_RANGE = (2.0 * math.pi / 3.0, 7.0 * math.pi / 4.0, 5.0 * math.pi / 3.0, -3.0 * math.pi / 4.0)


class PlantGeometryTests(unittest.TestCase):
    def test_the_plants_tip_is_the_sum_of_my_projections(self):
        for q1, q2 in POSES:
            tip_x, tip_y = plant.fk(q1, q2)
            my_x = sum(part[0] for part in (
                submission.polar_to_cartesian(plant.L1, q1),
                submission.polar_to_cartesian(plant.L2, q1 + q2),
            ))
            my_y = sum(part[1] for part in (
                submission.polar_to_cartesian(plant.L1, q1),
                submission.polar_to_cartesian(plant.L2, q1 + q2),
            ))
            self.assertAlmostEqual(my_x, tip_x, delta=1e-15, msg="tip x at (%g, %g)" % (q1, q2))
            self.assertAlmostEqual(my_y, tip_y, delta=1e-15, msg="tip y at (%g, %g)" % (q1, q2))

    def test_the_plants_full_reach_is_the_norm_of_its_tip(self):
        # Fully extended, both 0.10 m links lie on +x, so the tip is (0.20, 0) m.
        tip_x, tip_y = plant.fk(0.0, 0.0)
        self.assertAlmostEqual(tip_x, plant.L1 + plant.L2, delta=1e-15)
        self.assertAlmostEqual(submission.link_length(tip_x, tip_y), 0.20, delta=1e-15)

    def test_the_elbow_can_pull_the_tip_inside_the_shoulder_alone(self):
        # Folded back, the tip sits at 0.00 m - the two levers cancel.
        tip_x, tip_y = plant.fk(0.0, math.pi)
        self.assertAlmostEqual(submission.link_length(tip_x, tip_y), 0.0, delta=1e-15)

    def test_my_heading_is_the_plants_wrap_pi(self):
        for theta in OUT_OF_RANGE:
            mine = submission.heading_rad(math.cos(theta), math.sin(theta))
            self.assertAlmostEqual(mine, plant.wrap_pi(theta), delta=1e-12,
                                   msg="angle %g rad" % theta)


class EncoderTests(unittest.TestCase):
    def test_a_twelve_bit_count_is_0_0879_degrees(self):
        self.assertAlmostEqual(360.0 / plant.ENCODER_CPR, 0.087890625, delta=1e-12)
        self.assertEqual(plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS)

    def test_the_exercise_heading_survives_the_encoder_word(self):
        heading = submission.heading_deg(-0.30, -0.40)  # -126.86989764584402 deg
        counts = round((heading + 360.0) / 360.0 * plant.ENCODER_CPR)
        self.assertEqual(counts, 2653)
        recovered = counts * 360.0 / plant.ENCODER_CPR
        self.assertAlmostEqual(recovered, 233.173828125, delta=1e-9)
        self.assertAlmostEqual(recovered - 360.0, -126.826171875, delta=1e-9)
        error = abs((recovered - 360.0) - heading)
        self.assertLess(error, 0.5 * 360.0 / plant.ENCODER_CPR)
        self.assertAlmostEqual(error, 0.0437257708, delta=1e-9)

    def test_a_twelve_bit_encoder_is_coarser_than_the_modules_tolerance(self):
        # The module asks for +-0.01 deg; one 12-bit count is 0.0879 deg, nine times coarser.
        self.assertGreater(360.0 / plant.ENCODER_CPR, 0.01)
        self.assertLess(360.0 / 65536.0, 0.01)

    def test_the_figure_eight_corner_sits_in_quadrant_one(self):
        # The plant's command is centred at (0.12, 0.00) with semi-axes 0.03 and 0.04.
        corner_x = plant.X0 + plant.AX
        corner_y = plant.Y0 + plant.AY
        self.assertAlmostEqual(submission.link_length(corner_x, corner_y), 0.155242, delta=1e-6)
        self.assertAlmostEqual(submission.heading_deg(corner_x, corner_y), 14.9314, delta=1e-4)


if __name__ == "__main__":
    unittest.main()
