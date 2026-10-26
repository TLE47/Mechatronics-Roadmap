"""The content pipeline's own tests (`tests/test_content_build.py`).

Two things are checked here that the Node suite cannot see:

  * the validator actually rejects what it claims to — an unknown schema keyword, a missing field, a
    wrong type, an out-of-range number — so a schema cannot rely on a rule nothing enforces;
  * the meaning checks reject the content mistakes a schema cannot describe: a mission whose
    `spineStep` points at another mission's lessons, a recording that grew into a chapter, a perk id
    used twice, a mission with no part, an alias that points at itself.

The real tree is checked too, in memory and through `--check`, so this suite fails for the same
reason CI does.
"""

from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build_content as bc  # noqa: E402  (the path above is the point)


def findings_of(check) -> list[str]:
    found = bc.Findings()
    check(found)
    return found.lines


class ValidatorTests(unittest.TestCase):
    def test_accepts_a_valid_object(self) -> None:
        schema = {
            "type": "object",
            "required": ["id"],
            "additionalProperties": False,
            "properties": {"id": {"type": "string", "pattern": "^[a-z]+$"}, "n": {"type": "integer", "minimum": 1}},
        }
        found = bc.Findings()
        bc.validate({"id": "abc", "n": 2}, schema, "x", found)
        self.assertEqual(
            found.lines,
            [],
            "expected a valid object to produce no findings; check the validator's own walk",
        )

    def test_rejects_a_missing_field(self) -> None:
        schema = {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}}}
        found = bc.Findings()
        bc.validate({}, schema, "x", found)
        self.assertIn(
            "missing required field 'id'",
            found.lines[0],
            "expected a finding naming the missing field; check the required-key walk",
        )

    def test_rejects_an_unexpected_field(self) -> None:
        schema = {"type": "object", "additionalProperties": False, "properties": {"id": {"type": "string"}}}
        found = bc.Findings()
        bc.validate({"id": "a", "extra": 1}, schema, "x", found)
        self.assertIn(
            "unexpected field 'extra'",
            found.lines[0],
            "expected a finding naming the unexpected field; check additionalProperties",
        )

    def test_rejects_a_wrong_type_and_a_bool_for_an_integer(self) -> None:
        schema = {"type": "integer"}
        for value in ("3", True, [], {}):
            with self.subTest(value=value):
                found = bc.Findings()
                bc.validate(value, schema, "x", found)
                self.assertTrue(
                    found.lines,
                    "expected a wrong type, and a bool where an integer is declared, to be rejected",
                )

    def test_rejects_out_of_range_and_bad_pattern(self) -> None:
        found = bc.Findings()
        bc.validate(11, {"type": "integer", "maximum": 10}, "x", found)
        bc.validate(0, {"type": "integer", "minimum": 1}, "x", found)
        bc.validate("Nope", {"type": "string", "pattern": "^[a-z]+$"}, "x", found)
        bc.validate("", {"type": "string", "minLength": 2}, "x", found)
        self.assertEqual(
            len(found.lines),
            4,
            "expected one finding per violated bound, pattern and length; check the four rules",
        )

    def test_rejects_an_enum_member_it_does_not_have(self) -> None:
        found = bc.Findings()
        bc.validate("IV", {"type": "string", "enum": ["I", "II", "III"]}, "x", found)
        self.assertIn(
            "is not one of",
            found.lines[0],
            "expected an enum member outside the list to be rejected; check the enum rule",
        )

    def test_rejects_a_schema_keyword_it_cannot_enforce(self) -> None:
        found = bc.Findings()
        bc.validate("a", {"type": "string", "oneOf": [{"type": "string"}]}, "x", found)
        self.assertTrue(
            any("not implemented" in line for line in found.lines),
            "expected an unimplemented keyword to be refused, not silently ignored; check the keyword list",
        )

    def test_every_committed_schema_uses_only_implemented_keywords(self) -> None:
        for path in sorted(bc.SCHEMAS.glob("*.schema.json")):
            with self.subTest(schema=path.name):
                schema = json.loads(path.read_text(encoding="utf-8"))
                found = bc.Findings()
                bc._check_schema_keywords(schema, path.name, found)
                self.assertEqual(
                    found.lines,
                    [],
                    f"expected {path.name} to use only implemented keywords; check the schema",
                )


