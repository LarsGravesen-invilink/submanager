"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const PRESET_COLORS = [
  { name: "Оранжевый", value: "#c2610a" },
  { name: "Красный", value: "#dc2626" },
  { name: "Розовый", value: "#db2777" },
  { name: "Фиолетовый", value: "#7c3aed" },
  { name: "Синий", value: "#2563eb" },
  { name: "Голубой", value: "#0891b2" },
  { name: "Бирюзовый", value: "#0d9488" },
  { name: "Зелёный", value: "#16a34a" },
  { name: "Лайм", value: "#65a30d" },
  { name: "Янтарный", value: "#d97706" },
];

const SYSTEM_FONTS = [
  { name: "Системный", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { name: "Inter", value: "'Inter', sans-serif" },
  { name: "Roboto", value: "'Roboto', sans-serif" },
  { name: "Open Sans", value: "'Open Sans', sans-serif" },
  { name: "Montserrat", value: "'Montserrat', sans-serif" },
  { name: "PT Sans", value: "'PT Sans', sans-serif" },
  { name: "Nunito", value: "'Nunito', sans-serif" },
  { name: "Ubuntu", value: "'Ubuntu', sans-serif" },
  { name: "Fira Sans", value: "'Fira Sans', sans-serif" },
  { name: "Source Sans 3", value: "'Source Sans 3', sans-serif" },
];

export default function SettingsPage() {
  const [serviceName, setServiceName] = useState("SubManager");
  const [headerTitle, setHeaderTitle] = useState("SubManager");
  const [footerText, setFooterText] = useState("SubManager by LarsGravesen");
  const [loginTitle, setLoginTitle] = useState("Вход в панель");
  const [loginSubtitle, setLoginSubtitle] = useState("Введите учетные данные для входа");

  const [logoUrl, setLogoUrl] = useState("");
  const [logoSize, setLogoSize] = useState("medium");
  const [logoPreview, setLogoPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accentColor, setAccentColor] = useState("#c2610a");
  const [customColor, setCustomColor] = useState("#c2610a");

  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
  const [customFontName, setCustomFontName] = useState("");
  const [customFontUrl, setCustomFontUrl] = useState("");
  const customFontRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Backup state
  const [backupModal, setBackupModal] = useState<"none" | "exporting" | "exported" | "importing" | "imported" | "error">("none");
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupDetails, setBackupDetails] = useState<string[]>([]);
  const backupFileRef = useRef<HTMLInputElement>(null);

  // Load settings
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (r.status === 401) { router.push("/"); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.serviceName) setServiceName(data.serviceName);
        if (data.headerTitle) setHeaderTitle(data.headerTitle);
        if (data.footerText) setFooterText(data.footerText);
        if (data.loginTitle) setLoginTitle(data.loginTitle);
        if (data.loginSubtitle) setLoginSubtitle(data.loginSubtitle);
        if (data.logoUrl) { setLogoUrl(data.logoUrl); setLogoPreview(data.logoUrl); }
        if (data.logoSize) setLogoSize(data.logoSize);
        if (data.accentColor) { setAccentColor(data.accentColor); setCustomColor(data.accentColor); }
        if (data.fontSize) setFontSize(Number(data.fontSize));
        if (data.fontFamily) setFontFamily(data.fontFamily);
        if (data.customFontName) setCustomFontName(data.customFontName);
        if (data.customFontUrl) setCustomFontUrl(data.customFontUrl);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  // Live preview: accent color
  useEffect(() => {
    document.documentElement.style.setProperty("--color-accent-500", accentColor);
    document.documentElement.style.setProperty("--color-accent-DEFAULT", accentColor);
    document.documentElement.style.setProperty("--color-accent-600", accentColor);
    document.documentElement.style.setProperty("--color-accent-700", accentColor);
    document.documentElement.style.setProperty("--color-accent-400", accentColor);
  }, [accentColor]);

  // Live preview: font size
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
    return () => { document.documentElement.style.fontSize = ""; };
  }, [fontSize]);

  // Live preview: font family
  useEffect(() => {
    const effectiveFont = customFontUrl ? `'${customFontName || "CustomFont"}', sans-serif` : fontFamily;
    document.body.style.fontFamily = effectiveFont;

    // Load Google Font if it's a system font from Google
    const fontName = SYSTEM_FONTS.find(f => f.value === fontFamily)?.name;
    if (fontName && fontName !== "Системный") {
      const linkId = "google-font-preview";
      let link = document.getElementById(linkId) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
    }

    // Load custom font
    if (customFontUrl && customFontName) {
      const styleId = "custom-font-face";
      let style = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = `@font-face { font-family: '${customFontName}'; src: url('${customFontUrl}'); }`;
    }

    return () => { document.body.style.fontFamily = ""; };
  }, [fontFamily, customFontUrl, customFontName]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLogoPreview(result);
      setLogoUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomFontFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomFontName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomFontUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // === Backup functions ===
  const handleExportBackup = async () => {
    setBackupModal("exporting");
    setBackupProgress(0);
    setBackupMessage("Сбор данных...");
    setBackupDetails([]);

    try {
      setBackupProgress(20);
      setBackupMessage("Загрузка настроек...");
      await new Promise((r) => setTimeout(r, 300));

      setBackupProgress(50);
      setBackupMessage("Загрузка подписок и ключей...");

      const res = await fetch("/api/backup/export");
      if (!res.ok) throw new Error("Ошибка экспорта");

      setBackupProgress(80);
      setBackupMessage("Формирование файла...");
      await new Promise((r) => setTimeout(r, 200));

      const blob = await res.blob();
      const data = JSON.parse(await blob.text());

      const subsCount = data.data?.subscriptions?.length || 0;
      const keysCount = data.data?.subscriptions?.reduce((a: number, s: { keys?: unknown[] }) => a + (s.keys?.length || 0), 0) || 0;
      const settingsCount = data.data?.settings?.length || 0;

      setBackupDetails([
        `Настройки: ${settingsCount}`,
        `Подписки: ${subsCount}`,
        `Ключи: ${keysCount}`,
      ]);

      // Download
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `submanager-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupProgress(100);
      setBackupMessage("Бекап создан и скачан!");
      setBackupModal("exported");
    } catch (e) {
      setBackupMessage(e instanceof Error ? e.message : "Ошибка");
      setBackupModal("error");
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupModal("importing");
    setBackupProgress(0);
    setBackupMessage("Чтение файла...");
    setBackupDetails([]);

    try {
      setBackupProgress(10);
      const text = await file.text();

      setBackupProgress(20);
      setBackupMessage("Проверка формата...");
      await new Promise((r) => setTimeout(r, 200));

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Файл повреждён или не является JSON");
      }

      if (!data.version || !data.data) {
        throw new Error("Неверный формат файла бекапа");
      }

      const subsCount = data.data?.subscriptions?.length || 0;
      const settingsCount = data.data?.settings?.length || 0;

      setBackupProgress(30);
      setBackupMessage(`Восстановление ${settingsCount} настроек и ${subsCount} подписок...`);

      const res = await fetch("/api/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });

      setBackupProgress(80);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Ошибка восстановления");
      }

      const result = await res.json();

      setBackupProgress(100);
      setBackupMessage("Все данные восстановлены!");
      setBackupDetails(result.steps || []);
      setBackupModal("imported");

      if (backupFileRef.current) backupFileRef.current.value = "";
    } catch (e) {
      setBackupMessage(e instanceof Error ? e.message : "Ошибка");
      setBackupModal("error");
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  };

  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName,
          headerTitle,
          footerText,
          loginTitle,
          loginSubtitle,
          logoUrl,
          logoSize,
          accentColor,
          fontSize: String(fontSize),
          fontFamily,
          customFontName,
          customFontUrl,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Ошибка сохранения");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setSaveError("Ошибка сети");
    }
    setSaving(false);
  };

  const logoSizeClass = { small: "h-10", medium: "h-16", large: "h-24" }[logoSize] || "h-16";

  if (loading) {
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
          <button onClick={() => router.push("/dashboard")} className="flex items-center gap-2 text-graphite-400 hover:text-graphite-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Назад
          </button>
          <h1 className="text-lg font-semibold text-graphite-100">Настройки панели</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Texts */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Тексты и заголовки</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Название сервиса</label>
              <input value={serviceName} onChange={(e) => setServiceName(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Заголовок в шапке</label>
              <input value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Заголовок страницы входа</label>
              <input value={loginTitle} onChange={(e) => setLoginTitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-sm text-graphite-400 mb-1.5">Подзаголовок входа</label>
              <input value={loginSubtitle} onChange={(e) => setLoginSubtitle(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-graphite-400 mb-1.5">Текст в подвале</label>
              <input value={footerText} onChange={(e) => setFooterText(e.target.value)}
                className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 transition-all" />
            </div>
          </div>
        </section>

        {/* Logo */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Логотип панели</h2>
          <div className="flex items-start gap-4">
            {logoPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="Logo" className={`${logoSizeClass} w-auto object-contain rounded-xl`} />
                <button onClick={() => { setLogoUrl(""); setLogoPreview(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-32 h-20 border-2 border-dashed border-graphite-700 rounded-xl flex flex-col items-center justify-center text-graphite-500 hover:text-graphite-400 hover:border-graphite-600 transition-colors">
                <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-xs">Загрузить</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />

            {logoPreview && (
              <div className="space-y-2">
                <span className="text-xs text-graphite-500">Размер:</span>
                <div className="flex gap-1">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <button key={s} onClick={() => setLogoSize(s)}
                      className={`px-3 py-1 text-xs rounded-lg transition-all ${logoSize === s ? "bg-accent-500 text-white" : "bg-graphite-800 text-graphite-400"}`}>
                      {s === "small" ? "Маленький" : s === "medium" ? "Средний" : "Большой"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Accent Color */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Акцентный цвет</h2>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-4">
            {PRESET_COLORS.map((c) => (
              <button key={c.value} onClick={() => { setAccentColor(c.value); setCustomColor(c.value); }}
                className={`w-10 h-10 rounded-xl transition-all hover:scale-110 ${accentColor === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-graphite-900" : ""}`}
                style={{ backgroundColor: c.value }} title={c.name} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-graphite-400">Свой цвет:</label>
            <input type="color" value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); setAccentColor(e.target.value); }}
              className="w-10 h-10 rounded-lg border border-graphite-700 bg-transparent cursor-pointer" />
            <input type="text" value={customColor}
              onChange={(e) => { setCustomColor(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setAccentColor(e.target.value); }}
              className="w-28 bg-graphite-800 border border-graphite-700 rounded-xl px-3 py-2 text-sm text-graphite-100 font-mono focus:outline-none focus:ring-1 focus:ring-accent-500/50" />
          </div>
        </section>

        {/* Font */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-graphite-100 mb-4">Шрифт и размер</h2>

          {/* Font size */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-graphite-400">Размер текста</label>
              <span className="text-sm text-graphite-300 font-mono">{fontSize}px</span>
            </div>
            <input type="range" min={12} max={22} step={0.5} value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-graphite-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-500 [&::-webkit-slider-thumb]:cursor-pointer" />
            <div className="flex justify-between text-xs text-graphite-600 mt-1">
              <span>12px</span><span>22px</span>
            </div>
          </div>

          {/* Font family */}
          <div className="mb-4">
            <label className="block text-sm text-graphite-400 mb-2">Шрифт</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SYSTEM_FONTS.map((f) => (
                <button key={f.name} onClick={() => { setFontFamily(f.value); setCustomFontUrl(""); setCustomFontName(""); }}
                  className={`px-3 py-2.5 text-sm rounded-xl transition-all text-left ${
                    fontFamily === f.value && !customFontUrl
                      ? "bg-accent-500/20 text-accent-400 border border-accent-500/30"
                      : "bg-graphite-800 text-graphite-300 border border-graphite-700 hover:border-graphite-600"
                  }`}
                  style={{ fontFamily: f.value }}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          {/* Custom font upload */}
          <div className="border-t border-graphite-800 pt-4 mt-4">
            <div className="flex items-center gap-3">
              <button onClick={() => customFontRef.current?.click()}
                className="px-4 py-2 text-sm bg-graphite-800 text-graphite-300 border border-graphite-700 hover:border-graphite-600 rounded-xl transition-all">
                Загрузить свой шрифт
              </button>
              <input ref={customFontRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleCustomFontFile} className="hidden" />
              {customFontName && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-accent-400">{customFontName}</span>
                  <button onClick={() => { setCustomFontUrl(""); setCustomFontName(""); }}
                    className="text-graphite-600 hover:text-red-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-graphite-600 mt-2">Поддерживаются форматы: TTF, OTF, WOFF, WOFF2</p>
          </div>

          {/* Preview */}
          <div className="mt-4 p-4 bg-graphite-800/50 rounded-xl border border-graphite-700/50">
            <p className="text-graphite-400 text-xs mb-2">Предпросмотр:</p>
            <p className="text-graphite-100">Привет, мир! Hello, World! 🚀 Подписка активна</p>
          </div>
        </section>

        {/* Backup & Restore */}
        <section className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-graphite-100 mb-2">Резервное копирование</h2>
          <p className="text-graphite-500 text-sm mb-5">
            Сохраните все настройки, подписки, ключи и логи в файл, или восстановите из ранее созданного бекапа.
            Учётные данные для входа не сохраняются.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Export */}
            <button onClick={handleExportBackup}
              className="flex items-center gap-4 bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 hover:border-accent-500/30 rounded-xl p-5 transition-all text-left group">
              <div className="w-12 h-12 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-accent-500/20 transition-colors">
                <svg className="w-6 h-6 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-medium text-graphite-100 block">Создать бекап</span>
                <span className="text-xs text-graphite-500">Скачать файл со всеми данными</span>
              </div>
            </button>

            {/* Import */}
            <button onClick={() => backupFileRef.current?.click()}
              className="flex items-center gap-4 bg-graphite-800 hover:bg-graphite-700 border border-graphite-700 hover:border-accent-500/30 rounded-xl p-5 transition-all text-left group">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-medium text-graphite-100 block">Восстановить</span>
                <span className="text-xs text-graphite-500">Загрузить файл бекапа</span>
              </div>
            </button>
            <input ref={backupFileRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </div>
        </section>

        {/* Save error */}
        {saveError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 animate-fade-in">
            {saveError}
          </div>
        )}

        {/* Save */}
        <div className="flex gap-3 justify-end pb-8">
          <button onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-xl text-graphite-400 hover:text-graphite-200 bg-graphite-800 border border-graphite-700 transition-all">
            Отмена
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`px-8 py-3 rounded-xl font-medium shadow-lg transition-all disabled:opacity-50 ${
              saved
                ? "bg-emerald-500 text-white shadow-emerald-500/20"
                : "bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white shadow-accent-500/20"
            }`}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Сохранение...
              </span>
            ) : saved ? "✓ Сохранено" : "Сохранить"}
          </button>
        </div>
      </main>

      {/* Backup Modal */}
      {backupModal !== "none" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 w-full max-w-md animate-slide-up shadow-2xl">
            {/* Icon */}
            <div className="flex justify-center mb-5">
              {(backupModal === "exporting" || backupModal === "importing") && (
                <div className="w-16 h-16 rounded-full bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
                  <div className="w-8 h-8 border-3 border-accent-500/30 border-t-accent-500 rounded-full animate-spin" />
                </div>
              )}
              {backupModal === "exported" && (
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {backupModal === "imported" && (
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              )}
              {backupModal === "error" && (
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Title */}
            <h3 className="text-lg font-semibold text-graphite-100 text-center mb-2">
              {backupModal === "exporting" && "Создание бекапа"}
              {backupModal === "exported" && "Бекап создан"}
              {backupModal === "importing" && "Восстановление"}
              {backupModal === "imported" && "Восстановлено"}
              {backupModal === "error" && "Ошибка"}
            </h3>

            {/* Message */}
            <p className="text-sm text-graphite-400 text-center mb-4">{backupMessage}</p>

            {/* Progress bar */}
            {(backupModal === "exporting" || backupModal === "importing") && (
              <div className="w-full h-2 bg-graphite-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-accent-500 to-accent-600 rounded-full transition-all duration-500"
                  style={{ width: `${backupProgress}%` }}
                />
              </div>
            )}

            {/* Details */}
            {backupDetails.length > 0 && (
              <div className="bg-graphite-800/50 rounded-xl p-3 mb-4 space-y-1">
                {backupDetails.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-graphite-300">
                    <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {d}
                  </div>
                ))}
              </div>
            )}

            {/* Close button */}
            {(backupModal === "exported" || backupModal === "imported" || backupModal === "error") && (
              <button
                onClick={() => { setBackupModal("none"); if (backupModal === "imported") window.location.reload(); }}
                className="w-full py-3 rounded-xl bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-graphite-100 hover:border-graphite-600 transition-all font-medium">
                {backupModal === "imported" ? "Готово" : "Закрыть"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Color utility helpers
function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function darken(hex: string, amount: number): string {
  try {
    const [h, s, l] = hexToHSL(hex);
    return hslToHex(h, s, Math.max(0, l - amount));
  } catch { return hex; }
}

function lighten(hex: string, amount: number): string {
  try {
    const [h, s, l] = hexToHSL(hex);
    return hslToHex(h, s, Math.min(100, l + amount));
  } catch { return hex; }
}
