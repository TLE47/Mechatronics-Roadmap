"""Behaviour tests for 02-mechanics.T3.02a.

Each test names the mistake it catches:
  * a screw axis built as +omega x q instead of -omega x q, which puts a joint through
    (0.40, 0, 0.10) at the wrong end of its own line;
  * a "power" that keeps only v . f, so a pure rotation driving a pure moment reports zero;
  * a notch stiffness with t squared instead of t to the five halves - a factor of thirty on the
    module's own flexure;
  * a surface stress that forgets the notch concentration factor Kt = 1 + t/(2R);
  * a two-pass RNEA that treats the second link's acceleration as local, dropping ddq1.
"""

import math
import unittest

import harness

submission = harness.load_submission()

HALF_DEGREE = math.radians(0.50)
# The worked and Gate-test flexure: Ti-6Al-4V, 15 mm out-of-plane, 1 mm web, 5 mm cutout.
TI_E, TI_B, TI_T, TI_R = 114e9, 0.015, 0.001, 0.005
TI_YIELD_PA = 880e6
WORKED_K = 54.0940  # N*m/rad, the module's own printed value


class ScrewAxisTests(unittest.TestCase):
    def test_the_worked_axis(self):
        axis = submission.screw_axis([0.0, 0.0, 1.0], [0.30, 0.0, 0.0])
        for mine, expected in zip(axis, [0.0, 0.0, 1.0, 0.0, -0.30, 0.0]):
            self.assertAlmostEqual(mine, expected, delta=1e-12)

    def test_the_exercise_axis(self):
        # -omega x q = [0, -1, 0] x [0.40, 0, 0.10] = [-0.10, 0.0, 0.40].
        axis = submission.screw_axis([0.0, 1.0, 0.0], [0.40, 0.0, 0.10])
        for mine, expected in zip(axis, [0.0, 1.0, 0.0, -0.10, 0.0, 0.40]):
            self.assertAlmostEqual(mine, expected, delta=1e-9)

    def test_the_skip_test_x_component(self):
        # -[0,0,1] x [0.50, 0.20, 0] = [0.20, -0.50, 0].
        axis = submission.screw_axis([0.0, 0.0, 1.0], [0.50, 0.20, 0.0])
        self.assertAlmostEqual(axis[3], 0.20, delta=1e-9)
        self.assertAlmostEqual(axis[4], -0.50, delta=1e-9)

    def test_a_prismatic_joint_has_no_angular_part(self):
        # Gate Q1: the angular part's norm is exactly zero for a sliding joint.
        axis = submission.screw_axis([0.0, 0.0, 0.0], [0.0, 0.0, 0.0])
        angular_norm = math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2)
        self.assertAlmostEqual(angular_norm, 0.0, delta=1e-12)

    def test_a_non_unit_axis_is_refused(self):
        with self.assertRaises(ValueError):
            submission.screw_axis([0.0, 0.0, 2.0], [0.0, 0.0, 0.0])

    def test_a_short_vector_is_refused(self):
        with self.assertRaises(ValueError):
            submission.screw_axis([0.0, 0.0], [0.0, 0.0, 0.0])


