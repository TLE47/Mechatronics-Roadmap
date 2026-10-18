#!/usr/bin/env python3
"""Measure how far each Core Tier 2/3 page asks a learner to step, and name the jumps.

"Step size" is not a feeling here; it is read off the page and its neighbours in the route that
`scripts/generate_sim_route.py` declares:

1. `concepts` - the `new_concepts:` entries the page declares (the curriculum's own unit).
2. `bundled` - declared concept ids that join two objects with `_and_` (one entry, two jumps).
3. `notation` - distinct LaTeX commands in the page that **no earlier Core page** used, so it is
   new notation on this page's step, not review.
4. `math_delta` - `difficulty.math` minus the math level of the previous Core page in the same
   track. The first Tier 2 page of a track compares against that track's Tier 1 page.
5. `todos` - the `TODO` holes in the learner scaffold, the amount of code the page demands.
6. `legacy` / `unknown` / `cross` - `prereqs:` ids with no page on disk that exist only in
   `modules/_index.yaml`'s `legacy:` section (a superseded module still cited as required), ids in
   neither place, and prerequisites from another track.

`step` is the weighted content score below; a page is flagged when it sits at or above its tier's
75th percentile **and** at or above the absolute floor, so a short tier cannot flag by rank alone.
A broken prerequisite is reported as a defect on its own, never folded into the difficulty score.

Usage:
    python3 scripts/audit_step_size.py            # rewrite docs/STEP_SIZE_AUDIT.md
    python3 scripts/audit_step_size.py --check    # exit 1 if the document is stale
    python3 scripts/audit_step_size.py --json     # machine-readable rows

Exit codes: `0` clean, `1` stale document, `2` bad command line.
Exit-code family: typed.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "STEP_SIZE_AUDIT.md")
MODULES = os.path.join(ROOT, "modules")
INDEX = os.path.join(MODULES, "_index.yaml")

FLOOR = 8.0
# Weights are a stated opinion, not a measurement: a declared concept costs 2 (the curriculum's own
# unit), a bundled pair 2 more (two jumps sold as one), a first-use notation command 0.5 (many are
# typography), +1 per math level above the previous page, 0.5 per scaffold TODO past five. A broken
# prerequisite is deliberately excluded: it is a defect, not a bigger step.
W = {"concept": 2.0, "bundled": 2.0, "notation": 0.5, "math_delta": 1.0, "todos_over_five": 0.5}


def load_core_modules() -> list[str]:
    spec = importlib.util.spec_from_file_location(
        "generate_sim_route", os.path.join(ROOT, "scripts", "generate_sim_route.py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.CORE_MODULES)


def load_index() -> tuple[dict[str, dict], dict[str, dict]]:
    """`(legacy, bridges)` from modules/_index.yaml, parsed as flat records."""
    legacy: dict[str, dict] = {}
    bridges: dict[str, dict] = {}
    section = None
    current: dict | None = None
    for raw in open(INDEX, encoding="utf-8"):
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            section = line.rstrip(":")
            current = None
            continue
        stripped = line.strip()
        if stripped.startswith("- id:"):
            current = {"id": stripped.split(":", 1)[1].strip(), "title": "", "introduces": []}
            target = legacy if section == "legacy" else bridges
            target[current["id"]] = current
            continue
        if current is None or ":" not in stripped:
            continue
        key, _, value = stripped.partition(":")
        value = value.strip().strip('"')
        if key == "introduces":
            current["introduces"] = re.findall(r"[a-z0-9_]+", value)
        elif key in ("title", "path"):
            current[key] = value
    return legacy, bridges


def taught_concepts() -> dict[str, str]:
    """Every concept id that some bridge page's `new_concepts:` claims to teach, and by whom."""
    taught: dict[str, str] = {}
    for name in os.listdir(MODULES):
        if not name.endswith(".md"):
            continue
        ident = name[:-3]
        fm = parse_front_matter(open(os.path.join(MODULES, name), encoding="utf-8").read())
        for concept in fm["new_concepts"]:
            taught.setdefault(concept, ident)
    return taught


def parse_front_matter(text: str) -> dict:
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    fm: dict = {"prereqs": [], "new_concepts": [], "uses": [], "difficulty": {}}
    if not match:
        return fm
    list_key = None
    for raw in match.group(1).splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip()
        if indent == 0:
            list_key = None
            key, _, value = line.partition(":")
            value = value.split("#")[0].strip().strip('"')
            if not value:
                if key in ("prereqs", "new_concepts", "uses"):
                    list_key = key
                continue
            fm[key] = value
        elif list_key and line.startswith("- "):
            fm[list_key].append(line[2:].strip().strip('"'))
        elif line.startswith("math:"):
            fm["difficulty"]["math"] = line.split(":", 1)[1].split("#")[0].strip()
    return fm


