# Портал Greeneration на сервере: установка

Сервер: VPS HostingB2B `146.70.191.40`, Ubuntu 24.04, Docker уже стоит, рядом работают Supabase и n8n.
Адрес портала: **https://b2b.greeneration.ae** (A-запись уже указывает на сервер).

## Как это устроено

```
Google Sheets ─┐                        ┌─ /var/www/greeneration-portal/releases/<время>  (последние 5)
Bitrix24 ──────┼─ update.sh (раз в час) ─┤
GitHub (код) ──┘    только чтение        └─ current → последняя удачная сборка
                                               │
                     portal-web (nginx в Docker) — 127.0.0.1:8088
                                               │
     Caddy — b2b.greeneration.ae ── /auth/*  → сервис входа greeneration-portal-auth (127.0.0.1:8089)
                                 ── /live/*  → только с сессией (forward_auth → /auth/check), иначе 401
                                 ── остальное → portal-web (страница входа + приложение, без данных)
```

* Сборка идёт на самом сервере: код из публичного репозитория, данные из таблиц и Битрикса **только на чтение**.
* Если синхронизация или сборка упала — сайт остаётся прежним, ничего не ломается.
* Вход — собственная страница портала (email + пароль). Сервис `deploy/auth/portal_auth.py` (Python + bcrypt, пользователь `portal`)
  проверяет пароль по `/etc/greeneration-portal/web-auth/htpasswd` и ставит cookie `gp_session` на 30 дней
  (HttpOnly, Secure, SameSite=Lax, подпись HMAC ключом `PORTAL_SESSION_SECRET` из `/etc/greeneration-portal/env`).
  Подбор пароля ограничен: 8 неудачных попыток за 15 минут с одного IP или на один email → 429.
* Реальные данные (`/live/live.json`, фото пользователей `/live/avatars/`) отдаются только с действующей сессией.
  Страница и JS-бандл открыты, в них только демо-данные.
* В шапке — фото и должность вошедшего из Bitrix24 (синхронизация делает `user.get` по email, только чтение);
  меню аватара: «Профиль в Bitrix24» и «Выйти».
* Почему не всё в Docker: сборке нужен Node и Python раз в час, проще и прозрачнее держать их на сервере (systemd-таймер, логи в journald). В Docker только веб-часть.

## Что нужно заранее

1. SSH-доступ к серверу с правами `sudo`.
2. Ключ Google сервисного аккаунта `claude-sheets@vifine-personal` — файл JSON (у Виктории в `Интеграции\Main`).
3. Адрес вебхука Битрикс24 (только чтение).
4. Пароль для входа в портал — Виктория сообщает администратору лично. **В репозиторий и чаты пароли не кладём.**

## Установка (около 15 минут)

```bash
# 1. Установить всё
curl -fsSL https://raw.githubusercontent.com/vifine/greeneration-b2b-demo/main/deploy/install.sh | sudo bash

# 2. Положить ключи (вставить вручную, chmod 600)
sudo nano /etc/greeneration-portal/env              # строка BITRIX_WEBHOOK=...
sudo nano /etc/greeneration-portal/google-sa.json   # содержимое JSON-ключа Google
sudo chown portal:portal /etc/greeneration-portal/google-sa.json /etc/greeneration-portal/env
sudo chmod 600 /etc/greeneration-portal/google-sa.json /etc/greeneration-portal/env

# 3. Завести пользователей: Victoria Fine, Aleksandra Levkova, Ivan Nikolaychik
sudo bash /opt/greeneration-portal/deploy/make-users.sh

# 4. Собрать сайт с данными
sudo systemctl start greeneration-portal-update
journalctl -u greeneration-portal-update -n 50 --no-pager

# 5. Подключить домен в прокси — install.sh в конце пишет, какой прокси найден и что сделать
```

Логины: `vifine767@gmail.com`, `levkova@greeneration.ae`, `nikolaychik@greeneration.ae` (email без учёта регистра).
Сменить пароль одному человеку: `sudo bash /opt/greeneration-portal/deploy/make-users.sh levkova@greeneration.ae` —
сервис входа перечитывает файл сам, перезапуск не нужен. Права: папка `web-auth` `root:portal 750`, файл `root:portal 640`.
Новый пользователь: добавить email в `make-users.sh` и в `PORTAL_ACCOUNTS` в `scripts/sync_sheets.py` (профиль Bitrix24).
Выйти у всех сразу: заменить `PORTAL_SESSION_SECRET` в env и `sudo systemctl restart greeneration-portal-auth`.

