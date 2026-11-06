#!/usr/bin/env python3
"""Validate every `micro/P.<n>.json` and write `app/src/data/microLessons.ts`.

The micro-learning content is authored as data, not as a second hand-written TypeScript catalogue.
Each source file is one parent lesson's slice: the anchors it cites, the concepts it teaches and the
order a learner meets them in. This script is the one door: it checks every concept, its parent
anchors, deterministic questions, resources, prerequisites and timing, then emits the typed bundle
the tab imports.

Usage
    python3 scripts/generate_micro_lessons.py            # validate and write
    python3 scripts/generate_micro_lessons.py --check    # exit 1 when the committed bundle is stale
    python3 scripts/generate_micro_lessons.py --stats    # counts and timings, write nothing

Exit-code family: typed
    0  the content validates and the bundle is current (or was written)
    1  a finding, or a stale generated file
    2  a bad command line
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import micro_timing as timing  # noqa: E402

SOURCE_DIR = os.path.join(ROOT, "micro")
SOURCE_NAME = re.compile(r"^P\.\d+\.json$")
OUT = os.path.join(ROOT, "app", "src", "data", "microLessons.ts")
EXPECTED_IDS = [
    "variables",
    "assignment-order",
    "int-float",
    "strings",
    "booleans",
    "mixed-types",
    "f-strings",
    "operators",
    "floor-division",
    "order-of-operations",
]
QUESTION_FIELDS = ("id", "prompt", "explanation")
ANCHOR = re.compile(r'^\s*<a\s+id="([^"]+)"\s*>\s*</a>\s*$')
HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")


def source_paths() -> list[str]:
    names = sorted(name for name in os.listdir(SOURCE_DIR) if SOURCE_NAME.match(name))
    if not names:
        raise OSError("no micro/P.<n>.json sources found")
    return [os.path.join(SOURCE_DIR, name) for name in names]


def load_sources() -> list[dict]:
    sources = []
    for path in source_paths():
        with open(path, encoding="utf-8") as handle:
            source = json.load(handle)
        source["_source"] = os.path.relpath(path, ROOT)
        sources.append(source)
    return sources


def concepts_of(sources: list[dict]) -> list[dict]:
    return [concept for source in sources for concept in source.get("concepts", [])]


def parent_text(path: str) -> str:
    with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        return handle.read()


def sections(text: str) -> dict[str, str]:
    """Anchor id -> the text of the section the anchor starts.

    A section runs from its anchor through the heading that follows it, and stops at the next
    same-or-higher heading or the next explicit anchor. That is the contract `sourceFocus` is
    checked against: a phrase cannot drift into a different part of the lesson unnoticed.
    """
    lines = text.splitlines()
    found = []
    for index, line in enumerate(lines):
        match = ANCHOR.match(line)
        if match:
            found.append((match.group(1), index))
    result = {}
    for position, (anchor_id, start) in enumerate(found):
        if anchor_id in result:
            raise ValueError(f"duplicate anchor id: {anchor_id}")
        next_anchor = found[position + 1][1] if position + 1 < len(found) else len(lines)
        heading_level = None
        heading_index = None
        for index in range(start + 1, next_anchor):
            match = HEADING.match(lines[index])
            if match:
                heading_level = len(match.group(1))
                heading_index = index
                break
        if heading_level is None:
            body = "\n".join(lines[start:next_anchor])
            result[anchor_id] = body
            continue
        end = next_anchor
        for index in range(heading_index + 1, len(lines)):
            match = HEADING.match(lines[index])
            if match and len(match.group(1)) <= heading_level:
                end = index
                break
        result[anchor_id] = "\n".join(lines[start:end])
    return result


def _question_findings(question: dict, where: str) -> list[str]:
    findings = []
    if not isinstance(question, dict):
        return [f"{where} is not an object"]
    for field in QUESTION_FIELDS:
        if not isinstance(question.get(field), str) or not question.get(field, "").strip():
            findings.append(f"{where} has no {field}")
    kind = question.get("type", "choice")
    if kind == "choice":
        options = question.get("options")
        if not isinstance(options, list) or len(options) < 4:
            findings.append(f"{where} must have at least four options")
            return findings
        ids = set()
        for option in options:
            if not isinstance(option, dict) or not isinstance(option.get("id"), str):
                findings.append(f"{where} has an option without an id")
                continue
            if option["id"] in ids:
                findings.append(f"{where} repeats option id {option['id']}")
            ids.add(option["id"])
            if not isinstance(option.get("text"), str) or not option["text"].strip():
                findings.append(f"{where} option {option['id']} has no text")
        if question.get("answerId") not in ids:
            findings.append(f"{where} answerId does not name one of its options")
    elif kind == "short":
        accepted = question.get("acceptedAnswers")
        if not isinstance(accepted, list) or not accepted:
            findings.append(f"{where} short answer has no acceptedAnswers")
        elif not all(isinstance(value, str) and value.strip() for value in accepted):
            findings.append(f"{where} has an empty accepted answer")
    else:
        findings.append(f"{where} has unknown question type {kind!r}")
    return findings


def _cycle(concepts: list[dict]) -> list[str]:
    by_id = {concept["id"]: concept for concept in concepts}
    visiting, done = set(), set()
    findings = []

    def visit(node: str, trail: list[str]) -> None:
        if node in done:
            return
        if node in visiting:
            findings.append("prerequisite cycle: " + " -> ".join(trail + [node]))
            return
        visiting.add(node)
        for prerequisite in by_id.get(node, {}).get("prerequisites", []):
            if prerequisite not in by_id:
                findings.append(f"{node} names unknown prerequisite {prerequisite}")
            else:
                visit(prerequisite, trail + [node])
        visiting.remove(node)
        done.add(node)

    for concept in concepts:
        visit(concept["id"], [])
    return findings


def validate(sources: list[dict]) -> tuple[list[str], list[str], dict]:
    findings: list[str] = []
    warnings: list[str] = []
    if not sources:
        return ["no micro sources were found"], [], {}
    subject = sources[0].get("subjectId")
    parent_ids: set[str] = set()
    anchors_by_parent: dict[str, dict[str, str]] = {}
    for source in sources:
        label = source.get("_source", "source")
        parent = source.get("parentPath", "")
        parent_lesson = source.get("parentLessonId")
        concepts = source.get("concepts")
        if not parent:
            findings.append(f"{label} has no parentPath")
            continue
        if not isinstance(concepts, list) or not concepts:
            findings.append(f"{label} has no concepts")
            continue
        if not parent_lesson:
            findings.append(f"{label} has no parentLessonId")
            continue
        if parent_lesson in parent_ids:
            findings.append(f"{label} repeats parent lesson {parent_lesson}")
        parent_ids.add(parent_lesson)
        if source.get("subjectId") != subject:
            findings.append(f"{label} teaches {source.get('subjectId')!r}, not {subject!r}")
        try:
            text = parent_text(parent)
            anchor_sections = sections(text)
        except OSError as error:
            findings.append(f"{label} cannot read {parent}: {error}")
            continue
        anchors_by_parent[parent_lesson] = anchor_sections
        for concept in concepts:
            cid = concept.get("id", "?")
            if concept.get("parentLessonId") != parent_lesson:
                findings.append(f"{cid} points at a different parent lesson")
            if concept.get("anchor") not in anchor_sections:
                findings.append(f"{cid} anchor {concept.get('anchor')!r} is not in {parent}")
                continue
            body = anchor_sections[concept["anchor"]]
            for phrase in concept.get("sourceFocus", []):
                if phrase not in body:
                    findings.append(f"{cid} sourceFocus {phrase!r} is not in its anchored section")
            if not isinstance(concept.get("revision"), int) or concept["revision"] < 1:
                findings.append(f"{cid} needs a positive integer revision")
            if not concept.get("title"):
                findings.append(f"{cid} has no title")
            for resource in concept.get("resources", []):
                url = resource.get("url", "")
                if not url.startswith("https://"):
                    findings.append(f"{cid} resource {resource.get('id')!r} is not an https URL")
                if url not in text:
                    findings.append(f"{cid} resource {url!r} is not already cited by the parent lesson")
                if not resource.get("lastVerified"):
                    findings.append(f"{cid} resource {resource.get('id')!r} has no lastVerified date")
            diagnostics = concept.get("diagnostics")
            if not isinstance(diagnostics, list) or len(diagnostics) != 2:
                findings.append(f"{cid} must have exactly two diagnostics")
            else:
                for diagnostic in diagnostics:
                    findings.extend(_question_findings(diagnostic, f"{cid} diagnostic"))
            for field in ("practice", "challenge"):
                if not isinstance(concept.get(field), dict):
                    findings.append(f"{cid} has no {field}")
                else:
                    findings.extend(_question_findings(concept[field], f"{cid} {field}"))
            pool = concept.get("reviewPool")
            if not isinstance(pool, list) or len(pool) < 3:
                findings.append(f"{cid} needs a review pool of at least three questions")
            else:
                for question in pool:
                    findings.extend(_question_findings(question, f"{cid} review"))
                sets = timing.review_sets(pool)
                if not sets:
                    findings.append(f"{cid} has no valid review rotation set")
                if len(set(sets)) != len(sets):
                    findings.append(f"{cid} repeats a review rotation set")
            if not concept.get("teaching"):
                findings.append(f"{cid} has no teaching paragraphs")
            if not (concept.get("example") or {}).get("code"):
                findings.append(f"{cid} has no worked example")
            walkthrough = concept.get("walkthrough")
            if not isinstance(walkthrough, list) or len(walkthrough) < 2:
                findings.append(f"{cid} needs a walkthrough of at least two steps")
            else:
                for index, step in enumerate(walkthrough, 1):
                    if not isinstance(step, dict):
                        findings.append(f"{cid} walkthrough step {index} is not an object")
                        continue
                    for field in ("code", "note"):
                        if not isinstance(step.get(field), str) or not step.get(field, "").strip():
                            findings.append(f"{cid} walkthrough step {index} has no {field}")
                    for field in ("variable", "before", "after", "expression", "output"):
                        if field in step and not isinstance(step[field], str):
                            findings.append(f"{cid} walkthrough step {index} has a non-string {field}")
            findings.extend(timing.validate_timing(concept))
            warnings.extend(timing.validate_divergence(concept))
    concepts = concepts_of(sources)
    ids = [concept.get("id") for concept in concepts]
    if ids != EXPECTED_IDS:
        findings.append(f"expected the ten concepts in authored order, found {ids}")
    if len(set(ids)) != len(ids):
        findings.append("two concepts share an id")
    findings.extend(_cycle(concepts))
    return findings, warnings, {"anchors": anchors_by_parent}


def build(sources: list[dict]) -> str:
    concepts = []
    for concept in concepts_of(sources):
        copy = json.loads(json.dumps(concept))
        copy["timing"] = {
            activity: {
                "estimatedSeconds": int(concept["timing"][activity]),
                "modeledSeconds": timing.modeled(concept)[activity],
            }
            for activity in ("learn", "review", "challenge")
        }
        for question in [
            *copy.get("diagnostics", []),
            copy.get("practice"),
            *copy.get("reviewPool", []),
            copy.get("challenge"),
        ]:
            if question is not None:
                question.setdefault("type", "choice")
        concepts.append(copy)
    parents = [
        {
            "parentLessonId": source["parentLessonId"],
            "parentPath": source["parentPath"],
            "title": source["title"],
            "conceptIds": [concept["id"] for concept in source["concepts"]],
        }
        for source in sources
    ]
    payload = {
        "version": 2,
        "subjectId": sources[0]["subjectId"],
        "title": sources[0].get("subjectTitle", "Python in small steps"),
        "parents": parents,
        "concepts": concepts,
    }
    payload_json = json.dumps(payload, indent=2, ensure_ascii=False)
    return f"""// Auto-generated by scripts/generate_micro_lessons.py — do not edit manually
