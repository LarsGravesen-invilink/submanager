import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resetAccessManually } from "@/lib/accessReset";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const reset = await resetAccessManually(id);
    if (!reset) {
      return NextResponse.json({ error: "Подписка не найдена" }, { status: 404 });
    }
    return NextResponse.json({ success: true, uniqueHits: 0, totalHits: 0, logs: [] });
  } catch (error) {
    console.error("Manual access reset failed", error);
    return NextResponse.json({ error: "Не удалось сбросить статистику доступа" }, { status: 500 });
  }
}
