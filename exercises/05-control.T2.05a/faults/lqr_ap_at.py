"""Planted fault: the Riccati recursion uses `A P A^T` where `A^T P A` belongs.

For a companion matrix the two differ, and the position gain collapses: the recursion still reaches
a fixed point, the closed-loop radius still rounds to 1, and the regulated joint simply does not
move - which is why the transfer test runs the loop instead of reading the matrix.
"""

import cmath
import math

import mechalab_plant as plant  # noqa: F401  (imported so the fault matches the submission shape)


def phase_margin_deg(loop):
    phase = math.degrees(cmath.phase(loop))
    if phase > 0.0:
        phase -= 360.0
    return 180.0 + phase


def phase_loss_deg(omega_gc, tau_d):
    return math.degrees(omega_gc * tau_d)


def st(loop):
    return 1.0 / (1.0 + loop), loop / (1.0 + loop)


def gain_crossover(loop_fn, w_lo=1e-3, w_hi=1e4, iterations=200):
    f_lo = abs(loop_fn(w_lo)) - 1.0
    f_hi = abs(loop_fn(w_hi)) - 1.0
    if f_lo * f_hi > 0.0:
        raise ValueError("no crossing")
    for _ in range(iterations):
        mid = 0.5 * (w_lo + w_hi)
        f_mid = abs(loop_fn(mid)) - 1.0
        if f_lo * f_mid < 0.0:
            w_hi = mid
        else:
            w_lo = mid
            f_lo = f_mid
    return 0.5 * (w_lo + w_hi)


def bryson_weights(x_max, u_max):
    return [1.0 / (value * value) for value in x_max], 1.0 / (u_max * u_max)


def observer_spectral_radius(ad, c, l):
    m = [[ad[i][j] - l[i] * c[j] for j in range(2)] for i in range(2)]
    tr = m[0][0] + m[1][1]
    det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return max(abs(0.5 * (tr + disc)), abs(0.5 * (tr - disc)))


def lqr_gain(ad, bd, q_diag, r):
    b = [bd[0][0], bd[1][0]]
    p = [[q_diag[0], 0.0], [0.0, q_diag[1]]]
    for _ in range(500):
        pb = [p[i][0] * b[0] + p[i][1] * b[1] for i in range(2)]
        bpb = b[0] * pb[0] + b[1] * pb[1]
        gain = [pb[0] / (r + bpb), pb[1] / (r + bpb)]
        apa = [[sum(ad[i][k] * p[k][m] * ad[j][m] for k in range(2) for m in range(2))
                for j in range(2)] for i in range(2)]
        p = [[apa[i][j] - gain[i] * (r + bpb) * gain[j] + (q_diag[i] if i == j else 0.0)
              for j in range(2)] for i in range(2)]
    pb = [p[i][0] * b[0] + p[i][1] * b[1] for i in range(2)]
    bpb = b[0] * pb[0] + b[1] * pb[1]
    gain = [pb[0] / (r + bpb), pb[1] / (r + bpb)]
    return [sum(gain[k] * ad[k][j] for k in range(2)) for j in range(2)]
