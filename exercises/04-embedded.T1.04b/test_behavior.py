"""Behaviour tests for 04-embedded.T1.04b.

Each test names the mistake it catches:
  * a timer difference taken without the unsigned mask, which goes negative at rollover;
  * a scheduler that resynchronises to the current reading and accumulates drift;
  * an ISR budget in seconds confused with one in microseconds;
  * a percentage used as a fraction;
  * a fault that clears itself the moment the current recovers.
"""

import unittest

import harness

submission = harness.load_submission()


class SchedulerTests(unittest.TestCase):
    def test_the_worked_example_elapsed_time(self):
        # 3015 - 2000 = 1015 us, one period past the 1 kHz deadline.
        self.assertEqual(submission.elapsed_us(3015, 2000), 1015)

    def test_the_unsigned_16_bit_difference_survives_the_wrap(self):
        # The Gate test's counter: 12 - 65520 wraps to 28 on a 16-bit timer.
        self.assertEqual(submission.elapsed_us(12, 65520, 16), 28)

    def test_the_32_bit_difference_spans_the_same_wrap(self):
        # 2**32 + 12 - 65520 = 4294901788 - the same 28 ticks, read at full width.
        self.assertEqual(submission.elapsed_us(12, 65520), 4294901788)

    def test_the_worked_example_fires_on_its_grid(self):
        self.assertTrue(submission.tick_due(3015, 2000, 1000))

    def test_a_half_elapsed_period_does_not_fire(self):
        self.assertFalse(submission.tick_due(2999, 2000, 1000))

    def test_a_deadline_that_lands_exactly_on_the_tick_fires(self):
        # 3000 - 2000 is exactly one period; `>` instead of `>=` loses that tick.
        self.assertTrue(submission.tick_due(3000, 2000, 1000))

    def test_the_wrap_does_not_lose_a_tick(self):
        # last_us = 0xFFFFFFFF, now = 999: unsigned subtraction gives exactly 1000 us.
        self.assertTrue(submission.tick_due(999, 0xFFFFFFFF, 1000))

    def test_the_deadline_advances_on_its_own_grid(self):
        # Not 3015: the grid stays on 1000 us multiples, so the next tick is 3000.
        self.assertEqual(submission.next_deadline_us(2000, 1000), 3000)
        self.assertNotEqual(submission.next_deadline_us(2000, 1000), 3015)
        self.assertEqual(submission.next_deadline_us(3000, 1000), 4000)

    def test_the_deadline_wraps_with_the_microsecond_counter(self):
        self.assertEqual(submission.next_deadline_us(0xFFFFFFFF, 1000), 999)

    def test_a_zero_period_is_refused(self):
        with self.assertRaises(ValueError):
            submission.tick_due(3015, 2000, 0)
        with self.assertRaises(ValueError):
            submission.next_deadline_us(2000, 0)

    def test_a_narrow_timer_is_refused(self):
        with self.assertRaises(ValueError):
            submission.elapsed_us(12, 65520, 4)

    def test_a_too_wide_timer_is_refused(self):
        with self.assertRaises(ValueError):
            submission.elapsed_us(12, 65520, 33)


