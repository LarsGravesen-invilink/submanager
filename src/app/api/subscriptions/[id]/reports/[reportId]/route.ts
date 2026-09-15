import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptionReports } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, reportId } = await params;
  const deleted = await db
    .delete(subscriptionReports)
    .where(
      and(
        eq(subscriptionReports.id, reportId),
        eq(subscriptionReports.subscriptionId, id)
      )
    )
    .returning({ id: subscriptionReports.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
