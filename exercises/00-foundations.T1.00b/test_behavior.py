"""Behaviour tests for 00-foundations.T1.00b.

Each test names the mistake it catches:
  * a timestamp grid built as t0 + (i+1)*dt, which shifts a whole recording by one sample and
    hands the plot an N+1 point x-axis against an N point y-axis - the module's plotting error;
  * a calibration applied as slope + offset*x, the multiply and the add swapped;
  * a "peak-to-peak" that reports half the span, i.e. the amplitude of a symmetric signal;
  * an RMSE that averages the signed errors, which cancel a +0.1 against a -0.1 and report 0.0
    for a tracker that is off by 0.158 rad - the module's stated failure mode;
  * an error list that silently truncates a length mismatch through zip() instead of refusing it;
  * a Git lookup that guesses `git status` for a task it does not know.
"""

import unittest

import harness

submission = harness.load_submission()

TARGET = [1.0, 2.0, 3.0, 4.0]
MEASURED = [0.9, 2.1, 2.8, 4.2]
EXERCISE_RMSE = 0.15811388300841897  # sqrt(0.025): 0.01 + 0.01 + 0.04 + 0.04 over 4


class TimestampsTests(unittest.TestCase):
    def test_the_worked_timestamps(self):
        # 5 samples at 0.1 s starting at 0.0 s: 0.0 .. 0.4 s, the last one index 4.
        window = submission.timestamps(0.0, 0.1, 5)
        self.assertEqual(len(window), 5)
        for got, want in zip(window, [0.0, 0.1, 0.2, 0.3, 0.4]):
            self.assertAlmostEqual(got, want, delta=1e-12)

    def test_the_worked_spacing(self):
        window = submission.timestamps(0.0, 0.1, 5)
        steps = [window[i + 1] - window[i] for i in range(len(window) - 1)]
        self.assertEqual(len(steps), 4)
        for step in steps:
            self.assertAlmostEqual(step, 0.1, delta=1e-12)

    def test_the_skip_test_timestamp_500(self):
        # 1,000 samples over 2.0 s at 2 ms: index 500 sits at 1.0 s.
        self.assertAlmostEqual(submission.timestamps(0.0, 0.002, 501)[500], 1.0, delta=1e-12)

    def test_a_shifted_start(self):
        window = submission.timestamps(2.5, 0.5, 3)
        for got, want in zip(window, [2.5, 3.0, 3.5]):
            self.assertAlmostEqual(got, want, delta=1e-12)

    def test_degenerate_recordings_are_refused(self):
        for n in (0, -3):
            with self.assertRaises(ValueError):
                submission.timestamps(0.0, 0.1, n)
        for dt in (0.0, -0.1):
            with self.assertRaises(ValueError):
                submission.timestamps(0.0, dt, 5)


