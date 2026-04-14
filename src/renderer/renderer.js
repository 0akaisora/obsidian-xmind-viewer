/**
 * XMind SVG 渲染器
 *
 * 职责：SVG 绘制、pan/zoom、节点交互、框选、拖拽（含 drop-target 检测）
 */
import { se } from "../utils/svg.js";
import { PAL } from "../layout/constants.js";
import { doLayout, rpx, rpy } from "../layout/layout.js";

const DROP_RADIUS = 50; // 拖拽挂载检测半径 (canvas px)

export class XMindRenderer {
  constructor(wrap, cbs) {
    this.wrap = wrap;
    this.mm = null;
    this.selected = null;

    // 回调
    this.onSelect = cbs.onSelect;
    this.onDblClick = cbs.onDblClick;
    this.onDragEnd = cbs.onDragEnd;
    this.onReparent = cbs.onReparent; // (nodeIds[], targetId) => void

    // 视图状态
    this._pan = { x: 0, y: 0 };
    this._sc = 1;

    // DOM
    this._svg = null;
    this._g = null;
    this._eg = null;  // 连线组
    this._ng = null;  // 节点组
    this._selOvG = null;   // 选中高亮覆盖层
    this._dropIndicator = null; // 拖拽目标指示器
    this._root = null;

    // 节点映射
    this._nodeEls = new Map();   // id → <g>
    this._nodeData = new Map();  // id → node

    // 多选
    this._selSet = new Set();

    // 空格键（平移模式）
    this._spaceDown = false;

    // 框选
    this._marqueeEl = null;
  }

  /* ── 公共 API ─────────────────────────── */

  render(mm) {
    this.mm = mm; this.wrap.innerHTML = "";
    if (!mm?.sheets?.length) return;
    const sheet = mm.sheets[mm.currentIndex]; if (!sheet?.root) return;
    doLayout(sheet.root); this._root = sheet.root;
    this._buildSVG(); this._redraw(); this.fitView();
  }

  /** 轻量更新：重新布局 + 重绘，保持 pan/zoom */
  update() {
    if (!this._root || !this._svg) return;
    doLayout(this._root);
    this._redraw();
    this._tf();
  }

  /** 如果正在编辑，blur 提交 */
  _commitEdit() { const ta = this.wrap.querySelector("textarea"); if (ta) ta.blur(); }

  setSpaceDown(down) {
    this._spaceDown = down;
    if (this._svg) this._svg.style.cursor = down ? "grab" : "default";
  }

  /* ── 选中管理 ─────────────────────────── */

  _filterFor(n, sel) {
    const pal = PAL[n._bi % PAL.length];
    if (n._l === 0) return sel
      ? "drop-shadow(0 0 14px rgba(99,102,241,0.7)) drop-shadow(0 8px 24px rgba(99,102,241,0.45))"
      : "drop-shadow(0 6px 20px rgba(99,102,241,0.38)) drop-shadow(0 2px 6px rgba(99,102,241,0.2))";
    if (n._l === 1) return sel
      ? `drop-shadow(0 0 10px ${pal.main}99) drop-shadow(0 4px 14px ${pal.main}55)`
      : `drop-shadow(0 3px 10px ${pal.main}44) drop-shadow(0 1px 4px ${pal.main}22)`;
    if (n._l === 2) return sel
      ? `drop-shadow(0 0 0 2px ${pal.main}) drop-shadow(0 4px 12px rgba(0,0,0,0.12))`
      : "drop-shadow(0 1px 4px rgba(0,0,0,0.08)) drop-shadow(0 2px 8px rgba(0,0,0,0.04))";
    return sel
      ? `drop-shadow(0 0 0 1.5px ${pal.main}) drop-shadow(0 2px 8px rgba(0,0,0,0.10))`
      : "drop-shadow(0 1px 3px rgba(0,0,0,0.06))";
  }

  /** 就地切换单选高亮，跳过多选集内的节点 */
  _applySel(prev, next) {
    if (prev && !this._selSet.has(prev.id)) {
      const el = this._nodeEls.get(prev.id); if (el) el.style.filter = this._filterFor(prev, false);
    }
    if (next) {
      const el = this._nodeEls.get(next.id); if (el) el.style.filter = this._filterFor(next, true);
    }
    this._updateSelOverlay();
  }

