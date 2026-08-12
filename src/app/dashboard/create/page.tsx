"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  
  // Improved expiry settings
  const [expiryType, setExpiryType] = useState<"none" | "months" | "days" | "hours">("none");
  const [expiryMonths, setExpiryMonths] = useState(1);
  const [expiryDays, setExpiryDays] = useState(30);
  const [expiryHours, setExpiryHours] = useState(24);
  const [expiryMinutes, setExpiryMinutes] = useState(0);
  
  // Logo settings
  const [logoUrl, setLogoUrl] = useState("");
  const [logoSize, setLogoSize] = useState<"small" | "medium" | "large">("medium");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [pageTitle, setPageTitle] = useState("");
  
  // Extra configs (AmneziaWG, etc.)
  const [enableExtraConfigs, setEnableExtraConfigs] = useState(false);
  const [extraConfigsTitle, setExtraConfigsTitle] = useState("");
  const [extraConfigs, setExtraConfigs] = useState<{name: string; key: string}[]>([{name: "", key: ""}]);

  // Client display settings
  const [showExpiry, setShowExpiry] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [totalTrafficGb, setTotalTrafficGb] = useState(0);
  const [usedUploadGb, setUsedUploadGb] = useState(0);
  const [usedDownloadGb, setUsedDownloadGb] = useState(0);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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

        const entry = updated.find((e) => e.id === id);
        if (entry && entry.type === "subscription_url" && value.trim()) {
          const alreadyExists = remoteSources.some(
            (rs) => rs.url === value.trim()
          );
          if (!alreadyExists) {
            fetchRemoteSource(value.trim());
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
    switch (expiryType) {
      case "months":
        now.setMonth(now.getMonth() + expiryMonths);
        break;
      case "days":
        now.setDate(now.getDate() + expiryDays);
        break;
      case "hours":
        now.setHours(now.getHours() + expiryHours);
        now.setMinutes(now.getMinutes() + expiryMinutes);
        break;
    }
    return now.toISOString();
  };

  // Logo file handling
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      setLogoUrl(result); // Use data URL
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview("");
    setLogoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Введите название подписки");
      return;
    }
    setError("");
    setSaving(true);
    const pendingSources = remoteSources.filter((s) => s.status === "pending");
    if (pendingSources.length > 0) {
      setError("Источники ещё загружаются — подождите, пока они загрузятся, или удалите их");
      setSaving(false);
      return;
    }
    const errorSources = remoteSources.filter((s) => s.status === "error");
    if (errorSources.length > 0) {
      setError("Некоторые источники не загрузились — удалите их или исправьте ссылку");
      setSaving(false);
      return;
    }

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
          logoSize,
          pageTitle,
          showExpiry,
          showUpload,
          showDownload,
          showTotal,
          totalTrafficGb,
          usedUploadGb,
          usedDownloadGb,
          extraConfigsTitle: enableExtraConfigs ? extraConfigsTitle : "",
          extraConfigs: enableExtraConfigs ? extraConfigs.filter(c => c.name.trim() && c.key.trim()) : [],
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

  const logoSizeLabels = {
    small: "Маленький",
    medium: "Средний", 
    large: "Большой",
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
                          {src.keys.filter(k => k.selected).length}/{src.keys.length}
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
                          className="px-2 py-1 text-xs bg-graphite-700 hover:bg-graphite-600 text-graphite-300 rounded-lg transition-colors"
                          title="Редактировать ключи"
                        >
                          Выбрать ключи
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

        {/* Extra Configs (AmneziaWG, etc.) */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <h2 className="text-lg font-semibold text-graphite-100">Сторонние конфиги</h2>
              <p className="text-graphite-500 text-sm mt-1">AmneziaWG, WireGuard и другие — только для страницы в браузере</p>
            </div>
            <button type="button" onClick={() => setEnableExtraConfigs(!enableExtraConfigs)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${enableExtraConfigs ? "bg-accent-500" : "bg-graphite-700"}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${enableExtraConfigs ? "translate-x-4" : ""}`} />
            </button>
          </label>

          {enableExtraConfigs && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-graphite-400 mb-1.5">Общее название раздела</label>
                <input value={extraConfigsTitle} onChange={(e) => setExtraConfigsTitle(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" placeholder="Дополнительные конфиги" />
              </div>

              <div className="space-y-3">
                {extraConfigs.map((cfg, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input value={cfg.name} onChange={(e) => { const n = [...extraConfigs]; n[idx] = {...n[idx], name: e.target.value}; setExtraConfigs(n); }} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50" placeholder="Название конфига" />
                      <input value={cfg.key} onChange={(e) => {
                        const n = [...extraConfigs]; n[idx] = {...n[idx], key: e.target.value}; setExtraConfigs(n);
                        // Auto-add new row if last is filled
                        if (idx === extraConfigs.length - 1 && e.target.value.trim()) setExtraConfigs([...n, {name: "", key: ""}]);
                      }} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50 font-mono" placeholder="vpn://... или awg://... или wg://..." />
                    </div>
                    {extraConfigs.length > 1 && cfg.key.trim() && (
                      <button onClick={() => setExtraConfigs(extraConfigs.filter((_, i) => i !== idx))} className="mt-2.5 text-graphite-600 hover:text-red-400 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Expiry Settings - Improved */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Срок действия
          </h2>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {(["none", "months", "days", "hours"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setExpiryType(type)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  expiryType === type
                    ? "bg-accent-500 text-white"
                    : "bg-graphite-800 text-graphite-400 hover:text-graphite-200 border border-graphite-700"
                }`}
              >
                {type === "none" && "Бессрочно"}
                {type === "months" && "Месяцы"}
                {type === "days" && "Дни"}
                {type === "hours" && "Часы"}
              </button>
            ))}
          </div>

          {expiryType === "months" && (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={expiryMonths}
                onChange={(e) => setExpiryMonths(Number(e.target.value) || 1)}
                onFocus={(e) => e.target.select()}
                className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
              <span className="text-graphite-400">месяц(ев)</span>
            </div>
          )}

          {expiryType === "days" && (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value) || 1)}
                onFocus={(e) => e.target.select()}
                className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
              <span className="text-graphite-400">дней</span>
            </div>
          )}

          {expiryType === "hours" && (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
              <span className="text-graphite-400">ч.</span>
              <input
                type="number"
                min={0}
                max={59}
                value={expiryMinutes}
                onChange={(e) => setExpiryMinutes(Number(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
              />
              <span className="text-graphite-400">мин.</span>
            </div>
          )}
        </section>

        {/* Update Settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Автообновление
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
        </section>

        {/* Client display settings */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-2">
            Отображение в клиенте
          </h2>
          <p className="text-graphite-500 text-sm mb-4">
            Настройте информацию, отображаемую в VPN клиентах
          </p>

          <div className="space-y-3">
            {/* Show Expiry */}
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать срок действия</span>
              <button
                type="button"
                onClick={() => setShowExpiry(!showExpiry)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  showExpiry ? "bg-accent-500" : "bg-graphite-700"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showExpiry ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {/* Show Upload */}
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать загрузку (upload)</span>
              <button
                type="button"
                onClick={() => setShowUpload(!showUpload)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  showUpload ? "bg-accent-500" : "bg-graphite-700"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showUpload ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {showUpload && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Использовано (ГБ)</label>
                <input type="number" min={0} value={usedUploadGb}
                  onChange={(e) => setUsedUploadGb(Number(e.target.value))}
                  className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                />
              </div>
            )}

            {/* Show Download */}
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать скачивание (download)</span>
              <button
                type="button"
                onClick={() => setShowDownload(!showDownload)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  showDownload ? "bg-accent-500" : "bg-graphite-700"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showDownload ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {showDownload && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Использовано (ГБ)</label>
                <input type="number" min={0} value={usedDownloadGb}
                  onChange={(e) => setUsedDownloadGb(Number(e.target.value))}
                  className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                />
              </div>
            )}

            {/* Show Total */}
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-graphite-300">Показывать общий лимит трафика</span>
              <button
                type="button"
                onClick={() => setShowTotal(!showTotal)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                  showTotal ? "bg-accent-500" : "bg-graphite-700"
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${showTotal ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {showTotal && (
              <div className="ml-4">
                <label className="block text-xs text-graphite-500 mb-1">Общий лимит (ГБ)</label>
                <input type="number" min={0} value={totalTrafficGb}
                  onChange={(e) => setTotalTrafficGb(Number(e.target.value))}
                  className="w-32 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-1 focus:ring-accent-500/50"
                />
              </div>
            )}
          </div>
        </section>

        {/* Page customization with logo upload */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">
            Оформление страницы
          </h2>
          
          {/* Logo upload */}
          <div className="mb-4">
            <label className="block text-sm text-graphite-400 mb-1.5">
              Логотип
            </label>
            <div className="flex items-start gap-4">
              {logoPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className={`object-contain rounded-xl ${
                      logoSize === "small" ? "h-12" : logoSize === "medium" ? "h-20" : "h-32"
                    }`}
                  />
                  <button
                    onClick={removeLogo}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-32 h-20 border-2 border-dashed border-graphite-700 rounded-xl flex flex-col items-center justify-center text-graphite-500 hover:text-graphite-400 hover:border-graphite-600 transition-colors"
                >
                  <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Загрузить</span>
                </button>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                className="hidden"
              />

              {logoPreview && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-graphite-500">Размер:</span>
                  <div className="flex gap-1">
                    {(["small", "medium", "large"] as const).map((size) => (
                      <button
                        key={size}
                        onClick={() => setLogoSize(size)}
                        className={`px-3 py-1 text-xs rounded-lg transition-all ${
                          logoSize === size
                            ? "bg-accent-500 text-white"
                            : "bg-graphite-800 text-graphite-400 hover:text-graphite-200"
                        }`}
                      >
                        {logoSizeLabels[size]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
            Выбор ключей из источника
          </h3>
          <p className="text-graphite-500 text-sm mt-1 truncate">
            {source.url}
          </p>
          <p className="text-graphite-400 text-xs mt-2">
            Выбрано: {source.keys.filter(k => k.selected).length} из {source.keys.length}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {source.keys.map((key) => (
            <div
              key={key.fingerprint}
              className={`flex items-start gap-3 rounded-xl p-3 transition-all ${
                key.selected ? "bg-graphite-800/50" : "bg-graphite-800/20 opacity-50"
              }`}
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
                  onChange={(e) => onSetName(key.fingerprint, e.target.value)}
                  className="mt-1.5 w-full bg-graphite-800 border border-graphite-700/50 rounded-lg px-3 py-1.5 text-sm text-graphite-200 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/30 transition-all"
                  placeholder={key.name ? `Оригинальное: ${key.name}` : "Имя ключа в клиенте"}
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
            className="px-6 py-2 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-medium transition-all text-sm"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