class MiniYamlTests(unittest.TestCase):
    """The dependency-free loader, and its agreement with the real one on every committed file."""

    def test_reads_the_shapes_the_content_uses(self) -> None:
        text = """
# a comment
version: 1
name: "Employee #40817. Role deleted."
items:
  - id: one
    label: H-7's light
    perks:
      - { id: a, label: "The alley, the oil trail", kind: surface }
  - id: two
    toys: [Telemetry tiles, Board LEDs]
flag: true
count: 3
"""
        self.assertEqual(
            bc.mini_yaml.load(text),
            {
                "version": 1,
                "name": "Employee #40817. Role deleted.",
                "items": [
                    {
                        "id": "one",
                        "label": "H-7's light",
                        "perks": [{"id": "a", "label": "The alley, the oil trail", "kind": "surface"}],
                    },
                    {"id": "two", "toys": ["Telemetry tiles", "Board LEDs"]},
                ],
                "flag": True,
                "count": 3,
            },
            "expected mini YAML to read quotes, block lists, flow maps and scalars; check the parser",
        )

    def test_a_hash_is_a_comment_only_outside_quotes(self) -> None:
        value = bc.mini_yaml.load('a: Employee #40817\nb: "Employee #40817"\n')
        self.assertEqual(
            value,
            {"a": "Employee", "b": "Employee #40817"},
            "expected a hash to open a comment only when it is outside quotes; check the scanner",
        )

    def test_an_apostrophe_inside_a_word_is_text(self) -> None:
        self.assertEqual(
            bc.mini_yaml.load("label: H-7's status light\n"),
            {"label": "H-7's status light"},
            "expected an apostrophe inside a word to stay text, not open a quoted scalar",
        )

    def test_unsupported_yaml_is_refused_rather_than_guessed(self) -> None:
        for text in ("a: |\n  line\n", "a: &anchor 1\n", "a: [1, 2\n"):
            with self.subTest(text=text):
                with self.assertRaises(bc.mini_yaml.MiniYamlError):
                    bc.mini_yaml.load(text)

    def test_agrees_with_pyyaml_on_every_committed_file(self) -> None:
        try:
            import yaml
        except ImportError:  # pragma: no cover - only where PyYAML is not installed
            self.skipTest("PyYAML is not installed; nothing to compare against")
        paths = sorted(bc.CONTENT.glob("**/*.yaml"))
        self.assertGreater(
            len(paths),
            0,
            "expected at least one YAML file under content/; check the glob before trusting a pass",
        )
        for path in paths:
            text = path.read_text(encoding="utf-8")
            with self.subTest(file=path.name):
                self.assertEqual(
                    bc.mini_yaml.load(text),
                    yaml.safe_load(text),
                    f"expected mini YAML and PyYAML to agree on {path.name}; check the loader",
                )

    def test_agrees_with_pyyaml_on_every_recording_front_matter(self) -> None:
        try:
            import yaml
        except ImportError:  # pragma: no cover
            self.skipTest("PyYAML is not installed; nothing to compare against")
        for path in sorted((bc.CONTENT / "blackbox").glob("*.md")):
            text = path.read_text(encoding="utf-8")
            end = text.find("\n---\n", 4)
            front = text[4:end]
            with self.subTest(file=path.name):
                self.assertEqual(
                    bc.mini_yaml.load(front),
                    yaml.safe_load(front),
                    f"expected both loaders to agree on {path.name}'s front matter; check the split",
                )


class MeaningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.real = bc.load_content(bc.Findings())
        cls.found = bc.Findings()
        bc.check_meaning(cls.real, cls.found)

    def mutate(self, change) -> list[str]:
        content = copy.deepcopy(self.real)
        change(content)
        return findings_of(lambda found: bc.check_meaning(content, found))

    def test_the_real_tree_is_clean(self) -> None:
        self.assertEqual(
            self.found.lines,
            [],
            "expected the real content tree to pass the meaning checks; check content/ first",
        )
        found = bc.Findings()
        bc.load_content(found)
        self.assertEqual(
            found.lines,
            [],
            "expected loading the real tree to raise no findings; check the loader's own checks",
        )

    def test_built_files_are_up_to_date(self) -> None:
        self.assertEqual(
            bc.main(["--check"]),
            0,
            "expected the generated files to be current; run python3 scripts/build_content.py and commit",
        )

    def test_a_mission_must_name_its_own_spine_step(self) -> None:
        lines = self.mutate(lambda content: content["missions"][0].__setitem__("spineStep", 2))
        self.assertTrue(
            any("must equal the mission number" in line for line in lines),
            "expected a mission naming another step to be rejected; check the spine-step match",
        )

    def test_a_recording_may_not_grow_into_a_chapter(self) -> None:
        def grow(content) -> None:
            content["recordings"][0]["body"] = " ".join(["word"] * 121)
            content["recordings"][0]["words"] = 121

        lines = self.mutate(grow)
        self.assertTrue(
            any("capped at 120" in line for line in lines),
            "expected a 121-word recording to be rejected by the cap; check the word-count rule",
        )

    def test_a_perk_id_may_not_be_used_twice(self) -> None:
        def duplicate(content) -> None:
            perks = content["rewards"]["levels"][2]["perks"]
            content["rewards"]["levels"][3]["perks"][0]["id"] = perks[0]["id"]

        lines = self.mutate(duplicate)
        self.assertTrue(
            any("perk id is used twice" in line for line in lines),
            "expected a duplicated perk id to be rejected; check the uniqueness rule",
        )

    def test_every_level_unlocks_something(self) -> None:
        lines = self.mutate(lambda content: content["rewards"]["levels"][4].__setitem__("perks", []))
        self.assertTrue(
            any("unlocks nothing" in line for line in lines),
            "expected a level with no perks or toys to be rejected; check the level rule",
        )

    def test_every_mission_seats_exactly_one_part(self) -> None:
        lines = self.mutate(lambda content: content["parts"].__setitem__("parts", content["parts"]["parts"][:-1]))
        self.assertTrue(
            any("do not cover 1..10" in line for line in lines),
            "expected nine parts for ten missions to be rejected; check the coverage rule",
        )

    def test_a_part_may_not_name_a_lesson_that_does_not_exist(self) -> None:
        lines = self.mutate(lambda content: content["parts"]["parts"][0].__setitem__("lesson", "P.999"))
        self.assertTrue(
            any("is not in the registry" in line for line in lines),
            "expected a part naming an unknown lesson to be rejected; check the registry join",
        )

    def test_an_alias_may_not_point_at_itself(self) -> None:
        lines = self.mutate(
            lambda content: content["aliases"].__setitem__("lessons", [{"from": "P.1", "to": "P.1"}])
        )
        self.assertTrue(
            any("points at itself" in line for line in lines),
            "expected a self-referential alias to be rejected; check the alias direction check",
        )

    def test_a_missing_recording_is_a_finding(self) -> None:
        lines = self.mutate(lambda content: content["missions"][0].__setitem__("recording", "99-nothing"))
        self.assertTrue(
            any("has no file in content/blackbox" in line for line in lines),
            "expected a mission pointing at no recording file to be rejected; check the file join",
        )


if __name__ == "__main__":
    unittest.main()
