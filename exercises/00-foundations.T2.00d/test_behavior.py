"""Behaviour tests for 00-foundations.T2.00d.

Each test names the mistake it catches:
  * a polar conversion that takes `acos` of the real part and so loses every negative quadrant;
  * a rectangular conversion that feeds degrees into a function promising radians;
  * a phasor sum that adds magnitudes, which turns total cancellation into doubling.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()


class PolarTests(unittest.TestCase):
    def test_magnitude_is_the_hypotenuse(self):
        mag, phase = submission.to_polar(3.0 + 4.0j)
        self.assertAlmostEqual(mag, 5.0, delta=1e-12)
        self.assertAlmostEqual(phase, math.atan2(4.0, 3.0), delta=1e-12)

    def test_phase_covers_all_four_quadrants(self):
        expected = {
            (1.0, 1.0): math.pi / 4.0,
            (-1.0, 1.0): 3.0 * math.pi / 4.0,
            (-1.0, -1.0): -3.0 * math.pi / 4.0,
            (1.0, -1.0): -math.pi / 4.0,
        }
        for (real, imag), phase in expected.items():
            _mag, got = submission.to_polar(complex(real, imag))
            self.assertAlmostEqual(got, phase, delta=1e-12, msg="quadrant of %s" % ((real, imag),))

    def test_negative_real_axis_is_pi(self):
        mag, phase = submission.to_polar(-2.0 + 0.0j)
        self.assertAlmostEqual(mag, 2.0, delta=1e-12)
        self.assertAlmostEqual(abs(phase), math.pi, delta=1e-12)

    def test_zero_is_zero(self):
        self.assertEqual(submission.to_polar(0j), (0.0, 0.0))


class RectTests(unittest.TestCase):
    def test_euler_identity(self):
        z = submission.to_rect(1.0, math.pi)
        self.assertAlmostEqual(z.real, -1.0, delta=1e-12)
        self.assertAlmostEqual(z.imag, 0.0, delta=1e-12)
        quarter = submission.to_rect(1.0, math.pi / 2.0)
        self.assertAlmostEqual(quarter.real, 0.0, delta=1e-12)
        self.assertAlmostEqual(quarter.imag, 1.0, delta=1e-12)

    def test_round_trip(self):
        z = submission.to_rect(2.0, math.pi / 3.0)
        self.assertAlmostEqual(z.real, 1.0, delta=1e-12)
        self.assertAlmostEqual(z.imag, math.sqrt(3.0), delta=1e-12)
        mag, phase = submission.to_polar(z)
        self.assertAlmostEqual(mag, 2.0, delta=1e-12)
        self.assertAlmostEqual(phase, math.pi / 3.0, delta=1e-12)

    def test_magnitude_scales_the_result(self):
        self.assertAlmostEqual(abs(submission.to_rect(3.0, 0.0)), 3.0, delta=1e-12)
        self.assertAlmostEqual(abs(submission.to_rect(0.0, 1.0)), 0.0, delta=1e-12)


class PhasorSumTests(unittest.TestCase):
    def test_opposite_phasors_cancel(self):
        total = submission.add_phasors(submission.to_rect(1.0, 0.0), submission.to_rect(1.0, math.pi))
        self.assertAlmostEqual(abs(total), 0.0, delta=1e-12)

    def test_equal_phasors_double(self):
        mag, phase = submission.to_polar(
            submission.add_phasors(submission.to_rect(1.0, 0.0), submission.to_rect(1.0, 0.0))
        )
        self.assertAlmostEqual(mag, 2.0, delta=1e-12)
        self.assertAlmostEqual(phase, 0.0, delta=1e-12)

    def test_sixty_degree_pair_is_sqrt_three_at_thirty(self):
        total = submission.add_phasors(
            submission.to_rect(1.0, 0.0), submission.to_rect(1.0, math.pi / 3.0)
        )
        mag, phase = submission.to_polar(total)
        self.assertAlmostEqual(mag, math.sqrt(3.0), delta=1e-12)
        self.assertAlmostEqual(phase, math.pi / 6.0, delta=1e-12)

    def test_triangle_inequality(self):
        for a, b in ((0.3, 1.9), (2.0, 2.0), (0.5, 3.0)):
            total = submission.add_phasors(submission.to_rect(a, 0.2), submission.to_rect(b, 2.7))
            self.assertLessEqual(abs(total), a + b + 1e-12)
            self.assertGreaterEqual(abs(total), abs(a - b) - 1e-12)


if __name__ == "__main__":
    unittest.main()
