#!/usr/bin/env python3
"""Tests for the host C++ verifier's header discovery.

`scripts/extract_and_compile_sketches.py` compiles the Arduino sketches with the host `g++`. On a
macOS host whose Command Line Tools ship an empty `<CLT>/usr/include/c++/v1`, `<cstdio>` is not on
the default search path and every sketch fails to compile for a reason that has nothing to do with
the sketch. `cxx_include_flags` probes first and only then adds the SDK's own libc++ directory.

The tests use fake compilers, so they pass on a healthy toolchain as well as a broken one:

  * a compiler that already finds `<cstdio>` gets no extra flags - the repair must not touch a
    working environment;
  * a compiler that only succeeds with `-isystem <dir>` gets exactly that flag;
  * a compiler that fails either way, or a candidate directory without `cstdio`, gets nothing,
    so a genuinely broken toolchain still fails loudly instead of being papered over.

Run: `python3 tests/test_sketch_host_verify.py` (also discovered by `python3 -m unittest discover
-s tests`).
"""

import os
import stat
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import extract_and_compile_sketches as verifier  # noqa: E402  (path set up above)

# A compiler that succeeds only when a `-isystem` flag points at the directory it was told about.
FAKE_COMPILER = """#!/bin/sh
for arg in "$@"; do
    if [ "$arg" = "-isystem" ]; then
        exit 0
    fi
done
exit 1
"""

ALWAYS_OK = "#!/bin/sh\nexit 0\n"


def _write_exe(directory: str, name: str, body: str) -> str:
    path = os.path.join(directory, name)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(body)
    os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)
    return path


class IncludeFlagTests(unittest.TestCase):
    def test_a_working_compiler_gets_no_extra_flags(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            compiler = _write_exe(tmpdir, "cxx", ALWAYS_OK)
            self.assertEqual(
                verifier.cxx_include_flags(compiler, candidates=[tmpdir]),
                [],
                "expected no extra include flags from a compiler that already finds <cstdio>; "
                "check the probe's success branch, which must return before adding -isystem",
            )

    def test_a_broken_toolchain_gets_the_sdk_headers(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            compiler = _write_exe(tmpdir, "cxx", FAKE_COMPILER)
            sdk_v1 = os.path.join(tmpdir, "sdk", "c++", "v1")
            os.makedirs(sdk_v1)
            open(os.path.join(sdk_v1, "cstdio"), "w").close()
            self.assertEqual(
                verifier.cxx_include_flags(compiler, candidates=[sdk_v1]),
                ["-isystem", sdk_v1],
                "expected -isystem pointing at the SDK's libc++ dir, because that is the only "
                "invocation the fake compiler accepts; check the flag order and the probe call",
            )

    def test_a_candidate_without_cstdio_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            compiler = _write_exe(tmpdir, "cxx", FAKE_COMPILER)
            empty = os.path.join(tmpdir, "empty")
            os.makedirs(empty)
            good = os.path.join(tmpdir, "good")
            os.makedirs(good)
            open(os.path.join(good, "cstdio"), "w").close()
            self.assertEqual(
                verifier.cxx_include_flags(compiler, candidates=[empty, good]),
                ["-isystem", good],
                "expected the empty candidate skipped and the one holding cstdio used; check "
                "the os.path.isfile(cstdio) filter, which is what keeps a stub dir out",
            )

    def test_a_hopeless_compiler_gets_nothing(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            compiler = _write_exe(tmpdir, "cxx", "#!/bin/sh\nexit 1\n")
            sdk_v1 = os.path.join(tmpdir, "sdk", "c++", "v1")
            os.makedirs(sdk_v1)
            open(os.path.join(sdk_v1, "cstdio"), "w").close()
            self.assertEqual(
                verifier.cxx_include_flags(compiler, candidates=[sdk_v1]),
                [],
                "expected no flags for a compiler that fails with -isystem too; returning a "
                "flag here would paper over a broken toolchain instead of letting it fail",
            )

    def test_no_candidates_at_all_is_not_a_crash(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            compiler = _write_exe(tmpdir, "cxx", FAKE_COMPILER)
            self.assertEqual(
                verifier.cxx_include_flags(compiler, candidates=[]),
                [],
                "expected [] rather than an exception when no candidate dirs exist; check the "
                "loop's empty case, since a crash here would break the caller on a bare host",
            )


if __name__ == "__main__":
    unittest.main()
