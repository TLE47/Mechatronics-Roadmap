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
        self.assertAlmostEqual(simulated[1], matrix_v[-1], delta=1e-12)
        # And the decay is the physical one: exp(-b t / I) over 0.2 s.
        expected = dq1 * math.exp(-plant.B1 * 200 * plant.DT / plant.I1)
        self.assertAlmostEqual(simulated[1], expected, delta=2e-3)

    def test_arm_parameters_reach_the_matrix(self):
        Ad, _Bd = submission.state_matrices(plant.I1, 0.0, plant.B1, plant.DT)
        self.assertAlmostEqual(Ad[0][1], plant.DT, delta=1e-15)
        self.assertAlmostEqual(Ad[1][1], 1.0 - plant.B1 * plant.DT / plant.I1, delta=1e-15)


class DrivetrainTests(unittest.TestCase):
    def test_four_states_run_through_the_same_one_step(self):
        # The arm's two inertias as two masses, coupled by a stiff shaft.
        m1, m2, k, b, dt = plant.I1, plant.I2, 6.0, 0.02, plant.DT
        Ad, Bd = submission.two_mass_matrices(m1, m2, k, b, dt)
        self.assertEqual(len(Ad), 4)
        self.assertTrue(all(len(row) == 4 for row in Ad))
        self.assertEqual(len(Bd), 4)
        self.assertEqual(Bd[0], 0.0)
        self.assertAlmostEqual(Bd[1], dt / m1, delta=1e-15)
        final = submission.simulate(Ad, Bd, [0.0, 0.0, 0.0, 0.0], 0.05, 3000)
        angle, speed, load_angle, load_speed = final
        self.assertAlmostEqual(angle, load_angle, delta=5e-3)
        self.assertAlmostEqual(speed, load_speed, delta=2e-3)
        self.assertGreater(angle, 1e-2)

    def test_coupling_stiffness_is_what_moves_the_load(self):
        m1, m2, b, dt = 1.0, 1.0, 0.5, 0.001
        stiff, Bd = submission.two_mass_matrices(m1, m2, 200.0, b, dt)
        loose, _ = submission.two_mass_matrices(m1, m2, 0.0, b, dt)
        stiff_final = submission.simulate(stiff, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 500)
        loose_final = submission.simulate(loose, Bd, [0.0, 0.0, 0.0, 0.0], 1.0, 500)
        self.assertGreater(stiff_final[2], loose_final[2],
                           "a stiff shaft drags the load further than a free one")


if __name__ == "__main__":
    unittest.main()
