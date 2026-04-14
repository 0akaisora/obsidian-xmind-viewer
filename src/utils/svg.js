/**
 * SVG 命名空间 & 辅助函数
 */
export const NS = "http://www.w3.org/2000/svg";

export function se(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
