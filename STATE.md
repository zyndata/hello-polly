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
| 5     | Lessons & first exercises                           | done        | 2026-10-19 |
| 6     | Rewards                                             | done        | 2026-10-19 |
| 7     | Drive sync (one account, many devices)              | done        | 2026-10-19 |
| 8     | Inviting the second parent                          | done        | 2026-10-20 |
| 9     | Stories & more games                                | done        | 2026-10-20 |
| 10    | Screen time & the progress dashboard                | done        | 2026-10-20 |
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
- [x] **CI green on `dev`. A `v0.1.0` tag deploys and `https://<domain>` serves the shell.**
      CI: **green** on `dev` (run 39159075235 on `dc65ced`: check, unit, build, and e2e
      34/34 in Chromium + WebKit). Deploy: **met 2026-10-19** once the owner prerequisites
      were in place (decision 51). `v0.1.0` (tagged on `f0789ec`, released from `fb32444`
      whose CI run 39290289871 was green) ran `deploy.yml` 39303275715 green, including the
      health check through Cloudflare. https://hellopolly.gorny.dev serves the shell with the
      Caddyfile CSP; `/`, `/sw.js` and `/manifest.webmanifest` are `no-cache` and
      `cf-cache-status: DYNAMIC`, `/assets/*` is `immutable` and `HIT`.
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
- [x] **Images load from jsDelivr in a production build (verified after the next tag) and
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
      **Met 2026-10-19 with `v0.1.0`:** the live bundle builds its picture URLs with ref
      `v0.1.0`, and on https://hellopolly.gorny.dev all 64 pictures in `content/img/` load
      from `cdn.jsdelivr.net/gh/zyndata/hello-polly@v0.1.0/content/img/` in Chromium and
      WebKit with no `img-src` violation. (The one violation on the page is Cloudflare's own
      injected script, decision 53, not a picture.)

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

### Phase 5 acceptance (2026-10-19)

- [x] **A full lesson runs end to end in both engines (e2e) and updates attempts, stars and
      states.** `e2e/lesson.spec.ts`, Chromium and WebKit: first run → the ship → look and
      listen for *red*, *blue*, *yellow* → six 2-choice picks. On the first pick the test taps
      the wrong picture twice: the wiggle, the tapped word, „Spróbuj jeszcze raz.” and the
      target; then the coral glow and „Popatrz, to ten!”; Polly's mood turns to `think`, 🔊
      asks again, nothing is removed. Then the finish: 10 stars (9 steps + 1 for the five
      first tries in a row), „Brawo! Wyspa zdobyta!”, back on the map. IndexedDB then holds,
      on this device, today's `{ c: 2, w: 2, first: 1 }` for the missed word and
      `{ c: 2, w: 0, first: 2 }` for the others, `stars: 10`, one lesson, three words
      introduced; the parent's word list shows all three as „ćwiczy”. A lesson left halfway
      keeps its two answered picks and gives no stars. Unit: `recordAttempt`, `addStars`, and
      the attempt history making a word learned (`progress.test.ts`).
- [x] ***Cyferki*: four digits map to four distinct words; each digit speaks its word; a
      correct match removes the pair; a wrong one never removes it.** Unit (`digits.test.ts`):
      100 seeded boards, four distinct words each; a match takes the pair off; four wrong taps
      in a row remove nothing (retry, then hint); a picture tap with no digit picked is only a
      tap. e2e (`games.spec.ts`), both engines, over five learned fruit: each digit tile,
      tapped, says an English word that is one of the four pictures, and the four are
      distinct; two wrong pictures for digit 1 remove nothing and make the right one glow; each
      right match marks and hides both the picture and the digit. Attempts: `w: 2, first: 0`
      for the first word, clean for the rest; 5 stars. Found and fixed on the way: a picture
      wiggled earlier kept its wiggle animation and never left the board.
- [x] **New words appear only in 2-choice steps within their first lesson.** Unit
      (`exercise.test.ts`): 300 random histories over the real content (every box, due and
      not, paused words), `composeLesson` → `planLesson`: any pick whose pictures include one
      of the lesson's new words has exactly 2; every pick has its composed count, the target,
      no repeated picture and no two words that sound alike (*orange* / *orange*); no paused
      word is shown. e2e: four fruit learned in boxes 3–6 and due → the lesson introduces 2
      words; the reviews show 3, 4, 4 and 4 pictures and never a new word; the new words'
      four picks have 2. The next lesson introduces the next three, with the same rule.
- [ ] **Tested with a real 4-year-old: one full lesson without adult help.** **Open**: it
      needs the owner and the child; this environment has no child and no phone. Closed by:
      on a phone (a `docker:up` build on the LAN, or the live site after the next `/release`),
      the child plays one island from the map to the finish without help, and the owner
      records here: completed or not, where they hesitated or tapped wrongly, whether the
      Polish prompts, the 🐢 speed, the glow and the ▶ were understood, and the picture and
      speech gate results below.

