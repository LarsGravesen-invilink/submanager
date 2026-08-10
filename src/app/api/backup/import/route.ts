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
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backup = await req.json();

    if (!backup.version || !backup.data) {
      return NextResponse.json(
        { error: "Неверный формат файла бекапа" },
        { status: 400 }
      );
    }

    const { data } = backup;
    const steps: string[] = [];

    // 1. Restore settings
    if (data.settings && Array.isArray(data.settings)) {
      for (const s of data.settings) {
        const existing = await db
          .select()
          .from(settings)
          .where(eq(settings.key, s.key))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(settings)
            .set({ value: s.value })
            .where(eq(settings.key, s.key));
        } else {
          await db.insert(settings).values({ key: s.key, value: s.value });
        }
      }
      steps.push(`Настройки: ${data.settings.length}`);
    }

    // 2. Restore subscriptions
    if (data.subscriptions && Array.isArray(data.subscriptions)) {
      // Delete all existing subscriptions (cascade deletes keys, sources, logs)
      const existingSubs = await db.select().from(subscriptions);
      for (const es of existingSubs) {
        await db.delete(subscriptions).where(eq(subscriptions.id, es.id));
      }

      for (const sub of data.subscriptions) {
        const {
          keys: subKeys,
          sources: subSources,
          logs: subLogs,
          ...subData
        } = sub;

        // Parse dates
        const insertData = {
          id: subData.id,
          name: subData.name,
          title: subData.title || "",
          slug: subData.slug,
          isActive: subData.isActive ?? subData.is_active ?? true,
          createdAt: new Date(subData.createdAt || subData.created_at),
          updatedAt: new Date(subData.updatedAt || subData.updated_at),
          expiresAt: subData.expiresAt || subData.expires_at
            ? new Date(subData.expiresAt || subData.expires_at)
            : null,
          autoUpdateMinutes: subData.autoUpdateMinutes ?? subData.auto_update_minutes ?? 60,
          clientUpdateHours: subData.clientUpdateHours ?? subData.client_update_hours ?? 24,
          uniqueHits: subData.uniqueHits ?? subData.unique_hits ?? 0,
          totalHits: subData.totalHits ?? subData.total_hits ?? 0,
          logoUrl: subData.logoUrl ?? subData.logo_url ?? "",
          logoSize: subData.logoSize ?? subData.logo_size ?? "medium",
          pageTitle: subData.pageTitle ?? subData.page_title ?? "",
          showExpiry: subData.showExpiry ?? subData.show_expiry ?? true,
          showUpload: subData.showUpload ?? subData.show_upload ?? false,
          showDownload: subData.showDownload ?? subData.show_download ?? false,
          showTotal: subData.showTotal ?? subData.show_total ?? false,
          totalTrafficGb: subData.totalTrafficGb ?? subData.total_traffic_gb ?? 0,
          usedUploadGb: subData.usedUploadGb ?? subData.used_upload_gb ?? 0,
          usedDownloadGb: subData.usedDownloadGb ?? subData.used_download_gb ?? 0,
        };

        await db.insert(subscriptions).values(insertData);

        // Restore keys
        if (subKeys && Array.isArray(subKeys)) {
          for (const k of subKeys) {
            await db.insert(subscriptionKeys).values({
              id: k.id,
              subscriptionId: insertData.id,
              keyValue: k.keyValue ?? k.key_value,
              customName: k.customName ?? k.custom_name ?? "",
              originalName: k.originalName ?? k.original_name ?? "",
              sourceType: k.sourceType ?? k.source_type ?? "manual",
              sourceUrl: k.sourceUrl ?? k.source_url ?? "",
              isEnabled: k.isEnabled ?? k.is_enabled ?? true,
              sortOrder: k.sortOrder ?? k.sort_order ?? 0,
              createdAt: new Date(k.createdAt || k.created_at || Date.now()),
              keyFingerprint: k.keyFingerprint ?? k.key_fingerprint ?? "",
            });
          }
        }

        // Restore sources
        if (subSources && Array.isArray(subSources)) {
          for (const s of subSources) {
            await db.insert(remoteSources).values({
              id: s.id,
              subscriptionId: insertData.id,
              url: s.url,
              lastFetchedAt: s.lastFetchedAt || s.last_fetched_at
                ? new Date(s.lastFetchedAt || s.last_fetched_at)
                : null,
              lastStatus: s.lastStatus ?? s.last_status ?? "pending",
              selectedKeys: s.selectedKeys ?? s.selected_keys ?? [],
              keyNames: s.keyNames ?? s.key_names ?? {},
              createdAt: new Date(s.createdAt || s.created_at || Date.now()),
            });
          }
        }

        // Restore logs
        if (subLogs && Array.isArray(subLogs)) {
          for (const l of subLogs) {
            await db.insert(accessLogs).values({
              id: l.id,
              subscriptionId: insertData.id,
              ip: l.ip,
              userAgent: l.userAgent ?? l.user_agent ?? "",
              deviceName: l.deviceName ?? l.device_name ?? "",
              deviceType: l.deviceType ?? l.device_type ?? "",
              accessedAt: new Date(l.accessedAt || l.accessed_at || Date.now()),
            });
          }
        }
      }
      steps.push(`Подписки: ${data.subscriptions.length}`);
    }

    return NextResponse.json({
      success: true,
      steps,
      message: "Бекап восстановлен",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: `Ошибка: ${msg}` }, { status: 500 });
  }
}
