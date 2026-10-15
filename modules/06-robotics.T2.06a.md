---
id: 06-robotics.T2.06a
title: "ROS 2 Computational Graph (Nodes, Topics, Services, QoS), TF2 Frames, URDF & ros2_control Hardware Interfaces"
track: "06"
tier: 2
prereqs:
  - 02-mechanics.T2.03
  - 04-embedded.T2.05
  - 05-control.T2.06
new_concepts:
  - ros2_nodes_topics_services_and_qos
  - tf2_transform_tree_and_urdf_kinematics
  - ros2_control_hardware_interface_read_write
uses:
  - se3_homogeneous_transformation_matrix
  - parallel_axis_urdf_inertia_tensor
  - can_fd_mit_impedance_packet_packing
est_hours: 5.0
hardware_required: false
safety_level: none
resources_verified: false
---

## 1. Why it matters (Why This Matters)
This is the dedicated **ROS 2 bridge module** before Step 2.7 (`06-robotics.T2.07`) and your gateway to the Graduate Goal (building and tuning a custom robot arm with ROS 2 and a learned policy). Before running Cartesian impedance controllers (`06-robotics.T2.07`), `MoveIt 2`, or `Hugging Face LeRobot` policies (`06-robotics.T3.07`), you must understand how a **ROS 2 (`Jazzy` / `Lyrical`)** system is structured: how **Nodes** exchange messages over **Topics** (with `Reliable` vs. `Best-Effort` **QoS**) and **Services**, how the **`tf2` transform tree** chains 3D coordinate frames (`world -> base_link -> link_1 -> tool0`) from your **URDF** robot description, and how **`ros2_control`** separates hardware CAN/serial drivers (`SystemInterface::read()` / `write()`) from real-time controllers (`joint_trajectory_controller`) without DDS network jitter! Already know this? Take the Skip test or the Ladder Gate test in section 8 first.

## 2. Intuition first (Mental Model)
Imagine a robot software stack as a modern airport:
- **ROS 2 Nodes** are independent specialist teams (Camera Node, Planner Node, Safety Monitor Node) running as separate processes so a crash in the camera driver doesn't take down the motor controller.
- **Topics (Publish / Subscribe)** are radio broadcast channels (`sensor_msgs/JointState`, `geometry_msgs/Twist`) with **Quality of Service (QoS)** settings: high-rate sensor streams use `Best-Effort / Volatile` (drop an old frame rather than stall on a retry), whereas configuration maps and safety commands use `Reliable / Transient Local`. **Services** and **Actions** are direct request-reply phone calls (`std_srvs/Trigger` for homing; `FollowJointTrajectory` action with live feedback for arm moves).
- **`tf2` & URDF** form the airport's live 3D radar map: the **URDF** file declares which link is bolted to which joint (`parent -> child`) and its axis/inertia, while `robot_state_publisher` listens to `/joint_states` and broadcasts the $SE(3)$ transform tree `tf2` so any node can ask *"Where is the camera optical frame relative to the gripper finger at timestamp $t$?"*
- **`ros2_control` (`controller_manager`)** is the hard-real-time engine room: instead of sending motor torques over slow network topics, `ros2_control` loads your C++ controller and your C++ hardware driver (`read(time, period)` $\to$ `update(time, period)` $\to$ `write(time, period)`) into the **same real-time memory space**, passing pointers to `state_interfaces` (`position`, `velocity`, `effort`) and `command_interfaces` (`effort`, `position`) at $1\text{ kHz}$ with zero serialization jitter!

## 3. Formalization
1. **ROS 2 Graph & QoS Compatibility Rule:** A publisher offering QoS `(Reliability, Durability)` and a subscriber requesting QoS connect iff `offered >= requested`:
   - A `Best-Effort` publisher **cannot** satisfy a `Reliable` subscriber (connection rejected silently with a QoS incompatibility warning!), whereas a `Reliable` publisher satisfies both `Reliable` and `Best-Effort` subscribers.
2. **`tf2` Tree Structure & $SE(3)$ Frame Lookup:** Every `tf2` coordinate frame has **at most one parent** (forming a directed tree, never a cycle or multi-parent diamond). Given chain `base_link` $\xrightarrow{T_{b1}(q_1)}$ `link_1` $\xrightarrow{T_{12}(q_2)}$ `tool0`, `tf2` computes the transform from `tool0` to `base_link` at timestamp $t$ via:
   $$T_{\text{base}\leftarrow\text{tool0}}(t) = T_{b1}(q_1(t)) \cdot T_{12}(q_2(t)), \quad p_{\text{base}} = T_{\text{base}\leftarrow\text{tool0}} \, p_{\text{tool0}}$$
   For a revolute URDF joint with origin offset $p_{\text{xyz}}$ and unit axis $\hat{a} = [0, 0, 1]^\top$, $T_{\text{parent}\leftarrow\text{child}}(q) = \begin{bmatrix} R_z(q) & p_{\text{xyz}} \\ 0 & 1 \end{bmatrix}$.