Also: the game shelf is locked with fewer than 4 learned words (Polly with a lock, „Najpierw
poznajmy więcej słówek!”, a game's address leads back to the shelf), *Cyferki* stays locked
until 4 learned words outside the numbers; E1 free play is five picks over learned words
only (6 stars, attempts recorded); *Memory* speaks each flip, keeps pairs, turns two different
cards back and records no attempt (3 stars); the shelf and every game leave only on a long
press. `e2e/no-reading.spec.ts` now also walks a pick (after two misses), the finish, the
locked and open shelf, all three games, a face-up card and a game's finish: no visible text,
every button a picture.

Tests: 240 unit tests (26 files); e2e 98 passed + 2 opt-in skipped in Chromium and WebKit,
both under `vite preview` and with `test:e2e:csp` against the container (zero CSP violations;
the CSP is unchanged in this phase). Bundle: 238.8 kB JS (81.8 kB gzip), 29.6 kB CSS.
Content: 64 pictures, 684.3 kB, the largest 24.7 kB; 23 prompts.

CI: **green** on `dev` (run 39289396805 on `d3896e3`: check, unit 240, `check:content`,
build, e2e 98 passed + 2 opt-in skipped in Chromium + WebKit).

### Phase 6 acceptance (2026-10-19)

- [x] **Unopened chests survive reloads and are identical after merging two devices'
      progress.** Unit (`stickers.test.ts`): over 300 generated pairs of family files,
      `chestState` and the album are the same for `merge(a, b)` and `merge(b, a)`, and merging
      again changes nothing; a phone opening a chest and a tablet earning stars converge to
      the same `{ unopened: 1, meter: 2 }` and the same album in both merge orders;
      `recordChest` is idempotent per event id and bumps `seq` once. e2e (`rewards.spec.ts`,
      Chromium + WebKit): 34 stars and one chest opened on "another device" → the map shows
      one chest waiting and 4 on the meter; still there after a reload; opened in three taps
      → recorded on this device under one event id with exactly the stickers shown; back on
      the map no chest waits, the meter keeps its 4, and the chest's address leads to the
      map. Leaving after two taps (long-press home) records nothing and the chest still waits.
- [x] **The draw is deterministic given its seed (unit) and never repeats within an
      incomplete set.** Unit: the same seed gives the same stickers (50 seeds, and through
      `drawForChild` on a real family file); 1–3 stickers, never one twice in a chest; over
      400 random albums and word states nothing owned is ever drawn while anything is left to
      collect (so nothing repeats in an incomplete set); a full album repeats across chests,
      never within one. Also: learned > met > preview over 2000 draws, nothing neither met
      nor next while those last, only the first 5 upcoming words count as a preview, and a
      rare sticker has half the weight (drawn first 25–42 % of the time against an ordinary
      one, not 50 %). e2e: a sticker owned from the other device's chest is not drawn.
- [x] **The chest animation respects `prefers-reduced-motion`.** e2e, both engines, twice:
      with `reducedMotion: 'no-preference'` the map chest bobs and the rattle, lock pop, lid
      swing, glow pulse and sticker fly-out each run their animation (the control); with
      `'reduce'` every one of them computes `animation-name: none`, while the meaning stays:
      the lid is open (a transform), the lock is gone (opacity 0), the glow is on (opacity 1)
      and the stickers are there (opacity 1). The shimmer of rare stickers, the meter's
      growth, an empty slot's wiggle and the album's „new” ring follow the same rule
      (`app.css`).

Also: the album is open from the first day (four topic tabs, 11 empty colour slots,
„Zbieraj gwiazdki…”, an empty slot wiggles and says „Tej naklejki jeszcze nie masz.”, a tab
switches the page); after a chest the album opens on the first page in map order with a new
sticker, rings the new ones, and a tap on a sticker says its word. `e2e/no-reading.spec.ts`
walks the empty album, the map with a chest, the shut and the open chest, and the album with
new stickers: no visible text, every button a picture. The README gains the chest and album
screenshots (`npm run screenshots` now walks a chest).

Seen in the screenshots, not fixed: on the colours page every empty slot shows the same flag
silhouette, since the 11 colour pictures share one shape (decision 55). An empty colour slot
therefore does not hint which colour it holds; the other pages do.

Sticker art (task 5, decision 56): Color SVG, the word's own picture; **0 kB added** to the
content. The only new picture is the 📒 button (`ledger`). Content: 65 pictures, 668.5 kB,
the largest 24.7 kB; 30 prompts; 45 stickers, 4 rare.

Tests: 258 unit tests (28 files); e2e 106 passed + 2 opt-in skipped in Chromium and WebKit,
both under `vite preview` and with `test:e2e:csp` against the container (zero CSP violations;
the CSP is unchanged in this phase). `rewards.spec.ts` also ran 3 × 3 repeats in both engines
(90 runs) with no failure. Bundle: 255.6 kB JS (86.1 kB gzip), 34.7 kB CSS.

CI: **green** on `dev` (run 39311290913 on `5a34b58`: check, unit 258, `check:content`,
build, e2e 106 passed + 2 opt-in skipped in Chromium + WebKit).

### Phase 7 acceptance (2026-10-19)

- [x] **Two devices playing at the same time with the same child converge to identical
      derived state, and nothing is lost (fake-drive e2e, including an interleaved upload
      race).** e2e (`sync.spec.ts`, two browser contexts over one fake Drive): a phone connects
      from *Rodzina*, a tablet joins from the first run („Mam już rodzinę na Dysku Google”, the
      same child, no duplicate); both meet a word at once; after the debounce and a focus both
      IndexedDB copies and the file are byte-identical (canonical JSON) and each holds both
      devices' words. The race: the phone's upload is parked after its write guard passed, the
      tablet's whole cycle lands, the phone's stale upload then drops the tablet's subtree *from
      the file*; on the tablet's next cycle it is back, and all three copies are identical.
      Unit (`engine.test.ts` over `src/test/fake-drive.ts`): the same two races (caught by the
      guard and re-merged; past the guard and re-added), and **40 seeded runs of 30 random
      steps on three devices** (stars, chests, settings, syncs, each sync possibly interleaved
      with another device's cycle before or past the guard): every run ends with three
      identical files equal to Drive's, every device's stars and every chest present.
- [x] **An expired token never shows anything on a child screen.** e2e: the token is revoked
      while the child plays; the map stays, no dialog, no alert, no text, no Google window
      (GIS prompts unchanged); later play makes **no** Google request at all; the only change is
      the gear's empty coral dot (decision 67). Passing the parent gate renews silently and the
      waiting word lands on Drive. Also: a token that ran out is not renewed on reload (no GIS
      load, no request), and a device that never connected makes no Google request through a
      whole session, the gate included.
- [x] **Zero CSP violations through the OAuth flow under `npm run docker:up`.** The whole suite
      against the container built with a client id (decision 72): 62 passed, 1 opt-in skipped,
      zero violations, the sync specs included (the GIS stub is served from
      `https://accounts.google.com/gsi/client`, so the shipped policy is what allowed it).
      What this cannot show is real Google's own frames and popup: that is the live check.
- [ ] **Live check against real Google, recorded in DEPLOYMENT.md as a checklist.** The
      checklist is written (docs/DEPLOYMENT.md "Live check against real Google"); **not run**:
      the owner's Google Cloud project and OAuth client do not exist yet (the owner's answer
      this phase). Open until the owner creates them, sets `VITE_GOOGLE_CLIENT_ID` (`.env.local`
      and the repository variable) and walks the checklist; the result goes here.

Also: `drive.test.ts` covers the REST client (find by name oldest-first, multipart create,
guarded media update, 404/trashed/`appNotAuthorizedToFile` → gone, 401 → re-auth, quota 403
is not an auth failure, two retries on 429/5xx, `about.get`); the engine never overwrites a
newer-schema file or a non-family file, re-creates a file that is gone, settles two fresh
devices that both created the file on the older one (the younger trashed), and compacts and
prunes only its own subtrees. Speech settings now go through `change()` like every other
write, so they trigger a sync too.

Tests: 282 unit tests (30 files); e2e in Chromium 62 passed + 1 opt-in skipped, under
`vite preview` and under `test:e2e:csp`; `sync.spec.ts` also ran 3 × in Chromium with no
failure. **WebKit was not run locally**: this machine's Playwright WebKit cannot load any
page at all (`WebKit encountered an internal error`, even for `https://example.com` and the
untouched `routes.spec.ts`), an environment fault since Phase 6; CI runs WebKit. Bundle:
275.4 kB JS (92.1 kB gzip, +6 kB), 35.0 kB CSS.

CI: **green** on `dev` (run 39317063495 on `d2e9200`: check, unit 282, `check:content`,
build, e2e 124 passed + 2 opt-in skipped in Chromium + WebKit, no flaky test). So the sync
specs did pass in WebKit, in CI.

### Phase 8 acceptance (2026-10-20)

- [x] **Parent B, on a different Google account, joins from the link in ≤ 3 taps after sign-in
      and sees A's children and settings.** e2e (`sharing.spec.ts`, two contexts on two accounts
      over one fake Drive): A sets the American accent, connects, invites B from *Rodzina*; the
      fake Drive records the invitation, whose note carries `<origin>/#/join/<fileId>`. B opens
      that link → „Połącz z Google” → in the Picker frame the file and „Wybierz”: **2 taps**
      after the sign-in. „Gotowe!” lists Ola; B's IndexedDB equals the file on Drive; B's
      *Mowa i głosy* has the American accent; *Rodzina* names B's account and marks B „to ty”,
      with no „Usuń”. The Picker was built for that one file id, with the build's key and app
      id, for this origin. A phone with a child of its own needs a third tap, „Dołącz”, and A
      then has both children. Unit (`engine.test.ts`): before picking, the shared file is out
      of reach for B (drive.file); after, B's copy has A's children, settings and `familyId`.
- [x] **Progress made on B's phone appears on A's phone after a focus or 3 minutes.** e2e: B's
      child meets a word; B's debounce uploads it; A's focus brings B's device subtree into
      A's IndexedDB, and after B's focus both copies are identical. The 3-minute timer is the
      Phase 7 trigger, unchanged. Unit: B's stars reach A on A's next cycle, derived state equal.
