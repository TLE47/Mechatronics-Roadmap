#!/usr/bin/env python3
"""The link checker's cache and thread pool, tested without touching the network.

A 350-URL sweep is slow enough that the cache and the pool are worth having, and wrong enough (a stale
PASS, a cache entry that answers a heading it never saw, a worker exception losing its neighbours) that
they need tests of their own. `fetch_url_info` is replaced with a stub here; the real network path is
exercised by the sweep itself.

Run: `python3 tests/test_link_cache.py` (also picked up by `python3 -m unittest discover -s tests`).
"""

import http.server
import os
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import check_links  # noqa: E402


def entry(verdict, age_hours=1.0, headings=None):
    return {
        "verdict": verdict,
        "status": 200 if verdict == check_links.PASS else 403,
        "title": "A page",
        "fetched_at": time.time() - age_hours * 3600,
        "headings": headings if headings is not None else {},
    }


class CacheFreshnessTests(unittest.TestCase):
    def test_a_young_pass_with_its_headings_is_usable(self):
        self.assertTrue(
            check_links.cache_entry_is_fresh(entry(check_links.PASS, headings={"niyquist": True}), ["niyquist"], 168),
            "check the freshness rule: expected a one-hour-old PASS with its cited heading to be reusable, "
            "otherwise every run re-fetches all 350 pages and the cache does nothing",
        )

    def test_a_pass_older_than_the_ttl_is_not(self):
        self.assertFalse(
            check_links.cache_entry_is_fresh(entry(check_links.PASS, age_hours=169, headings={"a": True}), ["a"], 168),
            "check the TTL: expected a 169-hour-old PASS to be re-fetched at a 168-hour TTL, so a citation "
            "that rots after the last sweep is caught by the next one",
        )

    def test_a_pass_that_never_saw_a_new_heading_is_not_usable(self):
        self.assertFalse(
            check_links.cache_entry_is_fresh(entry(check_links.PASS, headings={"old": True}), ["old", "new"], 168),
            "check the heading coverage rule: expected a cached PASS to be rejected when a page now cites a "
            "heading the cache never verified, otherwise a reworded citation silently passes unchecked",
        )

    def test_a_blocked_verdict_goes_stale_in_hours_not_days(self):
        self.assertTrue(
            check_links.cache_entry_is_fresh(entry(check_links.BLOCKED, age_hours=2), [], 168),
            "check the unverified TTL: expected a two-hour-old BLOCKED verdict to be reusable, so one "
            "weekly sweep does not re-pay for every bot wall",
        )
        self.assertFalse(
            check_links.cache_entry_is_fresh(entry(check_links.BLOCKED, age_hours=7), [], 168),
            "check the unverified TTL ceiling: expected a seven-hour-old BLOCKED verdict to be retried, "
            "since a bot wall or outage can lift long before the weekly TTL",
        )

    def test_garbage_is_not_a_cache_entry(self):
        for bad in (None, [], "PASS", {"verdict": check_links.PASS}):
            self.assertFalse(
                check_links.cache_entry_is_fresh(bad, [], 168),
                f"check the entry validation: {bad!r} must not read as usable, because a malformed cache "
                f"would otherwise be trusted as a verdict",
            )


