"""Behaviour tests for 00-foundations.T1.00e.

Each test names the mistake it catches:
  * a spring force without its minus sign, which pushes the cart away from the centre instead of
    back towards it;
  * a damped step that adds `+b v`, the module's own "If your result differs" warning - negative
    damping that injects energy and makes the oscillation explode;
  * a position updated with the old velocity (forward Euler), which gains energy every step where
    the module's `v += a*dt; x += v*dt` keeps it bounded;
  * an energy that forgets the spring's half, so a cart at rest on a stretched spring looks like
    it stores nothing;
  * a lever torque built from cos instead of sin, which reports zero holding torque at the very
    angle the Skip test's 5.886 N*m lives at.

Every assertion carries the cause, because a solo learner only sees this line when a check fails.
"""

import math
import unittest

import harness

submission = harness.load_submission()


def run_spring(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s, steps):
    """Drive the submission's own step function; no simulation of our own to hide behind."""
    x, v = x_m, v_ms
    for _ in range(steps):
        x, v = submission.euler_step(x, v, k_nm, b_nsm, m_kg, dt_s)
    return x, v


def energy_of(x_m, v_ms, m_kg=2.0, k_nm=50.0):
    return submission.mechanical_energy(m_kg, v_ms, k_nm, x_m)


class SpringLawTests(unittest.TestCase):
    def test_the_worked_spring_force(self):
        # The module's Formalization item 1: -(50.0 N/m)(0.10 m) = -5.0 N.
        self.assertAlmostEqual(
            submission.spring_force(50.0, 0.10),
            -5.0,
            delta=1e-12,
            msg="expected -5.0 N from -(50 N/m)(0.10 m); a positive 5.0 likely dropped the minus sign - check the sign in front of k*x",
        )

    def test_the_spring_pushes_back_the_other_way(self):
        # Pull it to the left and the force must point right: the sign tracks x, it does not cling.
        self.assertAlmostEqual(
            submission.spring_force(50.0, -0.10),
            5.0,
            delta=1e-12,
            msg="expected +5.0 N when x is -0.10 m; a -5.0 likely hard-coded the sign instead of following x - check that the force is negative in x",
        )

    def test_a_zero_displacement_has_no_force(self):
        self.assertAlmostEqual(
            submission.spring_force(50.0, 0.0),
            0.0,
            delta=1e-15,
            msg="expected 0 N at zero displacement; any other value likely added a rest-length offset - check that x is measured from the unstretched position",
        )

    def test_the_worked_cart_acceleration(self):
        # a = -5.0 N / 2.0 kg = -2.5 m/s^2.
        self.assertAlmostEqual(
            submission.acceleration(-5.0, 2.0),
            -2.5,
            delta=1e-15,
            msg="expected -2.5 m/s^2 from -5.0 N / 2.0 kg; a different value likely divided by the wrong mass - check Newton's second law uses F/m",
        )

    def test_newtons_second_law_doubles_with_the_force(self):
        self.assertAlmostEqual(
            submission.acceleration(-10.0, 2.0),
            -5.0,
            delta=1e-15,
            msg="expected -5.0 m/s^2 when the force doubles to -10.0 N; a result still at -2.5 likely reused a cached force - check the argument reaches F/m",
        )
        self.assertAlmostEqual(
            submission.acceleration(-5.0, 4.0),
            -1.25,
            delta=1e-15,
            msg="expected -1.25 m/s^2 when the mass doubles to 4.0 kg; a result near -2.5 likely multiplied by m - check the mass divides the force",
        )

    def test_a_zero_mass_is_refused(self):
        with self.assertRaises(ValueError):
            submission.acceleration(-5.0, 0.0)
        with self.assertRaises(ValueError):
            submission.spring_force(-50.0, 0.10)


