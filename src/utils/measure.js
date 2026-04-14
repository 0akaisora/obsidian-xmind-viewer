/**
 * SVG 文字测量单例
 */
import { NS } from "./svg.js";

let _msv = null;

export function getMeasurer() {
  if (!_msv || !document.body.contains(_msv)) {
    _msv = document.createElementNS(NS, "svg");
    _msv.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:visible;width:1px;height:1px;";
    document.body.appendChild(_msv);
  }
  return _msv;
}

export function measureText(str, fs, fw) {
  if (!str) return 0;
  const t = document.createElementNS(NS, "text");
  t.setAttribute("font-size", fs);
  t.setAttribute("font-family", "system-ui,-apple-system,sans-serif");
  if (fw) t.setAttribute("font-weight", fw);
  t.textContent = str; getMeasurer().appendChild(t);
  const w = t.getComputedTextLength(); t.remove(); return w;
}

export function cleanupMeasurer() {
  if (_msv && document.body.contains(_msv)) _msv.remove();
  _msv = null;
}
