#!/usr/bin/env python3
import ast
import json
import os
import pathlib
import re
import sys  # noqa: F401  (also used to put the shared plant on `sys.path` below)

try:
    import yaml
    load_yaml = yaml.safe_load
except ImportError:
    def load_yaml(text: str) -> dict:
        lines = [l.rstrip() for l in text.splitlines() if l.strip() and not l.strip().startswith("#")]
        if lines and lines[0].strip() == "legacy:":
            items = []
            cur = None
            for line in lines[1:]:
                s = line.strip()
                if s.startswith("- id:"):
                    if cur:
                        items.append(cur)
                    cur = {"id": s.split(":", 1)[1].strip().strip('"')}
                elif ":" in s and cur is not None:
                    k, v = s.split(":", 1)
                    k, v = k.strip(), v.strip()
                    if v.startswith("[") and v.endswith("]"):
                        inner = v[1:-1].strip()
                        cur[k] = [x.strip().strip('"') for x in inner.split(",") if x.strip()] if inner else []
                    else:
                        cur[k] = v.strip('"')
            if cur:
                items.append(cur)
            return {"legacy": items}
        data = {}
        cur_list = None
        for line in lines:
            if line.startswith("  - ") and cur_list is not None:
                cur_list.append(line[4:].strip().strip('"'))
            elif ":" in line:
                k, v = line.split(":", 1)
                k, v = k.strip(), v.strip()
                if v == "":
                    cur_list = []
                    data[k] = cur_list
                elif v.startswith("[") and v.endswith("]"):
                    inner = v[1:-1].strip()
                    data[k] = [x.strip().strip('"') for x in inner.split(",") if x.strip()] if inner else []
                    cur_list = None
                else:
                    cur_list = None
                    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                        data[k] = v[1:-1]
                    else:
                        try:
                            data[k] = int(v) if "." not in v else float(v)
                        except ValueError:
                            data[k] = v
        return data

ROOT = pathlib.Path("modules")
EXERCISES = pathlib.Path("exercises")
# A module's worked example runs on the shared plant (`import mechalab_plant`), the same arm every
# Tier 2/3 exercise uses. The browser workbench ships that one file into Pyodide and puts `/` on
# `sys.path` before learner code runs, so these scripts put that one directory on the path too and
# a module block needs no path juggling of its own.
PLANT_DIR = pathlib.Path("resources", "plants").resolve()
if PLANT_DIR.is_dir() and str(PLANT_DIR) not in sys.path:
    sys.path.insert(0, str(PLANT_DIR))
ID_RE = re.compile(r"^\d{2}-[a-z0-9-]+\.T[123]\.\d{2}[a-z]?$")
REQ_SECTIONS = [
    ("Why it matters", r"^##\s+.*(?:Why it matters|Why This Matters)"),
    ("Intuition first", r"^##\s+.*(?:Intuition first|Mental Model)"),
    ("Formalization", r"^##\s+.*Formalization"),
    ("Worked example", r"^##\s+.*(?:Worked example|Worked Example)"),
    ("Exercise", r"^##\s+.*Exercise"),
    ("Simulation path", r"^##\s+.*(?:Simulation path|Sim-first path)"),
    ("Checkpoint", r"^##\s+.*(?:Checkpoint|Gate Test)"),
    ("Common mistakes", r"^##\s+.*Common mistakes"),
    ("Resources", r"^##\s+.*Resources"),
    ("Next modules", r"^##\s+.*Next modules"),
]

nodes = {}
bad = []

idx = ROOT / "_index.yaml"
if idx.exists():
    for e in load_yaml(idx.read_text()).get("legacy", []):
        nodes[e["id"]] = {
            "prereqs": e.get("prereqs", []),
            "introduces": set(e.get("introduces", [])),
            "uses": set(),
            "legacy": True,
        }

