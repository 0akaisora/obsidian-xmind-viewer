"use strict";
const { Plugin, FileView, Notice } = require("obsidian");

/* ══════════════════════════════════════════
   ZIP 工具
══════════════════════════════════════════ */
async function inflate(compressed) {
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(), r = ds.readable.getReader();
  w.write(compressed); w.close();
  const chunks = [];
  for (;;) { const {done,value} = await r.read(); if (done) break; chunks.push(value); }
  const out = new Uint8Array(chunks.reduce((s,c) => s+c.length, 0));
  let p = 0; for (const c of chunks) { out.set(c,p); p+=c.length; }
  return out;
}
async function readZip(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(buffer);
  let eocd = -1;
  for (let i = data.length-22; i >= 0; i--)
    if (view.getUint32(i,true)===0x06054b50) { eocd=i; break; }
  if (eocd<0) throw new Error("Not a ZIP file");
  const cdOff=view.getUint32(eocd+16,true), cdN=view.getUint16(eocd+8,true);
  const files={}; let pos=cdOff;
  for (let i=0;i<cdN;i++) {
    if (view.getUint32(pos,true)!==0x02014b50) break;
    const comp=view.getUint16(pos+10,true), csz=view.getUint32(pos+20,true);
    const fnL=view.getUint16(pos+28,true), exL=view.getUint16(pos+30,true);
    const cmL=view.getUint16(pos+32,true), lhOff=view.getUint32(pos+42,true);
    const name=new TextDecoder("utf-8").decode(data.slice(pos+46,pos+46+fnL));
    const lhEx=view.getUint16(lhOff+28,true), ds2=lhOff+30+fnL+lhEx;
    const raw=data.slice(ds2,ds2+csz);
    files[name]=comp===8?await inflate(raw):raw;
    pos+=46+fnL+exL+cmL;
  }
  return files;
}
function crc32(data) {
  if (!crc32.t) { crc32.t=new Uint32Array(256); for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);crc32.t[i]=c;} }
  let c=0xFFFFFFFF; for(let i=0;i<data.length;i++) c=crc32.t[(c^data[i])&0xFF]^(c>>>8); return(c^0xFFFFFFFF)>>>0;
}
function buildZip(files) {
  const enc=new TextEncoder(),locals=[],centrals=[];let off=0;
  const now=new Date();
  const dd=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  const dt=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
  for(const[name,data]of Object.entries(files)){
    const nb=enc.encode(name),crc=crc32(data);
    const lh=new Uint8Array(30+nb.length);const lv=new DataView(lh.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(10,dt,true);lv.setUint16(12,dd,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);
    lv.setUint16(26,nb.length,true);lh.set(nb,30);locals.push({lh,data});
    const ch=new Uint8Array(46+nb.length);const cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
    // CD header: offset 8=flags(0), 10=compression(0=stored), 12=time, 14=date
    cv.setUint16(12,dt,true);cv.setUint16(14,dd,true);cv.setUint32(16,crc,true);
    cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);
    cv.setUint16(28,nb.length,true);cv.setUint32(42,off,true);
    ch.set(nb,46);centrals.push(ch);off+=30+nb.length+data.length;
  }
  const cdSz=centrals.reduce((s,c)=>s+c.length,0);
  const out=new Uint8Array(off+cdSz+22);let p=0;
  for(const{lh,data}of locals){out.set(lh,p);p+=lh.length;out.set(data,p);p+=data.length;}
  for(const ch of centrals){out.set(ch,p);p+=ch.length;}
  const ev=new DataView(out.buffer,p);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,centrals.length,true);
  ev.setUint16(10,centrals.length,true);ev.setUint32(12,cdSz,true);ev.setUint32(16,off,true);
  return out.buffer;
}
function decodeText(b){try{return new TextDecoder("utf-8",{fatal:true}).decode(b);}catch{return new TextDecoder("gbk").decode(b);}}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

/* ══════════════════════════════════════════
   解析器 / 序列化器
══════════════════════════════════════════ */
class XMindParser {
  async parse(buffer) {
    const files=await readZip(buffer);
    if(files["content.json"]){
      const json=JSON.parse(decodeText(files["content.json"]));
      return{sheets:json.map((s,i)=>({id:s.id||`s${i}`,title:s.title||`Sheet ${i+1}`,root:this._fj(s.rootTopic)})),currentIndex:0,_files:files};
    }
    if(files["content.xml"]){
      const doc=new DOMParser().parseFromString(decodeText(files["content.xml"]),"application/xml");
      return{sheets:Array.from(doc.querySelectorAll("sheet")).map((s,i)=>({id:s.getAttribute("id")||`s${i}`,title:s.querySelector(":scope > title")?.textContent||`Sheet ${i+1}`,root:this._fx(s.querySelector(":scope > topic"))})),currentIndex:0,_files:files};
    }
    throw new Error("未找到 content.json 或 content.xml");
  }
  _fj(r){
    if(!r)return null;const pos=r.position;
    const n={
      id:r.id||uid(), title:r.title||"", collapsed:r.branch==="folded",
      children:[], _dx:pos?.x||0, _dy:pos?.y||0,
      // 保留原始扩展字段，以便回写时不丢失信息
      _raw: r,
    };
    const kids=r.children?.attached||r.children||[];
    if(Array.isArray(kids))n.children=kids.map(c=>this._fj(c)).filter(Boolean);return n;
  }
  _fx(el){
    if(!el)return null;
    const n={id:el.getAttribute("id")||uid(),title:el.querySelector(":scope > title")?.textContent||"",collapsed:el.getAttribute("branch")==="folded",children:[],_dx:0,_dy:0};
    const ct=el.querySelector(":scope > children > topics[type='attached']")||el.querySelector(":scope > children > topics");
    if(ct)n.children=Array.from(ct.querySelectorAll(":scope > topic")).map(c=>this._fx(c)).filter(Boolean);return n;
  }
}
class XMindSerializer {
  async serialize(mm, origBuf) {
    const files = await readZip(origBuf);
    const nf = { ...files };

    // ── 判断原始格式 ──────────────────────────────
    const hasJson = !!nf["content.json"];
    const hasXml  = !!nf["content.xml"];

    // 始终写 content.json（新格式）
    const jsonSheets = mm.sheets.map(s => this._sheetToJson(s));
    nf["content.json"] = new TextEncoder().encode(JSON.stringify(jsonSheets, null, 2));

    // 若原始有 content.xml，同步更新它（老版 XMind 读这个）
    if (hasXml) {
      nf["content.xml"] = new TextEncoder().encode(this._sheetsToXml(mm.sheets));
    }

    // 若原始有 metadata.json，保留；若无则写一个最小版本
    if (!nf["metadata.json"]) {
      nf["metadata.json"] = new TextEncoder().encode(
        JSON.stringify({ creator: { name: "XMind", version: "24.04.0" } }, null, 2)
      );
    }

    // 始终写 manifest.json（xmind-sdk-js 要求此文件存在且含 file-entries）
    const manifestEntries = { "content.json": {}, "metadata.json": {} };
    if (hasXml) manifestEntries["content.xml"] = {};
    nf["manifest.json"] = new TextEncoder().encode(
      JSON.stringify({ "file-entries": manifestEntries }, null, 2)
    );

    return buildZip(nf);
  }

