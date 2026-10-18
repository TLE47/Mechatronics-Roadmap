"""Behaviour tests for 05-control.T2.05a.

Each test names the mistake it catches:
  * a phase margin taken from `cmath.phase` without unwrapping, which reports 340 degrees of safety
    for a loop that already lagged 200;
  * a phase margin without the 180 degree complement, which reports the phase itself;
  * `T = 1/S` instead of `L/(1+L)`, so the waterbed identity quietly stops holding;
  * a gain crossover found by scanning a grid and returning the closest sample, or one that
    returns an answer for a bracket with no crossing;
  * Bryson weights that forget to square, so metres and newtons never cancel;
  * an observer radius read off the plant's A instead of `Ad - L C`;
  * an LQR gain taken from one Riccati step, which can leave the loop unstable.
"""

import cmath
import math
import unittest

import harness

submission = harness.load_submission()


def loop_worked(omega):
    """L(s) = 100 / (s (0.01 s + 1)) at s = j omega."""
    s = 1j * omega
    return 100.0 / (s * (0.01 * s + 1.0))


def spectral_radius(ad, bd, k):
    m = [[ad[i][j] - bd[i][0] * k[j] for j in range(2)] for i in range(2)]
    tr = m[0][0] + m[1][1]
    det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return max(abs(0.5 * (tr + disc)), abs(0.5 * (tr - disc)))


class PhaseMarginTests(unittest.TestCase):
    def test_worked_example(self):
        gc = 78.61513777574233
        self.assertAlmostEqual(
            abs(loop_worked(gc)), 1.0, delta=1e-9,
            msg="expected |L| = 1 at the gain crossover 78.615 rad/s; another magnitude likely evaluated the loop at the wrong omega - check gc is the crossing you found",
        )
        self.assertAlmostEqual(
            submission.phase_margin_deg(loop_worked(gc)), 51.8273, delta=1e-3,
            msg="expected 51.827 deg of margin from a -128.17 deg phase; a near-308 deg answer likely skipped the 180 deg complement - check the phase_margin formula",
        )

    def test_a_loop_past_180_has_a_negative_margin(self):
        lagging = cmath.rect(0.9, math.radians(-200.0))
        self.assertAlmostEqual(
            submission.phase_margin_deg(lagging), -20.0, delta=1e-9,
            msg="expected -20 deg for a loop already at -200 deg; a positive value likely took abs() or unwrapped the phase - check the margin is signed by 180 - phi",
        )
        worse = cmath.rect(0.9, math.radians(-250.0))
        self.assertAlmostEqual(
            submission.phase_margin_deg(worse), -70.0, delta=1e-9,
            msg="expected -70 deg for a loop at -250 deg; a 110 deg answer likely wrapped to +180 - check the angle is unwrapped into (-180, 180] first",
        )

    def test_the_critical_point_has_zero_margin(self):
        self.assertAlmostEqual(
            submission.phase_margin_deg(complex(-1.0, 0.0)), 0.0, delta=1e-12,
            msg="expected zero margin at the critical point -1 + 0j; a nonzero answer likely used atan2 without handling the -180 deg branch - check phase_margin(-1) returns 0",
        )

    def test_a_loop_at_minus_165_degrees(self):
        self.assertAlmostEqual(
            submission.phase_margin_deg(cmath.rect(1.0, math.radians(-165.0))), 15.0, delta=1e-9,
            msg="expected 15 deg for a unit loop at -165 deg; a 165 deg answer likely read the phase instead of 180 minus it - check the complement is taken",
        )


class DelayTests(unittest.TestCase):
    def test_the_module_delay(self):
        self.assertAlmostEqual(
            submission.phase_loss_deg(78.61514, 0.005), 22.5216, delta=1e-2,
            msg="expected 22.5216 deg of delay loss at 78.615 rad/s over 5 ms; a near-1.96 deg answer likely forgot the 180/pi - check the radians-to-degrees conversion",
        )

    def test_one_radian_per_second(self):
        self.assertAlmostEqual(
            submission.phase_loss_deg(100.0, 0.01), 57.2957795, delta=1e-6,
            msg="expected one radian of loss (57.2958 deg) for 100 rad/s over 10 ms; a 1.0 answer likely returned radians - check the conversion after omega * tau",
        )
        self.assertEqual(
            submission.phase_loss_deg(1234.0, 0.0), 0.0,
            msg="expected zero loss for a zero delay; a nonzero answer likely substituted the sample period - check tau is the delay, not dt",
        )

    def test_loss_is_linear_in_both_arguments(self):
        self.assertAlmostEqual(
            submission.phase_loss_deg(200.0, 0.02),
            2.0 * submission.phase_loss_deg(200.0, 0.01), delta=1e-12,
            msg="expected doubling the delay to double the phase loss at fixed omega; a nonlinear result likely applied exp or atan to tau - check the loss is omega * tau in radians",
        )


