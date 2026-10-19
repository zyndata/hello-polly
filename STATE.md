# STATE — Hello Polly

Single source of truth for progress and decisions. Update before and after every phase.
Any deviation from [PLAN.md](PLAN.md) must be recorded here before proceeding.

## Phase status

| Phase | Name                                                | Status      | Completed |
|-------|-----------------------------------------------------|-------------|-----------|
| 1     | Scaffold & Docker                                   | done        | 2026-10-18 |
| 2     | Content pipeline & local data layer                 | done        | 2026-10-18 |
| 3     | Speech                                              | done        | 2026-10-19 |
| 4     | Children, word plan, parent gate, look-and-listen   | done        | 2026-10-19 |
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

CI: **green** on `dev` (run 39163336077 on `3673582`: check, unit 111, `check:content`,
build, e2e 38 passed + 2 opt-in skipped in Chromium + WebKit). jsDelivr under the CSP:
after the push, `E2E_CDN_REF=3673582` (the pushed commit, immutable like a tag) with
`test:e2e:csp` against the container loaded every content picture from
`cdn.jsdelivr.net/gh/zyndata/hello-polly@3673582/content/img/` in both engines with zero
violations (served as `image/svg+xml`, byte-identical to the repository).

### Phase 3 acceptance (2026-10-19)

- [x] **Unit: slow and normal use the configured rates; a new `speak` cancels the previous
      one.** `src/lib/speech/speaker.test.ts` runs `Speaker` over the real `WebSpeechEngine`
      over the fake: configured and default rates, clamping, the slow repeat after its pause,
      `say` overrides, accent and preferred voices; a new request cancels the word being
      spoken, four quick requests leave only the last one spoken, a request during the slow
      pause drops the repeat, `cancel()` stops a prompt midway; nothing reaches the engine
      before the unlock. Mutation check: removing the cancel-first turned 3 tests red; making
      slow use the normal rate turned 6 red. Around it: `web-speech.test.ts` (async voices,
      polling, unique voice ids, outcomes, watchdog, prime), `voices`, `timing`, `prompt`,
      `effects`, `family` (settings as `Lww`) and the preferred voices in `db`.
- [x] **e2e (Chromium + WebKit, speech faked): tapping a picture speaks its `say ?? en`, and
      the 🐢/🐇 toggle changes the rate.** `e2e/speech.spec.ts`: all 45 pictures on
      `/parent/speech` tapped, each spoken as `say ?? en` (no word has a `say` yet, so the
      override is proved in the unit suite); 🐢 → 0.6, 🐇 → 0.9 and back, each switch says
      „Powoli.” / „Normalnie.” in Polish; plus the start screen (nothing before the tap, then
      the greeting and `/setup`), cutting off a word, the voice check with and without a
      Polish, a British or any voice, settings and the device's voice surviving a reload.
- [ ] **Manual, recorded here: real voices on an Android phone and an iPhone; slow mode judged
      intelligible for first-time listening on the first four topics, `say` overrides added
      where it was not.** **Open**: it needs the owner and the two phones. This environment
      has only headless browsers (no voices in Chromium; four US espeak voices in WebKit).
      Closed by: on each phone, open `/#/parent/speech` (from a `docker:up` build on the LAN,
      or the live site after the next `/release`), note the voice names the check reports,
      tap all 45 words at 🐢, and list any word that is not clear. Each such word gets a
      `say` in `content/words.json`; the speech gate below is then decided.
- [x] **No network request and no audio file appear in the network log at any point.**
      `e2e/network.spec.ts`, on the browser's real speech (no fake): start → unlock →
      greeting → `/parent/speech` → eight words at both speeds, the three voice-check
      buttons and all six sound effects. Zero requests during speech and sound, none to
      another origin, none of type media or with an audio extension or content type, in
      Chromium and WebKit, under `vite preview` and under Caddy with the production CSP.

