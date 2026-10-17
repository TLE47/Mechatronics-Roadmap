"""Exercise 00-foundations.T1.00e - reference solution.

The module's fifteen-line simulation, one named function per line of it: the spring's restoring
force, Newton's second law, one symplectic Euler tick of the damped loop, the two energy stores,
the peak speed an energy budget buys, the lever torque and the angular acceleration it produces.
"""

import math

import mechalab_plant as plant  # noqa: F401  (the same import the module's workbench entry uses)


def spring_force(k_nm, x_m):
    """Hooke's law: F = -k x, so the force always points back at the unstretched centre."""
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative: a spring pushes back, it does not run away")
    return -k_nm * x_m


def acceleration(force_n, mass_kg):
    """Newton's second law: a = F_net / m."""
    if mass_kg <= 0.0:
        raise ValueError("mass must be positive")
    return force_n / mass_kg


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    """One symplectic Euler tick of the damped spring: (x, v) -> (x_new, v_new).

    Velocity first, then position using the *new* velocity. That ordering is what keeps the energy
    bounded; a position updated with the old velocity gains energy on every step and explodes.
    """
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if dt_s <= 0.0:
        raise ValueError("a time step must be positive")
    if k_nm < 0.0 or b_nsm < 0.0:
        raise ValueError("stiffness and damping cannot be negative")
    # Newton's second law with both forces: the spring pulls back, the damper opposes the motion.
    a_ms2 = (spring_force(k_nm, x_m) - b_nsm * v_ms) / m_kg
    v_new = v_ms + a_ms2 * dt_s
    x_new = x_m + v_new * dt_s
    return x_new, v_new


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    """E = 1/2 m v^2 + 1/2 k x^2, in joules."""
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative")
    return 0.5 * m_kg * v_ms ** 2 + 0.5 * k_nm * x_m ** 2


def peak_speed(energy_j, m_kg):
    """The speed all of E becomes at the unstretched centre: v = sqrt(2 E / m)."""
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if energy_j < 0.0:
        raise ValueError("mechanical energy cannot be negative")
    return math.sqrt(2.0 * energy_j / m_kg)


def torque(force_n, r_m, phi_rad):
    """tau = r F sin(phi), with phi the angle between the lever arm and the force."""
    if r_m < 0.0:
        raise ValueError("a lever arm is a distance")
    return r_m * force_n * math.sin(phi_rad)


def angular_acceleration(torque_nm, inertia_kg_m2):
    """tau = J alpha, so alpha = tau / J."""
    if inertia_kg_m2 <= 0.0:
        raise ValueError("rotational inertia must be positive")
    return torque_nm / inertia_kg_m2


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