class SensitivityTests(unittest.TestCase):
    def test_s_plus_t_is_one(self):
        for loop in (complex(0.2, 0.1), complex(-0.6, 0.3), complex(4.0, -3.0), complex(0.0, 1.0)):
            s, t = submission.st(loop)
            self.assertAlmostEqual(
                (s + t).real, 1.0, delta=1e-12,
                msg="expected Re(S + T) = 1 for every loop in this list; another value likely used T = 1/S - check T is L/(1+L) and S is 1/(1+L)",
            )
            self.assertAlmostEqual(
                (s + t).imag, 0.0, delta=1e-12,
                msg="expected Im(S + T) = 0 for every loop in this list; a nonzero imaginary part likely conjugated one term - check both are formed from the same L",
            )

    def test_sensitivity_at_crossover(self):
        gc = 78.61513777574233
        s, t = submission.st(loop_worked(gc))
        # At |L| = 1 both have the same magnitude, and it is the peak: 1/|1 + L| = 1.144.
        self.assertAlmostEqual(
            abs(s), 1.1441, delta=1e-3,
            msg="expected |S| = 1.1441 at crossover for this loop; a value near 0.87 likely inverted the magnitude - check S = 1/(1+L) at |L| = 1",
        )
        self.assertAlmostEqual(
            abs(t), abs(s), delta=1e-12,
            msg="expected |T| = |S| at crossover because |L| = 1 there; unequal magnitudes likely computed T as L/(1+L) with a stale L - check both use the same loop value",
        )

    def test_high_gain_suppresses_sensitivity(self):
        s, _ = submission.st(complex(1000.0, 0.0))
        self.assertAlmostEqual(
            abs(s), 1.0 / 1001.0, delta=1e-12,
            msg="expected |S| = 1/1001 for a loop of 1000; a value near 1.0 likely returned T instead - check the high-gain branch suppresses sensitivity",
        )

    def test_pure_imaginary_loop_is_a_tie(self):
        s, t = submission.st(complex(0.0, 1.0))
        self.assertAlmostEqual(
            abs(s), abs(t), delta=1e-12,
            msg="expected |S| = |T| for a purely imaginary loop of j1, where |1+L| = sqrt(2); unequal values likely dropped the real part of 1+L - check the denominator",
        )


class CrossoverTests(unittest.TestCase):
    def test_worked_crossover(self):
        self.assertAlmostEqual(
            submission.gain_crossover(loop_worked), 78.6151, delta=1e-3,
            msg="expected the crossover at 78.6151 rad/s for L = 100/(s(0.01s+1)); a nearby grid point likely means the bisection stopped early - check the bracket is refined",
        )

    def test_a_loop_that_never_crosses_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gain_crossover(lambda w: complex(10.0, 0.0))
        with self.assertRaises(ValueError):
            submission.gain_crossover(lambda w: 1.0 / (1j * w + 1.0))

    def test_the_answer_really_is_unity_gain(self):
        w = submission.gain_crossover(loop_worked)
        self.assertAlmostEqual(
            abs(loop_worked(w)), 1.0, delta=1e-9,
            msg="expected |L| = 1 at the returned crossover; a value near 0.99 likely returned the last grid sample - check the search converges on the root",
        )


