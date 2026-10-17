"""Browser self-check for 05-control.T2.05a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import cmath
import math


def _selfcheck():
    checks = 0

    def loop(omega):
        s = 1j * omega
        return 100.0 / (s * (0.01 * s + 1.0))

    w_gc = gain_crossover(loop)
    assert abs(w_gc - 78.6151) < 1e-3, "gain crossover"
    assert abs(abs(loop(w_gc)) - 1.0) < 1e-9, "the crossover really is unity gain"
    checks += 1

    pm = phase_margin_deg(loop(w_gc))
    assert abs(pm - 51.8273) < 1e-3, "phase margin"
    lagging = cmath.rect(0.9, math.radians(-200.0))
    assert abs(phase_margin_deg(lagging) + 20.0) < 1e-9, "a loop past -180 has negative margin"
    checks += 1

    loss = phase_loss_deg(78.61514, 0.005)
    assert abs(loss - 22.5216) < 1e-2, "5 ms of transport delay"
    assert abs(phase_margin_deg(loop(w_gc)) - loss - 29.3057) < 1e-2, "the margin after the delay"
    checks += 1

    s, t = st(loop(w_gc))
    assert abs((s + t) - 1.0) < 1e-12, "S + T = 1"
    assert abs(abs(s) - 1.1441) < 1e-3, "sensitivity at crossover"
    checks += 1

    q_diag, r = bryson_weights([0.05, 0.10], 5.0)
    assert abs(q_diag[0] - 400.0) < 1e-9 and abs(q_diag[1] - 100.0) < 1e-9, "Bryson Q"
    assert abs(r - 0.04) < 1e-12, "Bryson R"
    checks += 1

    radius = observer_spectral_radius([[1.0, 0.001], [0.0, 0.99]], [1.0, 0.0], [0.19, 9.0])
    assert abs(radius - math.sqrt(0.8109)) < 1e-3, "observer error radius"
    assert radius < 1.0, "the observer must converge"
    checks += 1

    ad_model = [[1.0, 0.001], [0.0, 0.99]]
    b_model = [0.0, 0.001]
    k = lqr_gain(ad_model, [[0.0], [0.001]], [1.0, 1.0], 1.0)
    m = [[ad_model[i][j] - b_model[i] * k[j] for j in range(2)] for i in range(2)]
    tr = m[0][0] + m[1][1]
    det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    rho = max(abs(0.5 * (tr + disc)), abs(0.5 * (tr - disc)))
    assert rho < 1.0, "the LQR gain stabilises the model"
    assert k[0] > 0.0 and k[1] > 0.0, "both states are fed back"
    checks += 1

    print("SELF-CHECK PASS: %d checks - crossover, margin and its unwrap, delay loss, S + T, "
          "Bryson weights, observer radius and the LQR gain" % checks)


_selfcheck()
