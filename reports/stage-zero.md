# Отчёт о проверке этапа 0

Дата: 2026-08-07

## Результат

- Runtime-validated viewport scene contract и endpoints списка этажей/сцены.
- Server bbox intersection и zoom LOD.
- Реальная геометрия Level 1 West Riverside Hospital без устройств.
- Воспроизводимый IFC-to-2D horizontal-section pipeline.
- 1 062 features: 473 стены, 147 колонн, 303 окна/витража и 139 дверей.
- Ортографический deck.gl viewer с pan/zoom/fit и request diagnostics.

## Проверки

- TypeScript strict typecheck — пройден.
- API/viewport unit tests — 6 пройдено.
- Chromium E2E — 1 пройден.
- Production build — пройден; dependency audit — 0 vulnerabilities.

## Известные на тот момент ограничения

- Извлечён только Level 1; остальные этажи/дисциплины находились вне этапа 0.
- Rooms не подписаны из-за отсутствия полезных `IfcSpace`; inference вне MVP.
- Backend выполнял linear feature scan, JSON ещё не сравнивался с vector tiles.
- deck.gl chunk был около 969 kB minified / 285 kB gzip без code splitting.
- Full-building performance benchmark был отложен до этапов 10–11 и теперь выполнен.
