import { expect, test } from '@playwright/test';

test('shows a floor scene and changes zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 1/ })).toBeVisible();
  await expect(page.getByTestId('floor-scene')).toBeVisible();
  await expect(page.getByText(/features · z/)).toBeVisible();

  const before = await page.getByText(/features · z/).textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => page.getByText(/features · z/).textContent()).not.toBe(before);

  await page.getByRole('button', { name: 'Zoom in' }).click({ clickCount: 5 });
  await expect(page.getByText(/detail · .* features · z/)).toBeVisible();
});
