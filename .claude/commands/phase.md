---
description: Implement one phase of PLAN.md (usage: /phase N)
---

Implement **Phase $ARGUMENTS** of this project. Follow this procedure exactly:

## 1. Read context

- Read CLAUDE.md (workflow rules), STATE.md (current progress and decisions), and the
  "Phase $ARGUMENTS" section of PLAN.md (tasks + acceptance criteria). Also read the PLAN.md
  sections the phase's tasks refer to (e.g. "Local data model", "Security and privacy",
  "Speech and pictures are replaceable"). They are part of the spec.
- `git fetch origin && git status -sb`. This project is developed from two machines, so make
  sure the branch is not behind before writing anything. Work on `dev`.
- **Phase 1 only:** CLAUDE.md, STATE.md and the git repository may not exist yet; creating them
  is part of Phase 1. Skip what is missing, and create STATE.md (phase table with every phase
  `pending`, Decisions, Open questions copied from PLAN.md) before anything else.

## 2. Verify preconditions

- Confirm every predecessor phase is marked `done` in STATE.md. If any is not, STOP and tell
  the user which phase must be completed first. Do not proceed.
- Confirm Phase $ARGUMENTS itself is `pending`. If `done`, ask the user what they want.
- Check PLAN.md's "Open questions" for any that name this phase. Settle each one during the
  phase (asking the user when the answer is theirs) and record the answer in STATE.md.
- Set Phase $ARGUMENTS to `in-progress` in STATE.md.

## 3. Implement

- Do the tasks listed for this phase in PLAN.md: this phase only, nothing from later phases.
- Any deviation from PLAN.md (different library, changed approach, skipped/added task) must be
  recorded in the STATE.md "Decisions" section **before** proceeding with it.
- Code and comments in English. All user-facing UI text in Polish. The only English the child
  sees or hears is the target vocabulary.
- **Child screens never need reading:** every instruction is spoken (Polish voice) and shown
  with icons; tap targets ≥ 72 px; no accidental way out. Parent screens are ordinary Polish text.
- **Through the abstractions only:** nothing outside `src/lib/speech/` touches
  `speechSynthesis` (`SpeechEngine`), and content refers to image ids, never URLs
  (`ImageSource`). Swapping the speech engine or the picture set is its own phase, inserted
  with a STATE.md decision, not a mid-phase detour.
- **The data model is sync-shaped** (per-device progress, `Lww` registers) from Phase 2 on. A
  change that would need a migration once sync exists is a STATE.md decision first.
- **CSP:** every widening of the Caddyfile CSP is recorded in STATE.md and verified under
  Docker (`npm run docker:up`, http://localhost:8081, zero violations). `npm run dev` does not
  apply the CSP. No `unsafe-inline`, no `unsafe-eval`.
- Minimal dependencies: adding any package not named in PLAN.md requires a STATE.md decision
  entry justifying it.
- Cross-platform: no absolute paths or drive letters, LF line endings, no PowerShell- or
  bash-only scripts in the build path. The same checkout is used on Windows and Linux.
- Never commit a credential. This is a public repository, and the app has no secrets by
  design: `VITE_*` values are public, and any future TTS key is the parent's own, stored in
  the family settings, never in the repo.

## 4. Verify

- Go through the phase's acceptance criteria one by one and verify each. Report the result of
  every criterion honestly. If one fails or cannot be verified in this environment (e.g. "with
  the child", "on a real iPhone", "after the next tag"), say so explicitly and record it in
  STATE.md as open, with what is needed to close it.
- Where the phase carries a **quality gate** (speech: end of Phase 3 and in Phase 5; pictures:
  end of Phase 2 and in Phase 5), record the verdict in STATE.md with the device and voice
  named. If the gate needs the owner or the child, ask the user and leave it open until they
  report back.

## 5. End-of-phase ritual (in this order)

1. Update STATE.md: phase status → `done` (with date), plus any decisions/open questions.
2. Commit with a **Conventional Commit** message (e.g. `feat: phase $ARGUMENTS — <short name>`).
   The message is the changelog entry. CHANGELOG.md is generated from it, never hand-edited.
3. Regenerate the changelog (`npm run changelog`, once that script exists) and amend or add a
   `chore: update CHANGELOG` commit. Skip if git-cliff is not available yet; the release
   workflow regenerates it anyway.
4. Push to `dev`, then wait for that commit's `ci.yml` run (find it by SHA,
   `gh run watch <id> --exit-status`) and report its result. A red run is fixed and pushed again
   before the summary. A phase is not done while its run is pending or red. (Phase 1 only: if
   the GitHub repository or remote does not exist yet, say so; it is an owner prerequisite.)
5. Give the user a plain-language summary of what was built and how it was verified.
6. End with an explicit **go / no-go** statement for the next phase.

Releasing is a separate act: `/release` merges to `main` and tags. A phase does not deploy.

## Hard rule

**Never start the next phase in this conversation**, even if everything went smoothly and the
user seems ready. The next phase starts in a fresh conversation via `/phase N+1`.
