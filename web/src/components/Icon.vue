<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
})
</script>

<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="name === 'menu'"><path d="M4 7h16M4 12h16M4 17h16" /></template>
    <template v-else-if="name === 'folder'"><path d="M3 6.5h6l2 2h10v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" /></template>
    <template v-else-if="name === 'transfer'"><path d="M5 8h12M14 5l3 3-3 3M19 16H7M10 13l-3 3 3 3" /></template>
    <template v-else-if="name === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.4-2.4.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4.3v-3.4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3.4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.4 2.4-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1Z" /></template>
    <template v-else-if="name === 'message'"><path d="M20 11.5a7.5 7.5 0 0 1-11.3 6.5L4 19.5l1.4-4A7.5 7.5 0 1 1 20 11.5Z" /></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></template>
    <template v-else-if="name === 'edit'"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5ZM13.8 6.7l3.5 3.5" /></template>
    <template v-else-if="name === 'file'"><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h6" /></template>
    <template v-else-if="name === 'tool'"><path d="M14.7 6.2a5 5 0 0 0-6.5 6.5L3.5 17.4a2.1 2.1 0 1 0 3 3l4.7-4.7a5 5 0 0 0 6.5-6.5l-3 3-2.2-2.2Z" /></template>
    <template v-else-if="name === 'list'"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></template>
    <template v-else-if="name === 'workflow'"><circle cx="6" cy="6" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="m8 7 8 4M8 17l8-4" /></template>
    <template v-else-if="name === 'key'"><circle cx="8" cy="15" r="3.5" /><path d="m10.5 12.5 7-7M15 7l2 2M17 5l2 2" /></template>
    <template v-else-if="name === 'bolt'"><path d="m13.5 2-9 12h7l-1 8 9-12h-7Z" /></template>
    <template v-else-if="name === 'back'"><path d="m14 5-7 7 7 7M8 12h12" /></template>
    <template v-else-if="name === 'check'"><path d="m5 12 4.5 4.5L19 7" /></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18" /></template>
    <template v-else-if="name === 'info'"><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></template>
    <template v-else-if="name === 'robot'"><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 4v3M9 12h.01M15 12h.01M9 16h6" /></template>
    <template v-else-if="name === 'book'"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v17H6.5A2.5 2.5 0 0 0 4 22ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v17h5.5A2.5 2.5 0 0 1 20 22Z" /></template>
    <template v-else-if="name === 'palette'"><path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 0-3.6h-.7a1.3 1.3 0 0 1 0-2.6H15a6 6 0 0 0 6-6A6 6 0 0 0 12 3Z" /><path d="M7.5 10h.01M10 7h.01M14 7h.01M17 10h.01" /></template>
    <template v-else-if="name === 'input'"><path d="M4 4h16v16H4Z" /><path d="M8 12h8M12 8l4 4-4 4" /></template>
    <template v-else-if="name === 'condition'"><path d="M6 4h12L6 20h12" /></template>
    <template v-else-if="name === 'output'"><path d="M4 4h16v16H4Z" /><path d="M12 8v8M8 12l4 4 4-4" /></template>
    <template v-else-if="name === 'bug'"><path d="M9 8h6a3 3 0 0 1 3 3v5a4 4 0 0 1-8 0v-5a3 3 0 0 1 3-3ZM12 4v4M5 11h5M14 11h5M5 16h5M14 16h5" /></template>
    <template v-else-if="name === 'sparkles'"><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6Z" /></template>
    <template v-else-if="name === 'play'"><path d="m8 5 11 7-11 7Z" /></template>
    <template v-else-if="name === 'stop'"><rect x="6" y="6" width="12" height="12" rx="1" /></template>
    <template v-else-if="name === 'send'"><path d="m3.5 11.5 16-7-5.5 15-3.2-5.2ZM11 14l8.5-9.5" /></template>
    <template v-else-if="name === 'send-up'"><path d="m12 21 8-18-8 5-8-5 8 18Z" /><path d="M12 8v8" /></template>
    <template v-else-if="name === 'calendar'"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h.01M12 14h.01M16 14h.01" /></template>
    <template v-else-if="name === 'server'"><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01M10 7h7M10 17h7" /></template>
    <template v-else-if="name === 'expand'"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /></template>
    <template v-else-if="name === 'chevron-down'"><path d="m6 9 6 6 6-6" /></template>
  </svg>
</template>

<style scoped>
.icon { display: inline-block; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; vertical-align: -.125em; }
</style>
