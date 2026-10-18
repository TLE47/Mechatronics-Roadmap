"""Read a module's teaching body, without the generated ladder-gate block.

`scripts/generate_ladder_gate.py` renders one identical paper onto every Tier 2 page. That block
names every ladder concept, so any check that searches page text for evidence would find the whole
vocabulary on every page and confirm nothing: the crosswalk, the mention audit and the prerequisite
audit all measure what a page *teaches*, and a block that is byte-identical everywhere is not
evidence of teaching. Strip it before searching.
"""

import re

GENERATED = re.compile(
    r"<!--\s*ladder-gate:start\s*-->.*?<!--\s*ladder-gate:end\s*-->",
    re.DOTALL,
)
FRONT_MATTER = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)


def strip_generated(text):
    """`text` with the generated ladder-gate block removed."""
    return GENERATED.sub("", text)


def page_body(path, keep_front_matter=False):
    """A page's text with the generated block removed (and front matter too, by default)."""
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    if not keep_front_matter:
        text = FRONT_MATTER.sub("", text)
    return strip_generated(text)
