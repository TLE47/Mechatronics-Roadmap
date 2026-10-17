#!/usr/bin/env python3
"""mechalab_plant - the one plant every MechaLab exercise shares.

Stdlib only (no numpy), Python 3.8+, so the *same* file runs three places: on your machine
(`python3 resources/plants/mechalab_plant.py`), in CI, and inside the browser workbench, where
`app/src/components/tabs/TabPyodideRunner.tsx` writes it into the Pyodide filesystem before your
code runs. That is what makes `import mechalab_plant` work in a lesson exercise.

The numbers are the Tier 1 capstone's joint-space 2-DOF arm plant
(`08-capstone-projects/08.1-tier1-2dof-compliant-arm-capstone.md`), so a Tier 2 or Tier 3 exercise
meets the plant it already built:

    I_i * qdd_i = tau_i - tau_g_i(q) + tau_dist_i(t) - b_i * qd_i

`resources/plants/tier1_arm_motor.yaml` carries the same values with the lesson that states each
one; `tests/test_plant.py` fails if the module and the YAML ever drift apart. Nothing here is a
placeholder: if a value is not in that YAML it is a required argument instead (`simulate_motor`).

Units are SI throughout: metres, kilograms, seconds, radians, newton-metres, volts, amperes, ohms,
henries, kilograms-square-metres.
"""

import math
import random

# --- The repeated plant: the arm ---
G = 9.81  # m/s^2
L1 = 0.10  # m, shoulder link
L2 = 0.10  # m, elbow link
LC1 = 0.05  # m, shoulder link centre of mass
LC2 = 0.05  # m, elbow link centre of mass
M1 = 0.20  # kg, shoulder link
M2 = 0.15  # kg, elbow link
I1 = 0.008  # kg*m^2, shoulder joint (motor + gearbox + link, reflected)
I2 = 0.003  # kg*m^2, elbow joint
B1 = 0.04  # N*m*s/rad, shoulder viscous damping
B2 = 0.02  # N*m*s/rad, elbow viscous damping

# --- Actuator envelope and the shipped controller ---
TAU_LIMIT = 2.5  # N*m, per-joint torque clamp
KP1, KD1 = 18.0, 0.60  # shoulder PD gains
KP2, KD2 = 12.0, 0.35  # elbow PD gains

# --- Time and the disturbance pulse the capstone rejects ---
DT = 0.001  # s, 1 kHz plant and control step
TICKS = 1000  # ticks in one figure-8 run
DIST_START_S = 0.40
DIST_END_S = 0.60
DIST_TAU1 = -0.15  # N*m, shoulder payload pulse
DIST_TAU2 = -0.08  # N*m, elbow payload pulse

# --- Cartesian command: a Lemniscate-of-Gerono figure-8 ---
X0, Y0 = 0.12, 0.00  # m, figure-8 centre
AX, AY = 0.03, 0.04  # m, semi-amplitudes
FREQ_HZ = 0.5

# --- AS5600 on-axis magnetic encoder ---
ENCODER_BITS = 12
ENCODER_CPR = 4096  # counts per shaft revolution (2 ** 12)

# --- 20-byte CRC-8 telemetry frame over an 8N1 UART ---
FRAME_BYTES = 20
TX_RING_BYTES = 256
BAUD_OVERFLOWS = 115200  # 412 dropped frames in the capstone's 1000-tick run
BAUD_FITS = 500000  # zero dropped frames

