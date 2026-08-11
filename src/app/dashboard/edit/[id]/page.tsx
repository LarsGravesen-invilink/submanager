"use client";

import { useState, useEffect, useCallback, use } from "react";
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

interface SubSource {
  id: string;
  url: string;
  lastStatus: string;
  selectedKeys: string[];
  keyNames: Record<string, string>;
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
  sources: SubSource[];
  logs: LogEntry[];
}

export default function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [sub, setSub] = useState<SubData | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [autoUpdateMinutes, setAutoUpdateMinutes] = useState(60);
  const [clientUpdateHours, setClientUpdateHours] = useState(24);
  const [expiresAt, setExpiresAt] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
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
    if (res.status === 401) {
      router.push("/");
      return;
    }
    if (!res.ok) {
      router.push("/dashboard");
      return;
    }
    const data: SubData = await res.json();
    setSub(data);
    setName(data.name);
    setTitle(data.title);
    setAutoUpdateMinutes(data.autoUpdateMinutes);
    setClientUpdateHours(data.clientUpdateHours);
    setExpiresAt(
      data.expiresAt
        ? new Date(data.expiresAt).toISOString().slice(0, 16)
        : ""
    );
    setLogoUrl(data.logoUrl || "");
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

  useEffect(() => {
    loadSub();
  }, [loadSub]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Название обязательно");
      return;
    }
    setError("");
    setSaving(true);

    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim(),
          autoUpdateMinutes,
          clientUpdateHours,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          logoUrl,
          pageTitle,
          showExpiry,
          showUpload,
          showDownload,
          showTotal,
          totalTrafficGb,
          usedUploadGb,
          usedDownloadGb,
          keys: keys.map((k) => ({
            value: k.keyValue,
            customName: k.customName,
            sourceType: k.sourceType,
            sourceUrl: k.sourceUrl,
            isEnabled: k.isEnabled,
          })),
        }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Ошибка сохранения");
      }
    } catch {
      setError("Ошибка сети");
    }
    setSaving(false);
  };

  const toggleKeyEnabled = (keyId: string) => {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === keyId ? { ...k, isEnabled: !k.isEnabled } : k
      )
    );
  };

  const removeKey = (keyId: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== keyId));
  };

  const copyLink = async () => {
    if (!sub) return;
    await navigator.clipboard.writeText(
      `${window.location.origin}/api/sub/${sub.slug}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!sub) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-graphite-950">
      <header className="sticky top-0 z-50 bg-graphite-950/80 backdrop-blur-xl border-b border-graphite-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-graphite-400 hover:text-graphite-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Назад
          </button>
          <h1 className="text-lg font-semibold text-graphite-100">
            Редактирование
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Link */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-sm font-mono text-graphite-300 truncate">
              {typeof window !== "undefined" && `${window.location.origin}/api/sub/${sub.slug}`}
            </div>
            <button
              onClick={copyLink}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                copied
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-accent-500 hover:bg-accent-600 text-white"
              }`}
            >
              {copied ? "Скопировано!" : "Копировать"}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-graphite-500">
            <span>Уникальных: {sub.uniqueHits}</span>
            <span>Всего обращений: {sub.totalHits}</span>
          </div>
        </section>

        {/* Basic info */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Основная информация
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Название
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Заголовок в клиенте
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
              />
            </div>
          </div>
        </section>

        {/* Keys */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Ключи ({keys.length})
          </h2>
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
                  key.isEnabled
                    ? "bg-graphite-800/50"
                    : "bg-graphite-800/20 opacity-50"
                }`}
              >
                <button
                  onClick={() => toggleKeyEnabled(key.id)}
                  className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                    key.isEnabled
                      ? "bg-accent-500 border-accent-500 text-white"
                      : "border-graphite-600 bg-graphite-700"
                  }`}
                >
                  {key.isEnabled && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-graphite-200 truncate">
                    {key.customName || key.originalName || key.keyValue.slice(0, 60)}
                  </p>
                  <p className="text-xs text-graphite-500 truncate">
                    {key.sourceType === "remote" ? `Источник: ${key.sourceUrl}` : "Добавлен вручную"}
                  </p>
                </div>
                <input
                  value={key.customName}
                  onChange={(e) =>
                    setKeys((prev) =>
                      prev.map((k) =>
                        k.id === key.id
                          ? { ...k, customName: e.target.value }
                          : k
                      )
                    )
                  }
                  className="w-40 bg-graphite-800 border border-graphite-700/50 rounded-lg px-2 py-1 text-sm text-graphite-200 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/30 hidden sm:block"
                  placeholder="Своё имя"
                />
                <button
                  onClick={() => removeKey(key.id)}
                  className="text-graphite-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Настройки
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Обновление источников (мин)
              </label>
              <input
                type="number"
                value={autoUpdateMinutes}
                onChange={(e) => setAutoUpdateMinutes(Number(e.target.value))}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Автообновление в клиенте (ч)
              </label>
              <input
                type="number"
                value={clientUpdateHours}
                onChange={(e) => setClientUpdateHours(Number(e.target.value))}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Истекает (оставьте пустым для бессрочной)
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                URL логотипа
              </label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all text-sm"
                placeholder="https://..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-graphite-400 mb-1.5">
                Заголовок страницы
              </label>
              <input
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all text-sm"
              />
            </div>
          </div>
        </section>

        {/* Client display settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-2">
            Отображение в клиенте
          </h2>
          <p className="text-graphite-500 text-sm mb-4">
            Управление дополнительной информацией в заголовке подписки клиента.
          </p>

          <div className="space-y-3">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать срок действия</span>
              <button type="button" onClick={() => setShowExpiry(!showExpiry)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${showExpiry ? "bg-accent-500" : "bg-graphite-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showExpiry ? "translate-x-4" : ""}`} />
              </button>
            </label>

            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать upload</span>
              <button type="button" onClick={() => setShowUpload(!showUpload)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${showUpload ? "bg-accent-500" : "bg-graphite-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showUpload ? "translate-x-4" : ""}`} />
              </button>
            </label>
            {showUpload && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Использовано upload (ГБ)</label>
                <input type="number" min={0} value={usedUploadGb} onChange={(e) => setUsedUploadGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" />
              </div>
            )}

            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать download</span>
              <button type="button" onClick={() => setShowDownload(!showDownload)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${showDownload ? "bg-accent-500" : "bg-graphite-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showDownload ? "translate-x-4" : ""}`} />
              </button>
            </label>
            {showDownload && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Использовано download (ГБ)</label>
                <input type="number" min={0} value={usedDownloadGb} onChange={(e) => setUsedDownloadGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" />
              </div>
            )}

            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать общий лимит трафика</span>
              <button type="button" onClick={() => setShowTotal(!showTotal)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${showTotal ? "bg-accent-500" : "bg-graphite-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showTotal ? "translate-x-4" : ""}`} />
              </button>
            </label>
            {showTotal && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Общий лимит (ГБ)</label>
                <input type="number" min={0} value={totalTrafficGb} onChange={(e) => setTotalTrafficGb(Number(e.target.value))} className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50" />
              </div>
            )}
          </div>
        </section>

        {/* Access logs */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-2 w-full text-left"
          >
            <h2 className="text-lg font-semibold text-graphite-100">
              Лог обращений ({sub.logs.length})
            </h2>
            <svg
              className={`w-5 h-5 text-graphite-400 transition-transform ${
                showLogs ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showLogs && (
            <div className="mt-4 space-y-1.5 max-h-80 overflow-y-auto">
              {sub.logs.length === 0 ? (
                <p className="text-graphite-500 text-sm">Нет обращений</p>
              ) : (
                sub.logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 text-xs text-graphite-400 bg-graphite-800/30 rounded-lg px-3 py-2"
                  >
                    <span className="font-mono">{log.ip}</span>
                    <span className="text-graphite-600">|</span>
                    <span>{log.deviceName || "Неизвестно"}</span>
                    <span className="text-graphite-600">|</span>
                    <span>
                      {new Date(log.accessedAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium shadow-lg shadow-accent-500/20 transition-all disabled:opacity-50"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </main>
    </div>
  );
}
