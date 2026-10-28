"""Exercise 06-robotics.T3.06b - the learner's file.

The return, the advantage, the PPO clip, the temporal ensemble, the safety shield and the
watchdog. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T3.06b/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T3.06b -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def discounted_returns(rewards, gamma=0.9):
    """G_t for every step, by the backward recursion."""
    raise NotImplementedError(
        "TODO 1: walk BACKWARDS; each return is that step's reward plus the discounted return of the next step"
    )


def advantages(returns, values):
    """A_hat_t = G_t - V(s_t)."""
    raise NotImplementedError("TODO 2: subtract the value estimate from the return")


def ppo_clip_term(rho, advantage, eps=0.2):
    """The clipped surrogate term for one step."""
    raise NotImplementedError("TODO 3: min of the raw and clipped products, not the max")


def ppo_loss(ratios, advantages_, eps=0.2):
    """Mean clipped surrogate term over a batch."""
    raise NotImplementedError("TODO 4: average the terms")


def temporal_ensemble(predictions, decay=0.5):
    """Exponentially weighted blend; index 0 is the newest prediction."""
    raise NotImplementedError(
        "TODO 5: blend the predictions with weights that decay exponentially by age, normalised by their sum"
    )


def safety_shield(a_policy, q, dq_max=0.08, q_min=-1.5, q_max=1.5):
    """Rate-limit around q, then clamp to the joint limits."""
    raise NotImplementedError("TODO 6: step clamp first, then the hard joint limits")


def watchdog_trip(last_chunk_s, now_s, timeout_s=0.1):
    """True when the policy has been silent for longer than the timeout."""
    raise NotImplementedError("TODO 7: strictly longer; exactly at the timeout is still alive")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
