"use client";

import { useState, useEffect, useRef, type TouchEvent } from "react";

interface VpnClient {
  name: string;
  icon: string;
  recommended: boolean;
  androidStoreUrl: string;
  iosStoreUrl: string;
  urlScheme: (subUrl: string) => string;
}

const isAmneziaConfig = (key: string) => /^[\s\u180E\u200B-\u200D\u2060\uFEFF]*vpn:\/\//i.test(key);

const VPN_CLIENTS: VpnClient[] = [
  {
    name: "Incy",
    icon: "#22C55E",
    recommended: true,
    androidStoreUrl: "https://play.google.com/store/search?q=Incy&c=apps",
    iosStoreUrl: "https://apps.apple.com/app/id6756943388",
    urlScheme: (url) => `incy://import/${url}`,
  },
  {
    name: "V2Ray",
    icon: "#8B5CF6",
    recommended: true,
    androidStoreUrl: "https://play.google.com/store/apps/details?id=com.v2raytun.android",
    iosStoreUrl: "https://apps.apple.com/app/id6755873784",
    urlScheme: (url) => `v2rayng://install-sub?url=${encodeURIComponent(url)}`,
  },
  {
    name: "Hiddify",
    icon: "#EAB308",
    recommended: true,
    androidStoreUrl: "https://play.google.com/store/search?q=hiddify&c=apps",
    iosStoreUrl: "https://apps.apple.com/app/id6596777532",
    urlScheme: (url) => `hiddify://import/${url}`,
  },
  {
    name: "Happ",
    icon: "#06B6D4",
    recommended: false,
    androidStoreUrl: "",
    iosStoreUrl: "",
    urlScheme: (url) => url,
  },
  {
    name: "Shadowrocket",
    icon: "#F97316",
    recommended: false,
    androidStoreUrl: "https://play.google.com/store/search?q=shadowrocket&c=apps",
    iosStoreUrl: "https://apps.apple.com/app/id932747118",
    urlScheme: (url) => { try { return `sub://${window.btoa(url)}`; } catch { return `sub://${url}`; } },
  },
];

