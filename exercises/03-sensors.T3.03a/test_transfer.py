"""Transfer tests for 03-sensors.T3.03a - the same laws on the plant's own numbers.

Three claims, all against `resources/plants/mechalab_plant.py`:

  1. the plant's 12-bit encoder is exact at its own count centres, so the Fourier fit must report
     zero eccentricity on an ideal encoder - it cannot invent error out of quantisation;
  2. one count is the fit's resolution: 2*pi/4096 = 0.00153398 rad, and a 0.012 rad eccentricity
     is 7.8 counts, so the encoder cannot hide it and the fitted coefficient removes it;
  3. the fit stays orthogonal at plant resolution - a 2nd harmonic leaks nothing into the 1st -
     and the 25 kHz FOC loop the module drives executes 25 updates inside one plant tick.
"""

import math
import unittest

import harness
import mechalab_plant as plant  # noqa: E402  (harness put the plant directory on sys.path)

submission = harness.load_submission()

TURN = 2.0 * math.pi
ONE_COUNT = TURN / plant.ENCODER_CPR  # 2*pi/4096 = 0.0015339807878856412 rad
ANGLES = [TURN * k / plant.ENCODER_CPR for k in range(plant.ENCODER_CPR)]


class PlantEncoderTests(unittest.TestCase):
    def test_the_plant_encoder_is_exact_at_its_own_counts(self):
        # The ideal encoder reports the count it was given, so the measured error is zero and the
        # fit must say so: a first harmonic that is not zero would be invented, not measured.
        errors = [plant.quantize_angle(angle) - angle for angle in ANGLES]
        self.assertLess(max(abs(error) for error in errors), 1e-12)
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertLess(abs(a1), 1e-12)
        self.assertLess(abs(b1), 1e-12)

    def test_one_count_is_the_fit_resolution(self):
        # A one-count eccentricity at the plant's 4096 cpr: the fit returns exactly 2*pi/4096 rad.
        errors = [ONE_COUNT * math.cos(angle) for angle in ANGLES]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(a1, ONE_COUNT, delta=1e-12)
        self.assertAlmostEqual(a1, 0.0015339807878856412, delta=1e-12)
        self.assertLess(abs(b1), 1e-12)

    def test_a_twelve_bit_encoder_cannot_hide_the_eccentricity(self):
        # The module's 0.012 rad of first-harmonic error is 7.82 counts, and one fitted term
        # cancels it to machine precision.
        counts = 0.012 / ONE_COUNT
        self.assertGreater(counts, 7.0)
        self.assertLess(counts, 8.0)
        errors = [0.012 * math.cos(angle) for angle in ANGLES]
        a1, _b1 = submission.harmonic_coefficients(errors, 1)
        residual = max(abs(0.012 * math.cos(angle) - a1 * math.cos(angle)) for angle in ANGLES)
        self.assertLess(residual, 1e-15)

    def test_the_second_harmonic_is_orthogonal_at_plant_resolution(self):
        errors = [0.005 * math.sin(2.0 * angle) for angle in ANGLES]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        a2, b2 = submission.harmonic_coefficients(errors, 2)
        self.assertLess(abs(a1), 1e-12)
        self.assertLess(abs(b1), 1e-12)
        self.assertLess(abs(a2), 1e-12)
        self.assertAlmostEqual(b2, 0.005, delta=1e-12)

    def test_two_counts_of_ripple_at_plant_resolution(self):
        # A ripple of two counts is 0.00306796 rad - below the module's 0.012 rad concern, but the
        # fit still has to resolve it, and the leftover after correction is under one count.
        amplitude = 2.0 * ONE_COUNT
        errors = [amplitude * math.cos(angle) for angle in ANGLES]
        a1, _b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(a1, 0.0030679615757712825, delta=1e-12)
        residual = max(abs(amplitude * math.cos(angle) - a1 * math.cos(angle)) for angle in ANGLES)
        self.assertLess(residual, ONE_COUNT)


class PlantTimingTests(unittest.TestCase):
    def test_the_plant_tick_holds_twenty_five_foc_periods(self):
        # Tab 3's 25 kHz loop against the plant's 1 ms tick: 25 updates per tick, 40 us each.
        pwm_hz = 25000.0
        self.assertAlmostEqual(plant.DT * pwm_hz, 25.0, delta=1e-12)
        self.assertAlmostEqual(1.0 / pwm_hz, 40e-6, delta=1e-15)

    def test_the_hexagon_limit_holds_all_the_way_round(self):
        # At V_bus/sqrt(3) every leg stays on its rail at every electrical angle the plant's
        # encoder resolves, and the line-to-line voltage is unchanged by the offset.
        limit = submission.hexagon_limit(48.0)
        for k in range(0, plant.ENCODER_CPR, 64):
            theta = TURN * k / plant.ENCODER_CPR
            va = limit * math.cos(theta)
            vb = limit * math.cos(theta - TURN / 3.0)
            vc = limit * math.cos(theta + TURN / 3.0)
            duties = submission.svpwm_duties(va, vb, vc, 48.0)
            for duty in duties:
                self.assertGreaterEqual(duty, -1e-9)
                self.assertLessEqual(duty, 1.0 + 1e-9)
            self.assertAlmostEqual(duties[0] - duties[1], (va - vb) / 48.0, delta=1e-12)


if __name__ == "__main__":
    unittest.main()
