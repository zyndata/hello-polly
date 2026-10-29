# Deployment

Production lives at **https://hellopolly.gorny.dev**, on the same VM as Eat My Way
(eatmyway.gorny.dev, container on `127.0.0.1:8080`) and szok.gorny.dev.

## Shape of the deployment

```
GitHub tag vX.Y.Z
      │
      ├─ build    npm ci → check → test → build          (dist/ artifact, built in CI)
      ├─ release  git-cliff → CHANGELOG.md on main + GitHub Release
      └─ deploy   rsync dist/ + Dockerfile + Caddyfile → docker build → docker run
                                                                  │
                        nginx :443 (TLS, hellopolly.gorny.dev) ───┘ 127.0.0.1:8081
```

The bundle is built **in CI, never on the server**. The image is `FROM caddy:2-alpine` plus the
prebuilt `dist/`; Caddy serves static files on plain HTTP `:8081` and is the **only** source of
the security headers. nginx terminates TLS and proxies; it must not add headers of its own.

The content pictures are not served by this server in normal operation: `deploy.yml` builds
with `VITE_CONTENT_REF=<tag>`, so the bundle loads them from
`https://cdn.jsdelivr.net/gh/zyndata/hello-polly@<tag>/content/img/…`, the repository at its
release tag (`img-src https://cdn.jsdelivr.net` in the CSP). A tag therefore must never move
(see `/release`). The same files are also in `dist/content/img/` and served by Caddy
(`no-cache`, revalidated by ETag); a picture falls back to that copy only if jsDelivr fails.
Builds without `VITE_CONTENT_REF` (dev, preview, `docker:up`, CI) use the origin copy only.

## Cloudflare sits in front

Every name in the `gorny.dev` zone is proxied by Cloudflare, exactly as for Eat My Way, whose
[DEPLOYMENT.md](https://github.com/zyndata/eat-my-way/blob/main/docs/DEPLOYMENT.md) has the
background (DNS-01 certificates because inbound :80 is closed, the WAF challenging non-browser
clients, Web Analytics injected at the edge). The rules this host needs:

- **WAF custom rule `Deploy health check`**: extend the existing rule (or add one) so requests
  to `hellopolly.gorny.dev` carrying `X-Deploy-Check: <DEPLOY_CHECK_TOKEN>` skip every
  protection. The workflow's final step depends on it.
- **Cache rule `Hello Polly shell - bypass cache`**: bypass for `/`, `/index.html`, `/sw.js`,
  `/manifest.webmanifest`, **scoped to `http.host eq "hellopolly.gorny.dev"`**.
- **Cache rule `Hello Polly assets - cache everything`**: `/assets/*` eligible for cache, TTLs
  from the origin's `Cache-Control`, **scoped to the same host**. Cloudflare decides what to
  cache by extension and skips `.json`, which the content JSON is; every name under `/assets/`
  is content-hashed, so this is safe.

Both cache rules must stay host-scoped: the zone also carries Home Assistant, and a path-only
rule would apply to it too.

Web Analytics injects its beacon into the document at the edge. The only thing the app owns is
`script-src https://static.cloudflareinsights.com` in the [Caddyfile](../Caddyfile). The beacon
appears only for requests sending `Accept: text/html`.

When debugging, bypass the edge from the server itself:

```bash
curl -I --resolve hellopolly.gorny.dev:443:127.0.0.1 https://hellopolly.gorny.dev/
```

## One-time server setup

1. Create the deploy directory:
   ```bash
   sudo mkdir -p /var/www/hellopolly
   sudo chown "$USER":"$USER" /var/www/hellopolly
   ```
2. DNS: `hellopolly.gorny.dev` → the VM's public IP, an **A record only** (the VM has no global
   IPv6), proxied.
3. nginx site `/etc/nginx/sites-available/hellopolly.gorny.dev`, symlinked into
   `sites-enabled`, reloaded. **Keep the file pure ASCII** (certbot's parser rejects anything
   that is not valid UTF-8, and a pasted `—` breaks renewal months later).
   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name hellopolly.gorny.dev;

       location / {
           proxy_pass http://127.0.0.1:8081;
           proxy_set_header Host              $host;
           proxy_set_header X-Real-IP         $remote_addr;
           proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       # No security headers here: they come from Caddy in the container.
   }
   ```
4. Certificate over DNS-01, with the nginx installer so renewals reload nginx:
   ```bash
   sudo certbot --authenticator dns-cloudflare --installer nginx \
     --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
     --dns-cloudflare-propagation-seconds 30 \
     -d hellopolly.gorny.dev
   sudo certbot renew --dry-run
   ```
5. Confirm https://hellopolly.gorny.dev answers before testing anything that needs HTTPS (the
   service worker, OAuth).

## GitHub repository configuration

**Secrets** (Settings → Secrets and variables → Actions → *Secrets*). The deploy user, host and
WAF token are the same as Eat My Way's; the SSH key is Hello Polly's own (STATE.md decision 52):

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Private half of the `hello-polly-deploy@github-actions` key, whose public half is in the deploy user's `authorized_keys`. The user can write `/var/www/hellopolly` and is in the `docker` group. To rotate: new key pair, replace the line on the server, overwrite this secret |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan <host>`. It pins the server's host key, and the workflow relies on it (no `StrictHostKeyChecking=no`) |
| `SSH_USER` | Deploy user name |
| `SSH_HOST` | The VM's raw IP, not a hostname (every name in the zone is proxied and never reaches :22) |
| `DEPLOY_CHECK_TOKEN` | Shared secret sent as `X-Deploy-Check` by the health check, matched by the Cloudflare WAF skip rule |

