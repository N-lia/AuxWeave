# AuxWeave

> **Co-Creative Design Studio: Humans and AI Agents Designing Together on a Shared Canvas**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live_Demo-aux--weaver.vercel.app-22c55e.svg)](https://aux-weaver.vercel.app/)
[![W3C WebMCP](https://img.shields.io/badge/Standard-W3C_WebMCP-6366f1.svg)](https://github.com/N-lia/AuxWeave)
[![Built with TypeScript](https://img.shields.io/badge/Built_with-TypeScript-3178c6.svg)](https://www.typescriptlang.org/)
[![React + Vite](https://img.shields.io/badge/Frontend-React_%2B_Vite-61dafb.svg)](https://vitejs.dev/)

AuxWeave is a **browser-native vector design studio** where humans and AI agents co-create on a shared live canvas in real-time. It's built on the emerging **W3C WebMCP (Web Model Context Protocol)** standard, enabling AI to understand and manipulate design semantically—not just as pixels.

**🌐 Live Application**: [https://aux-weaver.vercel.app/](https://aux-weaver.vercel.app/)

---

## 🎯 What Problem Does AuxWeave Solve?

Traditional generative AI design tools have fundamental limitations:

| Problem | AuxWeave Solution |
|---------|------------------|
| **Static Output**: DALL-E/Midjourney produce flat PNG files that can't be edited | Generate fully editable **vector designs** on the canvas |
| **Coordinate Guessing**: LLMs struggle with 2D spatial reasoning in 1D tokens | Use **semantic layout primitives** (Flexbox/Auto Layout) instead of pixel math |
| **Disconnected AI**: Chat-based assistants can't see selections or visual context | **Shared canvas** with real-time perception and editing |
| **Limited Iteration**: Regenerating entire designs for small tweaks | **Human-AI collaboration**—AI creates, humans refine, AI learns context |

---

## ✨ How It Works

### The Co-Creation Loop

```
  ┌─────────────────────────────────────────────────┐
  │        Shared Auxweave Canvas                   │
  │  (Live Scene Graph: Text, Shapes, Containers)   │
  └──────────────┬──────────────────────┬───────────┘
                 │                      │
    Live Visual Perception    Real-Time Tool Execution
                 │                      │
  ┌──────────────▼──────────────────────▼───────────┐
  │     W3C WebMCP (document.modelContext)          │
  │  • create_flex_container                        │
  │  • validate_layout • align_objects              │
  │  • add_text_element • apply_color_palette       │
  └──────────────▲──────────────────────▲───────────┘
                 │                      │
         Human Designer          AI Agent
    (Click, Edit, Drag)     (Chrome DevTools / Embedded)
```

### Key Innovation: Web-Native Primitives

Instead of blindly guessing coordinates, agents **declare semantic design intent**:

```typescript
// Agent tells Auxweave "I want a centered card with a headline and subtitle"
// Auxweave handles responsive layout automatically
create_flex_container({
  direction: "column",
  align: "center",
  gap: 16,
  padding: 24,
  children: [
    { type: "headline", text: "Hello, World!" },
    { type: "body", text: "This is a description" }
  ]
})
```

---

## 🚀 Core Features

### 1. **Web-Native Layout Engine**
- **Flexbox-based primitives** inspired by Paper.design and Figma Auto Layout
- Automatic child positioning—no manual coordinate math
- Responsive containers that adapt to content

### 2. **Bi-Directional Editing**
- Agent creates → Human edits → Agent refines
- Every object is a standard `SceneObject` (fully interactive)
- Real-time visual updates across both human and AI changes

### 3. **Automated Design QA**
- `validate_layout`: Check for overlaps, contrast issues, boundary bleeds
- `repair_layout`: Auto-fix collisions and unreadable text sizes
- WCAG compliance checking

### 4. **Visual Moodboards**
- Pin reference images and color palettes
- `get_moodboard_content`: Sample dominant colors
- `place_moodboard_image`: Reference visuals directly in designs

### 5. **Rich Asset Library**
- 30,000+ Hugeicons vector icons
- Unsplash image search integration
- Custom shape primitives (rectangles, circles, polygons, stars, arrows)

---

## 🛠️ WebMCP Tools Available

| Tool | Purpose |
|------|---------|
| `create_flex_container` | Build responsive layouts with Flexbox primitives |
| `wrap_in_flex_container` | Group loose items into aligned layouts |
| `apply_poster_template` | Typographic poster scaffolding |
| `add_text_element` | Rich typography with role-based sizing |
| `add_shape_primitive` | Vector shapes (rect, circle, polygon, star, line) |
| `add_hugeicon_symbol` | Insert 30k+ vector icons |
| `add_image_element` | Place images with anchor options |
| `update_transform` | Mutate position, dimension, rotation |
| `align_objects` | Optical alignment & distribution |
| `validate_layout` | Design QA scanning |
| `repair_layout` | Auto-fix layout issues |
| `apply_color_palette` | Harmonious color schemes |
| `get_canvas_scene_state` | Live artboard inspection |
| `get_moodboard_content` | Reference images & palettes |

---

## 🎬 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### 1. Clone & Install
```bash
git clone https://github.com/N-lia/AuxWeave.git
cd AuxWeave/frontend
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open **`http://localhost:3300`** (or see terminal for local dev URL)

### 3. Build for Production
```bash
npm run build
```

---

## 🧪 Testing with WebMCP

### Option A: Chrome DevTools (Official WebMCP Panel)
1. Open Chrome with [WebMCP Extension](https://github.com/GoogleChromeLabs/web-model-context-protocol)
2. Navigate to [aux-weaver.vercel.app/create](https://aux-weaver.vercel.app/create)
3. Press `F12` → **WebMCP** tab → See all tools listed
4. Execute any tool and watch the canvas update in real-time

### Option B: Embedded AI Agent Panel (In-App)
1. Click the **Magic/Agent** icon in the toolbar
2. Choose provider (AgentRouter, Google Gemini, OpenRouter, Nebius)
3. Enter API key and prompt:
   ```
   "Create a modern dark event flyer for AUXWEAVE 2026 with red accents"
   ```
4. Watch the agent compose the design live

---

## 🏗️ Architecture

| Layer | Technology |
|-------|-----------|
| **Frontend Framework** | React 19 + TypeScript + Vite |
| **Router** | TanStack Router (file-based routing) |
| **Styling** | Tailwind CSS + Lucide/Hugeicons |
| **State Management** | Zustand |
| **Scene Graph** | Custom vector engine (`SceneObject`, `SceneGroup`) |
| **Layout Solver** | Zero-dependency 1D/2D constraint solver |
| **WebMCP Bridge** | Standards-compliant protocol bridge |
| **Persistence** | Browser IndexedDB (JSON import/export) |
| **Backend** | Lean Elysia API (CORS proxy, Unsplash, sponsorships) |

---

## 📦 What's Included

```
AuxWeave/
├── frontend/          # React application (97% TypeScript)
│   ├── src/
│   │   ├── routes/    # File-based routing
│   │   ├── components/# React components
│   │   └── lib/       # WebMCP bridge, scene graph, flex solver
│   └── package.json
├── backend/           # Elysia API server
│   └── package.json
└── README.md
```

---

## 🔌 Backend API Routes

```
GET  /health                      # Health check
GET  /media/proxy?url=...         # CORS-safe image proxy
GET  /unsplash/photos             # Featured photos
GET  /unsplash/search             # Photo search
GET  /unsplash/download           # Track downloads
GET  /sponsor/config              # Sponsorship info
POST /sponsor/checkout            # Paystack checkout
GET  /sponsor/verify/:reference   # Payment verification
```

---

## 🎨 Design Philosophy

- **Local-First**: No auth required; everything persists in browser
- **Open Standard**: Compliant with W3C WebMCP
- **Developer-Friendly**: Modular tools, clean APIs, zero dependencies where possible
- **AI-Aware**: Designed from the ground up for AI collaboration
- **Accessible**: WCAG compliance checking built-in

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**. See [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

We welcome contributions! Whether it's bug reports, feature ideas, or code—open an issue or submit a PR.

## 🔗 Resources

- **Live App**: [aux-weaver.vercel.app](https://aux-weaver.vercel.app/)
- **W3C WebMCP Spec**: [WebMCP Standard](https://github.com/N-lia/AuxWeave)
- **Documentation**: See `/docs` folder for detailed guides

---

**Built with ❤️ for human-AI creative collaboration**
