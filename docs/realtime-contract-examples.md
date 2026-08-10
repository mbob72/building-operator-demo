# Realtime: примеры данных и сообщений

| Атрибут | Значение |
|---|---|
| Назначение | Справочник JSON-примеров по текущим runtime-контрактам |
| Аудитория | Разработчики, тестировщики, авторы интеграций |
| Source of truth | Zod-схемы в `src/shared` |
| Родительская страница | [Realtime: передача данных, cursor и восстановление](realtime-data-flow-confluence.md) |

## Навигация

- [Обзор и термины](realtime-data-flow-confluence.md)
- [Recovery playbook](realtime-recovery-playbook.md)
- [Карта реализации](realtime-implementation-guide.md)
- [Runtime realtime contracts](../src/shared/realtime-contracts.ts)
- [Runtime domain contracts](../src/shared/domain-contracts.ts)
- [Runtime API contracts](../src/shared/api-contracts.ts)

## Правила чтения примеров

Все timestamp имеют ISO 8601 offset и в примерах используют UTC `Z`. Все schemas объявлены как strict: неизвестное дополнительное поле приводит к ошибке validation.

Примеры показывают форму wire data. Комментарии внутрь JSON не добавлены, чтобы объекты можно было копировать в fixture или тест.

## Базовые типы

### Sequence

```json
1042
```

Допустимо целое неотрицательное число до `Number.MAX_SAFE_INTEGER`. Значение используется и для global realtime sequence, и для telemetry revision, но смысл определяется полем, в котором оно находится.

### Timestamp

```json
"2026-08-10T10:00:00.120Z"
```

### EntityId

```json
"west-riverside-temperature-sensor-17"
```

Непустая строка длиной не более 128 символов.

## DeviceTelemetry: полное состояние устройства

