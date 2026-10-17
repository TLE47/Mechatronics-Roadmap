"""Browser self-check for 00-foundations.T2.00e.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""


def _selfcheck():
    checks = 0

    a, b = companion_state_matrices(1.0, 100.0, 4.0)
    assert a == [[0.0, 1.0], [-100.0, -4.0]], "companion rows"
    assert b == [[0.0], [1.0]], "input vector"
    checks += 1

    l1, l2 = eigvals_2x2(a)
    assert abs(l1.real + 2.0) < 1e-12 and abs(l2.real + 2.0) < 1e-12, "real part -2"
    assert abs(abs(l1.imag) - 96.0 ** 0.5) < 1e-12, "imaginary part sqrt(96)"
    checks += 1

    assert is_stable(a), "the worked system is stable"
    assert not is_stable([[0.0, 1.0], [100.0, -4.0]]), "a negative stiffness is not"
    assert not is_stable([[-3.0, 0.0], [0.0, 1.0]]), "a saddle has a negative trace and is unstable"
    assert not is_stable([[0.0, 1.0], [-4.0, 0.0]]), "a marginal pole is not stable"
    checks += 1

    ad, bd = discretize_euler(a, b, 0.05)
    assert abs(ad[1][0] + 5.0) < 1e-12, "Euler stiffness term"
    assert abs(ad[1][1] - 0.8) < 1e-12, "Euler damping term"
    assert abs(bd[1][0] - 0.05) < 1e-12, "Euler input term"
    checks += 1

    at, bt = discretize_tustin(a, b, 0.05)
    assert abs(at[0][0] - 1.0375 / 1.1625) < 1e-12, "Tustin (1,1) entry"
    assert abs(at[1][0] + 5.0 / 1.1625) < 1e-12, "Tustin (2,1) entry"
    assert abs(at[1][1] - 0.8375 / 1.1625) < 1e-12, "Tustin (2,2) entry"
    assert abs(bt[1][0] - 0.05 / 1.1625) < 1e-12, "Tustin input term"
    checks += 1

    det_tustin = at[0][0] * at[1][1] - at[0][1] * at[1][0]
    det_euler = ad[0][0] * ad[1][1] - ad[0][1] * ad[1][0]
    assert det_tustin < 1.0, "a stable Tustin pole stays inside the unit circle"
    assert det_euler > 1.0, "Euler leaves it at the same step size"
    checks += 1

    diag, _ = discretize_tustin([[-1.0, 0.0], [0.0, -2.0]], [[0.0], [0.0]], 1.0)
    assert abs(diag[0][0] - 1.0 / 3.0) < 1e-12, "scalar bilinear map (1 + Ts a / 2) / (1 - Ts a / 2)"
    assert abs(diag[1][1] - 0.0) < 1e-12, "a pole at -2 maps to zero at Ts = 1"
    checks += 1

    final = simulate_discrete([[1.0, 0.1], [0.0, 0.9]], [[0.0], [0.0]], [0.0, 1.0], 0.0, 5)
    assert abs(final[1] - 0.9 ** 5) < 1e-12, "the second state decays as 0.9^k"
    assert abs(final[0] + final[1] - 1.0) < 1e-12, "the sum is invariant under this Ad"
    checks += 1

    print("SELF-CHECK PASS: %d checks - companion form, eigenvalues, stability incl. saddle and "
          "marginal, Euler, Tustin, unit circle, scalar bilinear map, discrete loop" % checks)


_selfcheck()