export interface MicroResource {{
  id: string;
  title: string;
  url: string;
  type: string;
  role: 'primary' | 'optional';
  provider: string;
  lastVerified: string;
}}

export interface MicroOption {{
  id: string;
  text: string;
}}

export interface MicroQuestion {{
  id: string;
  prompt: string;
  code?: string;
  type: 'choice' | 'short';
  options?: MicroOption[];
  answerId?: string;
  acceptedAnswers?: string[];
  explanation: string;
}}

export interface MicroTiming {{
  estimatedSeconds: number;
  modeledSeconds: number;
}}

export interface MicroWalkthroughStep {{
  code: string;
  note: string;
  variable?: string;
  before?: string;
  after?: string;
  expression?: string;
  output?: string;
}}

export interface MicroConcept {{
  id: string;
  title: string;
  parentLessonId: string;
  anchor: string;
  sourceFocus: string[];
  revision: number;
  prerequisites: string[];
  resources: MicroResource[];
  timing: {{ learn: MicroTiming; review: MicroTiming; challenge: MicroTiming }};
  teaching: string[];
  example: {{ code: string; output: string }};
  walkthrough: MicroWalkthroughStep[];
  diagnostics: MicroQuestion[];
  practice: MicroQuestion;
  reviewPool: MicroQuestion[];
  challenge: MicroQuestion;
}}

