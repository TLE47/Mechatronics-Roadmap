---
id: 06-robotics.T3.06b
title: "Markov Decision Processes (MDPs), Policy Gradient / PPO, Action Chunking & Sim-to-Real Safety Wrappers"
track: "06"
tier: 3
prereqs:
  - 06-robotics.T3.06a
new_concepts:
  - mdp_discounted_return_and_policy_gradient
  - action_chunking_temporal_ensembling_rtc
  - sim_to_real_domain_randomization_and_safety_shield
uses:
  - neural_network_forward_pass_and_mse_loss
  - chain_rule_backpropagation_and_gradient_descent
  - behavior_cloning_expert_demonstration_fit
est_hours: 5.5
hardware_required: false
safety_level: high
resources_verified: false
---

## 1. Why it matters (Why This Matters)
This is the final bridge module in the Track 06 Tier 3 Embodied AI ladder before Step 3.7 (`06-robotics.T3.07`). While Behavior Cloning (`06-robotics.T3.06a`) imitates human demonstrations, **Reinforcement Learning (RL / PPO)** discovers agile locomotion and contact behaviors in GPU simulators (`Newton`, `Isaac Lab`, `MuJoCo Playground`) by maximizing discounted cumulative reward $G_t = \sum_{k=0}^\infty \gamma^k r_{t+k}$. And to deploy *either* an RL policy or a Vision-Language-Action (`VLA` / `ACT` / `Diffusion` / `π₀`) policy onto real $48\text{ V}$ hardware without violent jitter or collisions, you must master **Action Chunking with Temporal Ensembling / Real-Time Chunking (`RTC`)**, **Domain Randomization**, and a hard $1\text{ kHz}$ **Sim-to-Real CBF/Impedance Safety Shield**. Already know this? Read `## 7. Safety notes` first, then take the Skip test or the Ladder Gate test in section 8.

## 2. Intuition first (Mental Model)
In supervised learning (`06-robotics.T3.06a`), a teacher tells the network the exact right action $a_t^*$ on every step. In **Reinforcement Learning (MDP)**, there is no teacher—only a scoreboard (the **reward function** $r_t$, which awards points for reaching the goal and deducts points for excessive torque or falling over). The policy tries actions, sees which rollouts scored higher than expected (positive **Advantage** $\hat{A}_t > 0$), and increases the log-probability of those winning actions while **PPO (Proximal Policy Optimization)** clips the update ratio $r_t(\theta) = \frac{\pi_\theta}{\pi_{\theta_{\text{old}}}}$ to $[1-\epsilon, 1+\epsilon]$ so one lucky rollout doesn't wreck the policy! Second, why do modern manipulation policies (`ACT`, `Diffusion Policy`, `π₀`) predict a whole **chunk of $K=16$ future waypoints** instead of a single step, and blend overlapping chunks with exponential weights $w_i = \exp(-m \cdot i)$ (**Temporal Ensembling / Real-Time Chunking**)? Because blending overlapping predictions smooths out frame-to-frame camera noise and bridges the $30\text{–}100\text{ ms}$ vision inference delay! Finally, because a neural network can output an arbitrary wild number if given an out-of-distribution camera image, **never** wire a neural network directly to raw motor voltage—always wrap it inside a $1\text{ kHz}$ **Safety Shield** that clamps joint step size $|\Delta q_{\text{cmd}}| \le \Delta q_{\max}$, joint limits, and Control Barrier Function (`CBF-QP`) workspace walls!