  // ── JSON 序列化 ───────────────────────────────
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
    // 从 _raw 恢复原始字段（structureClass、markers、labels 等），再覆盖我们修改过的部分
    const raw = n._raw || {};
    const o = {
      ...raw,                        // 原始所有字段（保留 XMind 私有属性）
      id:    n.id,
      title: n.title,
      class: "topic",
    };

    // structureClass：根节点若原来没有则补默认值，XMind 需要它
    if (isRoot && !o.structureClass) {
      o.structureClass = "org.xmind.ui.logic.right";
    }

    // style 字段：XMind 规范要求每个 topic 都有此字段（Style 结构体无 omitempty）
    if (!o.style || typeof o.style !== "object") {
      o.style = { id: uid(), type: "topic", properties: {} };
    }

    // 折叠状态
    if (n.collapsed) o.branch = "folded";
    else delete o.branch;

    // 位置（偏移量持久化）
    if (n._dx || n._dy) {
      o.position = { x: Math.round(n._dx || 0), y: Math.round(n._dy || 0) };
    } else {
      delete o.position;
    }

    // 子节点
    if (n.children.length) {
      o.children = { attached: n.children.map(c => this._topicToJson(c, false)) };
    } else {
      delete o.children;
    }

    // 清理内部渲染字段，不写入文件
    delete o._raw; delete o._dx; delete o._dy; delete o._w; delete o._h;
    delete o._rx; delete o._lines; delete o._sp; delete o._l; delete o._bi;
    delete o._lx; delete o._ly; delete o._ht; delete o._cachedTitle; delete o._cachedL;
    return o;
  }

  // ── XML 序列化（兼容 XMind 8 旧格式）────────────
  _sheetsToXml(sheets) {
    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

/* ══════════════════════════════════════════
   文字测量
══════════════════════════════════════════ */
const NS="http://www.w3.org/2000/svg";
let _msv=null;
function getMeasurer(){
  if(!_msv||!document.body.contains(_msv)){
    _msv=document.createElementNS(NS,"svg");
    _msv.style.cssText="position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none;overflow:visible;width:1px;height:1px;";
    document.body.appendChild(_msv);
  }
  return _msv;
}
function measureText(str,fs,fw){
  if(!str)return 0;const t=document.createElementNS(NS,"text");
  t.setAttribute("font-size",fs);t.setAttribute("font-family","system-ui,-apple-system,sans-serif");
  if(fw)t.setAttribute("font-weight",fw);t.textContent=str;getMeasurer().appendChild(t);
  const w=t.getComputedTextLength();t.remove();return w;
}

/* ══════════════════════════════════════════
   节点规格（尺寸 / 字体）
══════════════════════════════════════════ */
const LSPEC=[
  {maxTW:220,hPad:36,vPad:14,minW:120,minH:50,rxR:0, fs:15,fw:"700",lh:22}, // 根
  {maxTW:200,hPad:30,vPad:10,minW:96, minH:38,rxR:0, fs:13,fw:"600",lh:19}, // L1
  {maxTW:180,hPad:26,vPad:9, minW:78, minH:30,rxR:10,fs:12,fw:"400",lh:17}, // L2
  {maxTW:160,hPad:22,vPad:7, minW:64, minH:26,rxR:8, fs:11,fw:"400",lh:15}, // L3+
];
const HGAP=58,VGAP=14;

function sizeNode(n,l){
  if(n._cachedTitle===n.title&&n._cachedL===l)return;
  const sp=LSPEC[Math.min(l,LSPEC.length-1)];
  const words=(n.title||" ").split(/\s+/);const lines=[];let cur="";
  for(const word of words){
    const test=cur?cur+" "+word:word;
    if(measureText(test,sp.fs,sp.fw)<=sp.maxTW){cur=test;}
    else{
      if(cur)lines.push(cur);
      if(measureText(word,sp.fs,sp.fw)>sp.maxTW){
        let part="";for(const ch of word){const t2=part+ch;if(measureText(t2,sp.fs,sp.fw)<=sp.maxTW){part=t2;}else{if(part)lines.push(part);part=ch;}}cur=part;
      }else{cur=word;}
    }
  }
  if(cur)lines.push(cur);if(!lines.length)lines.push("");
  const maxLW=Math.max(...lines.map(ln=>measureText(ln,sp.fs,sp.fw)));
  n._w=Math.max(sp.minW,maxLW+sp.hPad);n._h=Math.max(sp.minH,sp.vPad*2+lines.length*sp.lh);
  n._rx=sp.rxR===0?n._h/2:sp.rxR;n._lines=lines;n._sp=sp;n._l=l;
  n._cachedTitle=n.title;n._cachedL=l;
}
function measureAll(n,l=0){sizeNode(n,l);n.children.forEach(c=>measureAll(c,l+1));}

/* ══════════════════════════════════════════
   布局
══════════════════════════════════════════ */
function calcHt(n){
  if(n.collapsed||!n.children.length)return n._ht=n._h+VGAP;
  let tot=0;for(const c of n.children)tot+=calcHt(c);
  return n._ht=Math.max(tot,n._h+VGAP);
}
function place(n,x,y,bi){
  n._lx=x;n._ly=y-n._h/2;n._bi=bi;
  if(n.collapsed||!n.children.length)return;
  let cy=y-n._ht/2+VGAP/2;
  n.children.forEach((c,i)=>{place(c,x+n._w+HGAP,cy+c._ht/2,n._l===0?i:bi);cy+=c._ht;});
}
function doLayout(root){measureAll(root);calcHt(root);place(root,24,0,0);}
const rpx=n=>n._lx+(n._dx||0);
const rpy=n=>n._ly+(n._dy||0);

/* ══════════════════════════════════════════
   配色系统（精致现代色板）
══════════════════════════════════════════ */
const PAL=[
  {main:"#6366F1",soft:"#EEF2FF",muted:"#C7D2FE",dark:"#4338CA"}, // Indigo
  {main:"#0EA5E9",soft:"#F0F9FF",muted:"#BAE6FD",dark:"#0369A1"}, // Sky
  {main:"#10B981",soft:"#ECFDF5",muted:"#A7F3D0",dark:"#065F46"}, // Emerald
  {main:"#F59E0B",soft:"#FFFBEB",muted:"#FDE68A",dark:"#92400E"}, // Amber
  {main:"#EF4444",soft:"#FEF2F2",muted:"#FECACA",dark:"#991B1B"}, // Red
  {main:"#8B5CF6",soft:"#F5F3FF",muted:"#DDD6FE",dark:"#5B21B6"}, // Violet
  {main:"#EC4899",soft:"#FDF2F8",muted:"#FBCFE8",dark:"#9D174D"}, // Pink
  {main:"#14B8A6",soft:"#F0FDFA",muted:"#99F6E4",dark:"#134E4A"}, // Teal
];

/* ══════════════════════════════════════════
   SVG 辅助
══════════════════════════════════════════ */
function se(tag,attrs={}){
  const e=document.createElementNS(NS,tag);
  for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);
  return e;
}