- [x] **Removing B stops B's sync with a clear message; A's data is untouched.** e2e: A's „Usuń”
      → „Na pewno usunąć?” takes B off the file (Drive's permissions: A alone). B's child plays
      on: the map stays, no alert, only the gear's dot; B's *Rodzina* says „Dostęp cofnięty” and
      „Dostęp do wspólnej rodziny został cofnięty…”. The file is byte-identical to before the
      removal, nothing was re-created, A's own copy is unchanged after a focus, and B keeps
      Ola and her progress. After a reload and the gate, B's device asks Drive nothing at all.
      Unit: the revoked error for a removed member and for a file its owner trashed (PLAN.md's
      edge case); a mutation that dropped the rule turned both red, and one that kept the
      status at `error` turned the e2e red.
- [x] **B signed in with the wrong account gets a message naming that account.** e2e: signed in
      as `obcy@example.com`, the Picker lists nothing; closed, the screen says „Plik rodziny nie
      został wybrany. Zalogowano jako obcy@example.com…”, nothing changed (one file on Drive,
      no family on the phone); „Zmień konto” (the account chooser) → B's account → the file →
      „Gotowe!”. A closed Picker on the right account changes nothing either, and „Spróbuj
      jeszcze raz” opens it again.

Open, with what closes it:

- **The spike (task 5, open question 4): not run** (decision 75). It needs the web manifest
  (Phase 11) and the two phones; the procedure is in docs/DEPLOYMENT.md ("Spike: the Picker in
  an installed PWA"). The fallback it would choose is built already.
- **Live check against real Google, second parent: not run.** Checklist in docs/DEPLOYMENT.md
  ("Live check against real Google (the second parent)"). It needs two Google accounts, both
  test users while the consent screen is in *Testing*. The Cloud project and the three
  `VITE_GOOGLE_*` repository variables now exist (the owner set them since Phase 7), so this
  and the Phase 7 live check can both run: locally under `docker:up` now, live after the next
  `/release`. What it must show: the one expected `style-src-elem` report (decision 81), the
  key accepted (it was not with `no-referrer`: decision 99), and the real invitation e-mail.

Also: *Rodzina* before connecting explains that the family must be on Drive first and offers no
invitation; the invite link is shown with „Kopiuj link”; the first run's „Mam zaproszenie” takes
a pasted link (or bare id) to the join screen (`invite.test.ts`); no screen loads the Picker
until a parent signs in on the join screen. Unit (`drive.test.ts`): the search prefers a shared
file, the invitation's query and body, the member list (owner first, users only), removal,
the picker gets the token in hand, „Zmień konto” asks for `select_account`.

Tests: 300 unit tests (31 files); e2e in Chromium 70 passed + 1 opt-in skipped, in WebKit 69
passed + 2 skipped (the opt-in and the real-speech check, no speech engine in Windows WebKit),
both under `vite preview`; and `test:e2e:csp` against the container in both engines: 139
passed, 3 skipped, zero violations. WebKit runs on this machine again (it could not load any
page in Phases 6–7). Under 8 parallel workers two older specs on real timing (the real-speech
start screen, a full lesson) missed their 5 s waits once each; both pass alone and the whole
suite passes with 4 workers. Not from this phase: they touch nothing it changed.

CI: **green** on `dev` (run 39426928459 on `de9c7bd`: check, unit 300, `check:content`, build,
e2e 140 passed + 2 opt-in skipped in Chromium + WebKit, no flaky test).

### Phase 9 acceptance (2026-10-20)

- [ ] **Each story plays in 25–40 s at normal speed on a real phone (measured, recorded).**
      **Open**: it needs a phone and its voices; this environment has neither. What is checked
      here: the page hold is set so that every story's *estimated* time (decision 28's
      75 ms per character ÷ rate, plus intro, holds and turns) lies in 25–40 s at the normal
      rate, unit-tested (`stories.test.ts`): picnic 32.1 s, flags 31.9 s, counts 29.5 s,
      animals 30.8 s, body 30.0 s (at 🐢 0.6: 33.8–37.7 s). Closed by: on the child's phone
      (a `docker:up` build on the LAN, or the live site after the next `/release`), the owner
      plays each of the five stories at 🐇 from the first tap on its tile to the shelf
      coming back, with a stopwatch, and records the times and the voice here. If a story
      falls outside, the fix is `PAGE_HOLD_MS` (one constant) or the story's text.
- [x] **No story uses a word outside the vocabulary plus the allow-list (validator in CI).**
      `check:content` (in CI since Phase 2) runs on the five stories: every token is a word's
      or a topic's English name or one of the function words. It now also checks the PLAN.md
      shape (5–8 pages, 3–7 words per sentence), that every scene item fits the scene at a
      tappable size, and that every pictured word is named in its sentence (decision 84);
      `content-rules.test.ts` breaks each rule once.
- [x] **Each game is completable in both engines (e2e) and only shows learned words.**
      `e2e/play.spec.ts` plays every new game to its finish screen and back to the shelf,
      asserting at every round that each word on screen is one the child learned: *Bańki*
      (also with reduced motion: the bubbles stand still), *Nakarm Polly* (a drag beside
      Polly changes nothing, a wrong food dragged onto her is a miss, the right one dragged
      or tapped is eaten), *Gdzie jest…?* (the same scene for all five questions), *Polly
      mówi* (learned body parts only, no attempt recorded), *Pokoloruj* (no pot: „Najpierw
      dotknij farbki!”; a wrong pot never paints; the second miss glows) and *Kosze* (absent
      until the parent ticks it in the word plan, then six pictures into two baskets). Each
      checks its stars and the attempts it should or should not record. Unit
      (`games-play.test.ts`, `games.test.ts`): 60 seeds per game for learned-only boards,
      distinct targets, pictures that neither look nor sound alike, the scene's layout
      inside and apart, *orange* never painted *orange*, and the opening rules. **Chromium
      passed here; WebKit could not run on this machine** (the `WebKit encountered an
      internal error` fault of Phases 6–7 is back: even the untouched `routes.spec.ts` cannot
      load a page). CI ran them in WebKit, green (below).

Also: stories (`e2e/stories.spec.ts`): all locked with nothing learned, and a locked story's
address leads back to the shelf; 3 of 5 words keep the picnic locked, 4 open it; the map's 📖
and the tile glow while it is new; the story plays its intro and all six pages in order to
„Koniec bajki! Brawo!”, is recorded once on this device (`storiesHeard`) with no stars, and is
then no longer new. With slow speech: the spoken word is marked in the sentence and the apple
bounces (only it) while "apple" is spoken; 🔊 and a tap on a picture both read the page again;
leaving by the long press records nothing. After a chest, Polly says „Polly ma dla ciebie nową
bajkę!”. `e2e/no-reading.spec.ts` now walks the story shelf (locked and open), the map with a
new story, a story page, all six new games and a painted picture: no visible text but the
story's sentence, which is the parent's. README: status, the new games and stories, and three
new screenshots (a story page, *Pokoloruj*, *Gdzie jest…?*).

Tests: 324 unit tests (33 files); e2e in Chromium 81 passed + 1 opt-in skipped under `vite
preview`, and `test:e2e:csp` against the container (built with the e2e's never-sent Google
ids, so the sync specs ran too): 81 passed, 1 skipped, zero CSP violations; the CSP is
unchanged. Bundle: 333.4 kB JS (108.3 kB gzip, +16 kB), 42.7 kB CSS. Content: 79 pictures,
806.6 kB, the largest 25.0 kB (`basket`); 53 words, 41 prompts, 5 stories, 53 stickers (5 rare).

CI: **green** on `dev` (run 39459512304 on `c0f6fc2`: check, unit 324, `check:content`,
build, e2e 162 passed + 2 opt-in skipped in Chromium + WebKit, no flaky test). So every new
game and the stories passed in WebKit too, in CI.

### Phase 10 acceptance (2026-10-20)

- [x] **With a 1-minute session limit, the lock appears after the current exercise, never
      mid-step.** e2e (`screentime.spec.ts`, the page's clock driven by Playwright's
      `page.clock`): the minute runs out while a look-and-listen picture waits for its tap; the
      step stays and works, the ▶ appears, and only its tap brings the lock (night sea, Polly
      asleep, „Koniec na dziś! Polly idzie spać.”). The lesson stops there: 1 star for the step
      done, no island flag, the word met, 1 minute on this device's record. The minute runs out
      during a pick: two misses keep the same pick (with the glow), the right tap brings the lock
      and records `{ c: 1, w: 2, first: 0 }`. A game (*Posłuchaj i dotknij*) whose minute runs
      out in round 2 plays all five rounds to its finish screen and 6 stars; the shelf it returns
      to is the lock. Every child address (map, lesson, shelf, stories, album) then shows the
      lock, and a lesson opened by its address never starts. A mutation that drops the lesson's
      hold turns both lesson tests red. Also e2e: the gate lifts the lock (fresh session; the
      1-minute limit applies again), the next day lifts it by itself, the map has no home button
      when locked, no limits means no lock through 12 minutes of play (past the default 10-minute session). Unit
      (`screentime.test.ts`): whole minutes written and the rest kept, no counting across a
      suspended gap or while asleep, a new day and a 30-minute break, sticky sleep, the gate's
      waiver only for the daily limit.
- [x] **Two devices' minutes add up after sync (fake-drive).** e2e (`dashboard.spec.ts`, two
      browser contexts over the e2e fake Drive): the phone plays 2 minutes, the tablet 1, each
      on its own clock; after focus both IndexedDB copies and the file on Drive are identical,
      each device's subtree holds its own minutes, and both dashboards say „Dziś: 3 min” with 3
      in today's calendar cell. Unit (`engine.test.ts` over `src/test/fake-drive.ts`): 7 + 6
      minutes on one day and 2 on another from two devices merge to 13 and 2 on both, and the
      daily limit of 15 is reached exactly when this device's unwritten 2 minutes are added.
      e2e (`screentime.spec.ts`): 15 minutes from another device lock the child at once on this
      one; the gate waives the daily limit for the rest of the day.
- [x] **Export → import into a fresh profile reproduces derived state exactly.** e2e
      (`backup.spec.ts`): a child with a played lesson, learned words, an opened chest, stars and
      minutes is exported from the panel (`hello-polly-rodzina-<day>.json`, no device id, token,
      Drive id or voices in it); a fresh browser context imports it from the first run („Mam
      kopię zapasową”): its IndexedDB file equals the original (canonical JSON), and the whole
      dashboard, the word plan, the map's islands, star meter and waiting chests read the same on
      both. Into a device with a child of its own the import merges (both children, the device's
      `familyId` kept, the backup's progress intact); a non-backup and a newer-schema file are
      refused with a Polish message and change nothing. Unit (`backup.test.ts`): 200 generated
      family files export → import into an empty profile to the identical file and identical
      derived state (stars, chests, album, lessons, word states, every dashboard figure); 100
      imports into a device with children lose nothing and are idempotent.

Also: the parent's child screen gains „Czas zabawy” (the two limits, saved as the child's
`limits` register; e2e) and „Postępy” (e2e checks learned per topic, the missed word first in
„Do poćwiczenia”, today's minutes from two devices in the calendar, stickers, stories heard;
unit `dashboard.test.ts`). `e2e/no-reading.spec.ts` covers the lock. README: status, and two
new screenshots (the lock, the dashboard); `npm run screenshots` now walks both.

