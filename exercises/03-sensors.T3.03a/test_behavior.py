"""Behaviour tests for 03-sensors.T3.03a.

Each test names the mistake it catches:
  * a d-axis feedforward built from L_d * i_d instead of L_q * i_q, which leaves the cross-coupling
    in place and wastes torque;
  * a zero-sequence offset that centres on the mean instead of the extremes, so the "saddle wave"
    never reaches the rail (the exercise's -6.0 V becomes 0.0 V);
  * duties with the offset left out, which is plain sine PWM wearing a SVPWM name;
  * a hexagonal limit of V_bus / 2 - the sine-PWM number - which throws away the 15.47%;
  * an amplitude that adds the coefficients instead of squaring them.
"""

import math
import unittest

import harness

submission = harness.load_submission()

VD_BUS = 48.0
HEXAGON_48 = 48.0 / math.sqrt(3.0)  # 27.712812921102035 V


class FeedforwardTests(unittest.TestCase):
    def test_the_worked_d_axis_term(self):
        # -1500 * 120e-6 * 20.0 = -3.60 V, and i_d = 0 does not make this term vanish.
        self.assertAlmostEqual(
            submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)[0],
            -3.60, delta=1e-9,
        )

    def test_the_worked_q_axis_term(self):
        # 1500 * (120e-6 * 0 + 0.008) = 12.00 V, the back-EMF alone.
        self.assertAlmostEqual(
            submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)[1],
            12.0, delta=1e-9,
        )

    def test_the_skip_test_d_axis_term(self):
        # -2000 * 150e-6 * 15.0 = -4.50 V.
        self.assertAlmostEqual(
            submission.dq_feedforward(2000.0, 120e-6, 150e-6, 0.0, 15.0, 0.008)[0],
            -4.50, delta=1e-9,
        )

    def test_the_gate_test_q_axis_term(self):
        # 1800 * (100e-6 * 0 + 0.010) = 18.0 V.
        self.assertAlmostEqual(
            submission.dq_feedforward(1800.0, 100e-6, 100e-6, 0.0, 0.0, 0.010)[1],
            18.0, delta=1e-9,
        )

    def test_each_axis_uses_the_other_axis_inductance(self):
        # Salient machine: L_d = 100 uH, L_q = 150 uH, i_d = 5 A, i_q = 20 A.
        # v_d_ff = -1500 * 150e-6 * 20 = -4.50 V; v_q_ff = 1500 * (100e-6 * 5 + 0.008) = 12.75 V.
        vd_ff, vq_ff = submission.dq_feedforward(1500.0, 100e-6, 150e-6, 5.0, 20.0, 0.008)
        self.assertAlmostEqual(vd_ff, -4.50, delta=1e-9)
        self.assertAlmostEqual(vq_ff, 12.75, delta=1e-9)

    def test_reverse_speed_reverses_the_feedforward(self):
        forward = submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
        reverse = submission.dq_feedforward(-1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
        self.assertAlmostEqual(reverse[0], -forward[0], delta=1e-9)
        self.assertAlmostEqual(reverse[1], -forward[1], delta=1e-9)

    def test_a_negative_inductance_or_flux_is_refused(self):
        with self.assertRaises(ValueError):
            submission.dq_feedforward(1500.0, -120e-6, 120e-6, 0.0, 20.0, 0.008)
        with self.assertRaises(ValueError):
            submission.dq_feedforward(1500.0, 120e-6, -120e-6, 0.0, 20.0, 0.008)
        with self.assertRaises(ValueError):
            submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, -0.008)