/* ══════════════════════════════════════════
   渲染器
══════════════════════════════════════════ */
class XMindRenderer {
  constructor(wrap,cbs){
    this.wrap=wrap;this.mm=null;this.selected=null;
    this.onSelect=cbs.onSelect;this.onDblClick=cbs.onDblClick;this.onDragEnd=cbs.onDragEnd;
    this._pan={x:0,y:0};this._sc=1;
    this._svg=null;this._g=null;this._eg=null;this._ng=null;this._root=null;
    this._nodeEls=new Map(); // node.id → <g> element
  }

  render(mm){
    this.mm=mm;this.wrap.innerHTML="";
    if(!mm?.sheets?.length)return;
    const sheet=mm.sheets[mm.currentIndex];if(!sheet?.root)return;
    doLayout(sheet.root);this._root=sheet.root;
    this._buildSVG();this._redraw();this.fitView();
  }

  // 轻量更新：重新布局 + 重绘，保持当前 pan/zoom
  update(){
    if(!this._root||!this._svg)return;
    doLayout(this._root);
    this._redraw();
    this._tf();
  }

  _buildSVG(){
    const svg=se("svg");
    svg.style.cssText="width:100%;height:100%;display:block;cursor:grab;";
    // 渐变 + 滤镜定义
    const defs=se("defs");
    defs.innerHTML=`
      <linearGradient id="xm-rg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#818CF8"/>
        <stop offset="100%" stop-color="#4F46E5"/>
      </linearGradient>
      ${PAL.map((p,i)=>`
        <linearGradient id="xm-g${i}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stop-color="${p.main}"/>
          <stop offset="100%" stop-color="${p.dark}"/>
        </linearGradient>`).join("")}
      <pattern id="xm-grid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
        <circle cx="0.75" cy="0.75" r="0.75" fill="#CBD5E1" opacity="0.5"/>
      </pattern>`;
    svg.appendChild(defs);
    // 背景
    const bg=se("rect",{width:"100%",height:"100%",fill:"#F8FAFC"});
    svg.appendChild(bg);
    const grid=se("rect",{width:"100%",height:"100%",fill:"url(#xm-grid)"});
    svg.appendChild(grid);
    // 画布组
    const g=se("g");g.setAttribute("class","xm-canvas");svg.appendChild(g);
    this._svg=svg;this._g=g;
    this._eg=se("g");this._ng=se("g");g.appendChild(this._eg);g.appendChild(this._ng);

    // 平移
    svg.addEventListener("mousedown",e=>{
      if(e.button!==0||e.target.closest(".xm-node"))return;
      this._commitEdit();e.preventDefault();
      const ox=this._pan.x,oy=this._pan.y,sx=e.clientX,sy=e.clientY;
      const mv=ev=>{this._pan.x=ox+(ev.clientX-sx);this._pan.y=oy+(ev.clientY-sy);this._tf();};
      const up=()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);svg.style.cursor="grab";};
      window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);svg.style.cursor="grabbing";
    });
    // 缩放
    svg.addEventListener("wheel",e=>{
      this._commitEdit();
      e.preventDefault();const f=e.deltaY<0?1.11:0.90,ns=Math.max(0.12,Math.min(3,this._sc*f));
      const r=svg.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
      this._pan.x=mx-(mx-this._pan.x)*(ns/this._sc);this._pan.y=my-(my-this._pan.y)*(ns/this._sc);
      this._sc=ns;this._tf();
    },{passive:false});
    // 空白取消选中（就地更新，不重建 DOM）
    svg.addEventListener("click",e=>{
      if(!e.target.closest(".xm-node")){const prev=this.selected;this.selected=null;this._applySel(prev,null);this.onSelect?.(null);}
    });
    this.wrap.appendChild(svg);
  }

  _redraw(){
    if(!this._root)return;
    this._eg.innerHTML="";this._ng.innerHTML="";
    this._nodeEls.clear();
    this._drawEdges(this._eg,this._root);
    this._drawNodes(this._ng,this._root);
  }

  // 计算节点的 filter 样式（选中/未选中）
  _filterFor(n,sel){
    const pal=PAL[n._bi%PAL.length];
    if(n._l===0) return sel
      ?"drop-shadow(0 0 14px rgba(99,102,241,0.7)) drop-shadow(0 8px 24px rgba(99,102,241,0.45))"
      :"drop-shadow(0 6px 20px rgba(99,102,241,0.38)) drop-shadow(0 2px 6px rgba(99,102,241,0.2))";
    if(n._l===1) return sel
      ?`drop-shadow(0 0 10px ${pal.main}99) drop-shadow(0 4px 14px ${pal.main}55)`
      :`drop-shadow(0 3px 10px ${pal.main}44) drop-shadow(0 1px 4px ${pal.main}22)`;
    if(n._l===2) return sel
      ?`drop-shadow(0 0 0 2px ${pal.main}) drop-shadow(0 4px 12px rgba(0,0,0,0.12))`
      :"drop-shadow(0 1px 4px rgba(0,0,0,0.08)) drop-shadow(0 2px 8px rgba(0,0,0,0.04))";
    return sel
      ?`drop-shadow(0 0 0 1.5px ${pal.main}) drop-shadow(0 2px 8px rgba(0,0,0,0.10))`
      :"drop-shadow(0 1px 3px rgba(0,0,0,0.06))";
  }

  // 就地切换选中高亮，不重建 DOM
  _applySel(prev,next){
    if(prev){const el=this._nodeEls.get(prev.id);if(el)el.style.filter=this._filterFor(prev,false);}
    if(next){const el=this._nodeEls.get(next.id);if(el)el.style.filter=this._filterFor(next,true);}
  }

  // ── 连线：细腻贝塞尔，带颜色渐变感 ──
  _drawEdges(g,n){
    if(!n||n.collapsed||!n.children.length)return;
    const x1=rpx(n)+n._w, cy1=rpy(n)+n._h/2;
    for(const c of n.children){
      const x2=rpx(c), cy2=rpy(c)+c._h/2, mx=(x1+x2)/2;
      const pal=PAL[(n._l===0?c._bi:n._bi)%PAL.length];
      // 外描边（产生双层效果）
      if(n._l===0){
        const outer=se("path",{d:`M${x1},${cy1} C${mx},${cy1} ${mx},${cy2} ${x2},${cy2}`,
          fill:"none",stroke:pal.muted,"stroke-width":"3.5","stroke-linecap":"round","stroke-opacity":"0.4"});
        g.appendChild(outer);
      }
      const path=se("path",{d:`M${x1},${cy1} C${mx},${cy1} ${mx},${cy2} ${x2},${cy2}`,
        fill:"none",stroke:pal.main,
        "stroke-width":n._l===0?"2":n._l===1?"1.5":"1.5",
        "stroke-opacity":n._l===0?"0.6":n._l===1?"0.45":"0.35",
        "stroke-linecap":"round"});
      g.appendChild(path);
      this._drawEdges(g,c);
    }
  }

  _drawNodes(g,n){if(!n)return;this._oneNode(g,n);if(!n.collapsed)for(const c of n.children)this._drawNodes(g,c);}

  // ── 节点：现代分层设计 ──
  _oneNode(g,n){
    const{_w:w,_h:h,_rx:rx,_lines:lines,_sp:sp,_l:l,_bi:bi}=n;
    const x=rpx(n),y=rpy(n),pal=PAL[bi%PAL.length],isSel=this.selected?.id===n.id;
    const ng=se("g");ng.setAttribute("class","xm-node");ng.style.cursor="grab";

    // ── 根节点：渐变胶囊 + 大光晕 ──
    if(l===0){
      if(isSel){
        // 选中脉冲环
        ng.style.filter="drop-shadow(0 0 14px rgba(99,102,241,0.7)) drop-shadow(0 8px 24px rgba(99,102,241,0.45))";
      }else{
        ng.style.filter="drop-shadow(0 6px 20px rgba(99,102,241,0.38)) drop-shadow(0 2px 6px rgba(99,102,241,0.2))";
      }
      ng.appendChild(se("rect",{x,y,width:w,height:h,rx,fill:"url(#xm-rg)"}));
      this._addText(ng,n,x,y,w,h,lines,sp,"#FFFFFF","rgba(255,255,255,0.85)");
    }
    // ── 一级：实色胶囊 ──
    else if(l===1){
      if(isSel){
        ng.style.filter=`drop-shadow(0 0 10px ${pal.main}99) drop-shadow(0 4px 14px ${pal.main}55)`;
      }else{
        ng.style.filter=`drop-shadow(0 3px 10px ${pal.main}44) drop-shadow(0 1px 4px ${pal.main}22)`;
      }
      ng.appendChild(se("rect",{x,y,width:w,height:h,rx,fill:`url(#xm-g${bi%PAL.length})`}));
      this._addText(ng,n,x,y,w,h,lines,sp,"#FFFFFF","rgba(255,255,255,0.8)");
    }
    // ── 二级：白色卡片 + 顶部彩条 ──
    else if(l===2){
      const shadow=isSel
        ?`drop-shadow(0 0 0 2px ${pal.main}) drop-shadow(0 4px 12px rgba(0,0,0,0.12))`
        :"drop-shadow(0 1px 4px rgba(0,0,0,0.08)) drop-shadow(0 2px 8px rgba(0,0,0,0.04))";
      ng.style.filter=shadow;
      // 白底
      ng.appendChild(se("rect",{x,y,width:w,height:h,rx,fill:"#FFFFFF",stroke:pal.muted,"stroke-width":"1.2"}));
      // 顶部彩条（宽=节点宽，高=3px，上圆角）
      const topBar=se("rect",{x,y,width:w,height:3,rx:rx});
      topBar.style.fill=pal.main;
      ng.appendChild(topBar);
      // 裁剪底部圆角（用遮罩防止顶部色条穿透圆角）
      const mask=se("rect",{x,y:y+3,width:w,height:3,fill:"#FFFFFF"});
      ng.appendChild(mask);
      this._addText(ng,n,x,y,w,h,lines,sp,"#1E293B","#64748B");
    }
    // ── 三级及以下：极简卡片 ──
    else{
      const shadow=isSel
        ?`drop-shadow(0 0 0 1.5px ${pal.main}) drop-shadow(0 2px 8px rgba(0,0,0,0.10))`
        :"drop-shadow(0 1px 3px rgba(0,0,0,0.06))";
      ng.style.filter=shadow;
      ng.appendChild(se("rect",{x,y,width:w,height:h,rx,fill:pal.soft,stroke:pal.muted,"stroke-width":"1"}));
      this._addText(ng,n,x,y,w,h,lines,sp,pal.dark,"#6B7280");
    }

    // ── 折叠/展开按钮（现代 chevron 风格）──
    if(n.children.length){
      const bx=x+w+11, by=y+h/2;
      const isOpen=!n.collapsed;
      // 小圆圈底板
      const circ=se("circle",{cx:bx,cy:by,r:9,
        fill:l<=1?"rgba(255,255,255,0.18)":"#FFFFFF",
        stroke:l<=1?"rgba(255,255,255,0.5)":pal.muted,
        "stroke-width":"1"});
      circ.style.filter="drop-shadow(0 1px 2px rgba(0,0,0,0.12))";
      // 展开/折叠符号（使用 chevron 路径）
      const size=4;
      let d;
      if(isOpen){
        // ▾ 向下 chevron
        d=`M${bx-size},${by-size/2} L${bx},${by+size/2} L${bx+size},${by-size/2}`;
      }else{
        // ▸ 向右 chevron
        d=`M${bx-size/2},${by-size} L${bx+size/2},${by} L${bx-size/2},${by+size}`;
      }
      const chev=se("path",{d,fill:"none",
        stroke:l<=1?"rgba(255,255,255,0.9)":pal.main,
        "stroke-width":"1.5","stroke-linecap":"round","stroke-linejoin":"round"});
      chev.style.cssText="pointer-events:none;";
      const btn=se("g");btn.style.cursor="pointer";
      btn.appendChild(circ);btn.appendChild(chev);
      btn.addEventListener("click",e=>{
        e.stopPropagation();n.collapsed=!n.collapsed;doLayout(this._root);this._redraw();
      });
      ng.appendChild(btn);
    }

    // ── 拖拽 ──
    ng.addEventListener("mousedown",e=>{
      if(e.button!==0)return;e.stopPropagation();e.preventDefault();
      const sx=e.clientX,sy=e.clientY,odx=n._dx||0,ody=n._dy||0;let moved=false;
      const mv=ev=>{
        const dx=(ev.clientX-sx)/this._sc,dy=(ev.clientY-sy)/this._sc;
        if(!moved&&(Math.abs(dx)>4||Math.abs(dy)>4))moved=true;
        if(moved){n._dx=odx+dx;n._dy=ody+dy;this._redraw();}
      };
      const up=()=>{
        window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);
        if(moved){this.onDragEnd?.(n);}
        else{const prev=this.selected;this.selected=n;this._applySel(prev,n);this.onSelect?.(n);}
      };
      window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    });
    // ── 双击（DOM 不被销毁，原生事件正常触发）──
    ng.addEventListener("dblclick",e=>{e.stopPropagation();this.selected=n;this.onDblClick?.(n);});
    this._nodeEls.set(n.id,ng);
    g.appendChild(ng);
  }

  _addText(ng,n,x,y,w,h,lines,sp,tc,tc2){
    const txtEl=se("text",{"text-anchor":"middle","font-size":sp.fs,
      "font-family":"system-ui,-apple-system,sans-serif","font-weight":sp.fw,fill:tc});
    txtEl.style.cssText="pointer-events:none;user-select:none;";
    const cx=x+w/2,totalTH=lines.length*sp.lh;
    if(lines.length===1){
      txtEl.setAttribute("x",cx);txtEl.setAttribute("y",y+h/2);
      txtEl.setAttribute("dominant-baseline","middle");txtEl.textContent=lines[0];
    }else{
      const startY=y+h/2-totalTH/2+sp.lh*0.72;
      lines.forEach((line,i)=>{const ts=se("tspan",{x:cx,y:startY+i*sp.lh});ts.textContent=line;txtEl.appendChild(ts);});
    }
    ng.appendChild(txtEl);
  }

  // 如果正在编辑，触发 blur 提交后关闭
  _commitEdit(){const ta=this.wrap.querySelector("textarea");if(ta)ta.blur();}

  _tf(){if(this._g)this._g.setAttribute("transform",`translate(${this._pan.x},${this._pan.y}) scale(${this._sc})`);}

  fitView(){
    if(!this._svg||!this._g)return;
    const try_=()=>{
      const sr=this._svg.getBoundingClientRect();if(!sr.width){setTimeout(try_,120);return;}
      try{
        const bb=this._g.getBBox();if(!bb.width||!bb.height){setTimeout(try_,120);return;}
        const sx=(sr.width*.85)/bb.width,sy=(sr.height*.85)/bb.height;
        this._sc=Math.min(sx,sy,1.0);
        this._pan.x=(sr.width-bb.width*this._sc)/2-bb.x*this._sc;
        this._pan.y=(sr.height-bb.height*this._sc)/2-bb.y*this._sc;
        this._tf();
      }catch{setTimeout(try_,120);}
    };
    try_();
  }
}