Tests: 192 unit tests (18 files); e2e 62 passed + 2 opt-in skipped in Chromium and WebKit,
both under `vite preview` and with `test:e2e:csp` against the container (zero CSP
violations; the CSP is unchanged in this phase). Bundle: 176.7 kB JS (61.4 kB gzip).

CI: **green** on `dev` (run 39210664681 on `292f14e`: check, unit 192, `check:content`,
build, e2e 62 passed + 2 opt-in skipped in Chromium + WebKit).

Found on the way: WebKit with espeak on Linux reports an empty `voiceURI` for every voice,
which crashed the voice list (duplicate keys). Voice ids now fall back to name + language
and are made unique (decision 22); a unit test covers it.

### Phase 4 acceptance (2026-10-19)

- [x] **With one child the picker never appears; adding a second child makes it appear;
      removing it makes it disappear again.** `e2e/children.spec.ts`: first run → one child →
      the start tap goes straight to her map (no picker, and no home button on it); a second
      child added in the parent panel → `/` shows the picker with two avatars and speaks
      `picker.who`; the long-press home on the second child's map leads back to it (a short
      press only says `home.hold`); deleting the second child (inline „Na pewno?”, tombstone)
      → `/` goes straight to the first child's map again, also after a reload and the tap.
      Unit: `children.test.ts` (add, edit, tombstone without the name, the tombstone beating a
      newer offline rename in both merge orders, Polish name order, the stamp rule).
- [x] **A queued word is the next word introduced, ahead of topic order.** e2e: *mango*
      queued during the first run is the first picture of the first lesson (then *red*,
      *blue*); after that lesson, *duck* queued in the parent panel jumps to the head of
      „Następne nowe słówka” and is the first picture of the next lesson. A second test: the
      queue reordered with ↑ (*lemon* before *mango*), *red* marked known and *blue* paused →
      the lesson is *lemon*, *mango*, *yellow*. Unit: `plan.test.ts` (queue, ↑/↓, the three
      exclusive marks, the queue keeping only words not met yet) and `progress.test.ts`.
- [x] **The gate cannot be passed by tapping randomly (e2e: 50 random taps do not open
      it).** `e2e/parent-gate.spec.ts`: 50 taps at seeded random points of the keypad, 100 ms
      apart, with the page's `Math.random` seeded too; the gate stays shut, the panel is not
      rendered, and the taps made at least one wrong guess (the pause appeared). Also: a
      wrong number pauses the keypad and draws a new one, and the right one opens the panel;
      every `/parent` route (panel, child, speech, family) shows the gate, and showing a child
      screen closes it again. Honestly: a random two-digit guess is right 1 time in 90, so the
      gate is a child lock, not a wall. The 5 s pause (doubling) bounds the luck: unit-tested
      over 2000 seeded bursts, 50 quick taps open it in < 2.5 % of bursts and 50 slow ones in
      < 3.5 % (decision 37). A pre-reader cannot read the number, which is the real lock.
- [x] **Every child screen is operable with no reading (review against the screen list;
      recorded).** Review, screen by screen:
      - `/` start: Polly with a pulsing ring; the whole screen is the target. Spoken greeting.
      - `/` picker (≥ 2 children): one big avatar per child; the names under them are for the
        parent (marked `data-for-parent`). Spoken: „Kto dziś płynie z Polly? Dotknij swojego
        zwierzątka!”
      - `/child/:id` map: islands, the ship with Polly (bobbing) on the one to tap, a gear and
        (≥ 2 children) the house. Spoken on arrival: „Dotknij statku i płyniemy!”, or „Nowe
        słówka już niedługo!” (also on tapping the ship, with a wiggle) when nothing is new.
      - `/child/:id/lesson` (look and listen): one big picture with a pulsing ring until it is
        tapped, then a pulsing green ▶; progress dots, 🐢/🐇, the house. Spoken: „Płyniemy na
        nową wyspę! Popatrz i posłuchaj.” + the word; „A teraz następny obrazek.” + the word;
        „Brawo! Wyspa zdobyta!” on the finish screen (an island with a flag, Polly
        bouncing), which sails back to the map by itself.
      - The gear leads to the gate, a parent screen with text by design; it says „To jest
        miejsce dla rodzica. Dotknij Polly, żeby wrócić.” and has a big Polly button back.
      - Not built yet and reachable from no child screen (decision 39): games, a game,
        stories, a story, album, chest.
      Automated: `e2e/no-reading.spec.ts` walks start → map → lesson (before and after the
      tap, finished) → map with a flag → picker → map with home, and asserts that no visible
      text appears outside screen-reader text and the picker's names, and that every button
      shows a picture. Without a Polish voice the cues (pulsing ring, ▶, ship) still carry
      each screen (decision 23). Whether a real 4-year-old finds their way is the Phase 5
      test with the child.

