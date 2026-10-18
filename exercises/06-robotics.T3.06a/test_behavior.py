"""Behaviour tests for 06-robotics.T3.06a.

Each test names the mistake it catches:
  * a loss that sums the errors (`sum` where `mean` belongs), so the gradient scale depends on how
    many demonstrations you happened to record;
  * a hidden layer that is linear or ReLU, which cannot express the gravity cosine;
  * a backward pass missing the (1 - H^2) factor or the 2/N, which every finite difference check
    catches immediately - the gradient is the whole exercise;
  * a descent step that adds the gradient, or a learning rate of zero;
  * a z-score of a constant column, which divides by zero and produces NaN instead of an error;
  * a training loop that trains and never improves, or that returns a different policy for the same
    seed.
"""

import math
import random
import unittest

import harness

submission = harness.load_submission()


def _params(seed, n_in, hidden, n_out):
    rng = random.Random(seed)
    return {
        "W1": [[rng.gauss(0.0, 0.4) for _ in range(hidden)] for _ in range(n_in)],
        "b1": [rng.gauss(0.0, 0.1) for _ in range(hidden)],
        "W2": [[rng.gauss(0.0, 0.4) for _ in range(n_out)] for _ in range(hidden)],
        "b2": [rng.gauss(0.0, 0.1) for _ in range(n_out)],
    }


def _loss_of(params, X, Y):
    _, y_hat = submission.forward(X, params)
    return submission.mse_loss(y_hat, Y)


class LossTests(unittest.TestCase):
    def test_the_loss_is_a_mean_over_samples(self):
        # Two scalar samples: (1-2)^2 and (3-1)^2 -> (1 + 4) / 2 = 2.5, the module's Skip-test answer.
        self.assertAlmostEqual(
            submission.mse_loss([[1.0], [3.0]], [[2.0], [1.0]]), 2.5, delta=1e-12,
            msg="expected the two-sample loss to be their mean, 2.5; 5.0 means the errors were "
                "summed, so the gradient scale would grow with the dataset",
        )
        # Three samples: (0 + 1 + 4) / 3, never the sum of 5.
        self.assertAlmostEqual(
            submission.mse_loss([[0.0], [1.0], [2.0]], [[0.0], [0.0], [0.0]]), 5.0 / 3.0,
            delta=1e-12,
            msg="expected three samples totalling 5 to average 1.667; 5.0 means `sum` was used "
                "where `mean` belongs - check the sample count",
        )

    def test_the_width_of_a_sample_matters(self):
        # One sample, two outputs: 1 + 4 = 5 - a mean over samples, not over elements.
        self.assertAlmostEqual(
            submission.mse_loss([[1.0, 3.0]], [[2.0, 1.0]]), 5.0, delta=1e-12,
            msg="expected one sample with two outputs to keep both errors, 5.0; 2.5 means the "
                "mean ran over elements as well, shrinking a single sample's loss",
        )

    def test_a_shape_mismatch_is_refused(self):
        with self.assertRaises(ValueError):
            submission.mse_loss([[1.0], [2.0]], [[1.0]])
        with self.assertRaises(ValueError):
            submission.mse_loss([[1.0, 2.0]], [[1.0]])


class ForwardTests(unittest.TestCase):
    def test_a_zero_network_returns_the_output_bias(self):
        params = {"W1": [[0.0, 0.0]], "b1": [0.0, 0.0], "W2": [[0.0], [0.0]], "b2": [0.5]}
        _, y_hat = submission.forward([[1.0], [-2.0]], params)
        self.assertEqual(
            y_hat, [[0.5], [0.5]],
            msg="expected a network with zero weights to return its output bias for every "
                "sample, 0.5 each; another value means the bias was dropped - check the output sum",
        )

    def test_the_hidden_layer_is_tanh(self):
        params = {"W1": [[1.0]], "b1": [0.0], "W2": [[1.0]], "b2": [0.0]}
        h, y_hat = submission.forward([[0.5]], params)
        self.assertAlmostEqual(
            h[0][0], math.tanh(0.5), delta=1e-15,
            msg="expected the hidden activation of 0.5 to be tanh(0.5), 0.462; 0.5 means the "
                "layer is linear or ReLU and cannot express a cosine",
        )
        self.assertAlmostEqual(
            y_hat[0][0], math.tanh(0.5), delta=1e-15,
            msg="expected the output to pass that same 0.462 through a unit weight; a different "
                "value means the hidden value was rescaled - check W2",
        )
        # A ReLU would return 0.5 here, and a linear hidden layer 0.5 too - both are wrong.
        self.assertLess(
            h[0][0], 0.5,
            msg="expected tanh to compress 0.5 below itself, since the derivative peak is at "
                "zero; equality means the activation is the identity - check the nonlinearity",
        )

    def test_a_wrong_observation_width_is_refused(self):
        params = {"W1": [[0.0, 0.0]], "b1": [0.0, 0.0], "W2": [[0.0], [0.0]], "b2": [0.0]}
        with self.assertRaises(ValueError):
            submission.forward([[1.0, 2.0, 3.0]], params)