def notation(text: str) -> set[str]:
    return set(re.findall(r"\\[a-zA-Z]+", text))


def todo_count(text: str) -> int:
    return len(re.findall(r"^\s*#?\s*TODO", text, flags=re.MULTILINE))


def audit() -> list[dict]:
    core = load_core_modules()
    legacy, bridges = load_index()
    pages = {name[:-3] for name in os.listdir(MODULES) if name.endswith(".md")}
    taught = taught_concepts()
    rows = []
    seen_notation: set[str] = set()
    previous_by_track: dict[str, int] = {}

    for ident in core:
        text = open(os.path.join(MODULES, ident + ".md"), encoding="utf-8").read()
        fm = parse_front_matter(text)
        track = ident.split(".")[0]
        tier = int(fm.get("tier", "0") or 0)
        math_now = int(fm["difficulty"].get("math", "0") or 0)
        if tier < 2:
            previous_by_track[track] = math_now
            continue

        concepts = fm["new_concepts"]
        bundled = [c for c in concepts if "_and_" in c]
        page_notation = notation(text)
        fresh = sorted(page_notation - seen_notation)
        seen_notation |= page_notation

        prereqs = fm["prereqs"]
        dangling = [p for p in prereqs if p not in pages]
        legacy_ids = [p for p in dangling if p in legacy]
        unknown = [p for p in dangling if p not in legacy]
        cross_track = [p for p in prereqs if p.split(".")[0] != track]
        unowned = [u for u in fm["uses"] if u not in taught and u not in concepts]
        math_delta = math_now - previous_by_track.get(track, math_now)
        todos = todo_count(text)

        step = (
            W["concept"] * len(concepts)
            + W["bundled"] * len(bundled)
            + W["notation"] * len(fresh)
            + W["math_delta"] * max(0, math_delta)
            + W["todos_over_five"] * max(0, todos - 5)
        )
        rows.append({
            "id": ident,
            "title": fm.get("title", ""),
            "track": track,
            "tier": tier,
            "hours": str(fm.get("est_hours", "")),
            "concepts": concepts,
            "bundled": bundled,
            "notation": fresh,
            "math": math_now,
            "math_prev": previous_by_track.get(track),
            "math_delta": math_delta,
            "prereqs": prereqs,
            "uses": fm["uses"],
            "legacy": legacy_ids,
            "unknown": unknown,
            "unowned": unowned,
            "cross_track": cross_track,
            "todos": todos,
            "step": round(step, 1),
        })
        previous_by_track[track] = math_now

    for tier in (2, 3):
        steps = [r["step"] for r in rows if r["tier"] == tier]
        cut = statistics.quantiles(steps, n=4)[2] if len(steps) >= 4 else FLOOR
        for r in rows:
            if r["tier"] == tier:
                r["threshold"] = round(max(FLOOR, cut), 1)
                # Rank flags are relative, so two absolute rules sit beside them: a math level that
                # rises by two (Tier 2's 02-mechanics page, 3 -> 4) is a jump however the tier ranks,
                # and so is a page that hides three objects behind `_and_` ids.
                r["jump"] = (
                    r["step"] >= r["threshold"]
                    or r["math_delta"] >= 2
                    or len(r["bundled"]) >= 3
                )
    return rows


def bridge_rows(rows: list[dict]) -> list[dict]:
    """One row per dangling prerequisite, with how many Core pages require its concepts."""
    legacy, _bridges = load_index()
    taught = taught_concepts()
    out = []
    for r in rows:
        for prereq in r["legacy"]:
            concepts = legacy[prereq].get("introduces", [])
            users = [
                other["id"]
                for other in rows
                if set(other.get("uses", [])) & set(concepts)
            ]
            out.append({
                "page": r["id"],
                "prereq": prereq,
                "legacy_title": legacy[prereq]["title"],
                "concepts": len(concepts),
                "taught": sum(1 for c in concepts if c in taught),
                "used_by": users,
            })
    return out


