"""Behaviour tests for 00-foundations.T1.00d.

Each test names the mistake it catches:
  * a heading built from `math.atan(y / x)`, which reports -45.0 deg for a link at +135.0 deg -
    the module's "arm jerks by 180 deg" row;
  * `atan2(x, y)` with the arguments swapped, which mirrors everything across the y = x diagonal;
  * a projection with sine in x and cosine in y, invisible at 135 deg (sin = cos there) and
    obvious at the Skip test's 120 deg;
  * a norm taken as the Manhattan distance |x| + |y|, which turns the 0.50 m target into 0.70 m;
  * an inverse calibration that divides before subtracting the offset, which turns 6.0 A into
    8.5 A.
"""

import math
import unittest

import harness

submission = harness.load_submission()

# math.cos(math.radians(135)) = -0.7071067811865476, times the 0.40 m link.
WORKED_X = -0.282842712474619
WORKED_Y = 0.282842712474619


class CalibrationTests(unittest.TestCase):
    def test_the_worked_sensor_voltage(self):
        # 0.20 V/A * 5.0 A + 1.65 V = 2.65 V.
        self.assertAlmostEqual(
            submission.sensor_voltage(0.20, 5.0, 1.65), 2.65, delta=1e-12,
            msg="expected 2.65 V from 0.20 V/A at 5.0 A plus a 1.65 V offset; 2.65 without the "
                "offset or 4.15 likely swapped slope and current - check m x + b",
        )

    def test_the_skip_test_voltage(self):
        # The Skip test's sensor: 0.5 V at 0 A and 2.5 V at 10 A is a 0.20 V/A line.
        self.assertAlmostEqual(
            submission.sensor_voltage(0.20, 10.0, 0.5), 2.5, delta=1e-12,
            msg="expected 2.5 V at 10 A on a 0.20 V/A line with a 0.5 V offset; 2.0 likely "
                "dropped the offset - check the y-intercept is added",
        )

    def test_the_skip_test_current(self):
        # (1.7 V - 0.5 V) / 0.20 V/A = 6.0 A.
        self.assertAlmostEqual(
            submission.sensor_current(0.20, 1.7, 0.5), 6.0, delta=1e-9,
            msg="expected (1.7 - 0.5) / 0.20 = 6.0 A; 8.5 likely divided before subtracting "
                "the offset - check the order of the inverse",
        )

    def test_the_line_and_its_inverse_undo_each_other(self):
        for amps in (0.0, 2.5, 5.0, 12.5):
            volts = submission.sensor_voltage(0.20, amps, 1.65)
            self.assertAlmostEqual(
                submission.sensor_current(0.20, volts, 1.65), amps, delta=1e-9,
                msg="expected the inverse calibration to return the current it started from at "
                    "every point in this loop; a mismatch likely used a different offset or "
                    "slope - check both functions share m and b",
            )

    def test_an_inverting_sensor_flips_the_sign(self):
        # A -0.20 V/A line centred on 2.5 V reads 1.5 V at 5 A.
        self.assertAlmostEqual(
            submission.sensor_voltage(-0.20, 5.0, 2.5), 1.5, delta=1e-12,
            msg="expected a -0.20 V/A line centred at 2.5 V to read 1.5 V at 5 A; 3.5 likely "
                "dropped the sign - check a negative slope subtracts",
        )

    def test_a_zero_slope_has_no_inverse(self):
        with self.assertRaises(ValueError):
            submission.sensor_current(0.0, 1.7, 0.5)


class CartesianTests(unittest.TestCase):
    def test_the_worked_tip_x(self):
        x, _y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(
            x, WORKED_X, delta=1e-12,
            msg="expected x = 0.40 cos(135) = -0.2828 m; +0.2828 likely used sine for x, which "
                "is invisible at this angle - check the projection is L cos theta",
        )

    def test_the_worked_tip_y(self):
        _x, y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(
            y, WORKED_Y, delta=1e-12,
            msg="expected y = 0.40 sin(135) = +0.2828 m; -0.2828 likely lost the quadrant - "
                "check sin is positive in the second quadrant",
        )

    def test_the_worked_tip_keeps_the_link_length(self):
        x, y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(
            submission.link_length(x, y), 0.40, delta=1e-12,
            msg="expected the projected tip to stay 0.40 m from the origin; 0.5657 is the "
                "Manhattan distance |x| + |y| - check the norm uses squares",
        )

    def test_the_skip_test_x_coordinate(self):
        # 0.20 m at 120 deg: cos(120) = -0.5, so x = -0.10 m and y = +0.1732 m.
        x, y = submission.polar_to_cartesian(0.20, math.radians(120.0))
        self.assertAlmostEqual(
            x, -0.10, delta=1e-9,
            msg="expected x = 0.20 cos(120) = -0.10 m; +0.10 likely dropped the sign of the "
                "cosine, 0.173 likely used sine - check L cos theta",
        )
        self.assertGreater(
            y, 0.0,
            msg="expected a positive y at 120 deg, in the second quadrant; a negative value "
                "likely negated the sine - check the projection keeps the quadrant",
        )

    def test_the_exercise_distance(self):
        # hypot(-0.30, -0.40) = 0.50 m; the Manhattan distance would say 0.70 m.
        self.assertAlmostEqual(
            submission.link_length(-0.30, -0.40), 0.50, delta=1e-12,
            msg="expected sqrt(0.30^2 + 0.40^2) = 0.50 m; 0.70 is |x| + |y| and 0.10 is the "
                "difference of the squares - check the Euclidean norm",
        )

    def test_a_quadrant_three_tip_keeps_both_signs(self):
        x, y = submission.polar_to_cartesian(0.50, math.radians(233.130102354))
        self.assertAlmostEqual(
            x, -0.30, delta=1e-9,
            msg="expected x = 0.50 cos(233.13) = -0.30 m; +0.30 likely used an absolute "
                "cosine - check the third quadrant keeps the minus",
        )
        self.assertAlmostEqual(
            y, -0.40, delta=1e-9,
            msg="expected y = 0.50 sin(233.13) = -0.40 m; +0.40 likely put sine in the wrong "
                "sign - check both projections invert together",
        )

    def test_a_negative_length_is_refused(self):
        with self.assertRaises(ValueError):
            submission.polar_to_cartesian(-0.40, 0.0)


