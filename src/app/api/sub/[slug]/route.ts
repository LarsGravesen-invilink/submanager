import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  subscriptions,
  subscriptionKeys,
  accessLogs,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { setKeyName } from "@/lib/keys";

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

  // If it matches a VPN client pattern, it's not a browser
  if (clientPatterns.some((p) => p.test(ua))) return false;
  // If it matches browser patterns, it is a browser
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

  if (!sub.isActive) {
    return new NextResponse("Subscription paused", { status: 403 });
  }

  // Check expiry
  if (sub.expiresAt && new Date(sub.expiresAt) < new Date()) {
    return new NextResponse("Subscription expired", { status: 403 });
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

  // Update counters - check if IP is unique
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
      return setKeyName(k.keyValue, displayName);
    }
    return k.keyValue;
  });

  // Build subscription content
  const content = keyLines.join("\n");
  const base64Content = Buffer.from(content).toString("base64");

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Disposition": `attachment; filename="${sub.slug}"`,
    "Profile-Title": Buffer.from(sub.title || sub.name).toString("base64"),
    "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${sub.expiresAt ? Math.floor(new Date(sub.expiresAt).getTime() / 1000) : 0}`,
  };

  if (sub.clientUpdateHours) {
    headers["Profile-Update-Interval"] = String(sub.clientUpdateHours);
  }

  return new NextResponse(base64Content, { headers });
}
