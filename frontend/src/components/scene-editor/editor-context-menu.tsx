import {
  Copy01Icon,
  Delete02Icon,
  FilePasteIcon,
  LayerAddIcon,
  Layers02Icon,
  SquareLock01Icon,
  SquareUnlock01Icon,
} from '@hugeicons/core-free-icons'

import { Divider, MenuItem, MenuList, PopoverSurface } from '../ui'

export type EditorContextMenuState = {
  x: number
  y: number
  sceneX: number
  sceneY: number
  hasSelection: boolean
  pageId: string | null
  showPageActions: boolean
  locked: boolean
}

export function EditorContextMenu({
  onAddPage,
  canDeletePage,
  contextMenu,
  onClose,
  onCopy,
  onDelete,
  onDeletePage,
  onDuplicate,
  onDuplicatePage,
  onPaste,
  onToggleLock,
}: {
  onAddPage: (afterPageId?: string) => void
  canDeletePage: boolean
  contextMenu: EditorContextMenuState | null
  onClose: () => void
  onCopy: () => void
  onDelete: () => void
  onDeletePage: (pageId?: string) => void
  onDuplicate: () => void
  onDuplicatePage: (sourcePageId?: string) => void
  onPaste: (point: { x: number; y: number }) => void
  onToggleLock: () => void
}) {
  if (!contextMenu) return null
  return (
    <PopoverSurface
      role="menu"
      width="w-auto"
      className="fixed z-[90] min-w-48 rounded-xl py-1 backdrop-blur"
      style={{
        left: `min(${contextMenu.x}px, calc(100vw - 12.5rem))`,
        top: `min(${contextMenu.y}px, calc(100vh - 18rem))`,
      }}
      data-Auxweave-chrome
    >
      <MenuList className="p-0">
        {contextMenu.hasSelection ? (
          <>
            <MenuItem
              role="menuitem"
              icon={Copy01Icon}
              label="Copy"
              onClick={() => {
                onCopy()
                onClose()
              }}
            />
            <MenuItem
              role="menuitem"
              icon={Layers02Icon}
              label="Duplicate"
              onClick={() => {
                onDuplicate()
                onClose()
              }}
            />
            <MenuItem
              role="menuitem"
              icon={contextMenu.locked ? SquareUnlock01Icon : SquareLock01Icon}
              label={contextMenu.locked ? 'Unlock' : 'Lock'}
              onClick={() => {
                onToggleLock()
                onClose()
              }}
            />
            <Divider />
          </>
        ) : null}
        <MenuItem
          role="menuitem"
          icon={FilePasteIcon}
          label="Paste"
          onClick={() => {
            onPaste({ x: contextMenu.sceneX, y: contextMenu.sceneY })
            onClose()
          }}
        />
        {contextMenu.showPageActions ? (
          <>
            <MenuItem
              role="menuitem"
              icon={Copy01Icon}
              label="Duplicate page"
              onClick={() => {
                onDuplicatePage(contextMenu.pageId ?? undefined)
                onClose()
              }}
            />
            <MenuItem
              role="menuitem"
              icon={LayerAddIcon}
              label="Add new page"
              onClick={() => {
                onAddPage(contextMenu.pageId ?? undefined)
                onClose()
              }}
            />
            {canDeletePage ? (
              <MenuItem
                role="menuitem"
                icon={Delete02Icon}
                label="Delete page"
                onClick={() => {
                  onDeletePage(contextMenu.pageId ?? undefined)
                  onClose()
                }}
              />
            ) : null}
          </>
        ) : null}
        {contextMenu.hasSelection ? (
          <>
            <Divider />
            <MenuItem
              role="menuitem"
              icon={Delete02Icon}
              label="Delete"
              onClick={() => {
                onDelete()
                onClose()
              }}
            />
          </>
        ) : null}
      </MenuList>
    </PopoverSurface>
  )
}