class StepTests(unittest.TestCase):
    def test_the_skip_test_one_step(self):
        # a = -100*0.20/1 = -20; v1 = -0.2; x1 = 0.20 - 0.002 = 0.198.
        x1, v1 = submission.euler_step(0.20, 0.0, 100.0, 0.0, 1.0, 0.01)
        self.assertAlmostEqual(
            v1,
            -0.2,
            delta=1e-12,
            msg="expected the speed to fall to -0.2 m/s on the first step; a speed still at 0 likely skipped the acceleration update - check v += a*dt runs before x changes",
        )
        self.assertAlmostEqual(
            x1,
            0.198,
            delta=1e-12,
            msg="expected x = 0.198 m after one 10 ms step; 0.20 likely used the old speed - check the position uses the freshly updated v",
        )

    def test_the_first_step_of_the_worked_example(self):
        # a = -2.5, v1 = -0.00125, x1 = 0.10 - 0.00125*0.0005 = 0.099999375.
        x1, v1 = submission.euler_step(0.10, 0.0, 50.0, 0.0, 2.0, 0.0005)
        self.assertAlmostEqual(
            v1,
            -0.00125,
            delta=1e-15,
            msg="expected v = -0.00125 m/s after 0.5 ms on the worked cart; a different value likely used dt in the wrong unit - check 0.5 ms is 0.0005 s",
        )
        self.assertAlmostEqual(
            x1,
            0.099999375,
            delta=1e-15,
            msg="expected x = 0.099999375 m after the first 0.5 ms step; a larger move likely used the old speed - check the update order",
        )

    def test_the_damping_force_slows_the_cart(self):
        # At x = 0 with v = 0.5 m/s, b = 4: a = -(4*0.5)/2 = -1.0 m/s^2.
        x1, v1 = submission.euler_step(0.0, 0.5, 50.0, 4.0, 2.0, 0.001)
        self.assertAlmostEqual(
            v1,
            0.499,
            delta=1e-15,
            msg="expected the damper to shave 0.001 m/s off 0.5 m/s; a speed at or above 0.5 likely added +b*v - check the damping term is subtracted",
        )
        self.assertAlmostEqual(
            x1,
            0.000499,
            delta=1e-15,
            msg="expected x = 0.000499 m after one damped millisecond step; a larger value likely used the pre-damping speed - check the order of the v and x updates",
        )

    def test_symplectic_euler_keeps_the_energy_bounded(self):
        # A deliberately coarse 20 ms step (a tenth of the 5 rad/s period's radian count) for 500
        # steps: the new-velocity ordering stays within a few percent forever, while the
        # old-velocity ordering gains 1% per step and reaches ~144x the release energy.
        start = energy_of(0.10, 0.0)
        x, v = run_spring(0.10, 0.0, 50.0, 0.0, 2.0, 0.02, 500)
        ratio = energy_of(x, v) / start
        self.assertGreater(
            ratio,
            0.85,
            "expected the symplectic step to keep at least 85% of the release energy; a lower ratio likely damped a run with b = 0 - check the damping term stays out",
        )
        self.assertLess(
            ratio,
            1.15,
            "expected energy within 15% over 500 coarse steps; a larger ratio likely updated x before v, which is forward Euler - check the update order",
        )

    def test_the_undamped_run_keeps_its_energy(self):
        # The worked example's own 1 s run at 0.5 ms: 0.2500 J in, 0.2500 J out.
        start = energy_of(0.10, 0.0)
        x, v = run_spring(0.10, 0.0, 50.0, 0.0, 2.0, 0.0005, 2000)
        self.assertAlmostEqual(
            energy_of(x, v) / start,
            1.0,
            delta=0.01,
            msg="expected an undamped run to return its 0.25 J within 1%; a rising ratio likely used the old velocity for x - check the step order",
        )

    def test_the_damping_run_dissipates_the_energy(self):
        # The exercise: b = 4.0 N*s/m for 4000 steps of 0.5 ms (2.0 s). The envelope decays as
        # exp(-(b/m) t) = exp(-2t), so E(2 s) = 0.25 * exp(-4) = 0.00458 J, well under 0.0125.
        x, v = run_spring(0.10, 0.0, 50.0, 4.0, 2.0, 0.0005, 4000)
        final = energy_of(x, v)
        self.assertLess(
            final,
            0.0125,
            "expected under 0.0125 J after 2 s of b = 4 damping; a larger value likely added +b*v, which injects energy - check the sign of the damping term",
        )
        self.assertGreater(
            final,
            0.0,
            "expected some energy left after 2 s; exactly zero likely clamped the state or returned a constant - check the run reaches 4000 steps",
        )

    def test_bad_steps_are_refused(self):
        for args in ((0.10, 0.0, 50.0, 0.0, 2.0, 0.0),
                     (0.10, 0.0, 50.0, 0.0, 0.0, 0.001),
                     (0.10, 0.0, -50.0, 0.0, 2.0, 0.001),
                     (0.10, 0.0, 50.0, -4.0, 2.0, 0.001)):
            with self.assertRaises(ValueError):
                submission.euler_step(*args)


