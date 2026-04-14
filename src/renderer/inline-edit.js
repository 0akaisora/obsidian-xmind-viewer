/**
 * 内联编辑框 — 双击 / F2 进入
 */
import { PAL } from "../layout/constants.js";
import { rpx, rpy } from "../layout/layout.js";

export function inlineEdit(wrap, n, svg, g, renderer, editor) {
  const pt = svg.createSVGPoint(), ctm = g.getScreenCTM(), cr = wrap.getBoundingClientRect();
  if (!ctm) return;
  pt.x = rpx(n); pt.y = rpy(n);
  const sp = pt.matrixTransform(ctm), sx = ctm.a, sy = ctm.d;
  const pal = PAL[n._bi % PAL.length];
  const isBright = n._l <= 1;

  const inp = document.createElement("textarea");
  inp.value = n.title;
  inp.style.cssText = `
    position:absolute;
    left:${sp.x - cr.left}px;top:${sp.y - cr.top}px;
    width:${n._w * sx}px;min-height:${n._h * sy}px;
    font-size:${n._sp.fs * sx}px;
    font-family:system-ui,-apple-system,sans-serif;
    font-weight:${n._sp.fw};
    line-height:${n._sp.lh * sy}px;
    text-align:center;
    border:2px solid ${isBright ? "rgba(255,255,255,0.6)" : pal.main};
    border-radius:${n._rx * sx}px;
    background:${isBright ? pal.main + "cc" : "#FFFFFF"};
    color:${isBright ? "#FFFFFF" : pal.dark};
    outline:none;z-index:300;
    padding:${n._sp.vPad * sy * .6}px ${(n._sp.hPad / 2) * sx * .6}px;
    box-sizing:border-box;
    box-shadow:0 0 0 3px ${pal.main}30, 0 8px 24px rgba(0,0,0,0.14);
    resize:none;overflow:hidden;backdrop-filter:blur(2px);`;
  inp.style.height = "auto";
  wrap.style.position = "relative";
  wrap.appendChild(inp);

  const resize = () => { inp.style.height = "auto"; inp.style.height = inp.scrollHeight + "px"; };
  inp.addEventListener("input", resize); resize();
  inp.focus(); inp.select();

  const commit = () => {
    if (!inp.parentNode) return;
    const v = inp.value.trim();
    if (v && v !== n.title) editor.rename(n.id, v);
    inp.remove(); renderer.update();
  };
  inp.addEventListener("blur", commit);
  inp.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); inp.remove(); renderer.update(); }
    if (e.key === "Enter" && e.altKey) { resize(); }
  });
}
