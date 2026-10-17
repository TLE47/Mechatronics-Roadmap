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
        self.assertAlmostEqual(submission.sensor_voltage(0.20, 5.0, 1.65), 2.65, delta=1e-12)

    def test_the_skip_test_voltage(self):
        # The Skip test's sensor: 0.5 V at 0 A and 2.5 V at 10 A is a 0.20 V/A line.
        self.assertAlmostEqual(submission.sensor_voltage(0.20, 10.0, 0.5), 2.5, delta=1e-12)

    def test_the_skip_test_current(self):
        # (1.7 V - 0.5 V) / 0.20 V/A = 6.0 A.
        self.assertAlmostEqual(submission.sensor_current(0.20, 1.7, 0.5), 6.0, delta=1e-9)

    def test_the_line_and_its_inverse_undo_each_other(self):
        for amps in (0.0, 2.5, 5.0, 12.5):
            volts = submission.sensor_voltage(0.20, amps, 1.65)
            self.assertAlmostEqual(submission.sensor_current(0.20, volts, 1.65), amps, delta=1e-9)

    def test_an_inverting_sensor_flips_the_sign(self):
        # A -0.20 V/A line centred on 2.5 V reads 1.5 V at 5 A.
        self.assertAlmostEqual(submission.sensor_voltage(-0.20, 5.0, 2.5), 1.5, delta=1e-12)

    def test_a_zero_slope_has_no_inverse(self):
        with self.assertRaises(ValueError):
            submission.sensor_current(0.0, 1.7, 0.5)


class CartesianTests(unittest.TestCase):
    def test_the_worked_tip_x(self):
        x, _y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(x, WORKED_X, delta=1e-12)

    def test_the_worked_tip_y(self):
        _x, y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(y, WORKED_Y, delta=1e-12)

    def test_the_worked_tip_keeps_the_link_length(self):
        x, y = submission.polar_to_cartesian(0.40, math.radians(135.0))
        self.assertAlmostEqual(submission.link_length(x, y), 0.40, delta=1e-12)

    def test_the_skip_test_x_coordinate(self):
        # 0.20 m at 120 deg: cos(120) = -0.5, so x = -0.10 m and y = +0.1732 m.
        x, y = submission.polar_to_cartesian(0.20, math.radians(120.0))
        self.assertAlmostEqual(x, -0.10, delta=1e-9)
        self.assertGreater(y, 0.0)

    def test_the_exercise_distance(self):
        # hypot(-0.30, -0.40) = 0.50 m; the Manhattan distance would say 0.70 m.
        self.assertAlmostEqual(submission.link_length(-0.30, -0.40), 0.50, delta=1e-12)

    def test_a_quadrant_three_tip_keeps_both_signs(self):
        x, y = submission.polar_to_cartesian(0.50, math.radians(233.130102354))
        self.assertAlmostEqual(x, -0.30, delta=1e-9)
        self.assertAlmostEqual(y, -0.40, delta=1e-9)

    def test_a_negative_length_is_refused(self):
        with self.assertRaises(ValueError):
            submission.polar_to_cartesian(-0.40, 0.0)


class HeadingTests(unittest.TestCase):
    def test_the_worked_quadrant_two_heading(self):
        # atan2(+0.28284, -0.28284) = +135.0 deg; atan(y / x) would say -45.0 deg.
        self.assertAlmostEqual(submission.heading_deg(WORKED_X, WORKED_Y), 135.0, delta=1e-9)

    def test_the_exercise_quadrant_three_heading(self):
        # atan2(-0.40, -0.30) = -126.86989764584402 deg; atan2(x, y) would say -143.13 deg.
        self.assertAlmostEqual(submission.heading_deg(-0.30, -0.40), -126.86989764584402,
                               delta=1e-9)

    def test_the_skip_test_quadrant_three_diagonal(self):
        self.assertAlmostEqual(submission.heading_deg(-1.0, -1.0), -135.0, delta=1e-9)

    def test_all_four_quadrants(self):
        cases = (
            (0.30, 0.40, 53.13010235415598),
            (-0.30, 0.40, 126.86989764584402),
            (-0.30, -0.40, -126.86989764584402),
            (0.30, -0.40, -53.13010235415598),
        )
        for x, y, expected in cases:
            self.assertAlmostEqual(submission.heading_deg(x, y), expected, delta=1e-9,
                                   msg="tip (%g, %g)" % (x, y))

    def test_straight_up_is_ninety(self):
        self.assertAlmostEqual(submission.heading_deg(0.0, 0.25), 90.0, delta=1e-12)

    def test_straight_down_is_minus_ninety(self):
        self.assertAlmostEqual(submission.heading_rad(0.0, -0.25), -math.pi / 2.0, delta=1e-12)

    def test_the_plain_arctan_trap(self):
        # The discriminator from the module's Common mistakes: at this tip atan(y / x) = -45 deg,
        # a heading 180 deg away from the right answer.
        self.assertNotAlmostEqual(submission.heading_deg(WORKED_X, WORKED_Y),
                                  math.degrees(math.atan(WORKED_Y / WORKED_X)), delta=1.0)

    def test_the_origin_has_no_heading(self):
        with self.assertRaises(ValueError):
            submission.heading_rad(0.0, 0.0)


class AngleTests(unittest.TestCase):
    def test_degrees_to_radians(self):
        self.assertAlmostEqual(submission.degrees_to_radians(135.0), 2.356194490192345,
                               delta=1e-12)

    def test_a_half_turn_is_pi(self):
        self.assertAlmostEqual(submission.degrees_to_radians(180.0), math.pi, delta=1e-12)

    def test_zero_degrees_is_zero_radians(self):
        self.assertAlmostEqual(submission.degrees_to_radians(0.0), 0.0, delta=1e-15)

    def test_the_skip_test_angular_speed(self):
        # 180 deg/s = pi rad/s = 3.14159 rad/s.
        self.assertAlmostEqual(submission.degrees_to_radians(180.0), 3.141592653589793,
                               delta=1e-12)


if __name__ == "__main__":
    unittest.main()
