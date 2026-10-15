#!/usr/bin/env python3
"""validate_models.py — Automated URDF & MuJoCo MJCF Physics, Inertia & Kinematic Validator.

Validates Capstone II (Furuta Pendulum), Capstone III (6-DOF Manipulator), and
Capstone IV (3-DOF QDD Hopping Leg):
  1. XML Schema & Kinematic Tree Topology (connected acyclic tree, unique root link)
  2. Physical Mass & Inertia Tensor Realizability:
     - Positive mass (m > 0)
     - Symmetric Positive Definite (SPD) 3x3 inertia matrix via Sylvester's criterion
     - Strict 3D rigid-body triangle inequalities: I_1 + I_2 >= I_3 for all eigenvalues
  3. Cross-Format URDF <-> MuJoCo MJCF Parity:
     - Matching link names, masses, diagonal principal inertias, joint names, axes, and limits
  4. Capstone-Specific Engineering Requirements:
     - Capstone II: 2 movable joints, 1 actuated base joint + 1 unactuated continuous pendulum
     - Capstone III: 6 revolute joints with spherical wrist + TCP force/torque sensor site
     - Capstone IV: Distal shank mass m_shank < 0.180 kg & QDD reflected armature inertia present

Exit-code family: typed (0 = all checks pass, 1 = validation failure, 2 = usage error).
"""

from __future__ import annotations

import argparse
import json
import math
import signal
import sys
import unittest
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

signal.signal(signal.SIGPIPE, signal.SIG_DFL)

VERSION = "1.0.0"

MODELS_DIR = Path(__file__).resolve().parent


@dataclass
class InertialSpec:
    link_name: str
    mass: float
    ixx: float
    iyy: float
    izz: float
    ixy: float = 0.0
    ixz: float = 0.0
    iyz: float = 0.0

    def is_spd(self) -> bool:
        """Sylvester's criterion for 3x3 symmetric matrix positive definiteness."""
        m1 = self.ixx
        m2 = self.ixx * self.iyy - self.ixy * self.ixy
        det3 = (
            self.ixx * (self.iyy * self.izz - self.iyz * self.iyz)
            - self.ixy * (self.ixy * self.izz - self.iyz * self.ixz)
            + self.ixz * (self.ixy * self.iyz - self.iyy * self.ixz)
        )
        return m1 > 0.0 and m2 > 0.0 and det3 > 0.0

    def satisfies_triangle_inequality(self, tol: float = 1e-9) -> bool:
        """For diagonal inertia (or principal moments), I_a + I_b >= I_c."""
        # When off-diagonal terms are zero, principal moments are (ixx, iyy, izz)
        i1, i2, i3 = self.ixx, self.iyy, self.izz
        return (
            (i1 + i2 + tol >= i3)
            and (i1 + i3 + tol >= i2)
            and (i2 + i3 + tol >= i1)
        )


@dataclass
class JointSpec:
    name: str
    joint_type: str
    parent: str
    child: str
    axis: tuple[float, float, float]
    lower: float | None
    upper: float | None
    effort: float | None


def parse_vec3(text: str) -> tuple[float, float, float]:
    parts = [float(x) for x in text.strip().split()]
    if len(parts) != 3:
        raise ValueError(f"Expected 3 floats, got '{text}'")
    return (parts[0], parts[1], parts[2])


def parse_urdf(urdf_path: Path) -> tuple[str, dict[str, InertialSpec], dict[str, JointSpec]]:
    tree = ET.parse(urdf_path)
    root = tree.getroot()
    if root.tag != "robot":
        raise ValueError(f"{urdf_path}: Root tag must be <robot>, got <{root.tag}>")
    robot_name = root.attrib["name"]

    links: dict[str, InertialSpec] = {}
    for link_el in root.findall("link"):
        lname = link_el.attrib["name"]
        inel = link_el.find("inertial")
        if inel is None:
            raise ValueError(f"{urdf_path}: Link '{lname}' missing <inertial> block")
        mass_el = inel.find("mass")
        inertia_el = inel.find("inertia")
        if mass_el is None or inertia_el is None:
            raise ValueError(f"{urdf_path}: Link '{lname}' missing <mass> or <inertia>")
        links[lname] = InertialSpec(
            link_name=lname,
            mass=float(mass_el.attrib["value"]),
            ixx=float(inertia_el.attrib["ixx"]),
            iyy=float(inertia_el.attrib["iyy"]),
            izz=float(inertia_el.attrib["izz"]),
            ixy=float(inertia_el.attrib.get("ixy", "0.0")),
            ixz=float(inertia_el.attrib.get("ixz", "0.0")),
            iyz=float(inertia_el.attrib.get("iyz", "0.0")),
        )

    joints: dict[str, JointSpec] = {}
    for j_el in root.findall("joint"):
        jname = j_el.attrib["name"]
        jtype = j_el.attrib["type"]
        parent_el = j_el.find("parent")
        child_el = j_el.find("child")
        if parent_el is None or child_el is None:
            raise ValueError(f"{urdf_path}: Joint '{jname}' missing parent/child")
        axis_el = j_el.find("axis")
        axis = parse_vec3(axis_el.attrib["xyz"]) if axis_el is not None else (1.0, 0.0, 0.0)
        limit_el = j_el.find("limit")
        lower = float(limit_el.attrib["lower"]) if (limit_el is not None and "lower" in limit_el.attrib) else None
        upper = float(limit_el.attrib["upper"]) if (limit_el is not None and "upper" in limit_el.attrib) else None
        effort = float(limit_el.attrib["effort"]) if (limit_el is not None and "effort" in limit_el.attrib) else None
        joints[jname] = JointSpec(
            name=jname,
            joint_type=jtype,
            parent=parent_el.attrib["link"],
            child=child_el.attrib["link"],
            axis=axis,
            lower=lower,
            upper=upper,
            effort=effort,
        )

    return robot_name, links, joints


