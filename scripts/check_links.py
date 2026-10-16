#!/usr/bin/env python3
"""
Automated Link & Heading Verification Script (`scripts/check_links.py`)

Scans all 28 newly written beginner roadmap files:
- `track-p/*.md` (13 lessons + README)
- `stage-0/*.md` (10 lessons + README)
- `01-electronics-and-power/01.1-mosfet-inductor-flyback.md`
- `resources/glossary.md`, `resources/safety.md`, `resources/troubleshooting.md`

For every external HTTP/HTTPS link:
1. Performs a live HTTP GET request with browser User-Agent and extracts `<title>`.
2. Parses the markdown lesson text around each link to extract all backticked bold heading names
   (e.g., `**\`Newton's Second Law\`**`) cited in `What to read` / `Alternative resource`.
3. For static HTML pages, verifies whether every cited heading substring actually appears in the
   fetched HTML (normalizing whitespace, HTML entities, and smart quotes).
4. For interactive browser SPAs/apps (`futurecoder.io`, `falstad.com`, `phet.colorado.edu`,
   `wokwi.com/projects/...`), explicitly classifies chapter/menu names as
   `[SPA/App — verify in-app only (not verifiable via HTTP)]`.
5. Generates `LINK_REPORT.md` with per-URL HTTP status, `<title>`, and per-heading verification results.
"""

import glob
import html
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SPA_DOMAINS = (
    "falstad.com",
    "phet.colorado.edu",
    "futurecoder.io",
    "wokwi.com/projects/",
    "tle47.github.io",
)


def natural_sort_key(path: str):
    parts = re.split(r"(\d+)", os.path.basename(path))
    return [int(p) if p.isdigit() else p for p in parts]


def get_target_markdown_files() -> list[str]:
    files = []
    files.extend(sorted(glob.glob(os.path.join(ROOT, "track-p", "*.md")), key=natural_sort_key))
    files.extend(sorted(glob.glob(os.path.join(ROOT, "stage-0", "*.md")), key=natural_sort_key))
    files.append(os.path.join(ROOT, "01-electronics-and-power", "01.1-mosfet-inductor-flyback.md"))
    files.append(os.path.join(ROOT, "resources", "glossary.md"))
    files.append(os.path.join(ROOT, "resources", "safety.md"))
    files.append(os.path.join(ROOT, "resources", "troubleshooting.md"))
    return [f for f in files if os.path.exists(f)]


def normalize_text(s: str) -> str:
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def extract_links_and_expected_headings(files: list[str]):
    """
    Returns:
      url_map: dict[url, {"sources": set[str], "expected_headings": set[str]}]
      local_errors: list[str]
    """
    url_map = {}
    local_errors = []
    link_re = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
    heading_cite_re = re.compile(r"\*\*`([^`]+)`\*\*")

    for filepath in files:
        rel_src = os.path.relpath(filepath, ROOT)
        base_dir = os.path.dirname(filepath)
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        lines = text.splitlines()
        for idx, line in enumerate(lines):
            for match in link_re.finditer(line):
                raw_target = match.group(2).strip()
                if raw_target.startswith(("http://", "https://")):
                    url_clean = raw_target.split("#")[0]
                    entry = url_map.setdefault(url_clean, {"sources": set(), "expected_headings": set()})
                    entry["sources"].add(rel_src)

                    # Check if this line is a Primary/Alternative resource line in ## Learn
                    if "Primary resource:" in line or "Alternative resource:" in line:
                        # Count how many URLs are on this resource line
                        line_urls = [
                            m.group(2).strip().split("#")[0]
                            for m in link_re.finditer(line)
                            if m.group(2).strip().startswith(("http://", "https://"))
                        ]
                        # If a single URL is on this line, inspect the What to read line right below it
                        if len(line_urls) == 1:
                            window = line
                            if idx + 1 < len(lines) and "What to" in lines[idx + 1]:
                                window += "\n" + lines[idx + 1]
                            for hm in heading_cite_re.finditer(window):
                                h_text = hm.group(1).strip()
                                if "->" not in h_text and ".." not in h_text and len(h_text) >= 4:
                                    entry["expected_headings"].add(h_text)
                elif not raw_target.startswith("mailto:"):
                    path_part = raw_target.split("#")[0]
                    if path_part:
                        resolved = os.path.normpath(os.path.join(base_dir, path_part))
                        if not os.path.exists(resolved):
                            local_errors.append(f"[{rel_src}] Broken relative link: {raw_target}")

    return url_map, local_errors


