# TimeSushist Backend

Backend для Telegram Mini App TimeSushist. Обеспечивает аутентификацию через Telegram и безопасный доступ к Supabase.

## 🛠️ Технический стек

- **Node.js** + **Express** — веб-фреймворк
- **TypeScript** — типизированный JavaScript
- **Supabase** — PostgreSQL база данных
- **Telegram Bot API** — аутентификация через Telegram

## 🚀 Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Скопируй `.env.example` в `.env.local`:

```bash
cp .env.example .env.local
```

Заполни переменные:

```
# Telegram Bot Token (получи от @BotFather)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234567890

# Supabase (используй Service Role Key, НЕ anon key!)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGIN=https://timesushist.vercel.app
```

### 3. Запуск в разработке

```bash
npm run dev
```

Сервер запустится на `http://localhost:3000`

### 4. Сборка для продакшена

```bash
npm run build
npm start
```

## 📡 API Эндпоинты

### POST `/api/auth/telegram`

Аутентификация через Telegram WebApp initData.

**Request:**
```json
{
  "initData": "query_id=AAHdF6IQAAAAO0X3QgEswyxa&user=%7B%22id%22%3A123456789..."
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid-123",
    "telegram_id": 123456789,
    "first_name": "Иван",
    "last_name": "Петров",
    "username": "ivanpetrov"
  },
  "token": "eyJzdWIiOiJ1dWlkLTEyMyIsInRlbGVncmFtX2lkIjoxMjM0NTY3ODksImlhdCI6MTY5ODk2MzIwMCwiZXhwIjoxNjk5NTY4MDAwfQ=="
}
```

### GET `/api/user`

Получить данные текущего пользователя.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid-123",
  "telegram_id": 123456789,
  "first_name": "Иван",
  "last_name": "Петров",
  "username": "ivanpetrov",
  "created_at": "2026-11-03T12:00:00Z"
}
```

### GET `/api/health`

Health check.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-11-03T12:51:02.656Z"
}
```

## 🔐 Безопасность

1. **Проверка подписи Telegram** — все запросы проходят валидацию
2. **Service Role Key** — бэкенд использует Service Role Key (с полными правами), а фронтенд получает обычный токен
3. **CORS** — ограничивает доступ только с Vercel
4. **RLS в Supabase** — каждый пользователь видит только свои данные

## 📚 Как работает аутентификация

1. Фронтенд открывается в Telegram Mini App
2. Telegram предоставляет `initData` с данными пользователя и подписью
3. Фронтенд отправляет `initData` на бэкенд (`POST /api/auth/telegram`)
4. Бэкенд проверяет подпись Telegram
5. Бэкенд создаёт/получает пользователя в Supabase
6. Бэкенд возвращает токен для фронтенда
7. Фронтенд сохраняет токен и использует его для всех запросов к Supabase

## 🚀 Развёртывание

### На Vercel

1. Создай Git репозиторий:
```bash
git init
git add .
git commit -m "Initial backend commit"
git remote add origin https://github.com/your-username/timesushist-backend.git
git push -u origin main
```

2. На Vercel:
   - Нажми "New Project" → "Import Git Repository"
   - Выбери репозиторий `timesushist-backend`
   - Добавь Environment Variables из `.env.example`
   - Deploy

### На Railway / Render / Heroku

Аналогично — подключи Git репозиторий и добавь переменные окружения.

## 🔧 Переменные окружения

| Переменная | Описание | Пример |
|-----------|---------|--------|
| `TELEGRAM_BOT_TOKEN` | Токен бота из @BotFather | `123456:ABC-DEF...` |
| `SUPABASE_URL` | URL проекта Supabase | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key из Supabase | `eyJhbGc...` |
| `PORT` | Порт сервера | `3000` |
| `NODE_ENV` | Окружение | `development` или `production` |
| `CORS_ORIGIN` | Разрешённый origin для CORS | `https://timesushist.vercel.app` |

## ⚠️ Важно

- **Service Role Key** — используй этот ключ только на бэкенде, никогда не делись им с фронтендом!
- **anon key** — это публичный ключ для фронтенда (НЕ используется в этом бэкенде)
- **Bot Token** — храни в секретных переменных, никогда не коммить в репозиторий

## 📝 Лицензия

MIT

---

**TimeSushist Backend** — безопасная аутентификация и доступ к данным для Telegram Mini App. 🔐🚀
