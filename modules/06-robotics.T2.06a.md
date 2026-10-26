---
id: 06-robotics.T2.06a
title: "ROS 2 Computational Graph (Nodes, Executors, Topics, Services, Actions, QoS), TF2 Frames, URDF & ros2_control"
track: "06"
tier: 2
prereqs:
  - 02-mechanics.T2.02a
  - 04-embedded.T2.04b
  - 05-control.T2.05a
new_concepts:
  - ros2_nodes_topics_services_and_qos
  - tf2_transform_tree_and_urdf_kinematics
  - ros2_control_hardware_interface_read_write
owns:
  - unit_quaternion_kinematics_slerp
uses:
  - se3_homogeneous_transformation_matrix
  - parallel_axis_urdf_inertia_tensor
  - can_fd_mit_impedance_packet_packing
est_hours: 5.5
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
> **Run this in the workbench.** [Open MechaLab with `EX.06-robotics.T2.06a` loaded](https://tle47.github.io/Mechatronics-Roadmap/?lesson=EX.06-robotics.T2.06a) - it opens on the **Run Python Lessons** tab with that entry selected. Starter code, hints and the graded check are ready; this page is the reading copy, and nothing you type here is saved.
<!-- run-callout:end -->

## 1. Why it matters
This is the dedicated **ROS 2 bridge module** before Step 2.7 (`06-robotics.T2.07`) and your gateway to the Graduate Goal (building and tuning a custom robot arm with ROS 2 and a learned policy). Before running Cartesian impedance controllers (`06-robotics.T2.07`), `MoveIt 2`, or `Hugging Face LeRobot` policies (`06-robotics.T3.07`), you must master the complete **ROS 2 (`Jazzy` / `Lyrical`)** architecture: how **Nodes** and **Executors** (`SingleThreadedExecutor` vs. `MultiThreadedExecutor` + `CallbackGroups`) schedule callbacks, how **Topics**, **Services**, **Actions**, and **Parameters** exchange typed messages under strict **QoS** rules (`Reliable` vs. `Best-Effort`, `Transient Local` vs. `Volatile`), how workspaces are built (`package.xml`, `colcon build`, Python `LaunchDescription`), how the **`tf2` transform tree** chains 3D coordinate frames (`world -> base_link -> link_1 -> tool0`) from your **URDF/Xacro** robot description, and how **`ros2_control`** separates real-time hardware drivers (`SystemInterface::read()` / `write()`) from controllers (`joint_trajectory_controller`) without DDS network jitter! Already know this? Take the Skip test in section 7 first.

## 2. Intuition first

<!-- figure: ros-graph | Boxes are processes and arrows are typed messages; nothing calls anything directly. -->


<!-- figure: loop-timing | An executor is a deadline: the work has to finish before the next callback. -->

Imagine a robot software stack as a modern airport:
- **ROS 2 Nodes, Executors & Callback Groups:** Each **Node** (`rclcpp::Node` / `rclpy.node.Node`) is a modular specialist team (Camera Node, Planner Node, Safety Monitor Node). An **Executor** is the dispatcher that pulls incoming events (timers, topic messages, service requests) from the DDS middleware queue and runs your callback functions. A `SingleThreadedExecutor` runs one callback at a time sequentially (if one callback blocks for $200\text{ ms}$, every timer in that node stalls!), whereas a `MultiThreadedExecutor` paired with `MutuallyExclusiveCallbackGroup` or `ReentrantCallbackGroup` lets a slow planning service run on Thread B without delaying a $100\text{ Hz}$ state-publishing timer on Thread A.
- **Topics, Services, Actions & Parameters:**
  - **Topics (Publish / Subscribe):** Continuous radio broadcast streams (`sensor_msgs/msg/JointState`, `geometry_msgs/msg/Twist`) governed by **Quality of Service (QoS)**: high-rate camera/IMU streams use `Best-Effort / Volatile / KeepLast(1)` (drop an old frame rather than stall on a retry), whereas latched maps and robot descriptions (`/robot_description`) use `Reliable / Transient Local`.
  - **Services (`srv`):** Fast synchronous request-reply calls (`std_srvs/srv/SetBool` to zero a force sensor—never use for long blocking motions!).
  - **Actions (`action`):** Long-running preemptible state machines (`control_msgs/action/FollowJointTrajectory`) consisting of a **Goal** request, a continuous **Feedback** stream (percent complete / tracking error), a final **Result**, and mid-flight **Cancel** support.
  - **Parameters & Launch Files:** Dynamic node settings (`kp`, `max_vel`, `urdf_path`) loaded at startup from YAML via a Python `LaunchDescription` (`ros2 launch my_arm_bringup arm.launch.py`) after building the workspace with `colcon build --symlink-install`.
- **`tf2` & URDF/Xacro:** The airport's live 3D radar map. Your **URDF** file declares each `<link>` (`<inertial>`, `<visual>`, `<collision>`) and `<joint>` (`parent`, `child`, `<origin xyz rpy>`, `<axis xyz>`). The `robot_state_publisher` node reads the URDF plus `/joint_states` and broadcasts the $SE(3)$ transform tree onto `/tf` (dynamic joints) and `/tf_static` (rigidly bolted sensors) so any node can ask "Where is `camera_optical_frame` relative to `tool0` at timestamp $t$?"
- **`ros2_control` (`controller_manager`):** The hard-real-time engine room. Instead of sending $1\text{ kHz}$ motor torques over network topics, `ros2_control` loads your C++ controller plugin and your C++ hardware driver (`SystemInterface::read(time, period)` $\to$ `update(time, period)` $\to$ `write(time, period)`) into the **same real-time process**, passing raw C++ pointers to `state_interfaces` (`position`, `velocity`, `effort`) and `command_interfaces` (`effort`, `position`) with zero serialization jitter!

## 3. Formalization
1. **ROS 2 Graph, Executor Scheduling & QoS Compatibility Rule:**
   - **QoS `offered >= requested` Rule:** A publisher offering `(Reliability_pub, Durability_pub)` and a subscriber requesting `(Reliability_sub, Durability_sub)` connect iff **both** policies are compatible:

$$
\text{Compatible} \iff (\text{Rel}_{\text{pub}} \ge \text{Rel}_{\text{sub}}) \;\land\; (\text{Dur}_{\text{pub}} \ge \text{Dur}_{\text{sub}})
$$

     where $\text{Reliable (1)} > \text{Best-Effort (0)}$ and $\text{Transient Local (1)} > \text{Volatile (0)}$. A `Best-Effort` publisher **cannot** connect to a `Reliable` subscriber, and a `Volatile` publisher **cannot** connect to a `Transient Local` subscriber!
   - **Topic Bandwidth & Executor Budget:** Publishing messages of size $B_{\text{msg}}$ bytes at frequency $f_{\text{pub}}$ ($\text{Hz}$) to $N_{\text{sub}}$ unicast subscribers consumes network bandwidth $R_{\text{MB/s}} = \frac{N_{\text{sub}} \cdot B_{\text{msg}} \cdot f_{\text{pub}}}{10^6}\text{ MB/s}$. In a `SingleThreadedExecutor`, the worst-case blocking delay before a high-priority timer callback can fire is the maximum execution time $\max_k C_k$ of any callback in that executor.
2. **`tf2` Tree Structure & $SE(3)$ Frame Lookup:** Every `tf2` coordinate frame has **at most one parent** (forming a directed tree with $N - 1$ directed edges for $N$ frames, never a cycle or multi-parent diamond). Given chain `base_link` $\xrightarrow{T_{b1}(q_1)}$ `link_1` $\xrightarrow{T_{12}(q_2)}$ `tool0`, `tf2` computes the transform from `tool0` to `base_link` at timestamp $t$ via:

$$
T_{\text{base}\leftarrow\text{tool0}}(t) = T_{b1}(q_1(t)) \cdot T_{12}(q_2(t)), \quad p_{\text{base}}(t) = T_{\text{base}\leftarrow\text{tool0}}(t) \, p_{\text{tool0}}
$$

   For a revolute URDF joint with origin offset $p_{\text{xyz}}$ and unit axis $\hat{a} = [0, 0, 1]^\top$, $T_{\text{parent}\leftarrow\text{child}}(q) = \begin{bmatrix} R_z(q) & p_{\text{xyz}} \\ 0 & 1 \end{bmatrix}$. When querying `lookupTransform(target, source, t_sensor)` between asynchronous streams, `tf2` linearly/SLERP interpolates between buffered timestamps $t_a \le t_{\text{sensor}} \le t_b$:

$$
\alpha = \frac{t_{\text{sensor}} - t_a}{t_b - t_a} \in [0, 1], \qquad p(t_{\text{sensor}}) = (1 - \alpha)p(t_a) + \alpha p(t_b)
$$

   (requesting $t_{\text{sensor}} > t_b$ throws `tf2::ExtrapolationException`).

   - **Quaternion Orientation & SLERP in `tf2`:** Each frame's rotation is buffered as a **unit quaternion** $q = (w, x, y, z)$, and an orientation query interpolates the rotation with **SLERP**, not a linear blend:

$$
\operatorname{slerp}(q_a, q_b, \alpha) = \frac{\sin((1-\alpha)\Omega)}{\sin\Omega}\,q_a + \frac{\sin(\alpha\Omega)}{\sin\Omega}\,q_b, \qquad \Omega = \cos^{-1}(q_a \cdot q_b)
$$

     Because $q$ and $-q$ are the same attitude, `tf2` negates $q_b$ when $q_a \cdot q_b < 0$ so the interpolation takes the short arc; blending the four components linearly shortens the quaternion, and renormalizing it does not restore constant angular speed between the samples.
3. **`ros2_control` Lifecycle & Real-Time `read -> update -> write` Loop:** Inside `controller_manager` running on a `SCHED_FIFO` real-time thread at period $\Delta t = 1/f_{\text{ctrl}}$ ($\text{s}$):
   - **Step A (`read`):** `hardware_interface::SystemInterface::read(time, period)` unpacks encoder/current feedback from SocketCAN (`04-embedded.T2.05`) or `micro-ROS` into exported `state_interfaces` $(q_i, \dot{q}_i, \tau_{i,\text{meas}})$.
   - **Step B (`update`):** Active controllers (`JointTrajectoryController`, Cartesian impedance) execute `update(time, period)` in-memory and write `command_interfaces` $(\tau_{i,\text{cmd}})$.
   - **Step C (`write`):** `SystemInterface::write(time, period)` packs $\tau_{i,\text{cmd}}$ into CAN-FD MIT frames and transmits them to the actuators, satisfying $t_{\text{read}} + t_{\text{update}} + t_{\text{write}} \le \Delta t$.

## 4. Worked example
**Predict first (before you run it):** Commit to three outcomes before the code runs. (1) Of the $16$ QoS `(Reliability, Durability)` combinations, how many connect under `offered >= requested`, and does `Best-Effort` into `Reliable` connect? (2) With $q_1 = 0$ and $q_2 = \pi/2$, where does $p_{\text{in,tool}} = [0.15, 0.0, 0.0, 1]^\top$ land in `base_link`? (3) Between $t_a = 1.000\text{ s}$ ($x = 0.20\text{ m}$) and $t_b = 1.010\text{ s}$ ($x = 0.25\text{ m}$), what does `tf2` return at $t = 1.004\text{ s}$? Two tells: a count of $16$ means you tested equality instead of $\ge$, so the two failing rows went unnoticed; a point that lands at $[0.25, -0.15, 0.10]$ means the joint turned backwards, and an interpolated value that equals either endpoint means $\alpha$ was divided by the wrong interval.

Simulate a complete ROS 2 + `tf2` + `ros2_control` pipeline in pure Python: (1) verify the full 2D QoS `(Reliability, Durability)` compatibility matrix and compute camera topic bandwidth, (2) run `robot_state_publisher` forward kinematics and `tf2` temporal interpolation on a 2-DOF URDF chain (`base_link -> link_1 -> tool0`), and (3) execute one $1\text{ kHz}$ `ros2_control` `read() -> update() -> write()` tick.

```python
import math

def qos_compatible(pub_rel: bool, pub_trans_local: bool, sub_rel: bool, sub_trans_local: bool) -> bool:
    # Offered >= Requested for both Reliability (Reliable=True > BestEffort=False)
    # and Durability (TransientLocal=True > Volatile=False)
    rel_ok = int(pub_rel) >= int(sub_rel)
    dur_ok = int(pub_trans_local) >= int(sub_trans_local)
    return rel_ok and dur_ok

assert qos_compatible(True, True, True, True) is True
assert qos_compatible(True, False, False, False) is True
assert qos_compatible(False, False, True, False) is False  # Best-Effort pub -> Reliable sub FAILS!
assert qos_compatible(True, False, True, True) is False    # Volatile pub -> TransientLocal sub FAILS!

def urdf_revolute_z(xyz: tuple[float, float, float], q_rad: float) -> list[list[float]]:
    c, s = math.cos(q_rad), math.sin(q_rad)
    return [[c, -s, 0.0, xyz[0]],
            [s,  c, 0.0, xyz[1]],
            [0.0, 0.0, 1.0, xyz[2]],
            [0.0, 0.0, 0.0, 1.0]]

def mat4_mul(A: list[list[float]], B: list[list[float]]) -> list[list[float]]:
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

# TF2 chain: base_link --(joint1 at [0,0,0.1], q1=0)--> link_1 --(joint2 at [0.25,0,0], q2=pi/2)--> tool0
T_b_l1 = urdf_revolute_z((0.0, 0.0, 0.10), q_rad=0.0)
T_l1_tool = urdf_revolute_z((0.25, 0.0, 0.0), q_rad=math.pi / 2.0)
T_b_tool = mat4_mul(T_b_l1, T_l1_tool)
p_in_tool = [0.15, 0.0, 0.0, 1.0]  # 15 cm along tool0 +X
p_in_base = [sum(T_b_tool[i][j] * p_in_tool[j] for j in range(4)) for i in range(3)]
assert all(math.isclose(p_in_base[i], [0.25, 0.15, 0.10][i], abs_tol=1e-9) for i in range(3))

# tf2 buffer interpolation between t_a = 1.000 s (x = 0.20 m) and t_b = 1.010 s (x = 0.25 m) at t_query = 1.004 s:
alpha = (1.004 - 1.000) / (1.010 - 1.000)
x_interp = (1.0 - alpha) * 0.20 + alpha * 0.25
assert math.isclose(x_interp, 0.22, rel_tol=1e-9)

# ros2_control 1 kHz cycle: read() -> controller.update() -> write()
state_if = {"q": 0.0, "dq": 0.0}
cmd_if = {"effort": 0.0}
def hw_read(can_q: float, can_dq: float) -> None:
    state_if["q"], state_if["dq"] = can_q, can_dq
def controller_update(q_des: float, kp: float = 20.0, kd: float = 1.5) -> None:
    cmd_if["effort"] = kp * (q_des - state_if["q"]) - kd * state_if["dq"]

hw_read(can_q=0.40, can_dq=0.20)
controller_update(q_des=0.50)
assert math.isclose(cmd_if["effort"], 20.0 * 0.10 - 1.5 * 0.20, rel_tol=1e-9)
print(f"p_in_base={[round(x, 4) for x in p_in_base]}, x_tf2={x_interp:.3f} m, effort_cmd={cmd_if['effort']:.2f} N*m")
```
Expected output:
```text
p_in_base=[0.25, 0.15, 0.1], x_tf2=0.220 m, effort_cmd=1.70 N*m
```

## 5. Exercise
In the `tf2` tree above (`T_b_l1 = urdf_revolute_z((0, 0, 0.10), q1)` and `T_l1_tool = urdf_revolute_z((0.25, 0, 0), q2)`), compute (a) the 3D position of `p_in_tool = [0.15, 0.0, 0.0, 1.0]` in `base_link` when $q_1 = \pi/2\text{ rad}$ and $q_2 = 0.0\text{ rad}$, and (b) the interpolated `tf2` joint angle $q(t_{\text{query}})$ at $t_{\text{query}} = 2.006\text{ s}$ between buffered samples $(t_a = 2.000\text{ s}, q_a = 0.50\text{ rad})$ and $(t_b = 2.010\text{ s}, q_b = 0.70\text{ rad})$. Verify that `p_in_base` equals `[0.0, 0.40, 0.10]` $\text{m}$ ($\pm 10^{-9}\text{ m}$) and $q(2.006\text{ s}) = 0.62\text{ rad}$ ($\pm 10^{-9}\text{ rad}$).
- **If your result differs:** When $q_1 = \pi/2\text{ rad}$ and $q_2 = 0\text{ rad}$, both the $0.25\text{ m}$ `link_1` offset and the $0.15\text{ m}$ `tool0` offset point along the $+Y$ axis of `base_link` ($0.25 + 0.15 = 0.40\text{ m}$); and $\alpha = \frac{2.006 - 2.000}{0.010} = 0.60 \implies 0.50 + 0.60(0.20) = 0.62\text{ rad}$.

### Graded package - the graph's promises and the arm's chain
[`exercises/06-robotics.T2.06a/`](../exercises/06-robotics.T2.06a/) turns this section into a test. `starter.py` holds seven holes: `qos_compatible` (two inequalities, not a match), `urdf_revolute_z`, `mat4_mul`, `transform_point`, `invert_rigid` (`R^T`, `-R^T p`), `interpolate` (refusing extrapolation the way tf2 does) and `topic_bandwidth_mb_s`. Edit it, then run the tests the way CI does:

```bash
EXERCISE_TARGET=exercises/06-robotics.T2.06a/starter.py \
  python3 -m unittest discover -s exercises/06-robotics.T2.06a -p 'test_*.py'
```

The tests are behavioural: all **16** QoS combinations must match the `offered >= requested` rule, including the two that fail (Best-Effort into Reliable, Volatile into Transient Local); a zero joint must be a pure translation and a quarter turn must send $+X$ to $+Y$; two product orders must land the origin at **absolute** positions ($(0.1, 0.1)$ and $(0.2, 0)$), because comparing the two products to each other is symmetric and passes a reversed multiply; the rigid inverse must round-trip a point and undo a translation; a query outside the buffer must **raise**; and the bandwidth must scale with the subscriber count. The transfer suite builds the plant's own arm as a tf2 chain - `Rz(q1) Trans(L1) Rz(q2) Trans(L2)` from `plant.L1`/`plant.L2` - and requires it to reproduce `plant.fk` at five poses, to keep a tool point at the plant's own tip plus `d` along the tool axis, and to invert into the base seen from the tool at the tip's distance. Four planted faults - `qos_equality`, `joint_turns_backwards`, `product_reversed`, `interpolate_extrapolates` - each fail the test named for them.


- **📚 What to Learn & Resources to Solve This Exercise:**
  - **Required Foundations Modules (`00-foundations`):** [`00-foundations.T1.00d`](00-foundations.T1.00d.md) (*2D Rotation Angles*), **Step 1.1 (`00-foundations.T1.01`)** ($SO(2)$ Rotation Matrices), [`00-foundations.T2.00a`](00-foundations.T2.00a.md) (*Matrix Multiplication & Transpose*), and [`00-foundations.T2.00b`](00-foundations.T2.00b.md) (*3D Coordinate Frames*).
  - **Prerequisite Bridge Modules:** [`02-mechanics.T1.03`](../02-mechanics-kinematics-dynamics/README.md), [`04-embedded.T1.05`](../04-embedded-and-realtime/README.md), [`05-control.T1.06`](../05-control-and-estimation/README.md), and [`06-robotics.T1.06a`](06-robotics.T1.06a.md).
  - **Core Concepts to Review First:** ROS 2 DDS QoS compatibility truth table (`RELIABLE` vs. `BEST_EFFORT`) and deadline period, `SingleThreadedExecutor` deterministic ready-set priority (Timers $\to$ Subscriptions $\to$ Services $\to$ Clients), and `tf2` homogeneous rigid-body transform chaining ${}^W T_C = {}^W T_B \, {}^B T_C$ and inverse ${}^C T_W = ({}^W T_C)^{-1}$ in `## 3. Formalization` and `## 4. Worked example` above.
  - **Study Links & Resources:** [Official ROS 2 Jazzy/Humble Tutorials: QoS, Executors & TF2 (`docs.ros.org`)](https://docs.ros.org/en/jazzy/Tutorials.html) and [`resources/open-source-toolchains.md`](../resources/open-source-toolchains.md).

### Starter code
```python
# --- Exercise scaffold: fill in each TODO, then check against the numbers in the full solution ---
import math


def qos_compatible(pub_reliable, pub_transient_local, sub_reliable, sub_transient_local):
    """True when the publisher's offer satisfies the subscriber's request on both policies."""
    # TODO: two independent inequalities (Reliable >= Best-Effort, TransientLocal >= Volatile), not a match
    ...


def urdf_revolute_z(xyz, q_rad):
    """`[Rz(q), xyz; 0, 1]` for a revolute joint about +Z."""
    # TODO: the rotation in the top-left 3x3, the offset in the last column, 1 in the corner
    ...


def mat4_mul(a, b):
    """Product of two 4x4 homogeneous transforms."""
    # TODO: row-by-column over four, in the order A then B
    ...


def transform_point(t, p):
    """Apply a homogeneous transform to a 3-vector."""
    # TODO: rotate, then add the translation column
    ...


def invert_rigid(t):
    """Inverse of a rigid transform."""
    # TODO: R^T for the rotation and -R^T p for the offset - never a general 4x4 inverse
    ...


def interpolate(t_a, value_a, t_b, value_b, t_query):
    """Linear interpolation in time; raise ValueError outside the buffer."""
    # TODO: compute alpha = (t_query - t_a) / (t_b - t_a), then refuse a query outside the two stamps
    ...


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    """Unicast bandwidth to `n_subs` subscribers, in MB/s."""
    # TODO: subscribers x bytes x hertz, over 1e6
    ...


print("scaffold ready: 7 TODOs to fill, then compare against the numbers in the full solution")
```

### Hint ladder
1. **QoS is two inequalities, not a match.** Score Reliable $= 1$, Best-Effort $= 0$, Transient Local $= 1$ and Volatile $= 0$, then require *both* `offered >= requested`. Of the $16$ `(Reliability, Durability)` pairs, $9$ connect: the two that fail this exercise's eye are Best-Effort into Reliable and Volatile into Transient Local.
2. **One joint, then the chain.** `urdf_revolute_z(xyz, q)` is $\begin{bmatrix} R_z(q) & xyz \\ 0 & 1\end{bmatrix}$, so a zero $q$ is pure translation and a quarter turn sends $+X$ to $+Y$. With $q_1 = \pi/2$ the $0.25\ \text{m}$ link offset itself lands at $[0, 0.25, 0]$, and the $0.15\ \text{m}$ tool offset is rotated by the *same* $R_z(\pi/2)$: $[0, 0.15, 0]$. Adding the $0.10\ \text{m}$ base height gives $[0, 0.40, 0.10]$.
3. **Interpolation is a fraction of the buffer.** $\alpha = (2.006 - 2.000)/(2.010 - 2.000) = 0.60$, so $q = 0.50 + 0.60(0.70 - 0.50) = 0.62\ \text{rad}$; a $t_{\text{query}}$ outside $[t_a, t_b]$ must raise, exactly as `tf2` throws `ExtrapolationException` instead of guessing.
4. **Bandwidth counts subscribers.** $R = N_{\text{sub}} B_{\text{msg}} f_{\text{pub}}/10^6$, so $2 \times 250{,}000 \times 60 = 30.0\ \text{MB/s}$ - a single-subscriber answer is short by exactly the subscriber count.

5. **What the suite refuses.** `interpolate` refuses a query outside the two samples' span: extrapolating is a different model, not a longer line, so it raises `ValueError` rather than inventing a value.

### Full Solution
```python
import math


def qos_compatible(pub_reliable, pub_transient_local, sub_reliable, sub_transient_local):
    reliable_ok = int(bool(pub_reliable)) >= int(bool(sub_reliable))
    durability_ok = int(bool(pub_transient_local)) >= int(bool(sub_transient_local))
    return reliable_ok and durability_ok


def urdf_revolute_z(xyz, q_rad):
    c, s = math.cos(q_rad), math.sin(q_rad)
    return [[c, -s, 0.0, xyz[0]],
            [s, c, 0.0, xyz[1]],
            [0.0, 0.0, 1.0, xyz[2]],
            [0.0, 0.0, 0.0, 1.0]]


def mat4_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def transform_point(t, p):
    return [sum(t[i][j] * p[j] for j in range(3)) + t[i][3] for i in range(3)]


def invert_rigid(t):
    r_t = [[t[j][i] for j in range(3)] for i in range(3)]
    inverse = [[r_t[i][0], r_t[i][1], r_t[i][2],
                -(r_t[i][0] * t[0][3] + r_t[i][1] * t[1][3] + r_t[i][2] * t[2][3])]
               for i in range(3)]
    inverse.append([0.0, 0.0, 0.0, 1.0])
    return inverse


def interpolate(t_a, value_a, t_b, value_b, t_query):
    if t_b == t_a:
        raise ValueError("the buffer's two stamps must differ")
    if t_query < min(t_a, t_b) or t_query > max(t_a, t_b):
        raise ValueError("extrapolation: %.6f is outside the buffer" % t_query)
    alpha = (t_query - t_a) / (t_b - t_a)
    return (1.0 - alpha) * value_a + alpha * value_b


def topic_bandwidth_mb_s(n_subs, size_bytes, rate_hz):
    return n_subs * size_bytes * rate_hz / 1e6


# The exercise's tf2 chain: base_link --(joint1 at z=0.10, q1=pi/2)--> link_1 --(joint2 at x=0.25, q2=0)--> tool0
t_chain = mat4_mul(urdf_revolute_z((0.0, 0.0, 0.10), math.pi / 2.0),
                   urdf_revolute_z((0.25, 0.0, 0.0), 0.0))
p_in_base = transform_point(t_chain, [0.15, 0.0, 0.0])
q_query = interpolate(2.000, 0.50, 2.010, 0.70, 2.006)
bandwidth = topic_bandwidth_mb_s(2, 250_000, 60.0)

assert all(math.isclose(p_in_base[i], [0.0, 0.40, 0.10][i], abs_tol=1e-9) for i in range(3))
assert math.isclose(q_query, 0.62, rel_tol=1e-12)
assert math.isclose(bandwidth, 30.0, rel_tol=1e-12)
assert qos_compatible(True, True, True, True) and qos_compatible(False, False, False, False)
assert not qos_compatible(False, False, True, False)
assert not qos_compatible(True, False, True, True)

# The inverse must round-trip a point back to where it started.
p_tool = [0.15, 0.05, 0.02]
back = transform_point(invert_rigid(t_chain), transform_point(t_chain, p_tool))
assert all(math.isclose(back[i], p_tool[i], abs_tol=1e-12) for i in range(3))

print(f"p_in_base={[round(x, 4) for x in p_in_base]} m | q(2.006 s)={q_query:.6f} rad | "
      f"bandwidth={bandwidth:.3f} MB/s")
```
Printed: `p_in_base=[0.0, 0.4, 0.1] m | q(2.006 s)=0.620000 rad | bandwidth=30.000 MB/s`

**On the shared arm.** The Transfer suite builds the `base_link -> link_1 -> tool0` chain from the plant's own link lengths and compares it with `plant.fk` at five poses:

```python
import mechalab_plant as plant

tip = plant.fk(0.0, 0.0)
bandwidth = 3 * plant.FRAME_BYTES * (1.0 / plant.DT) / 1e6

assert abs(tip[0] - (plant.L1 + plant.L2)) < 1e-12 and abs(tip[1]) < 1e-12
assert abs(bandwidth - 0.06) < 1e-12
print("fk(0,0)=(%.2f, 0.00) m = L1+L2 | three %d-byte frames at 1 kHz=%.3f MB/s"
      % (tip[0], plant.FRAME_BYTES, bandwidth))
```

### Break it on purpose
Inject the first row of the `## 8. Common mistakes` table: subscribe to the camera stream with the default `Reliable` profile while the publisher offers `Best-Effort`, keeping the worked example's $250{,}000\text{ B}$ frames at $60\text{ Hz}$ to two subscribers.
- **Inject:** build the `/camera/depth` subscriber with `rclpy.qos.QoSProfile(depth=10, reliability=ReliabilityPolicy.RELIABLE)` instead of `SensorDataQoS()`.
- **Symptom:** `ros2 topic list` shows the topic and the publisher reports $60\text{ Hz}$, which is $30\text{ MB/s}$ of offered traffic, yet the subscriber's callback never fires - $0$ messages, no exception, no timeout.
- **Diagnose:** the publisher is running, so the transport, the domain id and the message type are all fine; `ros2 topic info -v` shows offered `BEST_EFFORT` against requested `RELIABLE`, and the rule fails on Reliability alone - durability matches, so it is not the `Volatile`/`Transient Local` row.
- **Fix:** request `SensorDataQoS()` (Best-Effort) on the subscriber, and prove it by counting $60$ callbacks in one wall-clock second with `ros2 topic hz` reporting $60.000$.

## 6. Simulation path
Open **URDF / MuJoCo & STO** in the MechaLab Workbench (`npm run dev`), or load the repository's reference URDF (`08-capstone-projects/urdf-mujoco-capstone3-6dof/capstone3_6dof_arm.urdf`) in `RViz2`, `Foxglove Studio`, or `MuJoCo` (`resources/open-source-toolchains.md`).

The graded package is also a workbench entry: **Modules -> `EX.06-robotics.T2.06a`**, where `selfcheck.py` is appended below the starter and **Verify** compares its `SELF-CHECK PASS:` line. `scripts/e2e_pages_bundle.mjs` drives it on the built bundle, so the browser path is tested, not assumed.
- **One-Time `ROS 2 Jazzy` & `colcon` Installation + First-Use Workspace Walkthrough (Ubuntu 24.04 / WSL2 — see [`resources/open-source-toolchains.md` §0.4b](../resources/open-source-toolchains.md#0-core-supported-os-environment-terminal-bootstrap--python-venv-setup)):**
  ```bash
  # 1. One-time APT repository setup & installation (skip if already installed in §0.4b):
  sudo apt update && sudo apt install -y software-properties-common curl locales
  sudo locale-gen en_US en_US.UTF-8 && sudo add-apt-repository universe -y
  sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" | sudo tee /etc/apt/sources.list.d/ros2.list > /dev/null
  sudo apt update && sudo apt install -y ros-jazzy-desktop python3-colcon-common-extensions python3-rosdep ros-jazzy-ros2-control ros-jazzy-ros2-controllers ros-jazzy-rosbag2-storage-mcap

  # 2. Source ROS 2 Jazzy, create ~/ros2_ws, build with colcon, and inspect TF2:
  source /opt/ros/jazzy/setup.bash
  mkdir -p ~/ros2_ws/src && cd ~/ros2_ws/src
  ros2 pkg create --build-type ament_python my_arm_bringup --dependencies rclpy sensor_msgs geometry_msgs tf2_ros
  cd ~/ros2_ws && colcon build --symlink-install
  source ~/ros2_ws/install/setup.bash
  ros2 topic list && ros2 run tf2_tools view_frames
  ```

No hardware required for this module (`hardware_required: false`). In Step 2.7 (`06-robotics.T2.07`), Step 2.8 (`07-systems.T2.08`), and Step 3.7 (`06-robotics.T3.07`), your custom CAN-FD actuator (`04-embedded.T2.05`) plugs into a Linux host via a SocketCAN USB adapter (`can0`) driven by a `ros2_control` `SystemInterface`:
```text
[MoveIt 2 / LeRobot Policy] --(Action: FollowJointTrajectory)--> [ros2_control 1 kHz read/update/write]
                                                                                || (SocketCAN can0 / micro-ROS)
                                                                      [STM32G4 4-Layer FOC Actuator]
```
Pass/fail verification in simulation: `p_in_base == [0.25, 0.15, 0.10]`, `x_interp == 0.22 m`, `cmd_if["effort"] == 1.70 N*m`, and `qos_compatible(False, False, True, False) == False`.


```mermaid
flowchart LR
    A["06-robotics.T2.06a: ros2_nodes_topics_services_and_qos"] --> B["tf2_transform_tree_and_urdf_kinematics"]
    B --> C["ros2_control_hardware_interface_read_write"]
    C --> D["Verified Simulation & Checkpoint Pass"]
```

## 7. Checkpoint
Pass criteria: run the worked example and exercise asserts with zero errors, or score $\ge 80\%$ ($4/5$) on the Skip test below and $\ge 80\%$ ($8/10$) on the ladder's Gate test.

### Skip test
<!-- skip-test:start -->
1. `[Recall] [Concept: ros2_nodes_topics_services_and_qos]` A stereo camera node publishes depth frames of size $B_{\text{msg}} = 250{,}000\text{ bytes}$ at $f_{\text{pub}} = 60.0\text{ Hz}$ to $N_{\text{sub}} = 2$ unicast subscribers. Compute the total network data rate $R_{\text{MB/s}} = \frac{N_{\text{sub}} \cdot B_{\text{msg}} \cdot f_{\text{pub}}}{10^6}$ in $\text{MB/s}$ (tolerance $\pm 10^{-6}\text{ MB/s}$).
2. `[Apply] [Concept: tf2_transform_tree_and_urdf_kinematics]` A `tf2` buffer holds two consecutive transforms for `base_link -> tool0` at $t_a = 10.00\text{ s}$ ($z_a = 0.30\text{ m}$) and $t_b = 10.02\text{ s}$ ($z_b = 0.38\text{ m}$). Compute the linearly interpolated height $z(t_{\text{query}})$ in meters ($\text{m}$, tolerance $\pm 10^{-9}\text{ m}$) returned by `lookupTransform` at $t_{\text{query}} = 10.015\text{ s}$.
3. `[Transfer] [Concept: tf2_transform_tree_and_urdf_kinematics]` Given `T_base_link1` translating $+0.30\text{ m}$ along $Z$ (zero rotation) and `T_link1_ee` translating $+0.40\text{ m}$ along $X$ (zero rotation), compute the Euclidean distance $\|p_{\text{ee}}\|$ from `base` origin to `ee` origin in meters ($\text{m}$, tolerance $\pm 10^{-9}\text{ m}$).
4. `[Concept: ros2_control_hardware_interface_read_write]` Why does `ros2_control` execute controllers (`update()`) and hardware drivers (`read()` / `write()`) inside the same real-time C++ process via shared double pointers instead of sending motor commands over standard ROS 2 DDS network topics?
   - **A.** Because DDS topics cannot send floating-point numbers.
   - **B.** To guarantee deterministic sub-millisecond ($1\text{ kHz}$) loop execution with zero network serialization latency, packet loss, or OS socket jitter inside the feedback loop.
   - **C.** Because `ros2_control` does not support URDF files.
   - **D.** To slow the control loop down to $10\text{ Hz}$.
5. `[Spaced review -> 02-mechanics.T2.02a — Concept: se3_homogeneous_transformation_matrix]` A planar 2-link arm has $L_1 = 0.30\,\text{m}$ at $0^\circ$ and $L_2 = 0.20\,\text{m}$ at $90^\circ$. Compute the end-effector $x$ in metres (tolerance $\pm 10^{-9}$).

**Answer key:**
```python
import math

q1_rate_mbs = (2.0 * 250_000.0 * 60.0) / 1e6
alpha_q2 = (10.015 - 10.00) / (10.02 - 10.00)
q2_z_interp = (1.0 - alpha_q2) * 0.30 + alpha_q2 * 0.38
q3_dist_m = math.sqrt(0.40**2 + 0.0**2 + 0.30**2)
q4_choice = "B"

assert math.isclose(q1_rate_mbs, 30.0, rel_tol=1e-9)
assert math.isclose(q2_z_interp, 0.36, rel_tol=1e-9)
assert math.isclose(q3_dist_m, 0.50, rel_tol=1e-9)
assert q4_choice == "B"
q5_review = 0.30 * math.cos(0.0) + 0.20 * math.cos(math.pi / 2)
assert math.isclose(q5_review, 0.3, rel_tol=1e-9, abs_tol=1e-09)
```
- **Pass mark:** $4/5$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3. If you missed  Q5, review `02-mechanics.T2.02a`. On pass, proceed to `## 10. Next modules`.
<!-- skip-test:end -->

### Gate test
Covers the complete Track 06 Tier 2 bridge ladder ([`06-robotics.T2.06a`](06-robotics.T2.06a.md) $\to$ [`06-robotics.T2.06b`](06-robotics.T2.06b.md)) before Step 2.7 (`06-robotics.T2.07`):
1. `[Concept: ros2_nodes_topics_services_and_qos]` A depth camera publishes $B_{\text{msg}} = 120{,}000\text{ bytes}$ frames at $f_{\text{pub}} = 50.0\text{ Hz}$ to $N_{\text{sub}} = 3$ unicast subscribers. Compute $R_{\text{MB/s}} = N_{\text{sub}} B_{\text{msg}} f_{\text{pub}} / 10^6$ (tolerance $\pm 10^{-9}\text{ MB/s}$).
2. `[Concept: ros2_nodes_topics_services_and_qos]` A `Best-Effort` publisher offers to a `Reliable` subscriber. Does the connection form under the `offered >= requested` rule? Answer `True` or `False`.
3. `[Concept: tf2_transform_tree_and_urdf_kinematics]` A `tf2` buffer holds $x = 0.10\text{ m}$ at $t_a = 3.000\text{ s}$ and $x = 0.14\text{ m}$ at $t_b = 3.020\text{ s}$. Compute the interpolated $x(t_{\text{query}})$ at $t_{\text{query}} = 3.005\text{ s}$ in metres (tolerance $\pm 10^{-9}\text{ m}$).
4. `[Concept: tf2_transform_tree_and_urdf_kinematics]` A chain translates $+0.20\text{ m}$ along $Z$, then $+0.30\text{ m}$ along $X$, both with zero rotation. Compute the base-frame $x$ coordinate of the tool origin in metres (tolerance $\pm 10^{-9}\text{ m}$).
5. `[Concept: ros2_control_hardware_interface_read_write]` What is the exact order of the three calls `controller_manager` makes on every real-time tick?
   - **A.** `read(time, period)` $\to$ `update(time, period)` $\to$ `write(time, period)`
   - **B.** `write()` $\to$ `read()` $\to$ `sleep()`
   - **C.** `update()` $\to$ `compile()` $\to$ `reboot()`
   - **D.** `write()` only
6. `[Concept: ros2_control_hardware_interface_read_write]` At a $1.0\text{ ms}$ period, `read()` takes $0.30\text{ ms}$, `update()` $0.20\text{ ms}$ and `write()` $0.25\text{ ms}$. Compute the remaining margin $t_{\text{margin}} = 1.0 - (0.30 + 0.20 + 0.25)$ in milliseconds (tolerance $\pm 10^{-9}\text{ ms}$).
7. `[Concept: ros2_launch_parameters_and_composition]` One intra-process `ComposableNode` subscriber receives $2{,}000{,}000\text{ byte}$ images at $25.0\text{ Hz}$ with zero copies. Compute the bandwidth $\Delta R_{\text{saved}} = N_{\text{sub}} B_{\text{msg}} f_{\text{pub}} / 10^6$ that copying would have cost (tolerance $\pm 10^{-9}\text{ MB/s}$).
8. `[Concept: rosbag2_mcap_recording_and_deterministic_replay]` Compute the uncompressed `rosbag2` disk rate $R_{\text{MB/s}} = f B_{\text{framed}} / 10^6$ for $f = 250\text{ Hz}$ and $B_{\text{framed}} = 640\text{ bytes/msg}$ (tolerance $\pm 10^{-9}\text{ MB/s}$).
9. `[Concept: ros2_simulator_bridge_and_joint_state_loop]` A simulator steps at $f_{\text{sim}} = 4000\text{ Hz}$ with `ros2_control` decimation $D = 4$. Compute the controller frequency $f_{\text{ctrl}} = f_{\text{sim}} / D$ in Hz (tolerance $\pm 10^{-9}\text{ Hz}$).

10. `[Concept: unit_quaternion_kinematics_slerp]` A `tf2` buffer holds $q_a = (1, 0, 0, 0)$ and $q_b = (0, 1, 0, 0)$ - a quarter turn, so $\Omega = \pi/2$ - and must interpolate at $\alpha = 0.25$. Compute the scalar part $w$ of the slerp (tolerance $\pm 10^{-9}$).

**Gate answer key:**
```python
import math

g1_rate_mbs = (3.0 * 120_000.0 * 50.0) / 1e6
g2_connects = int(False) >= int(True)
alpha_g3 = (3.005 - 3.000) / (3.020 - 3.000)
g3_x_m = (1.0 - alpha_g3) * 0.10 + alpha_g3 * 0.14
g4_x_m = 0.30
g5_choice = "A"
g6_margin_ms = 1.0 - (0.30 + 0.20 + 0.25)
g7_saved_mbs = (1.0 * 2_000_000.0 * 25.0) / 1e6
g8_rate_mbs = (250.0 * 640.0) / 1e6
g9_fctrl_hz = 4000.0 / 4.0
g10_slerp_w = math.sin(0.75 * math.pi / 2.0)

assert math.isclose(g1_rate_mbs, 18.0, rel_tol=1e-9)
assert g2_connects is False
assert math.isclose(g3_x_m, 0.11, rel_tol=1e-9)
assert math.isclose(g4_x_m, 0.30, rel_tol=1e-9)
assert g5_choice == "A"
assert math.isclose(g6_margin_ms, 0.25, rel_tol=1e-9)
assert math.isclose(g7_saved_mbs, 50.0, rel_tol=1e-9)
assert math.isclose(g8_rate_mbs, 0.16, rel_tol=1e-9)
assert math.isclose(g9_fctrl_hz, 1000.0, rel_tol=1e-9)
assert math.isclose(g10_slerp_w, 0.923879533, abs_tol=1e-9)
```
- **Pass mark:** $\ge 80\%$ ($8/10$ on the Gate test). Missed Q1–Q6 and Q10: study `06-robotics.T2.06a`; Q7–Q9: `06-robotics.T2.06b`.

## 8. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| `ros2 topic echo` or subscriber node shows nothing even though `ros2 topic list` shows the topic exists | QoS incompatibility (`Best-Effort` sensor publisher vs `Reliable` subscriber, or `Volatile` publisher vs `Transient Local` subscriber) or mismatched `ROS_DOMAIN_ID`. | Run `ros2 topic info -v <topic>` to inspect offered vs. requested QoS policies and use `SensorDataQoS` (`Best-Effort`) when subscribing to camera/IMU streams. |
| Fast $100\text{ Hz}$ timer freezes whenever a service callback or action server runs | Used the default `SingleThreadedExecutor` without `CallbackGroups`, so the long callback blocks the single thread. | Assign the slow callback to a separate `MutuallyExclusiveCallbackGroup` (or `ReentrantCallbackGroup`) and spin the node with a `MultiThreadedExecutor`. |
| `tf2::ExtrapolationException: Lookup would require extrapolation into the future` | Asked `tf2` for the transform at `now()` before `robot_state_publisher`'s latest message arrived, or clock skew exists between two machines. | Query `tf2::TimePointZero` for the latest available transform, or pass the sensor message's `header.stamp` with a short timeout (`50 ms`) and synchronize clocks via `chrony`/`PTP`. |
| `ros2_control` loop prints `Overrun detected!` every few seconds | Performed blocking socket/serial reads or dynamic memory allocation (`new`/`std::vector::push_back`) inside `read()` or `update()`. | Use non-blocking `O_NONBLOCK` SocketCAN / lock-free ring buffers in `read()` and pre-allocate all buffers inside `on_init()` / `on_configure()`. |

## 9. Resources
- **Open Robotics — *Official ROS 2 Documentation (`docs.ros.org`, Jazzy / Lyrical LTS)* & `ros2_control` Docs (`control.ros.org`, `resources/open-source-toolchains.md`):** Tutorials on Nodes, Executors, CallbackGroups, Topics, Services, Actions, QoS, `tf2`, URDF, and writing a `ros2_control` `SystemInterface` `[VERIFIED 2026-10-15]`.
- **Track 06 (`06-robotics-and-autonomy/README.md`):** Directly continues into `06-robotics.T2.06b` and Step 2.7 (`06-robotics.T2.07`) `[VERIFIED 2026-10-15]`.

## 10. Next modules
- Proceed to [`06-robotics.T2.06b`](06-robotics.T2.06b.md) (*ROS 2 Operations: Launch & Parameter Composition, Deterministic `rosbag2` Recording/Replay & Simulator Integration*).
