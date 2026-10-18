# Hello Polly — project guidance

A Duolingo-style English vocabulary PWA for a **pre-reading child from age 4** (Polish UI, the
only English is the target vocabulary). Pure client-side SPA (Vite + Svelte 5 + TS), IndexedDB
as the source of truth, a shared Google Drive file as the sync layer for two parents, the
device's own voice (Web Speech API), served as static files by Caddy in Docker behind nginx at
https://hellopolly.gorny.dev. No application backend, and no secrets of any kind.

- Full specification and phase breakdown: [PLAN.md](PLAN.md)
- Progress, decisions, open questions, quality gates: [STATE.md](STATE.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md) (generated, never hand-edited)
- Local setup and cross-platform rules: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Server, secrets, rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Workflow rules

- **One phase per conversation**, started via `/phase N`. Never continue into the next phase
  in the same conversation.
- **STATE.md is the single source of truth** for progress and decisions. Update it before and
  after every phase.
- Any **deviation from PLAN.md must be recorded in STATE.md** before proceeding. So must any
  package not named in PLAN.md, and every widening of the CSP.
- **Conventional commits**; push after each phase.
- **A push is not finished until CI is green.** `ci.yml` runs on every push to `dev` (and on pull
  requests), **never on `main`**. It runs check, unit tests, build and the e2e suite in Chromium
  and WebKit. After pushing, find the run by the pushed commit's SHA, wait for it
  (`gh run watch <id> --exit-status`) and report what it said. Never call work done while a run
  is pending or red.
- **A release has one e2e gate, and it is on `dev`.** The `vX.Y.Z` tag starts `deploy.yml`, whose
  `build` job repeats check, unit tests and build, but not Playwright. So only a `dev` commit
  whose `ci.yml` run is green may be merged to `main` and tagged; `/release` checks this first.
- **End-of-phase ritual:** update STATE.md → re-read README.md against what the phase changed
  (status blockquote, claims, screenshots) → commit → regenerate CHANGELOG.md
  (`npm run changelog`) → push → wait for CI → plain-language summary → go/no-go for the next
  phase.
- **Code and comments in English. All user-facing UI text in Polish.**
- **Minimal dependencies.** Every package must justify itself.

## Product rules that every phase keeps

- **Child screens never need reading.** Every instruction is spoken (Polish voice) and shown
  with icons; tap targets ≥ 72 px (`--spacing-tap`); no accidental way out (the only exit is a
  long-press home button). Parent screens are ordinary Polish text.
- **Through the abstractions only.** Nothing outside `src/lib/speech/` touches
  `speechSynthesis` (`SpeechEngine`), and content refers to image ids, never URLs
  (`ImageSource`). Swapping the speech engine or the picture set is its own phase.
- **The data model is sync-shaped** from Phase 2 on (per-device progress, `Lww` registers). A
  change that would need a migration once sync exists is a STATE.md decision first.
- **No loss mechanics.** No hearts, no lost streaks, no timers, no red ✗, no error buzzer.

## Repository conventions

- **Branches:** work on `dev`, merge to `main`, release by pushing a `vX.Y.Z` tag. A plain push
  to `main` does not deploy; only the tag does. Ship with the `/release` skill. Tags never move:
  jsDelivr caches `@vX.Y.Z` files permanently.
- **CHANGELOG.md is generated** by git-cliff from Conventional Commit messages. The commit
  message *is* the release note; edit messages, not the file.
- **Two machines (Windows + Linux)** share this checkout. LF line endings are enforced by
  `.gitattributes`; no absolute paths, no drive letters, no platform-only scripts in the build
  path (and no `VAR=value cmd` in npm scripts); file names are case-sensitive on the server.
  Details in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- **Public repository.** Never commit a credential: no OAuth client secret, no `.env`, no TTS
  key. Only `.env.example`. Everything under `VITE_*` ends up in the public bundle by design.
- `npm run dev` and `npm run preview` do **not** apply the production CSP. Anything that adds a
  script, style, font, image source or outbound request must be verified with
  `npm run docker:up` on http://localhost:8081 (`npm run test:e2e:csp`, zero violations) before
  release. No `unsafe-inline`, no `unsafe-eval`, no inline `style="…"` attribute in markup.
