import { db } from "@/db";
import { subscriptionKeys, remoteSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { keyFingerprint, extractKeyName } from "@/lib/keys";
import { filterAliveKeys } from "@/lib/keyHealth";

export interface SourceInput {
  id: string;
  url: string;
  selectedKeys?: string[] | null;
  keyNames?: Record<string, string> | null;
}

export interface SyncResult {
  added: number;
  updated: number;
  excluded: number;
  skipped: number;
}

/**
 * Synchronizes a subscription's keys from a single remote source.
 *
 * Rules (per requirements):
 *  - Keys present in the source are added (new) at the end or updated (existing).
 *  - Existing keys keep their settings: customName, isEnabled, sortOrder.
 *  - Keys that disappeared from the source are EXCLUDED (isEnabled = false),
 *    preserving their settings for a possible return.
 *  - Fully identical keys (same value) are de-duplicated.
 *  - When validateKeys is on, malformed / non-working keys are skipped.
 */
export async function syncRemoteSourceKeys(
  subId: string,
  source: SourceInput,
  fetchedKeys: string[],
  opts: { validateKeys?: boolean } = {}
): Promise<SyncResult> {
  let keys = fetchedKeys;

  if (opts.validateKeys) {
    keys = await filterAliveKeys(keys);
  }

  // Remove fully identical duplicates (by value), keep first occurrence
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const k of keys) {
    const norm = k.trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    deduped.push(k);
  }
  keys = deduped;

  const presentFps = keys.map((k) => keyFingerprint(k));
  const presentFpSet = new Set(presentFps);

  const existing = await db
    .select()
    .from(subscriptionKeys)
    .where(eq(subscriptionKeys.subscriptionId, subId));

  const remoteFromSource = existing.filter(
    (k) => k.sourceType === "remote" && k.sourceUrl === source.url
  );

  const existingByFp = new Map<string, (typeof remoteFromSource)[number]>();
  for (const k of remoteFromSource) existingByFp.set(k.keyFingerprint, k);

  let maxOrder = 0;
  for (const k of existing) maxOrder = Math.max(maxOrder, k.sortOrder);

  let added = 0;
  let updated = 0;

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const fp = presentFps[i];
    const origName = extractKeyName(k);
    const customName = source.keyNames?.[fp] || "";
    const row = existingByFp.get(fp);
    if (row) {
      await db
        .update(subscriptionKeys)
        .set({
          keyValue: k,
          originalName: origName,
          isEnabled: row.isEnabled,
        })
        .where(eq(subscriptionKeys.id, row.id));
      updated++;
    } else {
      await db.insert(subscriptionKeys).values({
        subscriptionId: subId,
        keyValue: k,
        customName,
        originalName: origName,
        sourceType: "remote",
        sourceUrl: source.url,
        isEnabled: true,
        sortOrder: maxOrder + 1 + i,
        keyFingerprint: fp,
      });
      added++;
    }
  }

  let excluded = 0;
  for (const old of remoteFromSource) {
    if (!presentFpSet.has(old.keyFingerprint)) {
      if (old.isEnabled) {
        await db
          .update(subscriptionKeys)
          .set({ isEnabled: false })
          .where(eq(subscriptionKeys.id, old.id));
      }
      excluded++;
    }
  }

  const newKeyNames: Record<string, string> = { ...(source.keyNames || {}) };
  for (let i = 0; i < keys.length; i++) {
    const fp = presentFps[i];
    const nm = extractKeyName(keys[i]);
    if (nm) newKeyNames[fp] = nm;
  }

  await db
    .update(remoteSources)
    .set({
      selectedKeys: presentFps,
      keyNames: newKeyNames,
      lastStatus: "ok",
      lastFetchedAt: new Date(),
    })
    .where(eq(remoteSources.id, source.id));

  return { added, updated, excluded, skipped: 0 };
}
