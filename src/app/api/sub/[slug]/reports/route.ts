import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports, subscriptions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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

  const [sub] = await db
    .select({ id: subscriptions.id, expiresAt: subscriptions.expiresAt })
    .from(subscriptions)
    .where(eq(subscriptions.slug, slug))
    .limit(1);

  if (!sub) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (type === "renewal" && (!sub.expiresAt || sub.expiresAt.getTime() >= Date.now())) {
    return NextResponse.json({ error: "Подписка не истекла" }, { status: 409 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

  if (type === "renewal") {
    const inserted = await db
      .insert(subscriptionReports)
      .values({ subscriptionId: sub.id, message, type, ip })
      .onConflictDoNothing()
      .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });
    if (inserted[0]) return NextResponse.json({ ...inserted[0], type, duplicate: false }, { status: 201 });

    const [existing] = await db
      .select({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt })
      .from(subscriptionReports)
      .where(and(eq(subscriptionReports.subscriptionId, sub.id), eq(subscriptionReports.type, "renewal")))
      .limit(1);
    return NextResponse.json({ ...existing, type, duplicate: true });
  }

  const [report] = await db
    .insert(subscriptionReports)
    .values({ subscriptionId: sub.id, message, type, ip })
    .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });
  return NextResponse.json(report, { status: 201 });
}
