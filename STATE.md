# STATE — Hello Polly

Single source of truth for progress and decisions. Update before and after every phase.
Any deviation from [PLAN.md](PLAN.md) must be recorded here before proceeding.

## Phase status

| Phase | Name                                                | Status      | Completed |
|-------|-----------------------------------------------------|-------------|-----------|
| 1     | Scaffold & Docker                                   | done        | 2026-10-18 |
| 2     | Content pipeline & local data layer                 | done        | 2026-10-18 |
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
      CI: **green** on `dev` (run 39159075235 on `dc65ced`: check, unit, build, and e2e
      34/34 in Chromium + WebKit). Half met: the `v0.1.0`
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

### Phase 2 acceptance (2026-10-18)

- [x] **`mergeFamily` passes property tests (commutative, associative, idempotent) over
      generated files, including tombstones and compaction.** `src/lib/domain/merge.test.ts`:
      300 seeded triples of generated files; commutative, associative, idempotent, absorbing,
      convergent over four sync orders, and non-mutating. The generator is asserted to produce
      > 100 tombstones and > 100 compacted progress copies. Rule tests cover sticky tombstones,
      default stamps, seq per device and members. A mutation check (equal-seq tie-break
      removed; tombstone rule removed) turned the suite red both times.
- [x] **`nextWords` honours queue → enabled topics → known/paused, verified by table tests.**
      `learning.test.ts`: 8 table rows (map order over enable order, queue first without
      repeats, queued word from a disabled topic, known and paused in both queue and topics,
      non-new words, unknown ids, nothing enabled), the limit, and the seeded shuffle.
- [x] **Learned / review transitions match the rules in "Learning model" on fixed
      histories.** `learning.test.ts`: practising vs learned (≥ 3 first tries on ≥ 2 days,
      summed across devices, same day on two devices = one day), the full 1-2-4-7-14-30
      climb, early practice, a miss dropping one box and never below box 1 or back to new,
      and learning across compaction.
- [x] **`check:content` fails on a missing image, an oversized SVG and an unknown story
      word.** `scripts/content-rules.test.ts` runs both CLIs exactly as the npm script does
      against temporary fixture checkouts (plus a stray file and a stale attribution), and
      the pure rules against fixtures (also the prompt catalog, duplicates, ids vs file names).
- [ ] **Images load from jsDelivr in a production build (verified after the next tag) and
      from the origin in dev.** Origin: **verified**. `e2e/images.spec.ts` loads every
      picture the content uses from the origin in Chromium and WebKit under `vite preview`
      and under Caddy with the production CSP (`test:e2e:csp` 38 passed, 2 opt-in skipped,
      zero violations); `npm run dev` serves `/content/img/banana.svg` as `image/svg+xml`.
      The build-time switch is unit-tested (`imageUrls` with `VITE_CONTENT_REF` stubbed).
      jsDelivr in a production build: **open** until a tag exists, as the criterion says.
      No screen renders a picture before Phase 4, so the check then is: `/release` →
      `vX.Y.Z` → on the live site, the first screen with a picture requests
      `cdn.jsdelivr.net/gh/zyndata/hello-polly@vX.Y.Z/content/img/…` with no CSP report.
      The CSP half was checked before that (see the CI note below).

Tests: 111 unit tests (11 files), e2e 38 + 2 opt-in in Chromium and WebKit. Content: 4 topics,
45 words, 17 prompts, 48 pictures, 470.8 kB, the largest 24.7 kB (cow).

## Quality gates

Recorded with the device and voice named (PLAN.md "Speech and pictures are replaceable").

| Gate     | When                         | Verdict | Device / voice |
|----------|------------------------------|---------|----------------|
| Pictures | end of Phase 2               | open: owner's verdict pending | Contact sheet of the 45 pictures rendered in Chromium (Linux) at 96 px, sent to the owner on 2026-10-18. Own pre-check: all decode; possible confusions are white heart (reads lavender), orange vs mango vs lemon (three round fruit), and the stylised bird. |
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

### 2026-10-18 — Phase 2: Content pipeline & local data layer

9. **Image fields hold image ids, not file names.** PLAN.md's `Word.image: "banana.svg"`
   becomes `image: "banana"` (likewise `Topic.icon`, `SceneItem.image`, `Sticker.image`), so
   content never names a format (PLAN.md "`ImageSource` abstraction"). `src/lib/images.ts` is
   the one place that turns an id into a URL. Ids are the kebab-case upstream emoji name
   (`red-heart`, `keycap-3`, `red-apple`).
10. **Pictures for the first four topics**, all Fluent "Color" SVGs from the pinned commit
    `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc` of `microsoft/fluentui-emoji`: colours are the
    **heart series** (the only Fluent shape that exists in all 11 colours: circles and squares
    have no pink or grey); numbers are the keycaps 1–10; fruit and pets & farm are the
    full-body emoji, falling back to the face emoji only where the full body is over budget.
    Topic icons: artist palette, input numbers, red apple, paw prints.
