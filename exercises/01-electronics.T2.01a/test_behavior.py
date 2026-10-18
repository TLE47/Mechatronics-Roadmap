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
        self.assertAlmostEqual(
            adc(25.0),
            3.15,
            delta=1e-12,
            msg="expected 3.15 V at 25 A through 3 mOhm at 20 V/V; a value near 0.15 V likely dropped the gain - check I times R times G plus the reference",
        )
        self.assertLess(
            adc(25.0),
            V_RAIL,
            "expected the 25 A output to stay below the 3.30 V rail; a saturated value likely means the gain or shunt is too large - check the stage headroom",
        )

    def test_the_worked_negative_25_amps(self):
        self.assertAlmostEqual(
            adc(-25.0),
            0.15,
            delta=1e-12,
            msg="expected 0.15 V at -25 A, mirrored about the 1.65 V reference; 0.00 V likely dropped the mid-rail offset - check the reference is added after the gain",
        )
        self.assertGreater(
            adc(-25.0),
            0.0,
            "expected the negative half to sit above GND at a bipolar reference; 0.00 V likely tied REF to ground - check the reference input",
        )

    def test_the_endpoints_mirror_about_the_reference(self):
        self.assertAlmostEqual(
            (adc(25.0) + adc(-25.0)) / 2.0,
            V_REF,
            delta=1e-12,
            msg="expected the +25 A and -25 A outputs to average to the 1.65 V reference; an off-centre mean likely skewed one polarity - check the reference is added to both",
        )

    def test_zero_current_sits_at_the_reference(self):
        self.assertAlmostEqual(
            adc(0.0),
            V_REF,
            delta=1e-15,
            msg="expected 0 A to read exactly the 1.65 V reference; 0.00 V likely skipped the offset term - check the stage zero point before the ADC",
        )

    def test_the_stage_scales_at_60_millivolts_per_amp(self):
        self.assertAlmostEqual(
            adc(1.0) - adc(0.0),
            0.060,
            delta=1e-12,
            msg="expected 60 mV per amp at 3 mOhm and 20 V/V; a 3 mV step likely used the shunt drop alone - check the gain multiplies the drop",
        )
        self.assertAlmostEqual(
            adc(10.0) - adc(0.0),
            0.600,
            delta=1e-12,
            msg="expected 600 mV across 10 A at 60 mV/A; a 60 mV result likely computed a single amp - check the current is multiplied, not added",
        )

    def test_the_exercise_33_amps(self):
        i_max = submission.max_measurable_current(V_REF, V_RAIL, 50.0, 0.001)
        self.assertAlmostEqual(
            i_max,
            33.0,
            delta=1e-9,
            msg="expected 33 A from a 1.65 V swing over 1 mOhm at 50 V/V; 66 A likely measured from the rail instead of the reference - check the numerator",
        )
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(i_max, 0.001, 50.0),
            V_RAIL,
            delta=1e-12,
            msg="expected the maximum current to map exactly to the 3.30 V rail; a lower value likely used only the 1.65 V half - check the range used",
        )

    def test_the_skip_test_16_5_amps(self):
        self.assertAlmostEqual(
            submission.max_measurable_current(V_REF, V_RAIL, G20, 0.005),
            16.5,
            delta=1e-9,
            msg="expected 16.5 A from a 1.65 V swing over 5 mOhm at 20 V/V; 33 A likely halved the shunt or doubled the gain - check both values",
        )

    def test_bad_shunts_and_gains_are_refused(self):
        for r_shunt, gain in ((0.0, G20), (-0.001, G20), (R3M, 0.0), (R3M, -1.0)):
            with self.assertRaises(ValueError):
                submission.shunt_adc_voltage(1.0, r_shunt, gain)
            with self.assertRaises(ValueError):
                submission.max_measurable_current(V_REF, V_RAIL, gain, r_shunt)


class InverseTests(unittest.TestCase):
    def test_the_inverse_round_trips_at_plus_and_minus_25(self):
        for i_amp in (25.0, -25.0, 0.0):
            self.assertAlmostEqual(
                submission.shunt_current_from_adc(adc(i_amp), R3M, G20),
                i_amp,
                delta=1e-9,
                msg="expected the inverse to recover 25, -25 and 0 A from their own codes; a sign flip likely dropped the reference subtraction - check the inverse mirrors the forward stage",
            )

    def test_the_inverse_of_the_skip_test(self):
        self.assertAlmostEqual(
            submission.shunt_current_from_adc(0.65, 0.005, G20),
            -10.0,
            delta=1e-9,
            msg="expected -10 A at 0.65 V, one volt below the 1.65 V reference; +10 A likely used the rail as the zero - check the subtraction order",
        )

    def test_a_zero_gain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.shunt_current_from_adc(1.65, R3M, 0.0)


