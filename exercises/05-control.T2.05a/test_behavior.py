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
        self.assertAlmostEqual(abs(loop_worked(gc)), 1.0, delta=1e-9)
        self.assertAlmostEqual(submission.phase_margin_deg(loop_worked(gc)), 51.8273, delta=1e-3)

    def test_a_loop_past_180_has_a_negative_margin(self):
        lagging = cmath.rect(0.9, math.radians(-200.0))
        self.assertAlmostEqual(submission.phase_margin_deg(lagging), -20.0, delta=1e-9)
        worse = cmath.rect(0.9, math.radians(-250.0))
        self.assertAlmostEqual(submission.phase_margin_deg(worse), -70.0, delta=1e-9)

    def test_the_critical_point_has_zero_margin(self):
        self.assertAlmostEqual(submission.phase_margin_deg(complex(-1.0, 0.0)), 0.0, delta=1e-12)

    def test_a_loop_at_minus_165_degrees(self):
        self.assertAlmostEqual(
            submission.phase_margin_deg(cmath.rect(1.0, math.radians(-165.0))), 15.0, delta=1e-9
        )


class DelayTests(unittest.TestCase):
    def test_the_module_delay(self):
        self.assertAlmostEqual(submission.phase_loss_deg(78.61514, 0.005), 22.5216, delta=1e-2)

    def test_one_radian_per_second(self):
        self.assertAlmostEqual(submission.phase_loss_deg(100.0, 0.01), 57.2957795, delta=1e-6)
        self.assertEqual(submission.phase_loss_deg(1234.0, 0.0), 0.0)

    def test_loss_is_linear_in_both_arguments(self):
        self.assertAlmostEqual(submission.phase_loss_deg(200.0, 0.02),
                               2.0 * submission.phase_loss_deg(200.0, 0.01), delta=1e-12)


class SensitivityTests(unittest.TestCase):
    def test_s_plus_t_is_one(self):
        for loop in (complex(0.2, 0.1), complex(-0.6, 0.3), complex(4.0, -3.0), complex(0.0, 1.0)):
            s, t = submission.st(loop)
            self.assertAlmostEqual((s + t).real, 1.0, delta=1e-12)
            self.assertAlmostEqual((s + t).imag, 0.0, delta=1e-12)

    def test_sensitivity_at_crossover(self):
        gc = 78.61513777574233
        s, t = submission.st(loop_worked(gc))
        # At |L| = 1 both have the same magnitude, and it is the peak: 1/|1 + L| = 1.144.
        self.assertAlmostEqual(abs(s), 1.1441, delta=1e-3)
        self.assertAlmostEqual(abs(t), abs(s), delta=1e-12)

    def test_high_gain_suppresses_sensitivity(self):
        s, _ = submission.st(complex(1000.0, 0.0))
        self.assertAlmostEqual(abs(s), 1.0 / 1001.0, delta=1e-12)

    def test_pure_imaginary_loop_is_a_tie(self):
        s, t = submission.st(complex(0.0, 1.0))
        self.assertAlmostEqual(abs(s), abs(t), delta=1e-12)


class CrossoverTests(unittest.TestCase):
    def test_worked_crossover(self):
        self.assertAlmostEqual(submission.gain_crossover(loop_worked), 78.6151, delta=1e-3)

    def test_a_loop_that_never_crosses_is_refused(self):
        with self.assertRaises(ValueError):
            submission.gain_crossover(lambda w: complex(10.0, 0.0))
        with self.assertRaises(ValueError):
            submission.gain_crossover(lambda w: 1.0 / (1j * w + 1.0))

    def test_the_answer_really_is_unity_gain(self):
        w = submission.gain_crossover(loop_worked)
        self.assertAlmostEqual(abs(loop_worked(w)), 1.0, delta=1e-9)


class BrysonTests(unittest.TestCase):
    def test_module_weights(self):
        q, r = submission.bryson_weights([0.05, 0.10], 5.0)
        self.assertAlmostEqual(q[0], 400.0, delta=1e-9)
        self.assertAlmostEqual(q[1], 100.0, delta=1e-9)
        self.assertAlmostEqual(r, 0.04, delta=1e-12)

    def test_other_scales(self):
        q, r = submission.bryson_weights([1.0, 2.0], 4.0)
        self.assertEqual(q, [1.0, 0.25])
        self.assertAlmostEqual(r, 0.0625, delta=1e-12)


class ObserverTests(unittest.TestCase):
    AD = [[1.0, 0.001], [0.0, 0.99]]
    C = [1.0, 0.0]

    def test_module_error_matrix(self):
        radius = submission.observer_spectral_radius(self.AD, self.C, [0.19, 9.0])
        self.assertAlmostEqual(radius, math.sqrt(0.8109), delta=1e-3)
        self.assertLess(radius, 0.91)

    def test_no_correction_leaves_the_plant_poles(self):
        self.assertAlmostEqual(submission.observer_spectral_radius(self.AD, self.C, [0.0, 0.0]),
                               1.0, delta=1e-12)

    def test_more_gain_converges_faster(self):
        small = submission.observer_spectral_radius(self.AD, self.C, [0.1, 5.0])
        large = submission.observer_spectral_radius(self.AD, self.C, [0.5, 20.0])
        self.assertLess(large, small)


class LqrTests(unittest.TestCase):
    AD = [[1.0, 0.001], [0.0, 0.99]]
    BD = [[0.0], [0.001]]

    def test_the_gain_stabilises_the_model(self):
        k = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 1.0)
        self.assertLess(spectral_radius(self.AD, self.BD, k), 1.0)

    def test_a_heavier_state_cost_asks_for_more_gain(self):
        cheap = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 1.0)
        dear = submission.lqr_gain(self.AD, self.BD, [100.0, 100.0], 1.0)
        self.assertGreater(abs(dear[0]), abs(cheap[0]))

    def test_a_heavier_input_cost_asks_for_less(self):
        light = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 0.01)
        heavy = submission.lqr_gain(self.AD, self.BD, [1.0, 1.0], 100.0)
        self.assertGreater(abs(light[0]), abs(heavy[0]))

    def test_an_already_stable_cost_free_system_gets_near_zero_gain(self):
        # With Q -> 0 the optimal gain goes to zero: the plant is already stable.
        k = submission.lqr_gain(self.AD, self.BD, [1e-9, 1e-9], 1.0)
        self.assertLess(abs(k[0]), 1e-3)


if __name__ == "__main__":
    unittest.main()
