#!/bin/bash
set -e

# =====================================================
# SubManager — Установщик готовой сборки для Ubuntu VPS
# Репозиторий: github.com/LarsGravesen-invilink/submanager
# =====================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

DIST_URL="https://github.com/LarsGravesen-invilink/submanager/releases/download/1.0.0/submanager-dist.tar.gz"
DBPKG_URL="https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/dist-package.json"
DRIZZLE_CFG_URL="https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/drizzle.config.json"
SCHEMA_URL="https://raw.githubusercontent.com/LarsGravesen-invilink/submanager/main/src/db/schema.ts"

INSTALL_DIR="/opt/submanager"
SERVICE_NAME="submanager"
DB_NAME="submanager_db"
DB_USER="submanager"
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
INTERNAL_PORT=3000

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}   ${BOLD}SubManager — Менеджер VPN подписок${NC}         ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   ${BLUE}Установка готовой сборки на Ubuntu${NC}        ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Ошибка: Запустите установщик от root (sudo bash install.sh)${NC}"
  exit 1
fi

# ===================== Ввод домена =====================
while true; do
  echo -ne "${BOLD}Введите домен (например: sub.example.com): ${NC}"
  read -r DOMAIN

  if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Домен не может быть пустым${NC}"
    continue
  fi

  echo -ne "${BLUE}Проверяем A-запись для ${DOMAIN}...${NC} "

  SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || curl -s4 icanhazip.com 2>/dev/null || echo "")
  DOMAIN_IP=$(dig +short "$DOMAIN" A 2>/dev/null | head -1)

  if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}Не удалось определить IP сервера. Продолжаем...${NC}"
    break
  fi

  if [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
    echo -e "${GREEN}✓ A-запись корректна (${SERVER_IP})${NC}"
    break
  else
    echo -e "${RED}✗ A-запись не найдена или не совпадает${NC}"
    echo -e "  IP сервера: ${GREEN}${SERVER_IP}${NC}"
    echo -e "  A-запись:   ${RED}${DOMAIN_IP:-не найдена}${NC}"
    echo -e "  Создайте A-запись: ${BOLD}${DOMAIN} → ${SERVER_IP}${NC}"
    echo ""
  fi
done

# ===================== Нестандартный порт =====================
NGINX_PORT=443
USE_CUSTOM_PORT=false

echo ""
echo -ne "${BOLD}Использовать нестандартный внешний порт? [y/N]: ${NC}"
read -r CUSTOM_PORT_ANSWER

if [[ "$CUSTOM_PORT_ANSWER" =~ ^[Yy]$ ]]; then
  echo -ne "${BOLD}Введите внешний порт (например: 8443): ${NC}"
  read -r CUSTOM_PORT
  if [ -n "$CUSTOM_PORT" ] && [ "$CUSTOM_PORT" -gt 0 ] 2>/dev/null; then
    NGINX_PORT=$CUSTOM_PORT
    USE_CUSTOM_PORT=true
  fi
fi

echo ""
if [ "$USE_CUSTOM_PORT" = true ]; then
  echo -e "${BLUE}Панель будет доступна: https://${DOMAIN}:${NGINX_PORT}${NC}"
else
  echo -e "${BLUE}Панель будет доступна: https://${DOMAIN}${NC}"
fi
echo -e "${BLUE}Начинаем установку...${NC}"
echo ""

# ===================== Зависимости =====================
echo -e "${CYAN}[1/7]${NC} Установка системных зависимостей..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git dnsutils nginx certbot python3-certbot-nginx > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Системные пакеты установлены"

# ===================== Node.js =====================
echo -e "${CYAN}[2/7]${NC} Установка Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

# ===================== PostgreSQL =====================
echo -e "${CYAN}[3/7]${NC} Настройка PostgreSQL..."
if ! command -v psql &> /dev/null; then
  apt-get install -y -qq postgresql postgresql-contrib > /dev/null 2>&1
fi
systemctl enable postgresql > /dev/null 2>&1
systemctl start postgresql

# Удаляем старую БД и пользователя если существуют (чистая переустановка)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};" > /dev/null 2>&1
sudo -u postgres psql -c "DROP USER IF EXISTS ${DB_USER};" > /dev/null 2>&1

# Создаем заново
sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" > /dev/null 2>&1
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null 2>&1
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} PostgreSQL настроен"

