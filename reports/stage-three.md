# Отчёт этапа 3 — минимальный вертикальный срез устройств

Дата: 2026-08-07. Статус: принят.

## Результат

Level 1 показывает 2 900 stable device records поверх архитектурной сцены. Устройства передаются
отдельно от viewport-filtered plan geometry и рендерятся одним deck.gl `IconLayer`, без React/DOM
node на устройство.

## Серверная часть

- Реализован `GET /api/v1/catalog?buildingId&floorIds` по runtime-контракту.
- Gzip catalog на 18 000 загружается и валидируется один раз при startup.
- Floor scope Level 1 возвращает ровно 2 900 records; unknown/invalid scopes отвергаются.
- Поддержаны `ETag`, `Cache-Control`, `If-None-Match` и `304`.
- JSON Level 1 занимал 2 178 593 bytes до HTTP encoding и загружался как stable metadata.

## Рендеринг

- Same-origin SVG atlas и один instanced `IconLayer`.
- Device types отображались atlas regions/colors; размеры зависели от zoom.
- Plan и devices оставались layers с разным cadence; план исключён из pick buffer.
- Selection использовал `pickObject()` только по device layer с radius 4 px.
- Одно выбранное устройство показывалось одной React card.

> После этапа 6 mapping заменён на 19 уникальных glyphs по одному на `DeviceType`; instancing,
> same-origin atlas и GPU picking сохранились.

## Граница состояния

Catalog содержал только `DeviceMetadata`. Telemetry/status/alarms/commands не добавлялись в objects;
selection не пересоздавал device array.

## Проверка

| Проверка | Результат |
|---|---|
| Contracts/schema freshness | пройдено |
| 8 floor scenes | 3 680 features |
| Representative/stress catalogs | 18 000 / 50 000 |
| Unit/API/contract | 15/15 |
| Level 1 catalog | 2 900 устройств |
| ETag/typecheck/build/smoke | пройдено |
| Chromium E2E | layers, zoom, GPU picking, card close |

Browser test также требовал менее 200 DOM nodes при 2 900 устройствах.

## Отложено на тот момент

Floor/building, filters/search, hot telemetry и performance benchmark относились к следующим этапам;
в завершённом MVP они реализованы и проверены.
