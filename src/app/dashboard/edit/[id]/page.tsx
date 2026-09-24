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
  accessResetMode: "never" | "daily" | "weekly" | "monthly";
  accessResetAt: string | null;
  logoUrl: string;
  pageTitle: string;
  whatsNew?: string;
  showExpiry?: boolean;
  showUpload?: boolean;
  showDownload?: boolean;
  showTotal?: boolean;
  totalTrafficGb?: number;
  usedUploadGb?: number;
  usedDownloadGb?: number;
  extraConfigsTitle?: string;
  extraConfigs?: {name: string; key: string}[];
  keys: SubKey[];
  sources: {id: string; url: string; lastStatus: string; selectedKeys: string[]; keyNames: Record<string, string>}[];
  logs: LogEntry[];
}

interface RemoteKey {
  value: string;
  name: string;
  fingerprint: string;
  customName: string;
  selected: boolean;
}

interface RemoteSourceState {
  id: string;
  url: string;
  status: "pending" | "ok" | "error";
  keys: RemoteKey[];
  showEditor: boolean;
  error?: string;
}

interface SourceRefreshResult {
  id: string;
  url: string;
  status: "ok" | "error";
  keyCount: number;
  reason: string | null;
}

interface EditableBaseline {
  name: string;
  title: string;
  autoUpdateMinutes: number;
  clientUpdateHours: number;
  accessResetMode: "never" | "daily" | "weekly" | "monthly";
  pageTitle: string;
  whatsNew: string;
  showExpiry: boolean;
  showUpload: boolean;
  showDownload: boolean;
  showTotal: boolean;
  totalTrafficGb: number;
  usedUploadGb: number;
  usedDownloadGb: number;
  extraConfigsTitle: string;
  extraConfigs: {name: string; key: string}[];
}

