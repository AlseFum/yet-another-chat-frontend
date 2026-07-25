export function sessionNow(clock, realNow = new Date()) {
  const realAnchor = new Date(clock.anchorRealAt).getTime()
  const sessionAnchor = new Date(clock.anchorSessionAt).getTime()
  const rate = Number(clock.rate) || 1
  const offsetMs = Number(clock.offsetMs) || 0
  return new Date(sessionAnchor + (realNow.getTime() - realAnchor) * rate + offsetMs).toISOString()
}

export function formatSessionTime(clock, realNow = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: clock.timezone || 'Asia/Shanghai',
  }).format(new Date(sessionNow(clock, realNow)))
}

function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
}

export function formatDateTimeLocal(value, timeZone = 'Asia/Shanghai') {
  const parts = dateParts(value, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function offsetAt(value, timeZone) {
  const parts = dateParts(value, timeZone)
  const displayedAsUtc = Date.UTC(parts.year, Number(parts.month) - 1, parts.day, parts.hour, parts.minute)
  return displayedAsUtc - new Date(value).getTime()
}

export function parseDateTimeLocal(value, timeZone = 'Asia/Shanghai') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  const wallTimeAsUtc = Date.UTC(year, Number(month) - 1, day, hour, minute)
  let timestamp = wallTimeAsUtc
  // Resolve the time-zone offset against the candidate instant. Repeating once
  // handles transitions where the offset differs from the initial guess.
  timestamp = wallTimeAsUtc - offsetAt(timestamp, timeZone)
  timestamp = wallTimeAsUtc - offsetAt(timestamp, timeZone)
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}
