/**
 * 树形布局算法
 */
import { measureText } from "../utils/measure.js";
import { LSPEC, HGAP, VGAP } from "./constants.js";

export function sizeNode(n, l) {
  if (n._cachedTitle === n.title && n._cachedL === l) return;
  const sp = LSPEC[Math.min(l, LSPEC.length - 1)];
  const words = (n.title || " ").split(/\s+/); const lines = []; let cur = "";
  for (const word of words) {
    const test = cur ? cur + " " + word : word;
    if (measureText(test, sp.fs, sp.fw) <= sp.maxTW) { cur = test; }
    else {
      if (cur) lines.push(cur);
      if (measureText(word, sp.fs, sp.fw) > sp.maxTW) {
        let part = "";
        for (const ch of word) {
          const t2 = part + ch;
          if (measureText(t2, sp.fs, sp.fw) <= sp.maxTW) { part = t2; }
          else { if (part) lines.push(part); part = ch; }
        }
        cur = part;
      } else { cur = word; }
    }
  }
  if (cur) lines.push(cur); if (!lines.length) lines.push("");
  const maxLW = Math.max(...lines.map(ln => measureText(ln, sp.fs, sp.fw)));
  n._w = Math.max(sp.minW, maxLW + sp.hPad);
  n._h = Math.max(sp.minH, sp.vPad * 2 + lines.length * sp.lh);
  n._rx = sp.rxR === 0 ? n._h / 2 : sp.rxR;
  n._lines = lines; n._sp = sp; n._l = l;
  n._cachedTitle = n.title; n._cachedL = l;
}

export function measureAll(n, l = 0) {
  sizeNode(n, l); n.children.forEach(c => measureAll(c, l + 1));
}

export function calcHt(n) {
  if (n.collapsed || !n.children.length) return n._ht = n._h + VGAP;
  let tot = 0; for (const c of n.children) tot += calcHt(c);
  return n._ht = Math.max(tot, n._h + VGAP);
}

export function place(n, x, y, bi) {
  n._lx = x; n._ly = y - n._h / 2; n._bi = bi;
  if (n.collapsed || !n.children.length) return;
  let cy = y - n._ht / 2 + VGAP / 2;
  n.children.forEach((c, i) => {
    place(c, x + n._w + HGAP, cy + c._ht / 2, n._l === 0 ? i : bi);
    cy += c._ht;
  });
}

export function doLayout(root) {
  measureAll(root); calcHt(root); place(root, 24, 0, 0);
}

/** 实际渲染坐标（布局位置 + 用户偏移） */
export const rpx = n => n._lx + (n._dx || 0);
export const rpy = n => n._ly + (n._dy || 0);