**Variables** (same page → *Variables*). All three are public by design and end up in the
bundle. `VITE_GOOGLE_CLIENT_ID` is read from Phase 7 (without it *Rodzina* says the build has no
Google connection); the other two from Phase 8 (the Picker):

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth web client id (scope `drive.file`). Never add a client *secret*. |
| `VITE_GOOGLE_API_KEY` | Browser API key for the Picker, restricted to the Picker and Drive APIs and the app's referrers |
| `VITE_GOOGLE_APP_ID` | The Google Cloud project number |

**Rulesets**, as in Eat My Way: `Protect release tags` on `refs/tags/v*` (deletion and
force-update blocked, no bypass actors) and the same protection on `main`.

## Cutting a release

Use the `/release` skill. Release only a `dev` commit whose `ci.yml` run is green. By hand:

```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff dev && git push origin main   # this alone does NOT deploy
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0                          # this triggers the workflow
# once the workflow has finished, it has committed the regenerated CHANGELOG to main:
git checkout dev && git fetch origin && git merge --ff-only origin/main
git push origin dev                             # so the other machine gets it; starts a CI run
```

Watch it: `gh run list --workflow=deploy.yml --limit 3`, then `gh run watch <id> --exit-status`.
The workflow's last step asserts that https://hellopolly.gorny.dev/ returns 200.

## Rollback

Each release keeps a version-tagged image on the server:

```bash
docker stop hello-polly && docker rm hello-polly
docker run -d --name hello-polly --restart unless-stopped \
  --memory=256m --memory-swap=256m --cpus=0.5 \
  -p 127.0.0.1:8081:8081 hello-polly:<previous-tag>
```

The rolled-back bundle keeps loading images from its own tag on jsDelivr, so pictures stay
consistent with it. Fix forward with the next patch version; never move a tag.

## Live check against real Google (Drive sync)

The e2e suite runs the real GIS and Drive clients against a fake Google (STATE.md decision 72),
so what only real Google can show is checked by hand, once the Google Cloud project exists
(owner prerequisites in PLAN.md) and after any change to sign-in or sync. Record the date, the
browsers and the result in STATE.md.

Prerequisites:

- [ ] Google Cloud project: OAuth consent screen (external, scope `drive.file` only, privacy
      URL), a web OAuth client whose authorized JavaScript origins are
      `https://hellopolly.gorny.dev`, `http://localhost:5173` and `http://localhost:8081`,
      and the **Google Drive API** enabled. While the consent screen is in *Testing*, add both
      parents' accounts as test users.
- [ ] The client id in `.env.local` (`VITE_GOOGLE_CLIENT_ID=…`, never committed) for local runs,
      and as the repository variable `VITE_GOOGLE_CLIENT_ID` for CI and releases.

