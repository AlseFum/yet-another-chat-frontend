import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@codemirror/lang-')) return 'editor-languages'
          if (id.includes('/@lezer/')) return 'editor-parsers'
          if (id.includes('@codemirror') || id.includes('/codemirror/')) return 'editor-core'
          if (id.includes('marked') || id.includes('dompurify')) return 'markdown'
        },
      },
    },
  },
})
