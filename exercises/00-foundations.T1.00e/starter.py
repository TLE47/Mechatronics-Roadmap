"""Exercise 00-foundations.T1.00e - the learner's file.

The spring's restoring force, Newton's second law, one step of the damped loop, the two energy
stores, the peak speed, the lever torque and the angular acceleration. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00e/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00e -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def spring_force(k_nm, x_m):
    """The force the spring exerts at this displacement."""
    raise NotImplementedError("TODO 1: the force the spring exerts at this displacement — it always points back toward the centre")


def acceleration(force_n, mass_kg):
    """The acceleration this net force produces, in m/s^2."""
    raise NotImplementedError("TODO 2: the acceleration this force produces")


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    """One tick of the damped spring: return the new position and speed."""
    raise NotImplementedError("TODO 3: one tick of the damped spring, returning the new position and speed")


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    """The total mechanical energy at this position and speed, in joules."""
    raise NotImplementedError("TODO 4: the total mechanical energy at this position and speed")


def peak_speed(energy_j, m_kg):
    """The speed at the unstretched centre."""
    raise NotImplementedError("TODO 5: the speed at the unstretched centre, from the energy the spring released")


def torque(force_n, r_m, phi_rad):
    """The torque this force produces at this lever arm and angle, in N*m."""
    raise NotImplementedError("TODO 6: the torque this force produces at this lever arm and angle")


def angular_acceleration(torque_nm, inertia_kg_m2):
    """The angular acceleration this torque produces, in rad/s^2."""
    raise NotImplementedError("TODO 7: the angular acceleration this torque produces")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