export default function SubPageClient({
  slug,
  title,
  logoUrl,
  logoSize,
  expiresAt,
  initialIsExpired,
  isActive,
  extraConfigsTitle,
  extraConfigs,
  showTotal,
  totalTrafficGb,
  whatsNew,
  lastClientUpdate,
  renewalRetryAt,
  serverNow,
}: {
  slug: string;
  title: string;
  logoUrl: string;
  logoSize: string;
  expiresAt: string | null;
  initialIsExpired: boolean;
  isActive: boolean;
  extraConfigsTitle: string;
  extraConfigs: {name: string; key: string}[];
  showTotal: boolean;
  totalTrafficGb: number;
  whatsNew: string;
  lastClientUpdate: string | null;
  renewalRetryAt: string | null;
  serverNow: string;
}) {
  const [subUrl, setSubUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(initialIsExpired);

  useEffect(() => {
    setSubUrl(`${window.location.origin}/api/sub/${slug}`);
  }, [slug]);

  // Check expiry and countdown timer
  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft("");
      setIsExpired(false);
      return;
    }

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
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days} д.`);
      if (hours > 0) parts.push(`${hours} ч.`);
      if (minutes > 0) parts.push(`${minutes} мин.`);
      parts.push(`${seconds} сек.`);
      setTimeLeft(parts.join(" "));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
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
  const [clientNotice, setClientNotice] = useState("");
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showExtraConfigs, setShowExtraConfigs] = useState(false);
  const [selectedExtraConfig, setSelectedExtraConfig] = useState<{name: string; key: string} | null>(null);
  const [extraCopied, setExtraCopied] = useState(false);
  const [clientView, setClientView] = useState<"picker" | "warning">("picker");
  const [manualImportClient, setManualImportClient] = useState<"Happ" | "Shadowrocket" | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showReportInfo, setShowReportInfo] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [renewalStatus, setRenewalStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const initialServerNow = new Date(serverNow).getTime();
  const initialRetryAt = renewalRetryAt ? new Date(renewalRetryAt).getTime() : 0;
  const [renewalRetryAtState, setRenewalRetryAtState] = useState(
    initialRetryAt > initialServerNow ? renewalRetryAt : null
  );
  const [serverClockOffset, setServerClockOffset] = useState(initialServerNow - Date.now());
  const [renewalSecondsLeft, setRenewalSecondsLeft] = useState(() =>
    initialRetryAt > initialServerNow ? Math.ceil((initialRetryAt - initialServerNow) / 1000) : 0
  );
  const [clientTimeZone, setClientTimeZone] = useState("Europe/Moscow");
  const [pullDistance, setPullDistance] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pullStartRef = useRef<{ x: number; y: number } | null>(null);
  const pullActiveRef = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timeZone) {
        new Intl.DateTimeFormat("ru-RU", { timeZone }).format();
        setClientTimeZone(timeZone);
      }
    } catch {
      setClientTimeZone("Europe/Moscow");
    }
  }, []);

  useEffect(() => {
    const nextServerNow = new Date(serverNow).getTime();
    const nextRetryAt = renewalRetryAt ? new Date(renewalRetryAt).getTime() : 0;
    if (!Number.isFinite(nextServerNow)) return;

    setServerClockOffset(nextServerNow - Date.now());
    setRenewalRetryAtState(nextRetryAt > nextServerNow ? renewalRetryAt : null);
    setRenewalSecondsLeft(nextRetryAt > nextServerNow ? Math.ceil((nextRetryAt - nextServerNow) / 1000) : 0);
  }, [renewalRetryAt, serverNow]);

  useEffect(() => {
    const updateCooldown = () => {
      if (!renewalRetryAtState) {
        setRenewalSecondsLeft(0);
        return;
      }
      const retryTime = new Date(renewalRetryAtState).getTime();
      if (!Number.isFinite(retryTime)) return;
      const seconds = Math.max(0, Math.ceil((retryTime - (Date.now() + serverClockOffset)) / 1000));
      setRenewalSecondsLeft(seconds);
      if (seconds === 0) setRenewalRetryAtState(null);
    };
    updateCooldown();
    const interval = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(interval);
  }, [renewalRetryAtState, serverClockOffset]);

  const submitReport = async () => {
    const message = reportMessage.trim();
    if (message.length < 10) return;
    setReportStatus("sending");
    try {
      const response = await fetch(`/api/sub/${slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error();
      setReportStatus("success");
      setReportMessage("");
    } catch {
      setReportStatus("error");
    }
  };

  const requestRenewal = async () => {
    if (renewalStatus === "sending" || renewalStatus === "success" || renewalSecondsLeft > 0) return;
    setRenewalStatus("sending");
    try {
      const response = await fetch(`/api/sub/${slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "renewal" }),
      });
      if (!response.ok) throw new Error();
      const data: { retryAt?: unknown; serverNow?: unknown } = await response.json();
      if (typeof data.retryAt !== "string" || typeof data.serverNow !== "string") throw new Error();
      const retryTime = new Date(data.retryAt).getTime();
      const responseServerNow = new Date(data.serverNow).getTime();
      if (!Number.isFinite(retryTime) || !Number.isFinite(responseServerNow) || retryTime <= responseServerNow) throw new Error();
      setServerClockOffset(responseServerNow - Date.now());
      setRenewalRetryAtState(data.retryAt);
      setRenewalSecondsLeft(Math.ceil((retryTime - responseServerNow) / 1000));
      setRenewalStatus("success");
      window.setTimeout(() => setRenewalStatus("idle"), 1500);
    } catch {
      setRenewalStatus("error");
    }
  };

  const copySubscriptionFallback = async () => {
    try {
      await navigator.clipboard.writeText(subUrl);
      setClientNotice("Ссылка скопирована в буфер обмена. Откройте приложение-клиент на устройстве и вставьте туда скопированное содержимое");
    } catch {
      setClientNotice("Не удалось скопировать ссылку. Скопируйте её вручную");
    }
    setTimeout(() => setClientNotice(""), 7000);
  };

  const openInClient = (client: VpnClient) => {
    if (client.name === "Happ" || client.name === "Shadowrocket") {
      const manualClient = client.name;
      void navigator.clipboard.writeText(subUrl).then(() => {
        setShowClients(false);
        setManualImportClient(manualClient);
      }).catch(() => setClientNotice("Не удалось скопировать ссылку. Скопируйте её вручную"));
      return;
    }
    setShowClients(false);

    const userAgent = navigator.userAgent;
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);

    if (!isAndroid && !isIOS) {
      void copySubscriptionFallback();
      return;
    }

    let appOpened = false;
    let fallbackTimer: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("blur", handleBlur);
      clearTimeout(fallbackTimer);
    };
    const markAsOpened = () => {
      appOpened = true;
      cleanup();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) markAsOpened();
    };
    const handlePageHide = () => markAsOpened();
    const handleBlur = () => markAsOpened();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("blur", handleBlur);

    fallbackTimer = setTimeout(() => {
      cleanup();
      if (!appOpened) {
        window.location.href = isAndroid ? client.androidStoreUrl : client.iosStoreUrl;
      }
    }, 4500);

    const clientId = client.name.toLowerCase();
    const rawSubscriptionUrl = new URL(subUrl);
    rawSubscriptionUrl.searchParams.set("client", clientId);
    rawSubscriptionUrl.searchParams.set("format", "raw");
    window.location.href = client.urlScheme(rawSubscriptionUrl.toString());
  };

  const openExtraConfig = (config: {name: string; key: string}) => {
    setSelectedExtraConfig(config);
    setExtraCopied(false);
  };

  const copyExtraConfig = async () => {
    if (!selectedExtraConfig) return;
    try {
      await navigator.clipboard.writeText(selectedExtraConfig.key.trim());
      setExtraCopied(true);
      setTimeout(() => setExtraCopied(false), 2200);
    } catch {
      setClipboardMsg("Не удалось скопировать конфиг");
      setTimeout(() => setClipboardMsg(""), 3000);
    }
  };

  const openSelectedExtraConfig = () => {
    if (!selectedExtraConfig) return;
    window.location.href = selectedExtraConfig.key.trim();
  };

  const closeExtraConfigs = () => {
    setShowExtraConfigs(false);
    setSelectedExtraConfig(null);
    setExtraCopied(false);
  };

  const handlePullStart = (event: TouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      event.touches.length !== 1 ||
      scrollContainerRef.current?.scrollTop !== 0 ||
      target.closest("button, a, input, textarea, select, [role='button'], [data-no-pull-refresh]")
    ) {
      pullStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    pullStartRef.current = { x: touch.clientX, y: touch.clientY };
    pullActiveRef.current = false;
  };

  const handlePullMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = pullStartRef.current;
    if (!start || event.touches.length !== 1 || (scrollContainerRef.current?.scrollTop ?? 0) > 0) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (!pullActiveRef.current) {
      if (deltaY <= 8 || Math.abs(deltaX) >= deltaY * 0.65) {
        if (Math.abs(deltaX) > 10 || deltaY < -4) pullStartRef.current = null;
        return;
      }
      pullActiveRef.current = true;
    }

    if (deltaY > 0 && Math.abs(deltaX) < deltaY * 0.65) {
      event.preventDefault();
      const nextDistance = Math.min(112, deltaY * 0.46);
      pullDistanceRef.current = nextDistance;
      setPullDistance(nextDistance);
    }
  };

  const handlePullEnd = () => {
    const shouldRefresh = pullActiveRef.current && pullDistanceRef.current >= 72;
    pullStartRef.current = null;
    pullActiveRef.current = false;
    pullDistanceRef.current = 0;
    setPullDistance(0);
    if (shouldRefresh) window.location.reload();
  };

  const logoSizeClass = {
    small: "h-12",
    medium: "h-20",
    large: "h-32",
  }[logoSize] || "h-16";

  const formatUpdateTime = (timestamp: string | null) => {
    if (!timestamp) return "нет данных";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "нет данных";
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: clientTimeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  };
  const getUpdateColor = (ageHours: number | null) => ageHours === null || ageHours <= 6
    ? "text-white"
    : ageHours <= 24
      ? "text-yellow-400"
      : "text-red-400";
  const lastUpdateAgeHours = lastClientUpdate
    ? (Date.now() - new Date(lastClientUpdate).getTime()) / 3_600_000
    : null;
  const formattedLastClientUpdate = formatUpdateTime(lastClientUpdate);
  const lastUpdateColor = getUpdateColor(lastUpdateAgeHours);
  const amneziaConfigCount = extraConfigs.filter((config) => isAmneziaConfig(config.key)).length;
  const mainExtraConfigIsAmnezia = amneziaConfigCount === 1 || (
    extraConfigs.length > 0 && amneziaConfigCount === extraConfigs.length
  );
  const hasWhatsNew = whatsNew.trim().length > 0;
  const renewalHours = Math.floor(renewalSecondsLeft / 3600);
  const renewalMinutes = Math.floor((renewalSecondsLeft % 3600) / 60);
  const renewalSeconds = renewalSecondsLeft % 60;
  const renewalCountdown = `${renewalHours} часа ${String(renewalMinutes).padStart(2, "0")} минут ${String(renewalSeconds).padStart(2, "0")} секунд`;

  // Paused subscription
  if (!isActive) {
    return (
      <div className="sub-public-page sub-public-state bg-[#0B0B0E] text-white flex items-center justify-center px-4">
        <div
          className="sub-public-state-glow"
          style={{ background: "radial-gradient(circle at center, rgba(240,185,0,0.12), transparent 66%)" }}
        />
        <div className="sub-public-state-content text-center b-anim">
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
      <div
        ref={scrollContainerRef}
        className="sub-public-page sub-public-state sub-public-state-expired bg-[#0B0B0E] text-white"
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={handlePullEnd}
      >
        <div
          className={`sub-pull-indicator ${pullDistance > 0 ? "is-visible" : ""}`}
          style={{ transform: `translate(-50%, ${Math.min(48, pullDistance) - 36}px)`, opacity: Math.min(1, pullDistance / 42) }}
          aria-hidden="true"
        >
          <svg className={pullDistance >= 72 ? "is-ready" : ""} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-5-5m5 5l5-5" /></svg>
        </div>
        <div
          className="sub-public-state-glow"
          style={{ background: "radial-gradient(circle at center, rgba(248,113,113,0.11), transparent 66%)" }}
        />
        <div className="sub-public-state-content text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
            <svg className="w-14 h-14 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-400 mb-3">
            <span className="b-glitch">Истёк срок использования подписки</span>
          </h1>
          <p className="text-graphite-400 text-sm leading-relaxed">Для продления обратитесь к владельцу сервиса</p>
          <div className="mt-6 px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-graphite-500 text-xs">Срок действия истёк: {new Date(expiresAt!).toLocaleString("ru-RU")}</p>
          </div>
          {renewalStatus === "success" ? (
            <button
              type="button"
              disabled
              className="sub-renewal-button is-success mt-4 w-full rounded-xl border px-4 py-3 text-sm font-medium cursor-default"
            >
              Запрос отправлен
            </button>
          ) : renewalSecondsLeft > 0 ? (
            <p className="mt-4 rounded-xl border border-red-400/20 bg-white/[0.04] px-4 py-3 text-sm text-graphite-300" aria-live="polite">
              Повторный запрос возможен через {renewalCountdown}
            </p>
          ) : (
            <button
              type="button"
              onClick={requestRenewal}
              disabled={renewalStatus === "sending"}
              className="sub-renewal-button mt-4 w-full rounded-xl border px-4 py-3 text-sm font-medium disabled:cursor-default"
            >
              {renewalStatus === "sending" ? "Отправка..." : renewalStatus === "error" ? "Повторить запрос" : "Запросить продление"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sub-public-page bg-[#0B0B0E] text-white flex flex-col relative overscroll-none">
      {/* ===== Fixed scrolling stripes (top / bottom) ===== */}
      <div className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-[#0B0B0E]/70 backdrop-blur-[2px] overflow-hidden select-none pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <div className="b-marquee text-[9px] font-medium tracking-[0.2em]">
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none bg-[#0B0B0E]/70 backdrop-blur-[2px] overflow-hidden select-none pt-2 pb-[max(env(safe-area-inset-bottom),8px)]">
        <div className="b-marquee-rev text-[9px] font-medium tracking-[0.2em]">
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
          <span className="bg-gradient-to-r from-[#3c3c41] to-[#c9a000] bg-clip-text text-transparent pr-14">inviLink - сетевые технологии | Ваша подписка для VPN клиента.</span>
        </div>
      </div>

      {/* ===== Scrollable content between fixed marquees ===== */}
      <div
        ref={scrollContainerRef}
        className="sub-public-scroller relative flex flex-col flex-1 min-h-0 overscroll-contain px-4 pt-[calc(max(env(safe-area-inset-top),8px)+36px)] pb-[calc(max(env(safe-area-inset-bottom),8px)+36px)]"
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={handlePullEnd}
      >
        <div
          className={`sub-pull-indicator ${pullDistance > 0 ? "is-visible" : ""}`}
          style={{ transform: `translate(-50%, ${Math.min(48, pullDistance) - 36}px)`, opacity: Math.min(1, pullDistance / 42) }}
          aria-hidden="true"
        >
          <svg className={pullDistance >= 72 ? "is-ready" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0 5-5m-5 5-5-5" />
          </svg>
        </div>
        <div className="sub-page-content relative isolate w-full max-w-md mx-auto py-6">
          {/* ===== Yellow glow under the content ===== */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-24 w-[560px] h-[320px] rounded-full -z-10"
            style={{ background: "radial-gradient(ellipse at 50% 80%, rgba(240,185,0,0.2), transparent 70%)" }}
          />
          <div className="relative b-anim">
        {hasWhatsNew && (
          <div className="mb-4 flex flex-col items-center gap-2 text-center">
            <button onClick={() => setShowWhatsNew(true)} className="text-xs font-semibold tracking-wide text-white/75 underline decoration-[#F0B900]/40 underline-offset-4 hover:text-[#F0B900]">
              Что нового?
            </button>
          </div>
        )}
        {/* Logo */}
        <div
          className="text-center mb-6 select-none"
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl || "/invilink-default-logo.webp"}
            alt={logoUrl ? "Logo" : "inviLink"}
            draggable={false}
            className={logoUrl
              ? `${logoSizeClass} w-auto mx-auto object-contain pointer-events-none`
              : "w-[min(82vw,340px)] max-h-28 mx-auto object-contain pointer-events-none opacity-95 mix-blend-lighten drop-shadow-[0_0_22px_rgba(240,185,0,0.12)]"
            }
          />
        </div>

        {/* Title */}
        <div className="text-center mb-8">
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

          <div className="mt-4 inline-flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2">
            {expiresAt && !isExpired && (
              <div className="inline-flex items-center gap-2">
                <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="inline-flex items-baseline gap-1 text-sm text-graphite-300">
                  <span>Осталось:</span><span className="text-white font-semibold">{timeLeft}</span>
                </span>
              </div>
            )}
            <div className={`text-xs ${lastUpdateColor}`}>
              Обновлено в клиенте: {formattedLastClientUpdate}
            </div>
            {lastUpdateAgeHours !== null && lastUpdateAgeHours > 24 && (
              <div className="text-[10px] text-red-400">(требуется обновить подписку в клиенте)</div>
            )}
          </div>
          {(!expiresAt || (showTotal && totalTrafficGb > 0)) && (
            <div className="mt-2 text-[10px] font-medium tracking-wide text-white/55">
              {!expiresAt && <span className="text-[#F0B900]/70">Бессрочная подписка</span>}
              {!expiresAt && showTotal && totalTrafficGb > 0 && <span> · </span>}
              {showTotal && totalTrafficGb > 0 && <span>Включено трафика: <span className="text-[#F0B900]/75">{totalTrafficGb}Гб</span></span>}
            </div>
          )}
        </div>

        {/* Subscription link card */}
        <div className="sub-link-card bg-[#131417] border border-[#F0B900]/[0.12] rounded-2xl p-6 shadow-2xl">
          <label className="block text-sm text-[#F0B900] mb-2">
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
              className="group flex items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] hover:border-[#F0B900]/50 hover:bg-[#F0B900]/[0.06] px-4 py-3 text-sm font-bold text-white/90 transition-colors"
            >
              <span className="truncate">Добавить в клиент</span>
              <svg className="w-4 h-4 text-[#F0B900] flex-shrink-0 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
            <button
              onClick={generateQr}
              className="group flex items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] hover:border-[#F0B900]/50 hover:bg-[#F0B900]/[0.06] px-4 py-3 text-sm font-bold text-white/90 transition-colors"
            >
              <span className="truncate">QR-код</span>
              <svg className="w-4 h-4 text-[#F0B900] flex-shrink-0 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Extra Configs Section */}
        {extraConfigs.length > 0 && (
          <button
            onClick={() => {
              setSelectedExtraConfig(null);
              setExtraCopied(false);
              if (extraConfigs.length === 1) {
                openExtraConfig(extraConfigs[0]);
              }
              setShowExtraConfigs(true);
            }}
            className="mt-4 w-full flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#131417] hover:bg-white/[0.03] hover:border-[#F0B900]/40 p-5 text-left transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl bg-[#202124] border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden select-none"
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
              >
                {mainExtraConfigIsAmnezia ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src="/amneziawg.webp"
                    alt="AmneziaWG"
                    width={96}
                    height={96}
                    draggable={false}
                    className="w-10 h-10 object-contain pointer-events-none select-none"
                  />
                ) : (
                  <svg className="w-5 h-5 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
              <div className="min-w-0">
                 <span className="text-sm font-semibold text-white block">{extraConfigsTitle || "Дополнительные конфиги"}</span>
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
        <button onClick={() => setShowReportInfo(true)} className="mt-2 block w-full text-center text-xs font-semibold text-white/70 underline underline-offset-4 hover:text-[#F0B900]">
          Что-то не работает?
        </button>
        <button onClick={() => setShowDisclaimer(true)} className="mt-5 block w-full text-center text-[11px] font-medium text-white/55 underline underline-offset-4 hover:text-[#F0B900]">
          Отказ от ответственности
        </button>
      </div>
      </div>
      </div>

      {clientNotice && (
        <div className="fixed left-1/2 top-[max(env(safe-area-inset-top),20px)] z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[#F0B900]/25 bg-[#131417]/95 px-5 py-4 text-center text-sm leading-relaxed text-white/90 shadow-2xl backdrop-blur-xl animate-fade-in">
          {clientNotice}
        </div>
      )}

      {showWhatsNew && hasWhatsNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="flex max-h-[min(82dvh,620px)] w-full max-w-md flex-col rounded-2xl border border-[#F0B900]/15 bg-[#131417] p-5 shadow-2xl animate-slide-up">
            <h3 className="shrink-0 text-center text-xl font-bold text-[#F0B900]">
              Что нового в последних изменениях?
            </h3>
            <div className="my-5 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/75">
                {whatsNew.trim()}
              </p>
            </div>
            <button
              onClick={() => setShowWhatsNew(false)}
              className="shrink-0 w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-colors font-semibold"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {showDisclaimer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="flex max-h-[min(86dvh,680px)] w-full max-w-md flex-col rounded-2xl border border-[#F0B900]/15 bg-[#131417] p-5 shadow-2xl animate-slide-up">
            <h3 className="shrink-0 text-center text-lg font-bold text-[#F0B900]">ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ</h3>
            <div className="my-5 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
              <p className="text-sm leading-7 text-white/75">Настоящая подписка на конфигурации VPN предназначена исключительно для индивидуального использования на одном устройстве; в случае выявления множественных одновременных подключений, аномально высокого трафика, использования сервиса для осуществления спам-рассылок (несанкционированных массовых коммуникаций), совершения вредоносных кибератак, несанкционированного доступа к компьютерной информации или иных деструктивных действий, владелец сервиса, предоставляющий подписку оставляет за собой право незамедлительно аннулировать подписку в одностороннем порядке без предварительного уведомления и возврата средств (если была произведена оплата за использование сервиса), при этом сервис не несет ответственности за любые прямые или косвенные убытки пользователя. @LarsGravesen</p>
            </div>
            <button onClick={() => setShowDisclaimer(false)} className="shrink-0 w-full rounded-xl bg-white/[0.06] py-3 font-semibold text-white/80 hover:bg-white/[0.12]">Закрыть</button>
          </div>
        </div>
      )}

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
              className="group w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#F0B900] hover:bg-[#E0A700] text-[#0B0B0E] px-4 py-3 font-bold transition-colors"
            >
              <span>Закрыть</span>
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Client Selection Modal */}
      {showClients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="bg-[#131417] border border-white/10 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            {clientView === "warning" ? <>
              <h3 className="text-lg font-bold text-[#F0B900] text-center mb-4">Важно</h3>
               <p className="rounded-xl border border-[#F0B900]/30 bg-[#F0B900]/10 p-5 text-lg font-semibold leading-relaxed text-white">В случае если подписка не добавляется автоматически, скопируйте ссылку и вставьте в клиент вручную.</p>
              <button onClick={() => setClientView("picker")} className="mt-4 w-full py-3 rounded-xl bg-[#F0B900] text-[#0B0B0E] font-bold">Назад</button>
            </> : <>
            <h3 className="text-lg font-bold text-white text-center mb-4">
              Выберите клиент
            </h3>
            <div className="mb-4 rounded-2xl border border-[#F0B900]/20 bg-[#F0B900]/[0.05] p-3">
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F0B900]/80">Рекомендуемые</p>
              <div className="space-y-2">
                {VPN_CLIENTS.filter((client) => client.recommended).map((client) => (
                  <button
                    key={client.name}
                    onClick={() => openInClient(client)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3.5 transition-all text-left ${client.name === "Incy"
                      ? "bg-emerald-500/[0.08] hover:bg-emerald-500/[0.15] border border-emerald-500/30 hover:border-emerald-400/60 shadow-[0_8px_30px_rgba(34,197,94,0.06)]"
                      : "bg-[#F0B900]/[0.07] hover:bg-[#F0B900]/[0.13] border border-[#F0B900]/20 hover:border-[#F0B900]/50 shadow-[0_8px_30px_rgba(240,185,0,0.04)]"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full flex-shrink-0 ring-4 ring-white/[0.03]" style={{ backgroundColor: client.icon }} />
                    <span className="text-sm font-bold text-white/90">{client.name}</span>
                    <svg className="ml-auto w-4 h-4 text-[#F0B900]/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {VPN_CLIENTS.filter((client) => !client.recommended).map((client) => (
                <button
                  key={client.name}
                  onClick={() => openInClient(client)}
                  className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#F0B900]/50 rounded-xl p-4 transition-all text-left"
                >
                  <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: client.icon }} />
                  <span className="text-sm font-semibold text-white/80">{client.name}</span>
                </button>
              ))}
            </div>
             <button onClick={() => setClientView("warning")} className="mb-4 text-left text-[9px] leading-relaxed text-[#F0B900]/80 underline underline-offset-2">В случае если подписка не добавляется автоматически, скопируйте ссылку и вставьте в клиент вручную.</button>
            <button
              onClick={() => { setShowClients(false); setClientView("picker"); }}
              className="w-full py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/80 hover:text-white transition-colors font-semibold"
            >
              Закрыть
            </button>
            </>}
          </div>
        </div>
      )}

      {manualImportClient && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><div className="max-w-md rounded-2xl border border-emerald-500/30 bg-[#131417] p-6 shadow-2xl"><p className="rounded-xl bg-emerald-500/10 p-4 text-center font-bold leading-relaxed text-emerald-300">{manualImportClient === "Happ" ? <>Ссылка скопирована. Откройте приложение Happ, добавьте подписку вручную нажав &quot;+&quot;, а затем &quot;Вставить из буфера обмена&quot;.</> : <>Ссылка скопирована. Откройте приложение Shadowrocket, нажмите на три точки в правом верхнем углу экрана и выберите &quot;Импорт из буфера обмена.&quot;</>}</p><button onClick={() => setManualImportClient(null)} className="mt-5 w-full rounded-xl bg-white/10 py-3 font-semibold">Закрыть</button></div></div>}

      {showReportInfo && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><div className="max-w-md rounded-2xl border border-white/10 bg-[#131417] p-6 shadow-2xl"><h3 className="mb-3 text-lg font-bold">Сообщить о проблеме</h3><p className="text-sm leading-relaxed text-white/75">Если что-то не работает, напишите об этом. Постарайтесь детально и точно описать что именно не работает или работает не корректно.</p><div className="mt-5 flex gap-3"><button onClick={() => { setShowReportInfo(false); setShowReportForm(true); setReportStatus("idle"); }} className="flex-1 rounded-xl bg-[#F0B900] py-3 font-bold text-black">Написать о проблеме</button><button onClick={() => setShowReportInfo(false)} className="flex-1 rounded-xl bg-white/10 py-3 font-semibold">Закрыть</button></div></div></div>}

      {showReportForm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#131417] p-6 shadow-2xl"><h3 className="mb-4 text-lg font-bold">Описание проблемы</h3>{reportStatus === "success" ? <><p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">Сообщение успешно отправлено. Спасибо за подробное описание.</p><button onClick={() => setShowReportForm(false)} className="mt-4 w-full rounded-xl bg-white/10 py-3 font-semibold">Закрыть</button></> : <><textarea value={reportMessage} onChange={(e) => { setReportMessage(e.target.value); setReportStatus("idle"); }} rows={6} maxLength={2000} placeholder="Опишите проблему (не менее 10 символов)" className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-4 text-sm outline-none focus:border-[#F0B900]/60" />{reportStatus === "error" && <p className="mt-2 text-sm text-red-400">Не удалось отправить сообщение. Проверьте соединение и попробуйте снова.</p>}<div className="mt-4 flex gap-3"><button disabled={reportMessage.trim().length < 10 || reportStatus === "sending"} onClick={submitReport} className="flex-1 rounded-xl bg-[#F0B900] py-3 font-bold text-black disabled:opacity-40">{reportStatus === "sending" ? "Отправка..." : "Отправить"}</button><button disabled={reportStatus === "sending"} onClick={() => setShowReportForm(false)} className="flex-1 rounded-xl bg-white/10 py-3 font-semibold">Отмена</button></div></>}</div></div>}

      {/* Extra Configs Modal */}
      {showExtraConfigs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[6px] p-4">
          <div className="bg-[#131417] border border-white/10 rounded-2xl p-5 w-full max-w-sm max-h-[90dvh] overflow-y-auto animate-slide-up shadow-2xl">
            {!selectedExtraConfig ? (
              <>
                <h3 className="text-lg font-bold text-white text-center mb-4">
                  {extraConfigsTitle || "Дополнительные конфиги"}
                </h3>
                <div className="space-y-2 mb-4">
                  {extraConfigs.map((cfg, idx) => (
                    <button
                      key={idx}
                      onClick={() => openExtraConfig(cfg)}
                      className="w-full flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#F0B900]/50 rounded-xl p-4 transition-all text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg bg-[#202124] border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden select-none"
                        onContextMenu={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                      >
                        {isAmneziaConfig(cfg.key) ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src="/amneziawg.webp"
                            alt="AmneziaWG"
                            width={96}
                            height={96}
                            draggable={false}
                            className="w-8 h-8 rounded-lg object-contain pointer-events-none select-none"
                          />
                        ) : (
                          <svg className="w-4 h-4 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543.826 3.31 2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-white/80 truncate">{cfg.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white text-center mb-5 break-words">
                  {selectedExtraConfig.name}
                </h3>
                <div className="space-y-3 mb-5">
                  <button
                    onClick={openSelectedExtraConfig}
                    className="w-full flex items-center justify-between gap-3 rounded-xl bg-[#F0B900] hover:bg-[#E0A700] text-[#0B0B0E] px-4 py-3.5 font-bold transition-colors"
                  >
                     <span>{isAmneziaConfig(selectedExtraConfig.key) ? "Открыть в AmneziaWG" : "Открыть"}</span>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M4 12h16" />
                    </svg>
                  </button>
                  <div className="relative">
                    <button
                      onClick={copyExtraConfig}
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/90 px-4 py-3.5 font-bold transition-colors"
                    >
                      <span>Скопировать</span>
                      <svg className="w-5 h-5 flex-shrink-0 text-[#F0B900]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </button>
                    {extraCopied && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[#16A34A]/95 text-white font-bold animate-fade-in">
                        Скопировано
                      </div>
                    )}
                  </div>
                  {isAmneziaConfig(selectedExtraConfig.key) ? (
                    <div className="flex flex-col min-[360px]:flex-row gap-3 min-h-28 overflow-hidden rounded-xl border border-[#F0B900]/30 bg-[#F0B900]/10 p-3 text-sm leading-relaxed text-white/85">
                      <div
                        className="w-24 h-24 flex-none self-center overflow-hidden rounded-xl bg-[#202124] select-none"
                        onContextMenu={(event) => event.preventDefault()}
                        onDragStart={(event) => event.preventDefault()}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/amneziawg.webp"
                          alt="AmneziaWG"
                          width={96}
                          height={96}
                          draggable={false}
                          className="w-24 h-24 object-contain pointer-events-none select-none"
                        />
                      </div>
                      <div className="min-w-0 self-center">
                        Конфигурация AmneziaWG используется строго на одном устройстве в приложении &quot;Amnezia VPN&quot; и является индивидуальной, если планируется использовать несколько устройств, необходимо добавлять индивидуальные конфигурации на каждое устройство отдельно!
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#F0B900]/30 bg-[#F0B900]/10 px-4 py-3 text-sm leading-relaxed text-white/85">
                      Конфигурации для некоторых протоколов работают только на одном устройстве. При добавлении одинаковых конфигураций на несколько устройств, возможны проблемы с подключением и работой протокола. Во избежание проблем, используйте конфигурацию только на одном устройстве!
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={closeExtraConfigs}
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