class NeedsFetchTests(unittest.TestCase):
    def test_a_fresh_pass_is_not_fetched(self):
        self.assertFalse(
            check_links.needs_fetch(entry(check_links.PASS, headings={"a": True}), ["a"], 168),
            "check the default path: expected a fresh PASS with its headings to be skipped, otherwise "
            "the cache never saves a request",
        )

    def test_a_fresh_blocked_verdict_is_not_fetched_on_a_normal_run(self):
        self.assertFalse(
            check_links.needs_fetch(entry(check_links.BLOCKED, age_hours=1), [], 168),
            "check the normal TTL path: expected a one-hour-old BLOCKED verdict to be reused, since a "
            "weekly sweep should not re-pay for every bot wall",
        )

    def test_revalidation_retries_a_blocked_verdict_immediately(self):
        self.assertTrue(
            check_links.needs_fetch(
                entry(check_links.BLOCKED, age_hours=1), [], 168, revalidate_unverified=True
            ),
            "check the revalidation mode: expected a fresh BLOCKED verdict to be fetched anyway, so a "
            "bot wall that lifts is noticed the same day",
        )

    def test_revalidation_keeps_served_pages(self):
        self.assertFalse(
            check_links.needs_fetch(
                entry(check_links.PASS, headings={"a": True}), ["a"], 168, revalidate_unverified=True
            ),
            "check the revalidation mode's other half: expected a fresh PASS to stay cached, otherwise "
            "the daily job is a full sweep",
        )

    def test_refresh_forces_even_a_fresh_verdict(self):
        self.assertTrue(
            check_links.needs_fetch(entry(check_links.PASS, headings={"a": True}), ["a"], 168, refresh=True),
            "check --refresh: expected a fresh PASS to be fetched when the flag is set, since that is "
            "the only way to force a re-check",
        )

    def test_a_missing_entry_is_fetched(self):
        self.assertTrue(
            check_links.needs_fetch(None, [], 168),
            "check the cold-cache path: expected an unknown URL to be fetched, otherwise a first run "
            "would check nothing",
        )


class HistoryTests(unittest.TestCase):
    def test_the_same_unverified_set_is_not_a_rise(self):
        rows = [{"unverified": ["https://a", "https://b"]}]
        self.assertEqual(
            check_links.newly_unverified(rows, {"unverified": ["https://b", "https://a"]}),
            [],
            "check the set comparison: expected the same two URLs in another order to report nothing, "
            "since a wall that was already there last week is not news",
        )

    def test_a_recovery_plus_a_new_wall_names_only_the_new_wall(self):
        rows = [{"unverified": ["https://a", "https://b", "https://c"]}]
        self.assertEqual(
            check_links.newly_unverified(
                rows, {"unverified": ["https://b", "https://c", "https://d"]}
            ),
            ["https://d"],
            "check the churn case: expected only the URL that is unverified now and was not before, so "
            "a host recovering while another briefly walls still points at the one to open",
        )

    def test_a_smaller_set_is_not_a_rise(self):
        rows = [{"unverified": ["https://a", "https://b", "https://c"]}]
        self.assertEqual(
            check_links.newly_unverified(rows, {"unverified": ["https://a"]}),
            [],
            "check the recovery path: expected a shrinking unverified set to report nothing, since the "
            "pile got smaller and no citation needs attention",
        )

    def test_a_row_without_the_set_establishes_the_baseline(self):
        rows = [{"not_checked": 0}]
        self.assertIsNone(
            check_links.newly_unverified(rows, {"unverified": ["https://a"]}),
            "check the migration path: expected an older row with no `unverified` list to yield None, "
            "so the first run after this change records the baseline instead of failing on all 37",
        )

    def test_no_history_means_no_comparison(self):
        self.assertIsNone(
            check_links.newly_unverified([], {"unverified": ["https://a"]}),
            "check the first-run path: expected None when there is no previous row, otherwise the first "
            "sweep would compare against nothing and fail",
        )

    def test_read_history_skips_corrupt_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "history.jsonl")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write('{"not_checked": 3}\nnot json\n{"not_checked": 4}\n')
            rows = check_links.read_history(path)
        self.assertEqual(
            [row["not_checked"] for row in rows],
            [3, 4],
            "check the history parser: expected the corrupt line skipped and both real rows kept, so one "
            "bad write cannot disable the rise gate",
        )