class EnergyTests(unittest.TestCase):
    def test_the_release_energy(self):
        # All spring, no motion: 0.5*50*0.10^2 = 0.2500 J.
        self.assertAlmostEqual(
            submission.mechanical_energy(2.0, 0.0, 50.0, 0.10),
            0.25,
            delta=1e-15,
            msg="expected 0.2500 J with all spring and no motion; a value near 0.125 likely dropped the half - check 0.5*k*x^2",
        )

    def test_the_skip_test_energy(self):
        # 0.5*1*2^2 + 0.5*40*0.10^2 = 2.0 + 0.2 = 2.20 J.
        self.assertAlmostEqual(
            submission.mechanical_energy(1.0, 2.0, 40.0, 0.10),
            2.20,
            delta=1e-12,
            msg="expected 2.20 J = 2.0 kinetic + 0.2 spring; a result near 2.0 likely left out the spring store - check both terms are summed",
        )

    def test_the_two_stores_add_up(self):
        kinetic_only = submission.mechanical_energy(1.0, 2.0, 0.0, 0.0)
        spring_only = submission.mechanical_energy(1.0, 0.0, 40.0, 0.10)
        self.assertAlmostEqual(
            kinetic_only,
            2.0,
            delta=1e-12,
            msg="expected 2.0 J of kinetic energy with k = 0; a different value likely kept a spring term - check k = 0 zeroes that half",
        )
        self.assertAlmostEqual(
            spring_only,
            0.2,
            delta=1e-12,
            msg="expected 0.2 J of spring energy at rest; a value near 0 likely dropped the half - check 0.5*k*x^2, not k*x^2",
        )
        self.assertAlmostEqual(
            submission.mechanical_energy(1.0, 2.0, 40.0, 0.10),
            kinetic_only + spring_only,
            delta=1e-12,
            msg="expected the total to be exactly the two stores added; a gap between them likely ignored one argument - check both v and x are read",
        )

    def test_doubling_the_speed_quadruples_the_kinetic_store(self):
        spring = submission.mechanical_energy(2.0, 0.0, 50.0, 0.10)
        slow = submission.mechanical_energy(2.0, 2.0, 50.0, 0.10) - spring
        fast = submission.mechanical_energy(2.0, 4.0, 50.0, 0.10) - spring
        self.assertAlmostEqual(
            fast,
            4.0 * slow,
            delta=1e-12,
            msg="expected v = 4 m/s to store four times the kinetic energy of 2 m/s; a ratio near 2 likely used v once - check the velocity is squared",
        )


