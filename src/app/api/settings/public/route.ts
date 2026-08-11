import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";

// Public settings endpoint — no auth required (for login page, etc.)
export async function GET() {
  try {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    for (const r of rows) {
      obj[r.key] = r.value;
    }
    return NextResponse.json(obj);
  } catch {
    return NextResponse.json({});
  }
}
