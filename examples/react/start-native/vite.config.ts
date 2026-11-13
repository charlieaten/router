import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  plugins: [
    tanstackStart({
      serverFns: { nativeEntries: ['src/data.ts', 'src/native-only.ts'] },
    }),
    react(),
    nitro(),
  ],
})