const normalizeExtraConfigs = (configs: {name: string; key: string}[]) => configs
  .map((config) => ({ name: config.name.trim(), key: config.key.trim() }))
  .filter((config) => config.name && config.key);

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [sub, setSub] = useState<SubData | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [autoUpdateMinutes, setAutoUpdateMinutes] = useState(60);
  const [clientUpdateHours, setClientUpdateHours] = useState(24);
  const [accessResetMode, setAccessResetMode] = useState<"never" | "daily" | "weekly" | "monthly">("never");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resettingAccess, setResettingAccess] = useState(false);

  // Expiry
  const [expiryType, setExpiryType] = useState<"none" | "months" | "days" | "hours" | "custom">("none");
  const [expiryMonths, setExpiryMonths] = useState(1);
  const [expiryDays, setExpiryDays] = useState(30);
  const [expiryHours, setExpiryHours] = useState(24);
  const [expiryMinutes, setExpiryMinutes] = useState(0);
  const [expiresAtRaw, setExpiresAtRaw] = useState("");
  const [expiryDirty, setExpiryDirty] = useState(false);

  // Logo
  const [logoUrl, setLogoUrl] = useState("");
  const [initialLogoUrl, setInitialLogoUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pageTitle, setPageTitle] = useState("");
  const [whatsNew, setWhatsNew] = useState("");
  const [showExpiry, setShowExpiry] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [totalTrafficGb, setTotalTrafficGb] = useState(0);
  const [usedUploadGb, setUsedUploadGb] = useState(0);
  const [usedDownloadGb, setUsedDownloadGb] = useState(0);
  const [enableExtraConfigs, setEnableExtraConfigs] = useState(false);
  const [extraConfigsTitle, setExtraConfigsTitle] = useState("");
  const [extraConfigs, setExtraConfigs] = useState<{name: string; key: string}[]>([{name: "", key: ""}]);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newKeyInput, setNewKeyInput] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [newSources, setNewSources] = useState<RemoteSourceState[]>([]);
  const [keys, setKeys] = useState<SubKey[]>([]);
  const [initialKeysSignature, setInitialKeysSignature] = useState("");
  const [initialSourcesSignature, setInitialSourcesSignature] = useState("");
  const [keysExpanded, setKeysExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [refreshResults, setRefreshResults] = useState<SourceRefreshResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<SubKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const baselineRef = useRef<EditableBaseline | null>(null);
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
    setAccessResetMode(data.accessResetMode || "never");
    if (data.expiresAt) {
      setExpiryType("custom");
      setExpiresAtRaw(toDateTimeLocalValue(data.expiresAt));
    } else {
      setExpiryType("none");
      setExpiresAtRaw("");
    }
    setExpiryDirty(false);
    setLogoUrl(data.logoUrl || "");
    setInitialLogoUrl(data.logoUrl || "");
    setLogoPreview(data.logoUrl || "");
    setPageTitle(data.pageTitle || "");
    setWhatsNew(data.whatsNew || "");
    setShowExpiry(data.showExpiry !== false);
    setShowUpload(data.showUpload === true);
    setShowDownload(data.showDownload === true);
    setShowTotal(data.showTotal === true);
    setTotalTrafficGb(data.totalTrafficGb || 0);
    setUsedUploadGb(data.usedUploadGb || 0);
    setUsedDownloadGb(data.usedDownloadGb || 0);
    const normalizedExtras = normalizeExtraConfigs(data.extraConfigs || []);
    const extrasEnabled = Boolean(data.extraConfigsTitle || normalizedExtras.length > 0);
    setEnableExtraConfigs(extrasEnabled);
    setExtraConfigsTitle(data.extraConfigsTitle || "");
    setExtraConfigs(extrasEnabled ? [...normalizedExtras, {name: "", key: ""}] : [{name: "", key: ""}]);
    baselineRef.current = {
      name: data.name.trim(), title: data.title.trim(),
      autoUpdateMinutes: data.autoUpdateMinutes, clientUpdateHours: data.clientUpdateHours,
      accessResetMode: data.accessResetMode || "never",
      pageTitle: data.pageTitle || "", whatsNew: data.whatsNew || "",
      showExpiry: data.showExpiry !== false, showUpload: data.showUpload === true,
      showDownload: data.showDownload === true, showTotal: data.showTotal === true,
      totalTrafficGb: data.totalTrafficGb || 0, usedUploadGb: data.usedUploadGb || 0,
      usedDownloadGb: data.usedDownloadGb || 0,
      extraConfigsTitle: extrasEnabled ? (data.extraConfigsTitle || "").trim() : "",
      extraConfigs: extrasEnabled ? normalizedExtras : [],
    };
    setKeys(data.keys);
    setInitialKeysSignature(JSON.stringify(data.keys.map((k) => ({ value: k.keyValue, customName: k.customName, sourceType: k.sourceType, sourceUrl: k.sourceUrl, isEnabled: k.isEnabled }))));
    setInitialSourcesSignature(JSON.stringify(data.sources.map((s) => ({ url: s.url, selectedKeys: s.selectedKeys, keyNames: s.keyNames, lastStatus: s.lastStatus }))));
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
    reader.onload = (ev) => {
      const source = ev.target?.result as string;
      const image = new Image();
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        setLogoPreview(compressed);
        setLogoUrl(compressed);
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  const detectType = (val: string): "key" | "subscription_url" | "unknown" | "" => {
    if (!val.trim()) return "";
    const protocols = ["vless://", "vmess://", "trojan://", "ss://", "ssr://", "hysteria://", "hysteria2://", "hy2://", "tuic://", "wg://", "wireguard://"];
    if (protocols.some((p) => val.trim().startsWith(p))) return "key";
    try {
      const url = new URL(val.trim());
      if (url.protocol === "http:" || url.protocol === "https:") return "subscription_url";
    } catch { /* not url */ }
    return "unknown";
  };

  const addManualKey = () => {
    const value = newKeyInput.trim();
    if (!value) return;
    const type = detectType(value);
    if (type === "key") {
      setKeys((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          keyValue: value,
          customName: "",
          originalName: "",
          sourceType: "manual",
          sourceUrl: "",
          isEnabled: true,
          keyFingerprint: "",
        },
      ]);
      setNewKeyInput("");
    } else if (type === "subscription_url") {
      setNewKeyInput("");
      addSource(value);
    } else {
      setError("Не удалось распознать ключ или ссылку на подписку");
    }
  };

  const handleKeyInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addManualKey();
    }
  };

  const moveKey = (index: number, dir: -1 | 1) => {
    setKeys((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const addSource = async (urlOverride?: string) => {
    const url = (urlOverride ?? newSourceUrl).trim();
    if (!url || !sub) return;
    setAddingSource(true);
    const srcId = crypto.randomUUID();
    setNewSources((prev) => [
      ...prev,
      { id: srcId, url, status: "pending", keys: [], showEditor: false },
    ]);
    setNewSourceUrl("");
    try {
      const res = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.keys && data.keys.length > 0) {
        setNewSources((prev) =>
          prev.map((s) =>
            s.id === srcId
              ? {
                  ...s,
                  status: "ok",
                  keys: data.keys.map((k: RemoteKey) => ({
                    ...k,
                    customName: "",
                    selected: true,
                  })),
                }
              : s
          )
        );
      } else {
        setNewSources((prev) =>
          prev.map((s) =>
            s.id === srcId ? { ...s, status: "error", error: data.error || "Не удалось загрузить ключи" } : s
          )
        );
      }
    } catch {
      setNewSources((prev) =>
        prev.map((s) => (s.id === srcId ? { ...s, status: "error", error: "Ошибка загрузки источника" } : s))
      );
    }
    setAddingSource(false);
  };

  const removeNewSource = (id: string) => {
    setNewSources((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleSourceEditor = (id: string) => {
    setNewSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, showEditor: !s.showEditor } : s))
    );
  };

  const toggleKeySelection = (srcId: string, fp: string) => {
    setNewSources((prev) =>
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
    setNewSources((prev) =>
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

  const removeSource = async (sourceId: string) => {
    if (!sub || !window.confirm("Удалить этот источник и его ключи? Несохранённые изменения в остальных полях останутся.")) return;
    setError(""); setFeedback(""); setDeletingSourceId(sourceId);
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeSourceIds: [sourceId] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.removedSourceIds?.includes(sourceId)) {
        throw new Error(data.error || "Не удалось удалить источник");
      }
      const removed = sub.sources.find((source) => source.id === sourceId);
      const hasDuplicate = removed && sub.sources.some((source) => source.id !== sourceId && source.url === removed.url);
      setSub((current) => current ? { ...current, sources: current.sources.filter((source) => source.id !== sourceId) } : current);
      if (removed && !hasDuplicate) {
        setKeys((current) => current.filter((key) => key.sourceUrl !== removed.url));
        setInitialKeysSignature((signature) => {
          try {
            const initial = JSON.parse(signature) as { sourceUrl: string }[];
            return JSON.stringify(initial.filter((key) => key.sourceUrl !== removed.url));
          } catch { return signature; }
        });
      }
      setInitialSourcesSignature((signature) => {
        try {
          const initial = JSON.parse(signature) as { url: string }[];
          let skipped = false;
          return JSON.stringify(initial.filter((source) => source.url !== removed?.url || skipped ? true : (skipped = true, false)));
        } catch { return signature; }
      });
      setFeedback("Источник удалён");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка удаления источника");
    } finally { setDeletingSourceId(null); }
  };

  const refreshSources = async () => {
    if (!sub || !sub.sources.length) { setError("Нет сохранённых URL-источников для обновления"); return; }
    setRefreshing(true); setError(""); setFeedback(""); setRefreshResults([]);
    try {
      const res = await fetch(`/api/subscriptions/${id}/refresh`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true) throw new Error(data.error || "Не удалось обновить источники");
      const results: SourceRefreshResult[] = Array.isArray(data.results) ? data.results : [];
      if (results.length !== sub.sources.length) throw new Error("Сервер вернул неполные результаты обновления");
      const statuses = new Map(results.map((result) => [result.id, result.status]));
      const updatedSources = sub.sources.map((source) => ({
        ...source,
        lastStatus: statuses.get(source.id) ?? source.lastStatus,
      }));
      setSub((current) => current ? { ...current, sources: current.sources.map((source) => ({ ...source, lastStatus: statuses.get(source.id) ?? source.lastStatus })) } : current);
      setInitialSourcesSignature(JSON.stringify(updatedSources.map((source) => ({ url: source.url, selectedKeys: source.selectedKeys, keyNames: source.keyNames, lastStatus: source.lastStatus }))));
      setRefreshResults(results);
      if (results.every((result) => result.status === "ok")) {
        setFeedback(`Все сохранённые источники обновлены. Обработано ключей: ${data.refreshed ?? 0}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка обновления источников");
    } finally { setRefreshing(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Название обязательно"); return; }
    if (!sub) return;
    setError(""); setSaving(true);
    const pendingSources = newSources.filter((s) => s.status === "pending");
    if (pendingSources.length > 0) {
      setError("Источники ещё загружаются — подождите, пока они загрузятся, или удалите их");
      setSaving(false);
      return;
    }
    const errorSources = newSources.filter((s) => s.status === "error");
    if (errorSources.length > 0) {
      setError("Некоторые источники не загрузились — удалите их или исправьте ссылку");
      setSaving(false);
      return;
    }
    try {
      const readyNewSources = newSources.filter((s) => s.status === "ok");
      const newSourceKeys = readyNewSources.flatMap((s) =>
        s.keys.filter((k) => k.selected).map((k) => ({
          value: k.value,
          customName: k.customName,
          sourceType: "remote",
          sourceUrl: s.url,
          isEnabled: true,
        }))
      );
      const existingKeys = keys.map((k) => ({ value: k.keyValue, customName: k.customName, sourceType: k.sourceType, sourceUrl: k.sourceUrl, isEnabled: k.isEnabled }));
      const existingSources = sub.sources.map((s) => ({ url: s.url, selectedKeys: s.selectedKeys, keyNames: s.keyNames, lastStatus: s.lastStatus }));
      const appendOnly = readyNewSources.length > 0 &&
        JSON.stringify(existingKeys) === initialKeysSignature &&
        JSON.stringify(existingSources) === initialSourcesSignature;
      const currentKeys = appendOnly ? [] : [...existingKeys, ...newSourceKeys];
      const currentSources = appendOnly ? [] : [
        ...existingSources,
        ...readyNewSources.map((s) => ({
          url: s.url,
          selectedKeys: s.keys.filter((k) => k.selected).map((k) => k.fingerprint),
          keyNames: Object.fromEntries(s.keys.filter((k) => k.customName.trim()).map((k) => [k.fingerprint, k.customName])),
          lastStatus: "ok",
        })),
      ];
      const baseline = baselineRef.current;
      const currentEditable: EditableBaseline = {
         name: name.trim(), title: title.trim(), autoUpdateMinutes, clientUpdateHours,
         accessResetMode,
         pageTitle, whatsNew, showExpiry, showUpload, showDownload, showTotal,
        totalTrafficGb, usedUploadGb, usedDownloadGb,
        extraConfigsTitle: enableExtraConfigs ? extraConfigsTitle.trim() : "",
        extraConfigs: enableExtraConfigs ? normalizeExtraConfigs(extraConfigs) : [],
      };
      const payload: Record<string, unknown> = {};
      if (baseline) {
        (Object.keys(currentEditable) as (keyof EditableBaseline)[]).forEach((field) => {
          if (field === "extraConfigs") return;
          if (currentEditable[field] !== baseline[field]) payload[field] = currentEditable[field];
        });
        if (JSON.stringify(currentEditable.extraConfigs) !== JSON.stringify(baseline.extraConfigs)) {
          payload.extraConfigs = currentEditable.extraConfigs;
        }
      }
      if (expiryDirty) payload.expiresAt = calculateExpiryDate();
      if (logoUrl !== initialLogoUrl) payload.logoUrl = logoUrl;
      if (appendOnly) {
        payload.addSources = readyNewSources.map((s) => ({
          url: s.url,
          selectedKeys: s.keys.filter((k) => k.selected).map((k) => k.fingerprint),
          keyNames: Object.fromEntries(s.keys.filter((k) => k.customName.trim()).map((k) => [k.fingerprint, k.customName])),
          lastStatus: "ok",
          keys: s.keys.filter((k) => k.selected).map((k) => ({ value: k.value, customName: k.customName })),
        }));
      } else {
        if (JSON.stringify(currentKeys) !== initialKeysSignature) payload.keys = currentKeys;
        if (JSON.stringify(currentSources) !== initialSourcesSignature) payload.sources = currentSources;
      }

      if (Object.keys(payload).length === 0) {
        router.push("/dashboard");
        return;
      }

      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) router.push("/dashboard");
      else {
        const text = await res.text();
        let message = "Ошибка сохранения";
        try { message = JSON.parse(text).error || message; } catch { if (text) message = text; }
        setError(message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    }
    setSaving(false);
  };

  const resetAccess = async () => {
    setResettingAccess(true);
    setError("");
    setFeedback("");
    try {
      const res = await fetch(`/api/subscriptions/${id}/reset-access`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success !== true || data.uniqueHits !== 0 || data.totalHits !== 0 || !Array.isArray(data.logs)) {
        throw new Error(data.error || "Сервер не подтвердил сброс статистики");
      }
      setSub((current) => current ? { ...current, uniqueHits: 0, totalHits: 0, logs: [] } : current);
      setShowResetModal(false);
      setFeedback("Статистика и лог обращений сброшены");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ошибка сброса статистики");
    } finally {
      setResettingAccess(false);
    }
  };

  const copyLink = async () => {
    if (!sub) return;
    await navigator.clipboard.writeText(`${window.location.origin}/api/sub/${sub.slug}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (!sub) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="h-svh max-h-svh bg-graphite-950 flex flex-col overflow-hidden overscroll-none">
      <header className="shrink-0 z-40 bg-graphite-950/80 backdrop-blur-xl border-b border-graphite-800">
        <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-8 lg:px-10 h-16 flex items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-graphite-400 hover:text-graphite-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>Назад
          </button>
          <h1 className="text-lg font-semibold text-graphite-100">Редактирование</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain w-full max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-10 py-6 sm:py-10 space-y-6 sm:space-y-8">
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
          <p className="text-graphite-500 text-sm mb-4">Вставьте ключ vless://, vmess://, trojan://, ss:// и др. или ссылку на подписку (https://). Порядок в этом списке — порядок отображения в клиентах.</p>
          <div className="flex gap-2 mb-4">
            <div className="flex-1 relative">
              <input value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} onKeyDown={handleKeyInputKeyDown}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50 font-mono pr-24"
                placeholder="vless://..., vmess://..., https://..." />
              {detectType(newKeyInput) === "key" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">Ключ</span>
              )}
              {detectType(newKeyInput) === "subscription_url" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">Источник</span>
              )}
            </div>
            <button onClick={addManualKey} disabled={!newKeyInput.trim()} className="px-4 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-all disabled:opacity-50 flex-shrink-0">
              Добавить
            </button>
          </div>
          {keys.length > 10 && (
            <button
              type="button"
              onClick={() => setKeysExpanded((v) => !v)}
              className="mb-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 text-sm text-graphite-200 transition-all"
            >
              <svg className={`w-4 h-4 transition-transform ${keysExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              {keysExpanded ? "Свернуть список ключей" : `Показать все ключи (${keys.length})`}
            </button>
          )}
          <div className="space-y-3" style={keys.length > 10 && !keysExpanded ? { display: "none" } : undefined}>
            {keys.map((key, idx) => (
              <div key={key.id} className={`rounded-xl p-3 transition-all ${key.isEnabled ? "bg-graphite-800/50" : "bg-graphite-800/20 opacity-50"}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setKeys((p) => p.map((k) => k.id === key.id ? { ...k, isEnabled: !k.isEnabled } : k))}
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${key.isEnabled ? "bg-accent-500 border-accent-500 text-white" : "border-graphite-600 bg-graphite-700"}`}>
                    {key.isEnabled && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </button>
                  <div className="flex flex-col flex-shrink-0">
                    <button onClick={() => moveKey(idx, -1)} disabled={idx === 0} className="text-graphite-500 hover:text-graphite-200 disabled:opacity-30 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button onClick={() => moveKey(idx, 1)} disabled={idx === keys.length - 1} className="text-graphite-500 hover:text-graphite-200 disabled:opacity-30 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                   <button type="button" onClick={() => { setSelectedKey(key); setKeyCopied(false); }} className="flex-1 min-w-0 text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/50" title="Показать полный ключ">
                     <p className="text-sm text-graphite-200 truncate">{key.customName || key.originalName || key.keyValue.slice(0, 50)}</p>
                     <p className="text-xs text-graphite-500 truncate">{key.sourceType === "remote" ? `Источник: ${key.sourceUrl}` : "Вручную"}</p>
                   </button>
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

        {/* Sources */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
           <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
             <div>
               <h2 className="text-lg font-semibold text-graphite-100">Источники ({sub.sources.length})</h2>
               <p className="text-xs text-graphite-500 mt-1">Принудительно загрузить ключи из всех сохранённых URL-источников. Несохранённые источники не обновляются.</p>
             </div>
             <button type="button" onClick={refreshSources} disabled={refreshing || sub.sources.length === 0} className="px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0">
               <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
               {refreshing ? "Обновление..." : "Обновить сейчас"}
             </button>
           </div>
          {sub.sources.length > 0 && (
            <div className="space-y-2 mb-4">
              {sub.sources.map((src) => (
                <div key={src.id} className="flex items-center gap-2 bg-graphite-800/50 rounded-xl p-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${src.lastStatus === "ok" ? "bg-emerald-400" : src.lastStatus === "error" ? "bg-red-400" : "bg-yellow-400"}`} />
                  <span className="flex-1 text-sm text-graphite-300 font-mono truncate">{src.url}</span>
                   <button type="button" onClick={() => removeSource(src.id)} disabled={deletingSourceId === src.id} className="text-graphite-600 hover:text-red-400 transition-colors flex-shrink-0 disabled:opacity-40" aria-label="Удалить источник">
                     {deletingSourceId === src.id ? <span className="block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                   </button>
                </div>
              ))}
            </div>
          )}
          {newSources.length > 0 && (
            <div className="space-y-3 mb-4">
              <h3 className="text-sm font-medium text-graphite-300">Новые источники</h3>
              {newSources.map((src) => (
                <div key={src.id} className="bg-graphite-800/50 border border-graphite-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 truncate font-mono text-sm text-graphite-300">{src.url}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {src.status === "pending" && (
                        <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                      )}
                      {src.status === "ok" && (
                        <span className="text-emerald-400 flex items-center gap-1 text-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          {src.keys.filter(k => k.selected).length}/{src.keys.length}
                        </span>
                      )}
                      {src.status === "error" && (
                        <span className="text-red-400 flex items-center gap-1 text-xs">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          Ошибка
                        </span>
                      )}
                      {src.status === "ok" && (
                        <button onClick={() => toggleSourceEditor(src.id)} className="px-2 py-1 text-xs bg-graphite-700 hover:bg-graphite-600 text-graphite-300 rounded-lg transition-colors">
                          Выбрать ключи
                        </button>
                      )}
                      <button onClick={() => removeNewSource(src.id)} className="text-graphite-600 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                  {src.error && <p className="mt-2 text-xs text-red-400">{src.error}</p>}
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
          <div className="flex gap-2">
            <input value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addSource(); }} className="flex-1 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50 font-mono" placeholder="https://... — ссылка на подписку" />
            <button onClick={() => addSource()} disabled={addingSource || !newSourceUrl.trim()} className="px-4 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-all disabled:opacity-50 flex-shrink-0">
              {addingSource ? "..." : "+"}
            </button>
          </div>
        </section>

        {/* Expiry — improved */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Срок действия</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {(["none", "months", "days", "hours", "custom"] as const).map((t) => (
              <button key={t} onClick={() => { setExpiryType(t); setExpiryDirty(true); }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${expiryType === t ? "bg-accent-500 text-white" : "bg-graphite-800 text-graphite-400 border border-graphite-700"}`}>
                {t === "none" && "Бессрочно"}{t === "months" && "Месяцы"}{t === "days" && "Дни"}{t === "hours" && "Часы"}{t === "custom" && "Точная дата"}
              </button>
            ))}
          </div>
          {expiryType === "months" && <div className="flex items-center gap-3"><input type="number" min={1} value={expiryMonths} onChange={(e) => { setExpiryMonths(Number(e.target.value) || 1); setExpiryDirty(true); }} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">месяц(ев) от текущей даты</span></div>}
          {expiryType === "days" && <div className="flex items-center gap-3"><input type="number" min={1} value={expiryDays} onChange={(e) => { setExpiryDays(Number(e.target.value) || 1); setExpiryDirty(true); }} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">дней от текущей даты</span></div>}
          {expiryType === "hours" && <div className="flex items-center gap-3"><input type="number" min={0} value={expiryHours} onChange={(e) => { setExpiryHours(Number(e.target.value) || 0); setExpiryDirty(true); }} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">ч.</span><input type="number" min={0} max={59} value={expiryMinutes} onChange={(e) => { setExpiryMinutes(Number(e.target.value) || 0); setExpiryDirty(true); }} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400">мин.</span></div>}
          {expiryType === "custom" && <input type="datetime-local" value={expiresAtRaw} onChange={(e) => { setExpiresAtRaw(e.target.value); setExpiryDirty(true); }} className="w-full sm:w-auto bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50" />}
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

        {/* Public changelog */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-graphite-100 mb-2">Что нового?</h2>
          <p className="text-graphite-500 text-sm mb-4">Текст для модального окна на публичной странице подписки</p>
          <textarea
            value={whatsNew}
            onChange={(e) => setWhatsNew(e.target.value)}
            onInput={(e) => {
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            rows={3}
            className="w-full min-h-24 max-h-80 overflow-y-auto resize-none bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-sm leading-relaxed text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            placeholder="Пока изменений нет, но в скором времени могут появиться."
          />
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

        {/* Extra Configs */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <h2 className="text-lg font-semibold text-graphite-100">Сторонние конфиги</h2>
              <p className="text-graphite-500 text-sm mt-1">AmneziaWG и другие — только для страницы в браузере</p>
            </div>
            <button type="button" onClick={() => setEnableExtraConfigs(!enableExtraConfigs)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${enableExtraConfigs ? "bg-accent-500" : "bg-graphite-700"}`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${enableExtraConfigs ? "translate-x-4" : ""}`} />
            </button>
          </label>
          {enableExtraConfigs && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm text-graphite-400 mb-1.5">Общее название раздела</label>
                <input value={extraConfigsTitle} onChange={(e) => setExtraConfigsTitle(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50" placeholder="Дополнительные конфиги" />
              </div>
              <div className="space-y-3">
                {extraConfigs.map((cfg, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input value={cfg.name} onChange={(e) => { const n = [...extraConfigs]; n[idx] = {...n[idx], name: e.target.value}; setExtraConfigs(n); }} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50" placeholder="Название конфига" />
                      <input value={cfg.key} onChange={(e) => { const n = [...extraConfigs]; n[idx] = {...n[idx], key: e.target.value}; setExtraConfigs(n); if (idx === extraConfigs.length - 1 && e.target.value.trim()) setExtraConfigs([...n, {name: "", key: ""}]); }} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-2.5 text-sm text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-1 focus:ring-accent-500/50 font-mono" placeholder="vpn://... или awg://..." />
                    </div>
                    {extraConfigs.length > 1 && cfg.key.trim() && (
                      <button onClick={() => setExtraConfigs(extraConfigs.filter((_, i) => i !== idx))} className="mt-2.5 text-graphite-600 hover:text-red-400 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Access statistics */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-graphite-100">Сброс статистики доступа</h2>
              <p className="text-sm text-graphite-500 mt-1">Автоматический сброс выполняется в 00:00 по Москве: еженедельно — в понедельник, ежемесячно — первого числа.</p>
            </div>
            <button type="button" onClick={() => { setError(""); setFeedback(""); setShowResetModal(true); }} className="px-5 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 font-medium transition-colors shrink-0">
              Сбросить сейчас
            </button>
          </div>
          <label className="block text-sm text-graphite-400 mt-5 mb-1.5">Расписание сброса</label>
          <select value={accessResetMode} onChange={(e) => setAccessResetMode(e.target.value as typeof accessResetMode)} className="w-full sm:max-w-sm bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50">
            <option value="never">Никогда</option>
            <option value="daily">Ежедневно</option>
            <option value="weekly">Еженедельно</option>
            <option value="monthly">Ежемесячно</option>
          </select>
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
                  <span className="font-medium text-accent-400">{sub.name}{sub.title ? ` — ${sub.title}` : ""} ({sub.slug})</span><span className="text-graphite-600">·</span><span className="font-mono">{log.ip}</span><span className="text-graphite-600">·</span><span>{log.deviceName || "?"}</span><span className="text-graphite-600">·</span><span>{new Date(log.accessedAt).toLocaleString("ru-RU")}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {feedback && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-3">{feedback}</div>}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">{error}</div>}
        {refreshResults.length > 0 && (
          <div className="space-y-2">
            {refreshResults.map((result) => (
              <div key={result.id} className={`border text-sm rounded-xl px-4 py-3 ${result.status === "ok" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                <div className="font-mono break-all">{result.url}</div>
                <div className="mt-1">
                  {result.status === "ok" ? `Ключей: ${result.keyCount}` : result.reason || "Неизвестная ошибка"}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end pb-8">
          <button onClick={() => router.push("/dashboard")} className="px-6 py-3 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 transition-all">Отмена</button>
          <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium shadow-lg shadow-accent-500/20 transition-all disabled:opacity-50">
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </main>
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !resettingAccess) setShowResetModal(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="reset-access-modal-title" className="w-full max-w-md bg-graphite-900 border border-graphite-700 rounded-2xl shadow-2xl p-6">
            <h3 id="reset-access-modal-title" className="text-lg font-semibold text-graphite-100">Сбросить статистику доступа?</h3>
            <p className="mt-2 text-sm leading-relaxed text-graphite-400">Все записи лога подписки «{sub.name}» будут удалены, а счётчики обращений обнулены. Это действие нельзя отменить. Расписание автоматического сброса не изменится.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={resettingAccess} onClick={() => setShowResetModal(false)} className="px-5 py-2.5 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-200 hover:bg-graphite-700 transition-colors disabled:opacity-50">Отмена</button>
              <button type="button" disabled={resettingAccess} onClick={resetAccess} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                {resettingAccess && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {resettingAccess ? "Сброс..." : "Сбросить"}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedKey(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="key-modal-title" className="w-full max-w-2xl bg-graphite-900 border border-graphite-700 rounded-2xl shadow-2xl p-6">
            <h3 id="key-modal-title" className="text-lg font-semibold text-graphite-100">Полный ключ</h3>
            <p className="mt-1 text-sm text-graphite-500">{selectedKey.customName || selectedKey.originalName || "Ключ подписки"}</p>
            <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-graphite-950 border border-graphite-800 p-4 text-sm text-graphite-200 font-mono select-all">{selectedKey.keyValue}</pre>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setSelectedKey(null)} className="px-5 py-2.5 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-200 hover:bg-graphite-700 transition-colors">Закрыть</button>
              <button type="button" onClick={async () => { await navigator.clipboard.writeText(selectedKey.keyValue); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }} className={`px-5 py-2.5 rounded-xl text-white font-medium transition-colors ${keyCopied ? "bg-emerald-600" : "bg-accent-500 hover:bg-accent-600"}`}>{keyCopied ? "Скопировано" : "Копировать"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceEditorModal({
  source,
  onToggleKey,
  onSetName,
  onClose,
}: {
  source: RemoteSourceState;
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
