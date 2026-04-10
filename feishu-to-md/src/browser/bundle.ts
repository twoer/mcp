/**
 * Browser bundle entry point
 * This file is compiled as IIFE and injected into the Feishu document page.
 * It exposes the Transformer, Docx, and BlockType to the window object,
 * and initializes the environment from the page's global variables.
 */

import { Transformer, Docx, BlockType, docx } from '../converter/docx.js'
import { initializeEnvironment } from '../converter/env.js'
import type { LarkEnvironment } from '../types/index.js'

// Initialize environment from the page's global variables
const w = window as any
const env: LarkEnvironment = {
  PageMain: w.PageMain ?? null,
  User: w.User ?? null,
  isDocx: w.PageMain !== undefined,
  isDoc: w.editor !== undefined,
}
initializeEnvironment(env)

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
        try {
          const response = await file.data.fetchFile()
          const buffer = await response.arrayBuffer()
          const name = file.data.name as string
          const filename = `files/${name}`
          attachments.push({ name: filename, data: Array.from(new Uint8Array(buffer)) })
          file.url = filename
        } catch {
          // ignore file download errors
        }
      })
    )

    // Download images and collect as byte arrays
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
        } catch {
          // ignore
        }
      })
    )

    const markdown = Docx.stringify(result.root)
    const allAttachments = [...attachments, ...imageAttachments]

    return {
      title,
      markdown,
      attachments: allAttachments,
    }
  },
}
