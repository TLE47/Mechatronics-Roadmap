#!/usr/bin/env python3
"""The rise gate's issue filer, tested without a repository or a network.

The filer's job is a decision: is this exact set already tracked, and if not, what does the issue
say? Both halves are pure functions plus a `gh` call that `--dry-run` and `--existing` take out of
the picture, so the tests here exercise the real CLI surface without creating issues.

Run: `python3 tests/test_rise_issue.py` (also picked up by `python3 -m unittest discover -s tests`).
"""

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import file_rise_issue  # noqa: E402


def report(urls, date="2026-10-26T06:12:00+00:00", baseline="2026-10-19T18:15:02+00:00",
           unverified=None):
    return {
        "date": date,
        "baseline_date": baseline,
        "urls": 512,
        "not_checked": 50,
        "unverified": list(urls) if unverified is None else unverified,
        "new": [
            {
                "url": url,
                "verdict": "UNREACHABLE",
                "status": "<urlopen error [Errno 8] nodename nor servname provided, or not known>",
                "sources": ["03-sensors-and-actuators/README.md"],
            }
            for url in urls
        ],
    }


class FingerprintTests(unittest.TestCase):
    def test_the_same_set_in_another_order_is_the_same_fingerprint(self):
        a = file_rise_issue.fingerprint(["https://a.example", "https://b.example"])
        b = file_rise_issue.fingerprint(["https://b.example", "https://a.example"])
        self.assertEqual(
            a, b,
            "expected the fingerprint to identify the URL set, not the order the sweep happened to "
            "report it in; otherwise a re-run could file a second issue for the same rise",
        )

    def test_a_different_set_is_a_different_fingerprint(self):
        a = file_rise_issue.fingerprint(["https://a.example"])
        b = file_rise_issue.fingerprint(["https://a.example", "https://b.example"])
        self.assertNotEqual(
            a, b,
            "expected adding a URL to change the fingerprint, so a new wall is never mistaken for "
            "one already tracked",
        )

    def test_the_fingerprint_is_twelve_hex_characters(self):
        mark = file_rise_issue.fingerprint(["https://a.example"])
        self.assertEqual(
            (len(mark), all(c in "0123456789abcdef" for c in mark)),
            (12, True),
            "expected a 12-character lowercase hex id; the marker lives in issue bodies that a "
            "human reads and greps",
        )


class IssueTextTests(unittest.TestCase):
    def test_the_body_names_every_new_url_and_its_citation(self):
        text = file_rise_issue.issue_body(
            report(["https://dead.example/a", "https://wall.example/b"]), "abc123def456"
        )
        for expected in ("https://dead.example/a", "https://wall.example/b",
                         "03-sensors-and-actuators/README.md"):
            self.assertIn(
                expected, text,
                f"expected {expected!r} in the issue body; an issue that does not name the URL or "
                f"the file citing it sends the maintainer back to the workflow log",
            )

    def test_the_body_carries_the_fingerprint_marker(self):
        text = file_rise_issue.issue_body(report(["https://a.example"]), "abc123def456")
        self.assertIn(
            "<!-- rise-fingerprint: abc123def456 -->", text,
            "expected the html marker verbatim; deduplication searches for this exact string, and "
            "it must stay invisible when the issue is rendered",
        )

    def test_the_body_carries_the_url_list_the_resolver_reads_back(self):
        text = file_rise_issue.issue_body(
            report(["https://b.example", "https://a.example"]), "abc123def456"
        )
        self.assertEqual(
            file_rise_issue.issue_urls(text), ["https://a.example", "https://b.example"],
            "expected the sorted URL list to round-trip through the body; without it the resolver "
            "has a fingerprint but no membership, so it can never tell whether an issue recovered",
        )

    def test_the_title_counts_the_urls(self):
        self.assertEqual(
            file_rise_issue.issue_title(report(["https://a.example", "https://b.example"])),
            "Link sweep rise: 2 newly unverified URLs",
            "expected the count and plural in the title so a list of open issues ranks itself",
        )

    def test_a_single_url_uses_the_singular(self):
        self.assertEqual(
            file_rise_issue.issue_title(report(["https://a.example"])),
            "Link sweep rise: 1 newly unverified URL",
            "expected 'URL' for one, because '1 URLs' is the kind of slip the title should not have",
        )


