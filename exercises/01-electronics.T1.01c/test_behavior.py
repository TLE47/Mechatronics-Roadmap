"""Behaviour tests for 01-electronics.T1.01c.

Each test names the mistake it catches:
  * a supply model that never folds back, so a 0.25 ohm miswire is scored at 576 W instead of the
    0.01 W the current limit allows;
  * a critical resistance multiplied instead of divided (144 instead of 120 ohms);
  * a current-jack short computed from the voltmeter's 10 Mohm input, which reads in microamps
    where the fuse sees 1200 A;
  * breadboard clip heat without the square, which understates a 5 A motor lead by 5x;
  * a short check that fires on a healthy 240 ohm build and passes a 5 ohm miswire.

Every assertion carries the message a learner reading a failure needs: what was expected, what a
different answer implies, the likely cause, and what to check. On the Core route this message is the
only mentor in the room.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class PsuTests(unittest.TestCase):
    def test_the_worked_example_folds_back(self):
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 0.20, 0.25)
        self.assertEqual(mode, "CC", "expected CC on a 0.25 ohm load at 200 mA; a CV result likely never compared the demand 48 A with the limit - check the foldback branch runs first")
        self.assertAlmostEqual(v_out, 0.05, delta=1e-12, msg="expected 0.05 V from 0.20 A through 0.25 ohm in CC; a 12 V result likely reported the setpoint - check the voltage drops to I_limit * R")
        self.assertAlmostEqual(i_out, 0.20, delta=1e-12, msg="expected 0.20 A, the limit itself, in CC; a 48 A result likely divided 12 V by the load - check the current is capped before the voltage is recomputed")
        self.assertAlmostEqual(p_out, 0.01, delta=1e-12, msg="expected 0.01 W from 0.05 V * 0.20 A; a 576 W result likely used the unlimited 12 V * 48 A - check the power uses the folded-back pair")

    def test_the_unprotected_battery_is_not_clamped(self):
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 50.0, 0.25)
        self.assertEqual(mode, "CV", "expected CV when a 50 A limit exceeds the 48 A demand; a CC result likely folded back on any large current - check the demand is compared with the limit")
        self.assertAlmostEqual(v_out, 12.0, delta=1e-12, msg="expected the full 12 V setpoint in CV; a 0.05 V result likely clamped although the demand was under the limit - check the mode before the voltage")
        self.assertAlmostEqual(i_out, 48.0, delta=1e-12, msg="expected 48 A from 12 V / 0.25 ohm in CV; a 50 A result likely returned the limit - check the load decides the current when it is allowed")
        self.assertAlmostEqual(p_out, 576.0, delta=1e-12, msg="expected 576 W from 12 V * 48 A; a 0.01 W result likely reused the 200 mA example - check the power is recomputed from this load")

    def test_the_exercise_stays_in_cv(self):
        # 240 ohms draws 50 mA against a 100 mA limit: 12 V, 0.05 A, 0.6 W, no foldback.
        v_out, i_out, p_out, mode = submission.psu_output(12.0, 0.10, 240.0)
        self.assertEqual(mode, "CV", "expected CV for a 50 mA demand under a 100 mA limit; a CC result likely compared the limit with itself - check the demand 12/240 is computed first")
        self.assertAlmostEqual(v_out, 12.0, delta=1e-12, msg="expected the 12 V rail to hold within 5 percent; a folded 0.05 V result likely treated 50 mA as over the limit - check 0.05 < 0.10 before folding")
        self.assertAlmostEqual(i_out, 0.05, delta=1e-12, msg="expected 50 mA from 12 V / 240 ohm; a 0.10 A result likely returned the limit instead of the load current - check I = V / R in CV")
        self.assertAlmostEqual(p_out, 0.6, delta=1e-12, msg="expected 0.6 W from 12 V * 0.05 A; a 1.2 W result likely used the 100 mA limit - check the power uses the actual current")

    def test_the_skip_test_foldback(self):
        v_out, i_out, _p_out, mode = submission.psu_output(12.0, 0.25, 4.0)
        self.assertEqual(mode, "CC", "expected CC on a 4 ohm load at 250 mA, because 12/4 = 3 A exceeds the limit; a CV result likely skipped the demand comparison - check 3 A against 0.25 A")
        self.assertAlmostEqual(v_out, 1.0, delta=1e-9, msg="expected 1.0 V from 0.25 A * 4 ohm after foldback; a 3.0 V or 12 V result likely ignored the limit - check the voltage is recomputed at the limit")
        self.assertAlmostEqual(i_out, 0.25, delta=1e-12, msg="expected exactly the 0.25 A limit; a 3 A result likely used the unlimited load current - check the cap applies before the voltage")

    def test_the_break_it_raised_limit(self):
        v_out, _i_out, p_out, mode = submission.psu_output(12.0, 2.0, 0.25)
        self.assertEqual(mode, "CC", "expected CC with the limit raised to 2 A, since 48 A still exceeds it; a CV result likely kept a lower hard-coded limit - check the argument is used")
        self.assertAlmostEqual(v_out, 0.50, delta=1e-12, msg="expected 0.50 V from 2 A * 0.25 ohm; a 0.05 V result likely reused the 200 mA limit - check the limit argument reaches the multiplication")
        self.assertAlmostEqual(p_out, 1.0, delta=1e-12, msg="expected 1.0 W from 0.50 V * 2 A; a 0.01 W result likely kept the old limit - check the power follows the raised limit")

    def test_bad_settings_are_refused(self):
        with self.assertRaises(ValueError):
            submission.psu_output(12.0, 0.0, 10.0)
        with self.assertRaises(ValueError):
            submission.psu_output(12.0, 0.2, 0.0)


class CriticalResistanceTests(unittest.TestCase):
    def test_the_exercise_threshold(self):
        self.assertAlmostEqual(submission.critical_resistance(12.0, 0.10), 120.0, delta=1e-12, msg="expected 120 ohm where a 12 V supply meets a 0.10 A limit; a 1.2 ohm result likely divided the limit by the voltage - check R = V / I")

    def test_the_threshold_is_where_the_mode_changes(self):
        r_crit = submission.critical_resistance(12.0, 0.10)
        just_above = submission.psu_output(12.0, 0.10, r_crit * 1.001)
        just_below = submission.psu_output(12.0, 0.10, r_crit * 0.999)
        self.assertEqual(just_above[3], "CV", "expected CV just above the threshold; a CC result likely compared with a strict inequality - check the boundary is inclusive on the CV side")
        self.assertEqual(just_below[3], "CC", "expected CC just below the threshold; a CV result likely used the limit as a floor rather than a cap - check the demand exceeds the limit here")

    def test_a_zero_limit_is_refused(self):
        with self.assertRaises(ValueError):
            submission.critical_resistance(12.0, 0.0)


class DmmTests(unittest.TestCase):
    def test_voltage_mode_barely_loads_the_rail(self):
        self.assertAlmostEqual(submission.dmm_voltage_loading_current(12.0), 1.2e-6, delta=1e-18, msg="expected 1.2 uA from 12 V across the 10 Mohm input; a 1200 A result likely used the current-jack shunt - check the 10 Mohm divide")
        self.assertLess(submission.dmm_voltage_loading_current(24.0), 3e-6, msg="expected under 3 uA at 24 V; a millamp-scale result likely divided by 0.01 ohm instead of 10 Mohm - check the input resistance")

    def test_the_current_jack_short(self):
        self.assertAlmostEqual(submission.dmm_short_current(12.0), 1200.0, delta=1e-9, msg="expected 1200 A through the 0.010 ohm shunt; a microamp result likely used the voltmeter input - check which jack the probe is in")

    def test_the_skip_test_with_lead_resistance(self):
        # 24 V across 0.010 ohm of shunt plus 0.010 ohm of leads.
        self.assertAlmostEqual(submission.dmm_short_current(24.0, 0.010, 0.010), 1200.0, delta=1e-9, msg="expected 1200 A from 24 V across 0.020 ohm of shunt plus leads; a 2400 A result likely ignored the lead resistance - check both terms are summed")

    def test_a_bad_shunt_is_refused(self):
        with self.assertRaises(ValueError):
            submission.dmm_short_current(12.0, 0.0)


class ClipTests(unittest.TestCase):
    def test_the_skip_test_clip_heat(self):
        self.assertAlmostEqual(submission.clip_power(5.0, 0.12), 3.0, delta=1e-6, msg="expected 3.0 W from 5 A squared times 0.12 ohm; a 0.6 W result likely multiplied without squaring - check I * I * R")

    def test_the_datasheet_clip(self):
        self.assertAlmostEqual(submission.clip_power(5.0, 0.05), 1.25, delta=1e-12, msg="expected 1.25 W from 25 * 0.05; a 0.25 W result likely used the bare product - check the current is squared")

    def test_the_square_matters(self):
        self.assertAlmostEqual(submission.clip_power(1.0, 4.0), 4.0, delta=1e-12, msg="expected 4.0 W from 1 A squared times 4 ohm; the bare product also gives 4.0 W here, so check the 2 A case is what separates the two formulas")
        self.assertAlmostEqual(submission.clip_power(2.0, 1.0), 4.0, delta=1e-12, msg="expected 4.0 W from 2 A squared times 1 ohm; a 2.0 W result likely multiplied I * R - check this pair only agrees when squared")

    def test_a_negative_resistance_is_refused(self):
        with self.assertRaises(ValueError):
            submission.clip_power(1.0, -0.1)


class LedTests(unittest.TestCase):
    def test_the_skip_test_current(self):
        # (5.0 - 2.0) / 300 = 10 mA.
        self.assertAlmostEqual(submission.led_current_ma(5.0, 2.0, 300.0), 10.0, delta=1e-9, msg="expected 10 mA from (5.0 - 2.0) / 300; a 16.7 mA result likely forgot the forward drop - check the subtraction before dividing")

    def test_the_other_resistor_family(self):
        self.assertAlmostEqual(submission.led_current_ma(5.0, 2.1, 290.0), 10.0, delta=1e-9, msg="expected 10 mA again from (5.0 - 2.1) / 290; a 10.34 mA result likely rounded the drop to 2.0 V - check the exact forward voltage")

    def test_reverse_bias_draws_nothing_and_a_zero_resistor_raises(self):
        self.assertEqual(submission.led_current_ma(3.3, 3.5, 220.0), 0.0, msg="expected 0 mA when the supply is below the forward drop; a negative result likely ran the subtraction anyway - check the reverse-bias guard")
        with self.assertRaises(ValueError):
            submission.led_current_ma(5.0, 2.0, 0.0)


class ShortCheckTests(unittest.TestCase):
    def test_a_healthy_build_is_not_a_short(self):
        self.assertFalse(submission.is_short(240.0), "expected a healthy 240 ohm build not to be flagged; a True here likely compares resistance as a minimum - check the comparison direction")

    def test_a_miswire_is_a_short(self):
        self.assertTrue(submission.is_short(5.0), "expected a 5 ohm miswire to be flagged; a False here likely uses a threshold below 5 ohm - check the 10 ohm line")

    def test_the_threshold_is_exclusive(self):
        self.assertFalse(submission.is_short(10.0), "expected exactly 10 ohm to sit on the safe side; a True here likely used <= instead of < - check the boundary is exclusive")
        self.assertTrue(submission.is_short(9.99), "expected 9.99 ohm to be flagged; a False here likely rounds the reading before comparing - check the raw value reaches the comparison")

    def test_a_bad_threshold_is_refused(self):
        with self.assertRaises(ValueError):
            submission.is_short(5.0, threshold=0.0)


if __name__ == "__main__":
    unittest.main()
