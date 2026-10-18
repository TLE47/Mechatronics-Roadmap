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
        self.assertEqual(
            len(returns), len(rewards),
            msg="expected one return per reward, including the last; a shorter list likely "
                "dropped the final step, where G = r - check the loop reaches index 0",
        )
        self.assertAlmostEqual(
            returns[-1], rewards[-1], delta=1e-12,
            msg="expected the final return to be the final reward with nothing after it; another "
                "value likely carried the running sum past the episode - check the seed",
        )
        for t in (0, 1, 7, len(rewards) // 2):
            brute = sum(gamma ** k * rewards[t + k] for k in range(len(rewards) - t))
            self.assertAlmostEqual(
                returns[t], brute, delta=1e-9,
                msg="expected G at each sampled step to equal a sum discounted from that step, "
                "not from zero; a larger return means the exponent started at t = 0 - check the "
                "backward recursion",
            )

    def test_a_bonus_at_the_end_is_worth_less_every_step_earlier(self):
        rewards = run_rewards()
        n = len(rewards)
        returns = submission.discounted_returns([0.0] * (n - 1) + [10.0], gamma=0.97)
        self.assertLess(
            returns[0], returns[-2],
            msg="expected the same bonus to be worth less at the start of the episode than one "
                "step before the end; an unchanged value likely ignored the discount",
        )
        self.assertAlmostEqual(
            returns[-2], 9.7, delta=1e-12,
            msg="expected a 10.0 bonus one step out to be 9.7 at gamma 0.97; 10.0 likely "
                "skipped the final discount - check the step distance",
        )
        self.assertAlmostEqual(
            returns[0], 10.0 * 0.97 ** (n - 1), delta=1e-12,
            msg="expected the first return to be 10.0 * 0.97^(n-1); another value likely "
                "discounted from the wrong end - check the exponent is the distance",
        )


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
                self.assertLessEqual(
                    abs(target[i] - q[i]), 0.08 + 1e-12,
                    msg="expected every shielded target to sit within one 0.08 clamp of the "
                        "measured joint; a larger move means the shield only applied the "
                        "joint limit",
                )
            tau = (KP[0] * (target[0] - q[0]) + KD[0] * (dq_des[0] - dq[0])
                   + plant.gravity_torque(q[0], q[1])[0],
                   KP[1] * (target[1] - q[1]) + KD[1] * (dq_des[1] - dq[1])
                   + plant.gravity_torque(q[0], q[1])[1])
            return (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[0])),
                    max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[1])))

        shielded = plant.simulate_arm(controller=controller)
        self.assertLess(
            shielded["rms_dyn_err_mm"], 1.02 * analytic["rms_dyn_err_mm"],
            msg="expected the shield not to degrade the plant's own tracking by more than 2 "
                "percent; a larger RMS likely means it clipped real targets - check dq_max",
        )
        self.assertLess(
            clipped["count"], 20,
            msg="expected the figure-8 to move slowly enough that the shield clips fewer than 20 "
                "times in the whole run; a larger count means the clamp is too tight for the "
                "plant's own trajectory",
        )

    def test_a_wild_policy_cannot_jerk_the_arm(self):
        state = {"commands": [], "last": None}
        dq_max = 0.05

        def hostile(q, dq, q_des, dq_des):
            target = [submission.safety_shield(3.0, q[0], dq_max=dq_max,
                                               q_min=LIMITS[0], q_max=LIMITS[1]),
                      submission.safety_shield(-3.0, q[1], dq_max=dq_max,
                                               q_min=LIMITS[0], q_max=LIMITS[1])]
            for i in (0, 1):
                self.assertLessEqual(
                    abs(target[i] - q[i]), dq_max + 1e-12,
                    msg="expected a +3 rad policy command to move each joint at most one 0.05 "
                        "clamp per tick; a larger jump means the shield did not step-limit",
                )
                state["commands"].append(target[i])
            tau = [KP[i] * (target[i] - q[i]) - KD[i] * dq[i] for i in (0, 1)]
            return (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[0])),
                    max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[1])))

        run = plant.simulate_arm(steps=300, controller=hostile)
        q1, q2, dq1, dq2 = run["state"]
        self.assertLessEqual(
            abs(q1), math.pi,
            msg="expected the shielded shoulder to stay inside its joint range under a hostile "
                "policy; a larger angle means the hard limit was skipped",
        )
        self.assertLessEqual(
            abs(q2), math.pi,
            msg="expected the shielded elbow to stay inside its joint range too; a larger angle "
                "likely means only the first joint was clamped",
        )
        self.assertLess(
            math.hypot(dq1, dq2), 50.0,
            msg="expected a step-clamped hostile policy to leave the arm slow rather than "
                "shaking; a larger speed means the clamp was applied to torque, not to targets",
        )
        self.assertGreater(
            len(state["commands"]), 500,
            msg="expected two commands per tick over 300 ticks, more than 500 in all; a smaller "
                "count likely means the controller stopped being called - check the run",
        )

    def test_the_watchdog_trips_when_the_policy_stops_talking(self):
        # The plant's 1 kHz loop calls this on every tick; a dead 30 Hz policy is caught long
        # before the next chunk was due.
        last = 4.000
        self.assertFalse(
            submission.watchdog_trip(last, 4.020, timeout_s=0.1),
            msg="expected 20 ms of silence to be healthy for a 100 ms watchdog; True likely "
                "compared against the wrong timestamp - check now - last",
        )
        self.assertTrue(
            submission.watchdog_trip(last, 4.120, timeout_s=0.1),
            msg="expected 120 ms of silence to trip the 100 ms watchdog; False likely used an "
                "inclusive bound or a stale chunk - check the comparison",
        )


if __name__ == "__main__":
    unittest.main()
