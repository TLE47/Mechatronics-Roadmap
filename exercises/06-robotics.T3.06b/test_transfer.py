"""Transfer tests for 06-robotics.T3.06b - the plant as the scoreboard and the load.

Three claims, measured on the shared arm:
  1. the discounted return of the plant's own tracking errors matches a brute-force sum;
  2. passing the plant's own target through the safety shield changes nothing that matters - the
     arm still tracks the figure-8 to the analytic controller's RMS;
  3. a policy that suddenly commands +3 rad cannot jerk the arm: every tick's target moves at most
     the step clamp from the measured joint, and the arm stays inside its joint range.
"""

import math
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

KP = (plant.KP1, plant.KP2)
KD = (plant.KD1, plant.KD2)
LIMITS = (-math.pi, math.pi)


def run_rewards(threshold_mm=5.0):
    """A reward per tick: +1 inside the threshold, minus the tracking error in millimetres."""
    run = plant.simulate_arm(steps=200, record=True)
    return [1.0 if abs(xa - xd) * 1000.0 + abs(ya - yd) * 1000.0 < threshold_mm
            else -math.hypot(xa - xd, ya - yd) * 1000.0
            for _, xd, yd, xa, ya, _, _ in run["trace"]]


class ReturnTests(unittest.TestCase):
    def test_the_returns_match_a_brute_force_sum(self):
        rewards = run_rewards()
        gamma = 0.97
        returns = submission.discounted_returns(rewards, gamma=gamma)
        self.assertEqual(len(returns), len(rewards))
        self.assertAlmostEqual(returns[-1], rewards[-1], delta=1e-12)
        for t in (0, 1, 7, len(rewards) // 2):
            brute = sum(gamma ** k * rewards[t + k] for k in range(len(rewards) - t))
            self.assertAlmostEqual(returns[t], brute, delta=1e-9,
                                   msg="G_%d must discount from t, not from zero" % t)

    def test_a_bonus_at_the_end_is_worth_less_every_step_earlier(self):
        rewards = run_rewards()
        n = len(rewards)
        returns = submission.discounted_returns([0.0] * (n - 1) + [10.0], gamma=0.97)
        self.assertLess(returns[0], returns[-2])
        self.assertAlmostEqual(returns[-2], 9.7, delta=1e-12)
        self.assertAlmostEqual(returns[0], 10.0 * 0.97 ** (n - 1), delta=1e-12)


class ShieldTests(unittest.TestCase):
    def test_the_plants_own_targets_pass_through_the_shield(self):
        analytic = plant.simulate_arm()
        clipped = {"count": 0}

        def controller(q, dq, q_des, dq_des):
            target = [submission.safety_shield(q_des[i], q[i], dq_max=0.08,
                                               q_min=LIMITS[0], q_max=LIMITS[1])
                      for i in (0, 1)]
            for i in (0, 1):
                if abs(target[i] - q_des[i]) > 1e-12:
                    clipped["count"] += 1
                self.assertLessEqual(abs(target[i] - q[i]), 0.08 + 1e-12)
            tau = (KP[0] * (target[0] - q[0]) + KD[0] * (dq_des[0] - dq[0])
                   + plant.gravity_torque(q[0], q[1])[0],
                   KP[1] * (target[1] - q[1]) + KD[1] * (dq_des[1] - dq[1])
                   + plant.gravity_torque(q[0], q[1])[1])
            return (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[0])),
                    max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[1])))

        shielded = plant.simulate_arm(controller=controller)
        self.assertLess(shielded["rms_dyn_err_mm"], 1.02 * analytic["rms_dyn_err_mm"])
        self.assertLess(clipped["count"], 20,
                        "the figure-8 moves slowly enough that the shield rarely has to clip")

    def test_a_wild_policy_cannot_jerk_the_arm(self):
        state = {"commands": [], "last": None}
        dq_max = 0.05

        def hostile(q, dq, q_des, dq_des):
            target = [submission.safety_shield(3.0, q[0], dq_max=dq_max,
                                               q_min=LIMITS[0], q_max=LIMITS[1]),
                      submission.safety_shield(-3.0, q[1], dq_max=dq_max,
                                               q_min=LIMITS[0], q_max=LIMITS[1])]
            for i in (0, 1):
                self.assertLessEqual(abs(target[i] - q[i]), dq_max + 1e-12)
                state["commands"].append(target[i])
            tau = [KP[i] * (target[i] - q[i]) - KD[i] * dq[i] for i in (0, 1)]
            return (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[0])),
                    max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[1])))

        run = plant.simulate_arm(steps=300, controller=hostile)
        q1, q2, dq1, dq2 = run["state"]
        self.assertLessEqual(abs(q1), math.pi)
        self.assertLessEqual(abs(q2), math.pi)
        self.assertLess(math.hypot(dq1, dq2), 50.0,
                        "a step-clamped hostile policy leaves the arm slow, not shaking")
        self.assertGreater(len(state["commands"]), 500)

    def test_the_watchdog_trips_when_the_policy_stops_talking(self):
        # The plant's 1 kHz loop calls this on every tick; a dead 30 Hz policy is caught long
        # before the next chunk was due.
        last = 4.000
        self.assertFalse(submission.watchdog_trip(last, 4.020, timeout_s=0.1))
        self.assertTrue(submission.watchdog_trip(last, 4.120, timeout_s=0.1))


if __name__ == "__main__":
    unittest.main()
