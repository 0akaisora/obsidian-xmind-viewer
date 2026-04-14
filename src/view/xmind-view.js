/**
 * Obsidian FileView — 工具栏 / 键盘绑定 / 文件 I/O
 */
import { FileView, Notice } from "obsidian";
import { XMindParser } from "../model/parser.js";
import { XMindSerializer } from "../model/serializer.js";
import { XMindEditor } from "../editor/editor.js";
import { XMindRenderer } from "../renderer/renderer.js";
import { inlineEdit } from "../renderer/inline-edit.js";
import { rpy } from "../layout/layout.js";

export const VIEW_TYPE = "xmind-viewer";

export class XMindView extends FileView {
  constructor(leaf) {
    super(leaf);
    this.mm = null;
    this._dirty = false;
    this._ob = null;       // 原始 ArrayBuffer
    this.renderer = null;
    this.editor = null;
    this._sel = null;
  }

  getViewType() { return VIEW_TYPE; }
  getIcon() { return "brain-circuit"; }
  getDisplayText() { return this.file?.basename || "XMind"; }
  canAcceptExtension(e) { return e === "xmind"; }

  async onLoadFile(file) {
    this.contentEl.empty();
    this.contentEl.style.cssText = "display:flex;flex-direction:column;height:100%;overflow:hidden;background:#F8FAFC;";
    try {
      this._ob = await this.app.vault.readBinary(file);
      this.mm = await new XMindParser().parse(this._ob);
    } catch (e) {
      const d = this.contentEl.createDiv();
      d.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;font-family:system-ui;";
      d.innerHTML = `
        <div style="width:56px;height:56px;border-radius:16px;background:#FEF2F2;display:flex;align-items:center;justify-content:center;font-size:24px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;color:#111827;">无法解析此文件</div>
        <div style="font-size:12px;color:#9CA3AF;max-width:320px;text-align:center;">${e.message}</div>`;
      return;
    }
    this._buildUI();
  }

  async onUnloadFile(file) { if (this._dirty) await this._save(); }

