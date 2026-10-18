# STATE — Hello Polly

Single source of truth for progress and decisions. Update before and after every phase.
Any deviation from [PLAN.md](PLAN.md) must be recorded here before proceeding.

## Phase status

| Phase | Name                                                | Status      | Completed |
|-------|-----------------------------------------------------|-------------|-----------|
| 1     | Scaffold & Docker                                   | done        | 2026-10-18 |
| 2     | Content pipeline & local data layer                 | pending     |           |
| 3     | Speech                                              | pending     |           |
| 4     | Children, word plan, parent gate, look-and-listen   | pending     |           |
| 5     | Lessons & first exercises                           | pending     |           |
| 6     | Rewards                                             | pending     |           |
| 7     | Drive sync (one account, many devices)              | pending     |           |
| 8     | Inviting the second parent                          | pending     |           |
| 9     | Stories & more games                                | pending     |           |
| 10    | Screen time & the progress dashboard                | pending     |           |
| 11    | Full A1 content, PWA polish, v1.0.0                 | pending     |           |

Statuses: `pending` → `in-progress` → `done` (or `blocked` with a note).

### Phase 1 acceptance (2026-10-18)

- [x] **Every route renders its Polish placeholder; `npm run check` and `npm run build` are
      clean.** 15 PLAN.md routes + the catch-all, asserted by `e2e/routes.spec.ts` and pinned
      to the plan by `src/lib/screens.test.ts`. svelte-check: 0 errors, 0 warnings.
- [x] **`npm run docker:up` serves on http://localhost:8081 with the exact CSP and zero
      violations.** The header matches the Caddyfile byte for byte; `npm run test:e2e:csp`
      passed 34/34 (Chromium + WebKit) with the violation listener armed. A negative check
      (injecting an inline script and an inline style) produced `script-src-elem` and
      `style-src-attr` violations, so the listener does catch them. `/assets/*` answers
      `immutable`, the document `no-cache`.
- [ ] **CI green on `dev`. A `v0.1.0` tag deploys and `https://<domain>` serves the shell.**
      CI: see the run for the Phase 1 push (reported in the phase summary). The `v0.1.0`
      deploy is **open**: releasing is a separate act (`/release`), and it needs the owner
      prerequisites first: the `SSH_*` secrets and `DEPLOY_CHECK_TOKEN`, DNS for
      `hellopolly.gorny.dev`, the nginx site and certificate, and the Cloudflare rules
      (docs/DEPLOYMENT.md). Closed by: owner sets those up → `/release` → v0.1.0 → the
      workflow's health check returns 200.
- [ ] **Works from a clean checkout on Windows and Linux.** Linux: verified (fresh clone →
      `npm ci` → check → test → build → e2e 34/34 in both engines). Windows: **open**; this
      environment has no Windows machine. Nothing in the build path is platform-specific (no
      shell scripts, no `VAR=… cmd` scripts, LF enforced, every text file checked for CR).
      Closed by: on the Windows machine, `git clone`, `npm ci`, `npm run check`, `npm test`,
      `npm run build`, `npm run test:e2e`, and `npm run docker:up` with Docker Desktop.

Note for Linux + VS Code (snap): WebKit fails with „internal error” unless `GIO_MODULE_DIR` is
unset (docs/DEVELOPMENT.md). Not a repository problem.

## Quality gates

Recorded with the device and voice named (PLAN.md "Speech and pictures are replaceable").

| Gate     | When                         | Verdict | Device / voice |
|----------|------------------------------|---------|----------------|
| Pictures | end of Phase 2               | open    |                |
| Speech   | end of Phase 3               | open    |                |
| Pictures | Phase 5, with the child      | open    |                |
| Speech   | Phase 5, with the child      | open    |                |

## Decisions

Newest last. Every deviation from PLAN.md lands here **before** it is acted on.

### 2026-10-18 — Phase 1: Scaffold & Docker

1. **Open question 1 settled: the name is "Hello Polly", with no Polish translation or
   subtitle.** The owner asked that the app name not be translated, so the subtitle
   *Angielski z papugą Polly* in PLAN.md is dropped everywhere (manifest, titles, README). The
   domain `hellopolly.gorny.dev` and the repository `zyndata/hello-polly` are confirmed as
   proposed.
2. **The GitHub repository is created from this session** (`gh repo create`, public, default
   branch `dev`), at the owner's request. The other owner prerequisites (secrets and variables,
   DNS, nginx, certificate, Cloudflare rules, Google Cloud) stay manual and open.
