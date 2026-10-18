# Contributing to the MechaLab Mechatronics & Robotics Curriculum

Thank you for helping improve the MechaLab Open-Source Curriculum & Interactive Workbench! Every lesson, bridge module, and simulation lab in this repository is continuously verified in automated CI so learners never hit broken equations, dead links, or stale numerical outputs.

```mermaid
flowchart LR
    Fork["1. Edit Lesson / Module / Sim"] --> Lint["2. Run Local Verification Suite"]
    Lint --> Test["3. Verify Expected Output Diffs"]
    Test --> PR["4. Open Pull Request"]
```

---

## 1. Reporting an Error in a Lesson or Module

Found a typo, a confusing explanation, a hardware rating discrepancy, or a numerical mismatch?
- Open an issue using the **[Report an Error in a Lesson or Module](.github/ISSUE_TEMPLATE/lesson-error.md)** template.
- Include the exact lesson/module ID (e.g., `Lesson 01.2`, `05-control.T1.05a`), the line or section heading, what the text currently says, and what you observed when running the code or checking the datasheet.
- If the failure is a *learner* failure rather than a typo, check [`docs/ERROR_EXPLAINER.md`](docs/ERROR_EXPLAINER.md) first; if your failure is missing from its fifteen entries, that is a gap worth an issue, because the entry needs the page that teaches it.

---

## 2. Pedagogical & Structural Rules for Beginner Lessons (`Track P`, `Stage 0`, `Tracks 00–08` Tier 1)

All beginner lessons are enforced by `scripts/lint_lessons.py` and `scripts/check_term_order.py`:
1. **Maximum 2 New Ideas per Lesson:** Declared in YAML front matter (`ideas:`) and matched against `### Idea 1` / `### Idea 2` and `### Bridge Notes`. Do not sneak undeclared third topics into Bridge Notes.
2. **Term Order Discipline:** Every bolded technical term must be defined in `resources/glossary.md` in or before the earliest lesson (in path order) that uses it (`python3 scripts/check_term_order.py`).
3. **Link-First, Self-Contained Exercises:**
   - Every idea links to a free, static primary resource with verified HTML section headings (or marks client-rendered SPAs with `[verify in-app]`).
   - Every lesson includes runnable **Starter Code**, a 3-step **Progressive Hint Ladder**, a **Full Solution** that prints deterministic output matching the **Expected Output** block character-for-character, and a 3-question **Check yourself** quiz with worked answers.
4. **Clean TeX Authoring:** Write standard, clean LaTeX (`$V_{\text{out}}$`, `$\tau = R C$`). Never insert `kern0pt` or raw `\_` underscore hacks inside math text groups; run `python3 scripts/clean_tex.py --check` and `node scripts/audit_math.mjs` to verify both GitHub MathJax and KaTeX rendering.
5. **Beginner evidence:** a claim that beginners can finish needs a beginner sitting. The protocol is [`docs/PILOT.md`](docs/PILOT.md), the aggregate sheet is [`docs/pilot-results.md`](docs/pilot-results.md), and until a pilot runs both say N = 0 — author-dogfood finds bugs but cannot measure beginner difficulty.

---

## 3. Running the Verification Suite Locally

Before submitting a Pull Request, run the verification scripts from the repository root:

```bash
# 1. Verify repository structure, links, Mermaid diagrams, and clean TeX math hygiene
python3 scripts/verify_repo.py
node scripts/audit_math.mjs

# 2. Verify all 72 modules, prerequisite DAG, index counts, and exact Expected Output stdout diffs
python3 scripts/validate_modules.py

# 3. Verify all beginner lessons (<=2 ideas, template sections, glossary term order, and exercise solutions)
python3 scripts/lint_lessons.py
python3 scripts/check_term_order.py

# Every suite in one run (add -v for the per-test list)
python3 -m unittest discover -s tests

# 4. Run all Python & C++20 reference labs (Labs 00–08)
python3 scripts/run_all_labs.py

# 5. Typecheck and build the interactive Vite workbench
npm run lint
npm run build
```

---

## 4. Licensing of Contributions

By submitting a pull request or issue, you agree that your documentation contributions are licensed under **CC BY 4.0** and your code contributions are licensed under the **MIT License**, as detailed in [`LICENSE`](LICENSE).
