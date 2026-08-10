# ADR-0005: Ordered realtime batches и HTTP snapshot resync

- Статус: принят
- Дата: 2026-08-07

## Контекст

Mock transport должен поддерживать обычный поток, bursts, disconnect/reconnect и authoritative
recovery. WebSocket сам по себе не доказывает полноту событий, а replay retention конечен.

## Решение

1. Использовать building-scoped `streamId` и монотонный sequence.
2. Передавать telemetry patches и alarm/command upserts в contiguous `event.batch`.
3. Хранить отдельную монотонную revision каждой device telemetry.
4. Использовать HTTP `StateSnapshot` для authoritative full replacement.
5. При сохранённом cursor продолжать после последнего sequence.
6. При expired cursor, смене stream или restart возвращать `resync.required`; client загружает
   snapshot и продолжает после его sequence.
7. Игнорировать duplicates, отвергать gaps и не угадывать отсутствующее состояние.

## Последствия

- Reconnect детерминирован и тестируем.
- High-rate telemetry batchable, alarms/commands передаются complete-record upserts.
- Snapshot/delta требуют atomic boundary в hot store.
- Simulator хранит bounded replay window.
- Stable metadata invalidation остаётся отдельным realtime event.
