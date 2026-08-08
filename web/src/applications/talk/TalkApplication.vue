<script setup>
import { computed, ref, watch } from "vue";
import AppIcon from "../../components/AppIcon.js";
import CodeEditor from "../../components/CodeEditor.vue";
import UiButton from "../../components/UiButton.vue";
import { formatSessionTime } from "./talk-clock.js";
const props = defineProps({ application: Object });
const emit = defineEmits(["notify"]);
const draft = ref(""),
  contextGuidance = ref(""),
  planAction = ref(""),
  planAt = ref("");
const talk = computed(() => props.application.activeTalk),
  session = computed(() => props.application.activeSession),
  persona = computed(() =>
    props.application.personas.find(
      (item) => item.id === talk.value?.personaId,
    ),
  );
const panel = computed({
  get: () => props.application.ui.panel,
  set: (value) => {
    props.application.ui.panel = value;
    void props.application.save();
  },
});
const running = computed(
  () => session.value?.runs?.at(-1)?.status === "running",
);
async function call(action, success) {
  try {
    await action();
    if (success) emit("notify", success);
  } catch (error) {
    emit(
      "notify",
      error.message,
      error.name === "AbortError" ? "warning" : "danger",
    );
  }
}
async function send() {
  const value = draft.value;
  draft.value = "";
  await call(() => props.application.sendMessage(value));
}
async function addPlan() {
  if (!planAction.value || !planAt.value) return;
  session.value.plans.push({
    id: `plan-${Date.now()}`,
    action: planAction.value,
    scheduledAt: new Date(planAt.value).toISOString(),
    expiresAt: null,
    stateEffect: "",
    contactIntent: "consider",
    status: "pending",
    processedAt: null,
  });
  planAction.value = "";
  planAt.value = "";
  await props.application.save();
}
watch(
  () => `${talk.value?.id || ""}:${session.value?.id || ""}`,
  async (key) => {
    if (key === ":") return;
    try {
      await props.application.enterActiveSession();
    } catch (error) {
      emit("notify", `Talk 自动推进失败：${error.message}`, "danger");
    }
  },
  { immediate: true },
);
</script>
<template>
  <section v-if="talk" class="talk-view view">
    <header class="talk-header">
      <div class="talk-identity">
        <span class="talk-avatar"><AppIcon name="scope-talk" size="22" /></span>
        <div>
          <p class="eyebrow">{{ persona?.name || "PERSONA MISSING" }}</p>
          <h1>{{ talk.name }}</h1>
        </div>
      </div>
      <div v-if="session" class="talk-session">
        <AppIcon name="message" />
        <span class="talk-session__label">频道</span>
        <select
          :value="session.id"
          aria-label="选择频道"
          @change="application.selectSession($event.target.value)"
        >
          <option v-for="item in talk.sessions" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <small
          ><AppIcon name="clock" size="11" />{{
            formatSessionTime(session.clock)
          }}</small
        >
        <UiButton
          size="icon"
          variant="ghost"
          title="新建频道"
          @click="application.addSession()"
          ><AppIcon name="plus"
        /></UiButton>
      </div>
      <nav>
        <UiButton
          v-for="item in [
            { id: 'conversation', icon: 'message', label: '对话' },
            { id: 'state', icon: 'info', label: '状态' },
            { id: 'plans', icon: 'clock', label: '计划' },
            { id: 'runtime', icon: 'settings', label: '运行' },
          ]"
          :key="item.id"
          size="sm"
          variant="ghost"
          :active="panel === item.id"
          @click="panel = item.id"
          ><AppIcon :name="item.icon" />{{ item.label }}</UiButton
        >
      </nav>
    </header>
    <main v-if="session" class="talk-main">
      <section v-if="panel === 'conversation'" class="talk-conversation">
        <div class="talk-messages">
          <div v-if="!session.conversation.length" class="talk-empty">
            <AppIcon name="message" size="30" /><strong
              >这个频道还没有消息</strong
            ><span>长期影响会沉淀到状态、记忆和计划，而不是塞进聊天历史。</span>
          </div>
          <article
            v-for="message in session.conversation"
            :key="message.id"
            :class="['talk-message', message.role]"
          >
            <small>{{
              message.role === "user" ? "用户" : persona?.name
            }}</small>
            <p>{{ message.content }}</p>
            <time>{{ new Date(message.createdAt).toLocaleString() }}</time>
          </article>
        </div>
        <form class="talk-composer" @submit.prevent="send">
          <CodeEditor
            :model-value="draft"
            :text-resources="application.texts"
            compact
            placeholder="发送消息；输入 @ 引用文本"
            @update:model-value="draft = $event"
            @submit="send"
          /><UiButton
            v-if="running"
            type="button"
            variant="danger"
            @click="application.stop()"
            ><AppIcon name="stop" /></UiButton
          ><UiButton
            v-else
            type="submit"
            variant="primary"
            :disabled="!draft.trim()"
            ><AppIcon name="send"
          /></UiButton>
        </form>
      </section>
      <section v-else-if="panel === 'state'" class="talk-dashboard">
        <article class="talk-data-card featured">
          <header>
            <AppIcon name="scope-all" />
            <div>
              <strong>客观状态</strong><small>可被旁观者验证的当前事实</small>
            </div>
          </header>
          <CodeEditor
            :model-value="session.state"
            :text-resources="application.texts"
            style="min-height: 220px"
            placeholder="客观状态；输入 @ 引用文本"
            @update:model-value="session.state = $event"
            @blur="application.save()"
          />
        </article>
        <article class="talk-data-card">
          <header>
            <AppIcon name="file" />
            <div>
              <strong>频道背景</strong><small>本频道的关系、情境和边界</small>
            </div>
          </header>
          <CodeEditor
            :model-value="session.sessionContext"
            :text-resources="application.texts"
            style="min-height: 140px"
            placeholder="频道背景；输入 @ 引用文本"
            @update:model-value="session.sessionContext = $event"
            @blur="application.save()"
          /><input v-model="contextGuidance" placeholder="生成说明" /><UiButton
            size="sm"
            @click="
              call(
                () => application.generateSessionContext(contextGuidance),
                '频道背景已生成',
              )
            "
            ><AppIcon name="robot" />AI 生成</UiButton
          >
        </article>
        <article class="talk-data-card memories">
          <header>
            <AppIcon name="brain" />
            <div>
              <strong>主观记忆</strong
              ><small>{{ session.memory.length }} 条</small>
            </div>
          </header>
          <div v-for="memory in session.memory" :key="memory.id">
            <CodeEditor
              :model-value="memory.content"
              :text-resources="application.texts"
              placeholder="记忆内容；输入 @ 引用文本"
              @update:model-value="memory.content = $event"
              @blur="application.save()"
            /><UiButton
              variant="ghost"
              size="icon"
              @click="
                session.memory = session.memory.filter(
                  (i) => i.id !== memory.id,
                );
                application.save();
              "
              ><AppIcon name="trash"
            /></UiButton>
          </div>
          <p v-if="!session.memory.length">管线尚未沉淀长期记忆。</p>
        </article>
      </section>
      <section v-else-if="panel === 'plans'" class="talk-plans">
        <form @submit.prevent="addPlan">
          <input v-model="planAction" placeholder="行动" /><input
            v-model="planAt"
            type="datetime-local"
          /><UiButton type="submit"><AppIcon name="plus" />添加</UiButton>
        </form>
        <article
          v-for="plan in session.plans"
          :key="plan.id"
          :class="`talk-plan talk-plan--${plan.status}`"
        >
          <span><AppIcon name="clock" /></span>
          <div>
            <strong>{{ plan.action }}</strong
            ><small
              >{{ new Date(plan.scheduledAt).toLocaleString() }} /
              {{ plan.contactIntent }}</small
            >
            <p v-if="plan.stateEffect">{{ plan.stateEffect }}</p>
          </div>
          <em>{{ plan.status }}</em>
        </article>
        <div v-if="!session.plans.length" class="talk-empty">暂无计划</div>
      </section>
      <section v-else class="talk-runtime">
        <article>
          <header>
            <strong>Pipeline</strong
            ><UiButton
              v-if="running"
              variant="danger"
              size="sm"
              @click="application.stop()"
              ><AppIcon name="stop" />停止</UiButton
            ><UiButton
              v-else
              size="sm"
              @click="call(() => application.runPipeline(), '维护运行完成')"
              ><AppIcon name="play" />运行维护</UiButton
            >
          </header>
          <div class="talk-stage-track">
            <span
              v-for="stage in [
                'state-transition',
                'memory-reflection',
                'plan-manager',
                'contact-gate',
                'conversation-writer',
              ]"
              :key="stage"
              :class="{ active: session.runs.at(-1)?.currentStage === stage }"
              >{{ stage }}</span
            >
          </div>
        </article>
        <article>
          <header>
            <strong>运行历史</strong><small>最多保留 30 轮</small>
          </header>
          <div
            v-for="run in [...session.runs].reverse()"
            :key="run.id"
            class="talk-run"
          >
            <span :class="`talk-run-dot talk-run-dot--${run.status}`"></span>
            <div>
              <strong>{{ run.trigger }} / {{ run.status }}</strong
              ><small
                >{{ new Date(run.startedAt).toLocaleString() }} ·
                {{ run.stages.length }} stages</small
              >
              <p v-if="run.error">{{ run.error }}</p>
            </div>
          </div>
        </article>
        <article class="talk-config">
          <header>
            <strong>Talk 请求快照</strong><small>修改只影响后续 Job</small>
          </header>
          <label
            >API Key<select
              v-model="talk.api.keyRefId"
              @change="application.save()"
            >
              <option value="">请选择</option>
              <option
                v-for="key in application.workspace.allKeys()"
                :key="key.id"
                :value="key.id"
              >
                {{ key.id }}
              </option>
            </select></label
          ><label
            >Model<input
              v-model="talk.requestOptions.model"
              @change="application.save()"
          /></label>
        </article>
      </section>
    </main>
  </section>
  <section v-else class="empty-state">从侧边栏新建一个 Talk。</section>
</template>
