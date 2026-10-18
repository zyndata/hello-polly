# Development

This project is developed from **two machines, Windows and Linux**. Everything needed to work
on it lives in the repository; nothing is configured per machine outside `.env.local` and your
own git identity.

## Setup (identical on both machines)

```bash
git clone https://github.com/zyndata/hello-polly.git
cd hello-polly
git checkout dev
cp .env.example .env.local     # `copy` on Windows cmd; Copy-Item in PowerShell
npm ci
npm run dev                    # http://localhost:5173
```

Node version: see [.nvmrc](../.nvmrc). With `nvm` (either platform): `nvm use`.

`.env.local` can stay empty until Phase 7: nothing reads the `VITE_*` values before Drive sync.

## npm scripts

These are the interface to the project. Prefer them over raw commands: they are the same on
both machines and in CI.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR. **Does not apply the production CSP.** |
| `npm run build` | Production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally (still no CSP headers) |
| `npm run check` | `svelte-check` + TypeScript |
| `npm test` | Vitest, one pass (`src/**/*.test.ts`) |
| `npm run test:watch` | The same suite in watch mode |
| `npm run test:e2e` | Playwright against `vite preview` (builds first). Chromium; WebKit too with `E2E_WEBKIT=1` or in CI |
| `npm run test:e2e:csp` | The same specs against the Caddy container on :8081, under the production CSP |
| `npm run docker:up` | `build`, then rebuild and restart the `hellopolly-dev` container on :8081 |
| `npm run screenshots` | Retake the README screenshots against a running build (default :8081) |
| `npm run changelog` | Regenerate `CHANGELOG.md` from commits (git-cliff) |

## Cross-platform rules

These exist because the same checkout is edited on Windows and Linux:

- **Line endings are LF in the repository.** [.gitattributes](../.gitattributes) enforces this.
  If git ever reports a whole file as modified with no visible change, that is a line-ending
  problem.
- **No absolute paths and no drive letters** in code, config, scripts or committed settings.
- **No platform-only scripts in the build path.** Automation goes into npm scripts (Node), not
  into `.ps1` or `.sh` files. That includes `VAR=value command` inside an npm script, which is
  POSIX-shell syntax and fails in cmd and PowerShell; use a config file or a Node script
  instead (this is why `test:e2e:csp` has its own Playwright config).
- **File names are case-sensitive on Linux.** Match every import to the file name exactly.
- **Docker Desktop (Windows) and Docker Engine (Linux)** both run `docker compose` the same way;
  the compose file must not depend on either.
- **WebKit will not run from a VS Code snap terminal.** On Linux, if VS Code is installed as a
  snap its integrated terminal exports `GIO_MODULE_DIR` pointing into the snap's GIO module
  cache, and every WebKit navigation dies with „WebKit encountered an internal error” while
  Chromium passes. Run `env -u GIO_MODULE_DIR E2E_WEBKIT=1 npm run test:e2e`, or use a terminal
  outside VS Code. Nothing in the repository is involved.
- Do not commit `.env.local`, `node_modules/`, `dist/`, or `.claude/settings.local.json`.

## Layout

```
src/
  main.ts, App.svelte      mount + router
  app.css                  the theme tokens (PLAN.md palette), the font face, base layouts
  assets/fonts/            Nunito, subset to Latin + Polish, with its OFL licence
  lib/screens.ts           every screen in PLAN.md as data (path, Polish title, area, phase)
  lib/routes.ts            the svelte-spa-router map built from it
  lib/components/          ChildLayout (full-bleed sea), ParentLayout, Placeholder
e2e/                       Playwright specs; every spec fails on a CSP violation
```

The theme lives in `@theme` in [src/app.css](../src/app.css): `ocean`, `deep-sea`, `sky`,
`foam`, `lagoon`, `gold` (rewards only), `coral` (highlights and the hint glow), `sand`, `leaf`
(success), plus `ink`/`ink-muted` for parent text and `tap` (72 px) as the minimum child tap
target (`size-tap`, `min-h-tap`).

## Commits and branches

- Branches: work on `dev`, merge to `main`, release by pushing a `vX.Y.Z` tag.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `ci:`,
  `build:`, `chore:`). The changelog is generated from these messages, so the message *is* the
  release note. Do not hand-edit `CHANGELOG.md`.
- Code and comments in English; all user-facing UI text in Polish.

## Testing the real Content-Security-Policy

`npm run dev` and `npm run preview` serve without the production headers, so a CSP violation
does not appear until the container. Before releasing anything that adds a script, style,
font, image source or outbound request:

```bash
npm run docker:up
npm run test:e2e:csp
```

The specs record every `securitypolicyviolation` event from the first byte and fail on any.
Then open http://localhost:8081 and check the console as well. Widening the policy is a
deliberate decision that must be recorded in [STATE.md](../STATE.md).

Two things the CSP forbids that are easy to write by accident in Svelte:

- an inline `style="…"` attribute in markup (`style-src 'self'` blocks attributes parsed from
  HTML). Use a class. A `style:` directive or a CSSOM write from script is fine;
- anything Vite would inline as a `data:` URI. `assetsInlineLimit` is 0 for that reason.

Use `http://localhost:8081`, not `http://127.0.0.1:8081`: from Phase 7 only the former is an
authorized JavaScript origin on the Google OAuth client.
