import { db } from "@/db";
import { accessLogs, subscriptionReports, subscriptions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import SubPageClient from "./SubPageClient";

export const dynamic = "force-dynamic";

export default async function SubscriptionPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.slug, slug))
    .limit(1);

  if (!sub) {
    notFound();
  }

  const [[latestClientAccess], [latestRenewal]] = await Promise.all([
    db
      .select({ accessedAt: accessLogs.accessedAt })
      .from(accessLogs)
      .where(and(
        eq(accessLogs.subscriptionId, sub.id),
        eq(accessLogs.deviceType, "vpn_client")
      ))
      .orderBy(desc(accessLogs.accessedAt))
      .limit(1),
    db
      .select({ createdAt: subscriptionReports.createdAt })
      .from(subscriptionReports)
      .where(and(
        eq(subscriptionReports.subscriptionId, sub.id),
        eq(subscriptionReports.type, "renewal")
      ))
      .orderBy(desc(subscriptionReports.createdAt))
      .limit(1),
  ]);

  const isExpired = sub.expiresAt !== null && sub.expiresAt.getTime() <= Date.now();
  const renewalRetryAt = latestRenewal
    ? new Date(latestRenewal.createdAt.getTime() + 3 * 60 * 60 * 1000).toISOString()
    : null;

  return (
    <SubPageClient
      key={`${sub.id}:${sub.updatedAt.toISOString()}`}
      slug={sub.slug}
      title={sub.pageTitle || sub.title || sub.name}
      logoUrl={sub.logoUrl || ""}
      logoSize={sub.logoSize || "medium"}
      expiresAt={sub.expiresAt ? sub.expiresAt.toISOString() : null}
      initialIsExpired={isExpired}
      isActive={sub.isActive}
      extraConfigsTitle={sub.extraConfigsTitle || ""}
      extraConfigs={(sub.extraConfigs as {name: string; key: string}[]) || []}
      showTotal={sub.showTotal}
      totalTrafficGb={sub.totalTrafficGb}
      whatsNew={sub.whatsNew || ""}
      lastClientUpdate={latestClientAccess?.accessedAt.toISOString() ?? null}
      renewalRetryAt={renewalRetryAt}
    />
  );
}
