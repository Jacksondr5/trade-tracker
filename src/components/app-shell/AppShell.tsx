"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui";
import { cn } from "~/lib/utils";
import {
  appNavigationSections,
  getActiveAppNavigationItem,
  isAppNavigationItemActive,
} from "./app-navigation";

function NavigationSections({
  onNavigate,
  pathname,
}: {
  onNavigate?: () => void;
  pathname: string;
}) {
  return (
    <div className="space-y-6">
      {appNavigationSections.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="px-3 text-xs font-medium uppercase tracking-[0.18em] text-olive-10">
            {section.title}
          </h2>
          <div className="space-y-1">
            {section.items.map((item) => {
              const isActive = isAppNavigationItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-3 text-blue-12"
                      : "text-olive-11 hover:bg-olive-3 hover:text-olive-12",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShellBrand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-olive-12"
    >
      <Image
        src="/icon.svg"
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className="h-6 w-6 shrink-0"
      />
      Trade Tracker
    </Link>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden h-screen border-r border-olive-6 bg-olive-2 md:sticky md:top-0 md:flex md:flex-col md:overflow-y-auto">
      <div className="flex flex-1 flex-col gap-7 px-4 py-5">
        <ShellBrand />
        <NavigationSections pathname={pathname} />
      </div>
      <div className="flex justify-end border-t border-olive-6 px-4 py-4">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-9 w-9",
            },
          }}
        />
      </div>
    </aside>
  );
}

function MobileTopBar({
  onOpenDrawer,
  title,
}: {
  onOpenDrawer: () => void;
  title: string;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-olive-6 bg-olive-2/95 px-4 py-3 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={onOpenDrawer}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-olive-6 text-olive-12 transition-colors hover:bg-olive-3"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1 px-3">
        <p className="truncate text-center text-sm font-medium text-olive-12">
          {title}
        </p>
      </div>
      <div className="flex w-10 justify-end">
        <UserButton
          appearance={{
            elements: {
              userButtonAvatarBox: "h-8 w-8",
            },
          }}
        />
      </div>
    </header>
  );
}

function MobileNavigationDrawer({
  onOpenChange,
  open,
  pathname,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pathname: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-y-0 left-0 top-0 h-full w-[min(18rem,calc(100vw-1.5rem))] translate-x-0 translate-y-0 rounded-none border-r border-olive-6 bg-olive-2 p-0 shadow-2xl">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Global navigation for authenticated routes.
        </DialogDescription>
        <div className="flex h-full flex-col">
          <div className="border-b border-olive-6 px-4 py-5">
            <ShellBrand />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <NavigationSections
              pathname={pathname}
              onNavigate={() => onOpenChange(false)}
            />
          </div>
          <div className="flex justify-end border-t border-olive-6 px-4 py-4">
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "h-9 w-9",
                },
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  if (!isLoaded || !isSignedIn) {
    return <>{children}</>;
  }

  const activeItem = getActiveAppNavigationItem(pathname);
  const pageTitle = activeItem?.label ?? "Trade Tracker";

  return (
    <div className="md:grid md:min-h-screen md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <DesktopSidebar pathname={pathname} />
      <div className="min-w-0">
        <MobileTopBar
          title={pageTitle}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />
        <MobileNavigationDrawer
          open={isDrawerOpen}
          pathname={pathname}
          onOpenChange={setIsDrawerOpen}
        />
        <main className="min-h-screen pb-8">{children}</main>
      </div>
    </div>
  );
}