Tests: 219 unit tests (22 files); e2e 81 passed + 3 skipped in Chromium and WebKit, both
under `vite preview` and with `test:e2e:csp` against the container (zero CSP violations; the
CSP is unchanged in this phase). The 3 skips: the 2 opt-in jsDelivr checks, and the real-speech
network check in WebKit on Windows, whose Playwright build has no speech engine (it runs in
WebKit on Linux and in CI; docs/DEVELOPMENT.md). Bundle: 219.9 kB JS (75.9 kB gzip), 25.9 kB
CSS. Content: 61 pictures, 661.8 kB, the largest 24.7 kB.

CI: **green** on `dev` (run 39216418299 on `d995ad5`: check, unit 219, `check:content`,
build, e2e 82 passed + 2 opt-in skipped in Chromium + WebKit; the real-speech network check
runs there in WebKit too).

Found on the way: Svelte state proxies cannot be stored in IndexedDB (structured clone fails),
so a plan edited on the child's page was silently not saved; the screen now saves
`$state.snapshot(…)` and shows „Nie udało się zapisać…” if a save ever fails.

The Phase 2 jsDelivr criterion is still open until the next tag; from this phase on, the map,
the lesson and the parent screens render pictures, so the live check after `/release` is
simply opening the map.

## Quality gates

Recorded with the device and voice named (PLAN.md "Speech and pictures are replaceable").

| Gate     | When                         | Verdict | Device / voice |
|----------|------------------------------|---------|----------------|
| Pictures | end of Phase 2               | open: owner's verdict pending | Contact sheet of the 45 pictures rendered in Chromium (Linux) at 96 px, sent to the owner on 2026-10-18. Own pre-check: all decode; possible confusions are white heart (reads lavender), orange vs mango vs lemon (three round fruit), and the stylised bird. |
| Speech   | end of Phase 3               | open: owner's verdict pending | Needs real voices on an Android phone and an iPhone (see Phase 3 acceptance). Tool: `/#/parent/speech`, every word at 🐢. Criteria: every word of the first four topics told apart at slow speed by a first-time listener; `say` overrides ≤ ~10 % of words (≤ 4 of 45). |
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

### 2026-10-19 — Phase 3: Speech

19. **Open question 2 settled: the default accent is British (`en-GB`)**, the owner's choice.
    It was already the default in `DEFAULT_SETTINGS`; American stays selectable in
    `/parent/speech` as a shared family setting.
20. **Two layers in `src/lib/speech/`, not one.** PLAN.md puts `speak(text, {lang, speed})` on
    the `SpeechEngine`. Here the engine is only the platform half: `isAvailable`, `voices`
    (plus a change listener), `speak(utterance)` for one utterance with an explicit language,
    rate, pitch and voice (with `start`/`boundary` callbacks, resolving when it ends, is
    cancelled or fails) and `cancel`. Everything that is policy rather than platform lives in
    one engine-agnostic `Speaker`: speed → rate, slow mode's pause and repeat, cancel-first,
    Polish prompts with `{word}`, the sentence queue with boundaries and the timed fallback,
    voice choice, and the unlock. So a replacement engine (Kokoro, a keyed service) implements
    the small half only, and the rules are tested once. `WebSpeechEngine` is the only file
    that touches `speechSynthesis`.
