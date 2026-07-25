import { inject } from 'vue'

export const WorkspaceContext = Symbol('workspace')
export const AppUIContext = Symbol('app-ui')
export const EditorContext = Symbol('editor')
export const WorkflowContext = Symbol('workflow')

function required(context, name) {
  const value = inject(context, null)
  if (!value) throw new Error(`${name} context is not available`)
  return value
}

export const useWorkspace = () => required(WorkspaceContext, 'Workspace')
export const useAppUI = () => required(AppUIContext, 'App UI')
export const useEditor = () => required(EditorContext, 'Editor')
export const useWorkflow = () => required(WorkflowContext, 'Workflow')