3. **`ros2_control` Real-Time `read -> update -> write` Loop:** Inside `controller_manager` running at period $\Delta t = 1/f_{\text{ctrl}}$ ($\text{s}$):
   1. `hardware_interface::SystemInterface::read(time, period)` unpacks encoder/current feedback from CAN-FD (`04-embedded.T2.05`) or `micro-ROS` into exported `state_interfaces` $(q_i, \dot{q}_i, \tau_{i,\text{meas}})$.
   2. Active controllers (`JointTrajectoryController`, Cartesian impedance) execute `update(time, period)` in-memory and write `command_interfaces` $(\tau_{i,\text{cmd}})$.
   3. `SystemInterface::write(time, period)` packs $\tau_{i,\text{cmd}}$ into CAN-FD MIT frames and transmits them to the actuators.

## 4. Worked example (Worked Example & Code)
Simulate a complete `ros2_control` + `tf2` cycle in pure Python: (1) verify the ROS 2 QoS compatibility matrix, (2) run `robot_state_publisher` forward kinematics on a 2-DOF URDF chain (`base_link -> link_1 -> tool0`) to transform a point from `tool0` into `base_link`, and (3) execute one $1\text{ kHz}$ `ros2_control` `read() -> update() -> write()` tick.

```python
import math

def qos_compatible(pub_reliable: bool, sub_reliable: bool) -> bool:
    # Best-Effort (False) publisher cannot connect to Reliable (True) subscriber
    return not (not pub_reliable and sub_reliable)

assert qos_compatible(True, True) is True
assert qos_compatible(True, False) is True
assert qos_compatible(False, False) is True
assert qos_compatible(False, True) is False  # Classic ROS 2 QoS mismatch trap!

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
print(f"p_in_base={[round(x, 4) for x in p_in_base]}, effort_cmd={cmd_if['effort']:.2f} N*m, QoS(BE->Rel)={qos_compatible(False, True)}")
```
Expected output:
```text
p_in_base=[0.25, 0.15, 0.1], effort_cmd=1.70 N*m, QoS(BE->Rel)=False
```

## 5. Exercise
In the `tf2` tree above (`T_b_l1 = urdf_revolute_z((0, 0, 0.10), q1)` and `T_l1_tool = urdf_revolute_z((0.25, 0, 0), q2)`), compute the 3D position of `p_in_tool = [0.15, 0.0, 0.0, 1.0]` in `base_link` when $q_1 = \pi/2\text{ rad}$ and $q_2 = 0.0\text{ rad}$. Verify that `p_in_base` equals `[0.0, 0.40, 0.10]` $\text{m}$ ($\pm 10^{-9}\text{ m}$).
- **If your result differs:** When $q_1 = \pi/2\text{ rad}$ and $q_2 = 0\text{ rad}$, both the $0.25\text{ m}$ `link_1` offset and the $0.15\text{ m}$ `tool0` offset point along the $+Y$ axis of `base_link` ($0.25 + 0.15 = 0.40\text{ m}$).

## 6. Sim-first path (Simulation path)
Open **Tab 3 (URDF Kinematics & Jacobian Workspace)** and **Tab 6 (Trajectory Generation)** in the MechaLab Workbench (`npm run dev`), or load the repository's reference URDF (`08-capstone-projects/urdf-mujoco-capstone3-6dof/capstone3_6dof_arm.urdf`) in `RViz2`, `Foxglove Studio`, or `MuJoCo` (`resources/open-source-toolchains.md`).

## 7. Hardware path (and Safety notes)
No hardware required for this module (`hardware_required: false`). In Step 2.7 (`06-robotics.T2.07`), Step 2.8 (`07-systems.T2.08`), and Step 3.7 (`06-robotics.T3.07`), your custom CAN-FD actuator (`04-embedded.T2.05`) plugs into a Linux host via a SocketCAN USB adapter (`can0`) driven by a `ros2_control` `SystemInterface`:
```text
[MoveIt 2 / LeRobot Policy] ---> (/joint_trajectory_controller) ---> [ros2_control 1 kHz read/update/write]
                                                                               || (SocketCAN can0)
                                                                     [STM32G4 4-Layer FOC Actuator]
```
Pass/fail verification in simulation: `p_in_base == [0.25, 0.15, 0.10]`, `cmd_if["effort"] == 1.70 N*m`, and `qos_compatible(False, True) == False`.

