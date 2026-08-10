# Отчёт этапов 8–9 — надёжность и полный automated acceptance

- Дата реализации: 2026-08-10
- Дата приёмки: 2026-08-10
- Статус: завершён и принят пользователем
- Граница: объединённые этапы 8 и 9; на момент отчёта этап 10 не был начат

## Результат

Stage 8–9 закрывает граничные realtime/command/alarm сценарии вместе с автоматическими
доказательствами. Client state не откатывается от duplicate/stale records, gap или неизвестная
ссылка не применяются частично, одновременные recovery signals не создают параллельные snapshots,
а reconnect продолжает building stream от последнего принятого cursor.

При потере WebSocket REST transport остаётся независимым. Успешно созданная команда отслеживается
через `GET /api/v1/commands/:id`; polling не двигает realtime cursor и прекращается после terminal
state или восстановления socket. Если исход POST оборвался с неопределённым результатом, frontend
не ставит команду в background queue: только явная кнопка повторяет точный payload с тем же
idempotency key.

## Контракты и оперативное состояние

- `CommandDraftSchema` хранит `clientRequestId` и nullable `requestedAt`; backend states и UI draft
  остаются раздельными.
- `StateSnapshotSchema` запрещает duplicate telemetry/alarm/command IDs и alarm/command references
  вне telemetry scope snapshot.
- `RealtimeHotStore.applyBatch()` применяет только contiguous fresh suffix пересекающегося batch.
- Unknown-device или conflicting identity/terminal outcome возвращают `invalid-state` до publish;
  batch остаётся атомарным.
- Telemetry revision, alarm `updatedAt`/lifecycle и command lifecycle rank не допускают regression.
- Executed command может получить поздний `resultTelemetryRevision`, но не сменить terminal outcome.
- JSON Schema artifacts пересозданы из runtime Zod schemas через `npm run contracts:generate`.

## Разрыв соединения и восстановление

- Reconnect использует backoff 250–5 000 мс и после успешного open снова начинается с 250 мс.
- Resume всегда читает актуальные `streamId`/`sequence` непосредственно из hot store.
- Gap, stream mismatch, unknown local device и server `resync.required` загружают authoritative
  snapshot; guard `resyncing` объединяет конкурентные triggers в один request.
- `useCommandStatusFallback` работает на уровне workspace, а не открытой карточки, и каждые 500 мс
  обновляет известные non-terminal commands, пока realtime не live.
- `CommandSubmissionError` различает definitive HTTP rejection и network/invalid-response outcome,
  для которого нужен exact explicit retry.

## UI и поведение при burst

- `roomId: null` отображается в карточке как `Unassigned`.
- Building alarm panel сохраняет полные counts/state, но рендерит максимум 50 строк.
- Device card сохраняет все alarms в store, но рендерит максимум 10 строк выбранного устройства.
- 500 alarm upserts применяются одним store notification; selection и открытая карточка не теряются.
- Command transport degradation показан отдельным status message.
- Recent commands используют именованный semantic `section`, обнаруженный Chromium accessibility
  locator во время приёмки.
- Полный E2E заменил медленное canvas scanning на детерминированную проекцию stable device position;
  picking по-прежнему выполняется deck.gl/WebGL.

## Автоматические проверки

Набор unit/contract/API/component проверок: 23 файла, 99 тестов.

Дополнительное reliability coverage включает:

- duplicate, stale, overlapping и gapped realtime batches;
- stale telemetry revisions и command lifecycle regression;
- atomic unknown-device rejection после валидного события того же batch;
- stream change, replay expiry, reconnect backoff/reset и single-flight resync;
- snapshot duplicate IDs и dangling alarm/command references;
- 500-alarm atomic store burst и bounded 50/10 DOM rendering;
- nullable room fallback;
- network-ambiguous explicit retry с byte-equivalent logical request;
- disconnected command GET polling без cursor mutation;
- отсутствие polling при live connection.

Chromium E2E проходит floors, search, filters, overview, bounded DOM marker counts, GPU picking,
alarm acknowledge/locate и critical command. В command части test proxy разрывает только WebSocket,
оставляя HTTP доступным: UI входит в `reconnecting`, POST создаёт команду, GET polling видит
`executed`, затем socket восстанавливается через resume/replay и actual telemetry сходится с intent.

Итоговые команды при передаче этапа:

- `npm run verify` — пройден: contracts check, оба dataset validators, 23 test files / 99 tests,
  typecheck, server/web production build и production smoke;
- `npm run test:e2e` — пройден: Chromium, 1 полный product/reconnect acceptance scenario.

## Осознанные ограничения

- Replay, commands, timers и idempotency index остаются process-local и теряются при restart.
- Explicit retry защищает от двойной команды в пределах жизни процесса; это не durable outbox.
- Нет offline command queue или автоматической отправки после reconnect — это намеренное safety
  решение `A-019`.
- Actor identity и timestamps браузера остаются mock/untrusted.
- Actual convergence создаёт synthetic telemetry simulator, а не физический контроллер.
- Alarm list/card rendering bounded, но production pagination/virtualization пока не требуется.

## Следующий этап

Этапы 8–9 завершены и приняты. После этого пользователь отдельно разрешил объединённые этапы
10–11; их performance benchmark описан в `reports/performance.md`.