21. **Rates and pitch.** English words: `slowRate` / `normalRate` from the family settings,
    pitch 1.1. Polish prompts: a fixed rate 1.0 and pitch 1.1, whatever the 🐢/🐇 toggle says:
    the toggle is about hearing the English word. Slow mode: a 600 ms pause, then the word
    again when `slowRepeatTwice` is on; in a prompt, a 250 ms pause before the English word.
    Rates are clamped to PLAN.md's ranges (0.4–0.8 and 0.8–1.1) on write and on read.
22. **Voice choice.** Per language tag (`en-GB`, `en-US`, `pl-PL`): the device's preferred
    voice (stored locally in `meta.voices` by voice id: the `voiceURI`, or name and language
    where the platform leaves the URI empty, as WebKit with espeak on Linux does for every
    voice, made unique with `#2`…) if it still exists and speaks that
    language; otherwise an exact language match, local voices first, then the browser's
    default flag, then by name; otherwise the same base language (an American voice when no
    British one exists), local first; otherwise none. Tags are normalised (`en_GB` → `en-GB`,
    case-insensitive), because older Android reports underscores.
23. **Without a Polish voice, or with `polishPrompts` off**, the Polish parts of a prompt are
    skipped and the English word in it is still spoken; `Speaker` reports that it spoke no
    Polish, so a screen can lean on icon and animation. The voice check says so in words.
24. **The unlock.** `unlock()` (`src/lib/unlock.ts`) must be called inside a gesture handler:
    the start screen's tap, or (on a parent screen) the tap on the button that plays
    something, which is itself a gesture. It makes the speaker speak one silent empty
    utterance (iOS needs speech started inside a gesture once) and creates/resumes the Web
    Audio context of the sound effects. Before it, every `speak` returns
    `locked` without reaching the engine: the app never attempts speech before a gesture.
25. **The Phase 3 start screen.** Polly (a new UI picture, below) on the sea, the whole screen
    one tap target with a pulsing ring as the cue. The tap unlocks, plays the `tap` effect,
    Polly says „Cześć! Jestem Polly.” (new prompt id `start.hello`) and "Hello!", then the app
    goes to `/setup`. Phase 3 has no way to create a child, so that is always the destination;
    Phase 4 replaces it with the picker / map / setup choice. Screens that are built carry
    `built: true` in `screens.ts`, and `routes.ts` maps them to their components.
26. **UI pictures.** `parrot` (Polly) and `turtle` (🐢) join the manifest, same pinned Fluent
    commit, 20 kB and 25 kB after SVGO. 🐇 reuses the existing `rabbit` picture. They are not
    content, so `check:content` lists them as `UI_IMAGE_IDS`: required to exist, never
    reported as unused. Watch at the Phase 5 picture gate: the 🐇 toggle shows the same rabbit
    that is the word *rabbit*.
27. **Where a picture is tapped in Phase 3.** The child screens with pictures are Phases 4–5,
    so `/parent/speech` gets a word board („Posłuchaj słówek”): every word of the first four
    topics as a tappable picture, with the 🐢/🐇 toggle. It is also the tool for the manual
    speech gate. `SpeakingPicture` and `SpeedToggle` are the components the child screens
    reuse. The toggle's state is per session, starts at `defaultSpeed`, and says „Powoli.” /
    „Normalnie.” when switched; it is not stored.
28. **Sentence queue and boundaries.** `speakSentences` speaks one sentence per utterance (so
    Chrome never cuts a long one) and reports the word being spoken. Real `boundary` events
    are used when they arrive; until the first one, a timed fallback moves the highlight at
    an estimated 75 ms per character ÷ rate from the `start` event, and it stops for good as
    soon as a real boundary arrives. A watchdog resolves an utterance that never ends or
    fails (some Android builds drop `end`) after three times its estimate plus 4 s, so a
    queue never hangs. Stories (Phase 9) are the user.
