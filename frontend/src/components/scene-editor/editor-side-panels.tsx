import { lazy, Suspense, useState } from 'react'

import type { Moodboard } from '../../lib/auxweave-moodboard'
import { emptyVectorBoardDocument } from '../../lib/auxweave-vector-board-document'
import {
  editorSidebarPanelLeftClass,
  editorSidebarPanelTopClass,
} from '../../lib/editor-sidebar-panel-layout'
import AgentMagicCursor from '../agent-magic-cursor'
import EditorAgentPanel from '../editor-agent-panel'
import EditorAppsPanel from '../editor-apps-panel'
import EditorFloatingSidebar, { type EditorSidebarPanelId } from '../editor-floating-sidebar'
import EditorImagesPanel from '../editor-images-panel'
import EditorLayersPanel from '../editor-layers-panel'
import EditorMoodboardsPanel from '../editor-moodboards-panel'
import EditorUploadsPanel from '../editor-uploads-panel'
import EditorVectorBoardPanel from '../editor-vector-board-panel'
import VectorBoardWorkspace from '../vector-board-workspace'
import { useEditorLayerControls } from './use-editor-layer-controls'
import { useVectorBoardControlsContext } from './use-vector-board-controls'

const EditorIconsPanel = lazy(() => import('../editor-icons-panel'))

function EditorIconsPanelLoading() {
  return (
    <div
      data-Auxweave-chrome
      className={[
        'pointer-events-auto fixed z-40 flex w-[min(100vw-1.5rem,360px)] max-h-[min(92dvh,720px)] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white/95 backdrop-blur-md',
        editorSidebarPanelLeftClass,
        editorSidebarPanelTopClass,
      ].join(' ')}
      role="status"
    >
      <div className="border-b border-black/[0.06] px-3 py-2 text-sm font-semibold text-neutral-800">
        Icons
      </div>
      <div className="px-3 py-8 text-center text-sm text-neutral-500">Loading...</div>
    </div>
  )
}

export interface EditorSidePanelsProps {
  activePanel: EditorSidebarPanelId | null
  onClosePanel: () => void
  onSelectPanel: (id: EditorSidebarPanelId) => void
  ready: boolean
  showRulers?: boolean
  onToggleRulers?: () => void
  placeImageObject?: (
    url: string,
    opts?: {
      x?: number
      y?: number
      width?: number
      height?: number
      origin?: 'center' | 'top-left'
    },
  ) => Promise<string | null>
  persistId?: string
  onSyncMoodboardToCanvas?: (board: Moodboard) => void
}

export function EditorSidePanels({
  activePanel,
  onClosePanel,
  onSelectPanel,
  ready,
  showRulers,
  onToggleRulers,
  placeImageObject,
  persistId,
  onSyncMoodboardToCanvas,
}: EditorSidePanelsProps) {
  const [agentActive, setAgentActive] = useState(true)

  const {
    layerRows,
    onLayerBringForward,
    onLayerReorder,
    onLayerSendBackward,
    onRenameLayer,
    onSelectLayer,
    onToggleLayerVisible,
  } = useEditorLayerControls()
  const {
    boardDocs,
    boards,
    closeVectorWorkspace,
    createVectorBoard,
    deleteVectorBoard,
    onVectorBoardDocumentChange,
    openVectorBoardWorkspace,
    placeActiveVectorBoardAtArtboardCenter,
    vectorWorkspaceId,
    vectorWorkspaceName,
  } = useVectorBoardControlsContext()

  return (
    <>
      {ready ? <AgentMagicCursor active={agentActive} /> : null}
      {ready ? (
        <EditorFloatingSidebar activePanel={activePanel} onSelectPanel={onSelectPanel} />
      ) : null}

      <EditorLayersPanel
        open={ready && activePanel === 'layers'}
        onClose={onClosePanel}
        rows={layerRows}
        onSelectLayer={onSelectLayer}
        onToggleVisible={onToggleLayerVisible}
        onBringForward={onLayerBringForward}
        onSendBackward={onLayerSendBackward}
        onReorder={onLayerReorder}
        onRenameLayer={onRenameLayer}
      />
      <EditorUploadsPanel
        open={ready && activePanel === 'uploads'}
        onClose={onClosePanel}
        documentId={persistId}
        placeImageObject={placeImageObject}
      />
      <EditorImagesPanel
        open={ready && activePanel === 'images'}
        onClose={onClosePanel}
        placeImageObject={placeImageObject}
      />
      {ready && activePanel === 'icons' ? (
        <Suspense fallback={<EditorIconsPanelLoading />}>
          <EditorIconsPanel open onClose={onClosePanel} />
        </Suspense>
      ) : null}
      <EditorVectorBoardPanel
        open={ready && activePanel === 'vector-board'}
        onClose={onClosePanel}
        boards={boards}
        boardDocs={boardDocs}
        onCreateNew={createVectorBoard}
        onOpenBoard={openVectorBoardWorkspace}
        onDeleteBoard={deleteVectorBoard}
      />
      <EditorMoodboardsPanel
        open={ready && activePanel === 'moodboard'}
        onClose={onClosePanel}
        documentId={persistId}
        placeImageObject={placeImageObject}
        onSyncToCanvas={onSyncMoodboardToCanvas}
      />
      <EditorAppsPanel
        open={ready && activePanel === 'apps'}
        onClose={onClosePanel}
        showRulers={showRulers}
        onToggleRulers={onToggleRulers}
        placeImageObject={placeImageObject}
      />
      <EditorAgentPanel
        open={ready && activePanel === 'ai'}
        onClose={onClosePanel}
        active={agentActive}
        onToggleActive={() => setAgentActive(v => !v)}
      />
      {/* Magic is temporarily hidden while the hosted AI path is paused. */}
      {vectorWorkspaceId ? (
        <VectorBoardWorkspace
          open
          boardName={vectorWorkspaceName}
          document={boardDocs[vectorWorkspaceId] ?? emptyVectorBoardDocument()}
          onDocumentChange={next => onVectorBoardDocumentChange(vectorWorkspaceId, next)}
          onSave={closeVectorWorkspace}
          onSaveAndPlace={() => {
            placeActiveVectorBoardAtArtboardCenter()
            closeVectorWorkspace()
          }}
          onClose={closeVectorWorkspace}
        />
      ) : null}
    </>
  )
}
