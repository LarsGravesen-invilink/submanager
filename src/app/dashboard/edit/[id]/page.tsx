"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";

interface SubKey {
  id: string;
  keyValue: string;
  customName: string;
  originalName: string;
  sourceType: string;
  sourceUrl: string;
  isEnabled: boolean;
  keyFingerprint: string;
}

interface LogEntry {
  id: string;
  ip: string;
  userAgent: string;
  deviceName: string;
  deviceType: string;
  accessedAt: string;
}

interface SubData {
  id: string;
  name: string;
  title: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  autoUpdateMinutes: number;
  clientUpdateHours: number;
  uniqueHits: number;
  totalHits: number;
  logoUrl: string;
  pageTitle: string;
  showExpiry?: boolean;
  showUpload?: boolean;
  showDownload?: boolean;
  showTotal?: boolean;
  totalTrafficGb?: number;
  usedUploadGb?: number;
  usedDownloadGb?: number;
  keys: SubKey[];
  sources: unknown[];
  logs: LogEntry[];
}

export default function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sub, setSub] = useState<SubData | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [autoUpdateMinutes, setAutoUpdateMinutes] = useState(60);
  const [clientUpdateHours, setClientUpdateHours] = useState(24);

  // Expiry
  const [expiryType, setExpiryType] = useState<"none" | "months" | "days" | "hours" | "custom">("none");
  const [expiryMonths, setExpiryMonths] = useState(1);
  const [expiryDays, setExpiryDays] = useState(30);
  const [expiryHours, setExpiryHours] = useState(24);
  const [expiryMinutes, setExpiryMinutes] = useState(0);
  const [expiresAtRaw, setExpiresAtRaw] = useState("");

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pageTitle, setPageTitle] = useState("");
  const [showExpiry, setShowExpiry] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [totalTrafficGb, setTotalTrafficGb] = useState(0);
  const [usedUploadGb, setUsedUploadGb] = useState(0);
  const [usedDownloadGb, setUsedDownloadGb] = useState(0);
  const [keys, setKeys] = useState<SubKey[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const loadSub = useCallback(async () => {
    const res = await fetch(`/api/subscriptions/${id}`);
    if (res.status === 401) { router.push("/"); return; }
    if (!res.ok) { router.push("/dashboard"); return; }
    const data: SubData = await res.json();
    setSub(data);
    setName(data.name);
    setTitle(data.title);
    setAutoUpdateMinutes(data.autoUpdateMinutes);
    setClientUpdateHours(data.clientUpdateHours);
    if (data.expiresAt) {
      setExpiryType("custom");
      setExpiresAtRaw(new Date(data.expiresAt).toISOString().slice(0, 16));
    }
    setLogoUrl(data.logoUrl || "");
    setLogoPreview(data.logoUrl || "");
    setPageTitle(data.pageTitle || "");
    setShowExpiry(data.showExpiry !== false);
    setShowUpload(data.showUpload === true);
    setShowDownload(data.showDownload === true);
    setShowTotal(data.showTotal === true);
    setTotalTrafficGb(data.totalTrafficGb || 0);
    setUsedUploadGb(data.usedUploadGb || 0);
    setUsedDownloadGb(data.usedDownloadGb || 0);
    setKeys(data.keys);
  }, [id, router]);

  useEffect(() => { loadSub(); }, [loadSub]);

  const calculateExpiryDate = (): string | null => {
    if (expiryType === "none") return null;
    if (expiryType === "custom" && expiresAtRaw) return new Date(expiresAtRaw).toISOString();
    const now = new Date();
    switch (expiryType) {
      case "months": now.setMonth(now.getMonth() + expiryMonths); break;
      case "days": now.setDate(now.getDate() + expiryDays); break;
      case "hours": now.setHours(now.getHours() + expiryHours); now.setMinutes(now.getMinutes() + expiryMinutes); break;
    }
    return now.toISOString();
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const r = ev.target?.result as string; setLogoPreview(r); setLogoUrl(r); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Название обязательно"); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), title: title.trim(), autoUpdateMinutes, clientUpdateHours,
          expiresAt: calculateExpiryDate(), logoUrl, pageTitle,
          showExpiry, showUpload, showDownload, showTotal,
          totalTrafficGb, usedUploadGb, usedDownloadGb,
          keys: keys.map((k) => ({ value: k.keyValue, customName: k.customName, sourceType: k.sourceType, sourceUrl: k.sourceUrl, isEnabled: k.isEnabled })),
        }),
      });
      if (res.ok) router.push("/dashboard");
      else { const d = await res.json(); setError(d.error || "Ошибка"); }
    } catch { setError("Ошибка сети"); }
    setSaving(false);
  };

  const copyLink = async () => {
    if (!sub) return;
    await navigator.clipboard.writeText(`${window.location.origin}/api/sub/${sub.slug}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (!sub) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-graphite-950">
      <header className="sticky top-0 z-50 bg-graphite-950/80 backdrop-blur-xl border-b border-graphite-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-graphite-400 hover:text-graphite-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>Назад
          </button>
          <h1 className="text-lg font-semibold text-graphite-100">Редактирование</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Link */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-sm font-mono text-graphite-300 truncate">
              {typeof window !== "undefined" && `${window.location.origin}/api/sub/${sub.slug}`}
            </div>
            <button onClick={copyLink} className={`px-4 py-3 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${copied ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-accent-500 hover:bg-accent-600 text-white"}`}>
              {copied ? "Скопировано!" : "Копировать"}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-graphite-500">
            <span>Уникальных: {sub.uniqueHits}</span>
            <span>Всего: {sub.totalHits}</span>
          </div>
        </section>

        {/* Basic info */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Основная информация</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Название</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Заголовок в клиенте</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
          </div>
        </section>

        {/* Keys — mobile-friendly */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Ключи ({keys.length})</h2>
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className={`rounded-xl p-3 transition-all ${key.isEnabled ? "bg-graphite-800/50" : "bg-graphite-800/20 opacity-50"}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setKeys((p) => p.map((k) => k.id === key.id ? { ...k, isEnabled: !k.isEnabled } : k))}
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${key.isEnabled ? "bg-accent-500 border-accent-500 text-white" : "border-graphite-600 bg-graphite-700"}`}>
                    {key.isEnabled && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-graphite-200 truncate">{key.customName || key.originalName || key.keyValue.slice(0, 50)}</p>
                    <p className="text-xs text-graphite-500 truncate">{key.sourceType === "remote" ? `Источник: ${key.sourceUrl}` : "Вручную"}</p>
                  </div>
                  <button onClick={() => setKeys((p) => p.filter((k) => k.id !== key.id))} className="text-graphite-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                {/* Name field — ALWAYS visible, including mobile */}
                <input value={key.customName} onChange={(e) => setKeys((p) => p.map((k) => k.id === key.id ? { ...k, customName: e.target.value } : k))}
                  className="mt-2 w-full bg-graphite-800 border border-graphite-700/50 rounded-lg px-3 py-2 text-sm text-graphite-200 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                  placeholder={key.originalName ? `Оригинальное: ${key.originalName}` : "Имя ключа в клиенте"} />
              </div>
            ))}
          </div>
        </section>

        {/* Expiry — improved */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Срок действия</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {(["none", "months", "days", "hours", "custom"] as const).map((t) => (
              <button key={t} onClick={() => setExpiryType(t)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${expiryType === t ? "bg-accent-500 text-white" : "bg-graphite-800 text-graphite-400 border border-graphite-700"}`}>
                {t === "none" && "Бессрочно"}{t === "months" && "Месяцы"}{t === "days" && "Дни"}{t === "hours" && "Часы"}{t === "custom" && "Точная дата"}
              </button>
            ))}
          </div>
          {expiryType === "months" && <div className="flex items-center gap-3"><input type="number" min={1} value={expiryMonths} onChange={(e) => setExpiryMonths(Number(e.target.value) || 1)} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">месяц(ев) от текущей даты</span></div>}
          {expiryType === "days" && <div className="flex items-center gap-3"><input type="number" min={1} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value) || 1)} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">дней от текущей даты</span></div>}
          {expiryType === "hours" && <div className="flex items-center gap-3"><input type="number" min={0} value={expiryHours} onChange={(e) => setExpiryHours(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">ч.</span><input type="number" min={0} max={59} value={expiryMinutes} onChange={(e) => setExpiryMinutes(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">мин.</span></div>}
          {expiryType === "custom" && <input type="datetime-local" value={expiresAtRaw} onChange={(e) => setExpiresAtRaw(e.target.value)} className="w-full sm:w-auto bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />}
        </section>

        {/* Settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Настройки</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm text-graphite-400 mb-1.5">Обновление источников (мин)</label><input type="number" value={autoUpdateMinutes} onChange={(e) => setAutoUpdateMinutes(Number(e.target.value))} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50" /></div>
            <div><label className="block text-sm text-graphite-400 mb-1.5">Автообновление в клиенте (ч)</label><input type="number" value={clientUpdateHours} onChange={(e) => setClientUpdateHours(Number(e.target.value))} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50" /></div>
          </div>
        </section>

        {/* Logo — file upload */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Оформление страницы</h2>
          <div className="mb-4">
            <label className="block text-sm text-graphite-400 mb-1.5">Логотип</label>
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoPreview} alt="Logo" className="h-16 w-auto object-contain rounded-xl" />
                  <button onClick={() => { setLogoUrl(""); setLogoPreview(""); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="w-28 h-16 border-2 border-dashed border-graphite-700 rounded-xl flex flex-col items-center justify-center text-graphite-500 hover:text-graphite-400 hover:border-graphite-600 transition-colors">
                  <svg className="w-5 h-5 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-xs">Загрузить</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
            </div>
          </div>
          <div><label className="block text-sm text-graphite-400 mb-1.5">Заголовок страницы</label><input value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 text-sm" /></div>
        </section>

        {/* Client display */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Отображение в клиенте</h2>
          <div className="space-y-3">
            {([["Срок действия", showExpiry, setShowExpiry], ["Upload", showUpload, setShowUpload], ["Download", showDownload, setShowDownload], ["Лимит трафика", showTotal, setShowTotal]] as [string, boolean, (v: boolean) => void][]).map(([label, val, setter]) => (
              <label key={label} className="flex items-center justify-between py-2 cursor-pointer">
                <span className="text-sm text-graphite-300">{label}</span>
                <button type="button" onClick={() => setter(!val)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${val ? "bg-accent-500" : "bg-graphite-700"}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${val ? "translate-x-4" : ""}`} />
                </button>
              </label>
            ))}
            {showUpload && <div className="ml-4"><label className="block text-xs text-graphite-500 mb-1">Upload (ГБ)</label><input type="number" min={0} value={usedUploadGb} onChange={(e) => setUsedUploadGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" /></div>}
            {showDownload && <div className="ml-4"><label className="block text-xs text-graphite-500 mb-1">Download (ГБ)</label><input type="number" min={0} value={usedDownloadGb} onChange={(e) => setUsedDownloadGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" /></div>}
            {showTotal && <div className="ml-4"><label className="block text-xs text-graphite-500 mb-1">Лимит (ГБ)</label><input type="number" min={0} value={totalTrafficGb} onChange={(e) => setTotalTrafficGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" /></div>}
          </div>
        </section>

        {/* Logs */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 w-full text-left">
            <h2 className="text-lg font-semibold text-graphite-100">Лог обращений ({sub.logs.length})</h2>
            <svg className={`w-5 h-5 text-graphite-400 transition-transform ${showLogs ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showLogs && (
            <div className="mt-4 space-y-1.5 max-h-80 overflow-y-auto">
              {sub.logs.length === 0 ? <p className="text-graphite-500 text-sm">Нет обращений</p> : sub.logs.map((log) => (
                <div key={log.id} className="flex flex-wrap items-center gap-2 text-xs text-graphite-400 bg-graphite-800/30 rounded-lg px-3 py-2">
                  <span className="font-mono">{log.ip}</span><span className="text-graphite-600">·</span><span>{log.deviceName || "?"}</span><span className="text-graphite-600">·</span><span>{new Date(log.accessedAt).toLocaleString("ru-RU")}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}

        <div className="flex gap-3 justify-end pb-8">
          <button onClick={() => router.push("/dashboard")} className="px-6 py-3 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 transition-all">Отмена</button>
          <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium shadow-lg shadow-accent-500/20 transition-all disabled:opacity-50">
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </main>
    </div>
  );
}
