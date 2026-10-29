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
    """One loss value for the batch, averaged per sample."""
    raise NotImplementedError("TODO 1: the mean loss over the batch, with one score per sample")


def forward(X, params):
    """The hidden activations and the output the policy predicts."""
    raise NotImplementedError("TODO 2: the hidden activations and the policy's output for these observations")


def backward(X, Y, params, H, Y_hat):
    """The loss gradients for W1, b1, W2 and b2."""
    raise NotImplementedError(
        "TODO 3: the loss gradients for all four parameter arrays, shaped like the parameters"
    )


def apply_gradients(params, grads, lr):
    """The parameters after one learning-rate step, as a new dict."""
    raise NotImplementedError("TODO 4: the parameters after one learning-rate step, as a new dict")


def z_score(values):
    """(normalised, mean, sigma) for one column; a constant column is refused."""
    raise NotImplementedError(
        "TODO 5: the standardised column with its mean and spread; a constant column is refused"
    )


def train_bc(X, Y, hidden=8, lr=0.05, steps=200, seed=0):
    """Fit a policy to demonstrations; returns (params, loss per step)."""
    raise NotImplementedError(
        "TODO 6: a policy fitted to the demonstrations, with the loss after every step"
    )


def predict(params, X):
    """Policy output in the units the demonstrations used."""
    raise NotImplementedError("TODO 7: the policy's action in the demonstrations' own units")


# The browser entry appends `selfcheck.py` below this line; on its own this file prints nothing.
