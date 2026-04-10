export const Second = 1000

export const Minute: number = 60 * Second

export const waitFor = (timeout: number = 0.4 * Second): Promise<void> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, timeout)
  })

export const waitForFunction = async (
  func: () => boolean | Promise<boolean>,
  options: {
    /**
     * @default 400
     */
    timeout?: number
  } = {}
): Promise<void> => {
  const { timeout = 0.4 * Second } = options

  let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timeoutId = null
  }, timeout)

  const isTimeout = (): boolean => timeoutId === null

  const _func = () => Promise.resolve(func()).catch(() => false)

  while (!(await _func()) && !isTimeout()) {
    await waitFor(0.1 * Second)
  }

  if (isTimeout()) {
    throw new Error(`Timeout waiting for function: ${func.name}`)
  } else {
    clearTimeout(timeoutId)
  }
}
