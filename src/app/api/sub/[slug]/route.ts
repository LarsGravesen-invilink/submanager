import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  accessLogs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";

function isLikelyBrowser(ua: string): boolean {
  const browserPatterns = [
    /mozilla/i,
    /chrome/i,
    /safari/i,
    /firefox/i,
    /edge/i,
    /opera/i,
  ];
  const clientPatterns = [
    /clash/i,
    /v2ray/i,
    /surge/i,
    /quantumult/i,
    /shadowrocket/i,
    /hiddify/i,
    /nekobox/i,
    /nekoray/i,
    /sing-box/i,
    /stash/i,
    /happ/i,
    /incy/i,
    /podkop/i,
    /forkop/i,
    /streisand/i,
  ];

  if (clientPatterns.some((p) => p.test(ua))) return false;
  if (browserPatterns.some((p) => p.test(ua))) return true;
  return false;
}

function detectDeviceType(ua: string): string {
  if (!ua) return "unknown";
  const clientPatterns: [RegExp, string][] = [
    [/clash/i, "Clash"],
    [/v2rayn/i, "V2RayN"],
    [/v2rayng/i, "V2RayNG"],
    [/v2ray/i, "V2Ray"],
    [/surge/i, "Surge"],
    [/quantumult/i, "Quantumult"],
    [/shadowrocket/i, "Shadowrocket"],
    [/hiddify/i, "Hiddify"],
    [/nekobox/i, "NekoBox"],
    [/nekoray/i, "NekoRay"],
    [/sing-box/i, "sing-box"],
    [/stash/i, "Stash"],
    [/happ/i, "Happ"],
    [/incy/i, "Incy"],
    [/podkop/i, "Podkop"],
    [/forkop/i, "Forkop"],
    [/streisand/i, "Streisand"],
  ];

  for (const [pattern, name] of clientPatterns) {
    if (pattern.test(ua)) return name;
  }

  if (/mobile|android|iphone/i.test(ua)) return "Браузер (мобильный)";
  return "Браузер";
}

// Proper URL encoding for key names with emoji support
function encodeKeyName(name: string): string {
  try {
    return encodeURIComponent(name);
  } catch {
    return name;
  }
}

// Set name on a VPN key with proper encoding
function setKeyNameEncoded(key: string, name: string): string {
  const trimmed = key.trim();

  // Handle vmess:// base64 JSON format
  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      json.ps = name; // ps field for vmess name
      return "vmess://" + Buffer.from(JSON.stringify(json), "utf-8").toString("base64");
    } catch {
      // fallback to fragment method
    }
  }

  // For other protocols, use URL fragment with proper encoding
  const hashIdx = trimmed.lastIndexOf("#");
  const keyWithoutName = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return keyWithoutName + "#" + encodeKeyName(name);
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

  // Check if paused
  if (!sub.isActive) {
    if (isBrowser) {
      const baseUrl =
        req.headers.get("x-forwarded-proto") === "https"
          ? `https://${req.headers.get("host")}`
          : `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      return NextResponse.redirect(`${baseUrl}/s/${slug}`);
    }
    // Return empty subscription with message for VPN clients
    const expiredContent = "# Подписка приостановлена";
    return new NextResponse(Buffer.from(expiredContent).toString("base64"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Title": Buffer.from("⏸️ Приостановлено", "utf-8").toString("base64"),
      },
    });
  }

  // Check expiry
  const isExpired = sub.expiresAt && new Date(sub.expiresAt) < new Date();
  
  if (isExpired) {
    if (isBrowser) {
      const baseUrl =
        req.headers.get("x-forwarded-proto") === "https"
          ? `https://${req.headers.get("host")}`
          : `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      return NextResponse.redirect(`${baseUrl}/s/${slug}`);
    }
    // Return message for VPN clients when expired
    const expiredContent = "# Подписка истекла";
    return new NextResponse(Buffer.from(expiredContent).toString("base64"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Profile-Title": Buffer.from("❌ Подписка истекла", "utf-8").toString("base64"),
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(new Date(sub.expiresAt!).getTime() / 1000)}`,
      },
    });
  }

  // If browser, redirect to the subscription page
  if (isBrowser) {
    const baseUrl =
      req.headers.get("x-forwarded-proto") === "https"
        ? `https://${req.headers.get("host")}`
        : `${req.nextUrl.protocol}//${req.headers.get("host")}`;
    return NextResponse.redirect(`${baseUrl}/s/${slug}`);
  }

  // For VPN clients, return keys
  const keys = await db
    .select()
    .from(subscriptionKeys)
    .where(eq(subscriptionKeys.subscriptionId, sub.id));

  const enabledKeys = keys.filter((k) => k.isEnabled);

  const keyLines = enabledKeys.map((k) => {
    const displayName = k.customName || k.originalName || "";
    if (displayName) {
      return setKeyNameEncoded(k.keyValue, displayName);
    }
    return k.keyValue;
  });

  // Build subscription content
  const content = keyLines.join("\n");
  const base64Content = Buffer.from(content, "utf-8").toString("base64");

  // Profile title with proper UTF-8 encoding
  const profileTitle = sub.title || sub.name;
  const profileTitleBase64 = Buffer.from(profileTitle, "utf-8").toString("base64");

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${sub.slug}"`,
    "Profile-Title": profileTitleBase64,
  };

  // Add expiry info if set
  if (sub.expiresAt) {
    headers["Subscription-Userinfo"] = `upload=0; download=0; total=0; expire=${Math.floor(new Date(sub.expiresAt).getTime() / 1000)}`;
  }

  if (sub.clientUpdateHours) {
    headers["Profile-Update-Interval"] = String(sub.clientUpdateHours);
  }

  return new NextResponse(base64Content, { headers });
}
