import { db } from "@/db";
import { settings } from "@/db/schema";

export async function getAppSettings(): Promise<Record<string, string>> {
  try {
    const rows = await db.select().from(settings);
    const obj: Record<string, string> = {};
    for (const r of rows) {
      obj[r.key] = r.value;
    }
    return obj;
  } catch {
    return {};
  }
}
