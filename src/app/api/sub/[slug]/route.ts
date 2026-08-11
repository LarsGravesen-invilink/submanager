import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  accessLogs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

function isLikelyBrowser(ua: string): boolean {
  const clientPatterns = [
    /clash/i, /v2ray/i, /surge/i, /quantumult/i, /shadowrocket/i,
    /hiddify/i, /nekobox/i, /nekoray/i, /sing-box/i, /stash/i,
    /happ/i, /incy/i, /podkop/i, /forkop/i, /streisand/i,
  ];
  if (clientPatterns.some((p) => p.test(ua))) return false;
  const browserPatterns = [/mozilla/i, /chrome/i, /safari/i, /firefox/i, /edge/i, /opera/i];
  if (browserPatterns.some((p) => p.test(ua))) return true;
  return false;
}

function detectDeviceType(ua: string): string {
  if (!ua) return "unknown";
  const clientPatterns: [RegExp, string][] = [
    [/clash/i, "Clash"], [/v2rayn/i, "V2RayN"], [/v2rayng/i, "V2RayNG"],
    [/v2ray/i, "V2Ray"], [/surge/i, "Surge"], [/quantumult/i, "Quantumult"],
    [/shadowrocket/i, "Shadowrocket"], [/hiddify/i, "Hiddify"],
    [/nekobox/i, "NekoBox"], [/nekoray/i, "NekoRay"], [/sing-box/i, "sing-box"],
    [/stash/i, "Stash"], [/happ/i, "Happ"], [/incy/i, "Incy"],
    [/podkop/i, "Podkop"], [/forkop/i, "Forkop"], [/streisand/i, "Streisand"],
  ];
  for (const [pattern, name] of clientPatterns) {
    if (pattern.test(ua)) return name;
  }
  if (/mobile|android|iphone/i.test(ua)) return "Браузер (мобильный)";
  return "Браузер";
}

/**
 * Sets name on a VPN key.
 * For vmess:// -> sets ps field in base64 JSON.
 * For all others (vless://, trojan://, ss://, hy2://, etc.) -> URL fragment with percent-encoding.
 * 
 * IMPORTANT: encodeURIComponent encodes UTF-8 bytes to percent-encoded format,
 * which is the standard that ALL clients understand correctly for URL fragments.
 * Emoji, Russian, Chinese, etc. are all encoded as %XX sequences.
 */
