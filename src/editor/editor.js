/**
 * XMind 编辑器 — 树结构增删改操作
 */
import { uid } from "../utils/uid.js";

export class XMindEditor {
  constructor(mm, cb) { this.mm = mm; this.cb = cb; }

  _sh() { return this.mm.sheets[this.mm.currentIndex]; }

  _par(root, id) {
    for (const c of root.children) {
      if (c.id === id) return root;
      const f = this._par(c, id); if (f) return f;
    }
    return null;
  }

  _find(root, id) {
    if (root.id === id) return root;
    for (const c of root.children) { const f = this._find(c, id); if (f) return f; }
    return null;
  }

  addChild(pid) {
    const p = pid ? this._find(this._sh().root, pid) : this._sh().root;
    if (!p) return null;
    const n = { id: uid(), title: "新节点", collapsed: false, children: [], _dx: 0, _dy: 0 };
    p.children.push(n); p.collapsed = false; this.cb(); return n;
  }

  addSibling(id) {
    const sh = this._sh(); if (sh.root.id === id) return this.addChild(id);
    const par = this._par(sh.root, id); if (!par) return null;
    const i = par.children.findIndex(c => c.id === id);
    const n = { id: uid(), title: "新节点", collapsed: false, children: [], _dx: 0, _dy: 0 };
    par.children.splice(i + 1, 0, n); this.cb(); return n;
  }

  del(id) {
    const sh = this._sh(); if (sh.root.id === id) return false;
    const par = this._par(sh.root, id); if (!par) return false;
    par.children = par.children.filter(c => c.id !== id); this.cb(); return true;
  }

  rename(id, title) {
    const n = this._find(this._sh().root, id);
    if (n) { n.title = title; n._cachedTitle = null; this.cb(); }
  }

  /**
   * 将一组节点重新挂载到新的父节点下
   * @param {string[]} ids   — 要移动的节点 ID 列表
   * @param {string}   newParentId — 新父节点 ID
   * @returns {boolean} 是否成功
   */
  reparent(ids, newParentId) {
    const sh = this._sh();
    const newParent = this._find(sh.root, newParentId);
    if (!newParent) return false;

    // 不能把节点挂到自己或自己的后代上
    for (const id of ids) {
      if (id === newParentId) return false;
      if (id === sh.root.id) return false; // 根节点不能移动
      const node = this._find(sh.root, id);
      if (node && this._find(node, newParentId)) return false;
    }

    for (const id of ids) {
      const oldParent = this._par(sh.root, id);
      if (!oldParent) continue;
      const node = oldParent.children.find(c => c.id === id);
      if (!node) continue;
      oldParent.children = oldParent.children.filter(c => c.id !== id);
      node._dx = 0; node._dy = 0; // 重置偏移
      newParent.children.push(node);
    }

    newParent.collapsed = false;
    this.cb();
    return true;
  }
}
