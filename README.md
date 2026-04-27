# Tanchiki Online

Браузерные 2D-танчики на Vercel + Supabase Realtime.

## Запуск

```bash
npm install
npm run dev
```

## Supabase

1. Создай проект Supabase.
2. Выполни SQL из `supabase/schema.sql`.
3. Вставь свои ключи в `.env`.

## Vercel

Проект можно деплоить как обычный Vite React app.

## Управление

- WASD / стрелки — движение
- Мышь / тач — прицел
- ЛКМ / кнопка Fire — выстрел

## Что уже есть

- комнаты по коду;
- синхронизация игроков через Supabase Realtime;
- Canvas-арена;
- движение танка;
- поворот башни;
- локальные выстрелы;
- счёт игроков в комнате.
