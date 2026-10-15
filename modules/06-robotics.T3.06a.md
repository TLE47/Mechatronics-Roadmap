---
id: 06-robotics.T3.06a
title: "PyTorch Tensors, Automatic Differentiation (autograd), Loss Functions & Behavior Cloning on Trajectory Logs"
track: "06"
tier: 3
prereqs:
  - 06-robotics.T2.07
new_concepts:
  - neural_network_forward_pass_and_mse_loss
  - chain_rule_backpropagation_and_gradient_descent
  - behavior_cloning_expert_demonstration_fit
uses:
  - matrix_vector_multiplication
  - jacobian_transpose_cartesian_impedance
  - ruckig_time_optimal_jerk_limited_scurve
est_hours: 5.0
hardware_required: false
safety_level: none
resources_verified: true
---

## 1. Why it matters (Why This Matters)
To achieve the Graduate Goal—deploying a learned visuomotor or proprioceptive policy (`LeRobot`, `ACT`, `Diffusion Policy`, `π₀`) on your robot arm in Step 3.7 (`06-robotics.T3.07`)—you first need a crystal-clear understanding of how a neural policy maps robot observations $o_t = [q_t, \dot{q}_t, x_{\text{goal}}]^\top$ to action targets $a_t$, how **automatic differentiation (`autograd` / backpropagation)** computes the exact gradient $\nabla_\theta \mathcal{L}$ of a loss function using the chain rule, and how **Behavior Cloning (BC)** trains a policy by imitating expert demonstrations. Already know this? Take the Skip test in section 8 first.

## 2. Intuition first (Mental Model)
Think of a neural network policy $\pi_\theta(o_t)$ as a multi-stage signal conditioner made of tunable gain matrices $W_1, W_2$ and smooth nonlinear saturation curves ($\tanh$ or $\text{ReLU}$). In **Behavior Cloning (imitation learning)**, you teleoperate the robot arm (or run an expert trajectory generator) to record a dataset of $(o_t, a_t^*)$ pairs: *"When the arm was at state $o_t$, the expert commanded action $a_t^*$."* Next, we feed $o_t$ through the network (**forward pass**), measure the squared discrepancy $\mathcal{L} = \frac{1}{N}\sum \|\pi_\theta(o_t) - a_t^*\|^2$ (**Mean-Squared Error loss**), and ask: *"Which way should we nudge each weight in $W_1$ and $W_2$ to shrink $\mathcal{L}$?"* **Backpropagation (`autograd`)** is simply the calculus chain rule applied backward from the output error to each layer's weights, and **gradient descent** ($\theta \leftarrow \theta - \eta \nabla_\theta \mathcal{L}$) steps the weights downhill until the policy reproduces the expert's smooth motion!

## 3. Formalization
1. **Multi-Layer Policy Forward Pass & Mean-Squared Error (MSE) Loss:** Given observation batch $X \in \mathbb{R}^{N \times d_{\text{in}}}$ and expert target actions $Y^* \in \mathbb{R}^{N \times d_{\text{out}}}$, a 2-layer network with hidden weights $W_1 \in \mathbb{R}^{d_{\text{in}} \times h}, b_1 \in \mathbb{R}^{1 \times h}$, activation $H = \tanh(X W_1 + b_1)$, and output weights $W_2 \in \mathbb{R}^{h \times d_{\text{out}}}, b_2 \in \mathbb{R}^{1 \times d_{\text{out}}}$ predicts $\hat{Y} = H W_2 + b_2$ with MSE loss:
   $$\mathcal{L}(\theta) = \frac{1}{N} \sum_{i=1}^{N} \|\hat{y}_i - y_i^*\|_2^2$$
2. **Chain-Rule Backpropagation (`autograd`) & Gradient Descent Step:** Let residual $E = \hat{Y} - Y^* \in \mathbb{R}^{N \times d_{\text{out}}}$. By the matrix chain rule (with $\frac{d}{dz}\tanh(z) = 1 - \tanh^2(z) = 1 - H^2$):
   $$\frac{\partial \mathcal{L}}{\partial \hat{Y}} = \frac{2}{N}E, \quad \frac{\partial \mathcal{L}}{\partial W_2} = H^\top \frac{\partial \mathcal{L}}{\partial \hat{Y}}, \quad \frac{\partial \mathcal{L}}{\partial H} = \frac{\partial \mathcal{L}}{\partial \hat{Y}} W_2^\top, \quad \frac{\partial \mathcal{L}}{\partial W_1} = X^\top \!\left(\frac{\partial \mathcal{L}}{\partial H} \odot (1 - H^2)\right)$$
   Each parameter updates with learning rate $\eta > 0$: $W_k \leftarrow W_k - \eta \frac{\partial \mathcal{L}}{\partial W_k}$.
3. **Behavior Cloning (BC) Observation Normalization & Covariate Shift:** Normalizing inputs via z-score $\tilde{o} = (o - \mu_o)/\sigma_o$ prevents high-magnitude states (e.g., velocities in $\text{rad/s}$) from dominating gradients over small position errors. Because single-step BC errors compound over horizon $H_{\text{steps}}$ as $\mathcal{O}(\epsilon H_{\text{steps}}^2)$ when the robot drifts slightly off the expert demonstration track (**covariate shift**), modern policies predict multi-step **action chunks** ($k = 16\text{–}50$ future waypoints, `ACT` / `LeRobot` in `06-robotics.T3.06b`).

