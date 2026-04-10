import type { BrowserType } from '../browser/controller'

export interface Config {
  browserType: BrowserType
  defaultOutputPath: string
  loginTimeout: number
  documentTimeout: number
  conversionTimeout: number
}

export const DEFAULT_CDP_PORT = 9222

const defaultConfig: Config = {
  browserType: 'system',
  defaultOutputPath: './output',
  loginTimeout: 5 * 60 * 1000, // 5 minutes
  documentTimeout: 60 * 1000, // 60 seconds
  conversionTimeout: 60 * 1000, // 60 seconds
}

let currentConfig: Config = { ...defaultConfig }

export function getConfig(): Config {
  return currentConfig
}

export function updateConfig(partial: Partial<Config>): void {
  currentConfig = { ...currentConfig, ...partial }
}

export function resetConfig(): void {
  currentConfig = { ...defaultConfig }
}
