import { computed, readonly, ref, shallowRef } from 'vue'
import { assertTheme } from './contract.js'
import containment from './themes/containment/index.js'
import folio from './themes/folio/index.js'
import replica from './themes/replica/index.js'

const themes = new Map()
const availableThemes = ref([])
const activeTheme = shallowRef(null)
const colorScheme = ref('dark')
const revision = ref(0)

export function registerTheme(theme) {
  const validTheme = assertTheme(theme)
  themes.set(validTheme.id, validTheme)
  availableThemes.value = [...themes.values()].map(({ id, label }) => ({ id, label }))
  if (!activeTheme.value) activeTheme.value = validTheme
  return validTheme
}

export function setTheme(id) {
  const theme = themes.get(id)
  if (!theme) throw new Error(`Unknown theme: ${id}`)
  if (theme === activeTheme.value) return
  activeTheme.value = theme
  revision.value += 1
  applyTheme()
}

export function setColorScheme(value) {
  colorScheme.value = value === 'light' ? 'light' : 'dark'
  applyTheme()
}

export function toggleColorScheme() {
  setColorScheme(colorScheme.value === 'dark' ? 'light' : 'dark')
}

function applyTheme() {
  const root = document.documentElement
  root.dataset.theme = activeTheme.value.id
  root.dataset.motion = activeTheme.value.motion
  root.dataset.colorScheme = colorScheme.value
  root.style.colorScheme = colorScheme.value
}

registerTheme(replica)
registerTheme(folio)
registerTheme(containment)

export function createThemeContext() {
  applyTheme()
  return {
    activeTheme: readonly(activeTheme),
    availableThemes: readonly(availableThemes),
    colorScheme: readonly(colorScheme),
    revision: readonly(revision),
    isDark: computed(() => colorScheme.value === 'dark'),
    setTheme,
    setColorScheme,
    toggleColorScheme,
  }
}
