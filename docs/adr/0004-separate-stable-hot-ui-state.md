# ADR-0004: Разделение stable metadata, hot operational state и UI state

- Статус: принят
- Дата: 2026-08-07

## Контекст

Каталог содержит десятки тысяч устройств и принимает сотни/тысячи updates в секунду. Общий массив
device objects пересоздавал бы неизменные names, positions, bindings и capabilities при каждом
изменении telemetry и связывал React с cadence WebGL.

## Решение

1. Stable catalog — versioned server document с query key и `catalogVersion`.
2. Telemetry, alarms, commands и cursor — indexed hot stores, атомарно заменяемые snapshot.
3. Selection, filters, viewport, panels и command drafts — UI-only state.
4. WebGL adapter соединяет стабильный порядок устройств с hot visual attributes и dirty indices.
5. Transport использует arrays; frontend ingestion строит maps/indexes.

Dynamic `status` относится к `DeviceTelemetry`, а не `DeviceMetadata`; `draft` относится к UI, а не
к backend command record.

## Последствия

- Telemetry change не инвалидирует catalog и не пересоздаёт все устройства.
- React использует узкие selectors, deck.gl — независимые batches.
- Resync заменяет hot state без повторной загрузки геометрии/metadata.
- Consumers явно соединяют данные по `deviceId`.
