import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const dynamic = "force-dynamic";

// Public settings — no auth, never throws
export async function GET() {
  try {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    for (const r of rows) {
      obj[r.key] = r.value;
    }
    return NextResponse.json(obj);
  } catch {
    // Table may not exist — return empty
    return NextResponse.json({});
  }
}
