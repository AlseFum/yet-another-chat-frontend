<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppIcon from "../../components/AppIcon.js";
import CodeEditor from "../../components/CodeEditor.vue";
import UiButton from "../../components/UiButton.vue";
import UiDrawer from "../../components/UiDrawer.vue";
import UiModal from "../../components/UiModal.vue";
import {
  formatPersonaSectionName,
  parsePersonaSectionName,
  personaItemReference,
  personaSectionScopes,
  validatePersona,
} from "./persona-resource.js";

const props = defineProps({ application: Object });
const emit = defineEmits(["notify", "open-sidebar"]);
const selectedId = ref("");
const deleteName = ref("");
const deleteOpen = ref(false);
const deleting = ref(false);
const highlightsOpen = ref(false);
const mobile = ref(false);
const saveStatus = ref("saved");
const personaDrag = ref(null);
const personaDropTarget = ref(null);
const personaGenerateOpen = ref(false);
const personaGeneratePrompt = ref("");
const personaGenerating = ref(false);
const personaGenerateError = ref("");
const personaEditMode = ref(false);
const personaTouchStart = ref(null);
const personaScopeIcons = {
  all: "scope-all",
  chat: "scope-chat",
  "talk:private": "scope-talk",
  "talk:public": "scope-public",
};
let saveTimer = null;
const labels = {
  text: ["文本", "file"],
  preset: ["预设", "preset"],
  tool: ["工具", "tool"],
  persona: ["Persona", "message"],
};
const type = computed(() => props.application.activeType);
const items = computed(() => props.application[type.value] || []);
const selected = computed(
  () =>
    items.value.find((item) => item.id === selectedId.value) || items.value[0],
);
const language = computed(() =>
  type.value === "tool" ? "javascript" : "markdown",
);
const toolFunctionName = computed(() => {
  const name = String(selected.value?.name || "tool")
    .normalize("NFKC")
    .replace(/[^\p{ID_Continue}$]/gu, "_");
  return /^[\p{ID_Start}$_]/u.test(name) ? name : `_${name}`;
});
const autoSave = computed(
  () =>
    props.application.workspace?.getCustomSettings(props.application.id)
      ?.autoSave !== false,
);
const textResources = computed(() => props.application.text || []);
const personaIssues = computed(() =>
  type.value === "persona" && selected.value
    ? validatePersona(
        selected.value,
        new Set(textResources.value.map((item) => item.id)),
      )
    : [],
);
const personaStats = computed(() => {
  const sections = selected.value?.sections || [];
  const itemCount = sections.reduce(
    (total, section) => total + Math.max(0, section.length - 1),
    0,
  );
  const referenceCount = sections.reduce(
    (total, section) =>
      total +
      section.slice(1).filter((item) => personaItemReference(item) !== null)
        .length,
    0,
  );
  return {
    sections: sections.length,
    items: itemCount,
    references: referenceCount,
  };
});

function updateMobile() {
  mobile.value = window.matchMedia("(max-width: 760px)").matches;
}
function backToList() {
  selectedId.value = "";
}

watch(type, () => {
  selectedId.value = "";
  highlightsOpen.value = false;
  personaEditMode.value = false;
});
watch(selectedId, () => {
  personaEditMode.value = false;
});

onMounted(() => {
  updateMobile();
  window.addEventListener("resize", updateMobile);
});
onBeforeUnmount(() => window.removeEventListener("resize", updateMobile));
onBeforeUnmount(() => window.clearTimeout(saveTimer));
onBeforeUnmount(() => endPersonaPointerDrag());

watch(
  () => (selected.value ? JSON.stringify(selected.value) : ""),
  () => {
    if (!autoSave.value || !selected.value) return;
    saveStatus.value = "pending";
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => {
      try {
        await props.application.save();
        saveStatus.value = "saved";
      } catch (error) {
        saveStatus.value = "error";
        emit("notify", error.message, "danger");
      }
    }, 650);
  },
  { flush: "post" },
);

