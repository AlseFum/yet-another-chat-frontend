/** @template T, E @typedef {{ ok: true, value: T } | { ok: false, error: E }} Result */

export const ok = value => ({ ok: true, value })
export const err = error => ({ ok: false, error })
export const isOk = result => result?.ok === true
export const isErr = result => !isOk(result)
export const map = (result, fn) => isOk(result) ? ok(fn(result.value)) : result
export const mapError = (result, fn) => isOk(result) ? result : err(fn(result.error))
export const flatMap = (result, fn) => isOk(result) ? fn(result.value) : result
export const unwrap = result => {
  if (isOk(result)) return result.value
  throw result.error instanceof Error ? result.error : new Error(String(result.error))
}
export const unwrapOr = (result, fallback) => isOk(result) ? result.value : fallback
export async function tryResult(fn) {
  try { return ok(await fn()) } catch (error) { return err(error) }
}
