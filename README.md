# Disneyland Resort: Live Crowd Flow

A live crowd map for Disneyland Park and Disney California Adventure,
built on the free ThemeParks.wiki API. Scores every ride's current wait
against that ride's own historical typical range, not a fixed minute
threshold, so "busy" means something different for a ride that's
normally empty vs. one that's normally packed.

## How it works

- `scripts/build-baseline.mjs` - a one-time (or periodic) job that pulls
  each ride's daily wait statistics for the past 7–30 days from
  `/v1/entity/{id}/history/daily` and writes `data/baseline.json`: each
  ride's typical min / p50 / p90 / max wait.
- `pages/api/live.js` - a serverless function that pulls CURRENT wait
  times from `/v1/entity/{id}/live`, compares each to that ride's
  baseline, and returns a 0–100 "relative percentile" plus a plain-
  language label (Quieter than usual / Normal / Busier than usual /
  Very busy for this ride).
- `pages/index.js` - the page people actually see: a live-updating map
  (polls the API route every 3 minutes) and a sortable table.

## Local setup

```bash
npm install
npm run build-baseline   # writes data/baseline.json from live API history
npm run dev               # http://localhost:3000
```

Anonymous API calls get a 7-day history window, which is enough to
start. For a sturdier 30-day baseline, get a free key at
https://api.themeparks.wiki and run:

```bash
THEMEPARKS_API_KEY=your_key_here npm run build-baseline
```

Re-run `build-baseline` periodically (weekly is plenty - wait patterns
don't shift day to day) to keep the baseline current. A GitHub Action
on a cron schedule that runs the script and commits the updated
`data/baseline.json` is the easiest way to automate this.

## Deploying to Vercel

1. Push this folder to a GitHub repo.
2. Go to vercel.com → **Add New Project** → import that repo.
3. Vercel detects Next.js automatically. No config needed. Click Deploy.
4. You get a live URL like `park-crowd-live.vercel.app` immediately,
   and can attach a custom domain later from the project settings.

Every push to the repo's main branch redeploys automatically.

## Extending it

- Lands come from `data/land-anchors.json` (keyword -> land) plus
  nearest-anchor assignment by coordinates, so renamed or new rides
  still land in the right area. Add keywords for any ride that lands
  in the wrong land. Re-run `build-baseline` after editing.
- The map uses Leaflet with Esri satellite and CARTO street tiles.
  Check provider terms before a public launch and consider a keyed
  provider (MapTiler, Mapbox) if traffic grows.
- Add a second destination (Walt Disney World, Universal, etc.) by
  changing `DESTINATION_NAME` and re-running `build-baseline`.
