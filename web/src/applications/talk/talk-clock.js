export function sessionNow(clock, realNow = new Date()) {
  const realAnchor = Date.parse(clock.anchorRealAt), sessionAnchor = Date.parse(clock.anchorSessionAt)
  if (!Number.isFinite(realAnchor) || !Number.isFinite(sessionAnchor)) throw new Error('Session 时钟锚点无效')
  const rate = Number.isFinite(Number(clock.rate)) ? Number(clock.rate) : 1
  return new Date(sessionAnchor + (realNow.getTime() - realAnchor) * rate + (Number(clock.offsetMs) || 0)).toISOString()
}
export function formatSessionTime(clock, realNow = new Date()) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: clock.timezone || 'Asia/Shanghai' }).format(new Date(sessionNow(clock, realNow))) }
export function jumpSessionClock(clock, target) { const value = new Date(target); if (Number.isNaN(value.getTime())) throw new Error('目标时间无效'); const now = new Date().toISOString(); clock.anchorRealAt = now; clock.anchorSessionAt = value.toISOString(); clock.offsetMs = 0 }