  /** 清空多选 */
  _clearSelSet() {
    this._selSet.forEach(id => {
      const n = this._nodeData.get(id); const el = this._nodeEls.get(id);
      if (n && el) el.style.filter = this._filterFor(n, this.selected?.id === id);
    });
    this._selSet.clear();
    this._updateSelOverlay();
  }

  /** 设置多选集合 */
  _setSelSet(ids) {
    this._clearSelSet();
    ids.forEach(id => {
      this._selSet.add(id);
      const n = this._nodeData.get(id); const el = this._nodeEls.get(id);
      if (n && el) el.style.filter = this._filterFor(n, true);
    });
    this._updateSelOverlay();
  }

  /** 更新选中覆盖层 — 为每个选中节点画虚线边框 */
  _updateSelOverlay() {
    if (!this._selOvG) return;
    this._selOvG.innerHTML = "";
    const allSel = new Set([...this._selSet]);
    if (this.selected) allSel.add(this.selected.id);
    if (allSel.size === 0) return;

    for (const id of allSel) {
      const n = this._nodeData.get(id);
      if (!n) continue;
      const pal = PAL[n._bi % PAL.length];
      const pad = 4;
      const rect = se("rect", {
        x: rpx(n) - pad,
        y: rpy(n) - pad,
        width: n._w + pad * 2,
        height: n._h + pad * 2,
        rx: n._rx + 2,
        fill: "none",
        stroke: n._l <= 1 ? "#FFFFFF" : pal.main,
        "stroke-width": "2.5",
        "stroke-dasharray": "6 3",
        opacity: "0.85",
      });
      this._selOvG.appendChild(rect);
    }
  }

  /** 收集所有可见节点 */
  _allNodes() {
    const r = []; const walk = n => { r.push(n); if (!n.collapsed) n.children.forEach(walk); };
    if (this._root) walk(this._root); return r;
  }

  /** 多选集对应的节点对象 */
  _selSetNodes() {
    return this._allNodes().filter(n => this._selSet.has(n.id));
  }

  /* ── SVG 构建 ─────────────────────────── */