29. **Sound effects are data.** Each of tap, correct, sparkle, wiggle, chest creak and pop is
    a short list of tones (waveform, frequency sweep, attack/decay envelope, start offset),
    rendered by a ~60-line Web Audio player. Peak gain ≤ 0.3, nothing longer than 1.2 s, and
    `wiggle` is a soft rising-falling wobble, not a buzzer (no loss mechanics). `/parent/speech`
    has a preview button per effect. No audio file, no `AudioWorklet`, no CSP change.
30. **One speech fake for both suites.** `src/lib/speech/fake.ts` exports
    `installSpeechFake(options, target = globalThis)`, a self-contained function that installs
    a recording `speechSynthesis` and `SpeechSynthesisUtterance` (voices that load
    asynchronously, `start`/`boundary`/`end` on a timer, Chrome-style `interrupted`/`canceled`
    errors on cancel). Unit tests call it on a plain object; e2e passes it to
    `page.addInitScript`. So the real `WebSpeechEngine` is what both suites exercise.
31. **Settings are written as `Lww` registers** stamped with the current time and this
    device's id (`setSetting` in `domain/family.ts`), through `updateFamily`. The preferred
    voices are local only (`meta`), as PLAN.md "Local data model" says.
32. **The network criterion is checked by e2e** over a whole session that speaks words at
    both speeds, prompts, a sentence queue and every sound effect: no request leaves the
    origin, nothing audio is requested (resource type, content type or file extension), and
    no request at all is made while speaking. Chrome's own "Google …" voices are fetched by
    the browser outside the page and are not visible to it; that is one more reason local
    voices are preferred (decision 22).

### 2026-10-19 — Phase 4: Children, word plan, parent gate, look-and-listen

No open question names Phase 4.

33. **Avatars and new UI pictures.** The avatar set is eight Fluent "Color" SVGs from the same
    pinned commit (fox, lion, panda, owl, frog, octopus, penguin, koala; a unicorn stayed over the 25 kB
    budget even at precision 1), listed in a new
    `content/avatars.json` that `check:content` validates (non-empty, unique, every picture
    exists). None is current vocabulary. New UI pictures: `sailboat` (Polly's ship on the
    map), `gear` (the parent gate's entry) and `house` (the long-press home button), added to
    `UI_IMAGE_IDS`. The islands and the flag are hand-made inline SVG in a component, as
    PLAN.md says for map islands. No CSP change.
34. **Children and plans in the domain layer.** `domain/children.ts` and `domain/plan.ts` are
    pure functions over the family file; screens go through them. Every `Lww` write uses one
    stamp rule (`nextStamp`, factored out of `setSetting`): `now`, or 1 ms after the
    register's stamp when another device's clock ran ahead. Adding a child writes its profile,
    a default plan and default limits. Deleting writes the tombstone
    `{ name: '', avatar: '', deleted: true }`: the nickname does not linger in the file. The
    deleted child's progress subtrees stay (each device owns its own; pruning them is a sync
    concern for Phase 7). In a plan, *queued*, *known* and *paused* are mutually exclusive:
    marking one removes the word from the other two. A queued word leaves the queue once it
    is introduced: the editor shows only queued words not met yet, and the parent's next save
    drops the others. The child's device never rewrites the plan for it, since a whole-plan
    `Lww` write from there could undo a parent's edit made on another phone.
35. **`DeviceProgress` gains `lessons: Record<eventId, { at, words }>`**, the lessons finished
    on this device and the new words each introduced. Islands on the map are lessons, and
    nothing in the Phase 2 model counted them. It is an event log like `chestsOpened`, merged
    with the whole device copy by `seq`, so the merge does not change. No stored progress
    predates it (there was no way to create a child before this phase), so it is required,
    not optional. `introduced[word]` is written on the child's first tap on the big picture
    (PLAN.md: "tapped at least once"), so a lesson left halfway still counts what was seen.
