# Отчёт этапа 1 — продуктовая модель и доменные контракты

## Результат

Этап определил product boundary и независимые от backend контракты device metadata, telemetry,
alarms, commands, snapshots и realtime recovery. Data pipeline и device UI этапа 2 не начинались.

## Реализовано

- Сценарии floor monitoring, alarm triage, simulated commands и reconnect recovery.
- Runtime Zod schemas для building/floor/device/capabilities/bindings/telemetry/alarms/commands.
- REST schemas каталога, snapshot, acknowledgement, create/lookup command и errors.
- Realtime schemas subscribe/resume/hello/batches/heartbeat/`resync.required`.
- Generated Draft 2020-12 JSON Schema.
- Semantic validation references, duplicate IDs, protocols, lifecycle audit и sequence continuity.
- ADR-0004 о stable/hot/UI separation и ADR-0005 об ordered replay/snapshot fallback.
- Working agreement с последовательной разработкой и approval gates.

## Проверка

| Проверка | Результат |
|---|---|
| Freshness generated contracts | пройдено |
| TypeScript strict | пройдено |
| Unit/API/contract | 13/13 |
| Stage 1 contracts | 7/7 |
| Server/Vite production builds | пройдено |
| Production smoke | пройдено |
| Chromium E2E | 1/1 |

## Ограничения на границе этапа

- `/api/v1` и WebSocket тогда существовали только как contracts.
- JSON Schema описывает wire structure; cross-record/lifecycle требуют runtime validators.
- Catalog начинался одним versioned document; pagination/binary encoding оставались measurement-driven.
- Production authentication/authorization не определялись; actor fields — mock IDs.
