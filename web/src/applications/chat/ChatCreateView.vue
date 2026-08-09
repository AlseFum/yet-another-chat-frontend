<script setup>
import { computed, nextTick, ref } from "vue";
import AppIcon from "../../components/AppIcon.js";
import CodeEditor from "../../components/CodeEditor.vue";
import UiButton from "../../components/UiButton.vue";

const props = defineProps({ application: Object });
const emit = defineEmits(["created", "cancel", "notify"]);
const modes = [
  {
    id: "raw",
    title: "原始",
    description: "直接使用 System Prompt，不绑定 Persona。",
    icon: "code",
  },
  {
    id: "single",
    title: "单人",
    description: "一个 Persona，一把 API Key。",
    icon: "message",
  },
  {
    id: "multi",
    title: "多人",
    description: "所有实例行动，或交给 Orchestrator 编排。",
    icon: "scope-talk",
  },
];
const mode = ref("raw");
const name = ref("新对话");
const systemPrompt = ref("");
const userMaskPersonaId = ref("");
const personaId = ref("");
const participants = ref([]);
const rawToolIds = ref([]);
const presetChoice = ref("");
const presets = computed(
  () => props.application.workspace?.resources?.list("preset") || [],
);
const orchestratorPrompt = ref("");
const policy = ref("fixed");
const orchestratorKeyRefId = ref("");
const maxDispatches = ref("2");
const keyRefId = ref(props.application.workspace?.keyRef?.keyId || "");
const defaults = computed(
  () =>
    props.application.workspace?.getCustomSettings(props.application.id) || {},
);
const model = ref(defaults.value.model || "deepseek-v4-flash");
const temperature = ref(String(defaults.value.temperature ?? 0.7));
const maxTokens = ref(String(defaults.value.maxTokens ?? 4096));
const thinking = ref(defaults.value.thinking !== false);
const stream = ref(defaults.value.stream !== false);
const saving = ref(false);
const modeCards = ref(null);
const modeTouchStart = ref(null);
const personas = computed(() => props.application.personas);
const keys = computed(() => props.application.workspace?.allKeys?.() || []);
const texts = computed(
  () => props.application.workspace?.resources?.list("text") || [],
);
const tools = computed(
  () => props.application.workspace?.resources?.list("tool") || [],
);
const selectedMode = computed(() =>
  modes.find((item) => item.id === mode.value),
);
const orchestratorParticipantIssues = computed(() => {
  if (mode.value !== "multi" || policy.value !== "orchestrated") return [];
  return participants.value.flatMap((participant, index) => {
    const persona = personas.value.find(
      (item) => item.id === participant.personaId,
    );
    if (!persona) return [`实例 ${index + 1} 尚未选择 Persona`];
    if (
      !Array.isArray(persona.orchestrator?.actions) ||
      !persona.orchestrator.actions.length
    )
      return [`${persona.name} 尚未配置 Action Contract`];
    return [];
  });
});

function selectMode(value) {
  mode.value = value;
  nextTick(() => scrollModeIntoView(value));
  if (value === "single" && !personaId.value)
    personaId.value = personas.value[0]?.id || "";
  if (value === "multi" && !participants.value.length && personas.value[0])
    addParticipant();
}

function scrollModeIntoView(value) {
  const index = modes.findIndex((item) => item.id === value);
  const container = modeCards.value;
  if (index < 0 || !container || window.innerWidth > 760) return;
  container.scrollLeft = index * container.clientWidth;
}

function syncModeToScroll() {
  const container = modeCards.value;
  if (!container || window.innerWidth > 760 || !container.clientWidth) return;
  const index = Math.max(
    0,
    Math.min(
      modes.length - 1,
      Math.round(container.scrollLeft / container.clientWidth),
    ),
  );
  if (modes[index].id !== mode.value) selectMode(modes[index].id);
}

function startModeSwipe(event) {
  const touch = event.changedTouches?.[0];
  modeTouchStart.value = touch ? { x: touch.clientX, y: touch.clientY } : null;
}

function finishModeSwipe(event) {
  const start = modeTouchStart.value;
  modeTouchStart.value = null;
  if (!start || !modeCards.value) return;
  const currentIndex = Math.max(
    0,
    Math.min(
      modes.length - 1,
      Math.round(modeCards.value.scrollLeft / modeCards.value.clientWidth),
    ),
  );
  modeCards.value.scrollLeft = currentIndex * modeCards.value.clientWidth;
  if (modes[currentIndex].id !== mode.value) selectMode(modes[currentIndex].id);
}

function addParticipant() {
  participants.value.push({
    id: `participant-${Date.now()}-${participants.value.length}`,
    personaId: personas.value[0]?.id || "",
    alias: "",
    api: { keyRefId: keyRefId.value },
  });
}

