import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Native has its own source resolution and declaration pass. Keep every bare
// host import external so Metro remains responsible for React Native packages.
export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.native.tsx', '.native.ts', '.tsx', '.ts', '.js', '.json'],
  },
  define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
  build: {
    outDir: 'dist/native/esm',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: { entry: './src/index.native.tsx', formats: ['es'] },
    rolldownOptions: {
      external: (id) =>
        !id.startsWith('.') && !id.startsWith('\0') && !path.isAbsolute(id),
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
})