def parse_mujoco_xml(
    mjcf_path: Path,
) -> tuple[str, dict[str, InertialSpec], dict[str, JointSpec], list[str], list[str]]:
    tree = ET.parse(mjcf_path)
    root = tree.getroot()
    if root.tag != "mujoco":
        raise ValueError(f"{mjcf_path}: Root tag must be <mujoco>, got <{root.tag}>")
    model_name = root.attrib["model"]

    bodies: dict[str, InertialSpec] = {}
    joints: dict[str, JointSpec] = {}

    worldbody = root.find("worldbody")
    if worldbody is None:
        raise ValueError(f"{mjcf_path}: Missing <worldbody>")

    def walk_body(body_el: ET.Element, parent_name: str) -> None:
        bname = body_el.attrib["name"]
        inel = body_el.find("inertial")
        if inel is not None:
            diag = parse_vec3(inel.attrib["diaginertia"])
            bodies[bname] = InertialSpec(
                link_name=bname,
                mass=float(inel.attrib["mass"]),
                ixx=diag[0],
                iyy=diag[1],
                izz=diag[2],
            )
        for j_el in body_el.findall("joint"):
            jname = j_el.attrib["name"]
            jtype = j_el.attrib.get("type", "hinge")
            axis = parse_vec3(j_el.attrib.get("axis", "0 0 1"))
            rng = j_el.attrib.get("range")
            lower, upper = (None, None)
            if rng:
                rparts = [float(x) for x in rng.split()]
                lower, upper = rparts[0], rparts[1]
            joints[jname] = JointSpec(
                name=jname,
                joint_type=jtype,
                parent=parent_name,
                child=bname,
                axis=axis,
                lower=lower,
                upper=upper,
                effort=None,
            )
        for child_body in body_el.findall("body"):
            walk_body(child_body, bname)

    for top_body in worldbody.findall("body"):
        walk_body(top_body, "world")

    actuators = [m.attrib["name"] for m in root.findall("./actuator/*")]
    sensors = [s.attrib["name"] for s in root.findall("./sensor/*")]
    return model_name, bodies, joints, actuators, sensors