class MinMaxTests(unittest.TestCase):
    def test_the_worked_offset(self):
        # (27.7128 - 13.8564) / 2 = 6.9282 V below the rails.
        self.assertAlmostEqual(
            submission.svpwm_offset(HEXAGON_48, -HEXAGON_48 / 2.0, -HEXAGON_48 / 2.0),
            -6.928203230275509, delta=1e-9,
        )

    def test_the_exercise_offset(self):
        # max = +24.0 V, min = -12.0 V: v_0 = -0.5 * 36.0 = -6.0 V.
        self.assertAlmostEqual(submission.svpwm_offset(24.0, -12.0, -12.0), -6.0, delta=1e-12)

    def test_the_skip_test_offset(self):
        # max = +18.0 V, min = -12.0 V: v_0 = -3.0 V.
        self.assertAlmostEqual(submission.svpwm_offset(18.0, -6.0, -12.0), -3.0, delta=1e-12)

    def test_the_exercise_duties(self):
        # (24 - 6) / 48 = 0.375 -> 0.875; (-12 - 6) / 48 = -0.375 -> 0.125 for both lower legs.
        duties = submission.svpwm_duties(24.0, -12.0, -12.0, VD_BUS)
        self.assertAlmostEqual(duties[0], 0.875, delta=1e-12)
        self.assertAlmostEqual(duties[1], 0.125, delta=1e-12)
        self.assertAlmostEqual(duties[2], 0.125, delta=1e-12)

    def test_the_worked_duty(self):
        # The inscribed-circle peak on a 48 V bus: d_a = 0.5 + 20.7846 / 48 = 0.9330.
        duties = submission.svpwm_duties(HEXAGON_48, -HEXAGON_48 / 2.0, -HEXAGON_48 / 2.0, VD_BUS)
        self.assertAlmostEqual(duties[0], 0.9330127018922193, delta=1e-12)
        self.assertAlmostEqual(duties[1], 0.0669872981077807, delta=1e-12)
        self.assertAlmostEqual(duties[2], duties[1], delta=1e-18)

    def test_the_gate_test_duty(self):
        # 24 V bus, v_a = +12.0 V and v_0 = -3.0 V: 0.5 + 9.0 / 24.0 = 0.875.
        duties = submission.svpwm_duties(12.0, -6.0, -6.0, 24.0)
        self.assertAlmostEqual(duties[0], 0.875, delta=1e-12)

    def test_the_line_to_line_voltage_survives_the_offset(self):
        for va, vb, vc in ((24.0, -12.0, -12.0), (18.0, -6.0, -12.0), (5.0, 1.0, -6.0)):
            da, db, dc = submission.svpwm_duties(va, vb, vc, VD_BUS)
            self.assertAlmostEqual(da - db, (va - vb) / VD_BUS, delta=1e-12)
            self.assertAlmostEqual(db - dc, (vb - vc) / VD_BUS, delta=1e-12)

    def test_the_hexagon_limit_fills_the_rail(self):
        # A = V_bus / sqrt(3) at 30 degrees is (24.0, 0.0, -24.0): d_a = 1.0, d_b = 0.5, d_c = 0.0.
        duties = submission.svpwm_duties(24.0, 0.0, -24.0, VD_BUS)
        self.assertAlmostEqual(duties[0], 1.0, delta=1e-12)
        self.assertAlmostEqual(duties[1], 0.5, delta=1e-12)
        self.assertAlmostEqual(duties[2], 0.0, delta=1e-12)

    def test_a_command_beyond_the_hexagon_is_refused(self):
        # (25, 0, -25) V is past the 24.0 V sine rail on a 48 V bus: 0.5 + 25/48 > 1.
        with self.assertRaises(ValueError):
            submission.svpwm_duties(25.0, 0.0, -25.0, VD_BUS)

    def test_a_dead_bus_or_a_non_finite_reference_is_refused(self):
        with self.assertRaises(ValueError):
            submission.svpwm_duties(24.0, -12.0, -12.0, 0.0)
        with self.assertRaises(ValueError):
            submission.svpwm_duties(24.0, -12.0, -12.0, -48.0)
        with self.assertRaises(ValueError):
            submission.svpwm_offset(float("nan"), -12.0, -12.0)


class LimitTests(unittest.TestCase):
    def test_the_skip_test_hexagon_limit(self):
        self.assertAlmostEqual(submission.hexagon_limit(48.0), 27.712812921102035, delta=1e-9)

    def test_the_gate_test_boost_percentage(self):
        # 100 * (2/sqrt(3) - 1) = 15.4700538%.
        gain = submission.hexagon_gain()
        self.assertAlmostEqual(gain, 1.1547005383792515, delta=1e-12)
        self.assertAlmostEqual(100.0 * (gain - 1.0), 15.470053837925155, delta=1e-9)

    def test_svpwm_beats_spwm_by_the_inscribed_circle(self):
        # The module's comparison: 27.7128 V of phase peak against sine PWM's 24.0 V.
        self.assertGreater(submission.hexagon_limit(VD_BUS), 0.5 * VD_BUS)
        self.assertAlmostEqual(submission.hexagon_limit(VD_BUS) / (0.5 * VD_BUS),
                               submission.hexagon_gain(), delta=1e-12)

    def test_a_dead_bus_is_refused(self):
        with self.assertRaises(ValueError):
            submission.hexagon_limit(0.0)


class HarmonicTests(unittest.TestCase):
    COUNT = 64

    def errors(self):
        angles = [2.0 * math.pi * k / self.COUNT for k in range(self.COUNT)]
        return [0.012 * math.cos(th) - 0.005 * math.sin(2.0 * th) for th in angles]

    def test_the_worked_first_harmonic(self):
        a1, b1 = submission.harmonic_coefficients(self.errors(), 1)
        self.assertAlmostEqual(a1, 0.012, delta=1e-12)
        self.assertAlmostEqual(b1, 0.0, delta=1e-12)

    def test_the_worked_second_harmonic(self):
        a2, b2 = submission.harmonic_coefficients(self.errors(), 2)
        self.assertAlmostEqual(a2, 0.0, delta=1e-12)
        self.assertAlmostEqual(b2, -0.005, delta=1e-12)

    def test_the_gate_test_amplitude(self):
        # sqrt(0.008^2 + 0.006^2) = 0.010 rad.
        self.assertAlmostEqual(submission.harmonic_amplitude(0.008, -0.006), 0.010, delta=1e-12)

    def test_the_amplitude_ignores_where_the_peak_sits(self):
        self.assertAlmostEqual(submission.harmonic_amplitude(0.0, -0.010), 0.010, delta=1e-12)
        self.assertAlmostEqual(submission.harmonic_amplitude(-0.010, 0.0), 0.010, delta=1e-12)

    def test_a_pure_second_harmonic_is_not_reported_as_first(self):
        angles = [2.0 * math.pi * k / self.COUNT for k in range(self.COUNT)]
        errors = [0.004 * math.sin(2.0 * th) for th in angles]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(a1, 0.0, delta=1e-12)
        self.assertAlmostEqual(b1, 0.0, delta=1e-12)
        self.assertAlmostEqual(submission.harmonic_coefficients(errors, 2)[1], 0.004, delta=1e-12)

    def test_a_short_or_zeroth_fit_is_refused(self):
        with self.assertRaises(ValueError):
            submission.harmonic_coefficients([], 1)
        with self.assertRaises(ValueError):
            submission.harmonic_coefficients([0.001, 0.002], 0)
        with self.assertRaises(ValueError):
            submission.harmonic_amplitude(float("nan"), 0.0)


if __name__ == "__main__":
    unittest.main()
