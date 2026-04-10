import { Second, waitFor, waitForFunction } from './time'

export const waitForSelector = async (
  selector: string,
  options: {
    /**
     * @default 400
     */
    timeout?: number
  } = {}
): Promise<void> =>
  waitForFunction(() => document.querySelector(selector) !== null, options)
