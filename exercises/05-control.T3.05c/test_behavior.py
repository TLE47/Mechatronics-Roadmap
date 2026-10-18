"""Behaviour tests for 05-control.T3.05c.

Each test names the mistake it catches:
  * a CBF filter that ignores the barrier and passes the nominal command through to the stop;
  * a barrier whose inequality is applied to the wrong side, so a command moving away from the
    stop is modified - and one moving towards it is not;
  * a filter that forgets the actuator ceiling and returns whatever the barrier allows;
  * a margin bound with alpha dropped, which claims the barrier holds the joint where it is.
"""

import math
import unittest

import harness

submission = harness.load_submission()


class CbfTests(unittest.TestCase):
    def test_the_worked_command(self):
        # h = 0.04 m, alpha = 5/s: u <= 0.20 m/s, so a 0.80 m/s request is cut to 0.20.
        self.assertAlmostEqual(
            submission.cbf_command(0.80, 0.04, 5.0), 0.20, delta=1e-9,
            msg="expected a 0.80 m/s request at a 0.04 m margin to be cut to 0.20 m/s, the "
                "barrier's own limit; 0.80 means the filter passed the nominal command through - "
                "check the min with alpha h",
        )

    def test_the_exercise_command(self):
        # h = 1.50 - 1.40 = 0.10 rad, alpha = 8/s: u <= 0.80 rad/s from a 1.20 rad/s request.
        self.assertAlmostEqual(
            submission.cbf_command(1.20, 0.10, 8.0, -2.0, 2.0), 0.80, delta=1e-9,
            msg="expected a 1.20 rad/s request at a 0.10 rad margin to be cut to 0.80, since "
                "8 x 0.10 = 0.80; 2.0 means the actuator ceiling was applied instead of the "
                "barrier - check which bound binds first",
        )

    def test_the_skip_test_command(self):
        # h = 0.05 rad, alpha = 6/s: u <= 0.30 rad/s, so 0.80 becomes 0.30.
        self.assertAlmostEqual(
            submission.cbf_command(0.80, 0.05, 6.0), 0.30, delta=1e-9,
            msg="expected a 0.05 rad margin at 6/s to allow only 0.30 rad/s; a larger value means "
                "the margin and the gain were added rather than multiplied - check alpha h",
        )

    def test_a_command_away_from_the_stop_passes_through(self):
        # The same barrier (u <= 0.30) leaves a -0.40 rad/s retreat completely alone.
        self.assertAlmostEqual(
            submission.cbf_command(-0.40, 0.05, 6.0), -0.40, delta=1e-9,
            msg="expected a retreat to pass through untouched, since the constraint only bounds "
                "motion toward the stop; a value near 0 means the inequality was applied to the "
                "wrong side and the filter blocks the way out",
        )

    def test_a_satisfied_constraint_is_not_modified(self):
        # h = 0.20 rad at 8/s allows 1.60 rad/s; a 0.50 rad/s request is returned untouched.
        self.assertAlmostEqual(
            submission.cbf_command(0.50, 0.20, 8.0), 0.50, delta=1e-15,
            msg="expected a command already inside the admissible set to be returned exactly, the "
                "minimally invasive property; a changed value means the filter clamps even when "
                "the barrier is satisfied - check the min",
        )

    def test_the_actuator_bound_still_applies(self):
        # A far wall (limit 8 rad/s) cannot lift the 2 rad/s ceiling.
        self.assertAlmostEqual(
            submission.cbf_command(3.0, 1.0, 8.0, -2.0, 2.0), 2.0, delta=1e-15,
            msg="expected a 3.0 rad/s request to be capped by the actuator's 2.0 rad/s ceiling "
                "when the wall is far away; 3.0 means the ceiling was dropped and the filter "
                "promises motion the joint cannot deliver",
        )
        self.assertAlmostEqual(
            submission.cbf_command(-3.0, 1.0, 8.0, -2.0, 2.0), -2.0, delta=1e-15,
            msg="expected the symmetric case to be capped at -2.0 rad/s; a value away from it "
                "means the ceiling is applied on one side only - check the lower bound",
        )

    def test_past_the_stop_the_filter_reverses(self):
        # h = -0.05 rad is already violated: the admissible set becomes u <= -0.40 rad/s, so a zero
        # request is pushed to a retreat at exactly the barrier boundary.
        self.assertAlmostEqual(
            submission.cbf_command(0.0, -0.05, 8.0, -2.0, 2.0), -0.40, delta=1e-12,
            msg="expected a zero request past the stop to be pushed to -0.40 rad/s, the only "
                "admissible retreat; 0.0 means a violated barrier is ignored and the joint keeps "
                "driving into the wall",
        )
        self.assertAlmostEqual(
            submission.cbf_command(1.0, -0.05, 8.0, -2.0, 2.0), -0.40, delta=1e-12,
            msg="expected a forward request past the stop to be reversed just as hard, since the "
                "admissible set holds no positive speed; a positive result means the violation "
                "was not seen - check the sign of alpha h",
        )

    def test_an_infeasible_barrier_is_refused(self):
        # h = -0.50 rad at 8/s needs u <= -4.0, which the +-2 rad/s actuator cannot deliver.
        with self.assertRaises(ValueError):
            submission.cbf_command(0.0, -0.50, 8.0, -2.0, 2.0)

    def test_bad_gains_and_bounds_are_refused(self):
        with self.assertRaises(ValueError):
            submission.cbf_command(0.1, 0.1, 0.0)
        with self.assertRaises(ValueError):
            submission.cbf_command(0.1, 0.1, 8.0, 2.0, 2.0)


