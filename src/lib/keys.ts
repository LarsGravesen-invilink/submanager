import { createHash } from "crypto";

// Supported protocol prefixes
const PROTOCOL_PREFIXES = [
  "vless://",
  "vmess://",
  "trojan://",
  "ss://",
  "ssr://",
  "hysteria://",
  "hysteria2://",
  "hy2://",
  "tuic://",
  "wg://",
  "wireguard://",
];

export function isVpnKey(line: string): boolean {
  const trimmed = line.trim();
  return PROTOCOL_PREFIXES.some((p) => trimmed.startsWith(p));
}

export function isSubscriptionUrl(input: string): boolean {
  const trimmed = input.trim();
  if (isVpnKey(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectInputType(
  input: string
): "key" | "subscription_url" | "unknown" {
  const trimmed = input.trim();
  if (!trimmed) return "unknown";
  if (isVpnKey(trimmed)) return "key";
  if (isSubscriptionUrl(trimmed)) return "subscription_url";
  return "unknown";
}

// Extract the name from a VPN key (after # in the URL)
export function extractKeyName(key: string): string {
  const trimmed = key.trim();

  // Handle vmess:// base64 specially
  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      return json.ps || json.remarks || "";
    } catch {
      // fallback to hash method
    }
  }

  // For URL-style protocols, extract fragment
  const hashIdx = trimmed.lastIndexOf("#");
  if (hashIdx !== -1) {
    return decodeURIComponent(trimmed.slice(hashIdx + 1));
  }
  return "";
}

// Create fingerprint without the name for dedup
export function keyFingerprint(key: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      // Remove name fields for fingerprint
      const { ps, remarks, ...rest } = json;
      void ps;
      void remarks;
      return createHash("sha256")
        .update(JSON.stringify(rest))
        .digest("hex")
        .slice(0, 16);
    } catch {
      // fallback
    }
  }

  // Remove fragment (name) from key
  const hashIdx = trimmed.lastIndexOf("#");
  const keyWithoutName = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return createHash("sha256")
    .update(keyWithoutName)
    .digest("hex")
    .slice(0, 16);
}

// Set name on a VPN key
export function setKeyName(key: string, name: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      json.ps = name;
      return (
        "vmess://" + Buffer.from(JSON.stringify(json)).toString("base64")
      );
    } catch {
      // fallback
    }
  }

  const hashIdx = trimmed.lastIndexOf("#");
  const keyWithoutName = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return keyWithoutName + "#" + encodeURIComponent(name);
}

// Parse subscription content - supports base64, plain text, JSON
export function parseSubscriptionContent(content: string): string[] {
  const trimmed = content.trim();
  const keys: string[] = [];

  // Try JSON format first
  try {
    const json = JSON.parse(trimmed);
    if (json.outbounds && Array.isArray(json.outbounds)) {
      // sing-box / V2Ray JSON format
      return extractKeysFromJson(json);
    }
    if (Array.isArray(json)) {
      // Array of configs
      for (const item of json) {
        if (typeof item === "string" && isVpnKey(item)) {
          keys.push(item);
        } else if (typeof item === "object") {
          const extracted = extractKeysFromJson({ outbounds: [item] });
          keys.push(...extracted);
        }
      }
      if (keys.length > 0) return keys;
    }
  } catch {
    // Not JSON, continue
  }

  // Try base64 decode
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
    if (decoded.split("\n").some((l) => isVpnKey(l.trim()))) {
      return decoded
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => isVpnKey(l));
    }
  } catch {
    // Not base64
  }

  // Plain text - each line is a key
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (isVpnKey(line)) {
      keys.push(line);
    }
  }

  return keys;
}

function extractKeysFromJson(json: { outbounds?: unknown[] }): string[] {
  // This is a simplified extractor for common JSON formats
  // In practice, full conversion would require protocol-specific handling
  const keys: string[] = [];
  if (!json.outbounds) return keys;

  for (const ob of json.outbounds) {
    if (typeof ob !== "object" || ob === null) continue;
    const o = ob as Record<string, unknown>;
    const type = o.type as string;
    const tag = (o.tag as string) || "";

    if (type === "vless" && o.server) {
      const uuid = o.uuid || "";
      const server = o.server;
      const port = o.server_port || o.port || 443;
      let params = `type=tcp&security=none`;
      if (o.tls && typeof o.tls === "object") {
        const tls = o.tls as Record<string, unknown>;
        params = `type=tcp&security=tls&sni=${tls.server_name || server}`;
      }
      if (o.transport && typeof o.transport === "object") {
        const t = o.transport as Record<string, unknown>;
        if (t.type === "ws") {
          params = params.replace("type=tcp", `type=ws&path=${t.path || "/"}`);
        }
        if (t.type === "grpc") {
          params = params.replace("type=tcp", `type=grpc&serviceName=${t.service_name || ""}`);
        }
      }
      const name = tag || `${server}:${port}`;
      keys.push(`vless://${uuid}@${server}:${port}?${params}#${encodeURIComponent(name)}`);
    } else if (type === "vmess" && o.server) {
      const vmessObj: Record<string, unknown> = {
        v: "2",
        ps: tag || `${o.server}:${o.server_port || o.port || 443}`,
        add: o.server,
        port: o.server_port || o.port || 443,
        id: o.uuid || "",
        aid: o.alter_id || 0,
        net: "tcp",
        type: "none",
        host: "",
        path: "",
        tls: "",
      };
      if (o.transport && typeof o.transport === "object") {
        const t = o.transport as Record<string, unknown>;
        vmessObj.net = t.type || "tcp";
        vmessObj.path = t.path || "";
        vmessObj.host = t.headers && typeof t.headers === "object" ? (t.headers as Record<string, unknown>).Host || "" : "";
      }
      if (o.tls && typeof o.tls === "object") {
        const tls = o.tls as Record<string, unknown>;
        vmessObj.tls = "tls";
        vmessObj.host = tls.server_name || vmessObj.host || o.server;
      }
      keys.push("vmess://" + Buffer.from(JSON.stringify(vmessObj)).toString("base64"));
    } else if (type === "trojan" && o.server) {
      const password = o.password || "";
      const server = o.server;
      const port = o.server_port || o.port || 443;
      let sni = server as string;
      if (o.tls && typeof o.tls === "object") {
        const tls = o.tls as Record<string, unknown>;
        sni = (tls.server_name as string) || sni;
      }
      const name = tag || `${server}:${port}`;
      keys.push(`trojan://${password}@${server}:${port}?security=tls&sni=${sni}#${encodeURIComponent(name)}`);
    } else if (type === "shadowsocks" && o.server) {
      const method = o.method || "aes-256-gcm";
      const password = o.password || "";
      const server = o.server;
      const port = o.server_port || o.port || 443;
      const name = tag || `${server}:${port}`;
      const userinfo = Buffer.from(`${method}:${password}`).toString("base64");
      keys.push(`ss://${userinfo}@${server}:${port}#${encodeURIComponent(name)}`);
    }
  }

  return keys;
}
