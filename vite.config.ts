import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the build works on GitHub Pages under /<repo>/.
// Shown in the header so you can tell which deployed version you are looking at.
const BUILD = `${(process.env.GITHUB_SHA ?? 'dev').slice(0, 7)} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), tailwindcss()],
  test: { include: ['tests/**/*.test.ts'] },
})