class HeadingTests(unittest.TestCase):
    def test_the_worked_quadrant_two_heading(self):
        # atan2(+0.28284, -0.28284) = +135.0 deg; atan(y / x) would say -45.0 deg.
        self.assertAlmostEqual(
            submission.heading_deg(WORKED_X, WORKED_Y), 135.0, delta=1e-9,
            msg="expected +135 deg for a tip in the second quadrant; -45 means atan(y/x) "
                "discarded the quadrant - check the four-quadrant atan2",
        )

    def test_the_exercise_quadrant_three_heading(self):
        # atan2(-0.40, -0.30) = -126.86989764584402 deg; atan2(x, y) would say -143.13 deg.
        self.assertAlmostEqual(
            submission.heading_deg(-0.30, -0.40), -126.86989764584402,
            delta=1e-9,
            msg="expected -126.87 deg from atan2(y, x); -143.13 means the arguments were "
                "swapped, mirroring across y = x - check atan2(y, x)",
        )

    def test_the_skip_test_quadrant_three_diagonal(self):
        self.assertAlmostEqual(
            submission.heading_deg(-1.0, -1.0), -135.0, delta=1e-9,
            msg="expected -135 deg on the third-quadrant diagonal; +135 likely wrapped the "
                "range without moving the quadrant - check the sign of both components",
        )

    def test_all_four_quadrants(self):
        cases = (
            (0.30, 0.40, 53.13010235415598),
            (-0.30, 0.40, 126.86989764584402),
            (-0.30, -0.40, -126.86989764584402),
            (0.30, -0.40, -53.13010235415598),
        )
        for x, y, expected in cases:
            self.assertAlmostEqual(
                submission.heading_deg(x, y), expected, delta=1e-9,
                msg="expected the four-quadrant heading for every tip in this loop; a mirrored "
                    "answer likely swapped atan2's arguments, a 180 deg error likely used plain "
                    "atan - check atan2(y, x)",
            )

    def test_straight_up_is_ninety(self):
        self.assertAlmostEqual(
            submission.heading_deg(0.0, 0.25), 90.0, delta=1e-12,
            msg="expected a straight-up tip to read +90 deg; 0.0 likely divided by a zero x "
                "without atan2 - check atan2 handles the axis",
        )

    def test_straight_down_is_minus_ninety(self):
        self.assertAlmostEqual(
            submission.heading_rad(0.0, -0.25), -math.pi / 2.0, delta=1e-12,
            msg="expected a straight-down tip to read -pi/2 rad; +pi/2 likely lost the sign of "
                "y - check atan2 returns the negative angle",
        )

    def test_the_plain_arctan_trap(self):
        # The discriminator from the module's Common mistakes: at this tip atan(y / x) = -45 deg,
        # a heading 180 deg away from the right answer.
        self.assertNotAlmostEqual(
            submission.heading_deg(WORKED_X, WORKED_Y),
            math.degrees(math.atan(WORKED_Y / WORKED_X)), delta=1.0,
            msg="expected the heading not to equal the plain atan(y/x), which is -45 deg here; "
                "equality means the submission reproduced the module's 180 deg error",
        )

    def test_the_origin_has_no_heading(self):
        with self.assertRaises(ValueError):
            submission.heading_rad(0.0, 0.0)


class AngleTests(unittest.TestCase):
    def test_degrees_to_radians(self):
        self.assertAlmostEqual(
            submission.degrees_to_radians(135.0), 2.356194490192345,
            delta=1e-12,
            msg="expected 135 deg to be 2.35619 rad; 135.0 likely returned degrees unchanged, "
                "0.75 likely divided by 180 twice - check theta * pi / 180",
        )

    def test_a_half_turn_is_pi(self):
        self.assertAlmostEqual(
            submission.degrees_to_radians(180.0), math.pi, delta=1e-12,
            msg="expected a half turn to be exactly pi; 3.14 from a hardcoded constant would "
                "fail at other angles - check the conversion divides by 180",
        )

    def test_zero_degrees_is_zero_radians(self):
        self.assertAlmostEqual(
            submission.degrees_to_radians(0.0), 0.0, delta=1e-15,
            msg="expected zero degrees to be exactly zero radians; a nonzero value likely added "
                "an offset - check the conversion is linear through the origin",
        )

    def test_the_skip_test_angular_speed(self):
        # 180 deg/s = pi rad/s = 3.14159 rad/s.
        self.assertAlmostEqual(
            submission.degrees_to_radians(180.0), 3.141592653589793,
            delta=1e-12,
            msg="expected the Skip test's 180 deg/s to be 3.14159 rad/s; 180.0 likely skipped "
                "the scaling - check the same conversion is used for rates",
        )


if __name__ == "__main__":
    unittest.main()
