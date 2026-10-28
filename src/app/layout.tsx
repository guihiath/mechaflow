import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { APP_NAME, APP_TAGLINE, THEME_COLOR } from "@/lib/brand";
import { temaInlineScript } from "@/lib/tema";
import "./globals.css";

// Pesos fixados pelo DESIGN.md (secao 3). Nao adicionar outros.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCond = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      data-tema="claro"
      suppressHydrationWarning
      className={`${barlow.variable} ${barlowCond.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Aplica o tema antes da primeira pintura (evita flash). */}
        <script dangerouslySetInnerHTML={{ __html: temaInlineScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-fundo text-texto">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
