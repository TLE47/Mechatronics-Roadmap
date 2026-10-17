"""Exercise 00-foundations.T2.00a - reference solution.

Encoder counts to joint velocity, velocity back to angle, and the plant as one matrix step. The two
halves meet: `encoder_trace_angle` must return the encoder's own angle, because a backward
difference integrated forward telescopes - that is why a discrete derivative and a running integral
are inverse operations, and why the state vector can carry velocity at all.
"""

import math

import mechalab_plant as plant


def joint_velocity(counts, dt, cpr=plant.ENCODER_CPR):
    """Backward-difference joint speed in rad/s, wrapped across the encoder's zero."""
    velocities = [0.0]
    for k in range(1, len(counts)):
        previous = plant.counts_to_rad(counts[k - 1], cpr=cpr)
        current = plant.counts_to_rad(counts[k], cpr=cpr)
        velocities.append(plant.wrap_pi(current - previous) / dt)
    return velocities


def running_integral(values, dt):
    """Rectangular running integral, same length as the input."""
    out = []
    total = 0.0
    for value in values:
        total += value * dt
        out.append(total)
    return out


def state_matrices(m, k, b, dt):
    """The discrete transition and input matrices for the mass-spring-damper."""
    Ad = [[1.0, dt],
          [-(k / m) * dt, 1.0 - (b / m) * dt]]
    Bd = [0.0, dt / m]
    return Ad, Bd


def one_step(Ad, Bd, x, u):
    """Both new components from the old state - the order bug is a real one."""
    x1 = Ad[0][0] * x[0] + Ad[0][1] * x[1] + Bd[0] * u
    v1 = Ad[1][0] * x[0] + Ad[1][1] * x[1] + Bd[1] * u
    return [x1, v1]


def simulate(Ad, Bd, x0, u, steps):
    """Constant-input run of the matrix update."""
    x = [x0[0], x0[1]]
    for _ in range(steps):
        x = one_step(Ad, Bd, x, u)
    return x


def encoder_trace_angle(counts, dt, cpr=plant.ENCODER_CPR):
    """counts -> velocity -> integral, added back onto the first sample."""
    start = plant.counts_to_rad(counts[0], cpr=cpr)
    return [start + value for value in running_integral(joint_velocity(counts, dt, cpr=cpr), dt)]


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