/* ══════════════════════════════════════════
   编辑器
══════════════════════════════════════════ */
class XMindEditor {
  constructor(mm,cb){this.mm=mm;this.cb=cb;}
  _sh(){return this.mm.sheets[this.mm.currentIndex];}
  _par(root,id){for(const c of root.children){if(c.id===id)return root;const f=this._par(c,id);if(f)return f;}return null;}
  _find(root,id){if(root.id===id)return root;for(const c of root.children){const f=this._find(c,id);if(f)return f;}return null;}
  addChild(pid){
    const p=pid?this._find(this._sh().root,pid):this._sh().root;if(!p)return null;
    const n={id:uid(),title:"新节点",collapsed:false,children:[],_dx:0,_dy:0};
    p.children.push(n);p.collapsed=false;this.cb();return n;
  }
  addSibling(id){
    const sh=this._sh();if(sh.root.id===id)return this.addChild(id);
    const par=this._par(sh.root,id);if(!par)return null;
    const i=par.children.findIndex(c=>c.id===id);
    const n={id:uid(),title:"新节点",collapsed:false,children:[],_dx:0,_dy:0};
    par.children.splice(i+1,0,n);this.cb();return n;
  }
  del(id){
    const sh=this._sh();if(sh.root.id===id)return false;
    const par=this._par(sh.root,id);if(!par)return false;
    par.children=par.children.filter(c=>c.id!==id);this.cb();return true;
  }
  rename(id,title){
    const n=this._find(this._sh().root,id);
    if(n){n.title=title;n._cachedTitle=null;this.cb();}
  }
}

