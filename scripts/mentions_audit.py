#!/usr/bin/env python3
"""Find the legacy concepts a bridge page only mentions in passing, and decide what to do with each.

A bridge page's `uses:` list says "I assume you can already do this". When the entry is a legacy
concept id (`so2_rotation_matrix`, `discrete_infinite_horizon_lqr`, ...) that is a claim about the
page's *dependency*, and a dependency the page never exercises is a false claim that inflates the
prerequisite graph.

The evidence is counted, not judged by eye:

1. the concept's **core term** — its rarest token across the 46 bridge pages (`so2`, `lqr`, `ruckig`);
2. `lines` — body lines containing that core term (front matter excluded);
3. `sections` — which numbered sections those lines fall in, so "only in §1 Why it matters" and
   "used in §4 Worked example and §5 Exercise" are different claims.

Decisions are recorded in `resources/mentions-decisions.json`, one row per page–concept pair:

- `keep` — the page engages the concept in §3 Formalization, §4 Worked example or §5 Exercise.
- `own` — the page declares the concept in `new_concepts:`: it teaches the idea, so it should not
  list it as an assumption.
- `drop` — the page never engages it; the `uses:` claim is removed.

`--check` fails when a pair has no decision, when a `drop` is still in `uses:`, or when an `own` is
missing from `new_concepts:` — so a decision cannot be recorded without being applied.

Usage:
    python3 scripts/mentions_audit.py            # rewrite docs/PASSING_MENTIONS.md
    python3 scripts/mentions_audit.py --check    # exit 1 when a decision is missing or unapplied
    python3 scripts/mentions_audit.py --json     # rows with evidence and current decision

Exit-code family: typed. Exit codes: 0 clean, 1 findings, 2 bad command line.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from audit_step_size import load_index, parse_front_matter  # noqa: E402

MODULES = os.path.join(ROOT, "modules")
OUT = os.path.join(ROOT, "docs", "PASSING_MENTIONS.md")
DECISIONS = os.path.join(ROOT, "resources", "mentions-decisions.json")
STOP = {"and", "of", "the", "to", "vs", "with", "for", "in", "a", "an", "on", "by", "or"}
REQUIRED_SECTIONS = ("3.", "4.", "5.")


def pages() -> dict[str, dict]:
    out = {}
    for name in sorted(os.listdir(MODULES)):
        if name.endswith(".md"):
            with open(os.path.join(MODULES, name), encoding="utf-8") as handle:
                raw = handle.read()
            out[name[:-3]] = {"raw": raw, "fm": parse_front_matter(raw)}
    return out


def body_sections(raw: str) -> dict[str, str]:
    body = raw.split("---\n", 2)[2] if raw.startswith("---\n") else raw
    parts = re.split(r"^## ", body, flags=re.MULTILINE)
    sections = {"preamble": parts[0]}
    for part in parts[1:]:
        sections[part.split("\n", 1)[0].strip()] = part
    return sections


def tokens(concept: str) -> list[str]:
    return [t for t in concept.split("_") if t not in STOP and len(t) > 2]


def normalize(text: str) -> str:
    return re.sub(r"[-_]", " ", text.lower())


def evidence(concept: str, sections: dict[str, str], df: dict[str, int], n_pages: int) -> dict:
    """Lines that engage the concept: two of its tokens, or its rarest token once."""
    toks = tokens(concept)
    core = min(toks, key=lambda t: df.get(t, n_pages))
    rare = {t for t in toks if df.get(t, n_pages) <= max(3, n_pages // 4)}
    lines, where, found = [], [], set()
    for title, text in sections.items():
        for line in text.splitlines():
            low = normalize(line)
            present = {t for t in toks if re.search(r"\b" + re.escape(t), low)}
            if len(present) >= 2 or (present & rare):
                lines.append(line)
                found |= present
                if title not in where:
                    where.append(title)
    substantive = [w for w in where if w.startswith(REQUIRED_SECTIONS)]
    return {
        "core": core,
        "terms": sorted(found),
        "lines": len(lines),
        "sections": where,
        "substantive": bool(substantive),
        "in_formalization": any(w.startswith("3.") for w in where),
        "in_exercise": any(w.startswith("5.") for w in where),
    }


def rows() -> list[dict]:
    legacy = load_index()[0]
    legacy_concepts = {c for lid in legacy for c in legacy[lid].get("introduces", [])}
    all_pages = pages()
    df: dict[str, int] = {}
    for record in all_pages.values():
        for tok in set(re.findall(r"[a-z0-9]+", record["raw"].lower())):
            df[tok] = df.get(tok, 0) + 1
    sections_by_page = {ident: body_sections(record["raw"]) for ident, record in all_pages.items()}
    # How hard does each page engage each legacy concept? A page is only \"teaching\" a concept when
    # it engages it as much as any other page does - otherwise it is applying someone else's lesson.
    strongest: dict[str, int] = {}
    for ident, record in all_pages.items():
        for concept in set(record["fm"]["uses"]) | set(record["fm"]["new_concepts"]):
            if concept in legacy_concepts:
                n = evidence(concept, sections_by_page[ident], df, len(all_pages))["lines"]
                strongest[concept] = max(strongest.get(concept, 0), n)

    out = []
    for ident, record in all_pages.items():
        used = [u for u in record["fm"]["uses"] if u in legacy_concepts]
        for concept in used:
            ev = evidence(concept, sections_by_page[ident], df, len(all_pages))
            gate = sections_by_page[ident].get(
                next((t for t in sections_by_page[ident] if t.startswith("7.")), ""), ""
            )
            out.append({
                "page": ident,
                "concept": concept,
                "declares": concept in record["fm"]["new_concepts"],
                "course_max": strongest.get(concept, ev["lines"]),
                "gate": gate,
                "applied": False,
                **ev,
            })
    # Pairs already decided stay in the report: a drop removes the id from `uses:`, so without this
    # the document would shrink to the undecided rows and `--check` could never match it.
    if os.path.exists(DECISIONS):
        with open(DECISIONS, encoding="utf-8") as handle:
            recorded = json.load(handle).get("decisions", [])
        known = {(r["page"], r["concept"]) for r in out}
        for rec in recorded:
            if (rec["page"], rec["concept"]) in known or rec["page"] not in all_pages:
                continue
            ev = evidence(rec["concept"], sections_by_page[rec["page"]], df, len(all_pages))
            out.append({
                "page": rec["page"],
                "concept": rec["concept"],
                "declares": rec["concept"] in all_pages[rec["page"]]["fm"]["new_concepts"],
                "course_max": strongest.get(rec["concept"], ev["lines"]),
                "applied": True,
                **ev,
            })
    return out


def crosswalk_pages() -> dict[str, str]:
    path = os.path.join(ROOT, "resources", "legacy-prereq-map.json")
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    return {c: r["page"] for c, r in data.get("concepts", {}).items() if r.get("page")}


def suggestion(row: dict, teachers: dict[str, str]) -> str:
    """Own when the page is the concept's crosswalk teacher, engages it in a graded section, and
    already tags it in the Gate test; keep when it applies the idea; drop when neither.

    The Gate-test condition is what makes `own` an applied change rather than a declaration: a concept
    in `new_concepts:` must be gated, and a page whose Gate test never names the idea is not yet the
    page that owns it.
    """
    gated = f"[Concept: {row['concept']}]" in row.get("gate", "")
    if row["substantive"] and gated and teachers.get(row["concept"]) == row["page"]:
        return "own"
    if row["substantive"]:
        return "keep"
    return "drop"


def rewrite_front_matter(ident: str, drop: list[str], own: list[str]) -> None:
    """Remove `drop` ids from `uses:`; move `own` ids from `uses:` into `new_concepts:`."""
    path = os.path.join(MODULES, ident + ".md")
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    head, rest = match.group(1), text[match.end():]
    lines = head.splitlines()
    present = {line[4:].strip() for line in lines if line.startswith("  - ")}
    out: list[str] = []
    section = None
    seen: set[str] = set()
    for line in lines:
        if line and not line.startswith(" "):
            seen = set()
        if line.startswith("uses:"):
            section = "uses"
            out.append(line)
            continue
        if line.startswith("new_concepts:"):
            section = "new_concepts"
            out.append(line)
            out.extend("  - " + c for c in sorted(own) if c not in present)
            continue
        if line.startswith("  - ") and section:
            ident_in_list = line[4:].strip()
            if ident_in_list in seen:
                continue
            seen.add(ident_in_list)
            if section == "uses" and ident_in_list in set(drop) | set(own):
                continue
            out.append(line)
            continue
        if line and not line.startswith(" "):
            section = None
        out.append(line)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("---\n" + "\n".join(out) + "\n---\n" + rest)


def render(data: list[dict]) -> str:
    drops = [r for r in data if r["decision"] == "drop"]
    owns = [r for r in data if r["decision"] == "own"]
    keeps = [r for r in data if r["decision"] == "keep"]
    lines = [
        "# Legacy concepts in `uses:` — owned, kept, or dropped",
        "",
        "<!-- Generated by scripts/mentions_audit.py — do not edit by hand.",
        "     `--apply` rewrites resources/mentions-decisions.json, the pages' front matter and this",
        "     file; `--check` fails when a decided change is not applied. -->",
        "",
        f"{len(data)} page–concept pairs across {len({r['page'] for r in data})} bridge pages name a legacy",
        "concept in `uses:`. Each was measured, not eyeballed: the concept's **core term** (its rarest token)",
        "plus its other tokens are searched in the page body, and the sections they land in decide the claim.",
        "",
        "| Decision | Rule | Count |",
        "| :--- | :--- | ---: |",
        "| `own` | the page is the concept's crosswalk teacher, engages it in §3/§4/§5, and already "
        f"tags it in its Gate test | {len(owns)} |",
        f"| `keep` | the page genuinely applies the idea in a graded section | {len(keeps)} |",
        f"| `drop` | the page never engages it outside prose, or not at all | {len(drops)} |",
        "",
        "```mermaid",
        "flowchart LR",
        '    P["page + concept in uses"] --> E["evidence: core term, lines, sections"]',
        '    E --> Q{"engages it in 3/4/5?"}',
        '    Q -->|no| D["drop the uses claim"]',
        '    Q -->|yes| T{"crosswalk teacher and Gate-tagged?"}',
        '    T -->|yes| O["own: move to new_concepts"]',
        '    T -->|no| K["keep as an assumption"]',
        "```",
        "",
        "## Dropped (`uses` claim removed)",
        "",
        "| Page | Concept | Core term | Lines | Sections it does appear in |",
        "| :--- | :--- | :--- | ---: | :--- |",
    ]
    for r in drops:
        lines.append(
            f"| `{r['page']}` | `{r['concept']}` | `{r['core']}` | {r['lines']} | "
            f"{', '.join(r['sections']) or '—'} |"
        )
    lines += ["", "## Owned (moved from `uses:` to `new_concepts:`)", "",
              "| Page | Concept | Lines | Sections |", "| :--- | :--- | ---: | :--- |"]
    for r in owns:
        lines.append(f"| `{r['page']}` | `{r['concept']}` | {r['lines']} | {', '.join(r['sections'])} |")
    lines += ["", "## Kept (the claim is real)", "",
              "| Page | Concept | Lines | Sections |", "| :--- | :--- | ---: | :--- |"]
    for r in keeps:
        lines.append(f"| `{r['page']}` | `{r['concept']}` | {r['lines']} | {', '.join(r['sections'])} |")
    lines += [
        "",
        "## What each decision changes",
        "",
        "- **Drop** removes the concept from `uses:`. The page may still mention it in prose; the claim that",
        "  it *depends* on the idea is what was false. Nothing else moves, because the crosswalk keeps",
        "  teaching-page links for every legacy concept.",
        "- **Own** moves the id from `uses:` to `new_concepts:`. This is the honest direction when the page",
        "  derives and tests the idea: an assumption it teaches is not an assumption.",
        "- **Keep** leaves the front matter untouched. The evidence column is already printed, so a reader",
        "  can challenge a keep without re-running the analysis.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if any(arg in ("-h", "--help") for arg in argv):
        print(__doc__)
        return 0
    unknown = [a for a in argv if a not in ("--check", "--json", "--apply")]
    if unknown:
        print(f"unknown argument(s): {' '.join(unknown)}", file=sys.stderr)
        return 2
    teachers = crosswalk_pages()
    data = rows()
    stored: dict[tuple[str, str], str] = {}
    if os.path.exists(DECISIONS):
        with open(DECISIONS, encoding="utf-8") as handle:
            stored = {(r["page"], r["concept"]): r["decision"] for r in json.load(handle)["decisions"]}
    for row in data:
        row["teacher"] = teachers.get(row["concept"], "")
        row["decision"] = stored.get((row["page"], row["concept"]), suggestion(row, teachers))
    if "--json" in argv:
        print(json.dumps(data, indent=2))
        return 0

    if "--apply" in argv:
        by_page: dict[str, dict[str, list[str]]] = {}
        for row in data:
            entry = by_page.setdefault(row["page"], {"drop": [], "own": []})
            if row["decision"] in ("drop", "own"):
                entry[row["decision"]].append(row["concept"])
        for page, actions in by_page.items():
            if actions["drop"] or actions["own"]:
                rewrite_front_matter(page, actions["drop"], actions["own"])
        with open(DECISIONS, "w", encoding="utf-8") as handle:
            json.dump({
                "_comment": "One row per page–concept pair. Regenerate with scripts/mentions_audit.py --apply; --check fails when a decision is not applied.",
                "decisions": [
                    {k: row[k] for k in ("page", "concept", "decision", "core", "lines", "sections")}
                    for row in data
                ],
            }, handle, indent=2)
            handle.write("\n")
        # Re-read now that the decisions exist: the report includes the applied pairs, so it must be
        # rendered from the same row set `--check` will recompute.
        data = rows()
        with open(DECISIONS, encoding="utf-8") as handle:
            stored = {(r["page"], r["concept"]): r["decision"] for r in json.load(handle)["decisions"]}
        for row in data:
            row["decision"] = stored.get(
                (row["page"], row["concept"]), suggestion(row, teachers)
            )
        with open(OUT, "w", encoding="utf-8") as handle:
            handle.write(render(data))
        print(f"applied {sum(1 for r in data if r['decision'] == 'drop')} drops and "
              f"{sum(1 for r in data if r['decision'] == 'own')} owns; wrote decisions and doc.")
        return 0

    if "--check" in argv:
        with open(DECISIONS, encoding="utf-8") as handle:
            recorded = json.load(handle)["decisions"]
        key = lambda r: (r["page"], r["concept"])
        stored = {key(r): r["decision"] for r in recorded}
        findings = []
        for row in data:
            decision = stored.get(key(row))
            if decision is None:
                findings.append(f"{row['page']} / {row['concept']}: no decision recorded")
                continue
            if decision != row["decision"]:
                findings.append(
                    f"{row['page']} / {row['concept']}: recorded {decision}, evidence now suggests {row['decision']}"
                )
            if decision in ("drop", "own") and row["page"] in pages():
                still_used = row["concept"] in pages()[row["page"]]["fm"]["uses"]
                if still_used:
                    findings.append(f"{row['page']} / {row['concept']}: decided {decision} but still in uses")
                if decision == "own" and row["concept"] not in pages()[row["page"]]["fm"]["new_concepts"]:
                    findings.append(f"{row['page']} / {row['concept']}: own decided but not in new_concepts")
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != render(data):
            findings.append("docs/PASSING_MENTIONS.md is stale — run --apply")
        for finding in findings:
            print("ERROR:", finding)
        if findings:
            return 1
        print(f"OK: {len(data)} pairs decided and applied; "
              f"{sum(1 for r in data if r['decision'] == 'drop')} dropped, "
              f"{sum(1 for r in data if r['decision'] == 'own')} owned, "
              f"{sum(1 for r in data if r['decision'] == 'keep')} kept.")
        return 0

    for row in data:
        print(f"{row['page']:24s} {row['concept']:50s} core={row['core']:12s} "
              f"lines={row['lines']:3d} secs={len(row['sections']):2d} decide={row['decision']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