class ReadingTests(unittest.TestCase):
    CONFIG = {"slope": 3.0, "offset": 0.5}

    def test_the_worked_readings(self):
        # y = 3.0 t + 0.5 over the worked grid: 0.5, 0.8, 1.1, 1.4, 1.7 V.
        trace = submission.scaled_readings([0.0, 0.1, 0.2, 0.3, 0.4], self.CONFIG)
        for got, want in zip(trace, [0.5, 0.8, 1.1, 1.4, 1.7]):
            self.assertAlmostEqual(got, want, delta=1e-12)

    def test_the_keys_are_names_not_positions(self):
        # Same two constants, written in another order with an extra key: dicts do not care.
        config = {"offset": 0.5, "unit": "V", "slope": 3.0}
        trace = submission.scaled_readings([0.0, 0.1, 0.2], config)
        for got, want in zip(trace, [0.5, 0.8, 1.1]):
            self.assertAlmostEqual(got, want, delta=1e-12)

    def test_a_missing_config_key_is_refused(self):
        for config in ({"slope": 3.0}, {"offset": 0.5}, {}):
            with self.assertRaises(ValueError):
                submission.scaled_readings([0.0, 0.1], config)

    def test_the_worked_mean(self):
        trace = submission.scaled_readings([0.0, 0.1, 0.2, 0.3, 0.4], self.CONFIG)
        self.assertAlmostEqual(submission.mean_of(trace), 1.10, delta=1e-12)

    def test_the_worked_span(self):
        trace = submission.scaled_readings([0.0, 0.1, 0.2, 0.3, 0.4], self.CONFIG)
        self.assertAlmostEqual(submission.peak_to_peak(trace), 1.20, delta=1e-12)

    def test_a_constant_trace_has_no_span(self):
        self.assertAlmostEqual(submission.peak_to_peak([1.5, 1.5, 1.5]), 0.0, delta=1e-12)
        self.assertAlmostEqual(submission.mean_of([1.5, 1.5, 1.5]), 1.5, delta=1e-12)

    def test_a_negative_slope_reverses_the_trace(self):
        trace = submission.scaled_readings([0.0, 1.0, 2.0], {"slope": -2.0, "offset": 10.0})
        for got, want in zip(trace, [10.0, 8.0, 6.0]):
            self.assertAlmostEqual(got, want, delta=1e-12)
        self.assertAlmostEqual(submission.mean_of(trace), 8.0, delta=1e-12)
        self.assertAlmostEqual(submission.peak_to_peak(trace), 4.0, delta=1e-12)

    def test_empty_traces_are_refused(self):
        with self.assertRaises(ValueError):
            submission.mean_of([])
        with self.assertRaises(ValueError):
            submission.peak_to_peak([])


class ErrorTests(unittest.TestCase):
    def test_the_exercise_error_list(self):
        err = submission.errors(TARGET, MEASURED)
        self.assertEqual(len(err), 4)
        for got, want in zip(err, [0.1, -0.1, 0.2, -0.2]):
            self.assertAlmostEqual(got, want, delta=1e-12)

    def test_the_exercise_rmse(self):
        self.assertAlmostEqual(submission.rmse(TARGET, MEASURED), EXERCISE_RMSE, delta=1e-12)

    def test_the_signed_errors_cancel_but_the_rms_does_not(self):
        # This is the discriminator: the mean error is 0.0 rad, the RMS is 0.158 rad.
        err = submission.errors(TARGET, MEASURED)
        self.assertAlmostEqual(submission.mean_of(err), 0.0, delta=1e-12)
        self.assertGreater(submission.rmse(TARGET, MEASURED), 0.15)

    def test_a_length_mismatch_is_refused(self):
        # The plotting bug: an N+1 point time axis against an N point measurement.
        with self.assertRaises(ValueError):
            submission.errors([1.0, 2.0, 3.0], [1.0, 2.0])
        with self.assertRaises(ValueError):
            submission.rmse([1.0, 2.0, 3.0], [1.0, 2.0])

    def test_a_perfect_tracker_has_zero_rmse(self):
        self.assertAlmostEqual(submission.rmse([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]),
                               0.0, delta=1e-12)

    def test_the_rmse_of_two_errors(self):
        # Errors 3 and 4 rad give sqrt((9 + 16) / 2) = sqrt(12.5) rad, not 3.5 rad.
        self.assertAlmostEqual(submission.rmse([0.0, 0.0], [3.0, 4.0]), 3.5355339059327378,
                               delta=1e-12)

    def test_an_empty_trace_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rmse([], [])


class GitTests(unittest.TestCase):
    def test_the_skip_test_answer_is_git_diff(self):
        # The Skip test's question: which command shows the exact line-by-line changes? `git diff`.
        self.assertEqual(submission.git_command("which lines changed"), "git diff")

    def test_the_record_and_history_commands(self):
        self.assertEqual(submission.git_command("which files changed"), "git status")
        self.assertEqual(submission.git_command("record a snapshot"), 'git commit -am "msg"')
        self.assertEqual(submission.git_command("the history"), "git log --oneline")

    def test_an_unknown_task_is_refused(self):
        with self.assertRaises(ValueError):
            submission.git_command("undo everything")


if __name__ == "__main__":
    unittest.main()
