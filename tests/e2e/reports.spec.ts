import { test, expect } from '@playwright/test';

test('reports page renders', async ({ page }) => {
  await page.goto('/');
  // Redirects to auth might occur; attempt to reach reports page directly
  await page.goto('/reports');
  // Basic smoke checks for headings
  await expect(page.getByTestId('text-page-title')).toBeVisible({ timeout: 10000 });
});