function setKeyNameForClient(key: string, name: string): string {
  const trimmed = key.trim();

  // vmess:// uses base64-encoded JSON, name is in "ps" field as raw UTF-8
  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      json.ps = name;
      return "vmess://" + Buffer.from(JSON.stringify(json), "utf-8").toString("base64");
    } catch {
      // fallback
    }
  }

  // For all URL-style protocols: name goes after # as percent-encoded UTF-8
  const hashIdx = trimmed.lastIndexOf("#");
  const keyBody = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return keyBody + "#" + encodeURIComponent(name);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.slug, slug))
    .limit(1);

  if (!sub) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const ua = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const deviceType = detectDeviceType(ua);
  const isBrowser = isLikelyBrowser(ua);

  // Log access
  await db.insert(accessLogs).values({
    subscriptionId: sub.id,
    ip,
    userAgent: ua,
    deviceName: deviceType,
    deviceType: isBrowser ? "browser" : "vpn_client",
  });

  // Update counters
  const existingLogs = await db
    .select()
    .from(accessLogs)
    .where(eq(accessLogs.subscriptionId, sub.id));

  const uniqueIps = new Set(existingLogs.map((l) => l.ip));

  await db
    .update(subscriptions)
    .set({
      totalHits: sql`${subscriptions.totalHits} + 1`,
      uniqueHits: uniqueIps.size,
    })
    .where(eq(subscriptions.id, sub.id));

  // Helper
  const redirectToBrowserPage = () => {
    const baseUrl =
      req.headers.get("x-forwarded-proto") === "https"
        ? `https://${req.headers.get("host")}`
        : `${req.nextUrl.protocol}//${req.headers.get("host")}`;
    return NextResponse.redirect(`${baseUrl}/s/${slug}`);
  };

  // Build profile title in the format supported by Hiddify/Happ/Incy/NekoBox/etc:
  // Profile-Title: base64:<utf8-base64>
  const encodeTitle = (text: string) =>
    `base64:${Buffer.from(text, "utf-8").toString("base64")}`;

  // Dummy key for clients that require at least one key (e.g. Incy)
  const DUMMY_KEY = "vless://00000000-0000-0000-0000-000000000000@127.0.0.1:1?encryption=none&type=tcp&security=none";

  // ==== Paused ====
  if (!sub.isActive) {
    if (isBrowser) return redirectToBrowserPage();

    const reason = (sub.pauseReason as string) || "Подписка приостановлена";
    const bKeys = (sub.backupKeys as string[] | null) || [];
    const lines: string[] = [];

    for (let i = 0; i < bKeys.length; i++) {
      const bk = bKeys[i]?.trim();
      if (!bk) continue;
      const bkName = `⚠️Резервный ${i + 1}`;
      if (bk.startsWith("vmess://")) {
        try {
          const decoded = Buffer.from(bk.slice(8), "base64").toString("utf-8");
          const json = JSON.parse(decoded);
          json.ps = bkName;
          lines.push("vmess://" + Buffer.from(JSON.stringify(json), "utf-8").toString("base64"));
        } catch { lines.push(bk); }
      } else {
        const hi = bk.lastIndexOf("#");
        lines.push((hi !== -1 ? bk.slice(0, hi) : bk) + "#" + encodeURIComponent(bkName));
      }
    }

    // If no backup keys, add dummy so clients like Incy can parse the subscription
    if (lines.length === 0) {
      lines.push(DUMMY_KEY + "#" + encodeURIComponent(reason));
    }

    const content = lines.join("\n");
    return new NextResponse(Buffer.from(content, "utf-8").toString("base64"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Title": encodeTitle(reason),
        "Profile-Title-Encode": "base64",
        "Profile-Update-Interval": "1",
      },
    });
  }

  // ==== Expired ====
  const isExpired = sub.expiresAt && new Date(sub.expiresAt) < new Date();

  if (isExpired) {
    if (isBrowser) return redirectToBrowserPage();
    // Dummy key with expiry name so clients like Incy can parse
    const expiredContent = DUMMY_KEY + "#" + encodeURIComponent("🚫ИСТЁК СРОК🚫");
    return new NextResponse(Buffer.from(expiredContent, "utf-8").toString("base64"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Title": encodeTitle("🚫 Подписка истекла"),
        "Profile-Title-Encode": "base64",
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(new Date(sub.expiresAt!).getTime() / 1000)}`,
        "Profile-Update-Interval": "1",
      },
    });
  }

  // ==== Browser ====
  if (isBrowser) return redirectToBrowserPage();

  // ==== VPN Client — return keys ====
  const keys = await db
    .select()
    .from(subscriptionKeys)
    .where(eq(subscriptionKeys.subscriptionId, sub.id));

  const enabledKeys = keys.filter((k) => k.isEnabled);

  const keyLines = enabledKeys.map((k) => {
    const displayName = k.customName || k.originalName || "";
    if (displayName) {
      return setKeyNameForClient(k.keyValue, displayName);
    }
    return k.keyValue;
  });

  // Plain text list, one key per line, then base64 encode entire content
  const content = keyLines.join("\n");
  const base64Content = Buffer.from(content, "utf-8").toString("base64");

  // Profile title as base64-encoded UTF-8
  const profileTitle = sub.title || sub.name;

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${sub.slug}"; filename*=UTF-8''${encodeURIComponent(sub.slug)}`,
    // Supported by Happ/Incy/Hiddify/NekoBox/etc.
    "Profile-Title": encodeTitle(profileTitle),
    "Profile-Title-Encode": "base64",
  };

  // Subscription-Userinfo: traffic and expiry info for clients
  // Only include fields that are enabled in settings
  const infoParts: string[] = [];
  
  if (sub.showUpload) {
    infoParts.push(`upload=${(sub.usedUploadGb || 0) * 1073741824}`);
  } else {
    infoParts.push("upload=0");
  }

  if (sub.showDownload) {
    infoParts.push(`download=${(sub.usedDownloadGb || 0) * 1073741824}`);
  } else {
    infoParts.push("download=0");
  }

  if (sub.showTotal) {
    infoParts.push(`total=${(sub.totalTrafficGb || 0) * 1073741824}`);
  } else {
    infoParts.push("total=0");
  }

  if (sub.showExpiry && sub.expiresAt) {
    infoParts.push(`expire=${Math.floor(new Date(sub.expiresAt).getTime() / 1000)}`);
  }

  // Only add Subscription-Userinfo if there's something to show
  if (sub.showUpload || sub.showDownload || sub.showTotal || (sub.showExpiry && sub.expiresAt)) {
    headers["Subscription-Userinfo"] = infoParts.join("; ");
  }

  if (sub.clientUpdateHours) {
    headers["Profile-Update-Interval"] = String(sub.clientUpdateHours);
  }

  return new NextResponse(base64Content, { headers });
}
