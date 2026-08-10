"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ManualKey {
  id: string;
  value: string;
  customName: string;
  type: "key" | "subscription_url" | "unknown" | "";
}

interface RemoteKey {
  value: string;
  name: string;
  fingerprint: string;
  customName: string;
  selected: boolean;
}

interface RemoteSource {
  id: string;
  url: string;
  status: "pending" | "ok" | "error";
  keys: RemoteKey[];
  showEditor: boolean;
}

export default function CreateSubscriptionPage() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState<ManualKey[]>([
    { id: crypto.randomUUID(), value: "", customName: "", type: "" },
  ]);
  const [remoteSources, setRemoteSources] = useState<RemoteSource[]>([]);
  const [autoUpdateMinutes, setAutoUpdateMinutes] = useState(60);
  const [clientUpdateHours, setClientUpdateHours] = useState(24);
  const [expiryType, setExpiryType] = useState<"none" | "custom">("none");
  const [expiryValue, setExpiryValue] = useState(30);
  const [expiryUnit, setExpiryUnit] = useState<"hours" | "days" | "months" | "years">("days");
  const [logoUrl, setLogoUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Auth check
  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated) router.push("/");
      });
  }, [router]);

  const detectType = (val: string): ManualKey["type"] => {
    if (!val.trim()) return "";
    const protocols = ["vless://", "vmess://", "trojan://", "ss://", "ssr://", "hysteria://", "hysteria2://", "hy2://", "tuic://", "wg://", "wireguard://"];
    if (protocols.some((p) => val.trim().startsWith(p))) return "key";
    try {
      const url = new URL(val.trim());
      if (url.protocol === "http:" || url.protocol === "https:") return "subscription_url";
    } catch { /* not url */ }
    return "unknown";
  };

  const handleEntryChange = useCallback(
    (id: string, value: string) => {
      setEntries((prev) => {
        const updated = prev.map((e) =>
          e.id === id ? { ...e, value, type: detectType(value) } : e
        );

        // If the detected type is subscription_url, add to remote sources
        const entry = updated.find((e) => e.id === id);
        if (entry && entry.type === "subscription_url" && value.trim()) {
          const alreadyExists = remoteSources.some(
            (rs) => rs.url === value.trim()
          );
          if (!alreadyExists) {
            fetchRemoteSource(value.trim());
            // Remove from entries
            const filtered = updated.filter((e) => e.id !== id);
            if (
              filtered.length === 0 ||
              filtered[filtered.length - 1].value.trim()
            ) {
              filtered.push({
                id: crypto.randomUUID(),
                value: "",
                customName: "",
                type: "",
              });
            }
            return filtered;
          }
        }

        // Add new empty entry if last one has content
        if (updated[updated.length - 1]?.value.trim()) {
          updated.push({
            id: crypto.randomUUID(),
            value: "",
            customName: "",
            type: "",
          });
        }
        return updated;
      });
    },
    [remoteSources]
  );

  const removeEntry = (id: string) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.id !== id);
      if (filtered.length === 0) {
        return [{ id: crypto.randomUUID(), value: "", customName: "", type: "" }];
      }
      return filtered;
    });
  };

  const fetchRemoteSource = async (url: string) => {
    const srcId = crypto.randomUUID();
    setRemoteSources((prev) => [
      ...prev,
      { id: srcId, url, status: "pending", keys: [], showEditor: false },
    ]);

    try {
      const res = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.keys) {
        setRemoteSources((prev) =>
          prev.map((s) =>
            s.id === srcId
              ? {
                  ...s,
                  status: "ok",
                  keys: data.keys.map((k: { value: string; name: string; fingerprint: string }) => ({
                    ...k,
                    customName: "",
                    selected: true,
                  })),
                }
              : s
          )
        );
      } else {
        setRemoteSources((prev) =>
          prev.map((s) => (s.id === srcId ? { ...s, status: "error" } : s))
        );
      }
    } catch {
      setRemoteSources((prev) =>
        prev.map((s) => (s.id === srcId ? { ...s, status: "error" } : s))
      );
    }
  };

  const removeSource = (id: string) => {
    setRemoteSources((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleSourceEditor = (id: string) => {
    setRemoteSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, showEditor: !s.showEditor } : s))
    );
  };

  const toggleKeySelection = (srcId: string, fp: string) => {
    setRemoteSources((prev) =>
      prev.map((s) =>
        s.id === srcId
          ? {
              ...s,
              keys: s.keys.map((k) =>
                k.fingerprint === fp ? { ...k, selected: !k.selected } : k
              ),
            }
          : s
      )
    );
  };

  const setKeyCustomName = (srcId: string, fp: string, name: string) => {
    setRemoteSources((prev) =>
      prev.map((s) =>
        s.id === srcId
          ? {
              ...s,
              keys: s.keys.map((k) =>
                k.fingerprint === fp ? { ...k, customName: name } : k
              ),
            }
          : s
      )
    );
  };

  const calculateExpiryDate = (): string | null => {
    if (expiryType === "none") return null;
    const now = new Date();
    switch (expiryUnit) {
      case "hours":
        now.setHours(now.getHours() + expiryValue);
        break;
      case "days":
        now.setDate(now.getDate() + expiryValue);
        break;
      case "months":
        now.setMonth(now.getMonth() + expiryValue);
        break;
      case "years":
        now.setFullYear(now.getFullYear() + expiryValue);
        break;
    }
    return now.toISOString();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Введите название подписки");
      return;
    }
    setError("");
    setSaving(true);

    const manualKeys = entries
      .filter((e) => e.value.trim() && e.type === "key")
      .map((e) => ({ value: e.value.trim(), customName: e.customName }));

    const sources = remoteSources.map((s) => ({
      url: s.url,
      lastStatus: s.status,
      selectedKeys: s.keys.filter((k) => k.selected).map((k) => k.fingerprint),
      keyNames: Object.fromEntries(
        s.keys
          .filter((k) => k.customName.trim())
          .map((k) => [k.fingerprint, k.customName])
      ),
      keys: s.keys
        .filter((k) => k.selected)
        .map((k) => ({
          value: k.value,
          customName: k.customName,
        })),
    }));

    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          title: title.trim(),
          keys: manualKeys,
          sources,
          autoUpdateMinutes,
          clientUpdateHours,
          expiresAt: calculateExpiryDate(),
          logoUrl,
          pageTitle,
        }),
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Ошибка создания");
      }
    } catch {
      setError("Ошибка сети");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-graphite-950">
      {/* Header */}
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
            Создание подписки
          </h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Basic info */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Основная информация
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Название (только в панели)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
                placeholder="Мой клиент VPN"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Заголовок в клиенте (поддержка эмодзи)
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
                placeholder="🚀 Premium VPN"
              />
            </div>
          </div>
        </section>

        {/* Keys input */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-2">
            Ключи и источники
          </h2>
          <p className="text-graphite-500 text-sm mb-4">
            Добавьте ключи vless://, vmess:// и другие, или ссылки на подписки
          </p>

          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <div className="relative">
                    <input
                      value={entry.value}
                      onChange={(e) => handleEntryChange(entry.id, e.target.value)}
                      className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all text-sm font-mono pr-20"
                      placeholder="vless://..., vmess://..., https://..."
                    />
                    {entry.type === "key" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        Ключ
                      </span>
                    )}
                    {entry.type === "unknown" && entry.value.trim() && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/20">
                        ???
                      </span>
                    )}
                  </div>
                  {entry.type === "key" && (
                    <input
                      value={entry.customName}
                      onChange={(e) =>
                        setEntries((prev) =>
                          prev.map((en) =>
                            en.id === entry.id
                              ? { ...en, customName: e.target.value }
                              : en
                          )
                        )
                      }
                      className="w-full bg-graphite-800/50 border border-graphite-700/50 rounded-lg px-3 py-2 text-graphite-200 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/30 transition-all text-sm"
                      placeholder="Имя ключа в клиенте (необязательно)"
                    />
                  )}
                </div>
                {entry.value.trim() && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="mt-3 text-graphite-600 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Remote sources */}
          {remoteSources.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-medium text-graphite-300">
                Внешние источники
              </h3>
              {remoteSources.map((src) => (
                <div
                  key={src.id}
                  className="bg-graphite-800/50 border border-graphite-700/50 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 truncate font-mono text-sm text-graphite-300">
                      {src.url}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {src.status === "pending" && (
                        <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      {src.status === "ok" && (
                        <span className="text-emerald-400 flex items-center gap-1 text-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          {src.keys.length} ключей
                        </span>
                      )}
                      {src.status === "error" && (
                        <span className="text-red-400 flex items-center gap-1 text-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Ошибка
                        </span>
                      )}
                      {src.status === "ok" && (
                        <button
                          onClick={() => toggleSourceEditor(src.id)}
                          className="text-graphite-400 hover:text-accent-400 transition-colors"
                          title="Редактировать ключи"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => removeSource(src.id)}
                        className="text-graphite-600 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Source editor modal */}
                  {src.showEditor && (
                    <SourceEditorModal
                      source={src}
                      onToggleKey={(fp) => toggleKeySelection(src.id, fp)}
                      onSetName={(fp, n) => setKeyCustomName(src.id, fp, n)}
                      onClose={() => toggleSourceEditor(src.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Настройки
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Обновление из источников (минут)
              </label>
              <input
                type="number"
                min={5}
                value={autoUpdateMinutes}
                onChange={(e) => setAutoUpdateMinutes(Number(e.target.value))}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Автообновление в клиенте (часов)
              </label>
              <input
                type="number"
                min={1}
                value={clientUpdateHours}
                onChange={(e) => setClientUpdateHours(Number(e.target.value))}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
              />
            </div>
          </div>

          {/* Expiry */}
          <div className="mt-4">
            <label className="block text-sm text-graphite-400 mb-1.5">
              Время жизни подписки
            </label>
            <div className="flex gap-3 items-center">
              <select
                value={expiryType}
                onChange={(e) =>
                  setExpiryType(e.target.value as "none" | "custom")
                }
                className="bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              >
                <option value="none">Бессрочно</option>
                <option value="custom">Указать</option>
              </select>
              {expiryType === "custom" && (
                <>
                  <input
                    type="number"
                    min={1}
                    value={expiryValue}
                    onChange={(e) => setExpiryValue(Number(e.target.value))}
                    className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                  />
                  <select
                    value={expiryUnit}
                    onChange={(e) =>
                      setExpiryUnit(
                        e.target.value as "hours" | "days" | "months" | "years"
                      )
                    }
                    className="bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
                  >
                    <option value="hours">Часов</option>
                    <option value="days">Дней</option>
                    <option value="months">Месяцев</option>
                    <option value="years">Лет</option>
                  </select>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Page customization */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Оформление страницы
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                URL логотипа (PNG с прозрачностью)
              </label>
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all text-sm"
                placeholder="https://example.com/logo.png"
              />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">
                Заголовок страницы
              </label>
              <input
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all text-sm"
                placeholder="Premium VPN Service"
              />
            </div>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 animate-fade-in">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 justify-end pb-8">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 hover:border-graphite-600 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium shadow-lg shadow-accent-500/20 transition-all disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Создание...
              </span>
            ) : (
              "Создать подписку"
            )}
          </button>
        </div>
      </main>
    </div>
  );
}

function SourceEditorModal({
  source,
  onToggleKey,
  onSetName,
  onClose,
}: {
  source: RemoteSource;
  onToggleKey: (fp: string) => void;
  onSetName: (fp: string, name: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-graphite-900 border border-graphite-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-slide-up shadow-2xl">
        <div className="p-6 border-b border-graphite-800">
          <h3 className="text-lg font-semibold text-graphite-100">
            Ключи из источника
          </h3>
          <p className="text-graphite-500 text-sm mt-1 truncate">
            {source.url}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {source.keys.map((key) => (
            <div
              key={key.fingerprint}
              className="flex items-start gap-3 bg-graphite-800/50 rounded-xl p-3"
            >
              <label className="flex items-center mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={key.selected}
                  onChange={() => onToggleKey(key.fingerprint)}
                  className="w-4 h-4 rounded border-graphite-600 text-accent-500 bg-graphite-700 focus:ring-accent-500/50 cursor-pointer"
                />
              </label>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-graphite-300 truncate font-mono">
                  {key.name || key.value.slice(0, 60) + "..."}
                </p>
                <input
                  value={key.customName}
                  onChange={(e) =>
                    onSetName(key.fingerprint, e.target.value)
                  }
                  className="mt-1.5 w-full bg-graphite-800 border border-graphite-700/50 rounded-lg px-3 py-1.5 text-sm text-graphite-200 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/30 transition-all"
                  placeholder={
                    key.name
                      ? `Оригинальное: ${key.name}`
                      : "Имя ключа в клиенте"
                  }
                />
              </div>
            </div>
          ))}
          {source.keys.length === 0 && (
            <p className="text-graphite-500 text-center py-8">
              Ключи не найдены
            </p>
          )}
        </div>

        <div className="p-6 border-t border-graphite-800 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 transition-all text-sm"
          >
            Отмена
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-medium transition-all text-sm"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
