export function toggleSet(ref, key) {
  const next = new Set(ref.value)
  next.has(key) ? next.delete(key) : next.add(key)
  ref.value = next
}
