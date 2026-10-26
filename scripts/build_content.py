#!/usr/bin/env python3
"""Validate `content/` and build the bundle the workbench renders (`scripts/build_content.py`).

MechaLab 3.0 makes GitHub the source of truth: the ten missions, the Black Box recordings, the
reward rules, the robot's parts and the id aliases are reviewed files, and the site is a build of
them. This script is that build.

    python3 scripts/build_content.py             write app/src/data/contentBundle.ts + the manifest
    python3 scripts/build_content.py --check     fail if either file is stale (what CI runs)
    python3 scripts/build_content.py --json      one JSON object on stdout, for the tests

Two kinds of check, both here rather than in a second script:

  * schema — every file is validated against `schemas/*.schema.json` by the small validator below.
    CI has no `jsonschema` package (the Python job installs nothing), so the subset the schemas use
    is implemented here: type, required, additionalProperties, properties, items, enum, pattern,
    minimum, maximum, minItems, maxItems, minLength, maxLength. A schema keyword outside that set
    is an error rather than a silent pass.
  * meaning — the things a schema cannot say: mission numbers are exactly 1..10 and name their own
    spine step, a recording exists for every mission and is at most 120 words, a level is 0..10 and
    a perk id is unique, every mission seats exactly one part, and every lesson an item names is in
    the registry the runner already lists.

The bundle carries a content hash. Learner progress records the hash it was verified against, so a
changed story or rule can prompt a gentle re-verify instead of resetting anything.

Exit-code family: typed — 0 ok, 1 findings, 2 usage.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

# PyYAML when it is installed, the dependency-free subset otherwise: CI's Python 3.12 toolcache
# does not ship PyYAML, and this job installs nothing. `tests/test_content_build.py` compares the two
# on every committed file, so the fallback cannot drift from the real parser unnoticed.
import mini_yaml

try:  # pragma: no cover - which backend is present is a property of the machine
    import yaml

    def load_yaml_text(text: str) -> object:
        return yaml.safe_load(text)

    YAML_BACKEND = "pyyaml"
except ImportError:

    def load_yaml_text(text: str) -> object:  # type: ignore[misc]
        return mini_yaml.load(text)

    YAML_BACKEND = "mini_yaml"

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
SCHEMAS = ROOT / "schemas"
BUNDLE_PATH = ROOT / "app" / "src" / "data" / "contentBundle.ts"
# The recordings are prose, and only the dashboard's Black Box page reads them. They are a file of
# their own so a learner who never opens Mission Control does not download ten voice memos in the
# entry chunk: the engine needs missions and rules, not sentences.
RECORDINGS_PATH = ROOT / "app" / "src" / "data" / "contentRecordings.ts"
MANIFEST_PATH = ROOT / "app" / "public" / "content" / "manifest.json"
LESSON_DATA = ROOT / "app" / "src" / "data" / "pythonLessonsData.ts"

CHAPTERS = {1: "I", 2: "I", 3: "I", 4: "II", 5: "II", 6: "II", 7: "II", 8: "III", 9: "III", 10: "III"}
MISSION_COUNT = 10
RECORDING_WORD_LIMIT = 120

# The JSON-Schema keywords this validator understands. Anything else in a schema is a finding,
# so a schema cannot quietly rely on a rule the check does not enforce.
SCHEMA_KEYWORDS = {
    "$schema",
    "$id",
    "title",
    "description",
    "type",
    "required",
    "additionalProperties",
    "properties",
    "items",
    "enum",
    "pattern",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
}


class Findings:
    """Every problem this run found, in the order it found them."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def add(self, where: str, message: str) -> None:
        self.lines.append(f"{where}: {message}")

    def __bool__(self) -> bool:
        return bool(self.lines)


# --------------------------------------------------------------------------------------------
# The validator
# --------------------------------------------------------------------------------------------

_PY_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "null": type(None),
}


def _check_schema_keywords(schema: dict, where: str, findings: Findings) -> None:
    for keyword in schema:
        if keyword not in SCHEMA_KEYWORDS:
            findings.add(where, f"schema keyword {keyword!r} is not implemented by this validator")