Tests: 345 unit tests (36 files); e2e in Chromium 92 passed + 1 opt-in skipped under `vite
preview`, and `test:e2e:csp` against the container (built with the e2e's never-sent Google ids):
92 passed, 1 skipped, zero CSP violations; the CSP is unchanged (the backup download is a `blob:`
link, which no directive governs). **WebKit could not run on this machine** (the `WebKit
encountered an internal error` fault of Phases 6, 7 and 9; even the untouched `routes.spec.ts`
fails to load a page); CI runs it. Bundle: 354.4 kB JS (113.9 kB gzip, +5.6 kB), 44.6 kB CSS.
Content: 80 pictures, 819.2 kB (+`zzz`, 12.6 kB); 42 prompts.

CI: the first run (39468402601 on `2bd8761`) was green with one flaky test, the new „no limits”
one in WebKit: it jumped the clock three times back to back, and when two jumps fell into one
tick the 220 s looked like a suspended device and counted nothing (decision 91, working as
designed). The test now waits for each minute to be written before the next jump.
Then **green** on `dev` (run 39470078605 on `7166fdb`: check, unit 345, `check:content`, build,
e2e 184 passed + 2 opt-in skipped in Chromium + WebKit, no flaky test). So every Phase 10 spec
passed in WebKit too, in CI.

## Quality gates

Recorded with the device and voice named (PLAN.md "Speech and pictures are replaceable").

| Gate     | When                         | Verdict | Device / voice |
|----------|------------------------------|---------|----------------|
| Pictures | end of Phase 2               | open: owner's verdict pending | Contact sheet of the 45 pictures rendered in Chromium (Linux) at 96 px, sent to the owner on 2026-10-18. Own pre-check: all decode; possible confusions are white heart (reads lavender), orange vs mango vs lemon (three round fruit), and the stylised bird. |
| Speech   | end of Phase 3               | open: owner's verdict pending | Needs real voices on an Android phone and an iPhone (see Phase 3 acceptance). Tool: `/#/parent/speech`, every word at 🐢. Criteria: every word of the first four topics told apart at slow speed by a first-time listener; `say` overrides ≤ ~10 % of words (≤ 4 of 45). |
| Pictures | Phase 5, with the child      | open: needs the owner and the child | Criterion: the child names or points to ≥ 90 % of the first four topics' pictures when asked in Polish. Tool: the lesson's picks, or `/#/parent/speech`'s word board, asked „Gdzie jest…?” by the parent. Watch: white flag, orange vs mango vs lemon, the bird, and the 🐇 toggle being the *rabbit* word (decision 26). |
| Speech   | Phase 5, with the child      | open: needs the owner and the child | Same criteria as Phase 3, judged with the child on the phone the child uses; record the device and the voice names `/#/parent/speech` reports. |

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

### 2026-10-19 — Phase 5: Lessons & first exercises

Open question 6 names this phase (the speech and picture gates, again with the child). Both
need the owner and the child; they stay open in "Quality gates" until the owner reports back.

41. **In a lesson every pick is E1 (*Posłuchaj i dotknij*)**, with the step's 2, 3 or 4
    pictures. E2 *Cyferki* (always 4 pictures) and E3 *Memory* (pairs, not one heard word)
    live on the game shelf as free play over learned words. Decision 17 left the choice to
    the player; this is what keeps "new words only in 2-choice steps" true by construction.
42. **Choices are planned once, when the lesson opens** (`domain/exercise.ts`, seeded by the
    lesson's id): the target plus distractors drawn in tiers, each tier shuffled: (a) for a
    2-choice step of a new word, the lesson's other new words; (b) words the child has met
    (any state but *new*, not paused); (c) the target's topic; (d) any word. A distractor
    never has the same spoken form as the target (*orange* the colour vs *orange* the fruit)
    or the same picture, and in a 3- or 4-choice step it is never a word this lesson
    introduces, so a new word appears in no step with more than 2 pictures.
43. **Errorless feedback, exactly.** A correct tap: the `correct` chime, a gold sparkle on the
    picture, Polly hops, the word, then an English praise at normal speed; the next step
    follows by itself. A wrong tap: the picture wiggles with the soft `wiggle` sound, says its
    own word (PLAN.md: tapping a picture always speaks its word), then „Spróbuj jeszcze raz.”
    and the target word. The second miss adds the coral glow on the right picture and says
    „Popatrz, to ten!” and the word instead. Later misses keep the glow. Nothing is ever
    removed, greyed out or marked wrong. A 🔊 button repeats the step's prompt.
44. **Attempts are written per exercise, the moment it is solved**, into this device's
    `DeviceProgress` (`recordAttempt`): `c + 1`, `w +` the wrong taps, `first + 1` when there
    were none, under today's local day. So a lesson left halfway keeps what was answered.
    E1 and *Cyferki* in free play record the same way; *Memory* records nothing (it matches
    pictures to pictures, it does not test a heard word).
45. **Stars.** A lesson gives 1 per step (look-and-listen steps included) plus 1 bonus for
    every 3 first-try answers in a row (a run of 7 gives 2); about 12–15 for a full lesson,
    so `starsPerChest` 15 is roughly one chest per lesson as PLAN.md intends. A game gives 1
    per solved pick, match or pair, plus the same streak bonus (E1, E2). Stars are written
    once, with the lesson record or at the end of a game (`addStars`); an abandoned lesson
    gives none. The finish screen shows the stars earned; the meter is Phase 6.
46. **The map sails whenever the next lesson has any step.** Before this phase a lesson was
    only new words; now one can be reviews and practice only. „Nowe słówka już niedługo!”
    is said only when there is nothing at all. The bottom bar is one 🎲 button to the game
    shelf: stories and the album are Phases 9 and 6, and a 🗺 on the map itself leads
    nowhere (decision 39 keeps unbuilt screens unreachable).
47. **New UI pictures** from the same pinned Fluent commit: `game-die` (the shelf button),
    `locked` (Polly holding a lock on a locked tile) and `speaker-high-volume` (🔊 repeat).
    *Cyferki*'s digit tiles are the keycap pictures of the numbers topic (no text on a child
    screen), so its four pictures are learned words **outside** the numbers topic.
48. **Game shelf.** Three tiles: E1 (🔊 over a picture), E2 (keycap 1), E3 (two card backs).
    Fewer than 4 learned words (derived *learned*, not paused) locks the shelf: each tile
    shows Polly with a lock and a tap says „Najpierw poznajmy więcej słówek!”. *Cyferki*
    stays locked until 4 learned words outside the numbers topic exist. Games: E1 is a round
    of 5 picks over learned words (choices by box, distractors from learned then met words);
    *Cyferki* one board of 4 pairs; *Memory* 3 pairs (6 cards), a non-pair turning back after
    1.2 s. Each ends on a finish screen with its stars and returns to the shelf. Game ids in
    the route: `listen`, `digits`, `memory`.

49. **One more prompt, `games.choose`** („W co zagramy? Dotknij obrazka!”), said on arriving
    at an open shelf, so the shelf has a spoken instruction like every child screen.
    `feedback.correct` („Świetnie!”) closes a game.
50. **Found on the way, fixed in this phase.** (a) Tailwind's `shadow-*` utilities sit in a
    later cascade layer than the component CSS, so every state ring set as a `box-shadow`
    was hidden: the 🐢/🐇 *chosen* ring (since Phase 3), and now the selected digit, the
    matched card, the right answer and the reduced-motion glow. The elements that carry a ring
    take their resting shadow from the component rule instead. (b) With 9+ progress dots the
    house and 🐢/🐇 were squeezed out of shape; they no longer shrink. (c) svelte-spa-router
    keeps a screen mounted when only a parameter changes, so the game screen loads from its
    params. (d) Two e2e races: a lesson walker that waited on a step the finish screen had
    replaced, and the Phase 3 speed test that reloaded before the setting was written.
    Lessons are now 8–12 steps, so the tests that play them get 90–120 s.

### 2026-10-19 — Owner prerequisites & first release (v0.1.0)

Not a phase: the manual setup PLAN.md lists under "Owner prerequisites", then `/release`.

51. **Owner prerequisites done as docs/DEPLOYMENT.md describes.** DNS A record (proxied);
    the existing WAF rule *Deploy health check* extended to `hellopolly.gorny.dev` (same
    token as Eat My Way and Szok); the two host-scoped cache rules; `/var/www/hellopolly`
    owned by the deploy user; the nginx site and a DNS-01 certificate (renewal dry run
    green). The five `SSH_*` / `DEPLOY_CHECK_TOKEN` secrets are set. The `VITE_GOOGLE_*`
    variables are not, as nothing reads them before Phase 7.
52. **Deviation: a deploy key of its own.** DEPLOYMENT.md assumed Eat My Way's key would be
    reused, but GitHub secrets cannot be read back and the developer's own key is not on the
    server. Hello Polly therefore has its own ed25519 key (`hello-polly-deploy@github-actions`)
    in `authorized_keys` of the deploy user. Its private half exists only as the
    `SSH_PRIVATE_KEY` secret, so revoking it touches no other project. The rulesets
    *Protect release tags* (`refs/tags/v*`: deletion, update, force-push blocked) and
    *Protect main* (deletion, force-push blocked), both without bypass actors, were created
    from the documentation, because Eat My Way's could not be read (private repository on
    the free plan).
