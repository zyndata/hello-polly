# Hello Polly — Plan & Specification

> **Name.** "Hello Polly", never translated and with no Polish subtitle; domain
> `hellopolly.gorny.dev`, repository `zyndata/hello-polly`. All three confirmed in Phase 1
> (STATE.md decision 1). The mascot is a pirate parrot because the
> reward is a pirate treasure chest, and because a parrot is the animal that repeats words.

## Product

**Hello Polly** — a Duolingo-style English vocabulary app for a **pre-reading child from age 4**,
starting from zero and staying within **CEFR A1 / Cambridge Pre A1 Starters** vocabulary. It
runs in the browser and installs as a PWA on a phone, tablet or computer, exactly like Eat My
Way.

- **Every word is a picture.** Tapping the picture says the word. Two speeds, switchable on the
  child screen with two big icons: 🐢 *slow* (clear, for a child hearing the word for the first
  time) and 🐇 *normal*.
- **The child never has to read.** Instructions are spoken in Polish by the device's Polish
  voice ("Dotknij banana!") and backed by icons and animation. Only the target words are English.
  Parent screens are ordinary Polish text.
- **Words come from two sources:** random words from topics the parent enabled, and an explicit
  **queue** of "these words next" chosen by the parent. The queue always wins.
- **Words already learned feed short games:** pick-the-picture, number-to-picture matching (the
  example from the brief: four fruits and four digits, tap "1" → *banana* → tap the banana),
  memory, bubbles, feed-the-parrot, I-spy, Simon says.
- **30-second stories** built only from vocabulary the child has learned (e.g. a fruit picnic
  that uses every fruit word), read sentence by sentence with the pictures lighting up.
- **Reward:** stars fill a meter. A full meter gives a **pirate treasure chest** to tap open, and
  inside are **stickers for an album**. Every sticker says its English word when tapped.
- **Family sharing:** a parent can invite the second parent. Both see and continue the same
  children's progress from any phone, and the whole configuration is shared with them.
- **Light screen-time limit**, set per child in the parent panel. A protected parent gate keeps
  the child out of settings.
- UI language: Polish. Learned language: English (British by default, American selectable).

**Out of scope** (decided, with reasons in "Research summary"): speech recognition and
pronunciation scoring, reading and writing letters, hearts/lives or any loss mechanic, ads,
in-app purchases, server-stored or pre-generated audio, and paid or keyed TTS services.

---

## Research summary (what this plan is built on)

### Eat My Way — what is reused, and the one thing that cannot be

Reused as is: a pure client-side SPA (Vite + Svelte 5 + TS), IndexedDB as the source of truth,
a static bundle built in CI and served by Caddy in Docker behind nginx and Cloudflare, a strict
CSP, hash routing, vite-plugin-pwa, one phase per conversation via `/phase N`, STATE.md as the
single record of progress and decisions, conventional commits, a generated CHANGELOG
(git-cliff), `dev` → `main` → `vX.Y.Z` tag releases through `/release`, Playwright in Chromium
and WebKit on every `dev` push, two machines (Windows + Linux), a public repository and no
committed credentials.

**What cannot be reused: `appDataFolder`.** Eat My Way syncs through Drive's hidden app-data
folder, and that folder is private to one Google account. Google offers no way to share it, so
it cannot hold a profile that two parents use together. Two options were weighed:

| | **Shared Drive file (chosen)** | Firebase, as in Buy My Way |
|---|---|---|
| Where data lives | In the inviting parent's own Drive | In the owner's Firebase project, for every family that uses the public link |
| Backend to maintain | None | Security rules, quotas, privacy obligations for other families' data |
| Scope / verification | `drive.file`, non-sensitive, no verification | Firebase Auth |
| Real-time | No. Polls on focus and every few minutes, which is plenty for progress | Yes |
| Bundle cost | Two Google scripts loaded on demand | Firebase SDK |
| Owner's transfer | Zero | Zero |

How it works: the app creates **one JSON file** (`hello-polly-family.json`) in the parent's
visible Drive (scope `drive.file` lets an app access only the files it created or that the user
picked for it). Inviting a parent calls `permissions.create` on that file with the second
parent's e-mail. The second parent opens the invite link and, once, selects the file in the
**Google Picker** (pre-filtered to that one file id). That selection grants this app access to
it on their account. From then on both write the same file.

**Two people writing one file without conflicts:** the file is designed so that a merge never
needs a human (see "Sync model"). Each device writes only its own progress subtree, and shared
settings are last-writer-wins per field. This is a deliberate improvement on Eat My Way, where a
same-day conflict asks the user. A 4-year-old must never see a conflict dialog.

### Speech: device voice only (owner decision)

**Web Speech API (`speechSynthesis`) only.** It is free, needs no key, transfers nothing and
stores nothing. Consequences that the plan handles explicitly:

- **Voice quality depends on the device.** Android with Google's speech services and iOS/macOS
  voices are good. Some desktop Linux/Firefox setups are poor or have no English voice. The
  parent setup has a **voice check** that plays test words and names the voice found, and it
  says plainly when the device has no usable English or Polish voice.
- **Slow mode** is `rate ≈ 0.6` (parent-tunable 0.4–0.8) plus a short pause and an optional
  second repetition. **Normal mode** is `rate ≈ 0.9`. Pitch is slightly raised (≈ 1.1) for a
  friendlier tone. Each word may carry a `say` override (e.g. "a banana", or a respelling) for
  words a TTS engine reads badly in isolation. This is found during content QA, not guessed.
- **Platform rules:** speech starts only after a user gesture (the first tap on the start screen
  unlocks it), voices load asynchronously (`voiceschanged`), Chrome cuts long utterances (stories
  are spoken one sentence at a time, which the karaoke highlighting needs anyway), and
  `cancel()` is called before every new utterance so taps never queue up.