for p in sorted(ROOT.glob("*.md")):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", p.read_text(), re.S)
    if not m:
        bad.append(f"{p}: missing frontmatter")
        continue
    fm, body = load_yaml(m.group(1)), m.group(2)
    mid = fm["id"]
    if not ID_RE.match(mid):
        bad.append(f"{mid}: bad id")
    if len(fm.get("new_concepts", [])) > 3:
        bad.append(f"{mid}: >3 new_concepts")
    if fm.get("est_hours", 99) > 6:
        bad.append(f"{mid}: >6 est_hours")
    for s_name, s_pat in REQ_SECTIONS:
        if not re.search(s_pat, body, re.M):
            bad.append(f"{mid}: missing section '{s_name}'")
    h2s = re.findall(r"^##\s+(.+)$", body, re.M)
    if len(h2s) != 10:
        bad.append(f"{mid}: expected 10 H2 headings, found {len(h2s)}: {h2s}")
    if fm.get("safety_level", "none") != "none" and not re.search(r"^###\s+Safety notes", body, re.M):
        bad.append(f"{mid}: safety_level={fm.get('safety_level')} missing '### Safety notes'")
    if not re.search(r"^###?\s+.*(?:Skip test|Skip Test)", body, re.M):
        bad.append(f"{mid}: missing section 'Skip test'")
    if not fm.get("resources_verified", False):
        bad.append(f"{mid}: resources_verified is not true")
    # `owns:` names the legacy concepts this page re-teaches (mentions_audit's `own` verdict).
    # It is a third relation, not a synonym for either neighbour: the concept is not assumed
    # (`uses:`) and it is not new material spending the three-concept budget (`new_concepts:`).
    owned = set(fm.get("owns", []))
    for other, label in ((set(fm.get("uses", [])), "uses"), (set(fm.get("new_concepts", [])), "new_concepts")):
        overlap = owned & other
        if overlap:
            bad.append(f"{mid}: concept in both owns and {label}: {sorted(overlap)}")
    if "[UNVERIFIED]" in body or "[verify in-app]" in body:
        bad.append(f"{mid}: contains unverified resource tag ([UNVERIFIED] or [verify in-app])")

    import contextlib
    import io

    py_blocks = re.findall(r"```python\n(.*?)```", body, re.S)
    exp_match = re.search(r"```python\n(.*?)```\s*Expected output:\s*```text\n(.*?)```", body, re.S)
    if not exp_match:
        bad.append(f"{mid}: missing 'Expected output:' block after worked example")

    for idx_b, py_block in enumerate(py_blocks, 1):
        buf = io.StringIO()
        try:
            with contextlib.redirect_stdout(buf):
                exec(py_block, {})
        except Exception as exc:
            bad.append(f"{mid}: python block #{idx_b} failed: {exc}")
            continue
        if idx_b == 1 and exp_match:
            got_out = buf.getvalue().strip()
            exp_out = exp_match.group(2).strip()
            if got_out != exp_out:
                bad.append(f"{mid}: Expected output mismatch:\n  expected: {exp_out}\n  actual:   {got_out}")

    # The page's scaffold and its test count are claims about the package, and both drift when the
    # package changes and the page is not edited with it. Dogfooding 08-capstones.T3.07a found a
    # Starter block listing 6 of its 9 holes and a "38 tests" claim against a 42-test suite.
    starter_match = re.search(r"### Starter code.*?```python\n(.*?)```", body, re.S)
    starter_path = EXERCISES / mid / "starter.py"
    if starter_match and os.path.isfile(starter_path):
        page_fns = [n.name for n in ast.parse(starter_match.group(1)).body
                    if isinstance(n, ast.FunctionDef)]
        with open(starter_path, "r", encoding="utf-8") as handle:
            package_fns = [n.name for n in ast.parse(handle.read()).body
                           if isinstance(n, ast.FunctionDef)]
        if page_fns != package_fns:
            bad.append(f"{mid}: page Starter code defines {page_fns}, starter.py defines {package_fns}")
        manifest_path = EXERCISES / mid / "exercise.json"
        count_match = re.search(r"\*\*(\d+) tests\.\*\*", body)
        if count_match and os.path.isfile(manifest_path):
            manifest = json.load(open(manifest_path, encoding="utf-8"))
            total = 0
            for name in manifest.get("checks", {}).values():
                test_path = os.path.join(os.path.dirname(manifest_path), name)
                if os.path.isfile(test_path):
                    with open(test_path, "r", encoding="utf-8") as handle:
                        total += len(re.findall(r"^    def test_", handle.read(), re.M))
            if int(count_match.group(1)) != total:
                bad.append(f"{mid}: page claims {count_match.group(1)} tests, the suite has {total}")

    nodes[mid] = {
        "prereqs": fm.get("prereqs", []),
        "introduces": set(fm.get("new_concepts", [])),
        "uses": set(fm.get("uses", [])),
        "owns": set(fm.get("owns", [])),
        "legacy": False,
        "body": body,
    }

for m, d in nodes.items():
    for p in d["prereqs"]:
        if p not in nodes:
            bad.append(f"{m}: missing prereq {p}")

