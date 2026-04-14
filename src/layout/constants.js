/**
 * 布局规格 & 配色板
 */

// 节点规格：每层级的尺寸 / 字体参数
export const LSPEC = [
  { maxTW: 220, hPad: 36, vPad: 14, minW: 120, minH: 50, rxR: 0, fs: 15, fw: "700", lh: 22 }, // 根
  { maxTW: 200, hPad: 30, vPad: 10, minW: 96, minH: 38, rxR: 0, fs: 13, fw: "600", lh: 19 },  // L1
  { maxTW: 180, hPad: 26, vPad: 9, minW: 78, minH: 30, rxR: 10, fs: 12, fw: "400", lh: 17 },  // L2
  { maxTW: 160, hPad: 22, vPad: 7, minW: 64, minH: 26, rxR: 8, fs: 11, fw: "400", lh: 15 },   // L3+
];

export const HGAP = 58;
export const VGAP = 14;

// 现代色板
export const PAL = [
  { main: "#6366F1", soft: "#EEF2FF", muted: "#C7D2FE", dark: "#4338CA" }, // Indigo
  { main: "#0EA5E9", soft: "#F0F9FF", muted: "#BAE6FD", dark: "#0369A1" }, // Sky
  { main: "#10B981", soft: "#ECFDF5", muted: "#A7F3D0", dark: "#065F46" }, // Emerald
  { main: "#F59E0B", soft: "#FFFBEB", muted: "#FDE68A", dark: "#92400E" }, // Amber
  { main: "#EF4444", soft: "#FEF2F2", muted: "#FECACA", dark: "#991B1B" }, // Red
  { main: "#8B5CF6", soft: "#F5F3FF", muted: "#DDD6FE", dark: "#5B21B6" }, // Violet
  { main: "#EC4899", soft: "#FDF2F8", muted: "#FBCFE8", dark: "#9D174D" }, // Pink
  { main: "#14B8A6", soft: "#F0FDFA", muted: "#99F6E4", dark: "#134E4A" }, // Teal
];