/* ══════════════════════════════════════════
   内联编辑框
══════════════════════════════════════════ */
function inlineEdit(wrap,n,svg,g,renderer,editor){
  const pt=svg.createSVGPoint(),ctm=g.getScreenCTM(),cr=wrap.getBoundingClientRect();
  if(!ctm)return;
  pt.x=rpx(n);pt.y=rpy(n);const sp=pt.matrixTransform(ctm),sx=ctm.a,sy=ctm.d;
  const pal=PAL[n._bi%PAL.length];
  const isBright=n._l<=1;

  const inp=document.createElement("textarea");
  inp.value=n.title;
  inp.style.cssText=`
    position:absolute;
    left:${sp.x-cr.left}px;top:${sp.y-cr.top}px;
    width:${n._w*sx}px;min-height:${n._h*sy}px;
    font-size:${n._sp.fs*sx}px;
    font-family:system-ui,-apple-system,sans-serif;
    font-weight:${n._sp.fw};
    line-height:${n._sp.lh*sy}px;
    text-align:center;
    border:2px solid ${isBright?"rgba(255,255,255,0.6)":pal.main};
    border-radius:${n._rx*sx}px;
    background:${isBright?pal.main+"cc":"#FFFFFF"};
    color:${isBright?"#FFFFFF":pal.dark};
    outline:none;z-index:300;
    padding:${n._sp.vPad*sy*.6}px ${(n._sp.hPad/2)*sx*.6}px;
    box-sizing:border-box;
    box-shadow:0 0 0 3px ${pal.main}30, 0 8px 24px rgba(0,0,0,0.14);
    resize:none;overflow:hidden;backdrop-filter:blur(2px);`;
  inp.style.height="auto";
  wrap.style.position="relative";
  wrap.appendChild(inp);
  const resize=()=>{inp.style.height="auto";inp.style.height=inp.scrollHeight+"px";};
  inp.addEventListener("input",resize);resize();
  inp.focus();inp.select();
  const commit=()=>{
    if(!inp.parentNode)return; // 已提交过，防重入
    const v=inp.value.trim();if(v&&v!==n.title)editor.rename(n.id,v);
    inp.remove();renderer.update();
  };
  inp.addEventListener("blur",commit);
  inp.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.preventDefault();inp.remove();renderer.update();}
    if(e.key==="Enter"&&e.altKey){resize();}
  });
}

