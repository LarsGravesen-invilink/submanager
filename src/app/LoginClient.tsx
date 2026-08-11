"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginClient({ initialCfg }: { initialCfg: Record<string, string> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          router.push("/dashboard");
          return;
        }
        setAdminExists(data.adminExists);
        setChecking(false);
      })
      .catch(() => setChecking(false));
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

  const serviceName = initialCfg.serviceName || "SubManager";
  const loginTitle = initialCfg.loginTitle || (adminExists ? "Вход в панель" : "Создание администратора");
  const loginSubtitle = initialCfg.loginSubtitle || (adminExists ? "Введите учетные данные для входа" : "Первый ввод создаст учётную запись администратора");
  const footerText = initialCfg.footerText || "SubManager by LarsGravesen";
  const logoUrl = initialCfg.logoUrl || "";

  return (
    <div className="min-h-screen flex flex-col bg-graphite-950">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md animate-slide-up">
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
            <p className="text-graphite-400 mt-2 text-sm">Менеджер VPN подписок</p>
          </div>

          <div className="bg-graphite-900 border border-graphite-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-graphite-100 mb-1">{loginTitle}</h2>
            <p className="text-graphite-400 text-sm mb-6">{loginSubtitle}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-graphite-300 mb-1.5">Логин</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all" placeholder="admin" required autoComplete="off" />
              </div>
              <div>
                <label className="block text-sm font-medium text-graphite-300 mb-1.5">Пароль</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-graphite-800 border border-graphite-700 rounded-xl px-4 py-3 pr-12 text-graphite-100 placeholder-graphite-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all" placeholder="Минимум 6 символов" required minLength={6} autoComplete="off" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite-500 hover:text-graphite-300 transition-colors">
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 animate-fade-in">{error}</div>}

              <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-white font-medium py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-500/20 hover:shadow-accent-500/30">
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
