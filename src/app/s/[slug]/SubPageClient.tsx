"use client";

import { useState, useEffect } from "react";

interface VpnClient {
  name: string;
  icon: string;
  urlScheme: (subUrl: string) => string;
}

const VPN_CLIENTS: VpnClient[] = [
  {
    name: "Happ",
    icon: "🟢",
    urlScheme: (url) => `happ://add-sub?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Incy",
    icon: "🔵",
    urlScheme: (url) => `incy://install-sub?url=${encodeURIComponent(url)}`,
  },
  {
    name: "V2RayNG",
    icon: "🟣",
    urlScheme: (url) => `v2rayng://install-config?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Streisand",
    icon: "⚡",
    urlScheme: (url) => `streisand://import/${url}`,
  },
  {
    name: "Hiddify",
    icon: "🟡",
    urlScheme: (url) => `hiddify://import/${url}`,
  },
  {
    name: "Shadowrocket",
    icon: "🚀",
    urlScheme: (url) => `sub://add?url=${encodeURIComponent(url)}`,
  },
];

export default function SubPageClient({
  slug,
  title,
  logoUrl,
  expiresAt,
  isActive,
}: {
  slug: string;
  title: string;
  logoUrl: string;
  expiresAt: string | null;
  isActive: boolean;
}) {
  const [subUrl, setSubUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    setSubUrl(`${window.location.origin}/api/sub/${slug}`);
  }, [slug]);

  // Countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTime = () => {
      const now = new Date().getTime();
      const exp = new Date(expiresAt).getTime();
      const diff = exp - now;

      if (diff <= 0) {
        setTimeLeft("Истекла");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
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

  const openInClient = (client: VpnClient) => {
    window.location.href = client.urlScheme(subUrl);
    setShowClients(false);
  };

  if (!isActive) {
    return (
      <div className="min-h-screen bg-graphite-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-graphite-900 border border-graphite-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-graphite-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-graphite-300">
            Подписка приостановлена
          </h1>
          <p className="text-graphite-500 text-sm mt-2">
            Свяжитесь с администратором
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-graphite-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        {logoUrl && (
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo"
              className="h-16 w-auto mx-auto object-contain"
            />
          </div>
        )}

        {/* Title */}
        <div className="text-center mb-8">
          {!logoUrl && (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 mb-4 shadow-lg shadow-accent-500/20">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-graphite-50">{title}</h1>

          {expiresAt && (
            <div className="mt-4 inline-flex items-center gap-2 bg-graphite-900 border border-graphite-800 rounded-xl px-4 py-2">
              <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-graphite-300">
                Осталось: <span className="text-graphite-100 font-medium">{timeLeft}</span>
              </span>
            </div>
          )}
        </div>

        {/* Subscription link card */}
        <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 shadow-2xl">
          <label className="block text-sm text-graphite-400 mb-2">
            Ссылка на подписку
          </label>
          <div className="flex gap-2">
            <div className="flex-1 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-sm font-mono text-graphite-300 truncate select-all">
              {subUrl}
            </div>
            <button
              onClick={copyLink}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
                copied
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-accent-500 hover:bg-accent-600 text-white"
              }`}
            >
              {copied ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              )}
            </button>
          </div>

          {/* Actions */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setShowClients(true)}
              className="flex items-center justify-center gap-2 bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 hover:border-graphite-600 text-graphite-200 rounded-xl px-4 py-3 text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Добавить в клиент
            </button>
            <button
              onClick={generateQr}
              className="flex items-center justify-center gap-2 bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 hover:border-graphite-600 text-graphite-200 rounded-xl px-4 py-3 text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              QR-код
            </button>
          </div>
        </div>

        <p className="text-center text-graphite-700 text-xs mt-8">
          SubManager — Безопасные VPN подписки
        </p>
      </div>

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-semibold text-graphite-100 text-center mb-4">
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
              className="w-full py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 hover:border-graphite-600 transition-all font-medium"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-semibold text-graphite-100 text-center mb-4">
              Выберите клиент
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {VPN_CLIENTS.map((client) => (
                <button
                  key={client.name}
                  onClick={() => openInClient(client)}
                  className="flex items-center gap-3 bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 hover:border-accent-500/30 rounded-xl p-4 transition-all text-left"
                >
                  <span className="text-2xl">{client.icon}</span>
                  <span className="text-sm font-medium text-graphite-200">
                    {client.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowClients(false)}
              className="w-full py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 hover:border-graphite-600 transition-all font-medium"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
