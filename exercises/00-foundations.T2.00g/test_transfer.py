"""Transfer tests for 00-foundations.T2.00g - the arm's own joints, not the worked-example cart.

The page's example is a 1 kg cart with k = 100 N/m. These tests change the numbers and the plant:
the capstone arm's shoulder joint (I1 = 0.008 kg*m^2, b = 0.04 N*m*s/rad) run through the same
matrix step, and a four-state two-mass drivetrain whose coupling the 2-state matrices cannot carry.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


class ArmJointTests(unittest.TestCase):
    def test_velocity_decay_matches_the_plant_tick_for_tick(self):
        # Zero torque and no gravity: the plant integrates velocity with the same first-order
        # update, so the matrix model and `plant.step_arm` must agree to machine precision.
        Ad, Bd = submission.state_matrices(plant.I1, 0.0, plant.B1, plant.DT)
        q1, q2 = plant.ik(*plant.figure8_target(0.25))
        dq1 = 1.5
        matrix_v = [dq1]
        state = (q1, q2, dq1, 0.0)
        for _ in range(200):
            state = plant.step_arm(state, (0.0, 0.0), dt=plant.DT, gravity=False)
            matrix_v.append(state[2])
        simulated = submission.simulate(Ad, Bd, [0.0, dq1], 0.0, 200)
        self.assertAlmostEqual(
            simulated[1], matrix_v[-1], delta=1e-12,
            msg="expected the matrix model's velocity to match the plant's own after 200 ticks; "
                "a drift likely used a different damping or step - check B1 and DT",
        )
        # And the decay is the physical one: exp(-b t / I) over 0.2 s.
        expected = dq1 * math.exp(-plant.B1 * 200 * plant.DT / plant.I1)
        self.assertAlmostEqual(
            simulated[1], expected, delta=2e-3,
            msg="expected the velocity to follow exp(-b t / I) to within 2e-3 after 0.2 s; "
                "another value likely applied the damping quadratically - check the exponent",
        )

    def test_arm_parameters_reach_the_matrix(self):
        Ad, _Bd = submission.state_matrices(plant.I1, 0.0, plant.B1, plant.DT)
        self.assertAlmostEqual(
            Ad[0][1], plant.DT, delta=1e-15,
            msg="expected the position row's off-diagonal to be the plant's own step; another "
                "value likely hardcoded the cart example's dt - check plant.DT",
        )
        self.assertAlmostEqual(
            Ad[1][1], 1.0 - plant.B1 * plant.DT / plant.I1, delta=1e-15,
            msg="expected the velocity diagonal to be 1 - b dt / I for the shoulder; a constant "
                "0.99 likely came from the worked cart - check the parameters",
        )


class DrivetrainTests(unittest.TestCase):
    def test_four_states_run_through_the_same_one_step(self):
        # The arm's two inertias as two masses, coupled by a stiff shaft.
        m1, m2, k, b, dt = plant.I1, plant.I2, 6.0, 0.02, plant.DT
        Ad, Bd = submission.two_mass_matrices(m1, m2, k, b, dt)
        self.assertEqual(
            len(Ad), 4,
            msg="expected a 4x4 matrix for two masses, so four rows; two likely returned the "
                "2-state cart - check both inertias are represented",
        )
        self.assertTrue(
            all(len(row) == 4 for row in Ad),
            msg="expected every row to carry four states; a shorter row likely dropped the "
                "second mass's columns - check the coupling block",
        )
        self.assertEqual(
            len(Bd), 4,
            msg="expected a four-entry input vector to match the state; a shorter vector likely "
                "kept the 2-state one - check Bd's length follows Ad",
        )
        self.assertEqual(
            Bd[0], 0.0,
            msg="expected no direct force on the first mass's position; a nonzero entry likely "
                "put the input in the position row - check the force enters velocity",
        )
        self.assertAlmostEqual(
            Bd[1], dt / m1, delta=1e-15,
            msg="expected dt / m1 in the second entry; another value likely used the load mass "
                "- check the force acts on m1",
        )
        final = submission.simulate(Ad, Bd, [0.0, 0.0, 0.0, 0.0], 0.05, 3000)
        angle, speed, load_angle, load_speed = final
        self.assertAlmostEqual(
            angle, load_angle, delta=5e-3,
            msg="expected the stiff shaft to leave both angles within 5e-3 rad after 3 s; a "
                "gap likely means the coupling is missing - check the off-diagonal terms",
        )
        self.assertAlmostEqual(
            speed, load_speed, delta=2e-3,
            msg="expected both speeds to converge as the shaft settles; a persistent difference "
                "likely means the damper acts on one mass only",
        )
        self.assertGreater(
            angle, 1e-2,
            msg="expected the driven joint to turn visibly under 0.05 N m for 3 s; a near-zero "
                "angle likely means the input never reached the matrix",
        )

    def test_coupling_stiffness_is_what_moves_the_load(self):
        m1, m2, b, dt = 1.0, 1.0, 0.5, 0.001
        stiff, Bd = submission.two_mass_matrices(m1, m2, 200.0, b, dt)
        loose, _ = submission.two_mass_matrices(m1, m2, 0.0, b, dt)
        stiff_final = submission.simulate(stiff, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 500)
        loose_final = submission.simulate(loose, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 500)
        self.assertGreater(
            stiff_final[2], loose_final[2],
            msg="expected a stiff shaft to drag the load further than a free one; a smaller or "
                "equal value likely means k never reached the coupling - check the 4x4 entries",
        )


if __name__ == "__main__":
    unittest.main()
