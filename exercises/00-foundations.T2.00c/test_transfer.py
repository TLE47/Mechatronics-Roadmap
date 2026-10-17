"""Transfer tests for 00-foundations.T2.00c - the plant's elbow and the plant's motor.

Two changed systems, neither using the lesson's numbers:
  1. the elbow joint of the shared arm, driven by a PD law with stiffness k and damping b, must show
     the overshoot the formula predicts (and none at critical damping);
  2. a DC motor with L = 2 mH and R = 0.5 ohm must reach 63.2% of its steady current at t = L/R -
     the first-order answer, measured through `plant.simulate_motor`, not through the formula again.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant


def run_elbow(k, b, dt=1e-5, steps=40000):
    """The plant's own elbow joint under tau = k (1 - q2) - b qd2, gravity off.

    The plant already has viscous damping `plant.B2`, so the total damping the response feels is
    `b + plant.B2` - a detail a toy model would hide and this one must not.
    """
    state = (0.0, 0.0, 0.0, 0.0)
    max_theta = 0.0
    for _ in range(steps):
        tau2 = k * (1.0 - state[1]) - b * state[3]
        state = plant.step_arm(state, (0.0, tau2), dt=dt, gravity=False)
        max_theta = max(max_theta, state[1])
    return {"max_theta": max_theta, "theta": state[1]}


class ElbowJointTests(unittest.TestCase):
    def test_overshoot_matches_the_formula_on_the_plant(self):
        j, k = plant.I2, 8.0
        zeta = 0.35
        b_command = 2.0 * zeta * math.sqrt(j * k) - plant.B2     # the plant adds B2 itself
        total_b = b_command + plant.B2
        predicted = submission.second_order_params(j, k, total_b)["mp"]
        measured = max(0.0, run_elbow(k, b_command)["max_theta"] - 1.0)
        self.assertAlmostEqual(measured, predicted, delta=0.01)

    def test_critical_damping_kills_the_overshoot(self):
        j, k = plant.I2, 8.0
        b = submission.critical_damping(j, k)
        measured = max(0.0, run_elbow(k, b)["max_theta"] - 1.0)
        self.assertLess(measured, 1e-3)
        self.assertAlmostEqual(submission.second_order_params(j, k, b)["zeta"], 1.0, delta=1e-12)

    def test_settling_time_is_in_the_right_ballpark_on_the_plant(self):
        j, k = plant.I2, 8.0
        zeta = 0.5
        total_b = 2.0 * zeta * math.sqrt(j * k)
        b_command = total_b - plant.B2
        params = submission.second_order_params(j, k, total_b)
        ts = submission.settling_time(params["wn"], params["zeta"])
        self.assertGreater(ts, 0.0)
        # At 1.3 x the predicted 2% time the plant must be inside 3% of target.
        final = run_elbow(k, b_command, steps=int(1.3 * ts / 1e-5), dt=1e-5)["theta"]
        self.assertLess(abs(final - 1.0), 0.03)


class MotorTests(unittest.TestCase):
    def test_electrical_time_constant_in_the_plant(self):
        resistance, inductance = 0.5, 2e-3
        tau = inductance / resistance
        run = plant.simulate_motor(
            voltage=1.0,
            resistance_ohm=resistance,
            inductance_h=inductance,
            kt_nm_per_a=1e-3,
            ke_v_per_rad_s=1e-3,
            inertia_kg_m2=1e-2,
            damping_nm_s_rad=1e-2,
            dt=1e-5,
            steps=2000,
            record=True,
        )
        trace = run["trace"]
        steady = trace[-1][1]
        at_tau = min(trace, key=lambda row: abs(row[0] - tau))[1]
        self.assertAlmostEqual(steady, 2.0, delta=0.02)          # V / R
        self.assertAlmostEqual(at_tau / steady, 1.0 - math.exp(-1), delta=0.02)
        self.assertAlmostEqual(at_tau / steady, submission.first_order_response(tau, tau), delta=0.02)


if __name__ == "__main__":
    unittest.main()
