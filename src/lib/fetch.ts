import net from "node:net";
import tls from "node:tls";

export interface RawResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

function buildHeaders(
  ua: string,
  extra?: Record<string, string>
): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": ua,
    Accept: "*/*",
    "Accept-Encoding": "identity",
    Connection: "close",
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) h[k] = v;
  }
  return h;
}

function parseStatusAndHeaders(headerStr: string): {
  status: number;
  statusText: string;
  headers: Record<string, string>;
} {
  const lines = headerStr.split("\r\n");
  const first = lines[0] || "";
  // Tolerate non-standard version tokens like HTTP/0.0, HTTP/2.0, etc.
  const m = first.match(/^HTTP\/\S+\s+(\d{3})\s*(.*)$/);
  const status = m ? parseInt(m[1], 10) : 0;
  const statusText = m ? m[2] : "";
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    headers[line.slice(0, ci).trim().toLowerCase()] = line.slice(ci + 1).trim();
  }
  return { status, statusText, headers };
}

function decodeChunked(buf: Buffer): string {
  let out = "";
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf("\r\n", i);
    if (nl === -1) break;
    const sizeLine = buf.slice(i, nl).toString("latin1").trim();
    const size = parseInt(sizeLine.split(";")[0], 16);
    if (!size || isNaN(size)) break;
    const start = nl + 2;
    const end = start + size;
    if (end > buf.length) break;
    out += buf.slice(start, end).toString("utf-8");
    i = end + 2;
  }
  return out;
}

function decodeBody(buf: Buffer, headers: Record<string, string>): string {
  const te = (headers["transfer-encoding"] || "").toLowerCase();
  if (te.includes("chunked")) return decodeChunked(buf);
  return buf.toString("utf-8");
}

function singleRequest(
  targetUrl: string,
  ua: string,
  timeoutMs: number,
  insecure: boolean,
  extra?: Record<string, string>
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(targetUrl);
    } catch {
      return reject(new Error("Некорректный URL"));
    }
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const useTls = u.protocol === "https:";

    let sock: net.Socket;
    try {
      sock = useTls
        ? tls.connect(Number(port), u.hostname, {
            rejectUnauthorized: !insecure,
            servername: u.hostname,
          })
        : net.connect(Number(port), u.hostname);
    } catch (e) {
      return reject(e as Error);
    }

    let buf = Buffer.alloc(0);
    let headerParsed = false;
    let headerEnd = -1;
    let resolved = false;

    const finish = (r: RawResponse) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        resolve(r);
      }
    };
    const fail = (e: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        try {
          sock.destroy();
        } catch {
          /* ignore */
        }
        reject(e);
      }
    };

    const timer = setTimeout(
      () => fail(new Error("Таймаут соединения")),
      timeoutMs
    );
    sock.setTimeout(timeoutMs, () => fail(new Error("Таймаут соединения")));
    sock.on("error", fail);
    sock.on("timeout", () => fail(new Error("Таймаут соединения")));

    sock.on("connect", () => {
      const hostHeader = u.port ? `${u.hostname}:${u.port}` : u.hostname;
      const head = Object.entries(buildHeaders(ua, extra))
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n");
      const req = `GET ${u.pathname || "/"}${u.search} HTTP/1.1\r\nHost: ${hostHeader}\r\n${head}\r\n\r\n`;
      sock.write(req);
    });

    sock.on("data", (chunk) => {
      if (resolved) return;
      buf = Buffer.concat([buf, chunk]);
      if (!headerParsed) {
        const idx = buf.indexOf("\r\n\r\n");
        if (idx === -1) return;
        const headerStr = buf.slice(0, idx).toString("latin1");
        const parsed = parseStatusAndHeaders(headerStr);
        headerParsed = true;
        headerEnd = idx + 4;
        // Follow redirects (including malformed HTTP/0.0 redirects)
        if (parsed.status >= 300 && parsed.status < 400 && parsed.headers.location) {
          finish({ ...parsed, body: "" });
          return;
        }
      }
    });

    sock.on("end", () => {
      if (resolved) return;
      if (!headerParsed) {
        return fail(new Error("Пустой или некорректный ответ от сервера"));
      }
      const headerStr = buf.slice(0, headerEnd - 4).toString("latin1");
      const parsed = parseStatusAndHeaders(headerStr);
      const bodyBuf = buf.slice(headerEnd);
      finish({ ...parsed, body: decodeBody(bodyBuf, parsed.headers) });
    });
  });
}

export interface RawFetchOptions {
  timeoutMs?: number;
  insecure?: boolean;
  maxRedirects?: number;
  extraHeaders?: Record<string, string>;
}

/**
 * Low-level HTTP/HTTPS fetch that tolerates broken servers:
 * - accepts any HTTP version token (HTTP/0.0, HTTP/2.0, etc.)
 * - follows redirects manually (handles HTTP/0.0 307 replies)
 * - ignores expired / self-signed TLS certificates when insecure=true
 */
export async function rawFetch(
  targetUrl: string,
  ua: string,
  opts: RawFetchOptions = {}
): Promise<RawResponse> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const insecure = opts.insecure ?? true;
  const maxRedirects = opts.maxRedirects ?? 5;

  let current = targetUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await singleRequest(
      current,
      ua,
      timeoutMs,
      insecure,
      opts.extraHeaders
    );
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      try {
        current = new URL(res.headers.location, current).toString();
      } catch {
        return res;
      }
      continue;
    }
    return res;
  }
  throw new Error("Превышено число редиректов");
}
