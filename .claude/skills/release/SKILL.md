---
name: release
description: Ship the current changes for Hello Polly. Asks whether to do a LOCAL deploy (build + rebuild the hellopolly-dev Docker container on :8081) or a REMOTE release (tag a SemVer version on main to trigger the GitHub Actions changelog + GitHub Release + deploy to hellopolly.gorny.dev, which also publishes the content images on jsDelivr at that tag). Use when the user wants to release, deploy, ship, or publish the project.
---

# Release Hello Polly

Drive a release of the current working changes. There are two mutually exclusive
targets. **Always ask the user which one first**, then execute only that path.

This project is developed from two machines (Windows and Linux). Prefer the npm
scripts and plain `git`; they behave identically on both. Where a raw shell
command is unavoidable, the PowerShell and POSIX forms are given side by side.

## Step 1 — Ask the target

Use the **AskUserQuestion** tool with one single-select question, header `"Cel wdrożenia"`,
and exactly these two options:

- **„Local deploy + reset kontenera"**: Commit on the current branch, build the bundle,
  rebuild the image and restart the `hellopolly-dev` Docker container. No GitHub push.
  Test on http://localhost:8081. This is the only way to see the app under the **real
  production CSP**, which `npm run dev` does not apply.
- **„Release: tag SemVer + GitHub Action"**: Commit, merge into `main`, then create and push
  a **SemVer tag** (`vX.Y.Z`). The tag (not a plain `main` push) triggers
  `.github/workflows/deploy.yml`: build → git-cliff CHANGELOG + GitHub Release → rsync the
  built bundle + versioned `docker build` on the server → production hellopolly.gorny.dev.
  The same tag is what jsDelivr serves the content images from.

Do not proceed until the user picks one (or gives custom direction).

## Step 2a — Local deploy + container reset

1. **Run the checks first** (local deploy has no CI gate, unlike the remote path):
   ```
   npm ci
   npm run check
   npm test
   ```
   If anything is red, STOP and fix it before deploying. Do not restart the container on
   failing checks.
2. **Review & commit.** Run `git status` and `git diff --stat`. If there are uncommitted
   changes, stage and commit them on the **current branch** (usually `dev`; do not switch
   to `main`). Use **Conventional Commits**; end the message with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   If the tree is already clean, skip committing.
3. **Build and restart the container.** The image copies a prebuilt `dist/` (the server never
   runs a bundler), so the build must happen before `docker compose`:
   ```
   npm run build
   docker compose down
   docker compose up --build -d
   ```
   (`npm run docker:up` chains all three.)
4. **Verify** the container is healthy and serving the new code:
   - `docker ps` shows `hellopolly-dev` as `Up`.
   - `curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/` → `200`
     (PowerShell: `(Invoke-WebRequest http://localhost:8081/ -UseBasicParsing).StatusCode`).
   - **Check the CSP header is present and matches the Caddyfile:**
     `curl -sI http://localhost:8081/ | grep -i content-security-policy`
     (PowerShell: `(Invoke-WebRequest http://localhost:8081/ -UseBasicParsing).Headers['Content-Security-Policy']`).
     Also confirm `Permissions-Policy` still denies the microphone and camera.
   - Open the app and confirm **zero CSP violations** in the browser console. A violation
     here is a production bug that `npm run dev` will never show you.
   - Locally, images come from the origin, not jsDelivr (dev/preview mapping in `ImageSource`).
     The CDN path is only exercised after a real tag (Step 2b.8).
   - `docker logs hellopolly-dev` for startup errors.
