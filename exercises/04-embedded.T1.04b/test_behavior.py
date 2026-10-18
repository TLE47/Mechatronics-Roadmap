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
        self.assertEqual(
            submission.elapsed_us(3015, 2000), 1015,
            msg="expected 1015 us between timer readings 2000 and 3015; another value likely "
                "subtracted the arguments in the other order - check elapsed is now minus last",
        )

    def test_the_unsigned_16_bit_difference_survives_the_wrap(self):
        # The Gate test's counter: 12 - 65520 wraps to 28 on a 16-bit timer.
        self.assertEqual(
            submission.elapsed_us(12, 65520, 16), 28,
            msg="expected 28 us across a 16-bit rollover from 65520 to 12; a negative or huge "
                "answer likely skipped the unsigned mask - check the width is applied before the sign",
        )

    def test_the_32_bit_difference_spans_the_same_wrap(self):
        # 2**32 + 12 - 65520 = 4294901788 - the same 28 ticks, read at full width.
        self.assertEqual(
            submission.elapsed_us(12, 65520), 4294901788,
            msg="expected 4294901788 ticks at the default 32-bit width; a value near 28 likely "
                "assumed a 16-bit timer - check the default mask is 0xFFFFFFFF",
        )

    def test_the_worked_example_fires_on_its_grid(self):
        self.assertTrue(
            submission.tick_due(3015, 2000, 1000),
            msg="expected a tick at 3015 us for a 1000 us period started at 2000; False likely "
                "means the comparison needs a whole period and 1015 us has it - check the >= test",
        )

    def test_a_half_elapsed_period_does_not_fire(self):
        self.assertFalse(
            submission.tick_due(2999, 2000, 1000),
            msg="expected no tick at 2999 us, one microsecond short of the 1000 us period; True "
                "likely rounded the comparison - check the elapsed time is compared exactly",
        )

    def test_a_deadline_that_lands_exactly_on_the_tick_fires(self):
        # 3000 - 2000 is exactly one period; `>` instead of `>=` loses that tick.
        self.assertTrue(
            submission.tick_due(3000, 2000, 1000),
            msg="expected the tick exactly one period later to fire; False means the comparison "
                "rejects equality - check tick_due uses >= and not >",
        )

    def test_the_wrap_does_not_lose_a_tick(self):
        # last_us = 0xFFFFFFFF, now = 999: unsigned subtraction gives exactly 1000 us.
        self.assertTrue(
            submission.tick_due(999, 0xFFFFFFFF, 1000),
            msg="expected the tick across the 32-bit wrap from 0xFFFFFFFF to 999 to fire; False "
                "likely lost the mask, so the difference read as negative - check elapsed_us",
        )

    def test_the_deadline_advances_on_its_own_grid(self):
        # Not 3015: the grid stays on 1000 us multiples, so the next tick is 3000.
        self.assertEqual(
            submission.next_deadline_us(2000, 1000), 3000,
            msg="expected the next deadline on the 1000 us grid to be 3000; 3015 likely came from "
                "resynchronising to the current reading - check the deadline adds the period",
        )
        self.assertNotEqual(
            submission.next_deadline_us(2000, 1000), 3015,
            msg="expected the deadline never to snap to a late check time such as 3015, which is "
                "how drift accumulates; check next_deadline adds period to the old deadline",
        )
        self.assertEqual(
            submission.next_deadline_us(3000, 1000), 4000,
            msg="expected the grid to keep advancing one period at a time, 3000 to 4000; another "
                "value likely restarted the grid - check the deadline always moves by period_us",
        )

    def test_the_deadline_wraps_with_the_microsecond_counter(self):
        self.assertEqual(
            submission.next_deadline_us(0xFFFFFFFF, 1000), 999,
            msg="expected the deadline after the 32-bit wrap to be 999 us; a value near 4.295e9 "
                "likely forgot the mask - check the sum is masked to 32 bits",
        )

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
        self.assertAlmostEqual(
            submission.isr_utilization_pct(45.0, 1000.0), 4.5, delta=1e-9,
            msg="expected 4.5 percent for a 45 us ISR at 1 kHz; 0.045 means the answer is a "
                "fraction, not a percentage - check the factor of 100",
        )

    def test_the_skip_test_utilization(self):
        self.assertAlmostEqual(
            submission.isr_utilization_pct(35.0, 1000.0), 3.5, delta=1e-9,
            msg="expected 3.5 percent for a 35 us ISR at 1 kHz; a value off by 1000 likely used "
                "seconds where microseconds were meant - check the 1e-6 conversion",
        )

    def test_ten_kilohertz_costs_ten_times_more(self):
        self.assertAlmostEqual(
            submission.isr_utilization_pct(45.0, 10_000.0), 45.0, delta=1e-9,
            msg="expected ten times the CPU at 10 kHz, 45 percent; 4.5 likely ignored the frequency "
                "and used a fixed period - check the cost scales with f_isr_hz",
        )

    def test_an_idle_isr_costs_nothing(self):
        self.assertAlmostEqual(
            submission.isr_utilization_pct(0.0, 1000.0), 0.0, delta=1e-12,
            msg="expected zero CPU for a zero-length ISR; a nonzero answer likely added a fixed "
                "overhead term - check utilization is proportional to t_exec",
        )

    def test_the_exercise_budget(self):
        # A 100 us period with 25 % of it for the ISR leaves 75 % for telemetry.
        self.assertAlmostEqual(
            submission.max_isr_exec_us(25.0, 10_000.0), 25.0, delta=1e-12,
            msg="expected a 25 percent budget at 10 kHz to allow 25 us; 2500 likely used the "
                "1 kHz period - check the period is 1e6 / 10000 us",
        )
        self.assertAlmostEqual(
            submission.max_isr_exec_us(100.0, 1000.0), 1000.0, delta=1e-12,
            msg="expected a full 100 percent budget at 1 kHz to allow the whole 1000 us period; a "
                "value near 10 likely treated the percent as a fraction - check u_max_pct / 100",
        )

    def test_the_skip_test_fault_latency(self):
        # Three samples at 20 kHz is 150 us of detection latency.
        self.assertAlmostEqual(
            submission.fault_latency_us(3, 20_000.0), 150.0, delta=1e-9,
            msg="expected 150 us for three samples at 20 kHz; 3000 likely used the 1 kHz period - "
                "check each sample is 1e6 / f_isr us",
        )

    def test_one_sample_at_one_kilohertz_is_one_period(self):
        self.assertAlmostEqual(
            submission.fault_latency_us(1, 1000.0), 1000.0, delta=1e-9,
            msg="expected one sample at 1 kHz to cost exactly one period, 1000 us; 1.0 likely "
                "returned milliseconds - check the result is in microseconds",
        )

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
        self.assertEqual(
            submission.fsm_step("IDLE", 2.0, 5.0, -0.05, 0.0), ("HOMING", 0.2),
            msg="expected IDLE to enter HOMING at the 0.2 homing duty; another pair likely passed "
                "the commanded 0.0 duty straight through - check the IDLE branch sets HOMING_PWM",
        )

    def test_homing_holds_while_the_axis_is_still_short(self):
        self.assertEqual(
            submission.fsm_step("HOMING", 2.0, 5.0, -0.01, 0.2), ("HOMING", 0.2),
            msg="expected HOMING to hold while the axis sits at -0.01 rad; RUN here likely "
                "tested the position with <= or an absolute value - check pos_rad < 0.0",
        )

    def test_homing_reaches_run_exactly_at_zero(self):
        self.assertEqual(
            submission.fsm_step("HOMING", 2.0, 5.0, 0.0, 0.2), ("RUN", 0.2),
            msg="expected HOMING to reach RUN exactly at the zero reference; HOMING here likely "
                "used a strict < that never lets zero through - check the boundary at pos_rad == 0",
        )

    def test_run_holds_the_commanded_pwm(self):
        self.assertEqual(
            submission.fsm_step("RUN", 2.0, 5.0, 0.10, 0.4), ("RUN", 0.4),
            msg="expected RUN to pass the commanded 0.4 duty through unchanged; 0.2 likely "
                "reapplied the homing duty - check the RUN branch returns pwm_cmd",
        )

    def test_an_overcurrent_tick_faults_and_cuts_the_pwm(self):
        self.assertEqual(
            submission.fsm_step("RUN", 5.5, 5.0, 0.10, 0.4), ("FAULT", 0.0),
            msg="expected 5.5 A over a 5.0 A limit to fault and force the duty to zero; RUN with "
                "0.4 likely compared against the wrong threshold - check current > i_max_a",
        )

    def test_the_current_limit_itself_is_not_a_fault(self):
        self.assertEqual(
            submission.fsm_step("RUN", 5.0, 5.0, 0.10, 0.4), ("RUN", 0.4),
            msg="expected exactly 5.0 A at the 5.0 A limit to keep running; FAULT here likely "
                "used >= and trips on the limit itself - check the comparison is strict",
        )

    def test_a_fault_stays_latched_after_the_current_recovers(self):
        # The meter now reads a harmless 0 A, and the axis is fine - FAULT must still hold.
        self.assertEqual(
            submission.fsm_step("FAULT", 0.0, 5.0, 0.10, 0.4), ("FAULT", 0.0),
            msg="expected FAULT to latch with zero duty even at 0 A; a return to RUN likely "
                "re-evaluated the current before the latched state - check FAULT is handled first",
        )

    def test_an_unknown_state_is_refused(self):
        with self.assertRaises(ValueError):
            submission.fsm_step("CLOSED_LOOP", 2.0, 5.0, 0.10, 0.4)

    def test_a_duty_above_one_is_refused(self):
        with self.assertRaises(ValueError):
            submission.fsm_step("RUN", 2.0, 5.0, 0.10, 1.5)


