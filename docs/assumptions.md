# Допущения

## A-001 Размер набора устройств

Репрезентативный fixture содержит ровно 18 000 устройств. Это цель воспроизводимости, а не
production capacity limit. Отдельный stress fixture содержит 50 000; ~2 000 и ~200 000 не являются
приёмочными наборами. Распределение 18 000: 7 000 DALI lights; 3 200 KNX presence/temperature/CO₂;
1 400 KNX switches/actuators; 2 600 fire/sprinkler/security; 2 200 HVAC/Modbus; 800 meters/electrical
controllers; 800 access/other.

## A-002 Геометрия этажа этапа 0

Используется реальное горизонтальное сечение архитектурного IFC2X3 West Riverside Hospital на
1,2 м выше Level 1: стены, колонны, двери, окна/витражи и лестницы. Из-за отсутствия полезных
`IfcSpace` помещения не именуются и не выводятся.

## A-003 Система координат

Cartesian metres, положительная Y направлена вверх. IFC world coordinates нормализуются offline
относительно локального origin этажа.

## A-004 Доставка сцены

JSON viewport query — заменяемая граница. Vector tiles/cached spatial chunks выбираются только
после измерений реальной геометрии.

## A-005 Backend

Prototype использует Node.js, TypeScript и Fastify ради общих контрактов с frontend; production
technology этим не определяется.

## A-006 Доставка каталога

Stable catalog передаётся одним versioned document для здания/этажей. Pagination или binary encoding
добавляются только при измеренной необходимости.

## A-007 Identity исполнителя

Production authentication/authorization вне scope. `requestedBy`, `acknowledgedBy`, `confirmedBy`
содержат mock actor IDs и не являются доверенными identity claims.

## A-008 Порядок realtime

Sequence монотонен внутри building stream. Новый `streamId` делает старый cursor недействительным и
требует authoritative snapshot.

## A-009 Авторитетность snapshot

HTTP snapshot авторитетен для telemetry, alarms, commands и cursor и заменяет их атомарно. Stable
catalog metadata и plan geometry в него не входят.

## A-010 Выполнение команд

Все команды симулированы. Backend state и actual telemetry разделены; `executed` не доказывает, что
значение уже наблюдается. Успешная команда через 650 мс публикует отдельный synthetic telemetry patch.
In-process timers и deterministic outcomes (большинство executed, каждое 9-е failed, 10-е timedOut)
созданы для UI/lifecycle, а не для физической модели, durable queue или safety controller. Server
валидирует capabilities, range/step и confirmation; browser identity/timestamp остаются недоверенными.

## A-011 Безопасность binding

Binding — opaque simulator/adapter reference с provenance, без credentials. Synthetic references
никогда не выдаются за IFC addresses.

## A-012 Timestamps и nullable fields

Wire timestamps — ISO 8601 с UTC offset. Не наступившие lifecycle fields явно равны `null`.

## A-013 Схема MEP-источников

Для Electrical, Fire Alarm, Mechanical и Sprinklers используется IFC2X3, поскольку при IFC4
conversion потеряны полезные property sets. Каждый source проверяется SHA-256.

## A-014 Provenance устройств

IFC devices сохраняют source file, IFC class/entity ID и GlobalId. Operational binding остаётся
simulated/synthetic. Недостающие категории генерируются с fixed seed и не выдаются за IFC-derived.

## A-015 Упрощённая базовая геометрия

Convex hull подготовленных coordinates — упрощённый footprint, не точная room/façade/navigation
boundary. Он заменяем без изменения API, пока один full-range `floor-shell` покрывает все feature bbox.

## A-016 Building-scoped realtime cursor

Один stream/cursor обслуживает здание, поэтому frontend загружает полный hot snapshot. Фильтрация
глобально sequenced batches по этажу создала бы ложные gaps. Будущий per-floor sharding обязан иметь
независимые stream IDs/cursors.

## A-017 Alarm fixture

По четыре deterministic simulated alarms на этаж демонстрируют lifecycle/severity без физического
источника. Telemetry status не создаёт и не закрывает alarm автоматически. Detection rules,
persistence, durable audit и trusted identity вне scope. Server валидирует transition и публикует
принятый record через ordered stream.

## A-018 Building catalog для alarm navigation

Полный stable catalog хранится в browser, выбранный floor выводится локально. Это увеличивает cache
document, но исключает request races при переходе из building-wide alarms. Измерения этапов 10–11
не потребовали pagination/floor indexes/on-demand metadata.

## A-019 Commands при недоступном realtime

REST и WebSocket независимы: при доступном HTTP команда может быть отправлена во время reconnect.
После успешного POST frontend polls lookup до terminal state или восстановления realtime. При network
failure результат POST неизвестен; draft сохраняет `clientRequestId`, а явный retry использует тот же
idempotency key. Автоматической очереди/повторной отправки нет — это safety property.

## A-020 Язык документации

С этапов 10–11 основной язык человекочитаемого Markdown — русский. API/type/file/CLI identifiers и
code blocks не переводятся. `AGENTS.md` сохраняет нормативный смысл независимо от языка.

## A-021 Среда performance benchmark

На macOS benchmark явно использует ANGLE Metal. SwiftShader и trace screenshots искажают WebGL
frame-time и не являются target evidence. Mobile project — эмуляция Pixel 7 на host GPU, не физический
Android benchmark; это ограничение отражено в `reports/performance.md`.
