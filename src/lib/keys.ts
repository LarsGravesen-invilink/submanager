import { createHash } from "crypto";

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

const KEY_REGEX = /(vless|vmess|trojan|ssr?|hysteria2?|hysteria|hy2|tuic|wg|wireguard):\/\/[^\s"'<>]+/gi;

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

export function extractKeyName(key: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      return json.ps || json.remarks || "";
    } catch {
      // ignore
    }
  }

  const hashIdx = trimmed.lastIndexOf("#");
  if (hashIdx !== -1) {
    try {
      return decodeURIComponent(trimmed.slice(hashIdx + 1));
    } catch {
      return trimmed.slice(hashIdx + 1);
    }
  }
  return "";
}

export function keyFingerprint(key: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      const { ps, remarks, ...rest } = json;
      void ps;
      void remarks;
      return createHash("sha256")
        .update(JSON.stringify(rest))
        .digest("hex")
        .slice(0, 16);
    } catch {
      // ignore
    }
  }

  const hashIdx = trimmed.lastIndexOf("#");
  const keyWithoutName = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return createHash("sha256")
    .update(keyWithoutName)
    .digest("hex")
    .slice(0, 16);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRealKey(key: string): boolean {
  const dummyPatterns = [
    "0.0.0.0:1",
    "00000000-0000-0000-0000-000000000000",
    "127.0.0.1:1",
    "не поддерживается",
    "not supported",
    "данное приложение",
  ];
  const lower = key.toLowerCase();
  return !dummyPatterns.some((p) => lower.includes(p));
}

/**
 * Smart & accurate validation of a VPN key.
 * Checks that the protocol is supported and that the structurally required
 * fields (UUID / password / host:port) are present and well-formed.
 * Returns true only for keys that look genuinely usable.
 */
