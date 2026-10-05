import { randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { settings, subscriptions, subscriptionKeys, remoteSources, subscriptionReports } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";

export const botKeys = ["telegramToken", "telegramChatId", "telegramSecret", "telegramOrigin"];
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const time = (date: Date | string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "medium", timeStyle: "short" }) + " МСК";
const button = (text: string, callback_data: string) => ({ text, callback_data });
export async function config() {
  const rows = await db.select().from(settings);
  const values = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { token: values.telegramToken || "", chat: values.telegramChatId || "", secret: values.telegramSecret || "", origin: values.telegramOrigin || "" };
}
export async function saveSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
export function newSecret() { return randomBytes(32).toString("hex"); }
export function safeEqual(a: string, b: string) {
  const one = Buffer.from(a), two = Buffer.from(b);
  return one.length === two.length && timingSafeEqual(one, two);
}
export async function telegram(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  const data = await response.json() as { ok: boolean; result?: { message_id?: number; status?: string; id?: number; type?: string; url?: string }; description?: string };
  if (!data.ok) throw new Error(data.description || "Telegram API error");
  return data.result;
}
export async function send(text: string, keyboard: Record<string, unknown>[][] = [], chat?: string | number, reply?: number) {
  const cfg = await config();
  if (!cfg.token || !cfg.chat) return;
  return telegram(cfg.token, "sendMessage", {
    chat_id: chat ?? cfg.chat, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    ...(reply ? { reply_to_message_id: reply } : {}),
  });
}
export function publicUrl(origin: string, slug: string) { return `${origin}/s/${encodeURIComponent(slug)}`; }
export function editUrl(origin: string, id: string) { return `${origin}/dashboard/edit/${encodeURIComponent(id)}`; }
export function status(sub: { isActive: boolean; expiresAt: Date | null }) {
  return sub.expiresAt && sub.expiresAt.getTime() <= Date.now() ? "Истекла" : sub.isActive ? "Активна" : "Приостановлена";
}
export function life(expires: Date | null) {
  if (!expires) return "Бессрочная";
  const remaining = expires.getTime() - Date.now();
  if (remaining <= 0) return `Истекла ${time(expires)}`;
  const days = Math.floor(remaining / 86400000), hours = Math.floor((remaining % 86400000) / 3600000);
  return `${days} д. ${hours} ч. (до ${time(expires)})`;
}
export function controls(sub: typeof subscriptions.$inferSelect, origin: string) {
  return [
    [button("Продлить", `extend:${sub.id}`), button(sub.isActive ? "Приостановить" : "Возобновить", `${sub.isActive ? "pause" : "resume"}:${sub.id}`)],
    [{ text: "Проверить", url: publicUrl(origin, sub.slug) }],
  ];
}
export async function notifyCreated(sub: typeof subscriptions.$inferSelect) {
  try {
    const cfg = await config();
    if (!cfg.origin || !cfg.token || !cfg.chat) return;
    const [[keys], [sources]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(subscriptionKeys).where(eq(subscriptionKeys.subscriptionId, sub.id)),
      db.select({ count: sql<number>`count(*)::int` }).from(remoteSources).where(eq(remoteSources.subscriptionId, sub.id)),
    ]);
    const url = publicUrl(cfg.origin, sub.slug);
    await send(`<b>НОВАЯ ПОДПИСКА</b>\n━━━━━━━━━━━━━━━━━━━━\n\n<b>Название:</b> ${escapeHtml(sub.name)}\n<b>В клиенте:</b> ${escapeHtml(sub.title || sub.name)}\n<b>Создана:</b> ${time(sub.createdAt)}\n<b>Ключей:</b> ${keys.count}  ·  <b>Источников:</b> ${sources.count}\n<b>Срок:</b> ${escapeHtml(life(sub.expiresAt))}`, [
      [{ text: "Открыть", url }, { text: "Копировать URL", copy_text: { text: url } }],
      [button("Приостановить", `pause:${sub.id}`)],
    ]);
  } catch (error) { console.error("Telegram creation notification failed", error); }
}
export async function notifyReport(subId: string, reportId: string, type: "ordinary" | "renewal") {
  try {
    const cfg = await config();
    if (!cfg.origin || !cfg.token || !cfg.chat) return;
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, subId)).limit(1);
    const [report] = await db.select().from(subscriptionReports).where(eq(subscriptionReports.id, reportId)).limit(1);
    if (!sub || !report) return;
    const heading = type === "renewal" ? "ЗАПРОС НА ПРОДЛЕНИЕ" : "СООБЩЕНИЕ О РАБОТЕ ПОДПИСКИ";
    const text = type === "renewal"
      ? `<b>Подписка:</b> ${escapeHtml(sub.name)}\n<b>Запрос:</b> ${time(report.createdAt)}\n<b>Истекла:</b> ${sub.expiresAt ? time(sub.expiresAt) : "—"}`
      : `<b>Подписка:</b> ${escapeHtml(sub.name)}\n<b>Статус:</b> ${status(sub)}\n<b>Время:</b> ${time(report.createdAt)}\n\n${escapeHtml(report.message)}`;
    await send(`<b>${heading}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${text}`, type === "renewal" ? [
      [button("Продлить", `extend:${sub.id}`), { text: "Открыть", url: editUrl(cfg.origin, sub.id) }],
    ] : [
      [button("Прочитано", `read:${report.id}`), { text: "Проверить", url: editUrl(cfg.origin, sub.id) }],
    ]);
  } catch (error) { console.error("Telegram report notification failed", error); }
}
export async function notifyExpiry() {
  const cfg = await config();
  if (!cfg.token || !cfg.chat || !cfg.origin) return;
  const subs = await db.select().from(subscriptions).orderBy(asc(subscriptions.createdAt));
  for (const sub of subs) {
    if (!sub.expiresAt) continue;
    const days = Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86400000);
    if (days < 0 || days > 3) continue;
    const label = days === 0 ? "expired" : `${days}d`;
    const eventKey = `tgExpiry:${sub.id}:${sub.expiresAt.getTime()}:${label}`;
    // An atomic claim prevents duplicate messages from concurrent cron runs.
    const [claimed] = await db.insert(settings).values({ key: eventKey, value: "sent" })
      .onConflictDoNothing().returning({ key: settings.key });
    if (!claimed) continue;
    try {
      await send(`<b>${days === 0 ? "ПОДПИСКА ИСТЕКЛА" : "СКОРО ИСТЕКАЕТ ПОДПИСКА"}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n<b>Подписка:</b> ${escapeHtml(sub.name)}\n<b>Осталось:</b> ${escapeHtml(life(sub.expiresAt))}`, [
        [button("Продлить", `extend:${sub.id}`), { text: "Открыть", url: editUrl(cfg.origin, sub.id) }],
      ]);
    } catch (error) {
      await db.delete(settings).where(eq(settings.key, eventKey));
      console.error("Telegram expiry notification failed", error);
    }
  }
}
export function duration(input: string, now: Date, expiry: Date | null) {
  const match = /^(\d{1,5})(m|h|d|mo)$/i.exec(input.trim());
  if (!match) return null;
  const count = Number(match[1]);
  if (!count || count > 10000) return null;
  const base = expiry && expiry > now ? new Date(expiry) : new Date(now);
  if (match[2].toLowerCase() === "mo") base.setUTCMonth(base.getUTCMonth() + count);
  else base.setTime(base.getTime() + count * ({ m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase() as "m" | "h" | "d"]));
  return base;
}
export { time, button };