/* ══════════════════════════════════════════
   Obsidian FileView
══════════════════════════════════════════ */
const VIEW_TYPE="xmind-viewer";

// CSS 注入（全局一次）
const STYLE_ID="xm-plugin-style";
function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement("style");s.id=STYLE_ID;
  s.textContent=`
    .xm-toolbar{
      display:flex;align-items:center;height:46px;padding:0 16px;gap:2px;flex-shrink:0;
      background:#FFFFFF;border-bottom:1px solid #E5E7EB;
      font-family:-apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif;
    }
    .xm-brand{
      display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;
      color:#6366F1;margin-right:8px;user-select:none;white-space:nowrap;
    }
    .xm-brand-dot{
      width:8px;height:8px;border-radius:50%;
      background:linear-gradient(135deg,#818CF8,#4F46E5);
      box-shadow:0 1px 4px rgba(99,102,241,0.5);
      flex-shrink:0;
    }
    .xm-sep{width:1px;height:18px;background:#E5E7EB;margin:0 6px;flex-shrink:0;}
    .xm-tabs{display:flex;gap:2px;align-items:center;}
    .xm-tab{
      height:28px;padding:0 10px;border-radius:6px;border:none;cursor:pointer;
      font-size:12px;font-weight:400;background:transparent;color:#6B7280;
      transition:background .12s,color .12s;white-space:nowrap;
    }
    .xm-tab:hover{background:#F3F4F6;color:#374151;}
    .xm-tab.active{background:#EEF2FF;color:#6366F1;font-weight:600;}
    .xm-spacer{flex:1;}
    .xm-btn{
      height:30px;padding:0 10px;border-radius:6px;border:none;cursor:pointer;
      font-size:12px;font-weight:500;background:transparent;color:#4B5563;
      transition:background .12s,color .12s;display:flex;align-items:center;gap:4px;white-space:nowrap;
    }
    .xm-btn:hover{background:#F3F4F6;color:#111827;}
    .xm-btn.danger:hover{background:#FEF2F2;color:#DC2626;}
    .xm-btn.outlined{border:1px solid #E5E7EB;}
    .xm-btn.primary{
      background:#6366F1;color:#FFFFFF;font-weight:600;
      box-shadow:0 1px 3px rgba(99,102,241,0.3);
    }
    .xm-btn.primary:hover{background:#4F46E5;}
    .xm-dirty{font-size:11px;color:#F59E0B;margin-left:4px;user-select:none;}
    .xm-statusbar{
      height:26px;padding:0 16px;display:flex;align-items:center;gap:16px;
      background:#F9FAFB;border-bottom:1px solid #F3F4F6;flex-shrink:0;
      font-family:system-ui,sans-serif;font-size:11px;color:#9CA3AF;
    }
    .xm-statusbar .xm-node-info{margin-left:auto;color:#6366F1;font-weight:500;}
  `;
  document.head.appendChild(s);
}

