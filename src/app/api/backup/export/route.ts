import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  remoteSources,
  accessLogs,
  settings,
} from "@/db/schema";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSubscriptions = await db.select().from(subscriptions);
  const allKeys = await db.select().from(subscriptionKeys);
  const allSources = await db.select().from(remoteSources);
  const allLogs = await db.select().from(accessLogs);
  const allSettings = await db.select().from(settings);

  const backup = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    generator: "SubManager by LarsGravesen",
    data: {
      settings: allSettings,
      subscriptions: allSubscriptions.map((sub) => ({
        ...sub,
        keys: allKeys.filter((k) => k.subscriptionId === sub.id),
        sources: allSources.filter((s) => s.subscriptionId === sub.id),
        logs: allLogs.filter((l) => l.subscriptionId === sub.id),
      })),
    },
  };

  const json = JSON.stringify(backup, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="submanager-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