class BarrierBoundTests(unittest.TestCase):
    def test_the_gate_test_margin(self):
        # h(0) = 0.20 m, alpha = 2/s, t = 0.50 s: 0.20 * exp(-1) = 0.073575...
        self.assertAlmostEqual(
            submission.barrier_lower_bound(0.20, 2.0, 0.50), 0.20 * math.exp(-1.0), delta=1e-12,
            msg="expected the guaranteed margin to decay to h0/e in half a second at alpha = 2; "
                "0.0736 alongside 0.2 means the time constant was inverted - check the exponent "
                "is -alpha t",
        )

    def test_today_is_the_initial_margin(self):
        self.assertAlmostEqual(
            submission.barrier_lower_bound(0.20, 2.0, 0.0), 0.20, delta=1e-15,
            msg="expected the margin at zero time to be the initial h0 exactly; a smaller value "
                "means the exponent was applied once before the clock started - check t = 0",
        )

    def test_the_margin_only_shrinks(self):
        early = submission.barrier_lower_bound(0.20, 2.0, 0.25)
        middle = submission.barrier_lower_bound(0.20, 2.0, 0.50)
        late = submission.barrier_lower_bound(0.20, 2.0, 1.00)
        self.assertGreater(
            early, middle,
            msg="expected the guaranteed margin to be larger at a quarter second than at half a "
                "second; equality or an inversion means the exponent has the wrong sign",
        )
        self.assertGreater(
            middle, late,
            msg="expected the margin to keep shrinking through the second half of the second, "
                "the monotone guarantee the whole method rests on; an increase means the time "
                "term was misapplied",
        )
        self.assertGreater(
            late, 0.0,
            msg="expected the bound to stay strictly positive at one second, since the "
                "exponential never reaches zero; a zero or negative value means the margin was "
                "computed by subtraction instead",
        )

    def test_bad_margins_gains_and_times_are_refused(self):
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(-0.01, 2.0, 0.5)
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(0.20, 0.0, 0.5)
        with self.assertRaises(ValueError):
            submission.barrier_lower_bound(0.20, 2.0, -0.5)


if __name__ == "__main__":
    unittest.main()
