"""The reader's payloads: what the page says, and what it deliberately does not.

`scripts/generate_lesson_pages.py` is the one place a lesson's Markdown becomes blocks, and the
renderer trusts it: a construct the parser drops silently is content a learner never sees, while a
construct it emits wrong is raw Markdown in the pane. Both are cheap to pin here, without a browser.

The fixtures are one page per concern rather than one real lesson, because a real page changes when
its lesson does; the last test is the one that reads the real tree, and it is the gate's own
property: every committed file equals what its page says now.
"""

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import generate_lesson_pages as pages  # noqa: E402


FIXTURE = """---
title: "Fixture page"
lesson_id: P.99
---

# Lesson P.99: A title the reader does not repeat

<!-- run-callout:start -->
> **Step 1 of 10**
>
> **Run this in the workbench.** [Open MechaLab with `P.99` loaded](https://example.invalid/?lesson=P.99)
<!-- run-callout:end -->

## Goal
First line of the goal,
wrapped onto a second line with `code` and **bold** and a [link](https://example.invalid).

### Idea 1: `K_p`
- **Primary:** one
  - nested with a [label](https://example.invalid/a_(b))
- second
  1. ordered child
  2. another

## Prerequisites
1. first
2. second

```python
print("kept")
```

```mermaid
flowchart LR
  A --> B
```

| Term | Meaning |
| --- | --- |
| `K_p` | gain \\| unit |

> **Safety.** No load without a guard.
>
> Second paragraph of the note.

$$
\\tau = R C
$$

![Arm](../assets/arm.png)

---

### Full Solution
```python
print("the answer")
```

## After the solution
Still read.
"""


class ParseBlocks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.blocks = pages.parse_blocks(FIXTURE)

    def kinds(self):
        return [block["t"] for block in self.blocks]

    def test_generated_callout_and_comment_are_not_content(self):
        flat = json.dumps(self.blocks)
        self.assertNotIn(
            "Open MechaLab with",
            flat,
            "the generated callout must be dropped: check that the reader, not GitHub, is where that link would land",
        )
        self.assertNotIn(
            "Step 1 of 10",
            flat,
            "the ladder's step banner is generated into every page; expected it not to reach the payload",
        )
        self.assertNotIn(
            "run-callout",
            flat,
            "the callout's HTML comment must not survive as a paragraph; check the fence skipping",
        )

    def test_the_h1_is_the_card_title_not_a_heading_block(self):
        headings = [block["x"] for block in self.blocks if block["t"] == "h"]
        self.assertEqual(
            headings,
            ["Goal", "Idea 1: `K_p`", "Prerequisites", "After the solution"],
            "expected h2-h4 headings only: the h1 is the card's title, and repeating it would print it twice",
        )

    def test_a_wrapped_paragraph_stays_one_paragraph(self):
        goal = next(block for block in self.blocks if block["t"] == "p" and block["x"].startswith("First line"))
        self.assertIn(
            "\n",
            goal["x"],
            "expected the source's line break kept in the payload, so the renderer can collapse it as one paragraph",
        )
        self.assertIn(
            "**bold**",
            goal["x"],
            "inline emphasis stays Markdown in the payload; check that the generator does not resolve it early",
        )
        self.assertIn(
            "`code`",
            goal["x"],
            "a code span must survive generation untouched; check that backticks are not eaten as a fence",
        )
        self.assertIn(
            "[link](https://example.invalid)",
            goal["x"],
            "expected a whole inline link, URL included, in one paragraph block",
        )

    def test_nested_lists_keep_their_depth_and_order(self):
        unordered = next(block for block in self.blocks if block["t"] == "ul")
        self.assertEqual(
            [item["d"] for item in unordered["items"]],
            [0, 1, 0, 1, 1],
            "expected depths 0,1,0,1,1: a lost indent turns a nested list into one flat list of peers",
        )
        self.assertIn(
            "(https://example.invalid/a_(b))",
            unordered["items"][1]["x"],
            "check that parentheses inside a link URL survive: a split at the first ')' breaks the target",
        )
        ordered = next(block for block in self.blocks if block["t"] == "ol")
        self.assertEqual(
            [item["x"] for item in ordered["items"]],
            ["first", "second"],
            "expected the numbered list's items in order, without their numbers in the text",
        )

    def test_code_keeps_its_language_and_bytes(self):
        code = [block for block in self.blocks if block["t"] == "code"]
        self.assertEqual(
            [block["lang"] for block in code],
            ["python"],
            "expected only the python fence here: the mermaid fence must not be emitted as code",
        )
        self.assertEqual(
            code[0]["text"],
            'print("kept")',
            "check that a code fence keeps its bytes exactly, without the fence lines or a trailing newline",
        )

    def test_mermaid_is_dropped_rather_than_shown_as_source(self):
        self.assertNotIn(
            "flowchart",
            json.dumps(self.blocks),
            "expected no mermaid source in the payload: the app has no renderer, so it would read as noise",
        )

    def test_a_table_keeps_escaped_pipes_inside_its_cell(self):
        table = next(block for block in self.blocks if block["t"] == "table")
        self.assertEqual(
            table["head"],
            ["Term", "Meaning"],
            "expected the table's two header cells; check that the separator row is not treated as one",
        )
        self.assertEqual(
            table["rows"],
            [["`K_p`", "gain | unit"]],
            "check that an escaped pipe stays inside its cell instead of starting a second column",
        )

    def test_a_blockquote_paragraph_break_is_two_notes(self):
        quotes = [block["x"] for block in self.blocks if block["t"] == "quote"]
        self.assertEqual(
            quotes,
            ["**Safety.** No load without a guard.", "Second paragraph of the note."],
            "expected two quote blocks: check that a blank '>' line splits the note rather than joining it",
        )

    def test_display_math_is_its_own_block(self):
        maths = [block["tex"] for block in self.blocks if block["t"] == "math"]
        self.assertEqual(
            maths,
            ["\\tau = R C"],
            "expected the display formula as its own block, unwrapped from its $$ fences",
        )

    def test_an_image_is_a_block_not_a_paragraph(self):
        images = [block for block in self.blocks if block["t"] == "img"]
        self.assertEqual(
            images,
            [{"t": "img", "src": "../assets/arm.png", "alt": "Arm"}],
            "check that an image becomes its own block: as a paragraph it would print raw Markdown in the pane",
        )

    def test_the_full_solution_is_not_in_the_reading_copy(self):
        flat = json.dumps(self.blocks)
        self.assertNotIn(
            "the answer",
            flat,
            "expected the Full Solution's code to be absent: Load Solution keeps that answer behind one door",
        )
        self.assertNotIn(
            "Full Solution",
            flat,
            "expected the Full Solution heading itself to be skipped, not just its code",
        )
        self.assertIn(
            "After the solution",
            flat,
            "check that the section after the skipped solution still arrives: the skip must end at the next heading",
        )


