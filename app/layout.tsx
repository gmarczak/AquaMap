import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/work-sans/index.css";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AquaMap",
  description: "Baseny w Polsce, dziennik pływania i gra: EXP, poziomy, wyprawy i loot za każdy trening.",
  applicationName: "AquaMap",
  appleWebApp: { capable: true, title: "AquaMap", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f0e8", // przy ciemnym motywie podmienia go THEME_SCRIPT
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
