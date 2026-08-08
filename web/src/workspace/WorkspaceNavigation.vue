<script setup>
import { inject } from "vue";
import ChatSection from "../applications/chat/ChatSection.vue";
import ResourceSection from "../applications/resource/ResourceSection.vue";
import TalkSection from "../applications/talk/TalkSection.vue";
import WorkflowSection from "../applications/workflow/WorkflowSection.vue";
import AppIcon from "../components/AppIcon.js";
import { ThemeKey } from "../theme/contract.js";

const props = defineProps({
  applications: Object,
  view: String,
  workspace: String,
});
const emit = defineEmits(["navigate", "notify"]);
const theme = inject(ThemeKey);
const sections = [
  { id: "chat", component: ChatSection },
  { id: "talk", component: TalkSection },
  { id: "workflow", component: WorkflowSection },
  { id: "resource", component: ResourceSection },
];
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__workspace">
      <img
        class="sidebar__workspace-mark"
        :src="theme.activeTheme.value.assets.workspaceMark"
        alt=""
      /><span>{{ workspace || "default" }}</span>
    </div>
    <div class="sidebar__group-label">工作区</div>
    <nav class="sidebar__applications" aria-label="主要应用">
      <component
        v-for="section in sections"
        :is="section.component"
        :key="section.id"
        :application="applications?.get(section.id)"
        :active="view === section.id || view === `${section.id}-create`"
        @navigate="emit('navigate', $event)"
        @notify="(...args) => emit('notify', ...args)"
      />
    </nav>

    <nav class="sidebar__utilities">
      <span>系统</span>
      <button
        :class="{ active: view === 'keys' }"
        @click="emit('navigate', 'keys')"
      >
        <AppIcon name="key" />API Key
      </button>
      <button
        :class="{ active: view === 'jobs' }"
        @click="emit('navigate', 'jobs')"
      >
        <AppIcon name="bolt" />LLM 任务
      </button>
      <button
        :class="{ active: view === 'custom-settings' }"
        @click="emit('navigate', 'custom-settings')"
      >
        <AppIcon name="settings" />应用设置
      </button>
      <button
        :class="{ active: view === 'transfer' }"
        @click="emit('navigate', 'transfer')"
      >
        <AppIcon name="transfer" />数据迁移
      </button>
    </nav>
  </aside>
</template>
