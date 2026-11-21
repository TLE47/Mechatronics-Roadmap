#!/usr/bin/env python3
"""Probe and report whether each resource host may be framed under MechaLab's isolation policy.

The registry is generated offline, and this script is the separate, cached network sweep that gives
it an embed verdict. It never runs in `prebuild` or in the fast text gates: the committed report is
what the registry reads, and `--check` is the deterministic gate that every host has a fresh record.

The app keeps `COEP: require-corp` so Pyodide can use `SharedArrayBuffer` for in-place Stop. A
cross-origin frame therefore loads in one of two reviewed ways:

* `corp` — the host sends `Cross-Origin-Resource-Policy: cross-origin`; an ordinary sandboxed iframe
  is enough.
* `credentialless` — the host sends no framing denial and no CORP. The workspace can still frame it
  with the HTML `credentialless` iframe attribute, which gives the frame no credentials and no shared
  storage while the top document stays cross-origin isolated. Browsers without that attribute get the
  explicit external fallback, never a silent empty box.

`blocked` means the provider explicitly refuses framing (X-Frame-Options or frame-ancestors).
`unknown` means the probe could not establish it (TLS, timeout, bot wall, unsupported response); both
fall back to the external card.

Usage
    python3 scripts/verify_resource_embeds.py --write       # probe and update the report
    python3 scripts/verify_resource_embeds.py --check       # verify the committed report is fresh
    python3 scripts/verify_resource_embeds.py --revalidate  # probe now; fail if a verdict moved
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import json
import os
import re
import ssl
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POLICY = os.path.join(ROOT, "app", "src", "data", "learningResourceProviders.json")
REGISTRY = os.path.join(ROOT, "app", "public", "learning-resources.json")
OUT = os.path.join(ROOT, "docs", "learning-resources-embeds.json")

MAX_AGE_DAYS = 45
TIMEOUT_SECONDS = 12
USER_AGENT = "MechaLab-EmbedCheck/1.0 (+https://github.com/TLE47/Mechatronics-Roadmap)"
VALID_STATUSES = {"embeddable", "blocked", "unknown"}
VALID_METHODS = {"corp", "credentialless"}


def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def provider_policy() -> list[dict]:
    return load_json(POLICY)["providers"]


def registry_hosts() -> dict[str, str]:
    """host -> a representative authored URL, preferring the first resource that cites it."""
    if not os.path.exists(REGISTRY):
        return {}
    registry = load_json(REGISTRY)
    found: dict[str, str] = {}
    for group in registry.get("lessons", {}).values():
        for resource in group.get("resources", []):
            url = resource.get("url", "")
            if not url.startswith(("http://", "https://")):
                continue
            host = urllib.parse.urlparse(url).netloc.lower()
            found.setdefault(host, url)
    return found


def candidate_hosts() -> list[str]:
    """Every external host the curriculum cites, plus every approved provider host."""
    hosts = set(registry_hosts())
    for provider in provider_policy():
        # A native provider uses its official player, not a generic frame; it has no CORP/XFO
        # question for this report. Only approved iframe providers need a header verdict.
        if provider.get("approved") and provider.get("mechanism") == "iframe":
            hosts.update(host.lower() for host in provider.get("hosts", []))
    return sorted(hosts)


def sample_url(host: str) -> str:
    hosts = registry_hosts()
    if host in hosts:
        return hosts[host]
    for provider in provider_policy():
        if host in [item.lower() for item in provider.get("hosts", [])]:
            scheme = "https"
            return f"{scheme}://{host}/"
    return f"https://{host}/"


class _Redirects(urllib.request.HTTPRedirectHandler):
    """Follow 308 on Python 3.9 as 307, the same alias the link checker uses."""

    http_error_308 = urllib.request.HTTPRedirectHandler.http_error_307

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, 307 if code == 308 else code, msg, headers, newurl)


OPENER = urllib.request.build_opener(_Redirects())


def header(headers: object, name: str) -> str:
    if headers is None:
        return ""
    getter = getattr(headers, "get", None)
    return (getter(name) or "").strip() if getter else ""


def classify(
    *,
    status_code: int | None,
    x_frame_options: str,
    content_security_policy: str,
    corp: str,
    error: str = "",
) -> dict:
    """Turn response headers into the one verdict the resolver may act on.

    Kept pure and header-only so the unit suite can pin every branch without the network.
    """
    if error:
        return {
            "status": "unknown",
            "method": None,
            "evidence": f"probe failed: {error}",
        }
    if status_code is None:
        return {"status": "unknown", "method": None, "evidence": "no response"}
    if status_code in {401, 403, 418, 429} or status_code >= 500:
        return {
            "status": "unknown",
            "method": None,
            "evidence": f"HTTP {status_code} is a wall or outage, not an embed decision",
        }
    if not 200 <= status_code < 400:
        return {
            "status": "unknown",
            "method": None,
            "evidence": f"HTTP {status_code} did not return the page",
        }

    xfo = x_frame_options.strip().lower()
    if xfo in {"deny", "sameorigin"}:
        return {
            "status": "blocked",
            "method": None,
            "evidence": f"X-Frame-Options: {x_frame_options.strip()}",
        }

    ancestors = ""
    for directive in content_security_policy.split(";"):
        key, _, value = directive.strip().partition(" ")
        if key.strip().lower() == "frame-ancestors":
            ancestors = value.strip()
            break
    if ancestors:
        normalized = ancestors.lower().replace("'", "")
        if normalized not in {"*", "https: http:"}:
            return {
                "status": "blocked",
                "method": None,
                "evidence": f"Content-Security-Policy frame-ancestors {ancestors}",
            }

    resource_policy = corp.strip().lower()
    if resource_policy == "cross-origin":
        return {
            "status": "embeddable",
            "method": "corp",
            "evidence": "Cross-Origin-Resource-Policy: cross-origin",
        }
    if resource_policy in {"same-origin", "same-site"}:
        return {
            "status": "blocked",
            "method": None,
            "evidence": f"Cross-Origin-Resource-Policy: {corp.strip()}",
        }
    return {
        "status": "embeddable",
        "method": "credentialless",
        "evidence": "no framing denial and no CORP; a credentialless iframe is required under COEP",
    }


def probe(host: str) -> tuple[str, dict]:
    url = sample_url(host)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.8",
        },
        method="GET",
    )
    try:
        with OPENER.open(request, timeout=TIMEOUT_SECONDS) as response:
            body = classify(
                status_code=response.status,
                x_frame_options=header(response.headers, "X-Frame-Options"),
                content_security_policy=header(response.headers, "Content-Security-Policy"),
                corp=header(response.headers, "Cross-Origin-Resource-Policy"),
            )
            body.update(
                {
                    "httpStatus": response.status,
                    "finalUrl": response.geturl(),
                    "xFrameOptions": header(response.headers, "X-Frame-Options") or None,
                    "frameAncestors": _frame_ancestors(
                        header(response.headers, "Content-Security-Policy")
                    ),
                    "corp": header(response.headers, "Cross-Origin-Resource-Policy") or None,
                    "checkedAt": now_iso(),
                }
            )
            return host, body
    except urllib.error.HTTPError as error:
        body = classify(
            status_code=error.code,
            x_frame_options=header(error.headers, "X-Frame-Options"),
            content_security_policy=header(error.headers, "Content-Security-Policy"),
            corp=header(error.headers, "Cross-Origin-Resource-Policy"),
        )
        body.update(
            {
                "httpStatus": error.code,
                "finalUrl": error.geturl() if hasattr(error, "geturl") else url,
                "xFrameOptions": header(error.headers, "X-Frame-Options") or None,
                "frameAncestors": _frame_ancestors(
                    header(error.headers, "Content-Security-Policy")
                ),
                "corp": header(error.headers, "Cross-Origin-Resource-Policy") or None,
                "checkedAt": now_iso(),
            }
        )
        return host, body
    except (urllib.error.URLError, ssl.SSLError, TimeoutError, OSError) as error:
        reason = getattr(error, "reason", error)
        body = classify(
            status_code=None,
            x_frame_options="",
            content_security_policy="",
            corp="",
            error=f"{type(reason).__name__}: {reason}",
        )
        body.update({"httpStatus": None, "finalUrl": url, "checkedAt": now_iso()})
        return host, body


def _frame_ancestors(csp: str) -> str | None:
    for directive in csp.split(";"):
        key, _, value = directive.strip().partition(" ")
        if key.strip().lower() == "frame-ancestors":
            return value.strip() or None
    return None


def build_report() -> dict:
    hosts = candidate_hosts()
    results: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for host, body in pool.map(probe, hosts):
            results[host] = body
    return {
        "version": 1,
        "checkedAt": now_iso(),
        "policy": (
            "The app is served with COEP: require-corp for SharedArrayBuffer. corp means an ordinary "
            "sandboxed frame is permitted; credentialless means the frame must use the credentialless "
            "attribute; blocked and unknown never embed."
        ),
        "hosts": {host: results[host] for host in sorted(results)},
    }


def write_report(report: dict) -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="learning-resources-embeds.", dir=os.path.dirname(OUT))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(temporary, OUT)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def parse_checked_at(value: object) -> datetime.datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def check_report(report: dict) -> list[str]:
    problems: list[str] = []
    if report.get("version") != 1:
        problems.append("report version is not 1")
    hosts = report.get("hosts")
    if not isinstance(hosts, dict):
        return problems + ["report.hosts is not an object"]

    expected = set(candidate_hosts())
    missing = sorted(expected - set(hosts))
    extra = sorted(set(hosts) - expected)
    if missing:
        problems.append(f"missing hosts: {', '.join(missing)}")
    if extra:
        problems.append(f"hosts no longer cited: {', '.join(extra)}")

    checked = parse_checked_at(report.get("checkedAt"))
    if checked is None:
        problems.append("report.checkedAt is missing or not an ISO timestamp")
    else:
        if checked.tzinfo is None:
            problems.append("report.checkedAt has no timezone")
        else:
            age = datetime.datetime.now(datetime.timezone.utc) - checked
            if age.days > MAX_AGE_DAYS:
                problems.append(
                    f"report is {age.days} days old; re-run with --write (limit {MAX_AGE_DAYS})"
                )

    for host, entry in sorted(hosts.items()):
        if not isinstance(entry, dict):
            problems.append(f"{host}: entry is not an object")
            continue
        status = entry.get("status")
        method = entry.get("method")
        if status not in VALID_STATUSES:
            problems.append(f"{host}: invalid status {status!r}")
        if status == "embeddable" and method not in VALID_METHODS:
            problems.append(f"{host}: embeddable but method is {method!r}")
        if status != "embeddable" and method is not None:
            problems.append(f"{host}: non-embeddable host carries method {method!r}")
        if not entry.get("evidence"):
            problems.append(f"{host}: no evidence recorded")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe resource framing compatibility.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="probe every host and write the report")
    mode.add_argument("--check", action="store_true", help="verify the committed report is fresh")
    mode.add_argument(
        "--revalidate",
        action="store_true",
        help="probe every host now and fail if a committed verdict changed (writes nothing)",
    )
    parser.add_argument("--stats", action="store_true", help="print the report summary and exit")
    args = parser.parse_args()

    if args.write:
        report = build_report()
        write_report(report)
        counts: dict[str, int] = {}
        for entry in report["hosts"].values():
            counts[entry["status"]] = counts.get(entry["status"], 0) + 1
        print(
            f"wrote {os.path.relpath(OUT, ROOT)}: {len(report['hosts'])} hosts "
            f"({', '.join(f'{key}={value}' for key, value in sorted(counts.items()))})"
        )
        if args.stats:
            for host, entry in report["hosts"].items():
                print(f"  {host}: {entry['status']} ({entry.get('method') or 'no method'})")
        return 0

    if not os.path.exists(OUT):
        print(f"missing {os.path.relpath(OUT, ROOT)}; run with --write", file=sys.stderr)
        return 1
    report = load_json(OUT)
    if args.revalidate:
        # The scheduled sweep. It does not rewrite the file: a human reviews the changed verdicts and
        # runs --write, so a provider quietly turning frame-hostile cannot be papered over by CI.
        fresh = build_report()
        old_hosts = report.get("hosts", {})
        new_hosts = fresh["hosts"]
        changes = []
        for host in sorted(set(old_hosts) | set(new_hosts)):
            old = old_hosts.get(host)
            new = new_hosts.get(host)
            old_verdict = None if old is None else (old.get("status"), old.get("method"))
            new_verdict = None if new is None else (new.get("status"), new.get("method"))
            if old_verdict != new_verdict:
                changes.append((host, old_verdict, new_verdict, (new or {}).get("evidence", "")))
        if changes:
            print("embed verdicts changed; review them and run --write:", file=sys.stderr)
            for host, old, new, evidence in changes:
                print(f"  - {host}: {old} -> {new} ({evidence})", file=sys.stderr)
            return 1
        print(f"embed verdicts unchanged across {len(new_hosts)} hosts")
        return 0
    problems = check_report(report)
    if problems:
        print("embed report is stale or malformed:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    if args.stats:
        print(f"{len(report['hosts'])} hosts checked {report['checkedAt']}")
        for host, entry in report["hosts"].items():
            print(f"  {host}: {entry['status']} ({entry.get('method') or 'no method'})")
    else:
        print(f"embed report: {len(report['hosts'])} hosts, checked {report['checkedAt']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
