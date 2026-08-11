"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Subscription {
  id: string;
  name: string;
  title: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  uniqueHits: number;
  totalHits: number;
}

export default function DashboardClient({ initialCfg }: { initialCfg: Record<string, string> }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [extendModal, setExtendModal] = useState<Subscription | null>(null);
  const [extendType, setExtendType] = useState<"months" | "days" | "hours">("days");
  const [extendMonths, setExtendMonths] = useState(1);
  const [extendDays, setExtendDays] = useState(30);
  const [extendHours, setExtendHours] = useState(24);
  const [extendMinutes, setExtendMinutes] = useState(0);
  const [sysInfo, setSysInfo] = useState({ time: "—", cpu: "—", ram: "—", disk: "—" });
  const [showRestart, setShowRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [pauseModal, setPauseModal] = useState<Subscription | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseWithBackup, setPauseWithBackup] = useState(false);
  const [pauseBackupKeys, setPauseBackupKeys] = useState("");
  const [pauseMsg, setPauseMsg] = useState("");
  const pauseInputRef = { current: null as HTMLInputElement | null };
  const router = useRouter();

  const loadSubs = useCallback(async () => {
    try {
      const res = await fetch("/api/subscriptions");
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setSubs(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadSubs();
  }, [loadSubs]);

  // System info polling
  useEffect(() => {
    const load = () => fetch("/api/system").then(r => r.ok ? r.json() : null).then(d => { if (d) setSysInfo(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const getSubUrl = (slug: string) => `${window.location.origin}/api/sub/${slug}`;

  const copyLink = async (slug: string) => {
    await navigator.clipboard.writeText(getSubUrl(slug));
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const handlePauseClick = (sub: Subscription) => {
    if (!sub.isActive) {
      // Resume — clear pause data
      fetch(`/api/subscriptions/${sub.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true, pauseReason: "", backupKeys: [] }),
      }).then(() => loadSubs());
      return;
    }
    // Show pause modal
    setPauseReason("");
    setPauseWithBackup(false);
    setPauseBackupKeys("");
    setPauseModal(sub);
  };

  const confirmPause = async () => {
    if (!pauseModal) return;
    const keys = pauseWithBackup ? pauseBackupKeys.split(",").map(k => k.trim()).filter(Boolean) : [];
    await fetch(`/api/subscriptions/${pauseModal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false, pauseReason: pauseReason || "Подписка приостановлена", backupKeys: keys }),
    });
    setPauseModal(null);
    setPauseMsg("Подписка приостановлена");
    setTimeout(() => setPauseMsg(""), 3000);
    loadSubs();
  };

  const insertEmoji = (emoji: string) => {
    const input = pauseInputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const val = pauseReason;
      setPauseReason(val.slice(0, start) + emoji + val.slice(end));
      setTimeout(() => { input.focus(); input.setSelectionRange(start + emoji.length, start + emoji.length); }, 0);
    } else {
      setPauseReason(pauseReason + emoji);
    }
  };

  const deleteSub = async (id: string, name: string) => {
    if (!confirm(`Удалить подписку "${name}"?`)) return;
    await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    loadSubs();
  };

  const extendSubscription = async () => {
    if (!extendModal) return;
    const newExpiry = new Date();
    switch (extendType) {
      case "months": newExpiry.setMonth(newExpiry.getMonth() + extendMonths); break;
      case "days": newExpiry.setDate(newExpiry.getDate() + extendDays); break;
      case "hours": newExpiry.setHours(newExpiry.getHours() + extendHours); newExpiry.setMinutes(newExpiry.getMinutes() + extendMinutes); break;
    }
    await fetch(`/api/subscriptions/${extendModal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresAt: newExpiry.toISOString(), isActive: true }),
    });
    setExtendModal(null);
    loadSubs();
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const isExpired = (expiresAt: string | null) => !!expiresAt && new Date(expiresAt) < new Date();

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const exp = new Date(expiresAt).getTime();
    const diff = exp - now;
    if (diff <= 0) return "Истекла";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days} д. ${hours} ч.`;
    return `${hours} ч.`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-graphite-950">
      {/* System status bar */}
      <div className="bg-graphite-950 border-b border-graphite-800/50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 h-7 text-[10px] text-graphite-500 font-mono">
          <span>🕐 {sysInfo.time}</span>
          <span>CPU {sysInfo.cpu}</span>
          <span>RAM {sysInfo.ram}</span>
          <span>SSD {sysInfo.disk}</span>
        </div>
      </div>
      <header className="sticky top-0 z-50 bg-graphite-950/80 backdrop-blur-xl border-b border-graphite-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-graphite-100">{initialCfg.headerTitle || "SubManager"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/dashboard/settings")} className="text-graphite-400 hover:text-graphite-200 text-sm transition-colors flex items-center gap-1.5" title="Настройки">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button onClick={logout} className="text-graphite-400 hover:text-graphite-200 text-sm transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Выход
            </button>
            <button onClick={() => setShowRestart(true)} className="text-graphite-400 hover:text-red-400 text-sm transition-colors flex items-center gap-1.5" title="Перезапуск сервиса">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-graphite-50">Подписки</h2>
            <p className="text-graphite-400 text-sm mt-1">{subs.length === 0 ? "Нет созданных подписок" : `Всего: ${subs.length}`}</p>
          </div>
          <button onClick={() => router.push("/dashboard/create")} className="inline-flex items-center gap-2 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-accent-500/20 hover:shadow-accent-500/30">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Создать подписку
          </button>
        </div>

        {subs.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-graphite-900 border border-graphite-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-graphite-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <h3 className="text-graphite-300 text-lg font-medium">Нет подписок</h3>
            <p className="text-graphite-500 text-sm mt-1">Создайте первую подписку для начала работы</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {subs.map((sub, i) => {
              const expired = isExpired(sub.expiresAt);
              return (
                <div key={sub.id} className={`bg-graphite-900 border rounded-2xl p-5 transition-all animate-fade-in group ${expired ? "border-red-500/50 bg-red-500/5" : !sub.isActive ? "border-graphite-700 opacity-60" : "border-graphite-800 hover:border-graphite-700"}`} style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={`text-lg font-semibold truncate ${expired ? "text-red-400" : "text-graphite-100"}`}>{sub.name}</h3>
                        {expired ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">Истекла</span> : !sub.isActive ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-graphite-700 text-graphite-400">Приостановлена</span> : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Активна</span>}
                      </div>
                      {sub.title && <p className="text-graphite-400 text-sm mb-2 truncate">{sub.title}</p>}
                      <div className="flex items-center gap-4 text-xs text-graphite-500">
                        <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>{sub.uniqueHits} уник. / {sub.totalHits} всего</span>
                        {sub.expiresAt && <span className={expired ? "text-red-400" : ""}>{expired ? "Истекла: " : "Осталось: "}{expired ? new Date(sub.expiresAt).toLocaleDateString("ru-RU") : getTimeRemaining(sub.expiresAt)}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {expired && <button onClick={() => setExtendModal(sub)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Продлить</button>}
                      <button onClick={() => copyLink(sub.slug)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${copied === sub.slug ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-graphite-800 text-graphite-300 hover:text-accent-400 border border-graphite-700 hover:border-accent-500/30"}`} title="Копировать ссылку">{copied === sub.slug ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span className="hidden sm:inline">Скопировано</span></> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg><span className="hidden sm:inline">Ссылка</span></>}</button>
                      <button onClick={() => router.push(`/dashboard/edit/${sub.id}`)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-graphite-800 text-graphite-300 hover:text-accent-400 border border-graphite-700 hover:border-accent-500/30 transition-all" title="Редактировать"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg><span className="hidden sm:inline">Изменить</span></button>
                      {!expired && <button onClick={() => handlePauseClick(sub)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${sub.isActive ? "bg-graphite-800 text-yellow-400 border-graphite-700 hover:border-yellow-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"}`} title={sub.isActive ? "Приостановить" : "Возобновить"}>{sub.isActive ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}</button>}
                      <button onClick={() => deleteSub(sub.id, sub.name)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-graphite-800 text-red-400 border border-graphite-700 hover:border-red-500/30 hover:bg-red-500/10 transition-all" title="Удалить"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      <button onClick={() => { const url = getSubUrl(sub.slug); if (navigator.share) navigator.share({ title: sub.name, text: sub.title || sub.name, url }).catch(() => {}); }} className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-graphite-800 text-accent-400 border border-graphite-700 hover:border-accent-500/30 transition-all" title="Поделиться"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <h3 className="text-lg font-semibold text-graphite-100 mb-2">Продлить подписку</h3>
            <p className="text-graphite-400 text-sm mb-4">{extendModal.name}</p>
            <div className="flex gap-2 mb-4">{(["months", "days", "hours"] as const).map((t) => <button key={t} onClick={() => setExtendType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${extendType === t ? "bg-accent-500 text-white" : "bg-graphite-800 text-graphite-400 border border-graphite-700"}`}>{t === "months" && "Месяцы"}{t === "days" && "Дни"}{t === "hours" && "Часы"}</button>)}</div>
            <div className="mb-4">
              {extendType === "months" && <div className="flex items-center gap-2"><input type="number" min={1} value={extendMonths} onChange={(e) => setExtendMonths(Number(e.target.value) || 1)} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400 text-sm">месяц(ев)</span></div>}
              {extendType === "days" && <div className="flex items-center gap-2"><input type="number" min={1} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value) || 1)} onFocus={(e) => e.target.select()} className="w-24 bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400 text-sm">дней</span></div>}
              {extendType === "hours" && <div className="flex items-center gap-2"><input type="number" min={0} value={extendHours} onChange={(e) => setExtendHours(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400 text-sm">ч.</span><input type="number" min={0} max={59} value={extendMinutes} onChange={(e) => setExtendMinutes(Number(e.target.value) || 0)} onFocus={(e) => e.target.select()} className="w-20 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-3 text-graphite-100 text-center focus:outline-none focus:ring-2 focus:ring-accent-500/50" /><span className="text-graphite-400 text-sm">мин.</span></div>}
            </div>
            <div className="flex gap-3"><button onClick={() => setExtendModal(null)} className="flex-1 py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 transition-all font-medium">Отмена</button><button onClick={extendSubscription} className="flex-1 py-3 rounded-xl bg-accent-500 hover:bg-accent-600 text-white font-medium transition-all">Продлить</button></div>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
        <p className="text-graphite-600 text-xs">{initialCfg.footerText || "SubManager by LarsGravesen"}</p>
      </footer>

      {/* Pause notification */}
      {pauseMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-sm rounded-xl px-6 py-3 animate-fade-in shadow-lg backdrop-blur-sm">
          {pauseMsg}
        </div>
      )}

      {/* Pause Modal */}
      {pauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-md animate-slide-up shadow-2xl">
            <h3 className="text-lg font-semibold text-graphite-100 mb-1">Приостановить подписку</h3>
            <p className="text-graphite-400 text-sm mb-4">{pauseModal.name}</p>

            <div className="mb-3">
              <label className="block text-sm text-graphite-400 mb-1.5">Причина для клиента</label>
              <input ref={(el) => { pauseInputRef.current = el; }} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" placeholder="Подписка приостановлена" />
            </div>

            <div className="flex gap-2 mb-4">
              {["🛑", "🚫", "⏳", "❌", "⚠️"].map((e) => (
                <button key={e} type="button" onClick={() => insertEmoji(e)} className="w-9 h-9 flex items-center justify-center bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 rounded-lg text-lg transition-colors">{e}</button>
              ))}
            </div>

            <label className="flex items-center justify-between py-2 cursor-pointer mb-2">
              <span className="text-sm text-graphite-300">Добавить резервные ключи</span>
              <button type="button" onClick={() => setPauseWithBackup(!pauseWithBackup)} className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${pauseWithBackup ? "bg-accent-500" : "bg-graphite-700"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${pauseWithBackup ? "translate-x-4" : ""}`} />
              </button>
            </label>

            {pauseWithBackup && (
              <div className="mb-4">
                <label className="block text-xs text-graphite-500 mb-1">Ключи через запятую (vless://, vmess:// и т.д.)</label>
                <textarea value={pauseBackupKeys} onChange={(e) => setPauseBackupKeys(e.target.value)} rows={3} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-sm text-graphite-100 placeholder-graphite-600 focus:outline-none focus:ring-1 focus:ring-accent-500/50 font-mono resize-none" placeholder="vless://..., vmess://..." />
                <p className="text-xs text-graphite-600 mt-1">Имена: ⚠️Резервный 1, ⚠️Резервный 2...</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPauseModal(null)} className="flex-1 py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 transition-all font-medium">Отменить</button>
              <button onClick={confirmPause} className="flex-1 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-graphite-950 font-medium transition-all">Приостановить</button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Modal */}
      {showRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-sm animate-slide-up shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-graphite-100 text-center mb-2">Перезапуск сервиса</h3>
            <p className="text-graphite-400 text-sm text-center mb-5">Сервис будет недоступен несколько секунд. Продолжить?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowRestart(false)} className="flex-1 py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 transition-all font-medium">Отмена</button>
              <button onClick={async () => { setRestarting(true); await fetch("/api/system/restart", { method: "POST" }); setTimeout(() => window.location.reload(), 5000); }} disabled={restarting} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-all disabled:opacity-50">
                {restarting ? "Перезапуск..." : "Перезапустить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
