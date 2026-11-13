import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['development'],
    extensions: ['.native.tsx', '.native.ts', '.tsx', '.ts', '.js', '.json'],
    alias: {
      'react-native': path.resolve(
        import.meta.dirname,
        'tests/native-host.tsx',
      ),
      'react-native-screens': path.resolve(
        import.meta.dirname,
        'tests/native-screens.tsx',
      ),
    },
  },
  test: {
    name: 'native-router',
    watch: false,
    environment: 'jsdom',
    include: ['tests/native-navigation.test.tsx'],
  },
})