# The module's values keyed exactly as `tier1_arm_motor.yaml` states them, so one test can prove
# the documentation and the executable model agree. Keep the keys - and the YAML - in step.
PLANT = {
    "arm.l1_m": L1,
    "arm.l2_m": L2,
    "arm.lc1_m": LC1,
    "arm.lc2_m": LC2,
    "arm.m1_kg": M1,
    "arm.m2_kg": M2,
    "arm.g_m_s2": G,
    "joint.inertia_1_kg_m2": I1,
    "joint.inertia_2_kg_m2": I2,
    "joint.damping_1_nm_s_rad": B1,
    "joint.damping_2_nm_s_rad": B2,
    "limits.torque_nm": TAU_LIMIT,
    "control.kp_1": KP1,
    "control.kd_1": KD1,
    "control.kp_2": KP2,
    "control.kd_2": KD2,
    "timing.dt_s": DT,
    "timing.ticks": TICKS,
    "disturbance.start_s": DIST_START_S,
    "disturbance.end_s": DIST_END_S,
    "disturbance.torque_1_nm": DIST_TAU1,
    "disturbance.torque_2_nm": DIST_TAU2,
    "trajectory.x0_m": X0,
    "trajectory.y0_m": Y0,
    "trajectory.ax_m": AX,
    "trajectory.ay_m": AY,
    "trajectory.freq_hz": FREQ_HZ,
    "encoder.cpr": ENCODER_CPR,
    "encoder.bits": ENCODER_BITS,
    "telemetry.frame_bytes": FRAME_BYTES,
    "telemetry.tx_ring_bytes": TX_RING_BYTES,
    "telemetry.baud_that_overflows": BAUD_OVERFLOWS,
    "telemetry.baud_that_fits": BAUD_FITS,
}


def wrap_pi(angle_rad):
    """Wrap an angle into (-pi, pi]."""
    wrapped = math.fmod(angle_rad + math.pi, 2.0 * math.pi)
    if wrapped <= 0.0:
        wrapped += 2.0 * math.pi
    return wrapped - math.pi


def fk(q1, q2, l1=L1, l2=L2):
    """Forward kinematics of the planar 2-link arm: joint angles -> tip (x, y) in metres."""
    return (
        l1 * math.cos(q1) + l2 * math.cos(q1 + q2),
        l1 * math.sin(q1) + l2 * math.sin(q1 + q2),
    )


def ik(x, y, l1=L1, l2=L2):
    """Law-of-Cosines inverse kinematics, elbow-down branch. Raises ValueError outside reach.

    The branch is the capstone's: q2 = +acos(...) is the elbow-down/left solution, and q1 uses the
    standard atan2 correction so `fk(*ik(x, y)) == (x, y)` to machine precision.
    """
    reach = l1 + l2
    radius = math.hypot(x, y)
    if radius > reach + 1e-12:
        raise ValueError(
            "target (%.4f, %.4f) m is %.4f m from the base but this arm reaches %.4f m"
            % (x, y, radius, reach)
        )
    cos_q2 = (x * x + y * y - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)
    cos_q2 = max(-1.0, min(1.0, cos_q2))
    q2 = math.acos(cos_q2)
    q1 = math.atan2(y, x) - math.atan2(l2 * math.sin(q2), l1 + l2 * math.cos(q2))
    return q1, q2


def gravity_torque(q1, q2, m1=M1, m2=M2, l1=L1, lc1=LC1, lc2=LC2):
    """Gravity holding torque (tau_g1, tau_g2) in N*m, for the shoulder and the elbow.

    World-frame gravity, so the elbow term uses cos(q1 + q2), not cos(q2).
    """
    tau_g2 = m2 * G * lc2 * math.cos(q1 + q2)
    tau_g1 = (m1 * lc1 + m2 * l1) * G * math.cos(q1) + tau_g2
    return tau_g1, tau_g2


def figure8_target(t_s, x0=X0, y0=Y0, ax=AX, ay=AY, freq_hz=FREQ_HZ):
    """Desired Cartesian tip position (x, y) in metres on the figure-8 at time t_s."""
    return (
        x0 + ax * math.sin(2.0 * math.pi * freq_hz * t_s),
        y0 + ay * math.sin(4.0 * math.pi * freq_hz * t_s),
    )


def disturbance_torque(t_s):
    """Payload pulse (tau_1, tau_2) in N*m: zero except inside the 0.40-0.60 s window."""
    if DIST_START_S <= t_s < DIST_END_S:
        return DIST_TAU1, DIST_TAU2
    return 0.0, 0.0


