# Отчёт этапа 7 — simulated control commands

- Дата реализации: 2026-08-10
- Дата приёмки: 2026-08-10
- Статус: завершён и принят пользователем
- Граница: только Stage 7; Stage 8 не начат

## Результат

Stage 7 добавляет операторское управление из карточки выбранного устройства: on/off и setpoint строятся только из stable device capabilities. Потенциально критичная capability требует отдельного confirmation dialog. После submission UI показывает полный simulated lifecycle `pending → accepted → executed | failed | timedOut`. Успешная команда затем отдельным telemetry event изменяет фактическое значение, не подменяя его frontend-local desired state.

## Серверная часть

- `POST /api/v1/commands` валидирует runtime contract, device/capability, setpoint range/step и confirmation audit fields.
- `clientRequestId` — process-local idempotency key: точный repeat возвращает текущий record без нового event, conflicting reuse даёт `409`.
- `GET /api/v1/commands/:commandId` возвращает текущий record как fallback без изменения cursor.
- `RealtimeEngine` хранит commands отдельно от telemetry/alarms и публикует полный `command.upsert` на каждом переходе.
- Default delays: 350 мс до `accepted`, ещё 1 200 мс до terminal state.
- Для `executed` ещё через 650 мс публикуется revisioned telemetry patch; затем terminal command получает `resultTelemetryRevision`.
- Demo outcome: восемь из десяти completions — `executed`, девятая — `failed`, десятая — `timedOut`; tests inject outcome и delays.
- On/off сходится на объявленном boolean telemetry channel, setpoint — на `setpoint`/`level` или объявленном numeric fallback. `failed`/`timedOut` actual state не меняют.
- Process shutdown очищает command timers вместе с telemetry simulator timer.

Ошибки HTTP: невалидный body — `400`, неизвестное устройство/команда — `404`, конфликт
idempotency — `409`, нарушение capability/setpoint/confirmation — `422`.

## Клиентская часть

- `CommandControls` встроен в единственную `DeviceCard`; устройств без command capabilities он явно помечает как read-only.
- `CommandDraft` живёт только в Zustand и очищается при смене/закрытии selection.
- `setOnOff` использует desired on/off; `setSetpoint` получает unit/min/max/step из capability.
- Critical capability открывает modal confirmation; request не отправляется до explicit confirm.
- `CreateCommandResponse` проходит Zod parse и reconciles в `commandsById` без изменения realtime cursor.
- Lifecycle rank защищает от race `WebSocket accepted → поздний HTTP pending`.
- История ограничена пятью последними commands текущего устройства и в каждой записи раздельно показывает `Desired`, `Backend`, `Actual`.
- UI помечен `OPERATOR DEMO / STAGE 7` и `SIMULATED CONTROL`.

## Контракты

`CommandRecordSchema` дополнительно требует `acceptedAt` для всех terminal states и запрещает lifecycle timestamps/failure/result revision вне соответствующего state. Generated `contracts/domain.schema.json`, `api.schema.json` и `realtime.schema.json` обновлены через `npm run contracts:generate`; hand edits не выполнялись.

## Проверки

- Contract/unit/API/component: 21 файл, 87 tests.
- Engine: contiguous `pending/accepted/terminal` для всех outcomes; delayed on/off/setpoint convergence и `resultTelemetryRevision` только для `executed`.
- API: create, exact-repeat idempotency, conflicting reuse, lookup, validation statuses.
- Hot store: cursor-neutral HTTP reconciliation и отсутствие lifecycle regression.
- Component: on/off, setpoint bounds/step, critical confirmation, visible desired/backend/actual separation.
- Chromium E2E: command-capable device выбирается через GPU picking, critical command подтверждается, доходит до `executed`, а `Actual` затем сходится с противоположным исходному desired state.
- Production smoke: compiled server создаёт schema-valid command, проверяет terminal execution/telemetry revision и продолжает ordered WebSocket stream.

Итоговые команды: `npm run verify` и `npm run test:e2e`.

## Осознанные ограничения

- Command records, timers, idempotency index и actor audit находятся только в памяти процесса.
- `demo-operator` и browser timestamps не являются trusted identity.
- Outcome distribution и delayed telemetry response — fixture, не physical simulation.
- `executed` появляется раньше telemetry convergence; requested intent, backend state и actual reading остаются раздельными источниками.
- UI normal path использует realtime; command submission/lookup behavior во время disconnect относится к Stage 8.

## Следующий этап

Stage 7 принят. Stage 8 не начат и требует отдельного явного старта пользователя. Его граница включает duplicates/stale/gaps, commands во время disconnect, unknown devices/missing `roomId`, alarm bursts при открытой карточке и safe reconnect recovery.
