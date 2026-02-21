import "~/styles/global.css";

import { type Metadata } from "next";
import { Providers } from "~/app/providers";
import { AuthGate } from "~/components/AuthGate";
import { Header } from "~/components/Header";

// Required for Clerk - avoid static page generation issues during CI builds
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Track your trades and manage your trading campaigns",
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
