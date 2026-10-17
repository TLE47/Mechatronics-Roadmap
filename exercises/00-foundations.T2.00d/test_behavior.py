"""Behaviour tests for 00-foundations.T2.00d.

Each test names the mistake it catches:
  * polar/rectangular conversion that drops a sign or a quadrant;
  * `d/dt -> j omega` applied to the wrong power of s (a first-order filter that rolls off at the
    wrong rate);
  * power decibels (10 log10) instead of amplitude decibels (20 log10);
  * phase left in radians at the Bode boundary;
  * the resonance peak placed at omega_n instead of wn sqrt(1 - 2 zeta^2) - exact at zeta -> 0,
    visibly wrong at zeta = 0.3;
  * a "frequency response" that returns the worked example at every frequency.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()


class PolarTests(unittest.TestCase):
    def test_magnitude_and_phase(self):
        mag, phase = submission.to_polar(1.0 - 1.0j)
        self.assertAlmostEqual(mag, math.sqrt(2.0), delta=1e-12)
        self.assertAlmostEqual(phase, -math.pi / 4.0, delta=1e-12)

    def test_second_quadrant_keeps_its_sign(self):
        mag, phase = submission.to_polar(-1.0 + 1.0j)
        self.assertAlmostEqual(mag, math.sqrt(2.0), delta=1e-12)
        self.assertAlmostEqual(phase, 3.0 * math.pi / 4.0, delta=1e-12)

    def test_round_trip(self):
        z = submission.to_rect(2.0, math.pi / 3.0)
        self.assertAlmostEqual(z.real, 1.0, delta=1e-12)
        self.assertAlmostEqual(z.imag, math.sqrt(3.0), delta=1e-12)
        mag, phase = submission.to_polar(z)
        self.assertAlmostEqual(mag, 2.0, delta=1e-12)
        self.assertAlmostEqual(phase, math.pi / 3.0, delta=1e-12)


class FirstOrderTests(unittest.TestCase):
    def test_cutoff_is_minus_three_db_and_minus_45_degrees(self):
        tau = 0.01
        h = submission.first_order_response(tau, 1.0 / tau)
        self.assertAlmostEqual(abs(h), 1.0 / math.sqrt(2.0), delta=1e-12)
        self.assertAlmostEqual(submission.magnitude_db(h), -3.0103, delta=1e-4)
        self.assertAlmostEqual(submission.phase_deg(h), -45.0, delta=1e-9)

    def test_dc_gain_and_phase(self):
        h = submission.first_order_response(0.01, 0.0)
        self.assertAlmostEqual(h.real, 1.0, delta=1e-12)
        self.assertAlmostEqual(h.imag, 0.0, delta=1e-12)
        self.assertEqual(submission.phase_deg(h), 0.0)

    def test_rolls_off_at_20_db_per_decade(self):
        # Far above the cutoff (omega tau = 10 and 100), where the asymptote, not the corner,
        # is what the decade slope measures.
        tau = 0.01
        a = submission.magnitude_db(submission.first_order_response(tau, 1000.0))
        b = submission.magnitude_db(submission.first_order_response(tau, 10000.0))
        self.assertAlmostEqual(a - b, 20.0, delta=0.1)


class SecondOrderTests(unittest.TestCase):
    def test_resonance_of_the_worked_plant(self):
        g = submission.second_order_response(100.0, 0.05, 100.0)
        self.assertAlmostEqual(abs(g), 10.0, delta=1e-9)
        self.assertAlmostEqual(submission.magnitude_db(g), 20.0, delta=1e-9)
        self.assertAlmostEqual(submission.phase_deg(g), -90.0, delta=1e-9)

    def test_a_decade_above_resonance(self):
        g = submission.second_order_response(100.0, 0.05, 1000.0)
        self.assertAlmostEqual(submission.magnitude_db(g), -39.9127, delta=1e-3)
        self.assertAlmostEqual(submission.phase_deg(g), -179.4213, delta=1e-3)

    def test_dc_gain_is_one_for_any_damping(self):
        for zeta in (0.05, 0.4, 1.0):
            g = submission.second_order_response(50.0, zeta, 0.0)
            self.assertAlmostEqual(g.real, 1.0, delta=1e-12)

    def test_at_natural_frequency_the_gain_is_one_over_two_zeta(self):
        for wn, zeta in ((20.0, 0.5), (100.0, 0.1), (7.0, 0.25)):
            g = submission.second_order_response(wn, zeta, wn)
            self.assertAlmostEqual(abs(g), 1.0 / (2.0 * zeta), delta=1e-9)
            self.assertAlmostEqual(submission.phase_deg(g), -90.0, delta=1e-6)


class BodeTests(unittest.TestCase):
    def test_decibels_are_amplitude_decibels(self):
        self.assertAlmostEqual(submission.magnitude_db(10.0), 20.0, delta=1e-12)
        self.assertAlmostEqual(submission.magnitude_db(0.1), -20.0, delta=1e-12)
        self.assertAlmostEqual(submission.magnitude_db(1.0 / math.sqrt(2.0)), -3.0103, delta=1e-4)

    def test_phase_is_in_degrees(self):
        self.assertAlmostEqual(submission.phase_deg(-1.0j), -90.0, delta=1e-12)
        self.assertAlmostEqual(submission.phase_deg(1.0 + 1.0j), 45.0, delta=1e-12)
        self.assertAlmostEqual(submission.phase_deg(complex(-1.0, 0.0)) % 360.0, 180.0, delta=1e-6)


class ResonanceTests(unittest.TestCase):
    def test_peak_location_and_height(self):
        omega_r, peak = submission.resonance_peak(100.0, 0.05)
        self.assertAlmostEqual(omega_r, 100.0 * math.sqrt(1.0 - 2.0 * 0.05 ** 2), delta=1e-9)
        self.assertAlmostEqual(peak, 1.0 / (2.0 * 0.05 * math.sqrt(1.0 - 0.05 ** 2)), delta=1e-9)

    def test_the_peak_is_on_the_curve(self):
        for zeta in (0.05, 0.2, 0.3):
            omega_r, peak = submission.resonance_peak(100.0, zeta)
            at_peak = abs(submission.second_order_response(100.0, zeta, omega_r))
            self.assertAlmostEqual(at_peak, peak, delta=1e-6)
            # At omega_n itself the magnitude is 1/(2 zeta); at zeta = 0.3 that is 5% lower.
            self.assertGreater(abs(abs(submission.second_order_response(100.0, zeta, 100.0)) - peak), 1e-3)

    def test_no_peak_for_high_damping(self):
        for zeta in (1.0 / math.sqrt(2.0), 0.8, 1.2):
            self.assertEqual(submission.resonance_peak(100.0, zeta), (0.0, 1.0))


if __name__ == "__main__":
    unittest.main()
