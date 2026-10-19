"""Exercise 00-foundations.T2.00i - the learner's file.

Where Tustin really places a frequency, the pre-warp that moves it back, and the biquad the five
coefficients run. Fill the four TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T2.00i/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T2.00i -p 'test_*.py'
"""


def tustin_hz(omega_rad_s, fs):
    """Where unwarped Tustin actually places an analog frequency, in Hz.

    Refuse (ValueError) a non-positive sample rate.
    """
    raise NotImplementedError("TODO 1: digital angle 2 atan(omega Ts / 2), then divide by 2 pi Ts")


def prewarp_omega(f0_hz, fs):
    """Analog prototype frequency that lands a Tustin filter exactly on f0_hz.

    Refuse (ValueError) a non-positive rate, or a target at or above fs/2.
    """
    raise NotImplementedError("TODO 2: (2 / Ts) tan(pi f0 / fs)")


def notch_coeffs(f0_hz, fs, q):
    """(b0, b1, b2, a1, a2) for a unity-gain notch at f0_hz with quality factor q; a0 is 1.

    Refuse (ValueError) a target outside (0, fs/2) or a non-positive quality factor.
    """
    raise NotImplementedError("TODO 3: alpha = sin(w0) / (2 q); b0 = b2 = 1 / (1 + alpha)")


def apply_biquad(coeffs, samples):
    """Run the TDF-II biquad over `samples` and return one output sample per input.

    Refuse (ValueError) a coefficient tuple that is not five numbers.
    """
    raise NotImplementedError("TODO 4: two delay states, w1 and w2, updated in that order")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