5. **If the host returns nothing while the container looks healthy,** something else is holding
   port 8081 (`:8080` is Eat My Way's container; do not stop it by mistake). Find the holder:
   - PowerShell: `Get-NetTCPConnection -LocalPort 8081 -State Listen | Get-Process`
   - Linux: `ss -ltnp 'sport = :8081'`
6. Report the URL (http://localhost:8081) and the verified status, including the CSP result.

## Step 2b — Release: tag a SemVer version + GitHub Action

The deploy workflow triggers **only on a `vX.Y.Z` tag**, not on a plain `main` push. A release
is a deliberate, named, rollback-able act. The tag also pins the images: the production build
loads them from `https://cdn.jsdelivr.net/gh/zyndata/hello-polly@vX.Y.Z/content/img/…`, so a
picture added or changed in `content/img/` reaches users only through a new tag.

1. **Run the checks locally first** (`npm ci; npm run check; npm test; npm run build`) to fail
   fast. The same steps run in CI as the `build` job that gates the release, so a red tag would
   block everything downstream anyway. STOP and fix on failure. That `build` job runs **no e2e
   tests**; step 3 is where the release gets its browser-test evidence.
2. **Review & commit** on the current branch (usually `dev`), same commit-message rule as above.
   Use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `perf:`, `ci:`, …).
   The changelog is generated from them, so the message
   *is* the release note.
3. **Sync the other machine's work first.** This project is developed from two machines; a stale
   local `main` is the most likely way to lose a commit here:
   ```
   git fetch origin
   git status -sb          # confirm dev is not behind origin/dev
   ```
   Then **confirm the `ci.yml` run for the commit being released is green**. `ci.yml` never runs
   on `main`, so this run is the only e2e result (Chromium and WebKit) the release will ever have:
   ```
   git rev-parse origin/dev
   gh run list --workflow ci.yml --branch dev --limit 5 --json databaseId,headSha,status,conclusion
   ```
   The run whose `headSha` matches must be `completed` / `success`. If it is still running,
   `gh run watch <id> --exit-status`. If it is red, or there is no run for that commit, STOP.
4. **Merge into `main`:**
   ```
   git checkout main
   git pull --ff-only origin main
   git merge --no-ff dev
   git push origin main
   ```
   (If already on `main`, just commit.) This push alone does **not** deploy.
5. **Pick the next SemVer version.** Inspect commits since the last tag
   (`git describe --tags --abbrev=0` then `git log <last-tag>..HEAD --oneline`) and bump per
   [SemVer](https://semver.org): breaking → **major**, any `feat:` → **minor**, only
   `fix:`/`docs:`/chores → **patch**. Stay in `v0.x` through the development phases (the app is
   usable on one device after Phase 6); the first real release is **v1.0.0**, at the end of
   Phase 11. If unsure, confirm with the user.
6. **Tag and push the tag** (annotated). This is what triggers the release:
   ```
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   git checkout dev
   ```
7. **Confirm the Action started** with the `gh` CLI. The workflow runs `build` → `release`
   (git-cliff CHANGELOG commit-back + GitHub Release) → `deploy`, each gated on the previous:
   ```
   gh run list --workflow=deploy.yml --limit 3
   gh run watch <run-id> --exit-status   # optional: stream until it finishes
   ```
8. Report the run URL/status, the **GitHub Release** URL (`gh release view v0.1.0 --web`), and,
   after success, that the change is live at https://hellopolly.gorny.dev (the workflow's last
   step already asserts HTTP 200). Then confirm:
   - the app loads with **no CSP violations**;
   - **images come from jsDelivr at the new tag**: one image URL
     `https://cdn.jsdelivr.net/gh/zyndata/hello-polly@<tag>/content/img/<id>.svg` returns `200`
     (`curl -s -o /dev/null -w "%{http_code}" <url>`), and the Network panel shows the app
     using it rather than the origin fallback. (Skip before Phase 2, when there are no images.)

**Note on CHANGELOG.md:** the `release` job regenerates it via git-cliff and commits it back to
`main` as `chore(release): update CHANGELOG …`. After the run, bring that commit into `dev` and
**push it**. Without the push the *other* machine never sees it:
```
git checkout dev
git fetch origin
git merge --ff-only origin/main   # fails only if dev moved since the merge; then a plain merge
git push origin dev
```
That push starts a `ci.yml` run on `dev`; wait for it and report it like any other push.

## When a release goes wrong

Published tags must never move. Protect them with a repository ruleset as in Eat My Way
(`Protect release tags`, matching `refs/tags/v*`: deletion and force-update blocked, **no bypass
actors**). Until that ruleset exists, the rule holds by convention. A failed release is fixed
*forward*, with a new patch version, never by re-pointing the tag that broke:

```
git tag -f v0.3.1 && git push -f origin v0.3.1   # never do this
```

Here a moved tag is worse than in Eat My Way. `CHANGELOG.md`, the GitHub Release and every
server rollback image are generated *from* the tag, and **jsDelivr caches `@vX.Y.Z` files
permanently**. A moved tag can leave production serving images from the old commit forever. So
when a release fails:

1. Commit the fix on `dev` as usual, then merge to `main` (Step 2b.4).
2. Tag the **next patch** version (`v0.3.2`, never a reused `v0.3.1`) and push that.
3. If the bad version already reached production, roll the server back to the previous image
   (see **Rollback** in Notes) while the new tag builds. Do not leave production broken while
   waiting on the workflow.

`main` gets the same protection (deletion + force-push blocked). Ordinary pushes are unaffected,
including the release job's own `chore(release)` CHANGELOG commit-back.

## Notes

- Production deploy is outward-facing and hard to reverse. Only run Step 2b after the user
  has explicitly chosen it in Step 1.
- Never push with `--no-verify`, never force-push `main`, and never delete or move a published
  tag (see **When a release goes wrong** above).
- **Rollback:** on the server, re-run the previous image (each release builds a version-tagged
  image alongside `:latest`). The rolled-back bundle keeps loading images from its own tag on
  jsDelivr, so pictures stay consistent with it:
  ```
  docker stop hello-polly && docker rm hello-polly
  docker run -d --name hello-polly --restart unless-stopped \
    -p 127.0.0.1:8081:8081 hello-polly:<previous-tag>
  ```
- **Never commit a credential.** No OAuth client secret, no `.env` (only `.env.example`), and no
  TTS key: if a keyed speech engine is ever added, the key is the parent's own and lives in the
  family settings. `VITE_*` values (Google client id, Picker API key, app id) end up inside the
  public bundle by design and are restricted in Google Cloud instead.
- The deploy server, tag-based workflow, changelog (`cliff.toml` / `CHANGELOG.md`) and rollback
  details live in [.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml),
  [docs/DEPLOYMENT.md](../../../docs/DEPLOYMENT.md) and [CLAUDE.md](../../../CLAUDE.md).
- A release is not a phase. `/phase N` implements one phase and ends; `/release` ships whatever
  is currently on the branch. Do not start phase work from inside this skill.
