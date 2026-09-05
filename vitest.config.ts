import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // `globals` expose afterEach : Testing Library s'en sert pour nettoyer le DOM entre les tests
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
      NEXT_PUBLIC_SITE_URL: 'https://onmangekoi.test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/use-cases/**'],
    },
  },
})
