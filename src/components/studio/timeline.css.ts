// components/studio/timeline.css.ts
import { style } from "@vanilla-extract/css";
import { vars } from "@/styles/studioTheme.css";

export const overlay = style({
  position: "fixed", inset: 0, zIndex: 1000,
  background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center"
});

export const modal = style({
  width: "92vw", height: "88vh", borderRadius: 14,
  background: vars.color.bg, color: vars.color.text,
  display: "flex", flexDirection: "column", overflow: "hidden",
  border: `1px solid ${vars.color.border}`,
  boxShadow: "0 20px 80px rgba(0,0,0,0.5)"
});

export const header = style({
  height: 56, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "0 14px", borderBottom: `1px solid ${vars.color.border}`,
  gap: 8
});

export const top = style({
  flex: "0 0 46%", minHeight: 220,
  display: "grid", gridTemplateColumns: "minmax(240px, 32%) 1fr",
  borderBottom: `1px solid ${vars.color.border}`, overflow: "hidden"
});

export const leftPane = style({
  background: vars.color.panel, overflow: "auto"
});

export const leftPaneHeader = style({
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 12px", borderBottom: `1px solid ${vars.color.border}`,
  color: vars.color.textDim, fontSize: 12
});

export const speakerItem = style({
  padding: "8px 12px", borderBottom: `1px solid ${vars.color.border}`,
  selectors: { "&:hover": { background: vars.color.panelAlt } }
});

export const rightPane = style({
  background: "#000", display: "flex", alignItems: "center", justifyContent: "center"
});

export const bottom = style({
  flex: "1 1 0", display: "flex", flexDirection: "column", minHeight: 200
});

export const controls = style({
  height: 42, display: "flex", alignItems: "center", gap: 10,
  padding: "0 12px", borderBottom: `1px solid ${vars.color.border}`,
  background: vars.color.panel
});

export const ruler = style({
  position: "relative", height: 28, background: vars.color.panelAlt,
  borderBottom: `1px solid ${vars.color.border}`, flexShrink: 0
});

export const scrollArea = style({
  flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative",
  background: vars.color.panel
});

export const content = style({
  position: "relative", height: "100%", display: "inline-block"
});

export const track = style({
  position: "relative", height: 70, borderBottom: `1px solid ${vars.color.border}`
});

export const segment = style({
  position: "absolute", top: 10, height: 50, borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 12, cursor: "grab", userSelect: "none",
  transition: "transform 80ms linear"
});

export const segChapter = style({
  background: vars.color.chapter, outline: `1px solid ${vars.color.border}`
});
export const segSpeaker = style({
  background: vars.color.speaker, outline: `1px solid ${vars.color.border}`
});
export const active = style({ outline: `2px solid ${vars.color.accent}` });

export const handle = style({
  position: "absolute", top: 0, bottom: 0, width: 7,
  background: "rgba(255,255,255,0.08)", cursor: "ew-resize",
  selectors: { "&:hover": { background: "rgba(255,255,255,0.18)" } }
});
export const handleL = style([handle, { left: 0, borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }]);
export const handleR = style([handle, { right: 0, borderTopRightRadius: 8, borderBottomRightRadius: 8 }]);

export const playhead = style({
  position: "absolute", top: 0, bottom: 0, width: 2, background: vars.color.accent, pointerEvents: "none"
});

export const tick = style({ position: "absolute", bottom: 0, height: "100%", borderLeft: `1px solid ${vars.color.border}`, color: vars.color.textDim, fontSize: 10, paddingLeft: 4, display: "flex", alignItems: "flex-end" });

export const rulerWrapper = style({
  overflow: "hidden",
  borderBottom: "1px solid #333",
  height: "30px",
  position: "relative",
});