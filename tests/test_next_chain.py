"""Every routed page must point at the next page in the one sequence, and only at it.

`scripts/generate_next_links.py --check` compares generated text, so it cannot tell a link
that resolves from one that 404s, or a chain that closes on itself. This test follows the
links as a learner would: start at `P.1`, read each `next-step` block, resolve the relative
path, and assert the walk visits exactly the arm route in `scripts/route_model.py` order -
65 pages, no repeats, no detours - then the 23 depth pages in `docs/DEPTH.md` order, with
the boundary between them saying the arm is finished and the depth pass optional.
"""

import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import generate_next_links  # noqa: E402
import route_model  # noqa: E402

BLOCK = re.compile(r"<!-- next-step:start -->\n(.*?)\n<!-- next-step:end -->", re.DOTALL)
LINK = re.compile(r"\]\(([^)]+)\)")


def arm_chain():
    chain = []
    for step in route_model.STEPS:
        facts = route_model.step_facts(step)
        chain.extend(row["path"] for row in facts["lessons"])
        chain.extend(f"modules/{row['id']}.md" for row in facts["arm_modules"])
    return chain


def depth_ids_from_doc():
    """The depth pass in the order `docs/DEPTH.md` prints it (step by step, not by tier).

    Only `| Step ...` table rows count: the document also lists the modules that sit
    outside both routes, and those are not part of the pass.
    """
    seen = []
    for line in read("docs/DEPTH.md").splitlines():
        if not line.startswith("| Step "):
            continue
        match = re.search(r"`([^`]+)`", line)
        if match and match.group(1) not in seen:
            seen.append(match.group(1))
    return seen


def depth_chain():
    return [f"modules/{ident}.md" for ident in depth_ids_from_doc()]


def route_chain():
    return arm_chain() + depth_chain()


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        return handle.read()


def block_of(path):
    blocks = BLOCK.findall(read(path))
    if len(blocks) != 1:
        raise AssertionError(
            f"{path} carries {len(blocks)} next-step blocks, expected exactly one"
        )
    return blocks[0].strip()


def resolve(path, target):
    """A relative link in `path` resolved against the page's own directory."""
    return os.path.normpath(os.path.join(os.path.dirname(path), target)).replace(os.sep, "/")


def links_of(path):
    return [resolve(path, target) for target in LINK.findall(block_of(path))]


class NextChainTest(unittest.TestCase):
    def test_the_route_is_65_arm_pages_then_23_depth_pages(self):
        self.assertEqual(
            len(arm_chain()), 65, "the arm route must be 65 pages; check route_model.STEPS"
        )
        self.assertEqual(
            len(depth_ids_from_doc()),
            23,
            "expected 23 depth rows in docs/DEPTH.md; check the table, not the outside-routes list",
        )
        self.assertEqual(
            len(route_chain()),
            88,
            "expected 88 pages in the sequence; check the arm and depth chains for a dropped page",
        )

    def test_the_depth_pass_order_is_the_one_depths_doc_prints(self):
        generated = [
            os.path.basename(page["path"])[: -len(".md")]
            for page in generate_next_links.depth_chain()
        ]
        self.assertEqual(
            depth_ids_from_doc(),
            generated,
            "the generated depth order must match docs/DEPTH.md; check generate_next_links.depth_chain",
        )

    def test_every_page_has_exactly_one_block(self):
        for path in route_chain():
            with self.subTest(path=path):
                self.assertTrue(
                    os.path.exists(os.path.join(ROOT, path)),
                    f"{path} is named by the route but does not exist; check the id in route_model",
                )
                block_of(path)  # raises with the count when a page carries none or two

    def test_walking_next_from_p1_visits_the_arm_route_in_order(self):
        chain = arm_chain()
        visited = [chain[0]]
        for expected_next in chain[1:]:
            self.assertEqual(
                links_of(visited[-1]),
                [expected_next],
                f"{visited[-1]} must link to the next arm page; check its next-step block",
            )
            visited.append(expected_next)
        self.assertEqual(
            visited,
            chain,
            "following next from P.1 must visit the arm route in order; check the generated links",
        )

    def test_the_last_arm_page_finishes_the_arm_and_offers_the_depth_pass(self):
        arm = arm_chain()
        block = block_of(arm[-1])
        self.assertIn(
            "finished the arm route",
            block,
            "the last arm page must say the arm is finished; check its next-step block",
        )
        self.assertIn(
            "optional",
            block,
            "expected the last arm page to mark the depth pass optional; check the finish wording",
        )
        self.assertEqual(
            links_of(arm[-1]),
            [depth_chain()[0]],
            "the last arm page must offer the first depth page; check the depth order",
        )

    def test_walking_next_through_the_depth_pass_visits_depths_in_doc_order(self):
        chain = depth_chain()
        visited = [chain[0]]
        for expected_next in chain[1:]:
            self.assertEqual(
                links_of(visited[-1]),
                [expected_next],
                f"{visited[-1]} must link to the next depth page; expected docs/DEPTH.md order",
            )
            visited.append(expected_next)
        self.assertEqual(
            visited,
            chain,
            "the depth walk must match docs/DEPTH.md; check the generated links",
        )

    def test_no_page_points_off_the_route_mid_sequence(self):
        chain = route_chain()
        for path in chain[:-1]:
            with self.subTest(path=path):
                targets = links_of(path)
                self.assertEqual(
                    len(targets), 1, f"{path} must name exactly one next page; check its block"
                )
                self.assertIn(
                    targets[0],
                    chain,
                    f"{path} points off the route at {targets[0]}; expected a routed page",
                )
                self.assertTrue(
                    os.path.exists(os.path.join(ROOT, targets[0])),
                    f"{path} points at a missing file {targets[0]}; check the relative link",
                )

    def test_the_depth_pass_ends_with_the_optional_extensions(self):
        last = route_chain()[-1]
        block = block_of(last)
        self.assertIn(
            "finished the depth pass",
            block,
            "the last depth page must say the depth pass is finished; check its block",
        )
        for target in links_of(last):
            self.assertNotIn(
                target,
                route_chain(),
                f"{last} must not link back into the route at {target}; expected docs/EXTENSIONS.md",
            )
            self.assertTrue(
                os.path.exists(os.path.join(ROOT, target)),
                f"{last} points at a missing file {target}; check the relative link",
            )

    def test_module_pages_keep_the_line_under_their_next_section(self):
        for path in route_chain():
            if not path.startswith("modules/"):
                continue
            with self.subTest(path=path):
                text = read(path)
                heading = text.rfind("## 10. Next modules")
                self.assertGreater(
                    heading,
                    -1,
                    f"{path} lost its required Next modules heading; check the module template",
                )
                self.assertGreater(
                    text.find("<!-- next-step:start -->", heading),
                    heading,
                    f"{path} puts its next step above the heading; expected it below",
                )


if __name__ == "__main__":
    unittest.main()