class RiseReportTests(unittest.TestCase):
    def record(self, unverified):
        return {"date": "2026-10-26T06:00:00+00:00", "urls": 512, "not_checked": len(unverified),
                "unverified": unverified}

    def test_the_report_names_only_the_new_urls_with_what_they_said(self):
        report = check_links.rise_report(
            self.record(["https://old.example", "https://new.example"]),
            {"date": "2026-10-19T18:15:02+00:00"},
            ["https://new.example"],
            {"https://new.example": (check_links.UNREACHABLE, "nodename nor servname", {"b.md", "a.md"})},
        )
        self.assertEqual(
            [row["url"] for row in report["new"]],
            ["https://new.example"],
            "expected only the URL the gate called new; an issue that lists last week's walls as "
            "well is noise the maintainer has already triaged",
        )
        self.assertEqual(
            report["new"][0]["sources"],
            ["a.md", "b.md"],
            "expected the citing files sorted, so two runs on the same set produce the same body "
            "and the fingerprint is not the only stable thing about the issue",
        )
        self.assertEqual(
            report["baseline_date"], "2026-10-19T18:15:02+00:00",
            "expected the baseline date in the report, so the issue says what it was compared to",
        )

    def test_an_empty_unverified_set_produces_no_rows(self):
        report = check_links.rise_report(self.record([]), {}, [], {})
        self.assertEqual(
            report["new"], [],
            "expected no rows when nothing is unverified; the caller passes None in that case, "
            "but the builder must not invent a row from a missing detail entry",
        )

    def test_a_stale_report_is_removed_by_a_run_with_no_rise(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "rise.json")
            wrote = check_links.emit_rise_report(path, {"new": [{"url": "https://a.example"}]})
            self.assertTrue(wrote, "expected the gate to write its report when it has new URLs")
            wrote_again = check_links.emit_rise_report(path, None)
            self.assertEqual(
                (wrote_again, os.path.exists(path)),
                (False, False),
                "expected a passing run to delete the leftover report; otherwise a reused workspace "
                "files last week's URLs as this week's news",
            )


class CacheFileTests(unittest.TestCase):
    def test_save_then_load_round_trips(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "cache.json")
            check_links.save_cache(path, {"https://example.com": entry(check_links.PASS)})
            loaded = check_links.load_cache(path)
        self.assertEqual(
            loaded["https://example.com"]["verdict"],
            check_links.PASS,
            "check the save/load round trip: expected the verdict to survive, otherwise a green sweep "
            "re-fetches everything next time",
        )

    def test_a_corrupt_cache_reads_as_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "cache.json")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{not json")
            self.assertEqual(
                check_links.load_cache(path),
                {},
                "check the corrupt-cache path: expected an unreadable cache to degrade to a full sweep, "
                "never to crash the weekly check",
            )

    def test_save_leaves_no_temp_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "cache.json")
            check_links.save_cache(path, {})
            leftovers = [name for name in os.listdir(directory) if name != "cache.json"]
        self.assertEqual(
            leftovers,
            [],
            "check the atomic write: expected no `.tmp` file left beside the cache, since one would be "
            "committed or confuse the next run",
        )


class ConcurrentFetchTests(unittest.TestCase):
    def test_fetch_many_runs_in_parallel_and_keeps_every_verdict(self):
        active = 0
        peak = 0
        lock = threading.Lock()

        def fake_fetch(url, timeout=12, attempts=2):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.15)
            with lock:
                active -= 1
            return check_links.PASS, 200, url, "body with heading"

        urls = [f"https://example.com/{i}" for i in range(6)]
        with mock.patch.object(check_links, "fetch_url_info", fake_fetch):
            started = time.monotonic()
            fetched = check_links.fetch_many(urls, jobs=6)
            elapsed = time.monotonic() - started
        self.assertEqual(
            sorted(fetched),
            urls,
            "check the pool's result mapping: expected every URL back exactly once, since a dropped "
            "future would silently shrink the sweep",
        )
        self.assertGreaterEqual(
            peak,
            2,
            "check that the pool actually overlaps requests: expected at least two in flight, otherwise "
            "the sweep is still serial and the 'concurrent' flag buys nothing",
        )
        self.assertLess(
            elapsed,
            0.9,
            f"check the wall clock: six 0.15 s fetches with six workers took {elapsed:.2f} s, which is "
            f"serial behaviour; expected under 0.9 s",
        )

    def test_one_crashing_worker_does_not_lose_the_others(self):
        def flaky(url, timeout=12, attempts=2):
            if url.endswith("/2"):
                raise RuntimeError("boom")
            return check_links.PASS, 200, "ok", ""

        urls = [f"https://example.com/{i}" for i in range(4)]
        with mock.patch.object(check_links, "fetch_url_info", flaky):
            fetched = check_links.fetch_many(urls, jobs=4)
        self.assertEqual(
            len(fetched),
            4,
            "check the worker exception path: expected the crashed URL to report UNREACHABLE and the other "
            "three to survive, since one bad host must not abort the sweep",
        )
        self.assertEqual(
            fetched["https://example.com/2"][0],
            check_links.UNREACHABLE,
            "check the crashed worker's verdict: expected UNREACHABLE, so one broken host is reported as "
            "unverified rather than taking the whole sweep down",
        )