> **Safety Note (`safety_level: none`):** Pure simulation, math, and software module (`hardware_required: false`); no physical energization hazards.

## 8. Checkpoint (Skip Test & Gate Test)
Pass criteria: score $\ge 80\%$ ($4/4$) on the Skip test or score $\ge 80\%$ ($7/8$) on the Ladder Gate test below to unlock Step 2.7 (`06-robotics.T2.07`).

### Skip test
1. `[Recall] [Concept: ros2_nodes_topics_services_and_qos]` A camera driver publishes `/camera/depth` with `Best-Effort` reliability QoS, and your perception node subscribes to `/camera/depth` requesting `Reliable` QoS. How many messages will your subscriber receive? (Report the integer count.)
2. `[Apply] [Concept: tf2_transform_tree_and_urdf_kinematics]` In a valid `tf2` coordinate frame tree with $N = 7$ frames (`world`, `base_link`, and 5 arm links), how many parent frames can any single child frame have at the same time?
3. `[Transfer] [Concept: tf2_transform_tree_and_urdf_kinematics]` Given `T_base_link1` translating $+0.30\text{ m}$ along $Z$ (zero rotation) and `T_link1_ee` translating $+0.40\text{ m}$ along $X$ (zero rotation), compute the Euclidean distance $\|p_{\text{ee}}\|$ from `base` origin to `ee` origin in meters ($\text{m}$, tolerance $\pm 10^{-9}$).
4. `[Spaced review -> 02-mechanics.T2.03 — Concept: se3_homogeneous_transformation_matrix] [Concept: ros2_control_hardware_interface_read_write]` Why does `ros2_control` execute controllers (`update()`) and hardware drivers (`read()` / `write()`) inside the same real-time C++ process via shared double pointers instead of sending motor commands over standard ROS 2 DDS network topics?
   - **A.** Because DDS topics cannot send floating-point numbers.
   - **B.** To guarantee deterministic sub-millisecond ($1\text{ kHz}$) loop execution with zero network serialization latency, packet loss, or OS socket jitter inside the feedback loop.
   - **C.** Because `ros2_control` does not support URDF files.
   - **D.** To slow the control loop down to $10\text{ Hz}$.

**Answer key:**
```python
import math

q1_msgs_received = 0
q2_max_parents = 1
q3_dist_m = math.sqrt(0.40**2 + 0.0**2 + 0.30**2)
q4_choice = "B"

assert q1_msgs_received == 0
assert q2_max_parents == 1
assert math.isclose(q3_dist_m, 0.50, rel_tol=1e-9)
assert q4_choice == "B"
```
- **Pass mark:** $4/4$ ($80\%+$). If you missed Q1, study `## 3. Formalization` item 1; Q2 or Q3, study `## 3. Formalization` item 2; Q4, study `## 3. Formalization` item 3.

### Gate test
Covers the complete Track 06 Tier 2 bridge ladder (`06-robotics.T2.06a`) before Step 2.7 (`06-robotics.T2.07`):
1. `[Concept: ros2_nodes_topics_services_and_qos]` Which ROS 2 communication primitive is best suited for a continuous $500\text{ Hz}$ stream of `/joint_states` data from `robot_state_publisher` to multiple listeners (`RViz2`, logger, planner)?
   - **A.** Topic (Publish / Subscribe)
   - **B.** Synchronous Blocking Service (`srv`)
   - **C.** Parameter Server static string
   - **D.** Environment variable
2. `[Concept: ros2_nodes_topics_services_and_qos]` Which ROS 2 communication primitive is best suited for a long-running goal (`MoveToPose`) that takes $4.0\text{ s}$, needs continuous progress feedback, and must be cancelable mid-flight if an obstacle appears?
   - **A.** Action (`Goal` + `Feedback` + `Result` + `Cancel`)
   - **B.** Unreliable Topic
   - **C.** Static `tf_static` broadcast
   - **D.** Command-line argument
3. `[Concept: ros2_nodes_topics_services_and_qos]` If a publisher offers `Reliable` QoS and a subscriber requests `Best-Effort` QoS, do they connect (`1` for Yes, `0` for No)?
4. `[Concept: tf2_transform_tree_and_urdf_kinematics]` According to ROS `REP-103`, what are the standard right-handed coordinate axis directions (`+X`, `+Y`, `+Z`) for a robot body frame (`base_link`)?
   - **A.** `+X` Forward, `+Y` Left, `+Z` Up
   - **B.** `+X` Right, `+Y` Down, `+Z` Backward
   - **C.** `+X` Up, `+Y` Forward, `+Z` Left
   - **D.** Centimeters and degrees