Контракт: [`DeviceTelemetrySchema`](../src/shared/domain-contracts.ts#L198).

```json
{
  "deviceId": "west-riverside-temperature-sensor-17",
  "revision": 8,
  "observedAt": "2026-08-10T10:00:00.000Z",
  "receivedAt": "2026-08-10T10:00:00.050Z",
  "connection": "online",
  "status": "normal",
  "values": {
    "temperature": 22.8,
    "setpoint": 22,
    "occupied": true
  }
}
```

| Поле | Значение |
|---|---|
| `deviceId` | Ссылка на stable metadata устройства |
| `revision` | Версия telemetry только этого устройства |
| `observedAt` | Когда значение наблюдал источник |
| `receivedAt` | Когда значение получил backend |
| `connection` | `online`, `offline` или `unknown` |
| `status` | `normal`, `warning`, `critical`, `offline` или `unknown` |
| `values` | Набор telemetry channels устройства |

Контракт требует согласованности connection/status:

- `connection = offline` требует `status = offline`;
- `connection = online` не допускает `status = offline`.

## DeviceTelemetryPatch: частичное изменение

Контракт: [`DeviceTelemetryPatchSchema`](../src/shared/domain-contracts.ts#L215).

```json
{
  "deviceId": "west-riverside-temperature-sensor-17",
  "revision": 9,
  "observedAt": "2026-08-10T10:00:01.000Z",
  "receivedAt": "2026-08-10T10:00:01.040Z",
  "values": {
    "temperature": 23.4
  }
}
```

Patch обязан содержать хотя бы одно из полей:

- `connection`;
- `status`;
- `values`.

Применение к предыдущему полному объекту:

```text
До patch:
revision = 8
values = { temperature: 22.8, setpoint: 22, occupied: true }

После patch:
revision = 9
values = { temperature: 23.4, setpoint: 22, occupied: true }
```

`values` мержится по ключам. Patch не удаляет отсутствующие channels.

Пример изменения статуса:

```json
{
  "deviceId": "west-riverside-temperature-sensor-17",
  "revision": 10,
  "observedAt": "2026-08-10T10:00:02.000Z",
  "receivedAt": "2026-08-10T10:00:02.030Z",
  "status": "warning"
}
```

## Alarm: полная запись тревоги

Контракт: [`AlarmSchema`](../src/shared/domain-contracts.ts#L231).

Active alarm:

```json
{
  "id": "alarm-temperature-high-17",
  "deviceId": "west-riverside-temperature-sensor-17",
  "severity": "warning",
  "code": "TEMPERATURE_HIGH",
  "message": "Room temperature is above the configured threshold",
  "createdAt": "2026-08-10T10:00:02.000Z",
  "updatedAt": "2026-08-10T10:00:02.000Z",
  "state": "active",
  "acknowledgedAt": null,
  "acknowledgedBy": null,
  "resolvedAt": null
}
```

Тот же alarm после acknowledgement передаётся целиком:

```json
{
  "id": "alarm-temperature-high-17",
  "deviceId": "west-riverside-temperature-sensor-17",
  "severity": "warning",
  "code": "TEMPERATURE_HIGH",
  "message": "Room temperature is above the configured threshold",
  "createdAt": "2026-08-10T10:00:02.000Z",
  "updatedAt": "2026-08-10T10:01:00.000Z",
  "state": "acknowledged",
  "acknowledgedAt": "2026-08-10T10:01:00.000Z",
  "acknowledgedBy": "demo-operator",
  "resolvedAt": null
}
```

`state = acknowledged` требует непустые `acknowledgedAt` и `acknowledgedBy`. `state = resolved` требует `resolvedAt`.

## CommandRecord: полная запись команды

Контракт: [`CommandRecordSchema`](../src/shared/domain-contracts.ts#L295).

Pending command:

```json
{
  "id": "command-setpoint-17",
  "clientRequestId": "request-setpoint-17-001",
  "deviceId": "west-riverside-temperature-sensor-17",
  "intent": {
    "kind": "setSetpoint",
    "value": 21.5
  },
  "state": "pending",
  "requestedAt": "2026-08-10T10:02:00.000Z",
  "requestedBy": "demo-operator",
  "confirmation": null,
  "acceptedAt": null,
  "executedAt": null,
  "failedAt": null,
  "timedOutAt": null,
  "failure": null,
  "resultTelemetryRevision": null
}
```

Executed state той же команды:

```json
{
  "id": "command-setpoint-17",
  "clientRequestId": "request-setpoint-17-001",
  "deviceId": "west-riverside-temperature-sensor-17",
  "intent": {
    "kind": "setSetpoint",
    "value": 21.5
  },
  "state": "executed",
  "requestedAt": "2026-08-10T10:02:00.000Z",
  "requestedBy": "demo-operator",
  "confirmation": null,
  "acceptedAt": "2026-08-10T10:02:00.350Z",
  "executedAt": "2026-08-10T10:02:01.550Z",
  "failedAt": null,
  "timedOutAt": null,
  "failure": null,
  "resultTelemetryRevision": 11
}
```

`resultTelemetryRevision = 11` связывает выполненную команду с telemetry revision устройства, которая отражает фактический результат. Это не global sequence.

## StateSnapshot: полное hot-состояние

Контракт: [`StateSnapshotSchema`](../src/shared/api-contracts.ts#L33).

```json
{
  "snapshotId": "stage-8-9-live-snapshot-v1:1040:building",
  "buildingId": "west-riverside",
  "streamId": "stage-8-9-stream-2026-08-10",
  "sequence": 1040,
  "generatedAt": "2026-08-10T10:03:00.000Z",
  "telemetry": [
    {
      "deviceId": "west-riverside-temperature-sensor-17",
      "revision": 11,
      "observedAt": "2026-08-10T10:00:02.000Z",
      "receivedAt": "2026-08-10T10:00:02.030Z",
      "connection": "online",
      "status": "warning",
      "values": {
        "temperature": 23.4,
        "setpoint": 21.5,
        "occupied": true
      }
    },
    {
      "deviceId": "west-riverside-air-handler-3",
      "revision": 41,
      "observedAt": "2026-08-10T10:02:59.000Z",
      "receivedAt": "2026-08-10T10:02:59.020Z",
      "connection": "online",
      "status": "normal",
      "values": {
        "airflow": 640,
        "on": true
      }
    }
  ],
  "alarms": [
    {
      "id": "alarm-temperature-high-17",
      "deviceId": "west-riverside-temperature-sensor-17",
      "severity": "warning",
      "code": "TEMPERATURE_HIGH",
      "message": "Room temperature is above the configured threshold",
      "createdAt": "2026-08-10T10:00:02.000Z",
      "updatedAt": "2026-08-10T10:01:00.000Z",
      "state": "acknowledged",
      "acknowledgedAt": "2026-08-10T10:01:00.000Z",
      "acknowledgedBy": "demo-operator",
      "resolvedAt": null
    }
  ],
  "commands": [
    {
      "id": "command-setpoint-17",
      "clientRequestId": "request-setpoint-17-001",
      "deviceId": "west-riverside-temperature-sensor-17",
      "intent": {
        "kind": "setSetpoint",
        "value": 21.5
      },
      "state": "executed",
      "requestedAt": "2026-08-10T10:02:00.000Z",
      "requestedBy": "demo-operator",
      "confirmation": null,
      "acceptedAt": "2026-08-10T10:02:00.350Z",
      "executedAt": "2026-08-10T10:02:01.550Z",
      "failedAt": null,
      "timedOutAt": null,
      "failure": null,
      "resultTelemetryRevision": 11
    }
  ]
}
```

Здесь `sequence = 1040` означает: snapshot уже включает эффект всех событий этого stream до номера 1040 включительно. После установки snapshot клиент запрашивает события `1041+`.

## Client message: subscribe

Контракт: [`SubscribeMessageSchema`](../src/shared/realtime-contracts.ts#L37).

```json
{
  "type": "subscribe",
  "protocolVersion": "1",
  "buildingId": "west-riverside"
}
```

Вариант с floor scope:

```json
{
  "type": "subscribe",
  "protocolVersion": "1",
  "buildingId": "west-riverside",
  "floorIds": [
    "west-riverside-floor-1",
    "west-riverside-floor-2"
  ]
}
```

Штатный frontend сначала получает snapshot и поэтому отправляет `resume`, а не `subscribe`. Особенность текущей fallback-ветки описана в [карте реализации](realtime-implementation-guide.md#известные-ограничения-и-риски).

## Client message: resume

Контракт: [`ResumeMessageSchema`](../src/shared/realtime-contracts.ts#L44).

```json
{
  "type": "resume",
  "protocolVersion": "1",
  "buildingId": "west-riverside",
  "streamId": "stage-8-9-stream-2026-08-10",
  "afterSequence": 1040
}
```

Смысл: «Отдай все события stream `stage-8-9-stream-2026-08-10` после sequence 1040 и затем подключи меня к live updates».

## Server message: hello

Контракт: [`HelloMessageSchema`](../src/shared/realtime-contracts.ts#L58).

```json
{
  "type": "hello",
  "protocolVersion": "1",
  "connectionId": "connection-c3fb11e8-92a6-4ba0-b241-127ed99c17cc",
  "streamId": "stage-8-9-stream-2026-08-10",
  "latestSequence": 1044,
  "retentionStartSequence": 1,
  "heartbeatIntervalMs": 5000
}
```

| Поле | Значение |
|---|---|
| `connectionId` | ID конкретного WebSocket connection |
| `streamId` | Текущий server stream |
| `latestSequence` | Последний sequence, известный server |
| `retentionStartSequence` | Самый ранний event, ещё доступный для replay |
| `heartbeatIntervalMs` | Заявленный интервал heartbeat |

## event.batch: смешанный пакет

Контракт: [`EventBatchMessageSchema`](../src/shared/realtime-contracts.ts#L68).

```json
{
  "type": "event.batch",
  "streamId": "stage-8-9-stream-2026-08-10",
  "emittedAt": "2026-08-10T10:03:01.000Z",
  "fromSequence": 1041,
  "toSequence": 1044,
  "events": [
    {
      "sequence": 1041,
      "event": {
        "type": "telemetry.patch",
        "payload": {
          "deviceId": "west-riverside-temperature-sensor-17",
          "revision": 12,
          "observedAt": "2026-08-10T10:03:00.900Z",
          "receivedAt": "2026-08-10T10:03:00.950Z",
          "values": {
            "temperature": 22.9
          }
        }
      }
    },
    {
      "sequence": 1042,
      "event": {
        "type": "alarm.upsert",
        "payload": {
          "id": "alarm-temperature-high-17",
          "deviceId": "west-riverside-temperature-sensor-17",
          "severity": "warning",
          "code": "TEMPERATURE_HIGH",
          "message": "Room temperature is above the configured threshold",
          "createdAt": "2026-08-10T10:00:02.000Z",
          "updatedAt": "2026-08-10T10:03:00.960Z",
          "state": "resolved",
          "acknowledgedAt": "2026-08-10T10:01:00.000Z",
          "acknowledgedBy": "demo-operator",
          "resolvedAt": "2026-08-10T10:03:00.960Z"
        }
      }
    },
    {
      "sequence": 1043,
      "event": {
        "type": "command.upsert",
        "payload": {
          "id": "command-air-handler-3-on",
          "clientRequestId": "request-air-handler-3-on-001",
          "deviceId": "west-riverside-air-handler-3",
          "intent": {
            "kind": "setOnOff",
            "value": true
          },
          "state": "pending",
          "requestedAt": "2026-08-10T10:03:00.970Z",
          "requestedBy": "demo-operator",
          "confirmation": null,
          "acceptedAt": null,
          "executedAt": null,
          "failedAt": null,
          "timedOutAt": null,
          "failure": null,
          "resultTelemetryRevision": null
        }
      }
    },
    {
      "sequence": 1044,
      "event": {
        "type": "catalog.invalidated",
        "payload": {
          "catalogVersion": "west-riverside-catalog-v8"
        }
      }
    }
  ]
}
```

Batch constraints:

- `events` содержит от 1 до 5000 элементов;
- первый event имеет `sequence = fromSequence`;
- последний event имеет `sequence = toSequence`;
- каждый следующий event имеет `previous.sequence + 1`;
- все events относятся к одному `streamId` сообщения.

Текущий backend обычно создаёт отдельные telemetry, alarm или command batches. Смешанный batch валиден по контракту и показывает, что client store обязан корректно применять разные типы в одном ordered диапазоне.

## Server message: resync.required

Контракт: [`ResyncRequiredMessageSchema`](../src/shared/realtime-contracts.ts#L91).

```json
{
  "type": "resync.required",
  "streamId": "stage-8-9-stream-2026-08-10",
  "latestSequence": 8000,
  "reason": "cursorExpired",
  "snapshotPath": "/api/v1/state/snapshot?buildingId=west-riverside"
}
```

Допустимые причины:

| Reason | Значение |
|---|---|
| `cursorExpired` | После client cursor больше нет полного непрерывного replay |
| `streamChanged` | Client resume относится к другому `streamId` |
| `serverRestart` | Client sequence находится впереди текущего server sequence |

## Server message: heartbeat

Контракт: [`HeartbeatMessageSchema`](../src/shared/realtime-contracts.ts#L99).

```json
{
  "type": "heartbeat",
  "streamId": "stage-8-9-stream-2026-08-10",
  "latestSequence": 1044,
  "sentAt": "2026-08-10T10:03:05.000Z"
}
```

Heartbeat не содержит events и не меняет client cursor. Он показывает, до какого sequence дошёл server.

## Пример частично пересекающегося batch

Client уже применил `sequence = 1042`, но повторно получил:

```text
batch range: 1041..1044
local cursor: 1042
fresh events: 1043..1044
```

Store отбрасывает events `1041` и `1042`, проверяет, что первый fresh event равен `1043`, применяет остаток и устанавливает cursor `1044`.

## Примеры невалидных данных

### Gap внутри batch

```json
{
  "fromSequence": 10,
  "toSequence": 12,
  "events": [
    { "sequence": 10 },
    { "sequence": 12 }
  ]
}
```

Не пройдёт `EventBatchMessageSchema`: отсутствует `sequence = 11`. Объект сокращён и также не содержит обязательные поля, но последовательность сама по себе уже невалидна.

### Empty telemetry patch

```json
{
  "deviceId": "west-riverside-temperature-sensor-17",
  "revision": 12,
  "observedAt": "2026-08-10T10:04:00.000Z",
  "receivedAt": "2026-08-10T10:04:00.010Z"
}
```

Не пройдёт `DeviceTelemetryPatchSchema`: нет ни `connection`, ни `status`, ни `values`.

### Несогласованный offline status

```json
{
  "deviceId": "west-riverside-temperature-sensor-17",
  "revision": 12,
  "observedAt": "2026-08-10T10:04:00.000Z",
  "receivedAt": "2026-08-10T10:04:00.010Z",
  "connection": "offline",
  "status": "normal",
  "values": {}
}
```

Не пройдёт `DeviceTelemetrySchema`: offline connection требует offline status.

## Где проверяются данные

| Граница | Проверка |
|---|---|
| Backend получает telemetry/alarm/command | соответствующая domain schema |
| Backend создаёт batch | `EventBatchMessageSchema.parse()` |
| WebSocket server получает subscribe/resume | `ClientRealtimeMessageSchema.safeParse()` |
| Browser получает server message | `ServerRealtimeMessageSchema.safeParse()` |
| Store мержит telemetry patch | повторный `DeviceTelemetrySchema.safeParse()` результата |
| Browser получает HTTP snapshot | `StateSnapshotSchema.parse()` |

Generated JSON Schema находится в [`contracts/realtime.schema.json`](../contracts/realtime.schema.json), но source of truth остаются runtime Zod-схемы.
