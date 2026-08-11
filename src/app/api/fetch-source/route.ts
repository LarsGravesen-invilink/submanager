import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseSubscriptionContent, extractKeyName, keyFingerprint } from "@/lib/keys";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "URL обязателен" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SubManager/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Ошибка загрузки: ${response.status}` },
        { status: 400 }
      );
    }

    const content = await response.text();
    const keys = parseSubscriptionContent(content);

    const parsed = keys.map((k) => ({
      value: k,
      name: extractKeyName(k),
      fingerprint: keyFingerprint(k),
    }));

    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error: "Источник загружен, но конфигурации не распознаны. Проверьте формат JSON/подписки.",
          status: "error",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ keys: parsed, status: "ok" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    return NextResponse.json({ error: msg, status: "error" }, { status: 400 });
  }
}