class XMindView extends FileView {
  constructor(leaf){super(leaf);this.mm=null;this._dirty=false;this._ob=null;this.renderer=null;this.editor=null;this._sel=null;}
  getViewType(){return VIEW_TYPE;}
  getIcon(){return "brain-circuit";}
  getDisplayText(){return this.file?.basename||"XMind";}
  canAcceptExtension(e){return e==="xmind";}

  async onLoadFile(file){
    injectStyle();
    this.contentEl.empty();
    this.contentEl.style.cssText="display:flex;flex-direction:column;height:100%;overflow:hidden;background:#F8FAFC;";
    try{
      this._ob=await this.app.vault.readBinary(file);
      this.mm=await new XMindParser().parse(this._ob);
    }catch(e){
      const d=this.contentEl.createDiv();
      d.style.cssText="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;font-family:system-ui;";
      d.innerHTML=`
        <div style="width:56px;height:56px;border-radius:16px;background:#FEF2F2;display:flex;align-items:center;justify-content:center;font-size:24px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;color:#111827;">无法解析此文件</div>
        <div style="font-size:12px;color:#9CA3AF;max-width:320px;text-align:center;">${e.message}</div>`;
      return;
    }
    this._buildUI();
  }
  async onUnloadFile(file){if(this._dirty)await this._save();}

  _buildUI(){
    /* ── 工具栏 ── */
    const tb=this.contentEl.createDiv({cls:"xm-toolbar"});

    // 品牌
    const brand=tb.createDiv({cls:"xm-brand"});
    brand.createDiv({cls:"xm-brand-dot"});
    brand.createEl("span",{text:this.file?.basename||"XMind"});

    tb.createDiv({cls:"xm-sep"});

    // Sheet 标签
    this._tabsEl=tb.createDiv({cls:"xm-tabs"});
    this._renderTabs();

    tb.createDiv({cls:"xm-spacer"});

    // 视图操作组
    const mkBtn=(text,tip,cls="")=>{
      const b=tb.createEl("button",{text,title:tip,cls:`xm-btn ${cls}`});
      return b;
    };

    mkBtn("适应","适应视图").onclick=()=>this.renderer?.fitView();
    mkBtn("复位","还原自动布局").onclick=()=>this._resetOffsets();

    tb.createDiv({cls:"xm-sep"});

    // 编辑操作组
    mkBtn("+ 子节点","添加子节点  Tab").onclick=()=>this._addChild();
    mkBtn("+ 兄弟","添加兄弟节点  Enter").onclick=()=>this._addSibling();
    mkBtn("删除","删除节点  Delete","danger").onclick=()=>this._deleteSel();
    mkBtn("重命名","重命名节点  F2").onclick=()=>this._editSel();

    tb.createDiv({cls:"xm-sep"});

    // 外部打开
    mkBtn("↗ XMind","在 XMind 应用中打开","outlined").onclick=()=>this._openInXMind();

    // 保存
    mkBtn("保存","保存文件  Ctrl+S","primary").onclick=()=>this._save();

    this._dot=tb.createEl("span",{cls:"xm-dirty"});

    /* ── 状态栏 ── */
    const sb=this.contentEl.createDiv({cls:"xm-statusbar"});
    ["单击选中","双击编辑","拖拽节点移位","滚轮缩放","空白处拖拽平移"].forEach(t=>{
      const s=sb.createEl("span");s.textContent=t;
    });
    this._nodeInfo=sb.createEl("span",{cls:"xm-node-info"});

    /* ── 画布 ── */
    const wrap=this.contentEl.createDiv();
    wrap.style.cssText="flex:1;overflow:hidden;position:relative;";
    wrap.setAttribute("tabindex","0");
    this._wrap=wrap;

    this.renderer=new XMindRenderer(wrap,{
      onSelect:n=>{
        this._sel=n;
        this._nodeInfo.textContent=n?n.title:"";
        wrap.focus();
      },
      onDblClick:n=>{
        this._sel=n;
        const svg=wrap.querySelector("svg"),g=wrap.querySelector(".xm-canvas");
        if(svg&&g)inlineEdit(wrap,n,svg,g,this.renderer,this.editor);
      },
      onDragEnd:()=>this._markDirty(),
    });
    this.editor=new XMindEditor(this.mm,()=>{this._markDirty();this.renderer.update();});
    this.renderer.render(this.mm);

    wrap.addEventListener("keydown",e=>{
      if(e.target.tagName==="TEXTAREA"){
        // 编辑中：Tab/Enter 先提交编辑，再执行添加动作
        if(e.key==="Tab"){e.preventDefault();this.renderer._commitEdit();this._addChild();return;}
        if(e.key==="Enter"&&!e.altKey){e.preventDefault();this.renderer._commitEdit();this._addSibling();return;}
        // 其余按键（Backspace、Alt+Enter、Escape、普通输入）交给 textarea 自行处理
        return;
      }
      if(e.key==="Tab"){e.preventDefault();this._addChild();}
      if(e.key==="Enter"){e.preventDefault();this._addSibling();}
      if(e.key==="Delete"){e.preventDefault();this._deleteSel();}
      if(e.key==="F2"){e.preventDefault();this._editSel();}
    });
    wrap.focus();
  }