- **No API keys exist in this app at all.** So there is no vault, no Argon2id, no WebAssembly and
  no `wasm-unsafe-eval`. "Sharing the full configuration" means sharing settings, children, word
  plans and progress. The preferred *voice name* is per device (voices differ between phones),
  but accent, rates and the default speed are shared.
- Sound effects (pop, sparkle, chest creak) are **synthesized with the Web Audio API**. No audio
  file of any kind is shipped or stored.

### Speech and pictures are replaceable (owner decision, 2026-10-18)

The device voice and Fluent Emoji are the **starting choices, not commitments**. If either turns
out not to be good enough, it is swapped without touching the screens:

- **`SpeechEngine` interface** (`speak`, `cancel`, `voices`, `isAvailable`). Every caller goes
  through it; nothing outside `src/lib/speech/` touches `speechSynthesis`. `WebSpeechEngine` is
  the first implementation. Candidate replacements, in order of preference:
  1. **On-device neural TTS** (Kokoro via kokoro-js, or Piper), free with no key. The model is
     downloaded from Hugging Face's CDN, not from the owner's server, and is heavy (≈ 80–300 MB),
     so it needs a measured run on a weak phone first.
  2. **Gemini TTS with the parent's own key** (stored in the shared family settings, so the
     second parent gets it too, as the brief requires). Audio is cached **only in the device's
     IndexedDB**, never on a server. Free-tier limits are low and unpublished, so caching per
     word and speed is mandatory.
  3. Any other free, keyed service with CORS (e.g. Azure Speech free tier). Keys are handled the
     same way as in option 2.
  A keyed engine brings back a "Klucze" section in the parent panel and a `connect-src`
  widening, both recorded in STATE.md at that point. Until then the app has no keys.
- **`ImageSource` abstraction**: content refers to an image **id**, never to a URL or a file
  format. One module maps ids to URLs. Candidate replacements: another emoji set (OpenMoji,
  Noto), Fluent 3D PNGs, or custom illustrations committed to `content/img/` in the same
  pipeline (budget, licence, CDN via the repo tag).
- **Quality gates** that decide a swap. Each is judged and recorded in STATE.md, with the
  device and voice named:
  - *Speech* (end of Phase 3, again in Phase 5 with the child): a first-time listener can tell
    every word of the first four topics apart at slow speed, and the `say` overrides do not
    exceed ~10 % of words. Otherwise the engine is replaced.
  - *Pictures* (end of Phase 2, again in Phase 5 with the child): the child names or points to
    ≥ 90 % of the first four topics' pictures correctly when asked in Polish. A picture that
    fails gets replaced individually; the style is replaced only if failures cluster.
- A swap is its own phase, inserted with a STATE.md decision, not a mid-phase detour.

### Pictures: Fluent Emoji via jsDelivr (owner decision)

**Microsoft Fluent Emoji** (MIT licence): colourful, consistent, and it covers fruit, food,
animals, vehicles, clothes, body parts, weather and objects. The upstream repository is far over
jsDelivr's ~150 MB per-repository limit, so it cannot be hot-linked whole. Instead:

1. A content script copies the **curated subset** the app uses (≈ 300–350 "Color" SVGs, a few
   3D PNGs for stickers) from a **pinned commit** of `microsoft/fluentui-emoji` into this repo's
   `content/img/`, runs SVGO, and enforces a size budget (≤ 25 kB per SVG, outliers reported).
   Total ≈ 3–5 MB, committed with its licence and attribution.
2. The app loads images from **`https://cdn.jsdelivr.net/gh/zyndata/hello-polly@vX.Y.Z/content/img/…`**,
   the app's own public repository at its release tag. That URL is immutable and cached
   permanently. The owner's server sends nothing for images.
3. A service-worker **runtime cache (cache-first) scoped to that one CDN path** keeps every
   image seen. The next lesson's images are prefetched. If jsDelivr fails, the same files are
   also in `dist/` and are fetched from the origin as a fallback. That is the only case in which
   images cost the owner's transfer.

No Unicode emoji exists for a treasure chest or a sticker album, so the **chest, map islands,
mascot frame and album are hand-made SVGs in the repo**, bundled and tiny.

### Children's learning apps reviewed, and what is taken from each

Patterns drawn from well-known apps for this age (Duolingo ABC, Lingokids, Gus on the Go,
Khan Academy Kids, Monkey Junior, Studycat/Fun English, Endless Alphabet). This is based on
general knowledge of these products and was not re-verified feature by feature for this plan.

| Pattern | Seen in | Used here as |
|---|---|---|
| A path of small lessons on a map | Duolingo, Gus on the Go | **Treasure map**: islands in a blue sea, one island = one lesson |
| Lessons of 3–6 minutes with 2–4 new words | Monkey Junior, Duolingo ABC | Lesson composer: ≤ 3 new words + due reviews |
| Picture + native word, no reading | Gus on the Go, Monkey Junior | Every exercise is picture + audio |
| Collectibles that reinforce content | Khan Academy Kids, Gus (stamps) | Stickers are vocabulary items and speak their word |
| Mascot reacting to the child | Lingokids, Khan Kids, Duolingo | Polly the parrot cheers, nods and sleeps at time-out |
| Read-along books with highlighting | Khan Academy Kids | 30-second stories, sentence highlighted, objects tappable |
| Mini-games on known words | Studycat, Lingokids | Bubbles, memory, feed-the-parrot, I-spy |
| Movement games (TPR) | Lingokids | Simon says with body parts and actions |
| Parent area behind a gate | All of them | Parent gate before the panel |

What is **deliberately not** taken: Duolingo's hearts, streak-loss pressure and timers, because
loss mechanics and time pressure frustrate 4-year-olds. Also left out are red ✗ marks and error
buzzers. Wrong taps get a gentle wiggle, the word again, and after the second miss the right
picture glows ("errorless learning"). Speech recognition is left out because child speech is
recognised poorly, Firefox has no recognition, and Chrome sends the audio to Google.

