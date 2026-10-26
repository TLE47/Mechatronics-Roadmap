#!/usr/bin/env python3
"""A YAML subset loader, so the content build needs no package (`scripts/mini_yaml.py`).

Why this exists: `content/` is YAML because it is meant to be reviewed by a person, and the build
runs in CI's Python 3.12 toolcache — which does not ship PyYAML. The alternative was a `pip install`
in the repository's one dependency-free job, or rewriting the content as JSON and losing the comments
that explain each rule. Neither is worth it for the small, regular shape these files use.

So this module reads exactly the subset the content files are written in, and **refuses anything
else** rather than guessing:

  * block mappings and block sequences, nested by indentation;
  * `key: value` and `- value` / `- key: value` (a mapping inside a sequence);
  * flow sequences `[a, b]` and flow mappings `{ id: x, label: "a, b" }`;
  * single- and double-quoted scalars, integers, floats, `true`/`false`, `null`;
  * comments from an unquoted `#` that follows a space or starts a line.

A literal block (`|`, `>`), an anchor, a tag or a multi-line flow collection is an error, because
silently reading one as a string would put the wrong rule into a reward. `build_content.py` prefers
PyYAML when it is installed, and `tests/test_content_build.py` compares the two on every committed
file, so the fallback cannot drift from the real thing unnoticed.
"""

from __future__ import annotations

import json
import re

__all__ = ["load", "MiniYamlError"]


class MiniYamlError(ValueError):
    """The file uses something outside the supported subset, or is not well formed."""


_INT = re.compile(r"^-?\d+$")
_FLOAT = re.compile(r"^-?\d+\.\d+$")

# A quote only *opens* a quoted scalar at the start of one. In `H-7's status light` the apostrophe is
# plain text; treating it as a quote would swallow the rest of the file (and YAML does not either).
_OPENS_AFTER = set(" \t:{[,(-")


def _opens_quote(text: str, index: int) -> bool:
    return index == 0 or text[index - 1] in _OPENS_AFTER


def _strip_comment(line: str, where: str) -> str:
    """The line up to an unquoted `#` that follows a space (or starts the line)."""
    quote = None
    for index, char in enumerate(line):
        if quote:
            # A quote closes unless it is escaped; the backslash itself is skipped by the lookback.
            if char == quote and (index == 0 or line[index - 1] != "\\"):
                quote = None
            continue
        if char in ("'", '"') and _opens_quote(line, index):
            quote = char
            continue
        if char == "#" and (index == 0 or line[index - 1].isspace()):
            return line[:index]
    if quote:
        raise MiniYamlError(f"{where}: a quoted scalar is not closed")
    return line


def _split_flow(text: str, delimiter: str = ",") -> list[str]:
    """Split a flow collection on `delimiter` outside quotes, brackets and braces."""
    parts: list[str] = []
    depth = 0
    quote = None
    start = 0
    for index, char in enumerate(text):
        if quote:
            if char == quote and (index == 0 or text[index - 1] != "\\"):
                quote = None
            continue
        if char in ("'", '"') and _opens_quote(text, index):
            quote = char
        elif char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
        elif char == delimiter and depth == 0:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return [part.strip() for part in parts if part.strip()]


def _key_value(text: str, where: str) -> tuple[str, str] | None:
    """`key: rest`, or None when the text is a plain scalar. A colon must be followed by a space."""
    quote = None
    depth = 0
    for index, char in enumerate(text):
        if quote:
            if char == quote and (index == 0 or text[index - 1] != "\\"):
                quote = None
            continue
        if char in ("'", '"') and _opens_quote(text, index):
            quote = char
            continue
        if char in "[{":
            depth += 1
            continue
        if char in "]}":
            depth -= 1
            continue
        # A colon inside a flow collection is that collection's, not this line's.
        if char == ":" and depth == 0 and (index + 1 == len(text) or text[index + 1].isspace()):
            key = text[:index].strip()
            if not key:
                raise MiniYamlError(f"{where}: a mapping entry has no key")
            return key, text[index + 1 :].strip()
    return None


