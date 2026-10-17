"""Browser self-check for 06-robotics.T3.06b.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    returns = discounted_returns([1.0, 2.0, 4.0], gamma=0.9)
    assert abs(returns[0] - 6.04) < 1e-12 and abs(returns[1] - 5.6) < 1e-12, "the return recursion"
    assert abs(discounted_returns([0.0, 0.0, 10.0], gamma=0.95)[0] - 9.025) < 1e-12
    checks += 1

    assert abs(ppo_clip_term(1.5, 2.0) - 2.4) < 1e-12, "a clipped positive advantage"
    assert abs(ppo_clip_term(0.6, -3.0) + 2.4) < 1e-12, "a clipped negative advantage is pessimistic"
    assert abs(ppo_clip_term(1.1, 4.0) - 4.4) < 1e-12, "inside the trust region, untouched"
    checks += 1

    assert abs(temporal_ensemble([0.52, 0.50, 0.46], 0.5) - 0.5026767) < 1e-6
    assert abs(temporal_ensemble([0.52, 0.50, 0.46], 0.0) - 0.4933333) < 1e-6, "zero decay is a mean"
    checks += 1

    assert abs(safety_shield(2.80, 0.50, 0.08) - 0.58) < 1e-12, "the step clamp"
    assert abs(safety_shield(-2.0, -1.45, 0.10, -1.5, 1.5) + 1.50) < 1e-12, "the joint limit wins"
    assert abs(safety_shield(0.53, 0.50, 0.08) - 0.53) < 1e-12, "a sane command passes"
    checks += 1

    assert watchdog_trip(1.0, 1.2, 0.1) is True, "silence past the timeout trips"
    assert watchdog_trip(1.0, 1.5, 0.5) is False, "exactly at the timeout is alive"
    assert watchdog_trip(10.02, 10.04, 0.1) is False, "a fresh chunk resets the clock"
    checks += 1

    print("SELF-CHECK PASS: %d checks - returns, the pessimistic PPO clip, the exponential "
          "ensemble, the step clamp before the joint limit and the heartbeat watchdog" % checks)


_selfcheck()
