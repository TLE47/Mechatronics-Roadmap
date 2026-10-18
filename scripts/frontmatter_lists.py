"""Normalise front-matter fields that are lists.

The same page parses two ways depending on which YAML reader is present:

- with PyYAML, an empty key (`uses:`) is `None`, and `uses: a` is the string `"a"`;
- with the fallback parser in `validate_modules.py`, both are `[]`.

`None` is what broke `validate_modules.py` on a machine that has PyYAML: `set(fm.get("uses", []))`
returned `None`, and the validator crashed instead of reading the page. A default only applies when
the key is *missing*; it does not apply to a key that is present and empty.

Every front-matter list is therefore read through `list_field`, which gives one answer for all four
shapes: missing, empty, scalar, and list. Scalars become a one-item list, because that is what the
author meant; anything else is not a list and is rejected rather than silently iterated.
"""

from __future__ import annotations


def as_list(value):
    """A list for any front-matter shape an author can write for a list-valued key."""
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    raise TypeError(f"front-matter list field holds {type(value).__name__}, which is not a list or scalar")


def list_field(mapping, key):
    """`mapping[key]` as a list, with missing and empty both empty and scalars wrapped."""
    return as_list(mapping.get(key)) if hasattr(mapping, "get") else as_list(mapping[key])
