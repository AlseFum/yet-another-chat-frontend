<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  acceptCompletion,
  autocompletion,
  completionStatus,
} from "@codemirror/autocomplete";

const props = defineProps({
  modelValue: { type: String, default: "" },
  language: { type: String, default: "markdown" },
  compact: { type: Boolean, default: false },
  singleLine: { type: Boolean, default: false },
  placeholder: { type: String, default: "" },
  highlights: { type: Array, default: () => [] },
  textResources: { type: Array, default: () => [] },
});
const emit = defineEmits(["update:modelValue", "submit", "blur"]);
const host = ref(null);
let editor;
let syncing = false;

function normalizeValue(value) {
  const text = String(value ?? "");
  return props.singleLine ? text.replace(/[\r\n]+/g, " ") : text;
}

function highlightExtension(rules) {
  const valid = rules
    .filter(
      (rule) =>
        rule?.enabled !== false &&
        typeof rule.pattern === "string" &&
        rule.pattern.length <= 120 &&
        /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(rule.className || ""),
    )
    .slice(0, 50);
  if (!valid.length) return ViewPlugin.define(() => ({}));
  let regexp;
  try {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regexp = new RegExp(
      valid.map((rule) => `(${escape(rule.pattern)})`).join("|"),
      "g",
    );
  } catch {
    return ViewPlugin.define(() => ({}));
  }
  const decorator = new MatchDecorator({
    regexp,
    decoration: (match) => {
      const index = match.findIndex(
        (value, index) => index > 0 && value !== undefined,
      );
      const rule = valid[index - 1];
      const style = [
        rule.color && `--resource-highlight-color:${rule.color}`,
        rule.background && `--resource-highlight-background:${rule.background}`,
        rule.bold && "--resource-highlight-weight:700",
        rule.italic && "--resource-highlight-style:italic",
        rule.underline && "--resource-highlight-underline:underline",
        rule.strikethrough && "--resource-highlight-strike:line-through",
      ]
        .filter(Boolean)
        .join(";");
      return Decoration.mark({
        class: `cm-resource-highlight-${rule?.className || "default"}`,
        attributes: style ? { style } : undefined,
      });
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations;
      constructor(view) {
        this.decorations = decorator.createDeco(view);
      }
      update(update) {
        this.decorations = decorator.updateDeco(this.decorations, update);
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function textMention(context) {
  const match = context.matchBefore(/@[^\s@\[\]]*$/);
  if (!match) return null;
  const query = match.text.slice(1).toLocaleLowerCase();
  const options = props.textResources
    .filter((text) =>
      `${text.name} ${text.id}`.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8)
    .map((text) => ({
      label: text.name,
      detail: `@[${text.id}]`,
      type: "text",
      apply: `[${text.id}] `,
    }));
  return options.length
    ? { from: match.from + 1, options, filter: false }
    : null;
}

onMounted(() => {
  const highlightCompartment = new Compartment();
  const language = props.language === "javascript" ? javascript() : markdown();
  editor = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: normalizeValue(props.modelValue),
      extensions: [
        basicSetup,
        language,
        ...(props.singleLine ? [] : [EditorView.lineWrapping]),
        autocompletion({
          override: [textMention],
          activateOnTypingDelay: 0,
        }),
        highlightCompartment.of(highlightExtension(props.highlights)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncing)
            emit(
              "update:modelValue",
              normalizeValue(update.state.doc.toString()),
            );
        }),
        Prec.high(
          EditorView.domEventHandlers({
            keydown(event, view) {
            if (event.key !== "Enter") return false;
            if (
              event.ctrlKey &&
              !event.metaKey &&
              !props.singleLine
            ) {
              event.preventDefault();
              view.dispatch({
                changes: {
                  from: view.state.selection.main.from,
                  insert: "\n",
                },
              });
              return true;
            }
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              (props.singleLine || (props.compact && !event.shiftKey))
            ) {
              event.preventDefault();
              const status = completionStatus(view.state);
              if (status === "active") {
                acceptCompletion(view);
                return true;
              }
              if (status === "pending") return true;
              emit("submit");
              return true;
            }
            return false;
          },
          paste(event, view) {
            if (!props.singleLine) return false;
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") || "";
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: normalizeValue(text) },
            });
            return true;
          },
          blur() {
            emit("blur");
          },
        }),
        ),
      ],
    }),
  });
  editor.highlightCompartment = highlightCompartment;
});

watch(
  () => props.modelValue,
  (value) => {
    const normalized = normalizeValue(value);
    if (!editor || normalized === editor.state.doc.toString()) return;
    syncing = true;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: normalized },
    });
    syncing = false;
  },
);

watch(
  () => props.highlights,
  () => {
    if (!editor) return;
    editor.dispatch({
      effects: editor.highlightCompartment.reconfigure(
        highlightExtension(props.highlights),
      ),
    });
  },
  { deep: true },
);

onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div
    ref="host"
    class="code-editor"
    :class="{ compact, 'code-editor--single-line': singleLine }"
    :data-placeholder="placeholder"
  />
</template>
