# Security policy

## Supported versions

Only the latest released version is supported. Report against it whenever possible.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
**Security → Advisories → Report a vulnerability** in this repository.

Please do not open a public issue for a security problem.

Expect an initial response within 14 days.

## What this app holds

Hello Polly has no backend, no server-side account and **no secrets**: no API key of the
owner's exists anywhere, in the repository or in the bundle. What it stores about a child is a
nickname, an avatar from a fixed set (never a photo), an optional birth year, and learning
progress. That lives in the browser's IndexedDB and, once a parent connects it (from Phase 7),
in one JSON file in that parent's own Google Drive, shared with the second parent through
Drive's own permissions.

- The Google OAuth token (from Phase 7) has the `drive.file` scope: access only to files this
  app created or the user picked for it. It is held in memory and `sessionStorage`, never in
  `localStorage`, IndexedDB or Drive, and it is asked for only from a parent's tap (connecting,
  the parent gate, „Wznów”); a device that never connected makes no request to Google at all.
- The CSP allows Google in exactly three places: `script-src` and `frame-src
  https://accounts.google.com` (Google Identity Services) and `connect-src
  https://www.googleapis.com` (the Drive API). `Cross-Origin-Opener-Policy` is
  `same-origin-allow-popups`, which the sign-in popup needs to return the token.
- Speech is the device's own voice (Web Speech API). No audio is recorded, uploaded or stored;
  `Permissions-Policy` denies the microphone and the camera outright.
- Sound effects are synthesized in the browser. No audio file is shipped.

The parent gate (a number in Polish words) is a child-proof lock, not a security boundary.

## Scope

Security-relevant problems are most likely to look like:

- a **Content-Security-Policy regression**: anything that reintroduces `unsafe-inline` or
  `unsafe-eval`, or widens a directive beyond what [STATE.md](STATE.md) records. Today the
  policy is `'self'` everywhere, plus `https://static.cloudflareinsights.com` in `script-src`
  for the Cloudflare Web Analytics beacon the edge injects;
- **OAuth handling** that requests a broader scope than `drive.file`, or leaks a token;
- **untrusted input treated as markup or code**: a family file fetched from Drive or an
  imported backup rendered without escaping;
- anything that **sends data about a child** anywhere other than the family's own Drive file.

The `VITE_*` values (Google OAuth client id, the Picker's browser API key, the Cloud app id) ship
inside the public bundle by design and are restricted in Google Cloud. A *client secret* in the
bundle would be a vulnerability; please report one if you find it.

Bugs in Google Drive, jsDelivr or the browser itself belong to their respective vendors.