class DuplicateTests(unittest.TestCase):
    def test_an_open_issue_with_the_marker_is_a_duplicate(self):
        issues = [{"number": 12, "body": "text <!-- rise-fingerprint: abc123def456 --> more"}]
        self.assertEqual(
            file_rise_issue.find_duplicate(issues, "abc123def456"), 12,
            "expected the open issue's number, so a retried job comments nothing and files nothing",
        )

    def test_a_different_marker_is_not_a_duplicate(self):
        issues = [{"number": 12, "body": "<!-- rise-fingerprint: 999999999999 -->"}]
        self.assertIsNone(
            file_rise_issue.find_duplicate(issues, "abc123def456"),
            "expected no match for a different set; treating it as one would drop a genuinely new "
            "wall",
        )


class IssueUrlTests(unittest.TestCase):
    def test_a_body_without_the_marker_reads_as_no_urls(self):
        self.assertEqual(
            file_rise_issue.issue_urls("An issue filed before the marker existed."), [],
            "expected an empty list for a legacy body, which the resolver turns into 'leave it for "
            "a human' rather than closing on no evidence",
        )

    def test_a_corrupt_marker_reads_as_no_urls(self):
        self.assertEqual(
            file_rise_issue.issue_urls("<!-- rise-urls: [not json -->"), [],
            "expected malformed JSON to read as no URLs; a parse failure must not be mistaken for "
            "'every URL recovered', which would close the issue",
        )


class ResolutionPlanTests(unittest.TestCase):
    def issue(self, number, urls):
        return {"number": number, "body": file_rise_issue.issue_body(report(urls), "aaaaaaaaaaaa")}

    def test_an_issue_whose_urls_are_all_absent_from_the_pile_is_closable(self):
        closable, kept, legacy = file_rise_issue.plan_resolution(
            [self.issue(5, ["https://a.example"])], set()
        )
        self.assertEqual(
            ([issue["number"] for issue, _urls in closable], kept, legacy),
            ([5], [], []),
            "expected the issue to be closable when none of its URLs is unverified now; that is "
            "the recovery the sweep already observed",
        )

    def test_an_issue_with_one_url_still_unverified_stays_open(self):
        closable, kept, _legacy = file_rise_issue.plan_resolution(
            [self.issue(6, ["https://a.example", "https://b.example"])],
            {"https://b.example"},
        )
        self.assertEqual(
            (closable, [(issue["number"], still, total) for issue, still, total in kept]),
            ([], [(6, 1, 2)]),
            "expected the kept list to carry the 1-of-2 count, so a maintainer sees the wall that "
            "is still standing instead of a silent skip",
        )

    def test_a_legacy_issue_is_neither_closed_nor_counted_as_open_with_a_count(self):
        closable, kept, legacy = file_rise_issue.plan_resolution(
            [{"number": 7, "body": "no markers here"}], set()
        )
        self.assertEqual(
            (closable, kept, [issue["number"] for issue in legacy]),
            ([], [], [7]),
            "expected an issue without the marker to land in its own bucket; closing it on a body "
            "the resolver cannot read would be a guess about what it tracks",
        )


