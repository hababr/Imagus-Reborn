# Imagus Reborn

A browser extension for Chrome, Edge, and Firefox that enlarges thumbnails and displays full-size images and videos from links on hover — without leaving the page.

Community home: [r/Imagus](https://www.reddit.com/r/Imagus)

---

## Table of Contents

- [What It Does](#what-it-does)
- [Key Features](#key-features)
- [Technologies Used](#technologies-used)
- [Repository Structure](#repository-structure)
- [Architecture Overview](#architecture-overview)
- [The Sieve System](#the-sieve-system)
- [Configuration & Defaults](#configuration--defaults)
- [Internationalization](#internationalization)
- [Building from Source](#building-from-source)

---

## What It Does

Imagus Reborn lets you hover over any image thumbnail or link on a webpage to instantly preview the full-size image or video in a popup — no clicks required. It uses a rule database called **Sieves** to know how to extract full-resolution media from hundreds of websites.

---

## Key Features

- Hover preview of full-size images and videos
- 500+ built-in extraction rules (Sieves) covering popular websites
- Full-screen zoom mode with multiple fit/resize options
- Image manipulation: rotate, flip, zoom
- Image history tracking
- One-click download of previewed images
- Reverse image search (TinEye, Google Lens, Bing, Yandex, ZXing, ImgOps)
- Live Sieve rule editor with syntax highlighting
- Remote Sieve repository for rule updates
- Customizable keyboard shortcuts, hover delay, popup placement, and CSS
- Incognito/private browsing support
- 13 UI languages

---

## Technologies Used

| Category | Technology |
|----------|-----------|
| Languages | JavaScript (vanilla, no transpilation) |
| Platform | WebExtensions API — Manifest V3 |
| Browsers | Chrome/Edge, Firefox (≥ 136) |
| Bundled libraries | ACE editor (Sieve rule editing), Beautify.js (code formatting) |
| Storage | `chrome.storage.local` / `chrome.storage.session` |
| Build tooling | Bash + `rsync` + `zip` |
| Internationalization | Chrome i18n API |
| Package manager | None — fully self-contained |

---

## Repository Structure

```
Imagus-Reborn/
├── build.sh                        # Build & package script (Chrome + Firefox)
└── src/                            # Extension source
    ├── manifest.json               # Chrome/Edge manifest (MV3)
    ├── manifest_firefox.json       # Firefox manifest (MV3)
    ├── _locales/                   # Translations (13 languages)
    │   └── <lang>/messages.json
    ├── background/
    │   └── service.js              # Service worker / background script
    ├── common/
    │   ├── app.js                  # Shared utilities used by all components
    │   └── img/                    # Extension icons
    ├── content/
    │   └── content.js              # Content script injected into web pages
    ├── data/
    │   ├── defaults.json           # Default settings
    │   ├── locales.json            # Supported locale metadata
    │   └── sieve.json              # Extraction rule database (500+ sites)
    ├── lib/
    │   ├── ace/                    # ACE editor (bundled)
    │   └── beautify.min.js         # Code beautifier (bundled)
    └── options/
        ├── options.html            # Settings page HTML
        ├── options.js              # Settings page logic
        ├── options.css             # Settings page styles
        └── SieveUI.js              # Sieve rule editor component
```

---

## Architecture Overview

The extension follows the standard three-component WebExtensions architecture:

```
┌──────────────────────────────────────┐
│     BACKGROUND  (service.js)         │
│  • Message routing & coordination    │
│  • Sieve loading, caching, updates   │
│  • Settings storage & defaults       │
│  • Download management               │
│  • Tab/badge management              │
└──────────┬───────────────────────────┘
           │  runtime.onMessage / Port
    ┌──────┴──────┐         ┌──────────────────────────────┐
    │             │         │   OPTIONS PAGE               │
    │  CONTENT    │         │   (options.html/js/css,      │
    │  SCRIPT     │         │    SieveUI.js)               │
    │             │         │  • Settings UI               │
    │ content.js  │         │  • Sieve rule editor (ACE)   │
    │             │         │  • Keyboard shortcut config  │
    │  Injected   │         │  • Grant permissions UI      │
    │  into every │         │  • Remote rule updates       │
    │  web page   │         └──────────────────────────────┘
    │             │
    │  • Hover/   │
    │    mouse    │
    │    events   │
    │  • Popup    │
    │    creation │
    │  • Sieve    │
    │    matching │
    │  • Image    │
    │    transforms│
    └─────────────┘
```

### Component responsibilities

**`background/service.js`** — The coordination hub. Handles:
- Loading `sieve.json` and user-defined rules from storage
- Pre-compiling regex patterns and caching results for performance
- Routing messages between the content script and the options page
- Managing file downloads with sanitized filenames
- Scheduling alarm-based auto-updates for remote Sieve repositories
- Updating the toolbar badge (e.g., hover-on/off state)

**`content/content.js`** — The largest file (~2,967 lines). Kept as a single file so the browser injects it as one unit with no module loader overhead. Handles:
- Listening for `mouseover` / `mouseout` events
- Detecting link, image, video, canvas, background-image, and image-map targets
- Applying Sieve rules to resolve full-resolution URLs
- Creating, positioning, and animating the preview popup
- Keyboard shortcuts (zoom, rotate, flip, download, reverse search, history)
- Full-screen zoom mode

**`options/`** — The settings UI. Handles:
- Persisting user preferences to `chrome.storage.local`
- Rendering and saving Sieve rules with the ACE code editor (`SieveUI.js`)
- Configuring keyboard shortcuts, hover behavior, popup CSS, and send-to hosts
- Requesting optional browser permissions (Grants)
- Triggering remote Sieve repository pulls

**`common/app.js`** — Shared utilities used across all components:
- `buildNodes()` — functional DOM element builder
- Port / message abstraction helpers
- Platform detection (`chrome` vs `firefox`)

---

## The Sieve System

Sieves are the core feature that makes Imagus Reborn work across hundreds of websites. They are stored in `src/data/sieve.json` and in user storage.

Each Sieve entry looks like:

```jsonc
"SiteName": {
  "link": "regex matching the page URL",     // optional
  "img":  "regex matching thumbnail URL",    // optional
  "res":  "regex or JS to extract full URL", // required
  "to":   "replacement string or function",  // required
  "note": "documentation / examples"         // optional
}
```

- **`link`** and **`img`** determine when the rule applies (URL matching).
- **`res`** and **`to`** together extract and transform the URL into the full-resolution address. `to` can be a plain replacement string using `$1`, `$2` capture groups, or an inline JavaScript expression for complex transformations.
- Rules prefixed with `_` are user-defined and are preserved when official rules are updated.
- Rules with `"off": 1` are disabled but kept in storage for easy re-enabling.

The background script pre-compiles all regex patterns when settings load, so the content script can run Sieve matching at hover time without recompilation overhead.

---

## Configuration & Defaults

All configurable settings and their defaults live in `src/data/defaults.json`, organized into four sections:

| Section | Contains |
|---------|----------|
| `hz` | Hover behavior: delay, zoom mode, placement, popup CSS, caption, history, media volume, full-screen settings |
| `tls` | Tools: auto-update toggle, send-to-host list (reverse image search), advanced mode |
| `keys` | Keyboard shortcut bindings (rotate, flip, zoom modes, open, send, history, etc.) |
| `grants` | Extra browser permissions requested by the user |

Settings are read from `chrome.storage.local` at startup; missing keys fall back to `defaults.json` values.

---

## Internationalization

The extension ships with translations for 13 languages in `src/_locales/`:

| Code | Language |
|------|----------|
| `en` | English (default) |
| `cs` | Czech |
| `de` | German |
| `el` | Greek |
| `es` | Spanish |
| `fr` | French |
| `hu` | Hungarian |
| `nl` | Dutch |
| `pl` | Polish |
| `pt_BR` | Portuguese (Brazil) |
| `ru` | Russian |
| `uk` | Ukrainian |
| `zh_CN` | Chinese (Simplified) |

Strings are referenced in source as `chrome.i18n.getMessage("KEY")` and in HTML as `__MSG_KEY__`. Adding a new language requires a `messages.json` in a new `_locales/<code>/` directory.

---

## Building from Source

Prerequisites: `bash`, `rsync`, `zip`

```bash
bash build.sh
```

This produces two zip files inside `build/`:

| File | Target |
|------|--------|
| `build/chrome/ImagusReborn_Chrome_v<version>.zip` | Chrome Web Store / Edge Add-ons |
| `build/firefox/ImagusReborn_Firefox_v<version>.zip` | Firefox Add-ons (AMO) |

The script:
1. Copies `src/` into `build/chrome/`, removes `manifest_firefox.json`, then zips.
2. Copies `src/` into `build/firefox/`, renames `manifest_firefox.json` → `manifest.json`, then zips.

The version string is read automatically from `manifest.json`'s `"version"` field.

> There is no test suite or linter configured in this project.
