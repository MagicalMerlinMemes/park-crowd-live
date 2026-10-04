// Assigns each attraction to a land.
// Step 1: keyword match on a normalized name (curly quotes, case and
//         punctuation differences no longer break the join).
// Step 2: anything unmatched takes the land of the nearest matched
//         attraction in the same park, using the API's own lat/lon.
import fs from "node:fs";

const anchors = JSON.parse(
  fs.readFileSync(new URL("../data/land-anchors.json", import.meta.url), "utf8")
);

export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

export function assignLands(rides) {
  // rides: [{ id, name, lat, lon }] for ONE park
  const out = rides.map((r) => {
    const n = normalize(r.name);
    const hit = anchors.find(([kw]) => n.includes(kw));
    return { ...r, land: hit ? hit[1] : null, anchored: Boolean(hit) };
  });
  const anchored = out.filter((r) => r.anchored && r.lat != null);
  for (const r of out) {
    if (r.land || r.lat == null || anchored.length === 0) continue;
    let best = null;
    let bestD = Infinity;
    for (const a of anchored) {
      const d = (a.lat - r.lat) ** 2 + (a.lon - r.lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    r.land = best.land;
  }
  return out.map((r) => ({ ...r, land: r.land || "Unmapped" }));
}
