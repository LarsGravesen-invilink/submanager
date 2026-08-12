import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  remoteSources,
  accessLogs,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";
import { keyFingerprint, extractKeyName } from "@/lib/keys";

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
    .orderBy(accessLogs.accessedAt)
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
  const body = await req.json();

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
  if (body.extraConfigsTitle !== undefined) updateData.extraConfigsTitle = body.extraConfigsTitle;
  if (body.extraConfigs !== undefined) updateData.extraConfigs = body.extraConfigs;
  if (body.pauseReason !== undefined) updateData.pauseReason = body.pauseReason;
  if (body.backupKeys !== undefined) updateData.backupKeys = body.backupKeys;
  if (body.showExpiry !== undefined) updateData.showExpiry = body.showExpiry;
  if (body.showUpload !== undefined) updateData.showUpload = body.showUpload;
  if (body.showDownload !== undefined) updateData.showDownload = body.showDownload;
  if (body.showTotal !== undefined) updateData.showTotal = body.showTotal;
  if (body.totalTrafficGb !== undefined) updateData.totalTrafficGb = body.totalTrafficGb;
  if (body.usedUploadGb !== undefined) updateData.usedUploadGb = body.usedUploadGb;
  if (body.usedDownloadGb !== undefined) updateData.usedDownloadGb = body.usedDownloadGb;

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

    for (let i = 0; i < body.keys.length; i++) {
      const k = body.keys[i];
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

  return NextResponse.json(sub);
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
