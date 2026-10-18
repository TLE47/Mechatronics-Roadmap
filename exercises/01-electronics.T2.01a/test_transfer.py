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
        self.assertAlmostEqual(
            lsb_a,
            0.0134310,
            delta=1e-7,
            msg="expected one count to be 13.43 mA at 3.30 V, 3 mOhm and 20 V/V; 4.03 mA likely divided by 4096 counts - check the full-scale divisor",
        )
        self.assertLess(
            lsb_a,
            0.02,
            "expected one count to resolve under 20 mA; a larger step likely dropped the amplifier gain - check the 60 mV/A scale",
        )
        self.assertAlmostEqual(
            1.0 / plant.DT,
            1000.0,
            delta=1e-9,
            msg="expected the plant to take one decision per 1 ms tick; 100 Hz likely used a 10 ms period - check plant.DT",
        )

    def test_a_25_amp_read_lands_near_the_top_of_the_range(self):
        code = submission.adc_code(submission.shunt_adc_voltage(25.0, 0.003, 20.0))
        self.assertEqual(
            code,
            3909,
            "expected 3909 for a 25 A read through this stage; a code at 4095 likely saturated it - check the gain against the rail",
        )
        self.assertGreater(
            code / 4095.0,
            0.95,
            "expected the 25 A read to use over 95% of the ADC range; a lower share likely used the wrong shunt - check the 60 mV/A scale",
        )
        self.assertLess(
            code,
            4095,
            "expected the worked example to stay off the rail; code 4095 likely means the 25 A case saturates - check the headroom",
        )


class GainVariantTests(unittest.TestCase):
    def test_the_fifty_v_per_volt_variant_clips_at_11_amps(self):
        i_max = submission.max_measurable_current(1.65, 3.30, 50.0, 0.003)
        self.assertAlmostEqual(
            i_max,
            11.0,
            delta=1e-9,
            msg="expected 11 A at 50 V/V over 3 mOhm from a 1.65 V swing; 22 A likely measured the whole rail - check the reference subtraction",
        )
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(i_max, 0.003, 50.0),
            3.30,
            delta=1e-12,
            msg="expected the 11 A clip point to map to the 3.30 V rail; a lower value likely used the reference as full scale - check the range used",
        )
        self.assertGreater(
            submission.shunt_adc_voltage(25.0, 0.003, 50.0),
            3.30,
            "expected 25 A to exceed the rail at 50 V/V; a value inside the rail likely kept the 20 V/V gain - check the variant's gain",
        )

    def test_the_twenty_v_per_volt_variant_holds_the_worked_25_amps(self):
        self.assertAlmostEqual(
            submission.max_measurable_current(1.65, 3.30, 20.0, 0.003),
            27.5,
            delta=1e-9,
            msg="expected 27.5 A at 20 V/V, so the 25 A example fits; 33 A likely used a 1 mOhm shunt - check the shunt value",
        )
        self.assertLess(
            submission.shunt_adc_voltage(25.0, 0.003, 20.0),
            3.30,
            "expected 25 A to stay inside the rail at 20 V/V; a value at 3.30 V likely means the gain was 50 - check the variant",
        )


class KelvinVersusCmrrTests(unittest.TestCase):
    def test_kelvin_dwarfs_the_cmrr_residue_in_amperes(self):
        kelvin_a = 25.0 * submission.kelvin_gain_error_pct(0.003, 0.0006) / 100.0
        cmrr_a = submission.cmrr_current_error_a(48.0, 93.0, 0.003)
        self.assertAlmostEqual(
            kelvin_a,
            10.0,
            delta=1e-9,
            msg="expected 40% of 25 A to be a 10 A error; 20 A likely counted the 40% twice - check the percentage path",
        )
        self.assertAlmostEqual(
            cmrr_a,
            0.3581954,
            delta=1e-6,
            msg="expected 0.358 A of CMRR residue; 7.16 A likely treated 93 dB as a voltage ratio - check the exponent",
        )
        self.assertGreater(
            kelvin_a,
            20.0 * cmrr_a,
            "expected the layout error to dwarf the amplifier residue by 20x; a smaller gap likely swapped the two terms - check which is which",
        )

    def test_the_cmrr_residue_is_about_one_adc_count(self):
        residue = submission.cmrr_input_error_v(48.0, 93.0)
        self.assertAlmostEqual(
            residue / LSB_V,
            1.3334,
            delta=1e-3,
            msg="expected the residue to be 1.33 counts of this ADC; 0.66 counts likely halved the LSB - check 3.30 over 4095",
        )
        self.assertGreater(
            residue,
            LSB_V,
            "expected the 93 dB residue to exceed one LSB; a smaller value likely divided by the 20 V/V gain - check the CMRR formula",
        )

    def test_the_modules_two_milliohm_shunt_uses_36_percent_of_the_range(self):
        high = submission.shunt_adc_voltage(15.0, 0.002, 20.0)
        self.assertAlmostEqual(
            high,
            2.25,
            delta=1e-12,
            msg="expected 2.25 V for 15 A on 2 mOhm at 20 V/V; 0.60 V likely omitted the reference - check V_REF is added",
        )
        used = (high - 1.65) / (3.30 - 1.65)
        self.assertAlmostEqual(
            used,
            0.36363636,
            delta=1e-8,
            msg="expected the 2 mOhm shunt to use 36% of the half-range at 15 A; 72% likely measured against the full rail - check the half-range divisor",
        )
        self.assertLess(
            used,
            0.4,
            "expected the module's shunt to use under 40% of the range; a larger share likely counted the full 3.30 V span - check the 2 mOhm value",
        )


class GroundedReferenceTests(unittest.TestCase):
    def test_a_grounded_reference_loses_the_negative_half(self):
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(0.0, 0.003, 20.0, 0.0),
            0.0,
            delta=1e-15,
            msg="expected 0 A to read 0.00 V with REF at ground; 1.65 V likely kept the default reference - check the reference argument",
        )
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(25.0, 0.003, 20.0, 0.0),
            1.50,
            delta=1e-12,
            msg="expected 1.50 V at 25 A with a grounded reference; 3.15 V likely still added the 1.65 V bias - check the bias term",
        )
        clipped = submission.shunt_adc_voltage(-25.0, 0.003, 20.0, 0.0)
        self.assertEqual(
            submission.adc_code(clipped),
            0,
            "expected -25 A to clip to code 0 when REF is grounded; a positive code likely dropped the clip - check the unipolar floor",
        )

    def test_the_zero_current_test_separates_a_shift_from_a_gain_error(self):
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(0.0, 0.003, 20.0, 1.65),
            1.65,
            delta=1e-15,
            msg="expected 1.65 V at zero current with the mid-rail reference; 0.00 V likely ignored the reference argument - check the default",
        )
        self.assertAlmostEqual(
            submission.shunt_adc_voltage(0.0, 0.003, 20.0, 0.0),
            0.0,
            delta=1e-15,
            msg="expected 0.00 V at zero current with REF grounded; 1.65 V likely applied the default reference - check which reference was used",
        )


if __name__ == "__main__":
    unittest.main()
