"""The embed report is what lets the resolver frame a provider, so its verdicts are pinned here.

The network sweep itself is deliberately not exercised: a test that fetches sixteen third-party
sites is a flaky test. These tests feed the classifier the header combinations that decide each
branch, then hold the committed report to the same freshness and host-coverage contract `--check`
uses. Every graded assertion carries the message a learner needs when it fails.
"""

import datetime
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "verify_resource_embeds.py"

spec = importlib.util.spec_from_file_location("verify_resource_embeds", SCRIPT)
embeds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(embeds)


def classify(**overrides):
    values = {
        "status_code": 200,
        "x_frame_options": "",
        "content_security_policy": "",
        "corp": "",
    }
    values.update(overrides)
    return embeds.classify(**values)


class EmbedClassifierTests(unittest.TestCase):
    def test_no_framing_headers_needs_a_credentialless_frame(self):
        verdict = classify()
        self.assertEqual(
            verdict["status"],
            "embeddable",
            "expected a 200 with no framing denial to be embeddable; check the classifier's default branch",
        )
        self.assertEqual(
            verdict["method"],
            "credentialless",
            "expected no-CORP embedding to require a credentialless frame; check the method decision",
        )

    def test_corp_cross_origin_allows_an_ordinary_frame(self):
        verdict = classify(corp="cross-origin")
        self.assertEqual(
            verdict["status"],
            "embeddable",
            "expected CORP cross-origin to be embeddable; check the header classification",
        )
        self.assertEqual(
            verdict["method"],
            "corp",
            "expected CORP cross-origin to use an ordinary frame; check the method decision",
        )

    def test_x_frame_options_deny_and_sameorigin_block(self):
        for value in ("DENY", "SAMEORIGIN", "sameorigin"):
            with self.subTest(value=value):
                verdict = classify(x_frame_options=value)
                self.assertEqual(
                    verdict["status"],
                    "blocked",
                    "expected every X-Frame-Options denial to block; check the case-insensitive header scan",
                )
                self.assertIsNone(
                    verdict["method"],
                    "expected a blocked host to carry no frame method; check the classifier's blocked branch",
                )

    def test_frame_ancestors_self_blocks(self):
        verdict = classify(content_security_policy="default-src 'self'; frame-ancestors 'self'")
        self.assertEqual(
            verdict["status"],
            "blocked",
            "expected frame-ancestors 'self' to block a cross-origin parent; check the CSP parser",
        )
        self.assertIn(
            "frame-ancestors",
            verdict["evidence"],
            "expected the block evidence to name frame-ancestors; check the evidence string",
        )

    def test_frame_ancestors_wildcard_does_not_block(self):
        verdict = classify(content_security_policy="frame-ancestors *")
        self.assertEqual(
            verdict["status"],
            "embeddable",
            "expected a frame-ancestors wildcard not to block; check that only self/none values block",
        )

    def test_same_origin_corp_blocks_a_cross_origin_parent(self):
        verdict = classify(corp="same-origin")
        self.assertEqual(
            verdict["status"],
            "blocked",
            "expected CORP same-origin to block a cross-origin parent; check the CORP branch",
        )

    def test_walls_and_outages_are_unknown_not_blocked(self):
        for code in (401, 403, 418, 429, 500, 503):
            with self.subTest(code=code):
                verdict = classify(status_code=code)
                self.assertEqual(
                    verdict["status"],
                    "unknown",
                    "expected a wall or outage to stay unknown, not blocked; check the status-code branch",
                )

    def test_network_error_is_unknown(self):
        verdict = classify(status_code=None, error="SSLError: hostname mismatch")
        self.assertEqual(
            verdict["status"],
            "unknown",
            "expected a transport error to stay unknown; check that the classifier does not guess a frame",
        )
        self.assertIn(
            "SSLError",
            verdict["evidence"],
            "expected the transport error in the evidence; check the verifier's error message capture",
        )


class FramePolicyTests(unittest.TestCase):
    def test_every_serving_surface_names_the_same_narrow_frame_policy(self):
        surfaces = [
            ROOT / "scripts" / "isolation-headers.mjs",
            ROOT / "app" / "public" / "sw.js",
            ROOT / "scripts" / "e2e_pages_bundle.mjs",
        ]
        for surface in surfaces:
            with self.subTest(surface=str(surface.relative_to(ROOT))):
                text = surface.read_text(encoding="utf-8")
                self.assertIn(
                    "frame-src",
                    text,
                    "expected every serving surface to bound frames; check the CSP header in this file",
                )
                for host in (
                    "https://futurecoder.io",
                    "https://docs.python.org",
                    "https://www.youtube-nocookie.com",
                ):
                    self.assertIn(
                        host,
                        text,
                        "expected the approved provider host in frame-src; check the provider policy and this header",
                    )
                self.assertNotIn(
                    "frame-src *",
                    text,
                    "expected no wildcard frame-src; check that the policy names only approved providers",
                )


class CommittedEmbedReportTests(unittest.TestCase):
    def setUp(self):
        self.report = embeds.load_json(str(embeds.OUT))

    def test_committed_report_is_current_and_covers_every_host(self):
        problems = embeds.check_report(self.report)
        self.assertEqual(
            problems,
            [],
            "expected a fresh report covering every cited host; check the verifier and run --write if stale",
        )

    def test_a_missing_host_is_a_problem(self):
        report = {
            **self.report,
            "hosts": dict(self.report["hosts"]),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
        }
        report["hosts"].pop(next(iter(report["hosts"])))
        problems = embeds.check_report(report)
        self.assertTrue(
            any("missing hosts" in problem for problem in problems),
            "expected a missing host to be reported; check that candidate_hosts and the report are compared",
        )

    def test_a_stale_report_is_a_problem(self):
        report = {
            **self.report,
            "checkedAt": "2020-01-01T00:00:00Z",
        }
        problems = embeds.check_report(report)
        self.assertTrue(
            any("days old" in problem for problem in problems),
            "expected an old report to be rejected; check the 45-day freshness window",
        )


if __name__ == "__main__":
    unittest.main()