53. **Known, not ours: one CSP violation from Cloudflare.** The edge injects an inline
    `window.__CF$cv$params` script (Bot Fight Mode / JavaScript detections) into every HTML
    response in the zone, Eat My Way included. `script-src` blocks it, as it should: its
    hash changes per request, and `unsafe-inline` is ruled out. The app is unaffected. The
    fix is in Cloudflare, by turning JavaScript detections off for the zone, not in the CSP.
    Until then, "zero CSP violations" on the live site means zero besides this one. The
    local `test:e2e:csp` gate has no edge and stays at zero.

### 2026-10-19 — Avatar set and colour pictures (owner requests)

54. **Owl and octopus out, hippopotamus and dog in** (changes decision 33). The avatar set is
    now fox, lion, panda, hippopotamus, frog, service-dog, penguin, koala. The owner asked for
    a German shepherd: Fluent has none, and its *Service dog* (pointed ears, dark muzzle) is
    the closest, vest and leash included; the plain `dog` word picture was the alternative.
    `service-dog` needs `floatPrecision: 2` to fit the 25 kB budget. `owl.svg` and
    `octopus.svg` are deleted outright: the owner is the only user of this test version and
    no profile uses them, so no migration and no `CONTENT_VERSION` bump.
55. **Colours are flags, not hearts** (changes decision 10). Fluent has no flag in all 11
    colours, so the 11 `<colour>-flag` pictures are Fluent's *Triangular flag* recoloured: a
    new optional `recolor` map (upstream `#RRGGBB` → new) per entry in `content/images.json`,
    applied by `scripts/lib/recolor.mjs` before SVGO, in attributes and in `feColorMatrix`
    inner shadows; a mapped colour missing from the picture fails the build. Only the four
    fabric colours change (two gradient stops, the highlight, the inner shadow); the wooden
    pole stays. ATTRIBUTION.md marks these files *recoloured* (MIT allows modification).
    The 11 hearts are deleted. The pictures quality gate's "white heart" watch item now
    reads "white flag". No new package, no CSP change.

### 2026-10-19 — Phase 6: Rewards

Open question 3 names this phase; PLAN.md's task 5 says "pick one and record the size", so it
is settled here (56).

56. **Open question 3 settled: Color SVG, and a sticker is a word's own picture.** One sticker
    per vocabulary word (45 now), `id` = the word id, `image` = the word's picture, `set` = the
    word's topic. Size added to the content: **0 kB** (no new file; the pictures are already
    in `content/img/`, within the 25 kB budget, on jsDelivr). 3D PNGs were rejected: about
    40–150 kB each upstream, a second format for `ImageSource` and `check:content`, and a
    sticker that looks unlike the word it says, when the album is meant to be a review
    device (PLAN.md "Rewards"). The cost: a sticker is not a *new* picture. Distinct sticker
    art (a sea set, gold variants) can be added later as plain content, since `Sticker.image`
    is already separate from `Sticker.word`.
57. **Rare gold stickers are content**: one per set (`numbers.ten`, `colours.purple`,
    `fruit.pineapple`, `pets-farm.horse`), 4 of 45 ≈ 1 in 11, as `rare: true`. They shimmer in
    the album and in the chest (a gold ring with a moving sheen; still under reduced motion).
    In the draw a rare sticker has half the weight of an ordinary one, so it tends to come
    later, but it always comes.
58. **The draw** (`domain/stickers.ts`, pure, seeded by the chest's event id): (a) the count is
    1, 2 or 3 (40 / 40 / 20 %); (b) candidates are the stickers the child does not own, and
    only once the whole album is owned does it draw from everything (then a sticker can repeat
    across chests, never within one); this is stricter than "no duplicates until a set
    completes" and implies it; (c) weights: word learned 6, word met (introduced or
    practising) 2, word among the next 5 the child will be taught (`nextWords`) 1 (the
    "preview"), anything else 0, used only when every weight is 0; rare × ½; (d) weighted
    sampling without replacement with mulberry32. The same seed, album and word states give the
    same stickers on every device.
59. **Opening a chest** is recorded as `chestsOpened[eventId] = { at, stickers }` (a new
    `recordChest` in `domain/progress.ts`, idempotent per id) at the moment the lid opens. Left
    before that, nothing is recorded and the chest still waits. The data model does not
    change. Two offline devices may each open "the last" chest; the opened count then exceeds
    the earned one, `unopened` stays at 0 (already clamped) and the child simply got one more
    chest. Accepted: no loss mechanic may take a sticker back.
60. **Chest scene** (`/child/:id/chest`): a hand-drawn inline SVG chest. Tap 1 rattles it
    (`chest-creak`), tap 2 pops the lock (`pop`), tap 3 swings the lid open with a gold glow
    (`sparkle`, `correct`) and the stickers fly out, each then spoken in turn; a tap on a
    sticker says its word again. A pulsing ▶ then leads to the album, on the page of the first
    new sticker, with the new ones ringed. With no chest waiting the route goes back to the
    map. Reduced motion keeps the meaning (the glow, the lid open, the stickers in place) and
    drops the travel (rattle, swing, fly-out, shimmer sweep).
61. **Map**: a star meter in the header, between the avatar (or home) and the gear: a gold
    star, then an SVG bar whose fill is an SVG `width` attribute (no inline style), stars
    toward the next chest out of `starsPerChest`, growing from empty on arrival. A chest sits
    at the bar's end: faded and inert while none waits, a bobbing, gold-glowing button when one
    or more do (the bob is on an inner element, so the button itself stays still). The bottom
    bar gains 📒 for the album. Arriving with a chest waiting, Polly says „Polly znalazła
    skrzynię skarbów! Dotknij jej!” instead of „Dotknij statku…”. New UI picture: `ledger`
    (📒, Fluent, same pinned commit, 20.7 kB upstream) in `UI_IMAGE_IDS`.
62. **Album** (`/child/:id/album`): one page per set, in map order, chosen by a row of big
    topic-icon tabs (no arrows, no page numbers). Each page is a grid of slots in the topic's
    teaching order: an owned sticker (white die-cut edge, gold for rare) speaks its word on a
    tap; an empty slot is a dashed outline with the picture's faint silhouette, and a tap on it
    wiggles and says „Tej naklejki jeszcze nie masz.” The album is open from the first day (an
    empty album is a goal, not a dead end): with no sticker yet Polly says „Zbieraj gwiazdki, a
    znajdziesz skrzynię z naklejkami!” Long-press home back to the map.
63. **New prompts**: `map.chest`, `chest.tap`, `chest.again`, `chest.open`, `album.look`,
    `album.empty`, `album.missing`. No new sound effect: `chest-creak`, `pop` and `sparkle`
    exist since Phase 3 (decision 29).

### 2026-10-19 — Phase 7: Drive sync (one account, many devices)

Open question 5 names this phase (64). The owner's Google Cloud project is not set up yet, so
everything here is built and tested against a fake Google; the live check is a checklist in
docs/DEPLOYMENT.md, open until the owner runs it.

64. **Open question 5 settled: one family per Google account** (the owner's choice, PLAN.md's
    assumption). Connecting looks for the app-created `hello-polly-family.json` (the oldest,
    if a race ever left two) and creates it only when there is none. A device that already
    has children merges them into that family: within one account every device is the same
    parent's, so the union is right. Choosing between two families („Dołącz” / „Zachowaj
    osobno”) is Phase 8's, for the second parent.
