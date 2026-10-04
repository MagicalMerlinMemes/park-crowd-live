import baseline from "../../data/baseline.json";

const BASE = "https://api.themeparks.wiki/v1";
const DESTINATION_NAME = "Disneyland Resort";
const CLOSE_BUFFER_MINUTES = 60; // how long after closingTime before we flatline

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Where does `wait` sit relative to this ride's own typical range?
// Piecewise-linear interpolation across (min, p50, p90, max) -> (0, 50, 90, 100).
// This is the "busy" fix: the same 20-minute wait scores differently
// on a ride whose normal p90 is 15 minutes vs one whose normal p90 is 60.
function relativePercentile(wait, b) {
  const pts = [
    [b.baselineMin, 0],
    [b.baselineP50, 50],
    [b.baselineP90, 90],
    [b.baselineMax, 100],
  ];
  if (wait <= pts[0][0]) return 0;
  if (wait >= pts[3][0]) return 100;
  for (let i = 0; i < pts.length - 1; i++) {
    const [w0, p0] = pts[i];
    const [w1, p1] = pts[i + 1];
    if (wait >= w0 && wait <= w1) {
      if (w1 === w0) return p0;
      return p0 + ((wait - w0) / (w1 - w0)) * (p1 - p0);
    }
  }
  return 50;
}

function label(pct) {
  if (pct < 25) return "Quieter than usual";
  if (pct < 60) return "Normal";
  if (pct < 85) return "Busier than usual";
  return "Very busy for this ride";
}

// Today's opening/closing window for one park, in the park's own timezone.
// Combines every OPERATING or EXTRA_HOURS entry for today: earliest open,
// latest close, so early entry / extra magic hours don't get clipped.
async function getTodayWindow(parkId) {
  const schedule = await getJSON(`/entity/${parkId}/schedule`);
  const tz = schedule.timezone;
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  // en-CA formats as YYYY-MM-DD, matching the API's `date` field

  const todays = (schedule.schedule || []).filter(
    (e) => e.date === todayLocal && (e.type === "OPERATING" || e.type === "EXTRA_HOURS")
  );

  if (todays.length === 0) {
    return { isOpen: false, opensAt: null, closesAt: null };
  }

  const opensAt = todays.reduce(
    (min, e) => (new Date(e.openingTime) < min ? new Date(e.openingTime) : min),
    new Date(todays[0].openingTime)
  );
  const closesAt = todays.reduce(
    (max, e) => (new Date(e.closingTime) > max ? new Date(e.closingTime) : max),
    new Date(todays[0].closingTime)
  );

  const closesWithBuffer = new Date(closesAt.getTime() + CLOSE_BUFFER_MINUTES * 60 * 1000);
  const now = new Date();
  const isOpen = now >= opensAt && now <= closesWithBuffer;

  return { isOpen, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() };
}

export default async function handler(req, res) {
  try {
    const { destinations } = await getJSON("/destinations");
    const dlr = destinations.find((d) => d.name === DESTINATION_NAME);
    if (!dlr) {
      return res.status(502).json({ error: "Destination not found" });
    }

    const [liveByPark, windows] = await Promise.all([
      Promise.all(dlr.parks.map((p) => getJSON(`/entity/${p.id}/live`))),
      Promise.all(dlr.parks.map((p) => getTodayWindow(p.id))),
    ]);

    const parksStatus = dlr.parks.map((p, i) => ({
      parkId: p.id,
      parkName: p.name,
      ...windows[i],
    }));

    const isParkOpen = {};
    parksStatus.forEach((p) => (isParkOpen[p.parkName] = p.isOpen));

    const rides = [];
    for (const parkLive of liveByPark) {
      for (const entity of parkLive.liveData || []) {
        const b = baseline[entity.id];
        if (!b) continue; // no baseline yet - run build-baseline

        const parkOpen = isParkOpen[b.park] ?? true;

        if (!parkOpen) {
          // Past close + buffer: flatline instead of showing whatever the
          // live feed last reported, since that's stale, not current.
          rides.push({
            id: entity.id,
            name: b.name,
            land: b.land,
            park: b.park,
            lat: b.lat,
            lon: b.lon,
            status: "CLOSED",
            waitMinutes: 0,
            typicalP50: b.baselineP50,
            typicalP90: b.baselineP90,
            relativePercentile: 0,
            busyLabel: "Park closed",
          });
          continue;
        }

        const wait = entity.queue?.STANDBY?.waitTime;
        if (wait == null) continue;

        const pct = relativePercentile(wait, b);
        rides.push({
          id: entity.id,
          name: b.name,
          land: b.land,
          park: b.park,
          lat: b.lat,
          lon: b.lon,
          status: entity.status,
          waitMinutes: wait,
          typicalP50: b.baselineP50,
          typicalP90: b.baselineP90,
          relativePercentile: Math.round(pct),
          busyLabel: label(pct),
        });
      }
    }

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      parksStatus,
      rides,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
