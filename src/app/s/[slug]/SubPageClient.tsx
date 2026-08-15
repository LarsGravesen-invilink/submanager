"use client";

import { useState, useEffect } from "react";

interface VpnClient {
  name: string;
  icon: string;
  urlScheme: (subUrl: string) => string;
}

const VPN_CLIENTS: VpnClient[] = [
  {
    name: "Hiddify",
    icon: "#EAB308",
    urlScheme: (url) => `hiddify://import/${url}`,
  },
  {
    name: "V2RayNG",
    icon: "#8B5CF6",
    urlScheme: (url) => `v2rayng://install-sub?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Streisand",
    icon: "#3B82F6",
    urlScheme: (url) => `streisand://import/${url}`,
  },
  {
    name: "Happ",
    icon: "#22C55E",
    urlScheme: (url) => `happ://import/${url}`,
  },
  {
    name: "Incy",
    icon: "#06B6D4",
    urlScheme: (url) => `incy://import/${url}`,
  },
  {
    name: "Shadowrocket",
    icon: "#F97316",
    urlScheme: (url) => { try { return `sub://${window.btoa(url)}`; } catch { return `sub://${url}`; } },
  },
  {
    name: "NekoBox",
    icon: "#EC4899",
    urlScheme: (url) => `sn://subscription?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Clash",
    icon: "#6366F1",
    urlScheme: (url) => `clash://install-config?url=${encodeURIComponent(url)}`,
  },
];

