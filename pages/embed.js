import Head from "next/head";
import dynamic from "next/dynamic";

import useLiveData from "../lib/useLiveData";

const ParkMap = dynamic(() => import("../components/ParkMap"), { ssr: false });

// Bare map for iframing on partner sites: no chrome, fills the viewport,
// transparent background. Polls the same live feed as the home page.
export default function Embed() {
  const { data } = useLiveData();

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style jsx global>{`
        html,
        body,
        #__next {
          margin: 0;
          padding: 0;
          height: 100%;
          background: transparent;
          overflow: hidden;
        }
        .leaflet-container {
          background: transparent;
        }
      `}</style>

      <ParkMap
        rides={data?.rides || []}
        cooperative
        style={{ position: "relative", width: "100%", height: "100%" }}
      />

      <a
        href="https://www.parkcrowdlive.com/"
        target="_blank"
        rel="noopener"
        style={{
          position: "fixed",
          left: 8,
          bottom: 8,
          zIndex: 1001,
          padding: "3px 8px",
          borderRadius: 4,
          background: "rgba(255, 255, 255, 0.85)",
          color: "#333",
          font: "600 12px system-ui, sans-serif",
          textDecoration: "none",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
        }}
      >
        Park Crowd Live
      </a>
    </>
  );
}
