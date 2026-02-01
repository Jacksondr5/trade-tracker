import "~/styles/global.css";

import { type Metadata } from "next";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Providers } from "~/app/providers";

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
          <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-semibold">Trade Tracker</h1>
              <nav className="flex items-center gap-4">
                <Link
                  href="/trades"
                  className="text-slate-11 hover:text-slate-12 text-sm transition-colors"
                >
                  Trades
                </Link>
                <Link
                  href="/campaigns"
                  className="text-slate-11 hover:text-slate-12 text-sm transition-colors"
                >
                  Campaigns
                </Link>
                <Link
                  href="/positions"
                  className="text-slate-11 hover:text-slate-12 text-sm transition-colors"
                >
                  Positions
                </Link>
              </nav>
            </div>
            <UserButton />
          </header>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