36. **The child picker lives on `/`, after the tap**, not on a route of its own: `/` with
    0 live children → `/setup`; 1 → that child's map; ≥ 2 → the picker (avatars, names under
    them for the parent, spoken prompt). Once speech is unlocked in this session, `/` skips
    the tap. The long-press home button is on the map only when there are ≥ 2 children (it
    leads back to the picker; with one child the map *is* home), and on the lesson (back to
    the map). A short press says „Przytrzymaj dłużej, żeby wyjść.” (`home.hold`).
37. **Parent gate.** A number 10–99 written in Polish words and a 0–9 keypad. The second digit
    checks the answer. A wrong answer clears the entry, draws a new number and locks the
    keypad for 5 s, doubling with each further miss up to 60 s. A random guess is right 1 time
    in 90, so the pause is what bounds random tapping: 50 quick taps (150 ms apart) fit two
    guesses (≈ 2 %), 50 slow ones (400 ms) three (≈ 3 %), unit-tested over 2000 seeded bursts.
    A 2 s first pause allowed three guesses even for quick taps (3.4 %). Passing opens the parent
    area until a child screen is shown again (or a reload); nothing is stored. Every
    `/parent/*` route renders the gate until then. `/setup` is not gated (first run, no child
    yet) and redirects to `/` once a child exists. The gear on the map speaks „To jest
    miejsce dla rodzica…” and the gate has a big Polly button back to the child. The e2e
    "50 random taps" seeds `Math.random` in the page, so the number and the taps are fixed
    and the test is deterministic; the gate logic (new number, cool-down) is unit-tested.
38. **The word queue is reordered with ↑/↓ buttons, not by drag; `svelte-dnd-action` is not
    installed.** PLAN.md's task allows "by drag or buttons". Buttons work the same with a
    finger, a mouse and a keyboard, need no package, and set no inline style (drag libraries
    position the dragged element with styles, which would need checking against
    `style-src 'self'`). Likewise **Bits UI stays unused**: deleting a child asks for
    confirmation inline („Na pewno?”), which needs no dialog.
39. **The Phase 4 lesson is look-and-listen only**: the `introduce` steps of `composeLesson`
    (≤ 3 new words), each a big picture the child taps; then „Brawo! Wyspa zdobyta!” and the
    lesson is recorded. The picks are Phase 5. When `composeLesson` has no new word, the
    ship's island says „Nowe słówka już niedługo!” instead of opening an empty lesson. The
    map's bottom bar (🎲 📖 📒) appears with the first of those screens (Phase 5); a bar of
    placeholders would lead a child onto screens with text and no way back. Unbuilt child
    routes are not reachable from any child screen.
40. **New prompts** (`check:content` requires them): `picker.who`, `map.go`, `map.later`,
    `gate.parents`.

## Open questions

Copied from PLAN.md. Each is settled in the phase named and the answer recorded here.

1. **Name, domain, repository** (Phase 1). **Settled** (decision 1): "Hello Polly", not
   translated, no subtitle; `hellopolly.gorny.dev`; `zyndata/hello-polly`.
2. **Default accent** (Phase 3). **Settled** (decision 19): British, `en-GB`; American
   selectable.
3. **Sticker art**: 3D PNG (richer, larger) or Color SVG (Phase 6).
4. **Picker in an installed iOS PWA**: unknown until measured; fallback defined (Phase 8 spike).
5. **Should one family file per Google account allow several families?** Assumed no: one
   family per account (Phase 7).
6. **Speech engine and picture set**: kept or replaced by the quality gates in "Speech and
   pictures are replaceable" (Phases 2, 3 and 5).
7. **Level-2 and level-3 content** (verbs, adjectives) needs animation, not a still picture.
   The scope of animation per word is decided when Phase 11 starts.
