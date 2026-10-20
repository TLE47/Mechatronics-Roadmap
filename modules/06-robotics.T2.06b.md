---
id: 06-robotics.T2.06b
title: "ROS 2 Operations: Launch & Parameter Composition, Deterministic rosbag2 Recording/Replay & Simulator Integration (Gazebo / MuJoCo)"
track: "06"
tier: 2
prereqs:
  - 06-robotics.T2.06a
  - 04-embedded.T2.04d
new_concepts:
  - ros2_launch_parameters_and_composition
  - rosbag2_mcap_recording_and_deterministic_replay
  - ros2_simulator_bridge_and_joint_state_loop
uses:
  - ros2_nodes_topics_services_and_qos
  - tf2_transform_tree_and_urdf_kinematics
  - ros2_control_hardware_interface_read_write
  - microros_xrcedds_client_agent_bridge
est_hours: 4.5
hardware_required: false
safety_level: none
resources_verified: true
difficulty:
  math: 3
  coding: 3
  tools: 3
  hardware_risk: low
  simulation: full
verification: ci-native
plant: tier1_arm_motor
---

<!-- run-callout:start -->
> **Step 9 of 10 · Plan motion and bring it up safely**
>
> **Run this in the workbench.** [Open MechaLab with `EX.06-robotics.T2.06b` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.06-robotics.T2.06b) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the final bridge module in the Track 06 Tier 2 ladder before Step 2.7 (`06-robotics.T2.07`). In `06-robotics.T2.06a`, you learned how individual ROS 2 nodes, `tf2` trees, and `ros2_control` interfaces operate. In a real robotics lab, you never start 15 terminals by hand or test an untested Cartesian impedance controller directly on a $48\text{ V}$ metal arm! You orchestrate the entire stack from a declarative **Python `LaunchDescription` + YAML parameter file** (with intra-process **Component Composition** for zero-copy image/point-cloud passing), record and deterministically replay multi-topic **`rosbag2` (`MCAP`)** logs using simulated time (`use_sim_time: true` + `--clock`) to debug estimators and train imitation-learning policies (`Track 06 Tier 3`), and close the $1\text{ kHz}$ **`ros2_control` $\leftrightarrow$ Physics Simulator (`MuJoCo` / `Gazebo Harmonic`)** loop so your exact C++ controller runs identically in simulation and on physical hardware. Already know this? Take the Skip test or the Ladder Gate test in section 7 first.

## 2. Intuition first
Three operational workflows turn a collection of ROS 2 nodes into a reproducible robotics testbed:
- **Launch Files, Parameters & Intra-Process Composition (`Zero-Copy`):** A **`LaunchDescription`** (`arm_bringup.launch.py`) is the conductor's score: it parses your `Xacro` $\to$ `URDF`, loads gain tables from `controllers.yaml`, spawns `robot_state_publisher` and `controller_manager`, and sets `use_sim_time` across every node simultaneously. Even better, when a camera node and a visual detector node are loaded as `ComposableNode` plugins inside a single `ComposableNodeContainer` process with `use_intra_process_comms=True`, ROS 2 passes a `std::unique_ptr<Image>` memory pointer directly between them in $< 1\ \mu\text{s}$ instead of copying megabytes over DDS sockets!
- **`rosbag2` (`MCAP`) Recording & Deterministic Replay:** Think of **`rosbag2`** as a flight-data black box (`ros2 bag record -s mcap -a`). When you record `/joint_states`, `/tf`, and `/camera/image_raw` into an indexed **MCAP** file (`Foxglove` / `Rerun` standard), every message is stored with its exact recording timestamp. When you replay that bag offline with `ros2 bag play my_run.mcap --clock` and set `use_sim_time:=true` on your Kalman filter or SLAM node, `rosbag2` broadcasts a virtual `/clock` topic that drives all ROS timers deterministically—letting you replay a $10\text{ s}$ collision or slip event at $0.1\times$ or $10\times$ real-time speed and get bit-identical outputs on every run!
- **How ROS 2 Connects to `MuJoCo` & `Gazebo Harmonic` (`The Closed-Loop Simulator Bridge`):** A physics simulator is not just a 3D viewer—it replaces the physical motors and encoders underneath `ros2_control`! On every physics step $\Delta t_{\text{sim}} = 1\text{ ms}$:
  1. The simulator steps rigid-body dynamics $M(q)\ddot{q} + C(q,\dot{q})\dot{q} + g(q) = \tau_{\text{cmd}}$ forward by $\Delta t_{\text{sim}}$ and publishes the simulated timestamp onto `/clock`.
  2. The simulator plugin (`gz_ros2_control` in Gazebo Harmonic or `mujoco_ros2_control` in MuJoCo) copies simulated joint positions, velocities, and efforts $(q, \dot{q}, \tau)$ into `ros2_control`'s `SystemInterface::read()` **`state_interfaces`**.
  3. `controller_manager::update()` runs your **exact same** `joint_state_broadcaster` (which publishes `/joint_states` $\to$ `robot_state_publisher` $\to$ `/tf`) and your **exact same** Cartesian impedance or trajectory controller, writing desired torques $\tau_{\text{cmd}}$ into **`command_interfaces`**.
  4. `SystemInterface::write()` writes $\tau_{\text{cmd}}$ into `mjData->ctrl` (MuJoCo) or joint force buffers (Gazebo) for the next physics step!

