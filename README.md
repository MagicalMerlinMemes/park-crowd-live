# Disneyland Resort: Live Crowd Flow

A live crowd map for Disneyland Park and Disney California Adventure. Each
ride's current wait is judged against that ride's own history, for the same
hour and day type, so "busy" means something different for a ride that is
normally empty than for one that is normally packed.

## How it works

Three data sources, each doing one job:

- **ThemeParks.wiki API** supplies live waits, ride status, and park hours.
- **Your Supabase table `wait_time_readings`** (filled by the Railway
  collector) supplies history. The view `ride_baselines` turns it into each
  ride's usual wait distribution by weekday/weekend and clock hour.
- **`data/rides.json`** holds ride names, lands, and map coordinates. Built
  from the API with 3 calls.

Files:

- `sql/ride_baselines.sql` builds the `ride_baselines` view. Run once in the
  Supabase SQL editor, then refresh weekly.
- `lib/baseline.js` reads that view and scores a live wait 0-100 against the
  ride's own distribution. It uses the most specific bucket with 30+
  readings: weekday/weekend at this hour, then any day at this hour, then
  all hours.
- `pages/api/live.js` is the serverless function the page calls. It also
  flatlines a park one hour after closing.
- `pages/index.js` and `components/ParkMap.js` draw the map and table.

Only attractions with status OPERATING and a posted standby wait, from
2024-07-24 forward (Lightning Lane Multi Pass era), count toward baselines.

## Setup

1. In Supabase, run `sql/ride_baselines.sql` in the SQL editor.
2. Create `.env.local` in this folder:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
```

Use the anon (public) key, not the service_role key. The view holds only
aggregated public wait times, so the anon key is enough, and no powerful key
ever lives in this project.

3. Build the ride list and run locally:

```
npm install
npm run build-rides
npm run dev
```

4. Deploy: add the same two variables in Vercel under Settings, Environment
   Variables, then push to GitHub. Vercel redeploys on every push.

## Keeping it fresh

- Baselines: `refresh materialized view concurrently public.ride_baselines;`
  weekly in the SQL editor, or schedule it with the optional pg_cron block at
  the bottom of the SQL file.
- Rides: re-run `npm run build-rides` and push when the park adds or renames
  a ride.
- Lands: `data/land-anchors.json` maps ride-name keywords to lands. Any ride
  without a keyword takes the land of its nearest matched ride. Add a keyword
  when a ride lands in the wrong land, then re-run `build-rides`.

## Troubleshooting

Open `/api/live` in the browser. `statsError` should be `null`. If it shows a
message, a Supabase variable is missing or wrong. `missingFromFeed` lists
rides in `rides.json` that the live API did not return.