class BrysonTests(unittest.TestCase):
    def test_module_weights(self):
        q, r = submission.bryson_weights([0.05, 0.10], 5.0)
        self.assertAlmostEqual(
            q[0], 400.0, delta=1e-9,
            msg="expected Q[0] = 1/0.05^2 = 400 for a 0.05 rad tolerance; a 20 answer likely forgot to square - check Bryson weights are 1/max^2",
        )
        self.assertAlmostEqual(
            q[1], 100.0, delta=1e-9,
            msg="expected Q[1] = 1/0.10^2 = 100 for a 0.10 rad/s tolerance; a 10 answer likely inverted without squaring - check both weights use the same rule",
        )
        self.assertAlmostEqual(
            r, 0.04, delta=1e-12,
            msg="expected R = 1/5.0^2 = 0.04 for a 5 N m limit; a 0.2 answer likely used 1/max - check the input weight is also squared",
        )

    def test_other_scales(self):
        q, r = submission.bryson_weights([1.0, 2.0], 4.0)
        self.assertEqual(
            q, [1.0, 0.25],
            msg="expected Q = [1.0, 0.25] for tolerances 1.0 and 2.0; a [1.0, 0.5] answer likely used 1/max instead of 1/max^2 - check the squaring",
        )
        self.assertAlmostEqual(
            r, 0.0625, delta=1e-12,
            msg="expected R = 1/4.0^2 = 0.0625; a 0.25 answer likely skipped the square - check the same weighting rule is applied to the input",
        )


class ObserverTests(unittest.TestCase):
    AD = [[1.0, 0.001], [0.0, 0.99]]
    C = [1.0, 0.0]

    def test_module_error_matrix(self):
        radius = submission.observer_spectral_radius(self.AD, self.C, [0.19, 9.0])
        self.assertAlmostEqual(
            radius, math.sqrt(0.8109), delta=1e-3,
            msg="expected the observer radius sqrt(0.8109) for L = [0.19, 9.0]; a near-1.0 answer likely read the plant's A instead of Ad - L C - check the error matrix",
        )
        self.assertLess(
            radius, 0.91,
            msg="expected the placed poles to pull the radius below 0.91; a larger radius likely used A - L C with a transposed L - check the gain multiplies the output row",
        )

    def test_no_correction_leaves_the_plant_poles(self):
        self.assertAlmostEqual(
            submission.observer_spectral_radius(self.AD, self.C, [0.0, 0.0]),
            1.0, delta=1e-12,
            msg="expected radius 1.0 with zero correction, since the error then follows the plant; a smaller value likely applied a default gain - check L = 0 leaves Ad alone",
        )

    def test_more_gain_converges_faster(self):
        small = submission.observer_spectral_radius(self.AD, self.C, [0.1, 5.0])
        large = submission.observer_spectral_radius(self.AD, self.C, [0.5, 20.0])
        self.assertLess(
            large, small,
            msg="expected the larger observer gain to converge faster, so a smaller radius; a larger radius likely mixed up the L vector order - check the gain is [l1, l2] for [q, qd]",
        )


class LqrTests(unittest.TestCase):
    AD = [[1.0, 0.001], [0.0, 0.99]]
    BD = [[0.0], [0.001]]

    def test_the_gain_stabilises_the_model(self):
        k = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 1.0)
        self.assertLess(
            spectral_radius(self.AD, self.BD, k), 1.0,
            msg="expected the LQR gain to place the closed-loop radius below 1; a radius above 1 likely came from one Riccati step - check the iteration converges before returning K",
        )

    def test_a_heavier_state_cost_asks_for_more_gain(self):
        cheap = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 1.0)
        dear = submission.lqr_gain(self.AD, self.BD, [100.0, 100.0], 1.0)
        self.assertGreater(
            abs(dear[0]), abs(cheap[0]),
            msg="expected the heavier state cost to ask for more gain; an unchanged or smaller K likely ignored Q - check Q scales the Riccati solution",
        )

    def test_a_heavier_input_cost_asks_for_less(self):
        light = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 0.01)
        heavy = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 100.0)
        self.assertGreater(
            abs(light[0]), abs(heavy[0]),
            msg="expected the heavier input cost to ask for less gain; a larger gain under R = 100 likely divided by sqrt(R) only - check R enters as 1/R",
        )

    def test_an_already_stable_cost_free_system_gets_near_zero_gain(self):
        # With Q -> 0 the optimal gain goes to zero: the plant is already stable.
        k = submission.lqr_gain(self.AD, self.BD, [1e-9, 1e-9], 1.0)
        self.assertLess(
            abs(k[0]), 1e-3,
            msg="expected a near-zero gain as Q goes to zero on an already-stable plant; a larger gain likely solved a different Riccati equation - check Q is the state weight",
        )


if __name__ == "__main__":
    unittest.main()
