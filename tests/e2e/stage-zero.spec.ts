import { expect, test } from '@playwright/test';

test('shows the floor, GPU devices, picking card, and changes zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 1/ })).toBeVisible();
  await expect(page.getByTestId('floor-scene')).toBeVisible();
  await expect(page.getByText(/features · 2900 devices · z/)).toBeVisible();
  expect(await page.locator('*').count()).toBeLessThan(200);

  const before = await page.getByText(/features · 2900 devices · z/).textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => page.getByText(/features · 2900 devices · z/).textContent()).not.toBe(before);

  await page.getByRole('button', { name: 'Zoom in' }).click({ clickCount: 5 });
  await expect(page.getByText(/detail · .* features · 2900 devices · z/)).toBeVisible();

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('DeckGL canvas has no bounding box');
  const deviceCard = page.getByRole('complementary', { name: 'Selected device' });
  for (let y = 100; y < box.height - 100 && await deviceCard.count() === 0; y += 36) {
    for (let x = 100; x < box.width - 100 && await deviceCard.count() === 0; x += 36) {
      await page.mouse.click(box.x + x, box.y + y);
    }
  }
  await expect(deviceCard).toBeVisible();
  await expect(page.getByText(/channels/)).toBeVisible();
  await page.getByRole('button', { name: 'Close device card' }).click();
  await expect(deviceCard).toHaveCount(0);
});
