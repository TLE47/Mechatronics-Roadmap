#!/usr/bin/env python3
"""
Automated Link, Relative-Path & Static-Page Heading Checker (`scripts/check_links.py`)

1. Scans all beginner-path markdown files (`README.md`, `PLAN-batch-1.md`, `track-p/`, `stage-0/`,
   `00-foundations/`, `01-electronics-and-power/`, `02-mechanics-kinematics-dynamics/`,
   `resources/glossary.md`, `resources/safety.md`, `resources/troubleshooting.md`).
2. Verifies that every relative file link resolves to an existing file on disk.
3. Checks every unique `http://` and `https://` URL using an HTTP GET request and records its HTTP status
   and `<title>`.
4. Distinguishes **Static HTML pages** (SparkFun, Physics Classroom, CS50 Notes, MathsIsFun, HyperPhysics,
   Wikipedia, Wokwi Docs, Python Docs, Electronics-Tutorials, BetterExplained, MyPhysicsLab) from
   **Interactive Browser SPAs / Simulators** (`futurecoder.io`, `falstad.com`, `phet.colorado.edu`,
   `wokwi.com/projects/...`).
5. For every lesson's `Primary resource`, `What to read`, and `Alternative resource` bullets (including
   both parent `Primary resource` -> child `What to read` bullets and multi-URL bullets segmented per URL),
   extracts the cited section headings (`**`Heading`**`) and verifies that every static-page heading
   actually appears in the fetched HTML body!
6. Writes a complete verification table (including per-URL heading verification results) to `LINK_REPORT.md`
   when `--write-report` is passed.
"""

import argparse
import glob
import html
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LESSON_GLOBS = [
    os.path.join(ROOT, "track-p", "P.*.md"),
    os.path.join(ROOT, "stage-0", "S0.*.md"),
    os.path.join(ROOT, "00-foundations", "00.*.md"),
    os.path.join(ROOT, "01-electronics-and-power", "01.*.md"),
    os.path.join(ROOT, "02-mechanics-kinematics-dynamics", "02.*.md"),
]

SPA_APP_PATTERNS = (
    "https://futurecoder.io",
    "https://www.falstad.com",
    "https://phet.colorado.edu",
    "https://wokwi.com/projects/",
)


def is_spa_url(url: str) -> bool:
    return any(url.startswith(p) for p in SPA_APP_PATTERNS)


def get_target_markdown_files() -> list[str]:
    files = [
        os.path.join(ROOT, "README.md"),
        os.path.join(ROOT, "PLAN-batch-1.md"),
        os.path.join(ROOT, "track-p", "README.md"),
        os.path.join(ROOT, "stage-0", "README.md"),
        os.path.join(ROOT, "resources", "glossary.md"),
        os.path.join(ROOT, "resources", "safety.md"),
        os.path.join(ROOT, "resources", "troubleshooting.md"),
    ]
    for pattern in LESSON_GLOBS:
        files.extend(sorted(glob.glob(pattern)))
    return [f for f in files if os.path.exists(f)]


def normalize_text(s: str) -> str:
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("—", "-").replace("–", "-").replace("\u00a0", " ")
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