## 3. Formalization
1. **Launch Parameter Resolution, Simulated Clock (`use_sim_time`) & Intra-Process Pointer Transfer:**
   - **Simulated Time Rule:** When parameter `use_sim_time == True`, `Node::now()` ignores the OS wall clock (`CLOCK_REALTIME`) and returns the latest timestamp received on `/clock` (`rosgraph_msgs/msg/Clock`). If `/clock` advances in discrete steps of $\Delta t_{\text{sim}}$, a ROS timer with period $T_{\text{timer}}$ fires deterministically every $K = \lceil T_{\text{timer}} / \Delta t_{\text{sim}} \rceil$ simulation steps regardless of CPU load.
   - **Intra-Process vs. Inter-Process Bandwidth Savings:** Passing a message of size $B_{\text{msg}}$ bytes at frequency $f_{\text{pub}}$ across $N_{\text{sub}}$ intra-process `ComposableNode` subscribers via `unique_ptr` ownership transfer copies $0\text{ bytes}$ of payload (only an $8\text{-byte}$ pointer), saving serialized memory bandwidth:

$$
\Delta R_{\text{saved}} = N_{\text{sub}} \cdot B_{\text{msg}} \cdot f_{\text{pub}}
$$

2. **`rosbag2` (`MCAP`) Storage Throughput, Ring-Buffer Sizing & Replay Scaling:**
   - **Write Throughput & Storage Size:** Recording $M$ topics with message sizes $B_m$ (plus per-message MCAP index/timestamp overhead $B_{\text{meta}} \approx 32\text{ B}$) at frequencies $f_m$ ($\text{Hz}$) over duration $T_{\text{rec}}$ ($\text{s}$) with compression ratio $c \in (0, 1]$ ($c=1$ uncompressed) requires sustained disk write rate $R_{\text{disk}}$ and file size $S_{\text{bag}}$:

$$
R_{\text{disk}} = c \sum_{m=1}^{M} f_m (B_m + B_{\text{meta}}), \qquad S_{\text{bag}} = R_{\text{disk}} \cdot T_{\text{rec}}
$$

   - **Replay Rate Scaling (`--rate r`):** Playing back a bag recorded at interval $\Delta t_{\text{rec}} = t_{k+1} - t_k$ with playback rate factor $r > 0$ schedules wall-clock sleep $\Delta t_{\text{wall}} = \Delta t_{\text{rec}} / r$ while publishing the **original** message timestamps $t_k$ on `/clock`, preserving exact numerical derivatives $\frac{x(t_{k+1}) - x(t_k)}{t_{k+1} - t_k}$ at any playback speed!
3. **Closed-Loop Simulator $\leftrightarrow$ `ros2_control` Synchronization Contract:**
   - Let the physics engine step at frequency $f_{\text{sim}} = 1 / \Delta t_{\text{sim}}$ (e.g., $1000\text{ Hz}$) and the `ros2_control` `controller_manager` run at $f_{\text{ctrl}} = f_{\text{sim}} / D$ for integer decimation $D \ge 1$.
   - On simulation step $k$:

$$
\underbrace{(q_k, \dot{q}_k)}_{\text{Sim State}} \xrightarrow{\text{read()}} \text{State Interfaces} \xrightarrow{\text{update()}} \begin{cases} \text{JointStateBroadcaster} \to \texttt{/joint-states} \to \texttt{robot-state-publisher} \to \texttt{/tf} \\ \text{ImpedanceController} \to \tau_{\text{cmd},k} \end{cases} \xrightarrow{\text{write()}} \underbrace{\tau_{\text{sim},k}}_{\text{mjData->ctrl}}
$$


## 4. Worked example
**Predict first (before you run it):** Commit to four numbers before the code runs. (1) With the three topics at $1\text{ kHz}$/$128\text{ B}$, $200\text{ Hz}$/$96\text{ B}$ and $30\text{ Hz}$/$150{,}000\text{ B}$, $32\text{ B}$ of metadata per message and `zstd` at $c = 0.40$, what sustained disk rate and what $10$-minute file size do you expect? (2) Does the estimated $\dot{q}$ change when the same bag is replayed at `--rate 4.0` instead of `--rate 0.5`? (3) After $20$ steps of $1\text{ ms}$ with $k_p = 25.0$, $k_d = 2.5$, $J = 0.05$ and $b = 0.20$, roughly how far has the joint moved? Two tells: a derivative that changes with the playback rate means wall-clock time leaked into the estimate, and a file size that ignores the $32\text{ B}$ metadata is short by exactly $f_m \cdot 32$ bytes per second on every topic.

Simulate a complete ROS 2 operational workflow in Python: (1) compute the `rosbag2` MCAP write throughput and 10-minute file size for a robot recording $1\text{ kHz}$ `/joint_states` ($128\text{ B}$), $200\text{ Hz}$ `/imu/data` ($96\text{ B}$), and $30\text{ Hz}$ `/camera/depth` ($150{,}000\text{ B}$) with `zstd` compression ($c = 0.40$), (2) verify deterministic `--rate 4.0` replay derivative invariance using `/clock` timestamps, and (3) run a 20-step closed-loop `MuJoCo / Gazebo` $\leftrightarrow$ `ros2_control` (`read -> update -> write`) + `robot_state_publisher` (`/joint_states` $\to$ `/tf`) simulation loop.