11. **Content layout.** `content/*.json` (topics, words, prompts, praise, stories, stickers)
    plus `content/images.json`, the curated manifest (id → upstream path, and the pinned
    commit) that `scripts/build-content.mjs` reads. `content/img/` is served at
    `/content/img/` by a ~30-line Vite plugin in `vite.config.ts` (served in dev and preview,
    copied into `dist/` on build), not by a package and not by moving it under `public/`,
    because jsDelivr serves the same path from the repository tag. English praise ("Great!",
    "Well done!") is its own list (`praise.json`): it is spoken in English, so it is not a
    Polish `Prompt`. Stories (Phase 9) and stickers (Phase 6) ship as empty lists; the
    validator's rules for them are exercised by fixtures.
12. **The content validator is plain JavaScript with JSDoc** (`scripts/lib/content-rules.mjs`),
    so `npm run check:content` runs on bare Node on both machines with no TypeScript runner.
    The app imports only its *types* (`PromptId`). Its unit tests run in Vitest, whose
    `include` gains `scripts/**/*.test.ts`. `check:content` = `build-content.mjs --check`
    (offline: every manifest id has its file, no strays, budget, licence and attribution
    present) then the rules in PLAN.md "Content model".
13. **Production image base comes from the release tag.** `deploy.yml` passes
    `VITE_CONTENT_REF=${{ github.ref_name }}` to the build; with it set, images load from
    `https://cdn.jsdelivr.net/gh/zyndata/hello-polly@<tag>/content/img/<id>.svg`, without it
    (dev, preview, `docker:up`, CI) from the origin. Any error falls back to the origin once.
    **CSP widening:** `img-src 'self' https://cdn.jsdelivr.net`. `data:` and `blob:` from
    PLAN.md are still not granted (nothing needs them), nor is jsDelivr in `connect-src`
    (only the Phase 11 service worker fetches images).
14. **Packages:** `dexie` 4.4.6 (runtime), `fake-indexeddb` 6.2.5 and `svgo` 4.1.0 (dev), all
    named in PLAN.md, pinned exactly. fake-indexeddb 6.2.6 is two days old, so the previous
    release. **No property-testing library** (fast-check is not in PLAN.md): the merge
    property tests use a ~40-line seeded generator (mulberry32) in the test helpers.
15. **Merge details that PLAN.md leaves open**, each chosen so that the merge stays a join
    (a total order per register, so commutative, associative and idempotent):
    - `Lww`: newer `t` wins, then larger `d`, then the larger canonical JSON of `v` (two
      writes by one device in one millisecond).
    - `progress[child][device]`: higher `seq` wins, then the larger canonical JSON.
    - **Tombstones are sticky**: a `deleted` child profile wins over any live value, older or
      newer, ordered among tombstones by the `Lww` rule. A stale rename on an offline phone
      must not bring a deleted child back. PLAN.md says only "win over older values"; this
      is stricter. Undelete, if ever wanted, is a new child id.
    - `familyId`: the smaller id; `contentVersion`: the larger; `schema`: the larger;
      `members`: union by e-mail, `owner` beating `writer`, sorted. Merging two different
      families is Phase 8's decision; the merge only has to stay lawful.
16. **Compaction** is done by the device that owns the subtree, and bumps its `seq` (so the
    compacted copy wins like any other change). Days older than 120 days fold into one
    `"old"` bucket per word. `AttemptDay` gains an optional `days` (the number of days with
    a first-try correct folded into the bucket), so the "≥ 2 different days" rule survives
    compaction. The Leitner box of a word whose history is all in `"old"` restarts at box 1
    (due at once): a word untouched for four months is reviewed, which costs nothing.
17. **Learning rules made exact** (PLAN.md "Learning model"):
    - Per word, every device's attempts for that child are summed per day. An exercise is
      one `c` (the child always ends on the right picture), so first-try misses = `c − first`.
    - *learned*: Σ `first` ≥ 3 and ≥ 2 days with `first` > 0; it is sticky. The word enters
      box 1 (interval 1 day) on the day it is learned.
    - Leitner boxes 1, 2, 4, 7, 14, 30 days. A later day with a first-try miss drops one box
      (never below box 1, never back to *new*). A clean day on or after the due date raises
      one box (at most box 6). Clean practice before the due date changes nothing.
    - `nextWords`: queue (in order) → enabled topics in `Topic.order` → each topic's words in
      default order, or a **deterministic** shuffle seeded by child and topic when
      `randomWithinTopic` (so the next word does not change between calls or devices). Only
      *new* words are candidates; known and paused are skipped.
    - `composeLesson`: new words 3 / 2 / 1 / 0 when 0–3 / 4–7 / 8–11 / 12+ reviews are due;
      at most 12 steps; a look-and-listen step per new word, then two 2-choice picks per new
      word interleaved with one pick per due review (the most overdue first), topped up
      with *practising* words to reach 8 steps. Choices for a review: 2, 3 or 4 by box.
      Distractors and the exercise type (E1/E2/E3) are the Phase 5 player's choice.

18. **`@types/node` 22.20.5 (dev, types only), not named in PLAN.md.** The Vite plugin of
    decision 11 reads `content/img/` with `node:fs`, and the content scripts' tests spawn the
    CLIs; svelte-check cannot type either without Node's types. It ships nothing at runtime.
    Pinned to the Node 22 line of `.nvmrc`. To keep Phase 1's rule that the app's type
    environment has no Node globals, those files get their own `tsconfig.node.json`
    (vite/vitest configs, `scripts/`), and `npm run check` runs svelte-check on the app
    config and then `tsc -p tsconfig.node.json`.

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
