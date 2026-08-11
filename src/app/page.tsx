import LoginClient from "./LoginClient";
import { getAppSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cfg = await getAppSettings();
  return <LoginClient initialCfg={cfg} />;
}
