# Отчёт о производительности этапов 10–11

- Дата: 2026-08-10
- Статус: критерии performance-gate пройдены
- Наборы данных: репрезентативный каталог на 18 000 устройств и stress-каталог на 50 000
- Браузер: Chromium через Playwright, desktop-профиль и эмуляция Pixel 7
- Графика: `ANGLE Metal Renderer: Apple M1 Pro`

## Итог

Воспроизводимая матрица `18 000/50 000 × desktop/mobile` прошла все заданные бюджеты. Проверка
охватывает floor/building режимы, pan/zoom/fit, GPU picking, status-фильтр, возврат полного набора,
нормальный realtime и управляемый burst не менее чем из 5 000 событий.

Сырые результаты находятся в [`reports/performance/`](performance/README.md) и перезаписываются
командой `npm run test:performance`.

## Среда и корректность измерения

Headless Chromium на macOS без явной настройки выбирает программный SwiftShader. Такой запуск
создавал ложные паузы в сотни миллисекунд и не отражал WebGL-нагрузку целевой рабочей станции.
Benchmark явно включает `--use-angle=metal`, записывает renderer/vendor в каждый JSON и отключает
Playwright trace: trace-скриншоты синхронно читают WebGL canvas и искажают frame-time.

Мобильный профиль проверяет viewport, touch/device параметры и поведение интерфейса Pixel 7, но
исполняется на том же Apple M1 Pro GPU. Это browser-emulation gate, а не измерение физического
Android-устройства; ограничение остаётся известным риском финального MVP.

## Итоговые метрики

Все значения времени указаны в миллисекундах, память — в мегабайтах. В таблице приведены p95,
кроме явно обозначенного максимума long task.

| Fixture / профиль | Floor frame | Overview frame | Burst frame | Long task max | Heap | React commit | Batch apply | Realtime latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 18 000 / desktop | 10,2 | 10,3 | 10,2 | 118 | 75,2 | 10,8 | 3,2 | 47 |
| 18 000 / mobile | 10,3 | 10,2 | 10,2 | 80 | 95,5 | 12,1 | 3,4 | 12 |
| 50 000 / desktop | 10,3 | 10,2 | 10,2 | 160 | 148,1 | 18,8 | 5,8 | 13 |
| 50 000 / mobile | 10,2 | 10,3 | 10,2 | 159 | 116,7 | 20,1 | 6,7 | 24 |

В каждом burst-сценарии cursor продвинулся не менее чем на 5 408 событий; DOM содержал 221 узел,
то есть число устройств не превратилось в число React/DOM-элементов.

## Бюджеты приёмки

| Метрика | Desktop | Mobile | Результат |
|---|---:|---:|---|
| p95 frame interval | `< 75 ms` | `< 100 ms` | пройдено |
| max long task | `< 1 000 ms` | `< 1 000 ms` | пройдено |
| heap, representative | `< 500 MB` | `< 500 MB` | пройдено |
| heap, stress | `< 750 MB` | `< 750 MB` | пройдено |
| p95 React actual duration | `< 100 ms` | `< 100 ms` | пройдено |
| p95 batch apply | `< 50 ms` | `< 50 ms` | пройдено |
| p95 end-to-end realtime latency | `< 1 000 ms` | `< 1 000 ms` | пройдено |

## Измерениями подтверждённые изменения

1. Основной device layer сохраняет полный стабильный массив; status-фильтр передаётся в
   `DataFilterExtension` и применяется на GPU.
2. Устройства рендерятся одним основным `IconLayer`. Отдельное разбиение normal/priority раньше
   меняло состав больших массивов при status transition и вынуждало лишние GPU-пересчёты.
3. Realtime status обновляет только dirty ranges стабильного слоя; warning/critical различаются
   цветом и размером в том же draw call.
4. Test-only burst endpoint включается только через `ENABLE_PERFORMANCE_ROUTES=1`; production по
   умолчанию его не регистрирует.
5. Размер fixture и simulator cadence задаются окружением, поэтому один и тот же сценарий можно
   повторить без изменения product-кода.

Диагностические прогоны через SwiftShader показали p95 floor frame около 175–317 ms и long tasks
до нескольких секунд. Они исключены из итоговой таблицы как неверная target-среда, но помогли
найти и убрать нестабильное разбиение device layers и зафиксировать требования к benchmark setup.

## Запуск

```bash
npm run test:performance:representative
npm run test:performance:stress
npm run test:performance
```

Обычная полная проверка продукта остаётся отдельной:

```bash
npm run verify
npm run test:e2e
```

## Известные ограничения

- Нет прогона на физическом низкопроизводительном desktop или Android-устройстве.
- Метрики зависят от GPU backend; результат со SwiftShader нельзя сравнивать с Metal как регрессию.
- Benchmark проверяет управляемый burst, но не многочасовую soak-нагрузку и не server saturation.
- Spatial index, clustering, worker и binary attributes не добавлены: итоговый аппаратный замер не
  показал узкого места, которое оправдывало бы эту сложность для текущего масштаба.