def fetch_url_info(url: str, timeout: int = 12) -> tuple[bool, int | str, str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            raw_bytes = resp.read(1_500_000)
            body = raw_bytes.decode("utf-8", errors="ignore")
            title_m = re.search(r"<title[^>]*>(.*?)</title>", body, flags=re.IGNORECASE | re.DOTALL)
            title = html.unescape(re.sub(r"\s+", " ", title_m.group(1)).strip()) if title_m else ""
            return (200 <= status < 400), status, title[:80], normalize_text(body)
    except urllib.error.HTTPError as e:
        return False, e.code, "", ""
    except Exception as e:
        return False, str(e), "", ""


def extract_quoted_headings_from_segment(segment: str) -> list[str]:
    """
    Extracts exact section/heading names formatted as **`Heading Name`** from a text segment,
    ignoring anything after `(skip ...)` or `Skip ...`.
    """
    seg_before_skip = re.split(r"\(\s*skip\b|\bskip\b", segment, flags=re.IGNORECASE)[0]
    matches = re.findall(r"\*\*`([^`]+)`\*\*", seg_before_skip)
    cleaned = []
    for m in matches:
        if m.startswith(("http", "falstad/", "stage-0/", "track-p/", "01.", "S0.", "P.")):
            continue
        cleaned.append(m.strip())
    return cleaned


def main() -> int:
    parser = argparse.ArgumentParser(description="Check markdown links and static-page section headings.")
    parser.add_argument("--write-report", action="store_true", help="Write LINK_REPORT.md")
    args = parser.parse_args()

    md_files = get_target_markdown_files()
    link_re = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")

    external_urls: dict[str, set[str]] = {}
    url_expected_headings: dict[str, set[str]] = {}
    relative_errors: list[str] = []

    for filepath in md_files:
        rel_source = os.path.relpath(filepath, ROOT)
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        active_primary_urls: list[str] = []
        in_external_scope = True
        if rel_source in ("00-foundations/README.md", "01-electronics-and-power/README.md", "02-mechanics-kinematics-dynamics/README.md"):
            in_external_scope = False

        for line in text.splitlines():
            stripped = line.strip()
            if rel_source == "README.md" and stripped.startswith("## 🗺️ Master Multi-Pass Navigation Matrix"):
                in_external_scope = False
            elif rel_source in ("00-foundations/README.md", "01-electronics-and-power/README.md", "02-mechanics-kinematics-dynamics/README.md"):
                if stripped.startswith("## Tier 1"):
                    in_external_scope = True
                elif stripped.startswith("## Tier 2"):
                    in_external_scope = False

            if stripped.startswith("### Idea ") or stripped.startswith("## "):
                active_primary_urls = []

            url_matches = list(link_re.finditer(line))
            line_http_matches = []
            for m in url_matches:
                target = m.group(2).strip()
                if target.startswith("#") or target.startswith("mailto:"):
                    continue
                if target.startswith("http://") or target.startswith("https://"):
                    if not in_external_scope:
                        continue
                    clean_url = target.split("#")[0]
                    external_urls.setdefault(clean_url, set()).add(rel_source)
                    line_http_matches.append((clean_url, m.start(), m.end()))
                else:
                    rel_path = target.split("#")[0]
                    if not rel_path:
                        continue
                    resolved = os.path.normpath(os.path.join(os.path.dirname(filepath), rel_path))
                    if not os.path.exists(resolved):
                        relative_errors.append(
                            f"{rel_source}: broken relative link '{target}' (expected {os.path.relpath(resolved, ROOT)})"
                        )

            if "- **Primary resource:**" in line:
                active_primary_urls = [u for (u, _, _) in line_http_matches]

            # Extract headings per URL segment on Primary/What to read/Alternative resource lines
            if any(k in line for k in ("Primary resource", "What to read", "Alternative resource")):
                if line_http_matches:
                    # Segment the line so each URL gets the headings that follow it up to the next URL
                    for idx, (u, _s, e) in enumerate(line_http_matches):
                        next_start = line_http_matches[idx + 1][1] if idx + 1 < len(line_http_matches) else len(line)
                        segment = line[e:next_start]
                        for h in extract_quoted_headings_from_segment(segment):
                            url_expected_headings.setdefault(u, set()).add(h)
                elif "What to read" in line and active_primary_urls:
                    # Child "What to read:" line with no URL of its own -> attach headings to parent Primary resource URL(s)
                    if len(active_primary_urls) == 1:
                        for h in extract_quoted_headings_from_segment(line):
                            url_expected_headings.setdefault(active_primary_urls[0], set()).add(h)

    print(f"Scanned {len(md_files)} markdown files.")
    print(f"Found {len(external_urls)} unique external HTTP/HTTPS URLs.")

    if relative_errors:
        print("RELATIVE LINK ERRORS:", file=sys.stderr)
        for err in relative_errors:
            print(f"  - {err}", file=sys.stderr)

    results = []
    failed_urls = []
    failed_headings = []

    for url in sorted(external_urls.keys()):
        ok, status, title, page_text = fetch_url_info(url)
        sources = ", ".join(f"`{s}`" for s in sorted(external_urls[url]))
        spa = is_spa_url(url)
        quoted_headings = sorted(url_expected_headings.get(url, set()))

        heading_status_list = []
        if spa:
            kind = "SPA/App (`[verify in-app]`)"
            if quoted_headings:
                heading_status_list.append(
                    f"SPA/App headings ({', '.join(f'`{h}`' for h in quoted_headings)}): **verify in-app only**"
                )
        else:
            kind = "Static HTML + Heading Check"
            for h in quoted_headings:
                norm_h = normalize_text(h)
                if norm_h and norm_h in page_text:
                    heading_status_list.append(f"`{h}`: **FOUND in HTML**")
                else:
                    heading_status_list.append(f"`{h}`: **MISSING in HTML**")
                    failed_headings.append(f"{url} -> missing heading '{h}' (referenced in {sources})")

        heading_summary = "; ".join(heading_status_list) if heading_status_list else "Page `<title>` verified"
        results.append((url, ok, status, kind, title, heading_summary, sources))
        if not ok:
            failed_urls.append((url, status, sources))

    if args.write_report:
        report_path = os.path.join(ROOT, "LINK_REPORT.md")
        lines = [
            "# Automated Link & Static-Page Heading Verification Report (`LINK_REPORT.md`)\n",
            "Generated by `python3 scripts/check_links.py --write-report`.\n",
            "```mermaid",
            f"flowchart LR",
            f'    Scan["Scan {len(md_files)} Markdown Files"] --> Static["Static HTML: Verify HTTP 200 + Title + Cited Headings"]',
            '    Scan --> SPA["Browser SPAs/Apps: Verify HTTP 200 + Mark [verify in-app]"]',
            "```\n",
            "## How Verification Works",
            "- **Static HTML pages (SparkFun, Physics Classroom, CS50 Notes, MathsIsFun, HyperPhysics, Wikipedia, Wokwi Docs, Python Docs, Electronics-Tutorials, BetterExplained, MyPhysicsLab):** `scripts/check_links.py` performs an HTTP GET (reading up to 1.5 MB), extracts `<title>`, and verifies that every `**`Heading`**` cited in `Primary resource` / `What to read` / `Alternative resource` (including multi-URL bullets segmented per URL and parent `Primary resource` -> child `What to read` bullets) actually appears in the fetched HTML body.",
            "- **Interactive Browser SPAs & Simulators (`futurecoder.io`, `falstad.com`, `phet.colorado.edu`, `wokwi.com/projects/...`):** Because chapter lists and circuit menus are rendered client-side in JavaScript/WebAssembly, HTTP GET only verifies that the application entry URL returns `HTTP 200`; all internal chapter and menu names are marked **`[verify in-app]`**.\n",
            f"- **Total Markdown Files Scanned:** `{len(md_files)}`",
            f"- **Total Unique External URLs Checked:** `{len(results)}`",
            f"- **Broken Relative File Links:** `{len(relative_errors)}`",
            f"- **Missing Static-Page Headings:** `{len(failed_headings)}`\n",
            "| Status | HTTP | Verification Class | URL | Page `<title>` & Per-URL Heading Check Results | Referenced In |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ]
        for url, ok, status, kind, title, heading_summary, sources in results:
            badge = "PASS" if ok else "FAIL"
            safe_title = title.replace("|", "\\|")
            safe_headings = heading_summary.replace("|", "\\|")
            combined_info = f"{safe_title}<br>Headings: {safe_headings}" if safe_headings else safe_title
            lines.append(f"| {badge} | `{status}` | {kind} | {url} | {combined_info} | {sources} |")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print(f"Wrote {report_path}")

    if relative_errors or failed_urls or failed_headings:
        for url, status, sources in failed_urls:
            print(f"FAILED URL: {url} -> {status} ({sources})", file=sys.stderr)
        for fh in failed_headings:
            print(f"FAILED HEADING: {fh}", file=sys.stderr)
        return 1

    print(
        f"OK: All {len(results)} external URLs returned HTTP 200, 0 broken relative links, "
        f"and all cited static-page headings were verified in HTML."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
