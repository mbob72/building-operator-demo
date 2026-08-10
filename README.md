# MVP операторской системы здания

Проект последовательно реализует 2D-рабочее место оператора для West Riverside Hospital: от
viewport-aware геометрии и контрактов до восьми этажей, каталогов на 18 000/50 000 устройств,
WebGL-рендеринга, ordered realtime, аварий, симулированных команд и полного автоматизированного
acceptance. Этапы 10–11 добавляют воспроизводимый performance benchmark и финализацию MVP.

Текущий статус: объединённые этапы 10–11 завершены и приняты; MVP завершён.

## Запуск

Требуется Node.js 22 или новее.

```bash
npm install
npm run dev
```

Интерфейс: <http://127.0.0.1:5173>. Scene API: <http://127.0.0.1:3001>.

## Проверка

```bash
npm run verify
npm run test:e2e
npm run test:performance
```

Runtime Zod-контракты находятся в `src/shared` и являются source of truth. Независимые от backend
схемы Draft 2020-12 генерируются и проверяются командами:

```bash
npm run contracts:generate
npm run contracts:check
```

Основные документы: [продукт](docs/product.md), [архитектура](docs/architecture.md),
[frontend](docs/frontend-architecture.md), [backend](docs/backend-architecture.md),
[путь данных](docs/frontend-data-consumption.md), [realtime](docs/realtime-data-flow-confluence.md),
[deployment](docs/deployment.md), [performance-отчёт](reports/performance.md) и
[итог этапов 10–11](reports/stage-ten-eleven.md).

## Production-режим

Production server выдаёт собранный frontend и `/api/*` с одного origin:

```bash
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=4174 npm start
```

Откройте <http://127.0.0.1:4174>. `npm run verify` включает production smoke-проверку HTML и
viewport scene API.

## Публичная демонстрация

Демонстрация: <https://building-operator-demo.onrender.com>. Render Blueprint находится в
`render.yaml`, GitHub Actions — в `.github/workflows/ci.yml`. Подробности: [deployment](docs/deployment.md).

## Архитектура сцены

Браузер переводит ортографическую камеру в bbox мировых координат и вместе с zoom отправляет его
в `POST /api/scene/query`. API фильтрует геометрию по bbox и zoom range; после pan/zoom клиент с
debounce заменяет WebGL layers полученным подмножеством.

IFC в браузере не разбирается. Компактные сцены заранее построены из IFC горизонтальным сечением
на высоте 1,2 м и содержат стены, колонны, двери, окна/витражи и лестницы.

## Воспроизведение данных

Исходные IFC занимают около 80 МБ и не хранятся в Git. Для binary wheels IfcOpenShell рекомендуется
Python 3.11.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-data.txt
scripts/data-pipeline/download-west-riverside.sh
npm run data:floors
npm run data:devices
npm run data:stress
npm run data:validate
npm run data:reproducibility
```

Источник — West Riverside Hospital из IFC-Bench/OpenIFC Model Repository, лицензия CC BY 3.0.
Checksum и attribution находятся в `data/source`. Репрезентативный fixture содержит ровно 18 000
устройств с seed `20260807`; это цель воспроизводимости, а не предел продукта. Stress fixture
содержит 50 000 устройств. В обоих каталогах реальные IFC-элементы сохраняют provenance, а
синтетические устройства явно обозначены.
