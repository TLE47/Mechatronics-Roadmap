"""Behaviour tests for 07-systems.T1.07a.

Each test names the mistake it catches:
  * a scan rate computed in seconds but reported as if the budget were in seconds (500 Hz becomes
    0.5 Hz, or 1.25 Hz);
  * a series chain tested with `any`, so one broken NC wire leaves the contactor energised;
  * a state machine that leaves the latched state the moment the chain closes, which restarts the
    robot when the mushroom is twisted out;
  * a gain in 10 log10 instead of 20 log10 - exactly half the decibels;
  * a phase reported as a positive lead;
  * a "peak-to-peak" amplitude that counts every frequency in the noise;
  * a decibel inverse that forgets that the factor of 20 is the half of it.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class ScanTests(unittest.TestCase):
    def test_the_skip_test_scan(self):
        # 0.40 + 1.10 + 0.50 ms = 2.00 ms -> 500 Hz.
        self.assertAlmostEqual(submission.scan_frequency_hz(0.40, 1.10, 0.50), 500.0, delta=1e-9)

    def test_the_gate_test_scan(self):
        self.assertAlmostEqual(submission.scan_frequency_hz(2.0, 2.0, 1.0), 200.0, delta=1e-9)

    def test_a_zero_budget_is_refused(self):
        with self.assertRaises(ValueError):
            submission.scan_frequency_hz(0.0, 0.0, 0.0)
        with self.assertRaises(ValueError):
            submission.scan_frequency_hz(-1.0, 1.0, 1.0)


class ChainTests(unittest.TestCase):
    def test_every_closed_contact_enables_power(self):
        self.assertTrue(submission.safety_chain_ok(1, 1, 1))

    def test_one_open_contact_drops_power(self):
        # The gate test: 1 & 1 & 0 = 0.
        self.assertFalse(submission.safety_chain_ok(1, 1, 0))

    def test_a_single_contact_is_still_a_chain(self):
        self.assertTrue(submission.safety_chain_ok(True))
        self.assertFalse(submission.safety_chain_ok(False))

    def test_an_empty_chain_is_refused(self):
        with self.assertRaises(ValueError):
            submission.safety_chain_ok()


class PlcTests(unittest.TestCase):
    def test_start_runs_and_a_wire_break_latches(self):
        state, power = submission.plc_scan_step("IDLE", True, True, True, True, False)
        self.assertEqual((state, power), ("RUNNING", True))
        state, power = submission.plc_scan_step(state, True, False, True, False, False)
        self.assertEqual((state, power), ("ESTOP_LATCHED", False))

    def test_releasing_the_estop_does_not_restart(self):
        # Chain healthy again, Start still held: the machine must stay latched and unpowered.
        state, power = submission.plc_scan_step("ESTOP_LATCHED", True, True, True, True, False)
        self.assertEqual((state, power), ("ESTOP_LATCHED", False))

    def test_reset_with_start_released_returns_to_idle(self):
        state, power = submission.plc_scan_step("ESTOP_LATCHED", True, True, True, False, True)
        self.assertEqual((state, power), ("IDLE", False))

    def test_reset_while_start_is_held_is_ignored(self):
        state, power = submission.plc_scan_step("ESTOP_LATCHED", True, True, True, True, True)
        self.assertEqual((state, power), ("ESTOP_LATCHED", False))

    def test_an_unknown_state_is_refused(self):
        with self.assertRaises(ValueError):
            submission.plc_scan_step("DANCING", True, True, True, False, False)


class GainTests(unittest.TestCase):
    def test_the_worked_half_amplitude(self):
        self.assertAlmostEqual(submission.gain_db(0.10, 0.20), -6.0206, delta=1e-3)

    def test_the_gate_test_one_tenth(self):
        self.assertAlmostEqual(submission.gain_db(0.04, 0.40), -20.0, delta=1e-9)

    def test_unity_and_the_three_db_point(self):
        self.assertAlmostEqual(submission.gain_db(1.0, 1.0), 0.0, delta=1e-12)
        self.assertAlmostEqual(submission.gain_db(0.7071067811865476, 1.0), -3.0103, delta=1e-4)

    def test_a_bad_amplitude_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gain_db(1.0, 0.0)
        with self.assertRaises(ValueError):
            submission.gain_db(-1.0, 1.0)


class PhaseTests(unittest.TestCase):
    def test_the_worked_quarter_period(self):
        # 8 Hz, 0.03125 s = a quarter period -> -90 degrees.
        self.assertAlmostEqual(submission.phase_lag_deg(8.0, 0.03125), -90.0, delta=1e-9)

    def test_the_five_hz_forty_five_degree_case(self):
        self.assertAlmostEqual(submission.phase_lag_deg(5.0, 0.025), -45.0, delta=1e-9)

    def test_a_negative_delay_is_refused(self):
        with self.assertRaises(ValueError):
            submission.phase_lag_deg(5.0, -0.001)


class LockInTests(unittest.TestCase):
    def test_a_pure_sine_is_measured_exactly(self):
        f, dt, amp = 5.0, 0.001, 0.35
        samples = [amp * math.sin(2.0 * math.pi * f * k * dt) for k in range(1000)]
        self.assertAlmostEqual(submission.sine_amplitude(samples, f, dt), amp, delta=1e-9)

    def test_noise_at_other_frequencies_is_rejected(self):
        f, dt, amp = 4.0, 0.001, 0.2
        samples = [amp * math.sin(2.0 * math.pi * f * k * dt)
                   + 0.5 * math.sin(2.0 * math.pi * 37.0 * k * dt) for k in range(1000)]
        self.assertAlmostEqual(submission.sine_amplitude(samples, f, dt), amp, delta=2e-3)

    def test_a_dc_offset_does_not_change_the_amplitude(self):
        f, dt, amp = 3.0, 0.001, 0.1
        samples = [1.7 + amp * math.sin(2.0 * math.pi * f * k * dt) for k in range(999)]
        self.assertAlmostEqual(submission.sine_amplitude(samples, f, dt), amp, delta=2e-3)

    def test_an_empty_measurement_is_refused(self):
        with self.assertRaises(ValueError):
            submission.sine_amplitude([], 5.0, 0.001)


class DecibelInverseTests(unittest.TestCase):
    def test_round_trip(self):
        for db in (-20.0, -6.0206, -3.0103, 0.0, 6.0):
            self.assertAlmostEqual(submission.gain_db(submission.db_to_ratio(db), 1.0), db,
                                   delta=1e-9)

    def test_the_three_db_point(self):
        self.assertAlmostEqual(submission.db_to_ratio(-3.0103), 1.0 / math.sqrt(2.0), delta=1e-4)


if __name__ == "__main__":
    unittest.main()
