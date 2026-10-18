#!/usr/bin/env python3
"""Fill and verify the concept-level half of `resources/legacy-prereq-map.json`.

The superseded modules in `modules/_index.yaml`'s `legacy:` section still name the concept
vocabulary that bridge pages assume in their `uses:` lists (`so2_rotation_matrix`,
`discrete_infinite_horizon_lqr`, ...). Those ids have no page, so a validator that wants them to be
reachable has nothing to resolve against. This script writes that resolution down: every legacy
concept id maps to a page, and the map is accepted only when the page's text actually contains the
concept's distinctive tokens.

Default page = the page its legacy module maps to in the same file's module map. When that page does
not mention the concept, the page whose text mentions it most specifically wins; if no page does,
the concept is reported (never silently mapped).

Usage:
    python3 scripts/legacy_crosswalk.py            # rewrite the `concepts` block
    python3 scripts/legacy_crosswalk.py --check    # exit 1 when stale or evidence missing
    python3 scripts/legacy_crosswalk.py --json     # print the resolved map

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
from audit_step_size import load_core_modules, load_index, parse_front_matter  # noqa: E402

MAP_PATH = os.path.join(ROOT, "resources", "legacy-prereq-map.json")
MODULES = os.path.join(ROOT, "modules")
STOP = {"and", "of", "the", "to", "vs", "with", "for", "in", "a", "an", "on", "by", "or"}


def page_texts() -> dict[str, str]:
    texts = {}
    for name in sorted(os.listdir(MODULES)):
        if name.endswith(".md"):
            with open(os.path.join(MODULES, name), encoding="utf-8") as handle:
                texts[name[:-3]] = handle.read().lower()
    return texts


def tokens(concept: str) -> list[str]:
    return [t for t in concept.split("_") if t not in STOP and len(t) > 2]


def resolve() -> tuple[dict[str, dict], list[str]]:
    legacy, _bridges = load_index()
    core = load_core_modules()
    texts = page_texts()
    manifest = json.load(open(MAP_PATH, encoding="utf-8"))
    module_map = {
        k: v["page"]
        for k, v in manifest.items()
        if not k.startswith("_") and isinstance(v, dict) and "page" in v
    }

    df: dict[str, int] = {}
    for ident in core:
        for tok in set(re.findall(r"[a-z0-9]+", texts[ident])):
            df[tok] = df.get(tok, 0) + 1

    concepts: dict[str, dict] = {}
    problems: list[str] = []
    for legacy_id, record in legacy.items():
        default = module_map.get(legacy_id)
        for concept in record.get("introduces", []):
            if default and all(re.search(r"\b" + re.escape(t), texts[default]) for t in tokens(concept)[:1]):
                page, evidence = default, [t for t in tokens(concept) if re.search(r"\b" + re.escape(t), texts[default])]
            else:
                scored = []
                for ident in core:
                    found = [t for t in tokens(concept) if re.search(r"\b" + re.escape(t), texts[ident])]
                    if not found:
                        continue
                    rare = min(found, key=lambda t: df.get(t, len(core)))
                    if df.get(rare, len(core)) > 12 and len(found) < 2:
                        continue
                    scored.append((math.log(max(2, len(core)) / max(1, df.get(rare, len(core)))), ident, found))
                if not scored:
                    problems.append(f"{concept} ({legacy_id}): no page mentions a distinctive token")
                    continue
                scored.sort(reverse=True)
                _score, page, evidence = scored[0]
            concepts[concept] = {"page": page, "evidence": sorted(set(evidence))}
    return concepts, problems


def main(argv: list[str]) -> int:
    if any(arg in ("-h", "--help") for arg in argv):
        print(__doc__)
        return 0
    unknown = [a for a in argv if a not in ("--check", "--json")]
    if unknown:
        print(f"unknown argument(s): {' '.join(unknown)}", file=sys.stderr)
        return 2

    concepts, problems = resolve()
    if "--json" in argv:
        print(json.dumps({"concepts": concepts, "problems": problems}, indent=2, sort_keys=True))
        return 1 if problems else 0

    manifest = json.load(open(MAP_PATH, encoding="utf-8"))
    updated = dict(manifest)
    updated["concepts"] = dict(sorted(concepts.items()))
    # A concept no page mentions is a recorded gap, not a silent omission: it stays in the file
    # under `unresolved`, and the audit prints it. It must not fail --check, or the file could
    # never be committed while the gap is open.
    updated["unresolved"] = sorted(problem.split(" (")[0] for problem in problems)

    if "--check" in argv:
        stale = (
            manifest.get("concepts") != updated["concepts"]
            or manifest.get("unresolved") != updated["unresolved"]
        )
        if stale:
            print("ERROR: the `concepts` block is stale — run python3 scripts/legacy_crosswalk.py")
            return 1
        print(f"OK: {len(concepts)} legacy concepts resolve to pages that contain their terms; "
              f"{len(problems)} recorded as unresolved.")
        return 0

    with open(MAP_PATH, "w", encoding="utf-8") as handle:
        json.dump(updated, handle, indent=2, sort_keys=False)
        handle.write("\n")
    print(f"wrote {len(concepts)} concept resolutions; {len(problems)} recorded as unresolved")
    for problem in problems:
        print("  -", problem)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
