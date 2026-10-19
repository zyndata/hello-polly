# Hello Polly 🦜

English words for a child who cannot read yet. Every word is a picture: tap it and hear it,
slowly 🐢 or at normal speed 🐇. Polly the pirate parrot speaks every instruction in Polish,
short games reuse the words already learned, and a full star meter opens a treasure chest of
stickers for an album. Two parents can share one family, so either phone continues the same
children's progress.

It runs in the browser and installs as a PWA on a phone, tablet or computer. The interface is in
**Polish**; the only English the child hears is the vocabulary itself (CEFR A1 / Cambridge
Pre A1 Starters). The code, comments and documentation are in English.

> **Status: in development. Phases 1–5 of 11 are done**: the scaffold, the content and the
> local data layer, speech, children and the word plan, and real lessons. A parent sets up a
> child (nickname and an animal picture), chooses the topics and, if they like, the exact words
> to start with. The child gets a treasure map of islands: each island is a lesson of about
> 8–12 steps, up to three new words in *look and listen*, then „Gdzie jest…?” picks with 2–4
> pictures that mix the new words with reviews. A wrong tap only wiggles and says the word again;
> after the second miss the right picture glows. Stars appear at the end of each island. Once a
> child has learned four words, a game shelf opens with three games: *Posłuchaj i dotknij*,
> *Cyferki* (tap a digit, hear a word, find its picture) and *Memory*. The parent panel sits
> behind a parent gate (a number in Polish words). The treasure chest, sync and stories come in
> later phases. [STATE.md](STATE.md) records what was decided and what is still open.

## What it looks like (so far)

| Treasure map (child) | Look and listen (child) | Listen and tap (child) |
|---|---|---|
| ![Islands in a blue sea: one with a flag, the next with Polly on her sailboat, two more ahead](docs/screenshots/map.png) | ![A big red heart to tap, progress dots, the turtle and rabbit speed buttons and a house to hold for leaving](docs/screenshots/lesson.png) | ![Two hearts to choose from after two wrong taps: the right one glows coral; Polly and a speaker button below](docs/screenshots/pick.png) |
| **Cyferki (child)** | **Island won (child)** | **Start (child)** |
| ![Four fruit pictures above four digit tiles 1–4; digit 2 is picked and ringed in gold](docs/screenshots/digits.png) | ![The island with its flag, Polly, and a row of gold stars earned](docs/screenshots/finish.png) | ![Polly the parrot on the sea, ringed by a pulsing gold circle: tap to begin](docs/screenshots/start.png) |
| **Parent gate** | **Word plan (parent)** | **Speech and voices (parent)** |
| ![The parent gate: „dziesięć” written in words above a number keypad](docs/screenshots/gate.png) | ![A child's next new words and the word plan: queue, random order, topics](docs/screenshots/plan.png) | ![The parent's speech screen: voice check, accent, speeds](docs/screenshots/speech.png) |

## What it will and will not do

- **No reading needed.** Instructions are spoken by the device's Polish voice and shown with
  icons and animation; tap targets are at least 72 px.
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
