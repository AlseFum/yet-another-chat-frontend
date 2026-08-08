<script setup>
import AppIcon from "../components/AppIcon.js";
import UiButton from "../components/UiButton.vue";
import UiCombobox from "../components/UiCombobox.vue";

defineProps({ dark: Boolean, themeId: String, themes: Array });
const emit = defineEmits([
  "toggle-sidebar",
  "toggle-theme",
  "change-theme",
  "toggle-settings",
]);

function changeTheme(value) {
  emit("change-theme", value);
}
</script>

<template>
  <header class="top-bar">
    <UiButton
      variant="ghost"
      size="icon"
      title="切换侧栏"
      @click="$emit('toggle-sidebar')"
      ><AppIcon name="menu"
    /></UiButton>
    <div class="top-bar__spacer" />
    <UiCombobox
      class="theme-combobox"
      :model-value="themeId"
      :options="
        themes.map((theme) => ({ value: theme.id, label: theme.label }))
      "
      title="选择界面主题"
      :searchable="false"
      compact
      @update:model-value="changeTheme"
      ><template #prefix><AppIcon name="palette" /></template
    ></UiCombobox>
    <UiButton
      variant="ghost"
      size="icon"
      title="切换主题"
      @click="$emit('toggle-theme')"
      ><AppIcon :name="dark ? 'sun' : 'moon'"
    /></UiButton>
    <UiButton
      variant="ghost"
      size="icon"
      title="设置"
      @click="$emit('toggle-settings')"
      ><AppIcon name="settings"
    /></UiButton>
  </header>
</template>
