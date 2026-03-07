import "~/styles/global.css";

import { type Metadata } from "next";
import { Providers } from "~/app/providers";
import { AuthGate } from "~/components/AuthGate";
import { Header } from "~/components/Header";

// Required for Clerk - avoid static page generation issues during CI builds
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Track your trades and manage your trading campaigns",
  icons: {
    apple: "/apple-icon.png",
    icon: [
      { type: "image/svg+xml", url: "/icon.svg" },
      { sizes: "16x16 32x32 48x48", url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
  },
  title: "Trade Tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="text-slate-12 bg-slate-900">
        <Providers>
          <Header />
          <main>
            <AuthGate>{children}</AuthGate>
          </main>
        </Providers>
      </body>
    </html>
  );
}
