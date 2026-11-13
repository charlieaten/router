import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createNativeStartCompiler } from '@tanstack/react-start/plugin/metro'

test('serves a function referenced only by the native entry manifest', async ({
  request,
  baseURL,
}) => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const filename = fileURLToPath(
    new URL('../src/native-only.ts', import.meta.url),
  )
  const compiler = createNativeStartCompiler({
    root,
    mode: process.env.PLAYWRIGHT_START_MODE === 'build' ? 'build' : 'dev',
  })
  const transformed = await compiler.transform(
    await readFile(filename, 'utf8'),
    filename,
  )
  const id = transformed!.code.match(/createClientRpc\(["']([^"']+)/)![1]!
  const response = await request.get(`/_serverFn/${id}`, {
    headers: { 'x-tsr-serverFn': 'true', Origin: new URL(baseURL!).origin },
  })
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('native-only-server-function')
})

test('Start renders server data and navigates with validated search', async ({
  page,
  request,
}) => {
  const api = await request.get('/api/venues?id=123')
  expect((await api.json()).name).toBe('The Glasshouse')
  await page.goto('/')
  await page.getByTestId('venue-123').click()
  await expect(page).toHaveURL(/venues\/123/)
  await page.getByTestId('show-reviews').click()
  await expect(page.getByTestId('section')).toContainText(
    'Notes from the neighborhood',
  )
  await expect(page).toHaveURL(/section=reviews/)
})

test('a dirty editor blocks navigation until the user discards it', async ({
  page,
}) => {
  await page.goto('/compose')
  await page.getByTestId('review').fill('A draft worth keeping')
  await page.getByTestId('leave-composer').click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page).toHaveURL(/compose/)
  await page.getByTestId('discard').click()
  await expect(page).toHaveURL(new URL('/', page.url()).href)
})

test('direct venue URL renders on the server and hydrates without browser errors', async ({
  page,
  request,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = await request.get('/venues/123?section=reviews')
  expect(await response.text()).toContain('The Glasshouse')
  await page.goto('/venues/123?section=reviews')
  await expect(page.getByTestId('section')).toContainText(
    'Notes from the neighborhood',
  )
  await page.getByTestId('private-note').fill('Hydrated input')
  await expect(page.getByTestId('private-note')).toHaveValue('Hydrated input')
  expect(errors).toEqual([])
})

test('saves a review through Start RPC and refreshes venue data', async ({
  page,
}) => {
  await page.goto('/compose?venueId=123')
  const review = `Shared Start review ${Date.now()}`
  await page.getByTestId('review').fill(review)
  await page.getByTestId('save-review').click()
  await expect(page).toHaveURL(/venues\/123\?section=reviews/)
  await expect(page.getByText(review, { exact: true })).toBeVisible()
})
