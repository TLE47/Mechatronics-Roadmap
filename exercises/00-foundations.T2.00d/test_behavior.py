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
        self.assertAlmostEqual(
            mag, 5.0, delta=1e-12,
            msg="expected 3 + 4j to have magnitude 5; 7 means the parts were added instead of "
                "squared - check hypot(re, im)",
        )
        self.assertAlmostEqual(
            phase, math.atan2(4.0, 3.0), delta=1e-12,
            msg="expected the phase to be atan2(4, 3), 0.927 rad; 0.644 means atan(im/re) was "
                "used, which cannot see the quadrant - check atan2",
        )

    def test_phase_covers_all_four_quadrants(self):
        expected = {
            (1.0, 1.0): math.pi / 4.0,
            (-1.0, 1.0): 3.0 * math.pi / 4.0,
            (-1.0, -1.0): -3.0 * math.pi / 4.0,
            (1.0, -1.0): -math.pi / 4.0,
        }
        for (real, imag), phase in expected.items():
            _mag, got = submission.to_polar(complex(real, imag))
            self.assertAlmostEqual(
                got, phase, delta=1e-12,
                msg="expected each quadrant to keep its own angle, so the four corners read plus "
                    "or minus 45 and 135 degrees; a repeated value means acos of the real part - "
                    "check atan2",
            )

    def test_negative_real_axis_is_pi(self):
        mag, phase = submission.to_polar(-2.0 + 0.0j)
        self.assertAlmostEqual(
            mag, 2.0, delta=1e-12,
            msg="expected -2 + 0j to keep magnitude 2; 0 means the sign was squared away by "
                "an acos on the real part - check hypot",
        )
        self.assertAlmostEqual(
            abs(phase), math.pi, delta=1e-12,
            msg="expected the negative real axis to sit at plus or minus pi; 0 means the sign of "
                "the real part was lost - check atan2's two arguments",
        )

    def test_zero_is_zero(self):
        self.assertEqual(
            submission.to_polar(0j), (0.0, 0.0),
            msg="expected the origin to return exactly (0.0, 0.0); another pair means an angle "
                "was invented for a vector with no length - check the zero case",
        )


class RectTests(unittest.TestCase):
    def test_euler_identity(self):
        z = submission.to_rect(1.0, math.pi)
        self.assertAlmostEqual(
            z.real, -1.0, delta=1e-12,
            msg="expected the unit phasor at pi to have real part -1, Euler's identity; +1 means "
                "the angle was treated as degrees and wrapped to zero",
        )
        self.assertAlmostEqual(
            z.imag, 0.0, delta=1e-12,
            msg="expected the same phasor's imaginary part to be zero, not 0.055; a small nonzero "
                "residue means pi arrived as 3.14 degrees",
        )
        quarter = submission.to_rect(1.0, math.pi / 2.0)
        self.assertAlmostEqual(
            quarter.real, 0.0, delta=1e-12,
            msg="expected a quarter turn to have no real part; a nonzero value means the cosine "
                "was evaluated on the wrong axis - check cos for the real part",
        )
        self.assertAlmostEqual(
            quarter.imag, 1.0, delta=1e-12,
            msg="expected a quarter turn to have imaginary part 1; 0.027 means the angle was "
                "converted from degrees twice",
        )

    def test_round_trip(self):
        z = submission.to_rect(2.0, math.pi / 3.0)
        self.assertAlmostEqual(
            z.real, 1.0, delta=1e-12,
            msg="expected magnitude 2 at 60 degrees to have real part 1; 0.034 means the angle "
                "was read as degrees - check radians",
        )
        self.assertAlmostEqual(
            z.imag, math.sqrt(3.0), delta=1e-12,
            msg="expected the same phasor's imaginary part to be sqrt(3); 0.06 means the sine was "
                "evaluated on an angle 57 times too small",
        )
        mag, phase = submission.to_polar(z)
        self.assertAlmostEqual(
            mag, 2.0, delta=1e-12,
            msg="expected the round trip to give the magnitude back; a smaller value means the "
                "rectangular form lost one component - check both cos and sin terms",
        )
        self.assertAlmostEqual(
            phase, math.pi / 3.0, delta=1e-12,
            msg="expected the round trip to give the 60 degree angle back; a different angle "
                "means the polar form used atan without atan2",
        )

    def test_magnitude_scales_the_result(self):
        self.assertAlmostEqual(
            abs(submission.to_rect(3.0, 0.0)), 3.0, delta=1e-12,
            msg="expected a phasor of magnitude 3 at zero angle to have length 3; 1.0 means the "
                "magnitude was ignored and a unit phasor returned",
        )
        self.assertAlmostEqual(
            abs(submission.to_rect(0.0, 1.0)), 0.0, delta=1e-12,
            msg="expected a zero-magnitude phasor to be the origin whatever its angle; a unit "
                "length means the magnitude was replaced by a default",
        )


class PhasorSumTests(unittest.TestCase):
    def test_opposite_phasors_cancel(self):
        total = submission.add_phasors(
            submission.to_rect(1.0, 0.0), submission.to_rect(1.0, math.pi))
        self.assertAlmostEqual(
            abs(total), 0.0, delta=1e-12,
            msg="expected two opposite unit phasors to cancel to zero; 2.0 means the magnitudes "
                "were added, which is the mistake this module is about",
        )

    def test_equal_phasors_double(self):
        mag, phase = submission.to_polar(
            submission.add_phasors(submission.to_rect(1.0, 0.0), submission.to_rect(1.0, 0.0))
        )
        self.assertAlmostEqual(
            mag, 2.0, delta=1e-12,
            msg="expected two aligned unit phasors to reach magnitude 2; 1.414 means they were "
                "combined as an RMS sum - check the complex addition",
        )
        self.assertAlmostEqual(
            phase, 0.0, delta=1e-12,
            msg="expected the sum of two zero-angle phasors to stay at zero angle; a nonzero "
                "phase means the imaginary parts did not cancel",
        )

    def test_sixty_degree_pair_is_sqrt_three_at_thirty(self):
        total = submission.add_phasors(
            submission.to_rect(1.0, 0.0), submission.to_rect(1.0, math.pi / 3.0)
        )
        mag, phase = submission.to_polar(total)
        self.assertAlmostEqual(
            mag, math.sqrt(3.0), delta=1e-12,
            msg="expected two unit phasors 60 degrees apart to sum to sqrt(3); 2.0 means the "
                "angles were discarded before the sum",
        )
        self.assertAlmostEqual(
            phase, math.pi / 6.0, delta=1e-12,
            msg="expected that sum to bisect the pair at 30 degrees; 0 means the second phasor's "
                "imaginary part never arrived - check the sine term",
        )

    def test_triangle_inequality(self):
        for a, b in ((0.3, 1.9), (2.0, 2.0), (0.5, 3.0)):
            total = submission.add_phasors(
                submission.to_rect(a, 0.2), submission.to_rect(b, 2.7))
            self.assertLessEqual(
                abs(total), a + b + 1e-12,
                msg="expected no phasor sum to exceed the arithmetic sum of its lengths, the "
                    "triangle inequality; a larger total means the lengths were added regardless",
            )
            self.assertGreaterEqual(
                abs(total), abs(a - b) - 1e-12,
                msg="expected no phasor sum to fall below the difference of its lengths; a "
                    "smaller total means the two angles were made too close - check the angles",
            )


if __name__ == "__main__":
    unittest.main()
