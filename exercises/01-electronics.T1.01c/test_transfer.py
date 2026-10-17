"""Transfer tests for 01-electronics.T1.01c - a bench minute on the plant's numbers.

Three claims:
  1. the 12 V / 0.20 A bench supply that feeds the plant turns a 0.25 ohm miswire into 0.01 W,
     more than ten thousand times less than the same wire across an unlimited battery;
  2. the plant's run is one second of bench time (TICKS * DT), so that folded-back fault deposits
     under 0.02 joules in the whole run;
  3. the foldback is memoryless - the plant's 1 kHz loop sees the clamped state on the very tick
     the limit is crossed, because the model has no ramp to wait for.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class BenchFaultTests(unittest.TestCase):
    def test_a_miswire_on_the_bench_supply_costs_hundredths_of_a_watt(self):
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 0.20, 0.25)
        self.assertEqual(mode, "CC")
        self.assertAlmostEqual(p_out, 0.01, delta=1e-12)
        _v, _i, p_battery, _m = submission.psu_output(12.0, 50.0, 0.25)
        self.assertAlmostEqual(p_battery, 576.0, delta=1e-9)
        self.assertGreater(p_battery / p_out, 10_000.0)

    def test_the_healthy_plant_build_stays_in_cv(self):
        # The plant's own electronics draw far less than the logic limit; 240 ohms is the module's
        # stand-in for "a healthy board", and it must not fold the supply back.
        self.assertFalse(submission.is_short(240.0))
        _v, _i, _p, mode = submission.psu_output(12.0, 0.20, 240.0)
        self.assertEqual(mode, "CV")


class RunEnergyTests(unittest.TestCase):
    def test_the_plant_run_is_one_second_of_bench_time(self):
        seconds = plant.TICKS * plant.DT
        self.assertAlmostEqual(seconds, 1.0, delta=1e-12)
        _v, _i, p_folded, _m = submission.psu_output(12.0, 0.20, 0.25)
        self.assertLess(p_folded * seconds, 0.02)

    def test_the_battery_case_would_dump_two_hundred_joules(self):
        _v, _i, p_battery, _m = submission.psu_output(12.0, 50.0, 0.25)
        joules = p_battery * plant.TICKS * plant.DT
        self.assertAlmostEqual(joules, 576.0, delta=1e-9)


class InstantFoldbackTests(unittest.TestCase):
    def test_the_plant_tick_sees_the_clamp_immediately(self):
        first = submission.psu_output(12.0, 0.20, 0.25)
        second = submission.psu_output(12.0, 0.20, 0.25)
        self.assertEqual(first, second, "the foldback has no ramp to settle through")
        self.assertLess(plant.DT, 0.010, "one tick is far inside the 10 ms a clip needs to warm")

    def test_the_clip_rating_is_one_amp_at_the_plants_cadence(self):
        # 5 A through a 0.12 ohm clip is 3 W: four times the clip's own 1 A continuous rating
        # squared, which is why a motor lead never goes through a breadboard.
        hot = submission.clip_power(5.0, 0.12)
        self.assertAlmostEqual(hot, 3.0, delta=1e-9)
        self.assertGreater(hot, submission.clip_power(1.0, 0.12))


if __name__ == "__main__":
    unittest.main()
