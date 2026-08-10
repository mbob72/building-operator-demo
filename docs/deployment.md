# Развёртывание публичной демонстрации

## Целевая схема

Демонстрация работает как один Render Web Service, связанный с веткой GitHub `main`:

```text
Browser
  -> Render HTTPS origin
       -> Fastify API (/api/*)
       -> Vite production files (/*)
       -> WebSocket simulator (/api/v1/realtime)
```

Сервис описан в `render.yaml`; GitHub Actions должны пройти до deployment. Публичный URL:
<https://building-operator-demo.onrender.com>.

## Локальная production-проверка

```bash
npm ci
npm run verify
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=4174 npm start
```

После запуска откройте <http://127.0.0.1:4174>.

## Настройка GitHub и Render

1. Использовать публичный repository `mbob72/building-operator-demo`.
2. Убедиться, что jobs `verify` и `e2e` проходят для `main`.
3. В Render создать Blueprint, подключить repository и выбрать корневой `render.yaml`.
4. Проверить service name/plan и дождаться GitHub checks.
5. Проверить `/api/health`, `/api/floors`, `/api/scene/query`, snapshot, realtime, commands и UI.

Для текущей демонстрации secret environment variables не нужны.

## Безопасность демонстрации

- Публиковать только открытые, атрибутированные или synthetic данные.
- Никогда не добавлять credentials физических KNX/DALI/Modbus/BACnet и других систем.
- Оставлять выполнение команд симулированным.
- Сохранять видимую метку `OPERATOR DEMO`, пока доступны simulated controls.
- Считать filesystem Render и in-memory состояние симулятора временными.

## Эксплуатационные ограничения

- Free service может задерживать cold start после простоя.
- Redeploy/restart разрывает WebSocket; client должен reconnect и получить свежий snapshot.
- Исходные IFC намеренно не входят в deployment.
- Production authentication, persistent storage и настоящий protocol adapter в MVP отсутствуют.
