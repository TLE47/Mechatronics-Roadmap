"""Exercise 03-sensors.T1.03a - the learner's file.

Torque from current, back-EMF from speed, pole pairs from magnets, the electrical angle, the
quadrature count and its resolution, and one Gray-code step. Fill the eight TODOs:

    EXERCISE_TARGET=exercises/03-sensors.T1.03a/starter.py \
        python3 -m unittest discover -s exercises/03-sensors.T1.03a -p 'test_*.py'
"""

import math

TAU = 2.0 * math.pi


def back_emf(ke_v_s_rad, omega_m_rad_s):
    """v_bemf = Ke * omega_m in volts."""
    raise NotImplementedError("TODO 1: the EMF is the constant TIMES the speed")


def winding_current(v_term_v, omega_m_rad_s, ke_v_s_rad, r_ohm):
    """i = (V_term - Ke omega_m) / R in amperes."""
    raise NotImplementedError("TODO 2: subtract the back-EMF before dividing by R")


def motor_torque(kt_nm_a, current_a):
    """tau = Kt * i in N*m."""
    raise NotImplementedError("TODO 3: torque is the constant times the current")


def pole_pairs(n_poles):
    """Number of North-South magnet pairs."""
    raise NotImplementedError("TODO 4: 14P is 14 MAGNETS, so p = 14 / 2 = 7")


def electrical_angle(theta_m_rad, p):
    """theta_e = (p * theta_m) mod 2*pi, wrapped into [0, 2*pi)."""
    raise NotImplementedError("TODO 5: multiply by p, then wrap into one electrical cycle")


def quadrature_cpr(n_lines):
    """Counts per mechanical revolution, 4x decoded."""
    raise NotImplementedError("TODO 6: four edges per line, not one")


def angle_resolution(counts_per_rev):
    """(radians, degrees) per count."""
    raise NotImplementedError("TODO 7: 2*pi / CPR radians, 360 / CPR degrees")


def quad_step(prev_ab, curr_ab):
    """+1 forward, -1 reverse, 0 for no change or an invalid two-bit jump."""
    raise NotImplementedError("TODO 8: only ONE bit may change in a valid step")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
