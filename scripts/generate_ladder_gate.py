#!/usr/bin/env python3
"""Generate the one Track 00 Tier 2 ladder exam that every Tier 2 page renders.

The ladder's exit paper used to exist seven times: each Tier 2 page carried its own hand-copied
questions, so a concept added on one page, a renumbered question or a fixed answer key had to be
repeated by hand and could silently disagree. This script makes the paper a single source -
`QUESTIONS` and `ANSWER_KEY` below - and renders it, byte for byte, into every page's
`### Gate test` section between the `ladder-gate` markers.

Checks, all of them structural:

1. **Every Tier 2 page is listed.** A page on disk that `MODULE_IDS` does not name, or a listed id
   with no page, fails, so a new ladder page cannot quietly carry no paper.
2. **Every page renders the same text.** `--check` fails when a page's block differs from the
   rendered paper, including when the markers are missing.
3. **The paper covers the ladder.** The tags in the questions must equal the union of every ladder
   page's `new_concepts:` - a concept with no question, or a tag for a concept no page teaches,
   fails.
4. **The answer key runs.** The key is executed here, so a paper whose arithmetic no longer
   matches its own asserts fails before it is rendered anywhere.

Usage:
    python3 scripts/generate_ladder_gate.py            # rewrite the block on every ladder page
    python3 scripts/generate_ladder_gate.py --check     # exit 1 if any page is stale
    python3 scripts/generate_ladder_gate.py --json      # machine-readable status

Exit-code family: typed (0 pass, 1 findings, 2 usage).
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULES = os.path.join(ROOT, "modules")

START = "<!-- ladder-gate:start -->"
END = "<!-- ladder-gate:end -->"

# The ladder, in reading order. `T2.00g` and `T2.00h` are the split halves of the original
# `T2.00a` and `T2.00d`; they sit next to the page they were split from.
MODULE_IDS = [
    "00-foundations.T2.00a",
    "00-foundations.T2.00g",
    "00-foundations.T2.00b",
    "00-foundations.T2.00c",
    "00-foundations.T2.00d",
    "00-foundations.T2.00h",
    "00-foundations.T2.00e",
    "00-foundations.T2.00f",
]

PREAMBLE = (
    "This is the exit examination for the whole Track 00 Tier 2 ladder - every "
    "`00-foundations.T2.*` page in [`docs/SYLLABUS.md`](../docs/SYLLABUS.md) - before Step 2.1 "
    "(`00-foundations.T2.01`). Every Tier 2 page renders this same paper, so take it once after "
    "the last of them; the page you are on is only where you found it. Questions 1-6 are the "
    "matrix page's own tools; 7-12 recap each other page once, so nothing on the ladder goes "
    "unexamined."
)

QUESTIONS = [
    {
        "tags": ["matrix_vector_multiplication"],
        "text": "For $A = \\begin{bmatrix} 3.0 & -2.0 \\\\ 1.0 & 4.0 \\end{bmatrix}$ and "
                "$\\vec{x} = [1.5,\\; 2.5]^\\top$, compute **both** entries of $A\\vec{x}$: the first "
                "and the second (tolerances $\\pm 10^{-9}$).",
    },
    {
        "tags": ["matrix_vector_multiplication"],
        "text": "Why does a $2\\times2$ matrix times a length-2 column come out as a column of "
                "length $2$ rather than a $2\\times2$ matrix?",
        "options": [
            "$A\\vec{x}$ is the elementwise product of $A$ and $\\vec{x}$, which keeps $A$'s shape.",
            "Python reshapes $A$ into a column before multiplying.",
            "Each output entry is one row of $A$ dotted with $\\vec{x}$, so there is one output per row.",
            "$\\vec{x}$ is transposed into a row first.",
        ],
        "answer": "C",
    },
    {
        "tags": ["state_vector_one_step_update"],
        "text": "One step of $A_d = \\begin{bmatrix} 1.0 & 0.02 \\\\ -2.0 & 0.80 \\end{bmatrix}$, "
                "$B_d = [0.0,\\; 0.02]^\\top$, from $\\vec{x}_0 = [0.50,\\; 0.0]^\\top$ with "
                "$u_0 = 10.0\\,\\text{N}$ gives $v_1$. Compute $v_1$ in $\\text{m/s}$ "
                "(tolerance $\\pm 10^{-9}$).",
    },
    {
        "tags": ["state_vector_one_step_update"],
        "text": "In the same step, if the position row were evaluated using the *new* velocity, "
                "what would $x_1$ be (tolerance $\\pm 10^{-9}\\,\\text{m}$)?",
    },
    {
        "tags": ["state_vector_one_step_update"],
        "text": "For the two-mass matrix with $m_1 = 1.0\\,\\text{kg}$, $m_2 = 2.0\\,\\text{kg}$, "
                "$k = 50.0\\,\\text{N/m}$, $b = 0$ and $\\Delta t = 0.01\\,\\text{s}$, compute the "
                "first entry of its **fourth** row - the row that updates $v_2$ (tolerance "
                "$\\pm 10^{-9}$).",
    },
    {
        "tags": ["state_vector_one_step_update"],
        "text": "Why do the diagonal $2\\times2$ blocks of the 4-state matrix equal the single-mass "
                "update for each body when $k = b = 0$?",
        "options": [
            "Because the 4-state matrix is always block-diagonal.",
            "Because each mass then obeys the same mass-spring-damper form with its own mass and "
            "damping, and the coupling terms vanish.",
            "Because $B_d$ only pushes $m_1$.",
            "Because the Euler update is exact.",
        ],
        "answer": "B",
    },
    {
        "tags": ["finite_difference_derivative_and_integral"],
        "text": "An encoder reads $x_{k-1} = 0.24\\,\\text{rad}$ and $x_k = 0.30\\,\\text{rad}$ at "
                "$\\Delta t = 0.002\\,\\text{s}$. Compute the backward-difference velocity in "
                "$\\text{rad/s}$ (tolerance $\\pm 10^{-9}$).",
    },
    {
        "tags": ["dot_product_projection", "cross_product_3d_moment",
                 "basis_change_and_invertibility"],
        "text": "Which triple is correct for `00-foundations.T2.00b`?",
        "options": [
            "The projection uses the raw lever so force grows with its length, "
            "$\\vec{r}\\times\\vec{F} = \\vec{F}\\times\\vec{r}$, and a zero determinant means a "
            "valid basis.",
            "The projection divides by $\\|\\vec{r}\\|$ twice, the moment is a scalar, and the "
            "determinant is always positive.",
            "The dot product returns a vector, the cross product is symmetric, and the determinant "
            "equals the trace.",
            "The projection uses the lever's *unit* direction, the moment is "
            "$\\vec{r}\\times\\vec{F}$ (anti-commutative), and a zero determinant means the two "
            "columns are collinear.",
        ],
        "answer": "D",
    },
    {
        "tags": ["first_order_ode_time_constant", "second_order_ode_wn_zeta",
                 "characteristic_polynomial_roots"],
        "text": "For `00-foundations.T2.00c`'s joint with $J = 0.02\\,\\text{kg}\\cdot\\text{m}^2$, "
                "$k = 8.0\\,\\text{N}\\cdot\\text{m/rad}$ and "
                "$b = 0.60\\,\\text{N}\\cdot\\text{m}\\cdot\\text{s/rad}$, compute the damping ratio "
                "$\\zeta = b/(2\\sqrt{Jk})$ (tolerance $\\pm 10^{-9}$).",
    },
    {
        "tags": ["complex_numbers_and_euler_formula", "complex_impedance_and_transfer_function",
                 "bode_magnitude_db_and_phase"],
        "text": "A series RL winding has $R = 4.0\\ \\Omega$ and $L = 2.0\\,\\text{mH}$ and is "
                "driven at $\\omega = 2000\\,\\text{rad/s}$. Compute $|Z|$ in ohms, then "
                "$20\\log_{10}|H|$ at the corner $\\omega = 1/\\tau$ of a first-order filter "
                "(tolerances $\\pm 10^{-9}\\,\\Omega$ and $\\pm 10^{-4}\\,\\text{dB}$).",
    },
    {
        "tags": ["laplace_poles_and_zeros", "continuous_state_space_matrices",
                 "discrete_state_transition_euler_tustin"],
        "text": "For `00-foundations.T2.00e`'s $A = \\begin{bmatrix} 0 & 1 \\\\ -100 & -4 "
                "\\end{bmatrix}$ sampled at $T_s = 0.05\\,\\text{s}$, compute the spectral radius of "
                "the Forward-Euler map $A_d = I + A T_s$ (tolerance $\\pm 10^{-6}$).",
    },
    {
        "tags": ["nyquist_sampling_and_aliasing", "tustin_frequency_prewarping_and_biquad",
                 "gaussian_variance_and_covariance_matrix"],
        "text": "Which triple is correct for `00-foundations.T2.00f`?",
        "options": [
            "Sampling represents any frequency, aliasing affects only DC, and Tustin never warps.",
            "Sampling represents only frequencies up to $f_s/2$, a faster tone folds to "
            "$|f - k f_s|$, and pre-warping lifts the analog target so the digital notch lands on "
            "$f_0$.",
            "The Nyquist frequency is $f_s$, aliasing doubles the frequency, and pre-warping is a "
            "gain correction.",
            "Covariance is a scalar, the sample rate is irrelevant to stability, and every bilinear "
            "pole lands outside the unit circle.",
        ],
        "answer": "B",
    },
]

ANSWER_KEY = '''import math

# Q1-Q6: the matrix page. Two entries, evaluated one row at a time: the paper asks for both so a
# reader who reads the maths (1-indexed) and one who reads Python (0-indexed) agree on the answer.
g1_ax_first = 3.0 * 1.5 + (-2.0) * 2.5
g1_ax_second = 1.0 * 1.5 + 4.0 * 2.5
g2_choice = "C"
g3_v1 = -2.0 * 0.50 + 0.80 * 0.0 + 0.02 * 10.0
g4_x1_new_v = 1.0 * 0.50 + 0.02 * (-0.80)
g5_row4_first = (50.0 / 2.0) * 0.01
g6_choice = "B"

# Q7: the derivative page.
g7_velocity = (0.30 - 0.24) / 0.002

# Q8-Q12: one question per remaining page.
g8_choice = "D"
g9_zeta = 0.60 / (2.0 * math.sqrt(0.02 * 8.0))
g10_z_ohm = abs(4.0 + 1j * 2000.0 * 0.002)
g10_corner_db = 20.0 * math.log10(1.0 / math.sqrt(2.0))
Ad_euler = [[1.0, 0.05], [-5.0, 0.80]]
g11_radius = math.sqrt(Ad_euler[0][0] * Ad_euler[1][1] - Ad_euler[0][1] * Ad_euler[1][0])
g12_choice = "B"

assert math.isclose(g1_ax_first, -0.5, rel_tol=1e-9)
assert math.isclose(g1_ax_second, 11.5, rel_tol=1e-9)
assert g2_choice == "C"
assert math.isclose(g3_v1, -0.80, rel_tol=1e-9)
assert math.isclose(g4_x1_new_v, 0.484, rel_tol=1e-9)
assert math.isclose(g5_row4_first, 0.25, rel_tol=1e-9)
assert g6_choice == "B"
assert math.isclose(g7_velocity, 30.0, rel_tol=1e-9)
assert g8_choice == "D"
assert math.isclose(g9_zeta, 0.75, rel_tol=1e-9)
assert math.isclose(g10_z_ohm, 5.656854249492381, rel_tol=1e-9)
assert math.isclose(g10_corner_db, -3.0103, abs_tol=1e-4)
assert math.isclose(g11_radius, 1.024695, abs_tol=1e-6)
assert g12_choice == "B"

print("gate key: Ax=[%.1f, %.1f], v1=%.2f m/s, x1(new v)=%.3f m, radius=%.6f"
      % (g1_ax_first, g1_ax_second, g3_v1, g4_x1_new_v, g11_radius))
'''

MODULE_ID_RE = re.compile(r"^\d{2}-[a-z0-9-]+\.T[123]\.\d{2}[a-z]?$")
GATE_SCORE = re.compile(r"\$?\d+/\d+\$?")


def front_matter(text):
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    data = {"new_concepts": []}
    if not match:
        return data
    key = None
    for line in match.group(1).splitlines():
        if line.startswith("  - ") and key:
            data[key].append(line[4:].strip().strip('"'))
        elif ":" in line and not line.startswith(" "):
            name, _, value = line.partition(":")
            name = name.strip()
            if value.strip() == "":
                key = name
                data[name] = []
            else:
                key = None
                data[name] = value.strip().strip('"')
    return data


def page_path(module_id):
    return os.path.join(MODULES, module_id + ".md")


def render():
    """The paper's markdown, identical on every ladder page."""
    lines = [START, PREAMBLE, ""]
    for index, question in enumerate(QUESTIONS, start=1):
        tags = " ".join("[Concept: %s]" % tag for tag in question["tags"])
        lines.append("%d. `%s` %s" % (index, tags, question["text"]))
        for letter, option in zip("ABCD", question.get("options", [])):
            lines.append("   - **%s.** %s" % (letter, option))
    lines += ["", "**Gate answer key:**", "```python", ANSWER_KEY.rstrip("\n"), "```"]
    lines.append(
        "- **Pass mark:** $\\ge 10/12$. Every question is answered by the page named in its tags; "
        "the ladder is closed when this paper is passed once, after the last Tier 2 page."
    )
    lines.append(END)
    return "\n".join(lines)