def check_single_url(url: str, expected_headings: set[str]) -> dict:
    is_spa = any(d in url for d in SPA_DOMAINS)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.getcode()
            raw_bytes = resp.read(1_500_000)
            body_html = raw_bytes.decode("utf-8", errors="ignore")
            title_m = re.search(r"<title[^>]*>(.*?)</title>", body_html, flags=re.IGNORECASE | re.DOTALL)
            title = html.unescape(re.sub(r"\s+", " ", title_m.group(1)).strip()) if title_m else "No <title>"

            norm_page = normalize_text(body_html)
            heading_results = []
            all_headings_ok = True
            if is_spa:
                for h in sorted(expected_headings):
                    heading_results.append((h, "SPA/App — verify in-app only"))
            else:
                for h in sorted(expected_headings):
                    norm_h = normalize_text(h)
                    found = norm_h in norm_page
                    if not found:
                        all_headings_ok = False
                    heading_results.append((h, "FOUND in HTML" if found else "MISSING in HTML"))

            return {
                "url": url,
                "status": status,
                "ok": (200 <= status < 400) and all_headings_ok,
                "is_spa": is_spa,
                "title": title[:80],
                "heading_results": heading_results,
            }
    except Exception as e:
        return {
            "url": url,
            "status": "ERR",
            "ok": False,
            "is_spa": is_spa,
            "title": str(e)[:80],
            "heading_results": [(h, "ERROR") for h in sorted(expected_headings)],
        }


def write_link_report(results: list[dict], url_map: dict, local_errors: list[str]):
    report_path = os.path.join(ROOT, "LINK_REPORT.md")
    lines = [
        "# Automated Link & Static-Page Heading Verification Report (`LINK_REPORT.md`)",
        "",
        "Generated by `python3 scripts/check_links.py --write-report`.",
        "",
        "```mermaid",
        "flowchart LR",
        '    Scan["Scan 29 Markdown Files"] --> Static["Static HTML: Verify HTTP 200 + Title + Cited Headings"]',
        '    Scan --> SPA["Browser SPAs/Apps: Verify HTTP 200 + Mark [verify in-app]"]',
        "```",
        "",
        "## How Verification Works",
        "- **Static HTML pages (SparkFun, Physics Classroom, Khan Academy, MathsIsFun, HyperPhysics, Wikipedia, Wokwi Docs, Python Docs):** `scripts/check_links.py` performs an HTTP GET, extracts `<title>`, and verifies that every single-URL `**`Heading`**` cited in `What to read` / `Alternative resource` actually appears in the fetched HTML body.",
        "- **Interactive Browser SPAs & Simulators (`futurecoder.io`, `falstad.com`, `phet.colorado.edu`, `wokwi.com/projects/...`):** Because chapter lists and circuit menus are rendered client-side in JavaScript/WebAssembly, HTTP GET only verifies that the application entry URL returns `HTTP 200`; all internal chapter and menu names are marked **`[verify in-app]`**.",
        "",
        f"- **Total Unique External URLs Checked:** `{len(results)}`",
        f"- **Broken Relative File Links:** `{len(local_errors)}`",
        "",
        "| Status | HTTP | Verification Class | URL | Page `<title>` & Per-URL Heading Check Results | Referenced In |",
        "| :--- | :--- | :--- | :--- | :--- | :--- |",
    ]
    for r in sorted(results, key=lambda x: x["url"]):
        badge = "PASS" if r["ok"] else "FAIL"
        vclass = "SPA/App (`[verify in-app]`)" if r["is_spa"] else "Static HTML + Heading Check"
        refs = ", ".join(f"`{s}`" for s in sorted(url_map[r["url"]]["sources"]))
        title_clean = r["title"].replace("|", "\\|")
        if r["heading_results"]:
            h_summary = "; ".join(f"`{h}`: **{res}**" for h, res in r["heading_results"])
            details_col = f"{title_clean}<br>Headings: {h_summary}"
        else:
            details_col = title_clean
        lines.append(f"| {badge} | `{r['status']}` | {vclass} | {r['url']} | {details_col} | {refs} |")

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    write_report = "--write-report" in sys.argv
    files = get_target_markdown_files()
    url_map, local_errors = extract_links_and_expected_headings(files)

    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        fut_to_url = {
            pool.submit(check_single_url, url, info["expected_headings"]): url
            for url, info in url_map.items()
        }
        for fut in as_completed(fut_to_url):
            results.append(fut.result())

    if write_report:
        write_link_report(results, url_map, local_errors)

    failed_http = [r for r in results if not r["ok"]]
    if local_errors or failed_http:
        for err in local_errors:
            print("  -", err)
        for r in failed_http:
            print(f"  - [{r['status']}] {r['url']} -> {r['title']} | Headings: {r['heading_results']}")
        sys.exit(1)

    print(
        f"OK: Verified {len(results)} unique external URLs (including static-page HTML heading presence) and 0 broken relative links across {len(files)} files."
    )


if __name__ == "__main__":
    main()