function removeParticipant(index) {
  if (participants.value.length <= 1) return;
  participants.value.splice(index, 1);
}

function toggleRawTool(toolId) {
  rawToolIds.value = rawToolIds.value.includes(toolId)
    ? rawToolIds.value.filter((id) => id !== toolId)
    : [...rawToolIds.value, toolId];
}

function applyPreset() {
  const preset = presets.value.find((item) => item.id === presetChoice.value);
  if (!preset) return;
  if (preset.content) systemPrompt.value = preset.content;
  if (preset.temperature !== undefined && preset.temperature !== "")
    temperature.value = String(preset.temperature);
  if (preset.maxTokens !== undefined && preset.maxTokens !== "")
    maxTokens.value = String(preset.maxTokens);
}

async function create() {
  if (saving.value) return;
  if (orchestratorParticipantIssues.value.length) {
    emit("notify", orchestratorParticipantIssues.value.join("；"), "danger");
    return;
  }
  saving.value = true;
  try {
    const conversation = await props.application.create({
      name: name.value.trim() || "新对话",
      mode: mode.value,
      systemPrompt: systemPrompt.value,
      userMask:
        mode.value === "multi" ? { personaId: userMaskPersonaId.value } : null,
      personaId: mode.value === "single" ? personaId.value : null,
      personaIds:
        mode.value === "multi"
          ? participants.value
              .map((participant) => participant.personaId)
              .filter(Boolean)
          : [],
      participants: mode.value === "multi" ? participants.value : [],
      policy: mode.value === "multi" ? policy.value : null,
      orchestrator:
        mode.value === "multi" && policy.value === "orchestrated"
          ? {
              prompt: orchestratorPrompt.value,
              api: { keyRefId: orchestratorKeyRefId.value },
              maxDispatches: Number(maxDispatches.value),
            }
          : null,
      api: { keyRefId: keyRefId.value },
      requestOptions: {
        model: model.value.trim() || "deepseek-v4-flash",
        temperature: Number(temperature.value),
        maxTokens: Number(maxTokens.value),
        thinking: thinking.value,
        stream: stream.value,
      },
      toolIds: mode.value === "raw" ? rawToolIds.value : [],
    });
    emit("created", conversation);
  } catch (error) {
    emit("notify", error.message, "danger");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <main class="chat-create-view view">
    <header class="chat-create-header">
      <div>
        <p class="eyebrow">A NEW ROOM</p>
        <h1>开始一场新的对话</h1>
        <p>先选一个声音，或者邀请几位角色一起坐到桌边。</p>
      </div>
      <UiButton variant="ghost" @click="emit('cancel')"
        ><AppIcon name="close" />先不聊了</UiButton
      >
    </header>
    <section class="chat-create-layout">
      <div class="chat-create-main">
        <label class="chat-create-name"
          ><span>给这场对话起个名字</span
          ><input
            v-model="name"
            class="field"
            placeholder="例如：关于架构的夜谈"
        /></label>
        <section class="chat-create-section chat-create-mode-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">WHO IS AT THE TABLE?</p>
              <h2>谁来陪你聊</h2>
            </div>
            <span class="chat-create-current-mode">{{
              selectedMode?.title
            }}</span>
          </div>
          <div
            ref="modeCards"
            class="chat-mode-cards"
            @touchstart="startModeSwipe"
            @touchend="finishModeSwipe"
            @scroll="syncModeToScroll"
          >
            <button
              v-for="item in modes"
              :key="item.id"
              type="button"
              class="chat-mode-card"
              :class="{ active: mode === item.id }"
              @click="selectMode(item.id)"
            >
              <span class="chat-mode-card__icon"
                ><AppIcon :name="item.icon" size="20" /></span
              ><strong>{{ item.title }}</strong
              ><span>{{ item.description }}</span>
            </button>
          </div>
          <div class="chat-mode-dots" aria-label="选择对话模式">
            <button
              v-for="item in modes"
              :key="item.id"
              type="button"
              :class="{ active: mode === item.id }"
              :aria-label="`选择${item.title}模式`"
              :aria-current="mode === item.id ? 'true' : undefined"
              @click="selectMode(item.id)"
            />
          </div>
        </section>
        <section v-if="mode === 'multi'" class="chat-create-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">WHO ARE YOU HERE?</p>
              <h2>选择你的 User Mask</h2>
            </div>
            <span>多人模式</span>
          </div>
          <div class="chat-create-personas">
            <button
              v-for="persona in personas"
              :key="persona.id"
              type="button"
              class="chat-persona-choice"
              :class="{ active: userMaskPersonaId === persona.id }"
              @click="userMaskPersonaId = persona.id"
            >
              <span class="chat-persona-choice-icon"
                ><AppIcon name="scope-public" size="15" /></span
              ><span class="chat-persona-choice-name">{{ persona.name }}</span
              ><span class="chat-persona-choice-check"
                ><AppIcon
                  v-if="userMaskPersonaId === persona.id"
                  name="check"
                  size="13"
              /></span>
            </button>
            <p v-if="!personas.length" class="empty-state">
              还没有可用 Persona，无法创建 User Mask。
            </p>
          </div>
          <p class="chat-create-note">
            这个 Persona 描述多人对话中的“你”。它不会回复，也不会创建 Job。
          </p>
        </section>
        <section v-if="mode === 'multi'" class="chat-create-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">CONTROL POLICY</p>
              <h2>这一桌如何行动</h2>
            </div>
          </div>
          <div class="chat-policy-switch">
            <button
              type="button"
              :class="{ active: policy === 'fixed' }"
              @click="policy = 'fixed'"
            >
              <AppIcon name="scope-talk" />所有实例行动<span
                >每轮所有 Persona 都执行回复。</span
              ></button
            ><button
              type="button"
              :class="{ active: policy === 'orchestrated' }"
              @click="policy = 'orchestrated'"
            >
              <AppIcon name="condition" />Orchestrator 编排<span
                >根据 Action Schema 决定谁能行动和看到什么。</span
              >
            </button>
          </div>
          <div
            v-if="policy === 'orchestrated'"
            class="chat-orchestrator-config"
          >
            <label
              >Orchestrator API<select
                v-model="orchestratorKeyRefId"
                class="field"
              >
                <option value="" disabled>选择 API Key</option>
                <option v-for="key in keys" :key="key.id" :value="key.id">
                  {{ key.id }} · {{ key.provider }}
                </option>
              </select></label
            ><label
              >每轮最多 Dispatch<input
                v-model="maxDispatches"
                class="field"
                type="number"
                min="1" /></label
            ><label class="wide"
              >控制原则<CodeEditor
                :model-value="orchestratorPrompt"
                :text-resources="texts"
                style="min-height: 120px"
                placeholder="决定哪些 Persona 适合行动，并只提供完成 Action 所需的上下文。"
                @update:model-value="orchestratorPrompt = $event"
              />
            </label>
            <p
              v-if="orchestratorParticipantIssues.length"
              class="chat-create-orchestrator-warning"
            >
              <AppIcon name="info" />{{
                orchestratorParticipantIssues.join("；")
              }}。请到 Resource → Persona 配置 Action。
            </p>
          </div>
        </section>
        <section class="chat-create-section chat-create-system-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">
                {{ mode === "raw" ? "SYSTEM PROMPT" : "A LITTLE DIRECTION" }}
              </p>
              <h2>
                {{
                  mode === "raw"
                    ? "直接编写 System Prompt"
                    : "你希望这场对话记住什么？"
                }}
              </h2>
            </div>
            <span>{{ mode === "raw" ? "直接生效" : "可选" }}</span>
          </div>
          <label v-if="mode === 'raw' && presets.length" class="chat-create-preset">
            <span>从预设开始</span>
            <select v-model="presetChoice" class="field" @change="applyPreset">
              <option value="">自定义 System Prompt</option>
              <option v-for="preset in presets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
          </label>
          <CodeEditor
            :model-value="systemPrompt"
            :text-resources="texts"
            style="min-height: 180px"
            placeholder="写下背景、目标或你想要的相处方式……"
            @update:model-value="systemPrompt = $event"
          />
          <p class="chat-create-note">
            {{
              mode === "raw"
                ? "发送消息时只使用这段 System Prompt 和对话历史。"
                : "这段话会和角色的设定一起被听见。"
            }}
          </p>
        </section>
        <section v-if="mode === 'single'" class="chat-create-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">ONE VOICE</p>
              <h2>选择一位 Persona</h2>
            </div>
          </div>
          <div class="chat-create-personas">
            <button
              v-for="persona in personas"
              :key="persona.id"
              type="button"
              class="chat-persona-choice"
              :class="{ active: personaId === persona.id }"
              @click="personaId = persona.id"
            >
              <span class="chat-persona-choice-icon"
                ><AppIcon name="message" size="15" /></span
              ><span class="chat-persona-choice-name">{{ persona.name }}</span
              ><span class="chat-persona-choice-check"
                ><AppIcon
                  v-if="personaId === persona.id"
                  name="check"
                  size="13"
              /></span>
            </button>
            <p v-if="!personas.length" class="empty-state">
              还没有 Persona。去 Resource 里创造一位吧。
            </p>
          </div>
        </section>
        <section v-if="mode === 'multi'" class="chat-create-section">
          <div class="chat-create-section__heading">
            <div>
              <p class="eyebrow">MULTI PERSONA</p>
              <h2>配置 Persona 实例</h2>
            </div>
            <UiButton size="sm" @click="addParticipant"
              ><AppIcon name="plus" />添加实例</UiButton
            >
          </div>
          <div class="chat-participant-list">
            <article
              v-for="(participant, index) in participants"
              :key="participant.id"
              class="chat-participant-card"
            >
              <span class="chat-participant-number">{{
                String(index + 1).padStart(2, "0")
              }}</span
              ><label
                >Persona<select v-model="participant.personaId" class="field">
                  <option value="" disabled>选择 Persona</option>
                  <option
                    v-for="persona in personas"
                    :key="persona.id"
                    :value="persona.id"
                  >
                    {{ persona.name }}
                  </option>
                </select></label
              ><label
                >本次别名<input
                  v-model="participant.alias"
                  class="field"
                  :placeholder="
                    personas.find(
                      (persona) => persona.id === participant.personaId,
                    )?.name || '例如：张三-保守派'
                  " /></label
              ><label
                >API Key<select
                  v-model="participant.api.keyRefId"
                  class="field"
                >
                  <option value="">使用当前 Key</option>
                  <option v-for="key in keys" :key="key.id" :value="key.id">
                    {{ key.id }} ·
                    {{ key.temporary ? "浏览器直连" : key.provider }}
                  </option>
                </select></label
              ><UiButton
                variant="ghost"
                size="icon"
                title="删除实例"
                :disabled="participants.length <= 1"
                @click="removeParticipant(index)"
                ><AppIcon name="trash" size="13"
              /></UiButton>
            </article>
            <p v-if="!personas.length" class="empty-state">
              请先在 Resource 中创建 Persona。
            </p>
          </div>
          <p class="chat-create-note">
            发送一次，会为每个实例分别生成一条回复。每个实例可以引用同一个
            Persona，也可以分配相同或不同的 API Key。
          </p>
        </section>
      </div>
      <aside class="chat-create-aside">
        <section class="chat-create-quiet-panel">
          <div class="chat-create-aside-title">
            <span class="chat-create-aside-mark"
              ><AppIcon name="bolt" size="14"
            /></span>
            <div>
              <p class="eyebrow">THE PRACTICAL PART</p>
              <h2>连接与偏好</h2>
            </div>
          </div>
          <label
            >使用哪把 Key<select v-model="keyRefId" class="field">
              <option value="">选择 API Key</option>
              <option v-for="key in keys" :key="key.id" :value="key.id">
                {{ key.id }} · {{ key.temporary ? "浏览器直连" : key.provider }}
              </option>
            </select></label
          >
          <div v-if="mode === 'raw'" class="chat-raw-tools">
            <span class="field-label">允许访问的 Tools</span>
            <button
              v-for="tool in tools"
              :key="tool.id"
              type="button"
              :class="{ active: rawToolIds.includes(tool.id) }"
              @click="toggleRawTool(tool.id)"
            >
              <AppIcon name="tool" size="13" />
              <span>{{ tool.name }}</span>
              <AppIcon
                v-if="rawToolIds.includes(tool.id)"
                name="check"
                size="12"
              />
            </button>
            <small v-if="!tools.length">暂无可用 Tool Resource。</small>
          </div>
          <details class="chat-create-details">
            <summary>更多偏好</summary>
            <div class="chat-create-details__body">
              <label>Model<input v-model="model" class="field" /></label>
              <div class="chat-create-params">
                <label
                  >Temperature<input
                    v-model="temperature"
                    class="field"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1" /></label
                ><label
                  >Max tokens<input
                    v-model="maxTokens"
                    class="field"
                    type="number"
                    min="1"
                    step="1"
                /></label>
              </div>
              <label class="chat-create-check"
                ><input
                  v-model="thinking"
                  type="checkbox"
                />让我看到思考过程</label
              ><label class="chat-create-check"
                ><input v-model="stream" type="checkbox" />边生成边显示</label
              >
            </div>
          </details>
        </section>
        <UiButton
          variant="primary"
          class="chat-create-submit"
          :disabled="
            saving ||
            !keyRefId ||
            orchestratorParticipantIssues.length > 0 ||
            (mode === 'multi' &&
              (!userMaskPersonaId ||
                (policy === 'orchestrated' && !orchestratorKeyRefId)))
          "
          @click="create"
          ><AppIcon name="send" />{{
            saving ? "正在准备" : "进入对话"
          }}</UiButton
        >
      </aside>
    </section>
  </main>
</template>
