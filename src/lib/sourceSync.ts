import { db } from "@/db";
import { subscriptionKeys, remoteSources } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { keyFingerprint, extractKeyName } from "@/lib/keys";
import { filterAliveKeys } from "@/lib/keyHealth";

export interface FetchedSource {
  id: string;
  url: string;
  keys: string[];
  keyNames?: Record<string, string> | null;
}

export interface SyncResult {
  added: number;
  updated: number;
  excluded: number;
  skipped: number;
}

/**
 * Synchronizes ALL remote sources of a subscription at once.
 *
 * Core invariant: one physical key (unique value / fingerprint) => exactly one
 * row, no matter how many sources it appears in or how many protocols a single
 * 3x-UI client exposes.
 *
 * Matching rules:
 *  - Match existing rows by exact fingerprint first. This is always correct and
 *    is what prevents cross-source and multi-protocol duplicate accumulation.
 *  - If a key's value/transport changed but its original name (remark) is the
 *    same AND the old row's fingerprint is no longer present in any source,
 *    treat it as the same logical key: update in place, preserving the user's
 *    customName and sortOrder.
 *  - Keys absent from every source are deleted completely (no garbage buildup).
 *  - Pre-existing duplicate rows that share an identical fingerprint are
 *    collapsed to a single row (extra copies removed).
 */
