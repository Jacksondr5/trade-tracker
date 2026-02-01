"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
};

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/positions", label: "Positions" },
  { href: "/portfolio", label: "Portfolio" },
];

function NavLink({
  href,
  label,
  isActive,
  onClick,
}: {
  href: string;
  isActive: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`text-sm transition-colors ${
        isActive
          ? "text-slate-12 font-medium"
          : "text-slate-11 hover:text-slate-12"
      }`}
    >
      {label}
    </Link>
  );
}

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check if a nav item is active
  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="border-b border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo and desktop nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-semibold text-slate-12">
            Trade Tracker
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                isActive={isActive(item.href)}
              />
            ))}
          </nav>
        </div>

        {/* Right side: UserButton and mobile menu button */}
        <div className="flex items-center gap-4">
          <UserButton />

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded p-2 text-slate-11 hover:bg-slate-800 hover:text-slate-12 md:hidden"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              // X icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              // Hamburger icon
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <nav className="border-t border-slate-700 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                isActive={isActive(item.href)}
                onClick={() => setMobileMenuOpen(false)}
              />
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
