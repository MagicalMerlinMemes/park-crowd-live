-- ride_baselines: each ride's normal standby-wait distribution, built from
-- your own wait_time_readings table.
--
-- One row per ride per bucket. Three bucket levels per ride:
--   (day_type, hr)  weekday or weekend, for one clock hour   most specific
--   ('all',   hr)   any day, for one clock hour
--   ('all',   -1)   any day, any hour                         fallback
-- The site uses the most specific bucket with at least 30 readings.
--
-- Rules baked in:
--   - ATTRACTION rows with status OPERATING and a posted standby wait only
--   - Data from 2024-07-24 forward (Lightning Lane Multi Pass era)
--   - Clock hour and weekday/weekend use Disneyland time (America/Los_Angeles)
--
-- Run once in the Supabase SQL editor. Refresh with:
--   refresh materialized view concurrently public.ride_baselines;

-- Your table is large, so the first build can take a few minutes.
-- This keeps the SQL editor from timing out.
set statement_timeout = '15min';

drop materialized view if exists public.ride_baselines;

create materialized view public.ride_baselines as
with base as (
  select
    attraction_id,
    wait_standby::float8 as w,
    extract(hour from (captured_at at time zone 'America/Los_Angeles'))::int as hr,
    case
      when extract(isodow from (captured_at at time zone 'America/Los_Angeles')) in (6, 7)
      then 'weekend' else 'weekday'
    end as day_type
  from public.wait_time_readings
  where entity_type = 'ATTRACTION'
    and status = 'OPERATING'
    and wait_standby is not null
    and captured_at >= timestamptz '2024-07-24 00:00:00-07'
),
agg as (
  select attraction_id, day_type, hr, w from base
  union all
  select attraction_id, 'all' as day_type, hr, w from base
  union all
  select attraction_id, 'all' as day_type, -1 as hr, w from base
)
select
  attraction_id,
  day_type,
  hr,
  count(*)                                              as n,
  min(w)                                                as q00,
  percentile_cont(0.05) within group (order by w)       as q05,
  percentile_cont(0.25) within group (order by w)       as q25,
  percentile_cont(0.50) within group (order by w)       as q50,
  percentile_cont(0.75) within group (order by w)       as q75,
  percentile_cont(0.90) within group (order by w)       as q90,
  percentile_cont(0.99) within group (order by w)       as q99
from agg
group by attraction_id, day_type, hr;

create unique index ride_baselines_key
  on public.ride_baselines (attraction_id, day_type, hr);

-- This view holds only aggregated public wait times, so it is safe to let
-- the site read it with the public anon key. That way no powerful
-- service_role key ever lives in the Vercel project.
grant select on public.ride_baselines to anon, authenticated, service_role;

-- OPTIONAL: refresh automatically every Monday at 4 AM Pacific.
-- Requires the pg_cron extension (Database > Extensions in Supabase).
-- select cron.schedule(
--   'refresh-ride-baselines',
--   '0 11 * * 1',
--   'refresh materialized view concurrently public.ride_baselines'
-- );
