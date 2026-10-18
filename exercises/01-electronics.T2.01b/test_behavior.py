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
        self.assertAlmostEqual(
            submission.v_peak_turnoff(48.0, 20.0, 30.0, 20.0),
            78.0, delta=1e-6,
            msg="expected 48 V plus a 30 V L dI/dt spike to reach 78 V; 48.03 means the 20 ns "
                "was treated as 20 us - check nH/ns is already an ohm",
        )

    def test_the_worked_four_layer_board(self):
        # 48.0 + 4 nH * 30 A / 20 ns = 48.0 + 6.0 = 54.0 V: comfortably inside it.
        self.assertAlmostEqual(
            submission.v_peak_turnoff(48.0, 4.0, 30.0, 20.0),
            54.0, delta=1e-6,
            msg="expected the 4 nH loop to add 6 V, for 54 V; 48.006 likely applied a 1e-9 "
                "scale to the inductance - check the unit identity",
        )

    def test_a_tight_two_nanohenry_loop(self):
        self.assertAlmostEqual(
            submission.v_peak_turnoff(48.0, 2.0, 30.0, 20.0),
            51.0, delta=1e-6,
            msg="expected a 2 nH loop at 30 A in 20 ns to add 3 V, for 51 V; 49.5 likely used "
                "15 ns or 20 A - check all three arguments",
        )

    def test_the_skip_test_peak(self):
        # 48.0 + 5 nH * 24 A / 15 ns = 48.0 + 8.0 = 56.0 V.
        self.assertAlmostEqual(
            submission.v_peak_turnoff(48.0, 5.0, 24.0, 15.0),
            56.0, delta=1e-6,
            msg="expected 8 V of overshoot on the Skip test's numbers, for 56 V; 51.2 likely "
                "kept 20 ns from the worked example - check the commutation time",
        )

    def test_the_gate_test_spike(self):
        # 3 nH * 30 A / 15 ns = 6.0 V of overshoot on its own.
        self.assertAlmostEqual(
            submission.v_peak_turnoff(0.0, 3.0, 30.0, 15.0),
            6.0, delta=1e-6,
            msg="expected the overshoot alone to be 6 V with a zero bus; 0.006 likely divided "
                "by 1000 somewhere - check the nH/ns identity",
        )

    def test_the_overshoot_doubles_with_the_inductance(self):
        one = submission.v_peak_turnoff(0.0, 20.0, 30.0, 20.0)
        two = submission.v_peak_turnoff(0.0, 40.0, 30.0, 20.0)
        self.assertAlmostEqual(
            two / one, 2.0, delta=1e-12,
            msg="expected doubling the loop inductance to double the spike; 4.0 likely squared "
                "L, 1.0 likely ignored it - check L multiplies dI/dt",
        )

    def test_a_faster_transition_hurts(self):
        # The same current in half the time doubles the spike: dI/dt is the whole story.
        fast = submission.v_peak_turnoff(48.0, 20.0, 30.0, 10.0)
        slow = submission.v_peak_turnoff(48.0, 20.0, 30.0, 40.0)
        self.assertAlmostEqual(
            fast, 108.0, delta=1e-6,
            msg="expected halving the commutation time to reach 108 V; 78 likely kept 20 ns - "
                "check dt appears in the denominator",
        )
        self.assertAlmostEqual(
            slow, 63.0, delta=1e-6,
            msg="expected doubling the time to halve the spike and reach 63 V; 54 likely used "
                "the 4 nH loop - check the time argument",
        )

    def test_a_negative_inductance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.v_peak_turnoff(48.0, -1.0, 30.0, 20.0)

    def test_a_zero_commutation_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.v_peak_turnoff(48.0, 20.0, 30.0, 0.0)


class HeadroomTests(unittest.TestCase):
    def test_the_exercise_six_nanohenries(self):
        # (60.0 - 48.0) V * 15 ns / 30 A = 6.0 nH, the 80% derating rule.
        self.assertAlmostEqual(
            submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0),
            6.0, delta=1e-12,
            msg="expected 12 V of headroom to allow 6 nH; 30 likely used the full 60 V ceiling "
                "instead of the headroom - check v_peak_max - v_bus",
        )

    def test_a_tighter_ceiling_allows_less(self):
        self.assertAlmostEqual(
            submission.max_loop_inductance_nh(48.0, 54.0, 30.0, 15.0),
            3.0, delta=1e-12,
            msg="expected a 54 V ceiling to halve the budget to 3 nH; 6.0 likely ignored the "
                "tighter headroom - check the subtraction",
        )

    def test_the_budget_lands_exactly_on_the_ceiling(self):
        budget = submission.max_loop_inductance_nh(48.0, 60.0, 30.0, 15.0)
        self.assertAlmostEqual(
            submission.v_peak_turnoff(48.0, budget, 30.0, 15.0),
            60.0, delta=1e-12,
            msg="expected the computed budget to reach exactly the 60 V ceiling, no more; a "
                "higher peak likely inverted the time and current - check the budget algebra",
        )

    def test_a_ceiling_at_the_bus_is_refused(self):
        with self.assertRaises(ValueError):
            submission.max_loop_inductance_nh(48.0, 48.0, 30.0, 15.0)

    def test_no_current_change_is_refused(self):
        with self.assertRaises(ValueError):
            submission.max_loop_inductance_nh(48.0, 60.0, 0.0, 15.0)


