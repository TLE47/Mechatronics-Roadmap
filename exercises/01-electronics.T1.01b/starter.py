"""Exercise 01-electronics.T1.01b - the learner's file.

A MOSFET's conduction loss, PWM's average voltage, the shoot-through current, the H-bridge's
differential drive, the two-switch bridge loss, the datasheet window and the duty that gets a
wanted average. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/01-electronics.T1.01b/starter.py \
        python3 -m unittest discover -s exercises/01-electronics.T1.01b -p 'test_*.py'
"""

import mechalab_plant as plant


def conduction_loss(current, rds_on, duty=1.0):
    """P = I^2 R_DS(on) D."""
    raise NotImplementedError("TODO 1: the current is squared, and the duty scales the average")


def pwm_effective_voltage(v_bus, duty):
    """V_eff = D * V_bus."""
    raise NotImplementedError("TODO 2: duty is a fraction in [0, 1] - refuse a percentage")


def shoot_through_current(v_bus, rds_on):
    """The leg's short-circuit current."""
    raise NotImplementedError("TODO 3: TWO switches in series, so twice the on-resistance")


def h_bridge_voltage(v_bus, duty_a, duty_b):
    """The average signed terminal voltage."""
    raise NotImplementedError("TODO 4: subtract the two duties before scaling")


def bridge_conduction_loss(current, r_high, r_low, duty=1.0):
    """Motor current crosses two switches."""
    raise NotImplementedError("TODO 5: add BOTH on-resistances")


def within_recommended(v_supply, v_min=2.7, v_max=10.8):
    """True inside the recommended operating window."""
    raise NotImplementedError("TODO 6: inclusive at both ends")


def duty_for_effective_voltage(v_eff, v_bus):
    """D = V_eff / V_bus."""
    raise NotImplementedError("TODO 7: refuse a demand above the bus")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
