import { NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, subscriptionKeys, remoteSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  parseSubscriptionContent,
  extractKeyName,
  keyFingerprint,
} from "@/lib/keys";

export async function GET() {
  try {
    const allSubs = await db.select().from(subscriptions);

    for (const sub of allSubs) {
      if (!sub.isActive) continue;

      const sources = await db
        .select()
        .from(remoteSources)
        .where(eq(remoteSources.subscriptionId, sub.id));

      for (const source of sources) {
        try {
          const response = await fetch(source.url, {
            headers: { "User-Agent": "SubManager/1.0" },
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            await db
              .update(remoteSources)
              .set({ lastStatus: "error", lastFetchedAt: new Date() })
              .where(eq(remoteSources.id, source.id));
            continue;
          }

          const content = await response.text();
          const keys = parseSubscriptionContent(content);

          // Delete old remote keys from this source
          const existingKeys = await db
            .select()
            .from(subscriptionKeys)
            .where(eq(subscriptionKeys.subscriptionId, sub.id));

          const remoteKeysFromSource = existingKeys.filter(
            (k) => k.sourceType === "remote" && k.sourceUrl === source.url
          );

          // Build set of new fingerprints
          const newFps = new Set(keys.map((k) => keyFingerprint(k)));

          // Remove keys that no longer exist
          for (const old of remoteKeysFromSource) {
            if (!newFps.has(old.keyFingerprint)) {
              await db
                .delete(subscriptionKeys)
                .where(eq(subscriptionKeys.id, old.id));
            }
          }

          // Add/update keys
          const existingFps = new Set(
            remoteKeysFromSource.map((k) => k.keyFingerprint)
          );
          const selectedKeys = (source.selectedKeys || []) as string[];
          const keyNames = (source.keyNames || {}) as Record<string, string>;

          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const fp = keyFingerprint(k);

            // If selectedKeys is set and non-empty, only include selected
            if (selectedKeys.length > 0 && !selectedKeys.includes(fp)) {
              continue;
            }

            const origName = extractKeyName(k);
            const customName = keyNames[fp] || "";

            if (existingFps.has(fp)) {
              // Update existing key value (might have changed params)
              await db
                .update(subscriptionKeys)
                .set({
                  keyValue: k,
                  originalName: origName,
                })
                .where(eq(subscriptionKeys.keyFingerprint, fp));
            } else {
              // Add new key
              await db.insert(subscriptionKeys).values({
                subscriptionId: sub.id,
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
          }

          await db
            .update(remoteSources)
            .set({ lastStatus: "ok", lastFetchedAt: new Date() })
            .where(eq(remoteSources.id, source.id));
        } catch {
          await db
            .update(remoteSources)
            .set({ lastStatus: "error", lastFetchedAt: new Date() })
            .where(eq(remoteSources.id, source.id));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Cron update error:", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