65. **`StorageBackend` is shaped for one file, not a folder.** Eat My Way's interface lists and
    names many files in `appDataFolder`; here there is one visible file found by name, then
    addressed by id: `authenticate`, `isAuthenticated`, `signOut`, `find`, `create`,
    `version`, `read`, `update(id, content, expected)`. `share`/`unshare`/`pick` arrive with
    Phase 8. The change check uses Drive's monotonic `version` (PLAN.md's `fields=id,
    modifiedTime,version`); the write guard re-reads it just before the upload, as Eat My Way
    does, since Drive has no conditional update. A lost race costs nothing (PLAN.md "Sync
    model"): the merge is a join, and the device whose delta was overwritten re-adds it on its
    next cycle.
66. **No Google request outside a parent's tap, ever.** Eat My Way decision 173 arms a silent
    renewal on the *next* tap anywhere; here that tap is usually the child's, and GIS's token
    flow opens a (briefly visible) window even when silent. So: the token is mirrored into
    `sessionStorage` (decision 173, never `localStorage`, never IndexedDB), background sync runs
    only while that token is valid and otherwise stops without loading GIS, and a renewal is
    attempted only (a) when the parent passes the gate (that tap is a parent's gesture, so a
    connected device renews silently on the way into the panel) and (b) from the buttons on
    *Rodzina*. The cost: a one-hour token means a child's device syncs for about an hour after
    a parent last visited the panel; its progress waits locally and lands on the next visit.
    The account hint for a silent renewal is the account label already kept in `meta`, held in
    memory: nothing at all goes to `localStorage`.
67. **The gear's dot means "progress is waiting and sync cannot run".** PLAN.md's dot on the
    gear is shown only when this device has changes Drive lacks *and* sync is stopped (expired
    token, revoked grant, or an error), so it is not on permanently between parent visits. It
    is a small coral dot with no text and no sound; nothing else on a child screen changes.
68. **The first-run Drive step is a button on „Zaczynamy?”: „Mam już rodzinę na Dysku
    Google”**, instead of PLAN.md's step 6 after the child. A second device of the same
    account must load the family *before* a child is created, or the parent would add the same
    child twice. A brand-new family is connected later from *Rodzina*, which PLAN.md allows.
69. **The sync pass also prunes a deleted child's progress** (decision 34 left it to this
    phase): this device replaces its own subtree for a tombstoned child with an empty one and
    bumps `seq`, so the merge takes it like any other change. A missing key cannot express it:
    the merge is a union, and the other copy would come back. Compaction (120 days) runs in
    the same pass, on this device's subtrees only.
70. **What the cycle does with a file it cannot trust.** A file whose `schema` is newer than
    this app's is never overwritten („Zaktualizuj aplikację”); a file that is not a family
    file stops sync with a message and is left as it is. A file that is gone (404 or trashed)
    is created again from the local copy: within one account the device is the source of
    truth. Phase 8 refines this for the second parent („Dostęp … cofnięty”).
71. **Screens are not live.** A sync writes the merged file to IndexedDB through the same
    transaction as every local change, so nothing is ever overwritten; child screens read it
    when they open, so the map shows another device's stars on the next screen, not mid-tap.
    *Rodzina* re-reads after each sync. Nothing on a child screen moves because of sync.
72. **e2e fake at the network boundary, unit fake in `src/test/`.** As in Eat My Way, the e2e
    runs serve a GIS stub from `https://accounts.google.com/gsi/client` and answer
    `www.googleapis.com` from a Playwright route, so the shipped CSP is exercised unchanged;
    the e2e build gets a fixed, never-sent `VITE_GOOGLE_CLIENT_ID`. `test:e2e:csp` needs the
    container built with any client id (`.env.local`); without one the sync specs skip with a
    message. `src/test/fake-drive.ts` is the in-memory backend for the engine's unit tests.

73. **CSP and COOP widened for Google Identity Services**, exactly as the task names:
    `script-src` + `https://accounts.google.com` (the GIS script), `frame-src 'none'` →
    `https://accounts.google.com` (its frames), `connect-src` + `https://www.googleapis.com`
    (Drive, uploads included), and a new `Cross-Origin-Opener-Policy:
    same-origin-allow-popups` (GIS returns the token through the popup's `opener`, which
    `same-origin` severs; Eat My Way decision 86). PLAN.md's `connect-src
    https://accounts.google.com` is not granted until something is measured to need it
    (live check). The Picker's `apis.google.com` and `docs.google.com` are Phase 8's.

### 2026-10-20 — Family file in a folder (owner request)

74. **Deviation: the family file lives in a `HelloPolly` folder**, not the root of My Drive
    (PLAN.md "Research summary" said only "the parent's visible Drive"). `create` first finds
    the oldest app-created, non-trashed `HelloPolly` folder (under `drive.file` the app sees
    only its own) or creates it, then creates the file with that parent. `find` still looks
    for the file by name anywhere the app can see, so a file the parent moves, or (Phase 8) a
    file shared by the other parent and picked, is still found. No migration: the owner is the
    only user so far, and a file already in the root is simply still found there. Two fresh
    devices racing may each create a folder; the duplicate file is settled as before (decision
    64) and an empty extra folder is harmless. No new scope, no CSP change.

### 2026-10-20 — Phase 8: Inviting the second parent

Open question 4 names this phase (the Picker in an installed PWA, the spike of task 5).

75. **The spike cannot run in this phase; the fallback is built so that it does not have to
    wait.** The app has no web manifest yet (vite-plugin-pwa is Phase 11), so neither phone
    can install it as a standalone app, and the spike needs the two real phones in any case.
    What is built regardless of its outcome: (a) the Picker is an iframe in the page, never a
    popup; (b) on iOS an e-mailed link always opens in Safari, never in an installed web app,
    and the `drive.file` grant the Picker gives belongs to the parent's *account* and the
    OAuth client, not to the browser, so after joining in Safari the installed app finds the
    shared file with „Mam już rodzinę na Dysku Google” (decision 78) without any Picker; (c)
    the first run's „Mam zaproszenie” takes a pasted link and runs the join in place. Open
    question 4 stays open until the spike runs (procedure in docs/DEPLOYMENT.md).
76. **Owner's answer: no „Zachowaj osobno”.** A device holds one family (decision 64), so the
    join offers only „Dołącz do wspólnej rodziny” (this device's children are merged into the
    shared family) or „Anuluj” (nothing changes). PLAN.md's second button is dropped.
77. **The join flow.** `/join/:fileId` is a parent screen, not gated (like `/setup`; a child
    does not open e-mail). „Połącz z Google” signs in, and **does not connect the device**
    until the file is picked: a closed Picker leaves everything as it was, not even a new
    file of the parent's own. After the sign-in the app first asks Drive for the file; when
    it is already reachable (picked before, or the owner opening their own link) the Picker
    is skipped. Otherwise the Picker opens by itself (an iframe needs no gesture), so the taps
    after sign-in are: the file, „Wybierz”, and „Dołącz” only when this device has children
    the family lacks. Joining adopts the shared family's `familyId`, merges, and uploads.
    When the device was syncing a family file of its own, that file goes to the Drive trash
    after the merge (Drive keeps it 30 days), so the parent's other devices follow: their
    file is gone, they look again, and the search prefers the shared file (78).
78. **Shared or own.** The file's `ownedByMe` is read with its version and kept locally
    (`meta.driveFileShared`). `find` prefers a file shared with the account over one it
    owns, then the oldest. A shared file that is gone (404, `appNotAuthorizedToFile`,
    trashed) means **access was taken away**: sync stops (status `revoked`, kept in
    `meta.driveRevoked`, so a reload makes no request), the parent panel says „Dostęp do
    wspólnej rodziny został cofnięty”, the local copy stays, and nothing is re-created. An
    own file that is gone behaves as before (decision 70: look again, then re-create). A
    shared file trashed by its owner is told the same way, as PLAN.md asks.