class BackwardTests(unittest.TestCase):
    def test_every_gradient_matches_finite_differences(self):
        X = [[0.4, -0.7], [0.9, 0.2], [-1.1, 0.5], [-0.3, -1.4], [0.6, 0.8]]
        Y = [[0.5], [-0.2], [0.9], [-0.6], [0.1]]
        params = _params(3, 2, 3, 1)
        H, y_hat = submission.forward(X, params)
        grads = submission.backward(X, Y, params, H, y_hat)
        eps = 1e-6
        for name, grad_name in (("W1", "dW1"), ("b1", "db1"), ("W2", "dW2"), ("b2", "db2")):
            for i, value in enumerate(params[name]):
                for j, scalar in enumerate(value) if isinstance(value, list) else [(0, value)]:
                    plus = {k: ([row[:] for row in v] if v and isinstance(v[0], list) else list(v))
                            for k, v in params.items()}
                    minus = {k: ([row[:] for row in v] if v and isinstance(v[0], list) else list(v))
                             for k, v in params.items()}
                    if isinstance(value, list):
                        plus[name][i][j] += eps
                        minus[name][i][j] -= eps
                    else:
                        plus[name][i] += eps
                        minus[name][i] -= eps
                    fd = (_loss_of(plus, X, Y) - _loss_of(minus, X, Y)) / (2.0 * eps)
                    self.assertAlmostEqual(
                        grads[grad_name][i] if not isinstance(value, list)
                        else grads[grad_name][i][j], fd, delta=1e-7,
                        msg="expected every analytic gradient to match the measured finite "
                            "difference for W1, b1, W2 and b2; a mismatch means a chain-rule term "
                            "is missing or the 2/N scale is wrong - check the backward pass",
                    )

    def test_duplicating_the_batch_leaves_the_gradient_alone(self):
        X = [[0.4, -0.7], [0.9, 0.2], [-1.1, 0.5]]
        Y = [[0.5, -0.5], [-0.2, 0.3], [0.9, 0.1]]
        params = _params(11, 2, 4, 2)
        H, y_hat = submission.forward(X, params)
        once = submission.backward(X, Y, params, H, y_hat)
        H2, y_hat2 = submission.forward(X + X, params)
        twice = submission.backward(X + X, Y + Y, params, H2, y_hat2)
        for name in ("dW1", "db1", "dW2", "db2"):
            for a, b in zip(once[name], twice[name]):
                if isinstance(a, list):
                    for x, y in zip(a, b):
                        self.assertAlmostEqual(
                            x, y, delta=1e-12,
                            msg="expected each weight gradient to be unchanged by duplicating "
                                "the batch, since the loss is a mean; a doubled value means the "
                                "sum was left in - check the 1/N factor",
                        )
                else:
                    self.assertAlmostEqual(
                        a, b, delta=1e-12,
                        msg="expected each bias gradient to be unchanged by duplicating the "
                            "batch; a doubled value means the scale depends on the dataset size",
                    )


class StepTests(unittest.TestCase):
    def test_one_step_at_a_small_rate_lowers_the_loss(self):
        X = [[0.4, -0.7], [0.9, 0.2], [-1.1, 0.5], [-0.3, -1.4]]
        Y = [[0.5], [-0.2], [0.9], [-0.6]]
        params = _params(5, 2, 3, 1)
        H, y_hat = submission.forward(X, params)
        before = submission.mse_loss(y_hat, Y)
        grads = submission.backward(X, Y, params, H, y_hat)
        after = _loss_of(submission.apply_gradients(params, grads, 0.05), X, Y)
        self.assertLess(
            after, before * 0.999,
            msg="expected a 0.05 learning-rate step to lower the loss by at least a tenth of a "
                "percent; an unchanged or rising loss means the update added the gradient instead "
                "of subtracting it - check the sign",
        )

    def test_a_bad_learning_rate_is_refused(self):
        params = {"W1": [[1.0]], "b1": [0.0], "W2": [[1.0]], "b2": [0.0]}
        grads = {"dW1": [[0.0]], "db1": [0.0], "dW2": [[0.0]], "db2": [0.0]}
        for lr in (0.0, -0.1):
            with self.assertRaises(ValueError):
                submission.apply_gradients(params, grads, lr)

    def test_the_original_parameters_are_not_mutated(self):
        X = [[0.4, -0.7], [0.9, 0.2]]
        Y = [[0.5], [-0.2]]
        params = _params(7, 2, 2, 1)
        H, y_hat = submission.forward(X, params)
        submission.apply_gradients(params, submission.backward(X, Y, params, H, y_hat), 0.1)
        self.assertAlmostEqual(
            _loss_of(params, X, Y), submission.mse_loss(y_hat, Y), delta=1e-12,
            msg="expected the caller's parameters to survive the update untouched, still giving "
                "the original loss; a different value means apply_gradients mutated in place - "
                "check for a deep copy",
        )


