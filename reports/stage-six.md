# Stage 6 report — alarms

Дата: 2026-08-09  
Статус: завершён и принят пользователем 2026-08-09

## Результат

Оператор видит warning/critical alarms на floor и building plans, открывает building-wide список, фильтрует severity/lifecycle, переходит к аварийному устройству и подтверждает active alarm. Author/time сохраняются в record, сразу видны в списке и карточке и доставляются остальным realtime clients ordered-событием.

Alarm lifecycle не смешан с telemetry status: status по-прежнему описывает последнее operational состояние устройства, Alarm — отдельную аудируемую сущность. Device filters не скрывают unresolved alarm contour.

## Backend

- [`initial-alarms.ts`](../src/server/initial-alarms.ts) создаёт 32 deterministic demo alarms: по active warning/critical, acknowledged warning и resolved critical на каждый из восьми этажей.
- [`RealtimeEngine`](../src/server/realtime-engine.ts#L70) индексирует alarms и включает в snapshot только records scoped devices.
- [`publishAlarmUpserts()`](../src/server/realtime-engine.ts#L183) валидирует immutable identity и монотонные transitions, затем публикует полный `alarm.upsert` через общий sequence/replay.
- [`acknowledgeAlarm()`](../src/server/realtime-engine.ts#L202) переводит только active alarm; повтор acknowledged idempotent, resolved terminal.
- [`POST /api/v1/alarms/:alarmId/acknowledge`](../src/server/app.ts#L109) валидирует request/response Zod-контрактами и различает `400`, `404`, `409`.

## Frontend

- [`acknowledgeAlarm()`](../src/client/src/operator-api.ts#L49) выполняет mutation и допускает в UI только schema-valid response.
- [`RealtimeHotStore.upsertAlarm()`](../src/client/src/realtime-hot-store.ts#L85) reconciles HTTP response без изменения socket cursor; sequenced `alarm.upsert` затем проходит штатный `applyBatch()`.
- [`alarm-model.ts`](../src/client/src/alarm-model.ts#L18) содержит чистые filters/sort/count и strongest-unresolved selection per device.
- [`AlarmPanel`](../src/client/src/AlarmPanel.tsx#L26) показывает lifecycle, фильтры, author/time и действия `Locate`/`Acknowledge`.
- `Locate` сохраняет список открытым слева и показывает выбранную карточку справа; mobile layout разделяет overlays по вертикали.
- [`useOperatorWorkspaceModel`](../src/client/src/use-operator-workspace.ts#L8) держит catalog building-scoped и локально выбирает floor subset, чтобы alarm navigation не ждала новый HTTP request.
- [`alarm-layers.ts`](../src/client/src/alarm-layers.ts#L18) создаёт отдельный instanced `ScatterplotLayer`: active warning/critical имеют явный контур, acknowledged приглушён, resolved на план не выводится.
- `FloorScene` и `BuildingOverview` получают unfiltered scoped devices для alarm layer отдельно от filtered device icon data.
- `DeviceCard` показывает alarms выбранного устройства независимо от live telemetry values.
- Массовые device name labels удалены: независимо от zoom существует максимум один hover-tooltip; выбранное устройство отмечается отдельным контрастным halo фиксированного экранного размера.
- `Alarms` перенесён в начало toolbar; device filters преобразованы в status/protocol/type multi-select checkbox rows с tri-state master control, status colors, protocol badges и type glyphs из device atlas.
- Alarm rows и selected-device card используют те же общие type icon, protocol badge и telemetry-status square. В списке stable metadata связывается с alarm по `deviceId`, а текущий status читается из `statusByDeviceId`; alarm severity/lifecycle остаются отдельными полями.
- Устранён many-to-one type icon mapping: 19 значений `DeviceTypeSchema` получили 19 уникальных slots SVG atlas. Карта, type filters, alarm rows и selected card используют единый `deviceIconOrder` и не поддерживают собственные таблицы соответствий.

## Lifecycle и reconciliation

```text
snapshot alarms[]
      ↓
Map<alarmId, Alarm>
      ├── AlarmPanel / filters / audit
      ├── strongest unresolved per device → ScatterplotLayer
      └── DeviceCard

Acknowledge click
      → POST acknowledge
      → validated response → local map reconciliation (cursor unchanged)
      ← WS alarm.upsert → ordered batch application (cursor advances)
```

Server lifecycle:

```text
active → acknowledged → resolved
active ───────────────→ resolved
resolved ─X→ active
```

## Проверки

| Проверка | Результат |
|---|---|
| Contract generation freshness | пройдено |
| Prepared scenes + 18k/50k catalog validation | пройдено |
| Unit/contract/API/component tests | 76 из 76 пройдено |
| Alarm lifecycle, idempotency и HTTP error cases | пройдено |
| Severity/state selectors и plan-marker priority | пройдено |
| Component acknowledge + locate workflow, уникальность type mapping и device markers | пройдено |
| TypeScript strict typecheck | пройдено |
| Production server/web build | пройдено |
| Production smoke | пройдено |
| Chromium end-to-end workflow | пройдено за 15,7 с; проверены checkbox filtering, hover-tooltip, picking, единый type mapping, device markers и отсутствие overlap списка/карточки |

`npm run verify` и `npm run test:e2e` выполнены 2026-08-09. Production build сохраняет известное предупреждение Vite о JS chunk около 1,066 МБ minified / 311 КБ gzip.

## Осознанные ограничения

- Alarm records и audit живут в памяти одного процесса; restart восстанавливает deterministic fixture, а не durable history.
- Источник alarms — deterministic simulator fixture, а не rules engine или физическая система.
- `demo-operator` и browser timestamp — mock данные, не доверенная authentication identity.
- Acknowledge реализован; отдельного ручного resolve UI нет, потому что Stage 6 acceptance его не требует.
- Один low-volume alarm layer пересобирается целиком при alarm change; dirty ranges для него преждевременны.
- Production logging, database, authorization и multi-instance synchronization остаются вне текущего MVP.

## Post-stage status

Stage 7 завершён и принят 2026-08-10. Он добавил simulated command lifecycle в отдельный `commandsById`/`command.upsert`, не используя Alarm или telemetry status как desired command state. Историческая граница Stage 6 сохранена; текущий отчёт Stage 7 находится в `reports/stage-seven.md`.