class PeakSpeedTests(unittest.TestCase):
    def test_the_worked_peak_speed(self):
        # sqrt(2*0.25/2.0) = sqrt(0.25) = 0.5000 m/s.
        self.assertAlmostEqual(
            submission.peak_speed(0.25, 2.0),
            0.5,
            delta=1e-15,
            msg="expected 0.5000 m/s from sqrt(2*0.25/2.0); 0.25 likely divided by m after squaring - check the factor of two comes out of the root",
        )

    def test_doubling_the_energy_raises_the_peak_speed_by_root_two(self):
        self.assertAlmostEqual(
            submission.peak_speed(0.5, 2.0) / submission.peak_speed(0.25, 2.0),
            math.sqrt(2.0),
            delta=1e-12,
            msg="expected doubling the energy to raise the peak speed by sqrt(2); a ratio of 2 likely skipped the square root - check sqrt(2E/m)",
        )

    def test_a_zero_energy_starts_at_rest(self):
        self.assertAlmostEqual(
            submission.peak_speed(0.0, 2.0),
            0.0,
            delta=1e-15,
            msg="expected zero peak speed with zero energy; a nonzero value likely added an offset - check the formula has no constant term",
        )

    def test_impossible_inputs_are_refused(self):
        with self.assertRaises(ValueError):
            submission.peak_speed(-0.1, 2.0)
        with self.assertRaises(ValueError):
            submission.peak_speed(0.25, 0.0)


class TorqueTests(unittest.TestCase):
    def test_the_skip_test_holding_torque(self):
        # 2.0 kg at 0.30 m, force straight down at right angles: 0.30 * 19.62 = 5.886 N*m.
        self.assertAlmostEqual(
            submission.torque(2.0 * 9.81, 0.30, math.pi / 2.0),
            5.886,
            delta=1e-9,
            msg="expected 5.886 N*m with the force at right angles; a value near 0 likely used cos, which is zero at 90 degrees - check sin(theta)",
        )

    def test_the_skip_test_thirty_degrees(self):
        # 0.40 * 10.0 * sin(30 deg) = 2.0 N*m.
        self.assertAlmostEqual(
            submission.torque(10.0, 0.40, math.radians(30.0)),
            2.0,
            delta=1e-12,
            msg="expected 2.0 N*m at 30 degrees; 3.46 likely used cos(30) instead of sin(30) - check the lever arm is r*sin(theta)",
        )

    def test_an_inline_force_makes_no_torque(self):
        self.assertAlmostEqual(
            submission.torque(10.0, 0.40, 0.0),
            0.0,
            delta=1e-15,
            msg="expected no torque when the force points along the lever; a nonzero value likely used cos - check sin(0) = 0 drives the result",
        )
        self.assertAlmostEqual(
            submission.torque(10.0, 0.40, math.pi),
            0.0,
            delta=1e-12,
            msg="expected no torque at 180 degrees either; a small residual is fine only if it is round-off - check the angle is in radians",
        )

    def test_the_maximum_is_perpendicular(self):
        perpendicular = submission.torque(10.0, 0.40, math.pi / 2.0)
        diagonal = submission.torque(10.0, 0.40, math.pi / 4.0)
        inline = submission.torque(10.0, 0.40, 0.0)
        self.assertGreater(
            perpendicular,
            diagonal,
            "expected the right angle to beat 45 degrees; otherwise the angle dependence is missing - check the result scales with sin(theta)",
        )
        self.assertGreater(
            diagonal,
            inline,
            "expected 45 degrees to beat an inline push; a tie likely ignores the angle entirely - check theta is used at all",
        )
        self.assertAlmostEqual(
            perpendicular,
            4.0,
            delta=1e-12,
            msg="expected the maximum 4.0 N*m at 90 degrees; 2.83 likely used sin(45) - check the angle passed is pi/2",
        )

    def test_the_gate_test_angular_acceleration(self):
        # tau/J = 1.5 / 0.05 = 30 rad/s^2.
        self.assertAlmostEqual(
            submission.angular_acceleration(1.5, 0.05),
            30.0,
            delta=1e-9,
            msg="expected 30 rad/s^2 from 1.5 N*m over 0.05 kg m^2; 0.075 likely multiplied instead of divided - check tau/J",
        )

    def test_a_zero_inertia_is_refused(self):
        with self.assertRaises(ValueError):
            submission.angular_acceleration(1.5, 0.0)
        with self.assertRaises(ValueError):
            submission.torque(10.0, -0.40, math.pi / 2.0)


if __name__ == "__main__":
    unittest.main()