class RealTree(unittest.TestCase):
    def test_every_registry_entry_has_one_page_and_one_file(self):
        rows = pages.entries()
        self.assertGreater(
            len(rows),
            80,
            "expected the registry to name more than 80 pages; check that the generator reads the registry, not a short glob",
        )
        self.assertEqual(
            len({row["path"] for row in rows}),
            len(rows),
            "expected one payload per page; check that no two entries point at the same Markdown file",
        )
        produced = pages.files()
        self.assertEqual(
            sorted(produced),
            sorted(row["path"][:-3] + ".json" for row in rows),
            "check that every registry entry has exactly one payload file, and no file exists for a dropped page",
        )
        for row in rows:
            payload = json.loads(produced[row["path"][:-3] + ".json"])
            self.assertEqual(
                payload["v"],
                pages.PAYLOAD_VERSION,
                f"check {row['id']}: an older payload version is refused by the app, so it must not be written",
            )
            self.assertEqual(
                payload["path"],
                row["path"],
                f"check {row['id']}: the payload must name its own page, for the source link and the drift gate",
            )
            self.assertTrue(
                payload["blocks"],
                f"expected {row['id']} to render at least one block; an empty payload is a blank pane",
            )
            self.assertTrue(
                any(block["t"] == "h" for block in payload["blocks"]),
                f"expected {row['id']} to have headings; without one it has no anchor to remember the position by",
            )

    def test_an_exercise_reads_the_module_that_set_it(self):
        by_id = {row["id"]: row for row in pages.entries()}
        self.assertEqual(
            by_id["EX.05-control.T2.05a"]["path"],
            "modules/05-control.T2.05a.md",
            "expected an exercise to read the module that set it; check that readerPath falls back to `path`",
        )

    def test_the_committed_tree_is_current(self):
        produced = pages.files()
        have = pages.committed()
        self.assertEqual(
            [name for name in produced if have.get(name) != produced[name]],
            [],
            "expected every committed payload to match its page; check stale files by running scripts/generate_lesson_pages.py",
        )
        self.assertEqual(
            [name for name in have if name not in produced],
            [],
            "expected no orphaned payload files; check that a removed or renamed page took its payload with it",
        )


if __name__ == "__main__":
    unittest.main()
