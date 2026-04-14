/**
 * XMind Viewer — Obsidian 插件入口
 */
import { Plugin } from "obsidian";
import { cleanupMeasurer } from "./utils/measure.js";
import { XMindView, VIEW_TYPE } from "./view/xmind-view.js";

class XMindViewerPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new XMindView(leaf));
    this.registerExtensions(["xmind"], VIEW_TYPE);

    this.addCommand({
      id: "xmind-save",
      name: "保存 XMind 文件",
      hotkeys: [{ modifiers: ["Mod"], key: "s" }],
      checkCallback(checking) {
        const v = this.app?.workspace?.activeLeaf?.view;
        if (v instanceof XMindView) { if (!checking) v._save(); return true; }
        return false;
      },
    });

    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file?.extension === "xmind")
        menu.addItem(i => i.setTitle("用 XMind 查看器打开").setIcon("brain-circuit")
          .onClick(() => this.app.workspace.getLeaf(false).openFile(file)));
    }));
  }

  onunload() {
    cleanupMeasurer();
  }
}

module.exports = XMindViewerPlugin;
