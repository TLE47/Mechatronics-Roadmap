"""Exercise 06-robotics.T3.06a - the learner's file.

A two-layer tanh policy, its loss, the chain rule, one gradient step, a z-score and the training
loop. Fill the seven TODOs:

    EXERCISE_TARGET=exercises/06-robotics.T3.06a/starter.py \
        python3 -m unittest discover -s exercises/06-robotics.T3.06a -p 'test_*.py'
"""

import math
import random

import mechalab_plant as plant


def mse_loss(y_hat, y_true):
    """Mean squared error over samples: (1/N) sum ||y_hat_i - y_i||^2."""
    raise NotImplementedError("TODO 1: divide by the number of SAMPLES, not by each element")


def forward(X, params):
    """(H, Y_hat): tanh hidden layer, linear output layer."""
    raise NotImplementedError("TODO 2: the hidden layer applies tanh to its affine combination; the output layer is linear")


def backward(X, Y, params, H, Y_hat):
    """The chain rule, as a dict of dW1, db1, dW2, db2."""
    raise NotImplementedError(
        "TODO 3: start from the output error scaled by its mean-squared factor, then carry the tanh derivative back through the hidden layer"
    )


def apply_gradients(params, grads, lr):
    """One descent step: theta <- theta - lr * grad, as a new dict."""
    raise NotImplementedError("TODO 4: subtract; adding is ascent, and the loss grows")


def z_score(values):
    """(normalised, mean, sigma) for one column; a constant column is refused."""
    raise NotImplementedError(
        "TODO 5: the standard score subtracts the mean and divides by the standard deviation; a constant column raises"
    )


def train_bc(X, Y, hidden=8, lr=0.05, steps=200, seed=0):
    """Fit a policy to demonstrations; returns (params, loss per step)."""
    raise NotImplementedError(
        "TODO 6: normalise the inputs, seed the weights, then do one forward pass, backward pass and step per loop"
    )


def predict(params, X):
    """Policy output in the units the demonstrations used."""
    raise NotImplementedError("TODO 7: normalise the observation, then undo the action's z-score")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
