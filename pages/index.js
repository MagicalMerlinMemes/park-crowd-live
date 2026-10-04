import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ParkMap = dynamic(() => import("../components/ParkMap"), { ssr: false });

const POLL_MS = 3 * 60 * 1000; // 3 minutes - no reason to poll faster than the API refreshes

const COLORS = {
  "Quieter than usual": "#2ecc71",
  "Normal": "#f1c40f",
  "Busier than usual": "#e67e22",
  "Very busy for this ride": "#e74c3c",
  "Park closed": "#bbb",
};

function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [park, setPark] = useState("All parks");

  async function load() {
    try {
      const res = await fetch("/api/live");
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const rides = (data?.rides || []).filter(
    (r) => park === "All parks" || r.park === park
  );
  const parks = ["All parks", ...new Set((data?.rides || []).map((r) => r.park))];
  const parksStatus = data?.parksStatus || [];
  const closedParks = parksStatus.filter((p) => !p.isOpen);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "24px", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Disneyland Resort: Live Crowd Flow</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        {data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : "Loading…"}
        {error && <span style={{ color: "#e74c3c" }}> - {error}</span>}
      </p>

      {closedParks.length > 0 && (
        <div
          style={{
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 14,
            color: "#555",
          }}
        >
          {closedParks.map((p) => (
            <div key={p.parkId}>
              {p.parkName} is closed for the day.
              {p.opensAt && ` Reopens ${formatTime(p.opensAt)}.`}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        {parks.map((p) => (
          <button
            key={p}
            onClick={() => setPark(p)}
            style={{
              marginRight: 8,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: park === p ? "#333" : "#fff",
              color: park === p ? "#fff" : "#333",
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <ParkMap rides={rides} />

      <div style={{ marginTop: 16, display: "flex", gap: 16, fontSize: 14, flexWrap: "wrap" }}>
        {Object.entries(COLORS).map(([lbl, color]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: color, display: "inline-block" }} />
            {lbl}
          </div>
        ))}
      </div>

      <table style={{ width: "100%", marginTop: 32, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #333" }}>
            <th style={{ padding: 8 }}>Ride</th>
            <th style={{ padding: 8 }}>Land</th>
            <th style={{ padding: 8 }}>Wait</th>
            <th style={{ padding: 8 }}>Typical</th>
            <th style={{ padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rides
            .sort((a, b) => b.relativePercentile - a.relativePercentile)
            .map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{r.name}</td>
                <td style={{ padding: 8 }}>{r.land}</td>
                <td style={{ padding: 8 }}>{r.busyLabel === "Park closed" ? "-" : `${r.waitMinutes} min`}</td>
                <td style={{ padding: 8 }}>
                  {r.busyLabel === "Park closed" ? "-" : `${r.typicalP50}–${r.typicalP90} min`}
                </td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: COLORS[r.busyLabel] }}>{r.busyLabel}</span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