  /* ══════════════════════════════════════════
     UI 构建
  ══════════════════════════════════════════ */
  _buildUI() {
    const tb = this.contentEl.createDiv({ cls: "xm-toolbar" });

    // 品牌
    const brand = tb.createDiv({ cls: "xm-brand" });
    brand.createDiv({ cls: "xm-brand-dot" });
    brand.createEl("span", { text: this.file?.basename || "XMind" });
    tb.createDiv({ cls: "xm-sep" });

    // Sheet 标签
    this._tabsEl = tb.createDiv({ cls: "xm-tabs" });
    this._renderTabs();
    tb.createDiv({ cls: "xm-spacer" });

    // 工具按钮
    const mkBtn = (text, tip, cls = "") => {
      return tb.createEl("button", { text, title: tip, cls: `xm-btn ${cls}` });
    };

    mkBtn("刷新", "从文件重新读取").onclick = () => this._refresh();
    mkBtn("适应", "适应视图").onclick = () => this.renderer?.fitView();
    mkBtn("复位", "还原自动布局").onclick = () => this._resetOffsets();
    tb.createDiv({ cls: "xm-sep" });

    mkBtn("+ 子节点", "添加子节点  Tab").onclick = () => this._addChild();
    mkBtn("+ 兄弟", "添加兄弟节点  Enter").onclick = () => this._addSibling();
    mkBtn("删除", "删除节点  Delete", "danger").onclick = () => this._deleteSel();
    mkBtn("重命名", "重命名节点  F2").onclick = () => this._editSel();
    tb.createDiv({ cls: "xm-sep" });

    mkBtn("↗ XMind", "在 XMind 应用中打开", "outlined").onclick = () => this._openInXMind();
    mkBtn("保存", "保存文件  Ctrl+S", "primary").onclick = () => this._save();
    this._dot = tb.createEl("span", { cls: "xm-dirty" });

    // 状态栏
    const sb = this.contentEl.createDiv({ cls: "xm-statusbar" });
    ["单击选中", "双击编辑", "拖节点移/挂载", "框选多选", "空格+拖拽平移", "滚轮缩放"].forEach(t => {
      sb.createEl("span").textContent = t;
    });
    this._nodeInfo = sb.createEl("span", { cls: "xm-node-info" });

    // 画布
    const wrap = this.contentEl.createDiv();
    wrap.style.cssText = "flex:1;overflow:hidden;position:relative;";
    wrap.setAttribute("tabindex", "0");
    this._wrap = wrap;

    this.renderer = new XMindRenderer(wrap, {
      onSelect: n => {
        this._sel = n;
        this._nodeInfo.textContent = n ? n.title : "";
        wrap.focus();
      },
      onDblClick: n => {
        this._sel = n;
        const svg = wrap.querySelector("svg"), g = wrap.querySelector(".xm-canvas");
        if (svg && g) inlineEdit(wrap, n, svg, g, this.renderer, this.editor);
      },
      onDragEnd: () => this._markDirty(),
      onReparent: (ids, targetId) => {
        if (this.editor.reparent(ids, targetId)) {
          this.renderer._clearSelSet();
          this._sel = null;
          this.renderer.selected = null;
          new Notice(`已挂载 ${ids.length} 个节点`);
        }
      },
    });

    this.editor = new XMindEditor(this.mm, () => { this._markDirty(); this.renderer.update(); });
    this.renderer.render(this.mm);

    // 键盘
    wrap.addEventListener("keydown", e => {
      if (e.key === " " && e.target.tagName !== "TEXTAREA") { e.preventDefault(); this.renderer.setSpaceDown(true); return; }
      if (e.target.tagName === "TEXTAREA") {
        if (e.key === "Tab") { e.preventDefault(); this.renderer._commitEdit(); this._addChild(); return; }
        if (e.key === "Enter" && !e.altKey) { e.preventDefault(); this.renderer._commitEdit(); wrap.focus(); return; }
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); this._addChild(); }
      if (e.key === "Enter") { e.preventDefault(); this._addSibling(); }
      if (e.key === "Delete") { e.preventDefault(); this._deleteSel(); }
      if (e.key === "F2") { e.preventDefault(); this._editSel(); }
    });
    wrap.addEventListener("keyup", e => {
      if (e.key === " ") this.renderer.setSpaceDown(false);
    });
    wrap.focus();
  }

  /* ══════════════════════════════════════════
     操作方法
  ══════════════════════════════════════════ */

  _renderTabs() {
    this._tabsEl.empty();
    this.mm.sheets.forEach((s, i) => {
      const a = i === this.mm.currentIndex;
      const t = this._tabsEl.createEl("button", { text: s.title, cls: `xm-tab${a ? " active" : ""}` });
      t.onclick = () => {
        this.mm.currentIndex = i;
        this.renderer.selected = null; this._sel = null;
        this._renderTabs(); this.renderer.render(this.mm);
      };
    });
  }

  _markDirty() { this._dirty = true; this._dot.textContent = "● 未保存"; }

  _addChild() {
    const anchor = this._sel || this.mm.sheets[this.mm.currentIndex].root;
    const oy = rpy(anchor);
    const n = this.editor.addChild(this._sel?.id ?? null);
    if (!n) return;
    this.renderer._pan.y += (oy - rpy(anchor)) * this.renderer._sc;
    this.renderer._tf();
    this.renderer.selected = n; this._sel = n; this.renderer._applySel(null, n); this._editSel();
  }

  _addSibling() {
    if (!this._sel) { this._addChild(); return; }
    const anchor = this._sel;
    const oy = rpy(anchor);
    const n = this.editor.addSibling(this._sel.id);
    if (!n) return;
    this.renderer._pan.y += (oy - rpy(anchor)) * this.renderer._sc;
    this.renderer._tf();
    this.renderer.selected = n; this._sel = n; this.renderer._applySel(null, n); this._editSel();
  }

  _deleteSel() {
    const ids = [...this.renderer._selSet];
    if (!ids.length && !this._sel) { new Notice("请先选择要删除的节点"); return; }
    if (!ids.length && this._sel) ids.push(this._sel.id);
    const root = this.mm.sheets[this.mm.currentIndex].root;
    const toDelete = ids.filter(id => id !== root.id);
    if (toDelete.length < ids.length) new Notice("根节点无法删除");
    if (!toDelete.length) return;
    toDelete.forEach(id => this.editor.del(id));
    this.renderer._clearSelSet(); this._sel = null; this.renderer.selected = null;
  }

  _editSel() {
    if (!this._sel) return;
    const svg = this._wrap?.querySelector("svg"), g = this._wrap?.querySelector(".xm-canvas");
    if (svg && g) inlineEdit(this._wrap, this._sel, svg, g, this.renderer, this.editor);
  }

  _resetOffsets() {
    const walk = n => { n._dx = 0; n._dy = 0; n.children.forEach(walk); };
    this.mm.sheets.forEach(s => walk(s.root));
    this.renderer.render(this.mm); this._markDirty();
  }

  async _refresh() {
    if (this._dirty) {
      new Notice("有未保存的更改，正在放弃并刷新…");
    }
    try {
      this._ob = await this.app.vault.readBinary(this.file);
      this.mm = await new XMindParser().parse(this._ob);
      this.editor = new XMindEditor(this.mm, () => { this._markDirty(); this.renderer.update(); });
      this._dirty = false;
      this._dot.textContent = "";
      this._sel = null;
      this.renderer.selected = null;
      this.renderer._clearSelSet();
      this.renderer.render(this.mm);
      this._renderTabs();
      new Notice("✅ 已刷新");
    } catch (e) {
      new Notice("❌ 刷新失败：" + e.message);
    }
  }

  async _openInXMind() {
    if (!this.file) { new Notice("没有打开的文件"); return; }
    if (this._dirty) { await this._save(); if (this._dirty) return; }
    try {
      const path = require("path"), { shell } = require("electron");
      const full = path.join(this.app.vault.adapter.basePath, this.file.path);
      const err = await shell.openPath(full); if (err) throw new Error(err);
    } catch (e) { new Notice("❌ 无法打开 XMind：" + e.message); }
  }

  async _save() {
    if (!this.file) return;
    try {
      const buf = await new XMindSerializer().serialize(this.mm, this._ob);
      this._ob = buf; await this.app.vault.modifyBinary(this.file, buf);
      this._dirty = false; this._dot.textContent = ""; new Notice("✅ 已保存");
    } catch (e) { new Notice("❌ 保存失败：" + e.message); }
  }
}
