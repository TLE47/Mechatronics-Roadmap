## Bench task

**What this changes for the learner.** One paragraph. If the answer is "nothing", this is not a
learner-facing change and should say what it is instead.

**Lesson / mission id(s).** `P.1`, `05-control.T1.05a`, mission 8 — whatever this touches. A content
change names its file under `content/`.

**Kind.** Lesson text · checks · mission · recording · reward rule · part · site surface · tooling

## Checks run

Paste the command and its result. A `ships` claim in `docs/PLAN-2.0-GAP.md` needs its command here.

- [ ] `npm run check:content` — the bundle is rebuilt from `content/` (`python3 scripts/build_content.py`)
- [ ] `npm run test:content`
- [ ] `npm run test:game`
- [ ] `npx tsc -b`
- [ ] The suite that covers this change: …

## The five hard rules

- [ ] Rewards follow verified work and real play — never time on page, speed or randomness.
- [ ] Run, editor, hints and scopes are not locked behind progress, cutscenes or cosmetics.
- [ ] Anything audible is opt-in, remembered, and one click from muted.
- [ ] Focus mode still works, and this adds no motion that ignores `prefers-reduced-motion`.
- [ ] A starter still fails its own checks and a solution still passes them.

## Story and curriculum

- [ ] A lesson or mission **id** is unchanged, or a line was added to `content/aliases.yaml`.
- [ ] If this changes a recording, it is still at most 120 words and its clue still fits.
