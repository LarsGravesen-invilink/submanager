import type { Metadata } from "next";
import type { ReactNode, CSSProperties } from "react";
import "./globals.css";
import { getAppSettings } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "SubManager — Менеджер VPN подписок",
  description: "Управление VPN подписками с кодированием ссылок",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cfg = await getAppSettings();

  const accentColor = cfg.accentColor || "";
  const fontSize = cfg.fontSize || "";
  const fontFamily = cfg.fontFamily || "";

  let inlineStyles = "";
  if (accentColor) {
    inlineStyles += `
      --color-accent-50: ${accentColor}1a;
      --color-accent-100: ${accentColor}33;
      --color-accent-200: ${accentColor}55;
      --color-accent-300: ${accentColor}88;
      --color-accent-400: ${accentColor};
      --color-accent-500: ${accentColor};
      --color-accent-600: ${accentColor};
      --color-accent-700: ${accentColor};
      --color-accent-800: ${accentColor};
      --color-accent-900: ${accentColor};
      --color-accent-DEFAULT: ${accentColor};
    `;
  }
  if (fontSize) {
    inlineStyles += `font-size: ${fontSize}px;`;
  }

  const bodyStyle: CSSProperties | undefined = fontFamily ? { fontFamily } : undefined;

  return (
    <html lang="ru">
      <head>
        {inlineStyles && (
          <style dangerouslySetInnerHTML={{ __html: `:root { ${inlineStyles} }` }} />
        )}
      </head>
      <body className="bg-graphite-950 text-graphite-100 antialiased min-h-screen" style={bodyStyle}>
        {children}
      </body>
    </html>
  );
}
