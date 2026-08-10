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

# Проверка Ubuntu
if ! grep -qi ubuntu /etc/os-release 2>/dev/null; then
  echo -e "${YELLOW}Предупреждение: Рекомендуется Ubuntu 22.04/24.04${NC}"
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
    echo -ne "  ${YELLOW}Продолжить всё равно? [y/N]: ${NC}"
    read -r CONTINUE
    if [[ "$CONTINUE" =~ ^[Yy]$ ]]; then
      break
    fi
  fi
done

# ===================== Порт =====================
echo -ne "${BOLD}Порт приложения (по умолчанию 3000): ${NC}"
read -r APP_PORT
APP_PORT=${APP_PORT:-3000}

echo ""
echo -e "${BLUE}Начинаем установку...${NC}"
echo ""

# ===================== Зависимости =====================
echo -e "${CYAN}[1/8]${NC} Обновление системы и установка зависимостей..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git build-essential dnsutils nginx certbot python3-certbot-nginx > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} Системные зависимости установлены"

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

# Создание пользователя и БД
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';" > /dev/null 2>&1

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null 2>&1

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};" > /dev/null 2>&1
echo -e "  ${GREEN}✓${NC} PostgreSQL настроен"

# ===================== Копирование файлов =====================
echo -e "${CYAN}[4/8]${NC} Копирование файлов проекта..."
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  mkdir -p "$INSTALL_DIR"
  cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
  cp -r "$SCRIPT_DIR"/.env.example "$INSTALL_DIR/" 2>/dev/null || true
fi
cd "$INSTALL_DIR"
echo -e "  ${GREEN}✓${NC} Файлы скопированы в ${INSTALL_DIR}"

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
echo -e "${CYAN}[6/8]${NC} Установка зависимостей и сборка (это займёт 1-3 минуты)..."
npm ci --silent 2>/dev/null || npm install --silent
echo -e "  ${GREEN}✓${NC} npm пакеты установлены"

echo -e "  Применяем схему базы данных..."
npx drizzle-kit push --force 2>/dev/null || npx drizzle-kit push 2>/dev/null
echo -e "  ${GREEN}✓${NC} Схема БД применена"

echo -e "  Собираем приложение..."
npm run build
echo -e "  ${GREEN}✓${NC} Приложение собрано"

# ===================== Systemd =====================
echo -e "${CYAN}[7/8]${NC} Настройка автозапуска..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SubManager - VPN Subscription Manager
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=$(which node) ${INSTALL_DIR}/.next/standalone/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=PORT=${APP_PORT}
Environment=HOSTNAME=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

# Копируем static файлы для standalone
cp -r "$INSTALL_DIR/.next/static" "$INSTALL_DIR/.next/standalone/.next/" 2>/dev/null || true
cp -r "$INSTALL_DIR/public" "$INSTALL_DIR/.next/standalone/" 2>/dev/null || true

# Cron для обновления подписок (каждые 5 минут)
(crontab -l 2>/dev/null | grep -v "submanager"; echo "*/5 * * * * curl -s http://127.0.0.1:${APP_PORT}/api/cron/update > /dev/null 2>&1") | crontab -

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" > /dev/null 2>&1
systemctl restart "$SERVICE_NAME"

# Проверка запуска
sleep 3
if systemctl is-active --quiet "$SERVICE_NAME"; then
  echo -e "  ${GREEN}✓${NC} Сервис ${SERVICE_NAME} запущен"
else
  echo -e "  ${RED}✗${NC} Ошибка запуска сервиса. Проверьте: journalctl -u ${SERVICE_NAME}"
fi

# ===================== Nginx + SSL =====================
echo -e "${CYAN}[8/8]${NC} Настройка Nginx и SSL..."

cat > "/etc/nginx/sites-available/${DOMAIN}" << EOF
server {
    listen 80;
    server_name ${DOMAIN};

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

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

if nginx -t > /dev/null 2>&1; then
  systemctl reload nginx
  echo -e "  ${GREEN}✓${NC} Nginx настроен"
else
  echo -e "  ${RED}✗${NC} Ошибка конфигурации Nginx"
  nginx -t
fi

# SSL с certbot
echo -e "  Получаем SSL сертификат..."
if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} SSL сертификат установлен"
else
  echo -e "  ${YELLOW}⚠ SSL не удалось получить автоматически${NC}"
  echo -e "  Запустите вручную: ${BOLD}certbot --nginx -d ${DOMAIN}${NC}"
fi

systemctl reload nginx 2>/dev/null || true

# ===================== Готово =====================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}✓ SubManager успешно установлен!${NC}                    ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Панель управления:${NC}  https://${DOMAIN}"
echo -e "  ${BOLD}Порт:${NC}              ${APP_PORT}"
echo -e "  ${BOLD}Директория:${NC}        ${INSTALL_DIR}"
echo ""
echo -e "  ${YELLOW}⚡ Первый вход создаст учётную запись администратора.${NC}"
echo ""
echo -e "  ${BLUE}Полезные команды:${NC}"
echo -e "    systemctl status ${SERVICE_NAME}      — статус"
echo -e "    systemctl restart ${SERVICE_NAME}    — перезапуск"
echo -e "    systemctl stop ${SERVICE_NAME}       — остановка"
echo -e "    journalctl -u ${SERVICE_NAME} -f     — логи"
echo ""
echo -e "  ${BLUE}Данные подключения к БД (сохраните!):${NC}"
echo -e "    База:     ${DB_NAME}"
echo -e "    Пользователь: ${DB_USER}"
echo -e "    Пароль:   ${DB_PASS}"
echo ""
