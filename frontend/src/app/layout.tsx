import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://e-vverse-2-0-hackfront-t6-1.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "EVverse 2.0 — Proof-Carrying Journey Intelligence",
    template: "%s | EVverse 2.0",
  },
  description:
    "Deterministic EV journey feasibility, reachability graph intelligence, and reserve-aware charging stop planning for Indian EV drivers.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "EVverse 2.0 — Proof-Carrying Journey Intelligence",
    description:
      "Deterministic EV journey feasibility, reachability graph intelligence, and reserve-aware charging stop planning for Indian EV drivers.",
    url: siteUrl,
    siteName: "EVverse",
    images: [
      {
        url: "/evverse-logo.png",
        width: 1200,
        height: 630,
        alt: "EVverse 2.0 Proof-Carrying Journey Intelligence",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EVverse 2.0 — Proof-Carrying Journey Intelligence",
    description:
      "Deterministic EV journey feasibility, reachability graph intelligence, and reserve-aware charging stop planning for Indian EV drivers.",
    images: ["/evverse-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#050B14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-950 text-slate-100">
        <main id="main-content" role="main" className="min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