79. **Members come from Drive, live; `FamilyFile.members` is not written.** The merge keeps
    members as a union, which can never forget a removed parent, and PLAN.md calls Drive the
    authority anyway. *Rodzina* lists `permissions.list` (users only), marks the owner and
    „ty”, and offers „Usuń” only to the owner, for the others (`permissions.delete`). The
    invite is `permissions.create` (`writer`, Drive's notification e-mail with a Polish
    message and the link `<origin>/#/join/<fileId>`, built from the current origin so it
    also works on localhost); the link is also shown with „Kopiuj link”. A writer may
    invite too (Drive's default `writersCanShare`).
80. **The wrong account.** The link carries only the file id (PLAN.md), so the app cannot
    know which address was invited. It names the signed-in account whenever the file does
    not come back: the Picker closed or empty, or the picked file still unreachable. The
    message says „Zalogowano jako <e-mail>…” and offers „Zmień konto” (GIS
    `prompt: 'select_account'`) and „Spróbuj jeszcze raz”.
81. **CSP widened for the Picker, measured against the real one** (task 4). Under the container's
    policy, the real `https://apis.google.com/js/api.js` → `gapi.load('picker')` → a Picker
    built with this project's key and app id (a probe token, so Google's frame answers 403) needed
    exactly: `script-src` + `https://apis.google.com` (the loader and its two module scripts) and
    `frame-src` + `https://docs.google.com` (the Picker's frame). **Nothing in `connect-src`**
    (PLAN.md's `https://accounts.google.com` there is still not granted) and no `img-src` (the
    Picker's pictures load inside its own frame). The one report: the loader injects an inline
    `<style>` with the dialog's layout rules, which `style-src 'self'` blocks. A hash would be
    brittle (the loader's build changed between two runs an hour apart), so the five rules are
    copied verbatim into `app.css` and the report is expected, like Eat My Way decision 88;
    with them the dialog renders as Google intends (checked in a screenshot). The dialog's
    position and size are CSSOM writes, which the CSP allows. `Referrer-Policy: no-referrer`
    is kept: the Picker's document answered the same with and without a `Referer`, whatever
    its value; whether the key's referrer restriction holds once a real token is in hand is
    on the live checklist.
82. **e2e: several accounts, and the Picker at its real URLs.** `e2e/fake-google.ts` now tells
    accounts apart by their token, and models `drive.file`: an account reaches a file only
    while it has a permission *and* the app is authorised for it (it created it, or picked it).
    Permissions (`list`, `create` with the invitation e-mail recorded, `delete` by the owner
    only) and `ownedByMe` are answered like Drive. The Picker's loader is served at
    `https://apis.google.com/js/api.js` and its frame at `https://docs.google.com/picker`, so
    `script-src` and `frame-src` are exercised as shipped; picking in that frame authorises the
    app for the account, as the real Picker does. The GIS stub's `select_account` switches to a
    test-chosen token. The unit fake (`src/test/fake-drive.ts`) models the same rules. Drive
    helpers shared by the sync and sharing specs moved to `e2e/drive.ts`. The e2e build gets a
    fixed, never-sent Picker key and app id, like the client id.

### 2026-10-20 — Phase 9: Stories & more games

No open question names Phase 9. One scope question went to the owner (83).

83. **Owner's answer: a small Body parts topic now, pulled forward from Phase 11.** E7 *Polly
    mówi* is "body parts and actions", and the content had neither. `body` (PLAN.md topic 8,
    level 1, not among the default topics): *eyes, ear, nose, mouth, hand, arm, leg, foot*,
    Fluent "Color" pictures from the same pinned commit (the yellow default skin tone), one
    sticker per word as decision 56 (`body.foot` rare), and its story. Actions stay with Phase
    11 and open question 7 (they need animation).
84. **A story's words are its pictures.** The words that count for the 80 % unlock rule are the
    distinct `word`s of the story's scene items: the things the child can tap and hear. A
    vocabulary word used only as an adjective in the text („A *red* apple”) is not counted, so a
    fruit story does not wait for colours. *Learned* is the derived state, as for games.
    `check:content` gains the rules PLAN.md states for stories: 5–8 pages, 3–7 words per
    sentence, at least one scene item per page, every scene item inside the scene (`x`, `y` in
    0–100, `size` 24–40, so a picture is ≥ 72 px wide even on a 320 px wide scene), every story has at least one
    scene word, and every scene word is named in its page's sentence (so "objects mentioned in
    the sentence bounce" always has an object). `Story` gains an optional Polish one-liner
    `introPl` („Posłuchaj bajki o owocach!”), PLAN.md's optional intro.
85. **The scene is one SVG drawn with attributes only.** A `viewBox` of 100 × 75, a hand-drawn
    background, each item an `<image>` placed by `x`/`y`/`width`/`height` attributes inside a
    `role="button"` group. No inline style, no CSSOM. The same rule as the star meter
    (decision 61).
86. **The story player.** The Polish intro, then page by page: the sentence is spoken at the
    chosen speed (decision 28's `speakSentences`), the word being spoken is highlighted, and a
    scene item bounces while its word is spoken. After the sentence the page holds for a moment,
    then turns by itself. Tapping an object says its word; during the sentence that cuts it, and
    the sentence is read again from the start. At the end the story is recorded as heard on this
    device (`storiesHeard[id] += 1`, `seq` bumped). **Stories give no stars**: they are a reward
    already, and a 30-second story that pays stars would out-earn a lesson. Duration: the page
    hold is set so that every story's *estimated* time at the normal rate (decision 28's
    estimate) is 25–40 s, unit-tested; the real-phone measurement is the acceptance criterion
    and needs the owner's phone.
87. **Story shelf and announcements.** `/child/:id/stories` shows one tile per story (its first
    scene picture). A locked story shows Polly with the lock and says
    „Tę bajkę otworzymy, gdy poznasz więcej słówek!”. An unlocked story nobody has heard yet on
    any device is *new*: its tile (the story's first pictured word on an open book) and the map's 📖 glow, and after a chest's stickers Polly
    says „Polly ma dla ciebie nową bajkę!” (PLAN.md: "Polly announces a new story after a
    chest"). The map's bottom bar gains 📖 (`open-book`).
88. **Games E4–E9.** Every game uses learned words only, ends on the finish screen and gives 1
    star per solved item plus the streak bonus where it has first tries (decision 45).
    Attempts are recorded where the child answers a heard English word (E4, E5, E6 and E8's
    colour), not in E7 (ungraded) or E9 (sorting, like *Memory*). The shared pick logic of E1
    (react, wiggle, glow after the second miss, praise) moves into one controller that E1, E4,
    E5 and E6 use.
    - **E4 *Bańki*:** 5 rounds; 3–4 bubbles rise in lanes and loop forever (never timed out);
      „Przebij bańkę: {word}!”. Reduced motion: the bubbles stay put.
    - **E5 *Nakarm Polly*:** 5 rounds; 3–4 pictures around a big Polly; „Daj Polly: {word}!”.
      Dragging a picture onto Polly *or* tapping it gives it to her. The drag moves the picture
      with a CSSOM `translate` write (allowed by `style-src 'self'`, like decision 81; no
      markup style).
    - **E6 *Gdzie jest…?*:** one scene (decision 85) with 5–8 learned items; five of them are
      asked for in turn („Gdzie jest {word}?”). Opens with ≥ 5 learned words. Eight fixed
      places in three rows with a little seeded jitter, items 22 % of the scene wide; the
      scene draws each tap area 2 units wider than its picture, so it stays ≥ 72 px on a phone.
    - **E7 *Polly mówi*:** 5 commands over learned body parts: „Polly mówi: dotknij!” and the
      word; Polly points with the body part beside her; the child does it and taps ✅
      („Zrobione!”). Ungraded. Opens with ≥ 4 learned body parts.
    - **E8 *Pokoloruj*:** 5 rounds; a grey picture of a learned noun (not a colour or a number)
      and 3 paint pots of learned colours; the noun, then „Pomaluj na {word}!” with the colour.
      Tap a pot, then the picture: the right pot paints it (an SVG mask of the picture filled
      with the colour, multiplied over its grey shading, so *any* colour works on any picture);
      a wrong pot wiggles, and the right one glows after the second miss. Opens with ≥ 3
      learned colours and ≥ 1 other learned noun. The pots' colours are a table in the domain
      layer, unit-tested to cover every colour word.
    - **E9 *Kosze*:** two baskets, each a topic with ≥ 3 learned words (seeded choice), and six
      pictures one at a time: „Do którego koszyka?”. Right basket: the picture drops in; wrong:
      the basket wiggles, the right one glows after the second miss.
89. **E9's parent toggle is `WordPlan.sortGame?: boolean`** (absent = off), a checkbox in the
    child's word plan („Gra „Kosze”: układanie obrazków w dwóch koszykach według tematu (dla
    starszych dzieci)”). Optional, so no stored plan changes and no
    migration: every plan write already spreads the whole plan, so the field survives other
    edits. Without it the shelf does not show E9 at all.
90. **Smaller things decided on the way.** (a) The story's sentence is shown under the scene
    for the parent reading along (PLAN.md), marked `data-for-parent` like the picker's names,
    so the no-reading check skips it. (b) In *Nakarm Polly* and *Polly mówi* Polly is already
    the game's centre, so the game frame leaves out the small Polly in its corner. (c) New UI
    pictures from the same pinned Fluent commit, in `UI_IMAGE_IDS`: `open-book` (📖),
    `check-mark-button` (✅), and the tiles `bubbles`, `fork-and-knife-with-plate`,
    `magnifying-glass-tilted-left` and `basket` (the basket needs `floatPrecision: 1` for the
    budget); *Pokoloruj*'s tile reuses `artist-palette`, *Polly mówi*'s the `raised-hand`
    word picture. The paint pot is hand-drawn SVG. (d) New prompts: `stories.choose`,
    `stories.locked`, `story.end`, `story.new`, `bubbles.find`, `feed.find`, `simon.start`,
    `simon.say` („Polly mówi: pokaż {word}!”: *pokaż* fits every body part, *dotknij* does
    not fit a hand), `paint.colour`, `paint.pot`, `sort.which`. (e) With nine games the
    shelf's tiles are smaller (still ≥ 72 px) and the shelf scrolls if it must. (f) The album
    gains a fifth page (body) by itself, since pages are the sticker sets. (g) **No CSP change**:
    the scene's `<image>`s load from `'self'` (or jsDelivr, already allowed), the paint layer
    is CSS `mix-blend-mode` on an SVG mask, and the drag is a CSSOM write; the whole suite ran
    under the container's policy with zero violations.

### 2026-10-20 — Phase 10: Screen time & the progress dashboard

No open question names Phase 10. PLAN.md leaves open what a session is, what "the current
exercise" is outside a lesson, and how an import meets data already on the device; settled here.

91. **Minutes are counted by one ticker** (`src/lib/screentime/`), every 5 s, while a screen of
    a particular child is on show and the page is visible: the map, lessons, games, stories,
    album and chest. Not counted: the start screen and picker (no child yet), parent screens, and
    the sleep screen. A gap of more than 2 min between two ticks (a suspended phone) counts for
    nothing. Whole minutes are written to this device's `DeviceProgress.minutes[day]` (one
    write, so one `seq` bump and one sync debounce, per minute of play); the part below a minute
    waits in the local session clock (`meta.screenTime`, never synced: PLAN.md's "the current
    session's timer"), so short sessions still add up within the day. The day is the local day.
92. **A session** is the play time since it began. A new one begins on a new local day, after
    a break of ≥ 30 min away from that child's screens, or when the gate wakes Polly. The daily
    total is `minutesOn(today)` over every device in the family file (so another device's
    minutes count as soon as sync brings them) plus this device's minutes not written yet.
93. **"The current exercise" is the step, the game, the story or the chest.** In a lesson the
    lock waits for the step being played (look-and-listen or a pick) to be solved; the lesson
    then stops there: the attempts are already recorded (decision 44), the steps done are paid
    in stars with their streak bonus (nothing earned is dropped: no loss mechanics), and the
    island gets no flag, since the lesson was not finished. The frame of a game sees no round
    boundary, so a game (5 rounds or one board, 1–2 min), a story (≈ 30 s) and an opening chest
    play to their end; the screen they return to is the lock. The map, the shelves, the album
    and the picker have no step and lock at once. A screen opened while Polly sleeps shows the
    lock straight away.
94. **The lock is per child, on this device, and sticky** until the parent gate is passed or
    the next local day: a raised limit or a synced change does not wake Polly by itself, and
    other devices lock on their own clock (PLAN.md: best-effort). Passing the gate wakes every
    sleeping child on this device and starts a fresh session; for a child put to sleep by the
    *daily* limit it also waives the daily limit for the rest of that day (otherwise the next
    tick would put Polly back to sleep at once). The session limit still applies after waking.
    The lock screen is a night sea with Polly asleep (a new UI picture, Fluent `zzz`, same pinned
    commit) and the gear only: no home button, so it is not a way into a sibling's profile.
    Polly says „Koniec na dziś! Polly idzie spać.” (`sleep.night`), again on a tap on Polly.
95. **Limits are edited on `/parent/child/:id`** („Czas zabawy”) from two short lists: daily
    *brak limitu*, 10, 15, 20, 30, 45, 60 min; session *brak limitu*, 5, 10, 15, 20, 30 min.
    Written as the child's `limits` `Lww` register, like the plan. The e2e's 1-minute session is
    written straight into IndexedDB; no parent needs a 1-minute choice.
96. **The progress dashboard** is on the same screen („Postępy”), all derived
    (`domain/dashboard.ts`, unit-tested): learned words per topic (derived *learned*, of the
    topic's words, for enabled topics and any topic with a word met); words that need practice
    (most first-try misses, Σ `c − first` over every day and device, at most 8, ties by the most
    recent miss); a 4-week calendar (28 days to today in Monday-first weeks, each day its
    minutes over every device, shaded in four steps, a day with answers but under a minute
    marked active); stickers collected (owned of all, per set); stories heard (per story, over
    every device). Minutes today and this week are listed above the calendar.
97. **Export and import of the family as JSON.** Export downloads the local `FamilyFile`
    exactly as stored (`hello-polly-rodzina-YYYY-MM-DD.json`, a `Blob` and an `<a download>`):
    nothing local-only goes in it (no device id, no token, no Drive file id, no voices). Import
    reads a chosen file with the sync's `parseFamilyFile` (same checks: JSON, a family file, not
    a newer schema), shows the children it holds, and on „Wczytaj” merges it into the local
    file with `mergeFamily`, the same join as sync, so an import never loses anything already on
    the device. The `familyId` stays the device's when it already has children; a device with
    none adopts the backup's, so an import into a fresh profile is the exported file byte for
    byte and every derived state is identical. A connected device uploads the merge on its next
    cycle like any local change. It is offered in the parent panel („Kopia zapasowa”) and in the
    first run („Mam kopię zapasową”), because a fresh profile has no child to open the panel from.

### 2026-10-25 — 525 from Cloudflare after the VM's Debian 13 upgrade (outside the phase sequence)

98. **The site answered Cloudflare's 525 from the VM's upgrade to Debian 13 (2026-10-24, most
    likely ~11:05 UTC) until 2026-10-25 08:13 UTC; the cause was the server, not this app.**
    The old `/etc/nginx/nginx.conf` had `ssl_prefer_server_ciphers on`, certbot's
    `options-ssl-nginx.conf` (included by this vhost and Eat My Way's only) has `off`, and
    OpenSSL 3.5's HelloRetryRequest for its post-quantum group made the two disagree on the
    cipher mid-handshake (`bad cipher`). Fixed with one line in `nginx.conf` (`off`); the vhost
    and the certbot file are untouched. The full account, the reproduction command and how to
    see failed handshakes in the nginx log are in **Eat My Way STATE.md decision 484**. Since the
    same day `access.log` lines end with `"$host"`, so this site's traffic can be counted on its
    own. Verified: 5/5 `200` through Cloudflare, `certbot renew --dry-run` green for this name.

### 2026-10-29 — the Picker's key refused on the live site (outside the phase sequence)

99. **`Referrer-Policy: strict-origin` instead of `no-referrer`, and the Picker key allows the
    Drive API too.** The first real invitation on https://hellopolly.gorny.dev ended in the
    Picker's „Klucz programistyczny API jest nieprawidłowy”. The key is restricted to the
    site's referrers, and with `no-referrer` Google gets none (the key answers „Requests from
    referer <empty> are blocked”); decision 81 had left exactly this to the live check.
    `strict-origin` sends only `https://hellopolly.gorny.dev/` cross-origin (no path; the
    `#/route` with the file id never leaves the browser), to Google, jsDelivr and Cloudflare's
    beacon. In the same session the owner added the **Google Drive API** to the key's allowed
    APIs, since the Picker's frame lists files through Drive with the developer key; the
    DEPLOYMENT.md prerequisites now say both. Drive's invitation e-mail shows the join link as
    plain text (Drive does not linkify `emailMessage`); „Kopiuj link” in *Rodzina* and „Mam
    zaproszenie” already cover it.

### 2026-10-29 — cars for the colours, and sharing the invitation (outside the phase sequence)

100. **The colours are cars, not flags.** At the owner's request the eleven colour pictures are
     Fluent's *Automobile* recoloured (`red-car` … `grey-car` in `content/images.json`), in
     place of the triangular flag. Each car takes the shades its flag had, and the body's other
     five tones (the inner shadow, the door seams, the shadow under the window) are derived from
     the dark shade mixed with black. The image ids changed with them; words, stickers and the
     story refer to the new ids. Nothing in a family file names an image, so no migration. The
     story keeps its id `polly-flags` (it is recorded in progress) and is now „Samochody Polly”
     / *Polly's Cars*. README screenshots regenerated.
101. **„Udostępnij” beside „Kopiuj link”** in *Rodzina*: the system share sheet (Web Share API,
     no package) with a short Polish note and the join link, where a link is clickable, unlike
     in Drive's e-mail (decision 99). Shown only where `navigator.share` exists; a closed sheet
     is not a failure. Covered by an e2e test with a stubbed `navigator.share`.

## Open questions

Copied from PLAN.md. Each is settled in the phase named and the answer recorded here.

1. **Name, domain, repository** (Phase 1). **Settled** (decision 1): "Hello Polly", not
   translated, no subtitle; `hellopolly.gorny.dev`; `zyndata/hello-polly`.
2. **Default accent** (Phase 3). **Settled** (decision 19): British, `en-GB`; American
   selectable.
3. **Sticker art**: 3D PNG (richer, larger) or Color SVG (Phase 6). **Settled** (decision 56):
   Color SVG, and a word's sticker is its own picture, so stickers add 0 kB.
4. **Picker in an installed iOS PWA**: unknown until measured; fallback defined (Phase 8 spike).
   **Still open after Phase 8** (decision 75): the app cannot be installed standalone before
   the web manifest (Phase 11), and the spike needs both phones. The fallback is built (join
   in the browser, then „Mam już rodzinę na Dysku Google” in the installed app); the procedure
   is in docs/DEPLOYMENT.md. To run with Phase 11, or as soon as a manifest exists.
5. **Should one family file per Google account allow several families?** **Settled**
   (decision 64): no, one family per account, the owner's choice.
6. **Speech engine and picture set**: kept or replaced by the quality gates in "Speech and
   pictures are replaceable" (Phases 2, 3 and 5). **Still open after Phase 5**: all four gate
   verdicts need the owner (two phones; the child). Nothing measured here argues for a swap.
7. **Level-2 and level-3 content** (verbs, adjectives) needs animation, not a still picture.
   The scope of animation per word is decided when Phase 11 starts.