def ladder_concepts():
    """Every `new_concepts:` entry on the ladder, with the page that declares it."""
    concepts = {}
    for module_id in MODULE_IDS:
        path = page_path(module_id)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            for concept in front_matter(handle.read())["new_concepts"]:
                concepts.setdefault(concept, module_id)
    return concepts


def paper_concepts():
    return {tag for question in QUESTIONS for tag in question["tags"]}


def check_answer_key():
    """Run the key in an empty namespace; a non-zero exit or raised assert is a finding."""
    import contextlib
    import io

    # The key prints a summary line. Capture it: `--check` stdout is a verdict, not a transcript.
    with contextlib.redirect_stdout(io.StringIO()):
        try:
            exec(compile(ANSWER_KEY, "<gate answer key>", "exec"), {"__name__": "gate_key"})
        except Exception as error:  # noqa: BLE001 - any failure here is the finding
            return ["the answer key does not run: %s: %s" % (type(error).__name__, error)]
    return []


def block_bounds(text):
    start = text.find(START)
    end = text.find(END)
    if start < 0 or end < 0 or end < start:
        return None
    return start, end + len(END)


def score_restatements(text):
    """Fractions a page attaches to the gate itself, from outside the generated block.

    The paper's own pass mark is the only copy of its score. A page that restates a count outside
    the block is the hand-copied defect returning: `00-foundations.T2.00f` still read
    "$7/8$ on the Ladder Gate test" long after the paper became twelve questions. A page's own
    Skip-test score is not the gate's and is left alone.
    """
    bounds = block_bounds(text)
    outside = text if bounds is None else text[:bounds[0]] + text[bounds[1]:]
    found = []
    for line in outside.splitlines():
        if "gate" not in line.lower():
            continue
        for match in GATE_SCORE.finditer(line):
            if "skip test" in line[match.end():match.end() + 40].lower():
                continue
            found.append(match.group(0))
    return found


