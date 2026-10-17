"""Behaviour tests for 01-electronics.T2.01a.

Each test names the mistake it catches:
  * a stage that drops the mid-rail reference, so 0 A reads 0.00 V and the whole negative half of
    the bipolar range clips away at the ADC;
  * a Kelvin error charged to one pad instead of both, reporting 20% where 40% belongs;
  * a CMRR taken as a voltage ratio instead of a power ratio, exaggerating it by the square;
  * a maximum current measured from the rail rather than from the reference, doubling 33 A to 66;
  * a 12-bit code scaled by 4096 instead of 4095, one count high at the top of the range.
"""

import unittest

import harness

submission = harness.load_submission()

V_REF = 1.65
V_RAIL = 3.30
G20 = 20.0
R3M = 0.003


def adc(i_amp, v_ref=V_REF, gain=G20, r_shunt=R3M):
    return submission.shunt_adc_voltage(i_amp, r_shunt, gain, v_ref)


class ShuntStageTests(unittest.TestCase):
    def test_the_worked_plus_25_amps(self):
        self.assertAlmostEqual(adc(25.0), 3.15, delta=1e-12)
        self.assertLess(adc(25.0), V_RAIL, "3.15 V must stay inside the 3.30 V rail")

    def test_the_worked_negative_25_amps(self):
        self.assertAlmostEqual(adc(-25.0), 0.15, delta=1e-12)
        self.assertGreater(adc(-25.0), 0.0, "the negative half must stay above GND")

    def test_the_endpoints_mirror_about_the_reference(self):
        self.assertAlmostEqual((adc(25.0) + adc(-25.0)) / 2.0, V_REF, delta=1e-12)

    def test_zero_current_sits_at_the_reference(self):
        self.assertAlmostEqual(adc(0.0), V_REF, delta=1e-15)

    def test_the_stage_scales_at_60_millivolts_per_amp(self):
        self.assertAlmostEqual(adc(1.0) - adc(0.0), 0.060, delta=1e-12)
        self.assertAlmostEqual(adc(10.0) - adc(0.0), 0.600, delta=1e-12)

    def test_the_exercise_33_amps(self):
        i_max = submission.max_measurable_current(V_REF, V_RAIL, 50.0, 0.001)
        self.assertAlmostEqual(i_max, 33.0, delta=1e-9)
        self.assertAlmostEqual(submission.shunt_adc_voltage(i_max, 0.001, 50.0), V_RAIL, delta=1e-12)

    def test_the_skip_test_16_5_amps(self):
        self.assertAlmostEqual(submission.max_measurable_current(V_REF, V_RAIL, G20, 0.005), 16.5, delta=1e-9)

    def test_bad_shunts_and_gains_are_refused(self):
        for r_shunt, gain in ((0.0, G20), (-0.001, G20), (R3M, 0.0), (R3M, -1.0)):
            with self.assertRaises(ValueError):
                submission.shunt_adc_voltage(1.0, r_shunt, gain)
            with self.assertRaises(ValueError):
                submission.max_measurable_current(V_REF, V_RAIL, gain, r_shunt)


class InverseTests(unittest.TestCase):
    def test_the_inverse_round_trips_at_plus_and_minus_25(self):
        for i_amp in (25.0, -25.0, 0.0):
            self.assertAlmostEqual(submission.shunt_current_from_adc(adc(i_amp), R3M, G20), i_amp,
                                   delta=1e-9)

    def test_the_inverse_of_the_skip_test(self):
        self.assertAlmostEqual(submission.shunt_current_from_adc(0.65, 0.005, G20), -10.0, delta=1e-9)

    def test_a_zero_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.shunt_current_from_adc(1.65, R3M, 0.0)


class KelvinTests(unittest.TestCase):
    def test_the_worked_40_percent(self):
        # 0.6 mOhm per pad on a 3 mOhm shunt: 2 * 0.6 / 3.0 = 40%.
        self.assertAlmostEqual(submission.kelvin_gain_error_pct(0.003, 0.0006), 40.0, delta=1e-9)

    def test_the_formalisation_60_percent(self):
        self.assertAlmostEqual(submission.kelvin_gain_error_pct(0.002, 0.0006), 60.0, delta=1e-9)

    def test_the_skip_test_40_percent_on_two_milliohms(self):
        self.assertAlmostEqual(submission.kelvin_gain_error_pct(0.002, 0.0004), 40.0, delta=1e-9)

    def test_a_perfect_kelvin_layout_is_zero(self):
        self.assertAlmostEqual(submission.kelvin_gain_error_pct(0.003, 0.0), 0.0, delta=1e-15)

    def test_a_zero_shunt_is_refused(self):
        with self.assertRaises(ValueError):
            submission.kelvin_gain_error_pct(0.0, 0.0006)


class CmrrTests(unittest.TestCase):
    def test_the_93_db_48_volt_residue(self):
        # 48 V * 10^(-93/20) = 1.074586 mV at the amplifier input.
        self.assertAlmostEqual(submission.cmrr_input_error_v(48.0, 93.0), 1.074586147e-3, delta=1e-12)

    def test_the_residue_in_amperes_is_0_358(self):
        amps = submission.cmrr_current_error_a(48.0, 93.0, R3M)
        self.assertAlmostEqual(amps, 0.358195382, delta=1e-9)
        self.assertLess(amps, 0.4)

    def test_six_db_buys_almost_a_factor_of_two(self):
        # 6 dB is 10^(6/20) = 1.9953, not 2.0 - exactly 2.0 is 6.0206 dB.
        ninety_three = submission.cmrr_input_error_v(48.0, 93.0)
        ninety_nine = submission.cmrr_input_error_v(48.0, 99.0)
        self.assertAlmostEqual(ninety_three / ninety_nine, 10.0 ** (6.0 / 20.0), delta=1e-12)
        self.assertLess(ninety_three / ninety_nine, 2.0)

    def test_a_zero_shunt_current_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cmrr_current_error_a(48.0, 93.0, 0.0)


class AdcTests(unittest.TestCase):
    def test_the_worked_code_3909(self):
        # 3.15 / 3.30 * 4095 = 3908.86 -> 3909, not 3910.
        self.assertEqual(submission.adc_code(3.15), 3909)

    def test_zero_and_full_scale(self):
        self.assertEqual(submission.adc_code(0.0), 0)
        self.assertEqual(submission.adc_code(V_RAIL), 4095)

    def test_negative_clips_to_zero(self):
        # REF tied to GND: -25 A wants -1.50 V and the unipolar ADC can only report zero.
        self.assertEqual(submission.adc_code(-1.5), 0)

    def test_over_range_clips_at_full_scale(self):
        self.assertEqual(submission.adc_code(5.4), 4095)

    def test_bad_widths_are_refused(self):
        with self.assertRaises(ValueError):
            submission.adc_code(1.0, V_RAIL, 0)
        with self.assertRaises(ValueError):
            submission.adc_code(1.0, 0.0, 12)


if __name__ == "__main__":
    unittest.main()
