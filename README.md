# ZAN 1.1

Рабочий mobile-first веб-сервис для сотрудников склада/магазина.

## Что внутри
- Node.js 20 + Express
- SQLite без Prisma
- HTML/CSS/vanilla JS
- PWA: manifest + service worker + offline shell
- Предсжатие картинок через sharp в `/data/image-cache-v5`
- Парсинг YML через `xml2js`
- Подготовка под Web Push
- Готово под GitHub + Amvera

## Структура
- `src/app.js` — запуск сервера
- `src/routes/*` — REST API по модулям
- `src/services/*` — бизнес-логика
- `src/db/*` — SQLite и инициализация
- `public/*` — клиент и PWA
- `data/` — БД и кеш картинок

## Запуск локально
```bash
npm install
npm run seed
npm start
```

Открыть: `http://localhost:3000`

## Пользователи по умолчанию
- `admin / 7895123`
- `user / 7895123`

## Основные API
- `POST /api/auth/login`
- `GET /api/catalog/categories`
- `GET /api/carry/category/:categoryId`
- `POST /api/carry/change`
- `GET /api/price-check/pages`
- `POST /api/price-check/pages/open`
- `GET /api/product-check`
- `GET /api/calendar`
- `GET /api/admin/overview`

## Переменные окружения
- `PORT=3000`
- `DATA_DIR=/data`
- `DB_PATH=/data/zan.sqlite`
- `IMAGE_CACHE_DIR=/data/image-cache-v5`
- `SYNC_INTERVAL_MS=3600000`
- `CATALOG_URL=https://milku.ru/site1/export-yandex-YML/`
- `WEB_PUSH_PUBLIC_KEY=...`
- `WEB_PUSH_PRIVATE_KEY=...`
- `WEB_PUSH_SUBJECT=mailto:admin@example.com`

## Amvera
Файл `amvera.yml` уже добавлен.

## Замечания
- Синхронизация запускается по расписанию раз в час и вручную из админки.
- Картинки сжимаются заранее при sync, а не при первом открытии категории.
- Блокировки убраны из заноса, оставлены только для страниц модуля проверки ценников.
- Для production можно дополнительно вынести push-ключи и cookie security в env.
