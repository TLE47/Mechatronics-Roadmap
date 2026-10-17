"""Exercise 05-control.T2.05a - reference solution.

Margins, the waterbed identity, Bryson's weights, an observer's error matrix and a discrete LQR
gain: five tools that turn "tune until it looks right" into arithmetic. The one subtlety in this
file is the phase wrap - a loop that has already passed -180 degrees reports its phase as positive,
and a margin computed from that principal value comes back as 340 degrees of "safety".
"""

import cmath
import math

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def phase_margin_deg(loop):
    """Phase margin at a gain crossover, with the loop's lag unwrapped into (-360, 0].

    `cmath.phase` returns the principal value, so a loop lagging 200 degrees reads +160 and a naive
    `180 + phase` would report +340 degrees of margin where the truth is -20.
    """
    phase = math.degrees(cmath.phase(loop))
    if phase > 0.0:
        phase -= 360.0
    return 180.0 + phase


def phase_loss_deg(omega_gc, tau_d):
    """Degrees of phase a pure transport delay of `tau_d` seconds eats at `omega_gc`."""
    return math.degrees(omega_gc * tau_d)


def st(loop):
    """The sensitivity pair `S = 1/(1+L)` and `T = L/(1+L)`, whose sum is exactly one."""
    s = 1.0 / (1.0 + loop)
    t = loop / (1.0 + loop)
    return s, t


def _magnitude_error(loop_fn, omega):
    return abs(loop_fn(omega)) - 1.0


def gain_crossover(loop_fn, w_lo=1e-3, w_hi=1e4, iterations=200):
    """Bisect for the frequency where |L(jw)| = 1; raise ValueError if the bracket has no crossing."""
    f_lo = _magnitude_error(loop_fn, w_lo)
    f_hi = _magnitude_error(loop_fn, w_hi)
    if f_lo == 0.0:
        return w_lo
    if f_hi == 0.0:
        return w_hi
    if f_lo * f_hi > 0.0:
        raise ValueError("|L| does not cross 1 between %g and %g rad/s" % (w_lo, w_hi))
    for _ in range(iterations):
        mid = 0.5 * (w_lo + w_hi)
        f_mid = _magnitude_error(loop_fn, mid)
        if f_mid == 0.0:
            return mid
        if f_lo * f_mid < 0.0:
            w_hi = mid
            f_hi = f_mid
        else:
            w_lo = mid
            f_lo = f_mid
        if w_hi - w_lo <= 1e-12 * max(1.0, w_hi):
            break
    return 0.5 * (w_lo + w_hi)


def bryson_weights(x_max, u_max):
    """Bryson's rule: `Q_ii = 1/x_max_i^2`, `R = 1/u_max^2`."""
    q_diag = [1.0 / (value * value) for value in x_max]
    return q_diag, 1.0 / (u_max * u_max)


def observer_spectral_radius(ad, c, l):
    """Spectral radius of the observer error matrix `Ad - L C`, for 2 states and 1 measurement."""
    m = [[ad[i][j] - l[i] * c[j] for j in range(2)] for i in range(2)]
    tr = m[0][0] + m[1][1]
    det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    disc = cmath.sqrt(tr * tr - 4.0 * det)
    return max(abs(0.5 * (tr + disc)), abs(0.5 * (tr - disc)))


def _dare(ad, bd, q_diag, r, iterations=500, tol=1e-12):
    """Iterate the discrete Riccati recursion to its fixed point; P is (2,2), B is (2,1)."""
    b = [bd[0][0], bd[1][0]]
    p = [[q_diag[0], 0.0], [0.0, q_diag[1]]]
    for _ in range(iterations):
        pb = [p[i][0] * b[0] + p[i][1] * b[1] for i in range(2)]
        bpb = b[0] * pb[0] + b[1] * pb[1]
        gain = [pb[0] / (r + bpb), pb[1] / (r + bpb)]
        # A^T P A, not A P A^T: the two differ for any non-symmetric A, and a companion matrix is
        # exactly that - the transposed product leaves the position gain near zero.
        apa = [[0.0, 0.0], [0.0, 0.0]]
        for i in range(2):
            for j in range(2):
                apa[i][j] = sum(ad[k][i] * p[k][m] * ad[m][j] for k in range(2) for m in range(2))
        apb = [sum(ad[i][k] * pb[k] for k in range(2)) for i in range(2)]
        new = [[apa[i][j] - gain[i] * (r + bpb) * gain[j] + (q_diag[i] if i == j else 0.0)
                for j in range(2)] for i in range(2)]
        change = max(abs(new[i][j] - p[i][j]) for i in range(2) for j in range(2))
        p = new
        if change < tol:
            break
    pb = [p[i][0] * b[0] + p[i][1] * b[1] for i in range(2)]
    bpb = b[0] * pb[0] + b[1] * pb[1]
    gain = [pb[0] / (r + bpb), pb[1] / (r + bpb)]
    return [sum(gain[k] * ad[k][j] for k in range(2)) for j in range(2)]


def lqr_gain(ad, bd, q_diag, r):
    """Discrete LQR gain for `u = -K x`, from the Riccati fixed point."""
    return _dare(ad, bd, q_diag, r)


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
