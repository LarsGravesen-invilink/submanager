import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, subscriptionKeys, remoteSources } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import {
  parseSubscriptionContent,
  extractKeyName,
  keyFingerprint,
} from "@/lib/keys";

const USER_AGENTS = [
  "Happ/4.7.0",
  "Hiddify/2.0.0",
  "v2rayNG/1.8.20",
  "clash-meta",
  "sing-box/1.8.0",
  "Streisand/1.6.0",
  "SubManager/1.0",
];

function isRealKey(key: string): boolean {
  const dummyPatterns = ["0.0.0.0:1", "00000000-0000-0000-0000-000000000000", "127.0.0.1:1", "не поддерживается", "not supported", "данное приложение"];
  const lower = key.toLowerCase();
  return !dummyPatterns.some((p) => lower.includes(p));
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, id))
    .limit(1);

  if (!sub) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sources = await db
    .select()
    .from(remoteSources)
    .where(eq(remoteSources.subscriptionId, id));

  let totalRefreshed = 0;

  for (const source of sources) {
    let keys: string[] = [];

    for (const ua of USER_AGENTS) {
      try {
        const response = await fetch(source.url, {
          headers: { "User-Agent": ua },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) continue;
        const content = await response.text();
        const parsed = parseSubscriptionContent(content);
        const real = parsed.filter(isRealKey);
        if (real.length > 0) { keys = real; break; }
      } catch { continue; }
    }

    if (keys.length === 0) continue;

    // Delete old remote keys from this source
    const existingKeys = await db
      .select()
      .from(subscriptionKeys)
      .where(eq(subscriptionKeys.subscriptionId, id));

    const remoteFromSource = existingKeys.filter(
      (k) => k.sourceType === "remote" && k.sourceUrl === source.url
    );

    const newFps = new Set(keys.map((k) => keyFingerprint(k)));
    const selectedKeys = (source.selectedKeys || []) as string[];
    const keyNames = (source.keyNames || {}) as Record<string, string>;

    // Remove keys no longer in source
    for (const old of remoteFromSource) {
      if (!newFps.has(old.keyFingerprint)) {
        await db.delete(subscriptionKeys).where(eq(subscriptionKeys.id, old.id));
      }
    }

    const existingFps = new Set(remoteFromSource.map((k) => k.keyFingerprint));

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const fp = keyFingerprint(k);

      if (selectedKeys.length > 0 && !selectedKeys.includes(fp)) continue;

      const origName = extractKeyName(k);
      const customName = keyNames[fp] || "";

      if (existingFps.has(fp)) {
        await db
          .update(subscriptionKeys)
          .set({ keyValue: k, originalName: origName })
          .where(eq(subscriptionKeys.keyFingerprint, fp));
      } else {
        await db.insert(subscriptionKeys).values({
          subscriptionId: id,
          keyValue: k,
          customName,
          originalName: origName,
          sourceType: "remote",
          sourceUrl: source.url,
          isEnabled: true,
          sortOrder: i + 1000,
          keyFingerprint: fp,
        });
      }
      totalRefreshed++;
    }

    await db
      .update(remoteSources)
      .set({ lastStatus: "ok", lastFetchedAt: new Date() })
      .where(eq(remoteSources.id, source.id));
  }

  return NextResponse.json({ success: true, refreshed: totalRefreshed });
}
