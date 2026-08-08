<script setup>
import { computed, reactive } from "vue";
import AppIcon from "../../components/AppIcon.js";
import CodeEditor from "../../components/CodeEditor.vue";
import UiButton from "../../components/UiButton.vue";
import UiSwitch from "../../components/UiSwitch.vue";
const props = defineProps({ application: Object });
const emit = defineEmits(["created", "cancel", "notify"]);
const settings = props.application.workspace.getCustomSettings("talk");
const form = reactive({
  name: "",
  personaId: props.application.personas[0]?.id || "",
  api: {
    keyRefId: props.application.workspace.selectedKeyRef()?.key?.id || "",
  },
  worldContext: { content: "", textResourceIds: [] },
  activity: {
    enabled: settings.activityEnabled,
    minReplyIntervalMinutes: settings.minReplyIntervalMinutes,
    maxProactivePerSession: settings.maxProactivePerSession,
  },
  requestOptions: {
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    thinking: settings.thinking,
    stream: settings.stream,
  },
});
const keys = computed(() => props.application.workspace.allKeys());
function toggleText(id) {
  form.worldContext.textResourceIds =
    form.worldContext.textResourceIds.includes(id)
      ? form.worldContext.textResourceIds.filter((item) => item !== id)
      : [...form.worldContext.textResourceIds, id];
}
async function submit() {
  try {
    props.application.create(form);
    await props.application.save();
    emit("created");
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}
</script>
<template>
  <main class="talk-create page">
    <header class="page-header">
      <div class="page-header__title">
        <p class="eyebrow">PERSISTENT CHARACTER</p>
        <h1>创建 Talk</h1>
        <p>Persona 是身份源，Session 承载时钟、状态、记忆、计划和对话。</p>
      </div>
      <UiButton variant="ghost" @click="emit('cancel')"
        ><AppIcon name="close" />取消</UiButton
      >
    </header>
    <div class="talk-create-grid">
      <section class="panel talk-create-card">
        <h2><AppIcon name="scope-talk" />身份与世界</h2>
        <label
          >名称<input
            v-model="form.name"
            class="field"
            placeholder="例如：与林澈的日常" /></label
        ><label
          >Persona<select v-model="form.personaId" class="field">
            <option value="">请选择</option>
            <option
              v-for="persona in application.personas"
              :key="persona.id"
              :value="persona.id"
            >
              {{ persona.name }}
            </option>
          </select></label
        ><label class="talk-world-context"
          >世界背景<CodeEditor
            :model-value="form.worldContext.content"
            :text-resources="application.texts"
            style="min-height: 180px"
            placeholder="共享世界、地点、关系背景和边界"
            @update:model-value="form.worldContext.content = $event"
          />
        </label>
        <div>
          <span class="field-label">引用 Text Resources</span>
          <div class="talk-resource-grid">
            <button
              v-for="text in application.texts"
              :key="text.id"
              :class="{
                active: form.worldContext.textResourceIds.includes(text.id),
              }"
              @click="toggleText(text.id)"
            >
              <AppIcon name="file" /><span>{{ text.name }}</span
              ><AppIcon
                v-if="form.worldContext.textResourceIds.includes(text.id)"
                name="check"
              />
            </button>
          </div>
        </div>
      </section>
      <aside class="panel talk-create-card">
        <h2><AppIcon name="settings" />运行快照</h2>
        <label
          >API Key<select v-model="form.api.keyRefId" class="field">
            <option value="">请选择</option>
            <option v-for="key in keys" :key="key.id" :value="key.id">
              {{ key.id }}
            </option>
          </select></label
        ><label
          >Model<input v-model="form.requestOptions.model" class="field"
        /></label>
        <div class="talk-create-pair">
          <label
            >Temperature<input
              v-model.number="form.requestOptions.temperature"
              class="field"
              type="number"
              step=".1" /></label
          ><label
            >Max tokens<input
              v-model.number="form.requestOptions.maxTokens"
              class="field"
              type="number"
          /></label>
        </div>
        <UiSwitch
          v-model="form.activity.enabled"
          label="主动行为"
          description="仅页面打开时检查，不是后台服务"
        />
        <div class="talk-create-pair">
          <label
            >最短间隔（分钟）<input
              v-model.number="form.activity.minReplyIntervalMinutes"
              class="field"
              type="number" /></label
          ><label
            >主动次数上限<input
              v-model.number="form.activity.maxProactivePerSession"
              class="field"
              type="number"
          /></label>
        </div>
        <UiButton class="talk-create-submit" variant="primary" @click="submit"
          ><AppIcon name="scope-talk" />创建并进入 Talk</UiButton
        >
      </aside>
    </div>
  </main>
</template>