visiting, visited = set(), set()


def dfs(n):
    if n in visiting:
        bad.append(f"cycle at {n}")
        return
    if n in visited or n not in nodes:
        return
    visiting.add(n)
    for p in nodes[n]["prereqs"]:
        dfs(p)
    visiting.remove(n)
    visited.add(n)


for n in nodes:
    dfs(n)


# A superseded concept id can still be named in a `uses:` list: `resources/legacy-prereq-map.json`
# keeps that vocabulary as a crosswalk, and records the real page that teaches each id. Without this,
# the old check passed only because `modules/_index.yaml`'s legacy entries were treated as modules
# with no page behind them. `scripts/legacy_crosswalk.py --check` proves every evidence term appears
# in the mapped page, so this source of reachability is checked, not merely declared.
CROSSWALK_PATH = pathlib.Path("resources") / "legacy-prereq-map.json"
EXTRA_CONCEPTS: dict[str, set[str]] = {}
CROSSWALK_CONCEPTS: dict[str, str] = {}
if CROSSWALK_PATH.is_file():
    with open(CROSSWALK_PATH, encoding="utf-8") as handle:
        for concept_id, record in json.load(handle).get("concepts", {}).items():
            if record.get("page"):
                EXTRA_CONCEPTS.setdefault(record["page"], set()).add(concept_id)
                CROSSWALK_CONCEPTS[concept_id] = record["page"]


def reach(n, seen=None):
    seen = seen or set()
    out = set()
    for p in nodes[n]["prereqs"]:
        if p in nodes and p not in seen:
            seen.add(p)
            out |= nodes[p]["introduces"] | EXTRA_CONCEPTS.get(p, set()) | reach(p, seen)
    return out


ladders = set()
for m, d in nodes.items():
    if not d["legacy"]:
        track_tier = ".".join(m.split(".")[:2])
        ladders.add(track_tier)
        for u in d["uses"] - reach(m):
            # A superseded concept id is taught somewhere in the bridge rewrite, and the crosswalk
            # names that page with verified evidence terms; it is not on this module's prereq chain,
            # because the whole legacy track it belonged to was replaced by a different page order.
            if u in CROSSWALK_CONCEPTS:
                continue
            bad.append(f"{m}: uses '{u}' not introduced by any prereq")
        m_gate = re.search(r"### Gate test.*?(?=^##\s|\Z)", d["body"], re.S | re.M)
        if m_gate:
            gtxt = m_gate.group(0)
            tagged = set(re.findall(r"\[Concept:\s*([^\]]+)\]", gtxt))
            ladder_concepts = set()
            for k, kd in nodes.items():
                if not kd["legacy"] and k.startswith(track_tier):
                    ladder_concepts |= kd["introduces"] | kd.get("owns", set())
            for c in sorted(ladder_concepts - tagged):
                bad.append(f"{m}: Gate test missing ladder concept '{c}'")
            for c in sorted(tagged - ladder_concepts):
                bad.append(f"{m}: Gate test tags unknown concept '{c}'")

legacy_cnt = sum(1 for d in nodes.values() if d["legacy"])
bridge_cnt = sum(1 for d in nodes.values() if not d["legacy"])
t1_bridge_cnt = sum(1 for m, d in nodes.items() if not d["legacy"] and ".T1." in m)

lesson_dirs = [
    ("track-p", "P.*.md"),
    ("stage-0", "S0.*.md"),
    ("00-foundations", "00.*.md"),
    ("01-electronics-and-power", "01.*.md"),
    ("02-mechanics-kinematics-dynamics", "02.*.md"),
    ("03-sensors-and-actuators", "03.*.md"),
    ("04-embedded-and-realtime", "04.*.md"),
    ("05-control-and-estimation", "05.*.md"),
    ("06-robotics-and-autonomy", "06.*.md"),
    ("07-systems-hil-and-production", "07.*.md"),
    ("08-capstone-projects", "08.*.md"),
]
lesson_cnt = sum(len(list(pathlib.Path(d).glob(pat))) for d, pat in lesson_dirs)

