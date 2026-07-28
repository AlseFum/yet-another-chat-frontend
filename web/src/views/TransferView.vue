<script setup>
import AppIcon from '../components/AppIcon.js'
import UiButton from '../components/UiButton.vue'
defineProps({ workspace: String })
</script>

<template>
  <main class="page transfer-view view">
    <header class="page-header"><div class="page-header__title"><p class="eyebrow">WORKSPACE</p><h1>导入与导出</h1><p>后续将使用版本化 bundle 搬运 Workspace 和独立资源文件。</p></div></header>
    <div class="transfer-grid"><section class="panel"><AppIcon name="transfer" size="28" /><h2>导出 {{ workspace }}</h2><p>创建包含 Application 配置和资源清单的归档。</p><UiButton variant="primary"><AppIcon name="transfer" />导出 Workspace</UiButton></section><section class="panel"><AppIcon name="file" size="28" /><h2>导入 Workspace</h2><p>选择归档并在写入前预览资源冲突。</p><label class="file-drop"><input type="file" /><span>选择归档文件</span></label></section></div>
  </main>
</template>
