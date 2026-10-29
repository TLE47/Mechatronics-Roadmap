"""Exercise 01-electronics.T1.01b - the learner's file.

A MOSFET's conduction loss, PWM's average voltage, the shoot-through current, the H-bridge's
differential drive, the two-switch bridge loss, the datasheet window and the duty that gets a
wanted average. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01b/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01b -p 'test_*.py'
"""

import mechalab_plant as plant


def conduction_loss(current, rds_on, duty=1.0):
    """The conduction loss in this switch at this current and duty."""
    raise NotImplementedError("TODO 1: the heat the switch makes at this current and duty")


def pwm_effective_voltage(v_bus, duty):
    """The average voltage this duty gives from the bus."""
    raise NotImplementedError("TODO 2: the average voltage this duty gives; a percentage is not a duty")


def shoot_through_current(v_bus, rds_on):
    """The leg's short-circuit current."""
    raise NotImplementedError("TODO 3: the current a straight-through leg would draw")


def h_bridge_voltage(v_bus, duty_a, duty_b):
    """The average signed terminal voltage."""
    raise NotImplementedError("TODO 4: the average voltage across the motor, in the direction the sign names")


def bridge_conduction_loss(current, r_high, r_low, duty=1.0):
    """Motor current crosses two switches."""
    raise NotImplementedError("TODO 5: the heat both switches make while the motor current crosses the leg")


def within_recommended(v_supply, v_min=2.7, v_max=10.8):
    """True inside the recommended operating window."""
    raise NotImplementedError("TODO 6: whether the supply is inside the datasheet's recommended window, both ends included")


def duty_for_effective_voltage(v_eff, v_bus):
    """The duty that reaches this average voltage."""
    raise NotImplementedError("TODO 7: the duty that reaches this average voltage, and a demand the bus cannot meet is an error")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
