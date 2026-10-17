"""Behaviour tests for 01-electronics.T2.01b.

Each test names the mistake it catches:
  * a commutation time handed over in microseconds, which shrinks a 30 V spike to 0.03 V and ships
    a 78 V peak into 75 V FETs - the module's Break-it-on-purpose bug;
  * a loop inductance rescaled by 1e-9 when the nH/ns identity already makes it an ohm;
  * an inductance budget built from the ceiling alone instead of the headroom above the bus;
  * a gate-drive current with a stray 1e-3, turning 1.5 A into 1.5 mA;
  * a bootstrap voltage that forgets the phase node, so a high-side N-MOSFET is driven at 12 V
    absolute instead of 60 V;
  * a pre-charge settle time of one time constant instead of five;
  * a bus energy without the half.
"""

import unittest

import harness

submission = harness.load_submission()


class TurnOffTests(unittest.TestCase):
    def test_the_worked_sloppy_board(self):
        # 48.0 + 20 nH * 30 A / 20 ns = 48.0 + 30.0 = 78.0 V: over a 75 V ceiling.
        self.assertAlmostEqual(submission.v_peak_turnoff(48.0, 20.0, 30.0, 20.0),
                               78.0, delta=1e-6)

    def test_the_worked_four_layer_board(self):
        # 48.0 + 4 nH * 30 A / 20 ns = 48.0 + 6.0 = 54.0 V: comfortably inside it.
        self.assertAlmostEqual(submission.v_peak_turnoff(48.0, 4.0, 30.0, 20.0),
                               54.0, delta=1e-6)

    def test_a_tight_two_nanohenry_loop(self):
        self.assertAlmostEqual(submission.v_peak_turnoff(48.0, 2.0, 30.0, 20.0),
                               51.0, delta=1e-6)

    def test_the_skip_test_peak(self):
        # 48.0 + 5 nH * 24 A / 15 ns = 48.0 + 8.0 = 56.0 V.
        self.assertAlmostEqual(submission.v_peak_turnoff(48.0, 5.0, 24.0, 15.0),
                               56.0, delta=1e-6)

    def test_the_gate_test_spike(self):
        # 3 nH * 30 A / 15 ns = 6.0 V of overshoot on its own.
        self.assertAlmostEqual(submission.v_peak_turnoff(0.0, 3.0, 30.0, 15.0),
                               6.0, delta=1e-6)

    def test_the_overshoot_doubles_with_the_inductance(self):
        one = submission.v_peak_turnoff(0.0, 20.0, 30.0, 20.0)
        two = submission.v_peak_turnoff(0.0, 40.0, 30.0, 20.0)
        self.assertAlmostEqual(two / one, 2.0, delta=1e-12)

    def test_a_faster_transition_hurts(self):
        # The same current in half the time doubles the spike: dI/dt is the whole story.
        fast = submission.v_peak_turnoff(48.0, 20.0, 30.0, 10.0)
        slow = submission.v_peak_turnoff(48.0, 20.0, 30.0, 40.0)
        self.assertAlmostEqual(fast, 108.0, delta=1e-6)
        self.assertAlmostEqual(slow, 63.0, delta=1e-6)

    def test_a_negative_inductance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.v_peak_turnoff(48.0, -1.0, 30.0, 20.0)

    def test_a_zero_commutation_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.v_peak_turnoff(48.0, 20.0, 30.0, 0.0)


class HeadroomTests(unittest.TestCase):
    def test_the_exercise_six_nanohenries(self):
        # (60.0 - 48.0) V * 15 ns / 30 A = 6.0 nH, the 80% derating rule.
        self.assertAlmostEqual(submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0),
                               6.0, delta=1e-12)

    def test_a_tighter_ceiling_allows_less(self):
        self.assertAlmostEqual(submission.max_loop_inductance_nh(48.0, 54.0, 30.0, 15.0),
                               3.0, delta=1e-12)

    def test_the_budget_lands_exactly_on_the_ceiling(self):
        budget = submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0)
        self.assertAlmostEqual(submission.v_peak_turnoff(48.0, budget, 30.0, 15.0),
                               60.0, delta=1e-12)

    def test_a_ceiling_at_the_bus_is_refused(self):
        with self.assertRaises(ValueError):
            submission.max_loop_inductance_nh(48.0, 48.0, 30.0, 15.0)

    def test_no_current_change_is_refused(self):
        with self.assertRaises(ValueError):
            submission.max_loop_inductance_nh(48.0, 60.0, 0.0, 15.0)


