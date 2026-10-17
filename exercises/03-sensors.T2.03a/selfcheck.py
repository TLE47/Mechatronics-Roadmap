"""Browser self-check for 03-sensors.T2.03a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math


def _selfcheck():
    checks = 0

    ia, ib = 6.0, -2.0
    assert abs(third_phase(ia, ib) + 4.0) < 1e-15, "the neutral point gives i_c"
    alpha, beta = clarke(ia, ib)
    assert abs(alpha - 6.0) < 1e-12 and abs(beta - 2.0 / math.sqrt(3.0)) < 1e-12, "Clarke"
    assert abs(math.hypot(alpha, beta) - 6.110101) < 1e-5, "vector magnitude"
    checks += 1

    i_d, i_q = park(5.0, 0.0, math.pi / 2.0)
    assert abs(i_d) < 1e-12 and abs(i_q + 5.0) < 1e-12, "a quarter turn about the rotor"
    checks += 1

    theta = 0.85
    ia = -10.0 * math.sin(theta)
    ib = -10.0 * math.sin(theta - 2.0 * math.pi / 3.0)
    alpha, beta = clarke(ia, ib)
    i_d, i_q = park(alpha, beta, theta)
    assert abs(i_d) < 1e-9 and abs(i_q - 10.0) < 1e-9, "quadrature current demodulates to DC"
    checks += 1

    alpha2, beta2 = inverse_park(3.0, -4.0, 1.1)
    i_d2, i_q2 = park(alpha2, beta2, 1.1)
    assert abs(i_d2 - 3.0) < 1e-12 and abs(i_q2 + 4.0) < 1e-12, "Park is a rotation"
    checks += 1

    assert abs(wrap_pi(2.0 * math.pi + 0.1) - 0.1) < 1e-12, "rollover"
    assert abs(wrap_pi(-10.0) - (-10.0 + 4.0 * math.pi)) < 1e-9, "two full turns back"
    assert abs(wrap_pi(math.pi) - math.pi) < 1e-12, "pi is inside (-pi, pi]"
    checks += 1

    omega = 100.0
    zeta, wn = 0.9, 2.0 * math.pi * 30.0
    kp, ki = 2.0 * zeta * wn, wn * wn
    dt = 1e-4
    theta_hat, omega_hat = 0.0, 0.0
    theta = 0.0
    for _ in range(3000):
        theta = wrap_pi(theta + omega * dt)
        theta_hat, omega_hat = pll_step(theta_hat, omega_hat, theta, kp, ki, dt)
    assert abs(omega_hat - omega) < 0.01 * omega, "the loop locks onto the speed"
    checks += 1

    tau_hat, omega_hat = pll_step(wrap_pi(2.0 * math.pi - 0.01), 1.0, 0.01, 200.0, 5000.0, 1e-3)
    assert abs(omega_hat - 1.0) < 0.5, "a rollover must not spike the velocity"
    checks += 1

    assert abs(allan_deviation(0.02, 100.0) - 0.002) < 1e-15, "tau^-1/2"
    assert abs(allan_deviation(0.02, 1.0) / allan_deviation(0.02, 100.0) - 10.0) < 1e-9, "a decade"
    checks += 1

    print("SELF-CHECK PASS: %d checks - Clarke and the third phase, Park at a quarter turn, "
          "quadrature demodulation, the inverse, the wrap, the PLL lock and its rollover, "
          "and the averaging law" % checks)


_selfcheck()
