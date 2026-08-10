import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { admins } from "@/db/schema";

export async function GET() {
  try {
    const session = await getSession();
    // Also check if admin exists
    const existing = await db.select().from(admins).limit(1);
    return NextResponse.json({
      authenticated: !!session,
      adminExists: existing.length > 0,
      username: session?.username || null,
    });
  } catch {
    return NextResponse.json({
      authenticated: false,
      adminExists: false,
      username: null,
    });
  }
}
