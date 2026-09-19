import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports, subscriptions } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const RENEWAL_MESSAGE = "Поступил запрос на продление подписки";

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

  try {
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.slug, slug))
      .limit(1);

    if (!sub) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

    if (type === "renewal") {
      const result = await db.transaction(async (tx) => {
        // Serialize renewal attempts per subscription, including concurrent requests.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sub.id}::text))`);

        const [currentSub] = await tx
          .select({
            isExpired: sql<boolean>`${subscriptions.expiresAt} IS NOT NULL AND ${subscriptions.expiresAt} < now()`,
            serverNow: sql<string>`to_json(now()) #>> '{}'`,
          })
          .from(subscriptions)
          .where(eq(subscriptions.id, sub.id))
          .limit(1);
        if (!currentSub) return { status: 404, body: { error: "Не найдено" } };
        if (!currentSub.isExpired) {
          return { status: 409, body: { error: "Подписка не истекла", serverNow: currentSub.serverNow } };
        }

        const [latest] = await tx
          .select({
            id: subscriptionReports.id,
            retryAt: sql<string>`to_json(${subscriptionReports.createdAt} + interval '3 hours') #>> '{}'`,
            serverNow: sql<string>`to_json(now()) #>> '{}'`,
            cooldown: sql<boolean>`${subscriptionReports.createdAt} + interval '3 hours' > now()`,
          })
          .from(subscriptionReports)
          .where(and(eq(subscriptionReports.subscriptionId, sub.id), eq(subscriptionReports.type, "renewal")))
          .orderBy(desc(subscriptionReports.createdAt))
          .limit(1);

        if (latest?.cooldown) {
          return { status: 200, body: { id: latest.id, type, cooldown: true, retryAt: latest.retryAt, serverNow: latest.serverNow } };
        }

        const [created] = await tx
          .insert(subscriptionReports)
          .values({ subscriptionId: sub.id, message, type, ip })
          .returning({
            id: subscriptionReports.id,
            retryAt: sql<string>`to_json(${subscriptionReports.createdAt} + interval '3 hours') #>> '{}'`,
            serverNow: sql<string>`to_json(now()) #>> '{}'`,
          });
        return { status: 201, body: { ...created, type, cooldown: false } };
      });

      return NextResponse.json(result.body, { status: result.status });
    }

    const [report] = await db
      .insert(subscriptionReports)
      .values({ subscriptionId: sub.id, message, type, ip })
      .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });
    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("Failed to create subscription report", { slug, type, error });
    return NextResponse.json({ error: "Не удалось отправить запрос" }, { status: 500 });
  }
}