readme_path = pathlib.Path("README.md")
if readme_path.exists():
    rtxt = readme_path.read_text(encoding="utf-8")
    expected_summary = (
        f"**{len(nodes)} formal modules** (**{legacy_cnt} legacy** modules and "
        f"**{bridge_cnt} bridge** modules across **{len(ladders)} ladders**"
    )
    if expected_summary not in rtxt:
        bad.append(
            f"README.md: module count summary out of sync with _index.yaml (expected '{expected_summary}')"
        )
    if f"{t1_bridge_cnt} Tier 1 Bridge Modules" not in rtxt:
        bad.append(
            f"README.md: Tier 1 bridge count out of sync (expected '{t1_bridge_cnt} Tier 1 Bridge Modules')"
        )
    if f"+ {t1_bridge_cnt} Bridge Modules" not in rtxt:
        bad.append(
            f"README.md: Mermaid diagram bridge count out of sync (expected '+ {t1_bridge_cnt} Bridge Modules')"
        )
    if f"**{lesson_cnt} beginner lessons**" not in rtxt or f"**{lesson_cnt} beginner-first lessons**" not in rtxt:
        bad.append(
            f"README.md: beginner lesson count out of sync (expected {lesson_cnt} beginner lessons)"
        )
    if "Unmeasured target:" not in rtxt or "untimed" in rtxt.lower():
        bad.append("README.md: must use 'Unmeasured target:' labels and not 'untimed'")

link_wf_path = pathlib.Path(".github/workflows/link-check.yml")
if link_wf_path.exists():
    lwtxt = link_wf_path.read_text(encoding="utf-8")
    if f"Lint all {lesson_cnt} beginner lessons" not in lwtxt:
        bad.append(
            f".github/workflows/link-check.yml: lesson count out of sync (expected 'Lint all {lesson_cnt} beginner lessons')"
        )
    if "generate_python_lessons_data.py --check" not in lwtxt:
        bad.append(
            ".github/workflows/link-check.yml: missing 'generate_python_lessons_data.py --check' step"
        )

changelog_path = pathlib.Path("CHANGELOG.md")
issue_tmpl_dir = pathlib.Path(".github/ISSUE_TEMPLATE")
if changelog_path.exists() and readme_path.exists() and issue_tmpl_dir.is_dir():
    ctxt = changelog_path.read_text(encoding="utf-8")
    readme_kb = round(readme_path.stat().st_size / 1000)
    expected_kb_str = f"111 KB $\\to$ {readme_kb} KB"
    if expected_kb_str not in ctxt:
        bad.append(
            f"CHANGELOG.md: README size out of sync (expected '{expected_kb_str}')"
        )
    tmpl_files = sorted(p.name for p in issue_tmpl_dir.iterdir() if p.is_file())
    for tf in tmpl_files:
        if tf not in ctxt:
            bad.append(f"CHANGELOG.md: missing issue template '{tf}' from .github/ISSUE_TEMPLATE/")

gitignore_path = pathlib.Path(".gitignore")
if gitignore_path.exists():
    gitxt = gitignore_path.read_text(encoding="utf-8")
    if ".aistudio/" not in gitxt:
        bad.append(".gitignore: missing '.aistudio/' exclusion")

for p in sorted(ROOT.glob("*.md")):
    if "fbswiki.org" in p.read_text(encoding="utf-8"):
        bad.append(f"{p}: contains stale 'fbswiki.org' reference (use 'fbsbook.org' consistently)")

for script_rel in (
    "scripts/lint_lessons.py",
    "scripts/density_report.py",
    "scripts/check_term_order.py",
    "tests/test_exercises.py",
):
    sp = pathlib.Path(script_rel)
    if sp.exists():
        stxt = sp.read_text(encoding="utf-8")
        if f"all {lesson_cnt} beginner lessons" not in stxt:
            bad.append(
                f"{script_rel}: docstring lesson count out of sync (expected 'all {lesson_cnt} beginner lessons')"
            )
        if "35 beginner" in stxt or "23 Python" in stxt:
            bad.append(f"{script_rel}: contains stale '35 beginner' or '23 Python' count")

ci_wf_path = pathlib.Path(".github/workflows/ci.yml")
if ci_wf_path.exists():
    citxt = ci_wf_path.read_text(encoding="utf-8")
    if "test:smoke" not in citxt:
        bad.append(".github/workflows/ci.yml: missing 'npm run test:smoke' UI smoke test step")

if bad:
    print("\n".join(bad))
    sys.exit(1)

print(
    f"OK ({len(nodes)} modules: {legacy_cnt} legacy, {bridge_cnt} bridge [{t1_bridge_cnt} Tier 1] across {len(ladders)} ladders; "
    f"{lesson_cnt} beginner lessons; all {bridge_cnt} Expected output blocks & script docstrings verified)"
)

