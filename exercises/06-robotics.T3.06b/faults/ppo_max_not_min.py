"""Planted fault: the surrogate takes max of the raw and clipped products.

It is identical for a positive advantage - the clipped one is always the smaller - and it is
the exact opposite of the pessimism PPO wants when the advantage is negative.

Generated from `solution.py` with one edit; `exercise.json` names the test it must fail.
"""

import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def discounted_returns(rewards, gamma=0.9):
    """G_t for every step, by the backward recursion G_t = r_t + gamma * G_{t+1}."""
    if not rewards:
        raise ValueError("a rollout needs at least one reward")
    if not 0.0 <= gamma < 1.0:
        raise ValueError("the discount factor must be in [0, 1)")
    returns = [0.0] * len(rewards)
    running = 0.0
    for t in range(len(rewards) - 1, -1, -1):
        running = rewards[t] + gamma * running
        returns[t] = running
    return returns


def advantages(returns, values):
    """A_hat_t = G_t - V(s_t), the 'better than expected' score PPO weights actions by."""
    if len(returns) != len(values):
        raise ValueError("every return needs one value estimate")
    return [g - v for g, v in zip(returns, values)]


def ppo_clip_term(rho, advantage, eps=0.2):
    """min(rho * A, clip(rho, 1 - eps, 1 + eps) * A): pessimistic when the ratio is clipped."""
    if eps <= 0.0:
        raise ValueError("the clip range must be positive")
    if rho < 0.0:
        raise ValueError("a probability ratio cannot be negative")
    clipped = max(1.0 - eps, min(1.0 + eps, rho))
    return max(rho * advantage, clipped * advantage)


def ppo_loss(ratios, advantages_, eps=0.2):
    """Mean clipped surrogate term over a batch (to be maximised, so minimise its negative)."""
    if not ratios or len(ratios) != len(advantages_):
        raise ValueError("ratios and advantages must be non-empty and the same length")
    return sum(ppo_clip_term(r, a, eps) for r, a in zip(ratios, advantages_)) / len(ratios)


def temporal_ensemble(predictions, decay=0.5):
    """Exponentially weighted blend of overlapping chunks; index 0 is the newest prediction."""
    if not predictions:
        raise ValueError("there is nothing to ensemble")
    if decay < 0.0:
        raise ValueError("the decay rate cannot be negative")
    weights = [math.exp(-decay * i) for i in range(len(predictions))]
    total = sum(weights)
    return sum(w * p for w, p in zip(weights, predictions)) / total


def safety_shield(a_policy, q, dq_max=0.08, q_min=-1.5, q_max=1.5):
    """Rate-limit the policy's target around the measured q, then clamp it to the joint limits."""
    if dq_max <= 0.0:
        raise ValueError("the step clamp must be positive")
    if q_min > q_max:
        raise ValueError("the joint limits are inverted")
    rate_limited = max(q - dq_max, min(q + dq_max, a_policy))
    return max(q_min, min(q_max, rate_limited))


def watchdog_trip(last_chunk_s, now_s, timeout_s=0.1):
    """True when the high-level policy has been silent for longer than the heartbeat timeout."""
    if timeout_s <= 0.0:
        raise ValueError("the watchdog timeout must be positive")
    return (now_s - last_chunk_s) > timeout_s


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