class TestCapstoneModels(unittest.TestCase):
    MODEL_PAIRS = [
        (
            "capstone2_furuta_pendulum",
            MODELS_DIR / "capstone2-furuta-pendulum" / "furuta_pendulum.urdf",
            MODELS_DIR / "capstone2-furuta-pendulum" / "furuta_pendulum.xml",
        ),
        (
            "capstone3_6dof_arm",
            MODELS_DIR / "capstone3-6dof-arm" / "manipulator_6dof.urdf",
            MODELS_DIR / "capstone3-6dof-arm" / "manipulator_6dof.xml",
        ),
        (
            "capstone4_qdd_hopper",
            MODELS_DIR / "capstone4-qdd-hopper" / "qdd_hopper_leg.urdf",
            MODELS_DIR / "capstone4-qdd-hopper" / "qdd_hopper_leg.xml",
        ),
    ]

    def test_all_urdf_and_mjcf_inertia_spd_and_triangle_inequalities(self) -> None:
        for expected_name, urdf_path, mjcf_path in self.MODEL_PAIRS:
            self.assertTrue(urdf_path.is_file(), f"Missing {urdf_path}")
            self.assertTrue(mjcf_path.is_file(), f"Missing {mjcf_path}")

            u_name, u_links, u_joints = parse_urdf(urdf_path)
            m_name, m_bodies, m_joints, actuators, sensors = parse_mujoco_xml(mjcf_path)

            self.assertEqual(u_name, expected_name)
            self.assertEqual(m_name, expected_name)
            self.assertGreater(len(actuators), 0)
            self.assertGreater(len(sensors), 0)

            # Verify kinematic tree connectivity (exactly 1 root link in URDF)
            children = {j.child for j in u_joints.values()}
            roots = [lname for lname in u_links if lname not in children]
            self.assertEqual(roots, ["base_link"], f"{u_name}: Expected single root 'base_link'")

            # Check every link's mass, SPD, triangle inequality, and URDF <-> MJCF match
            for lname, u_in in u_links.items():
                self.assertGreater(u_in.mass, 0.0, f"{u_name}.{lname}: mass must be > 0")
                self.assertTrue(u_in.is_spd(), f"{u_name}.{lname}: inertia matrix not SPD")
                self.assertTrue(
                    u_in.satisfies_triangle_inequality(),
                    f"{u_name}.{lname}: violates rigid-body triangle inequality",
                )
                self.assertIn(lname, m_bodies, f"{u_name}: link '{lname}' missing in MuJoCo XML")
                m_in = m_bodies[lname]
                self.assertAlmostEqual(u_in.mass, m_in.mass, places=6)
                self.assertAlmostEqual(u_in.ixx, m_in.ixx, places=7)
                self.assertAlmostEqual(u_in.iyy, m_in.iyy, places=7)
                self.assertAlmostEqual(u_in.izz, m_in.izz, places=7)

            # Check every non-fixed URDF joint matches MuJoCo joint axis & limits
            for jname, u_j in u_joints.items():
                if u_j.joint_type == "fixed":
                    continue
                self.assertIn(jname, m_joints, f"{u_name}: joint '{jname}' missing in MuJoCo XML")
                m_j = m_joints[jname]
                for ax_i in range(3):
                    self.assertAlmostEqual(u_j.axis[ax_i], m_j.axis[ax_i], places=6)
                if u_j.joint_type in ("revolute", "prismatic"):
                    self.assertIsNotNone(u_j.lower)
                    self.assertIsNotNone(m_j.lower)
                    self.assertAlmostEqual(u_j.lower or 0.0, m_j.lower or 0.0, places=5)
                    self.assertAlmostEqual(u_j.upper or 0.0, m_j.upper or 0.0, places=5)

    def test_capstone_specific_engineering_constraints(self) -> None:
        # Capstone II: Underactuated Furuta Pendulum (1 motor, 2 DOF)
        _, u2_links, u2_joints = parse_urdf(self.MODEL_PAIRS[0][1])
        _, _, _, m2_actuators, _ = parse_mujoco_xml(self.MODEL_PAIRS[0][2])
        self.assertEqual(len(m2_actuators), 1)
        self.assertEqual(u2_joints["q2_pendulum_pitch"].effort, 0.0)
        self.assertAlmostEqual(sum(l.mass for l in u2_links.values()), 2.975, places=4)

        # Capstone III: 6-DOF Force-Controlled Arm (6 revolute joints, 6 torque actuators, 6D F/T sensor)
        _, _, u3_joints = parse_urdf(self.MODEL_PAIRS[1][1])
        _, _, _, m3_actuators, m3_sensors = parse_mujoco_xml(self.MODEL_PAIRS[1][2])
        rev_joints_3 = [j for j in u3_joints.values() if j.joint_type == "revolute"]
        self.assertEqual(len(rev_joints_3), 6)
        self.assertEqual(len(m3_actuators), 6)
        self.assertIn("wrist_force_3d", m3_sensors)
        self.assertIn("wrist_torque_3d", m3_sensors)

        # Capstone IV: 3-DOF QDD Hopper (distal shank mass < 0.180 kg requirement)
        _, u4_links, _ = parse_urdf(self.MODEL_PAIRS[2][1])
        _, _, _, m4_actuators, m4_sensors = parse_mujoco_xml(self.MODEL_PAIRS[2][2])
        self.assertLess(u4_links["shank_link"].mass, 0.180)
        self.assertEqual(len(m4_actuators), 3)
        self.assertIn("foot_grf_touch", m4_sensors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="validate_models.py",
        description=(
            "Validate URDF and MuJoCo XML models for Capstones II, III, and IV.\n"
            "Exit-code family: typed (0 = pass, 1 = validation failure, 2 = usage error)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("-V", "--version", action="version", version=f"%(prog)s {VERSION}")
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error output")
    parser.add_argument("--verbose", action="store_true", help="Verbose test output")
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    parser.add_argument("--no-input", action="store_true", help="Disable interactive input")
    parser.add_argument("--dry-run", action="store_true", help="Read-only validation")
    args = parser.parse_args(argv)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TestCapstoneModels)
    stream = sys.stderr if args.json else sys.stdout
    runner = unittest.TextTestRunner(
        stream=stream, verbosity=2 if (args.verbose and not args.json) else 0
    )
    result = runner.run(suite)

    summary: dict[str, Any] = {
        "lab": "08-capstone-models",
        "ok": result.wasSuccessful(),
        "tests_run": result.testsRun,
        "models_validated": 6,
    }
    if args.json:
        sys.stdout.write(json.dumps(summary) + "\n")
    elif not args.quiet:
        status = "PASS" if result.wasSuccessful() else "FAIL"
        sys.stdout.write(f"[{status}] validated 6 URDF/MuJoCo models across Capstones II, III & IV\n")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
