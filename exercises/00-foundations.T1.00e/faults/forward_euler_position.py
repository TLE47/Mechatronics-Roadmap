"""Planted fault: position updated with the old velocity (forward Euler).

Everything else is the reference solution. At 0.5 ms this is invisible; at the 20 ms step the
behaviour suite uses, the energy grows about 1% per step and reaches ~144x the release energy
after 500 steps, where the module's `x += v_new*dt` ordering stays within a few percent.
"""

import math

import mechalab_plant as plant  # noqa: F401


def spring_force(k_nm, x_m):
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative: a spring pushes back, it does not run away")
    return -k_nm * x_m


def acceleration(force_n, mass_kg):
    if mass_kg <= 0.0:
        raise ValueError("mass must be positive")
    return force_n / mass_kg


def euler_step(x_m, v_ms, k_nm, b_nsm, m_kg, dt_s):
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if dt_s <= 0.0:
        raise ValueError("a time step must be positive")
    if k_nm < 0.0 or b_nsm < 0.0:
        raise ValueError("stiffness and damping cannot be negative")
    a_ms2 = (spring_force(k_nm, x_m) - b_nsm * v_ms) / m_kg
    v_new = v_ms + a_ms2 * dt_s
    x_new = x_m + v_ms * dt_s  # FAULT: the OLD velocity, i.e. forward Euler
    return x_new, v_new


def mechanical_energy(m_kg, v_ms, k_nm, x_m):
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if k_nm < 0.0:
        raise ValueError("stiffness cannot be negative")
    return 0.5 * m_kg * v_ms ** 2 + 0.5 * k_nm * x_m ** 2


def peak_speed(energy_j, m_kg):
    if m_kg <= 0.0:
        raise ValueError("mass must be positive")
    if energy_j < 0.0:
        raise ValueError("mechanical energy cannot be negative")
    return math.sqrt(2.0 * energy_j / m_kg)


def torque(force_n, r_m, phi_rad):
    if r_m < 0.0:
        raise ValueError("a lever arm is a distance")
    return r_m * force_n * math.sin(phi_rad)


def angular_acceleration(torque_nm, inertia_kg_m2):
    if inertia_kg_m2 <= 0.0:
        raise ValueError("rotational inertia must be positive")
    return torque_nm / inertia_kg_m2
