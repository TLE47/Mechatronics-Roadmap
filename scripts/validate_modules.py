#!/usr/bin/env python3
import pathlib
import re
import sys

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
    for idx_b, py_block in enumerate(re.findall(r"```python\n(.*?)```", body, re.S), 1):
        try:
            exec(py_block, {})
        except Exception as exc:
            bad.append(f"{mid}: python block #{idx_b} failed: {exc}")
    nodes[mid] = {
        "prereqs": fm.get("prereqs", []),
        "introduces": set(fm.get("new_concepts", [])),
        "uses": set(fm.get("uses", [])),
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


def reach(n, seen=None):
    seen = seen or set()
    out = set()
    for p in nodes[n]["prereqs"]:
        if p in nodes and p not in seen:
            seen.add(p)
            out |= nodes[p]["introduces"] | reach(p, seen)
    return out


for m, d in nodes.items():
    if not d["legacy"]:
        for u in d["uses"] - reach(m):
            bad.append(f"{m}: uses '{u}' not introduced by any prereq")
        m_gate = re.search(r"### Gate test.*?(?=^##\s|\Z)", d["body"], re.S | re.M)
        if m_gate:
            gtxt = m_gate.group(0)
            tagged = set(re.findall(r"\[Concept:\s*([^\]]+)\]", gtxt))
            track_tier = ".".join(m.split(".")[:2])
            ladder_concepts = set()
            for k, kd in nodes.items():
                if not kd["legacy"] and k.startswith(track_tier):
                    ladder_concepts |= kd["introduces"]
            for c in sorted(ladder_concepts - tagged):
                bad.append(f"{m}: Gate test missing ladder concept '{c}'")
            for c in sorted(tagged - ladder_concepts):
                bad.append(f"{m}: Gate test tags unknown concept '{c}'")

if bad:
    print("\n".join(bad))
    sys.exit(1)
print(f"OK ({len(nodes)} modules: {sum(1 for d in nodes.values() if d['legacy'])} legacy, {sum(1 for d in nodes.values() if not d['legacy'])} bridge)")
