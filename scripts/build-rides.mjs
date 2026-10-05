// Builds data/rides.json: every attraction's name, park, land, and map
// location. This is the only thing the site needs from the API ahead of
// time. Wait statistics come from your own Supabase table instead.
//
// Makes about 3 API calls. Re-run when the park adds or renames a ride.
//
// Usage:  npm run build-rides

import fs from "node:fs/promises";
import { assignLands } from "./lands.mjs";

const BASE = "https://api.themeparks.wiki/v1";
const API_KEY = process.env.THEMEPARKS_API_KEY || null;

async function getJSON(path) {
  const headers = API_KEY ? { "X-API-Key": API_KEY } : {};
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers });
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(ra) && ra >= 0 ? ra * 1000 : 2000 * 2 ** attempt;
      console.log(`rate limited, waiting ${Math.round(wait / 1000)}s...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }
  throw new Error(`${path} -> gave up after retries`);
}

async function main() {
  const { destinations } = await getJSON("/destinations");
  const dlr = destinations.find((d) => d.name === "Disneyland Resort");
  if (!dlr) throw new Error("Disneyland Resort not found in /destinations");

  const rides = {};
  for (const park of dlr.parks) {
    const { children } = await getJSON(`/entity/${park.id}/children`);
    const attractions = assignLands(
      children
        .filter((c) => c.entityType === "ATTRACTION")
        .map((c) => ({
          id: c.id,
          name: c.name,
          lat: c.location?.latitude ?? null,
          lon: c.location?.longitude ?? null,
        }))
    );
    for (const a of attractions) {
      rides[a.id] = { name: a.name, park: park.name, land: a.land, lat: a.lat, lon: a.lon };
    }
    console.log(`${park.name}: ${attractions.length} attractions`);
  }

  await fs.writeFile(
    new URL("../data/rides.json", import.meta.url),
    JSON.stringify(rides, null, 2)
  );
  console.log(`\nWrote ${Object.keys(rides).length} rides to data/rides.json`);
  const unmapped = Object.values(rides).filter((r) => r.land === "Unmapped");
  if (unmapped.length) console.log(`${unmapped.length} rides have no land (no coordinates).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
