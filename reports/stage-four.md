# Stage 4 report — floor mode and building overview

Дата: 2026-08-08  
Статус: реализован, ожидает пользовательской приёмки

## Результат

Операторский frontend теперь работает с восемью подготовленными этажами и полным репрезентативным каталогом на 18 000 устройств. Пользователь может переключаться между отдельным этажом и обзором здания, двигать и масштабировать сцену, выполнять fit, искать/фильтровать устройства и открывать карточку через GPU picking.

## Реализовано

- Scene repository загружает все 8 floor scenes из Stage 2 index.
- `/api/floors` возвращает этажи в явном display order.
- `/api/scene/query` обслуживает любой подготовленный этаж с viewport/zoom LOD.
- Catalog принимает floor или building scope.
- Добавлен отдельный детерминированный `/api/v1/state/snapshot` на том же scope.
- Большие HTTP-ответы поддерживают compression; catalog/snapshot — `ETag`, caching и `304`.
- TanStack Query кеширует floors, catalog, snapshot и overview scene bands.
- Zustand хранит mode, floor, selection, search и filters.
- Floor mode показывает 2 900–150 устройств в зависимости от выбранного этажа.
- Building overview раскладывает 8 floor-local plans рядом и показывает 18 000 GPU instances.
- Search работает по name/ID; filters — type, protocol, status.
- Warning/critical вынесены в верхний device layer, увеличены и видимы при любом renderer LOD.
- Device/label LOD ограничивает размер и число подписей без per-device DOM.
- GPU picking и одна selected-device card работают в обоих режимах.

## Статический status dataset

Stage 4 использует утверждённый read-only snapshot, отдельный от metadata:

| Status | Devices |
|---|---:|
| normal | 16 906 |
| warning | 473 |
| critical | 189 |
| offline | 432 |
| **total** | **18 000** |

Snapshot детерминирован по `deviceId`, имеет sequence `0` и не имитирует realtime. WebSocket/reconnect/resync и внешний hot store остаются Stage 5.

## Проверки

| Проверка | Результат |
|---|---|
| TypeScript strict typecheck | пройдено |
| Unit/contract/API tests | 20 из 20 пройдено |
| Chromium workflow E2E | пройдено |
| Production build | пройдено |
| Production HTML/scene/catalog/snapshot smoke | пройдено |
| Per-device DOM guard | пройдено в E2E |

E2E покрывает floor switch, поиск, building overview, status filter, zoom и GPU picking. Полный performance benchmark для representative/stress fixtures остаётся Stage 10.

## Осознанные ограничения

- Snapshot не обновляется во времени.
- Overview загружает до восьми scene documents на новый zoom band.
- Нет device spatial index/culling/clustering: 18 000 instances остаются одним WebGL workload, пока benchmark не докажет необходимость оптимизации.
- Vite предупреждает о frontend chunk около 1 МБ minified; это не влияет на корректность, но должно учитываться при performance/deployment оптимизации.
