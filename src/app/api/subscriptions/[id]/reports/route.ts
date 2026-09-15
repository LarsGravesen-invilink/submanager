import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports, subscriptions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

async function subscriptionExists(id: string) {
  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);
  return !!sub;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await subscriptionExists(id))) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const reports = await db
    .select()
    .from(subscriptionReports)
    .where(eq(subscriptionReports.subscriptionId, id))
    .orderBy(desc(subscriptionReports.createdAt));

  return NextResponse.json({ reports });
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!(await subscriptionExists(id))) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  await db
    .update(subscriptionReports)
    .set({ isRead: true })
    .where(
      and(
        eq(subscriptionReports.subscriptionId, id),
        eq(subscriptionReports.isRead, false)
      )
    );

  return NextResponse.json({ success: true });
}
