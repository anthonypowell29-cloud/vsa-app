// styles/studioTheme.css.ts
import { createGlobalTheme, style } from "@vanilla-extract/css";

export const vars = createGlobalTheme(":root", {
  color: {
    bg: "#0b0f14",
    panel: "#111827",
    panelAlt: "#0f172a",
    text: "#e5e7eb",
    textDim: "#9ca3af",
    border: "#1f2937",
    accent: "#22c55e",
    chapter: "#1f3a8a",
    chapterHi: "#2563eb",
    speaker: "#334155",
    speakerHi: "#3b82f6",
    danger: "#ef4444",
  }
});

export const button = style({
  background: vars.color.panelAlt,
  border: `1px solid ${vars.color.border}`,
  color: vars.color.text,
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 13,
  selectors: { "&:hover": { borderColor: vars.color.textDim } }
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
});

export const top = style({
  display: "flex",
  flex: "none", // video + speakers don’t stretch vertically
  minHeight: "200px",
});

export const bottom = style({
  flex: "none",  // ⬅️ prevents timeline from stretching
  overflowX: "auto",
  overflowY: "hidden",
  background: "#1e1e1e",
  borderTop: "1px solid #333",
});