# Battery Run — Stage Zero

A 90-second lane runner for a sales-booth hand-off: tap ◀ ▶, swipe, or use the
arrow keys to dodge hazards and collect energy on the way to the highest
distance and score you can manage before the clock — or your battery — runs
out.

Plain HTML + CSS + JS, no build step, no external JS dependencies. Three
files: `index.html`, `style.css`, `game.js`.

## Run

```sh
python3 -m http.server 8080
```

Open <http://localhost:8080>.

## The loop

1. **Start.** 90 seconds on the clock, battery at 50%.
2. **Move between 3 lanes** to collect what's falling toward you and dodge
   the rest. Speed steps up once every 10 seconds (a short "⚡ Speeding up!"
   banner marks each step), *and* jumps again the instant you cross 500m,
   1,000m or 2,000m — each of those pops its own "🔥 Speed up!" banner.
3. **Battery drains continuously**, a little faster the longer you last.
   Hazards drain it harder; solar and batteries refill it. Coins are pure
   score — no battery effect, since they're deliberately a bit riskier to
   detour for.
4. **The run ends** the moment either the 90-second clock or your battery
   hits zero, whichever comes first.
5. **Result screen** — distance, batteries collected, other energy collected,
   score, and a "beat my score" share.

A **"ℹ️ How to Play"** button on the home screen opens a dedicated
instructions screen covering all of this — same pattern as every other game
in the portfolio.

### Collect

| | Score | Battery |
| --- | --- | --- |
| ☀️ Solar | +18 | +7% |
| 🔋 Battery | +30 | +14% |
| 💰 Coin | +45 | — |

### Avoid

| | Battery |
| --- | --- |
| ⚡ Electrical hazard | −14% |
| ☁️ Cloud | −8% |
| 💥 Energy monster | −20% |

The spawn mix starts collectible-heavy (roughly 75/25 in your favour) and
drifts toward hazards as the run goes on (down to roughly 64/36) — early game
is forgiving, the last stretch isn't. Spawn *frequency* also ramps from about
one item every 0.75s down to one every 0.35s; the collectible/hazard split
was rebalanced when frequency increased so hazard *encounter rate* stays
roughly where it was, rather than both scaling up together and making the
back half unfairly punishing.

### Scoring

Score is time-passive (+10/sec just for staying alive) plus whatever you
collect. A full, clean 90-second run — no early battery-out — covers roughly
5,040m from the speed steps alone (nine 10-second tiers, 32 up to 80
m/s-equivalent), typically more once distance-milestone speed bumps compound
on top.

## Architecture

```
index.html             structure + the exact ids game.js binds to
style.css               tokens, screens, lane/road math, animations
game.js                  game state, spawn/collision loop, screens, persistence
```

No React, no bundler — a single `requestAnimationFrame` loop drives
everything: elapsed time, distance, battery drain, item spawn/fall,
lane-based collision, and score. Items and lanes are positioned in
percentages of `#world`, so the whole game reflows for any phone screen
without special-casing sizes (a `max-width:380px` media query only tightens
a few font sizes).

Best distance, best score, and total plays persist in `localStorage` per
device and show on the home screen — there's no shared leaderboard here
(see "Known limits").

### Shared portfolio chrome, own gameplay scene

The app shell (background, header panels, buttons, result screen, footer/
stat text) uses the exact same navy-deep/navy-panel/gold/gold-deep/cream
palette and 3D-press gold button style as `sz-solar-blast-game` and Sunny's
Power Dash, plus the same `.logo-card` SVG wordmark, `.home-stats` row,
`.footer-link`, and a "How to Play" screen — so it reads as one Stage Zero
game family rather than N unrelated skins. What's deliberately *not* shared
is the actual gameplay scene (`#world`/`.hero`): Battery Run's bright sky,
sun, city and road are its own thing, the same way Solar Blast's night sky
and Sunny's Power Dash's house interior are each their own game's look —
only the chrome around the game matches.

## Deploying to QA

Push to `main` → GitHub Action builds the image → Harbor → the action rewrites
the image tag in `infrastructure/apps/sz-battery-run-game/values.yaml` →
ArgoCD syncs. Lands at **https://battery-run.qa.stagezero.co.za**.

Same pattern as `sz-loadbreaker-game`: the chart keeps its config in the
default `values.yaml` rather than an `env/qa/` overlay, so Helm — and
therefore ArgoCD — reads it with no `helm.valueFiles` setting on the
Application. CI rewrites the same file ArgoCD renders, which removes any way
for the two to disagree about the image tag. `nginx.conf` sends
`Cache-Control: no-store` on `index.html`, `style.css` and `game.js` — this
whole app is a few KB, so there's no real cost to always revalidating, and it
avoids a stale cached copy of the game logic surviving a fix (this bit
Loadbreaker once).

### One-time setup

| What | Where |
| --- | --- |
| `HARBOR_URL` variable | GitHub repo → Settings → Variables |
| `HARBOR_CA_CERT`, `HARBOR_USERNAME`, `HARBOR_PASSWORD` | GitHub repo → Settings → Secrets |
| ArgoCD `Application` → `path: infrastructure/apps/sz-battery-run-game` (no values file needed) | ArgoCD, `argocd` namespace |
| `qa-cert` TLS secret present in the `sz-battery-run-game` namespace | cluster |

The ArgoCD `Application` itself isn't part of this repo's GitOps loop — it's
the one resource registered by hand (`kubectl apply`) against the `argocd`
namespace before anything here starts syncing.

## Files

- `index.html` / `style.css` / `game.js` — the whole game: home/game/result/
  info screens, spawn/collision loop, persistence, all inline
- `Dockerfile` · `nginx.conf` — static image, non-root nginx on 8080, `/healthz`
- `infrastructure/apps/sz-battery-run-game/` — Helm chart deployed by ArgoCD
- `.github/workflows/deploy.yml` — build → push to Harbor → rewrite manifest → ArgoCD sync

## Known limits of this build

- **QA is running a manually-pushed image tag, not real CI.** The GitHub
  Actions workflow is wired up correctly but needs the three Harbor secrets
  (above) added to the repo before a push to `main` builds and deploys on
  its own — until then, a code change needs a manual
  `docker build && docker push` plus a `values.yaml` tag bump, same as every
  update so far.
- **No shared leaderboard.** Best distance is per-device (`localStorage`).
  A real cross-booth leaderboard needs a small backend.
- **No lead-capture screen.** Unlike Loadbreaker, this build doesn't ask for
  contact details anywhere — worth adding if this is meant to double as a
  lead-generation tool, not just a booth attraction.
- **"Challenge a Friend" copies text, it doesn't post anywhere.** `Web Share`
  is used where the browser supports it, otherwise clipboard copy.
- **No analytics.** Nothing is instrumented — worth adding before a real
  activation to see typical distances, which item types get missed most, and
  where runs tend to end.
- **Single language, no i18n.** English only.
