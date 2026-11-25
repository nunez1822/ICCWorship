/**
 * Run actions one at a time, in the order they were triggered. A failing action is
 * reported through `onError` and never stops the actions queued after it.
 */
export function createActionQueue(onError: (e: unknown) => void): (fn: () => unknown) => Promise<void> {
  let chain: Promise<void> = Promise.resolve()
  return (fn) => {
    const r = chain.then(() => fn()).then(
      () => undefined,
      (e) => onError(e)
    )
    chain = r
    return r
  }
}