def scan():
    """`(blocking, stale, rows, declared)`.

    Blocking findings are structural - a page with no markers, a concept with no question, a key
    that does not run - and stop both modes. Stale pages are the normal case before a render, and
    only `--check` treats them as a failure; `--apply` is what fixes them.
    """
    findings = []
    stale = []
    rows = []
    on_disk = set()
    for name in os.listdir(MODULES):
        if not name.endswith(".md"):
            continue
        path = os.path.join(MODULES, name)
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
        meta = front_matter(text)
        if meta.get("tier") == "2" and str(meta.get("track")) == "00":
            on_disk.add(name[:-3])
    for module_id in sorted(on_disk - set(MODULE_IDS)):
        findings.append("%s is a Tier 2 page with no ladder entry here" % module_id)
    for module_id in MODULE_IDS:
        if module_id not in on_disk:
            findings.append("%s is listed here but has no page" % module_id)
            rows.append({"module": module_id, "status": "no page"})
            continue
        with open(page_path(module_id), "r", encoding="utf-8") as handle:
            text = handle.read()
        if "### Gate test" not in text:
            findings.append("%s has no `### Gate test` section" % module_id)
            rows.append({"module": module_id, "status": "no gate section"})
            continue
        bounds = block_bounds(text)
        if bounds is None:
            findings.append("%s has no ladder-gate markers" % module_id)
            rows.append({"module": module_id, "status": "no markers"})
            continue
        for fraction in score_restatements(text):
            findings.append(
                "%s restates the gate's score outside the generated block (%s)"
                % (module_id, fraction)
            )
        current = text[bounds[0]:bounds[1]]
        status = "current" if current == render() else "stale"
        if status == "stale":
            stale.append("%s renders a different gate paper" % module_id)
        rows.append({"module": module_id, "status": status})

    declared = ladder_concepts()
    missing = sorted(set(declared) - paper_concepts())
    unknown = sorted(paper_concepts() - set(declared))
    for concept in missing:
        findings.append("no question tags `%s` (declared by %s)" % (concept, declared[concept]))
    for concept in unknown:
        findings.append("question tags `%s`, which no ladder page declares" % concept)
    findings += check_answer_key()
    return findings, stale, rows, declared


