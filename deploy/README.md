# Портал Greeneration на сервере: установка

Сервер: VPS HostingB2B `146.70.191.40`, Ubuntu 24.04, Docker уже стоит, рядом работают Supabase и n8n.
Адрес портала: **https://b2b.greeneration.ae** (A-запись уже указывает на сервер).

## Как это устроено

```
Google Sheets ─┐                        ┌─ /var/www/greeneration-portal/releases/<время>  (последние 5)
Bitrix24 ──────┼─ update.sh (раз в час) ─┤
GitHub (код) ──┘    только чтение        └─ current → последняя удачная сборка
                                               │
                     portal-web (nginx в Docker, пароль) — 127.0.0.1:8088
                                               │
                     ваш HTTPS-прокси (nginx / Caddy / Traefik) — b2b.greeneration.ae
```

* Сборка идёт на самом сервере: код из публичного репозитория, данные из таблиц и Битрикса **только на чтение**.
* Если синхронизация или сборка упала — сайт остаётся прежним, ничего не ломается.
* Пароль спрашивает маленький контейнер `portal-web`, поэтому годится любой прокси перед ним.
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

Логины: `vifine767@gmail.com`, `levkova@greeneration.ae`, `nikolaychik@greeneration.ae`.
Сменить пароль одному человеку: `sudo bash /opt/greeneration-portal/deploy/make-users.sh levkova@greeneration.ae`.

## Прокси

| Что стоит на сервере | Что сделать |
|---|---|
| nginx на сервере | `deploy/nginx/b2b.greeneration.ae.conf` → `/etc/nginx/sites-available/`, ссылка в `sites-enabled`, `certbot --nginx -d b2b.greeneration.ae`, `nginx -t`, reload |
| Caddy | вставить `deploy/caddy/Caddyfile.snippet` в Caddyfile, reload. Сертификат выпустится сам |
| Traefik (часто вместе с Supabase) | `deploy/traefik/b2b.yml` в папку file provider. Проверить имя certResolver |
| Nginx Proxy Manager | Proxy Host `b2b.greeneration.ae` → `http://<IP сервера>:8088`, Let's Encrypt, Force SSL |

Прокси в Docker не видит `127.0.0.1` хоста — используйте `host.docker.internal` (с `extra_hosts: host-gateway`) или `172.17.0.1`.

## Проверка

```bash
curl -s http://127.0.0.1:8088/healthz                  # ok
curl -sI http://127.0.0.1:8088/ | head -1               # 401 — без пароля не пускает
curl -sI -u vifine767@gmail.com https://b2b.greeneration.ae/ | head -1   # 200 после ввода пароля
systemctl list-timers greeneration-portal-update.timer  # следующий запуск
```

В браузере: https://b2b.greeneration.ae — окно логина браузера, затем портал. Зелёная плашка «Live data · sheets synced …» в шапке показывает время последней синхронизации. Встроенный демо-логин (test/test) на серверной сборке отключён.

## Откат

```bash
ls -1t /var/www/greeneration-portal/releases            # список сборок
sudo -u portal ln -sfn releases/<предыдущая> /var/www/greeneration-portal/current
```
Остановить обновления: `sudo systemctl disable --now greeneration-portal-update.timer`.
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
# then wire b2b.greeneration.ae → 127.0.0.1:8088 in the detected proxy (see table above)
curl -s http://127.0.0.1:8088/healthz && curl -sI http://127.0.0.1:8088/ | head -1   # ok / 401
```
