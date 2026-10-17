"""Exercise 01-electronics.T1.01b - reference solution.

A low-side MOSFET's conduction loss, a PWM duty cycle's average voltage, the shoot-through current
of a leg with no dead time, an H-bridge's differential drive, the two-switch conduction path, the
datasheet's recommended window and the duty that produces a wanted average.
"""

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def conduction_loss(current, rds_on, duty=1.0):
    """P = I^2 R_DS(on) D over one PWM period."""
    if rds_on < 0.0:
        raise ValueError("an on-resistance cannot be negative")
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1]")
    return current * current * rds_on * duty


def pwm_effective_voltage(v_bus, duty):
    """V_eff = D * V_bus."""
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1], not a percentage")
    return duty * v_bus


def shoot_through_current(v_bus, rds_on):
    """The leg's short-circuit current when both switches are on: V_bus / (2 R_DS(on))."""
    if rds_on <= 0.0:
        raise ValueError("an on-resistance must be positive")
    return v_bus / (2.0 * rds_on)


def h_bridge_voltage(v_bus, duty_a, duty_b):
    """The average signed terminal voltage: (D_A - D_B) V_bus."""
    for duty in (duty_a, duty_b):
        if not 0.0 <= duty <= 1.0:
            raise ValueError("each leg's duty is a fraction in [0, 1]")
    return (duty_a - duty_b) * v_bus


def bridge_conduction_loss(current, r_high, r_low, duty=1.0):
    """Motor current crosses TWO switches: P = I^2 (R_high + R_low) D."""
    if r_high < 0.0 or r_low < 0.0:
        raise ValueError("on-resistances cannot be negative")
    if not 0.0 <= duty <= 1.0:
        raise ValueError("duty is a fraction in [0, 1]")
    return current * current * (r_high + r_low) * duty


def within_recommended(v_supply, v_min=2.7, v_max=10.8):
    """True inside the datasheet's Recommended Operating Conditions."""
    if v_min <= 0.0 or v_max <= v_min:
        raise ValueError("the recommended window is a positive, increasing interval")
    return v_min <= v_supply <= v_max


def duty_for_effective_voltage(v_eff, v_bus):
    """D = V_eff / V_bus, refusing a demand the bus cannot deliver."""
    if v_bus <= 0.0:
        raise ValueError("the bus voltage must be positive")
    duty = v_eff / v_bus
    if not 0.0 <= duty <= 1.0:
        raise ValueError("that average voltage is outside what this bus can produce")
    return duty


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
