#!/usr/bin/env python3
"""
Automated Link, Relative-Path & Static-Page Heading Checker (`scripts/check_links.py`)

1. Scans all beginner-path markdown files (`README.md`, `PLAN-batch-1.md`, `track-p/`, `stage-0/`,
   the nine numbered track index pages (`00-foundations/README.md` through
   `08-capstone-projects/README.md`), every lesson in those tracks, `modules/`, and every markdown page
   under `resources/` - the glossary, the cheatsheet, the BOM, the toolchain and textbook reading lists
   and `resources/plants/README.md`). Every external URL on a scanned page is fetched, the index pages'
   Tier 2/3 resource lists included.
1b. Fetches with a bounded thread pool (`--jobs`, default 8) and caches verdicts between runs
   (`--cache`, 7-day TTL for served pages, 6 hours for anything unverified), so a weekly sweep does not
   re-pay for 350 unchanged citations. `--refresh` ignores the cache; `--no-cache` skips it entirely.
2. Verifies that every relative file link resolves to an existing file on disk.
3. Checks every unique `http://` and `https://` URL using an HTTP GET request and records its HTTP status
   and `<title>`. Each URL gets one of five verdicts: **PASS** (2xx/3xx), **FAIL** (a 4xx the host is
   actually answering, other than a bot wall), **BLOCKED** (401/403/429 - the host refuses automated
   clients, so a browser is the only way to see it), **SERVER_ERROR** (5xx, retried once) and
   **UNREACHABLE** (connection error or timeout, retried once). Only FAIL breaks the build: the other
   three mean the page could not be checked, not that the citation is wrong, and the report says so
   on every such row.
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

# `tests/test_link_scan_set.py` imports this module, and the CI comment in `.github/workflows/ci.yml`
# requires every imported script to run on the system interpreter too (3.9 on this machine): the PEP
# 604 unions below are annotation-only, so deferring their evaluation is enough.
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import glob
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The nine track index pages. They are scanned like any other file: every relative link and every
# external URL, in every tier. They were named in a Tier-1-only scope clause from the start but never
# added to the file list, so nothing in them was checked until now; the window was a stand-in for the
# file list, not a decision about which citations matter.
TRACK_READMES = tuple(
    os.path.join(ROOT, track, "README.md")
    for track in (
        "00-foundations",
        "01-electronics-and-power",
        "02-mechanics-kinematics-dynamics",
        "03-sensors-and-actuators",
        "04-embedded-and-realtime",
        "05-control-and-estimation",
        "06-robotics-and-autonomy",
        "07-systems-hil-and-production",
        "08-capstone-projects",
    )
)

LESSON_GLOBS = [
    os.path.join(ROOT, "track-p", "P.*.md"),
    os.path.join(ROOT, "stage-0", "S0.*.md"),
    os.path.join(ROOT, "00-foundations", "00.*.md"),
    os.path.join(ROOT, "01-electronics-and-power", "01.*.md"),
    os.path.join(ROOT, "02-mechanics-kinematics-dynamics", "02.*.md"),
    # The six remaining legacy tracks. Their lessons carried the same `[HTTP 200 - Verified by
    # scripts/check_links.py]` annotations as tracks 00-02 while never being fetched here.
    os.path.join(ROOT, "03-sensors-and-actuators", "03.*.md"),
    os.path.join(ROOT, "04-embedded-and-realtime", "04.*.md"),
    os.path.join(ROOT, "05-control-and-estimation", "05.*.md"),
    os.path.join(ROOT, "06-robotics-and-autonomy", "06.*.md"),
    os.path.join(ROOT, "07-systems-hil-and-production", "07.*.md"),
    os.path.join(ROOT, "08-capstone-projects", "08.*.md"),
    # The bridge modules carry their own Resources sections, and until they were scanned here their
    # external links were only gated by `validate_modules.py`'s `resources_verified` flag - a claim
    # that a human verified them, not a check that they still resolve.
    os.path.join(ROOT, "modules", "*.md"),
]

SPA_APP_PATTERNS = (
    "https://futurecoder.io",
    "https://www.falstad.com",
    "https://phet.colorado.edu",
    "https://wokwi.com/projects/",
)


def is_spa_url(url: str) -> bool:
    return any(url.startswith(p) for p in SPA_APP_PATTERNS)


# Verdicts a checker can reach. Only FAIL means the citation is broken; the middle three mean the
# host would not let this machine see the page, which a browser (or CI's network) may do fine.
PASS = "PASS"
FAIL = "FAIL"
BLOCKED = "BLOCKED"
SERVER_ERROR = "SERVER_ERROR"
UNREACHABLE = "UNREACHABLE"
UNVERIFIED_VERDICTS = (BLOCKED, SERVER_ERROR, UNREACHABLE)

# 401/403: Cloudflare/ACM/WAF bot walls (w3.org, dl.acm.org, allaboutcircuits.com, umich CTMS).
# 418: IEEE Xplore answers scripts with a teapot while serving browsers the journal page.
# 429: rate limiting. None of these is evidence that the link rotted.
BOT_WALL_STATUSES = frozenset({401, 403, 418})
# The retryable set from the host rules: transient upstream errors and throttling.
RETRYABLE_STATUSES = frozenset({429, 502, 503, 504})


def get_target_markdown_files() -> list[str]:
    files = [
        os.path.join(ROOT, "README.md"),
        os.path.join(ROOT, "PLAN-batch-1.md"),
        os.path.join(ROOT, "track-p", "README.md"),
        os.path.join(ROOT, "stage-0", "README.md"),
        *TRACK_READMES,
    ]
    # Derived rather than named: naming three of the seven resource pages is how
    # `open-source-toolchains.md` and `textbooks-and-papers.md` kept two dead links out of the scan.
    files.extend(sorted(glob.glob(os.path.join(ROOT, "resources", "*.md"))))
    files.extend(sorted(glob.glob(os.path.join(ROOT, "resources", "*", "README.md"))))
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


# Python 3.9's `HTTPRedirectHandler` has no 308 handler, so a permanent redirect reads as a failure
# there while 3.12 follows it. 308 preserves the method exactly as 307 does, and every request here is
# a GET, so aliasing the two makes the verdict version-independent.
class _PermanentRedirects(urllib.request.HTTPRedirectHandler):
    http_error_308 = urllib.request.HTTPRedirectHandler.http_error_307

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 3.9's `redirect_request` raises for a code outside {301, 302, 303, 307}; 308 is 307's
        # method-preserving twin, so present it as one rather than duplicating the request logic.
        return super().redirect_request(req, fp, 307 if code == 308 else code, msg, headers, newurl)


OPENER = urllib.request.build_opener(_PermanentRedirects())


def verdict_for_http_status(code: int) -> str:
    """The verdict a non-retryable HTTP status earns, kept separate so it can be tested dry."""
    if code in BOT_WALL_STATUSES or code == 429:
        return BLOCKED
    if 500 <= code < 600:
        return SERVER_ERROR
    return FAIL


def fetch_url_info(url: str, timeout: int = 12, attempts: int = 2) -> tuple[str, int | str, str, str]:
    """Fetch one URL and return `(verdict, status, title, normalized_body)`.

    A timeout or connection error is retried once with a short backoff before it is called
    UNREACHABLE: one dropped connection is not evidence of a dead link, a second one is.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    status: int | str = ""
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with OPENER.open(req, timeout=timeout) as resp:
                code = resp.status
                raw_bytes = resp.read(1_500_000)
                body = raw_bytes.decode("utf-8", errors="ignore")
                title_m = re.search(r"<title[^>]*>(.*?)</title>", body, flags=re.IGNORECASE | re.DOTALL)
                title = html.unescape(re.sub(r"\s+", " ", title_m.group(1)).strip()) if title_m else ""
                return PASS, code, title[:80], normalize_text(body)
        except urllib.error.HTTPError as e:
            status = e.code
            if e.code in RETRYABLE_STATUSES and attempt < attempts:
                time.sleep(0.5 * attempt)
                continue
            return verdict_for_http_status(e.code), e.code, "", ""
        except Exception as e:
            status = str(e)
            if attempt < attempts:
                time.sleep(0.5 * attempt)
                continue
    return UNREACHABLE, status, "", ""


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