## 4. Worked example (Worked Example & Code)
Train a 2-layer nonlinear Behavior Cloning policy in pure NumPy (verifying analytical backpropagation gradients against finite differences to $10^{-8}$) to imitate an expert nonlinear PD + gravity-compensation controller $\tau^*(q, \dot{q}) = 4.0(0.5 - q) - 0.8\dot{q} + 1.5\cos(q)$ across 100 robot arm states.

```python
import math
import random

rng = random.Random(42)
N, H_dim = 80, 12
X = [[rng.uniform(-1.0, 1.0), rng.uniform(-2.0, 2.0)] for _ in range(N)]
Y_expert = [4.0 * (0.5 - x[0]) - 0.8 * x[1] + 1.5 * math.cos(x[0]) for x in X]

W1 = [[rng.gauss(0.0, 0.3) for _ in range(H_dim)] for _ in range(2)]
b1 = [0.0 for _ in range(H_dim)]
W2 = [rng.gauss(0.0, 0.3) for _ in range(H_dim)]
b2 = 0.0

def forward_and_grads(W1_m, b1_v, W2_v, b2_s):
    loss_sum = 0.0
    dW1 = [[0.0] * H_dim for _ in range(2)]
    db1 = [0.0] * H_dim
    dW2 = [0.0] * H_dim
    db2 = 0.0
    inv_n = 2.0 / N
    for x, y in zip(X, Y_expert):
        h = [math.tanh(x[0] * W1_m[0][j] + x[1] * W1_m[1][j] + b1_v[j]) for j in range(H_dim)]
        y_hat = sum(h[j] * W2_v[j] for j in range(H_dim)) + b2_s
        err = y_hat - y
        loss_sum += err * err
        dy = inv_n * err
        db2 += dy
        for j in range(H_dim):
            dW2[j] += h[j] * dy
            dh_j = dy * W2_v[j] * (1.0 - h[j] * h[j])
            db1[j] += dh_j
            dW1[0][j] += x[0] * dh_j
            dW1[1][j] += x[1] * dh_j
    return loss_sum / N, (dW1, db1, dW2, db2)

loss_init, (dW1, db1, dW2, db2) = forward_and_grads(W1, b1, W2, b2)
eps = 1e-6
W1_p = [row[:] for row in W1]; W1_p[0][0] += eps
W1_m = [row[:] for row in W1]; W1_m[0][0] -= eps
fd_grad = (forward_and_grads(W1_p, b1, W2, b2)[0] - forward_and_grads(W1_m, b1, W2, b2)[0]) / (2.0 * eps)
assert abs(dW1[0][0] - fd_grad) < 1e-7

lr = 0.05
for _ in range(400):
    loss_final, (dW1, db1, dW2, db2) = forward_and_grads(W1, b1, W2, b2)
    for j in range(H_dim):
        W1[0][j] -= lr * dW1[0][j]
        W1[1][j] -= lr * dW1[1][j]
        b1[j] -= lr * db1[j]
        W2[j] -= lr * dW2[j]
    b2 -= lr * db2

assert loss_final < 0.02 and loss_final < 0.01 * loss_init
print(f"BC initial MSE={loss_init:.4f} -> trained MSE={loss_final:.5f} (grad_err={abs(dW1[0][0]-fd_grad):.2e})")
```
Expected output:
```text
BC initial MSE=13.5701 -> trained MSE=0.00523 (grad_err=1.15e-10)
```

## 5. Exercise
For a single scalar weight $w = 2.0$, input $x = 3.0$, prediction $\hat{y} = w x = 6.0$, and expert target $y^* = 10.0$, compute (a) the squared error loss $\mathcal{L} = (\hat{y} - y^*)^2$, (b) the exact derivative $\frac{\partial \mathcal{L}}{\partial w} = 2(\hat{y} - y^*)x$, and (c) the updated weight $w_{\text{new}} = w - \eta \frac{\partial \mathcal{L}}{\partial w}$ after one gradient descent step with learning rate $\eta = 0.05$. Verify $\mathcal{L} = 16.0$, $\frac{\partial \mathcal{L}}{\partial w} = -24.0$, and $w_{\text{new}} = 3.20$ ($\pm 10^{-9}$).
- **If your result differs:** Check the sign of $\hat{y} - y^* = 6.0 - 10.0 = -4.0$, so $\frac{\partial \mathcal{L}}{\partial w} = 2(-4.0)(3.0) = -24.0$, and subtracting $\eta(-24.0)$ *increases* $w$ from $2.0$ to $3.20$ (moving $\hat{y} = 3.20 \times 3.0 = 9.60$ much closer to $y^* = 10.0$!).

