#!/bin/bash
set -e

# =====================================================
# SubManager — Полное удаление с Ubuntu VPS
# Репозиторий: github.com/LarsGravesen-invilink/submanager
# =====================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="/opt/submanager"
SERVICE_NAME="submanager"
DB_NAME="submanager_db"
DB_USER="submanager"
INTERNAL_PORT=3000

printf "\n"
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}   ${BOLD}SubManager — Менеджер VPN подписок${NC}         ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}   ${RED}Полное удаление сервиса${NC}                    ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
printf "\n"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Ошибка: Запустите скрипт от root (sudo bash uninstall.sh)${NC}"
  exit 1
fi

echo -e "${RED}${BOLD}ВНИМАНИЕ!${NC}"
echo -e "${YELLOW}При удалении SubManager будут безвозвратно удалены:${NC}"
echo "  • все подписки, ключи и удалённые источники;"
echo "  • учётная запись администратора, сообщения и журналы;"
echo "  • база данных и все настройки приложения;"
echo "  • файлы приложения, systemd-сервисы и cron-задача;"
echo "  • конфигурация Nginx и SSL-сертификат SubManager."
printf "\n"
echo -e "${YELLOW}Перед продолжением создайте резервную копию через панель управления.${NC}"
printf "\n"
echo -ne "${BOLD}Для подтверждения введите УДАЛИТЬ: ${NC}"
read -r CONFIRMATION

if [ "$CONFIRMATION" != "УДАЛИТЬ" ]; then
  echo -e "${BLUE}Удаление отменено. Изменения не внесены.${NC}"
  exit 0
fi

printf "\n"
echo -e "${BLUE}Начинаем удаление SubManager...${NC}"
printf "\n"

# Сохраняем список связанных конфигураций до удаления файлов приложения.
mapfile -t NGINX_CONFIGS < <(
  grep -lRE "proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:${INTERNAL_PORT}" \
    /etc/nginx/sites-available 2>/dev/null || true
)

CERT_NAMES=()
if [ "${#NGINX_CONFIGS[@]}" -gt 0 ]; then
  mapfile -t CERT_NAMES < <(
    grep -hoE '/etc/letsencrypt/live/[^/]+/' "${NGINX_CONFIGS[@]}" 2>/dev/null \
      | sed -E 's#^/etc/letsencrypt/live/([^/]+)/$#\1#' \
      | sort -u || true
  )
fi

echo -e "${CYAN}[1/6]${NC} Остановка сервисов..."
systemctl disable --now "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
systemctl disable --now "${SERVICE_NAME}-watchdog.timer" >/dev/null 2>&1 || true
systemctl stop "${SERVICE_NAME}-watchdog.service" >/dev/null 2>&1 || true
echo -e "  ${GREEN}✓${NC} Сервисы остановлены"

echo -e "${CYAN}[2/6]${NC} Удаление systemd и cron..."
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
rm -f "/etc/systemd/system/${SERVICE_NAME}-watchdog.service"
rm -f "/etc/systemd/system/${SERVICE_NAME}-watchdog.timer"
systemctl daemon-reload
systemctl reset-failed >/dev/null 2>&1 || true

CURRENT_CRON=$(crontab -l 2>/dev/null || true)
FILTERED_CRON=$(printf '%s\n' "$CURRENT_CRON" | grep -v "/api/cron/update" || true)
if [ -n "$(printf '%s' "$FILTERED_CRON" | tr -d '[:space:]')" ]; then
  printf '%s\n' "$FILTERED_CRON" | crontab -
else
  crontab -r >/dev/null 2>&1 || true
fi
echo -e "  ${GREEN}✓${NC} Системные задания удалены"

echo -e "${CYAN}[3/6]${NC} Удаление конфигурации Nginx..."
for CONFIG in "${NGINX_CONFIGS[@]}"; do
  CONFIG_NAME=$(basename "$CONFIG")
  rm -f "/etc/nginx/sites-enabled/${CONFIG_NAME}"
  rm -f "$CONFIG"
done

if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || true
  else
    echo -e "  ${YELLOW}!${NC} Конфигурация Nginx требует ручной проверки"
  fi
fi
echo -e "  ${GREEN}✓${NC} Конфигурация прокси удалена"

echo -e "${CYAN}[4/6]${NC} Удаление SSL-сертификата..."
if command -v certbot >/dev/null 2>&1; then
  for CERT_NAME in "${CERT_NAMES[@]}"; do
    certbot delete --cert-name "$CERT_NAME" --non-interactive >/dev/null 2>&1 || true
  done
fi
echo -e "  ${GREEN}✓${NC} SSL-данные SubManager обработаны"

echo -e "${CYAN}[5/6]${NC} Удаление базы данных..."
if command -v psql >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -q <<EOSQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${DB_NAME};
DROP ROLE IF EXISTS ${DB_USER};
EOSQL
else
  echo -e "  ${YELLOW}!${NC} PostgreSQL не найден, пропускаем"
fi
echo -e "  ${GREEN}✓${NC} Данные PostgreSQL удалены"

echo -e "${CYAN}[6/6]${NC} Удаление файлов приложения..."
rm -rf "$INSTALL_DIR"
rm -f /tmp/submanager-install.sh /tmp/submanager-update.sh /tmp/submanager-uninstall.sh
rm -f /tmp/submanager-dist.tar.gz /tmp/submanager-env-backup
echo -e "  ${GREEN}✓${NC} Файлы приложения удалены"

printf "\n"
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}SubManager полностью удалён${NC}               ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
printf "\n"
echo -e "${BLUE}Системные пакеты не удалялись и доступны другим сервисам.${NC}"