# A served page is re-fetched weekly; anything the host would not serve is retried within hours, because
# a bot wall or an outage says nothing about the citation and should not be cached away for a week.
UNVERIFIED_CACHE_HOURS = 6.0
CACHE_DEFAULT = os.path.join(ROOT, ".link_cache.json")


def load_cache(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def save_cache(path: str, cache: dict) -> None:
    """Write the cache atomically, temp file beside the target, fsync file and directory."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    tmp = os.path.join(directory, f".{os.path.basename(path)}.tmp.{os.getpid()}")
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(cache, handle, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def cache_entry_is_fresh(entry: object, expected: list[str], ttl_hours: float) -> bool:
    """A cached verdict is usable only if it is young enough and answers every cited heading."""
    if not isinstance(entry, dict):
        return False
    verdict = entry.get("verdict")
    try:
        fetched_at = float(entry.get("fetched_at", 0))
    except (TypeError, ValueError):
        return False
    ttl = ttl_hours if verdict == PASS else min(ttl_hours, UNVERIFIED_CACHE_HOURS)
    if time.time() - fetched_at > ttl * 3600:
        return False
    if verdict != PASS:
        return True
    headings = entry.get("headings")
    if not isinstance(headings, dict):
        return False
    return all(heading in headings for heading in expected)


def fetch_many(urls: list[str], jobs: int) -> dict[str, tuple[str, int | str, str, str]]:
    """Fetch every URL with a bounded pool; one failure is a verdict, never a crash."""
    fetched: dict[str, tuple[str, int | str, str, str]] = {}
    total = len(urls)
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(fetch_url_info, url): url for url in urls}
        for done, future in enumerate(concurrent.futures.as_completed(futures), start=1):
            url = futures[future]
            try:
                fetched[url] = future.result()
            except Exception as exc:  # a worker bug must not lose the other 350 verdicts
                fetched[url] = (UNREACHABLE, f"worker error: {exc}"[:80], "", "")
            if done % 25 == 0 or done == total:
                print(f"  fetched {done}/{total}", file=sys.stderr)
    return fetched


def append_history(path: str, record: dict) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")


def print_history(path: str, window: int = 10) -> None:
    """Show the last sweeps, so a growing unverified pile is visible without opening the file."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            lines = handle.read().splitlines()[-window:]
    except OSError:
        return
    rows = []
    for line in lines:
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    if not rows:
        return
    print("Not-checked over recent sweeps (oldest first):")
    for row in rows:
        print(
            f"  {str(row.get('date', '?'))[:10]}  urls={row.get('urls', 0):<4} "
            f"served={row.get('served', 0):<4} not_checked={row.get('not_checked', 0):<3} "
            f"failed={row.get('failed', 0)}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Check markdown links and static-page section headings.")
    parser.add_argument("--write-report", action="store_true", help="Write LINK_REPORT.md")
    parser.add_argument("--jobs", type=int, default=8, help="Concurrent fetches (default 8)")
    parser.add_argument("--cache", default=CACHE_DEFAULT, help="URL verdict cache path")
    parser.add_argument("--no-cache", action="store_true", help="Neither read nor write the cache")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached verdicts and re-fetch everything")
    parser.add_argument(
        "--cache-ttl-hours", type=float, default=168.0, help="Age limit for a served page's verdict (default 168)"
    )
    parser.add_argument(
        "--history", default=None, help="Append one JSON line per run here, and print the recent trend"
    )
    args = parser.parse_args()
    started = time.time()

    md_files = get_target_markdown_files()
    # The target allows one level of balanced parentheses, so `.../Pointer_(computer_programming)`
    # is taken whole instead of being cut at its first `)` and checked as a different, 404 URL.
    link_re = re.compile(r"\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)")

    external_urls: dict[str, set[str]] = {}
    url_expected_headings: dict[str, set[str]] = {}
    relative_errors: list[str] = []

    for filepath in md_files:
        rel_source = os.path.relpath(filepath, ROOT)
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

        active_primary_urls: list[str] = []
        in_external_scope = True

        for line in text.splitlines():
            stripped = line.strip()
            if rel_source == "README.md" and stripped.startswith("## 🗺️ Master Multi-Pass Navigation Matrix"):
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
    unverified_urls = []
    failed_headings = []

    sorted_urls = sorted(external_urls.keys())
    cache = {} if args.no_cache else load_cache(args.cache)
    pending: list[str] = []
    for url in sorted_urls:
        expected_norm = [normalize_text(h) for h in url_expected_headings.get(url, set())]
        if not args.refresh and cache_entry_is_fresh(cache.get(url), expected_norm, args.cache_ttl_hours):
            continue
        pending.append(url)

    served_from_cache = len(sorted_urls) - len(pending)
    if served_from_cache:
        print(
            f"Reusing {served_from_cache} of {len(sorted_urls)} cached verdicts from "
            f"{os.path.relpath(args.cache, ROOT)} (TTL {args.cache_ttl_hours:g} h).",
            file=sys.stderr,
        )
    fetched = fetch_many(pending, max(1, args.jobs)) if pending else {}

    updated_cache = dict(cache)
    for url in sorted_urls:
        sources = ", ".join(f"`{s}`" for s in sorted(external_urls[url]))
        spa = is_spa_url(url)
        quoted_headings = sorted(url_expected_headings.get(url, set()))
        expected_norm = list(dict.fromkeys(normalize_text(h) for h in quoted_headings))
        entry = cache.get(url) or {}

        if url in fetched:
            verdict, status, title, page_text = fetched[url]
            fetched_at = time.time()
            heading_found = {heading: bool(heading and heading in page_text) for heading in expected_norm}
        else:
            verdict = str(entry.get("verdict", UNREACHABLE))
            status = entry.get("status", "")
            title = str(entry.get("title", ""))
            fetched_at = float(entry.get("fetched_at", 0) or 0)
            cached_headings = entry.get("headings") if isinstance(entry.get("headings"), dict) else {}
            heading_found = {heading: bool(cached_headings.get(heading)) for heading in expected_norm}

        updated_cache[url] = {
            "verdict": verdict,
            "status": status,
            "title": title,
            "fetched_at": fetched_at,
            # A page the host did not serve has no headings to remember; `not checked` is the verdict.
            "headings": heading_found if verdict == PASS else {},
        }

        heading_status_list = []
        if spa:
            kind = "SPA/App (`[verify in-app]`)"
            if quoted_headings:
                heading_status_list.append(
                    f"SPA/App headings ({', '.join(f'`{h}`' for h in quoted_headings)}): **verify in-app only**"
                )
        elif verdict != PASS:
            # No HTML to search: a heading cannot be reported missing from a page never served.
            kind = "Not checked (host did not serve the page)"
            for h in quoted_headings:
                heading_status_list.append(f"`{h}`: **not checked ({verdict})**")
        else:
            kind = "Static HTML + Heading Check"
            for h in quoted_headings:
                norm_h = normalize_text(h)
                if norm_h and heading_found.get(norm_h):
                    heading_status_list.append(f"`{h}`: **FOUND in HTML**")
                else:
                    heading_status_list.append(f"`{h}`: **MISSING in HTML**")
                    failed_headings.append(f"{url} -> missing heading '{h}' (referenced in {sources})")

        if heading_status_list:
            heading_summary = "; ".join(heading_status_list)
        elif verdict == PASS or spa:
            heading_summary = "Page `<title>` verified"
        else:
            # A 403/5xx/timeout leaves no HTML, so neither the title nor a heading can be claimed.
            heading_summary = f"Page not served ({verdict}) - title and headings not checked"
        results.append((url, verdict, status, kind, title, heading_summary, sources))
        if verdict == FAIL:
            failed_urls.append((url, status, sources))
        elif verdict in UNVERIFIED_VERDICTS:
            unverified_urls.append((url, verdict, status, sources))

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
            f"- **Verdicts:** "
            + " · ".join(
                f"`{v}` {sum(1 for r in results if r[1] == v)}"
                for v in (PASS, FAIL, BLOCKED, SERVER_ERROR, UNREACHABLE)
            ),
            f"- **Broken Relative File Links:** `{len(relative_errors)}`",
            f"- **Missing Static-Page Headings:** `{len(failed_headings)}`\n",
            "**Verdict legend.** `PASS` = the host served the page. `FAIL` = the host answered with a 4xx "
            "that names a missing document; it breaks the check. `BLOCKED` = 401/403/429, a bot wall or "
            "rate limit (w3.org, dl.acm.org, allaboutcircuits.com and ctms.engin.umich.edu all answer this "
            "way to scripts and normally to a browser); `SERVER_ERROR` = 5xx after one retry; "
            "`UNREACHABLE` = a connection error or timeout after one retry. Those three mean *the page "
            "could not be checked from here*, not that the citation is wrong, so they are reported and "
            "counted but do not fail the run - otherwise a bot wall or an outage we cannot fix would keep "
            "the check permanently red. Open the URL in a browser before treating one as dead.\n",
            "| Status | HTTP | Verification Class | URL | Page `<title>` & Per-URL Heading Check Results | Referenced In |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ]
        for url, verdict, status, kind, title, heading_summary, sources in results:
            badge = verdict
            safe_title = title.replace("|", "\\|")
            safe_headings = heading_summary.replace("|", "\\|")
            combined_info = f"{safe_title}<br>Headings: {safe_headings}" if safe_headings else safe_title
            lines.append(f"| {badge} | `{status}` | {kind} | {url} | {combined_info} | {sources} |")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        print(f"Wrote {report_path}")

    if not args.no_cache:
        save_cache(args.cache, updated_cache)

    elapsed = time.time() - started
    record = {
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "files": len(md_files),
        "urls": len(results),
        "served": sum(1 for r in results if r[1] == PASS),
        "not_checked": len(unverified_urls),
        "failed": len(failed_urls),
        "missing_headings": len(failed_headings),
        "broken_relative": len(relative_errors),
        "cached": served_from_cache,
        "fetched": len(pending),
        "jobs": max(1, args.jobs),
        "elapsed_s": round(elapsed, 1),
        "verdicts": {v: sum(1 for r in results if r[1] == v) for v in (PASS, FAIL, BLOCKED, SERVER_ERROR, UNREACHABLE)},
    }
    if args.history:
        append_history(args.history, record)
        print_history(args.history, window=1)
    print(
        f"Swept {len(results)} URLs in {elapsed:.1f}s ({served_from_cache} cached, {len(pending)} fetched).",
        file=sys.stderr,
    )

    for url, verdict, status, sources in unverified_urls:
        print(f"NOT VERIFIED: {url} -> {verdict} ({status}) ({sources})", file=sys.stderr)

    if relative_errors or failed_urls or failed_headings:
        for url, status, sources in failed_urls:
            print(f"FAILED URL: {url} -> {status} ({sources})", file=sys.stderr)
        for fh in failed_headings:
            print(f"FAILED HEADING: {fh}", file=sys.stderr)
        return 1

    print(
        f"OK: {sum(1 for r in results if r[1] == PASS)} of {len(results)} external URLs were served "
        f"(HTTP 200), 0 broken relative links, and all cited static-page headings were verified in HTML."
    )
    if unverified_urls:
        print(
            f"{len(unverified_urls)} URL(s) could not be checked from this machine "
            f"({', '.join(sorted({u[1] for u in unverified_urls}))}) - see the NOT VERIFIED lines above.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
