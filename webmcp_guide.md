# The Ultimate Guide to WebMCP: Client-Side Agent Tooling, Implementation & Evals

> **Status:** Draft W3C Machine Learning Community Group Specification (August 2026)  
> **Authors & Contributors:** Microsoft, Google, W3C Web Machine Learning CG  
> **Repository Scope:** Auxweave Canvas Editor & Web MCP Client-Agent Architecture

---

## Table of Contents
1. [Executive Summary & Core Architecture](#1-executive-summary--core-architecture)
2. [WebMCP Specification & WebIDL Interfaces](#2-webmcp-specification--webidl-interfaces)
3. [Imperative vs. Declarative WebMCP](#3-imperative-vs-declarative-webmcp)
4. [Step-by-Step Implementation Guide for Auxweave](#4-step-by-step-implementation-guide-for-auxweave)
5. [Exposing Canvas & Co-Design Tools](#5-exposing-canvas--co-design-tools)
6. [Security, Privacy & Threat Mitigations](#6-security-privacy--threat-mitigations)
7. [Setting Up Agent Evals & Benchmarks](#7-setting-up-agent-evals--benchmarks)
8. [Reference Implementation & Polyfill](#8-reference-implementation--polyfill)

---

## 1. Executive Summary & Core Architecture

### What is WebMCP?
**WebMCP (Web Model Context Protocol)** is a browser-native standard that allows web applications to expose client-side JavaScript functions directly as structured "tools" to AI agents, in-browser assistants (such as Chrome GeminiNano or extension-based agents), and assistive technologies.

Unlike traditional Model Context Protocol (MCP) servers operating over backend SSE or stdio channels, **WebMCP operates directly within the browser's document event loop**. Web pages act as client-side MCP servers, allowing humans and AI agents to manipulate application state in real-time within the same DOM sandbox.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER VIEWPORT                                │
│                                                                             │
│   ┌──────────────────────────┐               ┌──────────────────────────┐   │
│   │   Human User Interacts   │               │   AI Agent / WebMCP      │   │
│   │   (Mouse, Keyboard, UI)  │               │   (ModelContext API)     │   │
│   └────────────┬─────────────┘               └────────────┬─────────────┘   │
│                │                                          │                 │
│                ▼                                          ▼                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │               Auxweave React / State Engine                         │   │
│   │               document.modelContext.registerTool()                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Benefits
- **Zero Network Latency:** Executed natively in JavaScript on the client side.
- **Shared State Mirroring:** The agent executes code in the exact DOM / state context as the user.
- **Granular Lifecycle Control:** Uses `AbortSignal` for instant tool execution cancellation.
- **Browser Security Sandbox:** Operates under standard browser Same-Origin policy and iframe Permissions Policy (`permissions-policy: tools=*`).

---

## 2. WebMCP Specification & WebIDL Interfaces

The WebMCP spec extends the standard HTML `Document` interface with a `modelContext` property.

### WebIDL Definitions

```webidl
[Exposed=Window, SecureContext]
partial interface Document {
  [SameObject] readonly attribute ModelContext modelContext;
};

[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(
    ModelContextTool tool,
    optional ModelContextRegisterToolOptions options = {}
  );
  
  Promise<sequence<RegisteredTool>> getTools(
    optional ModelContextGetToolOptions options = {}
  );
  
  Promise<DOMString> executeTool(
    RegisteredTool tool,
    optional object inputObject = {},
    optional ModelContextExecuteToolOptions options = {}
  );
  
  attribute EventHandler ontoolchange;
};

dictionary ModelContextTool {
  required DOMString name;
  DOMString title;
  required DOMString description;
  required object inputSchema; // JSON Schema Object
  required ToolExecuteCallback execute;
  Annotations annotations;
};

callback ToolExecuteCallback = Promise<any> (
  object inputObject,
  ToolExecuteCallbackOptions options
);

dictionary ToolExecuteCallbackOptions {
  AbortSignal signal;
};

dictionary ModelContextRegisterToolOptions {
  AbortSignal signal;
  sequence<DOMString> exposedOrigins;
};

dictionary RegisteredTool {
  DOMString name;
  DOMString title;
  DOMString description;
  DOMString inputSchema; // Stringified JSON Schema
};
```

---

## 3. Imperative vs. Declarative WebMCP

WebMCP supports two distinct patterns for exposing capabilities to agents:

### 1. Imperative Registration (`registerTool`)
Best for rich interactive applications like Auxweave, where tools trigger internal state mutators, canvas rendering updates, or complex multi-step routines.

```typescript
document.modelContext.registerTool({
  name: 'create_shape',
  title: 'Create Canvas Shape',
  description: 'Adds a primitive geometric shape to the active Auxweave artboard.',
  inputSchema: {
    type: 'object',
    properties: {
      shapeType: { type: 'string', enum: ['rectangle', 'circle', 'star', 'polygon'] },
      width: { type: 'number', minimum: 10, maximum: 2000 },
      height: { type: 'number', minimum: 10, maximum: 2000 },
      fillColor: { type: 'string' }
    },
    required: ['shapeType', 'width', 'height']
  },
  execute: async (args, { signal }) => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return await canvasStore.addShape(args)
  }
})
```

### 2. Declarative WebMCP (HTML Form Annotations)
Best for standard form submissions, search bars, and static inputs where the browser automatically synthesizes tool schemas from standard HTML forms.

```html
<form 
  toolname="search_templates" 
  tooldescription="Searches design templates by keyword and category"
  action="/api/templates" 
  method="GET"
>
  <input type="text" name="query" required />
  <select name="category">
    <option value="poster">Poster</option>
    <option value="social">Social Media</option>
  </select>
  <button type="submit">Search</button>
</form>
```

---

## 4. Step-by-Step Implementation Guide for Auxweave

To enable native WebMCP agent co-design in Auxweave, follow this production-ready integration pattern.

### Step 1: Polyfill / Fallback Initialization (`frontend/src/lib/webmcp-bridge.ts`)

```typescript
/**
 * Auxiliary WebMCP Bridge for Auxweave
 * Polyfills document.modelContext if native browser implementation is not present.
 */

export type WebMCPTool = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: any, options: { signal: AbortSignal }) => Promise<any>
}

class AuxiliaryModelContext extends EventTarget {
  private tools = new Map<string, WebMCPTool>()

  async registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }) {
    if (options?.signal?.aborted) return
    this.tools.set(tool.name, tool)
    
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        this.tools.delete(tool.name)
        this.dispatchEvent(new Event('toolchange'))
      })
    }

    this.dispatchEvent(new Event('toolchange'))
  }

  async getTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      title: t.title ?? t.name,
      description: t.description,
      inputSchema: JSON.stringify(t.inputSchema)
    }))
  }

  async executeTool(toolRef: { name: string }, inputObject: object = {}, options?: { signal?: AbortSignal }) {
    const tool = this.tools.get(toolRef.name)
    if (!tool) throw new DOMException(`Tool '${toolRef.name}' not found`, 'NotFoundError')
    const controller = new AbortController()
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort())
    }
    return await tool.execute(inputObject, { signal: controller.signal })
  }
}

export function initWebMCP() {
  if (typeof window === 'undefined') return
  if (!('modelContext' in document)) {
    Object.defineProperty(document, 'modelContext', {
      value: new AuxiliaryModelContext(),
      writable: false,
      configurable: true
    })
  }
}
```

---

## 5. Exposing Canvas & Co-Design Tools

Auxweave exposes key tools for external agents to query scene state, insert elements, manipulate styling, and format artboards.

### Registered Tools Inventory

| Tool Name | Scope | Description | Primary Parameters |
| :--- | :--- | :--- | :--- |
| `get_canvas_state` | Read | Returns structured objects & bounds on active page | None |
| `add_shape_primitive` | Write | Adds rectangle, circle, polygon, or star primitive | `type`, `width`, `height`, `fill` |
| `update_object_transform` | Write | Updates position, scale, or rotation of canvas element | `objectId`, `x`, `y`, `rotation` |
| `apply_color_palette` | Write | Recolors elements using a color array | `colors`: string[] |
| `align_selected_objects` | Action | Aligns selected objects | `alignment`: `'left' \| 'center' \| 'right'` |

### Example Tool Implementation (`frontend/src/lib/auxweave-webmcp-tools.ts`)

```typescript
import { initWebMCP } from './webmcp-bridge'

export function registerAuxweaveWebMCPTools(editorStore: any) {
  initWebMCP()
  const mc = (document as any).modelContext

  // 1. Tool: Get Canvas State
  mc.registerTool({
    name: 'get_canvas_state',
    title: 'Get Canvas Scene Objects',
    description: 'Retrieves the complete structured scene graph of the active artboard.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const state = (window as any).__Auxweave_GET_STRUCTURED_STATE__?.()
      return { count: state?.length ?? 0, objects: state }
    }
  })

  // 2. Tool: Add Shape Primitive
  mc.registerTool({
    name: 'add_shape_primitive',
    title: 'Add Shape to Artboard',
    description: 'Creates a new shape element on the artboard canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        shapeType: { type: 'string', enum: ['rect', 'circle', 'star'] },
        x: { type: 'number' },
        y: { type: 'number' },
        fill: { type: 'string' }
      },
      required: ['shapeType']
    },
    execute: async (args: { shapeType: string; x?: number; y?: number; fill?: string }) => {
      // Mutate scene state via store dispatcher
      editorStore.getState().addObject({
        type: args.shapeType,
        x: args.x ?? 100,
        y: args.y ?? 100,
        fill: args.fill ?? '#7c3aed'
      })
      return { success: true }
    }
  })
}
```

---

## 6. Security, Privacy & Threat Mitigations

WebMCP introduces specific security considerations when browser pages expose direct execution handlers to autonomous agents.

### Key Risks & Defense Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEBMCP THREAT LANDSCAPE                            │
├────────────────────────────┬────────────────────────────────────────────────┤
│ Threat Vector              │ Mitigation Strategy                            │
├────────────────────────────┼────────────────────────────────────────────────┤
│ 1. Tool Poisoning          │ Strict Schema Validation & Input Length Caps   │
│ 2. Prompt Injection Attack │ Output Untrusted Annotations (`isUntrusted`)   │
│ 3. Misrepresentation Intent│ Confirmation Dialogs for Destructive Actions   │
│ 4. Cross-Origin Leakage    │ Origin Filtering (`exposedOrigins` whitelist)  │
└────────────────────────────┴────────────────────────────────────────────────┘
```

### Mitigation Implementation Rules
1. **Input Length Limits:** Truncate all agent string inputs to maximum reasonable limits (e.g. 1000 chars) before processing.
2. **Untrusted Annotations:** Mark responses containing user-generated content as `isUntrusted: true` to prevent indirect prompt injection.
3. **Same-Origin Boundaries:** Ensure `registerTool` options whitelist origins if tools should be accessible inside embedded iframes:
   ```typescript
   document.modelContext.registerTool(toolDef, {
     exposedOrigins: ['https://trusted-agent.domain.com']
   })
   ```

---

## 7. Setting Up Agent Evals & Benchmarks

To verify WebMCP integration quality, setup automated evaluations (Evals) testing tool discovery, input validation, execution accuracy, and abort handling.

### Evaluation Dimensions
1. **Tool Registration & Discovery (Target: 100%):** Asserts all declared tools appear in `getTools()`.
2. **Schema Adherence (Target: 100%):** Rejects invalid parameters before handler invocation.
3. **Execution Accuracy (Target: > 95%):** Correctly mutates state upon valid `executeTool()` calls.
4. **Abort Signal Responsiveness (Target: < 50ms):** Cancels ongoing promises immediately when `AbortSignal` fires.

### Automated Vitest Suite (`frontend/src/__tests__/webmcp-evals.test.ts`)

```typescript
import { describe, expect, it, beforeEach } from 'vitest'
import { initWebMCP } from '../lib/webmcp-bridge'

describe('WebMCP Agent Compliance Evals', () => {
  beforeEach(() => {
    initWebMCP()
  })

  it('EVAL-1: Should register and discover tools correctly', async () => {
    const mc = (document as any).modelContext
    await mc.registerTool({
      name: 'test_eval_tool',
      description: 'Eval tool description',
      inputSchema: { type: 'object' },
      execute: async () => ({ status: 'ok' })
    })

    const tools = await mc.getTools()
    const found = tools.find((t: any) => t.name === 'test_eval_tool')
    expect(found).toBeDefined()
    expect(found.description).toBe('Eval tool description')
  })

  it('EVAL-2: Should handle AbortSignal cancellation', async () => {
    const mc = (document as any).modelContext
    const ac = new AbortController()

    let executed = false
    await mc.registerTool({
      name: 'async_cancel_tool',
      description: 'Long running task',
      inputSchema: { type: 'object' },
      execute: async (_, { signal }) => {
        await new Promise(r => setTimeout(r, 500))
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        executed = true
        return { done: true }
      }
    })

    const [tool] = await mc.getTools()
    const promise = mc.executeTool(tool, {}, { signal: ac.signal })
    ac.abort()

    await expect(promise).rejects.toThrow()
    expect(executed).toBe(false)
  })
})
```

---

## 8. Summary & Checklist for Developers

- [x] Polyfill or verify `document.modelContext` availability.
- [x] Register read-only tool (`get_canvas_state`) for agent inspection.
- [x] Register write tools (`add_shape_primitive`, `update_object_transform`).
- [x] Implement `AbortSignal` handling inside all asynchronous execute callbacks.
- [x] Run Vitest Evals suite (`npm run test`) to confirm schema & execution compliance.