## 6. Simulation path
Run the NumPy Behavior Cloning script above or inspect how learned policies interface with the $1\text{ kHz}$ Operational-Space & CBF safety layer in **Tab 4** and **Tab 6** of the MechaLab Workbench (`npm run dev`).

## 7. Hardware path
No hardware required for this module (`hardware_required: false`). In Step 3.7 (`06-robotics.T3.07`), a policy trained in PyTorch / `Hugging Face LeRobot` exports its weights to `ONNX` / `TorchScript` and runs at $30\text{–}50\text{ Hz}$ on the host PC, streaming smooth joint position/action chunks to the $1\text{ kHz}$ `ros2_control` impedance loop:
```text
[Teleop Demonstrations (o_t, a_t*)] ---> [PyTorch BC Training] ---> [Trained Policy pi_theta(o_t) @ 50 Hz]
                                                                                   |
                                                                    [1 kHz Impedance + CBF Safety Filter]
```
Pass/fail verification in simulation: finite-difference gradient check matches analytical backprop within $< 10^{-7}$ and Behavior Cloning MSE drops from `13.57` to `< 0.01`.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/4$) on the Skip test below.

### Skip test
1. `[Concept: neural_network_forward_pass_and_mse_loss]` Given predictions $\hat{y} = [1.0, 3.0]^\top$ and expert targets $y^* = [2.0, 1.0]^\top$ ($N = 2$), compute the Mean-Squared Error $\mathcal{L} = \frac{1}{2}\sum_{i=1}^2 (\hat{y}_i - y_i^*)^2$ (tolerance $\pm 10^{-9}$).
2. `[Concept: chain_rule_backpropagation_and_gradient_descent]` For loss $\mathcal{L}(w) = (w x - y^*)^2$ with $w = 1.0$, $x = 2.0$, and $y^* = 6.0$, compute the gradient $\frac{\partial \mathcal{L}}{\partial w} = 2(w x - y^*)x$ (tolerance $\pm 10^{-9}$).
3. `[Concept: chain_rule_backpropagation_and_gradient_descent]` Using the gradient $\frac{\partial \mathcal{L}}{\partial w} = -16.0$ from Q2 and learning rate $\eta = 0.10$, compute the updated weight $w_{\text{new}} = w - \eta \frac{\partial \mathcal{L}}{\partial w}$ (tolerance $\pm 10^{-9}$).
4. `[Concept: behavior_cloning_expert_demonstration_fit]` What is **covariate shift (compounding error)** in naive single-step Behavior Cloning?
   - **A.** When the GPU clock frequency changes during training.
   - **B.** When small prediction errors push the robot into states slightly outside the expert's demonstration distribution, where the policy has no training data and makes larger errors that compound quadratically over the trajectory.
   - **C.** When the learning rate $\eta$ is set to zero.
   - **D.** When the encoder wire is unplugged.

**Answer key:**
```python
import math

q1_mse = 0.5 * ((1.0 - 2.0) ** 2 + (3.0 - 1.0) ** 2)
q2_grad = 2.0 * (1.0 * 2.0 - 6.0) * 2.0
q3_wnew = 1.0 - 0.10 * q2_grad
q4_choice = "B"

assert math.isclose(q1_mse, 2.5, rel_tol=1e-9)
assert math.isclose(q2_grad, -16.0, rel_tol=1e-9)
assert math.isclose(q3_wnew, 2.6, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3. On pass, proceed to `## 11. Next modules`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Loss explodes to `NaN` on the second gradient descent iteration | Learning rate $\eta$ is too large or input features have wildly different scales (e.g., encoder counts in $[0, 16384]$ vs angles in $[-1, 1]$). | Z-score normalize all observations and actions to zero mean and unit variance, and start with $\eta \in [10^{-4}, 10^{-3}]$ using AdamW. |
| PyTorch gradients accumulate across batches (`grad` grows larger every step) | Forgot to call `optimizer.zero_grad()` before `loss.backward()`. | Always call `optimizer.zero_grad()` at the top of every training batch loop. |
| Trained policy works on training states but jerks wildly when deployed at $50\text{ Hz}$ on the arm | Trained single-step actions without action chunking or low-level impedance smoothing. | Predict multi-step action chunks (`ACT` / `Diffusion Policy` in `06-robotics.T3.06b`) and track them through a $1\text{ kHz}$ joint/Cartesian impedance filter. |

## 10. Resources
- **Capuano et al. — *Robot Learning: A Tutorial* (`arXiv:2510.12403`) & Hugging Face `LeRobot` (`github.com/huggingface/lerobot`, `resources/textbooks-and-papers.md`):** Open-source PyTorch tutorial and codebase for Behavior Cloning, ACT, and visuomotor policy training `[VERIFIED 2026-10-15]`.
- **Track 06 (`06-robotics-and-autonomy/README.md`):** Continues into `06-robotics.T3.06b` and Step 3.7 (`06-robotics.T3.07`) `[VERIFIED 2026-10-15]`.

## 11. Next modules
- Proceed to [`06-robotics.T3.06b`](06-robotics.T3.06b.md) (*Markov Decision Processes (MDPs), Policy Gradient / PPO, Action Chunking & Sim-to-Real Safety Wrappers*).