def motor_dynamics(q1, q2, dq1, dq2, tau1, tau2, dist=(0.0, 0.0), gravity=True):
    """Joint accelerations (ddq1, ddq2) for the plant law.

        I_i * qdd_i = tau_i - tau_g_i + tau_dist_i - b_i * qd_i
    """
    tau_g1, tau_g2 = gravity_torque(q1, q2) if gravity else (0.0, 0.0)
    ddq1 = (tau1 - tau_g1 + dist[0] - B1 * dq1) / I1
    ddq2 = (tau2 - tau_g2 + dist[1] - B2 * dq2) / I2
    return ddq1, ddq2


def step_arm(state, tau, dist=(0.0, 0.0), dt=DT, gravity=True):
    """One semi-implicit (symplectic) Euler step. `state` is (q1, q2, dq1, dq2).

    The order matters and is not forward Euler: velocity is updated first, then position uses the
    NEW velocity (`q += dq_new * dt`). That is why the arm's oscillatory modes stay bounded where
    forward Euler would inject energy. `docs/MODEL_LEVELS.md` records the scheme; the same order is
    what `00-foundations.T2.00a` teaches, so a lesson implementing forward Euler here really does
    disagree with the plant - and should.
    """
    q1, q2, dq1, dq2 = state
    ddq1, ddq2 = motor_dynamics(q1, q2, dq1, dq2, tau[0], tau[1], dist=dist, gravity=gravity)
    dq1 += ddq1 * dt
    dq2 += ddq2 * dt
    return (q1 + dq1 * dt, q2 + dq2 * dt, dq1, dq2)


def pd_gravity_torque(q, dq, q_des, dq_des, kp=(KP1, KP2), kd=(KD1, KD2), limit=TAU_LIMIT):
    """The shipped compliant PD + gravity feedforward law, clamped to +/- limit.

    This is the capstone's controller, unmodified: feedforward alone is not enough when the payload
    appears, and feedback alone sags under gravity.
    """
    q1, q2 = q
    dq1, dq2 = dq
    tau_g1, tau_g2 = gravity_torque(q1, q2)
    tau1 = kp[0] * (q_des[0] - q1) + kd[0] * (dq_des[0] - dq1) + tau_g1
    tau2 = kp[1] * (q_des[1] - q2) + kd[1] * (dq_des[1] - dq2) + tau_g2
    return (max(-limit, min(limit, tau1)), max(-limit, min(limit, tau2)))


