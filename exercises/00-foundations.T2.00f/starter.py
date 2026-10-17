"""Exercise 00-foundations.T2.00f - the learner's file.

Three tools a digital controller needs before it can trust a sample: what the Nyquist limit folds
high frequencies down to, where Tustin actually puts a frequency, and how an error ellipse grows
across one step. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00f/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00f -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def nyquist_hz(fs):
    """The highest frequency a sample rate `fs` can represent, in Hz."""
    raise NotImplementedError("TODO 1: fs / 2")


def alias_hz(f_sig, fs):
    """The frequency in [0, fs/2] that `f_sig` appears as after sampling at `fs`."""
    raise NotImplementedError("TODO 2: fold with fmod and mirror the second half down")


def tustin_hz(omega_rad_s, fs):
    """Where unwarped Tustin actually places an analog frequency, in Hz."""
    raise NotImplementedError("TODO 3: digital angle 2 atan(omega Ts / 2), then divide by 2 pi Ts")


def prewarp_omega(f0_hz, fs):
    """Analog prototype frequency that lands a Tustin filter exactly on f0_hz."""
    raise NotImplementedError("TODO 4: (2 / Ts) tan(pi f0 / fs)")


def notch_coeffs(f0_hz, fs, q):
    """(b0, b1, b2, a1, a2) for a unity-gain notch at f0_hz with quality factor q; a0 is 1."""
    raise NotImplementedError("TODO 5: alpha = sin(w0) / (2 q); b0 = b2 = 1 / (1 + alpha)")


def apply_biquad(coeffs, samples):
    """Run the TDF-II biquad over `samples` and return one output sample per input."""
    raise NotImplementedError("TODO 6: two delay states, w1 and w2, updated in that order")


def covariance_propagate(a, sigma, q):
    """One predict step: A Sigma A^T + Q, for 2x2 matrices."""
    raise NotImplementedError("TODO 7: the sandwich rule, both sides of Sigma")

def simulate_discrete(ad, bd, x0, u, steps):
    """Kept from 00e: iterate x_{k+1} = Ad x_k + Bd u with a constant u."""
    x = list(x0)
    for _ in range(steps):
        x = [sum(ad[i][j] * x[j] for j in range(2)) + bd[i][0] * u for i in range(2)]
    return x


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