class StatusVerdictTests(unittest.TestCase):
    def test_a_teapot_is_a_bot_wall_not_a_dead_link(self):
        self.assertEqual(
            check_links.verdict_for_http_status(418),
            check_links.BLOCKED,
            "check the 418 classification: IEEE Xplore answers scripts with a teapot while serving the "
            "journal page to a browser, so expected BLOCKED (not checked), never FAIL",
        )

    def test_a_missing_document_fails(self):
        self.assertEqual(
            check_links.verdict_for_http_status(404),
            check_links.FAIL,
            "check the 4xx classification: expected a real 404 to fail the check, since that is the "
            "only verdict that means the citation is broken",
        )

    def test_a_server_error_is_reported_without_failing(self):
        self.assertEqual(
            check_links.verdict_for_http_status(503),
            check_links.SERVER_ERROR,
            "check the 5xx classification: expected SERVER_ERROR (not checked), because an outage we "
            "cannot fix must not keep the sweep permanently red",
        )


class RedirectTests(unittest.TestCase):
    def test_a_308_redirect_is_followed(self):
        """Python 3.9's urllib does not follow 308; the checker must, on every interpreter it runs on."""

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/old":
                    self.send_response(308)
                    self.send_header("Location", "/new")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                body = b"<html><title>New page</title></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            verdict, status, title, _ = check_links.fetch_url_info(
                f"http://127.0.0.1:{server.server_port}/old"
            )
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(
            (verdict, status, title),
            (check_links.PASS, 200, "New page"),
            "check the 308 path: expected the redirect followed to its 200 target, because the "
            "3.9 interpreter used for local runs has no 308 handler and would call a live page FAIL",
        )


class NonAsciiUrlTests(unittest.TestCase):
    def test_a_raw_utf8_path_is_percent_encoded_before_the_request(self):
        """A markdown link may carry raw UTF-8 in its path; http.client sends the request line as
        ASCII, so an unencoded URL dies with UnicodeEncodeError and is reported UNREACHABLE."""
        seen = {}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen["path"] = self.path
                body = b"<html><title>Vibration control</title></html>"
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            verdict, status, title, _ = check_links.fetch_url_info(
                f"http://127.0.0.1:{server.server_port}/振动控制.pdf"
            )
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(
            (verdict, status, title),
            (check_links.PASS, 200, "Vibration control"),
            "expected the raw UTF-8 path to be percent-encoded and fetched, not reported "
            "UNREACHABLE on the ascii codec's encode error",
        )
        self.assertEqual(
            seen["path"],
            "/%E6%8C%AF%E5%8A%A8%E6%8E%A7%E5%88%B6.pdf",
            "expected the request line to carry the browser's percent-encoded form",
        )

    def test_an_already_encoded_url_is_not_double_escaped(self):
        url = "https://example.com/a%20b.pdf?q=1&r=2"
        self.assertEqual(
            check_links.request_url(url), url,
            "expected an already percent-encoded URL to pass through unchanged; double-escaping "
            "`%20` to `%2520` would fetch a different path than the citation names",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
