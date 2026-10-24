"""The committed Arduino firmware must be the one the lesson ships (`tests/test_firmware_data.py`).

`app/public/firmware/<id>.hex` is compiled once, by `scripts/extract_and_compile_sketches.py
--write-firmware`, and executed by the Board tab in `avr8js`. This file pins the cheap half of the
gate: the index records the hash of the sketch each hex was built from and the hash of the file, so a
lesson edit or a hand-edited hex is caught without a compiler. The behaviour half — that the hex
actually prints the lesson's serial — is `scripts/test_avr.mjs`, which runs it.

Every negative case builds a small copy of the tree the gate reads (`app/public/firmware` plus
`app/src/data/firmware.json`) and calls the same `check_firmware` CI calls, so the test cannot pass by
checking something adjacent to the gate.

Run: `python3.12 tests/test_firmware_data.py`
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys_path_added = os.path.join(ROOT, "scripts")
import sys  # noqa: E402

sys.path.insert(0, sys_path_added)

import extract_and_compile_sketches as sketches  # noqa: E402


def copy_tree(destination: str) -> dict:
    """A minimal repository the gate can read: the firmware directory and its index."""
    firmware_dir = os.path.join(destination, "app", "public", "firmware")
    index_dir = os.path.join(destination, "app", "src", "data")
    os.makedirs(index_dir, exist_ok=True)
    shutil.copytree(os.path.join(ROOT, "app", "public", "firmware"), firmware_dir)
    with open(os.path.join(ROOT, sketches.FIRMWARE_INDEX_REL), encoding="utf-8") as handle:
        index = json.load(handle)
    with open(os.path.join(index_dir, "firmware.json"), "w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2)
    return index


class FirmwareGateTests(unittest.TestCase):
    def test_the_committed_firmware_matches_every_lesson(self):
        problems = sketches.check_firmware()
        self.assertEqual(
            problems,
            [],
            msg="expected every committed .hex to have been built from the sketch the page ships; "
            "run `python3 scripts/extract_and_compile_sketches.py --write-firmware` to rebuild",
        )

    def test_the_index_names_every_lesson_and_its_board(self):
        with open(os.path.join(ROOT, sketches.FIRMWARE_INDEX_REL), encoding="utf-8") as handle:
            index = json.load(handle)
        self.assertEqual(
            index.get("schema"),
            sketches.FIRMWARE_SCHEMA,
            msg="expected the firmware index to declare its schema; an older shape would be read wrongly",
        )
        self.assertEqual(
            index.get("fqbn"),
            "arduino:avr:uno",
            msg="expected the Uno's FQBN; another board would execute a different instruction set",
        )
        self.assertEqual(
            len(index["sketches"]),
            len(sketches.ARDUINO_LESSON_FILES),
            msg="expected one compiled sketch per Arduino lesson, so no lesson is missing its board",
        )

    def test_a_hand_edited_hex_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            index = copy_tree(tmp)
            first = index["sketches"][0]
            target = os.path.join(tmp, "app", "public", "firmware", os.path.basename(first["hex"]))
            with open(target, "w", encoding="utf-8") as handle:
                handle.write(":10000000000102030405060708090A0B0C0D0E0F10\n")
            problems = sketches.check_firmware(tmp)
        self.assertTrue(
            any("was edited after it was built" in problem or "not an Intel HEX file" in problem
                for problem in problems),
            msg=f"expected a hand-edited hex to be refused by its recorded hash, got {problems}",
        )

    def test_a_lesson_that_changed_after_the_build_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            index = copy_tree(tmp)
            index["sketches"][0]["sketchSha256"] = "0" * 64
            with open(os.path.join(tmp, sketches.FIRMWARE_INDEX_REL), "w", encoding="utf-8") as handle:
                json.dump(index, handle)
            problems = sketches.check_firmware(tmp)
        self.assertTrue(
            any("built from a different sketch" in problem for problem in problems),
            msg=f"expected a stale sketch hash to be named as drift, got {problems}",
        )

    def test_a_missing_index_says_how_to_build_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            problems = sketches.check_firmware(tmp)
        self.assertEqual(
            len(problems),
            1,
            msg=f"expected one finding for a tree with no firmware index, got {problems}",
        )
        self.assertIn(
            "--write-firmware",
            problems[0],
            msg="expected the missing-index finding to name the command that rebuilds it",
        )

    def test_an_entry_with_no_lesson_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            index = copy_tree(tmp)
            extra = dict(index["sketches"][0])
            extra["id"] = "a-lesson-that-does-not-exist"
            index["sketches"].append(extra)
            with open(os.path.join(tmp, sketches.FIRMWARE_INDEX_REL), "w", encoding="utf-8") as handle:
                json.dump(index, handle)
            problems = sketches.check_firmware(tmp)
        self.assertTrue(
            any("no lesson page produces it" in problem for problem in problems),
            msg=f"expected firmware with no lesson to be reported, got {problems}",
        )


if __name__ == "__main__":
    unittest.main()
