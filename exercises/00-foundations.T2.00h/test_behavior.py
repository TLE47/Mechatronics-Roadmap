"""Behaviour tests for 00-foundations.T2.00h.

Each test names the mistake it catches:
  * an impedance whose reactance was added to the resistance instead of forming a hypotenuse;
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


class ImpedanceTests(unittest.TestCase):
    def test_magnitude_is_the_hypotenuse(self):
        z = submission.impedance_rl(3.0, 0.004, 1000.0)
        self.assertAlmostEqual(
            z.real, 3.0, delta=1e-12,
            msg="expected the real part to stay 3 ohm; another value likely added the "
                "reactance into the resistance - check R is kept separate",
        )
        self.assertAlmostEqual(
            z.imag, 4.0, delta=1e-12,
            msg="expected omega L = 1000 * 0.004 = 4 ohm of reactance; 0.004 likely forgot "
                "omega - check the imaginary part",
        )
        self.assertAlmostEqual(
            abs(z), 5.0, delta=1e-9,
            msg="expected sqrt(3^2 + 4^2) = 5 ohm; 7 is the sum R + wL and 1 is their "
                "difference - check the magnitude is a hypotenuse",
        )
        self.assertAlmostEqual(
            submission.phase_deg(z), 53.13010235415598, delta=1e-9,
            msg="expected atan(4/3) = 53.13 deg for this winding; 0.927 is the same angle in "
                "radians - check the conversion to degrees",
        )

    def test_dc_makes_the_inductor_a_wire(self):
        z = submission.impedance_rl(2.5, 0.01, 0.0)
        self.assertEqual(
            z, complex(2.5, 0.0),
            msg="expected a zero-frequency inductor to leave just 2.5 ohm; a nonzero imaginary "
                "part likely used a default frequency - check omega = 0",
        )


class FirstOrderTests(unittest.TestCase):
    def test_cutoff_is_minus_three_db_and_minus_45_degrees(self):
        tau = 0.01
        h = submission.first_order_response(tau, 1.0 / tau)
        self.assertAlmostEqual(
            abs(h), 1.0 / math.sqrt(2.0), delta=1e-12,
            msg="expected |H| = 0.7071 at the cutoff, where omega tau = 1; 1.0 likely evaluated "
                "at DC - check 1 / sqrt(1 + (w tau)^2)",
        )
        self.assertAlmostEqual(
            submission.magnitude_db(h), -3.0103, delta=1e-4,
            msg="expected -3.01 dB at the cutoff; -6.02 likely used 10 log10 instead of 20 - "
                "check amplitude decibels",
        )
        self.assertAlmostEqual(
            submission.phase_deg(h), -45.0, delta=1e-9,
            msg="expected -45 deg at the cutoff; -0.785 is the same angle in radians - check "
                "the phase is converted",
        )

    def test_dc_gain_and_phase(self):
        h = submission.first_order_response(0.01, 0.0)
        self.assertAlmostEqual(
            h.real, 1.0, delta=1e-12,
            msg="expected a unity real part at DC; another value likely included a gain the "
                "canonical form does not have - check the numerator",
        )
        self.assertAlmostEqual(
            h.imag, 0.0, delta=1e-12,
            msg="expected no imaginary part at DC; a nonzero value likely left omega in the "
                "denominator - check omega = 0 makes it purely real",
        )
        self.assertEqual(
            submission.phase_deg(h), 0.0,
            msg="expected a zero phase at DC; another value likely added a constant offset - "
                "check atan2 of a positive real number",
        )

    def test_rolls_off_at_20_db_per_decade(self):
        # Far above the cutoff (omega tau = 10 and 100), where the asymptote, not the corner,
        # is what the decade slope measures.
        tau = 0.01
        a = submission.magnitude_db(submission.first_order_response(tau, 1000.0))
        b = submission.magnitude_db(submission.first_order_response(tau, 10000.0))
        self.assertAlmostEqual(
            a - b, 20.0, delta=0.1,
            msg="expected a first-order filter to lose 20 dB per decade; 10 means power "
                "decibels were used, 40 means a second-order pole - check the slope",
        )


class SecondOrderTests(unittest.TestCase):
    def test_resonance_of_the_worked_plant(self):
        g = submission.second_order_response(100.0, 0.05, 100.0)
        self.assertAlmostEqual(
            abs(g), 10.0, delta=1e-9,
            msg="expected |G| = 1/(2 zeta) = 10 at the natural frequency; 1.0 likely evaluated "
                "at DC, 0.1 inverted the ratio - check the denominator",
        )
        self.assertAlmostEqual(
            submission.magnitude_db(g), 20.0, delta=1e-9,
            msg="expected the 10x peak to be +20 dB; 10 likely used 10 log10 - check amplitude "
                "decibels for a gain of 10",
        )
        self.assertAlmostEqual(
            submission.phase_deg(g), -90.0, delta=1e-9,
            msg="expected -90 deg exactly at wn, where the response is purely imaginary; "
                "-1.57 is radians - check the phase is in degrees",
        )

    def test_a_decade_above_resonance(self):
        g = submission.second_order_response(100.0, 0.05, 1000.0)
        self.assertAlmostEqual(
            submission.magnitude_db(g), -39.9127, delta=1e-3,
            msg="expected -39.9 dB a decade above wn for a second-order pole; -19.96 means the "
                "roll-off is only first order - check s^2 in the denominator",
        )
        self.assertAlmostEqual(
            submission.phase_deg(g), -179.4213, delta=1e-3,
            msg="expected the phase to approach -180 deg a decade above wn; -90 means one pole "
                "was dropped - check both powers of s",
        )

    def test_dc_gain_is_one_for_any_damping(self):
        for zeta in (0.05, 0.4, 1.0):
            g = submission.second_order_response(50.0, zeta, 0.0)
            self.assertAlmostEqual(
                g.real, 1.0, delta=1e-12,
                msg="expected a unity DC gain at every damping ratio in this loop; a value "
                    "below 1 likely divided by the damping as well - check omega = 0",
            )

    def test_at_natural_frequency_the_gain_is_one_over_two_zeta(self):
        for wn, zeta in ((20.0, 0.5), (100.0, 0.1), (7.0, 0.25)):
            g = submission.second_order_response(wn, zeta, wn)
            self.assertAlmostEqual(
                abs(g), 1.0 / (2.0 * zeta), delta=1e-9,
                msg="expected |G| = 1/(2 zeta) at wn for every pair in this loop; 1.0 likely "
                    "returned DC gain - check the imaginary denominator",
            )
            self.assertAlmostEqual(
                submission.phase_deg(g), -90.0, delta=1e-6,
                msg="expected -90 deg at wn for every pair in this loop, independent of zeta; "
                    "another angle likely added a damping term to the phase",
            )


class BodeTests(unittest.TestCase):
    def test_decibels_are_amplitude_decibels(self):
        self.assertAlmostEqual(
            submission.magnitude_db(10.0), 20.0, delta=1e-12,
            msg="expected a gain of 10 to be +20 dB; 10 means 10 log10 was used - check "
                "amplitude decibels double the power formula",
        )
        self.assertAlmostEqual(
            submission.magnitude_db(0.1), -20.0, delta=1e-12,
            msg="expected a gain of 0.1 to be -20 dB; -10 means the power formula was used - "
                "check the factor of 20",
        )
        self.assertAlmostEqual(
            submission.magnitude_db(1.0 / math.sqrt(2.0)), -3.0103, delta=1e-4,
            msg="expected the half-power point to be -3.01 dB; -1.505 means the factor was 10 - "
                "check 20 log10",
        )

    def test_phase_is_in_degrees(self):
        self.assertAlmostEqual(
            submission.phase_deg(-1.0j), -90.0, delta=1e-12,
            msg="expected -j to read -90 deg; -1.5708 is radians - check the conversion",
        )
        self.assertAlmostEqual(
            submission.phase_deg(1.0 + 1.0j), 45.0, delta=1e-12,
            msg="expected 1 + j to read +45 deg; 0.785 is radians - check degrees",
        )
        self.assertAlmostEqual(
            submission.phase_deg(complex(-1.0, 0.0)) % 360.0, 180.0, delta=1e-6,
            msg="expected -1 to sit at 180 deg once wrapped into [0, 360); 0.0 probably means "
                "the phase took an absolute value - check the modulo",
        )


class ResonanceTests(unittest.TestCase):
    def test_peak_location_and_height(self):
        omega_r, peak = submission.resonance_peak(100.0, 0.05)
        self.assertAlmostEqual(
            omega_r, 100.0 * math.sqrt(1.0 - 2.0 * 0.05 ** 2), delta=1e-9,
            msg="expected the peak just below wn, at wn sqrt(1 - 2 zeta^2); 100.0 means the "
                "peak was placed at wn, which is only right as zeta goes to zero",
        )
        self.assertAlmostEqual(
            peak, 1.0 / (2.0 * 0.05 * math.sqrt(1.0 - 0.05 ** 2)), delta=1e-9,
            msg="expected the peak height 1/(2 zeta sqrt(1 - zeta^2)); 10 is the height at wn, "
                "which is lower for a damped system - check the extra root",
        )

    def test_the_peak_is_on_the_curve(self):
        for zeta in (0.05, 0.2, 0.3):
            omega_r, peak = submission.resonance_peak(100.0, zeta)
            at_peak = abs(submission.second_order_response(100.0, zeta, omega_r))
            self.assertAlmostEqual(
                at_peak, peak, delta=1e-6,
                msg="expected the reported peak to be the curve's actual value at its own "
                    "frequency for every damping in this loop; a mismatch means the two "
                    "formulas disagree",
            )
            # At omega_n itself the magnitude is 1/(2 zeta); at zeta = 0.3 that is 5% lower.
            self.assertGreater(
                abs(abs(submission.second_order_response(100.0, zeta, 100.0)) - peak), 1e-3,
                msg="expected the value at wn to differ measurably from the true peak for every "
                    "damping in this loop, which is why the peak is not at wn; equality means "
                    "resonance_peak returned wn itself",
            )

    def test_no_peak_for_high_damping(self):
        for zeta in (1.0 / math.sqrt(2.0), 0.8, 1.2):
            self.assertEqual(
                submission.resonance_peak(100.0, zeta), (0.0, 1.0),
                msg="expected no resonant peak at or above zeta = 1/sqrt(2), reported as "
                    "(0.0, 1.0); another pair likely always computed the square root",
            )


if __name__ == "__main__":
    unittest.main()
