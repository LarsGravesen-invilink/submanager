import { PoolClient } from "pg";
import { pool } from "@/db";

export const ACCESS_RESET_MODES = ["never", "daily", "weekly", "monthly"] as const;
export type AccessResetMode = (typeof ACCESS_RESET_MODES)[number];

const MOSCOW_UTC_OFFSET_HOURS = 3;

export function isAccessResetMode(value: unknown): value is AccessResetMode {
  return typeof value === "string" && ACCESS_RESET_MODES.includes(value as AccessResetMode);
}

/** Returns the current period's 00:00 Europe/Moscow boundary as an absolute instant. */
export function getAccessResetBoundary(mode: Exclude<AccessResetMode, "never">, now = new Date()): Date {
  const moscow = new Date(now.getTime() + MOSCOW_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const year = moscow.getUTCFullYear();
  const month = moscow.getUTCMonth();
  let day = moscow.getUTCDate();

  if (mode === "weekly") {
    const dayOfWeek = moscow.getUTCDay();
    day -= dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  } else if (mode === "monthly") {
    day = 1;
  }

  return new Date(Date.UTC(year, month, day, -MOSCOW_UTC_OFFSET_HOURS));
}

async function clearAccess(client: PoolClient, subscriptionId: string, boundary?: Date): Promise<void> {
  await client.query("DELETE FROM access_logs WHERE subscription_id = $1", [subscriptionId]);
  if (boundary) {
    await client.query(
      "UPDATE subscriptions SET unique_hits = 0, total_hits = 0, access_reset_at = $2 WHERE id = $1",
      [subscriptionId, boundary]
    );
  } else {
    await client.query(
      "UPDATE subscriptions SET unique_hits = 0, total_hits = 0 WHERE id = $1",
      [subscriptionId]
    );
  }
}

/** Clears access data without changing access_reset_at, preserving the next scheduled reset. */
export async function resetAccessManually(subscriptionId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id FROM subscriptions WHERE id = $1 FOR UPDATE",
      [subscriptionId]
    );
    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await clearAccess(client, subscriptionId);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Idempotently resets a subscription once for the current Moscow period. */
export async function resetAccessIfDue(subscriptionId: string, now = new Date()): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      access_reset_mode: AccessResetMode;
      access_reset_at: Date | null;
    }>(
      "SELECT access_reset_mode, access_reset_at FROM subscriptions WHERE id = $1 FOR UPDATE",
      [subscriptionId]
    );
    if (result.rowCount === 0 || result.rows[0].access_reset_mode === "never") {
      await client.query("COMMIT");
      return false;
    }

    const row = result.rows[0];
    const mode = row.access_reset_mode;
    if (mode === "never") {
      await client.query("COMMIT");
      return false;
    }
    const boundary = getAccessResetBoundary(mode, now);
    if (row.access_reset_at && row.access_reset_at.getTime() >= boundary.getTime()) {
      await client.query("COMMIT");
      return false;
    }

    await clearAccess(client, subscriptionId, boundary);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
