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
            self.assertAlmostEqual(
                my_x, tip_x, delta=1e-15,
                msg="expected the summed x projections to match the plant's tip x at every pose "
                    "in this loop; a mismatch likely used q2 alone for the second link - check "
                    "the elbow angle is q1 + q2",
            )
            self.assertAlmostEqual(
                my_y, tip_y, delta=1e-15,
                msg="expected the summed y projections to match the plant's tip y at every pose "
                    "in this loop; a mismatch likely projected with sine in x - check both links "
                    "use L sin theta",
            )

    def test_the_plants_full_reach_is_the_norm_of_its_tip(self):
        # Fully extended, both 0.10 m links lie on +x, so the tip is (0.20, 0) m.
        tip_x, tip_y = plant.fk(0.0, 0.0)
        self.assertAlmostEqual(
            tip_x, plant.L1 + plant.L2, delta=1e-15,
            msg="expected the fully extended tip at x = L1 + L2 = 0.20 m; another value likely "
                "overlapped the links - check both are straight along +x at zero angles",
        )
        self.assertAlmostEqual(
            submission.link_length(tip_x, tip_y), 0.20, delta=1e-15,
            msg="expected the fully extended tip to be 0.20 m from the base; 0.20 from the plant "
                "itself would pass without the submission - this checks the norm",
        )

    def test_the_elbow_can_pull_the_tip_inside_the_shoulder_alone(self):
        # Folded back, the tip sits at 0.00 m - the two levers cancel.
        tip_x, tip_y = plant.fk(0.0, math.pi)
        self.assertAlmostEqual(
            submission.link_length(tip_x, tip_y), 0.0, delta=1e-15,
            msg="expected the folded arm's tip to sit at the base, a zero norm; a value near "
                "0.20 likely summed the links instead of cancelling them - check the elbow is pi",
        )

    def test_my_heading_is_the_plants_wrap_pi(self):
        for theta in OUT_OF_RANGE:
            mine = submission.heading_rad(math.cos(theta), math.sin(theta))
            self.assertAlmostEqual(
                mine, plant.wrap_pi(theta), delta=1e-12,
                msg="expected the submission's heading to match the plant's wrap_pi for every "
                    "angle in this loop, including those outside (-pi, pi]; a mismatch likely "
                    "returned the raw angle - check atan2 wraps",
            )


class EncoderTests(unittest.TestCase):
    def test_a_twelve_bit_count_is_0_0879_degrees(self):
        self.assertAlmostEqual(
            360.0 / plant.ENCODER_CPR, 0.087890625, delta=1e-12,
            msg="expected one count of the 12-bit encoder to be 0.08789 deg; 0.02197 likely "
                "used four counts per degree (quadrature) - check 360 / 4096",
        )
        self.assertEqual(
            plant.ENCODER_CPR, 2 ** plant.ENCODER_BITS,
            msg="expected the plant's counts per revolution to be 2^12 = 4096; another value "
                "likely multiplied by a gear ratio - check the encoder word is raw",
        )

    def test_the_exercise_heading_survives_the_encoder_word(self):
        heading = submission.heading_deg(-0.30, -0.40)  # -126.86989764584402 deg
        counts = round((heading + 360.0) / 360.0 * plant.ENCODER_CPR)
        self.assertEqual(
            counts, 2653,
            msg="expected -126.87 deg to land on encoder count 2653 once wrapped into [0, 360); "
                "another count likely forgot the +360 wrap - check the heading is made positive",
        )
        recovered = counts * 360.0 / plant.ENCODER_CPR
        self.assertAlmostEqual(
            recovered, 233.173828125, delta=1e-9,
            msg="expected count 2653 to read back as 233.1738 deg; 233.13 likely skipped the "
                "quantisation - check count * 360 / 4096",
        )
        self.assertAlmostEqual(
            recovered - 360.0, -126.826171875, delta=1e-9,
            msg="expected the wrapped-back angle to be -126.8262 deg; -126.8699 likely used the "
                "unquantised heading - check the encoder word is applied first",
        )
        error = abs((recovered - 360.0) - heading)
        self.assertLess(
            error, 0.5 * 360.0 / plant.ENCODER_CPR,
            msg="expected the quantisation error to stay within half a count, 0.0439 deg; a "
                "larger error likely rounded to the wrong count - check the rounding",
        )
        self.assertAlmostEqual(
            error, 0.0437257708, delta=1e-9,
            msg="expected the measured error to be 0.04373 deg, just under half a count; another "
                "value likely compared against the wrapped angle instead of the signed one",
        )

    def test_a_twelve_bit_encoder_is_coarser_than_the_modules_tolerance(self):
        # The module asks for +-0.01 deg; one 12-bit count is 0.0879 deg, nine times coarser.
        self.assertGreater(
            360.0 / plant.ENCODER_CPR, 0.01,
            msg="expected one 12-bit count to be coarser than the module's 0.01 deg tolerance; "
                "a smaller value likely used a 16-bit word - check plant.ENCODER_BITS",
        )
        self.assertLess(
            360.0 / 65536.0, 0.01,
            msg="expected a 16-bit word to resolve below 0.01 deg, so the tolerance is reachable "
                "with more bits; a larger value likely divided by the wrong count",
        )

    def test_the_figure_eight_corner_sits_in_quadrant_one(self):
        # The plant's command is centred at (0.12, 0.00) with semi-axes 0.03 and 0.04.
        corner_x = plant.X0 + plant.AX
        corner_y = plant.Y0 + plant.AY
        self.assertAlmostEqual(
            submission.link_length(corner_x, corner_y), 0.155242, delta=1e-6,
            msg="expected the figure-eight corner (0.15, 0.04) to be 0.1552 m from the base; "
                "0.19 is the Manhattan distance - check the norm",
        )
        self.assertAlmostEqual(
            submission.heading_deg(corner_x, corner_y), 14.9314, delta=1e-4,
            msg="expected the corner's heading to be 14.93 deg, in the first quadrant; 75.07 "
                "likely swapped atan2's arguments - check atan2(y, x)",
        )


if __name__ == "__main__":
    unittest.main()
