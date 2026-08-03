import { personaItemReference, projectPersona } from '../resource/persona-resource.js'
export async function compileTalkPersona(persona, workspace) {
  const lines = [`# Persona: ${persona.name}`]
  for (const section of projectPersona(persona, 'talk').sections) {
    lines.push(`\n## ${section[0]}`)
    for (const item of section.slice(1)) {
      const referenceId = personaItemReference(item)
      if (!referenceId) { lines.push(`- ${item}`); continue }
      const result = workspace.resources.borrow('text', referenceId); if (!result.ok) throw result.error
      const lease = result.value; try { lines.push(`- ${lease.read().content || ''}`) } finally { lease.release() }
    }
  }
  return lines.join('\n')
}
export async function compileWorldContext(worldContext, workspace) { const parts = [worldContext?.content || '']; for (const textId of worldContext?.textResourceIds || []) { const result = workspace.resources.borrow('text', textId); if (!result.ok) throw result.error; const lease = result.value; try { const text = lease.read(); parts.push(`## ${text.name}\n${text.content}`) } finally { lease.release() } } return parts.filter(Boolean).join('\n\n') }
