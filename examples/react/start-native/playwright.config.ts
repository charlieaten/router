import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3050'

export default defineConfig({
  testDir: './tests',
  use: { baseURL },
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND ?? 'pnpm dev',
    url: baseURL,
    reuseExistingServer:
      process.env.PLAYWRIGHT_REUSE_SERVER === '1' || !process.env.CI,
  },
})
