# SubManager

SubManager — веб-панель для создания и управления VPN-подписками. Приложение предоставляет административную панель, публичные страницы подписок и API выдачи конфигураций VPN-клиентам.

Репозиторий: <https://github.com/LarsGravesen-invilink/submanager>

## Возможности

- создание, редактирование, приостановка и удаление подписок;
- ручное добавление VPN-конфигураций;
- импорт конфигураций из удалённых источников;
- поддержка VLESS, VMess, Trojan, Shadowsocks и других текстовых URI;
- автоматическое обновление удалённых источников;
- настройка срока действия подписки и интервала обновления клиента;
- публичная страница подписки с таймером, QR-кодом и копированием ссылки;
- выбор VPN-клиента: Incy, V2Ray, Hiddify, Happ и Shadowrocket;
- дополнительные конфигурации на публичной странице;
- журнал обращений с IP-адресом, типом устройства и временем;
- сообщения о проблемах, привязанные к конкретной подписке;
- экспорт и импорт резервной копии через панель управления;
- PostgreSQL, Nginx, HTTPS через Certbot, systemd и watchdog.

## Требования

Установочные скрипты предназначены для Ubuntu VPS и требуют прав `root`.

Необходимо:

- Ubuntu-сервер;
- домен с IPv4 A-записью, указывающей на IP сервера;
- доступные снаружи порты `80` и `443` либо выбранный нестандартный порт;
- доступ к GitHub для загрузки установщика и готового архива.

Установщик автоматически устанавливает недостающие компоненты:

- Node.js 20;
- PostgreSQL и `postgresql-contrib`;
- Nginx;
- Certbot и модуль Certbot для Nginx;
- `curl`, `git`, `dnsutils`, `ntp`.

## Установка готовой сборки

### Способ 1: загрузка установщика

```bash
curl -fsSL https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/install.sh -o /tmp/submanager-install.sh
sudo bash /tmp/submanager-install.sh
```

### Способ 2: через Git

```bash
git clone https://github.com/LarsGravesen-invilink/submanager.git
cd submanager
sudo bash install.sh
```

Установщик запросит домен панели и внешний порт.

После запуска установщик:

1. проверяет A-запись домена;
2. устанавливает системные зависимости;
3. настраивает PostgreSQL;
4. загружает готовую standalone-сборку;
5. создаёт таблицы базы данных;
6. настраивает автозапуск и контроль работоспособности сервиса;
7. добавляет автоматическое обновление удалённых источников;
8. настраивает Nginx и пытается получить SSL-сертификат через Certbot.

> **Важно:** повторный запуск `install.sh` выполняет чистую переустановку и удаляет существующие данные SubManager. Перед повторной установкой создайте резервную копию через панель управления.

## Установка из локальных исходников

Для сборки текущего содержимого клонированного репозитория используется отдельный скрипт:

```bash
git clone https://github.com/LarsGravesen-invilink/submanager.git
cd submanager
sudo bash install-local.sh
```

`install-local.sh` устанавливает npm-зависимости, применяет схему Drizzle и выполняет production-сборку Next.js.

Основной `install.sh` исходный код не собирает: он загружает готовый архив релиза.

## Первый вход

Откройте домен, указанный при установке. Если в базе ещё нет администратора, первая успешная авторизация создаёт администратора с введёнными логином и паролем.

## Обновление

Перед обновлением рекомендуется экспортировать резервную копию в разделе настроек панели.

Загрузите актуальный `update.sh` из репозитория и запустите его:

```bash
curl -fsSL https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/update.sh -o /tmp/submanager-update.sh
sudo bash /tmp/submanager-update.sh
```

Либо из клонированного репозитория:

```bash
cd submanager
git pull
sudo bash update.sh
```

Скрипт обновления сохраняет конфигурацию, заменяет файлы приложения, применяет изменения базы данных, перезапускает сервис и проверяет его работоспособность.

## Резервное копирование

Экспорт и импорт доступны в настройках административной панели.

Экспорт включает:

- настройки;
- подписки;
- ключи;
- удалённые источники;
- журналы обращений;
- сообщения о проблемах.

## Управление сервисом

```bash
# Статус приложения
sudo systemctl status submanager

# Перезапуск приложения
sudo systemctl restart submanager

# Остановка приложения
sudo systemctl stop submanager

# Запуск приложения
sudo systemctl start submanager

# Логи приложения в реальном времени
sudo journalctl -u submanager -f

# Статус watchdog-таймера
sudo systemctl status submanager-watchdog.timer
```

## Удаление

> **Внимание:** удаление безвозвратно удалит сервис, все подписки, ключи, учётные записи, сообщения, журналы и настройки. Перед удалением создайте резервную копию через панель управления.

Удаление одной командой:

```bash
curl -fsSL https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/uninstall.sh -o /tmp/submanager-uninstall.sh && sudo bash /tmp/submanager-uninstall.sh
```

Скрипт покажет полный список удаляемых компонентов и потребует явного подтверждения словом `УДАЛИТЬ`. Системные пакеты, которые могут использоваться другими приложениями, не удаляются.

## Разработка

```bash
npm install
npm run dev
```

Доступные npm-команды:

```bash
npm run dev       # Next.js development server
npm run build     # production-сборка
npm start         # запуск стандартного Next.js server
npm run lint      # ESLint
npm run typecheck # TypeScript без генерации файлов
```

Для локального запуска необходимо настроенное подключение PostgreSQL через переменную `DATABASE_URL`. Для production-развёртывания используется standalone-сборка Next.js и файл `server.js`.

## Технологии

- Next.js 16;
- React 19;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Tailwind CSS;
- Nginx;
- systemd;
- Certbot.
