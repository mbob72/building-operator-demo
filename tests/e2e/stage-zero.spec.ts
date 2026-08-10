import { expect, test, type WebSocketRoute } from '@playwright/test';

test('streams live state while switching floors, filtering, overviewing, and GPU picking', async ({ page }) => {
  test.setTimeout(90_000);
  let realtimeAvailable = true;
  let activeRealtimeRoute: WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/v1/realtime', (route) => {
    activeRealtimeRoute = route;
    if (!realtimeAvailable) {
      void route.close({ code: 1012, reason: 'Stage 8 disconnect fixture' });
      return;
    }
    route.connectToServer();
  });
  await page.goto('/');
  const realtimeStatus = page.getByTestId('realtime-status');
  await expect(realtimeStatus).toHaveText(/live · #\d+/);
  const initialSequence = Number((await realtimeStatus.textContent())?.match(/#(\d+)/)?.[1]);
  await expect.poll(async () => (
    Number((await realtimeStatus.textContent())?.match(/#(\d+)/)?.[1])
  )).toBeGreaterThan(initialSequence);
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 1/ })).toBeVisible();
  await expect(page.getByTestId('floor-scene')).toBeVisible();
  await expect(page.locator('.scene__status')).toContainText(/features/);
  await expect(page.locator('.scene__status')).toContainText(/2900 devices · \d+ priority · z/);
  expect(await page.locator('*').count()).toBeLessThan(450);

  await page.getByRole('button', { name: /Alarms \d+/ }).click();
  const alarmPanel = page.getByTestId('alarm-panel');
  await expect(alarmPanel).toBeVisible();
  await expect(alarmPanel.getByTestId('alarm-row')).toHaveCount(32);
  await alarmPanel.getByRole('combobox', { name: 'State' }).selectOption('active');
  await alarmPanel.getByRole('combobox', { name: 'Severity' }).selectOption('critical');
  if (await alarmPanel.getByTestId('alarm-row').count() === 0) {
    await alarmPanel.getByRole('combobox', { name: 'Severity' }).selectOption('all');
  }
  await expect(alarmPanel.getByTestId('alarm-row').first()).toBeVisible();
  const acknowledgedMessage = await alarmPanel.getByTestId('alarm-row').first()
    .getByRole('heading').textContent();
  if (!acknowledgedMessage) throw new Error('Alarm message is missing');
  await alarmPanel.getByTestId('alarm-row').first()
    .getByRole('button', { name: 'Acknowledge' }).click();
  await alarmPanel.getByRole('combobox', { name: 'State' }).selectOption('acknowledged');
  const acknowledgedRow = alarmPanel.getByTestId('alarm-row').filter({ hasText: acknowledgedMessage });
  await expect(acknowledgedRow).toContainText('Acknowledged by demo-operator');
  const alarmRowMarkers = acknowledgedRow.getByLabel('Device type, protocol, and status');
  const alarmRowTypeIcon = alarmRowMarkers.locator('.device-type-icon');
  await expect(alarmRowTypeIcon).toBeVisible();
  await expect(alarmRowMarkers.locator('.device-protocol-badge')).toBeVisible();
  await expect(alarmRowMarkers.locator('.device-status-square')).toBeVisible();
  await acknowledgedRow.getByRole('button', { name: 'Locate' }).click();
  await expect(alarmPanel).toBeVisible();
  const alarmDeviceCard = page.getByRole('complementary', { name: 'Selected device' });
  await expect(alarmDeviceCard).toBeVisible();
  await expect(alarmDeviceCard.getByText(/(warning|critical) · acknowledged/i)).toBeVisible();
  await expect(alarmDeviceCard.getByLabel('Device type, protocol, and status')).toBeVisible();
  const alarmCardTypeIcon = alarmDeviceCard.locator('.device-type-icon');
  expect(await alarmCardTypeIcon.getAttribute('data-device-type'))
    .toBe(await alarmRowTypeIcon.getAttribute('data-device-type'));
  expect(await alarmCardTypeIcon.evaluate((element) => (
    (element as HTMLElement).style.backgroundPosition
  ))).toBe(await alarmRowTypeIcon.evaluate((element) => (
    (element as HTMLElement).style.backgroundPosition
  )));
  const alarmPanelBox = await alarmPanel.boundingBox();
  const alarmDeviceCardBox = await alarmDeviceCard.boundingBox();
  if (!alarmPanelBox || !alarmDeviceCardBox) throw new Error('Alarm overlays have no layout boxes');
  expect(alarmPanelBox.x + alarmPanelBox.width).toBeLessThanOrEqual(alarmDeviceCardBox.x);
  await alarmDeviceCard.getByRole('button', { name: 'Close device card' }).click();
  await alarmPanel.getByRole('button', { name: 'Close alarm list' }).click();
  await expect(alarmPanel).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Floor' }).selectOption('west-riverside-level-1');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 1/ })).toBeVisible();

  const before = await page.locator('.scene__status').textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => page.locator('.scene__status').textContent()).not.toBe(before);

  await page.getByRole('combobox', { name: 'Floor' }).selectOption('west-riverside-level-2');
  await expect(page.getByRole('heading', { name: /West Riverside Hospital · Level 2/ })).toBeVisible();
  await expect(page.locator('.scene__status')).toContainText(/features/);
  await expect(page.locator('.scene__status')).toContainText(/\d+ devices · \d+ priority · z/);

  const targetCatalog = await page.request.get(
    '/api/v1/catalog?buildingId=west-riverside&floorIds=west-riverside-level-2',
  );
  const targetCatalogPayload = await targetCatalog.json() as {
    floors: Array<{ id: string; bounds: [number, number, number, number] }>;
    devices: Array<{
      id: string;
      floorId: string;
      position: { x: number; y: number };
      capabilities: {
        commands: Array<{ kind: string; requiresConfirmation: boolean }>;
      };
    }>;
  };
  const targetDevices = targetCatalogPayload.devices;
  const targetDevice = targetDevices.at(-1);
  if (!targetDevice) throw new Error('Level 2 catalog is empty');
  await page.getByRole('searchbox', { name: 'Search' }).fill(targetDevice.id);
  await expect(page.locator('.operator-toolbar__count')).toHaveText(/1 \/ [\d,]+/);
  await page.getByRole('button', { name: 'Reset' }).click();

  await page.getByRole('button', { name: 'Building' }).click();
  await expect(page.getByRole('heading', { name: /Building overview/ })).toBeVisible();
  await expect(page.getByTestId('building-overview')).toBeVisible();
  await expect(page.locator('.scene__status')).toContainText(/8\/8 floors/);
  await expect(page.locator('.scene__status')).toContainText(/18000 devices · \d+ priority · z/);
  expect(await page.locator('*').count()).toBeLessThan(500);

  await page.getByRole('checkbox', { name: 'All statuses' }).uncheck();
  await page.getByRole('checkbox', { name: 'critical' }).check();
  await expect(page.locator('.operator-toolbar__count')).not.toHaveText('18,000 / 18,000');
  await expect(page.locator('.scene__status')).toContainText(/8\/8 floors/);
  await expect(page.locator('.scene__status')).toContainText(/\d+ devices · \d+ priority · z/);
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Floor' }).click();
  await expect(page.getByTestId('floor-scene')).toBeVisible();

  const commandDevice = targetDevices.find((device) => device.capabilities.commands.some(
    (capability) => capability.kind === 'setOnOff' && capability.requiresConfirmation,
  ));
  if (!commandDevice) throw new Error('Level 2 has no confirmable command device');
  await page.getByRole('searchbox', { name: 'Search' }).fill(commandDevice.id);
  await expect(page.locator('.operator-toolbar__count')).toHaveText(/1 \/ [\d,]+/);

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('DeckGL canvas has no bounding box');
  const deviceCard = page.getByRole('complementary', { name: 'Selected device' });
  const deviceTooltip = page.getByTestId('scene-device-tooltip');
  const targetFloor = targetCatalogPayload.floors.find((floor) => floor.id === commandDevice.floorId);
  if (!targetFloor) throw new Error('Command device floor is missing from the catalog');
  const [minX, minY, maxX, maxY] = targetFloor.bounds;
  const scale = Math.min(box.width / (maxX - minX), box.height / (maxY - minY)) * 0.86;
  const projectedX = box.x + box.width / 2
    + (commandDevice.position.x - (minX + maxX) / 2) * scale;
  const projectedY = box.y + box.height / 2
    - (commandDevice.position.y - (minY + maxY) / 2) * scale;
  const candidates = [
    { x: projectedX, y: projectedY },
    { x: projectedX, y: box.y + box.height - (projectedY - box.y) },
  ];
  let hoveredPoint: { x: number; y: number } | undefined;
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    if (await deviceTooltip.count() > 0) {
      hoveredPoint = candidate;
      break;
    }
  }
  if (!hoveredPoint) throw new Error('No hoverable device was found on the scene');
  await expect(deviceTooltip).toBeVisible();
  await expect(deviceTooltip).toHaveCount(1);
  await page.mouse.click(hoveredPoint.x, hoveredPoint.y);
  await expect(deviceCard).toBeVisible();
  await expect(deviceCard.getByLabel('Device type, protocol, and status')).toBeVisible();
  await expect(deviceCard.locator('.device-card__status')).toHaveText(
    /(normal|warning|critical|offline|unknown) · (online|offline|unknown)/,
  );
  await expect(deviceCard.getByText('LIVE VALUES')).toBeVisible();
  await expect(deviceCard.getByRole('region', { name: 'Device commands' })).toBeVisible();
  const actualBefore = await deviceCard.getByText('Actual telemetry', { exact: true }).evaluate(
    (element) => element.nextElementSibling?.textContent,
  );
  const desiredValue = actualBefore === 'ON' ? 'off' : 'on';
  const desiredText = desiredValue.toUpperCase();
  await deviceCard.getByRole('combobox', { name: 'Desired state' }).selectOption(desiredValue);
  await expect(deviceCard.getByText('Draft desired').locator('..')).toContainText(desiredText);
  realtimeAvailable = false;
  await activeRealtimeRoute?.close({ code: 1012, reason: 'Stage 8 disconnect fixture' });
  await expect(realtimeStatus).toHaveText(/reconnecting/);
  await expect(deviceCard.getByRole('status')).toContainText('HTTP submission remains explicit');
  await deviceCard.getByRole('button', { name: 'Review command' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Potentially critical command' });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Backend acceptance and actual telemetry');
  await confirmation.getByRole('button', { name: 'Confirm and send' }).click();
  const recentCommands = deviceCard.getByRole('region', { name: 'Recent commands' });
  await expect(recentCommands).toContainText(`Desired: ${desiredText}`);
  await expect(recentCommands).toContainText(/Backend: (pending|accepted|executed)/);
  await expect(recentCommands).toContainText('Actual:');
  await expect(recentCommands).toContainText('Backend: executed', { timeout: 5_000 });
  realtimeAvailable = true;
  await expect(realtimeStatus).toHaveText(/live · #\d+/, { timeout: 10_000 });
  await expect(recentCommands).toContainText(`Actual: ${desiredText}`, { timeout: 6_000 });
  await page.getByRole('button', { name: 'Close device card' }).click();
  await expect(deviceCard).toHaveCount(0);
});
