<script setup>
import { computed, ref } from "vue";
import UiButton from "../components/UiButton.vue";
import UiCombobox from "../components/UiCombobox.vue";
import UiSwitch from "../components/UiSwitch.vue";

const props = defineProps({
  applications: Object,
  customSettings: Object,
  updateSetting: Function,
});
const emit = defineEmits(["notify"]);
const selectedId = ref("");

const entries = computed(() =>
  [...(props.applications?.values() || [])].filter(
    (application) =>
      Object.keys(application.constructor.schema?.() || {}).length,
  ),
);
const selected = computed(
  () =>
    entries.value.find((application) => application.id === selectedId.value) ||
    entries.value[0] ||
    null,
);
const schema = computed(() => selected.value?.constructor.schema?.() || {});
const values = computed(() => props.customSettings?.[selected.value?.id] || {});
const formatVariable = (variable) => `{{${variable}}}`;

async function update(name, value) {
  try {
    await props.updateSetting(selected.value.id, name, value);
    emit("notify", "设置已保存");
  } catch (error) {
    emit("notify", error.message, "danger");
  }
}
</script>

<template>
  <section class="custom-settings-view view">
    <aside class="custom-settings-list">
      <header>
        <p class="eyebrow">WORKSPACE</p>
        <h2>应用设置</h2>
      </header>
      <button
        v-for="application in entries"
        :key="application.id"
        :class="{ active: selected?.id === application.id }"
        @click="selectedId = application.id"
      >
        <span>{{ application.id }}</span
        ><span>{{ Object.keys(application.constructor.schema()).length }}</span>
      </button>
      <p v-if="!entries.length" class="empty-state">暂无可配置的 Application</p>
    </aside>
    <main v-if="selected" class="custom-settings-editor">
      <header>
        <div>
          <p class="eyebrow">{{ selected.id.toUpperCase() }}</p>
          <h1>应用设置</h1>
        </div>
        <UiButton variant="primary" disabled>已自动保存</UiButton>
      </header>
      <div class="custom-settings-fields">
        <label
          v-for="(field, name) in schema"
          :key="name"
          class="custom-setting-field"
        >
          <span class="custom-setting-field__label"
            >{{ field.label || name
            }}<small v-if="field.description">{{
              field.description
            }}</small></span
          >
          <UiCombobox
            v-if="field.type === 'select'"
            :model-value="values[name]"
            :options="field.options || []"
            :title="field.label || name"
            @update:model-value="update(name, $event)"
          />
          <UiSwitch
            v-else-if="field.type === 'boolean'"
            :model-value="values[name]"
            :label="field.label || name"
            :description="field.description"
            @update:model-value="update(name, $event)"
          />
          <details
            v-else-if="field.type === 'textarea'"
            class="custom-setting-field__details"
            :open="!field.collapsed"
          >
            <summary>{{ field.collapsedLabel || "展开编辑" }}</summary>
            <textarea
              :value="values[name]"
              rows="6"
              @change="update(name, $event.target.value)"
            />
          </details>
          <input
            v-else
            :type="field.type === 'number' ? 'number' : 'text'"
            :value="values[name]"
            :maxlength="field.type === 'text' ? 80 : undefined"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            @change="
              update(
                name,
                field.type === 'number'
                  ? Number($event.target.value)
                  : $event.target.value,
              )
            "
          />
          <small
            v-if="field.variables?.length"
            class="custom-setting-field__variables"
            >可用参数：<code
              v-for="variable in field.variables"
              :key="variable"
              >{{ formatVariable(variable) }}</code
            ></small
          >
        </label>
      </div>
    </main>
  </section>
</template>
