import rides from "../../data/rides.json";
import {
  nowBucket,
  loadStats,
  pickStats,
  percentileRank,
  label,
} from "../../lib/baseline";

const BASE = "https://api.themeparks.wiki/v1";
const DESTINATION_NAME = "Disneyland Resort";
const CLOSE_BUFFER_MINUTES = 60; // how long after closingTime before we flatline

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Today's opening/closing window for one park, in the park's own timezone.
// Combines every OPERATING or EXTRA_HOURS entry for today: earliest open,
// latest close, so early entry / extra magic hours don't get clipped.
async function getTodayWindow(parkId) {
  const schedule = await getJSON(`/entity/${parkId}/schedule`);
  const tz = schedule.timezone;
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

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

// Every ride gets a state. Nothing is dropped.
function describeRide(entity, picked) {
  const status = entity.status || "UNKNOWN";
  const wait = entity.queue?.STANDBY?.waitTime ?? null;

  if (status === "DOWN") return { wait: null, pct: null, busyLabel: "Down" };
  if (status === "CLOSED") return { wait: null, pct: null, busyLabel: "Closed" };
  if (status === "REFURBISHMENT")
    return { wait: null, pct: null, busyLabel: "Refurbishment" };
  if (wait == null) return { wait: null, pct: null, busyLabel: "No posted wait" };
  if (!picked) return { wait, pct: null, busyLabel: "Not enough history" };

  const pct = percentileRank(wait, picked.s);
  return { wait, pct: Math.round(pct), busyLabel: label(pct) };
}

export default async function handler(req, res) {
  try {
    const { destinations } = await getJSON("/destinations");
    const dlr = destinations.find((d) => d.name === DESTINATION_NAME);
    if (!dlr) {
      return res.status(502).json({ error: "Destination not found" });
    }

    const { hour, dayType } = nowBucket();

    const [liveByPark, windows, stats] = await Promise.all([
      Promise.all(dlr.parks.map((p) => getJSON(`/entity/${p.id}/live`))),
      Promise.all(dlr.parks.map((p) => getTodayWindow(p.id))),
      loadStats(dayType, hour),
    ]);

    const parksStatus = dlr.parks.map((p, i) => ({
      parkId: p.id,
      parkName: p.name,
      ...windows[i],
    }));

    const isParkOpen = {};
    parksStatus.forEach((p) => (isParkOpen[p.parkName] = p.isOpen));

    const out = [];
    const seen = new Set();
    for (const parkLive of liveByPark) {
      for (const entity of parkLive.liveData || []) {
        const meta = rides[entity.id];
        if (!meta) continue; // not an attraction, or added after the last build-rides
        seen.add(entity.id);

        const picked = pickStats(stats.byRide.get(entity.id), dayType, hour);
        const base = {
          id: entity.id,
          name: meta.name,
          land: meta.land,
          park: meta.park,
          lat: meta.lat,
          lon: meta.lon,
          typicalLow: picked ? Math.round(picked.s.q25) : null,
          typicalHigh: picked ? Math.round(picked.s.q75) : null,
          baselineLevel: picked ? picked.level : null,
          baselineN: picked ? picked.s.n : null,
        };

        if (!(isParkOpen[meta.park] ?? true)) {
          // Past close + buffer: flatline instead of showing stale live data.
          out.push({
            ...base,
            status: "CLOSED",
            waitMinutes: 0,
            relativePercentile: 0,
            busyLabel: "Park closed",
          });
          continue;
        }

        const d = describeRide(entity, picked);
        out.push({
          ...base,
          status: entity.status || "UNKNOWN",
          waitMinutes: d.wait,
          relativePercentile: d.pct ?? -1,
          busyLabel: d.busyLabel,
        });
      }
    }

    const missingFromFeed = Object.entries(rides)
      .filter(([id]) => !seen.has(id))
      .map(([, m]) => m.name);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      bucket: { dayType, hour },
      statsError: stats.error || null,
      parksStatus,
      rides: out,
      missingFromFeed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
