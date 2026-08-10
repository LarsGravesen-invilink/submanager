#!/bin/bash
set -e

# =====================================================
# SubManager — Локальный установщик для Ubuntu VPS
# Запускать из директории с исходным кодом проекта
# =====================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/submanager"
SERVICE_NAME="submanager"
DB_NAME="submanager_db"
DB_USER="submanager"
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
APP_PORT=3000

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}   ${BOLD}SubManager — Менеджер VPN подписок${NC}         ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   ${BLUE}Локальная установка на Ubuntu VPS${NC}         ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Ошибка: Запустите установщик от root (sudo bash install-local.sh)${NC}"
  exit 1
fi

# Проверка наличия package.json
if [ ! -f "$SCRIPT_DIR/package.json" ]; then
  echo -e "${RED}Ошибка: Запустите скрипт из директории с исходным кодом проекта${NC}"
  echo -e "Файл package.json не найден в: $SCRIPT_DIR"
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
    echo ""
    echo -ne "  ${YELLOW}Продолжить? [y/N]: ${NC}"
    read -r CONTINUE
    if [[ "$CONTINUE" =~ ^[Yy]$ ]]; then
      break
    fi
  fi
done

echo ""
echo -e "${BLUE}Панель будет доступна по адресу: https://${DOMAIN}${NC}"
echo -e "${BLUE}Начинаем установку...${NC}"
echo ""

# ===================== Зависимости =====================
echo -e "${CYAN}[1/8]${NC} Обновление системы и установка зависимостей..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git build-essential dnsutils nginx certbot python3-certbot-nginx > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Системные пакеты установлены"

# ===================== Node.js =====================
echo -e "${CYAN}[2/8]${NC} Установка Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v), npm $(npm -v)"

# ===================== PostgreSQL =====================
echo -e "${CYAN}[3/8]${NC} Установка и настройка PostgreSQL..."
if ! command -v psql &> /dev/null; then
  apt-get install -y -qq postgresql postgresql-contrib > /dev/null 2>&1
fi
systemctl enable postgresql > /dev/null 2>&1
systemctl start postgresql

sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" > /dev/null 2>&1

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null 2>&1

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} PostgreSQL настроен"

# ===================== Копирование =====================
echo -e "${CYAN}[4/8]${NC} Копирование файлов проекта..."
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  mkdir -p "$INSTALL_DIR"
  cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
fi
cd "$INSTALL_DIR"
echo -e "  ${GREEN}✓${NC} Файлы скопированы"

# ===================== Конфигурация =====================
echo -e "${CYAN}[5/8]${NC} Настройка конфигурации..."
cat > "$INSTALL_DIR/.env" << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
PORT=${APP_PORT}
EOF
echo -e "  ${GREEN}✓${NC} .env создан"

# ===================== Сборка =====================
echo -e "${CYAN}[6/8]${NC} Установка зависимостей и сборка (2-5 минут)..."

echo -e "  Установка npm пакетов..."
npm ci --silent 2>/dev/null || npm install --silent
echo -e "  ${GREEN}✓${NC} Пакеты установлены"

echo -e "  Применение схемы базы данных..."
npx drizzle-kit push --force 2>/dev/null || npx drizzle-kit push
echo -e "  ${GREEN}✓${NC} Схема БД применена"

echo -e "  Сборка приложения..."
npm run build
echo -e "  ${GREEN}✓${NC} Приложение собрано"

# ===================== Systemd =====================
echo -e "${CYAN}[7/8]${NC} Настройка автозапуска..."

# Копируем static файлы для standalone режима
mkdir -p "$INSTALL_DIR/.next/standalone/.next"
cp -r "$INSTALL_DIR/.next/static" "$INSTALL_DIR/.next/standalone/.next/" 2>/dev/null || true
mkdir -p "$INSTALL_DIR/.next/standalone/public"
cp -r "$INSTALL_DIR/public"/* "$INSTALL_DIR/.next/standalone/public/" 2>/dev/null || true

cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SubManager - VPN Subscription Manager
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}/.next/standalone
Environment=NODE_ENV=production
Environment=PORT=${APP_PORT}
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=$(which node) ${INSTALL_DIR}/.next/standalone/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Cron для обновления подписок
(crontab -l 2>/dev/null | grep -v "/api/cron/update"; echo "*/5 * * * * curl -s http://127.0.0.1:${APP_PORT}/api/cron/update > /dev/null 2>&1") | crontab -

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl restart "$SERVICE_NAME"

sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo -e "  ${GREEN}✓${NC} Сервис запущен"
else
  echo -e "  ${YELLOW}⚠${NC} Проверяем статус..."
  systemctl status "$SERVICE_NAME" --no-pager || true
fi

# ===================== Nginx + SSL =====================
echo -e "${CYAN}[8/8]${NC} Настройка Nginx и SSL..."

systemctl stop nginx 2>/dev/null || true

echo -e "  Получение SSL сертификата..."
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email 2>/dev/null && {
  SSL_OBTAINED=true
  echo -e "  ${GREEN}✓${NC} SSL сертификат получен"
} || {
  SSL_OBTAINED=false
  echo -e "  ${YELLOW}⚠${NC} SSL не получен"
}

if [ "$SSL_OBTAINED" = true ]; then
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
        proxy_pass http://127.0.0.1:${APP_PORT};
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

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t > /dev/null 2>&1 && systemctl start nginx
echo -e "  ${GREEN}✓${NC} Nginx настроен"

# ===================== Готово =====================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}✓ SubManager успешно установлен!${NC}                    ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
if [ "$SSL_OBTAINED" = true ]; then
  echo -e "  ${BOLD}🌐 Панель:${NC}  https://${DOMAIN}"
else
  echo -e "  ${BOLD}🌐 Панель:${NC}  http://${DOMAIN}"
fi
echo ""
echo -e "  ${YELLOW}⚡ Первый вход создаст администратора (пароль от 6 символов)${NC}"
echo ""
echo -e "  ${BLUE}Команды:${NC}"
echo -e "    systemctl status ${SERVICE_NAME}     — статус"
echo -e "    systemctl restart ${SERVICE_NAME}    — перезапуск"
echo -e "    journalctl -u ${SERVICE_NAME} -f     — логи"
echo ""
