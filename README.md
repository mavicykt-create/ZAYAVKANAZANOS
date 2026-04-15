# ZAN 1.1

Полноценный веб-сервис для сотрудников склада/магазина.

## Стек

- Node.js 20+
- Express
- SQLite
- HTML/CSS/vanilla JS
- sharp
- xml2js
- web-push
- PWA (manifest + service worker)

## Запуск локально

```bash
npm install
npm start
```

По умолчанию приложение запускается на `http://localhost:3000`.

## Данные и кэш

- SQLite и кэш изображений хранятся в каталоге `DB_DIR` (по умолчанию `./data`).
- Предсжатые изображения формируются в `/data/image-cache-v5` во время sync каталога.

## Логин по умолчанию

- `admin / 7895123`
- `user / 7895123`

## Деплой на Amvera

Проект содержит `amvera.yml` и запускается командой:

```yaml
run:
  command: node server.js
  containerPort: 3000
  persistenceMount: /data
```

## Основные модули

- Заявка на занос (`/carry`)
- Проверка ценников (`/price-check`)
- Проверка товара (`/product-check`)
- Календарь недели (`/calendar`)
- Админка (`/admin`)

