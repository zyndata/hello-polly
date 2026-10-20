# Hello Polly 🦜

English words for a child who cannot read yet. Every word is a picture: tap it and hear it,
slowly 🐢 or at normal speed 🐇. Polly the pirate parrot speaks every instruction in Polish,
short games reuse the words already learned, and a full star meter opens a treasure chest of
stickers for an album. Two parents can share one family, so either phone continues the same
children's progress.

It runs in the browser and installs as a PWA on a phone, tablet or computer. The interface is in
**Polish**; the only English the child hears is the vocabulary itself (CEFR A1 / Cambridge
Pre A1 Starters). The code, comments and documentation are in English.

> **Status: in development. Phases 1–10 of 11 are done**: the scaffold, the content and the
> local data layer, speech, children and the word plan, real lessons, rewards, Drive sync,
> inviting the second parent, stories with more games, and screen time with the progress
> dashboard. A parent sets up a
> child (nickname and an animal picture), chooses the topics and, if they like, the exact words
> to start with. The child gets a treasure map of islands: each island is a lesson of about
> 8–12 steps, up to three new words in *look and listen*, then „Gdzie jest…?” picks with 2–4
> pictures that mix the new words with reviews. A wrong tap only wiggles and says the word again;
> after the second miss the right picture glows. Stars appear at the end of each island. Once a
> child has learned four words, a game shelf opens with up to nine games over learned words
> only: *Posłuchaj i dotknij*, *Cyferki* (tap a digit, hear a word, find its picture),
> *Memory*, *Bańki* (pop the named bubble), *Nakarm Polly* (drag the named food to her),
> *Gdzie jest…?* (find things in a scene), *Polly mówi* (show your nose, your hand…),
> *Pokoloruj* (dip a brush in the named colour and paint the picture) and, if a parent switches
> it on, *Kosze* (sort pictures into two topic baskets). Five 30-second stories, one per topic,
> open once 80 % of their pictures' words are learned: Polly reads them sentence by sentence,
> the pictures bounce as their words are spoken, and any picture says its word when tapped. The parent panel sits
> behind a parent gate (a number in Polish words). Stars fill a meter on the map; a full meter
> brings a treasure chest that opens in three taps and gives 1–3 stickers for an album, one
> sticker per word (rare gold ones shimmer), each saying its English word when tapped. A
> parent can save the family in one file on their own Google Drive (*Rodzina*), and every
> device signed in to that account then continues the same children's progress; the child
> never sees sign-in or sync. From *Rodzina* that parent invites the other by e-mail: the
> other parent opens the link, signs in with their own Google account, picks the family file
> in Google's file picker, and both phones then share the same children, settings and
> progress. The owner of the file can remove the other parent again. Each child has a daily
> limit and a session length (15 and 10 minutes by default, or none): when time is up, the
> current step or game finishes, then Polly falls asleep on a night sea until a parent passes
> the gate or the next day comes; minutes from every device add up through sync. The parent
> sees, per child, the words learned per topic, the words that need practice, a 4-week
> calendar of minutes played, stickers collected and stories heard, and can download the whole
> family as a JSON backup and load it back on any device. The development build is live at
> https://hellopolly.gorny.dev (v0.1.0, from before Drive sync).
> [STATE.md](STATE.md) records what was decided and what is still open.

## What it looks like (so far)

| Treasure map (child) | Look and listen (child) | Listen and tap (child) |
|---|---|---|
| ![Islands in a blue sea: one with a flag, the next with Polly on her sailboat, two more ahead; a star meter two-thirds full and a faded chest at the top, a die and an album at the bottom](docs/screenshots/map.png) | ![A big red flag to tap, progress dots, the turtle and rabbit speed buttons and a house to hold for leaving](docs/screenshots/lesson.png) | ![Two flags to choose from after two wrong taps: the right one glows coral; Polly and a speaker button below](docs/screenshots/pick.png) |
| **Cyferki (child)** | **Island won (child)** | **Start (child)** |
| ![Four fruit pictures above four digit tiles 1–4; digit 2 is picked and ringed in gold](docs/screenshots/digits.png) | ![The island with its flag, Polly, and a row of gold stars earned](docs/screenshots/finish.png) | ![Polly the parrot on the sea, ringed by a pulsing gold circle: tap to begin](docs/screenshots/start.png) |
| **Treasure chest (child)** | **Sticker album (child)** | **A story (child)** |
| ![An open pirate chest glowing gold, a new sticker (a green flag) above it and a green ▶ below](docs/screenshots/chest.png) | ![The album's colours page: topic tabs above a grid of dashed slots with flag silhouettes; the green flag sticker ringed in gold](docs/screenshots/album.png) | ![A beach scene with Polly and a big red apple, page dots above and the sentence "Look! A red apple." below](docs/screenshots/story.png) |
| **Pokoloruj (child)** | **Gdzie jest…? (child)** | **Polly asleep: the lock (child)** |
| ![A pear painted yellow above three paint pots, the yellow one ringed in gold](docs/screenshots/paint.png) | ![A beach scene with eight learned things to find: flags, fruit](docs/screenshots/spy.png) | ![The lock: a night sea with a moon and Polly asleep with a zzz; only the gear in the corner](docs/screenshots/sleep.png) |
| **Parent gate** | **Word plan (parent)** | **Speech and voices (parent)** |
| ![The parent gate: „dziesięć” written in words above a number keypad](docs/screenshots/gate.png) | ![A child's next new words and the word plan: queue, random order, topics](docs/screenshots/plan.png) | ![The parent's speech screen: voice check, accent, speeds](docs/screenshots/speech.png) |
| **Progress (parent)** | | |
| ![The progress dashboard: learned words per topic as bars, words to practise, a 4-week calendar of minutes](docs/screenshots/dashboard.png) | | |

## What it will and will not do

- **No reading needed.** Instructions are spoken by the device's Polish voice and shown with
  icons and animation; tap targets are at least 72 px. A story's sentence is shown for the
  parent reading along; the child only listens.
- **No loss mechanics.** No hearts, no streak to lose, no timers, no red ✗. A wrong tap gets a
  gentle wiggle, the word again, and after the second miss the right picture glows.
- **No speech recognition, no recording.** The microphone and the camera are denied by the
  page's own `Permissions-Policy`.
- **No backend and no secrets.** Progress lives in the browser and, if a parent connects it, in
  one file in that parent's own Google Drive. Speech is the device's own voice; nothing is
  uploaded and no audio file is shipped.
- **No ads, no purchases.**

## How it is built

A pure client-side SPA: Vite, Svelte 5, TypeScript (strict), Tailwind CSS v4, hash routing.
IndexedDB is the source of truth; Google Drive is an optional sync layer. The static bundle is
built in CI and served by Caddy in Docker behind nginx and Cloudflare, with a strict CSP (no
`unsafe-inline`, no `unsafe-eval`). Pictures are Microsoft Fluent Emoji, served from jsDelivr
at the release tag.

- Development setup and cross-platform rules: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Deployment, secrets, rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Release notes: [CHANGELOG.md](CHANGELOG.md)

```bash
npm ci
npm run dev          # http://localhost:5173 (no CSP)
npm run docker:up    # http://localhost:8081 (production headers)
```

## Licence

[MIT](LICENSE). The Nunito font is under the SIL Open Font License 1.1
([src/assets/fonts/OFL.txt](src/assets/fonts/OFL.txt)). The pictures are Microsoft Fluent
Emoji, MIT ([content/img/LICENSE](content/img/LICENSE),
[attribution](content/img/ATTRIBUTION.md)).
