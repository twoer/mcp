/**
 * This script is injected into the Feishu document page
 * It extracts the document structure and converts it to Markdown
 *
 * Note: This file is built separately and loaded by the browser controller
 */

// This will be populated by the main converter logic
// For now, it's a placeholder that extracts basic environment info
export function extractDocumentData() {
  const w = window as any

  if (!w.PageMain) {
    throw new Error('PageMain not found. Make sure you are on a Feishu document page.')
  }

  const rootBlockModel = w.PageMain.blockManager?.rootBlockModel

  if (!rootBlockModel) {
    throw new Error('Root block model not found.')
  }

  return {
    environment: {
      PageMain: w.PageMain,
      User: w.User ?? null,
      isDocx: true,
      isDoc: w.editor !== undefined,
    },
    rootBlock: rootBlockModel,
  }
}

// Export for browser context
if (typeof window !== 'undefined') {
  (window as any).__feishuExtractor = {
    extractDocumentData,
  }
}
