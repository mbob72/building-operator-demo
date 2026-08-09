import { expect, test } from '@playwright/test';

test('switches floors, filters devices, opens building overview, and keeps GPU picking', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 1/ })).toBeVisible();
  await expect(page.getByTestId('floor-scene')).toBeVisible();
  await expect(page.getByText(/features · 2900 devices · \d+ priority · z/)).toBeVisible();
  expect(await page.locator('*').count()).toBeLessThan(260);

  const before = await page.getByText(/features · 2900 devices · \d+ priority · z/).textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => page.getByText(/features · 2900 devices · \d+ priority · z/).textContent()).not.toBe(before);

  await page.getByRole('combobox', { name: 'Floor' }).selectOption('west-riverside-level-2');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 2/ })).toBeVisible();
  await expect(page.getByText(/features · \d+ devices · \d+ priority · z/)).toBeVisible();

  const targetCatalog = await page.request.get(
    '/api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-2',
  );
  const targetDevices = (await targetCatalog.json()).devices as { id: string }[];
  const targetDevice = targetDevices.at(-1);
  if (!targetDevice) throw new Error('Level 2 catalog is empty');
  await page.getByRole('searchbox', { name: 'Search' }).fill(targetDevice.id);
  await expect(page.locator('.operator-toolbar__count')).toHaveText(/1 \/ [\d,]+/);
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByRole('button', { name: 'Building' }).click();
  await expect(page.getByRole('heading', { name: /Building overview/ })).toBeVisible();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await expect(page.getByText(/8\/8 floors · 18000 devices · \d+ priority · z/)).toBeVisible();
  expect(await page.locator('*').count()).toBeLessThan(300);

  await page.getByRole('combobox', { name: 'Status' }).selectOption('critical');
  await expect(page.locator('.operator-toolbar__count')).not.toHaveText('18,000 / 18,000');
  await expect(page.getByText(/8\/8 floors · \d+ devices · \d+ priority · z/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Floor' }).click();
  await expect(page.getByTestId('floor-scene')).toBeVisible();

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
  await expect(deviceCard.getByText(/normal|warning|critical|offline/)).toBeVisible();
  await expect(deviceCard.getByText('SNAPSHOT VALUES')).toBeVisible();
  await page.getByRole('button', { name: 'Close device card' }).click();
  await expect(deviceCard).toHaveCount(0);
});