export function validateVpnKey(key: string): boolean {
  const trimmed = key.trim();
  if (!isVpnKey(trimmed)) return false;

  try {
    if (trimmed.startsWith("vmess://")) {
      const json = JSON.parse(
        Buffer.from(trimmed.slice(8), "base64").toString("utf-8")
      );
      if (!json || json.v !== "2") return false;
      if (!json.add || !json.port || !json.id) return false;
      if (!UUID_RE.test(String(json.id))) return false;
      return true;
    }

    const hashIdx = trimmed.lastIndexOf("#");
    const body = (
      hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed
    ).replace(/^[\w-]+:\/\//, "");

    const atIdx = body.indexOf("@");
    if (atIdx === -1) return false;
    const userinfo = body.slice(0, atIdx);
    const rest = body.slice(atIdx + 1);

    const colonPort = rest.lastIndexOf(":");
    if (colonPort === -1) return false;
    const portStr = rest.slice(colonPort + 1).split("?")[0];
    const port = parseInt(portStr, 10);
    if (!port || port <= 0 || port > 65535) return false;

    if (trimmed.startsWith("vless://")) {
      const uuid = userinfo.split(":")[0];
      if (!UUID_RE.test(uuid)) return false;
    } else if (trimmed.startsWith("trojan://")) {
      if (!userinfo) return false;
    } else if (trimmed.startsWith("ss://")) {
      if (!userinfo) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function setKeyName(key: string, name: string): string {
  const trimmed = key.trim();

  if (trimmed.startsWith("vmess://")) {
    try {
      const b64 = trimmed.slice(8);
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const json = JSON.parse(decoded);
      json.ps = name;
      return "vmess://" + Buffer.from(JSON.stringify(json), "utf-8").toString("base64");
    } catch {
      // ignore
    }
  }

  const hashIdx = trimmed.lastIndexOf("#");
  const keyWithoutName = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  return keyWithoutName + "#" + encodeURIComponent(name);
}

export function parseSubscriptionContent(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // 1) Try direct JSON first
  const jsonKeys = parseJsonSubscription(trimmed);
  if (jsonKeys.length > 0) {
    return dedupeKeys(jsonKeys);
  }

  // 2) Try base64 decode and parse again (works for base64 txt/json subscriptions)
  const decoded = tryDecodeBase64(trimmed);
  if (decoded) {
    const decodedKeys = parseSubscriptionContent(decoded);
    if (decodedKeys.length > 0) {
      return dedupeKeys(decodedKeys);
    }
  }

  // 3) Try Clash YAML (proxies: section)
  const clashKeys = parseClashYaml(trimmed);
  if (clashKeys.length > 0) {
    return dedupeKeys(clashKeys);
  }

  // 4) Plain text / embedded URLs
  const keys: string[] = [];

  // Regex extraction from arbitrary text
  for (const match of trimmed.matchAll(KEY_REGEX)) {
    const value = match[0]?.trim();
    if (value && isVpnKey(value)) keys.push(value);
  }

  // Fallback line-based extraction
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (isVpnKey(line)) keys.push(line);
  }

  return dedupeKeys(keys);
}

function parseJsonSubscription(input: string): string[] {
  try {
    const json = JSON.parse(input) as unknown;
    return dedupeKeys(extractKeysFromUnknown(json));
  } catch {
    return [];
  }
}

function extractKeysFromUnknown(value: unknown, depth = 0): string[] {
  if (depth > 20 || value == null) return [];

  const keys: string[] = [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return keys;

    if (isVpnKey(trimmed)) {
      keys.push(trimmed);
      return keys;
    }

    for (const match of trimmed.matchAll(KEY_REGEX)) {
      const found = match[0]?.trim();
      if (found && isVpnKey(found)) keys.push(found);
    }

    const decoded = tryDecodeBase64(trimmed);
    if (decoded && decoded !== trimmed) {
      keys.push(...extractKeysFromUnknown(decoded, depth + 1));
    }

    return keys;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      keys.push(...extractKeysFromUnknown(item, depth + 1));
    }
    return keys;
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;

    // Xray JSON format: outbounds with protocol + settings.vnext
    const protocol = typeof o.protocol === "string" ? o.protocol : typeof o.type === "string" ? o.type : "";
    if (protocol && o.settings && typeof o.settings === "object") {
      const xrayKeys = extractKeysFromXrayOutbound(o);
      if (xrayKeys.length > 0) {
        keys.push(...xrayKeys);
        return keys;
      }
    }

    // sing-box / clash-style proxy object
    if (protocol) {
      keys.push(...extractKeysFromJson({ outbounds: [normalizeProxyObject(o)] }));
    }

    // Common fields that may directly contain link strings or arrays
    const likelyFields = [
      "outbounds",
      "proxies",
      "proxy-providers",
      "servers",
      "nodes",
      "configs",
      "configurations",
      "items",
      "list",
      "data",
      "result",
      "links",
      "subscriptions",
      "profiles",
      "endpoints",
      "peers",
      "children",
      "content",
      "payload",
      "url",
      "uri",
      "link",
      "share",
      "value",
      "server",
    ];

    for (const field of likelyFields) {
      if (field in o) {
        keys.push(...extractKeysFromUnknown(o[field], depth + 1));
      }
    }

    // Full recursive scan of remaining fields
    for (const [k, v] of Object.entries(o)) {
      if (!likelyFields.includes(k)) {
        keys.push(...extractKeysFromUnknown(v, depth + 1));
      }
    }
  }

  return keys;
}

function normalizeProxyObject(o: Record<string, unknown>): Record<string, unknown> {
  const out = { ...o };
  if (!out.type && typeof out.protocol === "string") out.type = out.protocol;
  if (!out.server && typeof out.address === "string") out.server = out.address;
  if (!out.server_port && out.port != null) out.server_port = out.port;
  if (!out.uuid && typeof out.id === "string") out.uuid = out.id;
  if (!out.tag && typeof out.name === "string") out.tag = out.name;
  return out;
}

function tryDecodeBase64(input: string): string | null {
  const normalized = input.replace(/\s+/g, "");
  if (!looksLikeBase64(normalized)) return null;
  try {
    const decoded = Buffer.from(normalized, "base64").toString("utf-8");
    if (!decoded || decoded.includes("\u0000")) return null;
    return decoded;
  } catch {
    return null;
  }
}

function looksLikeBase64(input: string): boolean {
  if (!input || input.length < 16 || input.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(input);
}

function dedupeKeys(keys: string[]): string[] {
  const map = new Map<string, string>();
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || !isVpnKey(trimmed)) continue;
    map.set(keyFingerprint(trimmed), trimmed);
  }
  return [...map.values()];
}

function extractKeysFromJson(json: { outbounds?: unknown[] }): string[] {
  const keys: string[] = [];
  if (!json.outbounds) return keys;

  for (const ob of json.outbounds) {
    if (typeof ob !== "object" || ob === null) continue;
    const o = ob as Record<string, unknown>;
    const type = (o.type as string) || (o.protocol as string);
    const tag = (o.tag as string) || (o.name as string) || "";

    if (type === "vless" && (o.server || o.address)) {
      const uuid = o.uuid || o.id || "";
      const server = o.server || o.address;
      const port = o.server_port || o.port || 443;
      let params = "type=tcp&security=none&encryption=none";

      if (o.tls && typeof o.tls === "object") {
        const tls = o.tls as Record<string, unknown>;
        params = `type=tcp&security=tls&sni=${tls.server_name || server}&encryption=none`;
      } else if (o.security === "tls") {
        params = `type=tcp&security=tls&sni=${o.sni || server}&encryption=none`;
      } else if (o.security === "reality") {
        params = `type=tcp&security=reality&sni=${o.serverName || o.sni || server}&encryption=none`;
      }

      if (o.transport && typeof o.transport === "object") {
        const t = o.transport as Record<string, unknown>;
        if (t.type === "ws") {
          params = params.replace("type=tcp", `type=ws&path=${encodeURIComponent(String(t.path || "/"))}`);
        }
        if (t.type === "grpc") {
          params = params.replace("type=tcp", `type=grpc&serviceName=${encodeURIComponent(String(t.service_name || ""))}`);
        }
      }

      const name = tag || `${server}:${port}`;
      keys.push(`vless://${uuid}@${server}:${port}?${params}#${encodeURIComponent(name)}`);
    } else if (type === "vmess" && (o.server || o.address)) {
      const server = o.server || o.address;
      const port = o.server_port || o.port || 443;
      const vmessObj: Record<string, unknown> = {
        v: "2",
        ps: tag || `${server}:${port}`,
        add: server,
        port,
        id: o.uuid || o.id || "",
        aid: o.alter_id || o.aid || 0,
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
        vmessObj.host = t.headers && typeof t.headers === "object" ? ((t.headers as Record<string, unknown>).Host || "") : "";
      }
      if (o.tls || o.security === "tls") {
        vmessObj.tls = "tls";
      }
      keys.push("vmess://" + Buffer.from(JSON.stringify(vmessObj), "utf-8").toString("base64"));
    } else if (type === "trojan" && (o.server || o.address)) {
      const password = o.password || "";
      const server = o.server || o.address;
      const port = o.server_port || o.port || 443;
      const sni = (o.sni as string) || (o.server_name as string) || String(server);
      const name = tag || `${server}:${port}`;
      keys.push(`trojan://${password}@${server}:${port}?security=tls&sni=${encodeURIComponent(sni)}#${encodeURIComponent(name)}`);
    } else if ((type === "shadowsocks" || type === "ss") && (o.server || o.address)) {
      const method = o.method || "aes-256-gcm";
      const password = o.password || "";
      const server = o.server || o.address;
      const port = o.server_port || o.port || 443;
      const name = tag || `${server}:${port}`;
      const userinfo = Buffer.from(`${method}:${password}`).toString("base64");
      keys.push(`ss://${userinfo}@${server}:${port}#${encodeURIComponent(name)}`);
    }
  }

  return keys;
}

// Parse Xray JSON outbound format (protocol + settings.vnext/servers)
function extractKeysFromXrayOutbound(o: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const protocol = (o.protocol as string) || "";
  const settings = o.settings as Record<string, unknown> | undefined;
  const stream = o.streamSettings as Record<string, unknown> | undefined;
  const tag = (o.tag as string) || (o.remarks as string) || "";

  if (!settings) return keys;

  const security = (stream?.security as string) || "none";
  const network = (stream?.network as string) || "tcp";

  if (protocol === "vless" && settings.vnext && Array.isArray(settings.vnext)) {
    for (const vn of settings.vnext) {
      const v = vn as Record<string, unknown>;
      const server = v.address as string;
      const port = v.port as number;
      const users = v.users as Record<string, unknown>[] | undefined;
      if (!server || !port || !users) continue;
      for (const user of users) {
        const uuid = (user.id as string) || "";
        const flow = (user.flow as string) || "";
        let params = `encryption=none&type=${network}&security=${security}`;
        if (flow) params += `&flow=${flow}`;
        if (security === "tls" || security === "reality") {
          const tlsSettings = (stream?.tlsSettings || stream?.realitySettings) as Record<string, unknown> | undefined;
          if (tlsSettings?.serverName) params += `&sni=${tlsSettings.serverName}`;
          if (security === "reality") {
            if (tlsSettings?.publicKey) params += `&pbk=${tlsSettings.publicKey}`;
            if (tlsSettings?.shortId) params += `&sid=${tlsSettings.shortId}`;
            if (tlsSettings?.fingerprint) params += `&fp=${tlsSettings.fingerprint}`;
          }
        }
        const name = tag || `${server}:${port}`;
        keys.push(`vless://${uuid}@${server}:${port}?${params}#${encodeURIComponent(name)}`);
      }
    }
  } else if (protocol === "vmess" && settings.vnext && Array.isArray(settings.vnext)) {
    for (const vn of settings.vnext) {
      const v = vn as Record<string, unknown>;
      const server = v.address as string;
      const port = v.port as number;
      const users = v.users as Record<string, unknown>[] | undefined;
      if (!server || !port || !users) continue;
      for (const user of users) {
        const vmessObj: Record<string, unknown> = {
          v: "2", ps: tag || `${server}:${port}`, add: server, port,
          id: user.id || "", aid: user.alterId || 0,
          net: network, type: "none", host: "", path: "",
          tls: security === "tls" ? "tls" : "",
        };
        keys.push("vmess://" + Buffer.from(JSON.stringify(vmessObj), "utf-8").toString("base64"));
      }
    }
  } else if (protocol === "trojan" && settings.servers && Array.isArray(settings.servers)) {
    for (const srv of settings.servers) {
      const s = srv as Record<string, unknown>;
      const server = s.address as string;
      const port = s.port as number;
      const password = (s.password as string) || "";
      const name = tag || `${server}:${port}`;
      keys.push(`trojan://${password}@${server}:${port}?security=tls#${encodeURIComponent(name)}`);
    }
  } else if (protocol === "shadowsocks" && settings.servers && Array.isArray(settings.servers)) {
    for (const srv of settings.servers) {
      const s = srv as Record<string, unknown>;
      const server = s.address as string;
      const port = s.port as number;
      const method = (s.method as string) || "aes-256-gcm";
      const password = (s.password as string) || "";
      const name = tag || `${server}:${port}`;
      const userinfo = Buffer.from(`${method}:${password}`).toString("base64");
      keys.push(`ss://${userinfo}@${server}:${port}#${encodeURIComponent(name)}`);
    }
  }

  return keys;
}

// Parse Clash YAML proxies section (simplified - no YAML dependency)
function parseClashYaml(content: string): string[] {
  const keys: string[] = [];
  // Quick check: does it look like Clash YAML?
  if (!content.includes("proxies:") && !content.includes("Proxy:")) return keys;

  const lines = content.split("\n");
  let inProxies = false;
  let currentProxy: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\s*proxies:\s*$/.test(line) || /^\s*Proxy:\s*$/.test(line)) {
      inProxies = true;
      continue;
    }
    if (inProxies) {
      if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("-")) {
        inProxies = false;
        if (Object.keys(currentProxy).length > 0) {
          const k = clashProxyToKey(currentProxy);
          if (k) keys.push(k);
          currentProxy = {};
        }
        continue;
      }
      if (/^\s*-\s+/.test(line)) {
        if (Object.keys(currentProxy).length > 0) {
          const k = clashProxyToKey(currentProxy);
          if (k) keys.push(k);
        }
        currentProxy = {};
        const inlineMatch = line.match(/^\s*-\s*\{(.+)\}\s*$/);
        if (inlineMatch) {
          const pairs = inlineMatch[1].split(",").map((p: string) => p.trim());
          for (const pair of pairs) {
            const colonIdx = pair.indexOf(":");
            if (colonIdx > 0) {
              const k = pair.slice(0, colonIdx).trim();
              const v = pair.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
              currentProxy[k] = v;
            }
          }
          continue;
        }
        const kvMatch = line.match(/^\s*-\s+(\w[\w-]*):\s*(.+)$/);
        if (kvMatch) currentProxy[kvMatch[1]] = kvMatch[2].trim().replace(/^["']|["']$/g, "");
        continue;
      }
      const kvMatch = line.match(/^\s+(\w[\w-]*):\s*(.+)$/);
      if (kvMatch && Object.keys(currentProxy).length > 0) {
        currentProxy[kvMatch[1]] = kvMatch[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  if (Object.keys(currentProxy).length > 0) {
    const k = clashProxyToKey(currentProxy);
    if (k) keys.push(k);
  }
  return keys;
}

function clashProxyToKey(p: Record<string, string>): string | null {
  const type = p.type;
  const server = p.server;
  const port = p.port;
  const name = p.name || `${server}:${port}`;
  if (!type || !server || !port) return null;

  if (type === "vless") {
    const uuid = p.uuid || "";
    let params = `encryption=none&type=${p.network || "tcp"}&security=${p.tls === "true" || p.security === "tls" ? "tls" : "none"}`;
    if (p.servername) params += `&sni=${p.servername}`;
    return `vless://${uuid}@${server}:${port}?${params}#${encodeURIComponent(name)}`;
  }
  if (type === "vmess") {
    const vmessObj: Record<string, unknown> = {
      v: "2", ps: name, add: server, port: Number(port),
      id: p.uuid || "", aid: Number(p.alterId || 0),
      net: p.network || "tcp", type: "none",
      host: p.host || "", path: p.path || "",
      tls: p.tls === "true" ? "tls" : "",
    };
    return "vmess://" + Buffer.from(JSON.stringify(vmessObj), "utf-8").toString("base64");
  }
  if (type === "trojan") {
    const password = p.password || "";
    const sni = p.sni || p.servername || server;
    return `trojan://${password}@${server}:${port}?security=tls&sni=${encodeURIComponent(sni)}#${encodeURIComponent(name)}`;
  }
  if (type === "ss") {
    const method = p.cipher || "aes-256-gcm";
    const password = p.password || "";
    const userinfo = Buffer.from(`${method}:${password}`).toString("base64");
    return `ss://${userinfo}@${server}:${port}#${encodeURIComponent(name)}`;
  }
  return null;
}