class GateDriveTests(unittest.TestCase):
    def test_the_worked_one_amp(self):
        # 30 nC in 30 ns = 1.0 A, the average current the driver must source.
        self.assertAlmostEqual(
            submission.gate_drive_current_a(30.0, 30.0), 1.0, delta=1e-12,
            msg="expected 30 nC in 30 ns to be exactly 1 A; 0.001 likely applied a stray 1e-3 "
                "- check nC/ns is already amperes",
        )

    def test_the_skip_test_one_and_a_half(self):
        self.assertAlmostEqual(
            submission.gate_drive_current_a(45.0, 30.0), 1.5, delta=1e-12,
            msg="expected 45 nC in 30 ns to be 1.5 A; 15 likely inverted the rise time or "
                "dropped a digit - check Q_g / t_r",
        )

    def test_the_bootstrap_rides_the_phase_node(self):
        # 48 V at the switch node plus a 12 V driver = 60 V at the gate, 12 V above the source.
        self.assertAlmostEqual(
            submission.bootstrap_gate_v(48.0, 12.0), 60.0, delta=1e-12,
            msg="expected the gate to sit 12 V above a 48 V phase node, at 60 V; 12 means the "
                "bootstrap forgot the node, which would leave the FET off - check V_sw + V_drv",
        )

    def test_a_grounded_phase_node_is_just_the_driver(self):
        self.assertAlmostEqual(
            submission.bootstrap_gate_v(0.0, 12.0), 12.0, delta=1e-12,
            msg="expected a grounded phase node to leave the driver's own 12 V; 0.0 likely "
                "dropped the driver term - check the sum",
        )

    def test_a_zero_rise_time_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gate_drive_current_a(30.0, 0.0)

    def test_a_dead_driver_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bootstrap_gate_v(48.0, 0.0)


class PrechargeTests(unittest.TestCase):
    def test_the_worked_settle_time(self):
        # 5 * 48 ohm * 1000 uF = 0.24 s.
        self.assertAlmostEqual(
            submission.precharge_time_s(48.0, 1000e-6), 0.24, delta=1e-12,
            msg="expected five time constants of 48 ohm and 1 mF to be 0.24 s; 0.048 means only "
                "one time constant was used - check the default taus",
        )

    def test_a_forty_seven_ohm_resistor(self):
        self.assertAlmostEqual(
            submission.precharge_time_s(47.0, 1000e-6), 0.235, delta=1e-12,
            msg="expected a 47 ohm resistor to settle in 0.235 s; 0.047 likely dropped the five "
                "time constants - check the same rule applies to the nearest standard value",
        )

    def test_the_worked_peak_inrush(self):
        self.assertAlmostEqual(
            submission.precharge_peak_a(48.0, 48.0), 1.0, delta=1e-12,
            msg="expected 48 V across 48 ohm to draw 1 A at t = 0; 2304 likely squared the "
                "voltage - check V / R",
        )

    def test_the_gate_test_peak(self):
        self.assertAlmostEqual(
            submission.precharge_peak_a(48.0, 60.0), 0.8, delta=1e-12,
            msg="expected the 60 ohm gate-test resistor to limit inrush to 0.8 A; 1.25 likely "
                "inverted the ratio - check V / R",
        )

    def test_one_time_constant_is_five_times_faster(self):
        five = submission.precharge_time_s(48.0, 1000e-6)
        one = submission.precharge_time_s(48.0, 1000e-6, taus=1.0)
        self.assertAlmostEqual(
            one, 0.048, delta=1e-12,
            msg="expected one time constant at 48 ohm and 1 mF to be 0.048 s; 0.24 likely "
                "ignored the taus argument - check it multiplies R C",
        )
        self.assertAlmostEqual(
            five / one, 5.0, delta=1e-12,
            msg="expected the five-tau settle to be exactly five times the one-tau time; another "
                "ratio likely hardcoded both values - check taus is the only difference",
        )

    def test_a_bare_wire_is_refused(self):
        with self.assertRaises(ValueError):
            submission.precharge_peak_a(48.0, 0.0)


class EnergyTests(unittest.TestCase):
    def test_the_worked_bus_energy(self):
        # 0.5 * 1000 uF * 48^2 = 1.152 J, the same energy the pre-charge resistor burns.
        self.assertAlmostEqual(
            submission.bus_energy_j(1000e-6, 48.0), 1.152, delta=1e-12,
            msg="expected 0.5 C V^2 to be 1.152 J; 2.304 means the half was dropped - check the "
                "factor",
        )

    def test_the_skip_test_bus_energy(self):
        self.assertAlmostEqual(
            submission.bus_energy_j(1500e-6, 48.0), 1.728, delta=1e-12,
            msg="expected 1.5 mF at 48 V to store 1.728 J; 1.152 likely used 1 mF - check the "
                "capacitance argument",
        )

    def test_the_gate_test_bus_energy(self):
        self.assertAlmostEqual(
            submission.bus_energy_j(2000e-6, 48.0), 2.304, delta=1e-12,
            msg="expected 2 mF at 48 V to store 2.304 J; 4.608 means the half was dropped - "
                "check the formula",
        )

    def test_energy_scales_with_the_voltage_squared(self):
        one = submission.bus_energy_j(1000e-6, 48.0)
        two = submission.bus_energy_j(1000e-6, 96.0)
        self.assertAlmostEqual(
            two / one, 4.0, delta=1e-12,
            msg="expected doubling the bus voltage to quadruple the stored energy; 2.0 likely "
                "used a linear law - check V^2",
        )

    def test_a_negative_capacitance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.bus_energy_j(-1e-6, 48.0)


if __name__ == "__main__":
    unittest.main()
