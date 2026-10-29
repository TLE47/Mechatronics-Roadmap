"""Exercise 03-sensors.T1.03a - the learner's file.

Torque from current, back-EMF from speed, pole pairs from magnets, the electrical angle, the
quadrature count and its resolution, and one Gray-code step. Fill the eight TODOs:

    EXERCISE_TARGET=exercises/03-sensors.T1.03a/starter.py \
        python3 -m unittest discover -s exercises/03-sensors.T1.03a -p 'test_*.py'
"""

import math

TAU = 2.0 * math.pi


def back_emf(ke_v_s_rad, omega_m_rad_s):
    """The voltage the motor generates at this speed, in volts."""
    raise NotImplementedError("TODO 1: the voltage the rotor generates at this speed")


def winding_current(v_term_v, omega_m_rad_s, ke_v_s_rad, r_ohm):
    """The current through the winding at this terminal voltage and speed, in amperes."""
    raise NotImplementedError("TODO 2: the winding current at this terminal voltage and speed")


def motor_torque(kt_nm_a, current_a):
    """The torque this current produces, in N·m."""
    raise NotImplementedError("TODO 3: the torque this current produces")


def pole_pairs(n_poles):
    """Number of North-South magnet pairs."""
    raise NotImplementedError("TODO 4: the number of North-South magnet pairs these magnets make")


def electrical_angle(theta_m_rad, p):
    """The electrical angle for this mechanical angle, wrapped into one electrical cycle."""
    raise NotImplementedError("TODO 5: the electrical angle, wrapped into one electrical cycle")


def quadrature_cpr(n_lines):
    """Counts per mechanical revolution, 4x decoded."""
    raise NotImplementedError("TODO 6: the counts a full revolution produces with quadrature decoding")


def angle_resolution(counts_per_rev):
    """(radians, degrees) per count."""
    raise NotImplementedError("TODO 7: the angle one count represents, in radians and in degrees")


def quad_step(prev_ab, curr_ab):
    """+1 forward, -1 reverse, 0 for no change or an invalid two-bit jump."""
    raise NotImplementedError("TODO 8: the direction of a valid one-bit step, and zero for anything else")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
