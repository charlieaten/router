import { expect, test } from '@playwright/test'

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
