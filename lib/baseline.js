// Reads each ride's normal wait distribution from the Supabase view
// public.ride_baselines (built by sql/ride_baselines.sql) and scores a
// live wait against it.

const MIN_N = 30; // minimum readings before a bucket is trusted
const TTL_MS = 30 * 60 * 1000;
const TZ = "America/Los_Angeles"; // must match the SQL

const cache = new Map(); // key "weekday:13" -> { at, byRide }

export function nowBucket(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const wd = parts.find((p) => p.type === "weekday").value;
  const dayType = wd === "Sat" || wd === "Sun" ? "weekend" : "weekday";
  return { hour, dayType };
}

// Returns Map: attraction_id -> rows[] for the current bucket and fallbacks.
export async function loadStats(dayType, hour) {
  const key = `${dayType}:${hour}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { byRide: new Map(), error: "SUPABASE_URL or SUPABASE_ANON_KEY not set" };
  }

  try {
    const q =
      `${url}/rest/v1/ride_baselines` +
      `?select=attraction_id,day_type,hr,n,q00,q05,q25,q50,q75,q90,q99` +
      `&hr=in.(${hour},-1)&day_type=in.(${dayType},all)&n=gte.${MIN_N}&limit=1000`;
    const res = await fetch(q, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    const byRide = new Map();
    for (const r of rows) {
      if (!byRide.has(r.attraction_id)) byRide.set(r.attraction_id, []);
      byRide.get(r.attraction_id).push(r);
    }
    const entry = { at: Date.now(), byRide, error: null };
    cache.set(key, entry);
    return entry;
  } catch (err) {
    if (hit) return hit; // serve stale rather than nothing
    return { byRide: new Map(), error: err.message };
  }
}

// Most specific bucket first: (dayType, hour), then (all, hour), then (all, -1).
export function pickStats(rows, dayType, hour) {
  if (!rows) return null;
  const find = (dt, hr) => rows.find((r) => r.day_type === dt && r.hr === hr);
  const a = find(dayType, hour);
  if (a) return { s: a, level: `${dayType} at this hour` };
  const b = find("all", hour);
  if (b) return { s: b, level: "any day at this hour" };
  const c = find("all", -1);
  if (c) return { s: c, level: "all hours" };
  return null;
}

// Where does `wait` rank in this ride's own distribution? Returns 0-100.
// Posted waits come in 5-minute steps, so quantiles tie often. A wait that
// matches tied quantiles gets the average of their percentiles.
export function percentileRank(wait, s) {
  const pts = [
    [s.q00, 0],
    [s.q05, 5],
    [s.q25, 25],
    [s.q50, 50],
    [s.q75, 75],
    [s.q90, 90],
    [s.q99, 99],
  ];
  const tied = pts.filter(([w]) => w === wait);
  if (tied.length) return tied.reduce((sum, [, p]) => sum + p, 0) / tied.length;
  if (wait < pts[0][0]) return 0;
  if (wait > pts[pts.length - 1][0]) return 100;
  for (let i = 0; i < pts.length - 1; i++) {
    const [w0, p0] = pts[i];
    const [w1, p1] = pts[i + 1];
    if (wait > w0 && wait < w1) return p0 + ((wait - w0) / (w1 - w0)) * (p1 - p0);
  }
  return 50;
}

// Labels match the "Usual range" shown on the page (25th to 75th percentile).
// A wait inside that range is Normal. Above it is Busier. Above the 90th
// percentile is Very busy.
export function label(pct) {
  if (pct < 25) return "Quieter than usual";
  if (pct <= 75) return "Normal";
  if (pct < 90) return "Busier than usual";
  return "Very busy for this ride";
}