`install.sh` можно запускать повторно: ставит bcrypt, юнит `greeneration-portal-auth`, генерирует секрет (если его нет,
значение не печатается), ставит таймеры обновления и codewatch (пересборка в течение ~2 минут после пуша в main).

## Прокси

| Что стоит на сервере | Что сделать |
|---|---|
| nginx на сервере | `deploy/nginx/b2b.greeneration.ae.conf` → `/etc/nginx/sites-available/`, ссылка в `sites-enabled`, `certbot --nginx -d b2b.greeneration.ae`, `nginx -t`, reload |
| Caddy (так на нашем сервере, `/etc/caddy/Caddyfile`) | блок из `deploy/caddy/Caddyfile.snippet`: бэкап, `caddy validate --config /etc/caddy/Caddyfile`, `systemctl reload caddy` |
| Traefik (часто вместе с Supabase) | `deploy/traefik/b2b.yml` в папку file provider. Проверить имя certResolver |
| Nginx Proxy Manager | Proxy Host `b2b.greeneration.ae` → `http://<IP сервера>:8088`, Let's Encrypt, Force SSL |

Прокси в Docker не видит `127.0.0.1` хоста — используйте `host.docker.internal` (с `extra_hosts: host-gateway`) или `172.17.0.1`.

## Проверка

```bash
curl -s http://127.0.0.1:8088/healthz                  # ok
curl -s http://127.0.0.1:8089/auth/healthz              # {"ok": true} — сервис входа жив
systemctl status greeneration-portal-auth --no-pager
curl -sI https://b2b.greeneration.ae/live/live.json | head -1    # 401 — без входа данных нет
systemctl list-timers 'greeneration-portal-*'           # следующий запуск
```

В браузере: https://b2b.greeneration.ae — страница входа портала, затем портал. Зелёная плашка «Live data · sheets synced …» в шапке показывает время последней синхронизации. Встроенный демо-логин (test/test) на серверной сборке отключён.

## Откат

```bash
ls -1t /var/www/greeneration-portal/releases            # список сборок
sudo -u portal ln -sfn releases/<предыдущая> /var/www/greeneration-portal/current
```
Остановить обновления: `sudo systemctl disable --now greeneration-portal-update.timer greeneration-portal-codewatch.timer`.
Журнал входов: `journalctl -u greeneration-portal-auth -n 50` (пароли и тела запросов не пишутся).
Убрать всё: `docker compose -p greeneration-portal down`, удалить `/opt/greeneration-portal`, `/var/www/greeneration-portal`, `/etc/greeneration-portal`, юниты systemd.

## Координаты клиентов (карта)

Синхронизация (`scripts/geo.py`, вызывается из `sync_sheets.py`) находит точку доставки для каждого клиента: из ссылки Google Maps
в Bitrix24 (короткие ссылки раскрываются), из координат в поле адреса Bitrix24 или по адресу через OpenStreetMap Nominatim
(не больше 1 запроса в секунду и 150 за прогон). Bitrix24 только читается.

Результаты кэшируются в `/opt/greeneration-portal/.geo-cache.json` (путь задаёт `update.sh` через `GEO_CACHE`; можно переопределить
в `/etc/greeneration-portal/env`). Файл пишет пользователь `portal`, он в `.gitignore` и **никогда не коммитится** —
в нём адреса клиентов. Если файл удалить, координаты просто заново соберутся за несколько часовых прогонов.
Покрытие видно в журнале: строка `Geo: N of M Bitrix clients located …` в `journalctl -u greeneration-portal-update`.

## После переезда

Отключить публичную версию на GitHub Pages: `deploy/disable-github-pages.md`.
Резервное копирование (Acronis) включить у HostingB2B до появления рабочих данных в Supabase.

---

## Command list (English)

```bash
curl -fsSL https://raw.githubusercontent.com/vifine/greeneration-b2b-demo/main/deploy/install.sh | sudo bash
sudo nano /etc/greeneration-portal/env                 # BITRIX_WEBHOOK=
sudo nano /etc/greeneration-portal/google-sa.json      # Google SA key JSON
sudo chown portal:portal /etc/greeneration-portal/{env,google-sa.json} && sudo chmod 600 /etc/greeneration-portal/{env,google-sa.json}
sudo bash /opt/greeneration-portal/deploy/make-users.sh
sudo systemctl start greeneration-portal-update && journalctl -u greeneration-portal-update -n 50 --no-pager
# then wire b2b.greeneration.ae in Caddy: /auth/* → 8089, /live/* forward_auth /auth/check + 8088, rest → 8088
curl -s http://127.0.0.1:8089/auth/healthz && curl -sI https://b2b.greeneration.ae/live/live.json | head -1   # ok / 401
```
