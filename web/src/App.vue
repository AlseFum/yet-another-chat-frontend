<script setup>
import { provide, ref } from "vue";
import ChatApplicationView from "./applications/chat/ChatApplication.vue";
import ChatCreateView from "./applications/chat/ChatCreateView.vue";
import ResourceView from "./applications/resource/ResourceView.vue";
import TalkApplicationView from "./applications/talk/TalkApplication.vue";
import TalkCreateView from "./applications/talk/TalkCreateView.vue";
import WorkflowApplicationView from "./applications/workflow/WorkflowApplication.vue";
import UiCombobox from "./components/UiCombobox.vue";
import UiSwitch from "./components/UiSwitch.vue";
import UiToastViewport from "./components/UiToastViewport.vue";
import WorkbenchLayout from "./components/layout/WorkbenchLayout.vue";
import { ThemeKey } from "./theme/contract.js";
import { createThemeContext } from "./theme/manager.js";
import ApiKeysView from "./views/ApiKeysView.vue";
import JobsView from "./views/JobsView.vue";
import CustomSettingsView from "./views/CustomSettingsView.vue";
import TransferView from "./views/TransferView.vue";
import WorkspaceNavigation from "./workspace/WorkspaceNavigation.vue";
import WorkspaceToolbar from "./workspace/WorkspaceToolbar.vue";
import { useWorkspace } from "./workspace/use-workspace.js";

const theme = createThemeContext();
provide(ThemeKey, theme);

const toasts = ref([]);
let toastId = 0;

function dismissToast(id) {
  toasts.value = toasts.value.filter((item) => item.id !== id);
}

function notify(message, tone = "success") {
  const id = ++toastId;
  toasts.value.push({ id, message, tone });
  window.setTimeout(() => dismissToast(id), 1500);
}

const workspaceContext = useWorkspace({ notify });
globalThis.runtime = workspaceContext;

const {
  abortJob,
  applications,
  backendError,
  cleanTerminalJobs,
  customSettings,
  createServerKey,
  createTemporaryKey,
  deleteServerKey,
  jobs,
  keyOptions,
  keys,
  loadJobDetail,
  navigate,
  renderMarkdown,
  selectedKey,
  selectServerKey,
  setRenderMarkdown,
  settingsOpen,
  updateCustomSetting,
  sidebarOpen,
  view,
  workspaceId,
} = workspaceContext;
</script>

<template>
  <WorkbenchLayout
    :sidebar-open="sidebarOpen"
    @close-sidebar="sidebarOpen = false"
  >
    <template #sidebar
      ><WorkspaceNavigation
        :applications="applications"
        :view="view"
        :workspace="workspaceId"
        @navigate="navigate"
        @notify="notify"
    /></template>
    <template #toolbar
      ><WorkspaceToolbar
        :dark="theme.isDark.value"
        :theme-id="theme.activeTheme.value.id"
        :themes="theme.availableThemes.value"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-theme="theme.toggleColorScheme"
        @change-theme="theme.setTheme"
        @toggle-settings="settingsOpen = !settingsOpen"
    /></template>
    <section v-if="settingsOpen" class="settings-panel">
      <div class="setting-field">
        <span>API Key</span
        ><UiCombobox
          v-model="selectedKey"
          :options="keyOptions"
          title="选择 API Key"
        />
      </div>
      <UiSwitch
        :model-value="renderMarkdown"
        label="渲染 Markdown"
        description="格式化消息中的标题、列表和代码块"
        @update:model-value="setRenderMarkdown"
      />
    </section>
    <main :key="theme.revision.value" class="workbench__content">
      <ChatApplicationView
        v-if="view === 'chat'"
        :application="applications.get('chat')"
        :render-markdown="renderMarkdown"
        @notify="notify"
      />
      <ChatCreateView
        v-else-if="view === 'chat-create'"
        :application="applications.get('chat')"
        @created="
          applications
            .get('chat')
            .save()
            .then(() => navigate('chat'))
        "
        @cancel="navigate('chat')"
        @notify="notify"
      />
      <TalkApplicationView
        v-else-if="view === 'talk'"
        :application="applications.get('talk')"
        @notify="notify"
      />
      <TalkCreateView
        v-else-if="view === 'talk-create'"
        :application="applications.get('talk')"
        @created="navigate('talk')"
        @cancel="navigate('talk')"
        @notify="notify"
      />
      <WorkflowApplicationView
        v-else-if="view === 'workflow'"
        :application="applications.get('workflow')"
        @notify="notify"
      />
      <ResourceView
        v-else-if="view === 'resource'"
        :application="applications.get('resource')"
        @notify="notify"
        @open-sidebar="sidebarOpen = true"
      />
      <ApiKeysView
        v-else-if="view === 'keys'"
        :keys="keys"
        :selected-key-id="selectedKey"
        :create-key="createServerKey"
        :create-temporary-key="createTemporaryKey"
        :delete-key="deleteServerKey"
        :select-key="selectServerKey"
        :error="backendError"
      />
      <JobsView
        v-else-if="view === 'jobs'"
        :jobs="jobs"
        :error="backendError"
        :load-detail="loadJobDetail"
        @abort="abortJob"
        @clean-terminal="cleanTerminalJobs"
      />
      <TransferView v-else-if="view === 'transfer'" :workspace="workspaceId" />
      <CustomSettingsView
        v-else-if="view === 'custom-settings'"
        :applications="applications"
        :custom-settings="customSettings"
        :update-setting="updateCustomSetting"
        @notify="notify"
      />
    </main>
    <UiToastViewport :items="toasts" @dismiss="dismissToast" />
  </WorkbenchLayout>
</template>