def validate(value: object, schema: dict, where: str, findings: Findings) -> None:
    _check_schema_keywords(schema, where, findings)

    expected = schema.get("type")
    if expected is not None:
        python_type = _PY_TYPES[expected]
        # bool is an int in Python; a schema that says integer never means True.
        if isinstance(value, bool) and expected in ("integer", "number"):
            findings.add(where, f"expected {expected}, found boolean")
            return
        if not isinstance(value, python_type):
            findings.add(where, f"expected {expected}, found {type(value).__name__}")
            return

    if "enum" in schema and value not in schema["enum"]:
        findings.add(where, f"{value!r} is not one of {schema['enum']}")

    if isinstance(value, str):
        if "pattern" in schema and not re.search(schema["pattern"], value):
            findings.add(where, f"{value!r} does not match {schema['pattern']}")
        if "minLength" in schema and len(value) < schema["minLength"]:
            findings.add(where, f"{value!r} is shorter than {schema['minLength']}")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            findings.add(where, f"{len(value)} characters exceeds {schema['maxLength']}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            findings.add(where, f"{value} is below {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            findings.add(where, f"{value} is above {schema['maximum']}")

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            findings.add(where, f"{len(value)} items, at least {schema['minItems']} required")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            findings.add(where, f"{len(value)} items, at most {schema['maxItems']} allowed")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                validate(item, item_schema, f"{where}[{index}]", findings)

    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                findings.add(where, f"missing required field {key!r}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in properties:
                    findings.add(where, f"unexpected field {key!r}")
        for key, sub_schema in properties.items():
            if key in value:
                validate(value[key], sub_schema, f"{where}.{key}", findings)


def load_schema(name: str, findings: Findings) -> dict:
    path = SCHEMAS / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        findings.add(f"schemas/{name}", f"cannot read the schema: {error}")
        return {}


# --------------------------------------------------------------------------------------------
# Loading the content
# --------------------------------------------------------------------------------------------

def load_yaml(path: Path, findings: Findings) -> dict:
    try:
        parsed = load_yaml_text(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        findings.add(str(path.relative_to(ROOT)), f"cannot read the file: {error}")
        return {}
    if not isinstance(parsed, dict):
        findings.add(str(path.relative_to(ROOT)), "the file must be a mapping")
        return {}
    return parsed


def split_front_matter(text: str) -> tuple[dict, str]:
    """The YAML block between two `---` lines, and the recording after it."""
    if not text.startswith("---\n"):
        raise ValueError("no front matter (the file must start with ---)")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValueError("front matter is not closed with ---")
    front = load_yaml_text(text[4:end]) or {}
    if not isinstance(front, dict):
        raise ValueError("front matter must be a mapping")
    return front, text[end + 5 :].strip()


def word_count(body: str) -> int:
    """Words, not tokens: em dashes and punctuation are not words."""
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’\-]*", body))


def lesson_ids() -> set[str]:
    """Every id the runner lists, read from the generated registry."""
    text = LESSON_DATA.read_text(encoding="utf-8")
    return set(re.findall(r'"id":\s*"([^"]+)"', text))


def load_content(findings: Findings) -> dict:
    mission_schema = load_schema("mission.schema.json", findings)
    recording_schema = load_schema("recording.schema.json", findings)
    rewards_schema = load_schema("rewards.schema.json", findings)
    parts_schema = load_schema("parts.schema.json", findings)
    aliases_schema = load_schema("aliases.schema.json", findings)

    mission_paths = sorted((CONTENT / "missions").glob("*.yaml"))
    if len(mission_paths) != MISSION_COUNT:
        findings.add("content/missions", f"{len(mission_paths)} files, exactly {MISSION_COUNT} required")
    missions = []
    for path in mission_paths:
        where = f"content/missions/{path.name}"
        data = load_yaml(path, findings)
        validate(data, mission_schema, where, findings)
        if path.stem[:2] != f"{data.get('number', 0):02d}":
            findings.add(where, f"the file name must start with the mission number ({data.get('number')})")
        missions.append(data)

    recording_paths = sorted((CONTENT / "blackbox").glob("*.md"))
    if len(recording_paths) != MISSION_COUNT:
        findings.add("content/blackbox", f"{len(recording_paths)} files, exactly {MISSION_COUNT} required")
    recordings = []
    for path in recording_paths:
        where = f"content/blackbox/{path.name}"
        try:
            front, body = split_front_matter(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            findings.add(where, str(error))
            continue
        validate(front, recording_schema, where, findings)
        if front.get("id") != path.stem:
            findings.add(where, f"front matter id {front.get('id')!r} must equal the file name")
        # The length is checked in `check_meaning`, from the body, so a caller that assembles the
        # content itself (a test, a future importer) gets the same answer as the file path does.
        if not body:
            findings.add(where, "the recording is empty")
        recordings.append({**front, "body": body, "words": word_count(body)})

    rewards = load_yaml(CONTENT / "rewards" / "rules.yaml", findings)
    validate(rewards, rewards_schema, "content/rewards/rules.yaml", findings)

    try:
        parts_doc = json.loads((CONTENT / "arm" / "parts.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        findings.add("content/arm/parts.json", f"cannot read the file: {error}")
        parts_doc = {}
    validate(parts_doc, parts_schema, "content/arm/parts.json", findings)

    aliases = load_yaml(CONTENT / "aliases.yaml", findings)
    validate(aliases, aliases_schema, "content/aliases.yaml", findings)

    return {
        "missions": missions,
        "recordings": recordings,
        "rewards": rewards,
        "parts": parts_doc,
        "aliases": aliases,
    }


# --------------------------------------------------------------------------------------------
# The checks a schema cannot make
# --------------------------------------------------------------------------------------------

def check_meaning(content: dict, findings: Findings) -> None:
    missions = content["missions"]
    recordings = content["recordings"]
    rewards = content["rewards"]
    parts = content["parts"].get("parts", [])
    aliases = content["aliases"]
    known_lessons = lesson_ids()

    numbers = [m.get("number") for m in missions]
    if sorted(numbers) != list(range(1, MISSION_COUNT + 1)):
        findings.add("content/missions", f"numbers {sorted(numbers)} are not exactly 1..{MISSION_COUNT}")

    slugs = [m.get("slug") for m in missions]
    if len(set(slugs)) != len(slugs):
        findings.add("content/missions", f"duplicate slug in {slugs}")

    for mission in missions:
        where = f"mission {mission.get('number')}"
        number = mission.get("number")
        if mission.get("spineStep") != number:
            findings.add(
                where,
                f"spineStep {mission.get('spineStep')} must equal the mission number: the lesson list "
                "is the spine's, so a mission cannot point at another step's lessons",
            )
        if CHAPTERS.get(number) != mission.get("chapter"):
            findings.add(where, f"chapter must be {CHAPTERS.get(number)!r} for mission {number}")
        if mission.get("recording") not in {r.get("id") for r in recordings}:
            findings.add(where, f"recording {mission.get('recording')!r} has no file in content/blackbox")

    for recording in recordings:
        where = f"content/blackbox/{recording.get('id')}"
        words = word_count(recording.get("body", ""))
        if words > RECORDING_WORD_LIMIT:
            findings.add(where, f"{words} words; a recording is capped at {RECORDING_WORD_LIMIT}")
        if not words:
            findings.add(where, "the recording is empty")
        if recording.get("words") != words:
            findings.add(where, f"the words field says {recording.get('words')}, the body has {words}")

    by_number = {r.get("number"): r for r in recordings}
    if set(by_number) != set(range(1, MISSION_COUNT + 1)):
        findings.add("content/blackbox", f"recordings cover {sorted(by_number)}, not 1..{MISSION_COUNT}")
    for mission in missions:
        recording = by_number.get(mission.get("number"))
        if recording and mission.get("recording") != recording.get("id"):
            findings.add(
                f"mission {mission.get('number')}",
                f"names {mission.get('recording')!r} but recording {recording.get('id')!r} is that number",
            )

    levels = rewards.get("levels", [])
    level_numbers = [level.get("number") for level in levels]
    if level_numbers != list(range(0, MISSION_COUNT + 1)):
        findings.add("content/rewards/rules.yaml", f"levels are {level_numbers}, not 0..{MISSION_COUNT}")
    perk_ids = [perk.get("id") for level in levels for perk in level.get("perks", [])]
    if len(set(perk_ids)) != len(perk_ids):
        findings.add("content/rewards/rules.yaml", "a perk id is used twice")
    for level in levels:
        if level.get("number", 0) > 0 and not level.get("perks"):
            findings.add(
                "content/rewards/rules.yaml",
                f"level {level.get('number')} unlocks nothing: every level must unlock something usable",
            )

    parts_by_mission: dict[int, int] = {}
    for part in parts:
        parts_by_mission[part.get("mission")] = parts_by_mission.get(part.get("mission"), 0) + 1
        lesson = part.get("lesson")
        if lesson and lesson not in known_lessons:
            findings.add(f"content/arm/parts.json ({part.get('id')})", f"lesson {lesson!r} is not in the registry")
    if sorted(parts_by_mission) != list(range(1, MISSION_COUNT + 1)):
        findings.add("content/arm/parts.json", f"missions {sorted(parts_by_mission)} do not cover 1..{MISSION_COUNT}")
    for number, count in parts_by_mission.items():
        if count != 1:
            findings.add("content/arm/parts.json", f"mission {number} seats {count} parts; exactly one")

    for row in aliases.get("lessons", []):
        if row.get("from") == row.get("to"):
            findings.add("content/aliases.yaml", f"lesson alias {row.get('from')!r} points at itself")
        if row.get("to") not in known_lessons:
            findings.add("content/aliases.yaml", f"lesson alias target {row.get('to')!r} is not in the registry")
    for row in aliases.get("missions", []):
        if row.get("from") == row.get("to"):
            findings.add("content/aliases.yaml", f"mission alias {row.get('from')!r} points at itself")


# --------------------------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------------------------

BUNDLE_HEADER = '''// Auto-generated by scripts/build_content.py — do not edit manually
//
// MechaLab 3.0's story, missions and reward rules, copied for the app from `content/`.
// GitHub is the source of truth: a change to a mission, a recording or a reward rule reaches
// the site only through a merged pull request that rebuilt this file. `--check` fails when this
// file is stale, so the site can never render a story the repository does not have.
//
// `CONTENT_VERSION` is a hash of everything above. A verification records the version it was
// taken against, so a changed story can offer a gentle re-verify instead of resetting progress.

export interface Mission {
  number: number;
  slug: string;
  name: string;
  chapter: 'I' | 'II' | 'III';
  /** The spine step whose lessons this mission asks for; always equal to `number`. */
  spineStep: number;
  /** What the robot can do once the mission verifies. */
  capability: string;
  capabilityShort: string;
  bossMoment: string;
  toys: string[];
  /** One line from the Machinist, printed on the door card. */
  doorLine: string;
  recording: string;
  clue: string;
  homeHotspot: string;
}

export interface LevelPerk {
  id: string;
  label: string;
  kind: 'surface' | 'toy' | 'room' | 'look' | 'audio' | 'flair';
}

export interface RewardLevel {
  number: number;
  handle: string;
  tagline: string;
  earnedAt: string;
  perks: LevelPerk[];
}

export interface ProofMarkRule {
  id: string;
  label: string;
  earnedWhen: string;
  why: string;
}

export interface StreetCredRule {
  id: string;
  label: string;
  trigger:
    | 'first-verified'
    | 'three-predictions'
    | 'five-diagnostic-fixes'
    | 'hold-steady-verified'
    | 'first-fault-repair'
    | 'four-days-four-weeks'
    | 'ten-missions';
  scrap: number;
  reward: { id: string; label: string; kind: 'sign' | 'decal' | 'skyline' | 'paint' | 'station' | 'crate' | 'lamp' };
}

export interface RewardRules {
  version: number;
  levels: RewardLevel[];
  proofMarks: ProofMarkRule[];
  streetCred: StreetCredRule[];
  neon: { firstVerified: number; review: number; integration: number; reRun: number; hints: number };
  nightShifts: { defaultTarget: number; weekStartsOn: 'monday' | 'sunday'; countsAs: 'meaningful-attempt' };
}

export interface RobotPart {
  id: string;
  name: string;
  mission: number;
  kind: 'board' | 'light' | 'joint' | 'drive' | 'arm' | 'sense' | 'reflex' | 'control' | 'path' | 'finish';
  /** The one lesson that owns this assembly, when a single lesson does. */
  lesson?: string;
}

export interface IdAliases {
  version: number;
  lessons: { from: string; to: string }[];
  missions: { from: number; to: number }[];
}

export interface ContentManifest {
  version: string;
  missions: number;
  recordings: number;
  levels: number;
  proofMarks: number;
  streetCred: number;
  parts: number;
}
'''


def ts_literal(value: object) -> str:
    """JSON is valid TypeScript for the shapes above; two spaces and a newline for review."""
    return json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False)


def canonical(content: dict) -> str:
    return json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


RECORDINGS_HEADER = '''// Auto-generated by scripts/build_content.py — do not edit manually
//
// The ten Black Box recordings, prose and all. A file of their own because only the dashboard's
// Black Box page reads them: the engine needs missions and rules, not sentences, so a learner who
// never opens Mission Control never downloads the story text.

export interface BlackBoxRecording {
  id: string;
  number: number;
  title: string;
  voice: 'machinist' | 'collective' | 'glados' | 'you';
  unlocksAfter: 'mission' | 'lesson';
  clue: string;
  credit: string;
  optional?: boolean;
  body: string;
  words: number;
}
'''


def build_recordings(recordings: list[dict]) -> str:
    return "\n".join(
        [
            RECORDINGS_HEADER,
            "export const RECORDINGS: BlackBoxRecording[] = " + ts_literal(recordings) + ";",
            "",
        ]
    )


def build_bundle(content: dict) -> tuple[str, dict]:
    missions = sorted(content["missions"], key=lambda m: m["number"])
    recordings = sorted(content["recordings"], key=lambda r: r["number"])
    version = hashlib.sha256(canonical(content).encode("utf-8")).hexdigest()[:10]
    rewards = content["rewards"]
    parts = content["parts"]["parts"]
    aliases = content["aliases"]

    manifest = {
        "version": version,
        "missions": len(missions),
        "recordings": len(recordings),
        "levels": len(rewards.get("levels", [])),
        "proofMarks": len(rewards.get("proofMarks", [])),
        "streetCred": len(rewards.get("streetCred", [])),
        "parts": len(parts),
    }

    body = "\n".join(
        [
            BUNDLE_HEADER,
            f'export const CONTENT_VERSION = {json.dumps(version)};',
            "",
            "export const MISSIONS: Mission[] = " + ts_literal(missions) + ";",
            "",
            "export const REWARDS: RewardRules = " + ts_literal(rewards) + ";",
            "",
            "export const PARTS: RobotPart[] = " + ts_literal(parts) + ";",
            "",
            "export const ALIASES: IdAliases = " + ts_literal(aliases) + ";",
            "",
            "export const CONTENT_MANIFEST: ContentManifest = " + ts_literal(manifest) + ";",
            "",
            "export const MISSION_COUNT = MISSIONS.length;",
            "",
        ]
    )
    return body, manifest


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="build_content.py",
        description="Validate content/ and build the workbench's content bundle.",
        epilog="Exit-code family: typed",
    )
    parser.add_argument("--check", action="store_true", help="fail if the built files are stale")
    parser.add_argument("--json", action="store_true", help="print one JSON object on stdout")
    args = parser.parse_args(argv)

    findings = Findings()
    content = load_content(findings)
    if not findings:
        check_meaning(content, findings)

    if findings:
        for line in findings.lines:
            print(f"  {line}", file=sys.stderr)
        print(f"content: {len(findings.lines)} problem(s)", file=sys.stderr)
        return 1

    bundle, manifest = build_bundle(content)
    recordings = build_recordings(sorted(content["recordings"], key=lambda r: r["number"]))
    stale: list[str] = []

    if args.check:
        actual = BUNDLE_PATH.read_text(encoding="utf-8") if BUNDLE_PATH.exists() else ""
        if actual != bundle:
            stale.append(str(BUNDLE_PATH.relative_to(ROOT)))
        actual_recordings = RECORDINGS_PATH.read_text(encoding="utf-8") if RECORDINGS_PATH.exists() else ""
        if actual_recordings != recordings:
            stale.append(str(RECORDINGS_PATH.relative_to(ROOT)))
        actual_manifest = MANIFEST_PATH.read_text(encoding="utf-8") if MANIFEST_PATH.exists() else ""
        if actual_manifest != json.dumps(manifest, indent=2) + "\n":
            stale.append(str(MANIFEST_PATH.relative_to(ROOT)))
        if stale:
            for path in stale:
                print(f"  {path} is stale", file=sys.stderr)
            print("content: run python3 scripts/build_content.py and commit the result", file=sys.stderr)
            return 1
    else:
        BUNDLE_PATH.parent.mkdir(parents=True, exist_ok=True)
        BUNDLE_PATH.write_text(bundle, encoding="utf-8")
        RECORDINGS_PATH.write_text(recordings, encoding="utf-8")
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps({"ok": True, "stale": stale, "yaml": YAML_BACKEND, **manifest}))
    elif not args.check:
        print(f"content: {manifest['missions']} missions, {manifest['recordings']} recordings, "
              f"content v{manifest['version']}")
    else:
        print(f"content: up to date at v{manifest['version']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