export default function SubPageClient({
  slug,
  title,
  logoUrl,
  logoSize,
  expiresAt,
  isActive,
  extraConfigsTitle,
  extraConfigs,
}: {
  slug: string;
  title: string;
  logoUrl: string;
  logoSize: string;
  expiresAt: string | null;
  isActive: boolean;
  extraConfigsTitle: string;
  extraConfigs: {name: string; key: string}[];
}) {
  const [subUrl, setSubUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    setSubUrl(`${window.location.origin}/api/sub/${slug}`);
  }, [slug]);

  // Check expiry and countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTime = () => {
      const now = new Date().getTime();
      const exp = new Date(expiresAt).getTime();
      const diff = exp - now;

      if (diff <= 0) {
        setTimeLeft("Истекла");
        setIsExpired(true);
        return;
      }

      setIsExpired(false);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      const parts = [];
      if (days > 0) parts.push(`${days} д.`);
      if (hours > 0) parts.push(`${hours} ч.`);
      parts.push(`${minutes} мин.`);
      setTimeLeft(parts.join(" "));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(subUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateQr = async () => {
    const res = await fetch("/api/qrcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: subUrl }),
    });
    const data = await res.json();
    setQrDataUrl(data.dataUrl);
    setShowQr(true);
  };

  const [clipboardMsg, setClipboardMsg] = useState("");
  const [showExtraConfigs, setShowExtraConfigs] = useState(false);

  const openInClient = async (client: VpnClient) => {
    // For Happ: copy to clipboard + show instruction
    // Happ imports subscriptions from clipboard, not via custom deeplink
    if (client.name === "Happ") {
      try {
        await navigator.clipboard.writeText(subUrl);
        setClipboardMsg("Ссылка скопирована! Откройте Happ → нажмите + → Буфер обмена");
        setTimeout(() => setClipboardMsg(""), 5000);
      } catch {
        setClipboardMsg("Не удалось скопировать. Скопируйте ссылку вручную");
        setTimeout(() => setClipboardMsg(""), 3000);
      }
      setShowClients(false);
      return;
    }

    setShowClients(false);
    window.location.href = client.urlScheme(subUrl);
  };

  const logoSizeClass = {
    small: "h-12",
    medium: "h-20",
    large: "h-32",
  }[logoSize] || "h-16";

  // Paused subscription
  if (!isActive) {
    return (
      <div className="min-h-dvh bg-[#0B0B0E] text-white flex items-center justify-center px-4 relative overflow-hidden">
        <div
          className="b-sphere pointer-events-none absolute -top-40 -right-28 w-[480px] h-[480px] rounded-full"
          style={{ background: "radial-gradient(circle at center, rgba(240,185,0,0.16), transparent 62%)" }}
        />
        <div className="text-center b-anim">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F0B900]/10 border-2 border-[#F0B900]/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-graphite-100 mb-2">
            <span className="b-glitch">Подписка приостановлена</span>
          </h1>
          <p className="text-graphite-500 text-sm">
            Свяжитесь с администратором для возобновления
          </p>
        </div>
      </div>
    );
  }

  // Expired subscription
  if (isExpired) {
    return (
      <div className="min-h-dvh bg-[#0B0B0E] text-white flex items-center justify-center px-4 relative overflow-hidden">
        <div
          className="b-sphere pointer-events-none absolute -top-40 -right-28 w-[480px] h-[480px] rounded-full"
          style={{ background: "radial-gradient(circle at center, rgba(248,113,113,0.14), transparent 62%)" }}
        />
        <div className="text-center b-anim max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
            <svg className="w-14 h-14 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-400 mb-3">
            <span className="b-glitch">Истёк срок использования подписки</span>
          </h1>
          <p className="text-graphite-400 text-sm leading-relaxed">
            Для продления обратитесь к владельцу сервиса
          </p>
          <div className="mt-6 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-graphite-500 text-xs">
              Срок действия истёк: {new Date(expiresAt!).toLocaleString("ru-RU")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0B0B0E] text-white flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* ===== Beeline sphere glow ===== */}
      <div
        className="b-sphere pointer-events-none absolute -top-44 -right-36 w-[560px] h-[560px] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(240,185,0,0.14), transparent 62%)" }}
      />

      <div className="w-full max-w-md b-anim">
        {/* Logo */}
        {logoUrl && (
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo"
              className={`${logoSizeClass} w-auto mx-auto object-contain`}
            />
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-8">
          {!logoUrl && (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F0B900] mb-4 shadow-lg">
              <svg className="w-7 h-7 text-[#0B0B0E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-graphite-50">
            {title.split(" ").map((word, i) => (
              <span
                key={i}
                className="b-glitch"
                style={{ animationDelay: `${0.12 + i * 0.09}s` }}
              >
                {word}
                {i < title.split(" ").length - 1 ? "\u00A0" : ""}
              </span>
            ))}
          </h1>

          {expiresAt && !isExpired && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
              <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-graphite-300">
                Осталось: <span className="text-white font-semibold">{timeLeft}</span>
              </span>
            </div>
          )}
        </div>

        {/* Subscription link card */}
        <div className="bg-[#131417] border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
          <label className="block text-sm text-graphite-400 mb-2">
            Ссылка на подписку
          </label>
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-graphite-300 truncate select-all">
              {subUrl}
            </div>
            <button
              onClick={copyLink}
              className={`px-4 py-3 rounded-xl text-sm font-bold transition-all flex-shrink-0 ${
                copied
                  ? "bg-[#16A34A] text-[#0B0B0E]"
                  : "bg-[#F0B900] hover:bg-[#E0A700] text-[#0B0B0E] active:scale-95"
              }`}
              aria-label="Скопировать ссылку"
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          </div>

          {/* Actions — Beeline arrow buttons */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowClients(true)}
              className="btn-beeline flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] hover:border-[#F0B900]/50 hover:bg-[#F0B900]/[0.06] px-4 py-3 text-sm font-bold transition-colors"
            >
              <span className="btn-inner text-left">
                <span className="btn-copy max-w-[130px] truncate">Добавить в клиент</span>
                <span className="btn-copy max-w-[130px] truncate" aria-hidden="true">Добавить в клиент</span>
              </span>
              <span className="btn-arr flex-shrink-0">
                <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </button>
            <button
              onClick={generateQr}
              className="btn-beeline flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] hover:border-[#F0B900]/50 hover:bg-[#F0B900]/[0.06] px-4 py-3 text-sm font-bold transition-colors"
            >
              <span className="btn-inner text-left">
                <span className="btn-copy max-w-[90px] truncate">QR-код</span>
                <span className="btn-copy max-w-[90px] truncate" aria-hidden="true">QR-код</span>
              </span>
              <span className="btn-arr flex-shrink-0">
                <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* Extra Configs Section */}
        {extraConfigs.length > 0 && (
          <button
            onClick={() => setShowExtraConfigs(true)}
            className="mt-4 w-full flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#131417] hover:bg-white/[0.03] hover:border-[#F0B900]/40 p-5 text-left transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#F0B900]/10 border border-[#F0B900]/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-white block">{extraConfigsTitle || "Дополнительные конфиги"}</span>
                <span className="text-xs text-graphite-500">{extraConfigs.length} конфиг(ов)</span>
              </div>
            </div>
            <svg className="w-5 h-5 text-graphite-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Clipboard notification */}
        {clipboardMsg && (
          <div className="mt-6 bg-[#16A34A]/10 border border-[#16A34A]/25 text-emerald-400 text-sm rounded-xl px-4 py-3 text-center animate-fade-in">
            {clipboardMsg}
          </div>
        )}

        <p className="text-center text-graphite-700 text-xs mt-8">
          SubManager by LarsGravesen
        </p>
      </div>

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="bg-[#131417] border border-white/10 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center mb-4">
              QR-код подписки
            </h3>
            {qrDataUrl && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-64 h-64 rounded-xl bg-white p-2"
                />
              </div>
            )}
            <button
              onClick={() => setShowQr(false)}
              className="btn-beeline w-full flex items-center justify-between rounded-xl bg-[#F0B900] hover:bg-[#E0A700] text-[#0B0B0E] px-4 py-3 font-bold transition-colors"
            >
              <span className="btn-inner text-left">
                <span className="btn-copy">Закрыть</span>
                <span className="btn-copy" aria-hidden="true">Закрыть</span>
              </span>
              <span className="btn-arr flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="bg-[#131417] border border-white/10 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center mb-4">
              Выберите клиент
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {VPN_CLIENTS.map((client) => (
                <button
                  key={client.name}
                  onClick={() => openInClient(client)}
                  className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#F0B900]/50 rounded-xl p-4 transition-all text-left"
                >
                  <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: client.icon }} />
                  <span className="text-sm font-semibold text-white/80">
                    {client.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowClients(false)}
              className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-colors font-semibold"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Extra Configs Modal */}
      {showExtraConfigs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="bg-[#131417] border border-white/10 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center mb-4">
              {extraConfigsTitle || "Дополнительные конфиги"}
            </h3>
            <div className="space-y-2 mb-4">
              {extraConfigs.map((cfg, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    const key = cfg.key.trim();
                    // Auto-detect AmneziaWG / WireGuard keys
                    if (key.startsWith("vpn://") || key.startsWith("awg://") || key.startsWith("amnezia://")) {
                      // Try to open in AmneziaWG first
                      window.location.href = key;
                      // Also copy to clipboard as fallback
                      try { await navigator.clipboard.writeText(key); } catch {}
                    } else {
                      try {
                        await navigator.clipboard.writeText(key);
                      } catch {}
                    }
                    setShowExtraConfigs(false);
                    setClipboardMsg(`${cfg.name} — скопировано!`);
                    setTimeout(() => setClipboardMsg(""), 3000);
                  }}
                  className="w-full flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#F0B900]/50 rounded-xl p-4 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#F0B900]/10 border border-[#F0B900]/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-white/80">{cfg.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowExtraConfigs(false)}
              className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-colors font-semibold"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}