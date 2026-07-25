/**
 * 节点组件共享工具
 *
 * useNodeEdit(props) — 读写节点 data 的标准方式。
 * 内部用 updateNode 而非 updateNodeData，确保 v-model 同步到 WorkflowView。
 */
import { useVueFlow } from '@vue-flow/core'

export function useNodeEdit(props) {
  const { updateNode } = useVueFlow()
  return {
    set(k, v) { updateNode(props.id, { data: { ...props.data, [k]: v } }) },
    setAll(obj) { updateNode(props.id, { data: { ...props.data, ...obj } }) },
    get(k, def) { return props.data[k] ?? def },
  }
}
