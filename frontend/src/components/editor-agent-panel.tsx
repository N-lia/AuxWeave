import {
  AiMagicIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Key01Icon,
  Settings02Icon,
  SparklesIcon,
  StopIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  editorSidebarPanelLeftClass,
  editorSidebarPanelTopClass,
} from '../lib/editor-sidebar-panel-layout'
import {
  AGENTROUTER_API_URL,
  type AgentTraceStep,
  type ChatMessage,
  executeAgentTurn,
  getStoredApiKey,
  getStoredEndpoint,
  getStoredModel,
  getWebMCPContext,
  setStoredApiKey,
  setStoredEndpoint,
  setStoredModel,
  type ToolCallRecord,
} from '../lib/webmcp/webmcp-bridge'

type Props = {
  open: boolean
  onClose: () => void
  active: boolean
  onToggleActive: () => void
}

const QUICK_PROMPTS = [
  {
    title: 'HIV Awareness Flyer',
    prompt:
      'Create a powerful, high-impact flyer for an HIV Awareness campaign with creative obsidian and crimson color choices, bold typography hierarchy, and an educational U=U callout.',
  },
  {
    title: 'SIGNAL // 2025 Poster',
    prompt:
      'Design the "SIGNAL // 2025" Tech Conference Poster. Palette: Deep Obsidian #0B0F19 background, Electric Cyan #22D3EE accents, white headline "SIGNAL 2025", subtitle "The Future of AI, Infrastructure & Design Systems", and session pill tags (AI & ML, DEVOPS, DESIGN SYSTEMS, SECURITY).',
  },
  {
    title: 'Hero Title & Tag',
    prompt:
      'Add a prominent headline with a category pill badge above it, perfectly centered and balanced.',
  },
  {
    title: 'Balance & Contrast',
    prompt:
      'Analyze the current canvas layout and adjust typography and color contrast for maximum visual punch.',
  },
]

function formatToolSummary(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'add_text_element': {
      const text = typeof args.text === 'string' ? args.text : ''
      const preview = text.length > 28 ? `${text.slice(0, 28)}…` : text
      const role = args.role ? `[${args.role}] ` : ''
      return `Added text ${role}"${preview}"`
    }
    case 'add_shape_primitive': {
      const kind = typeof args.shapeKind === 'string' ? args.shapeKind : 'shape'
      const w = args.width ? `${args.width}w` : ''
      const h = args.height ? `×${args.height}h` : ''
      return `Created ${kind} ${w}${h}`.trim()
    }
    case 'add_hugeicon_symbol': {
      const name = typeof args.iconName === 'string' ? args.iconName : 'icon'
      return `Added icon "${name}"`
    }
    case 'add_image_element':
    case 'add_image': {
      return 'Placed image element'
    }
    case 'align_objects': {
      const align = typeof args.alignment === 'string' ? args.alignment : 'objects'
      return `Aligned: ${align}`
    }
    case 'apply_color_palette': {
      return 'Applied color palette'
    }
    case 'get_canvas_scene_state': {
      return 'Inspected canvas scene & dimensions'
    }
    case 'get_document_metadata': {
      return 'Checked document metadata & bounds'
    }
    case 'validate_layout': {
      return 'Validated layout constraints'
    }
    case 'repair_layout': {
      return 'Auto-repaired layout violations'
    }
    case 'get_design_language': {
      return 'Fetched design language tokens'
    }
    case 'get_design_skill': {
      return 'Fetched design skill playbook'
    }
    case 'apply_poster_template': {
      const headline = typeof args.headline === 'string' ? args.headline : ''
      const preview = headline.length > 28 ? `${headline.slice(0, 28)}…` : headline
      return `Generated poster "${preview}"`
    }
    default:
      return `Executed ${toolName}`
  }
}