# ===================== Скачивание сборки =====================
echo -e "${CYAN}[4/7]${NC} Скачивание готовой сборки..."
rm -rf "$INSTALL_DIR" 2>/dev/null || true
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Скачиваем файл отдельно (GitHub требует follow redirects)
echo -e "  Загрузка архива (~18 MB)..."
curl -fSL --retry 3 --retry-delay 2 -o /tmp/submanager-dist.tar.gz "$DIST_URL" || {
  echo -e "  ${RED}✗ Ошибка загрузки. Проверьте URL:${NC}"
  echo -e "  $DIST_URL"
  exit 1
}

# Проверяем что это gzip
if ! gzip -t /tmp/submanager-dist.tar.gz 2>/dev/null; then
  echo -e "  ${RED}✗ Скачанный файл повреждён или не является архивом${NC}"
  echo -e "  Содержимое файла:"
  head -c 200 /tmp/submanager-dist.tar.gz
  rm -f /tmp/submanager-dist.tar.gz
  exit 1
fi

# Распаковываем
tar -xzf /tmp/submanager-dist.tar.gz -C "$INSTALL_DIR"
rm -f /tmp/submanager-dist.tar.gz
echo -e "  ${GREEN}✓${NC} Сборка распакована"

# ===================== Конфигурация и схема БД =====================
echo -e "${CYAN}[5/7]${NC} Настройка базы данных..."

cat > "$INSTALL_DIR/.env" << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
PORT=${INTERNAL_PORT}
EOF

# Создаём таблицы напрямую через SQL
PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -q << 'EOSQL'
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT NOT NULL,
    attempted_at TIMESTAMP DEFAULT NOW() NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMP,
    auto_update_minutes INTEGER NOT NULL DEFAULT 60,
    client_update_hours INTEGER NOT NULL DEFAULT 24,
    unique_hits INTEGER NOT NULL DEFAULT 0,
    total_hits INTEGER NOT NULL DEFAULT 0,
    logo_url TEXT DEFAULT '',
    logo_size TEXT DEFAULT 'medium',
    page_title TEXT DEFAULT '',
    show_expiry BOOLEAN NOT NULL DEFAULT TRUE,
    show_upload BOOLEAN NOT NULL DEFAULT FALSE,
    show_download BOOLEAN NOT NULL DEFAULT FALSE,
    show_total BOOLEAN NOT NULL DEFAULT FALSE,
    total_traffic_gb INTEGER NOT NULL DEFAULT 0,
    used_upload_gb INTEGER NOT NULL DEFAULT 0,
    used_download_gb INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscription_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    key_value TEXT NOT NULL,
    custom_name TEXT DEFAULT '',
    original_name TEXT DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'manual',
    source_url TEXT DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    key_fingerprint TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS remote_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    last_fetched_at TIMESTAMP,
    last_status TEXT DEFAULT 'pending',
    selected_keys JSONB DEFAULT '[]',
    key_names JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    user_agent TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    device_type TEXT DEFAULT '',
    accessed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
EOSQL

# Миграция: добавляем новые столбцы если их нет (для обновления)
PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -q 2>/dev/null << 'EOMIGRATE'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS logo_size TEXT DEFAULT 'medium';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_expiry BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_upload BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_download BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_total BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_traffic_gb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_upload_gb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_download_gb INTEGER NOT NULL DEFAULT 0;
EOMIGRATE

echo -e "  ${GREEN}✓${NC} База данных настроена"

# ===================== Systemd =====================
echo -e "${CYAN}[6/7]${NC} Настройка автозапуска..."

NODE_PATH=$(which node)

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SubManager - VPN Subscription Manager
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
Environment=PORT=${INTERNAL_PORT}
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=${INSTALL_DIR}/.env

# Ждём доступности PostgreSQL перед запуском
ExecStartPre=/bin/bash -c 'for i in \$(seq 1 30); do pg_isready -q && exit 0; sleep 1; done; exit 1'

ExecStart=${NODE_PATH} ${INSTALL_DIR}/server.js

# Автоперезапуск при любом падении
Restart=always
RestartSec=3

# Не ограничивать количество перезапусков
StartLimitIntervalSec=0

# Корректное завершение
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

# Watchdog — проверка здоровья каждую минуту, перезапуск если упал
cat > "/etc/systemd/system/${SERVICE_NAME}-watchdog.service" << EOF
[Unit]
Description=SubManager Watchdog
After=${SERVICE_NAME}.service

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'curl -sf http://127.0.0.1:${INTERNAL_PORT}/api/health > /dev/null 2>&1 || systemctl restart ${SERVICE_NAME}'
EOF

