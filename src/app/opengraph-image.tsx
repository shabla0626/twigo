import { ImageResponse } from "next/og";
import { brand } from "@/config/brand";

// Generated social sharing image (no photos, no external assets).
export const alt = "Remote collaborative organization";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const b = brand();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg, #e6f7f8 0%, #ffffff 55%, #e0f2fe 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "linear-gradient(135deg, #4cc3cf, #0f7f8e)", display: "flex" }} />
          <div style={{ fontSize: 44, fontWeight: 700, color: "#0f172a" }}>{b.name}</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 700, color: "#0f172a", lineHeight: 1.1, maxWidth: 1000 }}>{b.tagline}</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#334155", maxWidth: 980 }}>Fully remote. Members propose ideas and research them together. No fees. No guaranteed income.</div>
      </div>
    ),
    size,
  );
}
