# Размещение Trainy

Клиент — статическая PWA на GitHub Pages. Аккаунты, тренировки и AI работают через Supabase.

## Supabase

1. Выполнить миграции из `supabase/migrations/` по порядку в SQL Editor.
2. Указать Project URL и publishable key в `supabase-config.js`.
3. Добавить production URL в Authentication → URL Configuration.
4. Добавить секрет `OPENAI_API_KEY` для Edge Functions.
5. Задеплоить функцию `supabase/functions/ai-coach`.

Никогда не помещать `service_role` и `OPENAI_API_KEY` в клиентские файлы.

## Клиент

GitHub Actions публикует статические файлы на GitHub Pages. После изменений, видимых в PWA, нужно синхронно обновить:

- query-версии в `training-tracker.html`;
- `APP_VERSION`;
- `CACHE_NAME` и список ресурсов в `sw.js`;
- ссылки в `index.html`, `cache-reset.html` и `manifest.webmanifest`.
