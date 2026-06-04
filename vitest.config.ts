// Vitest configuration for LeetCode Coach unit/component tests.
// Uses jsdom so React components can render in a DOM environment.
// @vitejs/plugin-react is reused to compile JSX/TSX identically to the app build.
// globals: true — avoids importing describe/it/expect in every test file.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/popup/**',
      ],
    },
  },
})