def _scalar(text: str, where: str) -> object:
    text = text.strip()
    if not text:
        return None
    if text.startswith("|") or text.startswith(">"):
        raise MiniYamlError(f"{where}: literal and folded blocks are not supported; quote the text")
    if text.startswith("&") or text.startswith("*") or text.startswith("!"):
        raise MiniYamlError(f"{where}: anchors, aliases and tags are not supported")
    if text.startswith("["):
        if not text.endswith("]"):
            raise MiniYamlError(f"{where}: a flow sequence is not closed (multi-line flow is not supported)")
        return [_scalar(part, where) for part in _split_flow(text[1:-1])]
    if text.startswith("{"):
        if not text.endswith("}"):
            raise MiniYamlError(f"{where}: a flow mapping is not closed (multi-line flow is not supported)")
        mapping: dict[str, object] = {}
        for part in _split_flow(text[1:-1]):
            pair = _key_value(part, where)
            if pair is None:
                raise MiniYamlError(f"{where}: flow mapping entry {part!r} is not `key: value`")
            mapping[pair[0]] = _scalar(pair[1], where)
        return mapping
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ("'", '"'):
        if text[0] == '"':
            try:
                return json.loads(text)
            except json.JSONDecodeError as error:
                raise MiniYamlError(f"{where}: {error}") from error
        return text[1:-1].replace("''", "'")
    if text in ("true", "True"):
        return True
    if text in ("false", "False"):
        return False
    if text in ("null", "Null", "~"):
        return None
    if _INT.match(text):
        return int(text)
    if _FLOAT.match(text):
        return float(text)
    return text


class _Line:
    __slots__ = ("indent", "text", "number")

    def __init__(self, indent: int, text: str, number: int) -> None:
        self.indent = indent
        self.text = text
        self.number = number


def _read_lines(text: str) -> list[_Line]:
    lines: list[_Line] = []
    raw_lines = text.splitlines()
    for number, raw in enumerate(raw_lines, start=1):
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise MiniYamlError(f"line {number}: indentation must be spaces, not tabs")
        stripped = _strip_comment(raw, f"line {number}").rstrip()
        if not stripped.strip():
            continue
        indent = len(stripped) - len(stripped.lstrip(" "))
        lines.append(_Line(indent, stripped.strip(), number))
    return lines


def _parse_mapping(lines: list[_Line], index: int, indent: int, seed: tuple[str, str] | None = None) -> tuple[dict, int]:
    mapping: dict[str, object] = {}
    if seed is not None:
        key, rest = seed
        if rest:
            mapping[key] = _scalar(rest, f"line {lines[index].number}")
            index += 1
        else:
            index += 1
            if index < len(lines) and lines[index].indent > indent:
                value, index = _parse_block(lines, index, lines[index].indent)
                mapping[key] = value
            else:
                mapping[key] = None
    while index < len(lines):
        line = lines[index]
        if line.indent < indent:
            break
        if line.indent > indent:
            raise MiniYamlError(f"line {line.number}: unexpected indentation")
        if line.text.startswith("- "):
            break
        pair = _key_value(line.text, f"line {line.number}")
        if pair is None:
            raise MiniYamlError(f"line {line.number}: expected `key: value`, found {line.text!r}")
        key, rest = pair
        if key in mapping:
            raise MiniYamlError(f"line {line.number}: duplicate key {key!r}")
        if rest:
            mapping[key] = _scalar(rest, f"line {line.number}")
            index += 1
        else:
            index += 1
            if index < len(lines) and lines[index].indent > indent:
                value, index = _parse_block(lines, index, lines[index].indent)
                mapping[key] = value
            else:
                mapping[key] = None
    return mapping, index


def _parse_sequence(lines: list[_Line], index: int, indent: int) -> tuple[list, int]:
    items: list[object] = []
    while index < len(lines):
        line = lines[index]
        if line.indent != indent or not line.text.startswith("- "):
            if line.indent > indent:
                raise MiniYamlError(f"line {line.number}: unexpected indentation")
            break
        body = line.text[2:].strip()
        pair = _key_value(body, f"line {line.number}")
        if pair is None:
            items.append(_scalar(body, f"line {line.number}"))
            index += 1
            continue
        # A mapping inside a sequence: its keys continue at the sequence's indent + 2.
        item, index = _parse_mapping(lines, index, indent + 2, seed=pair)
        items.append(item)
    return items, index


def _parse_block(lines: list[_Line], index: int, indent: int) -> tuple[object, int]:
    if lines[index].text.startswith("- "):
        return _parse_sequence(lines, index, indent)
    return _parse_mapping(lines, index, indent)


def load(text: str) -> object:
    """Parse the supported subset, or raise MiniYamlError with the line that left it."""
    lines = _read_lines(text)
    if not lines:
        return None
    value, index = _parse_block(lines, 0, lines[0].indent)
    if index != len(lines):
        raise MiniYamlError(f"line {lines[index].number}: trailing content")
    return value