class KelvinTests(unittest.TestCase):
    def test_the_worked_40_percent(self):
        # 0.6 mOhm per pad on a 3 mOhm shunt: 2 * 0.6 / 3.0 = 40%.
        self.assertAlmostEqual(
            submission.kelvin_gain_error_pct(0.003, 0.0006),
            40.0,
            delta=1e-9,
            msg="expected 40% gain error from two 0.6 mOhm pads on a 3 mOhm shunt; 20% likely charged only one pad - check both pads are counted",
        )

    def test_the_formalisation_60_percent(self):
        self.assertAlmostEqual(
            submission.kelvin_gain_error_pct(0.002, 0.0006),
            60.0,
            delta=1e-9,
            msg="expected 60% from two 0.6 mOhm pads on a 2 mOhm shunt; 30% likely charged a single pad - check 2 times pad over shunt",
        )

    def test_the_skip_test_40_percent_on_two_milliohms(self):
        self.assertAlmostEqual(
            submission.kelvin_gain_error_pct(0.002, 0.0004),
            40.0,
            delta=1e-9,
            msg="expected 40% from two 0.4 mOhm pads on 2 mOhm; a 0.40 result likely forgot the hundred scale - check the percentage factor",
        )

    def test_a_perfect_kelvin_layout_is_zero(self):
        self.assertAlmostEqual(
            submission.kelvin_gain_error_pct(0.003, 0.0),
            0.0,
            delta=1e-15,
            msg="expected zero error when the pads carry no resistance; a non-zero value likely added a default pad - check the zero case returns 0",
        )

    def test_a_zero_shunt_is_refused(self):
        with self.assertRaises(ValueError):
            submission.kelvin_gain_error_pct(0.0, 0.0006)


class CmrrTests(unittest.TestCase):
    def test_the_93_db_48_volt_residue(self):
        # 48 V * 10^(-93/20) = 1.074586 mV at the amplifier input.
        self.assertAlmostEqual(
            submission.cmrr_input_error_v(48.0, 93.0),
            1.074586147e-3,
            delta=1e-12,
            msg="expected 1.0746 mV at 48 V and 93 dB; a value near 1.07 V likely treated dB as a voltage ratio - check 10 to the minus dB over 20",
        )

    def test_the_residue_in_amperes_is_0_358(self):
        amps = submission.cmrr_current_error_a(48.0, 93.0, R3M)
        self.assertAlmostEqual(
            amps,
            0.358195382,
            delta=1e-9,
            msg="expected 0.358 A through a 3 mOhm shunt from the 93 dB residue; 0.107 A likely divided by the 20 V/V gain - check the residue is scaled by the shunt alone",
        )
        self.assertLess(
            amps,
            0.4,
            "expected the CMRR residue to stay under 0.4 A; a larger value likely squared the dB conversion - check the exponent",
        )

    def test_six_db_buys_almost_a_factor_of_two(self):
        # 6 dB is 10^(6/20) = 1.9953, not 2.0 - exactly 2.0 is 6.0206 dB.
        ninety_three = submission.cmrr_input_error_v(48.0, 93.0)
        ninety_nine = submission.cmrr_input_error_v(48.0, 99.0)
        self.assertAlmostEqual(
            ninety_three / ninety_nine,
            10.0 ** (6.0 / 20.0),
            delta=1e-12,
            msg="expected a 6 dB improvement to be a factor 1.9953; exactly 2.0 likely assumed 6 dB doubles - check 10 to the 6 over 20",
        )
        self.assertLess(
            ninety_three / ninety_nine,
            2.0,
            "expected the six-decibel ratio to stay just under two; 2.0 likely used the power definition - check the voltage form",
        )

    def test_a_zero_shunt_current_is_refused(self):
        with self.assertRaises(ValueError):
            submission.cmrr_current_error_a(48.0, 93.0, 0.0)


class AdcTests(unittest.TestCase):
    def test_the_worked_code_3909(self):
        # 3.15 / 3.30 * 4095 = 3908.86 -> 3909, not 3910.
        self.assertEqual(
            submission.adc_code(3.15),
            3909,
            "expected code 3909 at 3.15 V of a 3.30 V full scale; 3910 likely divided by 4096 instead of 4095 - check the full-scale divisor",
        )

    def test_zero_and_full_scale(self):
        self.assertEqual(
            submission.adc_code(0.0),
            0,
            "expected code 0 at 0 V; a non-zero code likely skipped the lower clip - check the floor before scaling",
        )
        self.assertEqual(
            submission.adc_code(V_RAIL),
            4095,
            "expected 4095 at exactly the rail; 4096 likely used the count range instead of the maximum code - check two to the bits minus one",
        )

    def test_negative_clips_to_zero(self):
        # REF tied to GND: -25 A wants -1.50 V and the unipolar ADC can only report zero.
        self.assertEqual(
            submission.adc_code(-1.5),
            0,
            "expected -1.50 V to clip to code 0 on a unipolar ADC; a negative code likely let the voltage through unsigned - check the clamp",
        )

    def test_over_range_clips_at_full_scale(self):
        self.assertEqual(
            submission.adc_code(5.4),
            4095,
            "expected 5.4 V to clip at 4095; a larger code likely scaled past full scale - check the upper clamp",
        )

    def test_bad_widths_are_refused(self):
        with self.assertRaises(ValueError):
            submission.adc_code(1.0, V_RAIL, 0)
        with self.assertRaises(ValueError):
            submission.adc_code(1.0, 0.0, 12)


if __name__ == "__main__":
    unittest.main()
