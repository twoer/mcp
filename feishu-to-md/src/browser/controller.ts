import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'
import type { LarkEnvironment } from '../types'
import { DEFAULT_CDP_PORT } from '../config'

export type BrowserType = 'chromium' | 'chrome' | 'edge' | 'firefox' | 'system'

function detectSystemDefaultBrowser(): Exclude<BrowserType, 'system'> {
  try {
    if (process.platform === 'darwin') {
      const output = execSync(
        `defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist 2>/dev/null`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
      const lower = output.toLowerCase()
      if (lower.includes('com.microsoft.edgemac') || lower.includes('msedge')) return 'edge'
      if (lower.includes('org.mozilla.firefox')) return 'firefox'
      if (lower.includes('com.google.chrome')) return 'chrome'
    } else if (process.platform === 'win32') {
      const output = execSync(
        `reg query "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice" /v ProgId`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
      const lower = output.toLowerCase()
      if (lower.includes('edge')) return 'edge'
      if (lower.includes('firefox')) return 'firefox'
      if (lower.includes('chrome')) return 'chrome'
    }
  } catch {
    // ignore detection errors, fall back to chrome
  }
  return 'chrome'
}

export interface BrowserControllerOptions {
  browserType?: BrowserType
  headless?: boolean
  userDataDir?: string
  cdpPort?: number | false
}

/**
 * Minimal CDP (Chrome DevTools Protocol) client.
 * Connects to a running browser via WebSocket — no Playwright needed.
 */
export class BrowserController {
  private browserType: Exclude<BrowserType, 'system'>
  private cdpPort: number | false
  private ws: WebSocket | null = null
  private msgId = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private sessionId: string | null = null
  private targetId: string | null = null
  private usingCdp = false

  constructor(options: BrowserControllerOptions = {}) {
    const requested = options.browserType ?? 'system'
    this.browserType = requested === 'system' ? detectSystemDefaultBrowser() : requested
    this.cdpPort = options.cdpPort === false ? false : (options.cdpPort ?? DEFAULT_CDP_PORT)
  }

  isCdp(): boolean {
    return this.usingCdp
  }

  // --- Connection ---

  async connect(): Promise<void> {
    if (this.ws) return

    const port = this.cdpPort
    if (port === false) {
      throw new Error('CDP is disabled (cdpPort: false). Native CDP mode requires a running browser with remote debugging.')
    }

    let wsUrl: string
    try {
      wsUrl = await this.resolveCdpWsUrl(port)
    } catch {
      throw this.createConnectionHelpError(port)
    }

    console.error(`Connecting to ${wsUrl}...`)

    try {
      await this.connectWebSocket(wsUrl)
    } catch {
      throw this.createConnectionHelpError(port)
    }

    this.usingCdp = true
    console.error('Connected to browser via CDP')
  }

  private createConnectionHelpError(port: number): Error {
    return new Error(
      `Cannot connect to any browser on port ${port}.\n\n` +
      `Please enable remote debugging in Chrome or Edge:\n` +
      `  Chrome: visit chrome://inspect/#remote-debugging\n` +
      `  Edge:   visit edge://inspect/#remote-debugging\n\n` +
      `Check "Enable remote debugging" and confirm the port is ${port}, then retry.`
    )
  }

  async openPage(url: string): Promise<void> {
    await this.connect()

    // Create a new tab
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' })
    this.targetId = targetId

    // Activate the tab
    await this.send('Target.activateTarget', { targetId })

    // Attach to get a session
    const { sessionId } = await this.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    this.sessionId = sessionId

    // Enable Page events
    await this.sendSession('Page.enable')

    // Navigate
    await this.sendSession('Page.navigate', { url })
  }

  /**
   * Evaluate JS in the page context. Returns the result value.
   */
  async evaluate<T = any>(expression: string): Promise<T> {
    const { result } = await this.sendSession('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.type === 'object' && result.subtype === 'error') {
      throw new Error(result.description || 'Evaluation error')
    }
    return result.value as T
  }

  /**
   * Wait for a JS expression to return a truthy value.
   */
  async waitForFunction(expression: string, timeout: number = 60000): Promise<boolean> {
    const deadline = Date.now() + timeout
    const pollInterval = 500

    while (Date.now() < deadline) {
      try {
        const { result } = await this.sendSession('Runtime.evaluate', {
          expression,
          returnByValue: true,
        })
        if (result.value) return true
      } catch {
        // Ignore evaluation errors during polling
      }
      await new Promise(r => setTimeout(r, pollInterval))
    }
    return false
  }

  /**
   * Wait for the document to fully load (network idle approximation).
   */
  async waitForLoad(timeout: number = 10000): Promise<void> {
    // Simple approach: wait for DOMContentLoaded via Page event
    const promise = new Promise<void>((resolve) => {
      const handler = (data: any) => {
        try {
          const msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data as any).toString())
          if (msg.method === 'Page.loadEventFired') {
            this.ws?.removeEventListener('message', handler)
            resolve()
          }
        } catch { /* ignore */ }
      }
      this.ws?.addEventListener('message', handler)
    })
    await promise.catch(() => {}).finally(() => {
      // timeout fallback — just proceed
    })
  }

  async extractEnvironment(): Promise<LarkEnvironment> {
    return this.evaluate<LarkEnvironment>(`
      (function() {
        var w = window;
        return {
          PageMain: w.PageMain || null,
          User: w.User || null,
          isDocx: w.PageMain !== undefined,
          isDoc: w.editor !== undefined,
        };
      })()
    `)
  }

  async waitForDocumentReady(timeout: number = 60000): Promise<boolean> {
    return this.waitForFunction(
      'window.PageMain !== undefined && window.PageMain.blockManager && window.PageMain.blockManager.rootBlockModel !== undefined',
      timeout,
    )
  }

  async close(): Promise<void> {
    // Close the tab we created (not the browser!)
    if (this.ws && this.targetId) {
      try {
        await this.send('Target.closeTarget', { targetId: this.targetId })
      } catch { /* ignore */ }
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.sessionId = null
    this.targetId = null
    this.usingCdp = false
  }

  // --- CDP Protocol Helpers ---

  private send(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error('Not connected'))
      const id = ++this.msgId
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  private sendSession(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.sessionId) return reject(new Error('No active session'))
      const id = ++this.msgId
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, sessionId: this.sessionId }))
    })
  }

  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)

      ws.addEventListener('open', () => {
        resolve()
      })

      ws.addEventListener('message', (event) => {
        const data = typeof event.data === 'string'
          ? event.data
          : Buffer.from(event.data as any).toString()
        try {
          const msg = JSON.parse(data)
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id)!
            this.pending.delete(msg.id)
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)))
            } else {
              resolve(msg.result)
            }
          }
        } catch { /* ignore non-JSON messages */ }
      })

      ws.addEventListener('error', (event) => {
        reject(new Error(`WebSocket error: ${typeof event === 'string' ? event : 'connection failed'}`))
      })

      ws.addEventListener('close', () => {
        // Reject all pending requests
        for (const [id, { reject }] of this.pending) {
          reject(new Error('WebSocket closed'))
          this.pending.delete(id)
        }
      })

      this.ws = ws
    })
  }

  // --- DevToolsActivePort ---

  private async resolveCdpWsUrl(port: number): Promise<string> {
    // 1. Try reading DevToolsActivePort file — scan all browsers, not just the detected one
    const result = this.readDevToolsActivePort(port)
    if (result) {
      console.error(`Found active ${result.browser} with remote debugging enabled`)
      this.browserType = result.browser
      return `ws://127.0.0.1:${port}${result.wsPath}`
    }

    // 2. Fallback: HTTP discovery via /json/version (works on all platforms)
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (resp.ok) {
        const info = await resp.json() as { webSocketDebuggerUrl?: string; Browser?: string }
        if (info.webSocketDebuggerUrl) {
          // Update browserType from the actual browser identity
          if (info.Browser) {
            const lower = info.Browser.toLowerCase()
            if (lower.includes('edg')) {
              this.browserType = 'edge'
            } else if (lower.includes('chrome')) {
              this.browserType = 'chrome'
            }
          }
          console.error(`Connected to ${info.Browser ?? 'browser'} via HTTP discovery`)
          return info.webSocketDebuggerUrl
        }
      }
    } catch {
      // HTTP discovery failed
    }

    throw new Error(`Cannot discover WebSocket URL on port ${port}`)
  }

  private readDevToolsActivePort(port: number): { wsPath: string; browser: Exclude<BrowserType, 'system'> } | null {
    const allCandidates: Array<{ browser: Exclude<BrowserType, 'system'>; filePath: string }> = [
      // Chrome
      { browser: 'chrome', filePath: path.join(os.homedir(), 'Library/Application Support/Google/Chrome/DevToolsActivePort') },
      { browser: 'chrome', filePath: path.join(os.homedir(), 'AppData/Local/Google/Chrome/User Data/DevToolsActivePort') },
      { browser: 'chrome', filePath: path.join(os.homedir(), '.config/google-chrome/DevToolsActivePort') },
      // Edge
      { browser: 'edge', filePath: path.join(os.homedir(), 'Library/Application Support/Microsoft Edge/DevToolsActivePort') },
      { browser: 'edge', filePath: path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/User Data/DevToolsActivePort') },
    ]

    for (const { browser, filePath } of allCandidates) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim()
        const lines = content.split('\n')
        const filePort = parseInt(lines[0], 10)
        const wsPath = lines[1]
        if (!isNaN(filePort) && wsPath) {
          return { wsPath, browser }
        }
      } catch {
        // File doesn't exist or can't be read
      }
    }
    return null
  }
}
