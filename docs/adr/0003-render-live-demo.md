# ADR-0003: Публичная демонстрация на Render

- Статус: принят
- Дата: 2026-08-07

## Контекст

Демонстрация развёртывается из GitHub, сохраняет viewport-aware backend и WebSocket simulator.
GitHub Pages не выполняет Fastify, а разделение frontend/backend добавило бы CORS и два lifecycle.

## Решение

Развёртывать один Node.js Render Web Service из ветки `main`:

- Fastify выдаёт `/api/*`, Vite production build и WebSocket с одного origin;
- `render.yaml` задаёт build/start/health/environment/deploy trigger;
- deployment начинается только после GitHub CI;
- CI выполняет types, tests, production smoke/build и Chromium E2E;
- публикуются только prepared scenes, без source IFC и локального Python;
- используются только public/synthetic данные и simulated commands.

## Последствия

- Один HTTPS URL не требует CORS.
- WebSocket остаётся в том же process.
- Free instance может иметь cold-start delay.
- Runtime filesystem не является durable state.
- Создание Render service остаётся явным внешним действием по проверенному Blueprint.
