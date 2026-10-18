"""Transfer tests for 00-foundations.T1.00c - the plant's own numbers, in the units it ships.

Five claims on `mechalab_plant`:
  1. the plant's 1 ms tick is exactly the RC time constant of the module's 10 kOhm / 100 nF filter,
     and one tick is 1000 us, not 1 us;
  2. a 4096-count encoder turning once per second is 60 RPM, and 60 RPM is 2*pi rad/s - the
     factor-60 law checked against a real count rate rather than a datasheet;
  3. the plant's 2.5 N*m torque clamp is 2500 mN*m, and its -0.15 N*m disturbance is -150 mN*m;
  4. the plant's 0.008 kg*m^2 shoulder inertia is 8000 micro-units;
  5. the clamp at 100 RPM delivers 26.179939 W, which needs the RPM conversion first.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class PlantTimingTests(unittest.TestCase):
    def test_the_plants_tick_is_one_filter_time_constant(self):
        self.assertAlmostEqual(
            plant.DT, 1.0e-3, delta=1e-15,
            msg="expected the plant to tick every 1 ms; a different DT means every filter and "
                "loop calculation below is compared against the wrong clock",
        )
        self.assertAlmostEqual(
            submission.rc_time_constant_s(10e3, 100e-9), plant.DT, delta=1e-15,
            msg="expected the module's 10 kOhm / 100 nF filter to be exactly one plant tick; a "
                "factor-of-1000 gap means the capacitance was read as microfarads",
        )

    def test_the_plants_tick_in_microseconds(self):
        # 1 / 1 ms = 1000 Hz, whose period is 1000 us.
        tick_hz = 1.0 / plant.DT
        self.assertAlmostEqual(
            tick_hz, 1000.0, delta=1e-9,
            msg="expected the plant's 1 ms tick to be a 1 kHz rate; a different figure means DT "
                "was changed without this test - check plant.DT",
        )
        self.assertAlmostEqual(
            submission.loop_period_us(tick_hz), 1000.0, delta=1e-9,
            msg="expected that 1 kHz rate to come back as a 1000 us period; 1.0 means the period "
                "was left in milliseconds - check the 1e6 factor",
        )

    def test_the_encoder_at_one_revolution_per_second(self):
        # 4096 counts in one second is 1 rev/s, which is 60 RPM, which is 2*pi rad/s.
        counts_per_second = float(plant.ENCODER_CPR)
        revolutions_per_second = counts_per_second / float(plant.ENCODER_CPR)
        rpm = revolutions_per_second * 60.0
        self.assertAlmostEqual(
            rpm, 60.0, delta=1e-12,
            msg="expected 4096 counts per second, one revolution per second, to be 60 RPM; a "
                "different figure means CPR was lost from the division",
        )
        self.assertAlmostEqual(
            submission.rpm_to_rad_s(rpm), 2.0 * math.pi, delta=1e-12,
            msg="expected that 60 RPM to be 2 pi rad/s, the factor-60 law on a real count rate; "
                "377 means the 60 was multiplied instead of divided",
        )


class PlantUnitTests(unittest.TestCase):
    def test_the_torque_clamp_in_millinewton_metres(self):
        self.assertAlmostEqual(
            submission.prefix_scale(2500.0, "m"), plant.TAU_LIMIT, delta=1e-15,
            msg="expected the plant's 2.5 N*m clamp to be 2500 mN*m; 2.5 means milli was read as "
                "no prefix at all - check the table",
        )

    def test_the_disturbance_pulse_in_millinewton_metres(self):
        self.assertAlmostEqual(
            submission.prefix_scale(-150.0, "m"), plant.DIST_TAU1, delta=1e-15,
            msg="expected the plant's -0.15 N*m pulse to be -150 mN*m; a positive value means the "
                "sign was lost in the conversion - check it passes through",
        )

    def test_the_shoulder_inertia_in_micro_units(self):
        self.assertAlmostEqual(
            submission.prefix_scale(8000.0, "u"), plant.I1, delta=1e-18,
            msg="expected 8000 micro-units to be the plant's 0.008 kg m^2; 0.008 with the same "
                "value means the table is right but the prefix was mistyped",
        )


class PlantPowerTests(unittest.TestCase):
    def test_the_clamp_at_one_hundred_rpm(self):
        # 100 RPM = 10.4719755 rad/s; * 2.5 N*m = 26.1799387799 W.
        self.assertAlmostEqual(
            submission.shaft_power_w(plant.TAU_LIMIT, submission.rpm_to_rad_s(100.0)),
            26.1799387799, delta=1e-9,
            msg="expected the clamp at 100 RPM to deliver 26.18 W; 250 means the RPM figure was "
                "used as rad/s - check the conversion comes first",
        )


if __name__ == "__main__":
    unittest.main()
