#!/usr/bin/env python3
"""Generate the authored learning-resource registry from the lesson Markdown.

The lesson pages already carry a `Primary resource` / `Alternative resource` block under each idea:
what to read or complete, what to skip, and the one takeaway. The reader shows that prose, but the
run sheet had no structured copy of it, so a resource could not be presented as a guide without
scraping the rendered page. This script turns those blocks into one generated registry:

    app/public/learning-resources.json      the per-lesson records the reader fetches on demand
    app/src/data/learningResourceIndex.ts   the small id -> count map the reader imports

The Markdown remains authoritative. The registry is deterministic, checked into the repository, and
`--check` fails when either output would change. It never fetches a URL: framing compatibility is a
separate, cached probe (`scripts/verify_resource_embeds.py`), and the policy in
`app/src/data/learningResourceProviders.json` turns that evidence into a presentation. An unknown
host remains an external link; the document keeps `COEP: require-corp` for `SharedArrayBuffer`.

Usage
    python3 scripts/generate_learning_resources.py            # write both files
    python3 scripts/generate_learning_resources.py --check    # exit 1 when stale
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
import sys
from urllib.parse import urldefrag, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, "app", "public", "learning-resources.json")
OUT_INDEX = os.path.join(ROOT, "app", "src", "data", "learningResourceIndex.ts")
PROVIDER_POLICY = os.path.join(ROOT, "app", "src", "data", "learningResourceProviders.json")
EMBED_REPORT = os.path.join(ROOT, "docs", "learning-resources-embeds.json")
SNAPSHOT_DIR = os.path.join(ROOT, "app", "public", "learning-resource-snapshots")
SNAPSHOT_PATH_PREFIX = "learning-resource-snapshots"

# The same page set the link checker treats as the curriculum. READMEs and reference tables are
# deliberately out of scope: they are citation lists, not the lesson resource blocks this registry
# models.
LESSON_GLOBS = (
    "track-p/P.*.md",
    "stage-0/S0.*.md",
    "00-foundations/00.*.md",
    "01-electronics-and-power/01.*.md",
    "02-mechanics-kinematics-dynamics/02.*.md",
    "03-sensors-and-actuators/03.*.md",
    "04-embedded-and-realtime/04.*.md",
    "05-control-and-estimation/05.*.md",
    "06-robotics-and-autonomy/06.*.md",
    "07-systems-hil-and-production/07.*.md",
    "08-capstone-projects/08.*.md",
    "modules/*.md",
)

RESOURCE_LINE = re.compile(r"^\s*[-*]\s+\*\*(Primary|Alternative) resource:\*\*", re.I | re.M)
IDEA_LINE = re.compile(r"^###\s+Idea\s+(\d+)\s*:\s*(.+?)\s*$")
HEADING_LINE = re.compile(r"^#{1,6}\s+")
CHILD_LINE = re.compile(
    r"^\s{2,}[-*]\s+\*\*(What to (?:read|complete)|What to skip|Key takeaway):\*\*\s*(.*)$",
    re.I,
)
# The Markdown annotations are provenance for the link checker, not part of the guide a learner
# reads. Removing them here keeps the generated text clean without editing the authored pages.
ANNOTATION = re.compile(r"`\[(?:HTTP\s+\d{3}[^`]*|verify in-app)\]`", re.I)

# Friendly names for the small resource surface. An unknown host is still rendered by its host name;
# it is never an embed decision. The allowlist for anything richer than an outbound link lives in the
# app, not here.
# Display names are only a fallback for a host the policy has not named. Presentation decisions and
# provider metadata come from the explicit allowlist in the app's data directory; an unknown host is
# rendered by its host name and is always external-only.
PROVIDERS = {
    "futurecoder.io": "futurecoder",
    "cs50.harvard.edu": "Harvard CS50P",
    "docs.python.org": "Python docs",
    "learn.sparkfun.com": "SparkFun",
    "en.wikipedia.org": "Wikipedia",
    "www.physicsclassroom.com": "The Physics Classroom",
    "www.mathsisfun.com": "MathsIsFun",
    "hyperphysics.phy-astr.gsu.edu": "HyperPhysics",
    "docs.wokwi.com": "Wokwi docs",
    "phet.colorado.edu": "PhET",
    "www.falstad.com": "Falstad",
    "hades.mech.northwestern.edu": "Modern Robotics",
    "www.dynapar.com": "Dynapar",
    "www.myphysicslab.com": "MyPhysicsLab",
    "www.fbsbook.org": "Feedback Systems",
    "betterexplained.com": "Better Explained",
}


def _load_policy() -> tuple[list[dict], dict[str, dict]]:
    with open(PROVIDER_POLICY, encoding="utf-8") as handle:
        policy = json.load(handle)
    by_host: dict[str, dict] = {}
    for provider in policy.get("providers", []):
        for host in provider.get("hosts", []):
            by_host[host.lower()] = provider
    return policy.get("providers", []), by_host


def _load_embed_report() -> dict[str, dict]:
    if not os.path.exists(EMBED_REPORT):
        return {}
    with open(EMBED_REPORT, encoding="utf-8") as handle:
        report = json.load(handle)
    hosts = report.get("hosts", {})
    return hosts if isinstance(hosts, dict) else {}


def policy_for(url: str, by_host: dict[str, dict]) -> dict | None:
    host = urlparse(url).netloc.lower()
    return by_host.get(host) or by_host.get(host.removeprefix("www.")) or by_host.get(f"www.{host}")


def embed_for(url: str, embeds: dict[str, dict]) -> dict:
    host = urlparse(url).netloc.lower()
    entry = embeds.get(host) or embeds.get(host.removeprefix("www.")) or embeds.get(f"www.{host}")
    if not entry:
        return {
            "status": "unknown",
            "method": None,
            "evidence": "this host is not in the build-time embed report",
            "checkedAt": "",
        }
    status = entry.get("status")
    method = entry.get("method")
    return {
        "status": status if status in {"embeddable", "blocked", "unknown"} else "unknown",
        "method": method if method in {"corp", "credentialless"} else None,
        "evidence": str(entry.get("evidence") or ""),
        "checkedAt": str(entry.get("checkedAt") or ""),
    }


def snapshot_for(record: dict) -> dict | None:
    """Attach the checked-in snapshot only when its facts still match this authored record.

    A licence-cleared resource without a snapshot is a build error rather than a silent downgrade:
    the user asked for Reader Mode on every source that permits it, and a missing file is how that
    promise would quietly become a link. Non-allowed resources never receive a snapshot path, even if
    a stray file exists. The reader itself validates the block shape again at fetch time.
    """
    license_record = record.get("license")
    if record.get("kind") != "external" or not license_record or license_record.get("reuse") != "allowed":
        return None
    key = str(record.get("resourceKey") or "")
    if not re.fullmatch(r"[0-9a-f]{10}", key):
        raise ValueError(f"{record.get('id')}: invalid resourceKey for a snapshot")
    path = os.path.join(SNAPSHOT_DIR, f"{key}.json")
    if not os.path.exists(path):
        raise ValueError(
            f"{record.get('url')}: licence-cleared resource has no snapshot; run "
            "node scripts/build_learning_resource_snapshots.mjs"
        )
    with open(path, encoding="utf-8") as handle:
        snapshot = json.load(handle)
    if snapshot.get("version") != 1:
        raise ValueError(f"{os.path.relpath(path, ROOT)}: unsupported snapshot version")
    if urldefrag(str(snapshot.get("sourceUrl") or ""))[0] != urldefrag(str(record["url"]))[0]:
        raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot source URL does not match the authored URL")
    if snapshot.get("license") != license_record:
        raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot licence does not match the provider policy")
    blocks = snapshot.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot has no readable blocks")
    for block in blocks:
        if not isinstance(block, dict) or block.get("kind") not in {
            "heading",
            "paragraph",
            "list",
            "code",
            "quote",
        }:
            raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot has an unknown block")
        if block["kind"] == "heading":
            if block.get("level") not in {1, 2, 3, 4} or not isinstance(block.get("text"), str):
                raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot has an invalid heading")
        elif block["kind"] == "list":
            items = block.get("items")
            if not isinstance(items, list) or not items or not all(isinstance(item, str) for item in items):
                raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot has an invalid list")
        elif not isinstance(block.get("text"), str):
            raise ValueError(f"{os.path.relpath(path, ROOT)}: snapshot has an invalid text block")
    return {"path": f"{SNAPSHOT_PATH_PREFIX}/{key}.json"}


def lesson_files() -> list[str]:
    found: list[str] = []
    for pattern in LESSON_GLOBS:
        found.extend(glob.glob(os.path.join(ROOT, pattern)))
    return sorted(set(found))


def front_matter(text: str) -> str:
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    return text[3:end] if end != -1 else ""


def field(text: str, key: str) -> str:
    match = re.search(rf'^{re.escape(key)}:\s*["\']?([^"\'\n]+)["\']?\s*$', text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def page_title(text: str, relative: str) -> str:
    front = front_matter(text)
    return field(front, "title") or next(
        (line.lstrip("#").strip() for line in text.splitlines() if line.startswith("# ")),
        os.path.basename(relative),
    )


def page_id(text: str, relative: str) -> str:
    front = front_matter(text)
    return field(front, "lesson_id") or field(front, "module_id") or os.path.splitext(os.path.basename(relative))[0]


def markdown_links(line: str) -> list[tuple[str, str, int, int]]:
    """Every `[title](url)` on one line, tolerating nested brackets and parentheses.

    The corpus has a link whose title contains `[0, 1]`; a non-greedy `\\[[^]]+\\]` regex drops it.
    Scanning balanced brackets is small and keeps that resource visible instead of silently losing
    it from the registry.
    """
    links: list[tuple[str, str, int, int]] = []
    cursor = 0
    while cursor < len(line):
        start = line.find("[", cursor)
        if start == -1:
            break
        depth = 0
        close = start
        while close < len(line):
            if line[close] == "[":
                depth += 1
            elif line[close] == "]":
                depth -= 1
                if depth == 0:
                    break
            close += 1
        if close >= len(line) or close + 1 >= len(line) or line[close + 1] != "(":
            cursor = start + 1
            continue
        end = close + 2
        parens = 0
        while end < len(line):
            if line[end] == "(":
                parens += 1
            elif line[end] == ")":
                if parens == 0:
                    break
                parens -= 1
            end += 1
        if end >= len(line):
            cursor = start + 1
            continue
        links.append((line[start + 1 : close].strip(), line[close + 2 : end].strip(), start, end + 1))
        cursor = end + 1
    return links


def clean(text: str) -> str:
    text = ANNOTATION.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    # An annotation removed from the end of a sentence leaves a space before the full stop.
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)
    return text.strip("—–-:;, ")


def bold_terms(text: str) -> list[str]:
    terms: list[str] = []
    for raw in re.findall(r"\*\*(.+?)\*\*", text):
        term = clean(raw.replace("`", ""))
        if term and term not in terms:
            terms.append(term)
    return terms


def guide_after(lines: list[str], resource_index: int, inline: str) -> dict[str, str]:
    """The child bullets under one resource line, plus its inline instruction.

    `What to complete` is the same field as `What to read`; the pages use both spellings. A guide
    that is inline on the resource line (CS50P Idea 1's alternative) is kept as the read instruction
    rather than dropped because it has no child bullet.
    """
    guide = {"read": "", "skip": "", "takeaway": ""}
    current: str | None = None
    index = resource_index + 1
    while index < len(lines):
        raw = lines[index]
        if not raw.strip():
            # A blank line is allowed only when the next non-blank line is still a child bullet;
            # otherwise the block has ended and a later section's bullets are not this guide.
            look = index + 1
            while look < len(lines) and not lines[look].strip():
                look += 1
            if look < len(lines) and CHILD_LINE.match(lines[look]):
                index += 1
                continue
            break
        if RESOURCE_LINE.match(raw) or HEADING_LINE.match(raw):
            break
        if not raw.startswith((" ", "\t")):
            break
        child = CHILD_LINE.match(raw)
        if child:
            label = child.group(1).lower()
            current = "read" if label in ("what to read", "what to complete") else (
                "skip" if label == "what to skip" else "takeaway"
            )
            text = child.group(2).strip()
            guide[current] = f"{guide[current]} {text}".strip()
            index += 1
            continue
        if current and raw.strip().startswith(("-", "*")):
            # A sibling bullet that is not one of the three named guide fields. It may be authored
            # prose, but it is not a field this schema knows how to render; stop rather than fold it
            # into the previous answer.
            break
        if current:
            guide[current] = f"{guide[current]} {raw.strip()}".strip()
        index += 1

    if inline:
        guide["read"] = f"{guide['read']} {inline}".strip() if guide["read"] else inline
    for key in guide:
        guide[key] = clean(guide[key])
    return guide


def provider_for(url: str) -> str:
    raw_host = urlparse(url).netloc.lower()
    host = raw_host.removeprefix("www.")
    return PROVIDERS.get(raw_host) or PROVIDERS.get(host) or host


def resource_id(lesson_id: str, role: str, url: str, used: set[str]) -> str:
    normalized = urldefrag(url)[0] if url.startswith(("http://", "https://")) else url
    digest = hashlib.sha1(f"{role}|{normalized}".encode("utf-8")).hexdigest()[:10]
    base = f"{lesson_id}:{digest}"
    if base not in used:
        used.add(base)
        return base
    suffix = 2
    while f"{base}-{suffix}" in used:
        suffix += 1
    value = f"{base}-{suffix}"
    used.add(value)
    return value


def build_registry() -> dict:
    records: list[dict] = []
    generated_from: list[str] = []
    grouped: dict[str, dict] = {}
    errors: list[str] = []
    used_ids: set[str] = set()
    _, providers_by_host = _load_policy()
    embeds = _load_embed_report()

    for path in lesson_files():
        relative = os.path.relpath(path, ROOT)
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        if not RESOURCE_LINE.search(text):
            continue
        lines = text.splitlines()
        lesson_id = page_id(text, relative)
        title = page_title(text, relative)
        idea = {"number": None, "title": "Resources"}
        lesson_has_resource = False
        lesson_group = grouped.setdefault(
            lesson_id, {"id": lesson_id, "title": title, "path": relative, "resources": []}
        )

        for index, line in enumerate(lines):
            idea_match = IDEA_LINE.match(line.strip())
            if idea_match:
                idea = {"number": int(idea_match.group(1)), "title": idea_match.group(2).strip()}
                continue
            resource = RESOURCE_LINE.match(line)
            if not resource:
                continue
            lesson_has_resource = True
            role = resource.group(1).lower()
            links = markdown_links(line)
            if not links:
                errors.append(f"{relative}:{index + 1}: resource line has no Markdown link")
                continue
            for link_index, (link_title, url, _start, end) in enumerate(links):
                next_start = links[link_index + 1][2] if link_index + 1 < len(links) else len(line)
                inline = clean(line[end:next_start])
                guide = guide_after(lines, index, inline)
                external = url.startswith(("http://", "https://"))
                provider = policy_for(url, providers_by_host) if external else None
                normalized_url = urldefrag(url)[0] if external else url
                record = {
                    "id": resource_id(lesson_id, role, url, used_ids),
                    "resourceKey": hashlib.sha1(normalized_url.encode("utf-8")).hexdigest()[:10],
                    "role": role,
                    "idea": dict(idea),
                    "title": link_title or provider_for(url) if external else link_title or "MechaLab resource",
                    "url": url,
                    "provider": (
                        str(provider.get("publisher"))
                        if provider and provider.get("publisher")
                        else provider_for(url)
                        if external
                        else "MechaLab"
                    ),
                    "providerKey": str(provider.get("key")) if provider else ("unknown" if external else "mechalab"),
                    "kind": "external" if external else "local",
                    "resourceKind": (
                        str(provider.get("kind"))
                        if provider and provider.get("kind")
                        else "article"
                        if external
                        else "local"
                    ),
                    "attribution": {
                        "publisher": (
                            str(provider.get("publisher"))
                            if provider and provider.get("publisher")
                            else provider_for(url)
                            if external
                            else "MechaLab"
                        ),
                        "originalUrl": url,
                    },
                    "embed": embed_for(url, embeds) if external else {
                        "status": "unknown",
                        "method": None,
                        "evidence": "a local link is not an external embed",
                        "checkedAt": "",
                    },
                    "license": provider.get("license") if provider else None,
                    "presentation": "auto",
                    "headings": bold_terms(guide["read"]),
                    "guide": guide,
                    "sourceLine": index + 1,
                    "verification": (
                        "verify-in-app"
                        if "`[verify in-app]`" in line
                        else "http-200"
                        if "`[HTTP" in line
                        else "unverified"
                    ),
                }
                snapshot = snapshot_for(record)
                if snapshot:
                    record["snapshot"] = snapshot
                records.append(record)
                lesson_group["resources"].append(record)
        if lesson_has_resource:
            generated_from.append(relative)

    if errors:
        raise ValueError("\n".join(errors))

    external_count = sum(1 for record in records if record["kind"] == "external")
    local_count = len(records) - external_count
    line_count = 0
    for path in lesson_files():
        with open(path, encoding="utf-8") as handle:
            line_count += sum(1 for line in handle if RESOURCE_LINE.match(line))

    lessons = {
        key: grouped[key]
        for key in sorted(grouped)
    }
    snapshot_count = sum(1 for record in records if record.get("snapshot"))
    return {
        "version": 2,
        "generatedFrom": sorted(set(generated_from)),
        "lessonCount": len(lessons),
        "lineCount": line_count,
        "resourceCount": external_count,
        "localResourceCount": local_count,
        "snapshotCount": snapshot_count,
        "lessons": lessons,
    }


def render_index(registry: dict) -> str:
    counts = {
        key: len(group["resources"])
        for key, group in registry["lessons"].items()
        if group["resources"]
    }
    body = json.dumps(counts, indent=2, ensure_ascii=False)
    return (
        "// Auto-generated by scripts/generate_learning_resources.py — do not edit manually\n"
        "/** How many authored resource guides each lesson has; the reader uses it to show the entry point. */\n"
        "export const LEARNING_RESOURCE_COUNTS: Record<string, number> = "
        f"{body};\n"
    )


def render_registry(registry: dict) -> str:
    return json.dumps(registry, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the lesson learning-resource registry.")
    parser.add_argument("--check", action="store_true", help="fail when either generated file is stale")
    parser.add_argument("--stats", action="store_true", help="print counts and write nothing")
    args = parser.parse_args()

    try:
        registry = build_registry()
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if args.stats:
        print(
            f"{registry['lessonCount']} lessons, {registry['lineCount']} resource lines, "
            f"{registry['resourceCount']} external resources, {registry['localResourceCount']} local links, "
            f"{registry['snapshotCount']} reader snapshots"
        )
        return 0

    outputs = ((OUT_JSON, render_registry(registry)), (OUT_INDEX, render_index(registry)))
    stale = False
    for path, content in outputs:
        if args.check:
            try:
                with open(path, encoding="utf-8") as handle:
                    current = handle.read()
            except FileNotFoundError:
                current = ""
            if current != content:
                stale = True
                print(f"stale: {os.path.relpath(path, ROOT)}", file=sys.stderr)
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)
        print(f"wrote {os.path.relpath(path, ROOT)}")

    if stale:
        print("Run: python3 scripts/generate_learning_resources.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
