"""Exercise 01-electronics.T2.01a - the learner's file.

The bidirectional current-sense stage: the shunt drop centred on a mid-rail reference, the inverse
that recovers the current, the current at which the output clips, the gain error a 2-terminal
layout adds, CMRR as an input-referred error, and the 12-bit code the ADC reports. Fill the seven
TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T2.01a/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T2.01a -p 'test_*.py'
"""

import mechalab_plant as plant  # noqa: F401  (the plant is on the path for the transfer suite)


def shunt_adc_voltage(i_amp, r_shunt, gain=20.0, v_ref=1.65):
    """The ADC voltage this current produces through the shunt, around the reference."""
    raise NotImplementedError("TODO 1: the ADC voltage this current produces, around the reference")


def shunt_current_from_adc(v_adc, r_shunt, gain=20.0, v_ref=1.65):
    """The current this ADC voltage represents."""
    raise NotImplementedError("TODO 2: the current this ADC voltage represents")


def max_measurable_current(v_ref, v_rail, gain, r_shunt):
    """The positive current that just reaches the rail."""
    raise NotImplementedError("TODO 3: the largest positive current the output can still carry")


def kelvin_gain_error_pct(r_shunt, r_trace):
    """The gain error, as a percentage, that this much trace resistance adds."""
    raise NotImplementedError("TODO 4: the gain error this trace resistance adds, as a percentage")


def cmrr_input_error_v(delta_v_cm, cmrr_db):
    """The common-mode step, referred back to the amplifier input."""
    raise NotImplementedError("TODO 5: the common-mode step referred back to the amplifier input")


def cmrr_current_error_a(delta_v_cm, cmrr_db, r_shunt):
    """The same residue as a misread current."""
    raise NotImplementedError("TODO 6: that same residue as a misread current")


def adc_code(v_adc, v_rail=3.3, bits=12):
    """The unipolar code, rounded and clamped to full scale."""
    raise NotImplementedError("TODO 7: the unipolar ADC code, rounded and held to full scale")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
