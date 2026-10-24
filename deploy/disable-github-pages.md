# Отключить публичную версию green-b2b.vifine.tech

Делать **после** того, как https://b2b.greeneration.ae открывается с паролем и показывает свежие данные.

1. GitHub → репозиторий `vifine/greeneration-b2b-demo` → **Settings → Pages** → **Unpublish site** (или Source: None).
2. В репозитории удалить файл `public/CNAME` и в `.github/workflows/pages.yml` убрать расписание (`schedule`) и шаги выкладки — или удалить workflow целиком. Сборку на сервере это не затрагивает.
3. В DNS домена `vifine.tech` удалить запись `green-b2b` (CNAME на `vifine.github.io`).
4. Проверить: https://green-b2b.vifine.tech больше не открывается, `https://vifine.github.io/greeneration-b2b-demo/` отдаёт 404.
5. Workload Identity Federation в Google Cloud (пул `github`) можно удалить, если GitHub Actions больше не читает таблицы:
   `gcloud iam workload-identity-pools delete github --location=global --project=vifine-personal`.
6. Таблицу «Portal keys — Greeneration» на Google Диске удалить: вебхук теперь хранится только на сервере в `/etc/greeneration-portal/env`.

Репозиторий остаётся: из него сервер забирает код.