  _renderTabs(){
    this._tabsEl.empty();
    this.mm.sheets.forEach((s,i)=>{
      const a=i===this.mm.currentIndex;
      const t=this._tabsEl.createEl("button",{text:s.title,cls:`xm-tab${a?" active":""}`});
      t.onclick=()=>{this.mm.currentIndex=i;this.renderer.selected=null;this._sel=null;this._renderTabs();this.renderer.render(this.mm);};
    });
  }

  _markDirty(){this._dirty=true;this._dot.textContent="● 未保存";}
  _addChild(){
    const anchor=this._sel||this.mm.sheets[this.mm.currentIndex].root;
    const oy=rpy(anchor);
    const n=this.editor.addChild(this._sel?.id??null);
    if(!n)return;
    // 补偿锚点位移，保持父节点视觉位置不动
    this.renderer._pan.y+=(oy-rpy(anchor))*this.renderer._sc;
    this.renderer._tf();
    this.renderer.selected=n;this._sel=n;this.renderer._applySel(null,n);this._editSel();
  }
  _addSibling(){
    if(!this._sel){this._addChild();return;}
    const anchor=this._sel;
    const oy=rpy(anchor);
    const n=this.editor.addSibling(this._sel.id);
    if(!n)return;
    this.renderer._pan.y+=(oy-rpy(anchor))*this.renderer._sc;
    this.renderer._tf();
    this.renderer.selected=n;this._sel=n;this.renderer._applySel(null,n);this._editSel();
  }
  _deleteSel(){
    if(!this._sel){new Notice("请先选择要删除的节点");return;}
    if(!this.editor.del(this._sel.id)){new Notice("根节点无法删除");return;}
    this._sel=null;this.renderer.selected=null;
  }
  _editSel(){
    if(!this._sel)return;
    const svg=this._wrap?.querySelector("svg"),g=this._wrap?.querySelector(".xm-canvas");
    if(svg&&g)inlineEdit(this._wrap,this._sel,svg,g,this.renderer,this.editor);
  }
  _resetOffsets(){
    const walk=n=>{n._dx=0;n._dy=0;n.children.forEach(walk);};
    this.mm.sheets.forEach(s=>walk(s.root));
    this.renderer.render(this.mm);this._markDirty();
  }
  async _openInXMind(){
    if(!this.file){new Notice("没有打开的文件");return;}
    if(this._dirty){await this._save();if(this._dirty)return;}
    try{
      const path=require("path"),{shell}=require("electron");
      const full=path.join(this.app.vault.adapter.basePath,this.file.path);
      const err=await shell.openPath(full);if(err)throw new Error(err);
    }catch(e){new Notice("❌ 无法打开 XMind："+e.message);}
  }
  async _save(){
    if(!this.file)return;
    try{
      const buf=await new XMindSerializer().serialize(this.mm,this._ob);
      this._ob=buf;await this.app.vault.modifyBinary(this.file,buf);
      this._dirty=false;this._dot.textContent="";new Notice("✅ 已保存");
    }catch(e){new Notice("❌ 保存失败："+e.message);}
  }
}

/* ══════════════════════════════════════════
   插件入口
══════════════════════════════════════════ */
class XMindViewerPlugin extends Plugin {
  async onload(){
    this.registerView(VIEW_TYPE,leaf=>new XMindView(leaf));
    this.registerExtensions(["xmind"],VIEW_TYPE);
    this.addCommand({
      id:"xmind-save",name:"保存 XMind 文件",
      hotkeys:[{modifiers:["Mod"],key:"s"}],
      checkCallback(checking){
        const v=this.app?.workspace?.activeLeaf?.view;
        if(v instanceof XMindView){if(!checking)v._save();return true;}return false;
      },
    });
    this.registerEvent(this.app.workspace.on("file-menu",(menu,file)=>{
      if(file?.extension==="xmind")
        menu.addItem(i=>i.setTitle("用 XMind 查看器打开").setIcon("brain-circuit")
          .onClick(()=>this.app.workspace.getLeaf(false).openFile(file)));
    }));
  }
  onunload(){
    if(_msv&&document.body.contains(_msv))_msv.remove();_msv=null;
    const s=document.getElementById(STYLE_ID);if(s)s.remove();
  }
}

module.exports=XMindViewerPlugin;
