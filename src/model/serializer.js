/**
 * XMind 序列化器 — 将内存模型写回 .xmind ZIP
 */
import { readZip, buildZip } from "../utils/zip.js";
import { uid } from "../utils/uid.js";

export class XMindSerializer {
  async serialize(mm, origBuf) {
    const files = await readZip(origBuf);
    const nf = { ...files };

    const hasXml = !!nf["content.xml"];

    // 始终写 content.json（新格式）
    const jsonSheets = mm.sheets.map(s => this._sheetToJson(s));
    nf["content.json"] = new TextEncoder().encode(JSON.stringify(jsonSheets, null, 2));

    // 若原始有 content.xml，同步更新
    if (hasXml) {
      nf["content.xml"] = new TextEncoder().encode(this._sheetsToXml(mm.sheets));
    }

    // metadata.json
    if (!nf["metadata.json"]) {
      nf["metadata.json"] = new TextEncoder().encode(
        JSON.stringify({ creator: { name: "XMind", version: "24.04.0" } }, null, 2)
      );
    }

    // manifest.json
    const manifestEntries = { "content.json": {}, "metadata.json": {} };
    if (hasXml) manifestEntries["content.xml"] = {};
    nf["manifest.json"] = new TextEncoder().encode(
      JSON.stringify({ "file-entries": manifestEntries }, null, 2)
    );

    return buildZip(nf);
  }

  _sheetToJson(s) {
    return {
      id: s.id,
      class: "sheet",
      title: s.title,
      rootTopic: this._topicToJson(s.root, true),
    };
  }

  _topicToJson(n, isRoot = false) {
    if (!n) return null;
    const raw = n._raw || {};
    const o = { ...raw, id: n.id, title: n.title, class: "topic" };

    if (isRoot && !o.structureClass) {
      o.structureClass = "org.xmind.ui.logic.right";
    }
    if (!o.style || typeof o.style !== "object") {
      o.style = { id: uid(), type: "topic", properties: {} };
    }

    if (n.collapsed) o.branch = "folded";
    else delete o.branch;

    if (n._dx || n._dy) {
      o.position = { x: Math.round(n._dx || 0), y: Math.round(n._dy || 0) };
    } else {
      delete o.position;
    }

    if (n.children.length) {
      o.children = { attached: n.children.map(c => this._topicToJson(c, false)) };
    } else {
      delete o.children;
    }

    // 清理内部渲染字段
    delete o._raw; delete o._dx; delete o._dy; delete o._w; delete o._h;
    delete o._rx; delete o._lines; delete o._sp; delete o._l; delete o._bi;
    delete o._lx; delete o._ly; delete o._ht; delete o._cachedTitle; delete o._cachedL;
    return o;
  }

  _sheetsToXml(sheets) {
    const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const topic = n => {
      let x = `<topic id="${esc(n.id)}"`;
      if (n.collapsed) x += ' branch="folded"';
      x += `><title>${esc(n.title)}</title>`;
      if (!n.collapsed && n.children.length) {
        x += '<children><topics type="attached">';
        x += n.children.map(topic).join('');
        x += '</topics></children>';
      }
      x += '</topic>';
      return x;
    };
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
      + '<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"'
      + ' xmlns:xlink="http://www.w3.org/1999/xlink" version="2.0">';
    for (const s of sheets) {
      xml += `<sheet id="${esc(s.id)}">${topic(s.root)}<title>${esc(s.title)}</title></sheet>`;
    }
    xml += '</xmap-content>';
    return xml;
  }
}
