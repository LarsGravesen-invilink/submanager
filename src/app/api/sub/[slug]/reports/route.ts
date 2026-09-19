import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports, subscriptions } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const RENEWAL_MESSAGE = "Поступил запрос на продление подписки";
const RENEWAL_COOLDOWN_MS = 3 * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const requestedType = body && typeof body === "object" && "type" in body ? body.type : undefined;
  const type = requestedType === "renewal" ? "renewal" : "ordinary";
  if (requestedType !== undefined && requestedType !== "ordinary" && requestedType !== "renewal") {
    return NextResponse.json({ error: "Неверный тип сообщения" }, { status: 400 });
  }

  const message = type === "renewal"
    ? RENEWAL_MESSAGE
    : body && typeof body === "object" && "message" in body
      ? String(body.message ?? "").trim()
      : "";

  if (type === "ordinary" && (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH)) {
    return NextResponse.json(
      { error: `Сообщение должно содержать от ${MIN_MESSAGE_LENGTH} до ${MAX_MESSAGE_LENGTH} символов` },
      { status: 400 }
    );
  }

  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.slug, slug))
    .limit(1);

  if (!sub) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  if (type === "renewal") {
    return db.transaction(async (tx) => {
      // Serialize renewal attempts per subscription, including concurrent requests.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sub.id}::text))`);

      const [currentSub] = await tx
        .select({ expiresAt: subscriptions.expiresAt, dbNow: sql<Date>`now()` })
        .from(subscriptions)
        .where(eq(subscriptions.id, sub.id))
        .limit(1);
      if (!currentSub) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      if (!currentSub.expiresAt || currentSub.expiresAt.getTime() >= currentSub.dbNow.getTime()) {
        return NextResponse.json({ error: "Подписка не истекла" }, { status: 409 });
      }

      const [latest] = await tx
        .select({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt })
        .from(subscriptionReports)
        .where(and(eq(subscriptionReports.subscriptionId, sub.id), eq(subscriptionReports.type, "renewal")))
        .orderBy(desc(subscriptionReports.createdAt))
        .limit(1);

      if (latest) {
        const retryAt = new Date(latest.createdAt.getTime() + RENEWAL_COOLDOWN_MS);
        if (retryAt.getTime() > currentSub.dbNow.getTime()) {
          return NextResponse.json({ ...latest, type, cooldown: true, retryAt: retryAt.toISOString() });
        }
      }

      const [created] = await tx
        .insert(subscriptionReports)
        .values({ subscriptionId: sub.id, message, type, ip })
        .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });
      const retryAt = new Date(created.createdAt.getTime() + RENEWAL_COOLDOWN_MS);
      return NextResponse.json(
        { ...created, type, cooldown: false, retryAt: retryAt.toISOString() },
        { status: 201 }
      );
    });
  }

  const [report] = await db
    .insert(subscriptionReports)
    .values({ subscriptionId: sub.id, message, type, ip })
    .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });
  return NextResponse.json(report, { status: 201 });
}
