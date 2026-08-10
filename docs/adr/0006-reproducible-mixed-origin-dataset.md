# ADR-0006: Воспроизводимый набор устройств смешанного происхождения

- Статус: принят
- Дата: 2026-08-07

## Контекст

IFC содержит полезные реальные MEP-элементы, но не все категории и этажи MVP. Нельзя выдавать
generated devices за IFC-derived. Изменяемые timestamps, gzip headers или random placement также
мешают проверкам и сравнению производительности.

## Решение

1. Сохранять source file, global ID, IFC type/ID, floor и normalized position каждого IFC device.
2. Помечать происхождение как `ifc`, `derived` или `synthetic` и валидировать согласованность.
3. До физической интеграции оставлять operational bindings simulated независимо от происхождения.
4. Использовать `ObjectPlacement` внутри floor bounds; иначе пробовать world-space geometry centroid.
5. Исключать оставшиеся out-of-bounds candidates и записывать deterministic reason counts.
6. Заполнять утверждённые категории/этажи с fixed seed и deterministic ordering.
7. Фиксировать dataset time/gzip metadata, checksums и требовать byte-for-byte regeneration.
8. Хранить 18 000 как representative и 50 000 как stress fixture; это не capacity limits.

## Последствия

- UI честно показывает IFC/synthetic origin без выдуманной физической связи.
- Regeneration/CI выявляют изменения источника, схемы, распределения и сериализации.
- IFC geometry вне подготовленных bounds может быть исключена и отражается в manifest/report.
- Room assignment остаётся неизвестным до отдельного spatial-containment этапа.
