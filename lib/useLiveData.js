import { useEffect, useState } from "react";

const POLL_MS = 3 * 60 * 1000; // 3 minutes - no reason to poll faster than the API refreshes

// Fetches /api/live on mount and every POLL_MS after that.
export default function useLiveData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
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
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return { data, error };
}