export async function syncSubscriptionKeys(
  subId: string,
  fetched: FetchedSource[],
  opts: { validateKeys?: boolean } = {}
): Promise<SyncResult> {
  // Flatten every fetched key across all sources.
  const flat: { source: FetchedSource; key: string }[] = [];
  for (const src of fetched) {
    for (const k of src.keys) flat.push({ source: src, key: k });
  }

  // Optional health/ping check — compute alive set, but never drop dead keys
  // here. They are kept (disabled) so they can return; only truly absent keys
  // are deleted.
  let aliveSet: Set<string> | null = null;
  if (opts.validateKeys) {
    const allKeys = flat.map((f) => f.key);
    aliveSet = new Set(await filterAliveKeys(allKeys));
  }

  // Normalize + dedupe strictly by fingerprint (one physical key => one row).
  interface Norm {
    key: string;
    fp: string;
    origName: string;
    alive: boolean;
    url: string;
    sourceId: string;
    keyNames?: Record<string, string> | null;
  }
  const normList: Norm[] = [];
  const fpSeen = new Set<string>();
  for (const f of flat) {
    const key = f.key.trim();
    if (!key) continue;
    const fp = keyFingerprint(key);
    if (fpSeen.has(fp)) continue;
    fpSeen.add(fp);
    const origName = extractKeyName(key);
    const alive = !aliveSet || aliveSet.has(key);
    normList.push({
      key,
      fp,
      origName,
      alive,
      url: f.source.url,
      sourceId: f.source.id,
      keyNames: f.source.keyNames,
    });
  }

  const existing = await db
    .select()
    .from(subscriptionKeys)
    .where(eq(subscriptionKeys.subscriptionId, subId));

  const existingByFp = new Map<string, (typeof existing)[number]>();
  const existingByName = new Map<string, (typeof existing)[number]>();
  for (const k of existing) {
    if (k.keyFingerprint) existingByFp.set(k.keyFingerprint, k);
    if (k.originalName) existingByName.set(k.originalName, k);
  }

  const presentFps = new Set(normList.map((n) => n.fp));
  const fetchedUrls = new Set(fetched.map((s) => s.url));
  const consumed = new Set<string>();

  let maxOrder = 0;
  for (const k of existing) maxOrder = Math.max(maxOrder, k.sortOrder);

  const inserts: (typeof subscriptionKeys.$inferInsert)[] = [];
  const updates: { id: string; key: string; fp: string; origName: string; isEnabled: boolean }[] = [];
  let added = 0;
  let updated = 0;

  for (const n of normList) {
    // 1) exact fingerprint match (same value)
    let row = existingByFp.get(n.fp);

    // 2) same logical key whose transport/value changed but name is stable and
    //    the old fingerprint is no longer present anywhere.
    if (!row && n.origName) {
      const byName = existingByName.get(n.origName);
      if (
        byName &&
        !consumed.has(byName.id) &&
        !presentFps.has(byName.keyFingerprint ?? "")
      ) {
        row = byName;
      }
    }

    if (row) {
      consumed.add(row.id);
      const isEnabled = row.isEnabled;
      if (
        row.keyValue !== n.key ||
        row.keyFingerprint !== n.fp ||
        row.originalName !== n.origName ||
        row.isEnabled !== isEnabled
      ) {
        updates.push({
          id: row.id,
          key: n.key,
          fp: n.fp,
          origName: n.origName,
          isEnabled,
        });
        updated++;
      }
      continue;
    }

    // 3) brand new key. Preserve the user's custom name / order if an old,
    //    now-absent row shared the same original name (so a transport change
    //    keeps the name the user assigned). No fingerprint reassignment happens
    //    here, which previously caused duplicate rows to keep piling up.
    let carryCustom = "";
    let carryOrder = maxOrder + inserts.length + 1;
    if (n.origName) {
      const byName = existingByName.get(n.origName);
      if (
        byName &&
        !consumed.has(byName.id) &&
        !presentFps.has(byName.keyFingerprint ?? "")
      ) {
        carryCustom = byName.customName || "";
        carryOrder = byName.sortOrder;
        consumed.add(byName.id); // will be garbage-collected (replaced)
      }
    }

    const customName = carryCustom || n.keyNames?.[n.fp] || "";
    inserts.push({
      subscriptionId: subId,
      keyValue: n.key,
      customName,
      originalName: n.origName,
      sourceType: "remote",
      sourceUrl: n.url,
      isEnabled: true,
      sortOrder: carryOrder,
      keyFingerprint: n.fp,
    });
    added++;
  }

  // Garbage: existing rows not matched and whose fingerprint is absent everywhere.
  const orphanIds = existing
    .filter(
      (k) =>
        k.sourceType === "remote" &&
        fetchedUrls.has(k.sourceUrl ?? "") &&
        !consumed.has(k.id) &&
        !presentFps.has(k.keyFingerprint ?? "")
    )
    .map((k) => k.id);

  // Collapse pre-existing duplicate rows that share an identical fingerprint
  // (legacy accumulation from earlier versions). Keep the matched/consumed row
  // if possible, otherwise an enabled one.
  const fpKeeper = new Map<string, string>();
  const dupIds: string[] = [];
  for (const k of existing.filter(
    (e) => e.sourceType === "remote" && fetchedUrls.has(e.sourceUrl ?? "")
  )) {
    const f = k.keyFingerprint ?? "";
    if (!f) continue;
    const keeper = fpKeeper.get(f);
    if (!keeper) {
      fpKeeper.set(f, k.id);
      continue;
    }
    const keeperRow = existing.find((e) => e.id === keeper)!;
    if (consumed.has(k.id) && !consumed.has(keeper)) {
      dupIds.push(keeper);
      fpKeeper.set(f, k.id);
    } else if (!consumed.has(k.id) && !consumed.has(keeper) && k.isEnabled && !keeperRow.isEnabled) {
      dupIds.push(keeper);
      fpKeeper.set(f, k.id);
    } else {
      dupIds.push(k.id);
    }
  }

  const deleteIds = Array.from(new Set([...orphanIds, ...dupIds]));

  if (inserts.length) {
    await db.insert(subscriptionKeys).values(inserts);
  }
  if (updates.length) {
    for (const u of updates) {
      await db
        .update(subscriptionKeys)
        .set({
          keyValue: u.key,
          originalName: u.origName,
          keyFingerprint: u.fp,
          isEnabled: u.isEnabled,
        })
        .where(eq(subscriptionKeys.id, u.id));
    }
  }
  if (deleteIds.length) {
    await db
      .delete(subscriptionKeys)
      .where(inArray(subscriptionKeys.id, deleteIds));
  }

  // Update each remote source's metadata (selected keys + names + status).
  for (const src of fetched) {
    const srcFps = src.keys
      .map((k) => keyFingerprint(k.trim()))
      .filter((fp, i, arr) => fp && arr.indexOf(fp) === i);
    const newKeyNames: Record<string, string> = { ...(src.keyNames || {}) };
    for (const k of src.keys) {
      const fp = keyFingerprint(k.trim());
      const nm = extractKeyName(k);
      if (fp && nm) newKeyNames[fp] = nm;
    }
    await db
      .update(remoteSources)
      .set({
        selectedKeys: srcFps,
        keyNames: newKeyNames,
        lastStatus: "ok",
        lastFetchedAt: new Date(),
      })
      .where(eq(remoteSources.id, src.id));
  }

  return { added, updated, excluded: deleteIds.length, skipped: 0 };
}