class ResolveCommandTests(unittest.TestCase):
    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = file_rise_issue.main(list(argv))
        return code, out.getvalue()

    def write(self, directory, name, payload):
        path = os.path.join(directory, name)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
        return path

    def test_recovered_urls_close_the_issue(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = self.write(tmp, "state.json", report([], unverified=[], date="2026-10-26T06:12:00+00:00"))
            body = file_rise_issue.issue_body(report(["https://a.example"]), "aaaaaaaaaaaa")
            existing = self.write(tmp, "open.json", [{"number": 9, "body": body}])
            code, out = self.run_cli(
                "--resolve", "--report", state, "--existing", existing, "--dry-run",
                "--now", "2026-10-26T07:00:00+00:00",
            )
        self.assertEqual(
            (code, "gh issue close 9" in out), (0, True),
            "expected a dry run to print the close for issue 9; a sweep with no unverified URLs "
            "is the recovery that closes it",
        )

    def test_a_still_unverified_url_keeps_the_issue_open(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = self.write(
                tmp, "state.json",
                report([], unverified=["https://b.example"], date="2026-10-26T06:12:00+00:00"),
            )
            body = file_rise_issue.issue_body(
                report(["https://a.example", "https://b.example"]), "aaaaaaaaaaaa"
            )
            existing = self.write(tmp, "open.json", [{"number": 10, "body": body}])
            code, out = self.run_cli(
                "--resolve", "--report", state, "--existing", existing, "--dry-run",
                "--now", "2026-10-26T07:00:00+00:00",
            )
        self.assertEqual(
            (code, "1 of 2 URL(s) still unverified" in out, "gh issue close" in out),
            (0, True, False),
            "expected issue 10 kept open with the 1-of-2 count and no close command; closing it "
            "would hide a wall the sweep can still see",
        )

    def test_a_stale_state_closes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = self.write(tmp, "state.json", report([], unverified=[], date="2026-10-19T06:00:00+00:00"))
            body = file_rise_issue.issue_body(report(["https://a.example"]), "aaaaaaaaaaaa")
            existing = self.write(tmp, "open.json", [{"number": 11, "body": body}])
            code, out = self.run_cli(
                "--resolve", "--report", state, "--existing", existing, "--dry-run",
                "--now", "2026-10-26T07:00:00+00:00",
            )
        self.assertEqual(
            (code, "gh issue close" in out), (2, False),
            "expected exit 2 and no close for a state a week old; a stale sweep is not evidence "
            "that this week's URLs recovered",
        )

    def test_a_state_without_an_unverified_list_closes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            payload = report(["https://a.example"])
            payload.pop("unverified")
            state = self.write(tmp, "state.json", payload)
            existing = self.write(tmp, "open.json", [])
            code, _ = self.run_cli(
                "--resolve", "--report", state, "--existing", existing,
                "--now", "2026-10-26T07:00:00+00:00",
            )
        self.assertEqual(
            code, 2,
            "expected 2 when the state has no unverified list; there is no evidence to close on, "
            "and an empty default would close everything",
        )


class CommandLineTests(unittest.TestCase):
    def run_cli(self, *argv):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = file_rise_issue.main(list(argv))
        return code, out.getvalue()

    def write(self, directory, name, payload):
        path = os.path.join(directory, name)
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
        return path

    def test_a_tracked_set_is_skipped_without_touching_gh(self):
        with tempfile.TemporaryDirectory() as tmp:
            payload = report(["https://a.example"])
            path = self.write(tmp, "rise.json", payload)
            mark = file_rise_issue.fingerprint(["https://a.example"])
            existing = self.write(tmp, "open.json", [
                {"number": 7, "body": f"<!-- rise-fingerprint: {mark} -->"}
            ])
            code, out = self.run_cli("--report", path, "--existing", existing)
        self.assertEqual(
            (code, "Already tracked by issue #7" in out), (0, True),
            "expected exit 0 and a skip message naming the issue; a second issue for the same rise "
            "is exactly what the fingerprint exists to prevent",
        )

    def test_a_new_set_prints_the_command_it_would_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "rise.json", report(["https://a.example"]))
            existing = self.write(tmp, "open.json", [])
            code, out = self.run_cli("--report", path, "--existing", existing, "--dry-run")
        self.assertEqual(
            (code, "gh issue create" in out and "Would file:" in out), (0, True),
            "expected a dry run to exit 0 and print the create command; this is the path a "
            "maintainer uses to check the wording before it is posted",
        )

    def test_a_missing_report_exits_two(self):
        code, _ = self.run_cli("--report", "/nonexistent/rise.json", "--existing", "/dev/null")
        self.assertEqual(
            code, 2,
            "expected EX_NOINPUT-style 2 for 'nothing to file'; 1 would red a job that already "
            "failed upstream for the real reason",
        )

    def test_a_report_with_no_new_urls_exits_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write(tmp, "rise.json", report([]))
            existing = self.write(tmp, "open.json", [])
            code, _ = self.run_cli("--report", path, "--existing", existing)
        self.assertEqual(
            code, 2,
            "expected 2 when the report carries no URLs; an empty issue is worse than none",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
