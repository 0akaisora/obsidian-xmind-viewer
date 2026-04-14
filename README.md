# Obsidian XMind Viewer

An Obsidian plugin for viewing and editing `.xmind` files directly inside your vault.

![Obsidian](https://img.shields.io/badge/Obsidian-1.6.5%2B-7C3AED)
![Version](https://img.shields.io/badge/version-0.2.0-blue)

## Features

- **Open `.xmind` files** natively in Obsidian — no external app required
- **Modern SVG renderer** with layered node design and a multi-color palette
- **Inline editing** — double-click any node or press F2 to rename it
- **Keyboard-driven editing**

  | Key | Action |
  |-----|--------|
  | `Tab` | Add child node |
  | `Enter` | Add sibling node |
  | `Alt+Enter` | Insert newline inside edit box |
  | `Delete` | Delete selected node(s) |
  | `F2` | Enter edit mode |
  | `Escape` | Cancel edit |
  | `Space` (hold) | Switch to pan mode |

- **Marquee selection** — drag on background to select multiple nodes
- **Multi-select operations** — move or delete groups of nodes at once
- **Drag reparenting** — drag nodes close to another node to reparent them
- **Selection overlay** — selected nodes are highlighted with dashed borders
- **Refresh** — reload the file from disk without closing the view
- **Mouse interaction** — drag nodes to reposition, scroll to zoom, Space+drag to pan
- **Multi-sheet support** — tab bar at the top switches between sheets
- **Save** — writes changes back to the original `.xmind` file (Ctrl+S)
- **Open in XMind** — launch the native XMind app for advanced editing

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/0akaisora/obsidian-xmind-viewer/releases)
2. Copy the files into `<vault>/.obsidian/plugins/xmind-viewer/`
3. Enable the plugin in **Settings > Community plugins**

## Development

```bash
git clone https://github.com/0akaisora/obsidian-xmind-viewer.git
cd obsidian-xmind-viewer
npm install
npm run build       # one-shot build
npm run dev         # watch mode
```

### Project Structure

```
src/
  utils/          # ZIP, SVG, text measurement, uid
  model/          # Parser & Serializer
  layout/         # Tree layout algorithm & constants
  editor/         # Tree mutation operations (add/delete/rename/reparent)
  renderer/       # SVG renderer, inline editing
  view/           # Obsidian FileView integration
  main.js         # Plugin entry point
```

The build uses **esbuild** to bundle `src/` into a single `main.js`.

## License

MIT
