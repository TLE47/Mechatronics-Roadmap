#!/usr/bin/env python3
"""The one time model for atomic micro-learning (`scripts/micro_timing.py`).

The 120-second ceiling is a design claim, not a stopwatch reading. This module is the claim's
arithmetic: authored estimates live in `micro/P.1.json`, and the generator computes a modelled
worst case from the words, code lines, options and feedback the learner actually has to process.
Keeping the constants here means the content gate, the generator and `tests/test_micro.py` cannot
quietly model three different lessons.

Evidence has two clocks (`app/src/micro/timer.ts`):

- `visibleSeconds` is wall-clock while the activity is on screen;
- `adjustedSeconds` caps each inactivity gap at 90 s, so a learner called away is not punished.

This module only models *designed* workload. The 90-second cap is runtime behaviour.
"""

from __future__ import annotations

import math

# Reading and interaction constants. The values are deliberately plain: a beginner reads about
# three words a second, needs a beat per option, and needs a moment to read feedback.
READING_WORDS_PER_SECOND = 3.2
QUESTION_BASE_SECONDS = 2.5
OPTION_READ_SECONDS = 1.1
FEEDBACK_SECONDS = 4.0
CODE_LINE_SECONDS = 1.2
WORKED_EXAMPLE_SECONDS = 14.0
PRACTICE_QUESTION_SECONDS = 8.0
CHALLENGE_SECONDS = 38.0
REVIEW_QUESTION_SECONDS = 14.0

MAX_DESIGNED_SECONDS = 120.0
MAX_AUTHOR_MODEL_DIVERGENCE = 0.20
REVIEW_SIZE = 2
INACTIVITY_CAP_SECONDS = 90
VISIBLE_OVER_TARGET_SECONDS = 180


def words(value: str) -> int:
    return len(value.split())


def _question_seconds(question: dict) -> float:
    options = question.get("options") or []
    return QUESTION_BASE_SECONDS + len(options) * OPTION_READ_SECONDS + FEEDBACK_SECONDS


def _code_lines(value: str | None) -> int:
    if not value:
        return 0
    return len([line for line in value.splitlines() if line.strip()])


def learn_seconds(concept: dict) -> float:
    """Worst-case Learn: teaching, worked example, two diagnostics and practice."""
    teaching_words = sum(words(text) for text in concept.get("teaching", []))
    example_lines = _code_lines((concept.get("example") or {}).get("code"))
    diagnostics = sum(_question_seconds(question) for question in concept.get("diagnostics", []))
    practice = PRACTICE_QUESTION_SECONDS + _question_seconds(concept["practice"])
    total = (
        teaching_words / READING_WORDS_PER_SECOND
        + example_lines * CODE_LINE_SECONDS
        + WORKED_EXAMPLE_SECONDS
        + diagnostics
        + practice
    )
    return round(total, 1)


def review_seconds(concept: dict) -> float:
    """The worst rotation set: two questions, each with feedback."""
    return round(REVIEW_SIZE * REVIEW_QUESTION_SECONDS + REVIEW_SIZE * FEEDBACK_SECONDS, 1)


def challenge_seconds(concept: dict) -> float:
    return round(CHALLENGE_SECONDS + _question_seconds(concept["challenge"]), 1)


def modeled(concept: dict) -> dict:
    return {
        "learn": learn_seconds(concept),
        "review": review_seconds(concept),
        "challenge": challenge_seconds(concept),
    }


def authored(concept: dict) -> dict:
    timing = concept.get("timing") or {}
    return {
        "learn": float(timing.get("learn", 0)),
        "review": float(timing.get("review", 0)),
        "challenge": float(timing.get("challenge", 0)),
    }


def divergence(estimated: float, model: float) -> float:
    if model <= 0:
        return math.inf
    return abs(estimated - model) / model


def review_sets(pool: list[dict], size: int = REVIEW_SIZE) -> list[tuple[str, ...]]:
    """Every deterministic rotation set, as ids, in the order the engine draws them."""
    if len(pool) < size:
        return []
    return [
        tuple(pool[(start + offset) % len(pool)]["id"] for offset in range(size))
        for start in range(len(pool))
    ]


def validate_timing(concept: dict) -> list[str]:
    """Findings that must fail the build; warnings are returned by `validate_divergence`."""
    findings = []
    estimates = authored(concept)
    models = modeled(concept)
    for activity in ("learn", "review", "challenge"):
        if estimates[activity] <= 0:
            findings.append(f"{concept['id']} has no authored {activity} estimate")
        if models[activity] > MAX_DESIGNED_SECONDS:
            findings.append(
                f"{concept['id']} models {models[activity]:.1f}s for {activity}, over the "
                f"{MAX_DESIGNED_SECONDS:.0f}s ceiling"
            )
    return findings


def validate_divergence(concept: dict) -> list[str]:
    """Author/model gaps over 20% are warnings, not failures: the model is an estimate too."""
    warnings = []
    estimates = authored(concept)
    models = modeled(concept)
    for activity in ("learn", "review", "challenge"):
        gap = divergence(estimates[activity], models[activity])
        if gap > MAX_AUTHOR_MODEL_DIVERGENCE:
            warnings.append(
                f"{concept['id']} {activity}: authored {estimates[activity]:.0f}s vs modelled "
                f"{models[activity]:.1f}s ({gap:.0%} apart)"
            )
    return warnings
