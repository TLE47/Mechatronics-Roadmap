"""Exercise 00-foundations.T2.00f - the learner's file.

Two numbers a sampler owes you: the highest frequency it can represent, and where a faster
tone really lands. Fill the two TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00f/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00f -p 'test_*.py'
"""


def nyquist_hz(fs):
    """The highest frequency a sample rate `fs` can represent, in Hz.

    Refuse (ValueError) a rate that is zero or negative: a converter that never samples has no
    representable band.
    """
    raise NotImplementedError("TODO 1: the highest frequency this sample rate can tell apart; a non-positive rate is refused")


def alias_hz(f_sig, fs):
    """The frequency in [0, fs/2] that `f_sig` appears as after sampling at `fs`.

    Refuse (ValueError) a non-positive rate.
    """
    raise NotImplementedError("TODO 2: the frequency this tone appears as after sampling; a non-positive rate is refused")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
