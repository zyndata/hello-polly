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

From Phase 2 the content images are not served by this server at all: the production build
loads them from `https://cdn.jsdelivr.net/gh/zyndata/hello-polly@<tag>/content/img/…`, the
repository at its release tag. A tag therefore must never move (see `/release`).

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

**Secrets** (Settings → Secrets and variables → Actions → *Secrets*), the same values as Eat
My Way's when the same deploy user is used:

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Private key of a deploy user that can write `/var/www/hellopolly` and run `docker` |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan <host>`. It pins the server's host key, and the workflow relies on it (no `StrictHostKeyChecking=no`) |
| `SSH_USER` | Deploy user name |
| `SSH_HOST` | The VM's raw IP, not a hostname (every name in the zone is proxied and never reaches :22) |
| `DEPLOY_CHECK_TOKEN` | Shared secret sent as `X-Deploy-Check` by the health check, matched by the Cloudflare WAF skip rule |

**Variables** (same page → *Variables*). All three are public by design and end up in the
bundle; none is read before Phase 7:

| Variable | Value |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth web client id (scope `drive.file`). Never add a client *secret*. |
| `VITE_GOOGLE_API_KEY` | Browser API key for the Picker, restricted to the Picker API and the app's referrers |
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

## Troubleshooting

- **502 from nginx**: the container is not running or not on `127.0.0.1:8081`
  (`docker ps`, `docker logs hello-polly`).
- **403 with `cf-mitigated: challenge`** from `curl` or CI: the WAF is challenging a
  non-browser client. Use `--resolve` as above, or check the `X-Deploy-Check` rule.
- **Duplicate security headers**: something in nginx adds them; remove it there.
