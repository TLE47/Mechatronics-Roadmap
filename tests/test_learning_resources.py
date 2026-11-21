"""The resource registry is generated data, so these tests pin the source join, not a fixture.

The panel is only as trustworthy as the Markdown block it renders. These tests read the real P.1 page
through the generator, check the duplicate-URL occurrences, the inline CS50P headings, the local-link
classification, and the committed output. They do not fetch a provider: the registry is deliberately
network-free, and the external-first renderer is the resolution this release chose.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "scripts" / "generate_learning_resources.py"

spec = importlib.util.spec_from_file_location("generate_learning_resources", GENERATOR)
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


class LearningResourceRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = gen.build_registry()
        cls.p1 = cls.registry["lessons"]["P.1"]
        cls.p1_resources = cls.p1["resources"]

    def test_registry_counts_match_the_authored_surface(self):
        self.assertEqual(
            self.registry["lessonCount"],
            51,
            "expected 51 lesson groups with authored resources; check the generator's page globs",
        )
        self.assertEqual(
            self.registry["lineCount"],
            159,
            "expected 159 authored resource lines; check the Primary/Alternative line match",
        )
        self.assertEqual(
            self.registry["resourceCount"],
            155,
            "expected 155 external resources; check the external/local split in the generator",
        )
        self.assertEqual(
            self.registry["localResourceCount"],
            5,
            "expected 5 local resource links; check the local-link classification",
        )
        self.assertEqual(
            len(self.p1_resources),
            4,
            "expected P.1 to keep four authored occurrences; check that no URL was merged",
        )

    def test_p1_keeps_the_same_url_as_two_distinct_occurrences(self):
        values = [(resource["role"], resource["idea"]["number"], resource["url"]) for resource in self.p1_resources]
        self.assertEqual(
            values,
            [
                ("primary", 1, "https://futurecoder.io/course/#toc"),
                ("alternative", 1, "https://cs50.harvard.edu/python/2022/notes/0/"),
                ("primary", 2, "https://cs50.harvard.edu/python/2022/notes/0/"),
                ("alternative", 2, "https://futurecoder.io/course/#toc"),
            ],
            "expected P.1's four role/idea/URL occurrences in authored order; check the parse",
        )
        ids = [resource["id"] for resource in self.p1_resources]
        self.assertEqual(
            len(ids),
            len(set(ids)),
            "expected four distinct occurrence ids; check that a repeated URL does not collapse guides",
        )
        self.assertTrue(
            all(resource["kind"] == "external" for resource in self.p1_resources),
            "expected every P.1 resource to be external; check the URL kind classification",
        )

    def test_reader_snapshots_cover_every_licence_cleared_resource(self):
        allowed = [
            resource
            for group in self.registry["lessons"].values()
            for resource in group["resources"]
            if resource["kind"] == "external"
            and resource["license"]
            and resource["license"]["reuse"] == "allowed"
        ]
        self.assertEqual(
            len(allowed),
            95,
            "expected every licence-cleared occurrence to be counted; check the provider policy",
        )
        self.assertEqual(
            self.registry["snapshotCount"],
            95,
            "expected every licence-cleared occurrence to carry a snapshot path",
        )
        self.assertTrue(
            all(resource.get("snapshot", {}).get("path") for resource in allowed),
            "expected no licence-cleared resource to fall back to a link by accident",
        )
        paths = {resource["snapshot"]["path"] for resource in allowed}
        self.assertEqual(
            len(paths),
            70,
            "expected one checked-in snapshot per unique permitted URL; check the resource keys",
        )
        for path in paths:
            file_path = ROOT / "app" / "public" / path
            self.assertTrue(file_path.exists(), f"expected the snapshot file {path} to be present")
            snapshot = json.loads(file_path.read_text(encoding="utf-8"))
            self.assertEqual(
                snapshot["version"],
                1,
                f"expected {path} to use snapshot format version 1; check the builder output",
            )
            self.assertEqual(
                snapshot["license"]["reuse"],
                "allowed",
                f"expected {path} to retain an allowed reuse verdict; check the provider policy",
            )
            self.assertTrue(
                snapshot["blocks"],
                f"expected {path} to contain readable text blocks; check the extractor",
            )
            self.assertTrue(
                snapshot["notice"], f"expected {path} to carry the attribution and change notice"
            )

        for group in self.registry["lessons"].values():
            for resource in group["resources"]:
                if resource["license"] and resource["license"]["reuse"] != "allowed":
                    self.assertNotIn(
                        "snapshot",
                        resource,
                        "expected a source without reuse permission to stay a link",
                    )

    def test_p1_carries_provider_embed_and_licence_metadata(self):
        first = self.p1_resources[0]
        self.assertEqual(
            first["providerKey"],
            "futurecoder",
            "expected the first P.1 resource to resolve to the futurecoder provider; check the provider allowlist host map",
        )
        self.assertEqual(
            first["resourceKind"],
            "interactive",
            "expected futurecoder to be classified interactive; check the provider kind in the policy file",
        )
        self.assertEqual(
            first["embed"]["status"],
            "embeddable",
            "expected futurecoder to be embeddable; check the committed embed report for its host",
        )
        self.assertEqual(
            first["embed"]["method"],
            "credentialless",
            "expected a credentialless frame because futurecoder sends no CORP; check the header probe result",
        )
        self.assertEqual(
            first["attribution"]["originalUrl"],
            first["url"],
            "expected attribution to point at the authored URL; check the generator's attribution block",
        )
        self.assertEqual(
            first["presentation"],
            "auto",
            "expected the default presentation to remain auto; check the author override parsing",
        )
        self.assertEqual(
            first["license"]["reuse"],
            "allowed",
            "expected futurecoder licence reuse to be allowed for the MIT repository text/code; check the policy's licence field",
        )
        self.assertIn(
            "notice",
            first["license"]["conditions"],
            "expected futurecoder to require the MIT notice; check the policy's conditions",
        )
        self.assertIn(
            "per-asset-check",
            first["license"]["conditions"],
            "expected futurecoder images and videos to need a per-asset check; check the policy's conditions",
        )
        self.assertEqual(
            len(first["resourceKey"]),
            10,
            "expected a ten-character stable resource key; check the generator's URL hash",
        )
        self.assertEqual(
            first["snapshot"]["path"],
            f"learning-resource-snapshots/{first['resourceKey']}.json",
            "expected the futurecoder snapshot path to be generated from its stable resource key",
        )

        cs50 = self.p1_resources[1]
        self.assertEqual(
            cs50["providerKey"],
            "cs50p",
            "expected the second P.1 resource to resolve to cs50p; check the provider host map",
        )
        self.assertEqual(
            cs50["embed"]["status"],
            "blocked",
            "expected CS50P to be blocked; check its X-Frame-Options header in the embed report",
        )
        self.assertIn(
            "X-Frame-Options",
            cs50["embed"]["evidence"],
            "expected the evidence to name X-Frame-Options; check the verifier's header capture",
        )
        self.assertEqual(
            cs50["license"]["reuse"],
            "allowed",
            "expected CS50P licence reuse to be allowed only with its non-commercial/share-alike conditions; check the policy",
        )
        self.assertIn(
            "non-commercial",
            cs50["license"]["conditions"],
            "expected CS50P to record its non-commercial restriction; check the policy's conditions",
        )
        self.assertIn(
            "share-alike",
            cs50["license"]["conditions"],
            "expected CS50P to record its share-alike condition; check the policy's conditions",
        )

        # Every non-null licence must carry the obligations a Reader Mode build has to satisfy;
        # a bare `allowed` verdict is the shape that let the matrix drift in the first place.
        for group in self.registry["lessons"].values():
            for resource in group["resources"]:
                if resource["license"]:
                    self.assertTrue(
                        resource["license"].get("conditions"),
                        f"expected {resource['id']} to record its licence conditions; check the provider policy",
                    )

        # The same URL used twice keeps one resourceKey but two occurrence ids and two guides.
        repeated = [resource for resource in self.p1_resources if resource["url"] == cs50["url"]]
        self.assertEqual(
            len(repeated),
            2,
            "expected CS50P to be authored twice in P.1; check that both Idea blocks were parsed",
        )
        self.assertEqual(
            len({resource["resourceKey"] for resource in repeated}),
            1,
            "expected one resourceKey for the repeated URL; check the generator's URL identity",
        )
        self.assertEqual(
            len({resource["id"] for resource in repeated}),
            2,
            "expected two occurrence ids for the repeated URL; check the occurrence identity suffix",
        )

    def test_p1_reads_the_child_and_inline_guides(self):
        by_key = {(resource["role"], resource["idea"]["number"]): resource for resource in self.p1_resources}

        first = by_key[("primary", 1)]
        self.assertIn(
            "The Shell",
            first["guide"]["read"],
            "expected the primary guide to name The Shell; check the child What to read bullet",
        )
        self.assertIn(
            "Variables",
            first["guide"]["read"],
            "expected the primary guide to name Variables; check the authored read text",
        )
        self.assertIn(
            "String Basics",
            first["guide"]["skip"],
            "expected the primary guide to skip String Basics; check the What to skip bullet",
        )
        self.assertIn(
            "named storage box",
            first["guide"]["takeaway"],
            "expected the authored takeaway about a named storage box; check the inline guide",
        )
        self.assertEqual(
            first["headings"],
            ["The Shell", "Variables"],
            "expected the two bold headings in authored order; check the bold-term extraction",
        )
        self.assertEqual(
            first["verification"],
            "verify-in-app",
            "expected the futurecoder line to keep verify-in-app; check the annotation strip",
        )

        alternative = by_key[("alternative", 1)]
        self.assertIn(
            "Read exact headings",
            alternative["guide"]["read"],
            "expected CS50P's inline read sentence; check the guide parsed after the link",
        )
        self.assertIn(
            "Variables",
            alternative["guide"]["read"],
            "expected CS50P to name Variables; check the inline gallery of headings",
        )
        self.assertIn(
            "Comments",
            alternative["guide"]["read"],
            "expected CS50P to name Comments; check the inline gallery of headings",
        )
        self.assertEqual(
            alternative["headings"],
            ["Variables", "Comments"],
            "expected the two inline bold headings in authored order; check bold extraction",
        )
        self.assertEqual(
            alternative["verification"],
            "http-200",
            "expected the CS50P line to keep its HTTP-200 annotation; check the annotation strip",
        )

        second = by_key[("primary", 2)]
        self.assertIn(
            "Formatting Strings",
            second["guide"]["read"],
            "expected the second primary guide to name Formatting Strings; check that read text",
        )
        self.assertIn(
            "Integers or int",
            second["guide"]["read"],
            "expected the second primary guide to name Integers or int; check that read text",
        )
        self.assertIn(
            "Float Basics",
            second["guide"]["read"],
            "expected the second primary guide to name Float Basics; check that read text",
        )
        self.assertIn(
            "Strings and Parameters",
            second["guide"]["skip"],
            "expected the second primary guide to skip Strings and Parameters; check the skip bullet",
        )
        self.assertIn(
            "whole numbers",
            second["guide"]["takeaway"],
            "expected the authored int/float takeaway to mention whole numbers; check the guide",
        )

        future_alt = by_key[("alternative", 2)]
        self.assertIn(
            "String Basics",
            future_alt["guide"]["read"],
            "expected the second futurecoder guide to name String Basics; check the read text",
        )
        self.assertIn(
            "f-strings",
            future_alt["guide"]["read"],
            "expected the second futurecoder guide to name f-strings; check the read text",
        )
        self.assertIn(
            "A Bit More About Strings",
            future_alt["guide"]["read"],
            "expected the second futurecoder guide to name A Bit More About Strings; check the read",
        )

    def test_local_links_are_inventoried_but_not_external(self):
        local = [
            resource
            for group in self.registry["lessons"].values()
            for resource in group["resources"]
            if resource["kind"] == "local"
        ]
        self.assertEqual(
            len(local),
            5,
            "expected all five local links to stay in the registry; check the local classification",
        )
        self.assertTrue(
            all(not resource["url"].startswith(("http://", "https://")) for resource in local),
            "expected no local record to carry an http(s) URL; check the scheme split",
        )
        self.assertTrue(
            all(resource["provider"] == "MechaLab" for resource in local),
            "expected local links to be attributed to MechaLab; check provider_for's local branch",
        )

    def test_generation_is_deterministic_and_the_committed_files_match(self):
        first = gen.render_registry(gen.build_registry())
        second = gen.render_registry(gen.build_registry())
        self.assertEqual(
            first,
            second,
            "expected two generator runs to render identical JSON; check ordering and timestamps",
        )
        self.assertEqual(
            first,
            pathlib.Path(gen.OUT_JSON).read_text(encoding="utf-8"),
            "expected the committed registry to match a fresh render; check:resources must pass",
        )
        self.assertEqual(
            gen.render_index(self.registry),
            pathlib.Path(gen.OUT_INDEX).read_text(encoding="utf-8"),
            "expected the committed reader index to match a fresh render; check:resources must pass",
        )
        self.assertIn(
            '"P.1": 4',
            gen.render_index(self.registry),
            "expected the index to give P.1 four guides; check the per-lesson count map",
        )

    def test_index_counts_every_authored_resource(self):
        index = gen.render_index(self.registry)
        for group in self.registry["lessons"].values():
            if group["resources"]:
                self.assertIn(
                    f'"{group["id"]}": {len(group["resources"])}',
                    index,
                    f"expected {group['id']} to count every authored guide; check the index render",
                )
        # Local-only lessons have no external URL, but the panel must still offer their guides.
        self.assertIn(
            '"02.6": 2',
            index,
            "expected the local-only 02.6 lesson to keep its two guides; check the count map",
        )
        self.assertIn(
            '"P.2.5": 2',
            index,
            "expected the local-only P.2.5 lesson to keep its two guides; check the count map",
        )
        self.assertIn(
            '"01.4": 4',
            index,
            "expected 01.4 to count its three external and one local guide; check the count map",
        )


if __name__ == "__main__":
    unittest.main()
