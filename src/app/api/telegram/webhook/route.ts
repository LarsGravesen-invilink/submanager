import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, subscriptionReports } from "@/db/schema";
import { asc, and, eq } from "drizzle-orm";
import { button, config, controls, duration, editUrl, escapeHtml, life, publicUrl, safeEqual, send, status, telegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
type Message = { message_id: number; chat: { id: number }; text?: string; reply_to_message?: { text?: string }; from?: { id: number } };
type Callback = { id: string; data?: string; from: { id: number }; message?: Message };

export async function POST(req: NextRequest) {
  const cfg = await config();
  if (!cfg.secret || !cfg.token || !cfg.chat || !safeEqual(req.headers.get("x-telegram-bot-api-secret-token") || "", cfg.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const update = await req.json() as { message?: Message; channel_post?: Message; callback_query?: Callback };
  const callback = update.callback_query;
  const message = update.message || update.channel_post || callback?.message;
  if (!message || String(message.chat.id) !== cfg.chat) return NextResponse.json({ ok: true });
  const sender = callback?.from.id || message.from?.id;
  if (sender && String(sender) !== cfg.chat) {
    try {
      const member = await telegram(cfg.token, "getChatMember", { chat_id: cfg.chat, user_id: sender });
      if (member?.status !== "administrator" && member?.status !== "creator") return NextResponse.json({ ok: true });
    } catch { return NextResponse.json({ ok: true }); }
  }
  try {
    if (callback) {
      const answer = async (text: string) => telegram(cfg.token, "answerCallbackQuery", { callback_query_id: callback.id, text, show_alert: false });
      const [action, id] = (callback.data || "").split(":");
      if (action === "select") {
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
        if (sub) await send(`<b>${escapeHtml(sub.name)}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n<b>В клиенте:</b> ${escapeHtml(sub.title || sub.name)}\n<b>Статус:</b> ${status(sub)}\n<b>Срок:</b> ${escapeHtml(life(sub.expiresAt))}`, controls(sub, cfg.origin));
        await answer(sub ? "Подписка открыта" : "Подписка не найдена");
      } else if (action === "extend" || action === "pause" || action === "resume") {
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
        if (!sub) await answer("Подписка не найдена");
        else if (action === "extend") {
          await send(`<b>ПРОДЛЕНИЕ</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(sub.name)} [${sub.id}]\nОтветьте на это сообщение сроком: <code>30d</code>, <code>12h</code>, <code>45m</code> или <code>1mo</code> (месяц).`, [], message.chat.id);
          await answer("Укажите срок ответом на сообщение");
        } else {
          if (action === "pause" && sub.isActive) await db.update(subscriptions).set({ isActive: false }).where(eq(subscriptions.id, id));
          if (action === "resume" && !sub.isActive && (!sub.expiresAt || sub.expiresAt > new Date())) await db.update(subscriptions).set({ isActive: true, pauseReason: "" }).where(eq(subscriptions.id, id));
          await answer(action === "pause" ? "Подписка приостановлена" : sub.expiresAt && sub.expiresAt <= new Date() ? "Сначала продлите подписку" : "Подписка возобновлена");
        }
      } else if (action === "read") {
        await db.update(subscriptionReports).set({ isRead: true }).where(eq(subscriptionReports.id, id));
        await answer("Отмечено как прочитанное");
      } else await answer("Неизвестная команда");
    } else {
      const text = message.text?.trim() || "";
      if (/^\/all(?:@\w+)?(?:\s|$)/i.test(text)) {
        const all = await db.select().from(subscriptions).orderBy(asc(subscriptions.createdAt));
        if (!all.length) await send("<b>ПОДПИСКИ</b>\n━━━━━━━━━━━━━━━━━━━━\n\nПодписок пока нет.");
        else {
          for (let start = 0; start < all.length; start += 10) {
            const group = all.slice(start, start + 10);
            const lines = group.map((sub, i) => `<b>${start + i + 1}.</b> ${escapeHtml(sub.name)}\n    ${status(sub)} · ${escapeHtml(life(sub.expiresAt))}`);
            await send(`<b>ПОДПИСКИ · ${start + 1}–${start + group.length}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${lines.join("\n\n")}\n\nВыберите номер кнопкой или ответьте на список цифрой.`, group.map((sub, i) => button(String(start + i + 1), `select:${sub.id}`)).reduce<Record<string, unknown>[][]>((rows, item, i) => { if (i % 5 === 0) rows.push([]); rows[rows.length - 1].push(item); return rows; }, []));
          }
        }
      } else if (message.reply_to_message?.text?.includes("ПРОДЛЕНИЕ")) {
        // The prompt contains a UUID only after its identifier; validate against the database.
        const match = /\[([0-9a-f-]{36})\]/.exec(message.reply_to_message.text);
        if (match) {
          const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, match[1])).limit(1);
          if (sub) {
            const expiry = duration(text, new Date(), sub.expiresAt);
            if (!expiry) await send("Неверный срок. Укажите, например: <code>30d</code>, <code>12h</code>, <code>45m</code> или <code>1mo</code>.");
            else {
              await db.transaction(async tx => {
                await tx.update(subscriptions).set({ expiresAt: expiry, isActive: true, pauseReason: "" }).where(eq(subscriptions.id, sub.id));
                if (sub.expiresAt && sub.expiresAt <= new Date()) await tx.delete(subscriptionReports).where(and(eq(subscriptionReports.subscriptionId, sub.id), eq(subscriptionReports.type, "renewal")));
              });
              await send(`<b>ПОДПИСКА ПРОДЛЕНА</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${escapeHtml(sub.name)}\nНовый срок: ${escapeHtml(life(expiry))}`, [[{ text: "Открыть", url: editUrl(cfg.origin, sub.id) }]]);
            }
          }
        }
      } else if (/^\d+$/.test(text) && message.reply_to_message?.text?.includes("ПОДПИСКИ ·")) {
        const all = await db.select().from(subscriptions).orderBy(asc(subscriptions.createdAt));
        const sub = all[Number(text) - 1];
        if (sub) await send(`<b>${escapeHtml(sub.name)}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n<b>Статус:</b> ${status(sub)}\n<b>Срок:</b> ${escapeHtml(life(sub.expiresAt))}`, controls(sub, cfg.origin));
      }
    }
  } catch (error) { console.error("Telegram update processing failed", error); }
  return NextResponse.json({ ok: true });
}