class PowerTests(unittest.TestCase):
    def test_the_skip_test_power(self):
        # omega.m + v.f = 2*3 + 0.5*10 = 11 W.
        power = submission.spatial_power([0.0, 0.0, 2.0, 0.5, 0.0, 0.0],
                                         [0.0, 0.0, 3.0, 10.0, 0.0, 0.0])
        self.assertAlmostEqual(power, 11.0, delta=1e-9)

    def test_the_gate_test_power(self):
        # A 25 N load falling at 0.40 m/s delivers +10 W.
        power = submission.spatial_power([0.0, 0.0, 0.0, 0.0, 0.0, -0.40],
                                         [0.0, 0.0, 0.0, 0.0, 0.0, -25.0])
        self.assertAlmostEqual(power, 10.0, delta=1e-9)

    def test_pure_rotation_does_work(self):
        # A 2 N*m moment spinning at 1 rad/s is 2 W even though nothing translates - the trap that
        # catches a power written as v . f only.
        # A spatial wrench is [m, f], so a z-moment against a z-rotation is 2 W.
        power = submission.spatial_power([0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                                         [0.0, 0.0, 2.0, 3.0, 0.0, 0.0])
        self.assertAlmostEqual(power, 2.0, delta=1e-12)

    def test_driving_against_the_load_returns_negative_work(self):
        power = submission.spatial_power([0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
                                         [0.0, 0.0, -1.5, 0.0, 0.0, 0.0])
        self.assertAlmostEqual(power, -1.5, delta=1e-12)

    def test_the_power_is_the_same_read_either_way_round(self):
        twist = [0.0, 0.0, 1.0, 0.5, 0.0, 0.0]
        wrench = [0.0, 0.0, 0.0, 10.0, 0.0, 0.0]
        self.assertAlmostEqual(submission.spatial_power(twist, wrench),
                               submission.spatial_power(wrench, twist), delta=1e-12)
        # omega . m = 0 (a z moment against a z rotation); v . f = 0.5 * 10 = 5 W.
        self.assertAlmostEqual(submission.spatial_power(twist, wrench), 5.0, delta=1e-12)

    def test_a_five_component_vector_is_refused(self):
        with self.assertRaises(ValueError):
            submission.spatial_power([0.0, 0.0, 1.0, 0.0, 0.0],
                                     [0.0, 0.0, 1.0, 0.0, 0.0, 0.0])


class FlexureTests(unittest.TestCase):
    def test_the_worked_stiffness(self):
        stiffness = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        self.assertAlmostEqual(stiffness, WORKED_K, delta=1e-4)

    def test_doubling_the_web_scales_the_stiffness(self):
        # The exercise: 2^(5/2) = 4 sqrt 2 = 5.656854, not 4 and not 32.
        single = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        double = submission.flexure_stiffness(TI_E, TI_B, 2.0 * TI_T, TI_R)
        self.assertAlmostEqual(double / single, 5.656854249492381, delta=1e-9)

    def test_halving_the_web_softens_it(self):
        single = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        half = submission.flexure_stiffness(TI_E, TI_B, 0.5 * TI_T, TI_R)
        self.assertAlmostEqual(half / single, 0.17677669529663687, delta=1e-12)

    def test_the_worked_stress(self):
        # 6 * 1.1 * (54.094 * 0.008727) / (0.015 * 0.001^2) = 207.7 MPa.
        stiffness = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        sigma = submission.flexure_stress(stiffness, HALF_DEGREE, TI_B, TI_T, TI_R)
        self.assertAlmostEqual(sigma / 1e6, 207.706, delta=1e-3)

    def test_the_stroke_stays_under_thirty_percent_of_yield(self):
        # The module's fatigue rule: sigma_max < 30% of 880 MPa at the rated stroke.
        stiffness = submission.flexure_stiffness(TI_E, TI_B, TI_T, TI_R)
        sigma = submission.flexure_stress(stiffness, HALF_DEGREE, TI_B, TI_T, TI_R)
        self.assertLess(sigma, 0.30 * TI_YIELD_PA)

    def test_a_thicker_web_lowers_the_stress_at_the_same_moment(self):
        thin = submission.flexure_stress(WORKED_K, HALF_DEGREE, TI_B, TI_T, TI_R)
        thick = submission.flexure_stress(WORKED_K, HALF_DEGREE, TI_B, 2.0 * TI_T, TI_R)
        self.assertGreater(thin, thick)

    def test_a_web_as_thick_as_the_radius_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flexure_stiffness(TI_E, TI_B, TI_R, TI_R)

    def test_a_negative_modulus_is_refused(self):
        with self.assertRaises(ValueError):
            submission.flexure_stiffness(-TI_E, TI_B, TI_T, TI_R)


class ThicknessScaleTests(unittest.TestCase):
    def test_the_exercise_doubling_factor(self):
        self.assertAlmostEqual(submission.thickness_scale(2.0), 5.656854249492381, delta=1e-12)

    def test_halving_the_factor(self):
        self.assertAlmostEqual(submission.thickness_scale(0.5), 0.17677669529663687, delta=1e-12)

    def test_quadrupling_the_web(self):
        self.assertAlmostEqual(submission.thickness_scale(4.0), 32.0, delta=1e-12)

    def test_a_zero_factor_is_refused(self):
        with self.assertRaises(ValueError):
            submission.thickness_scale(0.0)


class RneaTests(unittest.TestCase):
    def test_the_worked_two_link_torques(self):
        # alpha = (2, 3): tau2 = 0.02*3 = 0.06, tau1 = 0.05*2 + 0.06 = 0.16 N*m.
        tau1, tau2 = submission.rnea_2link(0.05, 0.02, 2.0, 1.0)
        self.assertAlmostEqual(tau2, 0.06, delta=1e-12)
        self.assertAlmostEqual(tau1, 0.16, delta=1e-12)

    def test_the_gate_test_base_torque(self):
        # 0.08*1 + 0.03*(1+2) = 0.17 N*m.
        tau1, tau2 = submission.rnea_2link(0.08, 0.03, 1.0, 2.0)
        self.assertAlmostEqual(tau2, 0.09, delta=1e-12)
        self.assertAlmostEqual(tau1, 0.17, delta=1e-9)

    def test_the_second_link_is_carried_by_the_first(self):
        tau1, tau2 = submission.rnea_2link(0.05, 0.02, 2.0, 1.0)
        self.assertAlmostEqual(tau1 - tau2, 0.05 * 2.0, delta=1e-12)

    def test_a_still_elbow_still_accelerates(self):
        # ddq2 = 0 but the first link turns: the elbow link rides along at ddq1.
        tau1, tau2 = submission.rnea_2link(0.05, 0.02, 1.0, 0.0)
        self.assertAlmostEqual(tau2, 0.02, delta=1e-12)
        self.assertAlmostEqual(tau1, 0.07, delta=1e-12)

    def test_a_negative_inertia_is_refused(self):
        with self.assertRaises(ValueError):
            submission.rnea_2link(-0.05, 0.02, 1.0, 1.0)


class PassivityTests(unittest.TestCase):
    def test_a_christoffel_form_vanishes(self):
        # Mdot = [[0, 2], [-2, 0]] and C = Mdot/2 is the Christoffel choice: the form is zero.
        m_dot = [[0.0, 2.0], [-2.0, 0.0]]
        c = [[0.0, 1.0], [-1.0, 0.0]]
        self.assertAlmostEqual(submission.passivity_quadratic_form(m_dot, c, [1.5, -2.5]),
                               0.0, delta=1e-12)

    def test_a_wrong_c_is_not_passive(self):
        # Dropping C's symmetric partner leaves dq^T (Mdot - 2C) dq = 7.5, not 0.
        m_dot = [[0.0, 2.0], [-2.0, 0.0]]
        c = [[0.0, 1.0], [0.0, 0.0]]
        self.assertAlmostEqual(submission.passivity_quadratic_form(m_dot, c, [1.5, -2.5]),
                               7.5, delta=1e-12)

    def test_the_gate_test_form_is_zero_for_any_velocity(self):
        zero = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]
        self.assertAlmostEqual(
            submission.passivity_quadratic_form(zero, zero, [1.5, -2.5, 0.8]), 0.0, delta=1e-12)

    def test_a_shape_mismatch_is_refused(self):
        with self.assertRaises(ValueError):
            submission.passivity_quadratic_form([[0.0, 1.0]], [[0.0, 0.0]], [1.0, 2.0])


if __name__ == "__main__":
    unittest.main()
