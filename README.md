# Obsidian XMind Viewer

An Obsidian plugin for viewing and editing `.xmind` files directly inside your vault.

![Obsidian](https://img.shields.io/badge/Obsidian-1.6.5%2B-7C3AED)
![Version](https://img.shields.io/badge/version-0.1.0-blue)

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
  | `Delete` | Delete selected node |
  | `F2` | Enter edit mode |
  | `Escape` | Cancel edit |

- **Mouse interaction** — drag nodes to reposition, scroll to zoom, drag background to pan
- **Multi-sheet support** — tab bar at the top switches between sheets
- **Save** — writes changes back to the original `.xmind` file (Ctrl+S)
- **Open in XMind** — launch the native XMind app for advanced editing

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/0akaisora/obsidian-xmind-viewer/releases)
2. Copy the files into `<vault>/.obsidian/plugins/xmind-viewer/`
3. Enable the plugin in **Settings → Community plugins**

## Usage

Open any `.xmind` file in your vault. The plugin registers itself as the default viewer for the `.xmind` extension.

### Editing

- **Select** a node with a single click
- **Edit** with a double-click or `F2`
- **Add child** with `Tab`, **add sibling** with `Enter`
- **Save** with `Ctrl+S` or the Save button in the toolbar

### Navigation

- **Zoom** with the scroll wheel
- **Pan** by dragging the background
- **Fit view** is applied automatically on file open

## Development

```bash
git clone https://github.com/0akaisora/obsidian-xmind-viewer.git
cd obsidian-xmind-viewer
# Copy files into your vault's plugin folder and reload Obsidian
```

The plugin is a single-file build (`main.js`). No bundler or `node_modules` required.

## License

MIT
