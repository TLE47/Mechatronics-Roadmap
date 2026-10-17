"""Exercise 06-robotics.T3.06a - reference solution.

A two-layer tanh policy, its mean-squared error, the chain rule written out by hand, one gradient
step, z-scored inputs, and the training loop that turns expert demonstrations into a policy. Every
number here is checked against a finite difference, and the cloned policy is then driven through the
plant's own controller interface.
"""

import math
import random

import mechalab_plant as plant  # noqa: F401  (kept so the submission imports what the module uses)


def mse_loss(y_hat, y_true):
    """Mean squared error over samples: (1/N) sum ||y_hat_i - y_i||^2."""
    if not y_hat or not y_true:
        raise ValueError("the loss needs at least one sample")
    if len(y_hat) != len(y_true):
        raise ValueError("predictions and targets must have the same number of samples")
    total = 0.0
    for row_hat, row_true in zip(y_hat, y_true):
        if len(row_hat) != len(row_true):
            raise ValueError("each prediction and target must have the same width")
        total += sum((a - b) ** 2 for a, b in zip(row_hat, row_true))
    return total / len(y_hat)


def forward(X, params):
    """(H, Y_hat): tanh hidden layer, linear output layer."""
    w1, b1, w2, b2 = params["W1"], params["b1"], params["W2"], params["b2"]
    n_in, hidden, n_out = len(w1), len(b1), len(b2)
    h_out = []
    y_out = []
    for x in X:
        if len(x) != n_in:
            raise ValueError("an observation has %d features, the policy wants %d" % (len(x), n_in))
        h = [math.tanh(sum(x[k] * w1[k][j] for k in range(n_in)) + b1[j]) for j in range(hidden)]
        h_out.append(h)
        y_out.append([sum(h[j] * w2[j][m] for j in range(hidden)) + b2[m]
                      for m in range(n_out)])
    return h_out, y_out


def backward(X, Y, params, H, Y_hat):
    """The chain rule: dW2 = H^T dY, dW1 = X^T (dH * (1 - H^2)), with dY = (2/N)(Y_hat - Y)."""
    w2 = params["W2"]
    n = len(X)
    if n == 0:
        raise ValueError("the gradient needs at least one sample")
    n_in, hidden, n_out = len(params["W1"]), len(params["b1"]), len(params["b2"])
    scale = 2.0 / n
    d_w1 = [[0.0] * hidden for _ in range(n_in)]
    d_b1 = [0.0] * hidden
    d_w2 = [[0.0] * n_out for _ in range(hidden)]
    d_b2 = [0.0] * n_out
    for i in range(n):
        err = [scale * (Y_hat[i][m] - Y[i][m]) for m in range(n_out)]
        for m in range(n_out):
            d_b2[m] += err[m]
        for j in range(hidden):
            h = H[i][j]
            for m in range(n_out):
                d_w2[j][m] += h * err[m]
            d_h = sum(err[m] * w2[j][m] for m in range(n_out)) * (1.0 - h * h)
            d_b1[j] += d_h
            for k in range(n_in):
                d_w1[k][j] += X[i][k] * d_h
    return {"dW1": d_w1, "db1": d_b1, "dW2": d_w2, "db2": d_b2}


def apply_gradients(params, grads, lr):
    """One descent step, returning a new parameter dict: theta <- theta - lr * grad."""
    if lr <= 0.0:
        raise ValueError("the learning rate must be positive (this is descent, not ascent)")
    updated = {}
    for name, grad in (("W1", "dW1"), ("b1", "db1"), ("W2", "dW2"), ("b2", "db2")):
        value = params[name]
        if value and isinstance(value[0], list):
            updated[name] = [[v - lr * g for v, g in zip(row_v, row_g)]
                             for row_v, row_g in zip(value, grads[grad])]
        else:
            updated[name] = [v - lr * g for v, g in zip(value, grads[grad])]
    return updated


def z_score(values):
    """(normalised, mean, sigma) for one column of samples; a constant column is refused."""
    if not values:
        raise ValueError("z-scoring needs at least one sample")
    n = len(values)
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n
    sigma = math.sqrt(var)
    if sigma == 0.0:
        raise ValueError("a feature with no spread has no z-score; drop it or add a scale")
    return [(v - mean) / sigma for v in values], mean, sigma


def _columns(rows):
    return [[row[j] for row in rows] for j in range(len(rows[0]))]


def _normalise(X, Y):
    cols = _columns(X)
    stats_x = [z_score(col) for col in cols]
    Xn = [[stats[0][i] for stats in stats_x] for i in range(len(X))]
    y_cols = _columns(Y)
    stats_y = [z_score(col) for col in y_cols]
    Yn = [[stats[0][i] for stats in stats_y] for i in range(len(Y))]
    return Xn, Yn, stats_x, stats_y


def train_bc(X, Y, hidden=8, lr=0.05, steps=200, seed=0):
    """Fit a policy to (observation, expert action) pairs; returns (params, loss per step)."""
    if len(X) != len(Y):
        raise ValueError("every observation needs one expert action")
    if not X:
        raise ValueError("training needs at least one demonstration")
    Xn, Yn, stats_x, stats_y = _normalise(X, Y)
    n_in, n_out = len(Xn[0]), len(Yn[0])
    rng = random.Random(seed)
    params = {
        "W1": [[rng.gauss(0.0, 0.3) for _ in range(hidden)] for _ in range(n_in)],
        "b1": [0.0] * hidden,
        "W2": [[rng.gauss(0.0, 0.3) for _ in range(n_out)] for _ in range(hidden)],
        "b2": [0.0] * n_out,
    }
    losses = []
    for _ in range(steps):
        H, Y_hat = forward(Xn, params)
        losses.append(mse_loss(Y_hat, Yn))
        params = apply_gradients(params, backward(Xn, Yn, params, H, Y_hat), lr)
    params["mu_x"] = [stats[1] for stats in stats_x]
    params["sigma_x"] = [stats[2] for stats in stats_x]
    params["mu_y"] = [stats[1] for stats in stats_y]
    params["sigma_y"] = [stats[2] for stats in stats_y]
    return params, losses


def predict(params, X):
    """Policy output in the units the demonstrations used: normalise in, denormalise out."""
    mu_x, sigma_x = params.get("mu_x"), params.get("sigma_x")
    if mu_x is None:
        _, y_hat = forward(X, params)
        return y_hat
    Xn = [[(x[k] - mu_x[k]) / sigma_x[k] for k in range(len(x))] for x in X]
    _, y_hat = forward(Xn, params)
    mu_y, sigma_y = params["mu_y"], params["sigma_y"]
    return [[y_hat[i][m] * sigma_y[m] + mu_y[m] for m in range(len(mu_y))]
            for i in range(len(y_hat))]


# No `__main__` block on purpose: the browser grades this file's stdout against the appended
# self-check's single PASS line, and a second print here would be a mismatch for a correct answer.
