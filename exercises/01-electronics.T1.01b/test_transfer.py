"""Transfer tests for 01-electronics.T1.01b - PWM on the plant's own actuator.

Three claims, measured on the shared arm:
  1. a 70% duty square wave switching the plant's 2.5 N*m torque limit delivers exactly 70% of it
     on average, which is the same arithmetic as a PWM'ed bus voltage;
  2. the commanded torque never exceeds the clamp, exactly as the driver's current limit never
     exceeds its rating;
  3. the two-switch bridge loss at the datasheet's 1.2 A is twice the one-switch loss - the factor
     of two the module's Break-it exercise turns on.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

DUTY = 0.70
PERIOD_TICKS = 10
ON_TICKS = 7


class PwmOnThePlantTests(unittest.TestCase):
    def test_a_seventy_percent_duty_delivers_seventy_percent_of_the_clamp(self):
        def controller(q, dq, q_des, dq_des):
            tick = int(round(controller.t / plant.DT)) % PERIOD_TICKS
            controller.t += plant.DT
            tau = plant.TAU_LIMIT if tick < ON_TICKS else 0.0
            return tau, tau

        controller.t = 0.0
        run = plant.simulate_arm(steps=200, controller=controller, record=True)
        commanded = [row[5] for row in run["trace"]]
        self.assertAlmostEqual(max(commanded), plant.TAU_LIMIT, delta=1e-12)
        self.assertAlmostEqual(sum(commanded) / len(commanded),
                               submission.pwm_effective_voltage(plant.TAU_LIMIT, DUTY),
                               delta=1e-12)

    def test_the_duty_schedule_never_asks_for_more_than_the_plant_allows(self):
        for tick in range(50):
            on = (tick % PERIOD_TICKS) < ON_TICKS
            tau = plant.TAU_LIMIT if on else 0.0
            self.assertLessEqual(abs(tau), plant.TAU_LIMIT + 1e-12)

    def test_a_full_duty_burst_moves_the_joint_further(self):
        def make_controller(duty):
            state = {"t": 0.0}

            def controller(q, dq, q_des, dq_des):
                tick = int(round(state["t"] / plant.DT)) % PERIOD_TICKS
                state["t"] += plant.DT
                tau = plant.TAU_LIMIT if tick < int(round(duty * PERIOD_TICKS)) else 0.0
                return tau, tau

            return controller

        partial = plant.simulate_arm(steps=200, controller=make_controller(DUTY))
        full = plant.simulate_arm(steps=200, controller=make_controller(1.0))
        travel_partial = abs(partial["state"][0] - plant.ik(*plant.figure8_target(0.0))[0])
        travel_full = abs(full["state"][0] - plant.ik(*plant.figure8_target(0.0))[0])
        self.assertGreater(travel_full, travel_partial)


class BridgeLossScalingTests(unittest.TestCase):
    def test_two_switches_cost_exactly_twice_one(self):
        one = submission.bridge_conduction_loss(1.2, 0.18, 0.0)
        two = submission.bridge_conduction_loss(1.2, 0.18, 0.18)
        self.assertAlmostEqual(two, 2.0 * one, delta=1e-12)
        self.assertAlmostEqual(two, 0.5184, delta=1e-4)

    def test_the_shoot_through_is_far_above_the_load(self):
        fault = submission.shoot_through_current(12.0, 0.020)
        self.assertGreater(fault, 100.0 * 1.2)


if __name__ == "__main__":
    unittest.main()
