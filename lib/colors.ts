// Mirrors tailwind.config.js. Needed wherever a colour has to be a real value
// rather than a class: navigator options, SVG props, and inline `style` props.
// Keep this in sync with the `colors` block in tailwind.config.js — prefer
// adding a key here over inlining a fresh hex at the call site.
export const themeColors = {
  background: "#18181B", // bg
  surface: "#27272A", // surface
  surface2: "#3F3F46", // surface-2
  border: "#2A2A2E", // border
  text: "#F4F4F5", // text
  textMuted: "#9CA3AF", // text-muted
  // 4.7:1 on surface, 5.6:1 on bg: WCAG AA for normal text.
  textDim: "#8A919E", // text-dim
  danger: "#EF4444", // danger
};
