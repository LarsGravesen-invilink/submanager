import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, remoteSources, settings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { parseSubscriptionContent, isRealKey } from "@/lib/keys";
import { rawFetch } from "@/lib/fetch";
import { syncRemoteSourceKeys } from "@/lib/sourceSync";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "v2rayNG/1.8.20",
  "v2rayN/6.0",
  "Nekoray/3.26",
  "NekoBox/1.0",
  "Karing/1.0",
  "FlClash/0.8",
  "Hiddify/2.0.0",
  "ClashMeta/1.0",
  "Clash.Meta/1.0",
  "clash-meta",
  "clash-verge/1.0",
  "ClashVerge/1.0",
  "ClashForWindows/0.20.0",
  "sing-box/1.8.0",
  "Streisand/1.6.0",
  "Shadowrocket/2.0",
  "Stash/1.0",
  "Surge/5.0",
  "Loon/3.0",
  "Happ/4.7.0",
  "SubManager/1.0",
];

async function getValidateKeys(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "smartKeyValidation"))
      .limit(1);
    if (!row) return true;
    return row.value !== "false";
  } catch {
    return true;
  }
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

  const validateKeys = await getValidateKeys();
  let totalRefreshed = 0;

  for (const source of sources) {
    let keys: string[] = [];
    let ok = false;

    for (const ua of USER_AGENTS) {
      try {
        const response = await rawFetch(source.url, ua, { timeoutMs: 15000 });
        if (response.status < 200 || response.status >= 300) continue;
        const content = response.body;
        if (!content.trim()) continue;
        const parsed = parseSubscriptionContent(content);
        const real = parsed.filter(isRealKey);
        if (real.length > 0) {
          keys = real;
          ok = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!ok || keys.length === 0) {
      await db
        .update(remoteSources)
        .set({ lastStatus: "error", lastFetchedAt: new Date() })
        .where(eq(remoteSources.id, source.id));
      continue;
    }

    const r = await syncRemoteSourceKeys(id, source, keys, { validateKeys });
    totalRefreshed += r.added + r.updated;
  }

  return NextResponse.json({ success: true, refreshed: totalRefreshed });
}