```python
import math

# 1. rosbag2 MCAP storage & disk throughput budget (B_meta = 32 B per message, zstd compression c = 0.40):
topics = [
    ("/joint_states", 1000.0, 128),
    ("/imu/data",      200.0,  96),
    ("/camera/depth",   30.0, 150_000),
]
B_meta = 32
c_zstd = 0.40
raw_rate_bps = sum(f * (b + B_meta) for _, f, b in topics)
disk_rate_mbs = (c_zstd * raw_rate_bps) / 1e6
bag_size_10min_mb = disk_rate_mbs * 600.0
assert math.isclose(raw_rate_bps, 160_000.0 + 25_600.0 + 4_500_960.0, rel_tol=1e-9)
assert math.isclose(disk_rate_mbs, 1.874624, rel_tol=1e-6)

# 2. Deterministic rosbag2 replay with --clock at rate r = 0.5x vs r = 4.0x:
bag_msgs = [(10.000, 0.50), (10.002, 0.54)]  # (sim_time_s, q_rad)
for rate in [0.5, 1.0, 4.0]:
    dt_wall = (bag_msgs[1][0] - bag_msgs[0][0]) / rate
    dt_sim_clock = bag_msgs[1][0] - bag_msgs[0][0]  # Estimator uses /clock (dt_sim_clock), NOT dt_wall!
    dq_est = (bag_msgs[1][1] - bag_msgs[0][1]) / dt_sim_clock
    assert math.isclose(dq_est, 20.0, rel_tol=1e-9)  # Identical 20.0 rad/s at every playback rate!

# 3. Closed-loop Simulator (MuJoCo/Gazebo) <-> ros2_control (read/update/write) + /joint_states -> /tf:
q_sim, dq_sim = 0.0, 0.0
inertia, damping, dt_sim = 0.05, 0.20, 0.001
q_target, kp, kd = 1.0, 25.0, 2.5
link_len = 0.30

for step in range(20):
    # (a) Simulator plugin SystemInterface::read() exports state_interfaces
    q_state, dq_state = q_sim, dq_sim
    # (b) controller_manager::update() -> PD effort controller + JointStateBroadcaster
    tau_cmd = kp * (q_target - q_state) - kd * dq_state
    # (c) robot_state_publisher computes /tf from /joint_states and URDF link length:
    tf_tip_x, tf_tip_y = link_len * math.cos(q_state), link_len * math.sin(q_state)
    # (d) Simulator plugin SystemInterface::write() applies tau_cmd to physics step:
    ddq = (tau_cmd - damping * dq_sim) / inertia
    dq_sim += ddq * dt_sim
    q_sim += dq_sim * dt_sim

assert q_sim > 0.05 and math.isclose(tf_tip_x**2 + tf_tip_y**2, link_len**2, rel_tol=1e-9)
print(f"disk_rate={disk_rate_mbs:.3f} MB/s, bag_10m={bag_size_10min_mb:.1f} MB, q_sim(20ms)={q_sim:.4f} rad")
```
Expected output:
```text
disk_rate=1.875 MB/s, bag_10m=1124.8 MB, q_sim(20ms)=0.0752 rad
```

## 5. Exercise
You record a `rosbag2` MCAP log containing two topics: `/joint_states` at $f_1 = 500\text{ Hz}$ with message size $B_1 = 168\text{ B}$ ($+32\text{ B}$ MCAP metadata $= 200\text{ B/msg}$) and `/camera/image_raw` at $f_2 = 20\text{ Hz}$ with message size $B_2 = 99{,}968\text{ B}$ ($+32\text{ B}$ metadata $= 100{,}000\text{ B/msg}$), uncompressed ($c = 1.0$). Compute (a) the total uncompressed write rate $R_{\text{disk}}$ in $\text{MB/s}$ ($\frac{f_1(B_1+32) + f_2(B_2+32)}{10^6}$), (b) the total bag file size $S_{\text{bag}}$ in $\text{MB}$ for a $T_{\text{rec}} = 100\text{ s}$ run, and (c) the wall-clock duration $T_{\text{wall}} = T_{\text{rec}} / r$ in seconds when replaying the $100\text{ s}$ bag at `--rate 2.5`. Verify $R_{\text{disk}} = 2.10\text{ MB/s}$, $S_{\text{bag}} = 210.0\text{ MB}$, and $T_{\text{wall}} = 40.0\text{ s}$.
- **If your result differs:** Check that $500 \times 200 = 100{,}000\text{ B/s}$ ($0.10\text{ MB/s}$) and $20 \times 100{,}000 = 2{,}000{,}000\text{ B/s}$ ($2.00\text{ MB/s}$), summing to $2.10\text{ MB/s}$.

