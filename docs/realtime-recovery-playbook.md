# Realtime: сценарии восстановления

| Атрибут | Значение |
|---|---|
| Назначение | Пошаговые сценарии подключения, replay и resync |
| Аудитория | Frontend-, backend-разработчики, QA и эксплуатация |
| Родительская страница | [Realtime: передача данных, cursor и восстановление](realtime-data-flow-confluence.md) |

## Навигация

- [Обзор и словарь](realtime-data-flow-confluence.md)
- [Примеры контрактных сообщений](realtime-contract-examples.md)
- [Карта реализации](realtime-implementation-guide.md)
- [ADR-0005](adr/0005-ordered-realtime-with-snapshot-resync.md)

## Быстрый выбор сценария

| Наблюдение | Механизм | Нужен HTTP snapshot |
|---|---|---|
| Первый запуск | bootstrap + resume | да |
| WebSocket кратко отключился | reconnect + replay | нет, если cursor сохранён |
| Client cursor вытеснен из replay | `cursorExpired` + resync | да |
| Server имеет другой `streamId` | `streamChanged` + resync | да |
| Client sequence впереди server | `serverRestart` + resync | да |
| В live batch обнаружен gap | client-initiated resync | да |
| Patch нельзя применить к snapshot | client-initiated resync | да |
| Heartbeat сообщает, что server впереди | повторный resume | сначала нет |
| Получено невалидное JSON/schema message | socket error + reconnect | зависит от следующего resume |

## Состояния connectionStatus

```text
idle
  → connecting
  → live
  → reconnecting
  → live

любое active состояние
  → resyncing
  → connecting/live

transport или snapshot error
  → error
  → reconnecting после socket close
```

`ready` и `connectionStatus` отвечают на разные вопросы:

- `ready` означает, что store хотя бы один раз получил полный snapshot;
- `connectionStatus` описывает текущее состояние transport/recovery.

Во время reconnect UI может продолжать показывать последний известный snapshot, хотя новые данные временно не поступают.

## Сценарий 1: нормальная инициализация

### Исходное состояние

```text
store.ready = false
store.streamId = undefined
store.sequence = 0
```

### Шаги

```text
1. useRealtimeBootstrap ставит connectionStatus=connecting
2. Browser запрашивает HTTP snapshot
3. Server возвращает snapshot(stream A, sequence 100)
4. Store атомарно заменяет hot state и cursor
5. Browser открывает WebSocket
6. Client отправляет resume(A, afterSequence=100)
7. Server отправляет hello
8. Server replay-ит события 101..124
9. Server подписывает socket на новые batches
10. Store применяет replay и становится live на sequence 124
```

Запрос клиента:

```json
{
  "type": "resume",
  "protocolVersion": "1",
  "buildingId": "west-riverside",
  "streamId": "stream-A",
  "afterSequence": 100
}
```

Если `latestSequence = 100`, replay пустой. Server сразу подписывает соединение на будущие batches.

### Почему snapshot загружается первым

Без snapshot telemetry patch мог бы относиться к устройству, которого ещё нет в store. Кроме того, snapshot задаёт согласованную пару `streamId + sequence`, от которой безопасно просить replay.

## Сценарий 2: короткий disconnect и replay

### Исходное состояние

```text
client cursor = stream A / sequence 124
server latest = 124
server replay хранит события начиная с 1
```

### Во время разрыва

Server продолжает работу и создаёт события `125..180`. Store остаётся на `124`.

### Повторное подключение

```text
socket close
  → connectionStatus=reconnecting
  → reconnect delay
  → новый WebSocket
  → resume(stream A, afterSequence=124)
  ← hello(stream A, latestSequence=180)
  ← event.batch(125..180)
  → applyBatch
  → cursor=180, connectionStatus=live
```

HTTP snapshot не нужен, потому что server всё ещё хранит непрерывный хвост после `124`.

### Задержка повторного подключения

Задержка вычисляется так:

```text
250 ms → 500 ms → 1000 ms → 2000 ms → 4000 ms → 5000 ms
```

После успешного `open` attempt counter сбрасывается.

## Сценарий 3: duplicate batch после reconnect

### Исходное состояние

```text
local sequence = 180
получен batch 150..180
```