async function add() {
  try {
    const item = props.application.create(type.value);
    await props.application.save();
    selectedId.value = item.id;
    personaEditMode.value = type.value === "persona";
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}

async function save() {
  saveStatus.value = "saving";
  try {
    await props.application.save();
    saveStatus.value = "saved";
  } catch (error) {
    saveStatus.value = "error";
    emit("notify", error.message, "danger");
  }
}

const saveLabel = computed(
  () =>
    ({
      saved: "已保存",
      pending: "待保存",
      saving: "保存中",
      error: "保存失败",
    })[saveStatus.value],
);

async function toggleAutoSave() {
  try {
    if (autoSave.value) window.clearTimeout(saveTimer);
    await props.application.workspace.updateCustomSetting(
      props.application.id,
      "autoSave",
      !autoSave.value,
    );
    saveStatus.value = "saved";
    emit("notify", autoSave.value ? "已切换为自动保存" : "已切换为手动保存");
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}

async function generate() {
  if (type.value === "persona") {
    personaGeneratePrompt.value = "";
    personaGenerateError.value = "";
    personaGenerateOpen.value = true;
    return;
  }
  try {
    await props.application.generate(type.value, selected.value);
    emit("notify", "内容生成完成");
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}

function togglePersonaEdit() {
  personaEditMode.value = !personaEditMode.value;
}

function startPersonaSwipe(event) {
  const touch = event.changedTouches?.[0];
  personaTouchStart.value = touch
    ? { x: touch.clientX, y: touch.clientY }
    : null;
}

function finishPersonaSwipe(event) {
  const start = personaTouchStart.value;
  const touch = event.changedTouches?.[0];
  personaTouchStart.value = null;
  if (!start || !touch || type.value !== "persona") return;
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
  if (dx < 0 && !personaEditMode.value) personaEditMode.value = true;
  if (dx > 0 && personaEditMode.value) personaEditMode.value = false;
}

async function generatePersona() {
  const prompt = personaGeneratePrompt.value.trim();
  if (!prompt || personaGenerating.value) return;
  personaGenerating.value = true;
  personaGenerateError.value = "";
  try {
    await props.application.generate("persona", selected.value, prompt);
    personaGenerateOpen.value = false;
    emit("notify", "Persona 生成完成");
  } catch (error) {
    personaGenerateError.value = error.message;
    emit("notify", error.message, "danger");
  } finally {
    personaGenerating.value = false;
  }
}

function personaSection(index) {
  return parsePersonaSectionName(selected.value.sections[index]?.[0]);
}

function personaScopeLabel(scope) {
  return (
    personaSectionScopes.find((option) => option.value === scope)?.label ||
    "未知作用域"
  );
}

function personaSectionIssue(sectionIndex) {
  return personaIssues.value.some(
    (issue) => issue.sectionIndex === sectionIndex,
  );
}

function personaItemIssue(sectionIndex, itemIndex) {
  return personaIssues.value.some(
    (issue) =>
      issue.sectionIndex === sectionIndex && issue.itemIndex === itemIndex,
  );
}

function personaItemKey(section, itemIndex) {
  const item = section[itemIndex + 1];
  const occurrence = section
    .slice(1, itemIndex + 1)
    .filter((value) => value === item).length;
  return `${item}:${occurrence}`;
}

function setSectionScope(index, scope) {
  const section = personaSection(index);
  selected.value.sections[index][0] = formatPersonaSectionName(
    scope,
    section.title,
  );
}

function setSectionTitle(index, title) {
  const section = personaSection(index);
  selected.value.sections[index][0] = formatPersonaSectionName(
    section.scope,
    title,
  );
}

function addPersonaSection() {
  selected.value.sections ||= [];
  selected.value.sections.push(["新 Section", ""]);
}

function addPersonaAction() {
  selected.value.orchestrator ||= { summary: "", actions: [] };
  selected.value.orchestrator.actions.push({
    id: `action-${selected.value.orchestrator.actions.length + 1}`,
    name: "新行动",
    description: "",
    triggers: [],
    tools: [],
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    sideEffects: "none",
  });
}

function removePersonaAction(index) {
  selected.value.orchestrator.actions.splice(index, 1);
}
function schemaText(schema) {
  return JSON.stringify(schema, null, 2);
}
function setActionSchema(action, key, value) {
  try {
    action[key] = JSON.parse(value);
  } catch {
    /* Keep the last valid schema while editing. */
  }
}
function triggerText(action) {
  return (action.triggers || []).join("\n");
}
function setActionTriggers(action, value) {
  action.triggers = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
function toolText(action) {
  return (action.tools || []).join("\n");
}
function setActionTools(action, value) {
  action.tools = value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function removePersonaSection(index) {
  selected.value.sections.splice(index, 1);
}

function movePersonaSection(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= selected.value.sections.length) return;
  const [section] = selected.value.sections.splice(index, 1);
  selected.value.sections.splice(target, 0, section);
}

function startPersonaSectionDrag(event, sectionIndex) {
  personaDrag.value = { type: "section", sectionIndex };
  personaDropTarget.value = null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", `persona-section:${sectionIndex}`);
}

function startPersonaItemDrag(event, sectionIndex, itemIndex) {
  personaDrag.value = { type: "item", sectionIndex, itemIndex };
  personaDropTarget.value = null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(
    "text/plain",
    `persona-item:${sectionIndex}:${itemIndex}`,
  );
}

function setPersonaDropTarget(event, type, sectionIndex, itemIndex = null) {
  if (personaDrag.value?.type !== type) return;
  event.preventDefault();
  if (type === "item") event.stopPropagation();
  event.dataTransfer.dropEffect = "move";
  const after =
    event.currentTarget.getBoundingClientRect().top +
      event.currentTarget.offsetHeight / 2 <
    event.clientY;
  personaDropTarget.value = { type, sectionIndex, itemIndex, after };
}

function dropPersonaSection(event, sectionIndex) {
  if (personaDrag.value?.type !== "section") return;
  event.preventDefault();
  const source = personaDrag.value.sectionIndex;
  let target = sectionIndex + (personaDropTarget.value?.after ? 1 : 0);
  const [section] = selected.value.sections.splice(source, 1);
  if (source < target) target--;
  selected.value.sections.splice(target, 0, section);
  endPersonaDrag();
}

function dropPersonaItem(event, sectionIndex, itemIndex = null) {
  if (personaDrag.value?.type !== "item") return;
  event.preventDefault();
  event.stopPropagation();
  const sourceSection = selected.value.sections[personaDrag.value.sectionIndex];
  const targetSection = selected.value.sections[sectionIndex];
  const source = personaDrag.value.itemIndex + 1;
  const [item] = sourceSection.splice(source, 1);
  let target =
    itemIndex === null
      ? targetSection.length
      : itemIndex + 1 + (personaDropTarget.value?.after ? 1 : 0);
  if (sourceSection === targetSection && source < target) target--;
  targetSection.splice(target, 0, item);
  endPersonaDrag();
}

function endPersonaDrag() {
  personaDrag.value = null;
  personaDropTarget.value = null;
}

function startPersonaPointerDrag(event, type, sectionIndex, itemIndex = null) {
  if (!["touch", "pen"].includes(event.pointerType)) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  personaDrag.value = {
    type,
    sectionIndex,
    itemIndex,
    pointerId: event.pointerId,
  };
  personaDropTarget.value = null;
  document.addEventListener("pointermove", handlePersonaPointerMove, {
    passive: false,
  });
  document.addEventListener("pointerup", handlePersonaPointerUp, {
    once: true,
  });
  document.addEventListener("pointercancel", handlePersonaPointerUp, {
    once: true,
  });
}

function handlePersonaPointerMove(event) {
  if (personaDrag.value?.pointerId !== event.pointerId) return;
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target) return;
  if (personaDrag.value.type === "section") {
    const section = target.closest("[data-persona-section-index]");
    if (!section) return;
    const sectionIndex = Number(section.dataset.personaSectionIndex);
    const after =
      event.clientY >
      section.getBoundingClientRect().top + section.offsetHeight / 2;
    personaDropTarget.value = { type: "section", sectionIndex, after };
    return;
  }
  const item = target.closest(
    "[data-persona-item-section-index][data-persona-item-index]",
  );
  if (item) {
    const sectionIndex = Number(item.dataset.personaItemSectionIndex);
    const itemIndex = Number(item.dataset.personaItemIndex);
    const after =
      event.clientY > item.getBoundingClientRect().top + item.offsetHeight / 2;
    personaDropTarget.value = { type: "item", sectionIndex, itemIndex, after };
    return;
  }
  const end = target.closest("[data-persona-item-end-section-index]");
  if (end)
    personaDropTarget.value = {
      type: "item",
      sectionIndex: Number(end.dataset.personaItemEndSectionIndex),
      itemIndex: null,
      after: true,
    };
}

function handlePersonaPointerUp(event) {
  if (personaDrag.value?.pointerId !== event.pointerId) return;
  const drag = personaDrag.value;
  const target = personaDropTarget.value;
  if (target?.type === "section" && drag.type === "section") {
    reorderPersonaSection(drag.sectionIndex, target.sectionIndex, target.after);
  } else if (target?.type === "item" && drag.type === "item") {
    reorderPersonaItem(
      drag.sectionIndex,
      drag.itemIndex,
      target.sectionIndex,
      target.itemIndex,
      target.after,
    );
  }
  endPersonaPointerDrag();
}

function endPersonaPointerDrag() {
  document.removeEventListener("pointermove", handlePersonaPointerMove);
  document.removeEventListener("pointerup", handlePersonaPointerUp);
  document.removeEventListener("pointercancel", handlePersonaPointerUp);
  if (personaDrag.value?.pointerId !== undefined) endPersonaDrag();
}

function reorderPersonaSection(sourceIndex, targetIndex, after = false) {
  if (sourceIndex === targetIndex && !after) return;
  let target = targetIndex + (after ? 1 : 0);
  const [section] = selected.value.sections.splice(sourceIndex, 1);
  if (sourceIndex < target) target--;
  selected.value.sections.splice(
    Math.max(0, Math.min(target, selected.value.sections.length)),
    0,
    section,
  );
}

function reorderPersonaItem(
  sourceSectionIndex,
  sourceItemIndex,
  targetSectionIndex,
  targetItemIndex = null,
  after = false,
) {
  const sourceSection = selected.value.sections[sourceSectionIndex];
  const targetSection = selected.value.sections[targetSectionIndex];
  const [item] = sourceSection.splice(sourceItemIndex + 1, 1);
  let target =
    targetItemIndex === null
      ? targetSection.length
      : targetItemIndex + 1 + (after ? 1 : 0);
  if (sourceSection === targetSection && sourceItemIndex + 1 < target) target--;
  targetSection.splice(
    Math.max(1, Math.min(target, targetSection.length)),
    0,
    item,
  );
}

function addPersonaItem(section) {
  section.push("");
}

function removePersonaItem(section, index) {
  section.splice(index + 1, 1);
}

function movePersonaItem(section, index, offset) {
  const source = index + 1;
  const target = source + offset;
  if (target < 1 || target >= section.length) return;
  const [item] = section.splice(source, 1);
  section.splice(target, 0, item);
}

function setPersonaItemMode(section, index, mode) {
  const source = index + 1;
  if (mode === "reference")
    section[source] = textResources.value[0]
      ? `@[${textResources.value[0].id}]`
      : "@[]";
  else if (personaItemReference(section[source]) !== null) section[source] = "";
}

function setPersonaReference(section, index, resourceId) {
  section[index + 1] = `@${resourceId}`;
}

async function generateHighlights() {
  try {
    await props.application.generateHighlights(selected.value);
    emit("notify", "高亮规则已生成");
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}

function removeHighlight(index) {
  selected.value.highlights.splice(index, 1);
}

function addHighlight() {
  selected.value.highlights ||= [];
  selected.value.highlights.push({
    pattern: "",
    className: "keyword",
    description: "",
    color: "",
    background: "",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    enabled: true,
  });
  highlightsOpen.value = true;
}

async function remove() {
  deleting.value = true;
  try {
    const index = items.value.findIndex(
      (item) => item.id === selected.value?.id,
    );
    await props.application.remove(type.value, selected.value.id);
    selectedId.value =
      items.value[index]?.id || items.value[index - 1]?.id || "";
    deleteOpen.value = false;
    deleteName.value = "";
    emit("notify", "资源已删除");
  } catch (error) {
    deleting.value = false;
    emit("notify", error.message, "danger");
  }
}

function confirmRemove() {
  deleteName.value = selected.value?.name || "未命名资源";
  deleting.value = false;
  deleteOpen.value = true;
}
</script>

<template>
  <section
    class="resource-view view"
    :class="{ 'resource-view--editing': mobile && selectedId }"
  >
    <aside class="resource-list">
      <header>
        <div class="resource-list__title">
          <UiButton
            v-if="mobile"
            variant="ghost"
            size="icon"
            title="返回资源分类"
            @click="emit('open-sidebar')"
            ><AppIcon name="back"
          /></UiButton>
          <div>
            <p class="eyebrow">RESOURCE</p>
            <h2>{{ labels[type][0] }}</h2>
          </div>
        </div>
        <UiButton variant="ghost" size="icon" title="新建资源" @click="add"
          ><AppIcon name="plus"
        /></UiButton>
      </header>
      <button
        v-for="item in items"
        :key="item.id"
        :class="{ active: selected?.id === item.id }"
        @click="selectedId = item.id"
      >
        <AppIcon :name="labels[type][1]" /><span>{{ item.name }}</span>
      </button>
    </aside>
    <Transition name="resource-editor" mode="out-in">
      <main
        v-if="selected && (!mobile || selectedId)"
        class="resource-editor"
        @touchstart="type === 'persona' && startPersonaSwipe($event)"
        @touchend="type === 'persona' && finishPersonaSwipe($event)"
      >
        <header>
          <div>
            <UiButton
              v-if="mobile"
              variant="ghost"
              size="icon"
              title="返回资源列表"
              @click="backToList"
              ><AppIcon name="back"
            /></UiButton>
            <div>
              <p class="eyebrow">{{ type.toUpperCase() }}</p>
              <h1>
                {{ type === "persona" && !personaEditMode ? "查看" : "编辑"
                }}{{ labels[type][0] }}
              </h1>
            </div>
          </div>
          <div class="resource-editor__actions">
            <UiButton
              v-if="type === 'persona' && !personaEditMode"
              variant="primary"
              @click="togglePersonaEdit"
              ><AppIcon name="edit" />编辑 Persona</UiButton
            ><UiButton
              v-if="type === 'persona' && personaEditMode"
              variant="ghost"
              @click="togglePersonaEdit"
              ><AppIcon name="eye" />查看 Persona</UiButton
            ><UiButton
              v-if="type !== 'persona' || personaEditMode"
              :disabled="selected.generating"
              @click="generate"
              ><AppIcon name="robot" />{{
                selected.generating ? "生成中" : "AI 生成"
              }}</UiButton
            >
            <div
              class="resource-save-group"
              v-if="type !== 'persona' || personaEditMode"
            >
              <span
                v-if="autoSave"
                class="resource-save-status"
                :class="`is-${saveStatus}`"
                ><AppIcon
                  :name="saveStatus === 'error' ? 'info' : 'check'"
                  size="13"
                />{{ saveLabel }}</span
              ><UiButton v-else variant="primary" @click="save"
                ><AppIcon name="check" />保存</UiButton
              ><UiButton
                class="resource-save-mode"
                variant="ghost"
                size="icon"
                :title="autoSave ? '切换为手动保存' : '切换为自动保存'"
                :aria-label="autoSave ? '切换为手动保存' : '切换为自动保存'"
                @click="toggleAutoSave"
                ><AppIcon :name="autoSave ? 'bolt' : 'edit'" size="14"
              /></UiButton>
            </div>
          </div>
        </header>
        <div class="resource-fields">
          <label
            >名称<input
              v-model="selected.name"
              :readonly="type === 'persona' && !personaEditMode"
              class="field resource-name"
          /></label>
          <label v-if="type === 'tool'"
            >功能描述<input v-model="selected.description" class="field"
          /></label>
          <label v-if="type === 'tool'"
            >调用 args<textarea
              v-model="selected.args"
              class="field tool-args"
              rows="4"
              placeholder="描述工具调用时传入的 ctx.args"
            />
          </label>
          <div v-if="type === 'preset'" class="resource-params">
            <label
              >Temperature<input
                v-model="selected.temperature"
                class="field" /></label
            ><label
              >Max tokens<input v-model="selected.maxTokens" class="field"
            /></label>
          </div>
        </div>
        <div v-if="type === 'tool'" class="tool-code-editor">
          <code class="tool-code-editor__prefix"
            >async function {{ toolFunctionName }}(ctx) {</code
          >
          <CodeEditor v-model="selected.content" :language="language" />
          <code class="tool-code-editor__suffix">}</code>
        </div>
        <div
          v-else-if="type === 'persona'"
          class="persona-editor"
          :class="{ 'persona-editor--readonly': !personaEditMode }"
        >
          <div class="persona-editor__intro">
            <div class="persona-editor__intro-copy">
              <p class="eyebrow">PERSONA BLUEPRINT</p>
              <strong>Prompt Sections</strong
              ><span
                >把角色拆成有顺序的主题模块，再按 Chat / Talk 场景投影。</span
              >
            </div>
            <div class="persona-editor__intro-actions">
              <div class="persona-editor__stats">
                <span
                  ><strong>{{ personaStats.sections }}</strong> sections</span
                ><span
                  ><strong>{{ personaStats.items }}</strong> items</span
                ><span
                  ><strong>{{ personaStats.references }}</strong> refs</span
                >
              </div>
              <UiButton
                v-if="personaEditMode"
                size="sm"
                @click="addPersonaSection"
                ><AppIcon name="plus" />添加 Section</UiButton
              >
            </div>
          </div>
          <div class="persona-editor__tip">
            <AppIcon name="info" size="14" /><span
              >建议按“身份、目标、原则、能力、交流方式”组织内容。输入 @ 可插入
              Text 引用，保存为
              @[text-resource-id]，运行时展开为引用文本。</span
            >
          </div>
          <TransitionGroup
            name="persona-section"
            tag="div"
            class="persona-section-list"
          >
            <div
              v-for="(section, sectionIndex) in selected.sections || []"
              :key="section"
              class="persona-section-card"
              :data-persona-section-index="sectionIndex"
              :class="{
                'has-issue': personaSectionIssue(sectionIndex),
                'is-dragging':
                  personaDrag?.type === 'section' &&
                  personaDrag.sectionIndex === sectionIndex,
                'is-drop-before':
                  personaDropTarget?.type === 'section' &&
                  personaDropTarget.sectionIndex === sectionIndex &&
                  !personaDropTarget.after,
                'is-drop-after':
                  personaDropTarget?.type === 'section' &&
                  personaDropTarget.sectionIndex === sectionIndex &&
                  personaDropTarget.after,
              }"
              @dragover="setPersonaDropTarget($event, 'section', sectionIndex)"
              @drop="dropPersonaSection($event, sectionIndex)"
            >
              <header>
                <span
                  v-if="personaEditMode"
                  class="persona-drag-handle"
                  draggable="true"
                  title="拖动 Section 排序"
                  @pointerdown="
                    startPersonaPointerDrag($event, 'section', sectionIndex)
                  "
                  @dragstart="startPersonaSectionDrag($event, sectionIndex)"
                  @dragend="endPersonaDrag"
                  ><AppIcon name="menu" size="14"
                /></span>
                <span class="persona-section-card__order">{{
                  String(sectionIndex + 1).padStart(2, "0")
                }}</span>
                <div class="persona-section-heading">
                  <input
                    class="field persona-section-title"
                    :value="personaSection(sectionIndex).title"
                    :readonly="!personaEditMode"
                    placeholder="Section 标题，例如：身份与职责"
                    @input="setSectionTitle(sectionIndex, $event.target.value)"
                  />
                  <div
                    class="persona-scope-picker"
                    role="radiogroup"
                    :aria-label="`Section ${sectionIndex + 1} 作用域`"
                  >
                    <button
                      v-for="scope in personaSectionScopes"
                      :key="scope.value"
                      type="button"
                      class="persona-scope-option"
                      :class="{
                        active:
                          personaSection(sectionIndex).scope === scope.value,
                      }"
                      :aria-label="scope.label"
                      :title="scope.label"
                      role="radio"
                      :aria-checked="
                        personaSection(sectionIndex).scope === scope.value
                      "
                      :disabled="!personaEditMode"
                      @click="setSectionScope(sectionIndex, scope.value)"
                    >
                      <AppIcon
                        :name="personaScopeIcons[scope.value]"
                        size="14"
                      />
                    </button>
                  </div>
                </div>
                <div v-if="personaEditMode" class="persona-row-actions">
                  <UiButton
                    variant="ghost"
                    size="icon"
                    title="上移 Section"
                    :disabled="sectionIndex === 0"
                    @click="movePersonaSection(sectionIndex, -1)"
                    ><AppIcon name="back" size="13"
                  /></UiButton>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    title="下移 Section"
                    :disabled="sectionIndex === selected.sections.length - 1"
                    @click="movePersonaSection(sectionIndex, 1)"
                    ><AppIcon name="back" size="13"
                  /></UiButton>
                  <UiButton
                    variant="ghost"
                    size="icon"
                    title="删除 Section"
                    @click="removePersonaSection(sectionIndex)"
                    ><AppIcon name="trash" size="13"
                  /></UiButton>
                </div>
              </header>
              <div class="persona-section-card__meta">
                <span>{{
                  personaScopeLabel(personaSection(sectionIndex).scope)
                }}</span
                ><span>{{ Math.max(0, section.length - 1) }} 个内容项</span
                ><span v-if="personaSectionIssue(sectionIndex)" class="is-error"
                  ><AppIcon name="info" size="11" />需要检查</span
                >
              </div>
              <TransitionGroup
                name="persona-item"
                tag="div"
                class="persona-section-items"
              >
                <div
                  v-for="(item, itemIndex) in section.slice(1)"
                  :key="personaItemKey(section, itemIndex)"
                  class="persona-item"
                  :data-persona-item-section-index="sectionIndex"
                  :data-persona-item-index="itemIndex"
                  :class="{
                    'has-issue': personaItemIssue(sectionIndex, itemIndex),
                    'is-dragging':
                      personaDrag?.type === 'item' &&
                      personaDrag.sectionIndex === sectionIndex &&
                      personaDrag.itemIndex === itemIndex,
                    'is-drop-before':
                      personaDropTarget?.type === 'item' &&
                      personaDropTarget.sectionIndex === sectionIndex &&
                      personaDropTarget.itemIndex === itemIndex &&
                      !personaDropTarget.after,
                    'is-drop-after':
                      personaDropTarget?.type === 'item' &&
                      personaDropTarget.sectionIndex === sectionIndex &&
                      personaDropTarget.itemIndex === itemIndex &&
                      personaDropTarget.after,
                  }"
                  @dragover="
                    setPersonaDropTarget(
                      $event,
                      'item',
                      sectionIndex,
                      itemIndex,
                    )
                  "
                  @drop="dropPersonaItem($event, sectionIndex, itemIndex)"
                >
                  <span
                    v-if="personaEditMode"
                    class="persona-drag-handle persona-item__drag"
                    draggable="true"
                    title="拖动 Item 排序"
                    @pointerdown="
                      startPersonaPointerDrag(
                        $event,
                        'item',
                        sectionIndex,
                        itemIndex,
                      )
                    "
                    @dragstart.stop="
                      startPersonaItemDrag($event, sectionIndex, itemIndex)
                    "
                    @dragend="endPersonaDrag"
                    ><AppIcon name="menu" size="13"
                  /></span>
                  <div
                    v-if="personaEditMode"
                    class="persona-item-type-picker"
                    role="radiogroup"
                    :aria-label="`Item ${itemIndex + 1} 类型`"
                  >
                    <button
                      type="button"
                      class="persona-item-type-option"
                      :class="{ active: personaItemReference(item) === null }"
                      aria-label="内联文本"
                      title="内联文本"
                      role="radio"
                      :aria-checked="personaItemReference(item) === null"
                      @click="setPersonaItemMode(section, itemIndex, 'inline')"
                    >
                      <AppIcon name="file" size="13" />
                    </button>
                    <button
                      type="button"
                      class="persona-item-type-option"
                      :class="{ active: personaItemReference(item) !== null }"
                      aria-label="Text Resource 引用"
                      title="Text Resource 引用"
                      role="radio"
                      :aria-checked="personaItemReference(item) !== null"
                      @click="
                        setPersonaItemMode(section, itemIndex, 'reference')
                      "
                    >
                      <AppIcon name="at" size="13" />
                    </button>
                  </div>
                  <select
                    v-if="personaItemReference(item) !== null"
                    class="field persona-item__content"
                    :value="personaItemReference(item)"
                    :disabled="!personaEditMode"
                    @change="
                      setPersonaReference(
                        section,
                        itemIndex,
                        $event.target.value,
                      )
                    "
                  >
                    <option value="" disabled>
                      {{
                        textResources.length
                          ? "选择 Text Resource"
                          : "暂无 Text Resource"
                      }}
                    </option>
                    <option
                      v-if="
                        personaItemReference(item) &&
                        !textResources.some(
                          (text) => text.id === personaItemReference(item),
                        )
                      "
                      :value="personaItemReference(item)"
                    >
                      缺失 · {{ personaItemReference(item) }}
                    </option>
                    <option
                      v-for="text in textResources"
                      :key="text.id"
                      :value="text.id"
                    >
                      {{ text.name }} · {{ text.id }}
                    </option>
                  </select>
                  <textarea
                    v-else
                    v-model="section[itemIndex + 1]"
                    :readonly="!personaEditMode"
                    class="field persona-item__content"
                    rows="3"
                    placeholder="输入这一项的 Prompt 文本；同一主题的相关句子放在同一个 Section 中"
                  />
                  <div v-if="personaEditMode" class="persona-row-actions">
                    <UiButton
                      variant="ghost"
                      size="icon"
                      title="上移 Item"
                      :disabled="itemIndex === 0"
                      @click="movePersonaItem(section, itemIndex, -1)"
                      ><AppIcon name="back" size="12"
                    /></UiButton>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      title="下移 Item"
                      :disabled="itemIndex === section.length - 2"
                      @click="movePersonaItem(section, itemIndex, 1)"
                      ><AppIcon name="back" size="12"
                    /></UiButton>
                    <UiButton
                      variant="ghost"
                      size="icon"
                      title="删除 Item"
                      @click="removePersonaItem(section, itemIndex)"
                      ><AppIcon name="trash" size="12"
                    /></UiButton>
                  </div>
                </div>
                <div
                  v-if="personaEditMode"
                  class="persona-item-drop-end"
                  :data-persona-item-end-section-index="sectionIndex"
                  :class="{
                    active:
                      personaDropTarget?.type === 'item' &&
                      personaDropTarget.sectionIndex === sectionIndex &&
                      personaDropTarget.itemIndex === null,
                  }"
                  @dragover="setPersonaDropTarget($event, 'item', sectionIndex)"
                  @drop="dropPersonaItem($event, sectionIndex)"
                >
                  <UiButton
                    class="persona-add-item"
                    variant="ghost"
                    size="sm"
                    @click="addPersonaItem(section)"
                    ><AppIcon name="plus" />添加文本或引用</UiButton
                  >
                </div>
              </TransitionGroup>
            </div>
          </TransitionGroup>
          <p v-if="!selected.sections?.length" class="empty-state">
            暂无 Section，请先添加一个。
          </p>
          <section class="persona-actions-editor">
            <header>
              <div>
                <p class="eyebrow">ACTION CONTRACTS</p>
                <h3>交给 Orchestrator 的行动契约</h3>
                <span
                  >Orchestrator 依据这些 Schema
                  决定实例能否行动，以及应该提供哪些 Context。</span
                >
              </div>
              <UiButton
                v-if="personaEditMode"
                size="sm"
                @click="addPersonaAction"
                ><AppIcon name="plus" />添加 Action</UiButton
              >
            </header>
            <label
              >能力摘要<textarea
                v-model="selected.orchestrator.summary"
                :readonly="!personaEditMode"
                class="field"
                rows="3"
                placeholder="简要说明该 Persona 适合处理什么问题"
              />
            </label>
            <article
              v-for="(action, actionIndex) in selected.orchestrator.actions"
              :key="action.id"
              class="persona-action-card"
            >
              <header>
                <span>{{ String(actionIndex + 1).padStart(2, "0") }}</span
                ><input
                  v-model="action.id"
                  :readonly="!personaEditMode"
                  class="field"
                  placeholder="action-id"
                /><input
                  v-model="action.name"
                  :readonly="!personaEditMode"
                  class="field"
                  placeholder="行动名称"
                /><select
                  v-model="action.sideEffects"
                  :disabled="!personaEditMode"
                  class="field"
                >
                  <option value="none">无副作用</option>
                  <option value="workspace">修改 Workspace</option></select
                ><UiButton
                  v-if="personaEditMode"
                  variant="ghost"
                  size="icon"
                  title="删除 Action"
                  @click="removePersonaAction(actionIndex)"
                  ><AppIcon name="trash" size="13"
                /></UiButton>
              </header>
              <label
                >说明<textarea
                  v-model="action.description"
                  :readonly="!personaEditMode"
                  class="field"
                  rows="2"
                />
              </label>
              <div class="persona-action-schemas">
                <label
                  >适用场景（每行一条）<textarea
                    class="field"
                    rows="3"
                    :value="triggerText(action)"
                    :readonly="!personaEditMode"
                    @input="setActionTriggers(action, $event.target.value)"
                  /></label
                ><label
                  >允许的 Tool ID（每行一条）<textarea
                    class="field"
                    rows="3"
                    :value="toolText(action)"
                    :readonly="!personaEditMode"
                    @input="setActionTools(action, $event.target.value)"
                  />
                </label>
              </div>
              <div class="persona-action-schemas">
                <label
                  >Input Schema<textarea
                    class="field"
                    rows="10"
                    :value="schemaText(action.inputSchema)"
                    :readonly="!personaEditMode"
                    @change="
                      setActionSchema(
                        action,
                        'inputSchema',
                        $event.target.value,
                      )
                    "
                  /></label
                ><label
                  >Output Schema<textarea
                    class="field"
                    rows="10"
                    :value="schemaText(action.outputSchema)"
                    :readonly="!personaEditMode"
                    @change="
                      setActionSchema(
                        action,
                        'outputSchema',
                        $event.target.value,
                      )
                    "
                  />
                </label>
              </div>
            </article>
            <p v-if="!selected.orchestrator.actions.length" class="empty-state">
              暂无 Action，Orchestrator 不会调度此 Persona。
            </p>
          </section>
          <div v-if="personaIssues.length" class="persona-issues">
            <strong>需要处理</strong
            ><span v-for="(issue, index) in personaIssues" :key="index">{{
              issue.message
            }}</span>
          </div>
        </div>
        <CodeEditor
          v-else
          v-model="selected.content"
          :language="language"
          :highlights="type === 'text' ? selected.highlights : []"
          :text-resources="type === 'preset' ? textResources : []"
        />
        <UiDrawer
          v-if="type === 'text'"
          v-model="highlightsOpen"
          title="高亮规则"
          description="管理当前文本的匹配和显示样式。"
        >
          <div class="resource-highlights-drawer">
            <header class="resource-highlights-drawer__toolbar">
              <span>{{ selected.highlights?.length || 0 }} 条规则</span>
              <div>
                <UiButton size="sm" @click="addHighlight"
                  ><AppIcon name="plus" />添加</UiButton
                ><UiButton size="sm" @click="generateHighlights"
                  ><AppIcon name="robot" />AI 生成</UiButton
                >
              </div>
            </header>
            <div
              v-for="(rule, index) in selected.highlights || []"
              :key="index"
              class="resource-highlight-rule"
            >
              <div class="resource-highlight-rule__main">
                <span class="resource-highlight-rule__description">{{
                  rule.description || "自动生成的高亮样式"
                }}</span>
                <UiButton
                  variant="ghost"
                  size="icon"
                  title="删除规则"
                  @click="removeHighlight(index)"
                  ><AppIcon name="trash" size="13"
                /></UiButton>
              </div>
              <div class="resource-highlight-rule__style">
                <label
                  class="highlight-color highlight-color--text"
                  title="文字颜色"
                  ><AppIcon name="text-color" size="14" /><input
                    v-model="rule.color"
                    type="color"
                    aria-label="文字颜色"
                /></label>
                <label
                  class="highlight-color highlight-color--background"
                  title="背景颜色"
                  ><AppIcon name="fill" size="14" /><input
                    v-model="rule.background"
                    type="color"
                    aria-label="背景颜色"
                /></label>
                <label class="highlight-check" title="粗体"
                  ><input
                    v-model="rule.bold"
                    type="checkbox"
                    aria-label="粗体"
                  /><strong>B</strong></label
                >
                <label class="highlight-check" title="斜体"
                  ><input
                    v-model="rule.italic"
                    type="checkbox"
                    aria-label="斜体" /><AppIcon name="italic" size="14"
                /></label>
                <label class="highlight-check" title="下划线"
                  ><input
                    v-model="rule.underline"
                    type="checkbox"
                    aria-label="下划线" /><AppIcon name="underline" size="14"
                /></label>
                <label class="highlight-check" title="中划线"
                  ><input
                    v-model="rule.strikethrough"
                    type="checkbox"
                    aria-label="中划线" /><AppIcon
                    name="strikethrough"
                    size="14"
                /></label>
                <label class="highlight-check" title="启用"
                  ><input
                    v-model="rule.enabled"
                    type="checkbox"
                    aria-label="启用" /><AppIcon
                    :name="rule.enabled ? 'eye' : 'eye-off'"
                    size="14"
                /></label>
              </div>
            </div>
            <p v-if="!selected.highlights?.length" class="empty-state">
              暂无高亮规则
            </p>
          </div>
        </UiDrawer>
        <footer>
          <span>{{
            type === "persona" && !personaEditMode
              ? "查看当前 Persona 配置"
              : "保存后写入当前 Workspace"
          }}</span>
          <div class="resource-editor__footer-actions">
            <UiButton
              v-if="type === 'text'"
              class="resource-highlights-button"
              @click="highlightsOpen = true"
              ><AppIcon name="file" /><span>高亮规则</span
              ><small
                >{{ selected.highlights?.length || 0 }} 条</small
              ></UiButton
            ><UiButton
              v-if="type !== 'persona' || personaEditMode"
              variant="danger"
              @click="confirmRemove"
              ><AppIcon name="trash" />删除</UiButton
            >
          </div>
        </footer>
      </main>
    </Transition>
    <UiModal
      v-model="personaGenerateOpen"
      title="生成 Persona"
      description="描述你希望创建的角色、能力、语气和场景。现有 Sections 会作为上下文提供给模型。"
      size="md"
      :close-on-backdrop="!personaGenerating"
    >
      <label class="persona-generate-prompt"
        >本次生成需求<textarea
          v-model="personaGeneratePrompt"
          class="field"
          rows="8"
          placeholder="例如：创建一名严谨的系统架构师。Chat 中直接帮助用户澄清需求；Talk 中负责识别方案边界、技术风险和参与者观点之间的冲突。"
          :disabled="personaGenerating"
          @keydown.ctrl.enter="generatePersona"
        />
      </label>
      <p v-if="personaGenerateError" class="persona-generate-error">
        {{ personaGenerateError }}
      </p>
      <p class="persona-generate-hint">
        此内容仅用于本次生成，不会保存到 Persona 或 Custom Settings。可按 Ctrl +
        Enter 提交。
      </p>
      <template #footer="{ close }"
        ><UiButton variant="ghost" :disabled="personaGenerating" @click="close"
          >取消</UiButton
        ><UiButton
          variant="primary"
          :disabled="!personaGeneratePrompt.trim() || personaGenerating"
          @click="generatePersona"
          ><AppIcon name="robot" />{{
            personaGenerating ? "生成中" : "开始生成"
          }}</UiButton
        ></template
      >
    </UiModal>
    <UiModal
      v-model="deleteOpen"
      title="删除资源"
      description="此操作无法撤销。"
    >
      <p>
        {{
          deleting
            ? `正在删除资源“${deleteName}”…`
            : `确认删除资源“${deleteName}”？删除后无法恢复。`
        }}
      </p>
      <template #footer="{ close }"
        ><UiButton variant="ghost" :disabled="deleting" @click="close"
          >取消</UiButton
        ><UiButton variant="danger" :disabled="deleting" @click="remove"
          ><AppIcon name="trash" />{{
            deleting ? "正在删除" : "确认删除"
          }}</UiButton
        ></template
      >
    </UiModal>
  </section>
</template>
