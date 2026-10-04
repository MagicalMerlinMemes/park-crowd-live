// Builds data/baseline.json - one row per ride with its typical wait
// range, pulled from ThemeParks.wiki's /history/daily endpoint.
//
// Run this locally or on a schedule (GitHub Action, Vercel Cron) to
// refresh the baseline. It is NOT run on every page load - it's a
// slow, occasional job that produces a small static file the live
// API route reads instantly.
//
// Usage:
//   node scripts/build-baseline.mjs
//
// Optional: set THEMEPARKS_API_KEY to get a 30-day history window
// instead of the 7-day anonymous window. Free keys are issued at
// https://api.themeparks.wiki

import fs from "node:fs/promises";
import { assignLands } from "./lands.mjs";

const BASE = "https://api.themeparks.wiki/v1";
const API_KEY = process.env.THEMEPARKS_API_KEY || null;
const DAYS_BACK = API_KEY ? 30 : 7;

async function getJSON(path) {
  const headers = API_KEY ? { "X-API-Key": API_KEY } : {};
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { destinations } = await getJSON("/destinations");
  const dlr = destinations.find((d) => d.name === "Disneyland Resort");
  if (!dlr) throw new Error("Disneyland Resort not found in /destinations");

  const from = dateNDaysAgo(DAYS_BACK);
  const to = dateNDaysAgo(0);

  const baseline = {};

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

    for (const ride of attractions) {
      let daily;
      try {
        daily = await getJSON(
          `/entity/${ride.id}/history/daily?from=${from}&to=${to}`
        );
      } catch (err) {
        console.warn(`Skipping ${ride.name}: ${err.message}`);
        continue;
      }

      const days = (daily.days || []).filter((d) => d.standby);
      if (days.length === 0) continue; // ride never posts a standby wait

      const p50s = days.map((d) => d.standby.p50);
      const p90s = days.map((d) => d.standby.p90);
      const maxes = days.map((d) => d.standby.max);
      const mins = days.map((d) => d.standby.min);

      const median = (arr) => {
        const s = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      };

      baseline[ride.id] = {
        name: ride.name,
        park: park.name,
        land: ride.land,
        lat: ride.lat,
        lon: ride.lon,
        baselineMin: Math.min(...mins),
        baselineP50: median(p50s),
        baselineP90: median(p90s),
        baselineMax: Math.max(...maxes),
        daysSampled: days.length,
      };

      console.log(`✓ ${ride.name} (${days.length} days)`);
    }
  }

  await fs.writeFile(
    new URL("../data/baseline.json", import.meta.url),
    JSON.stringify(baseline, null, 2)
  );
  console.log(`\nWrote baseline for ${Object.keys(baseline).length} rides.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
