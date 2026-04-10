import type { LarkEnvironment, PageMain as PageMainType, User as UserType, Toast as ToastType, ToastOptions } from '../types'

// Default no-op toast implementation
const noop = () => {}

const defaultToast: ToastType = {
  error: noop,
  warning: noop,
  info: noop,
  loading: noop,
  success: noop,
  remove: noop,
}

// These will be populated by the browser controller
export let Toast: ToastType = defaultToast
export let User: UserType | undefined = undefined
export let PageMain: PageMainType | undefined = undefined

export const isDoc = (): boolean => (window as any).editor !== undefined
export const isDocx = (): boolean => PageMain !== undefined

/**
 * Initialize environment from extracted data
 * This is called by the browser controller after injecting scripts
 */
export function initializeEnvironment(env: LarkEnvironment): void {
  PageMain = env.PageMain ?? undefined
  User = env.User ?? undefined

  // In Node.js environment, we don't have real Toast
  // The browser controller will handle logging
  Toast = defaultToast
}

/**
 * Extract environment data from the page
 * This function runs in the browser context
 */
export function extractEnvironmentFromPage(): LarkEnvironment {
  const w = window as any

  return {
    PageMain: w.PageMain ?? null,
    User: w.User ?? null,
    isDocx: w.PageMain !== undefined,
    isDoc: w.editor !== undefined,
  }
}