def apply():
    paper = render()
    changed = []
    for module_id in MODULE_IDS:
        path = page_path(module_id)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as handle:
            text = handle.read()
        bounds = block_bounds(text)
        if bounds is None:
            continue
        new_text = text[:bounds[0]] + paper + text[bounds[1]:]
        if new_text != text:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(new_text)
            changed.append(module_id)
    return changed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 when a page is stale")
    parser.add_argument("--json", action="store_true", help="machine-readable status")
    args = parser.parse_args(argv)

    findings, stale, rows, declared = scan()
    if args.json:
        print(json.dumps({"pages": rows, "concepts": sorted(declared),
                          "findings": findings, "stale": stale}, indent=2))
    elif args.check:
        if findings or stale:
            print("FAIL: the ladder gate is not in step:", file=sys.stderr)
            for finding in findings + stale:
                print("  - %s" % finding, file=sys.stderr)
            return 1
        print("OK: %d pages render the same %d-question paper, covering all %d ladder concepts."
              % (len(rows), len(QUESTIONS), len(declared)))
    else:
        if findings:
            print("FAIL: cannot render a paper that does not check out:", file=sys.stderr)
            for finding in findings:
                print("  - %s" % finding, file=sys.stderr)
            return 1
        changed = apply()
        print("rendered the %d-question paper into %d page(s); %d changed."
              % (len(QUESTIONS), len(MODULE_IDS), len(changed)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
