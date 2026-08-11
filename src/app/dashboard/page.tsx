import DashboardClient from "./DashboardClient";
import { getAppSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cfg = await getAppSettings();
  return <DashboardClient initialCfg={cfg} />;
}
