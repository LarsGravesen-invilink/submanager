import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { config, newSecret, saveSetting, telegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cfg = await config();
  if (!cfg.token && !cfg.chat) return NextResponse.json({ token: "", chat: "", status: "Не настроен" });
  if (!cfg.token || !cfg.chat || !cfg.origin) return NextResponse.json({ token: cfg.token, chat: cfg.chat, status: "Проверьте данные" });
  try {
    const bot = await telegram(cfg.token, "getMe", {});
    const target = await telegram(cfg.token, "getChat", { chat_id: cfg.chat });
    const member = target?.type === "private" ? { status: "member" } : bot?.id && await telegram(cfg.token, "getChatMember", { chat_id: cfg.chat, user_id: bot.id });
    const hook = await fetch(`https://api.telegram.org/bot${cfg.token}/getWebhookInfo`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const info = await hook.json() as { ok: boolean; result?: { url: string } };
    return NextResponse.json({ token: cfg.token, chat: cfg.chat, status: bot && member && member.status !== "left" && member.status !== "kicked" && (target?.type === "private" || member.status === "administrator" || member.status === "creator") && info.ok && info.result?.url === `${cfg.origin}/api/telegram/webhook` ? "Активен" : "Проверьте данные" });
  } catch { return NextResponse.json({ token: cfg.token, chat: cfg.chat, status: "Проверьте данные" }); }
}
export async function PUT(req: NextRequest) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { token?: string; chat?: string; origin?: string };
  const token = (body.token || "").trim(), chat = (body.chat || "").trim();
  if (token && !/^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token)) return NextResponse.json({ error: "Неверный формат токена" }, { status: 400 });
  if (chat && !/^-?\d{1,20}$/.test(chat)) return NextResponse.json({ error: "Неверный ID чата или канала" }, { status: 400 });
  let origin = "";
  try {
    const url = new URL(body.origin || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    const host = req.headers.get("host")?.split(":")[0]?.toLowerCase();
    if (url.hostname.toLowerCase() !== host) throw new Error();
    origin = url.origin;
  } catch { return NextResponse.json({ error: "Откройте панель через ваш HTTPS-домен" }, { status: 400 }); }
  const previous = await config();
  const secret = previous.secret || newSecret();
  if (token && chat) {
    try {
      const bot = await telegram(token, "getMe", {});
      const target = await telegram(token, "getChat", { chat_id: chat });
      if (!bot?.id || !target) throw new Error("Invalid bot or chat");
      if (target.type !== "private") {
        const member = await telegram(token, "getChatMember", { chat_id: chat, user_id: bot.id });
        if (!member || member.status === "left" || member.status === "kicked" || (member.status !== "administrator" && member.status !== "creator")) throw new Error("Bot cannot post to this chat");
      }
      await telegram(token, "setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "channel_post", "callback_query"], drop_pending_updates: false });
    } catch { return NextResponse.json({ error: "Проверьте данные и доступность Telegram" }, { status: 400 }); }
  } else if (previous.token) {
    try { await telegram(previous.token, "deleteWebhook", {}); } catch { /* The previous token may already be invalid. */ }
  }
  if (previous.token && previous.token !== token) {
    try { await telegram(previous.token, "deleteWebhook", {}); } catch { /* Old token may be revoked. */ }
  }
  await Promise.all([
    saveSetting("telegramToken", token), saveSetting("telegramChatId", chat),
    saveSetting("telegramSecret", secret), saveSetting("telegramOrigin", origin),
  ]);
  return NextResponse.json({ status: token && chat ? "Активен" : !token && !chat ? "Не настроен" : "Проверьте данные" });
}
