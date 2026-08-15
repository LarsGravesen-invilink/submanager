import { NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, remoteSources, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseSubscriptionContent, isRealKey } from "@/lib/keys";
import { rawFetch } from "@/lib/fetch";
import { syncSubscriptionKeys, FetchedSource } from "@/lib/sourceSync";

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

export async function GET() {
  try {
    const [validateRow] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "smartKeyValidation"))
      .limit(1);
    const validateKeys = validateRow ? validateRow.value !== "false" : true;

    const allSubs = await db.select().from(subscriptions);

    for (const sub of allSubs) {
      if (!sub.isActive) continue;

      const sources = await db
        .select()
        .from(remoteSources)
        .where(eq(remoteSources.subscriptionId, sub.id));

      const fetched: FetchedSource[] = [];

      for (const source of sources) {
        try {
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

          fetched.push({ id: source.id, url: source.url, keys, keyNames: source.keyNames });
        } catch {
          await db
            .update(remoteSources)
            .set({ lastStatus: "error", lastFetchedAt: new Date() })
            .where(eq(remoteSources.id, source.id));
        }
      }

      if (fetched.length) {
        try {
          await syncSubscriptionKeys(sub.id, fetched, { validateKeys });
        } catch (e) {
          console.error("Sync error for subscription", sub.id, e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Cron update error:", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
