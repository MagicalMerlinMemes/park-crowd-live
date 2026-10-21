import { useEffect, useRef, useState } from "react";
import { COLORS, NO_WAIT } from "./colors";


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

const DEFAULT_STYLE = { height: 620, width: "100%", borderRadius: 8, border: "1px solid #ddd" };

// Cooperative gestures: with `cooperative` on, a plain scroll wheel or a
// one-finger swipe scrolls the page, and the map only moves with
// Ctrl/Cmd + scroll or two fingers. Touch-primary devices get one-finger
// drag turned off, which leaves Leaflet's CSS at touch-action: pan-x pan-y,
// so the browser scrolls while Leaflet's touchZoom pans and zooms on two fingers.
export default function ParkMap({ rides, cooperative = false, style = DEFAULT_STYLE }) {
  const el = useRef(null);
  const [hint, setHint] = useState(null);
  const state = useRef({ L: null, map: null, layer: null });
  // Always holds the newest rides, so a map that finishes loading late
  // still draws current data instead of the empty first render.
  const ridesRef = useRef(rides);
  ridesRef.current = rides;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || state.current.map) return;

      const satellite = L.tileLayer(SATELLITE.url, SATELLITE);
      const streets = L.tileLayer(STREETS.url, STREETS);
      const touchPrimary = window.matchMedia("(pointer: coarse)").matches;
      const map = L.map(el.current, {
        center: [33.8087, -117.9190], // between the two parks
        zoom: 16,
        layers: [satellite],
        dragging: !(cooperative && touchPrimary),
      });
      if (cooperative) {
        state.current.unbind = bindCooperative(el.current, touchPrimary, setHint);
      }
      L.control.layers({ Satellite: satellite, Streets: streets }).addTo(map);

      state.current = { ...state.current, L, map, layer: L.layerGroup().addTo(map) };
      draw();
    })();
    return () => {
      cancelled = true;
      if (state.current.unbind) state.current.unbind();
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
    for (const r of ridesRef.current) {
      if (r.lat == null || r.lon == null) continue;
      const noWait = NO_WAIT.has(r.busyLabel) || r.waitMinutes == null;
      const marker = L.circleMarker([r.lat, r.lon], {
        radius: noWait ? 5 : 7 + Math.min(r.waitMinutes, 90) / 10,
        color: "#ffffff",
        weight: 1.5,
        fillColor: COLORS[r.busyLabel] || "#999",
        fillOpacity: noWait ? 0.75 : 0.9,
      });
      const typical =
        r.typicalLow != null ? ` (usual ${r.typicalLow}-${r.typicalHigh})` : "";
      marker.bindTooltip(
        noWait
          ? `<b>${r.name}</b><br>${r.land}<br>${r.busyLabel}`
          : `<b>${r.name}</b><br>${r.land}<br>${r.waitMinutes} min${typical}<br>${r.busyLabel}`
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

  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <div ref={el} style={{ position: "absolute", inset: 0, borderRadius: style.borderRadius }} />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1000,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          textAlign: "center",
          background: "rgba(0, 0, 0, 0.45)",
          color: "#fff",
          font: "600 16px system-ui, sans-serif",
          borderRadius: style.borderRadius,
          opacity: hint ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      >
        {hint}
      </div>
    </div>
  );
}

// Lets wheel and one-finger touch events fall through to the page, and
// flashes a hint explaining how to move the map. Returns an unbind function.
function bindCooperative(container, touchPrimary, setHint) {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const wheelHint = `Use ${isMac ? "⌘" : "Ctrl"} + scroll to zoom the map`;
  let timer = null;
  const flash = (text) => {
    setHint(text);
    clearTimeout(timer);
    timer = setTimeout(() => setHint(null), 1200);
  };

  // Capture phase on the container runs before Leaflet's own wheel listener
  // on the same element, so stopping propagation here keeps Leaflet from
  // zooming without calling preventDefault, which lets the page scroll.
  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      setHint(null);
      return;
    }
    e.stopPropagation();
    flash(wheelHint);
  };
  const onTouchMove = (e) => {
    if (!touchPrimary) return;
    if (e.touches.length === 1) flash("Use two fingers to move the map");
    else setHint(null);
  };

  container.addEventListener("wheel", onWheel, { capture: true, passive: true });
  container.addEventListener("touchmove", onTouchMove, { passive: true });
  return () => {
    clearTimeout(timer);
    container.removeEventListener("wheel", onWheel, { capture: true });
    container.removeEventListener("touchmove", onTouchMove);
  };
}
