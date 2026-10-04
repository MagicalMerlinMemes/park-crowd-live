import { useEffect, useRef } from "react";

const COLORS = {
  "Quieter than usual": "#2ecc71",
  "Normal": "#f1c40f",
  "Busier than usual": "#e67e22",
  "Very busy for this ride": "#e74c3c",
  "Park closed": "#9aa0a6",
};

// Tile providers. Check each provider's terms before a public launch;
// swap in a keyed provider (MapTiler, Mapbox) if traffic grows.
const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri",
  maxZoom: 19,
};
const STREETS = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  maxZoom: 20,
};

export default function ParkMap({ rides }) {
  const el = useRef(null);
  const state = useRef({ L: null, map: null, layer: null });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || state.current.map) return;

      const satellite = L.tileLayer(SATELLITE.url, SATELLITE);
      const streets = L.tileLayer(STREETS.url, STREETS);
      const map = L.map(el.current, {
        center: [33.8087, -117.9190], // between the two parks
        zoom: 16,
        layers: [satellite],
      });
      L.control.layers({ Satellite: satellite, Streets: streets }).addTo(map);

      state.current = { L, map, layer: L.layerGroup().addTo(map) };
      draw();
    })();
    return () => {
      cancelled = true;
      if (state.current.map) {
        state.current.map.remove();
        state.current = { L: null, map: null, layer: null };
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const { L, map, layer } = state.current;
    if (!L || !map) return;
    layer.clearLayers();
    const pts = [];
    for (const r of rides) {
      if (r.lat == null || r.lon == null) continue;
      const closed = r.busyLabel === "Park closed";
      const marker = L.circleMarker([r.lat, r.lon], {
        radius: closed ? 5 : 7 + Math.min(r.waitMinutes, 90) / 10,
        color: "#ffffff",
        weight: 1.5,
        fillColor: COLORS[r.busyLabel] || "#999",
        fillOpacity: closed ? 0.6 : 0.9,
      });
      marker.bindTooltip(
        closed
          ? `${r.name}<br>Park closed`
          : `<b>${r.name}</b><br>${r.land}<br>${r.waitMinutes} min (typical ${r.typicalP50}-${r.typicalP90})<br>${r.busyLabel}`
      );
      marker.addTo(layer);
      pts.push([r.lat, r.lon]);
    }
    if (pts.length && !state.current.fitted) {
      map.fitBounds(pts, { padding: [30, 30] });
      state.current.fitted = true;
    }
  }

  // Redraw whenever data or the park filter changes.
  useEffect(draw, [rides]);

  return <div ref={el} style={{ height: 620, width: "100%", borderRadius: 8, border: "1px solid #ddd" }} />;
}
