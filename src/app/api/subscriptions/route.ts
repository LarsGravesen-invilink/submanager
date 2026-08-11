import { NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, subscriptionKeys, remoteSources } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { keyFingerprint, extractKeyName } from "@/lib/keys";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await db
    .select()
    .from(subscriptions)
    .orderBy(desc(subscriptions.createdAt));

  return NextResponse.json(subs);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      name,
      title,
      keys,
      sources,
      autoUpdateMinutes,
      clientUpdateHours,
      expiresAt,
      logoUrl,
      logoSize,
      pageTitle,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Название обязательно" },
        { status: 400 }
      );
    }

    const slug = uuidv4().slice(0, 12);

    const [sub] = await db
      .insert(subscriptions)
      .values({
        name,
        title: title || "",
        slug,
        autoUpdateMinutes: autoUpdateMinutes || 60,
        clientUpdateHours: clientUpdateHours || 24,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        logoUrl: logoUrl || "",
        logoSize: logoSize || "medium",
        pageTitle: pageTitle || "",
        showExpiry: body.showExpiry !== false,
        showUpload: body.showUpload === true,
        showDownload: body.showDownload === true,
        showTotal: body.showTotal === true,
        totalTrafficGb: body.totalTrafficGb || 0,
        usedUploadGb: body.usedUploadGb || 0,
        usedDownloadGb: body.usedDownloadGb || 0,
      })
      .returning();

    // Insert manual keys
    if (keys && Array.isArray(keys)) {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (!k.value) continue;
        const fp = keyFingerprint(k.value);
        const origName = extractKeyName(k.value);
        await db.insert(subscriptionKeys).values({
          subscriptionId: sub.id,
          keyValue: k.value,
          customName: k.customName || "",
          originalName: origName,
          sourceType: "manual",
          isEnabled: true,
          sortOrder: i,
          keyFingerprint: fp,
        });
      }
    }

    // Insert remote sources
    if (sources && Array.isArray(sources)) {
      for (const src of sources) {
        if (!src.url) continue;
        await db.insert(remoteSources).values({
          subscriptionId: sub.id,
          url: src.url,
          selectedKeys: src.selectedKeys || [],
          keyNames: src.keyNames || {},
          lastStatus: src.lastStatus || "ok",
        });

        // Insert keys from remote sources
        if (src.keys && Array.isArray(src.keys)) {
          for (let i = 0; i < src.keys.length; i++) {
            const k = src.keys[i];
            if (!k.value) continue;
            const fp = keyFingerprint(k.value);
            const origName = extractKeyName(k.value);
            if (
              src.selectedKeys &&
              src.selectedKeys.length > 0 &&
              !src.selectedKeys.includes(fp)
            ) {
              continue;
            }
            await db.insert(subscriptionKeys).values({
              subscriptionId: sub.id,
              keyValue: k.value,
              customName:
                (src.keyNames && src.keyNames[fp]) || k.customName || "",
              originalName: origName,
              sourceType: "remote",
              sourceUrl: src.url,
              isEnabled: true,
              sortOrder: i + 1000,
              keyFingerprint: fp,
            });
          }
        }
      }
    }

    return NextResponse.json(sub);
  } catch (e) {
    console.error("Create subscription error:", e);
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
