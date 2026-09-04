<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Auxweave frontend. PostHog is initialized via `PostHogProvider` in the root route (`__root.tsx`), wrapping the entire app. A Vite reverse proxy routes all PostHog ingestion through `/ingest` to avoid ad-blocker interference. Event tracking has been added to 7 files covering the full user journey: landing → canvas creation → file management → editor usage → AI and export.

| Event                   | Description                                     | File                                    |
| ----------------------- | ----------------------------------------------- | --------------------------------------- |
| `editor_opened`         | User clicks "Open editor" on the landing page   | `src/routes/index.tsx`                  |
| `canvas_created`        | User creates a new canvas (preset or custom)    | `src/components/new-canvas-dialog.tsx`  |
| `file_opened`           | User opens an existing file from the files grid | `src/components/file-grid-card.tsx`     |
| `file_duplicated`       | User duplicates a file via the file card menu   | `src/components/file-grid-card.tsx`     |
| `file_downloaded`       | User downloads a file as JSON                   | `src/components/file-grid-card.tsx`     |
| `file_deleted`          | User confirms deletion of one or more files     | `src/routes/files.tsx`                  |
| `files_bulk_downloaded` | User bulk-downloads multiple selected files     | `src/routes/files.tsx`                  |
| `png_exported`          | User downloads a PNG export of the canvas       | `src/components/editor-export-menu.tsx` |
| `ai_prompt_submitted`   | User submits a prompt to the Magic AI panel     | `src/components/editor-ai-panel.tsx`    |
| `document_renamed`      | User renames the document title in the editor   | `src/routes/create.tsx`                 |

Error tracking via `posthog.captureException()` was added to `file-grid-card.tsx`, `files.tsx`, and `editor-ai-panel.tsx` to catch errors in file operations and AI submissions.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/387486/dashboard/1483014
- **Editor → Canvas Creation Funnel**: https://us.posthog.com/project/387486/insights/GBhblJel
- **Canvas Creations Over Time** (by preset vs custom): https://us.posthog.com/project/387486/insights/vusPYaET
- **PNG Exports Over Time**: https://us.posthog.com/project/387486/insights/BVxGiQ7O
- **Magic AI Prompt Usage**: https://us.posthog.com/project/387486/insights/DNS7OF16
- **File Lifecycle: Opens vs Deletes**: https://us.posthog.com/project/387486/insights/D84rb2hL

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