class NormalisationTests(unittest.TestCase):
    def test_the_result_is_zero_mean_unit_spread(self):
        values = [1.0, 2.0, 3.0, 4.0]
        normalised, mean, sigma = submission.z_score(values)
        self.assertAlmostEqual(
            mean, 2.5, delta=1e-12,
            msg="expected the mean of 1, 2, 3, 4 to be 2.5; 2.0 means the count was decremented "
                "before the division - check N, not N - 1",
        )
        self.assertAlmostEqual(
            sigma, math.sqrt(1.25), delta=1e-12,
            msg="expected the population spread of those values to be 1.118; 1.29 means the "
                "sample standard deviation was used and the column will not be unit variance",
        )
        self.assertAlmostEqual(
            sum(normalised) / len(normalised), 0.0, delta=1e-12,
            msg="expected the normalised column to be zero mean by construction; a nonzero mean "
                "means the subtraction used another centre - check it uses the returned mean",
        )

    def test_a_constant_column_is_refused(self):
        with self.assertRaises(ValueError):
            submission.z_score([2.0, 2.0, 2.0])


class TrainingTests(unittest.TestCase):
    def _worked_example(self):
        rng = random.Random(42)
        X = [[rng.uniform(-1.0, 1.0), rng.uniform(-2.0, 2.0)] for _ in range(80)]
        Y = [[4.0 * (0.5 - x[0]) - 0.8 * x[1] + 1.5 * math.cos(x[0])] for x in X]
        return X, Y

    def test_the_loss_falls_to_one_percent_of_where_it_started(self):
        X, Y = self._worked_example()
        params, losses = submission.train_bc(X, Y, hidden=8, lr=0.05, steps=200, seed=0)
        self.assertLess(
            losses[-1], 0.01 * losses[0],
            msg="expected 200 steps at 0.05 to cut the loss a hundredfold, the module's own "
                "claim; a smaller fall means the loop trains without learning - check the descent",
        )
        self.assertLess(
            losses[-1], 0.02,
            msg="expected the final loss to sit under 0.02 in demonstration units; a larger "
                "residue means the fit stalled or the learning rate is too small",
        )

    def test_the_policy_predicts_in_demonstration_units(self):
        X, Y = self._worked_example()
        params, _ = submission.train_bc(X, Y, hidden=8, lr=0.05, steps=200, seed=0)
        errors = [abs(p[0] - y[0]) for p, y in zip(submission.predict(params, X), Y)]
        # The expert action ranges over roughly +/-7 N*m here; a quarter of a newton-metre is a
        # fraction of a percent of that, and far above any policy that forgot to denormalise.
        self.assertLess(
            sum(errors) / len(errors), 0.25,
            msg="expected the mean error to stay in newton-metres, under 0.25; a much larger "
                "error means the policy predicts normalised units - check denormalisation",
        )
        self.assertLess(
            max(errors), 1.0,
            msg="expected the worst prediction to stay within a newton-metre, so no state is "
                "wildly wrong; a larger error means one region of the demonstration set was lost",
        )

    def test_the_same_seed_trains_the_same_policy(self):
        X, Y = self._worked_example()
        first, _ = submission.train_bc(X, Y, hidden=6, lr=0.1, steps=60, seed=3)
        second, _ = submission.train_bc(X, Y, hidden=6, lr=0.1, steps=60, seed=3)
        for name in ("W1", "b1", "W2", "b2"):
            for a, b in zip(first[name], second[name]):
                if isinstance(a, list):
                    for x, y in zip(a, b):
                        self.assertAlmostEqual(
                            x, y, delta=1e-15,
                            msg="expected the same seed to reproduce the same weights exactly; "
                                "a divergence means the trainer pulled from an unseeded RNG - "
                                "check that it seeds its own generator",
                        )
                else:
                    self.assertAlmostEqual(
                        a, b, delta=1e-15,
                        msg="expected the same seed to reproduce the same biases exactly; a "
                            "divergence means global random state leaked into the training loop",
                    )


if __name__ == "__main__":
    unittest.main()
