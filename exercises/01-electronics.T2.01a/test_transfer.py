"""Transfer tests for 01-electronics.T2.01a - the stage on the workbench's real numbers.

Six claims:
  1. one count of the 12-bit, 3.30 V ADC is 13.4 mA through a 3 mOhm shunt at 20 V/V, and the plant
     only gets one such decision per 1 kHz tick;
  2. the A2 gain variant (50 V/V) buys resolution and pays for it with an 11 A clip, while 20 V/V
     holds the whole 25 A worked example;
  3. the 40% non-Kelvin gain error is worth 10 A at 25 A, while the 93 dB CMRR residue is worth
     0.36 A - the layout, not the amplifier, is the dominant error;
  4. that CMRR residue is 1.33 counts of the same ADC: just over one LSB, so 93 dB is not free;
  5. the module's 2 mOhm shunt uses only 36% of the ADC range at the +-15 A it is specified for;
  6. a grounded REF loses the whole negative half: zero reads 0.00 V and -25 A clips to code 0,
     which is how the fault is diagnosed from the symptom alone.
"""

import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

LSB_V = 3.30 / 4095.0


class AdcResolutionTests(unittest.TestCase):
    def test_the_twelve_bit_adc_resolves_13_milliamps(self):
        lsb_a = LSB_V / (20.0 * 0.003)  # 60 mV/A
        self.assertAlmostEqual(lsb_a, 0.0134310, delta=1e-7)
        self.assertLess(lsb_a, 0.02)
        self.assertAlmostEqual(1.0 / plant.DT, 1000.0, delta=1e-9, msg="one decision per 1 ms tick")

    def test_a_25_amp_read_lands_near_the_top_of_the_range(self):
        code = submission.adc_code(submission.shunt_adc_voltage(25.0, 0.003, 20.0))
        self.assertEqual(code, 3909)
        self.assertGreater(code / 4095.0, 0.95)
        self.assertLess(code, 4095, "the worked example must not sit on the rail")


class GainVariantTests(unittest.TestCase):
    def test_the_fifty_v_per_volt_variant_clips_at_11_amps(self):
        i_max = submission.max_measurable_current(1.65, 3.30, 50.0, 0.003)
        self.assertAlmostEqual(i_max, 11.0, delta=1e-9)
        self.assertAlmostEqual(submission.shunt_adc_voltage(i_max, 0.003, 50.0), 3.30, delta=1e-12)
        self.assertGreater(submission.shunt_adc_voltage(25.0, 0.003, 50.0), 3.30)

    def test_the_twenty_v_per_volt_variant_holds_the_worked_25_amps(self):
        self.assertAlmostEqual(submission.max_measurable_current(1.65, 3.30, 20.0, 0.003), 27.5,
                               delta=1e-9)
        self.assertLess(submission.shunt_adc_voltage(25.0, 0.003, 20.0), 3.30)


class KelvinVersusCmrrTests(unittest.TestCase):
    def test_kelvin_dwarfs_the_cmrr_residue_in_amperes(self):
        kelvin_a = 25.0 * submission.kelvin_gain_error_pct(0.003, 0.0006) / 100.0
        cmrr_a = submission.cmrr_current_error_a(48.0, 93.0, 0.003)
        self.assertAlmostEqual(kelvin_a, 10.0, delta=1e-9)
        self.assertAlmostEqual(cmrr_a, 0.3581954, delta=1e-6)
        self.assertGreater(kelvin_a, 20.0 * cmrr_a)

    def test_the_cmrr_residue_is_about_one_adc_count(self):
        residue = submission.cmrr_input_error_v(48.0, 93.0)
        self.assertAlmostEqual(residue / LSB_V, 1.3334, delta=1e-3)
        self.assertGreater(residue, LSB_V)

    def test_the_modules_two_milliohm_shunt_uses_36_percent_of_the_range(self):
        high = submission.shunt_adc_voltage(15.0, 0.002, 20.0)
        self.assertAlmostEqual(high, 2.25, delta=1e-12)
        used = (high - 1.65) / (3.30 - 1.65)
        self.assertAlmostEqual(used, 0.36363636, delta=1e-8)
        self.assertLess(used, 0.4)


class GroundedReferenceTests(unittest.TestCase):
    def test_a_grounded_reference_loses_the_negative_half(self):
        self.assertAlmostEqual(submission.shunt_adc_voltage(0.0, 0.003, 20.0, 0.0), 0.0, delta=1e-15)
        self.assertAlmostEqual(submission.shunt_adc_voltage(25.0, 0.003, 20.0, 0.0), 1.50, delta=1e-12)
        clipped = submission.shunt_adc_voltage(-25.0, 0.003, 20.0, 0.0)
        self.assertEqual(submission.adc_code(clipped), 0)

    def test_the_zero_current_test_separates_a_shift_from_a_gain_error(self):
        self.assertAlmostEqual(submission.shunt_adc_voltage(0.0, 0.003, 20.0, 1.65), 1.65, delta=1e-15)
        self.assertAlmostEqual(submission.shunt_adc_voltage(0.0, 0.003, 20.0, 0.0), 0.0, delta=1e-15)


if __name__ == "__main__":
    unittest.main()