Locally (`npm run docker:up`, http://localhost:8081, DevTools console open), then once more on
https://hellopolly.gorny.dev after the next tag:

- [ ] Before connecting: a whole session (first run, a lesson, the panel) makes no request to
      any Google host (Network tab filtered by `google`).
- [ ] Panel → *Rodzina* → „Połącz z Dyskiem Google”: the Google window asks only for access to
      files created by this app; after it, *Stan* is „Połączono” and *Konto* names the account.
- [ ] `hello-polly-family.json` appears in a `HelloPolly` folder in that account's My Drive, and
      its content is the family (the child's nickname is in it).
- [ ] Zero CSP violations in the console through the whole flow. Expected exception, as in Eat
      My Way decision 88: an inline-style report from inside Google's own GIS frame; record it
      if it appears, do not widen `style-src` for it.
- [ ] A second browser (or phone) on the same account: first run → „Mam już rodzinę na Dysku
      Google” lands on the same child's map without adding a child.
- [ ] Play a few pictures on each; within a few seconds (or on switching back to the tab) both
      show the same stars and words, and the file on Drive holds both devices' progress.
- [ ] A reload keeps „Połączono” without a Google window.
- [ ] After the token's hour (or after revoking the app at https://myaccount.google.com/permissions):
      the child's screens show nothing but the small dot on the gear; passing the parent gate
      renews (a Google window may flash) or *Rodzina* offers „Wznów”; the waiting progress
      then lands on Drive.
- [ ] „Odłącz” keeps every child on the device, and no further Google request is made.

## Live check against real Google (the second parent)

The e2e suite runs the real Picker client against a fake Picker served at Google's own URLs
(STATE.md decision 82). What it cannot show is Google's own Picker frame, the invitation e-mail
and the `drive.file` grant the Picker gives. Run this with **two different Google accounts**
(A owns the family, B is invited), after the Drive check above, and record the date, the
browsers and the result in STATE.md.

Prerequisites:

- [ ] In the same Google Cloud project: the **Google Picker API** enabled; a browser API key
      restricted to the **Google Picker API and the Google Drive API** (the Picker's frame lists
      files through Drive with the same key) and to the referrers `https://hellopolly.gorny.dev/*`,
      `http://localhost:5173/*` and `http://localhost:8081/*`; the project *number* noted.
- [ ] `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` in `.env.local` and as repository variables.
- [ ] While the consent screen is in *Testing*, both A and B are test users.

Locally (`npm run docker:up`, http://localhost:8081, DevTools console open), then once more on
https://hellopolly.gorny.dev after the next tag:

- [ ] A: *Rodzina* → „Zaproś” with B's address. *Rodzina* lists A as „właściciel pliku” and B as
      „może zmieniać”; B receives Drive's e-mail, whose note carries the `…/#/join/<id>` link.
- [ ] B (another browser or phone, B's account): open the link → „Połącz z Google” → the Google
      window → the Picker shows exactly one file, `hello-polly-family.json` → select it →
      „Wybierz”. „Gotowe!” lists A's children; the parent panel shows A's accent and speeds.
      Count the taps after the Google window: at most 3.
- [ ] The console shows **one** expected CSP report and no other: `style-src-elem` for an inline
      `<style>` from `apis.google.com` (the Picker's own dialog rules, copied into `app.css`;
      decision 81). Nothing else is blocked, and the Picker looks right (white dialog, shadow).
      If the Picker says the developer key is invalid („Klucz programistyczny API jest
      nieprawidłowy”), Google saw no allowed referrer or the key lacks an API: the site must send
      `Referrer-Policy: strict-origin` (never `no-referrer`, decision 99) and the key must allow
      both the Picker API and the Drive API.
- [ ] B plays a few pictures; A's *Rodzina* „Zapisz teraz” (or switching back to the tab, or 3
      minutes) brings B's progress to A.
- [ ] B, signed in to a **third** account that was not invited: the Picker lists nothing; closing
      it shows „Plik rodziny nie został wybrany. Zalogowano jako <that account>…”; „Zmień konto”
      opens Google's account chooser.
- [ ] A: „Usuń” → „Na pewno usunąć?” on B. On B's next sync (focus), B's gear gets the small
      dot, and B's *Rodzina* says „Dostęp do wspólnej rodziny został cofnięty”. A's file and A's
      children are unchanged; B keeps everything locally.

### Spike: the Picker in an installed PWA (open question 4)

PLAN.md Phase 8 task 5. It needs the web manifest (Phase 11), so that the app installs as a
standalone app, and both phones. On each of an Android phone (Chrome) and an iPhone (Safari):

1. Install the app from the live site (Android: *Install app*; iOS: *Share → Add to Home
   Screen*), open it from the home screen, and confirm it runs standalone (no address bar).
2. In the installed app: first run → „Mam zaproszenie” → paste B's invitation link → „Połącz z
   Google” → does the Google window return to the app? Does the Picker appear, and does
   „Wybierz” complete the join?
3. Separately, tap the link in the e-mail: note whether it opens the installed app or the
   browser (iOS always opens Safari).
4. If the Picker fails standalone: join in the browser tab instead, then in the installed app
   choose „Mam już rodzinę na Dysku Google”, which finds the shared file without the Picker
   (decision 75). Record which path works on which phone in STATE.md, which closes open
   question 4.

## Troubleshooting

- **502 from nginx**: the container is not running or not on `127.0.0.1:8081`
  (`docker ps`, `docker logs hello-polly`).
- **403 with `cf-mitigated: challenge`** from `curl` or CI: the WAF is challenging a
  non-browser client. Use `--resolve` as above, or check the `X-Deploy-Check` rule.
- **Duplicate security headers**: something in nginx adds them; remove it there.
