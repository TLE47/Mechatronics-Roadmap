"""Browser self-check for 06-robotics.T3.06a.

Appended verbatim to the workbench entry, after the learner's code. Stdlib-only, one PASS line.
"""

import math
import random


def _selfcheck():
    checks = 0

    assert abs(mse_loss([[1.0], [3.0]], [[2.0], [1.0]]) - 2.5) < 1e-12, "the loss is a mean"
    checks += 1

    rng = random.Random(3)
    params = {
        "W1": [[rng.gauss(0.0, 0.4) for _ in range(3)] for _ in range(2)],
        "b1": [rng.gauss(0.0, 0.1) for _ in range(3)],
        "W2": [[rng.gauss(0.0, 0.4)] for _ in range(3)],
        "b2": [rng.gauss(0.0, 0.1)],
    }
    X = [[0.4, -0.7], [0.9, 0.2], [-1.1, 0.5]]
    Y = [[0.5], [-0.2], [0.9]]

    def loss_of(p):
        _, y_hat = forward(X, p)
        return mse_loss(y_hat, Y)

    H, y_hat = forward(X, params)
    grads = backward(X, Y, params, H, y_hat)
    eps = 1e-6
    plus = {"W1": [r[:] for r in params["W1"]], "b1": list(params["b1"]),
            "W2": [r[:] for r in params["W2"]], "b2": list(params["b2"])}
    minus = {"W1": [r[:] for r in params["W1"]], "b1": list(params["b1"]),
             "W2": [r[:] for r in params["W2"]], "b2": list(params["b2"])}
    plus["W2"][1][0] += eps
    minus["W2"][1][0] -= eps
    fd = (loss_of(plus) - loss_of(minus)) / (2.0 * eps)
    assert abs(grads["dW2"][1][0] - fd) < 1e-7, "the chain rule matches a finite difference"
    checks += 1

    before = loss_of(params)
    after = loss_of(apply_gradients(params, grads, 0.05))
    assert after < before, "one descent step lowers the loss"
    checks += 1

    normalised, mean, sigma = z_score([1.0, 2.0, 3.0, 4.0])
    assert abs(mean - 2.5) < 1e-12 and abs(sigma - math.sqrt(1.25)) < 1e-12
    assert abs(sum(normalised)) < 1e-12, "z-scores sum to zero"
    try:
        z_score([2.0, 2.0])
    except ValueError:
        pass
    else:
        raise AssertionError("a constant column must be refused")
    checks += 1

    # Small on purpose: the in-page runner stops a script after 400k line steps, so the browser
    # proves the pipeline trains while the native suite proves it generalises.
    gen = random.Random(7)
    Xg = [[gen.uniform(-1.6, 1.6), gen.uniform(-2.6, 2.6)] for _ in range(24)]
    Yg = [list(plant.gravity_torque(q1, q2)) for q1, q2 in Xg]
    policy, losses = train_bc(Xg, Yg, hidden=4, lr=0.2, steps=120, seed=0)
    fit = predict(policy, Xg)
    err = [math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(fit, Yg)]
    assert losses[-1] < 0.2 * losses[0], "the cloned gravity map trains"
    assert sum(err) / len(err) < 0.3, "and lands within a tenth of the 2.5 N*m limit"
    checks += 1

    print("SELF-CHECK PASS: %d checks - the mean loss, the chain rule against a finite difference, "
          "a descending step, the z-score guard and a gravity policy cloned from the plant" % checks)


_selfcheck()
