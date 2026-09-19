#!/bin/bash
set -e

# =====================================================
# SubManager — Обновление сервиса
# Обновляет сборку без переустановки SSL, БД, Nginx
# =====================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

DIST_URL="https://github.com/LarsGravesen-invilink/submanager/releases/download/1.0.0/submanager-dist.tar.gz"
INSTALL_DIR="/opt/submanager"
SERVICE_NAME="submanager"
INTERNAL_PORT=3000

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}   ${BOLD}SubManager — Обновление сервиса${NC}            ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Проверка root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Ошибка: Запустите от root (sudo bash update.sh)${NC}"
  exit 1
fi

# Проверка что установлен
if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo -e "${RED}SubManager не установлен. Используйте install.sh${NC}"
  exit 1
fi

# Сохраняем .env
cp "$INSTALL_DIR/.env" /tmp/submanager-env-backup
echo -e "${GREEN}✓${NC} Конфигурация сохранена"

# Читаем данные из .env
DB_USER=$(grep -oP 'postgresql://\K[^:]+' "$INSTALL_DIR/.env")
DB_PASS=$(grep -oP '://[^:]+:\K[^@]+' "$INSTALL_DIR/.env")
DB_NAME=$(grep -oP '@[^/]+/\K[^\?]+' "$INSTALL_DIR/.env" | head -1)

# Синхронизация времени МСК
timedatectl set-timezone Europe/Moscow 2>/dev/null || true

echo -e "${CYAN}[1/4]${NC} Скачивание новой сборки..."
curl -fSL --retry 3 --retry-delay 2 -o /tmp/submanager-dist.tar.gz "$DIST_URL" || {
  echo -e "${RED}✗ Ошибка загрузки${NC}"
  exit 1
}
if ! gzip -t /tmp/submanager-dist.tar.gz 2>/dev/null; then
  echo -e "${RED}✗ Архив повреждён${NC}"
  rm -f /tmp/submanager-dist.tar.gz
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Сборка скачана"

echo -e "${CYAN}[2/4]${NC} Остановка сервиса..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
sleep 1
echo -e "  ${GREEN}✓${NC} Сервис остановлен"

echo -e "${CYAN}[3/4]${NC} Обновление файлов..."
# Удаляем старые файлы сборки, но сохраняем .env
rm -rf "$INSTALL_DIR/server.js" "$INSTALL_DIR/package.json" "$INSTALL_DIR/node_modules" "$INSTALL_DIR/.next" "$INSTALL_DIR/public"
# Распаковываем новую сборку
tar -xzf /tmp/submanager-dist.tar.gz -C "$INSTALL_DIR"
rm -f /tmp/submanager-dist.tar.gz
# Восстанавливаем .env
cp /tmp/submanager-env-backup "$INSTALL_DIR/.env"
rm -f /tmp/submanager-env-backup
echo -e "  ${GREEN}✓${NC} Файлы обновлены"

echo -e "${CYAN}[4/4]${NC} Миграция БД и запуск..."
# Миграция: добавляем новые столбцы если их нет
if [ -n "$DB_USER" ] && [ -n "$DB_PASS" ] && [ -n "$DB_NAME" ]; then
  PGPASSWORD="${DB_PASS}" psql -h 127.0.0.1 -U "${DB_USER}" -d "${DB_NAME}" -q 2>/dev/null << 'EOMIGRATE'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pause_reason TEXT DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS backup_keys JSONB DEFAULT '[]';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extra_configs_title TEXT DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extra_configs JSONB DEFAULT '[]';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS whats_new TEXT DEFAULT '';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS logo_size TEXT DEFAULT 'medium';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_expiry BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_upload BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_download BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS show_total BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_traffic_gb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_upload_gb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS used_download_gb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS access_reset_mode TEXT NOT NULL DEFAULT 'never';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS access_reset_at TIMESTAMPTZ;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_access_reset_mode_check') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_access_reset_mode_check
            CHECK (access_reset_mode IN ('never', 'daily', 'weekly', 'monthly'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscription_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ordinary' CHECK (type IN ('ordinary', 'renewal')),
    ip TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE subscription_reports ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'ordinary';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_reports_type_check') THEN
        ALTER TABLE subscription_reports ADD CONSTRAINT subscription_reports_type_check CHECK (type IN ('ordinary', 'renewal'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS subscription_reports_subscription_read_idx
    ON subscription_reports (subscription_id, is_read);
CREATE INDEX IF NOT EXISTS subscription_reports_subscription_type_idx
    ON subscription_reports (subscription_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_reports_outstanding_renewal_idx
    ON subscription_reports (subscription_id) WHERE type = 'renewal';

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'access_logs'
          AND column_name = 'accessed_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE access_logs
            ALTER COLUMN accessed_at TYPE TIMESTAMPTZ
            USING accessed_at AT TIME ZONE 'Europe/Moscow';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS access_logs_subscription_device_accessed_idx
    ON access_logs (subscription_id, device_type, accessed_at DESC);
UPDATE access_logs
SET device_type = 'vpn_client',
    device_name = 'sing-box'
WHERE device_type = 'router'
  AND user_agent ~* 'sing-box'
  AND user_agent !~* 'openwrt|podkop|forkop';
UPDATE access_logs
SET device_type = 'router',
    device_name = CASE
        WHEN user_agent ~* 'openwrt' THEN 'OpenWRT'
        WHEN user_agent ~* 'podkop' THEN 'Podkop'
        ELSE 'ForKop'
    END
WHERE user_agent ~* 'openwrt|podkop|forkop';
EOMIGRATE
  echo -e "  ${GREEN}✓${NC} Миграция БД выполнена"
else
  echo -e "  ${YELLOW}⚠${NC} Не удалось прочитать данные БД из .env"
fi

# Запуск
systemctl restart "$SERVICE_NAME"

# Проверка
echo -ne "  Запуск"
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
else
  echo -e "  ${RED}✗${NC} Сервис не отвечает. Логи:"
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}✓ SubManager обновлён!${NC}                     ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
