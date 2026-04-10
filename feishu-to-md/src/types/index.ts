import type * as mdast from 'mdast'

// Lark environment types
export interface Toast {
  error: (options: ToastOptions) => void
  warning: (options: ToastOptions) => void
  info: (options: ToastOptions) => void
  loading: (options: ToastOptions) => void
  success: (options: ToastOptions) => void
  remove: (key: string) => void
}

export interface ToastOptions {
  key?: string
  content: string
  actionText?: string
  duration?: number
  keepAlive?: boolean
  closable?: boolean
  onActionClick?: () => void
  onClose?: () => void
}

export interface User {
  language: string
}

export interface PageBlock {
  recordId: string
  blockType: number
  children?: PageBlock[]
  [key: string]: any
}

export interface PageMain {
  blockManager: {
    model?: {
      rootBlockModel: PageBlock
    }
    rootBlockModel: PageBlock
  }
  locateBlockWithRecordIdImpl(
    recordId: string,
    options?: Record<string, unknown>
  ): Promise<boolean>
}

// Lark environment extracted from page
export interface LarkEnvironment {
  PageMain: PageMain | null
  User: User | null
  isDocx: boolean
  isDoc: boolean
}

// Conversion options
export interface ConversionOptions {
  url: string
  outputPath?: string
  browserType?: 'chromium' | 'chrome' | 'edge' | 'firefox' | 'system'
  waitForManualLogin?: boolean
  loginTimeout?: number
  documentTimeout?: number
  conversionTimeout?: number
  closeBrowser?: boolean
  headless?: boolean
  cdpPort?: number
}

// Conversion result
export interface ConversionResult {
  success: boolean
  markdownPath?: string
  error?: string
  debugInfo?: string
}

// Image sources (matches internal ImageSources in docx.ts)
export interface ImageSources {
  originSrc: string
  src: string
}

// Extended mdast types
declare module 'mdast' {
  interface ImageData {
    name?: string
    token?: string
    fetchSources?: () => Promise<ImageSources | null>
    fetchBlob?: () => Promise<Blob | null>
  }

  interface ListItemData {
    seq?: number | 'auto'
  }

  interface LinkData {
    name?: string
    fetchFile?: (init?: RequestInit) => Promise<Response>
  }

  interface TableData {
    type?: string
    colWidths?: number[]
    invalid?: boolean
  }

  interface TableCellData {
    width?: number
    invalidChildren?: Nodes[]
  }

  interface InlineCodeData {
    mentionUserId?: string
    parentBlockRecordId?: string
  }
}
