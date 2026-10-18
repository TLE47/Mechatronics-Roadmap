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
        self.assertAlmostEqual(
            window / plant.DT, 240.0, delta=1e-9,
            msg="expected the 0.24 s pre-charge window to be 240 ticks of the plant's 1 ms "
                "step; 24 likely divided by a millisecond - check plant.DT",
        )

    def test_the_precharge_is_a_quarter_of_the_capstone_run(self):
        run_s = plant.TICKS * plant.DT
        self.assertAlmostEqual(
            run_s, 1.0, delta=1e-12,
            msg="expected the plant's tick count times its step to be one second; another value "
                "likely mixed TICKS with a different DT - check both are the plant's",
        )
        self.assertAlmostEqual(
            submission.precharge_time_s(48.0, 1000e-6) / run_s,
            0.24, delta=1e-12,
            msg="expected the pre-charge to take 24 percent of the capstone's one-second run; "
                "0.0024 likely divided by milliseconds - check the window over the run",
        )

    def test_the_microsecond_slip_in_plant_time(self):
        # The same 20 nH / 30 A commutation spread over the plant's whole tick: 0.0006 V.
        over_tick = submission.v_peak_turnoff(0.0, 20.0, 30.0, plant.DT * 1e9)
        self.assertAlmostEqual(
            over_tick, 6e-4, delta=1e-12,
            msg="expected the 30 V spike to collapse to 0.0006 V when the commutation is spread "
                "over 1 ms; 0.03 likely kept 20 us - check DT * 1e9 ns",
        )
        fast = submission.v_peak_turnoff(0.0, 20.0, 30.0, 20.0)
        self.assertAlmostEqual(
            fast / over_tick, plant.DT / 20e-9, delta=1e-6,
            msg="expected the 20 ns edge to be 50000 times faster than the plant tick; another "
                "ratio likely used microseconds for one of the two - check the units",
        )


class EnergyTests(unittest.TestCase):
    def test_the_bank_outlasts_its_own_precharge(self):
        energy = submission.bus_energy_j(1000e-6, 48.0)
        per_tick = plant.TAU_LIMIT * plant.DT
        self.assertAlmostEqual(
            per_tick, 0.0025, delta=1e-15,
            msg="expected the plant's 2.5 N m clamp to spend 0.0025 J per millisecond tick; "
                "2.5 likely forgot DT - check the product",
        )
        self.assertAlmostEqual(
            energy / per_tick, 460.8, delta=1e-9,
            msg="expected the 1.152 J bank to sustain the clamp for 460.8 ticks; 460.8 ms likely "
                "meant the same, but a bare 1.152 means the division was skipped",
        )
        self.assertGreater(
            energy / per_tick, 240.0,
            msg="expected the stored energy to outlast the 240-tick pre-charge that filled it; "
                "a smaller number likely used a smaller capacitance",
        )

    def test_the_bank_equals_the_shoulders_kinetic_energy(self):
        # 1/2 C V^2 = 1/2 I omega^2 at the speed this bank could spin the plant's shoulder.
        omega = math.sqrt(2.0 * 1.152 / plant.I1)
        self.assertAlmostEqual(
            omega, 16.97056274847714, delta=1e-12,
            msg="expected 1.152 J on the shoulder's 0.008 kg m^2 to be 16.97 rad/s; 8.49 likely "
                "dropped the 2 - check sqrt(2E/I)",
        )
        self.assertAlmostEqual(
            submission.bus_energy_j(1000e-6, 48.0),
            0.5 * plant.I1 * omega * omega, delta=1e-12,
            msg="expected the bank's energy to equal the shoulder's kinetic energy at that "
                "speed, since both are half a quadratic term; a mismatch likely used a "
                "different inertia - check plant.I1",
        )


class LayoutTests(unittest.TestCase):
    def test_the_two_nanohenry_plane_clears_a_seventy_five_volt_ceiling(self):
        self.assertLess(
            submission.v_peak_turnoff(48.0, 2.0, 30.0, 20.0), 75.0,
            msg="expected the 2 nH plane's 3 V overshoot to stay under the 75 V ceiling; a "
                "higher peak likely used the 25 nH loop - check the inductance",
        )

    def test_the_twenty_five_nanohenry_loop_does_not(self):
        # 48.0 + 25 * 1.5 = 85.5 V into 75 V FETs: the 2-layer board's real failure.
        peak = submission.v_peak_turnoff(48.0, 25.0, 30.0, 20.0)
        self.assertAlmostEqual(
            peak, 85.5, delta=1e-6,
            msg="expected 48 V plus 37.5 V of overshoot to reach 85.5 V; 73.5 likely used 17 A "
                "- check 25 nH times 1.5 A/ns",
        )
        self.assertGreater(
            peak, 75.0,
            msg="expected the 2-layer loop's peak to break the 75 V FET ceiling; a lower value "
                "likely used the 4-layer plane, which is the whole point of the stackup",
        )

    def test_the_budget_is_a_ceiling_not_a_crossing(self):
        budget = submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0)
        self.assertLessEqual(
            submission.v_peak_turnoff(48.0, budget, 30.0, 15.0), 60.0 + 1e-12,
            msg="expected the budgeted inductance to land on the ceiling, never above; a higher "
                "peak likely rounded the budget up - check headroom * dt / dI",
        )
        self.assertGreater(
            submission.v_peak_turnoff(48.0, budget + 1.0, 30.0, 15.0), 60.0,
            msg="expected one extra nanohenry to cross the ceiling, so the budget is tight; a "
                "value still under 60 V means the budget was not the maximum",
        )


if __name__ == "__main__":
    unittest.main()
