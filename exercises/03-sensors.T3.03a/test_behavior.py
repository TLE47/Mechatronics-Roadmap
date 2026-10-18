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
            msg="expected -3.60 V from -omega*L_q*i_q with i_d = 0; a 0.0 V result likely multiplied by i_d instead - check the d axis is fed L_q*i_q",
        )

    def test_the_worked_q_axis_term(self):
        # 1500 * (120e-6 * 0 + 0.008) = 12.00 V, the back-EMF alone.
        self.assertAlmostEqual(
            submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)[1],
            12.0, delta=1e-9,
            msg="expected 12.00 V from omega*(L_d*i_d + flux) with i_d = 0; a value near 0 likely dropped the flux term - check the back-EMF is added",
        )

    def test_the_skip_test_d_axis_term(self):
        # -2000 * 150e-6 * 15.0 = -4.50 V.
        self.assertAlmostEqual(
            submission.dq_feedforward(2000.0, 120e-6, 150e-6, 0.0, 15.0, 0.008)[0],
            -4.50, delta=1e-9,
            msg="expected -4.50 V from -2000*150e-6*15; a result built on 120e-6 likely kept the default L_q - check which inductance the d axis receives",
        )

    def test_the_gate_test_q_axis_term(self):
        # 1800 * (100e-6 * 0 + 0.010) = 18.0 V.
        self.assertAlmostEqual(
            submission.dq_feedforward(1800.0, 100e-6, 100e-6, 0.0, 0.0, 0.010)[1],
            18.0, delta=1e-9,
            msg="expected 18.0 V from 1800*(0 + 0.010); a 14.4 V result likely reused the 0.008 flux from another case - check the flux argument",
        )

    def test_each_axis_uses_the_other_axis_inductance(self):
        # Salient machine: L_d = 100 uH, L_q = 150 uH, i_d = 5 A, i_q = 20 A.
        # v_d_ff = -1500 * 150e-6 * 20 = -4.50 V; v_q_ff = 1500 * (100e-6 * 5 + 0.008) = 12.75 V.
        vd_ff, vq_ff = submission.dq_feedforward(1500.0, 100e-6, 150e-6, 5.0, 20.0, 0.008)
        self.assertAlmostEqual(
            vd_ff, -4.50, delta=1e-9,
            msg="expected -4.50 V on the d axis from L_q = 150e-6; a -3.0 V result likely used L_d = 100e-6 - check the axes are crossed",
        )
        self.assertAlmostEqual(
            vq_ff, 12.75, delta=1e-9,
            msg="expected 12.75 V from 1500*(100e-6*5 + 0.008); a 12.0 V result likely dropped the L_d*i_d saliency term - check i_d is multiplied in",
        )

    def test_reverse_speed_reverses_the_feedforward(self):
        forward = submission.dq_feedforward(1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
        reverse = submission.dq_feedforward(-1500.0, 120e-6, 120e-6, 0.0, 20.0, 0.008)
        self.assertAlmostEqual(
            reverse[0], -forward[0], delta=1e-9,
            msg="expected the d-axis term to flip sign with speed; an unchanged result likely used abs(omega) - check the sign reaches every product",
        )
        self.assertAlmostEqual(
            reverse[1], -forward[1], delta=1e-9,
            msg="expected the q-axis term to flip sign with speed; an unchanged 12.0 V likely lost the speed sign - check omega multiplies the whole bracket",
        )

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
            msg="expected -6.9282 V from -(max + min)/2 on the inscribed-circle peak; a 0.0 V result likely centred on the mean - check both extremes are used",
        )

    def test_the_exercise_offset(self):
        # max = +24.0 V, min = -12.0 V: v_0 = -0.5 * 36.0 = -6.0 V.
        self.assertAlmostEqual(
            submission.svpwm_offset(24.0, -12.0, -12.0), -6.0, delta=1e-12,
            msg="expected -6.0 V from -0.5*(24.0 + -12.0); a +6.0 V result likely flipped the sign - check the offset is minus half the sum",
        )

    def test_the_skip_test_offset(self):
        # max = +18.0 V, min = -12.0 V: v_0 = -3.0 V.
        self.assertAlmostEqual(
            submission.svpwm_offset(18.0, -6.0, -12.0), -3.0, delta=1e-12,
            msg="expected -3.0 V from -0.5*(18.0 + -12.0); a -6.0 V result likely reused the exercise's numbers - check which phases this case passes",
        )

    def test_the_exercise_duties(self):
        # (24 - 6) / 48 = 0.375 -> 0.875; (-12 - 6) / 48 = -0.375 -> 0.125 for both lower legs.
        duties = submission.svpwm_duties(24.0, -12.0, -12.0, VD_BUS)
        self.assertAlmostEqual(
            duties[0], 0.875, delta=1e-12,
            msg="expected 0.875 from 0.5 + (24.0 - 6.0)/48; a 0.5 result likely left the zero-sequence offset out - check it is added before the duty",
        )
        self.assertAlmostEqual(
            duties[1], 0.125, delta=1e-12,
            msg="expected 0.125 for a lower leg at -12.0 V; a 0.375 result likely added v_0 instead of subtracting it - check the offset sign",
        )
        self.assertAlmostEqual(
            duties[2], 0.125, delta=1e-12,
            msg="expected the second lower leg to match the first at 0.125; a different value likely applied a per-phase offset - check one v_0 for all three",
        )

    def test_the_worked_duty(self):
        # The inscribed-circle peak on a 48 V bus: d_a = 0.5 + 20.7846 / 48 = 0.9330.
        duties = submission.svpwm_duties(HEXAGON_48, -HEXAGON_48 / 2.0, -HEXAGON_48 / 2.0, VD_BUS)
        self.assertAlmostEqual(
            duties[0], 0.9330127018922193, delta=1e-12,
            msg="expected 0.9330 at the inscribed-circle peak on 48 V; a 1.0 duty likely used the hexagon peak instead - check which amplitude is divided by the bus",
        )
        self.assertAlmostEqual(
            duties[1], 0.0669872981077807, delta=1e-12,
            msg="expected 0.0670 on the first lower leg; a 0.125 result likely came from the exercise's 24/-12 case - check the voltages passed here",
        )
        self.assertAlmostEqual(
            duties[2], duties[1], delta=1e-18,
            msg="expected the two lower legs to match by symmetry; a mismatch likely applied the offset to only one phase - check it is shared",
        )

    def test_the_gate_test_duty(self):
        # 24 V bus, v_a = +12.0 V and v_0 = -3.0 V: 0.5 + 9.0 / 24.0 = 0.875.
        duties = submission.svpwm_duties(12.0, -6.0, -6.0, 24.0)
        self.assertAlmostEqual(
            duties[0], 0.875, delta=1e-12,
            msg="expected 0.875 on a 24 V bus from 0.5 + 9.0/24; a 0.5 result likely divided by the 48 V bus - check the bus argument is used",
        )

    def test_the_line_to_line_voltage_survives_the_offset(self):
        for va, vb, vc in ((24.0, -12.0, -12.0), (18.0, -6.0, -12.0), (5.0, 1.0, -6.0)):
            da, db, dc = submission.svpwm_duties(va, vb, vc, VD_BUS)
            self.assertAlmostEqual(
                da - db, (va - vb) / VD_BUS, delta=1e-12,
                msg="expected the a-b difference to survive the offset unchanged; a shifted value likely added v_0 to one phase only - check all three phases use it",
            )
            self.assertAlmostEqual(
                db - dc, (vb - vc) / VD_BUS, delta=1e-12,
                msg="expected the b-c difference to survive the offset unchanged; a shifted value likely scaled the samples before differencing - check the division order",
            )

    def test_the_hexagon_limit_fills_the_rail(self):
        # A = V_bus / sqrt(3) at 30 degrees is (24.0, 0.0, -24.0): d_a = 1.0, d_b = 0.5, d_c = 0.0.
        duties = submission.svpwm_duties(24.0, 0.0, -24.0, VD_BUS)
        self.assertAlmostEqual(
            duties[0], 1.0, delta=1e-12,
            msg="expected duty 1.0 at the 30-degree hexagon corner; a 0.933 result likely used the inscribed-circle peak - check the limit is V_bus/sqrt(3)",
        )
        self.assertAlmostEqual(
            duties[1], 0.5, delta=1e-12,
            msg="expected the middle phase to sit at 0.5 on this corner; a 1.0 or 0.0 result likely assigned phases in the wrong order - check the reference angles",
        )
        self.assertAlmostEqual(
            duties[2], 0.0, delta=1e-12,
            msg="expected the lower phase to reach duty 0.0; a negative duty likely slipped through unclamped - check the offset keeps it inside the rails",
        )

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
        self.assertAlmostEqual(
            submission.hexagon_limit(48.0), 27.712812921102035, delta=1e-9,
            msg="expected 27.7128 V from 48/sqrt(3); a 24.0 V result likely used V_bus/2 - check the divisor is the square root of three",
        )

    def test_the_gate_test_boost_percentage(self):
        # 100 * (2/sqrt(3) - 1) = 15.4700538%.
        gain = submission.hexagon_gain()
        self.assertAlmostEqual(
            gain, 1.1547005383792515, delta=1e-12,
            msg="expected 1.1547 from 2/sqrt(3); a 1.0 result likely returned the sine-PWM ratio - check the numerator is doubled",
        )
        self.assertAlmostEqual(
            100.0 * (gain - 1.0), 15.470053837925155, delta=1e-9,
            msg="expected 15.47% boost from 100*(gain - 1); an 0.1547 result likely forgot to scale to percent - check the multiply by 100",
        )

    def test_svpwm_beats_spwm_by_the_inscribed_circle(self):
        # The module's comparison: 27.7128 V of phase peak against sine PWM's 24.0 V.
        self.assertGreater(
            submission.hexagon_limit(VD_BUS), 0.5 * VD_BUS,
            msg="expected the hexagon limit to exceed the sine rail of 24.0 V; a failure likely computed V_bus/2 - check the sqrt(3) divisor",
        )
        self.assertAlmostEqual(
            submission.hexagon_limit(VD_BUS) / (0.5 * VD_BUS),
            submission.hexagon_gain(), delta=1e-12,
            msg="expected the measured ratio to equal hexagon_gain exactly; a mismatch likely computed the two from different limits - check both use the same helper",
        )

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
        self.assertAlmostEqual(
            a1, 0.012, delta=1e-12,
            msg="expected a1 = 0.012 from the cosine term; a 0.0 result likely projected onto the sine basis - check which coefficient takes cos",
        )
        self.assertAlmostEqual(
            b1, 0.0, delta=1e-12,
            msg="expected b1 = 0.0 because the trace has no first-harmonic sine; a 0.005 result likely reported the second harmonic - check the order argument",
        )

    def test_the_worked_second_harmonic(self):
        a2, b2 = submission.harmonic_coefficients(self.errors(), 2)
        self.assertAlmostEqual(
            a2, 0.0, delta=1e-12,
            msg="expected a2 = 0.0 because the second harmonic is pure sine; a 0.012 result likely reused order 1 - check the order reaches the projection",
        )
        self.assertAlmostEqual(
            b2, -0.005, delta=1e-12,
            msg="expected b2 = -0.005 from -0.005*sin(2th); a +0.005 result likely flipped the sine sign - check the basis matches sin(+theta)",
        )

    def test_the_gate_test_amplitude(self):
        # sqrt(0.008^2 + 0.006^2) = 0.010 rad.
        self.assertAlmostEqual(
            submission.harmonic_amplitude(0.008, -0.006), 0.010, delta=1e-12,
            msg="expected 0.010 rad from sqrt(0.008^2 + 0.006^2); a 0.014 result likely added the coefficients - check they are squared first",
        )

    def test_the_amplitude_ignores_where_the_peak_sits(self):
        self.assertAlmostEqual(
            submission.harmonic_amplitude(0.0, -0.010), 0.010, delta=1e-12,
            msg="expected 0.010 rad when only the sine coefficient is non-zero; a 0.0 result likely read a alone - check both coefficients feed the square root",
        )
        self.assertAlmostEqual(
            submission.harmonic_amplitude(-0.010, 0.0), 0.010, delta=1e-12,
            msg="expected 0.010 rad for a purely negative cosine term; a -0.010 result likely skipped the square root - check the sign is dropped by squaring",
        )

    def test_a_pure_second_harmonic_is_not_reported_as_first(self):
        angles = [2.0 * math.pi * k / self.COUNT for k in range(self.COUNT)]
        errors = [0.004 * math.sin(2.0 * th) for th in angles]
        a1, b1 = submission.harmonic_coefficients(errors, 1)
        self.assertAlmostEqual(
            a1, 0.0, delta=1e-12,
            msg="expected no first-harmonic cosine from a pure second harmonic; a 0.004 result likely fitted order 1 to the wrong term - check the projection order",
        )
        self.assertAlmostEqual(
            b1, 0.0, delta=1e-12,
            msg="expected no first-harmonic sine either; a 0.004 result likely fitted order 1 to the second harmonic - check the harmonic index is passed through",
        )
        self.assertAlmostEqual(
            submission.harmonic_coefficients(errors, 2)[1], 0.004, delta=1e-12,
            msg="expected 0.004 from the second harmonic's sine coefficient; a 0.0 result likely looked at order 1 - check the order argument is 2 here",
        )

    def test_a_short_or_zeroth_fit_is_refused(self):
        with self.assertRaises(ValueError):
            submission.harmonic_coefficients([], 1)
        with self.assertRaises(ValueError):
            submission.harmonic_coefficients([0.001, 0.002], 0)
        with self.assertRaises(ValueError):
            submission.harmonic_amplitude(float("nan"), 0.0)


if __name__ == "__main__":
    unittest.main()
