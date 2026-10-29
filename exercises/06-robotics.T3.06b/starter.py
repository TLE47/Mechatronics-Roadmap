"""Exercise 06-robotics.T3.06b - the learner's file.

The return, the advantage, the PPO clip, the temporal ensemble, the safety shield and the
watchdog. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T3.06b/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T3.06b -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def discounted_returns(rewards, gamma=0.9):
    """The return from each step onward."""
    raise NotImplementedError(
        "TODO 1: the return from each step onward, with later rewards counting for less"
    )


def advantages(returns, values):
    """How much better each step's return was than its value estimate."""
    raise NotImplementedError("TODO 2: how much each return beat the value estimate")


def ppo_clip_term(rho, advantage, eps=0.2):
    """The clipped surrogate term for one step."""
    raise NotImplementedError("TODO 3: the clipped surrogate term for this ratio and advantage")


def ppo_loss(ratios, advantages_, eps=0.2):
    """Mean clipped surrogate term over a batch."""
    raise NotImplementedError("TODO 4: the batch's clipped surrogate score")


def temporal_ensemble(predictions, decay=0.5):
    """Exponentially weighted blend; index 0 is the newest prediction."""
    raise NotImplementedError(
        "TODO 5: the blended prediction, with older predictions counting for less"
    )


def safety_shield(a_policy, q, dq_max=0.08, q_min=-1.5, q_max=1.5):
    """A command that respects the joint's rate and position limits."""
    raise NotImplementedError("TODO 6: the command the shield allows at this position")


def watchdog_trip(last_chunk_s, now_s, timeout_s=0.1):
    """True when the policy has been silent for longer than the timeout."""
    raise NotImplementedError("TODO 7: whether the policy has gone silent past the timeout")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
