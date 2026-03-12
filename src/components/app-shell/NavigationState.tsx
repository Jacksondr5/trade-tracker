"use client";

import { cn } from "~/lib/utils";

export function NavigationState({
  className,
  description,
  title,
}: {
  className?: string;
  description: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-olive-6/80 bg-olive-3/40 px-3 py-3 text-left",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-olive-12">{title}</p>
          <p className="text-xs leading-5 text-olive-10">{description}</p>
        </div>
      </div>
    </div>
  );
}
