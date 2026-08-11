"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  // Settings from DB
  const [cfg, setCfg] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load auth state and settings in parallel
    Promise.all([
      fetch("/api/auth/check").then((r) => r.json()),
      fetch("/api/settings/public").then((r) => r.json()).catch(() => ({})),
    ]).then(([auth, settings]) => {
      if (auth.authenticated) {
        router.push("/dashboard");
      }
      setAdminExists(auth.adminExists);
      setCfg(settings || {});
      setChecking(false);
    }).catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        router.push("/dashboard");
      } else {
        setError(data.error || "Ошибка входа");
      }
    } catch {
      setError("Ошибка подключения к серверу");
    }
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-graphite-950">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Apply accent color
  useEffect(() => {
    if (cfg.accentColor) {
      document.documentElement.style.setProperty("--color-accent-500", cfg.accentColor);
      document.documentElement.style.setProperty("--color-accent-DEFAULT", cfg.accentColor);
    }
    if (cfg.fontSize) {
      document.documentElement.style.fontSize = `${cfg.fontSize}px`;
    }
    if (cfg.fontFamily) {
      document.body.style.fontFamily = cfg.fontFamily;
    }
    return () => {
      document.documentElement.style.fontSize = "";
      document.body.style.fontFamily = "";
    };
  }, [cfg]);

  const serviceName = cfg.serviceName || "SubManager";
  const loginTitle = cfg.loginTitle || (adminExists ? "Вход в панель" : "Создание администратора");
  const loginSubtitle = cfg.loginSubtitle || (adminExists ? "Введите учетные данные для входа" : "Первый ввод создаст учётную запись администратора");
  const footerText = cfg.footerText || "SubManager by LarsGravesen";
  const logoUrl = cfg.logoUrl || "";

  return (
    <div className="min-h-screen flex flex-col bg-graphite-950">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md animate-slide-up">
          {/* Logo */}
          <div className="text-center mb-8">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo" className="h-16 w-auto mx-auto object-contain mb-4" />
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 mb-4 shadow-lg shadow-accent-500/20">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            )}
            <h1 className="text-3xl font-bold text-graphite-50">{serviceName}</h1>
            <p className="text-graphite-400 mt-2 text-sm">
              Менеджер VPN подписок
            </p>
          </div>

          {/* Login Form */}
          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-graphite-100 mb-1">
              {loginTitle}
            </h2>
            <p className="text-graphite-400 text-sm mb-6">
              {loginSubtitle}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-graphite-300 mb-1.5">Логин</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
                  placeholder="admin" required autoComplete="username" />
              </div>
              <div>
                <label className="block text-sm font-medium text-graphite-300 mb-1.5">Пароль</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
                  placeholder="Минимум 6 символов" required minLength={6} autoComplete="current-password" />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 animate-fade-in">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-accent-500/30">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Подождите...
                  </span>
                ) : adminExists ? "Войти" : "Создать и войти"}
              </button>
            </form>
          </div>

          <p className="text-center text-graphite-600 text-xs mt-6">{footerText}</p>
        </div>
      </div>
    </div>
  );
}