Поскольку `batch.toSequence <= local sequence`, store возвращает `duplicate`. Domain state, cursor и subscribers не изменяются.

Это обеспечивает idempotent повторную доставку на уровне global sequence.

## Сценарий 4: batch частично пересекает cursor

### Исходное состояние

```text
local sequence = 180
получен batch 175..185
```

Store оставляет только fresh events `181..185`.

```text
first fresh sequence = local sequence + 1
181 = 180 + 1
```

Batch безопасно применяется, cursor становится `185`. Повторные `175..180` не применяются второй раз.

## Сценарий 5: cursorExpired

### Исходное состояние

```text
client cursor = stream A / 124
server stream = A
server replay range = 500..549
```

Client просит события после `124`, но `125..499` уже удалены из bounded replay.

### Ответ сервера

```json
{
  "type": "resync.required",
  "streamId": "stream-A",
  "latestSequence": 549,
  "reason": "cursorExpired",
  "snapshotPath": "/api/v1/state/snapshot?buildingId=west-riverside"
}
```

### Восстановление

```text
Client
  → connectionStatus=resyncing
  → GET snapshotPath
  ← snapshot(stream A, sequence 552)
  → replaceSnapshot(A, 552)
  → resume(A, afterSequence=552)
  ← replay событий, созданных после snapshot
  → live
```

Snapshot может иметь sequence больше `latestSequence` из сообщения `resync.required`: server продолжает создавать события, пока выполняется HTTP request.

## Сценарий 6: streamChanged

### Исходное состояние

```text
client cursor = stream A / 8000
server cursor = stream B / 120
```

Числа нельзя сравнивать между разными streams. Server отвечает `streamChanged`.

```text
resume(A, after=8000)
  ← hello(B, latest=120)
  ← resync.required(B, reason=streamChanged)
  → GET snapshot
  ← snapshot(B, sequence=125)
  → replaceSnapshot(B, 125)
  → resume(B, after=125)
```

Store полностью отбрасывает hot state stream A.

## Сценарий 7: serverRestart

### Исходное состояние

```text
client stream = A, sequence = 900
server stream = A, sequence = 20
```

Такая комбинация возможна, если stream identity был повторно использован или server state восстановлен неконсистентно. `afterSequence > latestSequence`, поэтому server не может replay-ить cursor и отвечает:

```json
{
  "type": "resync.required",
  "streamId": "stream-A",
  "latestSequence": 20,
  "reason": "serverRestart",
  "snapshotPath": "/api/v1/state/snapshot?buildingId=west-riverside"
}
```

Дальнейшие шаги совпадают с обычным resync.

В нормальном перезапуске текущая реализация создаёт новый `streamId`, поэтому чаще будет использована причина `streamChanged`.

## Сценарий 8: sequence gap внутри live connection

### Исходное состояние

```text
local sequence = 501
получен batch = 503..526
```

Ожидался `502`, но первый fresh event имеет `503`.

```text
store.applyBatch()
  → result=gap
client.resync()
  → GET default snapshot path
  → replaceSnapshot()
  → resume от нового cursor
```

Store не применяет `503..526`, потому что неизвестное событие `502` могло изменить любую hot-сущность.

Отличие от `cursorExpired`: gap обнаруживает client, поэтому он начинает resync без предварительного `resync.required` от server.

## Сценарий 9: invalid-state при применении patch

Примеры:

- telemetry patch относится к неизвестному `deviceId`;
- merge patch с текущей telemetry нарушает domain schema;
- snapshot не содержит сущность, которую stream предполагает существующей.

Store возвращает `invalid-state`. Временные copy-on-write maps не публикуются, cursor не изменяется. Client загружает snapshot.

Это recovery от рассинхронизации domain state, а не от transport gap.

## Сценарий 10: heartbeat сообщает об отставании

### Исходное состояние

```text
local cursor = stream A / 600
heartbeat = stream A / latestSequence 610
```

`markHeartbeat()` возвращает `false`, потому что server находится впереди. Client отправляет новый `resume(A, afterSequence=600)` на том же socket.

Сервер:

1. отправляет новый `hello`;
2. снимает прежнюю live subscription этого socket;
3. replay-ит `601..610`;
4. снова подписывает socket на live batches.