  _buildSVG() {
    const svg = se("svg");
    svg.style.cssText = "width:100%;height:100%;display:block;cursor:default;";

    // 渐变 + 滤镜定义
    const defs = se("defs");
    defs.innerHTML = `
      <linearGradient id="xm-rg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#818CF8"/>
        <stop offset="100%" stop-color="#4F46E5"/>
      </linearGradient>
      ${PAL.map((p, i) => `
        <linearGradient id="xm-g${i}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="${p.main}"/>
          <stop offset="100%" stop-color="${p.dark}"/>
        </linearGradient>`).join("")}
      <pattern id="xm-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
        <circle cx="0.75" cy="0.75" r="0.75" fill="#CBD5E1" opacity="0.5"/>
      </pattern>`;
    svg.appendChild(defs);

    // 背景
    svg.appendChild(se("rect", { width: "100%", height: "100%", fill: "#F8FAFC" }));
    svg.appendChild(se("rect", { width: "100%", height: "100%", fill: "url(#xm-grid)" }));

    // 画布组
    const g = se("g"); g.setAttribute("class", "xm-canvas"); svg.appendChild(g);
    this._svg = svg; this._g = g;
    this._eg = se("g"); this._ng = se("g"); this._selOvG = se("g");
    g.appendChild(this._eg);
    g.appendChild(this._ng);
    g.appendChild(this._selOvG); // 选中高亮层在节点上面

    // 拖拽目标指示器（在画布组里，跟随变换）
    this._dropIndicator = se("rect", {
      fill: "rgba(16,185,129,0.10)",
      stroke: "#10B981",
      "stroke-width": "2.5",
      "stroke-dasharray": "8 4",
      rx: "6",
    });
    this._dropIndicator.style.cssText = "display:none;pointer-events:none;";
    g.appendChild(this._dropIndicator);

    // 框选矩形（SVG 屏幕坐标）
    this._marqueeEl = se("rect", {
      fill: "rgba(99,102,241,0.08)", stroke: "#6366F1",
      "stroke-width": "1", "stroke-dasharray": "4 3", rx: "2",
    });
    this._marqueeEl.style.cssText = "display:none;pointer-events:none;";
    svg.appendChild(this._marqueeEl);

    // ── 背景交互 ──
    svg.addEventListener("mousedown", e => {
      if (e.button !== 0 || e.target.closest(".xm-node")) return;
      this._commitEdit(); e.preventDefault();

      if (this._spaceDown) {
        // 平移
        const ox = this._pan.x, oy = this._pan.y, sx = e.clientX, sy = e.clientY;
        const mv = ev => { this._pan.x = ox + (ev.clientX - sx); this._pan.y = oy + (ev.clientY - sy); this._tf(); };
        const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); svg.style.cursor = "grab"; };
        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); svg.style.cursor = "grabbing";
      } else {
        // 框选
        const svgR = svg.getBoundingClientRect();
        const x0 = e.clientX - svgR.left, y0 = e.clientY - svgR.top;
        let x1 = x0, y1 = y0;
        const prev = this.selected;
        this._clearSelSet(); this.selected = null; this._applySel(prev, null); this.onSelect?.(null);
        const mv = ev => {
          x1 = ev.clientX - svgR.left; y1 = ev.clientY - svgR.top;
          const rx = Math.min(x0, x1), ry = Math.min(y0, y1);
          this._marqueeEl.setAttribute("x", rx); this._marqueeEl.setAttribute("y", ry);
          this._marqueeEl.setAttribute("width", Math.abs(x1 - x0)); this._marqueeEl.setAttribute("height", Math.abs(y1 - y0));
          this._marqueeEl.style.display = "block";
        };
        const up = () => {
          window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up);
          this._marqueeEl.style.display = "none";
          const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
          if (w > 4 && h > 4) {
            const cx0 = (Math.min(x0, x1) - this._pan.x) / this._sc;
            const cy0 = (Math.min(y0, y1) - this._pan.y) / this._sc;
            const cx1 = (Math.max(x0, x1) - this._pan.x) / this._sc;
            const cy1 = (Math.max(y0, y1) - this._pan.y) / this._sc;
            const hits = this._allNodes()
              .filter(n => rpx(n) < cx1 && rpx(n) + n._w > cx0 && rpy(n) < cy1 && rpy(n) + n._h > cy0)
              .map(n => n.id);
            if (hits.length) this._setSelSet(hits);
          }
        };
        window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
      }
    });

    // 缩放
    svg.addEventListener("wheel", e => {
      this._commitEdit();
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.11 : 0.90;
      const ns = Math.max(0.12, Math.min(3, this._sc * f));
      const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      this._pan.x = mx - (mx - this._pan.x) * (ns / this._sc);
      this._pan.y = my - (my - this._pan.y) * (ns / this._sc);
      this._sc = ns; this._tf();
    }, { passive: false });

    this.wrap.appendChild(svg);
  }

  /* ── 重绘 ─────────────────────────────── */

  _redraw() {
    if (!this._root) return;
    this._eg.innerHTML = ""; this._ng.innerHTML = "";
    this._nodeEls.clear(); this._nodeData.clear();
    this._drawEdges(this._eg, this._root);
    this._drawNodes(this._ng, this._root);
    this._updateSelOverlay();
  }

  _tf() {
    if (this._g) this._g.setAttribute("transform", `translate(${this._pan.x},${this._pan.y}) scale(${this._sc})`);
  }

  fitView() {
    if (!this._svg || !this._g) return;
    const try_ = () => {
      const sr = this._svg.getBoundingClientRect(); if (!sr.width) { setTimeout(try_, 120); return; }
      try {
        const bb = this._g.getBBox(); if (!bb.width || !bb.height) { setTimeout(try_, 120); return; }
        const sx = (sr.width * .85) / bb.width, sy = (sr.height * .85) / bb.height;
        this._sc = Math.min(sx, sy, 1.0);
        this._pan.x = (sr.width - bb.width * this._sc) / 2 - bb.x * this._sc;
        this._pan.y = (sr.height - bb.height * this._sc) / 2 - bb.y * this._sc;
        this._tf();
      } catch { setTimeout(try_, 120); }
    };
    try_();
  }

  /* ── 连线 ─────────────────────────────── */

  _drawEdges(g, n) {
    if (!n || n.collapsed || !n.children.length) return;
    const x1 = rpx(n) + n._w, cy1 = rpy(n) + n._h / 2;
    for (const c of n.children) {
      const x2 = rpx(c), cy2 = rpy(c) + c._h / 2, mx = (x1 + x2) / 2;
      const pal = PAL[(n._l === 0 ? c._bi : n._bi) % PAL.length];
      if (n._l === 0) {
        g.appendChild(se("path", {
          d: `M${x1},${cy1} C${mx},${cy1} ${mx},${cy2} ${x2},${cy2}`,
          fill: "none", stroke: pal.muted, "stroke-width": "3.5", "stroke-linecap": "round", "stroke-opacity": "0.4",
        }));
      }
      g.appendChild(se("path", {
        d: `M${x1},${cy1} C${mx},${cy1} ${mx},${cy2} ${x2},${cy2}`,
        fill: "none", stroke: pal.main,
        "stroke-width": n._l === 0 ? "2" : "1.5",
        "stroke-opacity": n._l === 0 ? "0.6" : n._l === 1 ? "0.45" : "0.35",
        "stroke-linecap": "round",
      }));
      this._drawEdges(g, c);
    }
  }

  _drawNodes(g, n) {
    if (!n) return;
    this._oneNode(g, n);
    if (!n.collapsed) for (const c of n.children) this._drawNodes(g, c);
  }

  /* ── 单个节点 ─────────────────────────── */

  _oneNode(g, n) {
    const { _w: w, _h: h, _rx: rx, _lines: lines, _sp: sp, _l: l, _bi: bi } = n;
    const x = rpx(n), y = rpy(n), pal = PAL[bi % PAL.length];
    const isSel = this.selected?.id === n.id || this._selSet.has(n.id);
    const ng = se("g"); ng.setAttribute("class", "xm-node"); ng.style.cursor = "grab";

    // ── 根节点 ──
    if (l === 0) {
      ng.style.filter = this._filterFor(n, isSel);
      ng.appendChild(se("rect", { x, y, width: w, height: h, rx, fill: "url(#xm-rg)" }));
      this._addText(ng, n, x, y, w, h, lines, sp, "#FFFFFF", "rgba(255,255,255,0.85)");
    }
    // ── 一级 ──
    else if (l === 1) {
      ng.style.filter = this._filterFor(n, isSel);
      ng.appendChild(se("rect", { x, y, width: w, height: h, rx, fill: `url(#xm-g${bi % PAL.length})` }));
      this._addText(ng, n, x, y, w, h, lines, sp, "#FFFFFF", "rgba(255,255,255,0.8)");
    }
    // ── 二级 ──
    else if (l === 2) {
      ng.style.filter = this._filterFor(n, isSel);
      ng.appendChild(se("rect", { x, y, width: w, height: h, rx, fill: "#FFFFFF", stroke: pal.muted, "stroke-width": "1.2" }));
      const topBar = se("rect", { x, y, width: w, height: 3, rx });
      topBar.style.fill = pal.main; ng.appendChild(topBar);
      ng.appendChild(se("rect", { x, y: y + 3, width: w, height: 3, fill: "#FFFFFF" }));
      this._addText(ng, n, x, y, w, h, lines, sp, "#1E293B", "#64748B");
    }
    // ── 三级+ ──
    else {
      ng.style.filter = this._filterFor(n, isSel);
      ng.appendChild(se("rect", { x, y, width: w, height: h, rx, fill: pal.soft, stroke: pal.muted, "stroke-width": "1" }));
      this._addText(ng, n, x, y, w, h, lines, sp, pal.dark, "#6B7280");
    }

    // ── 折叠按钮 ──
    if (n.children.length) {
      const bx = x + w + 11, by = y + h / 2;
      const isOpen = !n.collapsed;
      const circ = se("circle", {
        cx: bx, cy: by, r: 9,
        fill: l <= 1 ? "rgba(255,255,255,0.18)" : "#FFFFFF",
        stroke: l <= 1 ? "rgba(255,255,255,0.5)" : pal.muted,
        "stroke-width": "1",
      });
      circ.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.12))";
      const size = 4;
      const d = isOpen
        ? `M${bx - size},${by - size / 2} L${bx},${by + size / 2} L${bx + size},${by - size / 2}`
        : `M${bx - size / 2},${by - size} L${bx + size / 2},${by} L${bx - size / 2},${by + size}`;
      const chev = se("path", {
        d, fill: "none",
        stroke: l <= 1 ? "rgba(255,255,255,0.9)" : pal.main,
        "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round",
      });
      chev.style.cssText = "pointer-events:none;";
      const btn = se("g"); btn.style.cursor = "pointer";
      btn.appendChild(circ); btn.appendChild(chev);
      btn.addEventListener("click", e => {
        e.stopPropagation(); n.collapsed = !n.collapsed; doLayout(this._root); this._redraw();
      });
      ng.appendChild(btn);
    }

    // ── 拖拽（含 drop-target 检测）──
    ng.addEventListener("mousedown", e => {
      if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
      const inMulti = this._selSet.size > 1 && this._selSet.has(n.id);
      const targets = inMulti ? this._selSetNodes() : [n];
      const dragIds = new Set(targets.map(nd => nd.id));
      // 收集所有被拖拽节点及其后代的 ID（禁止挂到后代上）
      const dragDescIds = new Set();
      const collectDesc = nd => { dragDescIds.add(nd.id); nd.children.forEach(collectDesc); };
      targets.forEach(collectDesc);

      const origins = targets.map(nd => ({ nd, odx: nd._dx || 0, ody: nd._dy || 0 }));
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      let dropTarget = null;

      const mv = ev => {
        const dx = (ev.clientX - sx) / this._sc, dy = (ev.clientY - sy) / this._sc;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
        if (!moved) return;

        origins.forEach(({ nd, odx, ody }) => { nd._dx = odx + dx; nd._dy = ody + dy; });
        this._redraw();

        // drop target 检测：找最近的非拖拽节点
        const svgR = this._svg.getBoundingClientRect();
        const mouseCanvasX = (ev.clientX - svgR.left - this._pan.x) / this._sc;
        const mouseCanvasY = (ev.clientY - svgR.top - this._pan.y) / this._sc;

        let bestDist = DROP_RADIUS;
        dropTarget = null;
        for (const cand of this._allNodes()) {
          if (dragDescIds.has(cand.id)) continue;
          const cx = rpx(cand) + cand._w / 2;
          const cy = rpy(cand) + cand._h / 2;
          const dist = Math.hypot(mouseCanvasX - cx, mouseCanvasY - cy);
          if (dist < bestDist) { bestDist = dist; dropTarget = cand; }
        }

        // 显示/隐藏 drop indicator
        if (dropTarget) {
          const pad = 6;
          this._dropIndicator.setAttribute("x", rpx(dropTarget) - pad);
          this._dropIndicator.setAttribute("y", rpy(dropTarget) - pad);
          this._dropIndicator.setAttribute("width", dropTarget._w + pad * 2);
          this._dropIndicator.setAttribute("height", dropTarget._h + pad * 2);
          this._dropIndicator.style.display = "block";
        } else {
          this._dropIndicator.style.display = "none";
        }
      };

      const up = () => {
        window.removeEventListener("mousemove", mv);
        window.removeEventListener("mouseup", up);
        this._dropIndicator.style.display = "none";

        if (moved) {
          if (dropTarget) {
            // 恢复原位再由 reparent 回调处理
            origins.forEach(({ nd, odx, ody }) => { nd._dx = odx; nd._dy = ody; });
            this.onReparent?.([...dragIds], dropTarget.id);
          } else {
            this.onDragEnd?.(n);
          }
        } else {
          // 单击 → 单选
          this._clearSelSet();
          const prev = this.selected; this.selected = n; this._applySel(prev, n); this.onSelect?.(n);
        }
      };

      window.addEventListener("mousemove", mv);
      window.addEventListener("mouseup", up);
    });

    // 双击
    ng.addEventListener("dblclick", e => { e.stopPropagation(); this.selected = n; this.onDblClick?.(n); });

    this._nodeEls.set(n.id, ng);
    this._nodeData.set(n.id, n);
    g.appendChild(ng);
  }

  _addText(ng, n, x, y, w, h, lines, sp, tc, tc2) {
    const txtEl = se("text", {
      "text-anchor": "middle", "font-size": sp.fs,
      "font-family": "system-ui,-apple-system,sans-serif", "font-weight": sp.fw, fill: tc,
    });
    txtEl.style.cssText = "pointer-events:none;user-select:none;";
    const cx = x + w / 2, totalTH = lines.length * sp.lh;
    if (lines.length === 1) {
      txtEl.setAttribute("x", cx); txtEl.setAttribute("y", y + h / 2);
      txtEl.setAttribute("dominant-baseline", "middle"); txtEl.textContent = lines[0];
    } else {
      const startY = y + h / 2 - totalTH / 2 + sp.lh * 0.72;
      lines.forEach((line, i) => { const ts = se("tspan", { x: cx, y: startY + i * sp.lh }); ts.textContent = line; txtEl.appendChild(ts); });
    }
    ng.appendChild(txtEl);
  }
}