---

## Architecture

- Pure client-side SPA. **No application backend.** Caddy in Docker serves static files on
  `:8081` (`127.0.0.1` only, since `:8080` is Eat My Way). nginx terminates TLS, Cloudflare
  sits in front, and the same edge rules apply as in Eat My Way (bypass cache for
  `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest`; cache everything under `/assets/*`, with
  both rules scoped to this host).
- **IndexedDB (Dexie) is the source of truth.** The app works fully on one device with no Google
  account. Drive is a sync layer behind a `StorageBackend` interface (as in Eat My Way, plus
  `share`/`unshare`/`pick`).
- **Static content** (vocabulary, topics, stories, stickers, Polish prompt catalog) is JSON in
  the bundle, versioned by `CONTENT_VERSION`. Images come from the CDN as above.
- **Online requirement:** the app may require internet (owner's brief), but costs nothing to
  make it work offline after the first load: the shell is precached and images are runtime-cached.
  Only sync and inviting need the network.
- **Transfer budget for the owner's server:** shell + content JSON ≈ 200–300 kB gzip per install
  and per release, edge-cached by Cloudflare. No audio, no images (except CDN fallback), no API.

## Stack

Same as Eat My Way, minus what has no use here:

- Vite + **Svelte 5** + TypeScript (strict), **Tailwind CSS v4**, **Bits UI** (parent screens
  only: dialogs, focus traps)
- **Dexie**, **svelte-spa-router** (hash routing), **vite-plugin-pwa**, **svelte-dnd-action**
  (reordering the parent's word queue)
- Dev only: Vitest, `fake-indexeddb`, Playwright, git-cliff, **SVGO** (content script; justified
  by the image size budget)
- **Not used:** hash-wasm (no vault), any TTS SDK, any animation library (CSS + Svelte
  transitions + inline SVG are enough), Firebase
- Fonts: one rounded self-hosted OFL font (e.g. *Baloo 2* or *Nunito*, subset to Latin +
  Polish), ≤ 40 kB

## Visual design

- **Blue-dominant pirate-sea palette**, defined once as tokens:
  ocean `#1E88E5`, deep sea `#0D47A1`, sky `#90CAF9`, foam `#E3F2FD`, lagoon `#26C6DA`;
  treasure gold `#FFC93C` (stars, chest, rewards only); coral `#FF7A59` (highlights, the
  "glow" hint); island sand `#F6E3B4`; leaf `#66BB6A` (success).
- Child screens: big rounded cards, **tap targets ≥ 72 px**, no text needed to operate,
  generous spacing, both orientations, nothing that navigates away by accident (the only exit is
  a home button that needs a long press).
- Motion: short, springy, never flashing. `prefers-reduced-motion` keeps the meaning (glow,
  scale) and drops the travel.
- Parent screens: normal Polish UI in the same palette, readable on a phone.

---

## Content model

```ts
type TopicId = string;            // "fruit"
type WordId = string;             // "fruit.banana"

interface Word {
  id: WordId;
  en: string;                     // "banana" — what is shown to the parent
  say?: string;                   // TTS text if different from `en` ("a banana", respelling)
  pl: string;                     // "banan" — parent screens and Polish prompts
  plAcc?: string;                 // accusative for prompts: „Dotknij banana!"
  topic: TopicId;
  image: string;                  // "banana.svg" (under content/img/)
  level: 1 | 2 | 3;               // 1 = first-year concrete nouns; 3 = verbs/adjectives
}

interface Topic {
  id: TopicId;
  en: string; pl: string;
  icon: string;                   // image file
  order: number;                  // default position on the map
  words: WordId[];                // default teaching order inside the topic
}

interface Story {
  id: string;
  title: string;                  // English
  titlePl: string;
  topic: TopicId;
  pages: StoryPage[];             // 5–8 pages ≈ 30 s
}
interface StoryPage {
  text: string;                   // one sentence, 3–7 words
  scene: SceneItem[];             // images placed on a background
}
interface SceneItem { word?: WordId; image: string; x: number; y: number; size: number; anim?: 'bob' | 'hop' | 'spin' }

interface Sticker { id: string; image: string; word?: WordId; set: string; rare?: boolean }

interface Prompt { id: string; pl: string }  // „Dotknij {word}!", „Super!", „Koniec na dziś…"
```

### Vocabulary scope (≈ 300 words, ~20 topics)

Curated from the Cambridge Pre A1 Starters range, restricted to **picturable** words. Order:
level 1 topics first.

1. Greetings and Polly's phrases (*hello, goodbye, yes, no, please, thank you*), taught through
   short animated scenes, not pictures of objects
2. Colours (11) · 3. Numbers 1–10 (later 11–20) · 4. Fruit · 5. Animals: pets and farm
6. Toys · 7. Food and drinks · 8. Body parts · 9. Clothes · 10. Family
11. Animals: wild and sea · 12. Vegetables · 13. Transport · 14. House and furniture
15. Weather and nature · 16. Shapes · 17. School things
18. Actions (*run, jump, eat, sleep, swim, clap…*), animated · 19. Adjectives (*big/small,
    happy/sad, hot/cold*), shown as contrasting pairs · 20. Places and the sea/pirate set
    (*ship, island, sun, sea, fish, star*), the theme of the map itself

**Content validator** (`npm run check:content`, part of CI): unique ids, every word has an
image file within budget and a `pl`, every topic word exists, every story token is either a
vocabulary word or on a short allow-list of function words (*a, the, is, I, see, it, and, my,
like, can, look*), the Polish prompt catalog is complete, and every sticker has an image.

---

## Learning model

### Word states

```
new → introduced → practising → learned → (review due → learned)
```

- **introduced**: shown once in "look and listen" (big picture, tapped at least once).
- **learned**: correct on the **first try** in ≥ 3 exercises on **≥ 2 different days**.
- **review**: a simplified Leitner schedule over learned words: boxes at 1, 2, 4, 7, 14 and 30
  days. A first-try miss drops the word one box, never back to "new".
- All of this is **derived** from the merged attempt history (see "Sync model"), so two devices
  always compute the same state.

### Choosing the next words

1. The parent's **queue** for this child, in order (`WordPlan.queue`).
2. Then words from **enabled topics** in topic order. In each topic the word order is the default
   or random, a toggle per child (`WordPlan.randomWithinTopic`).
3. Words the parent marked **known** are skipped. **Paused** words are neither introduced nor
   reviewed.

### A lesson (one island on the map)

≈ 4–6 minutes, about 8–12 steps:

1. **Look and listen**: ≤ 3 new words (fewer if many reviews are due), each a big picture. The
   child taps it and hears it (🐢/🐇).
2. **Practice**: exercises mixing the new words with **due reviews**. New words appear only in
   2-choice exercises within the lesson that introduced them.
3. **Finish**: stars (1 per step completed, bonus for first-try streaks), and the chest meter
   fills. The island gets a flag.

Free play (games) and stories use **learned** words only. A game needs at least four of them
(with fewer, its tile shows the parrot holding a lock and Polly says „Najpierw poznajmy więcej
słówek!").

---

## Exercises and games

Every exercise: a spoken Polish prompt first, then the English word. Tapping a picture always
speaks its word, a speaker icon repeats the prompt, and the 🐢/🐇 toggle is present.
Feedback: correct gives sparkle + Polly + a short English praise ("Great!", "Yes!", "Well
done!"). Wrong gives a wiggle and the word again. The second miss makes the answer glow.

| # | Name (PL) | Mechanic | Phase |
|---|---|---|---|
| E1 | **Posłuchaj i dotknij** | Hear the word → tap the matching picture among 2, 3 or 4 (difficulty grows with mastery) | 5 |
| E2 | **Cyferki** (brief's example) | 4 pictures + 4 digit tiles 1–4. Tap a digit → it says a word → tap that picture. Pairs fly into the treasure bag | 5 |
| E3 | **Memory** | 4–8 face-down cards (2–4 pairs). Each flip speaks its word. A pair stays open | 5 |
| E4 | **Bańki** | Pictures float up in bubbles: "Pop the apple!" Gentle speed, never timed out | 9 |
| E5 | **Nakarm Polly** | Drag the named item to the parrot, who eats or plays with it | 9 |
| E6 | **Gdzie jest…?** (I spy) | A scene with 5–8 learned items: "Where is the cat?" | 9 |
| E7 | **Polly mówi** (Simon says) | Body parts and actions: Polly says "Touch your nose!" and acts it out; the child copies. Ungraded, child taps "Zrobione!" | 9 |
| E8 | **Pokoloruj** | Colour + noun: "Make the apple red!" Tap a paint pot, then the picture | 9 |
| E9 | **Kosze** | Sort pictures into two topic baskets (fruit / animals). For older or advanced children; the parent can enable it | 9 |

## Stories

- 5–8 pages, ≈ 30 seconds, one sentence per page, spoken at the selected speed. The sentence
  appears under the scene with each word highlighted as it is spoken (`boundary` events where
  supported, timed fallback otherwise). The text is for the parent reading along; the child does
  not need it.
- Tapping any object in the scene says its word. Objects mentioned in the sentence bounce.
- Optional one-line Polish intro („Posłuchaj bajki o owocach!").
- **Unlocked** when ≥ 80 % of the story's vocabulary words are learned. Polly announces a new
  story after a chest.
- Ships with at least one story per level-1 topic. Example, *Polly's Picnic* (fruit):
  *"Hello! I am Polly." / "I like fruit." / "Look! A red apple." / "A yellow banana." / "An
  orange and a pear." / "Yum! Thank you!"*

## Rewards

- **Stars** from lessons and games. A meter on the map fills toward the next chest
  (`starsPerChest`, default 15, so roughly one chest per lesson).
- **The chest:** a full-screen hand-drawn SVG pirate chest. The child taps it three times: it
  rattles, the lock pops, the lid opens with a gold glow and synthesized sparkle, and **1–3
  stickers** fly out. Unopened chests wait on the map ("Polly found a chest!").
- **Sticker album:** pages by set (sea, animals, vehicles, food…). Earned stickers fill outlined
  slots, and tapping a sticker speaks its English word. Stickers are drawn without duplicates
  until a set is complete. **Rare gold** stickers (≈ 1 in 10) shimmer.
- Stickers favour words the child has **learned**, so the album is also a review device, with
  an occasional "preview" word from the next topic.
- No streaks that can be lost. The parent panel shows a calm activity calendar instead.

## Screen time and the parent gate

- Per-child **daily limit** (default 15 min, "brak limitu" allowed) and **session length**
  (default 10 min), set in the parent panel. When the session time is up, the current exercise
  finishes, then **Polly goes to sleep** („Koniec na dziś! Polly idzie spać.") and the child
  screen locks until the parent gate is passed or the next day.
- Minutes are counted per device per day and summed across devices through sync, so the limit
  is best-effort when a device is offline.
- **Parent gate:** shows a two-digit number **in Polish words** („czterdzieści siedem") and
  asks for it on a keypad. A pre-reader cannot pass it; an adult needs two seconds.

---

## Local data model (synced)

```ts
type ChildId = string;   // uuid
type DeviceId = string;  // uuid, created once per install, local only

interface Lww<T> { v: T; t: string /* ISO time */; d: DeviceId }  // last-writer-wins register

interface ChildProfile {
  name: string;                    // a nickname is enough; shown on the picker and parent panel
  avatar: string;                  // image id from a small avatar set (no photos)
  birthYear?: number;
  deleted?: boolean;               // tombstone, so deletion syncs
}

interface WordPlan {
  enabledTopics: TopicId[];
  queue: WordId[];                 // "these words next", in order
  known: WordId[];                 // skip, already known
  paused: WordId[];
  randomWithinTopic: boolean;
}

interface FamilySettings {
  accent: 'en-GB' | 'en-US';
  slowRate: number;                // 0.4–0.8, default 0.6
  normalRate: number;              // 0.8–1.1, default 0.9
  slowRepeatTwice: boolean;
  defaultSpeed: 'slow' | 'normal';
  polishPrompts: boolean;          // default true
  starsPerChest: number;
}

interface ChildLimits { dailyMinutes: number | null; sessionMinutes: number | null }

interface AttemptDay { c: number; w: number; first: number } // correct, wrong, first-try correct
interface DeviceProgress {
  seq: number;                                       // bumped on every local change
  introduced: Record<WordId, string>;                // first time seen (ISO)
  attempts: Record<WordId, Record<string /* YYYY-MM-DD */, AttemptDay>>;
  stars: number;                                     // earned on this device, monotonic
  chestsOpened: Record<string /* eventId */, { at: string; stickers: string[] }>;
  minutes: Record<string /* YYYY-MM-DD */, number>;
  storiesHeard: Record<string, number>;
}

interface FamilyFile {
  schema: 1;
  familyId: string;
  contentVersion: number;
  settings: { [K in keyof FamilySettings]: Lww<FamilySettings[K]> };
  children: Record<ChildId, Lww<ChildProfile>>;
  plans: Record<ChildId, Lww<WordPlan>>;
  limits: Record<ChildId, Lww<ChildLimits>>;
  progress: Record<ChildId, Record<DeviceId, DeviceProgress>>;
  members?: { email: string; role: 'owner' | 'writer' }[];  // display cache; Drive is the authority
}
```

Local-only (IndexedDB, never synced): `deviceId`, preferred voice names, the sync baseline,
the Drive file id, the account label, and the current session's timer.

**Derived, never stored:** word states and review dates, total stars, unopened chests
(`floor(totalStars / starsPerChest) − chestsOpened`), the album (union of every device's
`chestsOpened[].stickers`), minutes today.

### Sync model

- **Merge is a join, so it never conflicts.**
  `progress[child][device]`: take the copy with the higher `seq`. Only that device writes it,
  so the copies are ordered. `Lww` registers: newer `t` wins, `d` breaks ties. Tombstones
  win over older values. Every merge is commutative, associative and idempotent, and this is
  unit-tested as properties.
- Cycle: `files.get(fields=id,modifiedTime,version)` → if changed, download and merge into local
  → if local has anything the remote lacks, upload the merged file → store the baseline. A race
  between two uploads can at worst drop the other device's latest delta *from the file*. That
  device still holds it locally and re-adds it on its next cycle, so the state converges.
- Triggers: debounce after a change (≈ 5 s), on focus, on `online`, and every 3 minutes while
  visible. Same as Eat My Way, just tighter.
- **The child never sees sync.** Failures and re-authentication are shown only in the parent
  panel (a small dot on the gear icon). An expired token waits for a parent's tap, never a popup
  in front of the child. The token is handled as in Eat My Way decisions 90 and 173: GIS token
  flow, memory plus `sessionStorage`, never `localStorage`.
- **Compaction:** `attempts` days older than 120 days collapse into one `"old"` bucket per word
  per device, which keeps the file in the low hundreds of kB for years.

### Sharing flow

1. **Parent A** (panel → *Rodzina*): „Zaproś drugiego rodzica" → e-mail → the app calls
   `permissions.create` (`role: writer`, Drive's own notification e-mail with a short Polish
   message containing the invite link).
2. Invite link: `https://hellopolly.gorny.dev/#/join/<fileId>`. It contains only the Drive file
   id. Without the Drive permission the id is useless.
3. **Parent B** opens it → „Połącz z Google" → the **Google Picker** opens filtered to that file
   (`DocsView.setFileIds`) → one tap „Wybierz" → the app now has `drive.file` access to it → merge
   with B's local data (B's existing children, if any, are offered as „Dołącz do wspólnej
   rodziny" or „Zachowaj osobno").
4. A sees B under *Rodzina* and can **remove** them (`permissions.delete`). B's app then sees
   404/403 and says „Dostęp do wspólnej rodziny został cofnięty". B's local copy stays for export
   but stops syncing.
5. Edge cases: B signed in with a different Google account than the one invited → a clear
   message naming the account in use. The file trashed by A → B is told the same way. The
   picker closed → nothing changes.

---

## Security and privacy

- CSP without `unsafe-inline`/`unsafe-eval`. Expected sources (verified under Docker in the
  phases that add them, every widening recorded in STATE.md):
  `script-src 'self' https://accounts.google.com https://apis.google.com https://static.cloudflareinsights.com`;
  `img-src 'self' data: blob: https://cdn.jsdelivr.net`;
  `connect-src 'self' https://www.googleapis.com https://accounts.google.com https://cdn.jsdelivr.net`;
  `frame-src https://accounts.google.com https://docs.google.com`; `style-src 'self'`.
  No `wasm-unsafe-eval`: there is no WebAssembly.
- **No secrets anywhere.** The Picker needs a *browser API key* and the Cloud *app id*, both
  public by design (`VITE_*`), restricted in Google Cloud to the Picker API and to the app's
  referrers.
- `Permissions-Policy` denies the microphone and camera: nothing records the child.
- Data about the child: a nickname, an avatar from a fixed set, and learning progress. Stored
  on the family's own Drive and devices only. A `privacy.html` says exactly that. It is also the
  page the OAuth consent screen links to.
- The parent gate protects settings, sharing and deletion. It is a child-proof lock, not a
  security boundary, and the docs say so.

## Screens and navigation

```
/                     start: tap-to-begin (unlocks speech), then child picker or map
/child/:id            treasure map (the child's home)
/child/:id/lesson     lesson player
/child/:id/play       game shelf (free play with learned words)
/child/:id/play/:game a game
/child/:id/stories    story shelf;  /child/:id/stories/:storyId  story player
/child/:id/album      sticker album
/child/:id/chest      chest opening
/parent               parent panel (behind the gate)
/parent/child/:id     child: words and queue, topics, limits, progress
/parent/family        sync, invite, members
/parent/speech        voice check, accent, speeds
/join/:fileId         accept an invite
/setup                first run
```

- **Child picker only when there are ≥ 2 children** (owner's requirement). With exactly one,
  `/` goes straight to that child's map. The picker is big avatars, with a name under each for
  the parent.
- **Treasure map:** a vertical, scrolling sea with islands (lessons), Polly's ship on the
  current island, a chest icon when one is waiting, and a bottom bar with three big icons: map
  (🗺), games (🎲), stories (📖), plus the album (📒). A gear in the corner opens the parent gate.
- **Parent panel:** the children list; per child, a word plan editor (topics as toggles, each
  word as a picture with its state, actions: „Dodaj do kolejki" / „Zna już" / „Wstrzymaj", the
  queue reorderable by drag); progress (learned per topic, words that need practice, a 4-week
  activity calendar, minutes per day); speech; family; export/import JSON.

## First run

1. A start screen with Polly; the tap unlocks audio.
2. **Voice check:** plays „Cześć!" and "Hello!". If either voice is missing, say what to install
   (Android: Google speech services → languages; iOS: Settings → Accessibility → Spoken Content).
3. „Mam zaproszenie" (→ join flow) or „Zaczynamy":
4. Add a child (nickname + avatar, optional birth year).
5. Choose starting topics (default: colours, fruit, animals, numbers) and optionally queue
   specific words.
6. Optional „Zapisuj postępy na Dysku Google" (it can be done later from *Rodzina*).
7. The parent gate is explained in one sentence; the screen hands over to the child's map.

---

# Phases

Local-first ordering, as in Eat My Way: the app is fully usable on one device after Phase 6,
sync lands in 7, sharing in 8. One phase per conversation via `/phase N`; progress in STATE.md.
**The data model is sync-shaped from Phase 2** (per-device progress, `Lww` registers), so that
sync is never a migration.

### Owner prerequisites (before or during Phase 1, by hand)

- [ ] Confirm or replace the name, subdomain and repository.
- [ ] Create the public GitHub repository, branch `dev` as default, and the same secrets and
      variables as Eat My Way (`SSH_*`, `DEPLOY_CHECK_TOKEN`; vars `VITE_GOOGLE_CLIENT_ID`,
      `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_APP_ID`).
- [ ] DNS record (Cloudflare-proxied), nginx site → `127.0.0.1:8081`, certificate via DNS-01 (as
      in Eat My Way's DEPLOYMENT.md), Cloudflare cache rules scoped to the new host, WAF
      deploy-check rule.
- [ ] A new Google Cloud project: OAuth consent screen (external, scope `drive.file`, privacy
      URL), a web OAuth client (origins: production + `http://localhost:5173` and `:8081`),
      enable **Drive API** and **Google Picker API**, a browser API key restricted to the Picker
      API and the app's referrers. Needed by Phase 7; not blocking earlier phases.

## Phase 1 — Scaffold & Docker

### Tasks

1. Vite + Svelte 5 + TS strict, Tailwind v4, Bits UI, svelte-spa-router with every route in
   "Screens" rendering a placeholder with its Polish title.
2. Repository furniture copied and adapted from Eat My Way: `CLAUDE.md`, `STATE.md` (phase table,
   Decisions, Open questions), `.claude/commands/phase.md`, the `/release` skill,
   `.gitattributes` (LF), `.editorconfig`, `.nvmrc`, `cliff.toml`, `.env.example`, `SECURITY.md`,
   `LICENSE` (MIT), `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `README.md` with a status
   blockquote.
3. `Dockerfile` (`FROM caddy:2-alpine` + prebuilt `dist/`), `docker-compose.yml` (container
   `hellopolly-dev`, `127.0.0.1:8081`), `Caddyfile` on `:8081` with the CSP for this phase
   (`'self'` only plus the Cloudflare beacon), `nosniff`, `Referrer-Policy`,
   `Permissions-Policy` (microphone and camera denied), immutable caching for `/assets/*`,
   `no-cache` for the document.
4. `ci.yml` on `dev` and PRs: install → check → unit → build → Playwright (Chromium + WebKit).
   `deploy.yml` on `v*` tags: build → git-cliff release → rsync + docker build on the VM →
   health check with `X-Deploy-Check`.
5. npm scripts: `dev`, `build`, `preview`, `check`, `test`, `test:e2e`, `docker:up`,
   `changelog`, `screenshots`.
6. Theme tokens (the palette above), the self-hosted font, the base child layout (full-bleed sea
   background) and the base parent layout.

### Acceptance criteria

- [ ] Every route renders its Polish placeholder; `npm run check` and `npm run build` are clean.
- [ ] `npm run docker:up` serves on http://localhost:8081 with the exact CSP and zero violations.
- [ ] CI green on `dev`. A `v0.1.0` tag deploys and `https://<domain>` serves the shell.
- [ ] Works from a clean checkout on Windows and Linux.

## Phase 2 — Content pipeline & local data layer

### Tasks

1. Types from "Content model" and "Local data model" in `src/lib/types.ts`.
2. `scripts/build-content.mjs`: copy the curated Fluent Emoji subset from a **pinned commit**
   into `content/img/`, SVGO, enforce the size budget, write `content/img/LICENSE` and the
   attribution. **Offline mode** (`--check`) for CI, so CI never downloads anything.
3. Content JSON for the **first four topics** (colours, numbers 1–10, fruit, pets & farm), with
   `pl`, `plAcc` and the Polish prompt catalog for every exercise in Phase 5.
4. `npm run check:content` validator (rules in "Content model"), run in CI.
5. `ImageSource`: content refers to image ids only; one module maps id → URL. Production → jsDelivr at the build's tag, dev/preview → origin. Fallback to
   the origin on error.
6. Dexie schema: `meta` (deviceId, schema), `family` (the `FamilyFile` shape held locally),
   `syncBaseline`.
7. Pure, unit-tested domain functions: `mergeFamily`, word-state derivation, Leitner review,
   `nextWords(plan, state)`, `composeLesson(...)`, chest and sticker arithmetic, minutes today.

### Acceptance criteria

- [ ] `mergeFamily` passes property tests (commutative, associative, idempotent) over generated
      files, including tombstones and compaction.
- [ ] `nextWords` honours queue → enabled topics → known/paused, verified by table tests.
- [ ] Learned / review transitions match the rules in "Learning model" on fixed histories.
- [ ] `check:content` fails on a missing image, an oversized SVG and an unknown story word.
- [ ] Images load from jsDelivr in a production build (verified after the next tag) and from the
      origin in dev.

## Phase 3 — Speech

### Tasks

1. `src/lib/speech/`: the `SpeechEngine` interface and `WebSpeechEngine`: voice discovery (`voiceschanged`), voice choice per language (accent preference,
   local voices preferred, stored per device), `speak(text, {lang, speed})` with `cancel()`
   first, slow mode (rate, pause, optional repeat), a sentence queue for stories, and
   `boundary` events with a timed fallback.
2. The unlock gesture on the start screen. The app never attempts speech before it.
3. `/parent/speech`: voice check (names the voice, plays a test word at both speeds, lists every
   available voice), accent, rates, „powtarzaj wolno dwa razy", default speed.
4. Polish prompts via the `pl-PL` voice with `{word}` substitution (`plAcc`). Without a Polish
   voice, prompts become icon and animation only and the voice check says so.
5. Web Audio sound effects: tap, correct, sparkle, wiggle, chest creak, pop. No audio files.
6. A speech fake for tests that records what was spoken and at which rate.

### Acceptance criteria

- [ ] Unit: slow and normal use the configured rates; a new `speak` cancels the previous one.
- [ ] e2e (Chromium + WebKit, speech faked): tapping a picture speaks its `say ?? en`, and the
      🐢/🐇 toggle changes the rate.
- [ ] Manual, recorded in STATE.md: real voices on an Android phone and an iPhone; slow mode is
      judged intelligible for first-time listening on the first four topics, and `say` overrides
      are added where it was not.
- [ ] No network request and no audio file appear in the network log at any point.

## Phase 4 — Children, word plan, parent gate, look-and-listen

### Tasks

1. `/setup` per "First run" (without the Drive step), children CRUD (nickname, avatar set,
   tombstone delete).
2. Child picker shown **only when ≥ 2 children**; with one child, `/` goes straight to the map.
3. Parent gate (number in Polish words + keypad) guarding `/parent/*`.
4. Parent word-plan editor: topics, per-word state pictures, queue (add, reorder by drag or
   buttons, remove), known, paused, random-within-topic.
5. Treasure map (islands from `composeLesson` progress, Polly's ship) and the **look-and-listen**
   step as a standalone lesson, so a child can already meet words in this phase.

### Acceptance criteria

- [ ] With one child the picker never appears; adding a second child makes it appear; removing it
      makes it disappear again.
- [ ] A queued word is the next word introduced, ahead of topic order.
- [ ] The gate cannot be passed by tapping randomly (e2e: 50 random taps do not open it).
- [ ] Every child screen is operable with no reading (review against the screen list; recorded).

## Phase 5 — Lessons & first exercises

### Tasks

1. Lesson player: steps from `composeLesson`, progress dots, Polly reactions, the finish screen
   with stars.
2. E1 *Posłuchaj i dotknij* (2/3/4 choices by mastery), E2 *Cyferki*, E3 *Memory*.
3. Errorless feedback: wiggle, word again, glow after the second miss. No negative sound.
4. Attempt recording into this device's `DeviceProgress`, day-bucketed.
5. Game shelf with E1–E3 in free play over learned words; locked state with fewer than 4.

### Acceptance criteria

- [ ] A full lesson runs end to end in both engines (e2e) and updates attempts, stars and states.
- [ ] *Cyferki*: four digits map to four distinct words; each digit speaks its word; a correct
      match removes the pair; a wrong one never removes it.
- [ ] New words appear only in 2-choice steps within their first lesson.
- [ ] Tested with a real 4-year-old: one full lesson without adult help (recorded honestly in
      STATE.md, including what confused them).

## Phase 6 — Rewards

### Tasks

1. The star meter on the map; chest availability derived from stars and opened chests.
2. The chest scene (hand-made SVG, three-tap opening, glow, Web Audio sparkle, 1–3 stickers).
3. Sticker draw: no duplicates until a set completes, a bias toward learned words, rare gold.
4. Album: sets as pages, outlined empty slots, tap to hear the word.
5. Sticker art: Fluent 3D PNGs (added to the content budget) or Color SVGs. Pick one and record
   the size.

### Acceptance criteria

- [ ] Unopened chests survive reloads and are identical after merging two devices' progress.
- [ ] The draw is deterministic given its seed (unit) and never repeats within an incomplete set.
- [ ] The chest animation respects `prefers-reduced-motion`.

## Phase 7 — Drive sync (one account, many devices)

### Tasks

1. `StorageBackend` + Drive implementation, scope **`drive.file`**, GIS token flow (Eat My Way
   decisions 90/173), no Google request before the parent connects.
2. Create or find `hello-polly-family.json` (app-created, so `drive.file` sees it). Store the
   file id locally.
3. The sync cycle and triggers from "Sync model". Compaction.
4. Sync status only in the parent panel; re-auth only on a parent's tap.
5. `src/test/fake-drive.ts` (as in Eat My Way): two "devices" over one fake file.
6. CSP widened for GIS (`script-src`/`frame-src https://accounts.google.com`,
   `connect-src https://www.googleapis.com`), COOP `same-origin-allow-popups`, recorded.

### Acceptance criteria

- [ ] Two devices playing at the same time with the same child converge to identical derived
      state, and nothing is lost (fake-drive e2e, including an interleaved upload race).
- [ ] An expired token never shows anything on a child screen.
- [ ] Zero CSP violations through the OAuth flow under `npm run docker:up` (Google's own
      iframe styles excepted, as in Eat My Way decision 88, if they recur).
- [ ] Live check against real Google, recorded in DEPLOYMENT.md as a checklist.

## Phase 8 — Inviting the second parent

### Tasks

1. *Rodzina*: invite by e-mail (`permissions.create`, writer, notification with the link),
   the member list from `permissions.list`, and removal.
2. `/join/:fileId`: sign in → Picker (`apis.google.com` loader, developer key, app id,
   `DocsView.setFileIds`) → access granted → merge with any local family („Dołącz" / „Zachowaj
   osobno").
3. The edge cases in "Sharing flow" with clear Polish messages.
4. CSP widened for the Picker (`script-src https://apis.google.com`,
   `frame-src https://docs.google.com`, plus whatever the Picker proves to need, measured, not
   guessed), recorded.
5. **Spike first** (first task of the phase, result in STATE.md): the Picker inside an
   *installed* PWA on Android and iOS. If it fails on iOS standalone, open the join step in the
   browser tab instead and record that.

### Acceptance criteria

- [ ] Parent B, on a different Google account, joins from the link in ≤ 3 taps after sign-in and
      sees A's children and settings.
- [ ] Progress made on B's phone appears on A's phone after a focus or 3 minutes.
- [ ] Removing B stops B's sync with a clear message; A's data is untouched.
- [ ] B signed in with the wrong account gets a message naming that account.

## Phase 9 — Stories & more games

### Tasks

1. Story player (scene renderer, sentence-by-sentence speech, highlighting, tappable objects),
   the story shelf with locked and unlocked states and the 80 % unlock rule.
2. One story per level-1 topic (≥ 4), all passing the validator.
3. Games E4–E9 over learned words; E9 behind a parent toggle.

### Acceptance criteria

- [ ] Each story plays in 25–40 s at normal speed on a real phone (measured, recorded).
- [ ] No story uses a word outside the vocabulary plus the allow-list (validator in CI).
- [ ] Each game is completable in both engines (e2e) and only shows learned words.

## Phase 10 — Screen time & the progress dashboard

### Tasks

1. Session and daily limits per child; Polly falls asleep after the current exercise; the
   lock lifts after the gate or on the next day.
2. Minutes per device per day, summed across devices.
3. Parent dashboard: learned per topic, words that need practice (most first-try misses), a
   4-week activity calendar, stickers collected, stories heard.
4. Export / import of the family as JSON (local backup independent of Drive).

### Acceptance criteria

- [ ] With a 1-minute session limit, the lock appears after the current exercise, never mid-step.
- [ ] Two devices' minutes add up after sync (fake-drive).
- [ ] Export → import into a fresh profile reproduces derived state exactly.

## Phase 11 — Full A1 content, PWA polish, v1.0.0

### Tasks

1. The remaining topics (≈ 300 words total) and stories for every topic. `say` overrides from a
   listening pass on real voices.
2. vite-plugin-pwa: manifest (Polish name, blue theme colour, icons from the mascot), precache
   of the shell and content JSON, runtime cache-first **only** for the jsDelivr content path,
   prefetch of the next lesson's images, update prompt in the parent panel only.
3. Install button and copy as in Eat My Way (Android, desktop; iOS „Dodaj do ekranu
   początkowego" instructions), safe areas for iPhone (Eat My Way Phase 15).
4. Final security pass (CSP under Docker, `npm audit`, no `localStorage` token), `privacy.html`,
   Fluent Emoji and font attribution on `/about`.
5. README with screenshots (`npm run screenshots`), DEPLOYMENT/DEVELOPMENT checked against
   reality, the first real release `v1.0.0` via `/release`.

### Acceptance criteria

- [ ] Installs and launches standalone on Android, iPhone and desktop Chrome.
- [ ] Airplane mode after one full session: lessons, games, stories and album all work with
      already-seen images; sync waits silently.
- [ ] Origin transfer for a returning installed user after a release ≤ 300 kB (measured on the
      Cloudflare dashboard or with `curl --resolve`), with images served by jsDelivr.
- [ ] `v1.0.0` tag green and the site serves it.

---

## Open questions (to settle in the phase named)

1. **Name, domain, repository** (Phase 1).
2. **Default accent**: British is proposed because Polish schools mostly teach it (Phase 3).
3. **Sticker art**: 3D PNG (richer, larger) or Color SVG (Phase 6).
4. **Picker in an installed iOS PWA**: unknown until measured; fallback defined (Phase 8 spike).
5. **Should one family file per Google account allow several families?** Assumed no: one
   family per account (Phase 7).
6. **Speech engine and picture set**: kept or replaced by the quality gates in "Speech and
   pictures are replaceable" (Phases 2, 3 and 5).
7. **Level-2 and level-3 content** (verbs, adjectives) needs animation, not a still picture.
   The scope of animation per word is decided when Phase 11 starts.
