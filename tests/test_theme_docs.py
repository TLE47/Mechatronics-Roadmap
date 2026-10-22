#!/usr/bin/env python3
"""`docs/THEME.md` against `app/src/index.css`, so the table cannot drift from the palette.

A token reference is only useful while it is true. This page is the one a contributor opens instead of
the stylesheet, so a value typed twice is a value that will one day be two values — the failure this
repository has already paid for once with a hand-typed lesson count beside a generated table.

Three separate promises are checked, because they fail differently:

1. **Every value, in every palette.** Every colour token's dark cell equals its `:root` value, its
   light cell the `[data-theme="light"]` override, and its high-contrast cell the
   `[data-theme="contrast"]` override — or the `:root` value, where a palette deliberately does not
   change (the plot face).
2. **Both directions of coverage.** A token added to the stylesheet without a row here fails, and a
   row for a token the stylesheet no longer defines fails too. Same for the `@theme inline` utilities:
   the page says which family name reaches which property, and every registered family is claimed.
3. **No orphan properties.** Every custom property in `:root` — radii, shadows, type steps, spacing,
   motion — is named somewhere on the page, so a new scale value cannot be invisible to readers.

Run: `python3 tests/test_theme_docs.py` (also covered by the CI unittest discovery).
"""

import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSS = os.path.join(ROOT, "app", "src", "index.css")
DOC = os.path.join(ROOT, "docs", "THEME.md")

# `#rgb`/`#rrggbb`/`#rrggbbaa`, or a bare `rgba(...)`: the shapes that are unambiguously a colour.
# `--shadow-sm` starts with a length and `--ring` with a shadow, so both are correctly excluded here
# and land in the "rest of the scale" section instead.
COLOUR_VALUE = re.compile(r"(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))")
DECLARATION = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")
# Re-pointed by the light block, but not colours: they belong to the scale section of the page.
NON_COLOUR_THEMED = {"--shadow-sm", "--shadow-md", "--shadow-lg", "--ring"}
DARK_ONLY = "—"


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def _block(text: str, opener: str) -> str:
    """The body of the first `<opener> { ... }` block; every block here is one level deep."""
    match = re.search(re.escape(opener) + r"\s*\{(.*?)\n\}", text, re.S)
    if not match:
        raise AssertionError(f"index.css has no `{opener} {{ ... }}` block; the theme layout moved")
    return match.group(1)


def _declarations(block: str) -> dict:
    return {name: value.strip() for name, value in DECLARATION.findall(block)}


def _colour_tokens(block: str) -> dict:
    return {
        name: value
        for name, value in _declarations(block).items()
        if COLOUR_VALUE.fullmatch(value)
    }


def _documented_rows(text: str) -> list:
    """`(token, utility or None, dark, light, contrast)` for every row that opens with a backticked token."""
    rows = []
    for line in text.splitlines():
        if not line.lstrip().startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 6 or not re.fullmatch(r"`--[\w-]+`", cells[0]):
            continue
        token = cells[0].strip("`")
        utility = None if cells[1] == DARK_ONLY else cells[1].strip("`")
        if token and "-" in token:
            rows.append(
                (token, utility, cells[2].strip("`"), cells[3].strip("`"), cells[4].strip("`"))
            )
    return rows


class ThemeDocTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.css = _read(CSS)
        cls.doc = _read(DOC)
        cls.dark = _colour_tokens(_block(cls.css, ":root"))
        cls.light_all = _declarations(_block(cls.css, '[data-theme="light"]'))
        cls.light = {name: value for name, value in cls.light_all.items() if name in cls.dark}
        cls.contrast_all = _declarations(_block(cls.css, '[data-theme="contrast"]'))
        cls.contrast = {name: value for name, value in cls.contrast_all.items() if name in cls.dark}
        cls.root_all = _declarations(_block(cls.css, ":root"))
        cls.theme_map = {
            name: match.group(1)
            for name, value in _declarations(_block(cls.css, "@theme inline")).items()
            if (match := re.fullmatch(r"var\((--[\w-]+)\)", value))
        }
        cls.rows = _documented_rows(cls.doc)

    def test_the_stylesheet_still_has_a_palette(self):
        """A parse that found nothing would make every other test vacuously green."""
        self.assertGreaterEqual(
            len(self.dark), 20,
            "expected the ~25 colour tokens in :root; if this dropped, the block opener or the "
            "declaration regex stopped matching and the value checks below are testing nothing",
        )
        self.assertGreaterEqual(
            len(self.rows), 20,
            "expected a table row per colour token in docs/THEME.md; a reformatted table (five "
            "columns, backticked token first) is what this parser reads",
        )

    def test_every_colour_token_has_exactly_one_row(self):
        documented = [row[0] for row in self.rows]
        self.assertEqual(
            sorted(documented), sorted(self.dark),
            "expected one row per colour token in :root, and no rows for tokens that no longer "
            "exist; add the missing row (both values, the utility family, and what it is for)",
        )
        self.assertEqual(
            len(documented), len(set(documented)),
            "expected each token to appear once; a second row for the same token makes it unclear "
            "which value a contributor should copy",
        )

    def test_each_override_block_only_overrides_the_page(self):
        """Both override blocks re-point the palette, plus the four non-colour tokens the page names."""
        for opener, declarations in (
            ('[data-theme="light"]', self.light_all),
            ('[data-theme="contrast"]', self.contrast_all),
        ):
            undocumented = sorted(set(declarations) - set(self.dark) - NON_COLOUR_THEMED)
            self.assertEqual(
                undocumented, [],
                f"expected the {opener} block to re-point colour tokens (checked against the table) "
                f"or the shadows and ring the page names; a token themed there but missing from "
                f"docs/THEME.md is a palette change no contributor can find",
            )
            self.assertEqual(
                sorted(set(NON_COLOUR_THEMED) - set(declarations)), [],
                f"expected the {opener} block to re-point the shadows and the focus ring too; if one "
                f"was dropped, the page's elevation note is now wrong about that palette",
            )

    def test_dark_values_match_the_stylesheet(self):
        for token, _utility, dark, _light, _contrast in self.rows:
            self.assertEqual(
                dark, self.dark[token],
                f"expected docs/THEME.md to give {token} as {self.dark[token]} in dark mode, but the "
                f"table says {dark}; copy the stylesheet's value rather than a remembered one",
            )

    def test_light_values_match_the_stylesheet(self):
        for token, _utility, _dark, light, _contrast in self.rows:
            expected = self.light.get(token, self.dark[token])
            self.assertEqual(
                light, expected,
                f"expected docs/THEME.md to give {token} as {expected} in light mode, but the table "
                f"says {light}; a token missing from the light block keeps its dark value, which is "
                f"correct only for the plot face",
            )

    def test_contrast_values_match_the_stylesheet(self):
        """The column a reader who asked for contrast relies on — and the one easiest to leave stale."""
        for token, _utility, _dark, _light, contrast in self.rows:
            expected = self.contrast.get(token, self.dark[token])
            self.assertEqual(
                contrast, expected,
                f"expected docs/THEME.md to give {token} as {expected} in high contrast, but the "
                f"table says {contrast}; a token missing from the contrast block keeps its dark "
                f"value, which is correct only for the plot face",
            )

    def test_utility_families_match_theme_inline(self):
        documented = {}
        for token, utility, _dark, _light, _contrast in self.rows:
            if utility is None:
                continue
            self.assertNotIn(
                utility, documented,
                f"expected `{utility}` to name one token; two rows claiming it means one of the "
                f"`bg-`/`text-` prefixes resolves to the wrong colour",
            )
            documented[utility] = token
        self.assertEqual(
            {name: target for name, target in self.theme_map.items() if name.startswith("--color-")},
            {f"--color-{utility}": token for utility, token in documented.items()},
            "expected the page's utility column and `@theme inline` to register the same families; "
            "a family added to the stylesheet without a row here is invisible to the next "
            "contributor, and a row for an unregistered family is a class that silently does nothing",
        )

    def test_tokens_without_a_utility_say_so(self):
        """`--accent-soft` and `--plot-line` are properties only; the page must not invent a class."""
        for token, utility, _dark, _light, _contrast in self.rows:
            families = sorted(
                name for name, target in self.theme_map.items()
                if name.startswith("--color-") and target == token
            )
            if utility is not None:
                self.assertEqual(
                    families, [f"--color-{utility}"],
                    f"expected {token}'s row to name the one family that reaches it; the page "
                    f"says `{utility}`, so `bg-{utility}` would resolve to the wrong token",
                )
                continue
            self.assertEqual(
                families, [],
                f"expected {token} to have no Tailwind family, since its row shows `{DARK_ONLY}`; "
                f"it is registered as {families[0] if families else ''}, so the page is hiding a "
                f"class a contributor could use",
            )
            self.assertIn(
                f"var({token})", self.doc,
                f"expected the page to say how to reach {token} without a utility, since there "
                f"is no Tailwind family for it",
            )

    def test_every_root_property_is_named_on_the_page(self):
        missing = sorted(
            name for name in self.root_all if name not in self.doc
        )
        self.assertEqual(
            missing, [],
            "expected every custom property in :root to be named in docs/THEME.md, including the "
            "radii, shadows, type steps, spacing and motion; a scale value nobody can find is a "
            "value that gets retyped",
        )

    def test_the_page_points_at_the_checks(self):
        """The section is only useful if it says how to run it, and that command must exist."""
        package = _read(os.path.join(ROOT, "package.json"))
        for script in ("test:theme", "test:theme:e2e"):
            self.assertIn(
                f'"{script}"', package,
                f"expected package.json to still define `{script}`, since docs/THEME.md tells a "
                f"contributor to run `npm run {script}`; check the scripts block",
            )
            self.assertIn(
                f"npm run {script}", self.doc,
                f"expected docs/THEME.md to name `npm run {script}`; it is the check that covers "
                f"what this page documents",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
