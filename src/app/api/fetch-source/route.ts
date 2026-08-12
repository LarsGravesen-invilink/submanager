import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  parseSubscriptionContent,
  extractKeyName,
  keyFingerprint,
} from "@/lib/keys";

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

function isRealKey(key: string): boolean {
  const dummyPatterns = [
    "0.0.0.0:1",
    "00000000-0000-0000-0000-000000000000",
    "127.0.0.1:1",
    "не поддерживается",
    "not supported",
    "данное приложение",
  ];
  const lower = key.toLowerCase();
  return !dummyPatterns.some((p) => lower.includes(p));
}

function header(name: string, headers: Headers): string {
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
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

  // Try both schemes — some panels only listen on http (no SSL), some on https
  const candidates: string[] = [url];
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      candidates.push(parsed.toString());
    } else if (parsed.protocol === "https:") {
      parsed.protocol = "http:";
      candidates.push(parsed.toString());
    }
  } catch { /* keep original */ }

  let bestKeys: { value: string; name: string; fingerprint: string }[] = [];
  let lastError = "";

  let sawHwidUnsupported = false;
  let sawHwidLimit = false;
  let sawHwidMaxDevices = false;
  let sawProviderId = "";
  let sawDummyResponse = false;
  const triedFormats: string[] = [];

  for (const ua of USER_AGENTS) {
    for (const tryUrl of candidates) {
      try {
        const response = await fetch(tryUrl, {
          headers: { "User-Agent": ua },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });

        triedFormats.push(`${tryUrl} (${ua})`);

        if (!response.ok) {
          lastError = `HTTP ${response.status} (${tryUrl})`;
          continue;
        }

        // Collect diagnostics from headers
        if (header("x-hwid-not-supported", response.headers) === "true") {
          sawHwidUnsupported = true;
        }
        if (header("x-hwid-limit", response.headers) === "true") {
          sawHwidLimit = true;
        }
        if (header("x-hwid-max-devices-reached", response.headers) === "true") {
          sawHwidMaxDevices = true;
        }
        if (header("providerid", response.headers)) {
          sawProviderId = header("providerid", response.headers);
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
          break;
        }

        if (keys.length > 0 && realKeys.length === 0) {
          sawDummyResponse = true;
          lastError = `Сервер вернул заглушку вместо реальных конфигураций (${tryUrl}).`;
          continue;
        }
      } catch (e) {
        lastError = `${e instanceof Error ? e.message : "Ошибка загрузки"} (${tryUrl})`;
      }
    }
    if (bestKeys.length > 0) break;
  }

  // Special diagnostic pass for Happ/HWID-protected sources
  if (bestKeys.length === 0) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Happ/4.7.0",
          "X-Hwid": "aaaaaaaa-537f-4c45-a479-ee0b6cf035f7",
          "X-Device-Os": "Android",
          "X-Device-Model": "Pixel 8",
          "X-Ver-Os": "14",
          "X-Device-Locale": "ru",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (header("x-hwid-max-devices-reached", response.headers) === "true") {
        sawHwidMaxDevices = true;
      }
      if (header("x-hwid-limit", response.headers) === "true") {
        sawHwidLimit = true;
      }
      if (header("providerid", response.headers)) {
        sawProviderId = header("providerid", response.headers);
      }
    } catch {
      // ignore diagnostic failure
    }
  }

  if (bestKeys.length > 0) {
    return NextResponse.json({
      keys: bestKeys,
      status: "ok",
    });
  }

  // Return explicit protected-source diagnostics
  if (sawHwidUnsupported || sawHwidLimit || sawHwidMaxDevices || sawProviderId) {
    let message = "Источник защищён клиентской авторизацией (Happ/Remnawave HWID). ";

    if (sawHwidUnsupported) {
      message += "Сервер требует x-hwid и клиентские заголовки. ";
    }
    if (sawHwidMaxDevices) {
      message += "Даже с тестовым HWID сервер сообщает: лимит устройств уже достигнут. ";
    } else if (sawHwidLimit) {
      message += "Сервер включает HWID-лимит устройств. ";
    }
    if (sawDummyResponse) {
      message += "Вместо реальных конфигураций сервер отдаёт заглушку для неподдерживаемых клиентов. ";
    }
    message += "Извлечь реальные конфиги без валидного HWID уже привязанного устройства невозможно.";

    return NextResponse.json(
      {
        error: message,
        status: "error",
        diagnostics: {
          protection: "hwid",
          providerId: sawProviderId || null,
          hwidUnsupported: sawHwidUnsupported,
          hwidLimit: sawHwidLimit,
          hwidMaxDevicesReached: sawHwidMaxDevices,
          triedFormats,
        },
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      error:
        lastError ||
        "Не удалось извлечь конфигурации из источника. Сервер может не поддерживать стандартные форматы подписок.",
      status: "error",
      diagnostics: {
        triedFormats,
      },
    },
    { status: 400 }
  );
}