3. **Dependencies arrive with the phase that uses them.** Phase 1 installs only what its tasks
   name: Svelte, Vite, Tailwind v4, Bits UI, svelte-spa-router, TypeScript, svelte-check,
   Vitest, Playwright and git-cliff. Dexie and fake-indexeddb (Phase 2), SVGO (Phase 2),
   svelte-dnd-action (Phase 4) and vite-plugin-pwa (Phase 11) are still the plan, just later.
   Bits UI is installed now as the task says, but nothing uses it until the first parent dialog.
4. **Versions are pinned exactly to the set Eat My Way runs in production**: svelte 5.57.0,
   vite 8.2.2, @sveltejs/vite-plugin-svelte 7.3.0, tailwindcss 4.3.3, bits-ui 2.19.0,
   svelte-spa-router 5.1.1, typescript 6.0.3, svelte-check 4.7.6, vitest 4.1.11,
   @playwright/test 1.62.1, git-cliff 2.13.1. The newest majors (TypeScript 7, Vitest 5) are
   recent and unproven with svelte-check; moving to them is a separate, deliberate change.
   `npm install` from scratch crashes in npm 10.9's arborist (`Cannot read properties of null
   (reading 'edgesOut')` while resolving vitest's peer set), so the lockfile was seeded from
   Eat My Way's and pruned by `npm install`. `npm audit fix` then lifted two transitive
   packages (devalue 5.9.4, source-map-js 1.2.2) within their ranges: 0 vulnerabilities.
5. **Font: Nunito**, variable weight 400–900, OFL. One woff2 of 31.8 kB (budget ≤ 40 kB),
   subset to printable ASCII + Polish letters + typographic quotes, dashes, ellipsis and €.
   The subset was produced once by the Google Fonts CSS2 API with a `text=` parameter (no
   subsetting tool, no package), and committed with its `OFL.txt` under `src/assets/fonts/`.
   Vite hashes it into `/assets/`, so it is served immutable and the CSP stays at
   `font-src 'self'`. Baloo 2 was the alternative (28.4 kB); Nunito won on parent-screen
   legibility. To regenerate: request
   `https://fonts.googleapis.com/css2?family=Nunito:wght@400..900&text=<the characters>`
   with a browser user agent and download the woff2 it names.
6. **Phase 1 CSP**, the narrowest that serves the shell: `default-src 'self'; script-src 'self'
   https://static.cloudflareinsights.com; style-src 'self'; img-src 'self'; font-src 'self';
   connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; base-uri
   'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`. PLAN.md's
   `img-src data: blob:` is not granted yet: nothing needs it, and it is added (with
   `https://cdn.jsdelivr.net`) in the phase that does. Vite's `assetsInlineLimit` is 0 so no
   asset ever becomes a `data:` URI.
7. **`test:e2e:csp` is a second Playwright config** (`playwright.csp.config.ts`, base URL
   http://localhost:8081, no web server), not Eat My Way's `E2E_BASE_URL=… playwright test`,
   which is POSIX-shell syntax and fails in cmd and PowerShell. Every spec fails on any
   `securitypolicyviolation` event, so this run is the CSP proof.
8. **The screen list is data** (`src/lib/screens.ts`: path, Polish title, child/parent area,
   building phase), and a unit test pins it to PLAN.md "Screens". The router wraps one
   `Placeholder.svelte` per entry; each phase replaces its entries with real screens. `/`,
   the map and every `/child/*` screen use the child layout (full-bleed sea); `/parent/*`,
   `/join` and `/setup` use the parent layout. A catch-all renders „Nie ma takiej strony”.
   Placeholder child screens carry their title as text. That is the one exception to "no
   reading" and it disappears with the placeholders.

## Open questions

Copied from PLAN.md. Each is settled in the phase named and the answer recorded here.

1. **Name, domain, repository** (Phase 1). **Settled** (decision 1): "Hello Polly", not
   translated, no subtitle; `hellopolly.gorny.dev`; `zyndata/hello-polly`.
2. **Default accent**: British is proposed because Polish schools mostly teach it (Phase 3).
3. **Sticker art**: 3D PNG (richer, larger) or Color SVG (Phase 6).
4. **Picker in an installed iOS PWA**: unknown until measured; fallback defined (Phase 8 spike).
5. **Should one family file per Google account allow several families?** Assumed no: one
   family per account (Phase 7).
6. **Speech engine and picture set**: kept or replaced by the quality gates in "Speech and
   pictures are replaceable" (Phases 2, 3 and 5).
7. **Level-2 and level-3 content** (verbs, adjectives) needs animation, not a still picture.
   The scope of animation per word is decided when Phase 11 starts.