def render(rows: list[dict]) -> str:
    jumps = sorted([r for r in rows if r["jump"]], key=lambda r: r["step"], reverse=True)
    broken = bridge_rows(rows)
    over_contract = [r for r in rows if len(r["concepts"]) > 2]
    bundled_all = [r for r in rows if r["bundled"]]
    tier2 = [r for r in rows if r["tier"] == 2]
    tier3 = [r for r in rows if r["tier"] == 3]

    lines = [
        "# Step-size audit — the Core Tier 2 and Tier 3 pages",
        "",
        "<!-- Generated by scripts/audit_step_size.py — do not edit by hand.",
        "     `python3 scripts/audit_step_size.py` rewrites this file; `--check` fails when it is stale. -->",
        "",
        f"{len(rows)} pages ({len(tier2)} Tier 2, {len(tier3)} Tier 3) are measured from their own",
        "front matter and text. **No number here is estimated**: concepts, prerequisites and math",
        "levels are the page's declared metadata, notations are counted in the page's LaTeX, and TODOs",
        "are counted in its scaffold.",
        "",
        "```mermaid",
        "flowchart LR",
        '    P["A Core page"] --> C["declared concepts (+ bundled pairs)"]',
        '    P --> N["first-use notation commands"]',
        '    P --> M["math level vs previous page in its track"]',
        '    P --> T["scaffold TODOs past five"]',
        "    C --> S[\"step score\"]",
        "    N --> S",
        "    M --> S",
        "    T --> S",
        '    P --> R["prereqs with no page"]',
        '    R --> B["broken bridge (a defect, not a step)"]',
        "```",
        "",
        "## Method",
        "",
        "| Signal | Read from | Meaning |",
        "| :--- | :--- | :--- |",
        "| `concepts` | `new_concepts:` | the curriculum's own unit of a step |",
        "| `bundled` | those ids containing `_and_` | one bullet that names two objects |",
        "| `notation` | LaTeX commands absent from every earlier Core page | new symbols on this step, not review |",
        "| `math` / `Δ` | `difficulty.math`, against the previous Core page in the track | a rise in mathematical demand |",
        "| `todos` | `TODO` in the page's scaffold | the amount of code the page demands |",
        "| `legacy` / `cross` | `prereqs:` ids with no page; ids from another track | a missing bridge, or a context switch |",
        "",
        f"`step = {W['concept']:g}·concepts + {W['bundled']:g}·bundled + {W['notation']:g}·notation "
        f"+ {W['math_delta']:g}·max(0,Δ) + {W['todos_over_five']:g}·max(0,todos−5)`. A page is **flagged**",
        f"at or above its tier's 75th percentile *and* at or above **{FLOOR:g}**, so the smallest tier",
        "cannot flag on rank alone. The weights are an opinion written in the script; every column is",
        "published so a reader can reweigh them.",
        "",
        "## Tier 2 — 18 pages, threshold "
        f"**{tier2[0]['threshold'] if tier2 else FLOOR:g}**",
        "",
        "| Page | Concepts | Bundled | New notation | Math | Δ | Prereqs | Legacy | Cross | TODOs | Step | Flag |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |",
    ]
    for r in tier2:
        lines.append(
            f"| `{r['id']}` | {len(r['concepts'])} | {len(r['bundled'])} | {len(r['notation'])} | "
            f"{r['math']} | {r['math_delta']:+d} | {len(r['prereqs'])} | {len(r['legacy'])} | "
            f"{len(r['cross_track'])} | {r['todos']} | {r['step']:.1f} | "
            f"{'**JUMP**' if r['jump'] else '—'} |"
        )
    lines += [
        "",
        f"## Tier 3 — {len(tier3)} pages, threshold "
        f"**{tier3[0]['threshold'] if tier3 else FLOOR:g}**",
        "",
        "| Page | Concepts | Bundled | New notation | Math | Δ | Prereqs | Legacy | Cross | TODOs | Step | Flag |",
        "| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- |",
    ]
    for r in tier3:
        lines.append(
            f"| `{r['id']}` | {len(r['concepts'])} | {len(r['bundled'])} | {len(r['notation'])} | "
            f"{r['math']} | {r['math_delta']:+d} | {len(r['prereqs'])} | {len(r['legacy'])} | "
            f"{len(r['cross_track'])} | {r['todos']} | {r['step']:.1f} | "
            f"{'**JUMP**' if r['jump'] else '—'} |"
        )

    lines += ["", f"## The pages that jump ({len(jumps)})", ""]
    for r in jumps:
        reasons = [f"{len(r['concepts'])} declared concepts"]
        if r["bundled"]:
            reasons.append("bundles " + ", ".join(f"`{c}`" for c in r["bundled"]))
        # Names print without their leading backslash: `verify_repo.py` rejects a LaTeX command in
        # markdown prose (inline code included), and the command name is what a reader searches for.
        reasons.append(f"{len(r['notation'])} first-use notation commands"
                       + (f" ({', '.join('`' + n[1:] + '`' for n in r['notation'][:6])}…)"
                          if r["notation"] else ""))
        if r["math_delta"] > 0:
            reasons.append(f"math {r['math_prev']} → {r['math']} (+{r['math_delta']})")
        reasons.append(f"{r['todos']} scaffold TODOs, {r['hours']} h")
        lines += [
            f"### `{r['id']}` — step {r['step']:.1f}",
            "",
            f"**{r['title']}**",
            "",
            "- " + "; ".join(reasons) + ".",
            "- declares: " + ", ".join(f"`{c}`" for c in r["concepts"]) + ".",
            "",
        ]

    lines += [
        f"## Broken bridges ({len(broken)} prerequisite citations to pages that do not exist)",
        "",
        "Each row is a page whose `prereqs:` names a module that exists only in",
        "`modules/_index.yaml`'s `legacy:` section — superseded, with no page on disk. The `taught`",
        "column asks whether any of the 46 bridge pages claims that legacy module's concepts in its own",
        "`new_concepts:`; the `used by` column counts the Core Tier 2/3 pages whose `uses:` names one",
        "of those concepts. A `0/5 taught` with users is the sharpest form of an unbridged jump: a",
        "required idea that no page teaches.",
        "",
        "| Page | Prereq cited | Legacy module | Concepts taught by a bridge | Used by |",
        "| :--- | :--- | :--- | :--- | ---: |",
    ]
    for b in broken:
        lines.append(
            f"| `{b['page']}` | `{b['prereq']}` | {b['legacy_title']} | "
            f"{b['taught']}/{b['concepts']} | {len(b['used_by'])} |"
        )

    unowned_pages = [r for r in rows if r["unowned"]]
    lines += [
        "",
        f"## Assumptions no page teaches ({len(unowned_pages)} pages)",
        "",
        "A `uses:` entry is something the page assumes you can already do. Here it is a concept id that",
        "no bridge page's `new_concepts:` claims and that this page does not introduce either, so the",
        "page relies on an idea with no owning page in the repository.",
        "",
        "| Page | Assumed but unowned |",
        "| :--- | :--- |",
    ]
    for r in unowned_pages:
        lines.append(f"| `{r['id']}` | " + ", ".join(f"`{u}`" for u in r["unowned"]) + " |")

    lines += [
        "",
        f"## The two-idea contract ({len(over_contract)} of {len(rows)} pages over it)",
        "",
        "`docs/QUALITY_SPEC.md` sets at most **two** new ideas per lesson. Every Tier 2 page declares",
        f"**three** `new_concepts`, and {len(bundled_all)} page(s) hide a third object inside one id by",
        "joining two concepts with `_and_`:",
        "",
        "| Page | Declared concepts | Bundled id |",
        "| :--- | ---: | :--- |",
    ]
    for r in over_contract:
        lines.append(
            f"| `{r['id']}` | {len(r['concepts'])} | "
            + (", ".join(f"`{c}`" for c in r["bundled"]) if r["bundled"] else "—")
            + " |"
        )

    lines += [
        "",
        "## What a flag does and does not mean",
        "",
        "- A jump is a **routing** signal, not a defect: it names the page where a learner who stalled",
        "  should be sent to the ramp lesson ([`R.1`](../ramp/R.1-rate-of-change.md) or",
        "  [`R.2`](../ramp/R.2-accumulation.md)) or where the page should be split.",
        "- A broken bridge **is** a defect: the page tells the learner to read something that is not",
        "  there, and the prerequisite may be taught under a different id.",
        "- The threshold is relative by design. The absolute floor stops a small tier from flagging its",
        "  largest page merely for being largest; it does not make a 3-concept page small.",
        "",
    ]
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 if docs/STEP_SIZE_AUDIT.md is stale")
    parser.add_argument("--json", action="store_true", help="print rows as JSON")
    args = parser.parse_args(argv)

    rows = audit()
    if args.json:
        print(json.dumps({"pages": rows, "broken": bridge_rows(rows)}, indent=2))
        return 0
    rendered = render(rows)
    if args.check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != rendered:
            print("ERROR: docs/STEP_SIZE_AUDIT.md is stale — run python3 scripts/audit_step_size.py")
            return 1
        print(f"OK: docs/STEP_SIZE_AUDIT.md is current ({len(rows)} pages, "
              f"{sum(1 for r in rows if r['jump'])} flagged, "
              f"{len(bridge_rows(rows))} broken prerequisites).")
        return 0
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(rendered)
    print(f"wrote {os.path.relpath(OUT, ROOT)} — {len(rows)} pages, "
          f"{sum(1 for r in rows if r['jump'])} flagged, {len(bridge_rows(rows))} broken prerequisites.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
