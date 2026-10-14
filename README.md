# ⚡ MechaLab — Interactive Mechatronics & Robotics Workbench

> **From Maxwell's Equations and Euler-Lagrange Mechanics to Hard Real-Time STM32G4 Firmware, 48V/30A Field-Oriented Motor Control, Model Predictive Control, and Safety-Critical Autonomous Systems.**
>
> Modern React SPA built on Vite, TypeScript, Tailwind CSS, and KaTeX mathematical typography.

---

## 🚀 Live Interactive Features

MechaLab is an interactive, unified workbench for mechatronics and robotics engineering:

1. **8-Step Guided Beginner Walkthrough**:
   Interactive tutorial covering the entire cyber-physical loop: Two-Mass resonance cancellation, 25 kHz PMSM FOC with synchronous decoupling, Furuta pendulum swing-up + LQR + CBF, validated URDF/MuJoCo kinematics + Safe Torque Off (STO), 3D STEP/STL CAD parts + 48V/30A PCB electro-thermal breakdown, Schroeder multisine closed-loop SysID, and 6-DOF Attitude ESKF with Cortex-M7 `WaitFreeSeqLock` IPC.

2. **6 Interactive Physics & Hardware Simulators**:
   - **Two-Mass Mechanical Resonance & Biquad Notch Bode Analyzer** with auto-tuning to resonance frequencies.
   - **25 kHz PMSM Field-Oriented Control (FOC) & Space Vector PWM (SVPWM)** with cross-coupling decoupling switch.
   - **Live 60 FPS Furuta Inverted Pendulum** with Åström energy swing-up, LQR stabilization, and Control Barrier Function (CBF-QP) hard wall safety.
   - **Interactive URDF / MuJoCo Kinematic Inspector** (QDD Hopper leg, 6-DOF Serial Arm, Furuta Pendulum) + dual-channel hardware STO fault injection.
   - **3D Parametric CAD (STEP/STL) Viewer & Capstone I 48V/30A PCB Loss Budget Solver** with real-time MOSFET junction temperature estimation and complete Bill of Materials.
   - **Schroeder Multisine Closed-Loop System Identification** comparing low Crest Factor (1.66) uniform energy schedules against naive clipping zero-phase cosine spikes.
   - **6-DOF Attitude Error-State Kalman Filter (Joseph Form)** & Cortex-M7 lock-free `WaitFreeSeqLock` telemetry stream.

3. **Printable 1-Page Production Engineering Reference Card**:
   Accessible anytime via the top bar with equations for Lie groups $SO(3)$, Paros-Weisbord flexures, Clarke/Park FOC, Gang-of-Four sensitivity, Joseph ESKF, and dual-channel STO.

---

## 🛠️ Technology Stack

- **Framework**: React 19 SPA
- **Bundler & Dev Server**: Vite
- **Styling**: Tailwind CSS v4
- **Math Engine**: KaTeX
- **Language**: TypeScript (strict mode)
- **Icons**: Lucide React

---

## 💻 Development

```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Run type checks and build
npm run build
```
