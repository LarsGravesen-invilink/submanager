import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubManager — Менеджер VPN подписок",
  description: "Управление VPN подписками с кодированием ссылок",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-graphite-950 text-graphite-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