function ToolTraceCard({
  tool,
  defaultExpanded = false,
}: {
  tool: ToolCallRecord
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isError = tool.status === 'error' || Boolean(tool.error)
  const isRunning = tool.status === 'running'

  return (
    <div className="rounded-xl border border-black/[0.08] bg-white overflow-hidden text-xs shadow-2xs">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-2 text-left hover:bg-neutral-50 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-neutral-400 shrink-0">
            <HugeiconsIcon icon={expanded ? ArrowDown01Icon : ArrowRight01Icon} size={12} />
          </span>
          <span
            className={`inline-flex items-center justify-center h-4 w-4 shrink-0 rounded-full text-[10px] font-bold ${
              isError
                ? 'bg-red-100 text-red-700'
                : isRunning
                  ? 'bg-amber-100 text-amber-700 animate-pulse'
                  : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {isError ? '✕' : isRunning ? '⚡' : '✓'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono text-[11px] font-bold text-neutral-900 truncate">
                {tool.toolName}
              </span>
              {tool.durationMs !== undefined && (
                <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                  {tool.durationMs}ms
                </span>
              )}
            </div>
            <div className="text-[10px] text-neutral-500 truncate">
              {formatToolSummary(tool.toolName, tool.args)}
            </div>
          </div>
        </div>

        <span className="text-[10px] font-medium text-blue-600 shrink-0 ml-2">
          {expanded ? 'Hide' : 'Inspect'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-black/[0.06] bg-neutral-950 p-2.5 space-y-2 text-[10px] font-mono text-neutral-200">
          {tool.reasoning && (
            <div className="space-y-1">
              <div className="text-violet-400 font-semibold uppercase tracking-wider text-[9px] font-sans">
                Reasoning for this choice:
              </div>
              <div className="text-neutral-300 font-sans text-[11px] leading-relaxed whitespace-pre-wrap bg-neutral-900/60 p-2 rounded-md">
                {tool.reasoning}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="text-amber-400 font-semibold uppercase tracking-wider text-[9px]">
              Selected Tool Parameters:
            </div>
            <pre className="max-h-36 overflow-y-auto rounded-lg bg-neutral-900/90 p-2 leading-tight whitespace-pre-wrap">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>

          <div className="space-y-1">
            <div className="text-emerald-400 font-semibold uppercase tracking-wider text-[9px]">
              {isError ? 'Error Output:' : 'Execution Result:'}
            </div>
            <pre className="max-h-36 overflow-y-auto rounded-lg bg-neutral-900/90 p-2 leading-tight whitespace-pre-wrap">
              {JSON.stringify(tool.result ?? tool.error ?? { success: true }, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EditorAgentPanel({ open, onClose, active, onToggleActive }: Props) {
  const [apiKey, setApiKey] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('moonshotai/kimi-k2.6')
  const [showKey, setShowKey] = useState<boolean>(false)
  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'trace' | 'tools'>('chat')
  const [keySavedToast, setKeySavedToast] = useState<boolean>(false)
  const [modelSavedToast, setModelSavedToast] = useState<boolean>(false)
  const [copiedTraceToast, setCopiedTraceToast] = useState<boolean>(false)

  const [registeredToolsList, setRegisteredToolsList] = useState<
    Array<{ name: string; title: string; description: string; inputSchema: string }>
  >([])
  const [isRefreshingTools, setIsRefreshingTools] = useState<boolean>(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [liveReasoning, setLiveReasoning] = useState<string>('')
  const [currentTool, setCurrentTool] = useState<ToolCallRecord | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshRegisteredTools = useCallback(async () => {
    setIsRefreshingTools(true)
    try {
      const mc = getWebMCPContext()
      let tools = await mc.getTools()
      if (tools.length === 0) {
        const { registerAllAuxweaveWebMCPTools } = await import('../lib/webmcp/webmcp-registry')
        await registerAllAuxweaveWebMCPTools()
        tools = await mc.getTools()
      }
      setRegisteredToolsList(tools)
    } catch {
      /* ignore */
    } finally {
      setIsRefreshingTools(false)
    }
  }, [])

  // Auto-fetch tools on mount
  useEffect(() => {
    void refreshRegisteredTools()
  }, [refreshRegisteredTools])

  // Initialize stored credentials (AgentRouter only)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedKey = getStoredApiKey()
    const storedModel = getStoredModel()
    setApiKey(storedKey)
    setSelectedModel(storedModel)
    // Migrate any legacy non-AgentRouter endpoint to AgentRouter.
    if (getStoredEndpoint() !== AGENTROUTER_API_URL) {
      setStoredEndpoint(AGENTROUTER_API_URL)
    }

    if (!storedKey) {
      setShowSettings(true)
    }
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentTool, isGenerating, liveReasoning])

  if (!open) return null

  const handleSaveApiKey = () => {
    setStoredApiKey(apiKey)
    setKeySavedToast(true)
    setTimeout(() => setKeySavedToast(false), 2000)
  }

  const handleSaveModelName = () => {
    const trimmed = selectedModel.trim()
    if (!trimmed) return
    setSelectedModel(trimmed)
    setStoredModel(trimmed)
    setModelSavedToast(true)
    setTimeout(() => setModelSavedToast(false), 2000)
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsGenerating(false)
    setCurrentTool(null)
  }

  const handleCopyTrace = () => {
    const traceData = messages
      .filter(m => m.toolCalls?.length || m.reasoning)
      .map(m => ({
        role: m.role,
        content: m.content,
        reasoning: m.reasoning,
        toolCalls: m.toolCalls,
        timestamp: new Date(m.timestamp).toISOString(),
      }))
    navigator.clipboard.writeText(JSON.stringify(traceData, null, 2))
    setCopiedTraceToast(true)
    setTimeout(() => setCopiedTraceToast(false), 2000)
  }

  const handleSendPrompt = async (promptText: string) => {
    const text = promptText.trim()
    if (!text || isGenerating) return

    const currentKey = getStoredApiKey()
    if (!currentKey) {
      setShowSettings(true)
      setErrorMsg('Please enter your AgentRouter API key first to start using the co-design agent.')
      return
    }

    setErrorMsg(null)
    setLiveReasoning('')
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsGenerating(true)
    setCurrentTool(null)

    const turnToolCalls: ToolCallRecord[] = []
    const abortCtrl = new AbortController()
    abortControllerRef.current = abortCtrl

    try {
      const result = await executeAgentTurn(
        text,
        messages,
        {
          onToolStart: tool => {
            setCurrentTool(tool)
          },
          onToolComplete: tool => {
            turnToolCalls.push(tool)
            setCurrentTool(null)
          },
          onReasoning: reasoningText => {
            setLiveReasoning(reasoningText)
          },
        },
        abortCtrl.signal,
      )

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
        reasoning: result.reasoning,
        trace: result.trace,
        toolCalls:
          turnToolCalls.length > 0
            ? turnToolCalls
            : result.toolCalls && result.toolCalls.length > 0
              ? result.toolCalls
              : undefined,
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Cancelled by user
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMsg(msg)
      }
    } finally {
      setIsGenerating(false)
      setCurrentTool(null)
      setLiveReasoning('')
      abortControllerRef.current = null
    }
  }

  const currentModelMeta = {
    id: selectedModel,
    name: selectedModel.split('/')[1] || selectedModel || 'AgentRouter model',
    provider: 'AgentRouter',
    description: 'AgentRouter model',
  }

  const totalSessionTools = messages.reduce((acc, m) => acc + (m.toolCalls?.length ?? 0), 0)

  return (
    <div
      data-Auxweave-chrome
      className={[
        'pointer-events-auto fixed z-40 flex w-[min(100vw-1.5rem,440px)] h-[min(92dvh,780px)] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white/95 backdrop-blur-md shadow-2xl transition-all',
        editorSidebarPanelLeftClass,
        editorSidebarPanelTopClass,
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-200">
            <HugeiconsIcon icon={AiMagicIcon} size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 truncate">
                AI Agent
              </span>
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border shrink-0',
                  isGenerating
                    ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                    : active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                      : 'bg-neutral-100 text-neutral-500 border-neutral-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1.5 w-1.5 rounded-full',
                    isGenerating
                      ? 'bg-amber-500 animate-ping'
                      : active
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-neutral-400',
                  ].join(' ')}
                />
                {isGenerating ? 'Reasoning & Designing...' : active ? 'Ready' : 'Paused'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(v => !v)}
              className="text-[11px] font-medium text-neutral-500 hover:text-blue-700 flex items-center gap-1 truncate text-left transition"
              title="Click to change model or API token"
            >
              <span className="truncate">{currentModelMeta.name}</span>
              <span className="text-[10px] text-neutral-400">▾</span>
            </button>
          </div>
        </div>

        {/* View Tabs & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center bg-black/[0.05] p-0.5 rounded-xl text-[11px] font-semibold mr-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat')
                setShowSettings(false)
              }}
              className={`px-2 py-1 rounded-lg transition ${
                activeTab === 'chat' && !showSettings
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('trace')
                setShowSettings(false)
              }}
              className={`px-2 py-1 rounded-lg transition flex items-center gap-1 ${
                activeTab === 'trace' && !showSettings
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <span>Trace</span>
              {totalSessionTools > 0 && (
                <span className="rounded-full bg-blue-100 text-blue-700 px-1 text-[9px] font-bold">
                  {totalSessionTools}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('tools')
                setShowSettings(false)
                void refreshRegisteredTools()
              }}
              className={`px-2 py-1 rounded-lg transition flex items-center gap-1 ${
                activeTab === 'tools' && !showSettings
                  ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <span>Tools</span>
              <span className="rounded-full bg-emerald-100 text-emerald-700 px-1 text-[9px] font-bold">
                {registeredToolsList.length > 0 ? registeredToolsList.length : 21}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowSettings(v => !v)}
            className={[
              'rounded-full p-1.5 transition',
              showSettings
                ? 'bg-blue-100 text-blue-700'
                : 'text-neutral-400 hover:bg-black/5 hover:text-neutral-700',
            ].join(' ')}
            title="Agent Settings & Model Picker"
            aria-label="Agent Settings"
          >
            <HugeiconsIcon icon={Settings02Icon} size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-400 hover:bg-black/5 hover:text-neutral-700 transition"
            title="Close panel"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>
      </div>

      {/* Main Area: Settings View */}
      {showSettings && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* API Key Card */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-900 text-xs">
                AgentRouter API Key
              </span>
              <a
                href="https://agentrouter.org"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-blue-600 hover:underline"
              >
                AgentRouter Keys ↗
              </a>
            </div>
            <p className="text-[11px] text-neutral-600 leading-relaxed">
              All inference runs through AgentRouter. Your key is stored locally in your
              browser.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="agentrouter-..."
                  className="w-full rounded-xl border border-black/[0.12] bg-white px-3 py-2 pr-9 text-xs font-mono text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-700"
                >
                  <HugeiconsIcon icon={showKey ? ViewOffSlashIcon : ViewIcon} size={15} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="rounded-xl bg-blue-600 px-3 py-2 font-medium text-white shadow-sm hover:bg-blue-700 transition"
              >
                Save
              </button>
            </div>
            {keySavedToast && (
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                <span>API Token saved successfully!</span>
              </div>
            )}
          </div>

          {/* Model Name */}
          <div className="rounded-2xl border border-black/[0.07] bg-white p-3 space-y-2">
            <span className="text-xs font-semibold text-neutral-900">Model Name</span>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Any model id served by AgentRouter, e.g. moonshotai/kimi-k2.6.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                placeholder="e.g. moonshotai/kimi-k2.6"
                className="flex-1 rounded-xl border border-black/[0.12] bg-white px-3 py-1.5 text-xs font-mono text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveModelName}
                disabled={!selectedModel.trim()}
                className="rounded-xl bg-neutral-900 px-3 py-1.5 font-medium text-white disabled:opacity-40"
              >
                Use
              </button>
            </div>
            {modelSavedToast && (
              <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                <span>Model saved successfully!</span>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-[11px] text-red-600 hover:underline flex items-center gap-1"
            >
              <HugeiconsIcon icon={Delete02Icon} size={13} />
              Clear Chat History
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white shadow-sm hover:bg-blue-700 transition text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main Area: Trace Inspector View */}
      {!showSettings && activeTab === 'trace' && (
        <div className="flex flex-1 flex-col min-h-0 bg-neutral-50/50">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-900">Agent Execution Trace</span>
              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 px-2 py-0.5 text-[10px] font-bold">
                {totalSessionTools} tools called
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyTrace}
              disabled={messages.length === 0}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-30 flex items-center gap-1"
            >
              {copiedTraceToast ? '✓ Copied!' : 'Copy Full Trace'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.length === 0 ? (
              <div className="py-12 text-center text-neutral-400 text-xs">
                No agent turns executed yet. Send a prompt in the Chat tab to view reasoning and
                selected tools here!
              </div>
            ) : (
              messages.map((msg, mIdx) => {
                if (msg.role === 'user') {
                  return (
                    <div
                      key={msg.id}
                      className="rounded-xl border border-black/[0.06] bg-white p-3 space-y-1 shadow-2xs"
                    >
                      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        Turn {mIdx + 1} • User Prompt
                      </div>
                      <div className="text-xs font-semibold text-neutral-900">{msg.content}</div>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className="space-y-2.5">
                    {/* Model Reasoning Block */}
                    {msg.reasoning && (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 space-y-1.5 shadow-2xs">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                          <span>💭</span>
                          <span>Model Reasoning & Spatial Plan</span>
                        </div>
                        <div className="text-[11px] text-violet-950 font-sans leading-relaxed whitespace-pre-wrap">
                          {msg.reasoning}
                        </div>
                      </div>
                    )}

                    {/* Tool Calls */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider px-1">
                          Selected Tools ({msg.toolCalls.length})
                        </div>
                        <div className="space-y-1.5">
                          {msg.toolCalls.map((tc, tcIdx) => (
                            <ToolTraceCard key={tc.id || tcIdx} tool={tc} defaultExpanded={true} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Final Reply */}
                    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-neutral-800 leading-relaxed text-xs">
                      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                        Assistant Response
                      </div>
                      <div>{msg.content}</div>
                    </div>
                  </div>
                )
              })
            )}

            {/* Currently Executing Tool in Trace View */}
            {currentTool && (
              <div className="space-y-1.5 animate-pulse">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Currently Executing Tool:
                </div>
                <ToolTraceCard tool={currentTool} defaultExpanded={true} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Area: Registered WebMCP Tools Inspector View */}
      {!showSettings && activeTab === 'tools' && (
        <div className="flex flex-1 flex-col min-h-0 bg-neutral-50/50">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-2.5 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-neutral-900">WebMCP Registered Tools</span>
              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2 py-0.5 text-[10px] font-bold">
                {registeredToolsList.length > 0 ? registeredToolsList.length : 21} Active
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refreshRegisteredTools()}
              disabled={isRefreshingTools}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
            >
              {isRefreshingTools ? 'Registering...' : '↻ Refresh Tools'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>W3C WebMCP Standard Compliant</span>
              </div>
              <div className="text-emerald-800 text-[10px] leading-relaxed">
                Registered on{' '}
                <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono">
                  document.modelContext
                </code>
                ,{' '}
                <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono">
                  window.modelContext
                </code>
                , and Chrome DevTools.
              </div>
            </div>

            {registeredToolsList.length === 0 ? (
              <div className="py-8 text-center text-neutral-400 space-y-2">
                <div>No tools detected in current session yet.</div>
                <button
                  type="button"
                  onClick={() => void refreshRegisteredTools()}
                  className="rounded-lg bg-blue-600 text-white px-3 py-1 text-xs font-semibold hover:bg-blue-700 transition"
                >
                  Register All Tools Now
                </button>
              </div>
            ) : (
              registeredToolsList.map(tool => {
                let schemaProps: string[] = []
                try {
                  const parsed =
                    typeof tool.inputSchema === 'string'
                      ? JSON.parse(tool.inputSchema)
                      : tool.inputSchema
                  if (parsed?.properties) {
                    schemaProps = Object.keys(parsed.properties)
                  }
                } catch {
                  /* ignore */
                }

                return (
                  <div
                    key={tool.name}
                    className="rounded-xl border border-black/[0.08] bg-white p-3 space-y-1.5 shadow-2xs hover:border-blue-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-mono font-bold text-xs text-neutral-900 truncate">
                          {tool.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider shrink-0 bg-neutral-100 px-1.5 py-0.5 rounded">
                        Tool
                      </span>
                    </div>

                    <div className="text-[11px] font-semibold text-neutral-700">
                      {tool.title || tool.name}
                    </div>

                    <div className="text-[11px] text-neutral-500 leading-relaxed">
                      {tool.description}
                    </div>

                    {schemaProps.length > 0 && (
                      <div className="pt-1 border-t border-black/[0.04] flex flex-wrap gap-1 items-center">
                        <span className="text-[9px] text-neutral-400 font-medium">Args:</span>
                        {schemaProps.map(prop => (
                          <span
                            key={prop}
                            className="bg-neutral-100 text-neutral-600 font-mono text-[9px] px-1.5 py-0.5 rounded"
                          >
                            {prop}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Main Area: Chat View */}
      {!showSettings && activeTab === 'chat' && (
        <div className="flex flex-1 flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="py-4 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-inner">
                  <HugeiconsIcon icon={SparklesIcon} size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    What would you like to design?
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-[280px] mx-auto mt-1 leading-relaxed">
                    Powered by AgentRouter. Direct the agent to layout posters, compute
                    spatial coordinates, and generate graphics.
                  </p>
                </div>

                {/* Quick Prompts */}
                <div className="space-y-1.5 pt-2 text-left">
                  <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider px-1">
                    Quick Suggestions
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {QUICK_PROMPTS.map((qp, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSendPrompt(qp.prompt)}
                        className="rounded-2xl border border-black/[0.06] bg-white p-2.5 text-left hover:border-blue-300 hover:bg-blue-50/30 transition shadow-2xs group"
                      >
                        <div className="text-xs font-semibold text-neutral-900 group-hover:text-blue-900">
                          {qp.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {qp.prompt}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Chat Messages */}
            {messages.map(msg => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}
                >
                  <div
                    className={[
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
                      isUser
                        ? 'bg-neutral-900 text-white rounded-br-xs shadow-xs'
                        : 'bg-neutral-100 text-neutral-900 rounded-bl-xs border border-black/[0.04]',
                    ].join(' ')}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>

                  {/* Inline Trace: Model Reasoning Dropdown */}
                  {!isUser && msg.reasoning && (
                    <details className="w-[88%] rounded-xl border border-violet-200/80 bg-violet-50/50 p-2 text-xs group">
                      <summary className="cursor-pointer select-none font-semibold text-[11px] text-violet-800 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span>💭</span>
                          <span>Reasoning Trace</span>
                        </span>
                        <span className="text-[10px] text-violet-500 group-open:rotate-180 transition-transform">
                          ▾
                        </span>
                      </summary>
                      <div className="mt-2 pt-2 border-t border-violet-200/60 text-[11px] text-violet-950 font-sans leading-relaxed whitespace-pre-wrap">
                        {msg.reasoning}
                      </div>
                    </details>
                  )}

                  {/* Inline Trace: Selected Tools List */}
                  {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="w-[88%] space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                          Selected Tools ({msg.toolCalls.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('trace')}
                          className="text-[10px] font-medium text-blue-600 hover:underline"
                        >
                          View Full Trace →
                        </button>
                      </div>
                      <div className="space-y-1">
                        {msg.toolCalls.map((tc, idx) => (
                          <ToolTraceCard key={tc.id || idx} tool={tc} defaultExpanded={false} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Live Streaming Reasoning Trace */}
            {isGenerating && liveReasoning && (
              <div className="w-[88%] rounded-2xl border border-violet-200 bg-violet-50/70 p-3 space-y-1 text-xs animate-pulse">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-violet-700 uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-600 animate-ping" />
                  <span>Thinking & Spatial Planning...</span>
                </div>
                <div className="text-[11px] text-violet-950 font-sans leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {liveReasoning}
                </div>
              </div>
            )}

            {/* Currently Executing Tool Card */}
            {currentTool && (
              <div className="w-[88%]">
                <ToolTraceCard tool={currentTool} defaultExpanded={true} />
              </div>
            )}

            {/* Thinking Spinner */}
            {isGenerating && !currentTool && !liveReasoning && (
              <div className="flex items-center gap-2 text-neutral-400 text-xs px-2 py-1 italic">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]" />
                <span>Model is selecting tools...</span>
              </div>
            )}

            {/* Error Banner */}
            {errorMsg && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <div className="font-semibold">Error</div>
                <p className="mt-0.5 leading-normal">{errorMsg}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Input Bar */}
          <div className="shrink-0 border-t border-black/[0.06] p-3 bg-white">
            <div className="flex items-end gap-2 rounded-2xl border border-black/[0.1] bg-neutral-50/80 p-1.5 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendPrompt(inputValue)
                  }
                }}
                placeholder="Ask the agent to design or modify..."
                rows={1}
                disabled={isGenerating}
                className="max-h-28 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0"
              />

              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-sm hover:bg-red-600 transition"
                  title="Stop generating"
                >
                  <HugeiconsIcon icon={StopIcon} size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendPrompt(inputValue)}
                  disabled={!inputValue.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-30"
                  title="Send message (Enter)"
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-neutral-400">
              <span>Enter to send • Shift+Enter for new line</span>
              <span className="font-mono truncate max-w-[140px] text-right">
                {currentModelMeta.name}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