class GateDriveTests(unittest.TestCase):
    def test_the_worked_one_amp(self):
        # 30 nC in 30 ns = 1.0 A, the average current the driver must source.
        self.assertAlmostEqual(submission.gate_drive_current_a(30.0, 30.0), 1.0, delta=1e-12)

    def test_the_skip_test_one_and_a_half(self):
        self.assertAlmostEqual(submission.gate_drive_current_a(45.0, 30.0), 1.5, delta=1e-12)

    def test_the_bootstrap_rides_the_phase_node(self):
        # 48 V at the switch node plus a 12 V driver = 60 V at the gate, 12 V above the source.
        self.assertAlmostEqual(submission.bootstrap_gate_v(48.0, 12.0), 60.0, delta=1e-12)

    def test_a_grounded_phase_node_is_just_the_driver(self):
        self.assertAlmostEqual(submission.bootstrap_gate_v(0.0, 12.0), 12.0, delta=1e-12)

    def test_a_zero_rise_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gate_drive_current_a(30.0, 0.0)

    def test_a_dead_driver_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bootstrap_gate_v(48.0, 0.0)


class PrechargeTests(unittest.TestCase):
    def test_the_worked_settle_time(self):
        # 5 * 48 ohm * 1000 uF = 0.24 s.
        self.assertAlmostEqual(submission.precharge_time_s(48.0, 1000e-6), 0.24, delta=1e-12)

    def test_a_forty_seven_ohm_resistor(self):
        self.assertAlmostEqual(submission.precharge_time_s(47.0, 1000e-6), 0.235, delta=1e-12)

    def test_the_worked_peak_inrush(self):
        self.assertAlmostEqual(submission.precharge_peak_a(48.0, 48.0), 1.0, delta=1e-12)

    def test_the_gate_test_peak(self):
        self.assertAlmostEqual(submission.precharge_peak_a(48.0, 60.0), 0.8, delta=1e-12)

    def test_one_time_constant_is_five_times_faster(self):
        five = submission.precharge_time_s(48.0, 1000e-6)
        one = submission.precharge_time_s(48.0, 1000e-6, taus=1.0)
        self.assertAlmostEqual(one, 0.048, delta=1e-12)
        self.assertAlmostEqual(five / one, 5.0, delta=1e-12)

    def test_a_bare_wire_is_refused(self):
        with self.assertRaises(ValueError):
            submission.precharge_peak_a(48.0, 0.0)


class EnergyTests(unittest.TestCase):
    def test_the_worked_bus_energy(self):
        # 0.5 * 1000 uF * 48^2 = 1.152 J, the same energy the pre-charge resistor burns.
        self.assertAlmostEqual(submission.bus_energy_j(1000e-6, 48.0), 1.152, delta=1e-12)

    def test_the_skip_test_bus_energy(self):
        self.assertAlmostEqual(submission.bus_energy_j(1500e-6, 48.0), 1.728, delta=1e-12)

    def test_the_gate_test_bus_energy(self):
        self.assertAlmostEqual(submission.bus_energy_j(2000e-6, 48.0), 2.304, delta=1e-12)

    def test_energy_scales_with_the_voltage_squared(self):
        one = submission.bus_energy_j(1000e-6, 48.0)
        two = submission.bus_energy_j(1000e-6, 96.0)
        self.assertAlmostEqual(two / one, 4.0, delta=1e-12)

    def test_a_negative_capacitance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bus_energy_j(-1e-6, 48.0)


if __name__ == "__main__":
    unittest.main()
