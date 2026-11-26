/**
 * A short description of an error that is safe to write to the log (logs are attached to public bug reports).
 *
 * An error's message can carry private or licensed text: JSON.parse's SyntaxError quotes the input (a Bible),
 * and a failed child process's message holds its whole command line (a file name that can name people) and its
 * stderr. So the log only gets our own short codes ('no-slides', 'bad-id'…), a process's exit code or signal,
 * a Node error code (ENOENT…), the message of a programming error (TypeError…), or else just the error's kind.
 */
export function loggableError(e: unknown): string {
  if (!(e instanceof Error)) return 'unknown'
  const x = e as Error & { code?: unknown; signal?: unknown; killed?: unknown }
  if (typeof x.signal === 'string' && /^[A-Z0-9]{1,16}$/.test(x.signal)) return `killed (${x.signal})`
  if (x.killed === true) return 'killed'
  if (typeof x.code === 'number' && Number.isSafeInteger(x.code)) return `exit ${x.code}`
  if (typeof x.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(x.code)) return x.code
  if (/^[a-z][a-z0-9-]{0,40}$/.test(x.message)) return x.message
  // a bug in our own code: its message names code, not user data, and is what a bug report needs
  if (x.name === 'TypeError' || x.name === 'ReferenceError' || x.name === 'RangeError') return `${x.name}: ${x.message.slice(0, 160)}`
  return /^[A-Za-z]{1,40}$/.test(x.name) ? x.name : 'Error'
}