class TickCountTests(unittest.TestCase):
    def test_the_gate_test_tick_count(self):
        # 0.25 s of a 1 kHz control task is 250 ticks.
        self.assertEqual(
            submission.ticks_in(250_000, 1000), 250,
            msg="expected 250 ticks in 0.25 s at 1 kHz; 0.25 likely divided the microseconds "
                "without scaling - check 250000 us / 1000 us per tick",
        )

    def test_the_worked_example_control_ticks(self):
        self.assertEqual(
            submission.ticks_in(10_000, 1000), 10,
            msg="expected 10 ticks in a 10 ms window at 1 kHz; 10000 likely returned the raw "
                "duration - check the window is divided by the period",
        )

    def test_a_window_one_period_long_holds_one_tick(self):
        self.assertEqual(
            submission.ticks_in(10_000, 10_000), 1,
            msg="expected a window exactly one period long to hold one whole tick; 0 likely used "
                "a strict comparison - check integer division of equal values",
        )

    def test_a_partial_tick_has_not_run(self):
        self.assertEqual(
            submission.ticks_in(999, 1000), 0,
            msg="expected no complete tick in 999 of 1000 us; 1 likely rounded up - check the "
                "count is a floor division",
        )

    def test_a_negative_duration_is_refused(self):
        with self.assertRaises(ValueError):
            submission.ticks_in(-1, 1000)

    def test_a_zero_period_is_refused_here_too(self):
        with self.assertRaises(ValueError):
            submission.ticks_in(10_000, 0)


if __name__ == "__main__":
    unittest.main()