def simulate_arm(steps=TICKS, dt=DT, state=None, controller=None, disturbance=True, record=False):
    """Run the plant for `steps` ticks and report how well it tracked the figure-8.

    With the defaults this is the Tier 1 capstone's own run: the same controller, the same
    disturbance window and the same 1000 ticks, so the numbers it returns are the capstone's
    published ones (`IK->FK err=0.0000 mm | Dynamic tip err max=2.40 mm, RMS=0.91 mm`).

    `controller(q, dq, q_des, dq_des)` may replace the shipped law - that is how a control exercise
    swaps in its own gain schedule, its own MPC step or a gains-tuned-by-you variant.

    Returns a dict: max_ik_fk_err_mm, max_dyn_err_mm, rms_dyn_err_mm, final state, and the trace of
    (t, x_d, y_d, x_act, y_act, tau1, tau2) when `record` is true.
    """
    q1, q2 = ik(*figure8_target(0.0)) if state is None else (state[0], state[1])
    dq1, dq2 = (0.0, 0.0) if state is None else (state[2], state[3])
    prev_q1_d, prev_q2_d = q1, q2
    law = controller or pd_gravity_torque

    max_ik_fk_err_mm = 0.0
    max_dyn_err_mm = 0.0
    sum_sq_dyn_err = 0.0
    trace = []

    for step in range(steps):
        t = step * dt
        xd, yd = figure8_target(t)
        q1_d, q2_d = ik(xd, yd)
        if step > 0:
            dq1_d = (q1_d - prev_q1_d) / dt
            dq2_d = (q2_d - prev_q2_d) / dt
        else:
            dq1_d, dq2_d = 0.0, 0.0
        prev_q1_d, prev_q2_d = q1_d, q2_d

        x_ik, y_ik = fk(q1_d, q2_d)
        max_ik_fk_err_mm = max(max_ik_fk_err_mm, math.hypot(xd - x_ik, yd - y_ik) * 1000.0)

        tau = law((q1, q2), (dq1, dq2), (q1_d, q2_d), (dq1_d, dq2_d))
        dist = disturbance_torque(t) if disturbance else (0.0, 0.0)
        q1, q2, dq1, dq2 = step_arm((q1, q2, dq1, dq2), tau, dist=dist, dt=dt)

        x_act, y_act = fk(q1, q2)
        dyn_err_mm = math.hypot(xd - x_act, yd - y_act) * 1000.0
        max_dyn_err_mm = max(max_dyn_err_mm, dyn_err_mm)
        sum_sq_dyn_err += dyn_err_mm * dyn_err_mm
        if record:
            trace.append((t, xd, yd, x_act, y_act, tau[0], tau[1]))

    return {
        "max_ik_fk_err_mm": max_ik_fk_err_mm,
        "max_dyn_err_mm": max_dyn_err_mm,
        "rms_dyn_err_mm": math.sqrt(sum_sq_dyn_err / steps),
        "state": (q1, q2, dq1, dq2),
        "trace": trace,
    }


def simulate_motor(
    voltage,
    resistance_ohm,
    inductance_h,
    kt_nm_per_a,
    ke_v_per_rad_s,
    inertia_kg_m2,
    damping_nm_s_rad,
    dt=DT,
    steps=TICKS,
    load_torque=0.0,
    record=False,
):
    """Time-step a DC motor's electrical and mechanical states: the plant behind a joint.

        di/dt     = (voltage - R * i - Ke * omega) / L
        domega/dt = (Kt * i - b * omega - load_torque) / J

    There are deliberately **no defaults** for R, L, Kt, Ke, J or b. Those are bench measurements
    (Tier 1 lesson 07.1's sine-sweep system identification, or the motor datasheet), and a plausible
    invented value would hide the missing measurement - the same reason the Tier 1 capstone states
    its own joint inertias instead of deriving them here. In SI, Kt == Ke.

    The loop is the same semi-implicit Euler as `step_arm`: current first, then speed from the NEW
    current, then angle from the NEW speed. That scheme is only stable inside
    `dt < 2 * (pole time constant)`, so the two poles are checked before stepping: silently
    returning `nan` from a discretisation mistake is the least useful thing this library could do,
    and the limit is itself a Tier 2 lesson (the `dt` slider).

    Returns a dict: final current, speed, angle, plus the trace when `record` is true. The joint-space
    plant above is what the arm exercises use; this is for the electrical and current-loop lessons.
    """
    electrical_limit = 2.0 * inductance_h / resistance_ohm
    mechanical_limit = 2.0 * inertia_kg_m2 / damping_nm_s_rad if damping_nm_s_rad > 0.0 else math.inf
    if dt > electrical_limit or dt > mechanical_limit:
        pole = "electrical (2*L/R)" if dt > electrical_limit else "mechanical (2*J/b)"
        limit = min(electrical_limit, mechanical_limit)
        raise ValueError(
            "dt=%.6g s is past the Euler stability limit for the %s pole "
            "(dt must be < %.6g s here); use a smaller dt, or integrate that pole exactly"
            % (dt, pole, limit)
        )

    current = 0.0
    speed = 0.0
    angle = 0.0
    trace = []
    for step in range(steps):
        di = (voltage - resistance_ohm * current - ke_v_per_rad_s * speed) / inductance_h
        domega = (kt_nm_per_a * current - damping_nm_s_rad * speed - load_torque) / inertia_kg_m2
        current += di * dt
        speed += domega * dt
        angle += speed * dt
        if record:
            trace.append((step * dt, current, speed, angle))
    return {"current_a": current, "speed_rad_s": speed, "angle_rad": angle, "trace": trace}


