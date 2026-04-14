/**
 * XMind 文件解析器 — 将 .xmind ZIP 解析为内存模型
 */
import { readZip, decodeText } from "../utils/zip.js";
import { uid } from "../utils/uid.js";

export class XMindParser {
  async parse(buffer) {
    const files = await readZip(buffer);
    if (files["content.json"]) {
      const json = JSON.parse(decodeText(files["content.json"]));
      return {
        sheets: json.map((s, i) => ({
          id: s.id || `s${i}`,
          title: s.title || `Sheet ${i + 1}`,
          root: this._fj(s.rootTopic),
        })),
        currentIndex: 0,
        _files: files,
      };
    }
    if (files["content.xml"]) {
      const doc = new DOMParser().parseFromString(decodeText(files["content.xml"]), "application/xml");
      return {
        sheets: Array.from(doc.querySelectorAll("sheet")).map((s, i) => ({
          id: s.getAttribute("id") || `s${i}`,
          title: s.querySelector(":scope > title")?.textContent || `Sheet ${i + 1}`,
          root: this._fx(s.querySelector(":scope > topic")),
        })),
        currentIndex: 0,
        _files: files,
      };
    }
    throw new Error("未找到 content.json 或 content.xml");
  }

  _fj(r) {
    if (!r) return null;
    const pos = r.position;
    const n = {
      id: r.id || uid(),
      title: r.title || "",
      collapsed: r.branch === "folded",
      children: [],
      _dx: pos?.x || 0,
      _dy: pos?.y || 0,
      _raw: r,
    };
    const kids = r.children?.attached || r.children || [];
    if (Array.isArray(kids)) n.children = kids.map(c => this._fj(c)).filter(Boolean);
    return n;
  }

  _fx(el) {
    if (!el) return null;
    const n = {
      id: el.getAttribute("id") || uid(),
      title: el.querySelector(":scope > title")?.textContent || "",
      collapsed: el.getAttribute("branch") === "folded",
      children: [],
      _dx: 0, _dy: 0,
    };
    const ct = el.querySelector(":scope > children > topics[type='attached']") || el.querySelector(":scope > children > topics");
    if (ct) n.children = Array.from(ct.querySelectorAll(":scope > topic")).map(c => this._fx(c)).filter(Boolean);
    return n;
  }
}
