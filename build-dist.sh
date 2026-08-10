#!/bin/bash
set -e

# =====================================================
# SubManager — Скрипт сборки дистрибутива
# Запускать на машине с >= 2GB RAM
# =====================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}   ${BOLD}SubManager — Сборка дистрибутива${NC}           ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Проверка Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js не установлен. Установите Node.js 20+${NC}"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Требуется Node.js 18+, текущая версия: $(node -v)${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# Установка зависимостей
echo -e "${CYAN}[1/4]${NC} Установка зависимостей..."
npm install
echo -e "${GREEN}✓${NC} Зависимости установлены"

# Сборка
echo -e "${CYAN}[2/4]${NC} Сборка приложения..."
npm run build
echo -e "${GREEN}✓${NC} Сборка завершена"

# Подготовка dist
echo -e "${CYAN}[3/4]${NC} Подготовка дистрибутива..."
rm -rf dist 2>/dev/null || true
mkdir -p dist

cp -r .next/standalone/* dist/
cp -r .next/static dist/.next/
mkdir -p dist/public
cp -r public/* dist/public/ 2>/dev/null || true
cp drizzle.config.json dist/
mkdir -p dist/src/db
cp src/db/schema.ts dist/src/db/

echo -e "${GREEN}✓${NC} Дистрибутив подготовлен"

# Создание архива
echo -e "${CYAN}[4/4]${NC} Создание архива..."
tar -czvf submanager-dist.tar.gz -C dist . > /dev/null 2>&1
rm -rf dist

SIZE=$(ls -lh submanager-dist.tar.gz | awk '{print $5}')
echo -e "${GREEN}✓${NC} Архив создан: submanager-dist.tar.gz (${SIZE})"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}   ${BOLD}✓ Сборка завершена!${NC}                               ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Загрузите в GitHub репозиторий файл:"
echo -e "  ${BOLD}submanager-dist.tar.gz${NC}"
echo ""
