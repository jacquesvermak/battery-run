# Battery Run — Stage Zero

A 60-second lane runner for a sales-booth hand-off: tap ◀ ▶, swipe, or use the
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

1. **Start.** 60 seconds on the clock, battery at 50%.
2. **Move between 3 lanes** to collect what's falling toward you and dodge
   the rest. Speed steps up once every 10 seconds (a short "⚡ Speeding up!"
   banner marks each step), *and* jumps again the instant you cross 500m,
   1,000m or 2,000m — each of those pops its own "🔥 Speed up!" banner.
3. **Battery drains continuously**, a little faster the longer you last.
   Hazards drain it harder; solar and batteries refill it. Coins are pure
   score — no battery effect, since they're deliberately a bit riskier to
   detour for.
4. **The run ends** the moment either the 60-second clock or your battery
   hits zero, whichever comes first.
5. **Result screen** — distance, batteries collected, other energy collected,
   score, and a "beat my score" share.

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

The spawn mix starts collectible-heavy (roughly 62/38 in your favour) and
drifts toward hazards as the run goes on — early game is forgiving, the last
few seconds aren't.

### Scoring

Score is time-passive (+10/sec just for staying alive) plus whatever you
collect. A full, clean 60-second run — no early battery-out — covers roughly
2,800m from the speed steps alone (six 10-second tiers at 32, 38, 44, 50, 56
and 62 m/s-equivalent), typically more once distance-milestone speed bumps
compound on top.

## Architecture

```
index.html            structure + the exact ids game.js binds to
style.css              tokens, screens, lane/road math, animations
game.js                 game state, spawn/collision loop, screens, persistence
```

No React, no bundler — a single `requestAnimationFrame` loop drives
everything: elapsed time, distance, battery drain, item spawn/fall,
lane-based collision, and score. Items and lanes are positioned in
percentages of `#world`, so the whole game reflows for any phone screen
without special-casing sizes (a `max-width:380px` media query only tightens
a few font sizes).

Best distance persists in `localStorage` per device — there's no shared
leaderboard here (see "Known limits").

## Deploying

Not yet wired to Docker/Kubernetes — ask if you want the same
Dockerfile + Helm chart + GitHub Actions + ArgoCD setup used for
`sz-loadbreaker-game`, pointed at whatever hostname you want
(`battery-run.qa.stagezero.co.za`, say).

## Known limits of this build

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
