// Renders the favicon and Apple touch icon into public/ with next/og.
// This project uses the Pages Router, so app/icon.tsx conventions don't
// apply; the PNGs are static files linked from pages/_document.js.
// Run with `npm run build-icons` after changing the design.
import { writeFile, mkdir } from "fs/promises";
import { createElement as h } from "react";
import { ImageResponse } from "next/og.js";

const NAVY = "#1B2A4A";
const GOLD = "#F5B83D";

// Drawn on a 32-unit grid and scaled up for larger sizes.
function Icon({ size, radius }) {
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: NAVY,
        borderRadius: radius,
      },
    },
    h(
      "svg",
      { width: size, height: size, viewBox: "0 0 32 32" },
      h("path", {
        d: "M16 28.5C16 28.5 7 20 7 13a9 9 0 0 1 18 0c0 7-9 15.5-9 15.5Z",
        fill: GOLD,
      }),
      h("circle", { cx: 16, cy: 13, r: 3.4, fill: "#FFFFFF" })
    )
  );
}

const OUTPUTS = [
  { file: "public/icon.png", size: 32, radius: 7 },
  // iOS applies its own corner mask, so the Apple icon is a full square.
  { file: "public/apple-icon.png", size: 180, radius: 0 },
];

await mkdir("public", { recursive: true });
for (const { file, size, radius } of OUTPUTS) {
  const res = new ImageResponse(Icon({ size, radius }), { width: size, height: size });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`wrote ${file} (${size}x${size})`);
}
