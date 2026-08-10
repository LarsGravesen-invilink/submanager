import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.select().from(settings);
  const obj: Record<string, string> = {};
  for (const r of rows) {
    obj[r.key] = r.value;
  }
  return NextResponse.json(obj);
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: Record<string, string> = await req.json();

  for (const [key, value] of Object.entries(body)) {
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(settings)
        .set({ value: String(value) })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value: String(value) });
    }
  }

  return NextResponse.json({ success: true });
}