### Graded package - a recording budget, a replay clock and a decimation
[`exercises/06-robotics.T2.06b/`](../exercises/06-robotics.T2.06b/) turns this section into a test. `starter.py` holds seven holes: `timer_steps` (a ceiling, and at least one step), `intra_process_saving_mb_s`, `disk_rate_mb_s` (per-message metadata before compression), `bag_size_mb`, `replay_derivative` (on the message stamps), `wall_delay_s` (`/rate`) and `control_decimation` (refusing a ratio that does not divide). Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/06-robotics.T2.06b/starter.py \
  python3 -m unittest discover -s exercises/06-robotics.T2.06b -p 'test_*.py'
```

The tests are behavioural: a $2.5$-step timer must wait $3$ (rounding and flooring both drift), an exact multiple must not round up from float error, the $0.40$ `zstd` budget must be $1.874624\text{ MB/s}$ and $1124.7744\text{ MB}$ for ten minutes, the $32\text{ B}$ per-message index must show as $0.128 \to 0.160\text{ MB/s}$ on one joint-state topic, compression must scale the rate rather than the size, the replay derivative must stay $20\text{ rad/s}$ at $0.25\times$, $1\times$ and $4\times$, and $1000/300$ must **raise** instead of becoming $3$. The transfer suite records the plant's own $20\text{ B}$ telemetry frame at $1\text{ kHz}$ for a minute and requires the budget to be a few megabytes, shows the $32\text{ B}$ metadata multiplying that frame's rate, puts a $250\text{ Hz}$ task on the plant's $1\text{ kHz}$ clock (four ticks apart, $250$ firings in a $1000$-tick run), and takes the figure-8 tip velocity off the plant's recorded stamps at $1\times$ and $4\times$ so the two must agree to $10^{-15}$. Four planted faults - `timer_rounds`, `disk_ignores_meta`, `replay_assumed_dt`, `decimation_rounds` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00c`](00-foundations.T1.00c.md) (Bandwidth & Storage Units $\text{B}, \text{MB/s}$), [`00-foundations.T2.00a`](00-foundations.T2.00a.md) ($2\times 2$ Jacobian Transpose), and [`00-foundations.T2.00c`](00-foundations.T2.00c.md) (*Structural Resonance*).
  - **Prerequisite Bridge Modules:** [`02-mechanics.T2.02a`](02-mechanics.T2.02a.md) (*Manipulator Jacobians*) and [`06-robotics.T2.06a`](06-robotics.T2.06a.md) (*ROS 2 Nodes, QoS & TF2*).
  - **Core Concepts to Review First:** `rosbag2` MCAP throughput $R_{\text{disk}} = \frac{1}{c}\sum f_i(B_i + 32)$ and replay scaling $T_{\text{wall}} = T_{\text{rec}}/r$, `ros2_control` `CommandInterface`/`StateInterface` exclusivity, and Cartesian task-space impedance $\tau = J(q)^\top [K_x(x_d - x) - D_x J(q)\dot{q}]$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Official `ros2_control` Documentation (`control.ros.org`)](https://control.ros.org/), [ROS 2 `rosbag2` & Launch Tutorials (`docs.ros.org`)](https://docs.ros.org/en/jazzy/Tutorials.html), and [Track 06 Tier 2 (`06-robotics-and-autonomy/README.md`)](../06-robotics-and-autonomy/README.md#tier-2-intermediate--applied).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import math


def timer_steps(t_timer_s, dt_sim_s):
    """Simulation steps between timer firings."""
    # TODO: a ceiling, not a rounded quotient - a 2.5-step period must wait 3 steps
    ...


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    """Bandwidth not copied by composable subscribers, in MB/s."""
    # TODO: multiply by the subscriber count, not by one
    ...


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    """Sustained write rate for `(name, frequency, payload_bytes)` topics."""
    # TODO: add the per-message metadata BEFORE summing, then scale the total by the compression
    ...


def bag_size_mb(disk_rate, duration_s):
    """File size of a recording."""
    # TODO: rate times duration
    ...


def replay_derivative(t_a, value_a, t_b, value_b):
    """Derivative from the message's own timestamps."""
    # TODO: divide by the MESSAGE gap t_b - t_a, never by the wall-clock gap
    ...


def wall_delay_s(t_a, t_b, rate):
    """Wall-clock delay a `--rate r` replay sleeps for a message gap."""
    # TODO: the message gap divided by the rate
    ...


def control_decimation(f_sim_hz, f_ctrl_hz):
    """Integer decimation `D = f_sim / f_ctrl`."""
    # TODO: refuse a ratio that is not a whole number instead of rounding it
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **The recording budget is a sum of rates, each with its metadata.** $500 \times (168 + 32) = 100{,}000\ \text{B/s}$ and $20 \times (99{,}968 + 32) = 2{,}000{,}000\ \text{B/s}$, so $R_{\text{disk}} = 2{,}100{,}000/10^6 = 2.10\ \text{MB/s}$ at $c = 1.0$. Adding the $32\ \text{B}$ once per topic instead of once per message is the classic slip: it would give $2.0834\ \text{MB/s}$.
2. **Size and replay are two different multiplications.** $S_{\text{bag}} = R_{\text{disk}} T_{\text{rec}} = 2.10 \times 100 = 210.0\ \text{MB}$, while the replay only divides time: $T_{\text{wall}} = 100/2.5 = 40.0\ \text{s}$. The bag does not shrink because you played it faster.
3. **Simulated time is what makes replay deterministic.** $\dot{q}$ is $(q_b - q_a)/(t_b - t_a)$ on the message stamps - $20\ \text{rad/s}$ at $0.5\times$, $1\times$ and $4\times$ - so a derivative that changes with `--rate` proves wall-clock time leaked into the estimator. And a timer of $2.5$ simulation steps must fire on step $3$: `ceil`, and at least one step.
4. **Decimation is exact or refused.** $1000/250 = 4$ is a whole number; $1000/300 = 3.33$ is not, and returning $3$ silently runs the controller at $300\ \text{Hz}$ while claiming $2\bar{3}\ \text{Hz}$ - so raise instead.

5. **What the suite refuses.** `timer_steps` refuses a non-positive timer period or simulation step, `wall_delay_s` refuses a non-positive replay rate, `replay_derivative` refuses two samples on the same stamp, and `control_decimation` refuses a zero controller rate or a ratio that is not a whole number - each raises `ValueError`.

### Full Solution
```python
import math


def timer_steps(t_timer_s, dt_sim_s):
    if t_timer_s <= 0.0 or dt_sim_s <= 0.0:
        raise ValueError("timer period and simulation step must both be positive")
    return int(math.ceil(t_timer_s / dt_sim_s - 1e-12))


def intra_process_saving_mb_s(n_subs, msg_bytes, rate_hz):
    return n_subs * msg_bytes * rate_hz / 1e6


def disk_rate_mb_s(topics, meta_bytes=32, compression=1.0):
    raw = sum(frequency * (payload + meta_bytes) for _, frequency, payload in topics)
    return compression * raw / 1e6


def bag_size_mb(disk_rate, duration_s):
    return disk_rate * duration_s


def replay_derivative(t_a, value_a, t_b, value_b):
    if t_b == t_a:
        raise ValueError("two identical stamps have no derivative")
    return (value_b - value_a) / (t_b - t_a)


def wall_delay_s(t_a, t_b, rate):
    if rate <= 0.0:
        raise ValueError("playback rate must be positive")
    return (t_b - t_a) / rate


def control_decimation(f_sim_hz, f_ctrl_hz):
    if f_ctrl_hz <= 0.0:
        raise ValueError("controller rate must be positive")
    ratio = f_sim_hz / f_ctrl_hz
    if abs(ratio - round(ratio)) > 1e-9:
        raise ValueError("the controller rate must divide the simulation rate exactly")
    return int(round(ratio))


topics = [("/joint_states", 500.0, 168), ("/camera/image_raw", 20.0, 99_968)]
R_disk = disk_rate_mb_s(topics, meta_bytes=32, compression=1.0)
S_bag = bag_size_mb(R_disk, 100.0)
T_wall = wall_delay_s(0.0, 100.0, 2.5)
steps = timer_steps(0.0025, 0.001)
D = control_decimation(1000.0, 250.0)
rate_invariance = [replay_derivative(10.000, 0.50, 10.002, 0.54) for _ in (0.5, 1.0, 4.0)]

assert math.isclose(R_disk, 2.10, rel_tol=1e-12)
assert math.isclose(S_bag, 210.0, rel_tol=1e-12)
assert math.isclose(T_wall, 40.0, rel_tol=1e-12)
assert steps == 3 and D == 4
assert all(math.isclose(dq, 20.0, rel_tol=1e-12) for dq in rate_invariance)
assert math.isclose(wall_delay_s(10.000, 10.002, 4.0), 0.0005, rel_tol=1e-12)
assert math.isclose(intra_process_saving_mb_s(2, 250_000, 60.0), 30.0, rel_tol=1e-12)

print(f"R_disk={R_disk:.3f} MB/s | S_bag={S_bag:.1f} MB | T_wall={T_wall:.1f} s | "
      f"timer={steps} steps | D={D}")
```
Printed: `R_disk=2.100 MB/s | S_bag=210.0 MB | T_wall=40.0 s | timer=3 steps | D=4`

**On the shared arm.** The Transfer suite records the plant's own 20-byte frame at 1 kHz, prices the per-message metadata, and replays the run at a different rate:

```python
import mechalab_plant as plant

steps = int(round(0.004 / plant.DT))
firings = sum(1 for tick in range(plant.TICKS) if tick % steps == 0)
rate = (plant.FRAME_BYTES + 32) * (1.0 / plant.DT) / 1e6

assert steps == 4 and firings == 250
assert abs(rate - 0.052) < 1e-12
print("250 Hz = every %d ticks, %d firings in %d | one topic with 32 B metadata=%.3f MB/s"
      % (steps, firings, plant.TICKS, rate))
```

### Break it on purpose
Inject the first row of the `## 8. Common mistakes` table: replay the bag without `--clock` while every downstream node runs `use_sim_time:=true`, keeping the exercise's $100\text{ s}$ recording and `--rate 2.5`.
- **Inject:** run `ros2 bag play arm_test_bag --rate 2.5` and omit the `--clock` flag, leaving `robot_state_publisher` and the estimator on simulated time.
- **Symptom:** the bag reports $40.0\text{ s}$ of wall-clock playback, but every node's `now()` stays at $0$ simulation seconds; timers that should fire every $K = \lceil 1\text{ ms}/1\text{ ms} \rceil = 1$ step never fire, and `tf2` throws `Lookup would require extrapolation` because it holds a $12\text{ s}$ sim-time transform while a wall-clock node queries at $1.7 \times 10^9\text{ s}$.
- **Diagnose:** the file plays and `/joint_states` messages exist, so the bag, the rate factor and the MCAP index are all healthy; a frozen `now()` on a bag that is visibly advancing can only be a missing `/clock` publisher, not a decimation or timer-period error.
- **Fix:** add `--clock`, then prove it by `ros2 topic hz /clock` reporting $1\text{ kHz}$ and `ros2 topic echo /clock` advancing $0.001\text{ s}$ per message, with the estimator's $\dot{q}$ back at $20\text{ rad/s}$ at $0.25\times$, $1\times$ and $4\times$.

## 6. Simulation path
Inspect the reference URDF and MuJoCo XML scene in `08-capstone-projects/urdf-mujoco-capstone3-6dof/` or open **URDF / MuJoCo & STO** in the MechaLab Workbench (`npm run dev`). In a local ROS 2 + Gazebo Harmonic / MuJoCo workspace (see [`resources/open-source-toolchains.md` §0](../resources/open-source-toolchains.md#0-core-supported-os-environment-terminal-bootstrap--python-venv-setup)), launch `robot_state_publisher` with the repository's reference URDF and record an MCAP bag:
```bash
# Terminal 1: Publish the repository's 6-DOF reference URDF with simulated clock enabled
ros2 run robot_state_publisher robot_state_publisher 08-capstone-projects/urdf-mujoco-capstone3-6dof/capstone3_6dof_arm.urdf --ros-args -p use_sim_time:=true
# Terminal 2: Record deterministic MCAP bag of joint states and TF (press Ctrl+C after 5s)
ros2 bag record -s mcap -o arm_test_bag /clock /joint_states /tf /tf_static
# Terminal 3: Inspect bag metadata and replay with simulated clock
ros2 bag info arm_test_bag && ros2 bag play arm_test_bag --clock --rate 1.0
```
```text
[MuJoCo / Gazebo Physics Step (1 kHz)] ==(/clock + state_interfaces)==> [ros2_control: read() -> update() -> write()]
         ^                                                                      || (/joint_states)
         |========================(command_interfaces: tau_cmd)=================++==> [robot_state_publisher -> /tf]
                                                                                ||
                                                                       [rosbag2 MCAP Recorder]
```
Pass/fail verification in simulation: `disk_rate_mbs == 1.874624 MB/s`, `dq_est == 20.0 rad/s` across all playback rates, and `q_sim(20ms) == 0.0825 rad`.

The graded package is also a workbench entry: **Modules -> `EX.06-robotics.T2.06b`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.


```mermaid
flowchart LR
    A["06-robotics.T2.06b: ros2_launch_parameters_and_composition"] --> B["rosbag2_mcap_recording_and_deterministic_replay"]
    B --> C["ros2_simulator_bridge_and_joint_state_loop"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: score $\ge 80\%$ ($4/5$) on the Skip test or score $\ge 80\%$ ($8/9$) on the Ladder Gate test below to unlock Step 2.7 (`06-robotics.T2.07`).

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: ros2_launch_parameters_and_composition]` A camera node publishes $B_{\text{msg}} = 1{,}000{,}000\text{ bytes}$ ($1.0\text{ MB}$) images at $f_{\text{pub}} = 30.0\text{ Hz}$ to $N_{\text{sub}} = 2$ intra-process `ComposableNode` subscribers inside the same `ComposableNodeContainer` (`use_intra_process_comms=True`, zero-copy `unique_ptr`). Compute the memory copy bandwidth $\Delta R_{\text{saved}} = \frac{N_{\text{sub}} \cdot B_{\text{msg}} \cdot f_{\text{pub}}}{10^6}$ saved in $\text{MB/s}$ (tolerance $\pm 10^{-6}\text{ MB/s}$).
2. `[Apply] [Concept: rosbag2_mcap_recording_and_deterministic_replay]` You record a single topic of total framed size $B_{\text{framed}} = 500\text{ bytes/msg}$ at $f = 1000.0\text{ Hz}$ for $T_{\text{rec}} = 60.0\text{ s}$ with `zstd` compression ratio $c = 0.50$. Compute the resulting `.mcap` file size $S_{\text{MB}} = \frac{c \cdot f \cdot B_{\text{framed}} \cdot T_{\text{rec}}}{10^6}$ in $\text{MB}$ (tolerance $\pm 10^{-6}\text{ MB}$).
3. `[Transfer] [Concept: ros2_simulator_bridge_and_joint_state_loop]` A physics simulator (`MuJoCo` / `Gazebo`) steps at $f_{\text{sim}} = 2000\text{ Hz}$ ($\Delta t_{\text{sim}} = 0.5\text{ ms}$) and drives a `ros2_control` `controller_manager` configured with decimation factor $D = 2$ (so `update()` runs every $D$ physics steps). Compute the resulting `ros2_control` control loop frequency $f_{\text{ctrl}} = f_{\text{sim}} / D$ in $\text{Hz}$ (tolerance $\pm 10^{-6}\text{ Hz}$).
4. `[Concept: rosbag2_mcap_recording_and_deterministic_replay]` When replaying a recorded `rosbag2` archive with `ros2 bag play my_bag --clock` to test a Kalman filter node offline, what parameter must be set on the Kalman filter node so its timers and velocity derivatives use the bag's recorded timestamps instead of the computer's wall clock?
   - **A.** `use_sim_time:=true`
   - **B.** `use_sim_time:=false`
   - **C.** `ROS_DOMAIN_ID=999`
   - **D.** `rm -rf build/`
5. `[Spaced review -> 06-robotics.T2.06a — Concept: tf2_transform_tree_and_urdf_kinematics]` A transform tree has $A \to B$ at $0.50\,\text{m}$ and $B \to C$ at $0.30\,\text{m}$ along the same axis. Compute the $A \to C$ translation in metres (tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_saved_mbs = (2.0 * 1_000_000.0 * 30.0) / 1e6
q2_bag_mb = (0.50 * 1000.0 * 500.0 * 60.0) / 1e6
q3_fctrl_hz = 2000.0 / 2.0
q4_choice = "A"

assert math.isclose(q1_saved_mbs, 60.0, rel_tol=1e-9)
assert math.isclose(q2_bag_mb, 15.0, rel_tol=1e-9)
assert math.isclose(q3_fctrl_hz, 1000.0, rel_tol=1e-9)
assert q4_choice == "A"
q5_review = 0.50 + 0.30
assert math.isclose(q5_review, 0.8, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; if you missed Q2 or Q4, study `## 3. Formalization` item 2; if you missed Q3, study `## 3. Formalization` item 3. If you missed  Q5, review `06-robotics.T2.06a`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 06 Tier 2 bridge ladder (`06-robotics.T2.06a` $\to$ `06-robotics.T2.06b`) before Step 2.7 (`06-robotics.T2.07`):
1. `[Concept: ros2_nodes_topics_services_and_qos]` Which ROS 2 communication primitive is best suited for a long-running trajectory goal (`FollowJointTrajectory`) that takes $4.0\text{ s}$, streams continuous progress feedback, and must be cancelable mid-flight?
   - **A.** Action (`Goal` + `Feedback` + `Result` + `Cancel`)
   - **B.** Synchronous blocking Service (`srv`)
   - **C.** Static parameter string
   - **D.** Environment variable
2. `[Concept: ros2_nodes_topics_services_and_qos]` In a ROS 2 `SingleThreadedExecutor` running a $100\text{ Hz}$ timer ($T = 10.0\text{ ms}$) alongside a synchronous service callback that blocks for $C_{\text{srv}} = 45.0\text{ ms}$, how many $10.0\text{ ms}$ timer ticks are delayed while that single service call executes ($\lfloor 45.0 / 10.0 \rfloor$, exact integer, tolerance $\pm 0$)?
3. `[Concept: tf2_transform_tree_and_urdf_kinematics]` A `tf2` buffer holds two consecutive transforms for `base_link -> tool0` at $t_a = 5.00\text{ s}$ ($x_a = 0.20\text{ m}$) and $t_b = 5.02\text{ s}$ ($x_b = 0.30\text{ m}$). Compute the linearly interpolated position $x(t_{\text{query}})$ in meters ($\text{m}$, tolerance $\pm 10^{-9}\text{ m}$) at $t_{\text{query}} = 5.01\text{ s}$.
4. `[Concept: ros2_control_hardware_interface_read_write]` What is the exact execution order of the three methods called by `ros2_control`'s `controller_manager` on every real-time control tick?
   - **A.** `read(time, period)` $\to$ `update(time, period)` $\to$ `write(time, period)`
   - **B.** `write()` $\to$ `read()` $\to$ `sleep(10)`
   - **C.** `update()` $\to$ `compile()` $\to$ `reboot()`
   - **D.** `read()` only
5. `[Concept: ros2_control_hardware_interface_read_write]` If `controller_manager` runs at $1000\text{ Hz}$ ($1.0\text{ ms}$ period) and `read()` takes $0.25\text{ ms}$, `update()` takes $0.15\text{ ms}$, and `write()` takes $0.20\text{ ms}$, compute the remaining timing margin $t_{\text{margin}} = 1.0 - (0.25 + 0.15 + 0.20)$ in milliseconds ($\text{ms}$, tolerance $\pm 10^{-9}$).
6. `[Concept: ros2_launch_parameters_and_composition]` Why do high-bandwidth perception pipelines load camera drivers and image processors as `ComposableNode` plugins inside a single `ComposableNodeContainer` with `use_intra_process_comms=True`?
   - **A.** To pass `std::unique_ptr` message pointers directly in shared process memory with zero serialization and zero payload copies.
   - **B.** To force all images to be written to an SD card first.
   - **C.** Because ROS 2 cannot publish images over topics otherwise.
   - **D.** To disable the CPU cache.
7. `[Concept: rosbag2_mcap_recording_and_deterministic_replay]` Compute the uncompressed `rosbag2` disk write rate $R_{\text{MB/s}} = \frac{f \cdot B_{\text{framed}}}{10^6}$ in $\text{MB/s}$ (tolerance $\pm 10^{-9}$) when recording a $f = 500\text{ Hz}$ telemetry stream with framed size $B_{\text{framed}} = 400\text{ bytes/msg}$.
8. `[Concept: ros2_simulator_bridge_and_joint_state_loop]` In a closed-loop `MuJoCo` / `Gazebo Harmonic` + `ros2_control` simulation, how do simulated joint angles reach `RViz2`'s 3D robot model (`tf2` tree) while motor torques reach the physics solver?
   - **A.** The simulator's `SystemInterface::read()` populates `state_interfaces` $\to$ `joint_state_broadcaster` publishes `/joint_states` $\to$ `robot_state_publisher` combines `/joint_states` with the URDF to broadcast `/tf`; simultaneously, the controller writes torques to `command_interfaces` $\to$ `SystemInterface::write()` applies them to the physics solver step.
   - **B.** `RViz2` solves the rigid-body differential equations and emails torques to `rosbag2`.
   - **C.** The URDF file directly drives the motors without `ros2_control`.
   - **D.** Simulator integration only works if `use_sim_time` is `false` and `/clock` is deleted.

9. `[Concept: unit_quaternion_kinematics_slerp]` A `rosbag2` replay feeds two consecutive orientation samples whose quaternions satisfy $q_0 \cdot q_1 < 0$. Why must the replayer negate $q_1$ before interpolating?
   - **A.** Because $q$ and $-q$ encode the same rotation, so a negative dot product means the stored signs are opposite and the naive slerp would sweep the long arc; flipping one sign takes the short one.
   - **B.** Because the quaternion norm would otherwise exceed one.
   - **C.** Because MCAP stores quaternions in $x, y, z, w$ order.
   - **D.** Because the timestamp would otherwise extrapolate.

**Gate answer key:**
```python
import math

g1_choice = "A"
g2_delayed = int(45.0 // 10.0)
alpha_g3 = (5.01 - 5.00) / (5.02 - 5.00)
g3_x_m = (1.0 - alpha_g3) * 0.20 + alpha_g3 * 0.30
g4_choice = "A"
g5_margin_ms = 1.0 - (0.25 + 0.15 + 0.20)
g6_choice = "A"
g7_rate_mbs = (500.0 * 400.0) / 1e6
g8_choice = "A"
g9_choice = "A"

assert g1_choice == "A"
assert g2_delayed == 4
assert math.isclose(g3_x_m, 0.25, rel_tol=1e-9)
assert g4_choice == "A"
assert math.isclose(g5_margin_ms, 0.40, rel_tol=1e-9)
assert g6_choice == "A"
assert math.isclose(g7_rate_mbs, 0.20, rel_tol=1e-9)
assert g8_choice == "A"
assert g9_choice == "A"
```
- **Pass mark:** $8/9$ ($80\%+$). Remediation: Q1–Q5, Q9 $\to$ `06-robotics.T2.06a`; Q6–Q8 $\to$ `06-robotics.T2.06b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| Nodes freeze or timers never fire when replaying a `rosbag2` with `use_sim_time:=true` | Forgot to pass the `--clock` flag to `ros2 bag play`, so no `/clock` messages are published. | Always run `ros2 bag play <bag> --clock` whenever downstream nodes have `use_sim_time:=true`. |
| `tf2` throws `Lookup would require extrapolation into the past` during simulation or bag replay | Mixed wall-clock nodes (`use_sim_time:=false`) with simulated-clock nodes (`use_sim_time:=true`), stamping `/tf` at $t = 12\text{ s}$ (sim time) while querying at $t = 1.7 \times 10^9\text{ s}$ (Unix epoch time). | Set `use_sim_time: true` globally in your `LaunchDescription` across **all** nodes (`robot_state_publisher`, `rviz2`, controllers, estimators). |
| Simulated robot arm collapses to the floor as soon as `Gazebo` or `MuJoCo` starts | Spawned the robot model before loading and activating `joint_state_broadcaster` and the position/impedance controller in `controller_manager`. | Use `RegisterEventHandler(OnProcessExit(...))` in your launch file to spawn `joint_state_broadcaster` and your active controller immediately as the simulator `controller_manager` comes online. |

## 9. Resources
- **Open Robotics & Foxglove — *Official `rosbag2` MCAP Documentation (`docs.ros.org`), `Launch` Tutorials & `gz_ros2_control` / `mujoco_ros2_control`* (`resources/open-source-toolchains.md`):** Complete guides to Python launch files, ComposableNodes, MCAP recording/replay, and simulator `ros2_control` plugins `[VERIFIED 2026-10-15]`.
- **Track 06 (`06-robotics-and-autonomy/README.md`):** Directly continues into Step 2.7 (`06-robotics.T2.07`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to legacy **Step 2.7 (`06-robotics.T2.07`)** in [`06-robotics-and-autonomy/README.md`](../06-robotics-and-autonomy/README.md#tier-2-intermediate--applied).
