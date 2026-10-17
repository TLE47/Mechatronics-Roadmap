"""Transfer tests for 01-electronics.T2.01b - the same laws on the shared plant's numbers.

Six claims:
  1. the worked pre-charge's 0.24 s is 240 ticks of the plant's 1 kHz clock, and 24% of the
     capstone's 1 s run;
  2. the 1.152 J a 1000 uF bank stores at 48 V would drive the plant's 2.5 N*m torque clamp for
     460.8 ticks - the bank outlasts the pre-charge window that filled it;
  3. that same energy is what the shoulder joint carries at 16.97 rad/s, since 1/2 C V^2 and
     1/2 I omega^2 are one law;
  4. the same 20 nH / 30 A commutation over the plant's millisecond tick gives 0.0006 V - the
     ratio is exactly DT / 20 ns, which is why a microsecond slip hides;
  5. the 2 nH plane and the 25 nH 2-layer loop straddle a 75 V ceiling, which is the module's
     reason for the 4-layer stackup;
  6. the inductance budget's ceiling is reached, not crossed, when the peak is re-evaluated.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class ClockTests(unittest.TestCase):
    def test_the_precharge_window_in_plant_ticks(self):
        window = submission.precharge_time_s(48.0, 1000e-6)
        self.assertAlmostEqual(window / plant.DT, 240.0, delta=1e-9,
                               msg="0.24 s is 240 ticks of the plant's 1 kHz step")

    def test_the_precharge_is_a_quarter_of_the_capstone_run(self):
        run_s = plant.TICKS * plant.DT
        self.assertAlmostEqual(run_s, 1.0, delta=1e-12)
        self.assertAlmostEqual(submission.precharge_time_s(48.0, 1000e-6) / run_s,
                               0.24, delta=1e-12)

    def test_the_microsecond_slip_in_plant_time(self):
        # The same 20 nH / 30 A commutation spread over the plant's whole tick: 0.0006 V.
        over_tick = submission.v_peak_turnoff(0.0, 20.0, 30.0, plant.DT * 1e9)
        self.assertAlmostEqual(over_tick, 6e-4, delta=1e-12)
        fast = submission.v_peak_turnoff(0.0, 20.0, 30.0, 20.0)
        self.assertAlmostEqual(fast / over_tick, plant.DT / 20e-9, delta=1e-6,
                               msg="the 20 ns commutation is 50 000 times faster than the tick")


class EnergyTests(unittest.TestCase):
    def test_the_bank_outlasts_its_own_precharge(self):
        energy = submission.bus_energy_j(1000e-6, 48.0)
        per_tick = plant.TAU_LIMIT * plant.DT
        self.assertAlmostEqual(per_tick, 0.0025, delta=1e-15)
        self.assertAlmostEqual(energy / per_tick, 460.8, delta=1e-9,
                               msg="1.152 J sustains the 2.5 N*m clamp for 460.8 ticks")
        self.assertGreater(energy / per_tick, 240.0)

    def test_the_bank_equals_the_shoulders_kinetic_energy(self):
        # 1/2 C V^2 = 1/2 I omega^2 at the speed this bank could spin the plant's shoulder.
        omega = math.sqrt(2.0 * 1.152 / plant.I1)
        self.assertAlmostEqual(omega, 16.97056274847714, delta=1e-12)
        self.assertAlmostEqual(submission.bus_energy_j(1000e-6, 48.0),
                               0.5 * plant.I1 * omega * omega, delta=1e-12)


class LayoutTests(unittest.TestCase):
    def test_the_two_nanohenry_plane_clears_a_seventy_five_volt_ceiling(self):
        self.assertLess(submission.v_peak_turnoff(48.0, 2.0, 30.0, 20.0), 75.0)

    def test_the_twenty_five_nanohenry_loop_does_not(self):
        # 48.0 + 25 * 1.5 = 85.5 V into 75 V FETs: the 2-layer board's real failure.
        peak = submission.v_peak_turnoff(48.0, 25.0, 30.0, 20.0)
        self.assertAlmostEqual(peak, 85.5, delta=1e-6)
        self.assertGreater(peak, 75.0)

    def test_the_budget_is_a_ceiling_not_a_crossing(self):
        budget = submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0)
        self.assertLessEqual(submission.v_peak_turnoff(48.0, budget, 30.0, 15.0), 60.0 + 1e-12)
        self.assertGreater(submission.v_peak_turnoff(48.0, budget + 1.0, 30.0, 15.0), 60.0)


if __name__ == "__main__":
    unittest.main()
