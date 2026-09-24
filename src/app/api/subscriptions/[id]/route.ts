import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  remoteSources,
  accessLogs,
  settings,
  subscriptionReports,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { keyFingerprint, extractKeyName } from "@/lib/keys";
import { filterAliveKeys } from "@/lib/keyHealth";
import { isAccessResetMode } from "@/lib/accessReset";

async function getSmartValidation(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "smartKeyValidation"))
      .limit(1);
    if (!row) return false;
    return row.value === "true";
  } catch {
    return false;
  }
}

export async function GET(
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
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const keys = await db
    .select()
    .from(subscriptionKeys)
    .where(eq(subscriptionKeys.subscriptionId, id))
    .orderBy(asc(subscriptionKeys.sortOrder));

  const sources = await db
    .select()
    .from(remoteSources)
    .where(eq(remoteSources.subscriptionId, id));

  const logs = await db
    .select()
    .from(accessLogs)
    .where(eq(accessLogs.subscriptionId, id))
    .orderBy(desc(accessLogs.accessedAt))
    .limit(100);

  return NextResponse.json({ ...sub, keys, sources, logs });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();

    if (body.removeSourceIds !== undefined) {
      if (!Array.isArray(body.removeSourceIds) || body.removeSourceIds.some((sourceId: unknown) => typeof sourceId !== "string")) {
        return NextResponse.json({ error: "Неверный формат идентификаторов источников" }, { status: 400 });
      }

      const sourceIds = [...new Set(body.removeSourceIds as string[])];
      if (sourceIds.length === 0) {
        return NextResponse.json({ success: true, removedSourceIds: [], removedKeys: 0 });
      }

      const result = await db.transaction(async (tx) => {
        const [ownedSubscription] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.id, id))
          .limit(1);
        if (!ownedSubscription) return null;

        const removedSourceIds: string[] = [];
        let removedKeys = 0;
        for (const sourceId of sourceIds) {
          const [source] = await tx
            .select({ id: remoteSources.id, url: remoteSources.url })
            .from(remoteSources)
            .where(and(eq(remoteSources.id, sourceId), eq(remoteSources.subscriptionId, id)))
            .limit(1);
          if (!source) continue;

          const [duplicate] = await tx
            .select({ id: remoteSources.id })
            .from(remoteSources)
            .where(and(eq(remoteSources.subscriptionId, id), eq(remoteSources.url, source.url), ne(remoteSources.id, source.id)))
            .limit(1);

          if (!duplicate) {
            const deletedKeys = await tx
              .delete(subscriptionKeys)
              .where(and(eq(subscriptionKeys.subscriptionId, id), eq(subscriptionKeys.sourceUrl, source.url)))
              .returning({ id: subscriptionKeys.id });
            removedKeys += deletedKeys.length;
          }
          await tx.delete(remoteSources).where(and(eq(remoteSources.id, source.id), eq(remoteSources.subscriptionId, id)));
          removedSourceIds.push(source.id);
        }
        return { removedSourceIds, removedKeys };
      });

      if (!result) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      return NextResponse.json({ success: true, ...result });
    }

    const validateKeys = await getSmartValidation();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.title !== undefined) updateData.title = body.title;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.autoUpdateMinutes !== undefined)
    updateData.autoUpdateMinutes = body.autoUpdateMinutes;
  if (body.clientUpdateHours !== undefined)
    updateData.clientUpdateHours = body.clientUpdateHours;
  if (body.expiresAt !== undefined)
    updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
  if (body.logoSize !== undefined) updateData.logoSize = body.logoSize;
  if (body.pageTitle !== undefined) updateData.pageTitle = body.pageTitle;
  if (body.whatsNew !== undefined) updateData.whatsNew = String(body.whatsNew).trim();
  if (body.extraConfigsTitle !== undefined)
    updateData.extraConfigsTitle = String(body.extraConfigsTitle).trim();
  if (body.extraConfigs !== undefined) {
    if (!Array.isArray(body.extraConfigs)) {
      return NextResponse.json({ error: "Неверный формат дополнительных конфигов" }, { status: 400 });
    }
    updateData.extraConfigs = body.extraConfigs
      .filter((item: unknown): item is { name: unknown; key: unknown } => {
        return !!item && typeof item === "object" && "name" in item && "key" in item;
      })
      .map((item: { name: unknown; key: unknown }) => ({
        name: String(item.name ?? "").trim(),
        key: String(item.key ?? "").trim(),
      }))
      .filter((item: { name: string; key: string }) => item.name && item.key);
  }
  if (body.pauseReason !== undefined) updateData.pauseReason = body.pauseReason;
  if (body.backupKeys !== undefined) updateData.backupKeys = body.backupKeys;
  if (body.showExpiry !== undefined) updateData.showExpiry = body.showExpiry;
  if (body.showUpload !== undefined) updateData.showUpload = body.showUpload;
  if (body.showDownload !== undefined) updateData.showDownload = body.showDownload;
  if (body.showTotal !== undefined) updateData.showTotal = body.showTotal;
  if (body.totalTrafficGb !== undefined) updateData.totalTrafficGb = body.totalTrafficGb;
  if (body.usedUploadGb !== undefined) updateData.usedUploadGb = body.usedUploadGb;
  if (body.usedDownloadGb !== undefined) updateData.usedDownloadGb = body.usedDownloadGb;
  if (body.accessResetMode !== undefined) {
    if (!isAccessResetMode(body.accessResetMode)) {
      return NextResponse.json({ error: "Неверный режим сброса статистики" }, { status: 400 });
    }
    updateData.accessResetMode = body.accessResetMode;
    updateData.accessResetAt = null;
  }

   if (body.addSources !== undefined) {
     if (body.keys !== undefined || body.sources !== undefined || !Array.isArray(body.addSources) ||
       body.addSources.some((src: unknown) => {
         if (!src || typeof src !== "object") return true;
         const s = src as Record<string, unknown>;
         return typeof s.url !== "string" || !s.url.trim() ||
           !Array.isArray(s.selectedKeys) || s.selectedKeys.some((fp: unknown) => typeof fp !== "string") ||
           !s.keyNames || typeof s.keyNames !== "object" || Array.isArray(s.keyNames) ||
           Object.values(s.keyNames).some((name) => typeof name !== "string") ||
           s.lastStatus !== "ok" || !Array.isArray(s.keys) ||
           s.keys.some((key: unknown) => !key || typeof key !== "object" ||
             typeof (key as { value?: unknown }).value !== "string" ||
             typeof (key as { customName?: unknown }).customName !== "string");
       })) {
       return NextResponse.json({ error: "Неверный формат новых источников" }, { status: 400 });
     }

     const candidates = (body.addSources as { keys: { value: string; customName: string }[] }[])
       .flatMap((src) => src.keys.map((key) => key.value.trim())).filter(Boolean);
     const alive = validateKeys && candidates.length ? new Set(await filterAliveKeys(candidates)) : null;
     const result = await db.transaction(async (tx) => {
       const [existing] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
       if (!existing) return null;
        const oldKeys = await tx.select({ id: subscriptionKeys.id, keyValue: subscriptionKeys.keyValue, customName: subscriptionKeys.customName, sortOrder: subscriptionKeys.sortOrder })
          .from(subscriptionKeys).where(eq(subscriptionKeys.subscriptionId, id));
        const seen = new Map(oldKeys.map((key) => [keyFingerprint(key.keyValue), key]));

       let sortOrder = oldKeys.reduce((max, key) => Math.max(max, key.sortOrder), -1) + 1;
       for (const src of body.addSources as { url: string; selectedKeys: string[]; keyNames: Record<string, string>; lastStatus: string; keys: { value: string; customName: string }[] }[]) {
         await tx.insert(remoteSources).values({
           subscriptionId: id, url: src.url, selectedKeys: src.selectedKeys,
           keyNames: src.keyNames, lastStatus: src.lastStatus,
         });
          for (const key of src.keys) {
            const norm = key.value.trim();
            if (!norm) continue;
            const fp = keyFingerprint(norm);
            const existingKey = seen.get(fp);
            if (existingKey) {
              if (key.customName.trim() && !existingKey.customName) {
                await tx.update(subscriptionKeys).set({ customName: key.customName.trim() })
                  .where(eq(subscriptionKeys.id, existingKey.id));
                existingKey.customName = key.customName.trim();
              }
              continue;
            }
            if (alive && !alive.has(norm)) continue;
            const [inserted] = await tx.insert(subscriptionKeys).values({
              subscriptionId: id, keyValue: key.value, customName: key.customName,
              originalName: extractKeyName(key.value), sourceType: "remote", sourceUrl: src.url,
              isEnabled: true, sortOrder: sortOrder++, keyFingerprint: fp,
            }).returning({ id: subscriptionKeys.id });
            seen.set(fp, { id: inserted.id, keyValue: key.value, customName: key.customName, sortOrder: sortOrder - 1 });
          }

       }
       const [updated] = await tx.update(subscriptions).set(updateData).where(eq(subscriptions.id, id)).returning();
       const requestedExpiry = body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined;
       if (existing.expiresAt && existing.expiresAt.getTime() < Date.now() &&
         (requestedExpiry === null || (requestedExpiry && requestedExpiry.getTime() > Date.now()))) {
         await tx.delete(subscriptionReports).where(and(
           eq(subscriptionReports.subscriptionId, id), eq(subscriptionReports.type, "renewal")
         ));
       }
       return updated;
     });
     if (!result) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
     return NextResponse.json(result);
   }

   const previousExpiry = body.expiresAt !== undefined
    ? (await db.select({ expiresAt: subscriptions.expiresAt }).from(subscriptions).where(eq(subscriptions.id, id)).limit(1))[0]?.expiresAt
    : undefined;
  const requestedExpiry = body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined;

  const [sub] = await db
    .update(subscriptions)
    .set(updateData)
    .where(eq(subscriptions.id, id))
    .returning();

  // If keys are provided, rebuild them
  if (body.keys && Array.isArray(body.keys)) {
    await db
      .delete(subscriptionKeys)
      .where(eq(subscriptionKeys.subscriptionId, id));

    // Connection fingerprint ignores display names; retain a custom name when duplicates occur.
    const seenValues = new Map<string, (typeof body.keys)[number]>();
    let dedupedKeys: typeof body.keys = [];
    for (const k of body.keys) {
      if (!k.value?.trim()) continue;
      const fp = keyFingerprint(k.value);
      const existing = seenValues.get(fp);
      if (existing) {
        if (!existing.customName?.trim() && k.customName?.trim()) existing.customName = k.customName;
        continue;
      }
      seenValues.set(fp, k);
      dedupedKeys.push(k);
    }

    if (validateKeys && dedupedKeys.length > 0) {
      const alive = new Set(
        await filterAliveKeys(dedupedKeys.map((k: any) => k.value))
      );
      dedupedKeys = dedupedKeys.filter((k: any) => alive.has(k.value));
    }

    for (let i = 0; i < dedupedKeys.length; i++) {
      const k = dedupedKeys[i];
      if (!k.value) continue;
      const fp = keyFingerprint(k.value);
      const origName = extractKeyName(k.value);
      await db.insert(subscriptionKeys).values({
        subscriptionId: id,
        keyValue: k.value,
        customName: k.customName || "",
        originalName: origName,
        sourceType: k.sourceType || "manual",
        sourceUrl: k.sourceUrl || "",
        isEnabled: k.isEnabled !== false,
        sortOrder: i,
        keyFingerprint: fp,
      });
    }
  }

  // If sources are provided, rebuild them
  if (body.sources && Array.isArray(body.sources)) {
    await db
      .delete(remoteSources)
      .where(eq(remoteSources.subscriptionId, id));

    for (const src of body.sources) {
      if (!src.url) continue;
      await db.insert(remoteSources).values({
        subscriptionId: id,
        url: src.url,
        selectedKeys: src.selectedKeys || [],
        keyNames: src.keyNames || {},
        lastStatus: src.lastStatus || "ok",
      });
    }
  }

  if (previousExpiry && previousExpiry.getTime() < Date.now() && (requestedExpiry === null || (requestedExpiry && requestedExpiry.getTime() > Date.now()))) {
    await db.delete(subscriptionReports).where(and(
      eq(subscriptionReports.subscriptionId, id),
      eq(subscriptionReports.type, "renewal")
    ));
  }

    return NextResponse.json(sub);
  } catch (error) {
    console.error("Failed to update subscription", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка сохранения подписки" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await db.delete(subscriptions).where(eq(subscriptions.id, id));
  return NextResponse.json({ success: true });
}
