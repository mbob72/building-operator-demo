# Спецификация продукта

## Результат продукта

Building Operator MVP — 2D-рабочее место для мониторинга и симулированного управления инженерными
системами большого здания. Это не BIM-редактор. Браузер никогда не подключается напрямую к KNX,
DALI, Modbus, BACnet, пожарным, охранным или access-control сетям.

Основной пользователь — оператор, которому нужно понимать текущее состояние, находить отклонения,
подтверждать аварии и отправлять аудируемые симулированные команды без потери контекста при высокой
частоте обновлений и reconnect.

## Масштаб

- Репрезентативный fixture: 18 000 устройств; это не capacity limit.
- Stress fixture: 50 000 устройств.
- Floor mode показывает устройства выбранного этажа; building overview — полный каталог.
- Исходное здание — West Riverside Hospital. `floorId` обязателен, `roomId` может отсутствовать.

## Сценарии оператора

### Мониторинг этажа

1. Выбрать этаж и получить stable catalog вместе с viewport-aware геометрией.
2. Выполнять pan/zoom, не превращая устройства в DOM-узлы.
3. Фильтровать по типу, протоколу и operational status.
4. Открыть устройство и увидеть metadata, telemetry, alarms и последние commands.

### Работа с аварией

1. Видеть warning/critical независимо от LOD подписей плана.
2. Перейти из аварии к устройству на нужном этаже.
3. Подтвердить аварию с identity оператора и timestamp.
4. Не смешивать active, acknowledged и resolved состояния.

### Отправка команды

1. Создать локальный `draft` из capability устройства.
2. Запросить подтверждение, если capability помечена критичной.
3. Отправить idempotent request и показать `pending`.
4. Показать backend `accepted`, затем `executed`, `failed` или `timedOut`.
5. Хранить desired intent отдельно от actual telemetry: execution ещё не означает convergence.

### Восстановление realtime

1. Применять ordered batches к индексированному hot state.
2. После reconnect запросить replay после последнего применённого sequence.
3. Если replay недоступен или stream сменился, атомарно заменить state authoritative snapshot.
4. Продолжить deltas после snapshot sequence; индикатор соединения сам по себе не доказывает freshness.

## Границы MVP

Включены:

- 2D floor/building overview;
- stable device metadata, hot telemetry, alarms и simulated commands;
- поиск, фильтры, GPU picking, alarm navigation/acknowledgement, reconnect/resync;
- воспроизводимая offline-подготовка IFC/данных и явный `dataOrigin`;
- mock REST/WebSocket backend и load simulator;
- автоматизированные functional, E2E и performance acceptance.

Исключены:

- 3D BIM, разбор IFC в браузере, CAD-редактирование и вывод помещений;
- production authentication/authorization, долговременный audit и persistent operational storage;
- прямые подключения к физическим протоколам и реальные команды оборудованию;
- физическая симуляция света, HVAC, пожарных или охранных систем;
- выдача synthetic binding за IFC-derived или физический адрес.

## Инварианты безопасности и домена

- Device/alarm/command/client-request IDs и stream sequence стабильны и opaque.
- Stable metadata не содержит hot `status` или изменяемых telemetry values.
- Binding содержит protocol reference и provenance, но никогда credentials.
- `draft` существует только в UI; backend command начинается с `pending`.
- Повтор `clientRequestId` идемпотентен и не создаёт вторую команду.
- Alarm acknowledgement и terminal command transitions содержат audit timestamps и actor/error.
- Старые device revisions и duplicate sequence игнорируются; gap запускает replay или resync.

## Критерии завершённого MVP

1. Runtime-контракты покрывают домен, REST, realtime и recovery.
2. Stable metadata, hot operational state, UI state и renderer state разделены.
3. Все пользовательские сценарии проверены в Chromium.
4. Контракты, unit/type/build/smoke проходят `npm run verify`.
5. Browser acceptance проходит `npm run test:e2e`.
6. Матрица 18 000/50 000 × desktop/mobile проходит `npm run test:performance`.
7. Архитектура, источники, лицензия, deployment, ограничения и риски записаны в репозитории.