def quantize_angle(q_rad, cpr=ENCODER_CPR):
    """The angle an encoder actually reports: snapped to the nearest count, wrapped to one turn."""
    return counts_to_rad(encoder_counts(q_rad, cpr=cpr), cpr=cpr)


def encoder_counts(q_rad, cpr=ENCODER_CPR):
    """Absolute shaft counts in [0, cpr) for a single-turn on-axis encoder such as the AS5600."""
    turns = math.fmod(q_rad, 2.0 * math.pi) / (2.0 * math.pi)
    if turns < 0.0:
        turns += 1.0
    return int(round(turns * cpr)) % cpr


def counts_to_rad(counts, cpr=ENCODER_CPR):
    """Counts -> radians, the inverse of `encoder_counts` on one turn."""
    return (counts % cpr) * 2.0 * math.pi / cpr


def add_noise(values, std, seed=0):
    """Gaussian noise with a fixed seed, so a lesson's numbers reproduce exactly.

    Seeded on purpose: an exercise that prints a number has to print the same number twice.
    """
    rng = random.Random(seed)
    return [value + rng.gauss(0.0, std) for value in values]


def crc8_ccitt(data_bytes):
    """Polynomial CRC-8, 0x07 - the capstone's telemetry checksum."""
    crc = 0x00
    for byte in data_bytes:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if (crc & 0x80) else (crc << 1) & 0xFF
    return crc


def simulate_uart_tx(num_frames, frame_bytes, dt_s, baud_rate, buf_cap_bytes=TX_RING_BYTES):
    """Dropped frames when `num_frames` byte frames are queued every dt_s on an 8N1 link."""
    tx_bytes_per_tick = (baud_rate / 10.0) * dt_s
    buf_used = 0.0
    dropped = 0
    for _ in range(num_frames):
        if buf_used + frame_bytes <= buf_cap_bytes:
            buf_used += frame_bytes
        else:
            dropped += 1
        buf_used = max(0.0, buf_used - tx_bytes_per_tick)
    return dropped


def plant_summary():
    """One-line human summary of the shared plant, for a lesson's first cell."""
    return (
        "2-DOF planar arm: L1=%.2f m, L2=%.2f m, m1=%.2f kg, m2=%.2f kg, "
        "I=(%.4f, %.4f) kg*m^2, b=(%.2f, %.2f) N*m*s/rad, tau_limit=%.1f N*m, "
        "dt=%.3f s, encoder=%d cpr"
        % (L1, L2, M1, M2, I1, I2, B1, B2, TAU_LIMIT, DT, ENCODER_CPR)
    )


if __name__ == "__main__":
    print(plant_summary())
    print(
        "gravity holding torque at (q1=0, q2=0): tau_g1=%.4f N*m, tau_g2=%.4f N*m"
        % gravity_torque(0.0, 0.0)
    )
    run = simulate_arm()
    print(
        "1 kHz figure-8 run: IK->FK err=%.4f mm | Dynamic tip err max=%.2f mm, RMS=%.2f mm"
        % (run["max_ik_fk_err_mm"], run["max_dyn_err_mm"], run["rms_dyn_err_mm"])
    )
    print(
        "20-byte frame at 1 kHz: dropped @%d=%d, @%d=%d"
        % (
            BAUD_OVERFLOWS,
            simulate_uart_tx(TICKS, FRAME_BYTES, DT, BAUD_OVERFLOWS),
            BAUD_FITS,
            simulate_uart_tx(TICKS, FRAME_BYTES, DT, BAUD_FITS),
        )
    )
