import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

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

  const message =
    body && typeof body === "object" && "message" in body
      ? String(body.message ?? "").trim()
      : "";

  if (message.length < MIN_MESSAGE_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
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

  if (!sub) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const [report] = await db
    .insert(subscriptionReports)
    .values({ subscriptionId: sub.id, message, ip })
    .returning({ id: subscriptionReports.id, createdAt: subscriptionReports.createdAt });

  return NextResponse.json(report, { status: 201 });
}
