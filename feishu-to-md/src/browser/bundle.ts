/**
 * Browser bundle entry point
 * This file is compiled as IIFE and injected into the Feishu document page.
 * It exposes the Transformer, Docx, and BlockType to the window object,
 * and initializes the environment from the page's global variables.
 */

import { Transformer, Docx, BlockType, docx } from '../converter/docx.js'
import type { TableWithParent } from '../converter/docx.js'
import { initializeEnvironment } from '../converter/env.js'
import type { LarkEnvironment } from '../types/index.js'
import type * as mdast from 'mdast'
import { toHast } from 'mdast-util-to-hast'
import { toHtml } from 'hast-util-to-html'
import type * as hast from 'hast'

// Initialize environment from the page's global variables
const w = window as any
const env: LarkEnvironment = {
  PageMain: w.PageMain ?? null,
  User: w.User ?? null,
  isDocx: w.PageMain !== undefined,
  isDoc: w.editor !== undefined,
}
initializeEnvironment(env)

/**
 * Post-process tables: restore invalidChildren and convert to HTML.
 * This handles tables whose cells contain block-level content (lists, headings, etc.)
 * that cannot be represented in GFM Markdown tables.
 */
function transformTablesToHtml(tables: TableWithParent[]): void {
  for (const table of tables) {
    const tableIndex = table.parent?.children.findIndex(
      child => child === table.inner,
    )
    if (tableIndex === undefined || tableIndex === -1) continue

    // Restore invalidChildren as cell children for HTML rendering
    const tableForHtml = table.inner.data?.invalid
      ? ({
          ...table.inner,
          children: table.inner.children.map(row => ({
            ...row,
            children: row.children.map(cell => ({
              ...cell,
              children: cell.data?.invalidChildren ?? cell.children,
            })),
          })),
        } as mdast.Table)
      : table.inner

    const hastTable = toHast(tableForHtml, { allowDangerousHtml: true })

    if (hastTable.type === 'element') {
      // Add colgroup for column widths (from GRID blocks)
      const colWidths = table.inner.data?.colWidths as number[] | undefined
      if (colWidths?.length) {
        const isGrid = table.inner.data?.type === BlockType.GRID
        const hastColGroup: hast.Element = {
          type: 'element',
          tagName: 'colgroup',
          properties: {},
          children: colWidths.map(width => ({
            type: 'element' as const,
            tagName: 'col',
            properties: isGrid
              ? { style: `width: ${width.toFixed(2)}%` }
              : { width },
            children: [],
          })),
        }
        hastTable.children = ([hastColGroup] as hast.ElementContent[]).concat(
          hastTable.children,
        )
      }
    }

    table.parent?.children.splice(tableIndex, 1, {
      type: 'html',
      value: toHtml(hastTable, { allowDangerousHtml: true }),
    })
  }
}

// Expose core classes and the singleton to window for use in page.evaluate
w.__feishuConverter = {
  Transformer,
  Docx,
  BlockType,
  docx,
  /**
   * Convert the current page to Markdown string.
   * Returns { title, markdown } or throws on failure.
   */
  async convertToMarkdown(): Promise<{
    title: string
    markdown: string
    attachments: { name: string; data: number[] }[]
  }> {
    const title = docx.pageTitle ?? document.title ?? 'Untitled'
    const result = docx.intoMarkdownAST({ file: true })

    // Download file attachments and collect as byte arrays (transferable to Node.js)
    const attachments: { name: string; data: number[] }[] = []
    await Promise.all(
      result.files.map(async (file) => {
        if (!file.data?.name || !file.data.fetchFile) return
        const name = file.data.name as string
        try {
          const response = await file.data.fetchFile()
          const buffer = await response.arrayBuffer()
          const filename = `files/${name}`
          attachments.push({ name: filename, data: Array.from(new Uint8Array(buffer)) })
          file.url = filename
        } catch (err) {
          console.warn(`[feishu-to-md] Failed to download file: ${name}`, err)
        }
      })
    )

    // For files that failed to download, convert link nodes to plain text with filename
    for (const file of result.files) {
      if (file.url) continue
      const name = (file.data?.name as string) ?? 'unknown'
      // Replace the link node with an HTML node showing the attachment name
      ;(file as any).type = 'html'
      ;(file as any).value = `<span>&#128206; ${name}</span>`
      delete (file as any).children
      delete (file as any).url
    }

    // Download images BEFORE converting tables to HTML, so image URLs are resolved
    const imageAttachments: { name: string; data: number[] }[] = []
    await Promise.all(
      result.images.map(async (image, idx) => {
        if (!image.data) return
        const { name: originName, token, fetchSources, fetchBlob } = image.data as any
        // Use token or index to ensure unique filenames
        const uniqueSuffix = token ?? idx
        try {
          if (fetchBlob) {
            // whiteboard/diagram
            const blob = await fetchBlob()
            if (!blob) return
            const ext = originName?.split('.').pop() ?? 'png'
            const filename = `images/${uniqueSuffix}.${ext}`
            const buffer = await blob.arrayBuffer()
            imageAttachments.push({ name: filename, data: Array.from(new Uint8Array(buffer)) })
            image.url = filename
          } else if (fetchSources) {
            const sources = await fetchSources()
            if (!sources?.src) return
            const response = await fetch(sources.src, { credentials: 'include' })
            if (!response.ok) return
            const contentType = response.headers.get('content-type') ?? ''
            if (contentType.includes('application/json')) return
            const buffer = await response.arrayBuffer()
            const ext = originName?.split('.').pop() ?? 'png'
            const filename = `images/${uniqueSuffix}.${ext}`
            imageAttachments.push({ name: filename, data: Array.from(new Uint8Array(buffer)) })
            image.url = filename
          }
        } catch (err) {
          console.warn(`[feishu-to-md] Failed to download image: ${originName ?? uniqueSuffix}`, err)
        }
      })
    )

    // Post-process: convert tables with block-level cell content to HTML
    // This must happen AFTER image downloads so that image URLs are populated
    if (result.tableWithParents.length > 0) {
      // Convert invalid tables (with block content in cells) to HTML
      const invalidTables = result.tableWithParents.filter(
        t => t.inner.data?.invalid,
      )
      if (invalidTables.length > 0) {
        transformTablesToHtml(invalidTables)
      }

      // Convert GRID tables to HTML for proper width rendering
      const grids = result.tableWithParents.filter(
        t => t.inner.data?.type === BlockType.GRID && !t.inner.data?.invalid,
      )
      if (grids.length > 0) {
        transformTablesToHtml(grids)
      }
    }

    const markdown = Docx.stringify(result.root, { allowDangerousHtml: true } as any)
    const allAttachments = [...attachments, ...imageAttachments]

    return {
      title,
      markdown,
      attachments: allAttachments,
    }
  },
}
