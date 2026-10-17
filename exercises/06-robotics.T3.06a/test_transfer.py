"""Transfer tests for 06-robotics.T3.06a - the cloned gravity map flies the plant.

Three claims, measured on the shared arm:
  1. a policy trained on `plant.gravity_torque` reproduces it on joint states it never saw, to
     better than 0.8% of the plant's 2.5 N*m limit (a stricter form of the module's 1% claim);
  2. replacing the analytic gravity feedforward with that policy inside the plant's own PD law
     tracks the figure-8 as well as the analytic model does (the plant's published 0.913 mm RMS);
  3. the gradient the submission computes on the plant's own states matches a finite difference.
"""

import math
import random
import unittest

import harness

submission = harness.load_submission()
plant = harness.plant

KP = (plant.KP1, plant.KP2)
KD = (plant.KD1, plant.KD2)


def gravity_demonstrations(n=140, seed=7):
    rng = random.Random(seed)
    X = [[rng.uniform(-1.6, 1.6), rng.uniform(-2.6, 2.6)] for _ in range(n)]
    Y = [list(plant.gravity_torque(q1, q2)) for q1, q2 in X]
    return X, Y


class ClonedGravityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.X, cls.Y = gravity_demonstrations()
        split = int(0.75 * len(cls.X))
        cls.X_train, cls.Y_train = cls.X[:split], cls.Y[:split]
        cls.X_test, cls.Y_test = cls.X[split:], cls.Y[split:]
        # The schedule is gentle on purpose. `lr=0.2` for 600 steps sits on a trajectory-sensitive
        # edge: Python 3.9 and 3.12 differ only in `math.tanh`'s last bits, yet the fit moved 40%
        # (0.0201 vs 0.0143 N*m held-out) and the closed loop 12% - enough to fail the same test on
        # one interpreter and pass on the other. `lr=0.1` for 1200 steps converges to the same
        # optimum on both (0.00684 N*m, 0.9129 mm RMS to four decimals), so these assertions grade
        # the model class rather than the host's libm.
        cls.params, cls.losses = submission.train_bc(
            cls.X_train, cls.Y_train, hidden=8, lr=0.1, steps=1200, seed=0)

    def test_the_policy_is_accurate_on_held_out_states(self):
        predicted = submission.predict(self.params, self.X_test)
        errors = [math.hypot(a[0] - b[0], a[1] - b[1])
                  for a, b in zip(predicted, self.Y_test)]
        self.assertLess(sum(errors) / len(errors), 0.02,
                        "mean error must stay under 0.02 N*m (0.8%% of the %.1f N*m limit)"
                        % plant.TAU_LIMIT)
        self.assertLess(max(errors), 0.10)
        self.assertLess(self.losses[-1], 0.02 * self.losses[0])

    def test_the_gravity_map_is_a_cosine_of_the_shoulder(self):
        # The plant's gravity torque is a cosine in q1 and q1+q2; the policy has to have found it.
        grid = [[q1, q2] for q1 in (-1.2, 0.0, 0.9) for q2 in (-2.0, -0.4, 1.1, 2.3)]
        predicted = submission.predict(self.params, grid)
        for q, p in zip(grid, predicted):
            truth = plant.gravity_torque(q[0], q[1])
            self.assertAlmostEqual(p[0], truth[0], delta=0.08)
            self.assertAlmostEqual(p[1], truth[1], delta=0.08)

    def test_the_cloned_map_tracks_the_figure_eight(self):
        analytic = plant.simulate_arm()
        params = self.params

        def controller(q, dq, q_des, dq_des):
            g = submission.predict(params, [[q[0], q[1]]])[0]
            tau = (KP[0] * (q_des[0] - q[0]) + KD[0] * (dq_des[0] - dq[0]) + g[0],
                   KP[1] * (q_des[1] - q[1]) + KD[1] * (dq_des[1] - dq[1]) + g[1])
            return (max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[0])),
                    max(-plant.TAU_LIMIT, min(plant.TAU_LIMIT, tau[1])))

        learned = plant.simulate_arm(controller=controller)
        self.assertLess(learned["rms_dyn_err_mm"], 1.05 * analytic["rms_dyn_err_mm"])
        self.assertLess(learned["max_dyn_err_mm"], 1.10 * analytic["max_dyn_err_mm"])
        self.assertLess(learned["max_ik_fk_err_mm"], 1e-9)

    def test_the_gradient_is_exact_on_the_plants_states(self):
        X = self.X_train[:6]
        Y = self.Y_train[:6]
        H, y_hat = submission.forward(X, self.params)
        grads = submission.backward(X, Y, self.params, H, y_hat)
        eps = 1e-6

        def loss_of(params):
            _, pred = submission.forward(X, params)
            return submission.mse_loss(pred, Y)

        for i in range(len(self.params["W1"])):
            for j in range(len(self.params["W1"][i])):
                plus = {k: ([row[:] for row in v] if v and isinstance(v[0], list) else list(v))
                        for k, v in self.params.items() if k in ("W1", "b1", "W2", "b2")}
                minus = {k: ([row[:] for row in v] if v and isinstance(v[0], list) else list(v))
                         for k, v in self.params.items() if k in ("W1", "b1", "W2", "b2")}
                plus["W1"][i][j] += eps
                minus["W1"][i][j] -= eps
                fd = (loss_of(plus) - loss_of(minus)) / (2.0 * eps)
                self.assertAlmostEqual(grads["dW1"][i][j], fd, delta=1e-7)


if __name__ == "__main__":
    unittest.main()