## 3. Formalization
1. **Markov Decision Process (MDP), Discounted Return ($G_t$) & PPO Clipped Surrogate:** Over state $s_t$, action $a_t \sim \pi_\theta(a_t \mid s_t)$, reward $r_t$, and discount factor $\gamma \in (0, 1)$, the discounted return from step $t$ is:
   $$G_t = \sum_{k=0}^{T-t-1} \gamma^k r_{t+k} = r_t + \gamma G_{t+1}$$
   With probability ratio $\rho_t(\theta) = \frac{\pi_\theta(a_t \mid s_t)}{\pi_{\theta_{\text{old}}}(a_t \mid s_t)}$ and advantage $\hat{A}_t = G_t - V(s_t)$, PPO maximizes:
   $$L^{\text{CLIP}}(\theta) = \mathbb{E}_t\!\left[\min\!\left(\rho_t(\theta)\hat{A}_t,\ \operatorname{clip}(\rho_t(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_t\right)\right]$$
2. **Action Chunking & Temporal Ensembling (`ACT` / `RTC`):** At inference step $t$, the policy outputs a chunk of $K$ future target positions $\hat{A}_t = [\hat{a}_{t\mid t},\ \hat{a}_{t+1\mid t},\ \dots,\ \hat{a}_{t+K-1\mid t}]$. Thus for current time $t$, we have $M \le K$ overlapping predictions $\hat{a}_{t\mid t-i}$ made $i \in \{0, \dots, M-1\}$ steps ago. Temporal ensembling blends them with exponential decay rate $m \ge 0$:
   $$a_t^{\text{ens}} = \frac{\sum_{i=0}^{M-1} \exp(-m \cdot i)\,\hat{a}_{t\mid t-i}}{\sum_{i=0}^{M-1} \exp(-m \cdot i)}$$
3. **Sim-to-Real Domain Randomization & $1\text{ kHz}$ Safety Wrapper:**
   - **Domain Randomization:** Randomizing link mass $m \sim \mathcal{U}[0.8m_0, 1.2m_0]$, friction, and latency $\tau_d$ during GPU training forces $\pi_\theta$ to learn robust feedback strategies.
   - **Deterministic Safety Shield:** Before any policy action $a_t^{\text{ens}}$ reaches the $1\text{ kHz}$ PD/impedance controller, hardware-enforced safety wrapper projects it into safe bounds:
     $$q_{d,t} = \operatorname{clip}\!\left(\operatorname{clip}\!\left(a_t^{\text{ens}},\ q - \Delta q_{\max},\ q + \Delta q_{\max}\right),\ q_{\min},\ q_{\max}\right)$$
     followed by torque saturation $|\tau| \le \tau_{\max}$ and CBF barrier enforcement (`05-control.T3.06`).

## 4. Worked example (Worked Example & Code)
Compute the discounted return $G_0$, evaluate the PPO clipped objective for an overly large probability ratio $\rho = 1.50$ ($\epsilon = 0.20$), blend 3 overlapping action chunks via Temporal Ensembling ($m = 0.5$), and verify that the Sim-to-Real Safety Wrapper clamps an out-of-distribution policy spike before it can jerk the joint.

```python
import math

def discounted_return(rewards: list[float], gamma: float = 0.90) -> list[float]:
    G = [0.0] * len(rewards)
    running = 0.0
    for t in reversed(range(len(rewards))):
        running = rewards[t] + gamma * running
        G[t] = running
    return G

G = discounted_return([1.0, 2.0, 4.0], gamma=0.90)
assert math.isclose(G[0], 1.0 + 0.9 * 2.0 + 0.81 * 4.0, rel_tol=1e-9)  # 6.04

def ppo_clip_term(rho: float, adv: float, eps: float = 0.20) -> float:
    rho_clipped = max(1.0 - eps, min(1.0 + eps, rho))
    return min(rho * adv, rho_clipped * adv)

assert math.isclose(ppo_clip_term(rho=1.50, adv=2.0, eps=0.20), 1.20 * 2.0, rel_tol=1e-9)

# Temporal ensembling of 3 overlapping predictions for step t (i=0 newest, i=1, i=2 oldest):
preds_for_t = [0.52, 0.50, 0.46]
weights = [math.exp(-0.5 * i) for i in range(len(preds_for_t))]
a_ens = sum(w * p for w, p in zip(weights, preds_for_t)) / sum(weights)
assert 0.46 < a_ens < 0.52

# Sim-to-Real Safety Shield: current q = 0.50 rad, wild policy output = +2.80 rad!
def safety_shield(a_policy: float, q_curr: float, dq_max: float = 0.08,
                  q_min: float = -1.5, q_max: float = 1.5) -> float:
    q_rate_limited = max(q_curr - dq_max, min(q_curr + dq_max, a_policy))
    return max(q_min, min(q_max, q_rate_limited))

q_safe = safety_shield(a_policy=2.80, q_curr=0.50, dq_max=0.08)
assert math.isclose(q_safe, 0.58, rel_tol=1e-9)
print(f"G_0={G[0]:.2f}, PPO_clip={ppo_clip_term(1.5, 2.0):.2f}, a_ens={a_ens:.4f} rad, q_safe={q_safe:.2f} rad")
```
Expected output:
```text
G_0=6.04, PPO_clip=2.40, a_ens=0.5015 rad, q_safe=0.58 rad
```

## 5. Exercise
Suppose a reward sequence is $r = [0.0, 0.0, 10.0]$ over 3 steps with discount factor $\gamma = 0.95$, and at step $t=0$ the PPO probability ratio is $\rho_0 = 0.60$ with negative advantage $\hat{A}_0 = -3.0$ and clip range $\epsilon = 0.20$. Compute $G_0 = \gamma^2 (10.0)$ and the clipped PPO objective $\min(\rho_0 \hat{A}_0,\ \operatorname{clip}(\rho_0, 0.8, 1.2)\hat{A}_0)$. Verify $G_0 = 9.025$ and $L^{\text{CLIP}}_0 = \min(-1.80, -2.40) = -2.40$ ($\pm 10^{-9}$).
- **If your result differs:** When $\hat{A}_0 < 0$ and $\rho_0 = 0.60 < 0.80$, $\rho_0 \hat{A}_0 = -1.80$ while the clipped term is $0.80 \times (-3.0) = -2.40$; taking the pessimistic $\min(-1.80, -2.40)$ gives $-2.40$.

## 6. Sim-first path (Simulation path)
Open **Tab 4 (CBF-QP Safety Filter)** and **Tab 6 (Trajectory & Action Smoothing)** in the MechaLab Workbench (`npm run dev`), or train a PPO/ACT policy in `MuJoCo Playground` / `Hugging Face LeRobot` (`resources/open-source-toolchains.md`).

## 7. Hardware path (and Safety notes)
> **⚠️ Mandatory Safety Briefing (`safety_level: high` — read before deploying any learned policy on hardware or taking the Skip/Gate test):**
> 1. **Never Wire a Neural Policy Directly to Raw Motor Voltage/Current:** A neural network (`BC`, `PPO`, `Diffusion`, `VLA`) has no mathematical guarantee against outputting extreme actions when encountering a camera glare, occlusion, or out-of-distribution state. Every learned policy output **must** pass through a deterministic $1\text{ kHz}$ low-level **Safety Shield** (`safety_shield` + CBF-QP + joint PD torque clamp) running on the real-time controller.
> 2. **Per-Tick Slew-Rate / Step Clamping (`dq_max`):** Clamp the maximum position deviation $|q_d - q_{\text{meas}}| \le \Delta q_{\max}$ (e.g., $\le 0.05\text{–}0.10\text{ rad}$), velocity $|\dot{q}_d| \le \dot{q}_{\max}$, and torque $|\tau| \le \tau_{\max}$ on every tick, and trip into hardware Safe Torque Off (`STO` / `FAULT`) if the policy heartbeat times out ($> 100\text{ ms}$).
> 3. **Physical E-Stop in Hand During First Policy Rollout:** Always keep a physical hardware E-stop button in hand and test new checkpoints at $25\%$ torque ceiling in a clear workspace before full-speed evaluation.

**Optional Hardware Path (`hardware_required: false`):** Complete all simulation and assertion gates in `## 6. Sim-first path (Simulation path)` first before energizing any physical hardware stage:
```text
[Sim-First Gate Passed] ---> [Current-Limited Bench PSU + E-Stop Ready] ---> [Incremental Hardware Verification]
```

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: read `## 7. Safety notes`, score $\ge 80\%$ ($4/5$, $100\%$ on `[SAFETY]` items) on the Skip test, or score $\ge 80\%$ ($7/8$, $100\%$ on `[SAFETY]` items) on the Ladder Gate test to unlock Step 3.7 (`06-robotics.T3.07`).

### Skip test
1. `[Recall] [Concept: mdp_discounted_return_and_policy_gradient]` Compute the discounted return $G_0 = r_0 + \gamma r_1 + \gamma^2 r_2$ (tolerance $\pm 10^{-9}$) for rewards $[2.0, 0.0, 5.0]$ and discount factor $\gamma = 0.80$.
2. `[Apply] [Concept: mdp_discounted_return_and_policy_gradient]` In PPO with clip parameter $\epsilon = 0.20$, if advantage is $\hat{A}_t = +4.0$ and probability ratio is $\rho_t = 1.60$, compute the clipped surrogate value $\min(\rho_t \hat{A}_t,\ \operatorname{clip}(\rho_t, 0.8, 1.2)\hat{A}_t)$ (tolerance $\pm 10^{-9}$).
3. `[Transfer] [Concept: action_chunking_temporal_ensembling_rtc]` Why do modern visuomotor policies (`ACT`, `Diffusion Policy`, `π₀` with Real-Time Chunking `RTC`) predict a chunk of $K = 16\text{–}50$ future actions at once and blend overlapping chunks rather than predicting a single action $a_t$ independently at each frame?
   - **A.** To use more GPU memory.
   - **B.** To eliminate non-Markovian human pauses, smooth out high-frequency action jitter across frames, and maintain continuous $1\text{ kHz}$ execution even while the next vision inference takes $30\text{–}80\text{ ms}$.
   - **C.** Because cameras only capture 1 image per minute.
   - **D.** To disable the joint encoders.
4. `[Spaced review -> 06-robotics.T3.06a — Concept: neural_network_forward_pass_and_mse_loss] [SAFETY] [Concept: sim_to_real_domain_randomization_and_safety_shield]` A vision-language-action (`VLA`) policy running at $30\text{ Hz}$ suffers a camera glare and suddenly outputs a joint target of $q_{\text{policy}} = +3.14\text{ rad}$ while the robot arm is at $q = 0.20\text{ rad}$. If the $1\text{ kHz}$ safety shield enforces a maximum step clamp $\Delta q_{\max} = 0.06\text{ rad}$ around $q$, what safe target $q_d$ in radians (tolerance $\pm 10^{-9}$) is passed to the PD controller?
5. `[SAFETY] [Concept: sim_to_real_domain_randomization_and_safety_shield]` What must the $1\text{ kHz}$ real-time motor controller do if the $30\text{ Hz}$ GPU policy process crashes or stops sending action chunks for more than the watchdog timeout ($100\text{ ms}$)?
   - **A.** Continue extrapolating the last velocity forever until the arm hits the table.
   - **B.** Immediately transition to a safe hold/damped-stop trajectory (`qd_des = 0`, hold current $q$ or engage STO) and raise a communication timeout fault.
   - **C.** Apply $100\%$ random PWM noise.
   - **D.** Disable the hardware current limit.

**Answer key:**
```python
import math

q1_g0 = 2.0 + 0.80 * 0.0 + (0.80 ** 2) * 5.0
q2_ppo = min(1.60 * 4.0, 1.20 * 4.0)
q3_choice = "B"
q4_safety_qd = 0.20 + 0.06
q5_safety_choice = "B"

assert math.isclose(q1_g0, 5.2, rel_tol=1e-9)
assert math.isclose(q2_ppo, 4.8, rel_tol=1e-9)
assert q3_choice == "B"
assert math.isclose(q4_safety_qd, 0.26, rel_tol=1e-9)  # Mandatory [SAFETY] 100% required
assert q5_safety_choice == "B"                          # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $4/5$ overall AND $2/2$ ($100\%$) on Q4 and Q5 (`[SAFETY]`). If you missed Q1 or Q2, study `## 3. Formalization` item 1; Q3, study `## 3. Formalization` item 2; Q4 or Q5, study `## 3. Formalization` item 3 and `## 7. Safety notes`.

### Gate test
Covers the complete Track 06 Tier 3 Embodied AI bridge ladder (`06-robotics.T3.06a` $\to$ `06-robotics.T3.06b`) before Step 3.7 (`06-robotics.T3.07`):
1. `[Concept: neural_network_forward_pass_and_mse_loss]` Compute the Mean-Squared Error $\mathcal{L} = \frac{1}{2}\left((2.0 - 1.0)^2 + (4.0 - 1.0)^2\right)$ (tolerance $\pm 10^{-9}$).
2. `[Concept: chain_rule_backpropagation_and_gradient_descent]` For $\mathcal{L}(w) = (w - 5.0)^2$, compute the updated weight $w_{\text{new}} = w - \eta \frac{d\mathcal{L}}{dw}$ starting from $w = 1.0$ with learning rate $\eta = 0.25$ (tolerance $\pm 10^{-9}$).
3. `[Concept: behavior_cloning_expert_demonstration_fit]` Why must the observation vector $o_t$ fed into a trained policy at deployment time use the **exact same** mean $\mu_o$ and standard deviation $\sigma_o$ normalization stats saved during training?
   - **A.** Because the network weights $W_1, b_1$ were optimized for normalized inputs $\tilde{o} = (o - \mu_o)/\sigma_o$; feeding raw unnormalized units shifts activations into saturation and produces garbage actions.
   - **B.** Because $\mu_o$ is always zero.
   - **C.** To make the URDF file smaller.
   - **D.** Because Python cannot multiply unnormalized floats.
4. `[Concept: mdp_discounted_return_and_policy_gradient]` Compute the discounted return $G_0 = r_0 + \gamma r_1$ (tolerance $\pm 10^{-9}$) for $r_0 = 3.0, r_1 = 10.0$, and $\gamma = 0.90$.
5. `[Concept: mdp_discounted_return_and_policy_gradient]` What is the role of the clipping interval $[1-\epsilon, 1+\epsilon]$ on $\rho_t(\theta) = \frac{\pi_\theta}{\pi_{\theta_{\text{old}}}}$ in PPO?
   - **A.** It prevents destructively large policy updates in a single gradient step (a trust-region constraint).
   - **B.** It clips the joint encoder angle to $\pm 0.2\text{ rad}$.
   - **C.** It sets the discount factor $\gamma$ to zero.
   - **D.** It deletes negative rewards.
6. `[Concept: action_chunking_temporal_ensembling_rtc]` Compute the temporally ensembled action $a^{\text{ens}} = \frac{w_0 \hat{a}_0 + w_1 \hat{a}_1}{w_0 + w_1}$ (tolerance $\pm 10^{-6}$) for two overlapping predictions $\hat{a}_0 = 1.0\text{ rad}$ (weight $w_0 = 1.0$) and $\hat{a}_1 = 0.5\text{ rad}$ (weight $w_1 = 0.5$).
7. `[SAFETY] [Concept: sim_to_real_domain_randomization_and_safety_shield]` Why is a two-rate hierarchical architecture (`30–50 Hz` high-level learned policy outputting position/impedance setpoints $\to$ `1 kHz` low-level deterministic torque/CBF-QP controller) the universal standard in modern robot learning?
   - **A.** Because high-capacity vision/diffusion models take $15\text{–}50\text{ ms}$ to run on a GPU, whereas mechanical stability, contact compliance, and safety barrier invariance require deterministic $1\text{ kHz}$ ($1\text{ ms}$) feedback!
   - **B.** Because GPUs cannot multiply matrices.
   - **C.** Because motors cannot run above $30\text{ Hz}$.
   - **D.** To eliminate the need for encoders.
8. `[SAFETY] [Concept: sim_to_real_domain_randomization_and_safety_shield]` Given current angle $q = -1.45\text{ rad}$, step clamp $\Delta q_{\max} = 0.10\text{ rad}$, hard joint limit $[q_{\min}, q_{\max}] = [-1.50, +1.50]\text{ rad}$, and policy command $a_{\text{policy}} = -2.00\text{ rad}$, compute the final output $q_{d}$ of `safety_shield` in radians (tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

g1_mse = 0.5 * ((2.0 - 1.0) ** 2 + (4.0 - 1.0) ** 2)
g2_wnew = 1.0 - 0.25 * (2.0 * (1.0 - 5.0))
g3_choice = "A"
g4_g0 = 3.0 + 0.90 * 10.0
g5_choice = "A"
g6_aens = (1.0 * 1.0 + 0.5 * 0.5) / (1.0 + 0.5)
g7_safety_choice = "A"
g8_safety_qd = max(-1.50, min(1.50, max(-1.45 - 0.10, min(-1.45 + 0.10, -2.00))))

assert math.isclose(g1_mse, 5.0, rel_tol=1e-9)
assert math.isclose(g2_wnew, 3.0, rel_tol=1e-9)
assert g3_choice == "A"
assert math.isclose(g4_g0, 12.0, rel_tol=1e-9)
assert g5_choice == "A"
assert math.isclose(g6_aens, 5.0 / 6.0, rel_tol=1e-6)
assert g7_safety_choice == "A"                      # Mandatory [SAFETY] 100% required
assert math.isclose(g8_safety_qd, -1.50, rel_tol=1e-9)  # Mandatory [SAFETY] 100% required
```
- **Pass mark:** $7/8$ overall AND $2/2$ ($100\%$) on `[SAFETY]` questions Q7 and Q8. Remediation: Q1–Q3 $\to$ `06-robotics.T3.06a`; Q4–Q8 $\to$ `06-robotics.T3.06b`.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| RL policy achieves huge reward in simulation by vibrating joints at $500\text{ Hz}$, then shakes real hardware to pieces | Reward function omitted action-rate penalty $-\alpha \|a_t - a_{t-1}\|^2$ and torque penalty $-\beta \|\tau_t\|^2$. | Always penalize action smoothness $\|a_t - a_{t-1}\|^2$, joint velocity, and torque in the training reward, and randomize actuator delay in sim. |
| Arm pauses for $50\text{ ms}$ every $K=16$ steps at the boundary between action chunks | Executed an entire chunk open-loop to completion before starting the next camera inference. | Run inference every $d < K$ steps asynchronously and blend overlapping chunks with Temporal Ensembling / Real-Time Chunking (`RTC`, `arXiv:2506.07339`). |
| Joint sign or gear offset in real robot differs from `MuJoCo`/`Isaac` model, causing instant runaway on policy start | Mismatched joint zero offset or axis sign between sim URDF and `ros2_control` hardware interface. | Verify in a passive gravity-comp mode that moving each real joint $+0.2\text{ rad}$ moves the simulated twin's joint in the exact same direction before enabling policy output. |

## 10. Resources
- **Tony Z. Zhao et al. — *Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware (ACT)*, *Diffusion Policy* (Chi et al.), & *Real-Time Execution of Action Chunking Flow Policies (RTC)* (Black et al., `arXiv:2506.07339`, `resources/textbooks-and-papers.md`):** Foundational papers behind modern action-chunking visuomotor policies `[UNVERIFIED]`.
- **Track 06 (`06-robotics-and-autonomy/README.md`):** Directly continues into Step 3.7 (`06-robotics.T3.07`) `[VERIFIED 2026-10-15]`.
## 11. Next modules
- Proceed to [`07-systems.T3.06a`](07-systems.T3.06a.md) or legacy **Step 3.7 (`06-robotics.T3.07`)** in [`06-robotics-and-autonomy/README.md`](../06-robotics-and-autonomy/README.md#tier-3-advanced--production).
