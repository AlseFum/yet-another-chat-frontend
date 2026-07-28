export const ThemeKey = Symbol('theme')

export const requiredThemeFields = ['id', 'label', 'motion', 'icons', 'assets']

export function assertTheme(theme) {
  for (const field of requiredThemeFields) {
    if (!theme?.[field]) throw new Error(`Theme is missing required field: ${field}`)
  }
  return theme
}
