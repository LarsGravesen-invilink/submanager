import net from "node:net";
import { validateVpnKey } from "@/lib/keys";

export function parseKeyEndpoint(
  key: string
): { host: string; port: number } | null {
  try {
    const trimmed = key.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("vmess://")) {
      const b64 = trimmed.slice(8).trim();
      const json = Buffer.from(b64, "base64").toString("utf-8");
      try {
        const obj = JSON.parse(json);
        if (obj && obj.add && obj.port) {
          return { host: String(obj.add), port: Number(obj.port) };
        }
      } catch {
        // ignore
      }
      return null;
    }

    if (trimmed.startsWith("vless://") || trimmed.startsWith("trojan://")) {
      const u = new URL(trimmed);
      if (u.hostname && u.port) {
        return { host: u.hostname, port: Number(u.port) };
      }
      return null;
    }

    if (trimmed.startsWith("ss://")) {
      let rest = trimmed.slice(5).trim().split("#")[0];
      const at = rest.lastIndexOf("@");
      if (at >= 0) {
        const after = rest.slice(at + 1);
        const u = new URL("ss://" + after);
        if (u.hostname && u.port) {
          return { host: u.hostname, port: Number(u.port) };
        }
        return null;
      }
      const dec = Buffer.from(rest, "base64").toString("utf-8");
      const at2 = dec.lastIndexOf("@");
      const colon = dec.lastIndexOf(":");
      if (at2 >= 0 && colon > at2) {
        return { host: dec.slice(at2 + 1, colon), port: Number(dec.slice(colon + 1)) };
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

export function pingHost(
  host: string,
  port: number,
  timeoutMs = 2500
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    const sock = net.connect({ host, port, timeout: timeoutMs });
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
    sock.once("timeout", () => finish(false));
  });
}

export async function isKeyAlive(
  key: string,
  timeoutMs = 2500
): Promise<boolean> {
  if (!validateVpnKey(key)) return false;
  const ep = parseKeyEndpoint(key);
  if (!ep || !ep.host || !ep.port) return true; // can't verify -> keep
  return pingHost(ep.host, ep.port, timeoutMs);
}

export async function filterAliveKeys(
  values: string[],
  opts: { timeoutMs?: number; concurrency?: number } = {}
): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const concurrency = Math.max(1, opts.concurrency ?? 25);
  const results: boolean[] = new Array(values.length);
  let idx = 0;
  async function worker() {
    while (idx < values.length) {
      const cur = idx++;
      results[cur] = await isKeyAlive(values[cur], timeoutMs);
    }
  }
  const workers: Promise<void>[] = [];
  const n = Math.min(concurrency, values.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return values.filter((_, i) => results[i]);
}
