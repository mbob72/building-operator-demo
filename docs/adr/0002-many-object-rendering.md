# ADR-0002: Рендеринг десятков тысяч устройств

- Статус: принят как архитектурные ограничения
- Дата: 2026-08-07

## Контекст

Сцена содержит десятки тысяч устройств с realtime status changes и должна оставаться интерактивной
в floor/building режимах. Точное число не является контрактной константой; оптимизация требует
измерений, а не обоснования круглым числом.

## Решение

1. Рендерить устройства instanced deck.gl `IconLayer` с texture atlas.
2. Не создавать для устройств React/DOM nodes; WebGL не зависит от структуры компонентов.
3. Начать без обязательного CPU viewport culling, использовать GPU picking.
4. Хранить stable metadata отдельно от hot telemetry и обновлять dirty GPU attributes batches.
5. Применять LOD прежде всего к плану и labels; alarms должны сохранять видимость.
6. Добавлять quadtree/R-tree (`rbush`) только при измеренной потребности spatial queries.
7. Clustering, workers, binary attributes и culling выбирать по воспроизводимому benchmark.

## Последствия

- GPU выполняет подходящую ему instanced-нагрузку, а реализация остаётся небольшой.
- Дизайн realtime store/layer updates важнее оптимизации React-списков.
- Server viewport filtering сохраняется для сложной геометрии.
- Before/after evidence хранится в [`reports/performance.md`](../../reports/performance.md).
- Benchmark обязательно включает stress fixture на 50 000 устройств.

Подробности: [рекомендации по рендерингу](../rendering-guidelines.md).