/** One parent lesson's slice of the catalogue: where its concepts live and in what order. */
export interface MicroParent {{
  parentLessonId: string;
  parentPath: string;
  title: string;
  conceptIds: string[];
}}

export interface MicroCatalog {{
  version: number;
  subjectId: string;
  title: string;
  parents: MicroParent[];
  concepts: MicroConcept[];
}}

export const MICRO_LESSONS: MicroCatalog = {payload_json};
"""


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when the generated file is stale")
    parser.add_argument("--stats", action="store_true", help="print timings and write nothing")
    args = parser.parse_args(argv)
    try:
        sources = load_sources()
        findings, warnings, _ = validate(sources)
    except (OSError, ValueError, KeyError) as error:
        print(f"[FAIL] {error}", file=sys.stderr)
        return 1
    for warning in warnings:
        print(f"[warn] {warning}", file=sys.stderr)
    if findings:
        for finding in findings:
            print(f"[FAIL] {finding}", file=sys.stderr)
        return 1
    concepts = concepts_of(sources)
    if args.stats:
        for concept in concepts:
            model = timing.modeled(concept)
            print(
                f"{concept['id']:20} learn {concept['timing']['learn']:>3}s/{model['learn']:>6.1f}s  "
                f"review {concept['timing']['review']:>3}s/{model['review']:>5.1f}s  "
                f"challenge {concept['timing']['challenge']:>3}s/{model['challenge']:>5.1f}s"
            )
        return 0
    output = build(sources)
    try:
        with open(OUT, encoding="utf-8") as handle:
            current = handle.read()
    except OSError:
        current = ""
    if args.check:
        if current != output:
            print(f"[FAIL] {os.path.relpath(OUT, ROOT)} is stale; run scripts/generate_micro_lessons.py", file=sys.stderr)
            return 1
        print(f"ok micro lessons: {len(concepts)} concepts from {len(sources)} lessons")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(output)
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(concepts)} concepts from {len(sources)} lessons)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
