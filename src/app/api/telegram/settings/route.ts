import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { config, newSecret, saveSetting, telegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.has("ping")) {
    try {
      // A deliberately invalid bot ID tests the Telegram Bot API from this server,
      // independently of whether the user has saved a valid token or chat ID.
      const response = await fetch("https://api.telegram.org/bot0:ping/getMe", {
        signal: AbortSignal.timeout(3000), cache: "no-store",
      });
      const data: unknown = await response.json();
      const reachable = typeof data === "object" && data !== null && "ok" in data &&
        typeof data.ok === "boolean" && "error_code" in data && typeof data.error_code === "number";
      return NextResponse.json({ reachable }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ reachable: false }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  const cfg = await config();
  const base = { token: cfg.token, chat: cfg.chat };
  if (!cfg.token && !cfg.chat) return NextResponse.json({ ...base, status: "Не настроен" });
  if (!cfg.token || !cfg.chat || !cfg.origin) return NextResponse.json({ ...base, status: "Проверьте данные", detail: "Введите токен и ID чата, затем сохраните настройки" });
  try {
    const bot = await telegram(cfg.token, "getMe", {});
    if (!bot?.id) throw new Error();
  } catch { return NextResponse.json({ ...base, status: "Проверьте данные", detail: "Telegram не подтвердил токен бота" }); }
  try {
    await telegram(cfg.token, "getChat", { chat_id: cfg.chat });
  } catch { return NextResponse.json({ ...base, status: "Проверьте данные", detail: "Бот не видит чат: проверьте ID и добавьте бота в чат (в личном чате сначала нажмите Start)" }); }
  try {
    const hook = await telegram(cfg.token, "getWebhookInfo", {});
    if (hook?.url !== `${cfg.origin}/api/telegram/webhook`) throw new Error();
  } catch { return NextResponse.json({ ...base, status: "Проверьте данные", detail: "Telegram webhook не подключён. Откройте панель по HTTPS и сохраните настройки повторно" }); }
  return NextResponse.json({ ...base, status: "Активен" });
}
export async function PUT(req: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { token?: string; chat?: string; origin?: string };
  if (typeof body.token !== "string" || typeof body.chat !== "string" || body.token.length > 256 || body.chat.length > 32) {
    return NextResponse.json({ error: "Неверный формат настроек" }, { status: 400 });
  }
  const token = body.token.trim(), chat = body.chat.trim();
  const previous = await config();
  const secret = previous.secret || newSecret();
  let origin = "";
  try {
    const url = new URL(body.origin || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    const host = req.headers.get("host")?.split(":")[0]?.toLowerCase();
    if (url.hostname.toLowerCase() !== host) throw new Error();
    origin = url.origin;
  } catch { /* Credentials still need to be saved if HTTPS/webhook is unavailable. */ }

  // Persist the entered fields first: failed Telegram checks must not erase the token.
  await Promise.all([
    saveSetting("telegramToken", token), saveSetting("telegramChatId", chat),
    saveSetting("telegramSecret", secret), saveSetting("telegramOrigin", origin || previous.origin),
  ]);
  if (previous.token && previous.token !== token) {
    try { await telegram(previous.token, "deleteWebhook", {}); } catch { /* Old token may be revoked. */ }
  }
  if (!token || !chat) {
    if (token && previous.token === token) {
      try { await telegram(token, "deleteWebhook", {}); } catch { /* Telegram may be unavailable. */ }
    }
    return NextResponse.json({ status: !token && !chat ? "Не настроен" : "Проверьте данные" });
  }
  if (!/^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    return NextResponse.json({ status: "Проверьте данные", detail: "Неверный формат токена" });
  }
  if (!/^-?\d{1,20}$/.test(chat)) {
    return NextResponse.json({ status: "Проверьте данные", detail: "Неверный ID чата или канала" });
  }
  if (!origin) {
    return NextResponse.json({ status: "Проверьте данные", detail: "Откройте панель через ваш HTTPS-домен" });
  }
  let bot;
  try { bot = await telegram(token, "getMe", {}); }
  catch { return NextResponse.json({ status: "Проверьте данные", detail: "Telegram не подтвердил токен бота. Проверьте токен и доступ сервера к Telegram" }); }
  if (!bot?.id) return NextResponse.json({ status: "Проверьте данные", detail: "Telegram не подтвердил токен бота" });
  let target;
  try { target = await telegram(token, "getChat", { chat_id: chat }); }
  catch { return NextResponse.json({ status: "Проверьте данные", detail: "Бот не видит этот ID. Добавьте бота в чат; для личного чата сначала нажмите Start" }); }
  if (target?.type !== "private") {
    try {
      const member = await telegram(token, "getChatMember", { chat_id: chat, user_id: bot.id });
      if (member?.status !== "administrator" && member?.status !== "creator") throw new Error();
    } catch { return NextResponse.json({ status: "Проверьте данные", detail: "Добавьте бота в группу или канал и назначьте администратором" }); }
  }
  try {
    await telegram(token, "setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "channel_post", "callback_query"], drop_pending_updates: false });
  } catch { return NextResponse.json({ status: "Проверьте данные", detail: "Telegram не подключил webhook. Проверьте доступность HTTPS-домена и порт (443 или 8443)" }); }
  return NextResponse.json({ status: "Активен" });
}
