import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
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

  return (
    <SubPageClient
      slug={sub.slug}
      title={sub.pageTitle || sub.title || sub.name}
      logoUrl={sub.logoUrl || ""}
      logoSize={sub.logoSize || "medium"}
      expiresAt={sub.expiresAt ? sub.expiresAt.toISOString() : null}
      isActive={sub.isActive}
      extraConfigsTitle={sub.extraConfigsTitle || ""}
      extraConfigs={(sub.extraConfigs as {name: string; key: string}[]) || []}
    />
  );
}