cat > "/etc/systemd/system/${SERVICE_NAME}-watchdog.timer" << EOF
[Unit]
Description=SubManager Watchdog Timer

[Timer]
OnBootSec=60
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
EOF

# Cron для обновления подписок из источников
crontab -l 2>/dev/null | grep -v "/api/cron/update" | crontab - 2>/dev/null || true
(crontab -l 2>/dev/null; echo "*/5 * * * * curl -sf http://127.0.0.1:${INTERNAL_PORT}/api/cron/update > /dev/null 2>&1") | crontab -

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl enable "${SERVICE_NAME}-watchdog.timer" > /dev/null 2>&1
systemctl restart "$SERVICE_NAME"
systemctl start "${SERVICE_NAME}-watchdog.timer"

# Ждём запуска с проверкой
echo -ne "  Запуск сервиса"
STARTED=false
for i in $(seq 1 10); do
  sleep 1
  echo -ne "."
  if curl -sf http://127.0.0.1:${INTERNAL_PORT}/api/health > /dev/null 2>&1; then
    STARTED=true
    break
  fi
done
echo ""

if [ "$STARTED" = true ]; then
  echo -e "  ${GREEN}✓${NC} Сервис запущен и отвечает"
  echo -e "  ${GREEN}✓${NC} Watchdog активен (проверка каждые 60 сек)"
else
  echo -e "  ${RED}✗${NC} Сервис не отвечает. Логи:"
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager
  echo ""
  echo -e "  ${YELLOW}Попробуйте запустить вручную:${NC}"
  echo -e "  cd ${INSTALL_DIR} && node server.js"
  echo ""
fi

# ===================== Nginx + SSL =====================
echo -e "${CYAN}[7/7]${NC} Настройка Nginx и SSL..."

systemctl stop nginx 2>/dev/null || true

echo -e "  Получение SSL сертификата..."
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null && {
  SSL_OBTAINED=true
  echo -e "  ${GREEN}✓${NC} SSL сертификат получен"
} || {
  SSL_OBTAINED=false
  echo -e "  ${YELLOW}⚠${NC} SSL не получен автоматически"
}

# Nginx конфиг
if [ "$SSL_OBTAINED" = true ]; then
  if [ "$USE_CUSTOM_PORT" = true ]; then
    cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen ${NGINX_PORT} ssl http2;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
EOF
  else
    cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_buffering off;
    }
}
EOF
  fi
else
  if [ "$USE_CUSTOM_PORT" = true ]; then
    cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen ${NGINX_PORT};
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
  else
    cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:${INTERNAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF
  fi
fi

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

if nginx -t > /dev/null 2>&1; then
  systemctl start nginx
  systemctl enable nginx > /dev/null 2>&1
  echo -e "  ${GREEN}✓${NC} Nginx запущен"
else
  echo -e "  ${RED}✗${NC} Ошибка Nginx:"
  nginx -t
fi

# ===================== Готово =====================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}✓ SubManager успешно установлен!${NC}                    ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
if [ "$SSL_OBTAINED" = true ]; then
  if [ "$USE_CUSTOM_PORT" = true ]; then
    echo -e "  ${BOLD}🌐 Панель:${NC}  https://${DOMAIN}:${NGINX_PORT}"
  else
    echo -e "  ${BOLD}🌐 Панель:${NC}  https://${DOMAIN}"
  fi
else
  if [ "$USE_CUSTOM_PORT" = true ]; then
    echo -e "  ${BOLD}🌐 Панель:${NC}  http://${DOMAIN}:${NGINX_PORT}"
  else
    echo -e "  ${BOLD}🌐 Панель:${NC}  http://${DOMAIN}"
  fi
  echo -e "  ${YELLOW}Для SSL: certbot --nginx -d ${DOMAIN}${NC}"
fi
echo ""
echo -e "  ${YELLOW}⚡ Первый вход создаст администратора (пароль от 6 символов)${NC}"
echo ""
echo -e "  ${BLUE}Управление:${NC}"
echo -e "    systemctl status ${SERVICE_NAME}"
echo -e "    systemctl restart ${SERVICE_NAME}"
echo -e "    journalctl -u ${SERVICE_NAME} -f"
echo ""
