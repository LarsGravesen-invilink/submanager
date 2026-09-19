import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { subscriptions, remoteSources, settings } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { parseSubscriptionContent, isRealKey } from "@/lib/keys";
import { rawFetch } from "@/lib/fetch";
import { syncSubscriptionKeys, FetchedSource } from "@/lib/sourceSync";

type SourceRefreshResult = {
  id: string;
  url: string;
  status: "ok" | "error";
  keyCount: number;
  reason: string | null;
};

function publicSourceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
    }
    for (const name of Array.from(url.searchParams.keys())) {
      if (/token|key|auth|pass|password|secret|credential/i.test(name)) {
        url.searchParams.set(name, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return "Некорректный URL";
  }
}

function safeFetchError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Ошибка соединения";
  return message.replace(/https?:\/\/[^\s)]+/gi, "URL").slice(0, 180);
}

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
  const results: SourceRefreshResult[] = [];

  const fetched: FetchedSource[] = [];

  for (const source of sources) {
    let keys: string[] = [];
    let sawEmptyResponse = false;
    let sawUnsupportedContent = false;
    let sawDummyKeys = false;
    let lastHttpStatus: number | null = null;
    let lastFetchError = "";

    for (const ua of USER_AGENTS) {
      try {
        const response = await rawFetch(source.url, ua, { timeoutMs: 15000 });
        if (response.status < 200 || response.status >= 300) {
          lastHttpStatus = response.status;
          continue;
        }
        const content = response.body;
        if (!content.trim()) {
          sawEmptyResponse = true;
          continue;
        }
        const parsed = parseSubscriptionContent(content);
        const real = parsed.filter(isRealKey);
        if (real.length > 0) {
          keys = real;
          break;
        }
        if (parsed.length > 0) sawDummyKeys = true;
        else sawUnsupportedContent = true;
      } catch (cause) {
        lastFetchError = safeFetchError(cause);
      }
    }

    if (keys.length === 0) {
      const reason = sawDummyKeys
        ? "Источник вернул только ключи-заглушки"
        : sawUnsupportedContent
          ? "В ответе нет поддерживаемых ключей"
          : sawEmptyResponse
            ? "Источник вернул пустой ответ"
            : lastHttpStatus !== null
              ? `HTTP ${lastHttpStatus}`
              : lastFetchError || "Не удалось получить ответ";
      await db
        .update(remoteSources)
        .set({ lastStatus: "error", lastFetchedAt: new Date() })
        .where(eq(remoteSources.id, source.id));
      results.push({
        id: source.id,
        url: publicSourceUrl(source.url),
        status: "error",
        keyCount: 0,
        reason,
      });
      continue;
    }

    fetched.push({ id: source.id, url: source.url, keys, keyNames: source.keyNames });
    results.push({
      id: source.id,
      url: publicSourceUrl(source.url),
      status: "ok",
      keyCount: keys.length,
      reason: null,
    });
  }

  if (fetched.length) {
    const r = await syncSubscriptionKeys(id, fetched, { validateKeys });
    totalRefreshed += r.added + r.updated + r.excluded;
  }

  const failedSources = results.filter((result) => result.status === "error").length;
  return NextResponse.json({
    success: true,
    refreshed: totalRefreshed,
    sources: sources.length,
    failedSources,
    results,
  });
}
