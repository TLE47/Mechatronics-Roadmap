"""Exercise 00-foundations.T1.00e - the learner's file.

The spring's restoring force, Newton's second law, one step of the damped loop, the two energy
stores, the peak speed, the lever torque and the angular acceleration. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/00-foundations.T1.00e/starter.py \
        python3 -m unittest discover -s exercises/00-foundations.T1.00e -p 'test_*.py'
"""

import math

import mechalab_plant as plant


def spring_force(k_nm, x_m):
    """Hooke's law."""
    raise NotImplementedError("TODO 1: the spring pushes back against displacement - the minus is the whole spring")


def acceleration(force_n, mass_kg):
    """Newton's second law."""
    raise NotImplementedError("TODO 2: divide the net force by the mass")


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    """One symplectic Euler tick of the damped spring: return (x_new, v_new)."""
    raise NotImplementedError(
        "TODO 3: update the speed first, then move the position with that NEW speed - the order is the point"
    )


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    """Kinetic plus spring potential energy."""
    raise NotImplementedError("TODO 4: half the mass times v^2 PLUS half the stiffness times x^2")


def peak_speed(energy_j, m_kg):
    """The speed at the unstretched centre."""
    raise NotImplementedError("TODO 5: the speed at the centre, from the stored energy - a square root, and do not lose its factor of two")


def torque(force_n, r_m, phi_rad):
    """Lever torque."""
    raise NotImplementedError("TODO 6: Sine, because phi is the angle between arm and force")


def angular_acceleration(torque_nm, inertia_kg_m2):
    """tau = J alpha."""
    raise NotImplementedError("TODO 7: torque over inertia, never the other way round")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