5. `[Concept: tf2_transform_tree_and_urdf_kinematics]` In a URDF `<joint type="revolute">`, which standard ROS node reads the `<robot>` XML description plus `/joint_states` and broadcasts the resulting 3D transforms onto `/tf` and `/tf_static`?
   - **A.** `robot_state_publisher`
   - **B.** `rosbag2`
   - **C.** `rviz2`
   - **D.** `colcon`
6. `[Concept: ros2_control_hardware_interface_read_write]` What is the exact execution order of the three methods called by `ros2_control`'s `controller_manager` on every real-time control tick?
   - **A.** `read(time, period)` $\to$ `update(time, period)` $\to$ `write(time, period)`
   - **B.** `write()` $\to$ `read()` $\to$ `sleep(10)`
   - **C.** `update()` $\to$ `compile()` $\to$ `reboot()`
   - **D.** `read()` only
7. `[Concept: ros2_control_hardware_interface_read_write]` If `controller_manager` runs at $f_{\text{cm}} = 1000\text{ Hz}$ and a `SystemInterface::read()` implementation uses a blocking SocketCAN call that waits $3.5\text{ ms}$ ($0.0035\text{ s}$), how many $1\text{ ms}$ control deadlines are missed during that single read (integer part of $3.5 / 1.0$)?
8. `[Concept: ros2_control_hardware_interface_read_write]` In `ros2_control`, before switching from a `position` controller to an `effort` (torque) controller on the same joint, what must the `controller_manager` verify about `command_interfaces`?
   - **A.** Exclusivity: no two active controllers may claim the same joint's conflicting `command_interface` simultaneously; the position controller must be deactivated as the effort controller is activated in a single atomic switch.
   - **B.** Both controllers should write different numbers to the motor at the same time.
   - **C.** The URDF file must be deleted.
   - **D.** The CAN bus must be unplugged.

**Gate answer key:**
```python
g1_choice = "A"
g2_choice = "A"
g3_connects = 1
g4_choice = "A"
g5_choice = "A"
g6_choice = "A"
g7_missed = int(3.5 // 1.0)
g8_choice = "A"

assert g1_choice == "A"
assert g2_choice == "A"
assert g3_connects == 1
assert g4_choice == "A"
assert g5_choice == "A"
assert g6_choice == "A"
assert g7_missed == 3
assert g8_choice == "A"
```
- **Pass mark:** $7/8$ ($80\%+$). Remediation: Q1–Q3 $\to$ `## 3. Formalization` item 1; Q4–Q5 $\to$ `## 3. Formalization` item 2; Q6–Q8 $\to$ `## 3. Formalization` item 3.

## 9. Common mistakes
| Symptom | Root cause | 2-minute fix |
| :--- | :--- | :--- |
| `ros2 topic echo` or subscriber node shows nothing even though `ros2 topic list` shows the topic exists | QoS incompatibility (`Best-Effort` sensor publisher vs `Reliable` subscriber) or mismatched `ROS_DOMAIN_ID`. | Run `ros2 topic info -v <topic>` to inspect offered vs. requested QoS policies and use `SensorDataQoS` (`Best-Effort`) when subscribing to camera/IMU streams. |
| `tf2::ExtrapolationException: Lookup would require extrapolation into the future` | Asked `tf2` for the transform at `now()` before `robot_state_publisher`'s latest message arrived, or clock skew exists between two machines. | Query `tf2::TimePointZero` for the latest available transform, or pass the sensor message's `header.stamp` with a short timeout (`50 ms`) and synchronize clocks via `chrony`/`PTP`. |
| `ros2_control` loop prints `Overrun detected!` every few seconds | Performed blocking socket/serial reads or dynamic memory allocation (`new`/`std::vector::push_back`) inside `read()` or `update()`. | Use non-blocking `O_NONBLOCK` SocketCAN / lock-free ring buffers in `read()` and pre-allocate all buffers inside `on_init()` / `on_configure()`. |

## 10. Resources
- **Open Robotics — *Official ROS 2 Documentation (`docs.ros.org`, Jazzy / Lyrical LTS)* & `ros2_control` Docs (`control.ros.org`, `resources/open-source-toolchains.md`):** Tutorials on Nodes, Topics, QoS, `tf2`, URDF, and writing a `ros2_control` `SystemInterface` `[UNVERIFIED]`.
- **Track 06 (`06-robotics-and-autonomy/README.md`):** Directly continues into Step 2.7 (`06-robotics.T2.07`) `[VERIFIED 2026-10-15]`.
## 11. Next modules
- Proceed to legacy **Step 2.7 (`06-robotics.T2.07`)** in [`06-robotics-and-autonomy/README.md`](../06-robotics-and-autonomy/README.md#tier-2-intermediate--applied).
