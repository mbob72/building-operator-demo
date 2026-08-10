# Рекомендации по рендерингу большого числа объектов

Проверенный источник: [обсуждение ChatGPT](https://chatgpt.com/share/6a760c62-6c9c-83eb-a93e-714ecebd57e0),
2026-08-07. Это guardrails проекта, а не требование применить каждую оптимизацию. Любое усложнение
должно устранять измеренное узкое место на репрезентативных данных и целевом оборудовании.

## Базовая модель

- React владеет shell приложения: navigation, filters, panels, selection, alarms и commands.
- deck.gl владеет графической сценой; устройство не становится React/DOM node.
- План, устройства, labels, selection, zones и relationships — отдельные render layers.
- Static entity metadata отделена от hot telemetry.
- Renderer получает подготовленную scene data и domain state, но не raw IFC/protocol payloads.

## Устройства

- Использовать один instanced deck.gl `IconLayer` для основной population.
- Один texture atlas содержит уникальный slot каждого контрактного `DeviceType`.
- deck.gl `iconMapping` и React marker backgrounds выводятся из одного ordered type list.
- Минимизировать layers/draw calls; разделять их только при действительно разном поведении/cadence.
- Использовать GPU picking, без per-device handlers и JSX.
- Не пересоздавать полный device array из-за одного telemetry change.
- Сохранять порядок и обновлять только dirty color/size/state/icon attributes.

Десятки тысяч простых icons — обычная WebGL-нагрузка, но предел устанавливается измерением, а не
числом объектов. Этапы 10–11 подтвердили один основной `IconLayer` и GPU status filtering на
18 000/50 000 устройств; см. [performance-отчёт](../reports/performance.md).

## Realtime updates

```text
WebSocket deltas
    -> indexed hot store by deviceId
    -> dirty-device queue
    -> controlled update batch
    -> changed GPU attributes
```

- Не запускать React render на каждое telemetry message.
- Coalesce повторные updates одного устройства внутри batch.
- Initial snapshot/resync отделять от incremental deltas.
- Измерять serialization, queue, apply/upload time, dropped frames и end-to-end latency.
- Worker добавлять только при доказанном main-thread bottleneck в decoding/filtering/indexing.

## Viewport и LOD

- Сохранять server viewport/zoom filtering для сложной floor geometry.
- Labels показывать для selected/alarming или при достаточном zoom.
- На низком zoom сначала снижать detail плана/labels, не доступность аварий.
- Clustering — одновременно product representation и optimization; warnings/critical не теряются.
- Floor/system filters являются поведением продукта и могут уменьшать render workload.

## Пространственные индексы

Не требовать index только ради отрисовки point layer. Он оправдан, если улучшает nearest/area/room
queries, label placement, neighbor lookup, clustering, mixed geometry или масштаб в сотни тысяч.

- quadtree — для point devices и nearest-neighbor;
- R-tree — для bbox, rooms, zones, routes, labels и equipment size;
- `rbush` — первый кандидат R-tree.

Index полной stable metadata и GPU culling — независимые решения.

## Сценарии benchmark

Минимальная матрица:

1. Representative tens-of-thousands и stress fixture 50 000.
2. Floor и all-building overview.
3. Continuous pan/zoom, fit, pointer movement и GPU picking.
4. Filters/selection и возврат полного набора.
5. Normal realtime, burst и alarm color/size transitions.
6. LOD labels и reconnect с snapshot/resync.
7. Поддерживаемый desktop и representative mobile profile.

Фиксируются frame-time percentiles, long tasks, memory, React commits, rendered instances и update
latency. Benchmark обязан записывать GPU backend; SwiftShader нельзя напрямую сравнивать с Metal.

## Необоснованные оптимизации

- Desktop wrapper сам по себе не ускоряет browser rendering.
- Число устройств не является достаточным основанием для clustering.
- Worker не добавляется без main-thread работы, которую стоит вынести.
- Layers с разным LOD/cadence не следует насильно объединять.
- IFC никогда не загружается и не разбирается в runtime браузера.