class IsrTests(unittest.TestCase):
    def test_the_worked_example_utilization(self):
        # 45 us of work every 1000 us is 4.5 % of the CPU.
        self.assertAlmostEqual(submission.isr_utilization_pct(45.0, 1000.0), 4.5, delta=1e-9)

    def test_the_skip_test_utilization(self):
        self.assertAlmostEqual(submission.isr_utilization_pct(35.0, 1000.0), 3.5, delta=1e-9)

    def test_ten_kilohertz_costs_ten_times_more(self):
        self.assertAlmostEqual(submission.isr_utilization_pct(45.0, 10_000.0), 45.0, delta=1e-9)

    def test_an_idle_isr_costs_nothing(self):
        self.assertAlmostEqual(submission.isr_utilization_pct(0.0, 1000.0), 0.0, delta=1e-12)

    def test_the_exercise_budget(self):
        # A 100 us period with 25 % of it for the ISR leaves 75 % for telemetry.
        self.assertAlmostEqual(submission.max_isr_exec_us(25.0, 10_000.0), 25.0, delta=1e-12)
        self.assertAlmostEqual(submission.max_isr_exec_us(100.0, 1000.0), 1000.0, delta=1e-12)

    def test_the_skip_test_fault_latency(self):
        # Three samples at 20 kHz is 150 us of detection latency.
        self.assertAlmostEqual(submission.fault_latency_us(3, 20_000.0), 150.0, delta=1e-9)

    def test_one_sample_at_one_kilohertz_is_one_period(self):
        self.assertAlmostEqual(submission.fault_latency_us(1, 1000.0), 1000.0, delta=1e-9)

    def test_a_budget_outside_the_percentage_is_refused(self):
        with self.assertRaises(ValueError):
            submission.max_isr_exec_us(0.0, 1000.0)
        with self.assertRaises(ValueError):
            submission.max_isr_exec_us(101.0, 1000.0)

    def test_an_isr_longer_than_its_period_is_refused(self):
        # At 10 kHz the period is 100 us; 200 us of work can never be scheduled.
        with self.assertRaises(ValueError):
            submission.isr_utilization_pct(200.0, 10_000.0)

    def test_a_zero_frequency_is_refused(self):
        with self.assertRaises(ValueError):
            submission.isr_utilization_pct(10.0, 0.0)

    def test_a_zero_debounce_is_refused(self):
        with self.assertRaises(ValueError):
            submission.fault_latency_us(0, 1000.0)


class FsmTests(unittest.TestCase):
    def test_idle_starts_homing(self):
        self.assertEqual(submission.fsm_step("IDLE", 2.0, 5.0, -0.05, 0.0), ("HOMING", 0.2))

    def test_homing_holds_while_the_axis_is_still_short(self):
        self.assertEqual(submission.fsm_step("HOMING", 2.0, 5.0, -0.01, 0.2), ("HOMING", 0.2))

    def test_homing_reaches_run_exactly_at_zero(self):
        self.assertEqual(submission.fsm_step("HOMING", 2.0, 5.0, 0.0, 0.2), ("RUN", 0.2))

    def test_run_holds_the_commanded_pwm(self):
        self.assertEqual(submission.fsm_step("RUN", 2.0, 5.0, 0.10, 0.4), ("RUN", 0.4))

    def test_an_overcurrent_tick_faults_and_cuts_the_pwm(self):
        self.assertEqual(submission.fsm_step("RUN", 5.5, 5.0, 0.10, 0.4), ("FAULT", 0.0))

    def test_the_current_limit_itself_is_not_a_fault(self):
        self.assertEqual(submission.fsm_step("RUN", 5.0, 5.0, 0.10, 0.4), ("RUN", 0.4))

    def test_a_fault_stays_latched_after_the_current_recovers(self):
        # The meter now reads a harmless 0 A, and the axis is fine - FAULT must still hold.
        self.assertEqual(submission.fsm_step("FAULT", 0.0, 5.0, 0.10, 0.4), ("FAULT", 0.0))

    def test_an_unknown_state_is_refused(self):
        with self.assertRaises(ValueError):
            submission.fsm_step("CLOSED_LOOP", 2.0, 5.0, 0.10, 0.4)

    def test_a_duty_above_one_is_refused(self):
        with self.assertRaises(ValueError):
            submission.fsm_step("RUN", 2.0, 5.0, 0.10, 1.5)


class TickCountTests(unittest.TestCase):
    def test_the_gate_test_tick_count(self):
        # 0.25 s of a 1 kHz control task is 250 ticks.
        self.assertEqual(submission.ticks_in(250_000, 1000), 250)

    def test_the_worked_example_control_ticks(self):
        self.assertEqual(submission.ticks_in(10_000, 1000), 10)

    def test_a_window_one_period_long_holds_one_tick(self):
        self.assertEqual(submission.ticks_in(10_000, 10_000), 1)

    def test_a_partial_tick_has_not_run(self):
        self.assertEqual(submission.ticks_in(999, 1000), 0)

    def test_a_negative_duration_is_refused(self):
        with self.assertRaises(ValueError):
            submission.ticks_in(-1, 1000)

    def test_a_zero_period_is_refused_here_too(self):
        with self.assertRaises(ValueError):
            submission.ticks_in(10_000, 0)


if __name__ == "__main__":
    unittest.main()
