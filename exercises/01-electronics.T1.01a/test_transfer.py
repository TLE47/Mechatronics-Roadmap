"""Transfer tests for 01-electronics.T1.01a - the same laws on the plant's own numbers.

Three claims:
  1. the damper in the plant's shoulder sheds B1 * dq^2 watts - the same I^2 R form a
     current-sense resistor uses - and that power fits a quarter-watt part under the half-rating
     rule;
  2. the 24 V sensing divider that protects a 3.3 V ADC still protects it when the ADC loads the
     bottom leg;
  3. the plant's 20-byte telemetry frame at 8N1 needs 200 kbit/s, which is why the 115.2 kbaud link
     drops frames and the 500 kbaud one does not.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class DampingPowerTests(unittest.TestCase):
    def test_the_shoulder_damper_sheds_i_squared_r(self):
        run = plant.simulate_arm(steps=200, record=True)
        trace = run["trace"]
        speeds = []
        for a, b in zip(trace[:-1], trace[1:]):
            q1_a = plant.ik(a[3], a[4])[0]
            q1_b = plant.ik(b[3], b[4])[0]
            speeds.append((q1_b - q1_a) / plant.DT)
        peak = max(abs(v) for v in speeds)
        self.assertAlmostEqual(
            submission.joule_power(peak, plant.B1), plant.B1 * peak * peak,
            delta=1e-12,
            msg="expected the damper's dissipation to follow I^2 R with B1 in the resistance "
                "role at every speed in the trace; a mismatch means the submission squares "
                "something else - check the form",
        )
        # Measured peak is about 0.36 W: a quarter-watt part is out, a one-watt part at half
        # rating is in - the same derating decision a bench build makes.
        self.assertFalse(
            submission.within_derating(plant.B1 * peak * peak, 0.25),
            msg="expected the shoulder's peak damping power to exceed a quarter-watt part's "
                "half-rating, so a 0.25 W resistor would cook; True means the derating rule is "
                "not being applied",
        )
        self.assertTrue(
            submission.within_derating(plant.B1 * peak * peak, 1.0),
            msg="expected a one-watt part at half rating to cover the measured peak, which is the "
                "correct bench choice; False means the power was overstated",
        )

    def test_a_stiffer_damper_would_not_fit(self):
        peak = 2.0  # rad/s
        hot = submission.joule_power(peak, 0.5)
        self.assertAlmostEqual(
            hot, 2.0, delta=1e-12,
            msg="expected 2 rad/s through 0.5 N m s to shed 2 W; 1.0 means the speed was used "
                "linearly - check dq^2",
        )
        self.assertFalse(
            submission.within_derating(hot, 0.25),
            msg="expected the stiffer damper to exceed the quarter-watt rule, showing the same "
                "decision the plant's own numbers force; True means the check is inverted",
        )


class AdcDividerTests(unittest.TestCase):
    def test_the_plants_24_v_rail_protects_a_3_3_v_adc(self):
        unloaded = submission.divider_unloaded(24.0, 68_000.0, 10_000.0)
        loaded = submission.divider_loaded(24.0, 68_000.0, 10_000.0, 100_000.0)
        self.assertLess(
            unloaded, 3.3,
            msg="expected the unloaded 68k over 10k divider to sit under the 3.3 V pin rating; a "
                "larger value means the legs were swapped and the ADC would be destroyed",
        )
        self.assertLess(
            loaded, 3.3,
            msg="expected the loaded divider to stay under the rating as well; a larger value "
                "means the load was modelled as raising the midpoint",
        )
        self.assertGreater(
            loaded, 0.9 * unloaded,
            msg="expected the 100k ADC to keep the reading within 10 percent of the unloaded "
                "value, which is why the divider values were chosen; a larger drop means the "
                "load is heavy enough to matter",
        )

    def test_the_reversed_order_destroys_the_pin(self):
        self.assertGreater(
            submission.divider_unloaded(24.0, 10_000.0, 68_000.0), 3.3,
            msg="expected the reversed legs to exceed the pin rating, which is the module's "
                "Break-it case; a smaller value means the fraction was computed the same way "
                "regardless of order",
        )


class LinkBudgetTests(unittest.TestCase):
    def test_the_plant_frame_needs_two_hundred_kilobits(self):
        bits_per_frame = plant.FRAME_BYTES * 10  # 8N1
        bits_per_second = bits_per_frame * (1.0 / plant.DT)
        self.assertEqual(
            bits_per_second, 200_000,
            msg="expected the plant's 20-byte frame at 1 kHz with 10 bits per byte to need "
                "200 kbit/s; 160000 means 8 bits per byte and would understate the link",
        )
        self.assertGreater(
            bits_per_second, plant.BAUD_OVERFLOWS,
            msg="expected the requirement to exceed the 115.2 kbaud link the plant proves drops "
                "frames; a smaller value means the frame was undercounted",
        )
        self.assertLess(
            bits_per_second, plant.BAUD_FITS,
            msg="expected the requirement to fit the plant's fast link, which is why that one "
                "works; a larger value means the framing was overcounted",
        )


if __name__ == "__main__":
    unittest.main()
