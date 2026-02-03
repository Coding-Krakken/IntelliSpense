import { test, expect } from '@playwright/test'

test('homepage has title and nav', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('nav')).toContainText('IntelliSpense')
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
})