Если события уже вытеснены, server вместо replay отправляет `resync.required`.

## Сценарий 11: heartbeat имеет другой streamId

```text
local cursor = stream A / 600
heartbeat = stream B / 20
```

Client повторяет `resume` со старым cursor A. Server видит stream mismatch и отвечает `resync.required(reason=streamChanged)`.

## Сценарий 12: WebSocket message не проходит validation

Client сначала выполняет `JSON.parse`, затем `ServerRealtimeMessageSchema.safeParse()`.

При ошибке:

```text
connectionStatus=error
error="Invalid realtime server message"
socket.close()
  → reconnect
  → resume от последнего успешно применённого cursor
```

Невалидное сообщение никогда не передаётся в store.

Server аналогично закрывает socket с code `1008`, если client прислал невалидный JSON, неизвестную форму сообщения или неправильный building/floor scope.

## Сценарий 13: ошибка HTTP snapshot во время resync

```text
resync.required
  → GET snapshot
  ← network/HTTP/schema error
  → connectionStatus=error
  → socket.close()
  → reconnect
```

Старое состояние остаётся в store, но новый snapshot не устанавливается. После reconnect server снова оценивает старый cursor и при необходимости повторно потребует resync.

Guard `resyncing` не позволяет нескольким проблемным сообщениям запустить параллельные snapshot requests.

## Сценарий 14: intentional stop

При React cleanup `client.stop()`:

1. ставит `stopped = true`;
2. отменяет запланированный reconnect;
3. удаляет ссылку на active socket;
4. закрывает socket;
5. выставляет `connectionStatus = idle`.

`onclose` старого socket не запускает reconnect, потому что client уже остановлен.

## HTTP mutation во время нормального соединения

### Подтверждение аварии

```text
POST acknowledge
  → backend меняет alarm
  → backend публикует alarm.upsert с новым sequence
  → HTTP response возвращает тот же Alarm
```

HTTP response и WebSocket event могут прийти в любом порядке:

| Порядок | Результат |
|---|---|
| HTTP, затем WebSocket | UI сразу видит alarm; socket позже двигает cursor |
| WebSocket, затем HTTP | socket обновляет alarm и cursor; одинаковый HTTP upsert игнорируется |

### Создание команды

Backend публикует lifecycle:

```text
pending → accepted → executed | failed | timedOut
```

HTTP обычно возвращает `pending`, а WebSocket может уже доставить `accepted`. Direct `upsertCommand()` сравнивает lifecycle rank и не позволяет старому HTTP состоянию выполнить regression.

## Контрольный список восстановления

| Вопрос | Где смотреть |
|---|---|
| Какой client cursor? | toolbar или `RealtimeHotStore.getSnapshot()` |
| Совпадает ли `streamId`? | client store, `hello`, `heartbeat`, server engine |
| Какой server `latestSequence`? | `hello` или `heartbeat` |
| Где начинается replay? | `hello.retentionStartSequence` |
| Какой результат вернул store? | `applied`, `duplicate`, `gap`, `stream-mismatch`, `invalid-state` |
| Был ли установлен новый snapshot? | изменение `snapshotId`, `streamId`, `sequence`, `ready` |
| Почему resync? | `resync.required.reason` или client-side apply result |
| Закрылся ли socket? | `onclose` и переход в `reconnecting` |

## Проверяемые инварианты

- После успешного batch client cursor равен `batch.toSequence`.
- Duplicate не меняет state.
- Gap не двигает cursor.
- Resync атомарно заменяет все hot indexes.
- Resume всегда читает cursor из store непосредственно перед отправкой.
- Replay содержит только события с sequence больше `afterSequence`.
- После replay socket получает live batches из того же stream.
- Intentional stop не создаёт новое соединение.

Автоматические сценарии находятся в:

- [`tests/ui/realtime-client.test.ts`](../tests/ui/realtime-client.test.ts);
- [`tests/ui/realtime-hot-store.test.ts`](../tests/ui/realtime-hot-store.test.ts);
- [`tests/api/realtime-websocket.test.ts`](../tests/api/realtime-websocket.test.ts);
- [`tests/api/realtime-engine.test.ts`](../tests/api/realtime-engine.test.ts).
