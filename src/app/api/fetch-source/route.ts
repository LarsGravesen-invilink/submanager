import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseSubscriptionContent, extractKeyName, keyFingerprint } from "@/lib/keys";

// User-Agents to try, in order of priority
const USER_AGENTS = [
  "Happ/4.7.0",
  "Hiddify/2.0.0",
  "v2rayNG/1.8.20",
  "clash-meta",
  "sing-box/1.8.0",
  "Streisand/1.6.0",
  "SubManager/1.0",
];

// Filter out dummy/stub keys that servers return for unsupported clients
function isRealKey(key: string): boolean {
  const dummyPatterns = [
    "0.0.0.0:1",
    "00000000-0000-0000-0000-000000000000",
    "127.0.0.1:1",
    "не поддерживается",
    "not supported",
  ];
  const lower = key.toLowerCase();
  return !dummyPatterns.some((p) => lower.includes(p));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url } = await req.json();
  if (!url) {
    return NextResponse.json({ error: "URL обязателен" }, { status: 400 });
  }

  // Try multiple User-Agents until we get real keys
  let bestKeys: { value: string; name: string; fingerprint: string }[] = [];
  let lastError = "";

  for (const ua of USER_AGENTS) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": ua },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const content = await response.text();
      if (!content.trim()) continue;

      const keys = parseSubscriptionContent(content);
      const realKeys = keys.filter(isRealKey);

      if (realKeys.length > 0) {
        bestKeys = realKeys.map((k) => ({
          value: k,
          name: extractKeyName(k),
          fingerprint: keyFingerprint(k),
        }));
        break; // Found real keys, stop trying
      }

      // Even if keys were found but all are dummies, keep trying other UAs
      if (keys.length > 0 && realKeys.length === 0) {
        lastError = "Сервер вернул заглушку. Пробуем другой формат...";
        continue;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Ошибка загрузки";
    }
  }

  if (bestKeys.length > 0) {
    return NextResponse.json({ keys: bestKeys, status: "ok" });
  }

  return NextResponse.json(
    {
      error: lastError || "Не удалось извлечь конфигурации из источника. Сервер может не поддерживать стандартные форматы подписок.",
      status: "error",
    },
    { status: 400 }
  );
}
